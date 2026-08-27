import type { EpistemicStatus, Provenance, SourceReference } from "@prooflens/epistemics";
import type { Classification, Direction } from "@prooflens/classifier";
import {
  renderExpression,
  variablesIn,
  type MathExpression,
  type MathVariable,
  type TheoremIR,
} from "@prooflens/math-ir";

/** Stable rule recorded on every semantic scene produced by this compiler. */
export const SEMANTIC_SCENE_RULE = {
  id: "SEMANTIC_NUMERIC_BOUND_001",
  description:
    "Compiled a supported bound into a numeric, parameterised scene using author-declared meanings and domains.",
  produces: "interpreted" as const,
};

export const SEMANTIC_SCENE_VERSION = "0.1.0";

export type BoundDirection = "upper" | "lower";

export interface SceneRange {
  min: number;
  max: number;
  step: number;
  initial: number;
  integer: boolean;
}

export interface SceneParameter {
  id: string;
  symbol: string;
  label: string;
  units?: string;
  domain: string;
  axis: "x" | "parameter";
  role?: string;
  range: SceneRange;
  /** Symbol meaning and domain come from author annotations, not Lean. */
  epistemic: "interpreted";
}

export interface NumericBoundScene {
  version: string;
  id: string;
  type: "numeric-bound";
  theoremName: string;
  title: string;
  direction: BoundDirection;
  strict: boolean;
  bounded: MathExpression;
  bound: MathExpression;
  boundedLabel: string;
  boundLabel: string;
  targetLabel: string;
  targetUnits?: string;
  parameters: SceneParameter[];
  xParameterId: string;
  sensitivity: Array<{ variableId: string; symbol: string; direction: Direction }>;
  /** Standing of the classifier's bound reading; normally derived from a verified conclusion. */
  constraintStatus: EpistemicStatus;
  /** Defaults and axis extents are display choices, so the scene is illustrative overall. */
  epistemic: "illustrative";
  provenance: Provenance;
  caveat: string;
}

export type SemanticSceneResult =
  | { status: "ready"; scene: NumericBoundScene }
  | {
      status: "blocked";
      code:
        "NO_NATURAL_BOUND" | "UNSUPPORTED_EXPRESSION" | "MISSING_SEMANTICS" | "UNSUPPORTED_DOMAIN";
      reason: string;
    };

export interface SceneEvaluation {
  boundValue: number;
  targetValue: number;
  feasible: boolean;
  statement: string;
  description: string;
}

export interface ScenePoint {
  x: number;
  bound: number;
}

const DOMAIN_RANGES: Array<{ test: RegExp; range: SceneRange }> = [
  {
    test: /^(strictly )?positive reals?$/i,
    range: { min: 0.1, max: 10, step: 0.1, initial: 1, integer: false },
  },
  {
    test: /^nonnegative reals?$/i,
    range: { min: 0, max: 10, step: 0.1, initial: 1, integer: false },
  },
  {
    test: /^reals?$/i,
    range: { min: -10, max: 10, step: 0.1, initial: 1, integer: false },
  },
  {
    test: /^(natural numbers?|naturals?|nonnegative integers?)$/i,
    range: { min: 0, max: 20, step: 1, initial: 1, integer: true },
  },
];

function sourceFor(theorem: TheoremIR, path = "conclusion"): SourceReference {
  const base = theorem.provenance.sources[0];
  return base ? { ...base, path } : { system: "lean4", declaration: theorem.name, path };
}

function naturalBound(classifications: readonly Classification[]): Classification | undefined {
  return classifications.find(
    (classification) =>
      (classification.payload.kind === "upper-bound" ||
        classification.payload.kind === "lower-bound") &&
      classification.payload.data.natural,
  );
}

function unsupportedHead(expr: MathExpression): string | null {
  switch (expr.kind) {
    case "number":
    case "variable":
      return null;
    case "constant":
    case "opaque":
    case "lambda":
      return expr.kind;
    case "operator": {
      if (!["add", "sub", "mul", "div", "pow", "neg", "inv", "abs"].includes(expr.op)) {
        return `operator:${expr.op}`;
      }
      for (const arg of expr.args) {
        const unsupported = unsupportedHead(arg);
        if (unsupported) return unsupported;
      }
      return null;
    }
    case "application": {
      if (!["Real.log", "Real.exp", "Real.sqrt"].includes(expr.head)) return expr.head;
      for (const arg of expr.args) {
        const unsupported = unsupportedHead(arg);
        if (unsupported) return unsupported;
      }
      return null;
    }
  }
}

function rangeFor(variable: MathVariable): SceneRange | null {
  const domain = variable.annotation?.domain;
  if (!domain) return null;
  const match = DOMAIN_RANGES.find((candidate) => candidate.test.test(domain));
  return match ? { ...match.range } : null;
}

