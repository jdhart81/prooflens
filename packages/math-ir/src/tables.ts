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
  "Real.rpow": { display: "rpow", valueArity: 2 },
  "Nat.succ": { display: "succ", valueArity: 1 },
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
};

export const PREDICATES: Record<string, { predicate: PredicateKind; label: string } & Signature> = {
  Monotone: { predicate: "monotone", label: "monotone", valueArity: 1 },
  StrictMono: { predicate: "strictly-monotone", label: "strictly increasing", valueArity: 1 },
  Antitone: { predicate: "antitone", label: "antitone", valueArity: 1 },
  StrictAnti: { predicate: "strictly-antitone", label: "strictly decreasing", valueArity: 1 },
  MonotoneOn: { predicate: "monotone", label: "monotone on a set", valueArity: 2 },
  AntitoneOn: { predicate: "antitone", label: "antitone on a set", valueArity: 2 },
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
