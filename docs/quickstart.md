# One theorem in five minutes

This is the shortest path from a Lean theorem to a ProofLens explanation and an animated SVG. It
uses a theorem already present in the repository, so the first run needs Node and pnpm but does not
need a local Lean installation.

## 1. Build the deterministic pipeline

```bash
git clone https://github.com/jdhart81/prooflens
cd prooflens
pnpm install
pnpm build
```

## 2. Explain one theorem

The example theorem says that a quantity already known to be below `P / T` remains below that
bound. Two physically natural hypotheses are stated but do not occur in this particular proof
term:

```lean
theorem simple_upper_bound
    (x P T : ℝ)
    (hP : 0 < P)
    (hT : 0 < T)
    (h : x ≤ P / T) :
    x ≤ P / T :=
  h
```

Ask ProofLens to explain it from the committed, kernel-extracted Formal IR:

```bash
pnpm prooflens explain examples/corpus.formal-ir.json simple_upper_bound
```

The output keeps four facts separate:

- the exact theorem statement is **verified**;
- the upper-bound classification is **derived** by a named deterministic rule;
- the observation that `hP` and `hT` are absent from this proof term is **derived**;
- the physical meanings attached to `x`, `P`, and `T` are **interpreted** author annotations.

“Unused by this proof term” does not mean “mathematically unnecessary.” A different proof or a
stronger statement may need those hypotheses.

## 3. Render the visual explanation

```bash
pnpm prooflens render examples/corpus.formal-ir.json simple_upper_bound \
  --out-dir quickstart-output \
  --format both \
  --animate
```

Open the generated SVG in `quickstart-output/`. Its provenance names the classifier rule and the
exact declaration path that produced every mathematical mark.

## 4. See the same analysis in Lean

With the repository's Lean projects built, place this command in a Lean file:

```lean
import ProofLens.Widget
import ProofLensExamples.Bounds

#prooflens ProofLens.Examples.simple_upper_bound
```

Put the cursor on `#prooflens`. The infoview runs the same TypeScript pipeline as the CLI and web
application; there is no separate interpretation implementation.

## 5. Point it at your theorem

Extract any module from a Lake project that depends on ProofLens:

```bash
pnpm prooflens extract \
  --project /path/to/your/lake-project \
  --module Your.Module \
  --out your-module.formal-ir.json

pnpm prooflens explain your-module.formal-ir.json Your.theorem
```

If ProofLens does not recognize the theorem shape, it still displays the formal statement and
fails closed instead of inventing a visual explanation. Please use the repository's
[unsupported-mathematics issue form](https://github.com/jdhart81/prooflens/issues/new?template=unsupported_mathematics.md)
to turn that gap into a reproducible contribution target.
