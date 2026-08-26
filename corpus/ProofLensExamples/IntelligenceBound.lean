import Mathlib.Analysis.SpecialFunctions.Log.Basic
import Mathlib.Analysis.SpecificLimits.Basic
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Positivity

/-!
# An information-rate bound of the Landauer type

This is the flagship example of the corpus. It formalises the physical claim
that a machine running on `P` watts at temperature `T` cannot sustain an
unbounded rate of logically irreversible operations:

`N / t ≤ P · D / (k_B · T · ln 2)`

Landauer's principle says that erasing one bit at temperature `T` costs at least
`k_B · T · ln 2` joules. Writing `D` for the number of bits of useful work a
machine extracts per erasure — a dimensionless efficiency factor, `D = 1` for a
machine that pays the full Landauer toll on every operation — the cost of one
operation is `k_B · T · ln 2 / D` joules. A machine drawing `P` watts for `t`
seconds has `P · t` joules to spend, and the bound follows by division.

The derivation is deliberately cut into named lemmas rather than written as one
monolithic proof, so that the proof-to-concept graph ProofLens builds has
internal structure: `landauerCost` and `energyBudget` appear as concept nodes,
and `log_two_pos → landauerCost_pos → ops_le_of_energy_le → energy_ops_bound →
information_rate_bound` is a genuine path through it.

The file closes with two fixtures for ProofLens's behaviour at the edge of its
competence: `sequence_limit_example`, which was once unreadable and is now a
supported convergence example, and `energy_cost_injective`, which is the current
deliberate unsupported-mathematics fixture.
-/

namespace ProofLens.Examples

/-- The Landauer energy cost of a single logical operation: `k_B · T · ln 2`
joules per erased bit, divided by the efficiency factor `D` giving the number of
useful operations extracted per erasure.

Naming this quantity gives ProofLens a concept node rather than an anonymous
subexpression repeated across the file.

@prooflens.var kB meaning="Boltzmann constant" units="J/K" domain="positive reals"
@prooflens.var T meaning="operating temperature of the heat bath" units="K" domain="positive reals" axis="x"
@prooflens.var D meaning="useful operations extracted per erased bit" units="dimensionless" domain="positive reals"
@prooflens.visual functional-relationship
@prooflens.concept "Landauer cost per operation"
-/
noncomputable def landauerCost (kB T D : ℝ) : ℝ := kB * T * Real.log 2 / D

/-- The energy a machine drawing `P` watts can spend in `t` seconds: `P · t`
joules. Named for the same reason as `landauerCost`.

@prooflens.var P meaning="electrical power drawn by the machine" units="W" domain="positive reals" axis="x"
@prooflens.var t meaning="length of the operating window" units="s" domain="positive reals"
@prooflens.visual functional-relationship
@prooflens.concept "energy budget"
-/
def energyBudget (P t : ℝ) : ℝ := P * t

/-- **Step 1.** `ln 2 > 0`. The whole argument rests on the Landauer toll being
a strictly positive number of joules, and this is where that positivity enters:
everything else in `k_B · T · ln 2` is positive by physical assumption, but
`ln 2` has to be computed.

@prooflens.visual positivity-fact
@prooflens.concept "positivity of the binary logarithm constant"
-/
theorem log_two_pos : 0 < Real.log 2 :=
  Real.log_pos (by norm_num)

/-- **Step 2.** The Landauer cost per operation is strictly positive. Uses
`log_two_pos` together with the physical positivity assumptions on `k_B`, `T`
and `D`.

This is the lemma that makes the division in the final bound legitimate; without
it, `N / t ≤ P · D / (k_B · T · ln 2)` would not even be well-behaved as an
inequality.

