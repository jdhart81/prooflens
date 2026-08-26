import type { OperatorKind, PredicateKind, RelationKind } from "./types.js";

/**
 * Lean constant → mathematical meaning.
 *
 * These tables are the entire "semantic analysis" of v0.1, and keeping them as
 * data rather than code is deliberate: they are the thing that grows as
 * ProofLens learns more mathematics, and each entry is independently testable.
 *
 * `valueArity` counts the *trailing* arguments that carry mathematics. Lean puts
 * the carrier type and typeclass instances first, so `LE.le ℝ inst x y` has four
 * arguments of which the last two are the ones a reader cares about.
 */
export interface Signature {
  valueArity: number;
}

export const RELATIONS: Record<string, { relation: RelationKind } & Signature> = {
  Eq: { relation: "equal", valueArity: 2 },
  Ne: { relation: "not-equal", valueArity: 2 },
  "LE.le": { relation: "less-than-or-equal", valueArity: 2 },
  "LT.lt": { relation: "less-than", valueArity: 2 },
  "GE.ge": { relation: "greater-than-or-equal", valueArity: 2 },
  "GT.gt": { relation: "greater-than", valueArity: 2 },
  Iff: { relation: "equivalent", valueArity: 2 },
};

export const BINARY_OPERATORS: Record<string, { op: OperatorKind; symbol: string } & Signature> = {
  "HAdd.hAdd": { op: "add", symbol: "+", valueArity: 2 },
  "HSub.hSub": { op: "sub", symbol: "−", valueArity: 2 },
  "HMul.hMul": { op: "mul", symbol: "·", valueArity: 2 },
  "HDiv.hDiv": { op: "div", symbol: "/", valueArity: 2 },
  "HPow.hPow": { op: "pow", symbol: "^", valueArity: 2 },
  "HMod.hMod": { op: "mod", symbol: "%", valueArity: 2 },
};

export const UNARY_OPERATORS: Record<string, { op: OperatorKind; symbol: string } & Signature> = {
  "Neg.neg": { op: "neg", symbol: "−", valueArity: 1 },
  "Inv.inv": { op: "inv", symbol: "⁻¹", valueArity: 1 },
  abs: { op: "abs", symbol: "abs", valueArity: 1 },
};

