# Vision — from strategy comparison to reconciliation

Harmonia explores how to go from vulnerability and inventory signals to a contextualized, explainable priority. The current prototype mainly makes it possible to compare scoring strategies in a lab built into the product. The [README](../README.md) describes what is available; the [ROADMAP](../ROADMAP.md) separates what comes next.

The target is an **Asset ↔ Product ↔ Vulnerability ↔ Finding ↔ Evidence** chain: correlate observations, keep software identities independent of CPEs, determine applicability, then consolidate the actions to take. Harmonia replaces neither scanners nor the CMDB; authority must depend on the attribute and its provenance.

The Lab must remain integrated: compare strategies, module versions and datasets, measure errors and abstentions, and keep the reasons behind each decision. Current scores and deltas show the consequences of weighting choices; they do not prove a reduction of real-world risk.

Engines should favor determinism and accept uncertainty. A Product can exist without a CPE; resolving a product does not prove that a CVE applies. Any future use of an LLM will remain bounded, optional and traceable; it is not implemented.

Once the core and the field need are validated, an internal State/Capability graph could represent preconditions, transitions and controls. ATT&CK would be an annotation, not the computation model. Attack paths, defensive recommendations and commercial features are not part of the presented prototype.