function boundedUnits(theorem: TheoremIR, bounded: MathExpression): string | undefined {
  if (bounded.kind !== "variable") return undefined;
  return theorem.variables.find((variable) => variable.id === bounded.id)?.annotation?.units;
}

/**
 * Compile a theorem into the first numeric semantic scene ProofLens can defend.
 *
 * This function is intentionally strict. A structural bound is not enough:
 * every free parameter in the bound must have author-declared meaning and a
 * recognised domain, and every operation must have deterministic numeric
 * semantics. Otherwise the compiler returns a named block instead of a graph.
 */
export function compileSemanticScene(
  theorem: TheoremIR,
  classifications: readonly Classification[],
): SemanticSceneResult {
  const classification = naturalBound(classifications);
  if (!classification) {
    return {
      status: "blocked",
      code: "NO_NATURAL_BOUND",
      reason: "This declaration has no natural upper or lower bound to turn into a numeric scene.",
    };
  }

  const payload = classification.payload;
  if (payload.kind !== "upper-bound" && payload.kind !== "lower-bound") {
    throw new Error("naturalBound returned a non-bound classification");
  }

  const unsupported = unsupportedHead(payload.data.bound);
  if (unsupported) {
    return {
      status: "blocked",
      code: "UNSUPPORTED_EXPRESSION",
      reason: `The bound contains ${unsupported}, which the numeric evaluator does not support.`,
    };
  }

  const variableIds = variablesIn(payload.data.bound);
  const variables = theorem.variables.filter((variable) => variableIds.has(variable.id));
  const missing = variables.filter(
    (variable) => !variable.annotation?.meaning || !variable.annotation.domain,
  );
  if (missing.length > 0) {
    return {
      status: "blocked",
      code: "MISSING_SEMANTICS",
      reason: `Numeric rendering needs meaning and domain annotations for: ${missing
        .map((variable) => variable.symbol)
        .join(", ")}.`,
    };
  }

  const unsupportedDomains = variables.filter((variable) => rangeFor(variable) === null);
  if (unsupportedDomains.length > 0) {
    return {
      status: "blocked",
      code: "UNSUPPORTED_DOMAIN",
      reason: `No safe slider range is defined for: ${unsupportedDomains
        .map((variable) => `${variable.symbol} (${variable.annotation!.domain})`)
        .join(", ")}.`,
    };
  }

  const parameters: SceneParameter[] = variables.map((variable) => ({
    id: variable.id,
    symbol: variable.symbol,
    label: variable.annotation!.meaning!,
    units: variable.annotation!.units,
    domain: variable.annotation!.domain!,
    axis: variable.annotation!.axis === "x" ? "x" : "parameter",
    role: variable.annotation!.role,
    range: rangeFor(variable)!,
    epistemic: "interpreted",
  }));
  const xParameter = parameters.find((parameter) => parameter.axis === "x") ?? parameters[0];
  if (!xParameter) {
    return {
      status: "blocked",
      code: "MISSING_SEMANTICS",
      reason: "The bound has no free numeric parameter to place on an axis.",
    };
  }

  const boundedLabel = renderExpression(payload.data.boundedQuantity);
  const boundLabel = renderExpression(payload.data.bound);
  const direction: BoundDirection = payload.kind === "upper-bound" ? "upper" : "lower";

  return {
    status: "ready",
    scene: {
      version: SEMANTIC_SCENE_VERSION,
      id: `${theorem.id}:semantic-bound`,
      type: "numeric-bound",
      theoremName: theorem.name,
      title: theorem.concept ?? `${boundedLabel} ${direction === "upper" ? "ceiling" : "floor"}`,
      direction,
      strict: payload.data.strict,
      bounded: payload.data.boundedQuantity,
      bound: payload.data.bound,
      boundedLabel,
      boundLabel,
      targetLabel: `target ${boundedLabel}`,
      targetUnits: boundedUnits(theorem, payload.data.boundedQuantity),
      parameters,
      xParameterId: xParameter.id,
      sensitivity: payload.data.sensitivity,
      constraintStatus: classification.claim.status,
      epistemic: "illustrative",
      provenance: {
        sources: [sourceFor(theorem, payload.data.bound.path)],
        rule: SEMANTIC_SCENE_RULE,
        inputs: [theorem.id, classification.rule.id],
        note: "The inequality comes from Lean. Meanings and domains come from author annotations. Slider defaults and plot ranges are illustrative.",
      },
      caveat:
        "Lean verifies the inequality, not the author-supplied physical meanings or the illustrative parameter values.",
    },
  };
}

