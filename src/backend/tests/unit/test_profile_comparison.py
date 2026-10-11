from uuid import uuid4

import pytest

from app.services.profile_service import _compare


def test_comparison_metrics_and_rank_direction_are_deterministic():
    first, second, third = uuid4(), uuid4(), uuid4()
    baseline = [
        (first, "A", 90.0, 90.0, "V0"),
        (second, "B", 70.0, 80.0, "V1"),
        (third, "C", 20.0, 70.0, "V3"),
    ]
    candidate = [
        (second, "B", 95.0, 80.0, "V0"),
        (first, "A", 80.0, 90.0, "V0"),
        (third, "C", 20.0, 70.0, "V3"),
    ]

    result = _compare(uuid4(), baseline, candidate)

    assert result.promoted == 1
    assert result.demoted == 1
    assert result.unchanged == 1
    assert result.mean_score_delta == pytest.approx(5.0)
    assert result.median_score_delta == 0.0
    assert result.spearman_rank_correlation == pytest.approx(0.5)
    by_label = {item.label: item for item in result.items}
    assert by_label["B"].rank_delta == 1
    assert by_label["A"].rank_delta == -1
    assert result.transition_matrix["V1"]["V0"] == 1


def test_comparison_includes_unscored_transitions():
    shared, removed, added = uuid4(), uuid4(), uuid4()
    result = _compare(
        uuid4(),
        [(shared, "shared", 50.0, 50.0, "V2"), (removed, "removed", 10.0, 40.0, "V3")],
        [(shared, "shared", 55.0, 50.0, "V1"), (added, "added", 70.0, 60.0, "V1")],
    )
    assert result.transition_matrix["V3"]["UNSCORED"] == 1
    assert result.transition_matrix["UNSCORED"]["V1"] == 1


def test_comparison_reports_top_n_entries_and_exits():
    ids = [uuid4() for _ in range(12)]
    baseline = [(value, str(index), 100.0 - index, 50.0, "V1") for index, value in enumerate(ids)]
    # The candidate reverses the queue: the bottom two enter the top 10.
    candidate = [(value, str(index), float(index), 50.0, "V1") for index, value in enumerate(ids)]

    result = _compare(uuid4(), baseline, candidate)

    assert result.top_n["10"] == {"entered": 2, "left": 2, "overlap": 8}
    assert result.top_n["50"] == {"entered": 0, "left": 0, "overlap": 12}
