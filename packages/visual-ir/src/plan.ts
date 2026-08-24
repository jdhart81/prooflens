import { weakest, type EpistemicStatus, type SourceReference } from "@prooflens/epistemics";
import type { FormalIRDocument } from "@prooflens/formal-ir";
import {
  renderExpression,
  renderProposition,
  variablesIn,
  type TheoremIR,
} from "@prooflens/math-ir";
import {
  dependencyGraph,
  subgraphFor,
  DIRECTION_PHRASE,
  type Classification,
  type DependencyGraph,
} from "@prooflens/classifier";
import {
  VISUAL_IR_VERSION,
  type VisualAnnotation,
  type VisualSpec,
  type VisualType,
} from "./types.js";

/**
 * The visualization planner.
 *
 * MathIR plus classifications go in; VisualIR comes out. Two rules govern
 * everything here:
 *
 *  - Every spec must carry a `rationale` naming the evidence that selected it.
 *  - Anything chosen for legibility rather than mathematics is `illustrative`.
 *    A schematic axis makes no claim about magnitudes, and saying so is not
 *    pedantry: it is the difference between a diagram and a lie.
 */

interface PlanContext {
  formal?: FormalIRDocument;
  dependencies?: DependencyGraph;
}

function refFor(theorem: TheoremIR, path?: string): SourceReference {
  const base = theorem.provenance.sources[0];
  const ref: SourceReference = base ? { ...base } : { system: "lean4", declaration: theorem.name };
  if (path !== undefined) ref.path = path;
  return ref;
}

function epistemicNotice(status: EpistemicStatus, what: string): VisualAnnotation {
  return {
    id: `notice:${what}`,
    kind: "legend",
    text:
      status === "illustrative"
        ? "Positions in this figure are schematic. They show which side of the bound a quantity lies on, not how large anything is."
        : `This figure is ${status}.`,
    epistemic: "illustrative",
  };
}

/** Feasible-region diagram for a bound. */
function planBound(
  theorem: TheoremIR,
  classification: Classification,
  direction: "upper" | "lower",
): VisualSpec | null {
  const payload = classification.payload;
  if (payload.kind !== "upper-bound" && payload.kind !== "lower-bound") return null;
  const { boundedQuantity, bound, strict, sensitivity } = payload.data;

  const boundedLabel = renderExpression(boundedQuantity);
  const boundLabel = renderExpression(bound);
  const status = classification.claim.status;

  const boundedAnnotation = theorem.variables.find(
    (v) => boundedQuantity.kind === "variable" && v.id === boundedQuantity.id,
  )?.annotation;

  const permittedSide = direction === "upper" ? "left" : "right";

  const annotations: VisualAnnotation[] = [
    {
      id: "rationale",
      kind: "rationale",
      text: classification.rationale,
      epistemic: status,
    },
    epistemicNotice("illustrative", "axis"),
  ];

  for (const s of sensitivity) {
    annotations.push({
      id: `sensitivity:${s.variableId}`,
      kind: "callout",
      text: `Increasing ${s.symbol} ${DIRECTION_PHRASE[s.direction]} the bound.`,
      target: "bound",
      epistemic: "derived",
    });
  }

  if (theorem.trust.usesSorry) {
    annotations.push({
      id: "warning:sorry",
      kind: "warning",
      text: "This statement is not proved: its proof reaches `sorryAx`.",
      epistemic: "derived",
    });
  }

  return {
    id: `${theorem.id}:${direction}-bound`,
    type: direction === "upper" ? "upper-bound-plot" : "lower-bound-plot",
    title: `${boundedLabel} ${direction === "upper" ? (strict ? "<" : "≤") : strict ? ">" : "≥"} ${boundLabel}`,
    subtitle: theorem.concept ?? theorem.name.split(".").pop(),
    entities: [
      {
        id: "bounded",
        kind: "quantity",
        label: boundedLabel,
        detail: boundedAnnotation?.meaning
          ? `${boundedAnnotation.meaning}${boundedAnnotation.units ? ` (${boundedAnnotation.units})` : ""}`
          : undefined,
        position: { x: direction === "upper" ? 0.32 : 0.68 },
        emphasis: "primary",
        state: "permitted",
        epistemic: status,
        sourceRef: refFor(theorem, boundedQuantity.path),
      },
      {
        id: "bound",
        kind: "bound",
        label: boundLabel,
        position: { x: 0.5 },
        emphasis: "primary",
        state: strict ? "excluded" : "permitted",
        epistemic: status,
        sourceRef: refFor(theorem, bound.path),
      },
      {
        id: "permitted-region",
        kind: "region",
        label: `${boundedLabel} may lie here`,
        position: { x: permittedSide === "left" ? 0.25 : 0.75 },
        state: "permitted",
        emphasis: "secondary",
        // The region is a real consequence of the theorem; only its drawn
        // extent is a display choice.
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
      },
      {
        id: "excluded-region",
        kind: "region",
        label: `ruled out by the theorem`,
        position: { x: permittedSide === "left" ? 0.75 : 0.25 },
        state: "excluded",
        emphasis: "muted",
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
      },
    ],
    relationships: [
      {
        id: "bounded-by",
        kind: "bounded-by",
        from: "bounded",
        to: "bound",
        label: strict ? "strictly" : "at most",
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
      },
    ],
    axes: [
      {
        id: "value",
        orientation: "horizontal",
        label: boundedAnnotation?.meaning ?? boundedLabel,
        units: boundedAnnotation?.units,
        scale: "schematic",
        ticks: [{ at: 0.5, label: boundLabel, emphasis: "primary" }],
        // Nothing here is measured. Saying otherwise would be a fabrication.
        epistemic: "illustrative",
      },
    ],
    annotations,
    epistemic: weakest(status, "illustrative"),
    provenance: {
      sources: [refFor(theorem, "conclusion")],
      rule: classification.rule,
      inputs: [theorem.id],
    },
    rationale: classification.rationale,
  };
}

