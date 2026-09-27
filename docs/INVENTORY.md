# Inventory and asset identity

## Current implementation

The CycloneDX JSON import in [asset_service.py](../src/backend/app/services/asset_service.py) associates a BOM with an asset. The [asset.py](../src/backend/app/models/asset.py) model stores an internal UUID, a global `external_id`, the source, the latest `raw_payload`, the components and the context (exposure, business criticality, patch complexity).

Components store name, version, CPE, purl and `raw_component`. Product Resolution runs separately on these observations; see [resolution](RESOLUTION.md). The [50 synthetic BOMs](../samples/assets/README.md) and their generator are used for experiments, without complete ground truth on applicable CVEs.

## Reimport and limitations

The import finds the asset by its `external_id`, updates its content and **replaces its components**. Deletion cascades to their findings/scores: a later matching run can find the same functional pairs again without preserving their UUIDs or `first_seen_at`. Product decisions keep their snapshots and lose their link to the deleted component. A reimport is therefore not a guarantee of history continuity.

No CMDB/cloud/scanner connector, generic CSV import, source-record collection, observation history or per-attribute arbitration is implemented. Uniqueness of `external_id` is not multi-source resolution.

## Direction (outside the active scope)

An Asset would be a correlation identity linked to records from several sources, without replacing their CMDB. Authority would be defined per attribute: organizational (owner/service), observed (version/hostname) or derived (Product/priority). The source value, conflict, rule, date and decision would need to be preserved.

Asset resolution and product resolution must remain two separately evaluated engines. A reused hostname or IP is not enough to prove identity; use strong IDs, timing, contradictions and abstention (`unknown`/`ambiguous`) before merging. This work has not started.
