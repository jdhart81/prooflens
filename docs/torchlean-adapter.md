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
recomputes its margin arithmetic, but does not run TorchLean in this adapter build and has not
imported a Lean kernel witness establishing that the intervals enclose the model. This follows the
boundary stated in TorchLean's own `MarginCert` module: its report checker validates internal
arithmetic and summary fields; model enclosure requires a separate verifier or propagation theorem.

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

The web view displays source pin, margin replay, and model enclosure as a three-step evidence chain.
The **Download enclosure request** control emits the exact JSON handoff for the isolated proof
environment.

## Next gate

Produce the first authoritative TorchLean propagation theorem for a complete model artifact, export
it through its native Lean 4.33 toolchain, and return a receipt that satisfies this protocol. The
checked-in official margin report does not contain that theorem, so the public example correctly
continues to show certificate debt.
