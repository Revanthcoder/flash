import io

import pytest
from fastapi.testclient import TestClient

from backend.main import app, stream

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_session() -> None:
    stream.reset()


def test_score_endpoint_returns_live_median_and_heap_sizes() -> None:
    assert client.post("/api/scores", json={"value": -5}).json()["median"] == -5
    state = client.post("/api/scores", json={"value": 8}).json()
    assert state["median"] == 1.5
    assert state["lower_heap_size"] == state["upper_heap_size"] == 1


def test_score_endpoint_rejects_non_integer_and_out_of_range_values() -> None:
    assert client.post("/api/scores", json={"value": True}).status_code == 422
    assert client.post("/api/scores", json={"value": 2**31}).status_code == 422


def test_local_frontend_cors_preflight_is_allowed() -> None:
    response = client.options(
        "/api/scores",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_csv_upload_validates_before_adding_and_accepts_header() -> None:
    response = client.post(
        "/api/csv",
        files={"file": ("scores.csv", io.BytesIO(b"score\n-3\n7\n"), "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["median"] == 2

    invalid = client.post(
        "/api/csv",
        files={"file": ("bad.csv", io.BytesIO(b"score\n9\nnope\n"), "text/csv")},
    )
    assert invalid.status_code == 400
    assert stream.snapshot()["score_count"] == 2


def test_benchmark_checks_reference_median() -> None:
    response = client.post("/api/benchmark", json={"count": 101})
    assert response.status_code == 200
    assert response.json()["correct"] is True
    assert stream.snapshot()["score_count"] == 0


def test_heap_contents_are_only_returned_by_inspection_endpoint() -> None:
    client.post("/api/scores", json={"value": 7})
    state = client.get("/api/state").json()
    heaps = client.get("/api/heaps").json()
    assert "lower_heap" not in state
    assert heaps == {"lower_heap": [7], "upper_heap": []}
