# Roadmap — prototype status

Updated: 2026-09-27. Prepared for public release; current validations are recorded in [READINESS](docs/READINESS.md).

| Capability | Status |
|---|---|
| NVD, EPSS, KEV, EUVD ingestion | Implemented; availability of external services not guaranteed |
| Integrated Lab: vulnerability/asset/finding scoring, revised profiles, presets, runs and Compare | Implemented; main demo path |
| Background jobs with live progress (scoring, matching, comparisons, ingestion) | Implemented; in-process, one job at a time |
| CycloneDX import, assets/components and findings | Implemented; reimport replaces components, without full history continuity |
| Product Resolution v0 | Implemented; small catalog, persisted decisions, unknown/ambiguous and versioned benchmark |
| CPE/version matching | Experimental; no complete evaluation of NVD configurations |
| Ternary Applicability Engine | Planned, not started |
| Multi-scanner consolidation, multi-source asset identity and generic Evidence | Not implemented |
| LLM, attack graph, commercial features | Not implemented; out of scope for this preparation |

Next decision: the first product slice after publication (the Applicability Engine is the leading candidate). License: AGPL-3.0-only.

The envisioned product evolution is: Product on the vulnerability/applicability side → observations and consolidation → end-to-end evidence → multi-source asset identity. This order will be reassessed based on evidence from the Lab and field feedback. It is not a list of promised features or an active work item.

Field validation comes before any commercial ambition. RBAC, tenant isolation, operational auditing and production robustness remain to be built. State/Capability graphs and defensive recommendations are a distant direction, after the core has been validated.
