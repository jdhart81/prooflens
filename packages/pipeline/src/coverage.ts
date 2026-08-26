import { opaqueHeadsIn, type TheoremIR } from "@prooflens/math-ir";
import type { PipelineBundle, TheoremAnalysis } from "./index.js";

/**
 * Coverage analysis.
 *
 * The honest question about a system like ProofLens is not "does it work?" but
 * "on what fraction of real mathematics does it say anything useful, and what
 * would move that number?". This module answers both, and the second answer is
 * the more valuable one: it is a ranked, evidence-backed work queue rather than
 * a guess about what mathematicians write.
 *
 * Two different kinds of miss are counted separately, because they call for
 * different work:
 *
 *  - **Unrecognised shapes.** No classifier matched the conclusion at all.
 *    Fixing one unlocks a statement form ProofLens currently cannot read.
 *  - **Opaque subterms.** The statement classified fine, but some term inside it
 *    could not be named — `x ≤ ∑ i ∈ s, f i` is a perfectly good upper bound
 *    with an unreadable bound. Fixing one improves statements that already work.
 */

export interface HeadMiss {
  /** The Lean constant, or `null` when the shape itself was unrecognisable. */
  head: string | null;
  /** How many declarations are affected. This is the ranking key. */
  declarations: number;
  /** A few example declaration names, for the issue report. */
  examples: string[];
  /**
   * Set on an opaque-constant row whose head also appears as an unrecognised
   * shape. Such a row is *not* a cheap win: there are no already-classifying
   * statements for it to improve.
   */
  alsoUnrecognised?: boolean;
}

export interface CoverageReport {
  modules: string[];
  notationFidelity: "notation" | "raw";
  totals: {
    declarations: number;
    theorems: number;
    definitions: number;
    /** Conclusion matched at least one structural classifier. */
    classified: number;
    unsupported: number;
    /** Classified, but containing at least one term ProofLens could not name. */
    classifiedWithOpaqueTerms: number;
    /** Classified and fully readable end to end. */
    fullyReadable: number;
  };
  rates: {
    classified: number;
    fullyReadable: number;
  };
  byClassification: Array<{ kind: string; declarations: number }>;
  /** Ranked backlog: unrecognised conclusion shapes. */
  unrecognisedShapes: HeadMiss[];
  /** Ranked backlog: constants to add to the MathIR tables. */
  opaqueConstants: HeadMiss[];
  assumptionSensitivity: {
    /** Declarations whose proof term was available for analysis. */
    analysed: number;
    withUnusedHypotheses: number;
    unusedHypotheses: number;
    examples: Array<{ declaration: string; unused: string[] }>;
  };
  trust: {
    usesSorry: string[];
    unusualAxioms: Array<{ declaration: string; axioms: string[] }>;
  };
  figures: {
    planned: number;
    byType: Array<{ type: string; count: number }>;
    byEpistemicStatus: Array<{ status: string; count: number }>;
  };
}

const MAX_EXAMPLES = 5;

/**
 * Deterministic string order.
 *
 * Deliberately NOT `localeCompare`: without an explicit locale its collation
 * comes from the machine's environment, and this report is a committed
 * artifact. Regenerating it elsewhere would reorder both backlogs and churn the
 * diff for reasons that have nothing to do with the mathematics. Code-unit
 * order is uglier for unicode identifiers and identical everywhere, which is
 * the property that matters here.
 */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function rank(counts: Map<string | null, { declarations: Set<string> }>): HeadMiss[] {
  return Array.from(counts.entries())
    .map(([head, entry]) => ({
      head,
      declarations: entry.declarations.size,
      examples: Array.from(entry.declarations).sort(byCodeUnit).slice(0, MAX_EXAMPLES),
    }))
    .sort((a, b) => b.declarations - a.declarations || byCodeUnit(String(a.head), String(b.head)));
}

function record(
  counts: Map<string | null, { declarations: Set<string> }>,
  head: string | null,
  declaration: string,
): void {
  const entry = counts.get(head) ?? { declarations: new Set<string>() };
  entry.declarations.add(declaration);
  counts.set(head, entry);
}

/**
 * The conclusion's head constant, when there is one to name.
 *
 * A definition's "conclusion" is its return type, so naming it would put `Real`
 * in the unrecognised-shape backlog. `walkTheorem` excludes definition
 * conclusions for the same reason; the two exclusions have to agree, or a
 * definition that ever failed to classify would report its codomain as a gap.
 */
