# Why does four times the input halve this result?

Open [ProofLens](https://jdhart81.github.io/prooflens/) to explore a square-root relationship without installing anything.
This is a numerical explanation of a statement, not a proof. The unfinished Lean declaration is deliberately labeled unproved.

## Try it

1. Expand **Explore your own Lean** if needed. Paste the declaration below.
2. Choose **Visualize statement**. Set **C = 36** and **M = 4**.
3. Both displayed sides are **1.5**. The equation compares the result at `4 * M` with half the result at `M`.
4. Change **M to 9**. Both sides become **1**. Describe why in your own words.
5. Change **M to 0**. The preview reports **Outside the stated assumptions** and declines to evaluate the division. That is a limit of this numerical preview; Lean's arithmetic conventions are not being executed here.
6. Restore **M = 4**, then use **Save chart** and **Save explanation** to keep the picture and its qualifications.

```lean
theorem fourfold_input (C M : ℝ) (hC : 0 < C) (hM : 0 < M) :
  Real.sqrt (C / (4 * M)) = Real.sqrt (C / M) / 2 := by
  sorry
```

The browser reads supported source syntax and draws sampled values. It does not run Lean, check the proof, or establish the identity for all inputs. Positive C and M are stated assumptions. An attractive picture does not remove them.

## Make it your own

Try a small public or synthetic declaration you actually want to understand. Unsupported forms remain explicit gaps. Do not paste confidential research into a public feedback issue.

[Report what became clearer or what blocked you](https://github.com/jdhart81/prooflens/issues/new?template=builder_trial.yml).
A useful report names your question, your input, and what changed in your understanding. Returning for a different question is a separate result.

## Share the result

Share the saved chart together with the equation, parameter values, and this caption:

> ProofLens numerical preview: at C = 36 and M = 4, both sides are 1.5. The pasted declaration uses sorry and is not proved. Try changing the input: https://jdhart81.github.io/prooflens/

For extraction from a Lean project, see the [local quickstart](quickstart.md).
