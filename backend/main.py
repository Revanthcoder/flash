from __future__ import annotations

import csv
import io
import random
import time
from threading import RLock

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.median import MedianStream

app = FastAPI(title="MEDIANFLOW API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

stream = MedianStream()
stream_lock = RLock()


class ScoreInput(BaseModel):
    value: int = Field(strict=True, ge=-(2**31), le=2**31 - 1)


class BenchmarkInput(BaseModel):
    count: int = Field(ge=1, le=100_000)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/state")
def get_state() -> dict:
    with stream_lock:
        return stream.snapshot()


@app.get("/api/heaps")
def get_heaps() -> dict[str, list[int]]:
    with stream_lock:
        return stream.heaps()


@app.post("/api/scores")
def add_score(payload: ScoreInput) -> dict:
    with stream_lock:
        return stream.add(payload.value)


@app.delete("/api/session")
def reset_session() -> dict[str, str]:
    with stream_lock:
        stream.reset()
    return {"status": "reset"}


@app.post("/api/csv")
async def upload_csv(file: UploadFile = File(...)) -> dict:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a .csv file.")
    try:
        content = (await file.read()).decode("utf-8-sig")
        rows = csv.reader(io.StringIO(content))
        values: list[int] = []
        for row_number, row in enumerate(rows, start=1):
            if not row or not row[0].strip():
                continue
            raw_value = row[0].strip()
            try:
                value = int(raw_value)
            except ValueError:
                if row_number == 1 and raw_value.lower() in {"score", "value", "scores"}:
                    continue
                raise ValueError(f"Row {row_number} does not start with an integer.")
            if value < -(2**31) or value > 2**31 - 1:
                raise ValueError(f"Row {row_number} is outside the signed 32-bit range.")
            values.append(value)
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.") from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not values:
        raise HTTPException(status_code=400, detail="No scores found in the CSV.")
    with stream_lock:
        return stream.add_many(values)


@app.post("/api/benchmark")
def benchmark(payload: BenchmarkInput) -> dict:
    generator = random.Random(42)
    values = [generator.randint(-1_000_000, 1_000_000) for _ in range(payload.count)]
    sample = MedianStream()
    started = time.perf_counter()
    sample.add_many(values)
    elapsed_ms = (time.perf_counter() - started) * 1000
    ordered = sorted(values)
    expected_median = (
        ordered[payload.count // 2]
        if payload.count % 2
        else (ordered[payload.count // 2 - 1] + ordered[payload.count // 2]) / 2
    )
    return {
        "count": payload.count,
        "elapsed_ms": round(elapsed_ms, 3),
        "throughput_per_second": round(payload.count / (elapsed_ms / 1000), 1)
        if elapsed_ms
        else 0,
        "median": sample.median,
        "correct": sample.median == expected_median,
    }
