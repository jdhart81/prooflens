# TorchLean adapter

The optional `@prooflens/torchlean-adapter` package turns source-pinned TorchLean robustness-report
snapshots into interactive ProofLens scenes without making TorchLean a dependency of the core Lean
extractor.

## Why it is isolated

The first integration pins TorchLean commit `12f5c651f03b3890ec012d0a6bb45e3ea698c8d3`, which uses
Lean 4.33. ProofLens currently uses Lean 4.24. Keeping the adapter at a JSON boundary avoids an
unsafe whole-project toolchain upgrade and lets each project retain its own build and trust model.

## Source fixture

The web demonstration uses the complete summary and all 360 examples from TorchLean's
checked-in `robust_margin_cert_v0_1` digits report:

- repository: `https://github.com/lean-dojo/TorchLean`;
- path: `NN/Examples/Verification/Robustness/digits_linear_margin_cert.json`;
- complete upstream artifact SHA-256:
  `c517ffd45f2f9e7b844750fcc9e937c1c70509466b973f770644b5d7962aa060`;
- report summary: 360 examples, 349 nominally correct, 318 with a positive reported margin; and
- displayed examples: all 360 examples (including ID 0 with a positive certified margin and ID 7 with overlapping intervals).

TorchLean is MIT-licensed; the data remains attributed to the pinned upstream source.

The adapter validates the source pin, architecture dimensions, report counters, finite interval
endpoints, `lower ≤ upper`, class dimensions, and the serialized `certified` flag. It independently
recomputes TorchLean's strict top-label predicate:

```text
lower[label] > max(upper[competitor])
```

Any mismatch blocks the scene.

## Epistemic boundary

The upstream 360-row summary remains `interpreted`: ProofLens has a pinned official artifact and
recomputes its margin arithmetic. ProofLens has built and extracted TorchLean's generic
`runIBP?_encloses_evalGraphRec` theorem with Lean 4.33, but that theorem is conditional: it requires
a topologically sorted supported graph and enclosed inputs. The upstream report does not bind its
model, parameters, perturbation region, and serialized intervals to those premises. This follows the
boundary stated in TorchLean's own `MarginCert` module: its report checker validates internal
arithmetic and summary fields; model enclosure requires a separate verifier or theorem application.

The concrete enclosure path covers the 10×64 linear classifier, all 360 exact ±0.02 input boxes,
and all 3600 outward-rounded decimal output intervals. A source-constant change requires a fresh
Lean check, extraction, and hash-matched receipt before presenting that candidate as `verified`.

The interface therefore distinguishes "positive margin" (certified positive margin) from "not certified"
(overlapping intervals). It also explains that "not certified" means the displayed bounds overlap, not
that the model is necessarily wrong or vulnerable.

## Enclosure receipt protocol

The adapter exports `prooflens_torchlean_enclosure_request_v0_1`. The request binds the source
repository, commit, path and SHA-256; model ID; norm, method and epsilon; input and class dimensions;
and all 360 exact example IDs. It is explicitly certificate debt, not a certificate.

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

The audit found two blockers in the generic graph-proof path:

- the graph contains `reshape` and `concat`, while the pinned theorem's `Supported` predicate
  rejects both operations; and
- the report producer uses Python binary64 round-to-nearest arithmetic, while the theorem describes
  exact-real boxes. No outward-rounding bridge currently proves that the serialized endpoints are
  conservative exact-real bounds.

ProofLens uses a direct exact-real certificate path for the concrete linear model in
`corpus/ProofLensExamples/TorchLeanDigits.lean`. The intended certificate represents every original
pinned JSON decimal token as an integer over a common scale, proves the general linear interval rule,
and checks all 3600 rounded endpoints by decidable integer arithmetic with no `sorry`. It does not
claim that the generic graph theorem supports `reshape` or `concat`; that path is displayed as
explicitly unused.

The UI describes `g`, `ps`, `inputs`, and `B`, then shows the exact certificate path separately from
the observed 16-node wrapper graph. **Download evidence packet** emits the application audit,
generic theorem pin, exact theorem extraction, receipt, and verified conclusion together.

## Exact source-token binding

The model interpretation is the exact rational value of each original JSON decimal token at
scale 10^19. It does not decode the token to IEEE binary64 or float32 before constructing Lean
integers. Excess precision is rejected instead of silently rounded or truncated. This contract does
not establish a rounding bridge to the upstream Python exporter or Torch runtime.

`fixtures/torchlean-digits-source` retains the three original, hash-pinned public JSON files.
Run `python3 scripts/check_torchlean_source_binding.py` to compare all 640 weights, 10 biases,
360 clipped input boxes and 3600 interval pairs independently of the JavaScript numeric helper.
The gate parses original tokens with Python's `Decimal` and performs only integer arithmetic;
it is a source-binding and numerical sanity check, not formal proof or a kernel witness.

The JavaScript helper also accepts the original files through
`node scripts/generate-torchlean-artifacts.mjs --source-dir fixtures/torchlean-digits-source`.
It validates their hashes and preserves original JSON number tokens as strings before integer
conversion. Passing already-decoded JavaScript numbers is rejected. Discrete class labels are
converted only after validation as integers in the range 0 through 9.
The helper computes minimal outward bounds at the certificate scale. A retained Lean enclosure
may have additional conservative slack; the independent gate checks soundness, rather than
requiring the bounds to be minimal.

The native extractor emits naturals above 2^53−1 as exact decimal strings in the existing Formal IR
schema, retaining safe small naturals as numbers. The JavaScript parser preserves those strings,
and MathIR renders them unquoted without binary64 conversion. Source preview also preserves large
integer tokens, but remains interpreted rather than elaborated or kernel-verified; decimal and
heuristic preview behavior is unchanged. Historical IR containing unsafe numeric literals can still
round when decoded. These projections do not establish IEEE/PyTorch execution equivalence.

The CI source-token gate supplements the full Lean corpus build and extraction-parity check.
Never disable extraction parity to accept changed constants or update a receipt hash without a
fresh extraction. Update the Formal IR, receipt and application-audit hash bindings together
after that path.

## Next gate

Any source-constant change must check all numeric lemmas through the pinned Lean build,
freshly extract the TorchLean Formal IR, and update its receipt and evidence bindings together.
Passing the Python source gate alone does not complete this gate. Maintainer and contributor review
must agree that the exact JSON-decimal rational model is the intended claim before publication.
The certificate does not establish IEEE/PyTorch execution equivalence or authorize publication.
Future work can upstream TorchLean's semantics-preserving `reshape` and `concat` cases so its
generic graph theorem can certify the lowered wrapper directly.
