import random

import pytest

from backend.median import MedianStream


def expected_median(values: list[int]) -> float | int:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def test_median_handles_duplicates_negatives_and_int32_extremes() -> None:
    stream = MedianStream()
    values = [0, -4, -4, 2**31 - 1, -(2**31)]
    for index, value in enumerate(values, start=1):
        state = stream.add(value)
        assert state["median"] == expected_median(values[:index])
        assert state["lower_heap_size"] + state["upper_heap_size"] == index


def test_randomized_stream_matches_sorted_reference() -> None:
    generator = random.Random(2026)
    values: list[int] = []
    stream = MedianStream()
    for _ in range(1_000):
        value = generator.randint(-(2**31), 2**31 - 1)
        values.append(value)
        assert stream.add(value)["median"] == expected_median(values)
        assert len(stream.lower) in {len(stream.upper), len(stream.upper) + 1}


@pytest.mark.parametrize("value", [-(2**31) - 1, 2**31, 1.5, True])
def test_rejects_invalid_scores(value: object) -> None:
    with pytest.raises((TypeError, ValueError)):
        MedianStream().add(value)  # type: ignore[arg-type]


def test_reset_clears_all_session_state() -> None:
    stream = MedianStream()
    stream.add_many([5, 1, 9])
    stream.reset()
    assert stream.snapshot()["score_count"] == 0
    assert stream.snapshot()["median"] is None


def test_heap_inspection_preserves_internal_heap_order() -> None:
    stream = MedianStream()
    stream.add_many([8, 2, 6, 4, 10, 12, 0])
    heaps = stream.heaps()
    assert heaps["lower_heap"][0] == max(heaps["lower_heap"])
    assert heaps["upper_heap"][0] == min(heaps["upper_heap"])
    assert len(heaps["lower_heap"]) + len(heaps["upper_heap"]) == 7
    assert "lower_heap" not in stream.snapshot()
