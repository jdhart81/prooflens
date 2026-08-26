/**
 * Inline VisualSpec fixtures.
 *
 * Deliberately hand-built rather than produced by the pipeline: the renderers
 * are contractually bound to VisualIR, not to the Lean corpus, and a test that
 * needs a corpus cannot tell you which of the two broke.
 */
import type { VisualSpec } from "@prooflens/visual-ir";

const PROVENANCE: VisualSpec["provenance"] = {
  sources: [{ system: "lean4", declaration: "Test.thm", path: "conclusion" }],
  inputs: ["Test.thm"],
};

/** A strict upper bound with permitted / excluded regions and a schematic axis. */
export function upperBoundSpec(overrides: Partial<VisualSpec> = {}): VisualSpec {
  return {
    id: "Test.thm:upper-bound",
    type: "upper-bound-plot",
    title: "x < P / T",
    subtitle: "power-limited rate bound",
    entities: [
      {
        id: "bounded",
        kind: "quantity",
        label: "x",
        detail: "operations per second",
        position: { x: 0.32 },
        emphasis: "primary",
        state: "permitted",
        epistemic: "derived",
      },
      {
        id: "bound",
        kind: "bound",
        label: "P / T",
        position: { x: 0.5 },
        emphasis: "primary",
        state: "excluded",
        epistemic: "derived",
      },
      {
        id: "permitted-region",
        kind: "region",
        label: "x may lie here",
        position: { x: 0.25 },
        state: "permitted",
        emphasis: "secondary",
        epistemic: "derived",
      },
      {
        id: "excluded-region",
        kind: "region",
        label: "ruled out by the theorem",
        position: { x: 0.75 },
        state: "excluded",
        emphasis: "muted",
        epistemic: "derived",
      },
    ],
    relationships: [
      {
        id: "bounded-by",
        kind: "bounded-by",
        from: "bounded",
        to: "bound",
        label: "strictly",
        epistemic: "derived",
      },
    ],
    axes: [
      {
        id: "value",
        orientation: "horizontal",
        label: "operation rate",
        units: "ops/s",
        scale: "schematic",
        ticks: [{ at: 0.5, label: "P / T", emphasis: "primary" }],
        epistemic: "illustrative",
      },
    ],
    annotations: [
      {
        id: "rationale",
        kind: "rationale",
        text: "The conclusion puts x on the smaller side of <.",
        epistemic: "derived",
      },
      {
        id: "warn",
        kind: "warning",
        text: "This statement is not proved: its proof reaches `sorryAx`.",
        epistemic: "derived",
      },
      { id: "note", kind: "legend", text: "Positions are schematic.", epistemic: "illustrative" },
    ],
    epistemic: "illustrative",
    provenance: PROVENANCE,
    rationale: "The conclusion puts x on the smaller side of <, so P / T is an upper bound.",
    ...overrides,
  };
}

/** The flagship figure: three hypotheses, two of which the proof never uses. */
export function assumptionSpec(overrides: Partial<VisualSpec> = {}): VisualSpec {
  return {
    id: "Test.thm:assumptions",
    type: "assumption-sensitivity",
    title: "Which assumptions the proof actually uses",
    subtitle: "simple_upper_bound",
    entities: [
      {
        id: "hyp:h",
        kind: "hypothesis",
        label: "h",
        detail: "x ≤ P / T",
        position: { layer: 0, order: 0 },
        emphasis: "primary",
        state: "used",
        epistemic: "derived",
      },
      {
        id: "hyp:hP",
        kind: "hypothesis",
        label: "hP",
        detail: "0 < P",
        position: { layer: 0, order: 1 },
        emphasis: "muted",
        state: "unused",
        epistemic: "derived",
      },
      {
        id: "hyp:hT",
        kind: "hypothesis",
        label: "hT",
        detail: "0 < T",
        position: { layer: 0, order: 2 },
        emphasis: "muted",
        state: "unused",
        epistemic: "derived",
      },
      {
        id: "conclusion",
        kind: "conclusion",
        label: "x ≤ P / T",
        position: { layer: 1, order: 0 },
        emphasis: "primary",
        epistemic: "verified",
      },
    ],
    relationships: [
      {
        id: "uses:h",
        kind: "supports",
        from: "hyp:h",
        to: "conclusion",
        state: "used",
        epistemic: "derived",
      },
    ],
    axes: [],
    annotations: [
      {
        id: "callout",
        kind: "callout",
        text: "2 of 3 hypotheses are never used.",
        epistemic: "derived",
      },
    ],
    epistemic: "derived",
    provenance: PROVENANCE,
    rationale: "`hP`, `hT` do not occur in the elaborated proof term.",
    ...overrides,
  };
}

