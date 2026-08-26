/**
 * Shared drawing helpers and the per-render context.
 *
 * Layouts draw into a local coordinate system whose origin is the top-left of
 * their own band; the assembler translates them into place. That keeps each
 * layout's arithmetic readable and makes the total figure height a simple sum.
 */
import { isAtLeast, type EpistemicStatus } from "@prooflens/epistemics";
import type { VisualEntity, VisualSpec } from "@prooflens/visual-ir";
import { attrs, el, escapeXml, num, sanitizeId, titleEl } from "./xml.js";
import { measureText, truncateToWidth, wrapToWidth } from "./measure.js";

/** The three ways an element can be brought in. */
export type AnimKind = "enter" | "fade" | "draw";

/** What a layout asks for when it binds an element to the animation. */
export interface AnimOptions {
  /**
   * `enter` is the staged fade + slight rise for boxes and their labels;
   * `fade` is opacity only, for anything whose transform or dash pattern must
   * not be disturbed (rotated labels, dashed strokes, region fills);
   * `draw` is a stroke-dashoffset trace for solid strokes — never use it on a
   * dashed stroke, where sliding the dash pattern is not a draw.
   */
  kind: AnimKind;
  /** Seconds from figure start. Use {@link stageDelay} for staged entrances. */
  delay: number;
  /** Seconds; defaults to the entrance duration. Curve traces pass their own. */
  duration?: number;
  /**
   * `draw` only: the dash budget, at least the path's length (round up — an
   * overestimate only makes the trace finish early, an underestimate leaves a
   * gap in the final frame).
   */
  length?: number;
  /** `draw` only: a marker id whose arrowhead should appear as the trace ends. */
  revealMarker?: string;
}

/** One registered animation binding; the CSS builder consumes these. */
export interface AnimTarget {
  /** The class token that binds elements to this rule, without leading dot. */
  className: string;
  kind: AnimKind;
  delay: number;
  duration: number;
  /** Dash budget; only meaningful for `draw`. */
  length: number;
  revealMarker?: string;
}

/** Per-render state. Ids are derived from the spec, never from a global counter. */
export interface RenderContext {
  readonly spec: VisualSpec;
  /** Total viewBox width in user units. */
  readonly width: number;
  /** Horizontal padding on both sides. */
  readonly pad: number;
  /** Whether this render is animated. Layouts rarely need to check: `anim` is a no-op when it is off. */
  readonly animate: boolean;
  /** Every animation binding registered so far, in emission order. */
  readonly animTargets: readonly AnimTarget[];
  /** Mint a document-unique, deterministic id from a stable suffix. */
  id(suffix: string): string;
  /**
   * Register an animation binding and return its class token, with a leading
   * space so it appends onto a `className` the way {@link weakStrokeClass}
   * does. Returns `""` when animation is off, so layouts have a single code
   * path and the static markup is identical whether or not the feature exists.
   *
   * Identical requests share one token, so all of stage 3 is one CSS rule.
   */
  anim(options: AnimOptions): string;
  /** Drop every registered binding. Used when a layout fails and is replaced. */
  resetAnim(): void;
}

export function createContext(
  spec: VisualSpec,
  width: number,
  pad: number,
  prefix: string,
  animate = false,
): RenderContext {
  const base = sanitizeId(`${prefix}-${spec.id}`);
  const targets: AnimTarget[] = [];
  const byShape = new Map<string, string>();
  return {
    spec,
    width,
    pad,
    animate,
    animTargets: targets,
    id: (suffix: string) => `${base}-${sanitizeId(suffix)}`,
    anim(options: AnimOptions): string {
      if (!animate) return "";
      const duration = options.duration ?? 0.45;
      const length = Math.max(1, Math.ceil(options.length ?? 0));
      const shape = [
        options.kind,
        options.delay,
        duration,
        options.kind === "draw" ? length : "",
        options.revealMarker ?? "",
      ].join("|");
      let className = byShape.get(shape);
      if (className === undefined) {
        className = `pl-anim-${base}-a${targets.length}`;
        byShape.set(shape, className);
        targets.push({
          className,
          kind: options.kind,
          delay: options.delay,
          duration,
          length,
          revealMarker: options.revealMarker,
        });
      }
      return ` ${className}`;
    },
    resetAnim(): void {
      targets.length = 0;
      byShape.clear();
    },
  };
}

