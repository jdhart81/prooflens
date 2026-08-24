import Mathlib.Analysis.SpecialFunctions.Sqrt
import Mathlib.Analysis.SpecialFunctions.Log.Basic

/-!
# Bounds

Upper- and lower-bound statements of the kind ProofLens is meant to render as
one-dimensional bound plots: a bounded quantity on one side of `≤`, a bound
expression built out of physically meaningful parameters on the other.

This file also carries the two *assumption-sensitivity fixtures*
(`simple_upper_bound` and `div_upper_bound`), which are deliberately paired so
that a tool can be tested on its ability to tell a load-bearing hypothesis from
a decorative one.
-/

namespace ProofLens.Examples

-- The unused-variable linter is silenced for the next declaration because the
-- unused hypotheses are the whole point of that fixture.
set_option linter.unusedVariables false in
/-- A power-limited upper bound on a rate, stated with two hypotheses that the
proof never touches.

**This redundancy is intentional.** The proof term is literally `h`; `hP` and
`hT` are stated but unused. This declaration is the fixture for ProofLens's
assumption-sensitivity analysis: a correct analysis must report that `hP` and
`hT` do not participate in the derivation, even though they are physically
natural things to assume about a power and a temperature. Compare
`div_upper_bound`, where the hypotheses genuinely are used.

@prooflens.var x meaning="achieved operation rate" units="ops/s" domain="reals" axis="y"
@prooflens.var P meaning="available electrical power" units="W" domain="positive reals" axis="x"
@prooflens.var T meaning="operating temperature" units="K" domain="positive reals"
@prooflens.visual upper-bound-plot
@prooflens.concept "power-limited rate bound"
-/
theorem simple_upper_bound (x P T : ℝ) (hP : 0 < P) (hT : 0 < T) (h : x ≤ P / T) :
    x ≤ P / T :=
  h

/-- The same shape of conclusion as `simple_upper_bound`, but here the
hypotheses do real work: `hT` is what licenses dividing the budget inequality
`x * T ≤ P` through by `T`.

This is the contrast fixture for `simple_upper_bound`. Removing `hT` makes the
statement false (take `T < 0`), so an assumption-sensitivity analysis must mark
`hT` as load-bearing.

@prooflens.var x meaning="achieved operation rate" units="ops/s" domain="reals" axis="y"
@prooflens.var P meaning="available electrical power" units="W" domain="reals" axis="x"
@prooflens.var T meaning="operating temperature" units="K" domain="positive reals"
@prooflens.visual upper-bound-plot
@prooflens.concept "power-limited rate bound"
-/
theorem div_upper_bound (x P T : ℝ) (hT : 0 < T) (h : x * T ≤ P) : x ≤ P / T :=
  (le_div_iff₀ hT).mpr h

/-- A lower bound: the quantity `x` is bounded from below by `A / B`, given that
`x` scaled by the positive factor `B` already dominates `A`.

Physically: if a channel delivers at least `A` bits in a window of length `B`,
its rate `x` is at least `A / B`.

@prooflens.var x meaning="achieved channel rate" units="bit/s" domain="reals" axis="y"
@prooflens.var A meaning="bits that must be delivered" units="bit" domain="reals" axis="x"
@prooflens.var B meaning="length of the transmission window" units="s" domain="positive reals"
@prooflens.visual lower-bound-plot
@prooflens.concept "minimum sustained rate"
-/
theorem simple_lower_bound (x A B : ℝ) (hB : 0 < B) (h : A ≤ x * B) : A / B ≤ x :=
  (div_le_iff₀ hB).mpr h

/-- A bound whose bound *expression* is a nontrivial application rather than a
single arithmetic operation: the magnitude of a sum of two signals is at most
the sum of their magnitudes.

Included so that ProofLens is exercised on a right-hand side that is a
composition of function applications (`|·| + |·|`), not just `P / T`.

@prooflens.var a meaning="first signal amplitude" units="V" domain="reals" axis="x"
@prooflens.var b meaning="second signal amplitude" units="V" domain="reals" axis="y"
@prooflens.visual upper-bound-plot
@prooflens.concept "triangle inequality for amplitudes"
-/
theorem abs_upper_bound (a b : ℝ) : |a + b| ≤ |a| + |b| :=
  abs_add_le a b

/-- A second nontrivial bound expression: the square root of a nonnegative
quantity never exceeds its arithmetic mean with one. This is the AM–GM
inequality specialised to `√x = √(x · 1)`.

@prooflens.var x meaning="normalised signal energy" units="dimensionless" domain="nonnegative reals" axis="x"
@prooflens.visual upper-bound-plot
@prooflens.concept "arithmetic-geometric mean bound"
-/
theorem sqrt_upper_bound (x : ℝ) (hx : 0 ≤ x) : Real.sqrt x ≤ (x + 1) / 2 := by
  nlinarith [Real.sq_sqrt hx, Real.sqrt_nonneg x, sq_nonneg (Real.sqrt x - 1)]

/-- A functional relationship rather than an inequality: the sustained rate `R`
is exactly the operation count `N` divided by the elapsed time `t`.

The left-hand side is a bare variable and the right-hand side a compound
expression, which is the shape ProofLens should recognise as "`R` is a function
of `N` and `t`" and offer to plot as a surface or a family of curves.

@prooflens.var R meaning="sustained operation rate" units="ops/s" domain="reals" axis="y"
@prooflens.var N meaning="operations completed" units="ops" domain="reals" axis="x"
@prooflens.var t meaning="elapsed wall-clock time" units="s" domain="nonzero reals"
@prooflens.visual functional-relationship
@prooflens.concept "rate as count per unit time"
-/
theorem rate_eq_count_div_time (R N t : ℝ) (ht : t ≠ 0) (h : N = R * t) : R = N / t := by
  rw [h]
  field_simp

end ProofLens.Examples
