# LLM — unimplemented direction

No LLM client, business provider, product prompt or inference pipeline is implemented. Product Resolution v0 is deterministic. This document only records the constraints for a possible future evolution; it is not a work plan.

- Reserve the LLM for linguistic/semantic ambiguity: extracting or ranking candidates. Final version comparison belongs to code suited to the version family, returning `unknown` for unsupported formats.
- Go through provider-independent tasks, structured outputs and versioned schemas. One CVE is one independent inference unit; a batch groups atomic requests.
- Version model, prompt, configuration, inputs and results; keep candidates, abstentions and human decisions. Replay keeps the original response without promising an identical new one.
- Make it possible to disable the LLM entirely. Do not depend on sending a customer's CMDB to an external provider; apply an explicit policy based on data sensitivity.
- Treat advisories and observations as data, never as instructions. Measure quality, cost, latency, coverage and regressions before wiring anything into the product.

Candidate use case (target, see [ROADMAP](../ROADMAP.md)): extracting CVE identifiers and vulnerability descriptions from unstructured advisories such as CERT bulletins or vendor notices. One advisory is one inference unit; each extracted item keeps the source passage as evidence, known CVE IDs are checked deterministically against the vulnerability base, and nothing is added without human review.

See [vision](VISION.md), [resolution](RESOLUTION.md) and [evaluation](EVALUATION.md).