/** What a legend row's swatch should look like. */
export type SwatchKind =
  | "none"
  | "solid-line"
  | "dashed-line"
  | "permit"
  | "exclude"
  | "open-dot"
  | "filled-dot"
  | "used-box"
  | "unused-box"
  | "arrow"
  | "curve"
  | "asymptote";

export interface LegendRow {
  swatch: SwatchKind;
  text: string;
}

/** A laid-out figure body, in local coordinates starting at y = 0. */
export interface LayoutResult {
  svg: string;
  height: number;
  legend: LegendRow[];
}

// ---------------------------------------------------------------------------
// Epistemic encoding
// ---------------------------------------------------------------------------

/**
 * Is this element weaker than `derived`?
 *
 * This is the single predicate behind ProofLens's core visual invariant: an
 * element that is not at least `derived` is never allowed to look like one
 * that is.
 */
export function isWeak(status: EpistemicStatus): boolean {
  return !isAtLeast(status, "derived");
}

/** Class names that carry the epistemic encoding for a stroked shape. */
export function weakStrokeClass(status: EpistemicStatus): string {
  return isWeak(status) ? " pl-weak-stroke" : "";
}

/** Class names that carry the epistemic encoding for a filled shape. */
export function weakFillClass(status: EpistemicStatus): string {
  return isWeak(status) ? " pl-weak-fill" : "";
}

/** Does any part of the spec need the "illustrative" legend row? */
export function specHasWeakElement(spec: VisualSpec): boolean {
  return (
    isWeak(spec.epistemic) ||
    spec.entities.some((e) => isWeak(e.epistemic)) ||
    spec.relationships.some((r) => isWeak(r.epistemic)) ||
    spec.axes.some((a) => isWeak(a.epistemic))
  );
}

/** One-line description of an element's standing, for its hover `<title>`. */
export function statusPhrase(status: EpistemicStatus): string {
  return `epistemic status: ${status}`;
}

// ---------------------------------------------------------------------------
// Text emission
// ---------------------------------------------------------------------------

export interface TextOptions {
  x: number;
  y: number;
  className: string;
  anchor?: "start" | "middle" | "end";
  /** Maximum width; the label is ellipsised to fit and the full text kept in `<title>`. */
  maxWidth?: number;
  fontSize: number;
  /** Overrides the tooltip; defaults to the untruncated text. */
  title?: string;
}

/**
 * Emit a single-line `<text>`.
 *
 * Text is always real text — never converted to paths — so it stays
 * selectable, searchable and readable by a screen reader.
 */
export function text(content: string, options: TextOptions): string {
  const { text: shown, truncated } =
    options.maxWidth === undefined
      ? { text: content, truncated: false }
      : truncateToWidth(content, options.maxWidth, options.fontSize);
  const tip = options.title ?? content;
  const needsTitle = truncated || options.title !== undefined;
  const body = (needsTitle ? titleEl(tip) : "") + escapeXml(shown);
  return `<text${attrs({
    x: options.x,
    y: options.y,
    class: options.className,
    "text-anchor": options.anchor === "start" ? undefined : options.anchor,
  })}>${body}</text>`;
}

export interface ParagraphOptions {
  x: number;
  y: number;
  className: string;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  maxLines: number;
  anchor?: "start" | "middle" | "end";
}