/** A layered dependency graph with a repeated node and a labelled edge. */
export function graphSpec(type: VisualSpec["type"] = "dependency-graph"): VisualSpec {
  return {
    id: "Test.thm:dependencies",
    type,
    title: "What this proof rests on",
    subtitle: "energy_ops_bound",
    entities: [
      {
        id: "a",
        kind: "node",
        label: "energy_ops_bound",
        detail: "theorem",
        position: { layer: 0, order: 0 },
        emphasis: "primary",
        epistemic: "derived",
      },
      {
        id: "b",
        kind: "node",
        label: "landauerCost",
        detail: "definition",
        position: { layer: 1, order: 0 },
        emphasis: "secondary",
        epistemic: "derived",
      },
      {
        id: "c",
        kind: "node",
        label: "log_two_pos",
        detail: "theorem",
        position: { layer: 1, order: 1 },
        emphasis: "secondary",
        epistemic: "heuristic",
      },
    ],
    relationships: [
      { id: "e0", kind: "depends-on", from: "a", to: "b", epistemic: "derived" },
      { id: "e1", kind: "depends-on", from: "a", to: "c", label: "uses", epistemic: "derived" },
    ],
    axes: [],
    annotations: [
      {
        id: "legend",
        kind: "legend",
        text: "Edges are declarations the proof term references.",
        epistemic: "derived",
      },
    ],
    epistemic: "derived",
    provenance: PROVENANCE,
    rationale: "A dependency graph is read directly from the proof term.",
  };
}

/** A monotonicity plot with two sample points. */
export function monotonicitySpec(
  direction: "increasing" | "decreasing" = "increasing",
): VisualSpec {
  return {
    id: "Test.thm:monotonicity",
    type: "monotonicity-plot",
    title: `Monotone f`,
    entities: [
      {
        id: "function",
        kind: "function",
        label: "f",
        detail: `strictly ${direction}`,
        position: { x: 0.5, y: 0.5 },
        emphasis: "primary",
        epistemic: "derived",
      },
      {
        id: "input-lower",
        kind: "label",
        label: "u",
        position: { x: 0.2, y: 0 },
        epistemic: "illustrative",
      },
      {
        id: "input-upper",
        kind: "label",
        label: "v",
        position: { x: 0.8, y: 0 },
        epistemic: "illustrative",
      },
    ],
    relationships: [
      {
        id: "order",
        kind: "maps-to",
        from: "input-lower",
        to: "input-upper",
        label: "u ≤ v ⟹ f u ≤ f v",
        epistemic: "derived",
      },
    ],
    axes: [
      {
        id: "input",
        orientation: "horizontal",
        label: "input",
        scale: "schematic",
        ticks: [],
        epistemic: "illustrative",
      },
      {
        id: "output",
        orientation: "vertical",
        label: "output",
        scale: "schematic",
        ticks: [],
        epistemic: "illustrative",
      },
    ],
    annotations: [
      {
        id: "shape",
        kind: "legend",
        text: "The drawn curve is arbitrary.",
        epistemic: "illustrative",
      },
    ],
    epistemic: "illustrative",
    provenance: PROVENANCE,
    rationale: "The conclusion applies `Monotone`.",
  };
}

/**
 * A limit plot, shaped exactly as `planLimit` emits one.
 *
 * `"convergent"` carries the `limit-value` entity and the output-axis tick;
 * the two divergent variants carry neither, and differ only in the function's
 * `detail` — which is the only thing that says which way the values leave.
 */
