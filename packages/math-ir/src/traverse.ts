import type { MathExpression, MathProposition, TheoremIR } from "./types.js";

/**
 * Structural traversal of MathIR.
 *
 * Used by coverage analysis, which needs to find every place ProofLens gave up
 * and say what it gave up on. That is the difference between "we support 40% of
 * mathlib" and "here are the twelve constants to add next".
 */
export function* walkExpression(expr: MathExpression): Generator<MathExpression> {
  yield expr;
  switch (expr.kind) {
    case "operator":
    case "application":
      for (const arg of expr.args) yield* walkExpression(arg);
      break;
    case "lambda":
      yield* walkExpression(expr.body);
      break;
    default:
      break;
  }
}

export function* walkProposition(
  prop: MathProposition,
): Generator<MathProposition | MathExpression> {
  yield prop;
  switch (prop.kind) {
    case "relation":
      yield* walkExpression(prop.lhs);
      yield* walkExpression(prop.rhs);
      break;
    case "predicate":
      if (prop.subject) yield* walkExpression(prop.subject);
      for (const arg of prop.args) yield* walkExpression(arg);
      break;
    case "implication":
      yield* walkProposition(prop.antecedent);
      yield* walkProposition(prop.consequent);
      break;
    case "limit":
      yield* walkExpression(prop.subject);
      if (prop.source.point) yield* walkExpression(prop.source.point);
      if (prop.target.point) yield* walkExpression(prop.target.point);
      break;
    case "existential":
      yield* walkProposition(prop.body);
      break;
    case "conjunction":
      for (const conjunct of prop.conjuncts) yield* walkProposition(conjunct);
      break;
    case "membership":
      yield* walkExpression(prop.element);
      yield* walkExpression(prop.collection);
      break;
    default:
      break;
  }
}

/** Every proposition and expression reachable from a theorem's statement. */
export function* walkTheorem(theorem: TheoremIR): Generator<MathProposition | MathExpression> {
  // A definition's "conclusion" is its return type, not a claim. Counting `ℝ`
  // as an unreadable term would inflate the miss list with noise.
  const isDefinition = theorem.kind === "definition" || theorem.kind === "opaque";
  if (!isDefinition) yield* walkProposition(theorem.conclusion.value);
  for (const hypothesis of theorem.hypotheses) yield* walkProposition(hypothesis.proposition);
  if (theorem.definitionBody) yield* walkExpression(theorem.definitionBody.expression);
}

/**
 * Constants ProofLens could not name, anywhere in a theorem.
 *
 * A theorem can classify perfectly well and still contain terms the constant
 * table does not cover: `x ≤ ∑ i, f i` is an upper bound whose bound is opaque.
 * Those are the highest-value additions, because each one improves statements
 * that already work rather than unlocking a new shape.
 */
export function opaqueHeadsIn(theorem: TheoremIR): Set<string> {
  const heads = new Set<string>();
  for (const node of walkTheorem(theorem)) {
    if (node.kind === "opaque" && node.head !== null) heads.add(node.head);
  }
  return heads;
}