/** Named functions with a conventional rendering. */
export const NAMED_FUNCTIONS: Record<string, { display: string } & Signature> = {
  "Real.sqrt": { display: "√", valueArity: 1 },
  "Real.log": { display: "log", valueArity: 1 },
  "Real.exp": { display: "exp", valueArity: 1 },
  "Real.sin": { display: "sin", valueArity: 1 },
  "Real.cos": { display: "cos", valueArity: 1 },
  "Real.tan": { display: "tan", valueArity: 1 },
  "Real.sinh": { display: "sinh", valueArity: 1 },
  "Real.cosh": { display: "cosh", valueArity: 1 },
  "Real.tanh": { display: "tanh", valueArity: 1 },
  "Real.arctan": { display: "arctan", valueArity: 1 },
  "Real.rpow": { display: "rpow", valueArity: 2 },
  "Real.toNNReal": { display: "toNNReal", valueArity: 1 },
  "Real.nnabs": { display: "nnabs", valueArity: 1 },
  "NNReal.sqrt": { display: "√", valueArity: 1 },
  "Nat.succ": { display: "succ", valueArity: 1 },
  "Nat.sqrt": { display: "⌊√⌋", valueArity: 1 },
  "Nat.factorial": { display: "factorial", valueArity: 1 },
  // Aggregations. Rendered as named applications rather than big-operator
  // notation: `∑(s, i ↦ f i)` is honest about the two arguments, where a bare
  // `∑` would hide which set is being summed over.
  "Finset.sum": { display: "∑", valueArity: 2 },
  "Finset.prod": { display: "∏", valueArity: 2 },
  "Finset.card": { display: "card", valueArity: 1 },
  tsum: { display: "∑'", valueArity: 1 },
  "Max.max": { display: "max", valueArity: 2 },
  "Min.min": { display: "min", valueArity: 2 },
  "Dist.dist": { display: "dist", valueArity: 2 },
  "EDist.edist": { display: "edist", valueArity: 2 },
  "Set.indicator": { display: "indicator", valueArity: 2 },
  "Nat.floor": { display: "⌊·⌋", valueArity: 1 },
  "Nat.ceil": { display: "⌈·⌉", valueArity: 1 },
  "Int.floor": { display: "⌊·⌋", valueArity: 1 },
  "Int.ceil": { display: "⌈·⌉", valueArity: 1 },
  cmp: { display: "cmp", valueArity: 2 },
  ite: { display: "if", valueArity: 3 },
  // Order duality is a genuine change of viewpoint, not a no-op, so it is named
  // rather than made transparent. Hiding it would silently turn a statement
  // about the dual order into a statement about the original.
  "OrderDual.toDual": { display: "toDual", valueArity: 1 },
  "OrderDual.ofDual": { display: "ofDual", valueArity: 1 },
  // Intervals. They appear constantly as the set argument of `MonotoneOn` and
  // friends, so leaving them opaque made otherwise-readable statements unreadable.
  "Set.Icc": { display: "[·, ·]", valueArity: 2 },
  "Set.Ico": { display: "[·, ·)", valueArity: 2 },
  "Set.Ioc": { display: "(·, ·]", valueArity: 2 },
  "Set.Ioo": { display: "(·, ·)", valueArity: 2 },
  "Set.Iic": { display: "(−∞,·]", valueArity: 1 },
  "Set.Iio": { display: "(−∞,·)", valueArity: 1 },
  "Set.Ici": { display: "[·,∞)", valueArity: 1 },
  "Set.Ioi": { display: "(·,∞)", valueArity: 1 },
  "Set.univ": { display: "univ", valueArity: 0 },
};

/**
 * Constants whose interesting argument sits at a fixed index rather than at the
 * end.
 *
 * Most Lean operations put their carrier type and instances first and their
 * mathematics last, which is what `valueArity` exploits. These do not: a
 * coercion or a composition can itself be applied to further arguments, so the
 * function sits at a known index with its own arguments trailing behind it.
 *
 * The indices are Lean-version-sensitive by nature. Every use is guarded on the
 * argument count, so a signature change degrades to `opaque` rather than
 * producing a confidently wrong reading.
 */
export const POSITIONAL: Record<string, { kind: "coercion" | "composition"; index: number }> = {
  // `DFunLike.coe {F α β} [inst] (f : F) : ∀ a, β a`
  "DFunLike.coe": { kind: "coercion", index: 4 },
  "FunLike.coe": { kind: "coercion", index: 4 },
  // `Function.comp {α β γ} (f : β → γ) (g : α → β) : α → γ`
  "Function.comp": { kind: "composition", index: 3 },
};

/**
 * Filters ProofLens can describe in words.
 *
 * `Filter.Tendsto f l₁ l₂` was the single most common statement shape in the
 * analysis parts of mathlib that ProofLens could not read. Naming the filters is
 * what turns it from an opaque term into "f approaches L as its input grows
 * without bound".
 */
export const FILTERS: Record<
  string,
  {
    kind: "at-top" | "at-bot" | "neighbourhood" | "punctured" | "other";
    label: string;
    pointIndex: number | null;
  }
> = {
  "Filter.atTop": { kind: "at-top", label: "grows without bound", pointIndex: null },
  "Filter.atBot": { kind: "at-bot", label: "decreases without bound", pointIndex: null },
  nhds: { kind: "neighbourhood", label: "approaches", pointIndex: -1 },
  nhdsWithin: { kind: "punctured", label: "approaches within a set", pointIndex: -2 },
  "Filter.cofinite": { kind: "other", label: "outside any finite set", pointIndex: null },
  "Filter.cocompact": { kind: "other", label: "outside any compact set", pointIndex: null },
};

/**
 * Constants that should be seen through rather than displayed: coercions and
 * the `OfNat` machinery around numeric literals.
 */