/** `0 < e`: a number line with zero marked and the quantity on one side of it. */
function planPositivity(theorem: TheoremIR, classification: Classification): VisualSpec | null {
  if (classification.payload.kind !== "positivity") return null;
  const { quantity, strict, sense } = classification.payload.data;
  const status = classification.claim.status;
  const label = renderExpression(quantity);

  // Which side of zero the quantity sits on drives the entire figure. Drawing a
  // negative fact on the positive side would be a confident wrong picture.
  const positive = sense === "positive";
  const zeroAt = positive ? 0.32 : 0.68;
  const quantityAt = positive ? 0.68 : 0.32;
  const comparator = positive ? (strict ? ">" : "≥") : strict ? "<" : "≤";

  return {
    id: `${theorem.id}:positivity`,
    type: "number-line",
    title: `${label} ${comparator} 0`,
    subtitle: theorem.concept ?? theorem.name.split(".").pop(),
    entities: [
      {
        id: "zero",
        kind: "bound",
        label: "0",
        position: { x: zeroAt },
        emphasis: "secondary",
        state: strict ? "excluded" : "permitted",
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
      },
      {
        id: "quantity",
        kind: "quantity",
        label,
        position: { x: quantityAt },
        emphasis: "primary",
        state: "permitted",
        epistemic: status,
        sourceRef: refFor(theorem, quantity.path),
      },
      {
        id: "permitted-region",
        kind: "region",
        label: `${label} lies here`,
        position: { x: positive ? 0.72 : 0.28 },
        state: "permitted",
        emphasis: "secondary",
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
      },
      {
        id: "excluded-region",
        kind: "region",
        label: "ruled out by the theorem",
        position: { x: positive ? 0.14 : 0.86 },
        state: "excluded",
        emphasis: "muted",
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
      },
    ],
    relationships: [
      {
        id: "sign",
        kind: "bounded-by",
        from: positive ? "zero" : "quantity",
        to: positive ? "quantity" : "zero",
        label: strict ? "strictly less than" : "at most",
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
      },
    ],
    axes: [
      {
        id: "value",
        orientation: "horizontal",
        label,
        scale: "schematic",
        ticks: [{ at: zeroAt, label: "0", emphasis: "primary" }],
        epistemic: "illustrative",
      },
    ],
    annotations: [
      { id: "rationale", kind: "rationale", text: classification.rationale, epistemic: status },
      epistemicNotice("illustrative", "axis"),
    ],
    epistemic: weakest(status, "illustrative"),
    provenance: {
      sources: [refFor(theorem, "conclusion")],
      rule: classification.rule,
      inputs: [theorem.id],
    },
    rationale: classification.rationale,
  };
}