function conclusionHead(theorem: TheoremIR): string | null {
  if (theorem.kind === "definition" || theorem.kind === "opaque") return null;
  const prop = theorem.conclusion.value;
  if (prop.kind === "opaque") return prop.head;
  if (prop.kind === "predicate") return prop.name;
  if (prop.kind === "relation") return prop.relation;
  if (prop.kind === "implication") return "implication";
  return null;
}

export function coverageReport(bundle: PipelineBundle): CoverageReport {
  const unrecognised = new Map<string | null, { declarations: Set<string> }>();
  const opaque = new Map<string | null, { declarations: Set<string> }>();
  const byKind = new Map<string, Set<string>>();
  const byFigureType = new Map<string, number>();
  const byStatus = new Map<string, number>();

  let theorems = 0;
  let definitions = 0;
  let classified = 0;
  let classifiedWithOpaque = 0;
  let sensitivityAnalysed = 0;
  let withUnused = 0;
  let unusedTotal = 0;

  const sensitivityExamples: CoverageReport["assumptionSensitivity"]["examples"] = [];
  const usesSorry: string[] = [];
  const unusualAxioms: CoverageReport["trust"]["unusualAxioms"] = [];

  for (const analysis of bundle.analyses) {
    const name = analysis.math.name;
    if (analysis.math.kind === "theorem") theorems += 1;
    else if (analysis.math.kind === "definition" || analysis.math.kind === "opaque")
      definitions += 1;

    if (analysis.unsupported) {
      record(unrecognised, conclusionHead(analysis.math), name);
    } else {
      classified += 1;
      const kind = analysis.primary?.payload.kind ?? "unknown";
      const set = byKind.get(kind) ?? new Set<string>();
      set.add(name);
      byKind.set(kind, set);
    }

    const heads = opaqueHeadsIn(analysis.math);
    if (heads.size > 0) {
      if (!analysis.unsupported) classifiedWithOpaque += 1;
      for (const head of heads) record(opaque, head, name);
    }

    const sensitivity = analysis.classifications.find(
      (c) => c.payload.kind === "assumption-sensitivity",
    );
    if (sensitivity && sensitivity.payload.kind === "assumption-sensitivity") {
      sensitivityAnalysed += 1;
      const unused = sensitivity.payload.data.unusedInProof;
      if (unused.length > 0) {
        withUnused += 1;
        unusedTotal += unused.length;
        if (sensitivityExamples.length < 20) {
          sensitivityExamples.push({ declaration: name, unused: unused.map((h) => h.symbol) });
        }
      }
    }

    if (analysis.math.trust.usesSorry) usesSorry.push(name);
    if (analysis.math.trust.unusualAxioms.length > 0) {
      unusualAxioms.push({ declaration: name, axioms: analysis.math.trust.unusualAxioms });
    }

    for (const visual of analysis.visuals) {
      byFigureType.set(visual.type, (byFigureType.get(visual.type) ?? 0) + 1);
      byStatus.set(visual.epistemic, (byStatus.get(visual.epistemic) ?? 0) + 1);
    }
  }

  const declarations = bundle.analyses.length;
  const fullyReadable = classified - classifiedWithOpaque;

  const unrecognisedShapes = rank(unrecognised);
  const unrecognisedHeads = new Set(unrecognisedShapes.map((m) => m.head));
  const opaqueConstants = rank(opaque).map((miss) =>
    unrecognisedHeads.has(miss.head) ? { ...miss, alsoUnrecognised: true } : miss,
  );

  return {
    modules: bundle.generatedFrom.modules,
    notationFidelity: bundle.generatedFrom.notationFidelity,
    totals: {
      declarations,
      theorems,
      definitions,
      classified,
      unsupported: declarations - classified,
      classifiedWithOpaqueTerms: classifiedWithOpaque,
      fullyReadable,
    },
    rates: {
      classified: declarations === 0 ? 0 : classified / declarations,
      fullyReadable: declarations === 0 ? 0 : fullyReadable / declarations,
    },
    byClassification: Array.from(byKind.entries())
      .map(([kind, set]) => ({ kind, declarations: set.size }))
      .sort((a, b) => b.declarations - a.declarations),
    unrecognisedShapes,
    opaqueConstants,
    assumptionSensitivity: {
      analysed: sensitivityAnalysed,
      withUnusedHypotheses: withUnused,
      unusedHypotheses: unusedTotal,
      examples: sensitivityExamples,
    },
    trust: { usesSorry, unusualAxioms },
    figures: {
      planned: bundle.summary.visualsPlanned,
      byType: Array.from(byFigureType.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      byEpistemicStatus: Array.from(byStatus.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}

/** Unused-argument guard so the analysis type stays exported for consumers. */
export type { TheoremAnalysis };
