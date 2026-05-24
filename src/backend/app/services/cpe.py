from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import zip_longest
from typing import Any
from urllib.parse import unquote


WILDCARDS = {"*", "-", "", None}


@dataclass(frozen=True)
class ParsedCPE:
    raw: str
    part: str | None = None
    vendor: str | None = None
    product: str | None = None
    version: str | None = None


@dataclass(frozen=True)
class VersionMatch:
    matched: bool
    match_type: str
    confidence: float


class VersionMatcher:
    def match_product(self, asset_version: str | None, product: Any) -> VersionMatch:
        vuln_version = getattr(product, "cpe_version", None)
        start = getattr(product, "version_start", None)
        start_inc = getattr(product, "version_start_including", None)
        end = getattr(product, "version_end", None)
        end_inc = getattr(product, "version_end_including", None)
        return self.match(asset_version, vuln_version, start, start_inc, end, end_inc)

    def match(
        self,
        asset_version: str | None,
        vuln_version: str | None,
        version_start: str | None = None,
        version_start_including: bool | None = None,
        version_end: str | None = None,
        version_end_including: bool | None = None,
    ) -> VersionMatch:
        has_bounds = version_start is not None or version_end is not None
        exact_version = vuln_version not in WILDCARDS

        if exact_version:
            if asset_version is None:
                return VersionMatch(False, "version_required_missing", 0.0)
            return self.match_exact(asset_version, vuln_version)

        if has_bounds:
            if asset_version is None:
                return VersionMatch(False, "version_required_missing", 0.0)
            return self.match_range(
                asset_version,
                version_start,
                version_start_including,
                version_end,
                version_end_including,
            )

        return VersionMatch(True, "product_wildcard", 65.0)

    def match_exact(self, asset_version: str, vuln_version: str | None) -> VersionMatch:
        if vuln_version in WILDCARDS:
            return VersionMatch(True, "product_wildcard", 65.0)
        if _canonical_version_text(asset_version) == _canonical_version_text(vuln_version):
            return VersionMatch(True, "exact_version", 100.0)
        if _safe_numeric_equivalent(asset_version, vuln_version):
            return VersionMatch(True, "normalized_exact_version", 98.0)
        return VersionMatch(False, "version_mismatch", 0.0)

    def match_range(
        self,
        asset_version: str,
        start: str | None,
        start_including: bool | None,
        end: str | None,
        end_including: bool | None,
    ) -> VersionMatch:
        normalized = False
        if start is not None:
            cmp_start = compare_versions(asset_version, start)
            if cmp_start < 0 or (cmp_start == 0 and start_including is False):
                return VersionMatch(False, "version_out_of_range", 0.0)
            normalized = normalized or _normalized_boundary_equal(asset_version, start, cmp_start)
        if end is not None:
            cmp_end = compare_versions(asset_version, end)
            if cmp_end > 0 or (cmp_end == 0 and end_including is False):
                return VersionMatch(False, "version_out_of_range", 0.0)
            normalized = normalized or _normalized_boundary_equal(asset_version, end, cmp_end)
        if normalized:
            return VersionMatch(True, "normalized_version_range", 90.0)
        return VersionMatch(True, "version_range", 95.0)


def parse_cpe(value: str | None) -> ParsedCPE | None:
    """Parse CPE 2.3 formatted names and legacy CPE URI names."""
    if not value:
        return None
    value = value.strip()
    if value.startswith("cpe:2.3:"):
        parts = _split_cpe23(value)
        if len(parts) < 6:
            return None
        return ParsedCPE(
            raw=value,
            part=_clean(parts[2]),
            vendor=_clean(parts[3]),
            product=_clean(parts[4]),
            version=_clean(parts[5]),
        )
    if value.startswith("cpe:/"):
        parts = value.removeprefix("cpe:/").split(":")
        if len(parts) < 3:
            return None
        return ParsedCPE(
            raw=value,
            part=_clean(parts[0]),
            vendor=_clean(parts[1]),
            product=_clean(parts[2]),
            version=_clean(parts[3]) if len(parts) > 3 else None,
        )
    return None


def cpe_fields(value: str | None) -> dict[str, str | None]:
    parsed = parse_cpe(value)
    return {
        "cpe_part": parsed.part if parsed else None,
        "cpe_vendor": parsed.vendor if parsed else None,
        "cpe_product": parsed.product if parsed else None,
        "cpe_version": parsed.version if parsed else None,
    }


