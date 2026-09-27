# Canonical architecture and domain

Prototype status and boundaries of the target design. The "current" columns below describe the code; the full flow remains a direction, not a pipeline that is already available.

## Flow and boundaries

```text
Connectors → Raw ingestion / staging → Normalization
          → Identity Resolution → Canonical Domain Model
          → Applicability Engine → Finding Consolidation
          → Context / Prioritization → API / UI / workflow

Cross-cutting: Evidence / provenance, versions, replay,
               Module Registry, Evaluation / Research Lab
```

Future adapters would translate Qualys, Tenable, ServiceNow or GLPI; current inputs are NVD/EPSS/KEV/EUVD and CycloneDX. Adapters translate data into stable internal representations. External formats must not define the domain. This breakdown is functional: keep the current monolith until a deployment split is justified. The conceptual "graph" does not require a new graph database; PostgreSQL can hold the relationships.

## Distinct concepts

| Target concept | Responsibility | Current counterpart |
|---|---|---|
| Asset | Observed/managed entity: host, VM, cloud resource, container, workload, application, service, database; internal correlation identity | `Asset` with a UUID, but a single global `external_id` and one source |
| Source record | External object identified in its source, dated observations and link to the Asset | `raw_payload` and `external_id`; no multi-source model |
| Software observation | Name/version actually observed on an asset, date, source, evidence | `AssetComponent`, replaced on reimport |
| Product | Stable internal software identity: vendor, canonical name, aliases, metadata/components, external identifiers and optional CPE bindings | `Product`, aliases and v0 bindings; `VulnerabilityProduct` remains a separate NVD CPE projection |
| Vulnerability | Logical vulnerability that may have a CVE, advisory and other identifiers/intelligence | `Vulnerability` UUID, but `cve_id` is required/unique and columns are source-specific |
| Finding | Potential/actual application of a vulnerability to an asset/product; consolidated action | `Finding` exists, unique per component × vulnerability |
| Evidence / decision | Traceable justification of observations, resolutions, applicability and priorities | Append-only Product v0 decisions and snapshots; no generic entity covering other domains |

A CVE on its own is a Vulnerability; that CVE on `finance-db-prod-01` is a Finding. Several components and observations can contribute to the consolidated Asset × Vulnerability action. Product and versions stay in the supporting links, even when the action is consolidated.

## Evidence and uncertainty

Product Resolution v0 materializes this contract for its own decision only: run/module/configuration/catalog, component snapshot, candidates and signals are persisted. It does not yet replace the raw blobs or the existing scoring mechanisms, and its confidence is heuristic.

Every important decision should reference the observations and sources used, their raw chain, the method, the resolver/module and its version, its configuration, its candidates/scores, the confidence and any human validation. For an LLM inference: versioned provider, model, prompt and schema. Distinguish observation, ingestion and decision times where relevant.

Conceptual contract:

```text
Decision {
  result / status,
  confidence,
  candidates,
  evidence_refs,
  method,
  module_id / module_version,
  configuration_ref,
  human_validation
}
```

Statuses must distinguish resolved, unknown and ambiguous; applicability must distinguish applicable, not applicable and unknown. The Product v0 contract exists; its generalization and the applicability contract remain to be implemented. A heuristic confidence is not automatically a calibrated probability. Keep disagreements and reasons for abstaining.

Acceptance questions: why Tomcat 9.0.80 on this asset? Why does this CVE apply? Why is this finding critical now? An explainable chain of links must make it possible to answer, rather than just displaying a boolean.

## Consolidation and priority

A Qualys observation + a Tenable observation + manual evidence can contribute to the same Finding. Keep the observations and make consolidation rules auditable. A uniqueness constraint alone does not constitute consolidation. Preserving identity and history across inventory updates is a separate work item from the current matching.

The priority engine can combine CVSS, EPSS, KEV, EUVD/exploitation intelligence, Internet exposure, reachability, environment, business criticality, owner/service, CIA, finding age, controls and customer rules; contribution to attack paths only later. Output: score/rank/level, factors that raise or lower the priority, explanation and strategy version — "WHY NOW?".

The current scoring is a first strategy: vulnerability, then asset, then finding, with configurations and revisions kept for runs. The UI shows match and score details, but does not yet provide this full explanation chain.

## Incremental evolution

Current identities, pipelines and APIs remain useful. Add new abstractions alongside them, evaluate on frozen fixtures, then wire in a proven slice. Do not rename `VulnerabilityProduct` to Product to hide the difference; do not convert existing findings or erase their scores without analysis. Details: [inventory](INVENTORY.md), [resolution](RESOLUTION.md), [LLM](LLM.md), [evaluation](EVALUATION.md) and [roadmap](../ROADMAP.md).

## Existing ingestion invariants

Polars normalizers serialize complex fields to JSON before converting them for insert. `SOURCE_OWNED_COLUMNS` restricts the updates each source may perform; the JSONB merge of `sources_raw` and the KEV summary fallback preserve data from other sources. These blobs keep the latest value per source, not an immutable history (EPSS keeps a minimal representation there).

The NVD runner splits long windows and records the start of the last successful sync for incremental runs. EUVD is paginated; source errors are isolated by the runner. SQLAlchemy timestamps are timezone-aware. The scheduler and jobs live in the FastAPI process; operational text logs are not a business audit trail.

Long-running work is tracked so the UI can follow it from any page: scoring runs, comparisons and asset ↔ vulnerability matching are `scoring_jobs` rows executed one at a time in the background, with persisted progress, phase labels and cooperative cancellation (a restart marks unfinished jobs failed). Ingestions report progress on their `ingestion_logs` row. `GET /api/v1/activity` aggregates active and recently finished jobs with the latest ingestion per source; the frontend polls it (faster while something runs), shows it in the sidebar, notifies on completion and reloads the affected views. The synchronous scoring and matching endpoints remain for API compatibility.
