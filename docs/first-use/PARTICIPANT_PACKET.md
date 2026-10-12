# Try one statement in ProofLens

**Explore how changing one input affects the two sides of an inequality.**

This short exercise uses the browser demo. No account, installation, payment or API key is needed. Allow about **10 minutes**; this is an estimate, not a measured completion time. Participation is optional. You may stop at any point, and a confusing step is useful feedback.

## Before you begin

Open [ProofLens](https://jdhart81.github.io/prooflens/) in your browser. Choose **abs_upper_bound** under **Explore a statement** if it is not already selected. The relationship is:

`|a + b| ≤ |a| + |b|`

The left side is the magnitude of the sum. The right side adds the two separate magnitudes. This is an illustration of the triangle inequality for real numbers.

If you have a mathematical question of your own, write it down before trying the exercise. It is fine to have no current question; learning the controls and solving a real task are different results.

## Try it

1. Set **a = 1** and **b = 1**. Read the left and right values under **Numerical illustration**. Describe what the inequality says about these values.
2. Before changing anything, predict what will happen if **b becomes -1**. Will the left value, right value, or both change? Record your prediction.
3. Set **b = -1**, keeping **a = 1**. Record the two displayed values and compare them with your prediction. Explain the change in your own words.
4. Open **Why this picture** and **Check the assumptions** if helpful. Describe one thing the picture helped you see, or the first thing that confused you.
5. Explain what the numerical example establishes. Does seeing the relationship hold for these two input pairs prove it for every real input?
6. Optionally use **Save explanation** or **Save chart** to keep the result on your own device. Keep the statement and its qualifications with any chart you share. **Reset values** restores the starting values.

Expected observable behavior: the two inputs are editable, a separate numerical illustration displays both sides of the inequality, changing b updates the values, and the relationship remains satisfied at both input pairs. If those controls or values fail to appear, report where you stopped; you do not need to work around the problem.

## What this tells you

The preview illustrates selected numerical inputs. The diagram does not prove the general inequality. For this built-in statement, no extra positivity hypotheses are listed: a and b range over real numbers. That does not mean ProofLens accepts every Lean syntax or every mathematical form.

ProofLens also supports previews of some pasted Lean statements. A **source preview** reads supported syntax without running Lean or checking the proof. A declaration ending in **sorry** is admitted: that artifact contains no completed proof of its statement. Imported Formal IR metadata is not an independent verification attestation. Actual Lean certificates belong to a separate, source-bound verification path; none is created by this browser exercise.

This exercise uses deterministic browser features and no language model or paid model call. Any future model-generated interpretation belongs to a separate speculative layer; a fluent explanation cannot acquire the authority of a Lean proof.

## Tell us what happened

Use [FEEDBACK.md](FEEDBACK.md) to record the inputs, your own explanation, the first friction and whether a question became clearer. No email address, personal details, private research or credentials are needed. You may keep the feedback locally. If you choose to report publicly, the [first-use issue form](https://github.com/jdhart81/prooflens/issues/new?template=builder_trial.yml) is an optional route and is visible to everyone. A GitHub account is required to submit that form, but is not required to try the demo.

If this helped answer a real question, say which question and what changed. If you later return for a different question, that is a separate result; there is no need to return merely to satisfy this exercise.

Source: [ProofLens README](https://github.com/jdhart81/prooflens/blob/6d18d52fa3a780989e34ec75c38fa6e0ab26a154/README.md), [epistemic model](https://github.com/jdhart81/prooflens/blob/6d18d52fa3a780989e34ec75c38fa6e0ab26a154/docs/epistemic-model.md). The current browser behavior was checked by the maintainer on October 11, 2026; that check is technical readiness, not evidence of participant use.
