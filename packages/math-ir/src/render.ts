import type { MathExpression, MathProposition } from "./types.js";
import { RELATION_SYMBOL } from "./tables.js";

/** Operator binding powers, used only to decide where parentheses are needed. */
const PRECEDENCE: Record<string, number> = {
  add: 65,
  sub: 65,
  mul: 70,
  div: 70,
  mod: 70,
  neg: 75,
  pow: 80,
  inv: 85,
  comp: 88,
  abs: 90,
};

function precedenceOf(expr: MathExpression): number {
  if (expr.kind === "operator") return PRECEDENCE[expr.op] ?? 50;
  if (expr.kind === "application" || expr.kind === "opaque") return 90;
  return 100;
}

function wrap(child: MathExpression, parentPrecedence: number, isRight: boolean): string {
  const childPrecedence = precedenceOf(child);
  const needsParens =
    childPrecedence < parentPrecedence ||
    (childPrecedence === parentPrecedence && isRight && child.kind === "operator");
  const rendered = renderExpression(child);
  return needsParens ? `(${rendered})` : rendered;
}

/** Render an expression the way a mathematician would write it. */
export function renderExpression(expr: MathExpression): string {
  switch (expr.kind) {
    case "variable":
      return expr.symbol;
    case "number":
      return expr.display;
    case "constant":
      return expr.display;
    case "lambda":
      return `${expr.parameter} ↦ ${renderExpression(expr.body)}`;
    case "opaque":
      return expr.display;
    case "application": {
      if (expr.args.length === 0) return expr.display;
      // Interval displays carry their own placeholders (`[·,·)`), so they are
      // filled in rather than called: `[0, 1)`, not `[·,·)(0, 1)`.
      if (expr.display.includes("·")) {
        let filled = expr.display;
        for (const arg of expr.args) filled = filled.replace("·", renderExpression(arg));
        return filled;
      }
      return `${expr.display}(${expr.args.map(renderExpression).join(", ")})`;
    }
    case "operator": {
      const p = PRECEDENCE[expr.op] ?? 50;
      if (expr.op === "neg") return `−${wrap(expr.args[0]!, p, false)}`;
      if (expr.op === "inv") return `${wrap(expr.args[0]!, p, false)}⁻¹`;
      if (expr.op === "abs") return `|${renderExpression(expr.args[0]!)}|`;
      const left = wrap(expr.args[0]!, p, false);
      const right = wrap(expr.args[1]!, p, true);
      return `${left} ${expr.symbol} ${right}`;
    }
  }
}

/** Render a proposition. */
export function renderProposition(prop: MathProposition): string {
  switch (prop.kind) {
    case "relation":
      return `${renderExpression(prop.lhs)} ${RELATION_SYMBOL[prop.relation]} ${renderExpression(prop.rhs)}`;
    case "predicate": {
      const parts = [prop.subject, ...prop.args].filter((a): a is MathExpression => a !== null);
      return parts.length === 0
        ? prop.name
        : `${prop.name} ${parts.map((a) => renderExpression(a)).join(" ")}`;
    }
    case "implication":
      return `${renderProposition(prop.antecedent)} → ${renderProposition(prop.consequent)}`;
    case "limit":
      return `${renderExpression(prop.subject)} ⟶ ${prop.target.display} (along ${prop.source.display})`;
    case "existential":
      return `∃ ${prop.binder}, ${renderProposition(prop.body)}`;
    case "conjunction":
      return prop.conjuncts.map(renderProposition).join(" ∧ ");
    case "membership":
      return `${renderExpression(prop.element)} ∈ ${renderExpression(prop.collection)}`;
    case "opaque":
      return prop.display;
  }
}

/** Every variable id mentioned in an expression. */
export function variablesIn(expr: MathExpression, into: Set<string> = new Set()): Set<string> {
  switch (expr.kind) {
    case "variable":
      into.add(expr.id);
      break;
    case "operator":
    case "application":
      for (const a of expr.args) variablesIn(a, into);
      break;
    case "lambda":
      variablesIn(expr.body, into);
      break;
    default:
      break;
  }
  return into;
}

/** Every variable id mentioned in a proposition. */
export function variablesInProposition(
  prop: MathProposition,
  into: Set<string> = new Set(),
): Set<string> {
  switch (prop.kind) {
    case "relation":
      variablesIn(prop.lhs, into);
      variablesIn(prop.rhs, into);
      break;
    case "predicate":
      if (prop.subject) variablesIn(prop.subject, into);
      for (const a of prop.args) variablesIn(a, into);
      break;
    case "implication":
      variablesInProposition(prop.antecedent, into);
      variablesInProposition(prop.consequent, into);
      break;
    case "limit":
      variablesIn(prop.subject, into);
      if (prop.source.point) variablesIn(prop.source.point, into);
      if (prop.target.point) variablesIn(prop.target.point, into);
      break;
    case "existential":
      variablesInProposition(prop.body, into);
      break;
    case "conjunction":
      for (const conjunct of prop.conjuncts) variablesInProposition(conjunct, into);
      break;
    case "membership":
      variablesIn(prop.element, into);
      variablesIn(prop.collection, into);
      break;
    default:
      break;
  }
  return into;
}

/** Does this expression contain anything ProofLens could not name? */
export function containsOpaque(expr: MathExpression): boolean {
  if (expr.kind === "opaque") return true;
  if (expr.kind === "operator" || expr.kind === "application")
    return expr.args.some(containsOpaque);
  if (expr.kind === "lambda") return containsOpaque(expr.body);
  return false;
}
