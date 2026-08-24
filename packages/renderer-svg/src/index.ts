/**
 * @prooflens/renderer-svg
 *
 * Renders a {@link VisualSpec} as a self-contained, accessible, theme-aware
 * SVG string.
 *
 * Four properties are load-bearing and are enforced here rather than left to
 * convention:
 *
 *  1. **Determinism.** Nothing in this package reads the clock, a random
 *     source, or any ambient state. Element ids are derived from the spec's own
 *     ids, so the same spec renders byte-identically on every machine and
 *     ProofLens figures can be committed and diffed.
 *  2. **Self-containment.** No external fonts, stylesheets, scripts or images.
 *     A figure means the same thing offline, in a Lean infoview, and in a PDF.
 *  3. **Accessibility.** The root carries `role="img"` and points at a `<title>`
 *     and a `<desc>` that states, in words, what the figure shows *and* what it
 *     is epistemically worth. Every meaningful shape carries its own `<title>`.
 *  4. **Epistemic legibility.** Anything weaker than `derived` is drawn with a
 *     broken stroke and a lightened fill, and a legend row says so in prose.
 *     This is ProofLens's central invariant made visible; it is not optional
 *     and it is not decorative.
 *
 * @packageDocumentation
 */
import { EPISTEMIC_GLOSS, weakest, type EpistemicStatus } from "@prooflens/epistemics";
import type { VisualSpec, VisualType } from "@prooflens/visual-ir";
import { headerHeight, renderAnnotations, renderHeader, renderLegend } from "./chrome.js";
import {
  createContext,
  specHasWeakElement,
  type LayoutResult,
  type LegendRow,
  type RenderContext,
} from "./context.js";
import {
  arrowDefs,
  layoutAssumptionSensitivity,
  layoutExpressionTree,
  layoutGeneric,
  layoutLayeredGraph,
  layoutMonotonicity,
  layoutNumberLine,
  WEAK_LEGEND_ROW,
} from "./layouts.js";
import { buildStylesheet, DEFAULT_FONT_FAMILY, type Theme } from "./theme.js";
import { attrs, escapeXml, num, sanitizeId } from "./xml.js";

export interface SvgOptions {
  /**
   * viewBox width in user units, and the rendered `width` attribute.
   * Omit for a fluid figure (`width="100%"`, height from the aspect ratio).
   */
  width?: number;
  /** Rendered `height` attribute. The figure is letterboxed, never stretched. */
  height?: number;
  /**
   * `"auto"` (the default) emits a light palette plus a
   * `prefers-color-scheme: dark` override; `"light"`/`"dark"` emit exactly one
   * palette so the figure looks identical wherever it is embedded.
   */
  theme?: Theme;
  /** Font stack for label text. System fonts only; nothing is ever fetched. */
  fontFamily?: string;
  /** Prefix for every generated element id. Defaults to `"pl"`. */
  idPrefix?: string;
}

export { escapeXml, sanitizeId } from "./xml.js";
export { measureText, truncateToWidth, wrapToWidth } from "./measure.js";
export type { Theme } from "./theme.js";

/** Default viewBox width. Wide enough for a two-column assumption figure. */
const DEFAULT_WIDTH = 720;
const PAD = 24;
const BLOCK_GAP = 18;

/**
 * Render a spec as an `<svg>` element string.
 *
 * The returned markup is safe to inline into HTML or to write to a `.svg` file
 * (see {@link renderSvgDocument} for the standalone form).
 */
export function renderSvg(spec: VisualSpec, options: SvgOptions = {}): string {
  const width = clampWidth(options.width ?? DEFAULT_WIDTH);
  const theme: Theme = options.theme ?? "auto";
  const prefix = sanitizeId(options.idPrefix ?? "pl");
  const ctx = createContext(spec, width, PAD, prefix);

  const body = safeLayout(spec, ctx);

  const legendRows: LegendRow[] = [...body.legend];
  if (specHasWeakElement(spec)) legendRows.push(WEAK_LEGEND_ROW);
  legendRows.push({
    swatch: "none",
    text: `This figure as a whole is ${spec.epistemic}. ${EPISTEMIC_GLOSS[spec.epistemic]}`,
  });

  const header = renderHeader(spec, ctx);
  const headerH = headerHeight(spec);
  const legend = renderLegend(legendRows, ctx, ctx.id("arrow"));
  const annotations = renderAnnotations(spec, ctx);

  let y = headerH;
  let content = header;

  content += group(y, body.svg);
  y += body.height + BLOCK_GAP;

  if (legend.height > 0) {
    content += group(y, legend.svg);
    y += legend.height + BLOCK_GAP;
  }

  if (annotations.height > 0) {
    content += group(y, annotations.svg);
    y += annotations.height;
  }

  const totalHeight = Math.max(120, Math.ceil(y + PAD));

  const titleId = ctx.id("title");
  const descId = ctx.id("desc");

  const rootAttrs = attrs({
    xmlns: "http://www.w3.org/2000/svg",
    "xmlns:xlink": undefined,
    viewBox: `0 0 ${num(width)} ${num(totalHeight)}`,
    width: options.width !== undefined ? options.width : "100%",
    height: options.height !== undefined ? options.height : undefined,
    // Letterboxing rather than stretching: a distorted figure would misstate
    // relative positions, which on a number line is a factual error.
    preserveAspectRatio: "xMidYMin meet",
    role: "img",
    "aria-labelledby": `${titleId} ${descId}`,
    class: "prooflens-figure",
    "data-prooflens-type": spec.type,
    "data-prooflens-epistemic": spec.epistemic,
  });

  const style = `<style>${buildStylesheet(theme, options.fontFamily ?? DEFAULT_FONT_FAMILY)}</style>`;
  const label = `<title id="${titleId}">${escapeXml(spec.title)}</title><desc id="${descId}">${escapeXml(describe(spec))}</desc>`;
  const background = `<rect x="0" y="0" width="${num(width)}" height="${num(totalHeight)}" class="pl-bg"/>`;

  return `<svg${rootAttrs}>${label}${style}${arrowDefs(ctx)}${background}${content}</svg>`;
}