/** Deterministically evaluate the supported numeric subset of MathIR. */
export function evaluateMathExpression(
  expression: MathExpression,
  values: Readonly<Record<string, number>>,
): number {
  switch (expression.kind) {
    case "number":
      return expression.value;
    case "variable": {
      const value = values[expression.id];
      if (value === undefined || !Number.isFinite(value)) {
        throw new Error(`Missing finite value for ${expression.symbol}`);
      }
      return value;
    }
    case "operator": {
      const args = expression.args.map((arg) => evaluateMathExpression(arg, values));
      const [a, b] = args;
      let value: number;
      switch (expression.op) {
        case "add":
          value = a! + b!;
          break;
        case "sub":
          value = a! - b!;
          break;
        case "mul":
          value = a! * b!;
          break;
        case "div":
          value = a! / b!;
          break;
        case "pow":
          value = a! ** b!;
          break;
        case "neg":
          value = -a!;
          break;
        case "inv":
          value = 1 / a!;
          break;
        case "abs":
          value = Math.abs(a!);
          break;
        default:
          throw new Error(`Unsupported numeric operator ${expression.op}`);
      }
      if (!Number.isFinite(value)) throw new Error("Expression is undefined at these values");
      return value;
    }
    case "application": {
      const args = expression.args.map((arg) => evaluateMathExpression(arg, values));
      let value: number;
      if (expression.head === "Real.log") value = Math.log(args[0]!);
      else if (expression.head === "Real.exp") value = Math.exp(args[0]!);
      else if (expression.head === "Real.sqrt") value = Math.sqrt(args[0]!);
      else throw new Error(`Unsupported numeric function ${expression.head}`);
      if (!Number.isFinite(value)) throw new Error("Expression is undefined at these values");
      return value;
    }
    default:
      throw new Error(`Unsupported numeric expression ${expression.kind}`);
  }
}

export function initialSceneValues(scene: NumericBoundScene): Record<string, number> {
  return Object.fromEntries(
    scene.parameters.map((parameter) => [parameter.id, parameter.range.initial]),
  );
}

export function evaluateSemanticScene(
  scene: NumericBoundScene,
  values: Readonly<Record<string, number>>,
  targetValue: number,
): SceneEvaluation {
  const boundValue = evaluateMathExpression(scene.bound, values);
  const feasible =
    scene.direction === "upper"
      ? scene.strict
        ? targetValue < boundValue
        : targetValue <= boundValue
      : scene.strict
        ? targetValue > boundValue
        : targetValue >= boundValue;
  const comparator =
    scene.direction === "upper" ? (scene.strict ? "<" : "≤") : scene.strict ? ">" : "≥";
  const statement = `${formatNumber(targetValue)} ${comparator} ${formatNumber(boundValue)} — ${
    feasible ? "FEASIBLE" : "INFEASIBLE"
  }`;
  const movements = scene.sensitivity
    .filter((item) => item.direction === "increasing" || item.direction === "decreasing")
    .map((item) => {
      const parameter = scene.parameters.find((candidate) => candidate.id === item.variableId);
      return `${parameter?.label ?? item.symbol} ${item.direction === "increasing" ? "raises" : "lowers"} the ${
        scene.direction === "upper" ? "ceiling" : "floor"
      }`;
    });
  const description = `The verified statement constrains ${scene.boundedLabel} ${
    scene.direction === "upper" ? "from above" : "from below"
  } by ${scene.boundLabel}. At the displayed illustrative inputs, the bound is ${formatNumber(
    boundValue,
  )}.${movements.length > 0 ? ` ${movements.join("; ")}.` : ""}`;
  return { boundValue, targetValue, feasible, statement, description };
}

export function sampleSemanticScene(
  scene: NumericBoundScene,
  values: Readonly<Record<string, number>>,
  samples = 41,
): ScenePoint[] {
  const parameter = scene.parameters.find((candidate) => candidate.id === scene.xParameterId);
  if (!parameter) return [];
  const count = Math.max(2, Math.min(401, Math.floor(samples)));
  const points: ScenePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const x =
      parameter.range.min + ((parameter.range.max - parameter.range.min) * index) / (count - 1);
    try {
      const bound = evaluateMathExpression(scene.bound, { ...values, [parameter.id]: x });
      if (Number.isFinite(bound)) points.push({ x, bound });
    } catch {
      // Undefined points create a gap rather than a fabricated value.
    }
  }
  return points;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "undefined";
  const magnitude = Math.abs(value);
  if ((magnitude !== 0 && magnitude < 0.001) || magnitude >= 100_000) {
    return value.toExponential(3);
  }
  return Number(value.toPrecision(5)).toString();
}
