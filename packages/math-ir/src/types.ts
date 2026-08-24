import type { Claim, EpistemicStatus, Provenance } from "@prooflens/epistemics";

/** Relations ProofLens understands well enough to reason about. */
export type RelationKind =
  | "equal"
  | "not-equal"
  | "less-than"
  | "less-than-or-equal"
  | "greater-than"
  | "greater-than-or-equal"
  | "equivalent";

export type OperatorKind = "add" | "sub" | "mul" | "div" | "pow" | "mod" | "neg" | "inv" | "abs";

/**
 * A mathematical expression.
 *
 * Note the `opaque` case. ProofLens is required to say "I can see the structure
 * but I cannot name it" rather than inventing meaning to satisfy a renderer.
 * Every stage downstream must handle `opaque` gracefully.
 */
export type MathExpression =
  | { kind: "variable"; id: string; symbol: string; path: string }
  | { kind: "number"; value: number; display: string; path: string }
  | { kind: "constant"; name: string; display: string; path: string }
  | {
      kind: "operator";
      op: OperatorKind;
      symbol: string;
      args: MathExpression[];
      path: string;
    }
  | { kind: "application"; head: string; display: string; args: MathExpression[]; path: string }
  | { kind: "lambda"; parameter: string; body: MathExpression; path: string }
  | { kind: "opaque"; head: string | null; display: string; arity: number; path: string };

/** A named property applied to a subject, e.g. `Monotone f`. */
export type PredicateKind =
  | "monotone"
  | "strictly-monotone"
  | "antitone"
  | "strictly-antitone"
  | "positive"
  | "nonnegative"
  | "other";

export type MathProposition =
  | {
      kind: "relation";
      relation: RelationKind;
      lhs: MathExpression;
      rhs: MathExpression;
      path: string;
    }
  | {
      kind: "predicate";
      predicate: PredicateKind;
      name: string;
      subject: MathExpression | null;
      args: MathExpression[];
      path: string;
    }
  | { kind: "implication"; antecedent: MathProposition; consequent: MathProposition; path: string }
  | { kind: "opaque"; head: string | null; display: string; path: string };

/**
 * Author-declared meaning for a symbol.
 *
 * Formal notation does not record that `P` is watts. A human has to say so, and
 * when they do it is their claim, not Lean's — hence `interpreted`, never
 * `verified`.
 */
export interface SemanticAnnotation {
  target: string;
  meaning?: string;
  units?: string;
  domain?: string;
  axis?: string;
  role?: string;
}

export interface MathVariable {
  id: string;
  symbol: string;
  /** Lean's rendering of the binder's type, e.g. `ℝ`. */
  typeDisplay: string;
  binderInfo: string;
  annotation: SemanticAnnotation | null;
}

export interface MathHypothesis {
  id: string;
  symbol: string;
  proposition: MathProposition;
  display: string;
  /** Occurrence analysis carried forward from the Formal IR. */
  usage: {
    occursInProofTerm: boolean;
    occursInLaterBinderTypes: boolean;
    occursInConclusion: boolean;
    proofTermAvailable: boolean;
    unusedInProof: boolean;
  };
}

/** What the declaration's proof ultimately rests on. */
export interface TrustBase {
  axioms: string[];
  unusualAxioms: string[];
  usesSorry: boolean;
  proofTermAvailable: boolean;
}

export interface TheoremIR {
  id: string;
  name: string;
  namespace: string;
  kind: string;
  /** Docstring prose with ProofLens annotation lines removed. */
  documentation: string | null;
  variables: MathVariable[];
  hypotheses: MathHypothesis[];
  conclusion: Claim<MathProposition>;
  conclusionDisplay: string;
  /**
   * What a definition unfolds to, lowered. `null` for theorems.
   *
   * Without this a definition is just a name with a type, and every figure that
   * mentions it is an opaque box. With it, `landauerCost` becomes
   * `kB · T · log(2) / D` and the concept is legible.
   */
  definitionBody: { expression: MathExpression; display: string } | null;
  statementDisplay: string;
  dependencies: string[];
  trust: TrustBase;
  annotations: SemanticAnnotation[];
  /** Author's `@prooflens.visual` hint, if any. */
  suggestedVisual: string | null;
  /** Author's `@prooflens.concept` name, if any. */
  concept: string | null;
  /**
   * The best epistemic status any claim about this declaration may carry.
   * `verified` normally; degraded when the proof used `sorry`.
   */
  ceiling: EpistemicStatus;
  provenance: Provenance;
}

export interface MathIRDocument {
  mathIRVersion: string;
  system: string;
  notationFidelity: "notation" | "raw";
  theorems: TheoremIR[];
}

export const MATH_IR_VERSION = "0.1.0";
