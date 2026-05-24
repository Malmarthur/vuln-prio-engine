from types import SimpleNamespace
from uuid import uuid4

from app.services.cpe import VersionMatcher, compare_versions, normalize_cpe_product_alias, parse_cpe, version_satisfies
from app.services.finding_service import _evaluate_candidate_matches


def test_parse_cpe23():
    parsed = parse_cpe("cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*")
    assert parsed is not None
    assert parsed.part == "a"
    assert parsed.vendor == "openssl"
    assert parsed.product == "openssl"
    assert parsed.version == "1.1.1"


def test_parse_legacy_cpe_uri():
    parsed = parse_cpe("cpe:/a:apache:http_server:2.4.58")
    assert parsed is not None
    assert parsed.vendor == "apache"
    assert parsed.product == "http_server"
    assert parsed.version == "2.4.58"


def test_version_range_match():
    product = SimpleNamespace(
        cpe_version=None,
        version_start="1.1.0",
        version_start_including=True,
        version_end="1.1.2",
        version_end_including=False,
    )
    matched, match_type, confidence = version_satisfies("1.1.1", product)
    assert matched is True
    assert match_type == "version_range"
    assert confidence == 95.0


def test_missing_version_does_not_match_bounded_product():
    product = SimpleNamespace(
        cpe_version=None,
        version_start="1.1.0",
        version_start_including=True,
        version_end=None,
        version_end_including=None,
    )
    matched, _, _ = version_satisfies(None, product)
    assert matched is False


def test_compare_versions_handles_numeric_parts():
    assert compare_versions("2.10.0", "2.9.9") > 0
    assert compare_versions("1.0.0", "1") == 0


def test_version_matcher_reports_normalized_exact_version():
    match = VersionMatcher().match_exact("1.0.0", "1")

    assert match.matched is True
    assert match.match_type == "normalized_exact_version"
    assert match.confidence == 98.0


def test_version_matcher_does_not_treat_windows_release_as_numeric_version():
    match = VersionMatcher().match_exact("22H2", "22.0.0")

    assert match.matched is False


def test_windows_product_aliases_are_product_names_not_versions():
    assert normalize_cpe_product_alias("microsoft", "windows 11") == "windows_11"
    assert normalize_cpe_product_alias("microsoft", "microsoft windows 10") == "windows_10"
    assert normalize_cpe_product_alias("microsoft", "windows 10 22h2") == "windows_10_22h2"
    assert normalize_cpe_product_alias("microsoft", "windows server 2019") == "windows_server_2019"
    assert normalize_cpe_product_alias("microsoft", "windows 11") != "11.0.0"
    assert normalize_cpe_product_alias("microsoft", "windows 11") != "windows_server_2019"


def test_polars_candidate_matching_dedupes_to_best_confidence():
    asset_id = uuid4()
    component_id = uuid4()
    vulnerability_id = uuid4()
    rows = [
        {
            "asset_id": str(asset_id),
            "asset_component_id": str(component_id),
            "asset_version": "1.0.0",
            "vulnerability_id": str(vulnerability_id),
            "cpe_version": "*",
            "version_start": None,
            "version_start_including": None,
            "version_end": None,
            "version_end_including": None,
        },
        {
            "asset_id": str(asset_id),
            "asset_component_id": str(component_id),
            "asset_version": "1.0.0",
            "vulnerability_id": str(vulnerability_id),
            "cpe_version": "1.0.0",
            "version_start": None,
            "version_start_including": None,
            "version_end": None,
            "version_end_including": None,
        },
    ]

    matches = _evaluate_candidate_matches(rows)

    assert len(matches) == 1
    assert matches[0]["match_type"] == "exact_version"
    assert matches[0]["match_confidence"] == 100.0


def test_polars_candidate_matching_skips_missing_version_for_ranges():
    matches = _evaluate_candidate_matches(
        [
            {
                "asset_id": str(uuid4()),
                "asset_component_id": str(uuid4()),
                "asset_version": None,
                "vulnerability_id": str(uuid4()),
                "cpe_version": "*",
                "version_start": "1.0.0",
                "version_start_including": True,
                "version_end": "2.0.0",
                "version_end_including": False,
            }
        ]
    )

    assert matches == []


def test_polars_candidate_matching_accepts_product_wildcard_without_version():
    matches = _evaluate_candidate_matches(
        [
            {
                "asset_id": str(uuid4()),
                "asset_component_id": str(uuid4()),
                "asset_version": None,
                "vulnerability_id": str(uuid4()),
                "cpe_version": None,
                "version_start": None,
                "version_start_including": None,
                "version_end": None,
                "version_end_including": None,
            }
        ]
    )

    assert len(matches) == 1
    assert matches[0]["match_type"] == "product_wildcard"


def test_polars_candidate_matching_reports_normalized_exact():
    matches = _evaluate_candidate_matches(
        [
            {
                "asset_id": str(uuid4()),
                "asset_component_id": str(uuid4()),
                "asset_version": "1.0.0",
                "vulnerability_id": str(uuid4()),
                "cpe_version": "1",
                "version_start": None,
                "version_start_including": None,
                "version_end": None,
                "version_end_including": None,
            }
        ]
    )

    assert len(matches) == 1
    assert matches[0]["match_type"] == "normalized_exact_version"
    assert matches[0]["match_confidence"] == 98.0


def test_polars_candidate_matching_reports_normalized_range():
    matches = _evaluate_candidate_matches(
        [
            {
                "asset_id": str(uuid4()),
                "asset_component_id": str(uuid4()),
                "asset_version": "1.0.0",
                "vulnerability_id": str(uuid4()),
                "cpe_version": "*",
                "version_start": "1",
                "version_start_including": True,
                "version_end": None,
                "version_end_including": None,
            }
        ]
    )

    assert len(matches) == 1
    assert matches[0]["match_type"] == "normalized_version_range"
    assert matches[0]["match_confidence"] == 90.0
