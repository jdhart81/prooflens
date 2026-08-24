import Mathlib.Analysis.SpecialFunctions.Log.Basic
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.Positivity

/-!
# Dependency chain

A single coherent derivation, cut into five named steps, each of which is
actually invoked by the next. The mathematics is the classical dynamic-power
argument for CMOS logic: switching power scales as `C · V² · f`, so a fixed
thermal design power caps the clock frequency, and hence caps the number of
cycles available in a window of length `t`.

The point of the file is the *shape* of the proof graph. It is a path

`switching_coefficient_pos → switching_coefficient_ne_zero →
dynamic_power_div_cancel → freq_le_of_power_le → operations_le_of_power_le`

rather than a star of independent lemmas all discharged by the same tactic, so
ProofLens's dependency extraction has real depth to report.
-/

namespace ProofLens.Examples

/-- **Step 1 of 5.** The switching coefficient `C · V²` of a CMOS node is
strictly positive whenever the node has real capacitance and a nonzero supply
rail.

Squaring is what makes the second hypothesis `V ≠ 0` rather than `0 < V`: a
negative rail would serve just as well. Nothing below depends on `V`'s sign.

@prooflens.var C meaning="switched load capacitance" units="F" domain="positive reals"
@prooflens.var V meaning="supply voltage" units="V" domain="nonzero reals" axis="x"
@prooflens.visual positivity-fact
@prooflens.concept "switching coefficient"
-/
theorem switching_coefficient_pos (C V : ℝ) (hC : 0 < C) (hV : V ≠ 0) : 0 < C * V ^ 2 :=
  mul_pos hC (sq_pos_of_ne_zero hV)

/-- **Step 2 of 5.** The switching coefficient is nonzero. Derived from
`switching_coefficient_pos`, because "positive" is the fact we can establish
from physics and "nonzero" is the fact division needs.

@prooflens.var C meaning="switched load capacitance" units="F" domain="positive reals"
@prooflens.var V meaning="supply voltage" units="V" domain="nonzero reals" axis="x"
@prooflens.visual positivity-fact
@prooflens.concept "switching coefficient"
-/
theorem switching_coefficient_ne_zero (C V : ℝ) (hC : 0 < C) (hV : V ≠ 0) :
    C * V ^ 2 ≠ 0 :=
  ne_of_gt (switching_coefficient_pos C V hC hV)

/-- **Step 3 of 5.** Dividing the dynamic power `C · V² · f` by the switching
coefficient recovers the clock frequency. This is the sense in which the
coefficient is the "price per hertz", and it is what licenses reading the
frequency off a power measurement.

Uses `switching_coefficient_ne_zero` to discharge the side condition of
cancellation.

@prooflens.var C meaning="switched load capacitance" units="F" domain="positive reals"
@prooflens.var V meaning="supply voltage" units="V" domain="nonzero reals"
@prooflens.var f meaning="clock frequency" units="Hz" domain="reals" axis="x"
@prooflens.visual functional-relationship
@prooflens.concept "dynamic power law"
-/
theorem dynamic_power_div_cancel (C V f : ℝ) (hC : 0 < C) (hV : V ≠ 0) :
    C * V ^ 2 * f / (C * V ^ 2) = f :=
  mul_div_cancel_left₀ f (switching_coefficient_ne_zero C V hC hV)

/-- **Step 4 of 5.** A thermal design power `Pmax` caps the clock frequency at
`Pmax / (C · V²)`.

The proof rewrites `f` as `C · V² · f / (C · V²)` using
`dynamic_power_div_cancel`, and then compares numerators over the common
positive denominator supplied by `switching_coefficient_pos`.

@prooflens.var C meaning="switched load capacitance" units="F" domain="positive reals"
@prooflens.var V meaning="supply voltage" units="V" domain="nonzero reals"
@prooflens.var f meaning="clock frequency" units="Hz" domain="reals" axis="y"
@prooflens.var Pmax meaning="thermal design power" units="W" domain="reals" axis="x"
@prooflens.visual upper-bound-plot
@prooflens.concept "thermally limited clock frequency"
-/
theorem freq_le_of_power_le (C V f Pmax : ℝ) (hC : 0 < C) (hV : V ≠ 0)
    (h : C * V ^ 2 * f ≤ Pmax) : f ≤ Pmax / (C * V ^ 2) := by
  have hpos : 0 < C * V ^ 2 := switching_coefficient_pos C V hC hV
  have hcancel : C * V ^ 2 * f / (C * V ^ 2) = f := dynamic_power_div_cancel C V f hC hV
  calc f = C * V ^ 2 * f / (C * V ^ 2) := hcancel.symm
    _ ≤ Pmax / (C * V ^ 2) := by
        rw [div_le_div_iff₀ hpos hpos]
        nlinarith

/-- **Step 5 of 5, the conclusion of the chain.** In a window of length `t`, a
thermally limited machine can retire at most `Pmax / (C · V²) · t` cycles.

This is `freq_le_of_power_le` transported along `N = f · t`: the frequency cap
becomes a cycle-count cap by multiplying through by the nonnegative window
length. Every earlier lemma in the file is reachable from this one.

@prooflens.var C meaning="switched load capacitance" units="F" domain="positive reals"
@prooflens.var V meaning="supply voltage" units="V" domain="nonzero reals"
@prooflens.var f meaning="clock frequency" units="Hz" domain="reals"
@prooflens.var Pmax meaning="thermal design power" units="W" domain="reals" axis="x"
@prooflens.var t meaning="length of the observation window" units="s" domain="nonnegative reals"
@prooflens.var N meaning="clock cycles retired in the window" units="cycles" domain="reals" axis="y"
@prooflens.visual upper-bound-plot
@prooflens.concept "thermally limited cycle count"
-/
theorem operations_le_of_power_le (C V f Pmax t N : ℝ) (hC : 0 < C) (hV : V ≠ 0)
    (ht : 0 ≤ t) (h : C * V ^ 2 * f ≤ Pmax) (hN : N = f * t) :
    N ≤ Pmax / (C * V ^ 2) * t := by
  have hf : f ≤ Pmax / (C * V ^ 2) := freq_le_of_power_le C V f Pmax hC hV h
  rw [hN]
  exact mul_le_mul_of_nonneg_right hf ht

end ProofLens.Examples