@prooflens.var kB meaning="Boltzmann constant" units="J/K" domain="positive reals"
@prooflens.var T meaning="operating temperature of the heat bath" units="K" domain="positive reals" axis="x"
@prooflens.var D meaning="useful operations extracted per erased bit" units="dimensionless" domain="positive reals"
@prooflens.visual positivity-fact
@prooflens.concept "Landauer cost per operation"
-/
theorem landauerCost_pos (kB T D : ℝ) (hkB : 0 < kB) (hT : 0 < T) (hD : 0 < D) :
    0 < landauerCost kB T D :=
  div_pos (mul_pos (mul_pos hkB hT) log_two_pos) hD

/-- The energy budget of a machine drawing positive power for a positive time is
itself positive. Recorded for completeness of the `energyBudget` concept node;
the main chain needs only the cost positivity.

@prooflens.var P meaning="electrical power drawn by the machine" units="W" domain="positive reals" axis="x"
@prooflens.var t meaning="length of the operating window" units="s" domain="positive reals"
@prooflens.visual positivity-fact
@prooflens.concept "energy budget"
-/
theorem energyBudget_pos (P t : ℝ) (hP : 0 < P) (ht : 0 < t) : 0 < energyBudget P t :=
  mul_pos hP ht

/-- **Step 3.** The counting step, stated abstractly: if `N` items each costing
`c` fit inside a budget `E`, and the unit cost is strictly positive, then
`N ≤ E / c`.

Nothing physical happens here — it is division by a positive number — but
isolating it means the physics lemmas above and the algebra below meet at a
named interface.

@prooflens.var N meaning="number of logical operations performed" units="ops" domain="reals" axis="y"
@prooflens.var c meaning="energy cost of one operation" units="J/op" domain="positive reals"
@prooflens.var E meaning="energy available to spend" units="J" domain="reals" axis="x"
@prooflens.visual upper-bound-plot
@prooflens.concept "operations bounded by budget over unit cost"
-/
theorem ops_le_of_energy_le (N c E : ℝ) (hc : 0 < c) (h : N * c ≤ E) : N ≤ E / c :=
  (le_div_iff₀ hc).mpr h

/-- **Step 4.** Specialising step 3 to the Landauer setting: the operation count
of a machine whose total Landauer bill fits inside its energy budget is at most
that budget divided by the per-operation cost.

Combines `ops_le_of_energy_le` with `landauerCost_pos`, and is stated in terms
of the two named definitions so that it reads as a statement about the physics
rather than about an arithmetic expression.

@prooflens.var P meaning="electrical power drawn by the machine" units="W" domain="positive reals" axis="x"
@prooflens.var T meaning="operating temperature of the heat bath" units="K" domain="positive reals"
@prooflens.var kB meaning="Boltzmann constant" units="J/K" domain="positive reals"
@prooflens.var D meaning="useful operations extracted per erased bit" units="dimensionless" domain="positive reals"
@prooflens.var N meaning="number of logical operations performed" units="ops" domain="reals" axis="y"
@prooflens.var t meaning="length of the operating window" units="s" domain="positive reals"
@prooflens.visual upper-bound-plot
@prooflens.concept "operation count bounded by the energy budget"
-/
theorem energy_ops_bound (P T kB D N t : ℝ) (hT : 0 < T) (hkB : 0 < kB) (hD : 0 < D)
    (hN : N * landauerCost kB T D ≤ energyBudget P t) :
    N ≤ energyBudget P t / landauerCost kB T D :=
  ops_le_of_energy_le N (landauerCost kB T D) (energyBudget P t)
    (landauerCost_pos kB T D hkB hT hD) hN

/-- **Step 5.** The algebraic rearrangement that turns "budget over cost" into
the form physicists quote: dividing by `k_B · T · ln 2 / D` is multiplying by
`D` and dividing by `k_B · T · ln 2`.

