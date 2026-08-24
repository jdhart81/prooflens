import type { TheoremAnalysis } from "@prooflens/pipeline";
import type { VisualSpec } from "@prooflens/visual-ir";
import { prettyJson } from "../lib/format.js";
import { ProvenanceTable } from "./ProvenanceTable.js";
import { Tabs, type TabItem } from "./Tabs.js";

export type StageId = "provenance" | "math" | "visual" | "formal" | "classifier";

const STAGE_TABS: readonly TabItem<StageId>[] = [
  { id: "provenance", label: "Provenance" },
  { id: "math", label: "MathIR" },
  { id: "visual", label: "VisualIR" },
  { id: "formal", label: "Formal IR" },
  { id: "classifier", label: "Classifier" },
];

const STAGE_NOTE: Record<StageId, string> = {
  provenance: "Every mark in the selected figure, and what put it there.",
  math: "Stage 2 — the structured reading of the declaration, before any classifier ran.",
  visual: "Stage 4 — what to show, never how to draw it. The renderer consumes only this.",
  formal: "Stage 1 — exactly what came out of Lean. Nothing above it can be stronger than this.",
  classifier: "Stage 3 — which structural rules fired, with the evidence that made them fire.",
};

interface StagePanelsProps {
  analysis: TheoremAnalysis;
  activeStage: StageId;
  onSelectStage: (stage: StageId) => void;
  selectedSpec: VisualSpec | undefined;
}

/**
 * Invariant 10: every pipeline stage stays inspectable. These are the raw
 * objects the UI above was built from — not a summary of them.
 */
export function StagePanels({
  analysis,
  activeStage,
  onSelectStage,
  selectedSpec,
}: StagePanelsProps): JSX.Element {
  return (
    <section className="panel panel--stages" aria-labelledby="stages-heading">
      <h2 id="stages-heading" className="sr-only">
        Pipeline stages
      </h2>
      <Tabs
        items={STAGE_TABS}
        activeId={activeStage}
        onSelect={onSelectStage}
        label="Pipeline stages"
        idPrefix="stage"
      />
      <div
        className="stage-body"
        role="tabpanel"
        id={`stage-panel-${activeStage}`}
        aria-labelledby={`stage-tab-${activeStage}`}
        tabIndex={0}
      >
        <p className="panel__note">{STAGE_NOTE[activeStage]}</p>
        {activeStage === "provenance" ? (
          <ProvenanceTable spec={selectedSpec} />
        ) : (
          <StageJson stage={activeStage} analysis={analysis} />
        )}
      </div>
    </section>
  );
}

function StageJson({
  stage,
  analysis,
}: {
  stage: Exclude<StageId, "provenance">;
  analysis: TheoremAnalysis;
}): JSX.Element {
  const value =
    stage === "math"
      ? analysis.math
      : stage === "visual"
        ? analysis.visuals
        : stage === "formal"
          ? analysis.formal
          : { primary: analysis.primary ?? null, classifications: analysis.classifications };

  const text = prettyJson(value);
  return (
    <details className="stage-details" open>
      <summary>
        {stage === "classifier" ? "classifications" : stage} · {text.length.toLocaleString()}{" "}
        characters
      </summary>
      <pre className="json" tabIndex={0} aria-label={`${stage} JSON`}>
        <code>{text}</code>
      </pre>
    </details>
  );
}
