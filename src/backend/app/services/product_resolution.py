"""Deterministic Product Resolution v0.

This module deliberately has no database dependency so it can be replayed against
the versioned evaluation corpus.  Confidence is a heuristic indication only.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

ResolutionStatus = Literal["resolved", "unknown", "ambiguous"]
MODULE_ID = "product_resolver"
MODULE_VERSION = "0.1.0"
CANDIDATE_SCHEMA_VERSION = "product-resolution-candidates/v1"


def normalize_identifier(value: str | None) -> str | None:
    """Normalize only case, whitespace and clear spelling separators.

    Version-like tokens and other word characters are preserved: ``foo-2`` and
    ``foo 3`` cannot silently become the same product.
    """
    if value is None:
        return None
    value = value.strip().casefold()
    if not value:
        return None
    return re.sub(r"[\s_.-]+", "-", value)


@dataclass(frozen=True)
class CatalogProduct:
    key: str
    vendor: str
    canonical_name: str
    aliases: tuple[dict[str, str], ...]
    bindings: tuple[dict[str, str], ...]


@dataclass(frozen=True)
class ResolutionResult:
    status: ResolutionStatus
    product_key: str | None
    candidates: list[dict[str, Any]]
    method: str
    confidence: float | None
    confidence_basis: str
    signals: list[dict[str, Any]]


def catalog_digest(catalog: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(catalog, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def load_catalog(path: Path) -> tuple[list[CatalogProduct], str]:
    payload = json.loads(path.read_text())
    products = [CatalogProduct(
        key=item["key"], vendor=item["vendor"], canonical_name=item["canonical_name"],
        aliases=tuple(item.get("aliases", [])), bindings=tuple(item.get("bindings", [])),
    ) for item in payload["products"]]
    return products, catalog_digest(payload)


def resolve_component(component: dict[str, Any], catalog: list[CatalogProduct]) -> ResolutionResult:
    """Return every credible candidate; never break ties implicitly."""
    signals: list[dict[str, Any]] = []
    scores: dict[str, list[dict[str, Any]]] = {}
    observed_vendor = component.get("vendor") or component.get("cpe_vendor")
    observed_name = component.get("product") or component.get("name") or component.get("cpe_product")

    def add(product: CatalogProduct, kind: str, strength: int, detail: dict[str, Any]) -> None:
        evidence = {"kind": kind, "strength": strength, **detail}
        scores.setdefault(product.key, []).append(evidence)
        signals.append({"product_key": product.key, **evidence})

    raw_vendor, raw_name = observed_vendor, observed_name
    normalized_vendor, normalized_name = normalize_identifier(raw_vendor), normalize_identifier(raw_name)
    for product in catalog:
        for alias in product.aliases:
            alias_vendor, alias_name = alias.get("vendor"), alias.get("name")
            if raw_vendor == alias_vendor and raw_name == alias_name:
                add(product, "validated_alias_raw", 3, {"alias": alias})
            elif (normalize_identifier(alias_vendor) == normalized_vendor and
                  normalize_identifier(alias_name) == normalized_name and normalized_name):
                add(product, "validated_alias_normalized", 2, {"alias": alias})
        if (normalize_identifier(product.vendor) == normalized_vendor and
                normalize_identifier(product.canonical_name) == normalized_name and normalized_name):
            add(product, "canonical_name_normalized", 2, {})
        for binding in product.bindings:
            if binding.get("type") == "cpe" and component.get("cpe") == binding.get("value"):
                add(product, "external_binding_cpe", 3, {"binding": binding})
            if binding.get("type") == "purl" and component.get("purl") == binding.get("value"):
                add(product, "external_binding_purl", 2, {"binding": binding})

    candidates = []
    for product in catalog:
        reasons = scores.get(product.key, [])
        if reasons:
            candidates.append({"product_key": product.key, "vendor": product.vendor,
                               "canonical_name": product.canonical_name, "reasons": reasons})
    candidates.sort(key=lambda item: item["product_key"])
    strong_keys = {item["product_key"] for item in candidates if any(r["strength"] == 3 for r in item["reasons"])}
    all_keys = {item["product_key"] for item in candidates}
    # Different strong signals naming different products are a contradiction.
    candidate_keys = strong_keys if strong_keys else all_keys
    if not candidate_keys:
        return ResolutionResult("unknown", None, [], "deterministic_catalog_v0", None,
                                "No validated alias, canonical name, or explicit binding matched.", signals)
    if len(candidate_keys) != 1 or (strong_keys and len(all_keys) > 1):
        return ResolutionResult("ambiguous", None, candidates, "deterministic_catalog_v0", None,
                                "Multiple products or contradictory strong signals matched; no tie-break applies.", signals)
    product_key = next(iter(candidate_keys))
    confidence = 100.0 if any(r["strength"] == 3 for r in scores[product_key]) else 75.0
    return ResolutionResult("resolved", product_key, candidates, "deterministic_catalog_v0", confidence,
                            "Heuristic: exact validated alias/binding=100, normalized canonical/alias=75.", signals)
