import type { MathExpression, TheoremIR } from "@prooflens/math-ir";

/**
 * Sign and monotonicity analysis.
 *
 * ProofLens is allowed to say "increasing P raises this bound" only when that
 * follows from the theorem's own hypotheses. This module is the deterministic
 * machinery that decides whether it does. When it cannot tell, it says
 * `unknown`, and the explanation engine stays silent rather than guessing.
 */

export type Sign = "positive" | "nonnegative" | "negative" | "nonpositive" | "zero" | "unknown";
export type Direction = "increasing" | "decreasing" | "constant" | "unknown";

export type SignFacts = ReadonlyMap<string, Sign>;

/**
 * Read sign facts off the hypotheses.
 *
 * `0 < T` gives `T` positive; `0 ≤ T` gives nonnegative; `T ≠ 0` tells us
 * nothing about direction and is ignored here.
 */
export function signFactsOf(theorem: TheoremIR): SignFacts {
  const facts = new Map<string, Sign>();
  const record = (id: string, sign: Sign) => {
    const existing = facts.get(id);
    if (existing === "positive") return;
    facts.set(id, sign);
  };
  for (const hypothesis of theorem.hypotheses) {
    const prop = hypothesis.proposition;
    if (prop.kind !== "relation") continue;
    const { lhs, rhs, relation } = prop;
    const zeroLeft = lhs.kind === "number" && lhs.value === 0;
    const zeroRight = rhs.kind === "number" && rhs.value === 0;
    if (zeroLeft && rhs.kind === "variable") {
      if (relation === "less-than") record(rhs.id, "positive");
      else if (relation === "less-than-or-equal") record(rhs.id, "nonnegative");
    }
    if (zeroRight && lhs.kind === "variable") {
      if (relation === "greater-than") record(lhs.id, "positive");
      else if (relation === "greater-than-or-equal") record(lhs.id, "nonnegative");
      else if (relation === "less-than") record(lhs.id, "negative");
      else if (relation === "less-than-or-equal") record(lhs.id, "nonpositive");
    }
  }
  return facts;
}

function isStrictlyPositive(sign: Sign): boolean {
  return sign === "positive";
}

function multiplySigns(a: Sign, b: Sign): Sign {
  if (a === "zero" || b === "zero") return "zero";
  if (a === "unknown" || b === "unknown") return "unknown";
  const negA = a === "negative" || a === "nonpositive";
  const negB = b === "negative" || b === "nonpositive";
  const strict = (a === "positive" || a === "negative") && (b === "positive" || b === "negative");
  const negative = negA !== negB;
  if (negative) return strict ? "negative" : "nonpositive";
  return strict ? "positive" : "nonnegative";
}

/** Determine the sign of an expression from the recorded facts. */
export function signOf(expr: MathExpression, facts: SignFacts): Sign {
  switch (expr.kind) {
    case "number":
      if (expr.value > 0) return "positive";
      if (expr.value < 0) return "negative";
      return "zero";
    case "variable":
      return facts.get(expr.id) ?? "unknown";
    case "operator": {
      const [a, b] = expr.args;
      switch (expr.op) {
        case "mul":
          return a && b ? multiplySigns(signOf(a, facts), signOf(b, facts)) : "unknown";
        case "div":
          return a && b ? multiplySigns(signOf(a, facts), signOf(b, facts)) : "unknown";
        case "add": {
          if (!a || !b) return "unknown";
          const sa = signOf(a, facts);
          const sb = signOf(b, facts);
          if (
            isStrictlyPositive(sa) &&
            (sb === "positive" || sb === "nonnegative" || sb === "zero")
          )
            return "positive";
          if (
            isStrictlyPositive(sb) &&
            (sa === "positive" || sa === "nonnegative" || sa === "zero")
          )
            return "positive";
          if (
            (sa === "nonnegative" || sa === "zero" || sa === "positive") &&
            (sb === "nonnegative" || sb === "zero" || sb === "positive")
          )
            return "nonnegative";
          return "unknown";
        }
        case "neg": {
          if (!a) return "unknown";
          return multiplySigns(signOf(a, facts), "negative");
        }
        case "abs":
          return "nonnegative";
        case "pow": {
          if (!a) return "unknown";
          const sa = signOf(a, facts);
          return sa === "positive" ? "positive" : "unknown";
        }
        default:
          return "unknown";
      }
    }
    case "application": {
      // `√x` is nonnegative wherever it is defined.
      if (expr.head === "Real.sqrt") return "nonnegative";
      // `exp` is positive everywhere.
      if (expr.head === "Real.exp") return "positive";
      // `log` of a *literal* is decidable without any hypothesis. This matters:
      // constants like `log 2` appear in the denominator of real bounds, and
      // without this the whole bound becomes sign-unknown and ProofLens goes
      // silent about parameters it could legitimately reason about.
      if (expr.head === "Real.log") {
        const arg = expr.args[0];
        if (arg && arg.kind === "number") {
          if (arg.value > 1) return "positive";
          if (arg.value === 1) return "zero";
          if (arg.value > 0) return "negative";
        }
        return "unknown";
      }
      return "unknown";
    }
    default:
      return "unknown";
  }
}

