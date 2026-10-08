import { describe, expect, it } from "vitest";
import { classifyTheorem, dependencyGraph, type DependencyGraph } from "@prooflens/classifier";
import { lowerDocument } from "@prooflens/math-ir";
import { planVisuals } from "@prooflens/visual-ir";
import { renderSvg } from "@prooflens/renderer-svg";
import { renderText } from "@prooflens/renderer-text";
import { corpus } from "../../pipeline/test/helpers.js";
import { opaqueProp, synthetic } from "../../classifier/test/synthetic.js";

const target = synthetic(opaqueProp("∃ v, GoodVertex r v"), {
  name: "OAI.SeymourSecondNeighborhood.exists_goodVertex",
  usesSorry: true,
  hypotheses: [{ symbol: "hr", proposition: opaqueProp("IsOriented r"), unusedInProof: true }],
});
const graph: DependencyGraph = {
  nodes: [
    { id: target.id, label: "exists_goodVertex", kind: "theorem", depth: 1, concept: null },
    { id: "GoodVertex", label: "GoodVertex", kind: "definition", depth: 0, concept: null },
  ],
  edges: [{ from: target.id, to: "GoodVertex" }],
  externalDependencyCount: 7,
};

describe("admitted targets describe their statements", () => {
  it("keeps the oriented-graph assumption neutral without inventing a proof finding", () => {
    const specs = planVisuals(target, classifyTheorem(target), { dependencies: graph });
    expect(specs.map((s) => s.type)).toEqual(["dependency-graph", "expression-tree"]);
    const structure = specs.find((s) => s.type === "expression-tree")!;
    expect(structure.entities.find((e) => e.kind === "hypothesis")!.state).toBe("neutral");
    const svg = renderSvg(structure, { animate: true });
    expect(svg).not.toContain("NEVER USED IN THIS PROOF");
    expect(svg).not.toMatch(/class="pl-edge-used(?: |")/);
    expect(svg).toContain("Proof use has not been analysed");
    expect(svg).toContain("sorryAx");
    expect(renderText(structure)).not.toContain("never used by this proof");
  });

  it("carries the admission warning on each exportable view and its accessible description", () => {
    for (const spec of planVisuals(target, classifyTheorem(target), { dependencies: graph })) {
      const warnings = spec.annotations.filter((a) => a.id === "warning:sorry");
      expect(warnings, spec.id).toHaveLength(1);
      expect(warnings[0]!.text).toContain("This extracted declaration is admitted");
      expect(renderSvg(spec).match(/<desc[^>]*>(.*?)<\/desc>/s)?.[1], spec.id).toContain("sorryAx");
      expect(renderText(spec), spec.id).toContain("sorryAx");
    }
  });

  it("does not revive stale completed-proof analyses in the visual planner", () => {
    const completed = { ...target, trust: { ...target.trust, usesSorry: false } };
    const classifications = classifyTheorem(completed);
    expect(classifications.map((c) => c.payload.kind)).toContain("assumption-sensitivity");
    const specs = planVisuals(target, classifications);
    expect(specs.map((s) => s.type)).not.toContain("assumption-sensitivity");
    expect(specs[0]!.entities.find((e) => e.kind === "hypothesis")!.state).toBe("neutral");
  });

  it("does not revive binder counts when the proof term is unavailable", () => {
    const completed = { ...target, trust: { ...target.trust, usesSorry: false } };
    const unavailable = {
      ...completed,
      trust: { ...completed.trust, proofTermAvailable: false },
    };
    const specs = planVisuals(unavailable, classifyTheorem(completed));
    expect(specs.map((s) => s.type)).not.toContain("assumption-sensitivity");
    expect(specs[0]!.entities.find((e) => e.kind === "hypothesis")!.state).toBe("neutral");
  });

  it("preserves meaningful assumption findings for the extracted completed-proof fixture", () => {
    const theorem = lowerDocument(corpus()).theorems.find((t) =>
      t.name.endsWith(".simple_upper_bound"),
    )!;
    const spec = planVisuals(theorem, classifyTheorem(theorem))[0]!;
    expect(spec.type).toBe("assumption-sensitivity");
    expect(spec.entities.filter((e) => e.state === "unused").map((e) => e.label)).toEqual([
      "hP",
      "hT",
    ]);
    expect(renderSvg(spec)).toContain("NEVER USED IN THIS PROOF");
    expect(renderText(spec)).toContain("never appear in this proof term");
    expect(spec.annotations.some((a) => a.id === "warning:sorry")).toBe(false);
  });
});

describe("declaration-reference captions", () => {
  it("describes combined statement and body references consistently", () => {
    const claim = dependencyGraph(corpus());
    expect(claim.provenance.note).toContain("statements and bodies");
    expect(claim.provenance.rule!.description).toContain("proof-only use is not distinguished");
    const spec = planVisuals(target, classifyTheorem(target), { dependencies: graph }).find(
      (s) => s.type === "dependency-graph",
    )!;
    expect(spec.title).toBe("Declaration references");
    expect(spec.annotations.find((a) => a.id === "rationale")!.text).toContain(
      "They do not distinguish proof use from statement use",
    );
    expect(spec.annotations.find((a) => a.id === "external")!.text).toContain(
      "Across the entire extraction, 7 declaration references",
    );
    expect(spec.annotations.find((a) => a.id === "external")!.text).toContain(
      "not a count for this local graph alone",
    );
    const svg = renderSvg(spec, { animate: true });
    expect(svg).toContain("proof-only use is not distinguished");
    expect(svg).toContain("Order of appearance follows the figure&apos;s displayed structure");
    expect(svg).not.toContain("this proof references");
    expect(svg).not.toContain("proof&apos;s dependency structure");
  });
});