export function limitSpec(
  variant: "convergent" | "grows" | "decreases" = "convergent",
): VisualSpec {
  const convergent = variant === "convergent";
  const divergenceLabel =
    variant === "decreases" ? "decreases without bound" : "grows without bound";
  const entities: VisualSpec["entities"] = [
    {
      id: "function",
      kind: "function",
      label: "n ↦ 1 / (n + 1)",
      detail: convergent ? "approaches 0" : divergenceLabel,
      position: { x: 0.5, y: convergent ? 0.35 : 0.5 },
      emphasis: "primary",
      epistemic: "derived",
    },
    {
      id: "direction",
      kind: "label",
      label: "+∞",
      detail: "input grows without bound",
      position: { x: 0.95, y: 0 },
      emphasis: "secondary",
      epistemic: "derived",
    },
  ];
  if (convergent) {
    entities.push({
      id: "limit-value",
      kind: "bound",
      label: "0",
      detail: "the limit",
      position: { x: 0.5, y: 0.3 },
      emphasis: "primary",
      state: "permitted",
      epistemic: "derived",
    });
  }

  return {
    id: `Test.thm:limit-${variant}`,
    type: "limit-plot",
    title: convergent ? "n ↦ 1 / (n + 1) ⟶ 0" : `n ↦ 1 / (n + 1) ${divergenceLabel}`,
    subtitle: "convergence of a harmonic sequence",
    entities,
    relationships: convergent
      ? [
          {
            id: "approaches",
            kind: "maps-to",
            from: "function",
            to: "limit-value",
            label: "as the input grows without bound",
            epistemic: "derived",
          },
        ]
      : [],
    axes: [
      {
        id: "input",
        orientation: "horizontal",
        label: "input (grows without bound)",
        scale: "schematic",
        ticks: [],
        epistemic: "illustrative",
      },
      {
        id: "output",
        orientation: "vertical",
        label: "value",
        scale: "schematic",
        ticks: convergent ? [{ at: 0.3, label: "0", emphasis: "primary" }] : [],
        epistemic: "illustrative",
      },
    ],
    annotations: [
      {
        id: "rationale",
        kind: "rationale",
        text: "The conclusion is a `Filter.Tendsto` along `atTop`.",
        epistemic: "derived",
      },
      {
        id: "shape-notice",
        kind: "legend",
        text: convergent
          ? "The drawn curve is one arbitrary function with the proved limit."
          : "The theorem says the values leave every bound.",
        epistemic: "illustrative",
      },
    ],
    epistemic: "illustrative",
    provenance: PROVENANCE,
    rationale: "The conclusion is a `Filter.Tendsto` along `atTop`.",
  };
}

/** The structural fallback. */
export function expressionTreeSpec(): VisualSpec {
  return {
    id: "Test.thm:structure",
    type: "expression-tree",
    title: "Formal structure",
    subtitle: "unsupported_fixture",
    entities: [
      {
        id: "conclusion",
        kind: "conclusion",
        label: "Tendsto(n ↦ 1 / (n + 1), atTop, nhds(0))",
        position: { layer: 0, order: 0 },
        emphasis: "primary",
        epistemic: "derived",
      },
      {
        id: "hyp:h0",
        kind: "hypothesis",
        label: "h0 : 0 < n",
        position: { layer: 1, order: 0 },
        emphasis: "secondary",
        state: "used",
        epistemic: "derived",
      },
      {
        id: "hyp:h1",
        kind: "hypothesis",
        label: "h1 : n ≤ 10",
        position: { layer: 1, order: 1 },
        emphasis: "secondary",
        state: "unused",
        epistemic: "derived",
      },
    ],
    relationships: [
      { id: "assume:h0", kind: "supports", from: "hyp:h0", to: "conclusion", epistemic: "derived" },
      { id: "assume:h1", kind: "supports", from: "hyp:h1", to: "conclusion", epistemic: "derived" },
    ],
    axes: [],
    annotations: [
      { id: "graceful", kind: "legend", text: "Nothing here is guessed.", epistemic: "derived" },
    ],
    epistemic: "derived",
    provenance: PROVENANCE,
    rationale: "`Filter.Tendsto` is not in ProofLens's constant table yet.",
  };
}

/** A spec whose `type` no renderer knows about. */
export function unknownTypeSpec(): VisualSpec {
  return {
    id: "Test.thm:mystery",
    // Deliberately outside the VisualType union: renderers must survive a
    // VisualIR version that is newer than they are.
    type: "hyperbolic-manifold-plot" as VisualSpec["type"],
    title: "Something from the future",
    entities: [
      {
        id: "n1",
        kind: "node",
        label: "α",
        detail: "unrecognised",
        position: {},
        epistemic: "speculative",
      },
    ],
    relationships: [{ id: "r1", kind: "implies", from: "n1", to: "n1", epistemic: "speculative" }],
    axes: [
      {
        id: "ax",
        orientation: "vertical",
        label: "unknown",
        scale: "numeric",
        ticks: [],
        epistemic: "heuristic",
      },
    ],
    annotations: [],
    epistemic: "speculative",
    provenance: PROVENANCE,
    rationale: "No classifier recognised this statement.",
  };
}

/** A spec with nothing in it at all. */
export function emptySpec(): VisualSpec {
  return {
    id: "Test.thm:empty",
    type: "text-diagram",
    title: "Empty",
    entities: [],
    relationships: [],
    axes: [],
    annotations: [],
    epistemic: "illustrative",
    provenance: { sources: [] },
    rationale: "Nothing to show.",
  };
}

/** Text that must be escaped everywhere it appears. */
export const HOSTILE_LABEL = `<&">' <script>alert(1)</script>`;
