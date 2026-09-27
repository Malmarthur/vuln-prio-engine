# Product Resolution and applicability limitations

## Product Resolution v0 — implemented

`Product` is a stable internal software identity, independent of its observed version and of any CPEs. A product can be resolved without an official CPE. The [product.py](../src/backend/app/models/product.py) models persist Products, aliases, bindings, runs and decisions; additive migration `d9e0f1a2b3c4`.

The [pure resolver](../src/backend/app/services/product_resolution.py) checks exact aliases, carefully normalized aliases/canonical names, then explicitly cataloged CPE/purl bindings. It keeps every plausible candidate and returns `resolved`, `unknown` or `ambiguous`, without silently breaking a tie. The 100/75 confidences are heuristic levels, not calibrated probabilities.

The [orchestration layer](../src/backend/app/services/product_resolution_service.py) loads the embedded catalog and persists one decision per component with a snapshot, signals, candidates, versions and configuration/catalog fingerprints. Decisions are appended on every run and survive component replacement thanks to their snapshot. No fuzzy matching, human validation or LLM call is implemented.

The operational catalog embeds only four identities (including fictional products): this v0 demonstrates the contract and traceability, not universal software coverage. The [annotated corpus](../samples/evaluation/product_resolution_v0/) contains five cases; see [evaluation](EVALUATION.md).

## Legacy matching — experimental and independent

[VersionMatcher and CPE](../src/backend/app/services/cpe.py) provide a partial CPE parser, Windows aliases, exact/range/wildcard matching and a few numeric equivalences. The comparator tokenizes digits/letters; it does not select a version family and does not expose `unknown`.

The [findings service](../src/backend/app/services/finding_service.py) selects by CPE part/vendor/product in SQL, evaluates with Polars and upserts component × vulnerability matches. Components without usable CPE fields are excluded; losing candidates and non-matches are not persisted. Its 100/98/95/90/65 confidence levels are also heuristic.

`VulnerabilityProduct` represents CPEs/bounds projected from NVD, not a canonical Product. NVD extraction flattens `vulnerable` entries and does not keep the full AND/OR semantics, negations or environmental prerequisites. Raw sources remain available. **A successful Product resolution therefore does not demonstrate that a CVE applies and does not replace this matcher.**

## Applicability Engine — planned, not started

The target is: canonical Product + observed version + normalized/versioned constraint → per-family comparator → `applicable` / `not_applicable` / `unknown`, with source text and justification. Vulnerability-side bindings, the AST, version families and composite configurations remain to be implemented. An unsupported format must be able to stay unknown.

This evolution will require a new, explicitly scoped work slice. Recent validations are in [READINESS](READINESS.md).