/**
 * Render a standalone `.svg` file, with the XML prolog.
 *
 * Use this when writing to disk; use {@link renderSvg} when inlining into HTML,
 * where a prolog is not allowed.
 */
export function renderSvgDocument(spec: VisualSpec, options: SvgOptions = {}): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${renderSvg(spec, options)}\n`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function group(y: number, inner: string): string {
  if (inner === "") return "";
  return `<g transform="translate(0 ${num(y)})">${inner}</g>`;
}

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_WIDTH;
  return Math.min(4000, Math.max(320, Math.round(width)));
}

/**
 * Choose a layout.
 *
 * Unknown types fall through to the generic renderer, and any layout that
 * throws is caught and replaced by it. A figure that cannot be drawn is still
 * shown as text; dropping a theorem on the floor is the one outcome ProofLens
 * is not allowed to have.
 */
function safeLayout(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  try {
    return dispatch(spec.type, spec, ctx);
  } catch {
    try {
      return layoutGeneric(spec, ctx);
    } catch {
      return { svg: "", height: 40, legend: [] };
    }
  }
}

function dispatch(type: VisualType | string, spec: VisualSpec, ctx: RenderContext): LayoutResult {
  switch (type) {
    case "upper-bound-plot":
    case "lower-bound-plot":
    case "number-line":
      return layoutNumberLine(spec, ctx);
    case "monotonicity-plot":
      return layoutMonotonicity(spec, ctx);
    case "assumption-sensitivity":
      return layoutAssumptionSensitivity(spec, ctx);
    case "dependency-graph":
    case "implication-graph":
    case "relationship-diagram":
      return layoutLayeredGraph(spec, ctx);
    case "expression-tree":
      return layoutExpressionTree(spec, ctx);
    default:
      return layoutGeneric(spec, ctx);
  }
}

/** Plain-language descriptions of what each figure shows. */
const TYPE_DESCRIPTION: Record<string, string> = {
  "upper-bound-plot":
    "a horizontal number line showing which values the bounded quantity is permitted to take and which the theorem rules out",
  "lower-bound-plot":
    "a horizontal number line showing which values the bounded quantity is permitted to take and which the theorem rules out",
  "number-line":
    "a horizontal number line with the marked value and the regions on either side of it",
  "monotonicity-plot":
    "a schematic curve illustrating the direction in which the function's output moves as its input increases",
  "assumption-sensitivity":
    "two columns of boxes: the theorem's stated hypotheses on the left, the conclusion on the right, with a connector drawn for each hypothesis the proof term actually uses",
  "dependency-graph":
    "a layered graph of the declarations this proof references, with arrows pointing from each declaration to what it depends on",
  "implication-graph": "a layered graph showing which statement follows from which",
  "relationship-diagram": "a layered graph of the elements and how they relate",
  "expression-tree":
    "the theorem's formal structure: the conclusion, with the hypotheses that lead to it listed beneath",
};

/**
 * The `<desc>` text.
 *
 * It has to answer two questions for someone who cannot see the figure: what
 * is drawn, and how much it is worth. The epistemic gloss is included verbatim
 * so the answer to the second question is the same one the rest of ProofLens
 * gives.
 */
function describe(spec: VisualSpec): string {
  const what =
    TYPE_DESCRIPTION[spec.type] ?? `a listing of this figure's ${spec.entities.length} elements`;
  const parts = [`${spec.title}. This figure shows ${what}.`];

  const weakElements = spec.entities.filter((e) => e.epistemic !== spec.epistemic);
  const overall = weakest(spec.epistemic, ...spec.entities.map((e) => e.epistemic));
  parts.push(`Epistemic status: ${spec.epistemic}. ${EPISTEMIC_GLOSS[spec.epistemic]}`);
  if (overall !== spec.epistemic) {
    parts.push(`Some elements are weaker still (${overall}). ${EPISTEMIC_GLOSS[overall]}`);
  } else if (weakElements.length > 0) {
    parts.push(
      "Elements drawn with dashed strokes are illustrative and make no mathematical claim.",
    );
  }

  const unused = spec.entities.filter((e) => e.state === "unused");
  if (unused.length > 0) {
    parts.push(
      `${unused.length} of the stated hypotheses (${unused.map((e) => e.label).join(", ")}) are never used by the proof.`,
    );
  }

  parts.push(`Why this figure: ${spec.rationale}`);
  return parts.join(" ");
}

/** Re-exported so callers can check a status without a second dependency. */
export type { EpistemicStatus };
