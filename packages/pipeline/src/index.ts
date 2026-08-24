/**
 * @prooflens/pipeline
 *
 * Runs the deterministic core end to end and keeps every intermediate stage.
 *
 * The stages are not internal details. Invariant 10 requires that a user be
 * able to inspect each one, so the bundle this module produces carries the
 * Formal IR, the MathIR, the classifications, the explanations and the VisualIR
 * side by side rather than discarding them as it goes.
 *
 * @packageDocumentation
 */
import {
  parseFormalIR,
  parseFormalIRJson,
  type FormalDeclaration,
  type FormalIRDocument,
} from "@prooflens/formal-ir";
import { lowerDocument, type MathIRDocument, type TheoremIR } from "@prooflens/math-ir";
import {
  classifyTheorem,
  dependencyGraph,
  explain,
  primaryClassification,
  type Classification,
  type DependencyGraph,
  type ExplanationLayer,
} from "@prooflens/classifier";
import { planVisuals, type VisualSpec } from "@prooflens/visual-ir";
import type { EpistemicStatus } from "@prooflens/epistemics";

export interface TheoremAnalysis {
  formal: FormalDeclaration;
  math: TheoremIR;
  classifications: Classification[];
  primary: Classification | undefined;
  explanations: ExplanationLayer[];
  visuals: VisualSpec[];
  /** True when no structural classifier recognised the conclusion. */
  unsupported: boolean;
}

export interface PipelineBundle {
  prooflensVersion: string;
  generatedFrom: {
    system: string;
    toolchain: string;
    modules: string[];
    notationFidelity: "notation" | "raw";
  };
  formal: FormalIRDocument;
  math: MathIRDocument;
  dependencies: DependencyGraph;
  analyses: TheoremAnalysis[];
  summary: PipelineSummary;
}

export interface PipelineSummary {
  declarations: number;
  classified: number;
  unsupported: number;
  withUnusedHypotheses: number;
  withSorry: number;
  withUnusualAxioms: number;
  visualsPlanned: number;
  /** Distribution of epistemic status across every planned figure. */
  epistemicHistogram: Record<string, number>;
}

export const PROOFLENS_VERSION = "0.1.0";

/** Run the whole deterministic pipeline over an already-parsed Formal IR document. */
export function runPipeline(formal: FormalIRDocument): PipelineBundle {
  const math = lowerDocument(formal);
  const graph = dependencyGraph(formal);
  const byName = new Map(formal.declarations.map((d) => [d.name, d]));

  const analyses: TheoremAnalysis[] = math.theorems.map((theorem) => {
    const declaration = byName.get(theorem.name)!;
    const classifications = classifyTheorem(theorem);
    const explanations = explain(theorem, classifications, {
      formalDocument: formal,
      formalDeclaration: declaration,
    });
    const visuals = planVisuals(theorem, classifications, { dependencies: graph.value });
    return {
      formal: declaration,
      math: theorem,
      classifications,
      primary: primaryClassification(classifications),
      explanations,
      visuals,
      unsupported: classifications.some((c) => c.payload.kind === "unsupported"),
    };
  });

  return {
    prooflensVersion: PROOFLENS_VERSION,
    generatedFrom: {
      system: formal.system,
      toolchain: formal.toolchain,
      modules: formal.modules,
      notationFidelity: formal.notationFidelity,
    },
    formal,
    math,
    dependencies: graph.value,
    analyses,
    summary: summarise(analyses),
  };
}

export function runPipelineOnJson(text: string): PipelineBundle {
  return runPipeline(parseFormalIRJson(text));
}

export function runPipelineOnValue(value: unknown): PipelineBundle {
  return runPipeline(parseFormalIR(value));
}

function summarise(analyses: readonly TheoremAnalysis[]): PipelineSummary {
  const histogram: Record<string, number> = {};
  let visuals = 0;
  for (const a of analyses) {
    for (const v of a.visuals) {
      visuals += 1;
      histogram[v.epistemic] = (histogram[v.epistemic] ?? 0) + 1;
    }
  }
  return {
    declarations: analyses.length,
    classified: analyses.filter((a) => !a.unsupported).length,
    unsupported: analyses.filter((a) => a.unsupported).length,
    withUnusedHypotheses: analyses.filter((a) =>
      a.classifications.some(
        (c) =>
          c.payload.kind === "assumption-sensitivity" && c.payload.data.unusedInProof.length > 0,
      ),
    ).length,
    withSorry: analyses.filter((a) => a.math.trust.usesSorry).length,
    withUnusualAxioms: analyses.filter((a) => a.math.trust.unusualAxioms.length > 0).length,
    visualsPlanned: visuals,
    epistemicHistogram: histogram,
  };
}

/** Find one analysis by declaration name, accepting the short name too. */
export function findAnalysis(bundle: PipelineBundle, name: string): TheoremAnalysis | undefined {
  return (
    bundle.analyses.find((a) => a.math.name === name) ??
    bundle.analyses.find((a) => a.math.name.split(".").pop() === name)
  );
}

/** The weakest epistemic status appearing anywhere in an analysis. */
export function analysisCeiling(analysis: TheoremAnalysis): EpistemicStatus {
  return analysis.math.ceiling;
}
