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

## Explore a conjecture

A declaration whose proof uses `sorry` can follow the same extraction and explanation path.
ProofLens displays what the statement asserts and marks it unproved. Supported pictures remain
available; examples and sliders do not prove the conjecture. Start from a declaration in your
configured Lean project so its types, imports, and dependencies can be elaborated.

In the browser, open **Explore your own Lean**, paste a declaration or select a `.lean` file,
and choose **Visualize statement**. The input stays in your browser. For example:

```lean
theorem fourfold_input (C M : ℝ) (hC : 0 < C) (hM : 0 < M) :
  Real.sqrt (C / (4 * M)) = Real.sqrt (C / M) / 2 := by
  sorry
```

Set C to 36 and M to 4. Both sides are 1.5: multiplying the denominator input by four
halves the square-root result. Try M = 0 to see why the positive-input assumption matters.
Use **Save explanation** and **Save chart** to keep the current example and its limits.

Source preview supports explicit real variables, integer literals, arithmetic, comparisons,
`Real.sqrt`, `Real.log`, `Real.exp`, absolute value, typed quantifiers, and supported filters.
It does not run Lean or check the proof. Custom notation and unresolved functions are refused;
partial imports list skipped declarations. Use the extractor above for other project syntax,
then open its JSON in the browser. Uploaded JSON is validated but never independently certified.

Limits: 200 KB for source preview; 8 MB and 250 declarations for JSON; 250 declarations
per preview. Inputs live in memory for the current page. Reloading returns to the examples.

After exploring, try describing the objects, the asserted relationship, and its assumptions in
your own words. A useful report tells us which question the picture answered or where it confused
you. This is the [product success criterion](product-direction.md#evidence-of-success).

[Share a first-use or repeat-use report](https://github.com/jdhart81/prooflens/issues/new?template=builder_trial.yml)
with a small public or synthetic example, what you expected, and what became
clearer or blocked you. If you return for another task, describe that separately.
A report does not need to include code changes, private research or contact details.
