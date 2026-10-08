# Seymour neighbor definitions: a reproducible correspondence check

This example checks the finite mathematical specification behind ProofLens's
Seymour explorer. Its executable Lean neighbor sets, their cardinalities, and its
good-vertex classification agree with the definitions in the released OpenAI
challenge target. The separate TypeScript tests check the browser calculation
against an independent shortest-path oracle. Neither check verifies the general
conjecture or OpenAI's released solution proof.

## Exact upstream source

`ComparatorChallenges/SeymourSecondNeighborhood.lean` is an unchanged copy of
[OpenAI's released target file](https://github.com/openai/math/blob/adc7f1241b42e322a6451854ab7e4b4c146bf78a/lean/ComparatorChallenges/SeymourSecondNeighborhood.lean).
Attribution: OpenAI, `openai/math`; released under
[Apache-2.0](https://github.com/openai/math/blob/adc7f1241b42e322a6451854ab7e4b4c146bf78a/LICENSE). The repository's
[Apache-2.0 license](../../../LICENSE) also accompanies this example.

| Provenance                   | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Upstream commit              | `adc7f1241b42e322a6451854ab7e4b4c146bf78a`                         |
| Upstream path                | `lean/ComparatorChallenges/SeymourSecondNeighborhood.lean`         |
| Git blob SHA-1               | `70d287c3f831d0698352b144d39cdf29cac6c24b`                         |
| Target file SHA-256          | `fa4a37831405b3fe7f6a88a2dce8918982195ee1757e05e4623055822d36ca98` |
| ProofLens check file SHA-256 | `5a4d3678d317ffd51bee712c2edd40f283fc9972044730ee420fe58848cef521` |
| Compatibility toolchain      | Lean `4.24.0`                                                      |
| Cached mathlib commit        | `f897ebcf72cd16f89ab4577d0c826cd14afaafc7` (`v4.24.0`)             |

OpenAI's pinned environment uses Lean `4.34.1`. This example uses ProofLens's
existing cached Lean/mathlib `4.24` environment and **does not reproduce the
upstream pinned environment**. The target's final theorem deliberately contains
`sorry`; it is a challenge statement. Our own proofs never use that theorem.

## Run the check

From the `source` directory, with its existing corpus toolchain and cached
mathlib dependencies available:

```sh
node scripts/verify-seymour-lean.mjs
```

The verifier checks the exact target's SHA-256 and Git blob identifier, compiles
the target into a temporary module tree, then compiles `SeymourScene.lean` with
that module on `LEAN_PATH`. It checks all 18 printed proof axiom lists against
Lean's standard `propext`, `Classical.choice`, and `Quot.sound` axioms. Missing
audits, proof placeholders, extra axioms, native evaluation axioms, compiler
errors, or diagnostics from the own check fail the run. The target's expected
placeholder warning is recorded separately. No target is added to the corpus.

It downloads no dependencies and installs no toolchain. If the cached
environment is missing, it exits with a diagnostic. The temporary build is
removed after the run. A JSON receipt records the inputs, source hashes,
dependency manifest hash, toolchain, compiler outputs, axiom audits, scope, and
pass/fail result; its path is printed. To choose the receipt location:

```sh
node scripts/verify-seymour-lean.mjs --receipt /tmp/seymour-lean-receipt.json
```

## What is proved

For any finite vertex type with decidable equality and a decidable edge relation:

- `firstNeighbors` agrees with the exact upstream first-neighbor set.
- `secondNeighbors` agrees with the exact upstream second-neighbor set: a
  two-edge destination, excluding the origin and all direct neighbors.
- Both neighbor cardinalities agree with their upstream counterparts.
- The computed Boolean good-vertex result is equivalent to upstream `GoodVertex`.
- The second-neighbor set excludes the origin and every direct neighbor.

These correspondence proofs do not require the graph to be oriented. The valid
fixtures separately prove upstream `IsOriented`, which means no loops and no
edges in both directions between a pair of vertices.

| Fixture                            | Selected vertex | First neighbors | Second neighbors | Good vertex               |
| ---------------------------------- | --------------- | --------------- | ---------------- | ------------------------- |
| Path `0→1→2`, with a sink          | 2               | empty           | empty            | true                      |
| Directed three-cycle               | 0               | `{1}`           | `{2}`            | true                      |
| Diamond with two paths to vertex 3 | 0               | `{1,2}`         | `{3}`            | false                     |
| Triangle with direct edge `0→2`    | 0               | `{1,2}`         | empty            | false                     |
| Overlap: `0→1, 0→2, 1→2, 1→3`      | 0               | `{1,2}`         | `{3}`            | false                     |
| Invalid two-cycle `0→1→0`          | 0               | `{1}`           | empty            | outside graph assumptions |

The two-cycle fixture explicitly checks origin exclusion and proves that its
relation fails the orientation assumption. It is never evidence about inputs
satisfying the conjecture. The diamond checks that repeated paths contribute
one destination. The triangle and overlap fixtures check direct-neighbor
exclusion.

For public discussion, use: **“Definitions checked in Lean; browser calculations
tested against an independent oracle.”** Formal correspondence of this Lean
specification does not establish formal correctness of the TypeScript program,
a general proof of the conjecture, or reader comprehension. Reader usefulness
still needs independent evaluation.
