/**
 * Hand-built MathIR fixtures.
 *
 * The classifier's contract is with MathIR, not with Lean, so the cases that
 * probe a single rule are constructed directly. Corpus-backed assertions live
 * alongside them; when both fail you can tell which layer moved.
 */
import { derive, type Claim } from "@prooflens/epistemics";
import {
  MATH_IR_RULES,
  renderExpression,
  renderProposition,
  type MathExpression,
  type MathHypothesis,
  type MathProposition,
  type MathVariable,
  type RelationKind,
  type OperatorKind,
  type PredicateKind,
  type TheoremIR,
} from "@prooflens/math-ir";

export function v(symbol: string, id = `id:${symbol}`): MathExpression {
  return { kind: "variable", id, symbol, path: `path:${symbol}` };
}

export function num(value: number): MathExpression {
  return { kind: "number", value, display: String(value), path: `path:${value}` };
}

const OPERATOR_SYMBOL: Record<OperatorKind, string> = {
  add: "+",
  sub: "−",
  mul: "·",
  div: "/",
  pow: "^",
  mod: "%",
  neg: "−",
  inv: "⁻¹",
  abs: "abs",
};

export function op(kind: OperatorKind, ...args: MathExpression[]): MathExpression {
  return { kind: "operator", op: kind, symbol: OPERATOR_SYMBOL[kind], args, path: `path:${kind}` };
}

export function app(head: string, display: string, ...args: MathExpression[]): MathExpression {
  return { kind: "application", head, display, args, path: `path:${head}` };
}

export function opaqueExpr(display: string, head: string | null = null): MathExpression {
  return { kind: "opaque", head, display, arity: 0, path: "path:opaque" };
}

export function rel(
  relation: RelationKind,
  lhs: MathExpression,
  rhs: MathExpression,
): MathProposition {
  return { kind: "relation", relation, lhs, rhs, path: "conclusion" };
}

export function pred(
  predicate: PredicateKind,
  name: string,
  subject: MathExpression | null,
): MathProposition {
  return { kind: "predicate", predicate, name, subject, args: [], path: "conclusion" };
}

export function implies(antecedent: MathProposition, consequent: MathProposition): MathProposition {
  return { kind: "implication", antecedent, consequent, path: "conclusion" };
}

export function opaqueProp(display: string, head: string | null = null): MathProposition {
  return { kind: "opaque", head, display, path: "conclusion" };
}

export interface SyntheticOptions {
  name?: string;
  kind?: string;
  variables?: string[];
  hypotheses?: Array<{ symbol: string; proposition: MathProposition; unusedInProof?: boolean }>;
  proofTermAvailable?: boolean;
  usesSorry?: boolean;
  unusualAxioms?: string[];
  concept?: string | null;
  /** The author's `@prooflens.visual` hint, if the test is about hint handling. */
  suggestedVisual?: string | null;
  /** What a definition unfolds to. Only meaningful with `kind: "definition"`. */
  definitionBody?: MathExpression | null;
}

/** Build a TheoremIR around a conclusion, with as little ceremony as possible. */
export function synthetic(conclusion: MathProposition, options: SyntheticOptions = {}): TheoremIR {
  const name = options.name ?? "Test.thm";
  const proofTermAvailable = options.proofTermAvailable ?? true;
  const source = { system: "lean4", declaration: name, module: "Test", span: null };

  const claim: Claim<MathProposition> = derive(conclusion, MATH_IR_RULES.lowerProposition, [], {
    sources: [{ ...source, path: "conclusion" }],
  });

  const variables: MathVariable[] = (options.variables ?? []).map((symbol) => ({
    id: `id:${symbol}`,
    symbol,
    typeDisplay: "ℝ",
    binderInfo: "default",
    annotation: null,
  }));

  const hypotheses: MathHypothesis[] = (options.hypotheses ?? []).map((h) => ({
    id: `hyp:${h.symbol}`,
    symbol: h.symbol,
    proposition: h.proposition,
    display: renderProposition(h.proposition),
    usage: {
      occursInProofTerm: !(h.unusedInProof ?? false),
      occursInLaterBinderTypes: false,
      occursInConclusion: false,
      proofTermAvailable,
      unusedInProof: h.unusedInProof ?? false,
    },
  }));

  return {
    id: name,
    name,
    namespace: "Test",
    kind: options.kind ?? "theorem",
    documentation: null,
    variables,
    hypotheses,
    conclusion: claim,
    conclusionDisplay: renderProposition(conclusion),
    definitionBody: options.definitionBody
      ? {
          expression: options.definitionBody,
          display: renderExpression(options.definitionBody),
        }
      : null,
    statementDisplay: renderProposition(conclusion),
    dependencies: [],
    trust: {
      axioms: ["propext"],
      unusualAxioms: options.unusualAxioms ?? [],
      usesSorry: options.usesSorry ?? false,
      proofTermAvailable,
    },
    annotations: [],
    suggestedVisual: options.suggestedVisual ?? null,
    concept: options.concept ?? null,
    ceiling: options.usesSorry ? "derived" : "verified",
    provenance: { sources: [source] },
  };
}