/** Emit a wrapped paragraph; returns the markup and the height it consumed. */
export function paragraph(
  content: string,
  options: ParagraphOptions,
): { svg: string; height: number; lines: number } {
  const { lines, truncated } = wrapToWidth(
    content,
    options.maxWidth,
    options.fontSize,
    options.maxLines,
  );
  if (lines.length === 0) return { svg: "", height: 0, lines: 0 };
  let svg = "";
  lines.forEach((line, i) => {
    const isFirst = i === 0;
    const tip = truncated && isFirst ? content : undefined;
    svg += `<text${attrs({
      x: options.x,
      y: options.y + i * options.lineHeight,
      class: options.className,
      "text-anchor": options.anchor === "start" ? undefined : options.anchor,
    })}>${(tip ? titleEl(tip) : "") + escapeXml(line)}</text>`;
  });
  return { svg, height: (lines.length - 1) * options.lineHeight, lines: lines.length };
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface BoxOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  className: string;
  radius?: number;
  tooltip?: string;
}

/** A rounded rectangle carrying a hover `<title>`. */
export function box(options: BoxOptions): string {
  return el(
    "rect",
    {
      x: options.x,
      y: options.y,
      width: Math.max(0, options.width),
      height: Math.max(0, options.height),
      rx: options.radius ?? 5,
      ry: options.radius ?? 5,
      class: options.className,
    },
    options.tooltip ? titleEl(options.tooltip) : "",
  );
}

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  className: string,
  tooltip?: string,
): string {
  return el("line", { x1, y1, x2, y2, class: className }, tooltip ? titleEl(tooltip) : "");
}

export function circle(
  cx: number,
  cy: number,
  r: number,
  className: string,
  tooltip?: string,
): string {
  return el("circle", { cx, cy, r, class: className }, tooltip ? titleEl(tooltip) : "");
}

export function path(
  d: string,
  className: string,
  extra: Record<string, string> = {},
  tooltip?: string,
): string {
  return el("path", { d, class: className, ...extra }, tooltip ? titleEl(tooltip) : "");
}

/**
 * A left-to-right connector between two boxes.
 *
 * A flat cubic (horizontal control handles) reads as a wire rather than a
 * mathematical curve, which matters in the assumption figure where a curve
 * could be mistaken for part of the mathematics.
 */
export function connector(x1: number, y1: number, x2: number, y2: number): string {
  const dir = x2 >= x1 ? 1 : -1;
  const dx = dir * Math.max(24, Math.abs(x2 - x1) * 0.45);
  return `M ${num(x1)} ${num(y1)} C ${num(x1 + dx)} ${num(y1)} ${num(x2 - dx)} ${num(y2)} ${num(x2)} ${num(y2)}`;
}

/** A top-to-bottom connector, for layouts that stack layers vertically. */
export function connectorVertical(x1: number, y1: number, x2: number, y2: number): string {
  const dir = y2 >= y1 ? 1 : -1;
  const dy = dir * Math.max(18, Math.abs(y2 - y1) * 0.45);
  return `M ${num(x1)} ${num(y1)} C ${num(x1)} ${num(y1 + dy)} ${num(x2)} ${num(y2 - dy)} ${num(x2)} ${num(y2)}`;
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

/** Tooltip text for an entity: label, detail, state and epistemic standing. */
export function entityTooltip(entity: VisualEntity): string {
  const bits = [entity.label];
  if (entity.detail) bits.push(entity.detail);
  if (entity.state && entity.state !== "neutral") bits.push(`state: ${entity.state}`);
  bits.push(statusPhrase(entity.epistemic));
  return bits.join(" — ");
}

/** Entities of a kind, in the order the planner intended. */
export function entitiesOfKind(spec: VisualSpec, kind: VisualEntity["kind"]): VisualEntity[] {
  return spec.entities
    .map((entity, index) => ({ entity, index }))
    .filter((e) => e.entity.kind === kind)
    .sort((a, b) => orderOf(a.entity, a.index) - orderOf(b.entity, b.index))
    .map((e) => e.entity);
}

function orderOf(entity: VisualEntity, fallback: number): number {
  const order = entity.position?.order;
  return order === undefined ? fallback : order;
}

/** Width of a label at a given size — re-exported so layouts need one import. */
export { measureText };
