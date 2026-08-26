import type { Claim, Rule } from "@prooflens/epistemics";
import type {
  FilterSpec,
  MathExpression,
  MathHypothesis,
  MathProposition,
} from "@prooflens/math-ir";
import type { Direction } from "./signs.js";

export type ClassificationKind =
  | "property"
  | "conjunction"
  | "membership"
  | "limit"
  | "existence"
  | "positivity"
  | "distinctness"
  | "upper-bound"
  | "lower-bound"
  | "equality"
  | "functional-relationship"
  | "monotonicity"
  | "implication"
  | "equivalence"
  | "assumption-sensitivity"
  | "trust"
  | "definition"
  | "unsupported";

export interface UpperBoundPayload {
  boundedQuantity: MathExpression;
  bound: MathExpression;
  strict: boolean;
  /**
   * Every inequality has two readings: `a ≤ b` bounds `a` above and `b` below.
   * Both are true and ProofLens reports both, but only one is what a reader
   * means by "the theorem bounds x". `natural` marks that one.
   *
   * Without this, `0 < log 2` presents as "0 is bounded above by log 2", which
   * is correct and useless.
   */
  natural: boolean;
  /** How the bound responds to each free parameter, where that is determinable. */
  sensitivity: Array<{ variableId: string; symbol: string; direction: Direction }>;
}

/** A lower bound carries exactly the same information as an upper one. */
export type LowerBoundPayload = UpperBoundPayload;

export interface EqualityPayload {
  left: MathExpression;
  right: MathExpression;
  /** True when the left side is a single variable defined by the right side. */
  functional: boolean;
}

/** `0 < e` / `0 ≤ e` / `e < 0`: a sign fact rather than a bound between quantities. */
export interface PositivityPayload {
  quantity: MathExpression;
  strict: boolean;
  /**
   * Which side of zero the quantity lies on. Carrying this is not optional:
   * a figure that renders a negative fact as a positive one is precisely the
   * kind of confident wrong picture ProofLens exists to prevent.
   */
  sense: "positive" | "negative";
}

/** `a ≠ b`. */
export interface DistinctnessPayload {
  left: MathExpression;
  right: MathExpression;
}

export interface MonotonicityPayload {
  direction: "increasing" | "decreasing";
  strict: boolean;
  subject: MathExpression | null;
  predicateName: string;
}

export interface LimitPayload {
  subject: MathExpression;
  source: FilterSpec;
  target: FilterSpec;
  /** True when the limit is a finite value rather than a divergence. */
  convergent: boolean;
}

export interface PropertyPayload {
  /** The Lean constant, e.g. `Continuous`. */
  name: string;
  /** ProofLens's phrasing for it, e.g. "continuous". */
  label: string;
  subject: MathExpression | null;
  args: MathExpression[];
}

export interface ConjunctionPayload {
  conjuncts: MathProposition[];
}

export interface MembershipPayload {
  element: MathExpression;
  collection: MathExpression;
}

export interface ExistencePayload {
  binder: string;
  body: MathProposition;
}

export interface ImplicationPayload {
  antecedent: MathProposition;
  consequent: MathProposition;
}

export interface AssumptionSensitivityPayload {
  used: MathHypothesis[];
  /** Hypotheses that occur nowhere in the elaborated proof term. */
  unusedInProof: MathHypothesis[];
  proofTermAvailable: boolean;
}

export interface TrustPayload {
  usesSorry: boolean;
  unusualAxioms: string[];
}

export interface UnsupportedPayload {
  reason: string;
  head: string | null;
}

export type ClassificationPayload =
  | { kind: "property"; data: PropertyPayload }
  | { kind: "conjunction"; data: ConjunctionPayload }
  | { kind: "membership"; data: MembershipPayload }
  | { kind: "limit"; data: LimitPayload }
  | { kind: "existence"; data: ExistencePayload }
  | { kind: "positivity"; data: PositivityPayload }
  | { kind: "distinctness"; data: DistinctnessPayload }
  | { kind: "upper-bound"; data: UpperBoundPayload }
  | { kind: "lower-bound"; data: LowerBoundPayload }
  | { kind: "equality"; data: EqualityPayload }
  | { kind: "functional-relationship"; data: EqualityPayload }
  | { kind: "monotonicity"; data: MonotonicityPayload }
  | { kind: "implication"; data: ImplicationPayload }
  | { kind: "equivalence"; data: ImplicationPayload }
  | { kind: "assumption-sensitivity"; data: AssumptionSensitivityPayload }
  | { kind: "trust"; data: TrustPayload }
  | {
      kind: "definition";
      data: { name: string; body: MathExpression | null; bodyDisplay: string | null };
    }
  | { kind: "unsupported"; data: UnsupportedPayload };

/**
 * One classifier firing.
 *
 * `rationale` is the sentence the provenance panel shows when a user asks why
 * ProofLens is telling them this. It must name the concrete evidence, not the
 * rule's general description.
 */
export interface Classification {
  rule: Rule;
  payload: ClassificationPayload;
  claim: Claim<ClassificationPayload>;
  rationale: string;
}