function mentions(expr: MathExpression, variableId: string): boolean {
  switch (expr.kind) {
    case "variable":
      return expr.id === variableId;
    case "operator":
    case "application":
      return expr.args.some((a) => mentions(a, variableId));
    case "lambda":
      return mentions(expr.body, variableId);
    default:
      return false;
  }
}

function flip(direction: Direction): Direction {
  if (direction === "increasing") return "decreasing";
  if (direction === "decreasing") return "increasing";
  return direction;
}

/**
 * How does `expr` respond to increasing `variableId`, holding everything else
 * fixed?
 *
 * Conservative by construction: any case the rules do not cover returns
 * `unknown`, and `unknown` never becomes an explanation.
 */
export function directionOf(expr: MathExpression, variableId: string, facts: SignFacts): Direction {
  if (!mentions(expr, variableId)) return "constant";
  switch (expr.kind) {
    case "variable":
      return expr.id === variableId ? "increasing" : "constant";
    case "operator": {
      const [a, b] = expr.args;
      switch (expr.op) {
        case "add": {
          if (!a || !b) return "unknown";
          const da = directionOf(a, variableId, facts);
          const db = directionOf(b, variableId, facts);
          if (da === "unknown" || db === "unknown") return "unknown";
          if (da === "increasing" && db !== "decreasing") return "increasing";
          if (db === "increasing" && da !== "decreasing") return "increasing";
          if (da === "decreasing" && db !== "increasing") return "decreasing";
          if (db === "decreasing" && da !== "increasing") return "decreasing";
          return "constant";
        }
        case "sub": {
          if (!a || !b) return "unknown";
          const da = directionOf(a, variableId, facts);
          const db = flip(directionOf(b, variableId, facts));
          if (da === "unknown" || db === "unknown") return "unknown";
          if (da === "increasing" && db !== "decreasing") return "increasing";
          if (db === "increasing" && da !== "decreasing") return "increasing";
          if (da === "decreasing" && db !== "increasing") return "decreasing";
          if (db === "decreasing" && da !== "increasing") return "decreasing";
          return "constant";
        }
        case "mul": {
          if (!a || !b) return "unknown";
          const aHas = mentions(a, variableId);
          const bHas = mentions(b, variableId);
          // Only handle the linear case: the variable appears on one side only.
          if (aHas && bHas) return "unknown";
          const [varying, fixed] = aHas ? [a, b] : [b, a];
          const coefficient = signOf(fixed, facts);
          const inner = directionOf(varying, variableId, facts);
          if (inner === "unknown") return "unknown";
          if (coefficient === "positive") return inner;
          if (coefficient === "negative") return flip(inner);
          return "unknown";
        }
        case "div": {
          if (!a || !b) return "unknown";
          const numeratorHas = mentions(a, variableId);
          const denominatorHas = mentions(b, variableId);
          if (numeratorHas && denominatorHas) return "unknown";
          if (numeratorHas) {
            const denominatorSign = signOf(b, facts);
            const inner = directionOf(a, variableId, facts);
            if (inner === "unknown") return "unknown";
            if (denominatorSign === "positive") return inner;
            if (denominatorSign === "negative") return flip(inner);
            return "unknown";
          }
          // Variable is in the denominator: x ↦ k / x is decreasing when both
          // the numerator and the denominator are strictly positive.
          const numeratorSign = signOf(a, facts);
          const denominatorSign = signOf(b, facts);
          const inner = directionOf(b, variableId, facts);
          if (inner === "unknown") return "unknown";
          if (numeratorSign === "positive" && denominatorSign === "positive") return flip(inner);
          if (numeratorSign === "negative" && denominatorSign === "positive") return inner;
          return "unknown";
        }
        case "neg": {
          if (!a) return "unknown";
          return flip(directionOf(a, variableId, facts));
        }
        default:
          return "unknown";
      }
    }
    case "application":
      // Monotone by convention where it is defined, but ProofLens will not
      // assert that without the theorem saying so.
      return "unknown";
    default:
      return "unknown";
  }
}

export const DIRECTION_PHRASE: Record<Direction, string> = {
  increasing: "increases",
  decreasing: "decreases",
  constant: "does not change",
  unknown: "changes in a way ProofLens cannot determine from the stated hypotheses",
};
