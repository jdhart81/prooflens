import type { EpistemicStatus } from "@prooflens/epistemics";
import type { ClassificationKind } from "@prooflens/classifier";
import type { TheoremAnalysis } from "@prooflens/pipeline";

/** Last dotted component of a Lean name: `ProofLens.Examples.foo` -> `foo`. */
export function shortName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1] ?? name;
}

/** Everything before the last dotted component. */
export function namespaceOf(name: string): string {
  const parts = name.split(".");
  return parts.slice(0, -1).join(".");
}

/** Compact human label for a classification kind, used on list badges. */
export const KIND_LABEL: Record<ClassificationKind, string> = {
  property: "property",
  conjunction: "conjunction",
  membership: "membership",
  limit: "limit",
  existence: "existence",
  positivity: "positivity",
  distinctness: "distinctness",
  "upper-bound": "upper bound",
  "lower-bound": "lower bound",
  equality: "equality",
  "functional-relationship": "definition of",
  monotonicity: "monotonicity",
  implication: "implication",
  equivalence: "equivalence",
  "assumption-sensitivity": "assumptions",
  trust: "trust",
  definition: "definition",
  unsupported: "unsupported",
};

export const STATUS_LABEL: Record<EpistemicStatus, string> = {
  verified: "verified",
  derived: "derived",
  interpreted: "interpreted",
  heuristic: "heuristic",
  illustrative: "illustrative",
  speculative: "speculative",
};

/** Does any classifier report a hypothesis that the proof term never touches? */
export function unusedHypothesisCount(analysis: TheoremAnalysis): number {
  for (const c of analysis.classifications) {
    if (c.payload.kind === "assumption-sensitivity") {
      return c.payload.data.unusedInProof.length;
    }
  }
  return 0;
}

export function primaryKind(analysis: TheoremAnalysis): ClassificationKind | null {
  return analysis.primary ? analysis.primary.payload.kind : null;
}

/**
 * Pretty-print a pipeline stage. Cycle-tolerant: the IRs are plain data today,
 * but a stage panel must never be the thing that takes the app down.
 */
export function prettyJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key, val: unknown) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[circular]";
          seen.add(val);
        }
        if (typeof val === "symbol") return val.toString();
        if (typeof val === "function") return "[function]";
        return val;
      },
      2,
    );
  } catch (error) {
    return `// could not serialise this stage: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

/** Render a 1-indexed Lean source span as `12:0–40:3`. */
export function formatSpan(
  span:
    | {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
      }
    | null
    | undefined,
): string {
  if (!span) return "no source location";
  return `${span.startLine}:${span.startColumn}–${span.endLine}:${span.endColumn}`;
}
