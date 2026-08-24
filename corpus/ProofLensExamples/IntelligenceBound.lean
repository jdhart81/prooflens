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

The file closes with `unsupported_tendsto_fixture`, a statement deliberately
outside what ProofLens v0.1 is expected to visualise.
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

/-- **Deliberate "unsupported mathematics" fixture.**

ProofLens v0.1 is *not* expected to visualise this. The statement is a
convergence claim: a filter-level assertion that the sequence `1 / (n + 1)` tends
to `0` along `atTop`. There is no bounded quantity, no bound expression, and no
monotone function to plot; the content lives in the interaction between two
filters, which the v0.1 renderer has no vocabulary for.

It is included precisely so that the corpus contains a case where the correct
behaviour is a clean "cannot visualise this" rather than a wrong picture. It
still compiles and is fully proved.

@prooflens.var n meaning="sequence index" units="dimensionless" domain="natural numbers"
@prooflens.concept "convergence of a harmonic sequence"
-/
theorem unsupported_tendsto_fixture :
    Filter.Tendsto (fun n : ℕ => (1 : ℝ) / (n + 1)) Filter.atTop (nhds 0) :=
  tendsto_one_div_add_atTop_nhds_zero_nat

end ProofLens.Examples
