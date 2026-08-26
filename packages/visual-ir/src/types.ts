import type { EpistemicStatus, Provenance, SourceReference } from "@prooflens/epistemics";

/**
 * VisualIR describes *what to show*, never *how to draw it*.
 *
 * Renderers consume this and nothing else. That separation is what lets the
 * same analysis drive an SVG figure, a Lean infoview widget, and a plain-text
 * diagram without any of them knowing about Lean.
 *
 * Positions are **logical**, not pixels: `layer`/`order` for graphs, and
 * normalised `[0,1]` coordinates for plots. Turning those into geometry is the
 * renderer's job.
 */
export type VisualType =
  | "upper-bound-plot"
  | "lower-bound-plot"
  | "number-line"
  | "monotonicity-plot"
  | "limit-plot"
  | "relationship-diagram"
  | "dependency-graph"
  | "implication-graph"
  | "assumption-sensitivity"
  | "expression-tree"
  | "text-diagram";

export type EntityKind =
  "quantity" | "bound" | "region" | "function" | "node" | "hypothesis" | "conclusion" | "label";

export type Emphasis = "primary" | "secondary" | "muted";
export type EntityState = "neutral" | "used" | "unused" | "warning" | "excluded" | "permitted";

export interface LogicalPosition {
  /** Normalised horizontal placement in [0,1], left to right. */
  x?: number;
  /**
   * Normalised vertical placement in [0,1], **bottom-origin**: 0 sits on the
   * horizontal axis and 1 is the top of the plot area.
   *
   * Stated explicitly because renderers otherwise have to guess, and two
   * renderers guessing differently would silently flip a figure upside down.
   */
  y?: number;
  /** Layer index for layered graph layouts (0 = deepest dependency). */
  layer?: number;
  /** Order within the layer. */
  order?: number;
}

export interface VisualEntity {
  id: string;
  kind: EntityKind;
  label: string;
  /** Secondary text: units, a hypothesis statement, a rule id. */
  detail?: string;
  position?: LogicalPosition;
  emphasis?: Emphasis;
  state?: EntityState;
  /**
   * Epistemic standing of *this element*. A bound's position on an axis is
   * usually `illustrative` even when the bound itself is `verified`, because
   * the axis was chosen for legibility.
   */
  epistemic: EpistemicStatus;
  sourceRef?: SourceReference;
}

export type RelationshipKind =
  "bounded-by" | "implies" | "depends-on" | "equals" | "maps-to" | "supports";

export interface VisualRelationship {
  id: string;
  kind: RelationshipKind;
  from: string;
  to: string;
  label?: string;
  emphasis?: Emphasis;
  state?: EntityState;
  epistemic: EpistemicStatus;
  sourceRef?: SourceReference;
}

export interface AxisSpec {
  id: string;
  orientation: "horizontal" | "vertical";
  label: string;
  units?: string;
  /**
   * Whether the axis carries real numbers or is purely schematic. Schematic
   * axes are `illustrative`: positions along them mean "this side of that",
   * nothing more.
   */
  scale: "numeric" | "schematic";
  ticks: Array<{ at: number; label: string; emphasis?: Emphasis }>;
  epistemic: EpistemicStatus;
}

export type AnnotationKind = "caption" | "callout" | "warning" | "legend" | "rationale";

export interface VisualAnnotation {
  id: string;
  kind: AnnotationKind;
  text: string;
  target?: string;
  epistemic: EpistemicStatus;
}

export interface VisualSpec {
  id: string;
  type: VisualType;
  title: string;
  subtitle?: string;
  entities: VisualEntity[];
  relationships: VisualRelationship[];
  axes: AxisSpec[];
  annotations: VisualAnnotation[];
  /** The weakest status of anything shown: what the figure as a whole is worth. */
  epistemic: EpistemicStatus;
  provenance: Provenance;
  /**
   * Why this visualization was chosen, in one sentence, naming the evidence.
   * Required. A figure that cannot explain itself does not ship.
   */
  rationale: string;
}

export const VISUAL_IR_VERSION = "0.1.0";
