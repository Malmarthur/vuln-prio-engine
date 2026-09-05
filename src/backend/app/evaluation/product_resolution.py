from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.product_resolution import MODULE_ID, MODULE_VERSION, load_catalog, resolve_component


@dataclass(frozen=True)
class EvaluationModule:
    module_id: str
    version: str
    configuration_schema: dict[str, Any]


PRODUCT_RESOLVER_MODULE = EvaluationModule(MODULE_ID, MODULE_VERSION, {"type": "object", "additionalProperties": False})


def _digest(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def run_product_resolution_benchmark(catalog_path: Path, dataset_path: Path) -> dict[str, Any]:
    catalog, catalog_sha256 = load_catalog(catalog_path)
    dataset = json.loads(dataset_path.read_text())
    cases = dataset["cases"]
    outcomes = []
    for case in cases:
        actual = resolve_component(case["input"], catalog)
        outcomes.append((case, actual))
    total = len(outcomes)
    resolved_expected = [pair for pair in outcomes if pair[0]["expected"]["status"] == "resolved"]
    correct_resolved = sum(actual.status == "resolved" and actual.product_key == case["expected"].get("product_key") for case, actual in resolved_expected)
    false_matches = sum(actual.status == "resolved" and (case["expected"]["status"] != "resolved" or actual.product_key != case["expected"].get("product_key")) for case, actual in outcomes)
    top_k = sum(case["expected"].get("product_key") in [c["product_key"] for c in actual.candidates] for case, actual in resolved_expected)
    counts = {status: sum(actual.status == status for _, actual in outcomes) for status in ("resolved", "unknown", "ambiguous")}
    return {
        "module_id": MODULE_ID, "module_version": MODULE_VERSION, "configuration": {},
        "catalog_digest": catalog_sha256, "dataset_digest": _digest(dataset), "total_cases": total,
        "metrics": {
            "resolved_exact_accuracy": {"value": correct_resolved / len(resolved_expected) if resolved_expected else None, "denominator": len(resolved_expected)},
            "coverage": {"value": counts["resolved"] / total if total else 0, "denominator": total},
            "false_match_rate": {"value": false_matches / total if total else 0, "denominator": total},
            "unknown_rate": {"value": counts["unknown"] / total if total else 0, "denominator": total},
            "ambiguous_rate": {"value": counts["ambiguous"] / total if total else 0, "denominator": total},
            "top_k_candidate_accuracy": {"value": top_k / len(resolved_expected) if resolved_expected else None, "denominator": len(resolved_expected)},
        }, "counts": counts,
    }
