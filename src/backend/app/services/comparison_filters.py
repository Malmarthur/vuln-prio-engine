"""SQL predicates restricting comparison items by entity attributes.

The same predicates serve two purposes: a comparison *population* (subset saved
with the job; ranks are computed inside it) and interactive *view* filters
(applied after ranking, so they slice the population without changing ranks).
"""
from __future__ import annotations

from typing import Any

from app.schemas.scoring import ComparisonFilters

# Followed items and subsets are keyed by the entity a comparison ranks.
ENTITY_TYPES = {"vulnerability": "vulnerability", "asset": "asset", "finding": "finding", "preset": "finding"}

# Best available CVSS severity, newest version first.
SEVERITY_SQL = "COALESCE(v.cvss_v40_severity, v.cvss_v31_severity, v.cvss_v30_severity, v.cvss_v2_severity)"


def entity_type(scope: str) -> str:
    return ENTITY_TYPES[scope]


def _like(value: str) -> str:
    escaped = value.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def entity_filter_sql(
    scope: str,
    filters: ComparisonFilters | None,
    entity_col: str,
    prefix: str,
) -> tuple[list[str], dict[str, Any]]:
    """Return SQL conditions on ``entity_col`` and their bound parameters.

    ``prefix`` keeps parameter names distinct when a population and view
    filters are combined in one statement.
    """
    if filters is None:
        return [], {}
    kind = entity_type(scope)
    conditions: list[str] = []
    inner: list[str] = []
    params: dict[str, Any] = {}

    def param(name: str, value: Any) -> str:
        key = f"{prefix}{name}"
        params[key] = value
        return f":{key}"

    has_vuln = kind in ("vulnerability", "finding")
    has_asset = kind in ("asset", "finding")
    if has_vuln:
        if filters.kev is True:
            inner.append("v.kev_known_exploited IS TRUE")
        elif filters.kev is False:
            inner.append("v.kev_known_exploited IS NOT TRUE")
        if filters.min_epss is not None:
            inner.append(f"v.epss_score >= {param('min_epss', filters.min_epss)}")
        if filters.severities:
            inner.append(f"{SEVERITY_SQL} = ANY(CAST({param('severities', [s.upper() for s in filters.severities])} AS text[]))")
    if has_asset:
        if filters.criticalities:
            inner.append(f"a.business_criticality = ANY(CAST({param('criticalities', filters.criticalities)} AS text[]))")
        if filters.exposures:
            inner.append(f"a.internet_exposure = ANY(CAST({param('exposures', filters.exposures)} AS text[]))")

    # Vendor/product come from NVD configurations for vulnerabilities and from
    # inventory components for assets and findings.
    def component_match(columns: tuple[str, ...], placeholder: str) -> str:
        test = " OR ".join(f"c.{column} ILIKE {placeholder}" for column in columns)
        if kind == "vulnerability":
            vp_test = " OR ".join(
                f"vp.cpe_{column} ILIKE {placeholder}" for column in ("vendor", "product") if f"cpe_{column}" in columns
            ) or "FALSE"
            return f"EXISTS (SELECT 1 FROM vulnerability_products vp WHERE vp.vulnerability_id = v.id AND ({vp_test}))"
        if kind == "asset":
            return f"EXISTS (SELECT 1 FROM asset_components c WHERE c.asset_id = a.id AND ({test}))"
        return f"EXISTS (SELECT 1 FROM asset_components c WHERE c.id = f.asset_component_id AND ({test}))"

    if filters.vendor and filters.vendor.strip():
        inner.append(component_match(("cpe_vendor", "vendor"), param("vendor", _like(filters.vendor))))
    if filters.product and filters.product.strip():
        inner.append(component_match(("cpe_product", "product", "name"), param("product", _like(filters.product))))
    if filters.q and filters.q.strip():
        placeholder = param("q", _like(filters.q))
        options: list[str] = []
        if has_vuln:
            options.append(f"v.cve_id ILIKE {placeholder}")
        if has_asset:
            options += [f"a.name ILIKE {placeholder}", f"a.external_id ILIKE {placeholder}"]
        options.append(component_match(("cpe_vendor", "cpe_product", "vendor", "product", "name"), placeholder))
        inner.append(f"({' OR '.join(options)})")

    if inner:
        where = " AND ".join(inner)
        if kind == "vulnerability":
            conditions.append(f"EXISTS (SELECT 1 FROM vulnerabilities v WHERE v.id = {entity_col} AND {where})")
        elif kind == "asset":
            conditions.append(f"EXISTS (SELECT 1 FROM assets a WHERE a.id = {entity_col} AND {where})")
        else:
            conditions.append(
                "EXISTS (SELECT 1 FROM findings f JOIN vulnerabilities v ON v.id = f.vulnerability_id"
                f" JOIN assets a ON a.id = f.asset_id WHERE f.id = {entity_col} AND {where})"
            )
    if filters.entity_ids:
        conditions.append(f"{entity_col} = ANY(CAST({param('entity_ids', [str(value) for value in filters.entity_ids])} AS uuid[]))")
    if filters.followed_only:
        conditions.append(
            f"{entity_col} IN (SELECT entity_id FROM followed_items WHERE entity_type = {param('followed_type', kind)})"
        )
    return conditions, params