/** Monotonicity: a schematic curve with its direction of travel. */
function planMonotonicity(theorem: TheoremIR, classification: Classification): VisualSpec | null {
  if (classification.payload.kind !== "monotonicity") return null;
  const { direction, strict, subject, predicateName } = classification.payload.data;
  const status = classification.claim.status;
  const label = subject ? renderExpression(subject) : "f";

  return {
    id: `${theorem.id}:monotonicity`,
    type: "monotonicity-plot",
    title: `${predicateName} ${label}`,
    subtitle: theorem.concept ?? theorem.name.split(".").pop(),
    entities: [
      {
        id: "function",
        kind: "function",
        label,
        detail: `${strict ? "strictly " : ""}${direction}`,
        position: { x: 0.5, y: 0.5 },
        emphasis: "primary",
        epistemic: status,
        sourceRef: refFor(theorem, subject?.path ?? "conclusion"),
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
        id: "order-preserved",
        kind: "maps-to",
        from: "input-lower",
        to: "input-upper",
        label: direction === "increasing" ? "u ≤ v ⟹ f u ≤ f v" : "u ≤ v ⟹ f v ≤ f u",
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
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
      { id: "rationale", kind: "rationale", text: classification.rationale, epistemic: status },
      {
        id: "shape-notice",
        kind: "legend",
        text: "The drawn curve is one arbitrary function with the proved order property. The theorem constrains the ordering, not the shape.",
        epistemic: "illustrative",
      },
    ],
    epistemic: weakest(status, "illustrative"),
    provenance: {
      sources: [refFor(theorem, "conclusion")],
      rule: classification.rule,
      inputs: [theorem.id],
    },
    rationale: classification.rationale,
  };
}

/**
 * Assumption sensitivity — the flagship figure.
 *
 * Every stated hypothesis becomes a node; the ones the proof term never touches
 * are drawn detached. Unlike the plots, nothing here is schematic: each node's
 * state is a mechanical fact about the elaborated term.
 */
function planAssumptionSensitivity(
  theorem: TheoremIR,
  classification: Classification,
): VisualSpec | null {
  if (classification.payload.kind !== "assumption-sensitivity") return null;
  const { used, unusedInProof } = classification.payload.data;
  const status = classification.claim.status;

  const entities: VisualSpec["entities"] = [];
  const relationships: VisualSpec["relationships"] = [];

  used.forEach((h, i) => {
    entities.push({
      id: `hyp:${h.id}`,
      kind: "hypothesis",
      label: h.symbol,
      detail: h.display,
      position: { layer: 0, order: i },
      emphasis: "primary",
      state: "used",
      epistemic: status,
      sourceRef: refFor(theorem, `binders.${h.symbol}`),
    });
    relationships.push({
      id: `uses:${h.id}`,
      kind: "supports",
      from: `hyp:${h.id}`,
      to: "conclusion",
      epistemic: status,
      state: "used",
      sourceRef: refFor(theorem, "proofTerm"),
    });
  });

  unusedInProof.forEach((h, i) => {
    entities.push({
      id: `hyp:${h.id}`,
      kind: "hypothesis",
      label: h.symbol,
      detail: h.display,
      position: { layer: 0, order: used.length + i },
      emphasis: "muted",
      state: "unused",
      epistemic: status,
      sourceRef: refFor(theorem, `binders.${h.symbol}`),
    });
  });

  entities.push({
    id: "conclusion",
    kind: "conclusion",
    label: theorem.conclusionDisplay,
    position: { layer: 1, order: 0 },
    emphasis: "primary",
    epistemic: theorem.conclusion.status,
    sourceRef: refFor(theorem, "conclusion"),
  });

  const annotations: VisualAnnotation[] = [
    { id: "rationale", kind: "rationale", text: classification.rationale, epistemic: status },
    {
      id: "caveat",
      kind: "legend",
      text: "Detached hypotheses do not occur in this proof term. A different proof of the same statement might need them, so this is a fact about the proof, not about mathematical necessity.",
      epistemic: "derived",
    },
  ];

  if (unusedInProof.length > 0) {
    annotations.push({
      id: "callout:unused",
      kind: "callout",
      text: `${unusedInProof.length} of ${used.length + unusedInProof.length} hypotheses are never used.`,
      epistemic: status,
    });
  }

  return {
    id: `${theorem.id}:assumptions`,
    type: "assumption-sensitivity",
    title: "Which assumptions the proof actually uses",
    subtitle: theorem.name.split(".").pop(),
    entities,
    relationships,
    axes: [],
    annotations,
    epistemic: status,
    provenance: {
      sources: [refFor(theorem, "proofTerm")],
      rule: classification.rule,
      inputs: [theorem.id],
    },
    rationale: classification.rationale,
  };
}

function planImplication(theorem: TheoremIR, classification: Classification): VisualSpec | null {
  if (
    classification.payload.kind !== "implication" &&
    classification.payload.kind !== "equivalence"
  )
    return null;
  const { antecedent, consequent } = classification.payload.data;
  const status = classification.claim.status;
  const bidirectional = classification.payload.kind === "equivalence";

  return {
    id: `${theorem.id}:implication`,
    type: "implication-graph",
    title: bidirectional ? "Two equivalent statements" : "What follows from what",
    subtitle: theorem.name.split(".").pop(),
    entities: [
      {
        id: "antecedent",
        kind: "node",
        label: renderProposition(antecedent),
        position: { layer: 0, order: 0 },
        emphasis: "secondary",
        epistemic: status,
        sourceRef: refFor(theorem, antecedent.path),
      },
      {
        id: "consequent",
        kind: "node",
        label: renderProposition(consequent),
        position: { layer: 1, order: 0 },
        emphasis: "primary",
        epistemic: status,
        sourceRef: refFor(theorem, consequent.path),
      },
    ],
    relationships: [
      {
        id: "implies",
        kind: "implies",
        from: "antecedent",
        to: "consequent",
        label: bidirectional ? "↔" : "→",
        epistemic: status,
        sourceRef: refFor(theorem, "conclusion"),
      },
    ],
    axes: [],
    annotations: [
      { id: "rationale", kind: "rationale", text: classification.rationale, epistemic: status },
    ],
    epistemic: status,
    provenance: {
      sources: [refFor(theorem, "conclusion")],
      rule: classification.rule,
      inputs: [theorem.id],
    },
    rationale: classification.rationale,
  };
}

/**
 * Functional relationship: which quantities feed which.
 *
 * Serves both `R = N / t` and a definition body. The figure is a small layered
 * graph — inputs on the left, the defined quantity on the right — which is
 * exactly what a reader wants from "what is this built out of?".
 */
function planFunctionalRelationship(
  theorem: TheoremIR,
  classification: Classification,
): VisualSpec | null {
  if (classification.payload.kind !== "functional-relationship") return null;
  const { left, right } = classification.payload.data;
  const status = classification.claim.status;

  const inputs = Array.from(variablesIn(right))
    .map((id) => theorem.variables.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => v !== undefined);

  // Nothing to draw a relationship between: a constant expression has no
  // inputs, and an arrow from nowhere is not a diagram.
  if (inputs.length === 0) return null;

  const entities: VisualSpec["entities"] = inputs.map((variable, index) => ({
    id: `in:${variable.id}`,
    kind: "quantity" as const,
    label: variable.symbol,
    detail: variable.annotation?.meaning
      ? `${variable.annotation.meaning}${variable.annotation.units ? ` (${variable.annotation.units})` : ""}`
      : variable.typeDisplay,
    position: { layer: 0, order: index },
    emphasis: "secondary" as const,
    epistemic: status,
    sourceRef: refFor(theorem, `binders.${variable.symbol}`),
  }));

  entities.push({
    id: "defined",
    kind: "quantity",
    label: renderExpression(left),
    detail: renderExpression(right),
    position: { layer: 1, order: 0 },
    emphasis: "primary",
    epistemic: status,
    sourceRef: refFor(theorem, left.path),
  });

  return {
    id: `${theorem.id}:relationship`,
    type: "relationship-diagram",
    title: `${renderExpression(left)} = ${renderExpression(right)}`,
    subtitle: theorem.concept ?? theorem.name.split(".").pop(),
    entities,
    relationships: inputs.map((variable) => ({
      id: `feeds:${variable.id}`,
      kind: "maps-to" as const,
      from: `in:${variable.id}`,
      to: "defined",
      epistemic: status,
      sourceRef: refFor(theorem, left.path),
    })),
    axes: [],
    annotations: [
      { id: "rationale", kind: "rationale", text: classification.rationale, epistemic: status },
      {
        id: "reading",
        kind: "legend",
        text: "Arrows show which quantities the value is computed from. They are not causal claims.",
        epistemic: "derived",
      },
    ],
    epistemic: status,
    provenance: {
      sources: [refFor(theorem, left.path)],
      rule: classification.rule,
      inputs: [theorem.id],
    },
    rationale: classification.rationale,
  };
}

/** Layered dependency graph for one declaration and everything below it. */
function planDependencies(theorem: TheoremIR, graph: DependencyGraph): VisualSpec | null {
  const sub = subgraphFor(graph, theorem.id);
  if (sub.nodes.length <= 1) return null;

  const byLayer = new Map<number, number>();
  const entities = sub.nodes
    .slice()
    .sort((a, b) => a.depth - b.depth || a.label.localeCompare(b.label))
    .map((n) => {
      const order = byLayer.get(n.depth) ?? 0;
      byLayer.set(n.depth, order + 1);
      return {
        id: n.id,
        kind: "node" as const,
        label: n.label,
        detail: n.kind,
        position: { layer: n.depth, order },
        emphasis: (n.id === theorem.id ? "primary" : "secondary") as "primary" | "secondary",
        epistemic: "derived" as const,
        sourceRef: { system: "lean4", declaration: n.id },
      };
    });

  return {
    id: `${theorem.id}:dependencies`,
    type: "dependency-graph",
    title: "What this proof rests on",
    subtitle: theorem.name.split(".").pop(),
    entities,
    relationships: sub.edges.map((e, i) => ({
      id: `dep:${i}`,
      kind: "depends-on" as const,
      from: e.from,
      to: e.to,
      epistemic: "derived" as const,
      sourceRef: { system: "lean4", declaration: e.from },
    })),
    axes: [],
    annotations: [
      {
        id: "rationale",
        kind: "rationale",
        text: "Edges are the declarations this proof term actually references.",
        epistemic: "derived",
      },
      {
        id: "external",
        kind: "legend",
        text: `${sub.externalDependencyCount} further dependencies lie outside the extracted modules and are not drawn.`,
        epistemic: "derived",
      },
    ],
    epistemic: "derived",
    provenance: {
      sources: [refFor(theorem)],
      inputs: [theorem.id],
    },
    rationale:
      "A dependency graph is always available, because it is read directly from the proof term rather than from any recognised statement shape.",
  };
}

/** Structure-preserving fallback: show the statement's shape, claim nothing. */
function planExpressionTree(theorem: TheoremIR, classification?: Classification): VisualSpec {
  const reason =
    classification && classification.payload.kind === "unsupported"
      ? classification.payload.data.reason
      : "Shown so the statement's structure stays inspectable.";

  const entities: VisualSpec["entities"] = [
    {
      id: "conclusion",
      kind: "conclusion",
      label: theorem.conclusionDisplay,
      position: { layer: 0, order: 0 },
      emphasis: "primary",
      epistemic: theorem.conclusion.status,
      sourceRef: refFor(theorem, "conclusion"),
    },
    ...theorem.hypotheses.map((h, i) => ({
      id: `hyp:${h.id}`,
      kind: "hypothesis" as const,
      label: `${h.symbol} : ${h.display}`,
      position: { layer: 1, order: i },
      emphasis: "secondary" as const,
      state: (h.usage.unusedInProof ? "unused" : "used") as "unused" | "used",
      epistemic: theorem.conclusion.status,
      sourceRef: refFor(theorem, `binders.${h.symbol}`),
    })),
  ];

  return {
    id: `${theorem.id}:structure`,
    type: "expression-tree",
    title: "Formal structure",
    subtitle: theorem.name.split(".").pop(),
    entities,
    relationships: theorem.hypotheses.map((h) => ({
      id: `assume:${h.id}`,
      kind: "supports" as const,
      from: `hyp:${h.id}`,
      to: "conclusion",
      epistemic: theorem.conclusion.status,
    })),
    axes: [],
    annotations: [
      { id: "rationale", kind: "rationale", text: reason, epistemic: "derived" },
      {
        id: "graceful",
        kind: "legend",
        text: "ProofLens shows a theorem's formal structure even when it cannot interpret it. Nothing here is guessed.",
        epistemic: "derived",
      },
    ],
    epistemic: theorem.conclusion.status,
    provenance: { sources: [refFor(theorem)], inputs: [theorem.id] },
    rationale: reason,
  };
}

/**
 * Plan every visualization for a theorem, most informative first.
 *
 * Always returns at least one spec. Unsupported mathematics still gets its
 * structure drawn, because throwing the theorem away is the one outcome
 * ProofLens is not allowed to have.
 */
export function planVisuals(
  theorem: TheoremIR,
  classifications: readonly Classification[],
  context: PlanContext = {},
): VisualSpec[] {
  const specs: VisualSpec[] = [];

  const sensitivity = classifications.find((c) => c.payload.kind === "assumption-sensitivity");
  const hasUnused =
    sensitivity?.payload.kind === "assumption-sensitivity" &&
    sensitivity.payload.data.unusedInProof.length > 0;

  // A theorem with a redundant hypothesis is more interesting than its plot.
  if (sensitivity && hasUnused) {
    const spec = planAssumptionSensitivity(theorem, sensitivity);
    if (spec) specs.push(spec);
  }

  for (const classification of classifications) {
    switch (classification.payload.kind) {
      case "positivity": {
        const spec = planPositivity(theorem, classification);
        if (spec) specs.push(spec);
        break;
      }
      // Every inequality yields both an upper- and a lower-bound reading. Only
      // the natural one is worth a figure; drawing both would show the reader
      // the same fact twice, once uselessly.
      case "upper-bound": {
        if (!classification.payload.data.natural) break;
        const spec = planBound(theorem, classification, "upper");
        if (spec) specs.push(spec);
        break;
      }
      case "lower-bound": {
        if (!classification.payload.data.natural) break;
        const spec = planBound(theorem, classification, "lower");
        if (spec) specs.push(spec);
        break;
      }
      case "monotonicity": {
        const spec = planMonotonicity(theorem, classification);
        if (spec) specs.push(spec);
        break;
      }
      case "functional-relationship": {
        const spec = planFunctionalRelationship(theorem, classification);
        if (spec) specs.push(spec);
        break;
      }
      case "implication":
      case "equivalence": {
        const spec = planImplication(theorem, classification);
        if (spec) specs.push(spec);
        break;
      }
      default:
        break;
    }
  }

  if (sensitivity && !hasUnused) {
    const spec = planAssumptionSensitivity(theorem, sensitivity);
    if (spec) specs.push(spec);
  }

  if (context.dependencies) {
    const spec = planDependencies(theorem, context.dependencies);
    if (spec) specs.push(spec);
  }

  const unsupported = classifications.find((c) => c.payload.kind === "unsupported");
  if (specs.length === 0 || unsupported) {
    specs.push(planExpressionTree(theorem, unsupported));
  }

  return applyAuthorHint(theorem, specs);
}

/**
 * Honour `@prooflens.visual`.
 *
 * The author of a declaration may state a preference. ProofLens treats it as a
 * preference and nothing more: it can reorder figures the planner already
 * chose, but it cannot conjure one, because a visualization the analysis does
 * not support would have nothing behind it. A hint that matches nothing is
 * recorded on the figure rather than silently dropped, so the author finds out.
 *
 * A hint also never displaces a *finding*. If ProofLens noticed something the
 * author did not — a hypothesis their proof never uses, a `sorry`, an unusual
 * axiom — that leads, and the requested figure comes second. An author asking
 * for a bound plot is expressing taste; a redundant hypothesis is information.
 */
/**
 * Author vocabulary → `VisualType`.
 *
 * Authors describe what they want to see ("a monotone curve"), not what the
 * planner calls it. Without this table an author who asks for exactly the
 * figure ProofLens already planned gets told their request went unfulfilled,
 * which turns a useful signal into noise.
 */
const VISUAL_HINT_ALIASES: Record<string, VisualType> = {
  "functional-relationship": "relationship-diagram",
  "equation-map": "relationship-diagram",
  "monotone-curve": "monotonicity-plot",
  "antitone-curve": "monotonicity-plot",
  "monotonicity-curve": "monotonicity-plot",
  "positivity-fact": "number-line",
  "sign-fact": "number-line",
  "iff-equivalence": "implication-graph",
  "implication-arrow": "implication-graph",
  "implication-chain": "implication-graph",
  "bound-plot": "upper-bound-plot",
  dependency: "dependency-graph",
  "proof-dependencies": "dependency-graph",
  structure: "expression-tree",
};

/** Resolve an author hint to a `VisualType`, if it names one. */
export function resolveVisualHint(hint: string): VisualType | null {
  const aliased = VISUAL_HINT_ALIASES[hint];
  if (aliased) return aliased;
  const known: VisualType[] = [
    "upper-bound-plot",
    "lower-bound-plot",
    "number-line",
    "monotonicity-plot",
    "relationship-diagram",
    "dependency-graph",
    "implication-graph",
    "assumption-sensitivity",
    "expression-tree",
    "text-diagram",
  ];
  return known.includes(hint as VisualType) ? (hint as VisualType) : null;
}

function applyAuthorHint(theorem: TheoremIR, specs: VisualSpec[]): VisualSpec[] {
  const raw = theorem.suggestedVisual;
  if (!raw || specs.length === 0) return specs;
  const hint = resolveVisualHint(raw);

  const leadIsFinding = specs[0]?.type === "assumption-sensitivity" || theorem.trust.usesSorry;
  const target = leadIsFinding ? 1 : 0;

  const index = hint === null ? -1 : specs.findIndex((s) => s.type === hint);
  if (index > target) {
    const [preferred] = specs.splice(index, 1);
    if (preferred) specs.splice(target, 0, preferred);
    return specs;
  }
  if (index >= 0) return specs;

  const first = specs[0];
  if (first) {
    first.annotations = [
      ...first.annotations,
      {
        id: "hint-unmatched",
        kind: "legend",
        text:
          hint === null
            ? `The declaration requests a \`${raw}\` figure, which is not a visualization type ProofLens knows.`
            : `The declaration requests a \`${raw}\` figure, but no ProofLens classifier produced one for this statement.`,
        epistemic: "derived",
      },
    ];
  }
  return specs;
}

export { dependencyGraph, VISUAL_IR_VERSION };
