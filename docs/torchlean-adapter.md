# TorchLean adapter

The optional `@prooflens/torchlean-adapter` package turns source-pinned TorchLean robustness-report
snapshots into interactive ProofLens scenes without making TorchLean a dependency of the core Lean
extractor.

## Why it is isolated

The first integration pins TorchLean commit `12f5c651f03b3890ec012d0a6bb45e3ea698c8d3`, which uses
Lean 4.33. ProofLens currently uses Lean 4.24. Keeping the adapter at a JSON boundary avoids an
unsafe whole-project toolchain upgrade and lets each project retain its own build and trust model.

## First source fixture

The web demonstration uses an exact two-example excerpt and complete summary from TorchLean's
checked-in `robust_margin_cert_v0_1` digits report:

- repository: `https://github.com/lean-dojo/TorchLean`;
- path: `NN/Examples/Verification/Robustness/digits_linear_margin_cert.json`;
- complete upstream artifact SHA-256:
  `c517ffd45f2f9e7b844750fcc9e937c1c70509466b973f770644b5d7962aa060`;
- report summary: 360 examples, 349 nominally correct, 318 with a positive reported margin; and
- displayed examples: ID 0 (positive margin) and ID 7 (overlapping intervals).

TorchLean is MIT-licensed; the excerpt remains attributed to the pinned upstream source.

The adapter validates the source pin, architecture dimensions, report counters, finite interval
endpoints, `lower ≤ upper`, class dimensions, and the serialized `certified` flag. It independently
recomputes TorchLean's strict top-label predicate:

```text
lower[label] > max(upper[competitor])
```

Any mismatch blocks the scene.

## Epistemic boundary

The current scene is `interpreted`, not `verified`. ProofLens has a pinned official artifact and
recomputes its margin arithmetic. ProofLens has now built and extracted TorchLean's generic
`runIBP?_encloses_evalGraphRec` theorem with Lean 4.33, but that theorem is conditional: it requires
a topologically sorted supported graph and enclosed inputs. The report does not yet bind its model,
parameters, perturbation region, and serialized intervals to those premises. This follows the
boundary stated in TorchLean's own `MarginCert` module: its report checker validates internal
arithmetic and summary fields; model enclosure requires a separate verifier or theorem application.

The interface therefore says “positive margin,” not “kernel-verified robustness.” It also explains
that “not certified” means the displayed bounds overlap, not that the model is necessarily wrong or
vulnerable.

## Enclosure receipt protocol

The adapter now exports `prooflens_torchlean_enclosure_request_v0_1`. The request binds the source
repository, commit, path and SHA-256; model ID; norm, method and epsilon; input and class dimensions;
and exact example IDs. It is explicitly certificate debt, not a certificate.

A returned `prooflens_torchlean_enclosure_receipt_v0_1` must repeat that binding exactly and name a
Lean theorem in hash-matched trusted Formal IR. The declaration must be a theorem carrying the
`@prooflens.torchlean-enclosure v0.1` protocol marker, and its name, module and statement must all
match. Only `kernelWitness()` can then provide the private capability required for the enclosure
claim to become `verified`. A serialized receipt, changed input, missing marker, theorem that reaches
`sorry`, or unmatched Formal IR hash all remain `interpreted`.

## Generic IBP soundness theorem

The checked-in `examples/torchlean-ibp-soundness.formal-ir.json` is a native ProofLens extraction
from the pinned TorchLean commit under Lean 4.33. Its SHA-256 is
`3aa4f293011dd4dcd30a6d280c8e2a63f7524c3aed7376254e8a1016f6800ae4`. The exact declaration,
module, toolchain, statement, source commit, and extraction hash are pinned in the adapter. It has no
`sorry` and can mint a ProofLens kernel witness.

The web view therefore displays a four-step evidence chain: source pin, margin replay, generic IBP
rule, and concrete model enclosure. The generic rule is green. The final step stays certificate debt
until the artifact binding, topological-order, supported-operation, and input-enclosure premises are
proved for this report. The visual IF/THEN rule makes this distinction explicit.

## Concrete application audit

`examples/torchlean-digits-application-audit.json` records a reproducible audit at the pinned
commit. The official Python exporter reproduced the 360-example report byte for byte. TorchLean's
actual lowering produced a 16-node graph from input node 0 to output node 15, and every observed
parent precedes its child.

The audit also found two fail-closed blockers:

- the graph contains `reshape` and `concat`, while the pinned theorem's `Supported` predicate
  rejects both operations; and
- the report producer uses Python binary64 round-to-nearest arithmetic, while the theorem describes
  exact-real boxes. No outward-rounding bridge currently proves that the serialized endpoints are
  conservative exact-real bounds.

The UI displays all 16 operations and marks the unsupported nodes. It separately describes the
theorem variables `g`, `ps`, `inputs`, and `B`, so a reader can see which mathematical object each
remaining obligation concerns. **Download evidence packet** emits the application audit, generic
theorem pin, enclosure request, and blocked conclusion together.

## Next gate

Extend TorchLean's soundness proof to cover semantics-preserving `reshape` and `concat` nodes, then
prove the concrete `InputsEnclosed` premise. Regenerate or bridge the report with conservative
outward rounding, bind the resulting boxes to the digits parameters, and return a receipt satisfying
the enclosure protocol. Until those application proofs exist, the public example correctly remains
blocked rather than presenting the positive margins as verified robustness.
