# Research Lab and evaluation

The lab is built into Harmonia and is the main demo path. The [demo guide](DEMO.md) shows how to compare strategies on synthetic data; [READINESS](READINESS.md) records recent validations.

## Where the current Lab lives

There is no separate Research Lab directory in this repository. Its capabilities are part of the application:

| Asset | Location and behavior |
|---|---|
| Scoring engines | [scoring_service.py](../src/backend/app/services/scoring_service.py) (Polars + bulk COPY), [asset_service.py](../src/backend/app/services/asset_service.py), [finding_service.py](../src/backend/app/services/finding_service.py) (SQL computations) |
| Profiles and scenarios | [models/scoring.py](../src/backend/app/models/scoring.py): revised vulnerability/asset/finding profiles, contexts, presets |
| Runs/comparisons | [profile_service.py](../src/backend/app/services/profile_service.py): async jobs, progress, cancellation, runs, configuration snapshots, watermarks, stale/inconsistent |
| Experimental UI | [DashboardPanel.tsx](../src/frontend/src/components/DashboardPanel.tsx), [ProfileManager.tsx](../src/frontend/src/components/ProfileManager.tsx), [comparison/](../src/frontend/src/components/comparison): compose baseline/candidates, distributions, heatmap, divergences, history |
| Fixtures and verification | [backend tests](../src/backend/tests), three frontend comparison test files, [50 synthetic BOMs and generator](../samples/assets/README.md) |

The built-in presets Balanced, Active Exploitation and Business Impact can be cloned; the active preset is separate from the choice of compared candidates. Scores are persisted per profile or context, with a revision and a run reference. The legacy scoring APIs remain adapters to the active preset.

Comparisons measure distributions, level transitions, promotions/demotions, score/rank deltas and Spearman correlation. The divergence detail view supports search, filters and pagination. These metrics compare strategies; without ground truth they do not prove that findings are correct or that there is a business benefit.

## Current scientific limitations

- Snapshots cover the **configuration**, not an immutable dataset. Watermarks use counts and maximum dates; they detect some changes without cryptographically identifying every input.
- Score tables hold current results per profile/context. A recomputation can replace the rows used by a comparison; its summaries persist, but the detail can expire. A rerun uses current data, not a guaranteed replay of the past.
- Jobs live in the FastAPI process; on restart, interrupted jobs are marked failed. This is neither a distributed queue nor an exact resume.
- `priority_confidence` mainly reflects weighted data availability; `match_confidence` is heuristic. No general empirical calibration has been established.
- The synthetic catalog has a deterministic generator but no complete ground truth about applicable vulnerabilities. The number of findings also depends on the ingested NVD data.
- The in-memory registry currently only covers `product_resolver` v0; there is no plugin platform, ML/LLM/prompt evaluation or universal generic benchmark. Software tests and scientific benchmarks are complementary.

## Target contract and gradual adoption

```text
EvaluationRun {
  module_id, module_version,
  configuration,
  dataset_id, dataset_version / digest,
  input_refs, output_refs,
  result, metrics, provenance
}
ModuleResult {
  result / status, confidence, candidates,
  evidence, module_id / version
}
```

Version the relevant schemas, resolvers, algorithms, models, prompts and strategies. Keep the inputs/outputs needed for replay, annotations and their provenance; separate development and evaluation corpora. Human decisions can enrich the dataset, with changes tracked.

The Module Registry will gradually describe contracts, versions and configurations. Do not automatically turn `ScoringProfile` into a universal registry: a revised configuration is not the version of the code being executed. Wrap legacy engines behind a common contract only when it serves a measurable slice.

| Module | Expected evaluations |
|---|---|
| Asset Identity Resolution | Link quality, false merges/splits, abstentions; corpus and metrics separate from Product |
| Product Resolver | Precision/recall, top-1/top-k, auto-resolution, human review, false matches, unresolved, regressions |
| Applicability | Correct decisions by family/version/bound, coverage, unknown, false positives/negatives |
| Consolidation | Correctly grouped observations, false merges/splits, evidence preservation |
| Priority | CVSS baseline vs Harmonia, actionable backlog, business relevance and explanations, existing deltas |
| ML/LLM/prompts | Quality, calibration, coverage, cost, latency, regressions and data policy |

Phase 1 must add a first end-to-end measurement of uncertainty. Do not multiply per-stage confidences as if they were independent probabilities.

The first registered module is `product_resolver` v0: its runner reports resolution accuracy, coverage, false matches, `unknown`/`ambiguous` rates and top-k, with denominators. Separate JSON catalog and corpus live under `samples/evaluation/product_resolution_v0/`; the report includes their digests. The current corpus is tiny: its metrics demonstrate no generalization to real inventories. The Applicability Engine has not been started.