def cpe_product_candidates(vendor: str | None, product: str | None) -> list[str]:
    candidates: list[str] = []
    if product:
        candidates.append(product)
    if _clean_product_identifier(vendor) == "microsoft":
        alias = normalize_cpe_product_alias(vendor, product)
        if alias and alias not in candidates:
            candidates.append(alias)
    return candidates


def normalize_cpe_product_alias(vendor: str | None, product: str | None) -> str | None:
    if product is None:
        return None
    cleaned_product = _clean_product_identifier(product)
    if not cleaned_product:
        return None
    cleaned_vendor = _clean_product_identifier(vendor)
    if cleaned_vendor != "microsoft":
        return cleaned_product

    if cleaned_product.startswith("microsoft_windows_"):
        cleaned_product = cleaned_product.removeprefix("microsoft_")
    if not cleaned_product.startswith("windows"):
        return cleaned_product

    cleaned_product = re.sub(r"_(\d{2})_h(\d)\b", r"_\1h\2", cleaned_product)
    return cleaned_product


def version_satisfies(asset_version: str | None, product: Any) -> tuple[bool, str, float]:
    """
    Evaluate asset version against an NVD product row.

    Returns (matched, match_type, confidence).
    """
    match = VersionMatcher().match_product(asset_version, product)
    return match.matched, match.match_type, match.confidence


def _split_cpe23(value: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    escaped = False
    for char in value:
        if escaped:
            current.append(char)
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == ":":
            parts.append("".join(current))
            current = []
            continue
        current.append(char)
    parts.append("".join(current))
    return parts


def _clean(value: str | None) -> str | None:
    if value in WILDCARDS:
        return None
    if value is None:
        return None
    return unquote(value.replace("\\", "")).lower()


def _clean_product_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = unquote(value.replace("\\", "")).lower()
    cleaned = re.sub(r"[^a-z0-9.]+", "_", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or None


def _version_equal(left: str, right: str) -> bool:
    return _normalize_version(left) == _normalize_version(right)


def _in_bounds(
    version: str,
    start: str | None,
    start_including: bool | None,
    end: str | None,
    end_including: bool | None,
) -> bool:
    if start is not None:
        cmp_start = compare_versions(version, start)
        if cmp_start < 0 or (cmp_start == 0 and start_including is False):
            return False
    if end is not None:
        cmp_end = compare_versions(version, end)
        if cmp_end > 0 or (cmp_end == 0 and end_including is False):
            return False
    return True


def compare_versions(left: str, right: str) -> int:
    """Small dependency-free comparator for common software version strings."""
    l_parts = _version_parts(left)
    r_parts = _version_parts(right)
    for l_val, r_val in zip_longest(l_parts, r_parts, fillvalue=0):
        if l_val == r_val:
            continue
        if isinstance(l_val, int) and isinstance(r_val, int):
            return -1 if l_val < r_val else 1
        l_txt = str(l_val)
        r_txt = str(r_val)
        return -1 if l_txt < r_txt else 1
    return 0


def normalize_version(value: str | None) -> str | None:
    if value is None:
        return None
    return _normalize_version(value)


def _canonical_version_text(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip().lower()


def _safe_numeric_equivalent(left: str | None, right: str | None) -> bool:
    if left is None or right is None:
        return False
    return _numeric_version_parts(left) is not None and _numeric_version_parts(right) is not None and compare_versions(left, right) == 0


def _normalized_boundary_equal(left: str, right: str, comparison: int) -> bool:
    return comparison == 0 and _canonical_version_text(left) != _canonical_version_text(right) and _safe_numeric_equivalent(left, right)


def _normalize_version(value: str) -> str:
    return ".".join(str(p) for p in _version_parts(value))


def _version_parts(value: str) -> list[int | str]:
    tokens = re.findall(r"\d+|[A-Za-z]+", value.lower())
    if not tokens:
        return [value.lower()]
    return [int(t) if t.isdigit() else t for t in tokens]


def _numeric_version_parts(value: str) -> list[int] | None:
    cleaned = value.strip().lower()
    if cleaned.startswith("v") and len(cleaned) > 1 and cleaned[1].isdigit():
        cleaned = cleaned[1:]
    if not re.fullmatch(r"\d+(?:[._-]\d+)*", cleaned):
        return None
    return [int(part) for part in re.split(r"[._-]", cleaned)]
