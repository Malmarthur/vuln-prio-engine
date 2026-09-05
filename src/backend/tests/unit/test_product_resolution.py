from pathlib import Path

from app.evaluation.product_resolution import run_product_resolution_benchmark
from app.services.product_resolution import load_catalog, normalize_identifier, resolve_component

ROOT = Path(__file__).parents[4]
CATALOG = ROOT / "samples/evaluation/product_resolution_v0/catalog.json"
CORPUS = ROOT / "samples/evaluation/product_resolution_v0/corpus.json"


def test_normalizer_preserves_version_tokens_and_unifies_clear_separators():
    assert normalize_identifier(" Apache_Tomcat ") == "apache-tomcat"
    assert normalize_identifier("Widget 2") != normalize_identifier("Widget 3")


def test_resolver_resolves_without_cpe_and_abstains_on_collision_or_conflict():
    catalog, _ = load_catalog(CATALOG)
    assert resolve_component({"vendor": "Acme", "name": "Widget"}, catalog).product_key == "acme/widget"
    assert resolve_component({"vendor": "Nobody", "name": "Nothing"}, catalog).status == "unknown"
    assert resolve_component({"vendor": "Contoso", "name": "Suite"}, catalog).status == "ambiguous"
    assert resolve_component({"vendor": "Acme", "name": "Widget", "cpe": "cpe:2.3:a:apache:tomcat:9.0.80:*:*:*:*:*:*:*"}, catalog).status == "ambiguous"


def test_benchmark_report_is_deterministic():
    first = run_product_resolution_benchmark(CATALOG, CORPUS)
    assert first == run_product_resolution_benchmark(CATALOG, CORPUS)
    assert first["metrics"]["false_match_rate"]["denominator"] == 5