@prooflens.var P meaning="electrical power drawn by the machine" units="W" domain="reals" axis="x"
@prooflens.var t meaning="length of the operating window" units="s" domain="reals"
@prooflens.var kB meaning="Boltzmann constant" units="J/K" domain="positive reals"
@prooflens.var T meaning="operating temperature of the heat bath" units="K" domain="positive reals"
@prooflens.var D meaning="useful operations extracted per erased bit" units="dimensionless" domain="positive reals"
@prooflens.visual functional-relationship
@prooflens.concept "budget over Landauer cost"
-/
theorem budget_div_landauerCost (P t kB T D : ℝ) (hkB : 0 < kB) (hT : 0 < T) (hD : 0 < D) :
    energyBudget P t / landauerCost kB T D = P * t * D / (kB * T * Real.log 2) := by
  have hc : kB * T * Real.log 2 ≠ 0 := ne_of_gt (mul_pos (mul_pos hkB hT) log_two_pos)
  unfold energyBudget landauerCost
  field_simp

-- The unused-variable linter is silenced for the next declaration because `hP`
-- is stated for physical completeness but is not needed by the derivation.
set_option linter.unusedVariables false in
/-- **The bound.** A machine drawing `P` watts at temperature `T`, whose `N`
operations fit inside the energy it can draw in `t` seconds, sustains an
operation rate of at most `P · D / (k_B · T · ln 2)`.

Read physically: the right-hand side contains no reference to `N` or `t` at all.
The sustainable rate of irreversible computation is fixed by power, temperature
and thermodynamic efficiency alone — running longer buys more operations but not
a higher rate, and the ceiling falls as the machine runs hotter. This is the
sense in which "intelligence per second" is a thermodynamically bounded
quantity.

The proof is the composition of the chain above: `energy_ops_bound` gives
`N ≤ E / c`, `budget_div_landauerCost` puts `E / c` in quotable form, and the
final step divides through by the positive window length `t`.

A note for assumption-sensitivity analysis: `hP : 0 < P` is stated because a
machine drawing nonpositive power is not a machine, but the derivation never
uses it — the inequality survives `P = 0` (which forces `N ≤ 0`) and even
`P < 0`. The load-bearing hypotheses are `hT`, `hkB`, `hD` and `ht`.

@prooflens.var P meaning="electrical power drawn by the machine" units="W" domain="positive reals" axis="x"
@prooflens.var T meaning="operating temperature of the heat bath" units="K" domain="positive reals"
@prooflens.var kB meaning="Boltzmann constant" units="J/K" domain="positive reals"
@prooflens.var D meaning="useful operations extracted per erased bit" units="dimensionless" domain="positive reals"
@prooflens.var N meaning="number of logical operations performed" units="ops" domain="reals"
@prooflens.var t meaning="length of the operating window" units="s" domain="positive reals"
@prooflens.visual upper-bound-plot
@prooflens.concept "Landauer information-rate bound"
-/
theorem information_rate_bound
    (P T kB D N t : ℝ)
    (hP : 0 < P) (hT : 0 < T) (hkB : 0 < kB) (hD : 0 < D) (ht : 0 < t)
    (hN : N * (kB * T * Real.log 2 / D) ≤ P * t) :
    N / t ≤ P * D / (kB * T * Real.log 2) := by
  have hc : 0 < kB * T * Real.log 2 := mul_pos (mul_pos hkB hT) log_two_pos
  have hN' : N * landauerCost kB T D ≤ energyBudget P t := hN
  have hstep : N ≤ energyBudget P t / landauerCost kB T D :=
    energy_ops_bound P T kB D N t hT hkB hD hN'
  rw [budget_div_landauerCost P t kB T D hkB hT hD] at hstep
  have hmul : N * (kB * T * Real.log 2) ≤ P * t * D := (le_div_iff₀ hc).mp hstep
  rw [div_le_div_iff₀ ht hc]
  nlinarith [hmul]

/-- **A convergence example — and a record of how ProofLens learned to read one.**

The sequence `n ↦ 1 / (n + 1)` converges to `0` as `n` grows without bound.

This declaration entered the corpus as the deliberate *unsupported mathematics*
fixture. Its original docstring asserted that the content "lives in the
interaction between two filters, which the v0.1 renderer has no vocabulary for",
and at the time that was true.

