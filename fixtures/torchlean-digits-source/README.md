# Pinned TorchLean source tokens

These three public JSON artifacts are retained byte-for-byte from
[TorchLean commit 12f5c651f03b3890ec012d0a6bb45e3ea698c8d3](https://github.com/lean-dojo/TorchLean/tree/12f5c651f03b3890ec012d0a6bb45e3ea698c8d3/NN/Examples/Verification/Robustness).
Their SHA-256 values are pinned independently in `scripts/check_torchlean_source_binding.py`.
Do not format these JSON files: byte identity is part of the source pin.

Each source JSON decimal token denotes its exact rational value. The committed
Lean integers use scale 10^19, with rejection if a source token exceeds that
precision. This does not assert equality with decoded IEEE binary64/float32
runtime values or the upstream Python exporter arithmetic.

The offline source-token gate checks 640 weights, 10 biases, all 360 clipped
input boxes and the 3600 retained enclosure pairs using integer arithmetic.
It does not check Lean proof or extract Formal IR. Full Lean corpus validation
and committed-versus-fresh extraction parity remain required separately.
