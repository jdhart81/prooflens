# Semantic scenes

Semantic scenes are ProofLens's first numeric answer to the question “what does this theorem
represent?” They sit beside VisualIR rather than replacing it: VisualIR continues to show proof
structure, while a semantic scene turns a supported theorem into a parameterised mathematical
model a reader can explore.

## The contract

`compileSemanticScene(theorem, classifications)` currently accepts a natural upper or lower bound
only when all of the following are true:

1. the deterministic classifier identifies which reading of the inequality is natural;
2. every operation in the bound belongs to the supported numeric subset;
3. every free parameter has an author-declared `meaning` and `domain`; and
4. every declared domain maps to a safe slider range.

If any gate fails, the compiler returns a stable block code and a human-readable reason. It never
guesses a physical meaning, silently substitutes a value, or draws an undefined expression.

The first numeric subset contains real literals and variables; addition, subtraction,
multiplication, division, powers, negation, reciprocal and absolute value; and `Real.log`,
`Real.exp` and `Real.sqrt`. Undefined evaluations are rejected.

## Epistemic boundary

Every scene keeps four claims separate:

| Part                                 | Standing                      | Why                                                    |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------ |
| Inequality                           | inherited from the classifier | It traces to the kernel-accepted conclusion.           |
| Symbol meanings and domains          | `interpreted`                 | They come from `@prooflens.var` annotations.           |
| Numeric evaluation                   | deterministic                 | The supported MathIR expression is evaluated directly. |
| Defaults, ranges and target scenario | `illustrative`                | They are display choices, not theorem claims.          |

The whole scene is therefore `illustrative`, and the interface states the boundary directly:
Lean verifies the inequality, not the supplied physical meanings or displayed parameter values.

## First golden theorem

`ProofLens.Examples.information_rate_bound` is the first end-to-end fixture. Its verified statement

```text
N / t ≤ P · D / (kB · T · log(2))
```

becomes a live ceiling over author-named power, temperature, Boltzmann constant and efficiency
parameters. The author-selected `axis="x"` puts power on the horizontal axis. The scene derives
which parameters raise or lower the ceiling from the same conservative sensitivity analysis used
by the existing explanations.

The web interface provides sliders, an exact target input, a feasible/infeasible readout, a shaded
permitted region, a numeric curve, a current operating point, and a plain-language description.

## Next shapes

The compiler is deliberately narrow. The next additions should be separate, tested scene kinds:

- inverse-square and other divergence cliffs;
- threshold and phase-transition scenes;
- equality and conservation-flow scenes;
- two-parameter tradeoff surfaces; and
- unit checking and user-supplied physical parameter presets.

Each new kind needs a golden theorem, a named compiler rule, explicit failure cases, and browser
verification at desktop and phone widths.