export const TRANSPARENT: Record<string, { argIndex: number }> = {
  "Nat.cast": { argIndex: -1 },
  "Int.cast": { argIndex: -1 },
  "Rat.cast": { argIndex: -1 },
  "NNReal.toReal": { argIndex: -1 },
  "OfNat.ofNat": { argIndex: 1 },
  "OfScientific.ofScientific": { argIndex: 1 },
  // `decide p` is `p` wearing a `Decidable` hat.
  "Decidable.decide": { argIndex: 0 },
};

export const PREDICATES: Record<string, { predicate: PredicateKind; label: string } & Signature> = {
  Monotone: { predicate: "monotone", label: "monotone", valueArity: 1 },
  StrictMono: { predicate: "strictly-monotone", label: "strictly increasing", valueArity: 1 },
  Antitone: { predicate: "antitone", label: "antitone", valueArity: 1 },
  StrictAnti: { predicate: "strictly-antitone", label: "strictly decreasing", valueArity: 1 },
  MonotoneOn: { predicate: "monotone", label: "monotone on a set", valueArity: 2 },
  AntitoneOn: { predicate: "antitone", label: "antitone on a set", valueArity: 2 },
  StrictMonoOn: {
    predicate: "strictly-monotone",
    label: "strictly increasing on a set",
    valueArity: 2,
  },
  StrictAntiOn: {
    predicate: "strictly-antitone",
    label: "strictly decreasing on a set",
    valueArity: 2,
  },

  // Named properties ProofLens can *read* without claiming to interpret. Being
  // in this table is an explicit statement that ProofLens recognises the
  // property; anything absent stays `unsupported`, which is the honest answer
  // and keeps the unsupported-mathematics backlog meaningful.
  Summable: { predicate: "other", label: "summable", valueArity: 1 },
  HasSum: { predicate: "other", label: "has a sum", valueArity: 2 },
  Continuous: { predicate: "other", label: "continuous", valueArity: 1 },
  ContinuousAt: { predicate: "other", label: "continuous at a point", valueArity: 2 },
  ContinuousOn: { predicate: "other", label: "continuous on a set", valueArity: 2 },
  ContinuousWithinAt: { predicate: "other", label: "continuous within a set", valueArity: 3 },
  CauchySeq: { predicate: "other", label: "a Cauchy sequence", valueArity: 1 },
  Differentiable: { predicate: "other", label: "differentiable", valueArity: 1 },
  DifferentiableAt: { predicate: "other", label: "differentiable at a point", valueArity: 2 },
  HasDerivAt: { predicate: "other", label: "has a derivative at a point", valueArity: 3 },
  "Real.HolderConjugate": { predicate: "other", label: "Hölder conjugate", valueArity: 2 },
  "Set.InjOn": { predicate: "other", label: "injective on a set", valueArity: 2 },
  "Set.SurjOn": { predicate: "other", label: "surjective onto a set", valueArity: 3 },
  IsLUB: { predicate: "other", label: "a least upper bound", valueArity: 2 },
  IsGLB: { predicate: "other", label: "a greatest lower bound", valueArity: 2 },
  IsMax: { predicate: "other", label: "a maximum", valueArity: 1 },
  IsMin: { predicate: "other", label: "a minimum", valueArity: 1 },
};

/** Human phrasing for each relation, used by the explanation engine. */
export const RELATION_PHRASE: Record<RelationKind, string> = {
  equal: "is equal to",
  "not-equal": "is not equal to",
  "less-than": "is strictly less than",
  "less-than-or-equal": "is at most",
  "greater-than": "is strictly greater than",
  "greater-than-or-equal": "is at least",
  equivalent: "holds exactly when",
};

export const RELATION_SYMBOL: Record<RelationKind, string> = {
  equal: "=",
  "not-equal": "≠",
  "less-than": "<",
  "less-than-or-equal": "≤",
  "greater-than": ">",
  "greater-than-or-equal": "≥",
  equivalent: "↔",
};
