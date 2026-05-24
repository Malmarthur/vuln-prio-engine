"""
Normalization layer: each source's raw data → pl.DataFrame with DB column names.

Design notes:
- All normalize_* functions return a pl.DataFrame.
- Simple scalar columns (strings, numbers, dates) are native Polars types.
- Complex nested fields (cwe_ids, affected_products, references, sources_raw)
  are JSON-serialized strings in the DataFrame. The service layer deserialises
  them before the DB upsert so SQLAlchemy receives Python objects for JSONB columns.
- EPSS uses pl.from_dicts on the API response list for fast, vectorized processing.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Any

import polars as pl

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Column ownership: which columns each source may write on conflict.
# Used by the service layer to build the ON CONFLICT DO UPDATE SET clause.
# ---------------------------------------------------------------------------
SOURCE_OWNED_COLUMNS: dict[str, list[str]] = {
    "nvd": [
        "summary",
        "description",
        "published_date",
        "last_modified_date",
        "nvd_source_url",
        "cvss_v2_vector",
        "cvss_v2_score",
        "cvss_v2_severity",
        "cvss_v30_vector",
        "cvss_v30_score",
        "cvss_v30_severity",
        "cvss_v31_vector",
        "cvss_v31_score",
        "cvss_v31_severity",
        "cvss_v40_vector",
        "cvss_v40_score",
        "cvss_v40_severity",
        "cwe_ids",
        "affected_products",
        "references",
    ],
    "epss": ["epss_score", "epss_percentile", "epss_date"],
    "kev": [
        "kev_known_exploited",
        "kev_date_added",
        "kev_due_date",
        "kev_ransomware_use",
        "kev_notes",
    ],
    "euvd": ["euvd_id", "euvd_source_url", "euvd_exploitation"],
}

# KEV provides a summary fallback — only written when the existing value is NULL
KEV_FALLBACK_COLUMNS: list[str] = ["summary"]

# JSON-string columns that the service layer must deserialise before DB upsert
JSON_STRING_COLUMNS = {"cwe_ids", "affected_products", "references", "sources_raw"}


# ---------------------------------------------------------------------------
# NVD
# ---------------------------------------------------------------------------

def normalize_nvd(raw_cves: list[dict[str, Any]]) -> pl.DataFrame:
    """Normalize a batch of NVD API 2.0 CVE objects into a Polars DataFrame."""
    rows: list[dict] = []
    for item in raw_cves:
        cve = item.get("cve", {})
        cve_id = cve.get("id")
        if not cve_id:
            continue
        try:
            rows.append(_normalize_nvd_cve(cve_id, cve))
        except Exception:
            logger.exception("Failed to normalize NVD CVE %s", cve_id)

    if not rows:
        return pl.DataFrame()

    # pl.from_dicts infers schema; cast numerics to ensure consistent types
    df = pl.from_dicts(rows, infer_schema_length=len(rows))
    for col in ("cvss_v2_score", "cvss_v30_score", "cvss_v31_score", "cvss_v40_score"):
        if col in df.columns:
            df = df.with_columns(pl.col(col).cast(pl.Float64, strict=False))
    return df


def _normalize_nvd_cve(cve_id: str, cve: dict) -> dict:
    metrics = cve.get("metrics", {})
    descriptions = cve.get("descriptions", [])
    en_desc = next((d["value"] for d in descriptions if d.get("lang") == "en"), None)
    summary = en_desc.split(". ")[0] if en_desc else None

    record: dict[str, Any] = {
        "cve_id": cve_id,
        "summary": summary,
        "description": en_desc,
        "published_date": _parse_nvd_dt(cve.get("published")),
        "last_modified_date": _parse_nvd_dt(cve.get("lastModified")),
        "nvd_source_url": f"https://nvd.nist.gov/vuln/detail/{cve_id}",
        # Complex fields → JSON strings (deserialised by service before upsert)
        "cwe_ids": json.dumps(_extract_cwes(cve)),
        "affected_products": json.dumps(_extract_products(cve)),
        "references": json.dumps(_extract_references(cve)),
        "sources_raw": json.dumps({"nvd": cve}),
    }
    _extract_cvss(record, metrics)
    return record


def _extract_cvss(record: dict, metrics: dict) -> None:
    for metric_key, vec_col, score_col, sev_col in [
        ("cvssMetricV2",  "cvss_v2_vector",  "cvss_v2_score",  "cvss_v2_severity"),
        ("cvssMetricV30", "cvss_v30_vector", "cvss_v30_score", "cvss_v30_severity"),
        ("cvssMetricV31", "cvss_v31_vector", "cvss_v31_score", "cvss_v31_severity"),
        ("cvssMetricV40", "cvss_v40_vector", "cvss_v40_score", "cvss_v40_severity"),
    ]:
        entries = metrics.get(metric_key, [])
        if not entries:
            record[vec_col] = None
            record[score_col] = None
            record[sev_col] = None
            continue
        entry = next((e for e in entries if e.get("type") == "Primary"), entries[0])
        cvss_data = entry.get("cvssData", {})
        record[vec_col] = cvss_data.get("vectorString")
        record[score_col] = cvss_data.get("baseScore")
        # V2 keeps baseSeverity at the metric entry level, not inside cvssData
        record[sev_col] = (
            entry.get("baseSeverity") if metric_key == "cvssMetricV2"
            else cvss_data.get("baseSeverity")
        )


def _extract_cwes(cve: dict) -> list[str] | None:
    cwes = [
        desc["value"]
        for weakness in cve.get("weaknesses", [])
        for desc in weakness.get("description", [])
        if desc.get("value", "").startswith("CWE-")
    ]
    return cwes or None


def _extract_products(cve: dict) -> list[dict] | None:
    products = []
    for node in cve.get("configurations", []):
        for n in [node, *node.get("nodes", [])]:
            for match in n.get("cpeMatch", []):
                if match.get("vulnerable"):
                    products.append({
                        "cpe": match.get("criteria"),
                        "version_start": match.get("versionStartIncluding") or match.get("versionStartExcluding"),
                        "version_start_including": "versionStartIncluding" in match if (
                            match.get("versionStartIncluding") or match.get("versionStartExcluding")
                        ) else None,
                        "version_end": match.get("versionEndIncluding") or match.get("versionEndExcluding"),
                        "version_end_including": "versionEndIncluding" in match if (
                            match.get("versionEndIncluding") or match.get("versionEndExcluding")
                        ) else None,
                    })
    return products or None


def _extract_references(cve: dict) -> list[dict] | None:
    refs = [
        {"url": r.get("url"), "source": r.get("source"), "tags": r.get("tags", [])}
        for r in cve.get("references", [])
    ]
    return refs or None


def _parse_nvd_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# EPSS  (bulk API response — primary Polars use-case)
# ---------------------------------------------------------------------------

def normalize_epss(raw_rows: list[dict[str, Any]]) -> pl.DataFrame:
    """
    Normalize FIRST EPSS API rows into a Polars DataFrame.

    Expected row format:
        {"cve": "CVE-2024-1234", "epss": "0.12345", "percentile": "0.98765", "date": "2024-01-01"}
    """
    if not raw_rows:
        return pl.DataFrame()

    df = pl.from_dicts(raw_rows, infer_schema_length=len(raw_rows))

    # Normalise column names and types
    rename_map = {}
    if "cve" in df.columns:
        rename_map["cve"] = "cve_id"
    if "epss" in df.columns:
        rename_map["epss"] = "epss_score"
    if "percentile" in df.columns:
        rename_map["percentile"] = "epss_percentile"
    if rename_map:
        df = df.rename(rename_map)

    df = df.with_columns([
        pl.col("epss_score").cast(pl.Float64, strict=False),
        pl.col("epss_percentile").cast(pl.Float64, strict=False),
        # "date" column from the API → epss_date
        pl.col("date").cast(pl.Utf8).alias("epss_date"),
        # Minimal sources_raw as JSON string
        pl.format(
            '{{"epss": {{"score": {}, "percentile": {}, "date": "{}"}}}}',
            pl.col("epss_score").cast(pl.Utf8),
            pl.col("epss_percentile").cast(pl.Utf8),
            pl.col("date").cast(pl.Utf8),
        ).alias("sources_raw"),
    ]).drop("date")

    return df


# ---------------------------------------------------------------------------
# CISA KEV
# ---------------------------------------------------------------------------

def normalize_kev(raw_entries: list[dict[str, Any]]) -> pl.DataFrame:
    rows = []
    for entry in raw_entries:
        cve_id = entry.get("cveID")
        if not cve_id:
            continue
        rows.append({
            "cve_id": cve_id,
            "kev_known_exploited": True,
            "kev_date_added": _parse_date_str(entry.get("dateAdded")),
            "kev_due_date": _parse_date_str(entry.get("dueDate")),
            "kev_ransomware_use": entry.get("knownRansomwareCampaignUse", "Unknown").lower() == "known",
            "kev_notes": entry.get("notes") or None,
            # Fallback summary (service uses COALESCE so it won't overwrite NVD data)
            "summary": entry.get("shortDescription"),
            "sources_raw": json.dumps({"kev": entry}),
        })
    return pl.from_dicts(rows, infer_schema_length=len(rows)) if rows else pl.DataFrame()


# ---------------------------------------------------------------------------
# EUVD
# ---------------------------------------------------------------------------

def normalize_euvd(raw_entries: list[dict[str, Any]]) -> pl.DataFrame:
    """
    Normalize EUVD /api/search entries.

    Real API response fields (as of 2026-03):
      id            — EUVD identifier (e.g. "EUVD-2026-14346")
      aliases       — associated CVE ID string (e.g. "CVE-2026-4606")
      description   — vulnerability description
      baseScore     — CVSS base score
      epss          — EPSS score
      datePublished — publication date string
      dateUpdated   — last update date string
    """
    rows = []
    for entry in raw_entries:
        # EUVD ID: field is "id" in the search response; truncate to VARCHAR(30) limit
        euvd_id = entry.get("id") or entry.get("euvdId")
        if euvd_id:
            euvd_id = str(euvd_id)[:30]
        cve_ids = _extract_euvd_cve_ids(entry)
        source_url = f"https://euvd.enisa.europa.eu/vuln/{euvd_id}" if euvd_id else None

        for cve_id in cve_ids:
            rows.append({
                "cve_id": cve_id,
                "euvd_id": euvd_id,
                "euvd_source_url": source_url,
                "euvd_exploitation": None,  # not in search response; requires /api/enisaid
                "sources_raw": json.dumps({"euvd": entry}),
            })
    return pl.from_dicts(rows) if rows else pl.DataFrame()


def _extract_euvd_cve_ids(entry: dict) -> list[str]:
    """
    Extract CVE IDs from an EUVD entry.

    The search API returns `aliases` as a plain string (one CVE per entry).
    Legacy/alternative fields are kept as fallbacks.
    """
    candidates = (
        entry.get("aliases")
        or entry.get("enisaIdAliases")
        or entry.get("cveIds")
        or []
    )
    if isinstance(candidates, str):
        candidates = [c.strip() for c in candidates.split(",")]
    # cve_id is VARCHAR(20) in the DB; skip anything longer
    return [c for c in candidates if isinstance(c, str) and c.startswith("CVE-") and len(c) <= 20]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_date_str(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None
