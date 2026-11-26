from __future__ import annotations

import heapq
import time
from collections import deque


class MedianStream:
    """Maintain an exact running median using a max-heap and a min-heap."""

    def __init__(self) -> None:
        self.lower: list[int] = []
        self.upper: list[int] = []
        self.recent_scores: deque[int] = deque(maxlen=20)
        self.median_history: deque[dict[str, int | float]] = deque(maxlen=120)
        self.score_count = 0
        self.processing_latency_ms = 0.0
        self.activity: deque[dict[str, int | float]] = deque(maxlen=24)

    @property
    def median(self) -> float | int | None:
        if not self.score_count:
            return None
        if len(self.lower) > len(self.upper):
            return -self.lower[0]
        return (-self.lower[0] + self.upper[0]) / 2

    def add(self, value: int) -> dict:
        self._insert(value)
        return self.snapshot()

    def _insert(self, value: int) -> None:
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError("Score must be an integer.")
        if value < -(2**31) or value > 2**31 - 1:
            raise ValueError("Score must fit in a signed 32-bit integer.")

        started = time.perf_counter()
        if not self.lower or value <= -self.lower[0]:
            heapq.heappush(self.lower, -value)
        else:
            heapq.heappush(self.upper, value)

        if len(self.lower) > len(self.upper) + 1:
            heapq.heappush(self.upper, -heapq.heappop(self.lower))
        elif len(self.upper) > len(self.lower):
            heapq.heappush(self.lower, -heapq.heappop(self.upper))

        self.score_count += 1
        median = self.median
        self.recent_scores.appendleft(value)
        self.processing_latency_ms = (time.perf_counter() - started) * 1000
        self.median_history.append(
            {"index": self.score_count, "median": median if median is not None else 0}
        )
        self.activity.append({"index": self.score_count, "value": value})

    def add_many(self, values: list[int]) -> dict:
        for value in values:
            self._insert(value)
        return self.snapshot()

    def snapshot(self) -> dict:
        return {
            "score_count": self.score_count,
            "median": self.median,
            "lower_heap_size": len(self.lower),
            "upper_heap_size": len(self.upper),
            "processing_latency_ms": round(self.processing_latency_ms, 4),
            "stream_status": "live" if self.score_count else "waiting",
            "recent_scores": list(self.recent_scores),
            "median_history": list(self.median_history),
            "activity": list(self.activity),
        }

    def heaps(self) -> dict[str, list[int]]:
        return {
            "lower_heap": [-value for value in self.lower],
            "upper_heap": self.upper.copy(),
        }

    def reset(self) -> None:
        self.__init__()