It is no longer true. Measuring ProofLens against a 679-declaration slice of
mathlib found `Filter.Tendsto` to be the single most common shape it could not
read — 44 declarations, more than any other unrecognised head constant — and
that finding motivated first-class limit support: a `limit` proposition kind, a
`Filter.Tendsto` classifier that separates convergence from divergence, and a
`limit-plot` figure. ProofLens now reads this statement as "`n ↦ 1 / (n + 1)`
approaches 0 as its input grows without bound" and classifies it as establishing
a limit.

The history is recorded here rather than deleted because it is the corpus's one
worked example of a coverage gap being measured and then closed. The statement
and its proof are unchanged from the day it was unreadable; only the tooling
moved. The declaration was renamed from `unsupported_tendsto_fixture`, whose name
had become a false description of what it tests.

For the fixture that plays the unsupported role today, see
`energy_cost_injective` below.

@prooflens.var n meaning="sequence index" units="dimensionless" domain="natural numbers" axis="x"
@prooflens.visual limit-plot
@prooflens.concept "convergence of a harmonic sequence"
-/
theorem sequence_limit_example :
    Filter.Tendsto (fun n : ℕ => (1 : ℝ) / (n + 1)) Filter.atTop (nhds 0) :=
  tendsto_one_div_add_atTop_nhds_zero_nat

/-- **Deliberate "unsupported mathematics" fixture.**

The map sending an operation count `N` to the energy that many operations cost,
`N ↦ N * landauerCost kB T D`, is injective: because the per-operation cost is
strictly positive, two workloads of different sizes can never present the same
energy bill. Physically this is what makes the bill a faithful measurement of
the work done — reading the joules back tells you the operation count exactly.

**ProofLens is expected to fail on this, and to fail cleanly.** The head constant
of the proposition is `Function.Injective`, for which no classifier exists today.
There is no bounded quantity, no bound expression, no monotone function and no
filter; the content is a universally quantified implication between equalities,
hidden behind a definition that unfolds to a `∀`. It is not a limit, and it is
not a bound, so none of the supported proposition kinds apply.

The correct behaviour is a clean report that no classifier supports this
statement, accompanied by the full formal structure — the statement, its
hypotheses, its dependencies — so that a reader still gets everything ProofLens
does know. What is *not* acceptable is a plausible-looking wrong picture: the
underlying function here is affine, so a renderer that ignored the
`Function.Injective` head and pattern-matched on the body could easily emit a
monotone-curve figure, which would be answering a question nobody asked.

`Function.Injective` was chosen over the other unrecognised shapes the mathlib
coverage sweep reported because it is adjacent to things ProofLens *does*
support — `strictMono_affine` in `Monotonicity.lean` is one implication away —
which makes it a sharper test of whether classification keys on the proposition's
head or merely on the shape of what is inside it.

No visual annotation is given for this declaration, deliberately: there is no
correct figure to suggest. (The annotation keyword is spelled out nowhere in
this docstring on purpose, so that even a parser matching on substrings rather
than on line starts cannot mistake this paragraph for a request to draw
something.)

@prooflens.var kB meaning="Boltzmann constant" units="J/K" domain="positive reals"
@prooflens.var T meaning="operating temperature of the heat bath" units="K" domain="positive reals"
@prooflens.var D meaning="useful operations extracted per erased bit" units="dimensionless" domain="positive reals"
@prooflens.var N meaning="number of logical operations performed" units="ops" domain="reals"
@prooflens.concept "energy cost determines operation count"
-/
theorem energy_cost_injective (kB T D : ℝ) (hkB : 0 < kB) (hT : 0 < T) (hD : 0 < D) :
    Function.Injective fun N : ℝ => N * landauerCost kB T D := by
  intro a b h
  dsimp only at h
  exact mul_right_cancel₀ (ne_of_gt (landauerCost_pos kB T D hkB hT hD)) h

end ProofLens.Examples
