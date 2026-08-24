import Mathlib.Analysis.SpecialFunctions.Log.Basic
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.FieldSimp

/-!
# Implication

Statements whose *shape* is an implication or a biconditional, rather than a
bound or a monotonicity claim. ProofLens should render these as edges between
propositions — an arrow for `→`, a double arrow for `↔` — rather than as plots.

The file deliberately includes a two-step chain `A → B → C` so that a renderer
has something with internal structure to lay out, and an `Iff` so that the
bidirectional case is covered.
-/

namespace ProofLens.Examples

/-- The budget form of a rate bound implies the divided form. Stated as an
explicit implication (with the antecedent to the right of the colon) rather than
as a hypothesis, so that the conclusion of the theorem *is* an arrow.

@prooflens.var x meaning="achieved operation rate" units="ops/s" domain="reals" axis="y"
@prooflens.var P meaning="available electrical power" units="W" domain="reals" axis="x"
@prooflens.var T meaning="operating temperature" units="K" domain="positive reals"
@prooflens.visual implication-arrow
@prooflens.concept "budget form implies divided form"
-/
theorem budget_implies_rate_bound (x P T : ℝ) (hT : 0 < T) : x * T ≤ P → x ≤ P / T :=
  fun h => (le_div_iff₀ hT).mpr h

/-- A two-step chain `A → B → C`: knowing that the energy budget is `P * t`, and
that the `N` operations fit inside that budget, together give that the
operations fit inside `P * t`.

The two antecedents are genuinely different propositions — an equation and an
inequality — so the dependency graph of this statement is a path of length two,
not a repetition of the same node.

@prooflens.var E meaning="energy actually available to the computation" units="J" domain="reals"
@prooflens.var P meaning="available electrical power" units="W" domain="reals" axis="x"
@prooflens.var t meaning="elapsed wall-clock time" units="s" domain="reals"
@prooflens.var N meaning="operations performed" units="ops" domain="reals" axis="y"
@prooflens.var c meaning="energy cost of one operation" units="J/op" domain="reals"
@prooflens.visual implication-chain
@prooflens.concept "energy budget transfers a bound"
-/
theorem energy_budget_chain (E P t N c : ℝ) : E = P * t → N * c ≤ E → N * c ≤ P * t :=
  fun hE hN => hE ▸ hN

/-- A three-antecedent chain threading a bound through two intermediate
quantities: if `x` is dominated by `y`, `y` by `z`, and `z` by `w`, then `x` is
dominated by `w`. Each arrow consumes exactly one link of the chain.

@prooflens.var x meaning="quantity being bounded" units="dimensionless" domain="reals" axis="y"
@prooflens.var y meaning="first intermediate bound" units="dimensionless" domain="reals"
@prooflens.var z meaning="second intermediate bound" units="dimensionless" domain="reals"
@prooflens.var w meaning="final bound" units="dimensionless" domain="reals" axis="x"
@prooflens.visual implication-chain
@prooflens.concept "transitive chaining of bounds"
-/
theorem le_chain_of_three (x y z w : ℝ) : x ≤ y → y ≤ z → z ≤ w → x ≤ w :=
  fun h₁ h₂ h₃ => h₁.trans (h₂.trans h₃)

/-- The divided and budget forms of a rate bound are in fact *equivalent* when
the divisor is positive; `budget_implies_rate_bound` is only one half of this.

This is the `Iff` fixture: ProofLens should render it as a double arrow and
should be able to project out either direction.

@prooflens.var x meaning="achieved operation rate" units="ops/s" domain="reals" axis="y"
@prooflens.var P meaning="available electrical power" units="W" domain="reals" axis="x"
@prooflens.var T meaning="operating temperature" units="K" domain="positive reals"
@prooflens.visual iff-equivalence
@prooflens.concept "rate bound equivalence"
-/
theorem rate_bound_iff (x P T : ℝ) (hT : 0 < T) : x ≤ P / T ↔ x * T ≤ P :=
  le_div_iff₀ hT

/-- A second biconditional, this time relating a sign condition to an identity:
a real number is nonnegative exactly when it equals its own absolute value.

@prooflens.var x meaning="signed measurement" units="dimensionless" domain="reals" axis="x"
@prooflens.visual iff-equivalence
@prooflens.concept "nonnegativity as an absolute-value identity"
-/
theorem abs_eq_self_iff_nonneg (x : ℝ) : |x| = x ↔ 0 ≤ x :=
  abs_eq_self

/-- An implication whose antecedent is itself an implication, giving the
statement a nested arrow shape: if every rate that fits the budget is bounded by
`B`, and this particular rate fits the budget, then it is bounded by `B`.

Included so that a renderer is tested on a `→` occurring in negative position.

@prooflens.var x meaning="achieved operation rate" units="ops/s" domain="reals" axis="y"
@prooflens.var P meaning="available electrical power" units="W" domain="reals"
@prooflens.var B meaning="asserted rate ceiling" units="ops/s" domain="reals" axis="x"
@prooflens.visual implication-arrow
@prooflens.concept "modus ponens on a rate ceiling"
-/
theorem ceiling_of_budget (x P B : ℝ) (hfits : x ≤ P) : (x ≤ P → x ≤ B) → x ≤ B :=
  fun h => h hfits

end ProofLens.Examples
