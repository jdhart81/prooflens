import Mathlib.Order.Monotone.Basic
import Mathlib.Analysis.SpecialFunctions.Exp
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Positivity

/-!
# Monotonicity

Statements built from mathlib's real `Monotone`, `StrictMono` and `Antitone`
predicates. These are the fixtures for ProofLens's monotonicity renderer: the
conclusion is a property of a *function*, not of a point, so the natural picture
is a curve rather than a shaded half-line.

The last group applies `Monotone` to a named `def` instead of a lambda, so that
the concept graph has a node for the function itself.
-/

namespace ProofLens.Examples

/-- An affine response `x ↦ a * x + b` is monotone as soon as its slope is
nonnegative. The intercept `b` is unconstrained: shifting a curve vertically
cannot change its ordering behaviour.

@prooflens.var a meaning="slope of the affine response" units="output units per input unit" domain="nonnegative reals"
@prooflens.var b meaning="intercept, the response at zero input" units="output units" domain="reals"
@prooflens.var x meaning="input drive level" units="input units" domain="reals" axis="x"
@prooflens.visual monotone-curve
@prooflens.concept "monotone affine response"
-/
theorem monotone_affine (a b : ℝ) (ha : 0 ≤ a) : Monotone fun x : ℝ => a * x + b := by
  intro x y hxy
  dsimp only
  nlinarith

/-- Strengthening the slope hypothesis from `0 ≤ a` to `0 < a` upgrades the
conclusion from `Monotone` to `StrictMono`: distinct inputs now have distinct
responses, so the affine map is injective and invertible on its range.

@prooflens.var a meaning="slope of the affine response" units="output units per input unit" domain="positive reals"
@prooflens.var b meaning="intercept, the response at zero input" units="output units" domain="reals"
@prooflens.var x meaning="input drive level" units="input units" domain="reals" axis="x"
@prooflens.visual monotone-curve
@prooflens.concept "strictly monotone affine response"
-/
theorem strictMono_affine (a b : ℝ) (ha : 0 < a) : StrictMono fun x : ℝ => a * x + b := by
  intro x y hxy
  dsimp only
  nlinarith

/-- With a nonpositive slope the same affine family is antitone: increasing the
input can only decrease the response. This is the reflected counterpart of
`monotone_affine`, and the two together cover every affine map.

@prooflens.var a meaning="slope of the affine response" units="output units per input unit" domain="nonpositive reals"
@prooflens.var b meaning="intercept, the response at zero input" units="output units" domain="reals"
@prooflens.var x meaning="input drive level" units="input units" domain="reals" axis="x"
@prooflens.visual antitone-curve
@prooflens.concept "antitone affine response"
-/
theorem antitone_affine (a b : ℝ) (ha : a ≤ 0) : Antitone fun x : ℝ => a * x + b := by
  intro x y hxy
  dsimp only
  nlinarith

/-- A named model of the throughput a machine sustains at clock frequency `f`:
`throughput ipc f = ipc * f`, with `ipc` the instructions retired per clock.

Naming the function (rather than writing a lambda at each use site) gives
ProofLens a stable concept node to hang the monotonicity results on.

@prooflens.var ipc meaning="instructions retired per clock cycle" units="ops/cycle" domain="reals"
@prooflens.var f meaning="clock frequency" units="Hz" domain="reals" axis="x"
@prooflens.visual functional-relationship
@prooflens.concept "throughput model"
-/
def throughput (ipc : ℝ) (f : ℝ) : ℝ := ipc * f

/-- Throughput is monotone in clock frequency whenever the machine retires a
nonnegative number of instructions per cycle — which it always does. Stated
against the named `throughput` def rather than a lambda.

@prooflens.var ipc meaning="instructions retired per clock cycle" units="ops/cycle" domain="nonnegative reals"
@prooflens.var f meaning="clock frequency" units="Hz" domain="reals" axis="x"
@prooflens.visual monotone-curve
@prooflens.concept "throughput is monotone in frequency"
-/
theorem monotone_throughput (ipc : ℝ) (hipc : 0 ≤ ipc) : Monotone (throughput ipc) := by
  intro x y hxy
  unfold throughput
  nlinarith

/-- Strict monotonicity of throughput for a machine that actually retires work
(`0 < ipc`): every frequency increase buys strictly more throughput.

@prooflens.var ipc meaning="instructions retired per clock cycle" units="ops/cycle" domain="positive reals"
@prooflens.var f meaning="clock frequency" units="Hz" domain="reals" axis="x"
@prooflens.visual monotone-curve
@prooflens.concept "throughput is strictly monotone in frequency"
-/
theorem strictMono_throughput (ipc : ℝ) (hipc : 0 < ipc) : StrictMono (throughput ipc) := by
  intro x y hxy
  unfold throughput
  nlinarith

/-- A monotonicity fact about a genuinely nonlinear mathlib function: the real
exponential is strictly monotone. Useful as a contrast to the affine fixtures,
whose curves are straight lines.

@prooflens.var x meaning="exponent" units="dimensionless" domain="reals" axis="x"
@prooflens.visual monotone-curve
@prooflens.concept "exponential growth is strictly monotone"
-/
theorem strictMono_exp : StrictMono Real.exp :=
  Real.exp_strictMono

end ProofLens.Examples
