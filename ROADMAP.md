# Roadmap — prototype status

Updated: 2026-10-05 (Compare slice). Prepared for public release; current validations are recorded in [READINESS](docs/READINESS.md).

| Capability | Status |
|---|---|
| NVD, EPSS, KEV, EUVD ingestion | Implemented; availability of external services not guaranteed |
| Integrated Lab: vulnerability/asset/finding scoring, revised profiles, presets, runs and Compare | Implemented; main demo path |
| Compare analyst workflow: persistent state, config-change flags, associative chart filtering, attribute search, comparison subsets, followed items, top-N entries/exits, divergence explanation | Implemented; explanation shows signals and weight shares, not recomputed per-factor contributions |
| Background jobs with live progress (scoring, matching, comparisons, ingestion) | Implemented; in-process, one job at a time |
| CycloneDX import, assets/components and findings | Implemented; reimport replaces components, without full history continuity |
| Product Resolution v0 | Implemented; small catalog, persisted decisions, unknown/ambiguous and versioned benchmark |
| CPE/version matching | Experimental; no complete evaluation of NVD configurations |
| Ternary Applicability Engine | Planned, not started |
| Multi-scanner consolidation, multi-source asset identity and generic Evidence | Not implemented |
| LLM, attack graph, commercial features | Not implemented; out of scope for this preparation |

## Backlog — candidate improvements

Recorded ideas, not committed work. Each one needs its own authorized slice.

**Lab and analyst UX (near term)**

- ~~**Comparison pre-filter**~~: implemented 2026-10-05 as a comparison *population* saved with the run (ranks inside it). Remaining: a date-range criterion, and restricting the scoring itself (it still covers every item because score tables are shared with the other views).
- **"What's new" view**: show findings that appeared since the analyst's last visit or since a chosen date, split by cause: new CVE (ingestion) versus new or changed asset (inventory import). Aimed at analysts using the app several days a week. Requires a reliable first-seen timestamp per finding and its originating cause.
- ~~**Interactive Compare charts**~~: implemented 2026-10-05 (bands, heatmap cells/headers, movements, top-N; chips; charts recomputed under attribute filters).

**Target (after the core is validated)**

- **AI processing of advisory reports**: extract CVEs and vulnerability descriptions from unstructured advisories (e.g. CERT bulletins, vendor notices) through the LLM task layer, with structured, versioned output, source evidence for each extracted item, and human review before anything enters the vulnerability base. Subject to the LLM invariants (provider-independent, can be disabled by policy).

Next decision: the first product slice after publication (the Applicability Engine is the leading candidate). License: AGPL-3.0-only.

The envisioned product evolution is: Product on the vulnerability/applicability side → observations and consolidation → end-to-end evidence → multi-source asset identity. This order will be reassessed based on evidence from the Lab and field feedback. It is not a list of promised features or an active work item.

Field validation comes before any commercial ambition. RBAC, tenant isolation, operational auditing and production robustness remain to be built. State/Capability graphs and defensive recommendations are a distant direction, after the core has been validated.
