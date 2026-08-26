/**
 * Purpose-built layouts, one per VisualIR type.
 *
 * Each layout draws into local coordinates starting at y = 0 and reports the
 * height it used, plus the legend rows that explain its own encoding. The
 * assembler stacks header, body, legend and annotations in that order.
 *
 * Nothing here reads the clock or a random source: the same spec always
 * produces the same geometry, which is what lets ProofLens figures be checked
 * into a repository and diffed.
 */
import type { AxisSpec, VisualEntity, VisualSpec } from "@prooflens/visual-ir";
import { afterStage, stageDelay, TRACE_DURATION } from "./animate.js";
import {
  box,
  circle,
  connector,
  connectorVertical,
  entitiesOfKind,
  entityTooltip,
  isWeak,
  line,
  paragraph,
  path,
  statusPhrase,
  text,
  weakFillClass,
  weakStrokeClass,
  type LayoutResult,
  type LegendRow,
  type RenderContext,
} from "./context.js";
import { clampCenter, measureText, wrapToWidth } from "./measure.js";
import { clamp01, el, escapeXml, num } from "./xml.js";

/** Arrowhead markers. Ids are derived from the spec so two figures can coexist. */
export function arrowDefs(ctx: RenderContext): string {
  return el(
    "defs",
    {},
    marker(ctx.id("arrow"), "var(--pl-accent)") + marker(ctx.id("arrow-muted"), "var(--pl-edge)"),
  );
}

function marker(id: string, fill: string): string {
  return el(
    "marker",
    {
      id,
      viewBox: "0 0 10 10",
      refX: 9.5,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: "auto",
      markerUnits: "strokeWidth",
    },
    el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill }),
  );
}

/** The one legend row that states ProofLens's central visual convention. */
export const WEAK_LEGEND_ROW: LegendRow = {
  swatch: "dashed-line",
  text: "Dashed strokes and lightened fills mark elements weaker than “derived” — illustrative choices made for legibility. They carry no mathematical claim.",
};

// ---------------------------------------------------------------------------
// Number line: upper-bound-plot, lower-bound-plot, number-line
// ---------------------------------------------------------------------------

/*
 * Vertical budget for the number line, in local units. The rows are fixed
 * rather than computed because the figure is easier to compare across theorems
 * when the axis always lands in the same place.
 */
const NL_BOUND_LABEL_Y = 16;
const NL_QTY_LABEL_Y = 34;
const NL_MARKER_TOP = 42;
const NL_BAND_TOP = 50;
const NL_AXIS_Y = 74;
const NL_BAND_BOTTOM = 98;
const NL_MARKER_BOTTOM = 106;
const NL_REGION_LABEL_Y = 92;
const NL_TICK_LABEL_Y = 118;
const NL_AXIS_TITLE_Y = 136;
const NL_HEIGHT = 148;

/**
 * A horizontal number line with permitted / excluded bands.
 *
 * The whole point of this figure is the side of the marker a quantity lies on.
 * Distances along the axis are meaningless when the axis is `schematic`, so the
 * axis line is drawn broken in that case and the legend says why — an unbroken
 * ruler would imply measurements the theorem never made.
 *
 * Animated, the figure builds in the order a reader should parse it: the axis,
 * then the bound marker drawing in, then the permitted band, then the excluded
 * band, then the quantity itself.
 */
export function layoutNumberLine(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  const legend: LegendRow[] = [];
  const fadeAt = (stage: number): string => ctx.anim({ kind: "fade", delay: stageDelay(stage) });
  const x0 = ctx.pad + 12;
  const x1 = ctx.width - ctx.pad - 12;
  const span = x1 - x0;
  const X = (p: number | undefined, fallback = 0.5): number => x0 + clamp01(p, fallback) * span;

  const axis: AxisSpec | undefined = spec.axes[0];
  const schematic = axis === undefined || axis.scale === "schematic";
  const bound = entitiesOfKind(spec, "bound")[0];
  const boundX = clamp01(bound?.position?.x, 0.5);

  let svg = "";

  // --- bands -------------------------------------------------------------
  // A region's `position.x` names a side, not an extent: the band runs from
  // the bound to whichever end of the axis that side points at.
  const hatchId = ctx.id("hatch");
  svg += el(
    "defs",
    {},
    el(
      "pattern",
      {
        id: hatchId,
        width: 8,
        height: 8,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(45)",
      },
      el("line", {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 8,
        stroke: "var(--pl-exclude)",
        "stroke-width": 1.25,
        opacity: 0.42,
      }),
    ),
  );

  for (const region of entitiesOfKind(spec, "region")) {
    const at = clamp01(region.position?.x, 0.25);
    const left = at <= boundX ? x0 : X(boundX);
    const right = at <= boundX ? X(boundX) : x1;
    const excluded = region.state === "excluded";
    const cls = excluded ? "pl-region-exclude" : "pl-region-permit";
    // Permitted before excluded: the theorem's positive content leads.
    const regionAnim = fadeAt(excluded ? 3 : 2);
    svg += box({
      x: left,
      y: NL_BAND_TOP,
      width: right - left,
      height: NL_BAND_BOTTOM - NL_BAND_TOP,
      className: `${cls}${weakStrokeClass(region.epistemic)}${weakFillClass(region.epistemic)}${regionAnim}`,
      radius: 3,
      tooltip: entityTooltip(region),
    });
    if (excluded) {
      // A second, hatched pass so the two bands stay distinguishable in
      // greyscale and to colour-blind readers.
      svg += el(
        "rect",
        {
          x: left,
          y: NL_BAND_TOP,
          width: right - left,
          height: NL_BAND_BOTTOM - NL_BAND_TOP,
          rx: 3,
          ry: 3,
          fill: `url(#${hatchId})`,
          stroke: "none",
          class: regionAnim === "" ? undefined : regionAnim.trimStart(),
        },
        "",
      );
    }
    const labelWidth = right - left - 14;
    svg += text(region.label, {
      x: (left + right) / 2,
      y: NL_REGION_LABEL_Y,
      className: `${excluded ? "pl-exclude-text" : "pl-permit-text"}${regionAnim}`,
      anchor: "middle",
      fontSize: 10.5,
      maxWidth: Math.max(20, labelWidth),
      title: entityTooltip(region),
    });
  }

  // --- axis --------------------------------------------------------------
  const axisStatus = axis?.epistemic ?? "illustrative";
  const axisClass = `pl-axis${schematic ? " pl-schematic" : ""}${weakStrokeClass(axisStatus)}${fadeAt(0)}`;
  svg += line(
    x0 - 8,
    NL_AXIS_Y,
    x1 + 8,
    NL_AXIS_Y,
    axisClass,
    axis
      ? `${axis.label} — ${axis.scale} axis, ${statusPhrase(axisStatus)}`
      : `schematic axis, ${statusPhrase(axisStatus)}`,
  );

  for (const tick of axis?.ticks ?? []) {
    const tx = X(tick.at);
    svg += line(tx, NL_BAND_BOTTOM, tx, NL_BAND_BOTTOM + 6, `pl-axis${fadeAt(0)}`, tick.label);
    const width = measureText(tick.label, 10);
    svg += text(tick.label, {
      x: clampCenter(tx, width, ctx.pad, ctx.width - ctx.pad),
      y: NL_TICK_LABEL_Y,
      className: `pl-tick${fadeAt(0)}`,
      anchor: "middle",
      fontSize: 10,
      maxWidth: ctx.width - ctx.pad * 2,
    });
  }

  if (axis) {
    const units = axis.units ? ` (${axis.units})` : "";
    const suffix = schematic ? " · schematic scale" : "";
    svg += text(`${axis.label}${units}${suffix}`, {
      x: x0 - 8,
      y: NL_AXIS_TITLE_Y,
      className: `pl-axis-title${fadeAt(0)}`,
      fontSize: 10.5,
      maxWidth: ctx.width - ctx.pad * 2,
      title: `${axis.label}${units} — ${axis.scale} axis`,
    });
  }

  // --- quantities --------------------------------------------------------
  for (const quantity of entitiesOfKind(spec, "quantity")) {
    const qx = X(quantity.position?.x);
    svg += circle(
      qx,
      NL_AXIS_Y,
      5,
      `pl-dot${weakFillClass(quantity.epistemic)}${fadeAt(4)}`,
      entityTooltip(quantity),
    );
    const label = quantity.detail ? `${quantity.label}  ·  ${quantity.detail}` : quantity.label;
    const width = measureText(label, 12);
    svg += text(label, {
      x: clampCenter(qx, width, ctx.pad, ctx.width - ctx.pad),
      y: NL_QTY_LABEL_Y,
      className: `pl-label pl-mono${isWeak(quantity.epistemic) ? " pl-weak-text" : ""}${fadeAt(4)}`,
      anchor: "middle",
      fontSize: 12,
      maxWidth: ctx.width - ctx.pad * 2,
      title: entityTooltip(quantity),
    });
  }

  // --- the bound itself --------------------------------------------------
  let strict = false;
  if (bound) {
    strict = bound.state === "excluded";
    const bx = X(bound.position?.x);
    // The marker line draws in; when the bound is weak its stroke is dashed,
    // and sliding a dash pattern is not a draw, so it fades instead.
    const markerAnim = isWeak(bound.epistemic)
      ? fadeAt(1)
      : ctx.anim({
          kind: "draw",
          delay: stageDelay(1),
          length: NL_MARKER_BOTTOM - NL_MARKER_TOP,
        });
    svg += line(
      bx,
      NL_MARKER_TOP,
      bx,
      NL_MARKER_BOTTOM,
      // Strictness is carried by the open circle alone. A dash here would
      // collide with the epistemic encoding, where dashed means "illustrative".
      `pl-marker${weakStrokeClass(bound.epistemic)}${markerAnim}`,
      entityTooltip(bound),
    );
    svg += circle(
      bx,
      NL_AXIS_Y,
      5.5,
      `${strict ? "pl-dot-open" : "pl-dot"}${fadeAt(1)}`,
      `${entityTooltip(bound)} — ${strict ? "open circle: the bound is excluded (strict)" : "filled circle: the bound is included (non-strict)"}`,
    );
    const width = measureText(bound.label, 12.5);
    svg += text(bound.label, {
      x: clampCenter(bx, width, ctx.pad, ctx.width - ctx.pad),
      y: NL_BOUND_LABEL_Y,
      className: `pl-label-strong pl-mono${fadeAt(1)}`,
      anchor: "middle",
      fontSize: 12.5,
      maxWidth: ctx.width - ctx.pad * 2,
      title: entityTooltip(bound),
    });
  }

  legend.push({
    swatch: "permit",
    text: "Solid band: the range of values the theorem permits.",
  });
  legend.push({
    swatch: "exclude",
    text: "Hatched band: values the theorem rules out.",
  });
  if (bound) {
    legend.push(
      strict
        ? {
            swatch: "open-dot",
            text: "Open circle: the bound is a strict inequality, so the bound value itself is excluded.",
          }
        : {
            swatch: "filled-dot",
            text: "Filled circle: the inequality is non-strict, so the bound value itself is permitted.",
          },
    );
  }
  if (schematic) {
    legend.push({
      swatch: "dashed-line",
      text: "Broken axis: the scale is schematic. Which side of the marker a quantity lies on is meaningful; the distance is not.",
    });
  }

  return { svg, height: NL_HEIGHT, legend };
}

// ---------------------------------------------------------------------------
// Monotonicity
// ---------------------------------------------------------------------------

/**
 * A schematic monotone curve.
 *
 * The theorem constrains an ordering, not a shape, so the curve is one
 * arbitrary witness: a single cubic whose control handles are flat at both
 * ends, which is monotone by construction for these control points and never
 * suggests an inflection the theorem does not claim.
 */
export function layoutMonotonicity(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  const legend: LegendRow[] = [];
  // Animated: axes first, then the curve traces, then everything that reads
  // off the curve (sample points, guides, captions).
  const axesAnim = ctx.anim({ kind: "fade", delay: stageDelay(0) });
  const afterTrace = (): string =>
    ctx.anim({ kind: "fade", delay: stageDelay(1) + TRACE_DURATION });
  const px0 = ctx.pad + 30;
  const py0 = 14;
  const py1 = 200;
  const plotWidth = Math.min(320, Math.max(180, (ctx.width - ctx.pad * 2) * 0.48));
  const px1 = px0 + plotWidth;

  const fn = spec.entities.find((e) => e.kind === "function");
  const detail = (fn?.detail ?? "").toLowerCase();
  const decreasing = detail.includes("decreasing");
  const status = fn?.epistemic ?? spec.epistemic;

  const xAxis = spec.axes.find((a) => a.orientation === "horizontal");
  const yAxis = spec.axes.find((a) => a.orientation === "vertical");
  const schematic = (xAxis?.scale ?? "schematic") === "schematic";
  const axisClass = `pl-axis${schematic ? " pl-schematic" : ""}${axesAnim}`;

  let svg = "";
  svg += line(
    px0,
    py0 - 6,
    px0,
    py1,
    axisClass,
    yAxis ? `${yAxis.label} (${yAxis.scale})` : "output",
  );
  svg += line(
    px0,
    py1,
    px1 + 10,
    py1,
    axisClass,
    xAxis ? `${xAxis.label} (${xAxis.scale})` : "input",
  );

  // Curve endpoints and control points.
  const ax = px0 + 12;
  const bx = px1 - 12;
  const ay = decreasing ? py0 + 16 : py1 - 16;
  const by = decreasing ? py1 - 16 : py0 + 16;
  const c1x = ax + (bx - ax) * 0.45;
  const c2x = ax + (bx - ax) * 0.55;
  const curveAnim = isWeak(status)
    ? ctx.anim({ kind: "fade", delay: stageDelay(1), duration: TRACE_DURATION })
    : ctx.anim({
        kind: "draw",
        delay: stageDelay(1),
        duration: TRACE_DURATION,
        length: cubicLength(ax, ay, c1x, ay, c2x, by, bx, by),
      });
  const d = `M ${num(ax)} ${num(ay)} C ${num(c1x)} ${num(ay)} ${num(c2x)} ${num(by)} ${num(bx)} ${num(by)}`;
  svg += path(
    d,
    `pl-curve${weakStrokeClass(status)}${curveAnim}`,
    {},
    `${fn?.label ?? "f"} — ${fn?.detail ?? "monotone"} — ${statusPhrase(status)}`,
  );

  // Sample points named by the planner ("u", "v") get a guide down to the axis
  // and across to the output axis, so the order-preservation is visible rather
  // than merely asserted.
  const samples = spec.entities.filter((e) => e.kind === "label" && e.position?.x !== undefined);
  for (const sample of samples) {
    const t = solveCubicT(ax, c1x, c2x, bx, ax + clamp01(sample.position?.x) * (bx - ax));
    const sx = cubic(ax, c1x, c2x, bx, t);
    const sy = cubic(ay, ay, by, by, t);
    svg += line(sx, py1, sx, sy, `pl-guide${afterTrace()}`);
    svg += line(px0, sy, sx, sy, `pl-guide${afterTrace()}`);
    svg += circle(sx, sy, 3.5, `pl-dot${afterTrace()}`, entityTooltip(sample));
    svg += text(sample.label, {
      x: sx,
      y: py1 + 15,
      className: `pl-label pl-mono${afterTrace()}`,
      anchor: "middle",
      fontSize: 11.5,
      maxWidth: 60,
      title: entityTooltip(sample),
    });
  }

  svg += text(xAxis?.label ?? "input", {
    x: px1 + 12,
    y: py1 + 15,
    className: `pl-axis-title${axesAnim}`,
    fontSize: 10.5,
    maxWidth: 90,
  });
  svg += el(
    "text",
    {
      x: px0 - 14,
      y: (py0 + py1) / 2,
      // Fade, never enter: a CSS transform would displace the rotation this
      // label carries in its own `transform` attribute mid-animation.
      class: `pl-axis-title${axesAnim}`,
      "text-anchor": "middle",
      transform: `rotate(-90 ${num(px0 - 14)} ${num((py0 + py1) / 2)})`,
    },
    escapeXml(yAxis?.label ?? "output"),
  );

  // Right-hand caption column: what the curve is a picture of.
  const capX = px1 + 34;
  const capWidth = ctx.width - ctx.pad - capX;
  if (capWidth > 90) {
    let capY = py0 + 22;
    svg += text(fn?.label ?? "f", {
      x: capX,
      y: capY,
      className: `pl-label-strong pl-mono${afterTrace()}`,
      fontSize: 13,
      maxWidth: capWidth,
      title: fn ? entityTooltip(fn) : undefined,
    });
    capY += 18;
    if (fn?.detail) {
      const para = paragraph(fn.detail, {
        x: capX,
        y: capY,
        className: `pl-detail${afterTrace()}`,
        maxWidth: capWidth,
        fontSize: 10.5,
        lineHeight: 13,
        maxLines: 2,
      });
      svg += para.svg;
      capY += para.height + 20;
    }
    for (const relationship of spec.relationships) {
      if (!relationship.label) continue;
      const para = paragraph(relationship.label, {
        x: capX,
        y: capY,
        className: `pl-label pl-mono${isWeak(relationship.epistemic) ? " pl-weak-text" : ""}${afterTrace()}`,
        maxWidth: capWidth,
        fontSize: 12,
        lineHeight: 16,
        maxLines: 3,
      });
      svg += para.svg;
      capY += para.height + 22;
    }
  }

  legend.push({
    swatch: "curve",
    text: "The curve is one arbitrary function with the proved order property. The theorem constrains the ordering, not the shape.",
  });
  if (schematic) {
    legend.push({
      swatch: "dashed-line",
      text: "Broken axes: both scales are schematic. No magnitude shown here was measured.",
    });
  }

  return { svg, height: py1 + 34, legend };
}

/** One coordinate of a cubic Bézier at parameter `t`. */
function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Invert x(t) by bisection.
 *
 * x(t) is strictly increasing for our control points, so 48 halvings settle it
 * far below a pixel. Bisection is used rather than Newton because it is
 * branch-free and therefore bit-for-bit reproducible.
 */
function solveCubicT(p0: number, p1: number, p2: number, p3: number, target: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (cubic(p0, p1, p2, p3, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Arc length of a cubic Bézier, by chord sampling, rounded up.
 *
 * Used as the dash budget for a curve trace. A fixed step count keeps it
 * deterministic; the +2 rounds the polyline underestimate the safe way, since
 * a budget shorter than the path would leave a gap in the final frame.
 */
function cubicLength(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): number {
  let length = 0;
  let px = x0;
  let py = y0;
  for (let i = 1; i <= 24; i += 1) {
    const t = i / 24;
    const x = cubic(x0, x1, x2, x3, t);
    const y = cubic(y0, y1, y2, y3, t);
    length += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return Math.ceil(length + 2);
}

/**
 * Dash budget for an edge drawn with {@link connector} or
 * {@link connectorVertical}: the endpoint distance plus the worst detour the
 * control handles can add. Always an overestimate — which only makes the
 * trace finish early — and always an integer, for byte-stable output.
 */
function edgeLength(x1: number, y1: number, x2: number, y2: number): number {
  return Math.ceil(Math.abs(x2 - x1) + Math.abs(y2 - y1)) + 100;
}

// ---------------------------------------------------------------------------
// Limit
// ---------------------------------------------------------------------------

/*
 * Vertical budget for the limit plot. The input axis sits at `LM_BASE` and the
 * frame is everything above it. Normalised y runs bottom-up — y = 0 is the
 * axis, y = 1 the top of the frame — which is the orientation a reader already
 * brings to a graph, and the one the planner's `direction` entity (y = 0, on
 * the axis) and `limit-value` entity (y = 0.3, low in the frame) assume.
 */
const LM_TOP = 14;
const LM_BASE = 200;

/**
 * A schematic limit plot.
 *
 * Two pictures share one layout, and which one is drawn is read from the spec
 * rather than from the title: the planner emits a `limit-value` entity exactly
 * when the limit is a finite value.
 *
 *  - **Convergent.** A dotted asymptote at the limit value, and a curve that
 *    flattens onto it from above without ever meeting it. Not touching is the
 *    whole point: `Tendsto f l (nhds L)` says the values get arbitrarily close
 *    to `L`, not that any of them equals `L`, and a curve drawn crossing its own
 *    limit would assert something the theorem does not.
 *  - **Divergent.** No asymptote, and a curve that leaves the frame under an
 *    arrowhead. Which edge it leaves by is taken from the function's own detail
 *    text, because drawing a divergence to +∞ as one to −∞ would be exactly the
 *    kind of confident wrong picture this project exists to prevent.
 */
export function layoutLimit(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  const legend: LegendRow[] = [];

  // Animated: the frame and the asymptote come first, so the curve is seen
  // approaching something that already exists; the curve then traces; text
  // that reads off the finished curve fades in last. For a divergence there
  // is no asymptote, and the arrowhead appears only as the trace completes.
  const axesAnim = ctx.anim({ kind: "fade", delay: stageDelay(0) });
  const afterTrace = (): string =>
    ctx.anim({ kind: "fade", delay: stageDelay(1) + TRACE_DURATION });

  // The y axis needs a gutter wide enough for a tick label; the plot then takes
  // most of what is left, leaving room for the direction marker past its end.
  const px0 = ctx.pad + 46;
  const available = ctx.width - ctx.pad - px0;
  const plotWidth = Math.min(340, Math.max(150, available * 0.62));
  const px1 = px0 + plotWidth;
  const py0 = LM_TOP;
  const py1 = LM_BASE;

  const fn = spec.entities.find((e) => e.kind === "function");
  // Presence of the limit value — not the wording of the title — is what says
  // this is a convergence.
  const limit =
    spec.entities.find((e) => e.id === "limit-value") ?? entitiesOfKind(spec, "bound")[0];
  const direction = spec.entities.find((e) => e.id === "direction" || e.kind === "label");
  const convergent = limit !== undefined;
  const detail = (fn?.detail ?? "").toLowerCase();
  const downward = !convergent && detail.includes("decreases without bound");
  const status = fn?.epistemic ?? spec.epistemic;

  const xAxis = spec.axes.find((a) => a.orientation === "horizontal");
  const yAxis = spec.axes.find((a) => a.orientation === "vertical");
  const schematic = (xAxis?.scale ?? "schematic") === "schematic";
  const axisClass = `pl-axis${schematic ? " pl-schematic" : ""}`;

  /** Normalised height (0 = the input axis, 1 = the top of the frame) to y. */
  const Y = (v: number): number => py1 - v * (py1 - py0);

  let svg = "";

  // --- axes ----------------------------------------------------------------
  svg += line(
    px0,
    py0 - 6,
    px0,
    py1,
    `${axisClass}${weakStrokeClass(yAxis?.epistemic ?? "illustrative")}${axesAnim}`,
    yAxis
      ? `${yAxis.label} — ${yAxis.scale} axis, ${statusPhrase(yAxis.epistemic)}`
      : "value — schematic axis",
  );
  // Drawn as a path rather than a line so the direction of travel can carry an
  // arrowhead: the reader has to know which way "the input" moves.
  svg += path(
    `M ${num(px0)} ${num(py1)} L ${num(px1 + 10)} ${num(py1)}`,
    `${axisClass}${weakStrokeClass(xAxis?.epistemic ?? "illustrative")}${axesAnim}`,
    { "marker-end": `url(#${ctx.id("arrow-muted")})` },
    xAxis
      ? `${xAxis.label} — ${xAxis.scale} axis, ${statusPhrase(xAxis.epistemic)}`
      : "input — schematic axis",
  );

  // --- the limit value -----------------------------------------------------
  // Kept clear of both ends of the frame so the curve has somewhere to come
  // from and the asymptote's label has somewhere to sit.
  const limitY = Math.max(py0 + 24, Math.min(py1 - 30, Y(clamp01(limit?.position?.y, 0.3))));

  for (const tick of yAxis?.ticks ?? []) {
    const ty = Math.max(py0, Math.min(py1, Y(clamp01(tick.at, 0.3))));
    svg += line(px0 - 5, ty, px0, ty, `pl-axis${axesAnim}`, tick.label);
    svg += text(tick.label, {
      x: px0 - 8,
      y: ty + 3.5,
      className: `pl-tick${axesAnim}`,
      anchor: "end",
      fontSize: 10,
      maxWidth: Math.max(0, px0 - ctx.pad - 10),
      title: `${tick.label} on the ${yAxis?.label ?? "value"} axis`,
    });
  }

  if (limit) {
    // The asymptote is dotted, so it fades rather than draws — and it fades
    // with the axes, before the curve, so the curve has something to approach.
    svg += path(
      `M ${num(px0)} ${num(limitY)} L ${num(px1 + 6)} ${num(limitY)}`,
      `pl-asymptote${weakStrokeClass(limit.epistemic)}${axesAnim}`,
      {},
      `${entityTooltip(limit)} — the curve approaches this line and never meets it`,
    );
    svg += text(limit.label, {
      x: px1 + 8,
      y: limitY + 14,
      className: `pl-label-strong pl-mono${isWeak(limit.epistemic) ? " pl-weak-text" : ""}${axesAnim}`,
      anchor: "end",
      fontSize: 12.5,
      maxWidth: Math.max(0, plotWidth * 0.6),
      title: entityTooltip(limit),
    });
  }

  // --- the curve -----------------------------------------------------------
  const ax = px0 + 12;
  const bx = px1 - 12;
  const dx = bx - ax;
  let curveEnd = py1;
  let curveLen: number;
  let d: string;

  if (convergent) {
    // Flat at the right-hand end and steep on the left: the shape of settling
    // down. The gap below the asymptote is deliberate and is never closed.
    const yEnd = limitY - 4;
    const yStart = Math.max(py0 + 6, Math.min(py0 + 16, yEnd - 36));
    const dy = yEnd - yStart;
    const c1x = ax + dx * 0.18;
    const c1y = yStart + dy * 0.72;
    const c2x = ax + dx * 0.48;
    d =
      `M ${num(ax)} ${num(yStart)} C ${num(c1x)} ${num(c1y)}` +
      ` ${num(c2x)} ${num(yEnd)} ${num(bx)} ${num(yEnd)}`;
    curveLen = cubicLength(ax, yStart, c1x, c1y, c2x, yEnd, bx, yEnd);
    curveEnd = yEnd;
  } else {
    // Flat on the left and steep at the right: the shape of leaving.
    const yStart = downward ? py0 + 22 : py1 - 22;
    const yEnd = downward ? py1 + 18 : py0 - 8;
    const dy = yEnd - yStart;
    const c1x = ax + dx * 0.55;
    const c2x = ax + dx * 0.86;
    const c2y = yStart + dy * 0.55;
    d =
      `M ${num(ax)} ${num(yStart)} C ${num(c1x)} ${num(yStart)}` +
      ` ${num(c2x)} ${num(c2y)} ${num(bx)} ${num(yEnd)}`;
    curveLen = cubicLength(ax, yStart, c1x, yStart, c2x, c2y, bx, yEnd);
    curveEnd = yEnd;
  }

  const curveAnim = isWeak(status)
    ? ctx.anim({ kind: "fade", delay: stageDelay(1), duration: TRACE_DURATION })
    : ctx.anim({
        kind: "draw",
        delay: stageDelay(1),
        duration: TRACE_DURATION,
        length: curveLen,
        // The divergence arrowhead appears only as the trace reaches the edge
        // of the frame; a convergent curve never carries one.
        revealMarker: convergent ? undefined : ctx.id("arrow"),
      });

  svg += path(
    d,
    `pl-curve${weakStrokeClass(status)}${curveAnim}`,
    convergent ? {} : { "marker-end": `url(#${ctx.id("arrow")})` },
    `${fn?.label ?? "the function"} — ${fn?.detail ?? (convergent ? "converges" : "diverges")} — ${statusPhrase(status)}`,
  );

  if (!convergent) {
    // Said in words as well as drawn: an arrowhead alone is a convention, and
    // "the values leave every bound" is the actual content of the theorem.
    const noticeY = downward ? py1 - 12 : py0 + 12;
    svg += text("the values leave every bound", {
      x: px0 + 10,
      y: noticeY,
      className: `pl-label${afterTrace()}`,
      fontSize: 12,
      maxWidth: Math.max(0, bx - px0 - 24),
      title: `${fn?.label ?? "the function"} ${fn?.detail ?? "leaves every bound"}`,
    });
  }

  // --- direction of travel -------------------------------------------------
  if (direction) {
    svg += text(direction.label, {
      x: px1 + 16,
      y: py1 + 4,
      className: `pl-label-strong pl-mono${isWeak(direction.epistemic) ? " pl-weak-text" : ""}${axesAnim}`,
      fontSize: 12.5,
      maxWidth: Math.max(0, ctx.width - ctx.pad - (px1 + 16)),
      title: entityTooltip(direction),
    });
  }

  // The input axis title drops a row when the curve leaves through the bottom,
  // so the two never share space.
  const axisTitleY = downward ? py1 + 36 : py1 + 20;
  if (xAxis) {
    const units = xAxis.units ? ` (${xAxis.units})` : "";
    const suffix = schematic ? " · schematic scale" : "";
    svg += text(`${xAxis.label}${units}${suffix}`, {
      x: px0,
      y: axisTitleY,
      className: `pl-axis-title${axesAnim}`,
      fontSize: 10.5,
      maxWidth: Math.max(0, ctx.width - ctx.pad - px0),
      title: `${xAxis.label}${units} — ${xAxis.scale} axis`,
    });
  }
  svg += el(
    "text",
    {
      x: ctx.pad + 8,
      y: (py0 + py1) / 2,
      // Fade, never enter: a CSS transform would displace this label's own
      // rotation mid-animation.
      class: `pl-axis-title${axesAnim}`,
      "text-anchor": "middle",
      transform: `rotate(-90 ${num(ctx.pad + 8)} ${num((py0 + py1) / 2)})`,
    },
    escapeXml(yAxis?.label ?? "value"),
  );

  // --- caption column ------------------------------------------------------
  const capX = px1 + 34;
  const capWidth = ctx.width - ctx.pad - capX;
  if (capWidth > 90) {
    let capY = py0 + 22;
    svg += text(fn?.label ?? "the function", {
      x: capX,
      y: capY,
      className: `pl-label-strong pl-mono${afterTrace()}`,
      fontSize: 13,
      maxWidth: capWidth,
      title: fn ? entityTooltip(fn) : undefined,
    });
    capY += 18;
    if (fn?.detail) {
      const para = paragraph(fn.detail, {
        x: capX,
        y: capY,
        className: `pl-detail${afterTrace()}`,
        maxWidth: capWidth,
        fontSize: 10.5,
        lineHeight: 13,
        maxLines: 2,
      });
      svg += para.svg;
      capY += para.height + 20;
    }
    for (const relationship of spec.relationships) {
      if (!relationship.label) continue;
      const para = paragraph(relationship.label, {
        x: capX,
        y: capY,
        className: `pl-label pl-mono${isWeak(relationship.epistemic) ? " pl-weak-text" : ""}${afterTrace()}`,
        maxWidth: capWidth,
        fontSize: 12,
        lineHeight: 16,
        maxLines: 3,
      });
      svg += para.svg;
      capY += para.height + 22;
    }
    if (direction?.detail) {
      svg += text(direction.detail, {
        x: capX,
        y: capY,
        className: `pl-detail${afterTrace()}`,
        fontSize: 10.5,
        maxWidth: capWidth,
        title: entityTooltip(direction),
      });
    }
  }

  // --- legend --------------------------------------------------------------
  if (convergent) {
    legend.push({
      swatch: "asymptote",
      text: "Dotted horizontal line: the limit value. The curve closes on it and never meets it — the theorem says the values get arbitrarily close, not that any of them is the limit.",
    });
    legend.push({
      swatch: "curve",
      text: "The curve is one arbitrary function with the proved limit. The theorem constrains where the values end up, not the path they take to get there.",
    });
    legend.push({
      swatch: "arrow",
      text: `Arrowhead on the input axis: the direction the input travels${xAxis ? ` (${xAxis.label})` : ""}. There is no arrowhead on the curve, because the values settle rather than leave.`,
    });
  } else {
    legend.push({
      swatch: "curve",
      text: `The curve leaves the frame ${downward ? "through the bottom" : "through the top"} and the arrowhead says it keeps going. There is no limit line to draw: the values leave every bound.`,
    });
    legend.push({
      swatch: "arrow",
      text: `Arrowheads mark direction of travel: along the input axis${xAxis ? ` (${xAxis.label})` : ""}, and past the edge of the frame for the values themselves.`,
    });
  }
  if (schematic) {
    legend.push({
      swatch: "dashed-line",
      text: "Broken axes: both scales are schematic. No magnitude shown here was measured, and neither the steepness of the curve nor how quickly it flattens means anything.",
    });
  }

  return { svg, height: Math.max(axisTitleY + 14, curveEnd + 16), legend };
}

// ---------------------------------------------------------------------------
// Assumption sensitivity — the flagship figure
// ---------------------------------------------------------------------------

interface HypBox {
  entity: VisualEntity;
  x: number;
  y: number;
  width: number;
  height: number;
  used: boolean;
}

/**
 * Two columns: stated hypotheses on the left, the conclusion on the right.
 *
 * The reading is meant to be immediate: a hypothesis with a wire running to the
 * conclusion was used by the proof term; a hypothesis sitting under the second
 * heading with no wire was not. The unused group is separated by a rule and its
 * own heading rather than merely greyed out, because "greyed out" is a
 * convention a reader has to be taught, whereas "these ones are not connected
 * to anything" is not.
 *
 * Animated, the used hypotheses enter first, then the conclusion, then the
 * wires draw from one to the other — the proof building from its premises.
 * The unused hypotheses fade in *in place*, muted, between the used group and
 * the conclusion: no rise, no wire, no entrance that could imply they
 * contribute.
 */
export function layoutAssumptionSensitivity(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  const legend: LegendRow[] = [];
  const inner = ctx.width - ctx.pad * 2;
  const colWidth = Math.max(160, Math.round(inner * 0.44));
  const leftX = ctx.pad;
  const rightX = ctx.width - ctx.pad - colWidth;

  const hypotheses = entitiesOfKind(spec, "hypothesis");
  const used = hypotheses.filter((h) => h.state !== "unused");
  const unused = hypotheses.filter((h) => h.state === "unused");
  const conclusion = entitiesOfKind(spec, "conclusion")[0];

  const usedAnim = ctx.anim({ kind: "enter", delay: stageDelay(0) });
  const unusedAnim = (): string => ctx.anim({ kind: "fade", delay: stageDelay(1) });
  const conclusionStage = unused.length > 0 ? 2 : 1;
  const conclusionAnim = (): string =>
    ctx.anim({ kind: "enter", delay: stageDelay(conclusionStage) });

  const boxes: HypBox[] = [];
  let svg = "";
  let y = 12;

  const layoutGroup = (group: VisualEntity[], heading: string, isUsed: boolean): void => {
    if (group.length === 0) return;
    const anim = isUsed ? usedAnim : unusedAnim();
    svg += text(heading, {
      x: leftX,
      y,
      className: `pl-heading${anim}`,
      fontSize: 10,
      maxWidth: colWidth,
    });
    y += 12;
    for (const entity of group) {
      const height = hypothesisBoxHeight(entity, colWidth, isUsed);
      boxes.push({ entity, x: leftX, y, width: colWidth, height, used: isUsed });
      svg += renderHypothesisBox(entity, leftX, y, colWidth, isUsed, anim);
      y += height + 10;
    }
    y += 8;
  };

  layoutGroup(used, `USED BY THE PROOF TERM (${used.length})`, true);
  if (unused.length > 0) {
    svg += line(leftX, y - 4, leftX + colWidth, y - 4, `pl-rule${unusedAnim()}`);
    y += 8;
    layoutGroup(unused, `STATED BUT NEVER USED (${unused.length})`, false);
  }

  const leftBottom = Math.max(y, 40);

  // The conclusion sits opposite the *used* group, since those are the boxes
  // that will have wires running into it.
  let rightSvg = "";
  let rightBottom = 40;
  if (conclusion) {
    const label = conclusion.label;
    const wrapped = wrapToWidth(label, colWidth - 20, 12, 5);
    const height = 24 + Math.max(1, wrapped.lines.length) * 16;
    const usedBoxes = boxes.filter((b) => b.used);
    const first = usedBoxes[0];
    const last = usedBoxes[usedBoxes.length - 1];
    const anchorCenter =
      first && last ? (first.y + (last.y + last.height)) / 2 : leftBottom / 2 + 12;
    const top = Math.max(
      24,
      Math.min(anchorCenter - height / 2, Math.max(24, leftBottom - height)),
    );

    rightSvg += text("CONCLUSION", {
      x: rightX,
      y: top - 10,
      className: `pl-heading${conclusionAnim()}`,
      fontSize: 10,
      maxWidth: colWidth,
    });
    rightSvg += box({
      x: rightX,
      y: top,
      width: colWidth,
      height,
      className: `pl-box-primary${weakStrokeClass(conclusion.epistemic)}${conclusionAnim()}`,
      tooltip: entityTooltip(conclusion),
    });
    const para = paragraph(label, {
      x: rightX + 10,
      y: top + 22,
      className: `pl-label pl-mono${conclusionAnim()}`,
      maxWidth: colWidth - 20,
      fontSize: 12,
      lineHeight: 16,
      maxLines: 5,
    });
    rightSvg += para.svg;
    rightBottom = top + height;

    // Wires. Only relationships the planner actually recorded are drawn: an
    // undrawn hypothesis is undrawn because nothing said it was used.
    const byId = new Map(boxes.map((b) => [b.entity.id, b] as const));
    const conclusionCy = top + height / 2;
    for (const relationship of spec.relationships) {
      if (relationship.to !== conclusion.id) continue;
      const source = byId.get(relationship.from);
      if (!source || !source.used) continue;
      const x1 = source.x + source.width;
      const y1 = source.y + source.height / 2;
      const d = connector(x1, y1, rightX, conclusionCy);
      // A wire draws only once both of its endpoints stand.
      const wireAnim = isWeak(relationship.epistemic)
        ? ctx.anim({ kind: "fade", delay: afterStage(conclusionStage) })
        : ctx.anim({
            kind: "draw",
            delay: afterStage(conclusionStage),
            length: edgeLength(x1, y1, rightX, conclusionCy),
            revealMarker: ctx.id("arrow"),
          });
      svg += path(
        d,
        `pl-edge-used${weakStrokeClass(relationship.epistemic)}${wireAnim}`,
        { "marker-end": `url(#${ctx.id("arrow")})` },
        `${source.entity.label} is used to prove the conclusion — ${statusPhrase(relationship.epistemic)}`,
      );
    }
  }

  svg += rightSvg;

  legend.push({
    swatch: "used-box",
    text: "Connected box: the elaborated proof term references this hypothesis.",
  });
  if (unused.length > 0) {
    legend.push({
      swatch: "unused-box",
      text: "Detached, dashed box: the hypothesis is stated but never referenced by this proof. That is a fact about the proof, not about mathematical necessity — another proof might need it.",
    });
  }
  legend.push({
    swatch: "arrow",
    text: "An arrow means “this assumption is used in deriving the conclusion”.",
  });

  return { svg, height: Math.max(leftBottom, rightBottom) + 10, legend };
}

function hypothesisBoxHeight(entity: VisualEntity, width: number, used: boolean): number {
  const detailLines = entity.detail
    ? wrapToWidth(entity.detail, width - 20, 10.5, 2).lines.length
    : 0;
  return 12 + 16 + detailLines * 13 + (used ? 0 : 14) + 8;
}

function renderHypothesisBox(
  entity: VisualEntity,
  x: number,
  y: number,
  width: number,
  used: boolean,
  anim = "",
): string {
  const height = hypothesisBoxHeight(entity, width, used);
  const className = used
    ? `pl-box${weakStrokeClass(entity.epistemic)}${anim}`
    : `pl-box-unused${weakFillClass(entity.epistemic)}${anim}`;
  let svg = box({ x, y, width, height, className, tooltip: entityTooltip(entity) });
  let cursor = y + 22;
  svg += text(entity.label, {
    x: x + 10,
    y: cursor,
    className: `pl-label-strong pl-mono${used ? "" : " pl-unused-text"}${anim}`,
    fontSize: 12.5,
    maxWidth: width - 20,
    title: entityTooltip(entity),
  });
  cursor += 15;
  if (entity.detail) {
    const para = paragraph(entity.detail, {
      x: x + 10,
      y: cursor,
      className: `pl-detail pl-mono${used ? "" : " pl-unused-text"}${anim}`,
      maxWidth: width - 20,
      fontSize: 10.5,
      lineHeight: 13,
      maxLines: 2,
    });
    svg += para.svg;
    cursor += para.height + 14;
  }
  if (!used) {
    // Said in words, not only in styling. The whole finding is this label.
    svg += text("NEVER USED IN THIS PROOF", {
      x: x + 10,
      y: cursor,
      className: `pl-badge${anim}`,
      fontSize: 9,
      maxWidth: width - 20,
    });
  }
  return svg;
}

// ---------------------------------------------------------------------------
// Layered graphs: dependency-graph, implication-graph, relationship-diagram
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A layered graph driven entirely by `position.layer` / `position.order`.
 *
 * Layers become columns left-to-right, which matches how a dependency reads
 * ("this rests on that"). When the columns would be too narrow to hold a
 * declaration name, the layout flips to rows top-to-bottom instead of
 * shrinking labels into illegibility.
 *
 * Animated, layers appear in ascending `layer` order. For a dependency graph
 * the planner assigns `layer` = dependency depth, with 0 the declarations
 * that rest on nothing local — so the proof builds upward from its
 * foundations and the focused theorem, at the greatest depth, arrives last.
 * Every edge draws only after both of its endpoints' layers have entered.
 * That order is derived from the proof term; only the pacing is a choice.
 */
export function layoutLayeredGraph(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  const legend: LegendRow[] = [];
  const inner = ctx.width - ctx.pad * 2;

  const layers = new Map<number, VisualEntity[]>();
  for (const entity of spec.entities) {
    const layer = entity.position?.layer ?? 0;
    const bucket = layers.get(layer);
    if (bucket) bucket.push(entity);
    else layers.set(layer, [entity]);
  }
  const layerKeys = Array.from(layers.keys()).sort((a, b) => a - b);
  for (const key of layerKeys) {
    const bucket = layers.get(key) as VisualEntity[];
    bucket.sort((a, b) => (a.position?.order ?? 0) - (b.position?.order ?? 0));
  }

  /** Animation stage of an entity: the rank of its layer, foundations first. */
  const stageOf = (entity: VisualEntity): number => {
    const index = layerKeys.indexOf(entity.position?.layer ?? 0);
    return index < 0 ? 0 : index;
  };

  const hasDetail = spec.entities.some((e) => e.detail);
  const nodeHeight = hasDetail ? 42 : 30;
  const columnWidth = layerKeys.length > 0 ? inner / layerKeys.length : inner;
  const horizontal = columnWidth - 22 >= 110;

  const rects = new Map<string, Rect>();
  let svg = "";
  let height: number;

  if (horizontal) {
    const boxWidth = columnWidth - 22;
    const heights = layerKeys.map((key) => {
      const n = (layers.get(key) as VisualEntity[]).length;
      return n * nodeHeight + (n - 1) * 14;
    });
    const tallest = heights.reduce((a, b) => Math.max(a, b), 0);
    layerKeys.forEach((key, i) => {
      const bucket = layers.get(key) as VisualEntity[];
      const columnHeight = heights[i] ?? 0;
      let y = 8 + (tallest - columnHeight) / 2;
      const x = ctx.pad + i * columnWidth + 11;
      for (const entity of bucket) {
        rects.set(entity.id, { x, y, width: boxWidth, height: nodeHeight });
        y += nodeHeight + 14;
      }
    });
    height = tallest + 20;
  } else {
    const rowHeight = nodeHeight + 34;
    layerKeys.forEach((key, i) => {
      const bucket = layers.get(key) as VisualEntity[];
      const cellWidth = inner / Math.max(1, bucket.length);
      const boxWidth = Math.max(60, cellWidth - 14);
      bucket.forEach((entity, j) => {
        rects.set(entity.id, {
          x: ctx.pad + j * cellWidth + (cellWidth - boxWidth) / 2,
          y: 8 + i * rowHeight,
          width: boxWidth,
          height: nodeHeight,
        });
      });
    });
    height = layerKeys.length * rowHeight + 12;
  }

  // Edges first, so nodes paint over the wire ends.
  const entityById = new Map(spec.entities.map((e) => [e.id, e] as const));
  for (const relationship of spec.relationships) {
    const from = rects.get(relationship.from);
    const to = rects.get(relationship.to);
    if (!from || !to) continue;
    const d = routeEdge(from, to, horizontal);
    const weak = isWeak(relationship.epistemic);
    // An edge draws only after both of its endpoints' layers have entered.
    const fromEntity = entityById.get(relationship.from);
    const toEntity = entityById.get(relationship.to);
    const readyAt = afterStage(
      Math.max(fromEntity ? stageOf(fromEntity) : 0, toEntity ? stageOf(toEntity) : 0),
    );
    const edgeAnim = weak
      ? ctx.anim({ kind: "fade", delay: readyAt })
      : ctx.anim({
          kind: "draw",
          delay: readyAt,
          length: edgeLength(
            from.x + from.width / 2,
            from.y + from.height / 2,
            to.x + to.width / 2,
            to.y + to.height / 2,
          ),
          revealMarker: ctx.id("arrow-muted"),
        });
    svg += path(
      d,
      `pl-edge${weak ? " pl-weak-stroke" : ""}${edgeAnim}`,
      { "marker-end": `url(#${ctx.id("arrow-muted")})` },
      `${labelFor(spec, relationship.from)} ${relationship.kind} ${labelFor(spec, relationship.to)} — ${statusPhrase(relationship.epistemic)}`,
    );
    if (relationship.label) {
      const mid = midpoint(from, to);
      svg += text(relationship.label, {
        x: mid.x,
        y: mid.y - 5,
        className: `pl-detail${ctx.anim({ kind: "fade", delay: readyAt })}`,
        anchor: "middle",
        fontSize: 10.5,
        maxWidth: 120,
        title: `${relationship.kind}: ${relationship.label}`,
      });
    }
  }

  for (const entity of spec.entities) {
    const rect = rects.get(entity.id);
    if (!rect) continue;
    const primary = entity.emphasis === "primary";
    const nodeAnim = ctx.anim({ kind: "enter", delay: stageDelay(stageOf(entity)) });
    svg += box({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      className: `${primary ? "pl-box-primary" : "pl-box"}${weakStrokeClass(entity.epistemic)}${nodeAnim}`,
      tooltip: entityTooltip(entity),
    });
    svg += text(entity.label, {
      x: rect.x + 9,
      y: rect.y + (entity.detail ? 19 : 19),
      className: `pl-label pl-mono${isWeak(entity.epistemic) ? " pl-weak-text" : ""}${nodeAnim}`,
      fontSize: 11.5,
      maxWidth: rect.width - 18,
      title: entityTooltip(entity),
    });
    if (entity.detail) {
      svg += text(entity.detail, {
        x: rect.x + 9,
        y: rect.y + 33,
        className: `pl-detail${nodeAnim}`,
        fontSize: 10.5,
        maxWidth: rect.width - 18,
      });
    }
  }

  legend.push({
    swatch: "arrow",
    text: horizontal
      ? "Layers run left to right; an arrow points from a node to what it relates to."
      : "Layers run top to bottom; an arrow points from a node to what it relates to.",
  });

  return { svg, height, legend };
}

function labelFor(spec: VisualSpec, id: string): string {
  return spec.entities.find((e) => e.id === id)?.label ?? id;
}

function midpoint(a: Rect, b: Rect): { x: number; y: number } {
  return {
    x: (a.x + a.width / 2 + b.x + b.width / 2) / 2,
    y: (a.y + a.height / 2 + b.y + b.height / 2) / 2,
  };
}

/** Pick exit and entry sides so a wire never crosses the box it leaves. */
function routeEdge(a: Rect, b: Rect, horizontal: boolean): string {
  const acy = a.y + a.height / 2;
  const bcy = b.y + b.height / 2;
  const acx = a.x + a.width / 2;
  const bcx = b.x + b.width / 2;
  if (horizontal) {
    if (b.x >= a.x + a.width) return connector(a.x + a.width, acy, b.x, bcy);
    if (b.x + b.width <= a.x) return connector(a.x, acy, b.x + b.width, bcy);
    return connectorVertical(acx, a.y + a.height, bcx, b.y);
  }
  if (b.y >= a.y + a.height) return connectorVertical(acx, a.y + a.height, bcx, b.y);
  if (b.y + b.height <= a.y) return connectorVertical(acx, a.y, bcx, b.y + b.height);
  return connector(a.x + a.width, acy, b.x, bcy);
}

// ---------------------------------------------------------------------------
// Expression tree
// ---------------------------------------------------------------------------

/**
 * Structure-preserving fallback: the conclusion boxed, its hypotheses listed
 * beneath and tied to it by a spine.
 *
 * This layout is reached when ProofLens could not interpret the statement, so
 * it claims as little as possible: it shows what was written down and how the
 * binders relate to the goal, and nothing else.
 */
export function layoutExpressionTree(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  const legend: LegendRow[] = [];
  const inner = ctx.width - ctx.pad * 2;
  const conclusion = entitiesOfKind(spec, "conclusion")[0];
  const hypotheses = entitiesOfKind(spec, "hypothesis");

  // Animated: the conclusion (layer 0, the statement itself) first, then the
  // hypotheses beneath it — used ones entering, unused ones fading in place —
  // then the spine that ties them to the goal.
  const conclusionAnim = (): string => ctx.anim({ kind: "enter", delay: stageDelay(0) });
  const spineAt = afterStage(1);

  let svg = "";
  let y = 12;
  let spineTop = y;

  if (conclusion) {
    svg += text("CONCLUSION", {
      x: ctx.pad,
      y,
      className: `pl-heading${conclusionAnim()}`,
      fontSize: 10,
      maxWidth: inner,
    });
    y += 12;
    const wrapped = wrapToWidth(conclusion.label, inner - 20, 12.5, 4);
    const height = 22 + Math.max(1, wrapped.lines.length) * 16;
    svg += box({
      x: ctx.pad,
      y,
      width: inner,
      height,
      className: `pl-box-primary${weakStrokeClass(conclusion.epistemic)}${conclusionAnim()}`,
      tooltip: entityTooltip(conclusion),
    });
    svg += paragraph(conclusion.label, {
      x: ctx.pad + 10,
      y: y + 21,
      className: `pl-label pl-mono${conclusionAnim()}`,
      maxWidth: inner - 20,
      fontSize: 12.5,
      lineHeight: 16,
      maxLines: 4,
    }).svg;
    y += height + 6;
    spineTop = y;
  }

  if (hypotheses.length > 0) {
    y += 16;
    svg += text(`HYPOTHESES (${hypotheses.length})`, {
      x: ctx.pad + 26,
      y,
      className: `pl-heading${ctx.anim({ kind: "fade", delay: stageDelay(1) })}`,
      fontSize: 10,
      maxWidth: inner - 26,
    });
    y += 10;
    const spineX = ctx.pad + 12;
    const boxX = ctx.pad + 26;
    const boxWidth = inner - 26;
    let lastCenter = y;
    for (const entity of hypotheses) {
      const used = entity.state !== "unused";
      const height = hypothesisBoxHeight(entity, boxWidth, used);
      // Unused hypotheses fade in place: no rise, nothing that could imply
      // they contribute to the conclusion.
      const hypAnim = ctx.anim({
        kind: used ? "enter" : "fade",
        delay: stageDelay(1),
      });
      svg += renderHypothesisBox(entity, boxX, y, boxWidth, used, hypAnim);
      lastCenter = y + height / 2;
      svg += line(
        spineX,
        lastCenter,
        boxX,
        lastCenter,
        used
          ? `pl-edge-used${ctx.anim({ kind: "draw", delay: spineAt, length: boxX - spineX })}`
          : `pl-edge pl-weak-stroke${ctx.anim({ kind: "fade", delay: spineAt })}`,
      );
      y += height + 10;
    }
    svg += line(
      spineX,
      spineTop,
      spineX,
      lastCenter,
      `pl-edge${ctx.anim({
        kind: "draw",
        delay: spineAt,
        length: Math.max(1, lastCenter - spineTop),
      })}`,
    );
  }

  legend.push({
    swatch: "used-box",
    text: "ProofLens shows a theorem's formal structure even when it cannot interpret the statement. Nothing in this figure is guessed.",
  });
  if (hypotheses.some((h) => h.state === "unused")) {
    legend.push({
      swatch: "unused-box",
      text: "Dashed box: the hypothesis is stated but never referenced by the proof term.",
    });
  }

  return { svg, height: y + 6, legend };
}

// ---------------------------------------------------------------------------
// Generic fallback
// ---------------------------------------------------------------------------

/**
 * The renderer of last resort.
 *
 * An unrecognised `type` must still produce something honest and readable, so
 * the spec is listed out as text: entities, relationships and axes, each with
 * its epistemic standing. This function has no preconditions and cannot throw.
 */
export function layoutGeneric(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  const inner = ctx.width - ctx.pad * 2;
  let svg = "";
  let y = 14;

  const section = (
    heading: string,
    lines: Array<{ text: string; tooltip: string; weak: boolean }>,
  ): void => {
    if (lines.length === 0) return;
    svg += text(heading, { x: ctx.pad, y, className: "pl-heading", fontSize: 10, maxWidth: inner });
    y += 15;
    for (const item of lines) {
      svg += text(item.text, {
        x: ctx.pad + 10,
        y,
        className: `pl-label${item.weak ? " pl-weak-text" : ""}`,
        fontSize: 11.5,
        maxWidth: inner - 10,
        title: item.tooltip,
      });
      y += 16;
    }
    y += 10;
  };

  section(
    `ELEMENTS (${spec.entities.length})`,
    spec.entities.map((entity) => ({
      text: `${entity.label}  ·  ${entity.kind}${entity.state && entity.state !== "neutral" ? ` / ${entity.state}` : ""}  ·  ${entity.epistemic}`,
      tooltip: entityTooltip(entity),
      weak: isWeak(entity.epistemic),
    })),
  );

  section(
    `RELATIONSHIPS (${spec.relationships.length})`,
    spec.relationships.map((relationship) => ({
      text: `${labelFor(spec, relationship.from)}  —${relationship.kind}→  ${labelFor(spec, relationship.to)}${relationship.label ? `  (${relationship.label})` : ""}`,
      tooltip: `${relationship.kind} — ${statusPhrase(relationship.epistemic)}`,
      weak: isWeak(relationship.epistemic),
    })),
  );

  section(
    `AXES (${spec.axes.length})`,
    spec.axes.map((axis) => ({
      text: `${axis.label}${axis.units ? ` (${axis.units})` : ""}  ·  ${axis.orientation}  ·  ${axis.scale}`,
      tooltip: `${axis.label} — ${axis.scale} axis, ${statusPhrase(axis.epistemic)}`,
      weak: isWeak(axis.epistemic),
    })),
  );

  if (spec.entities.length === 0 && spec.relationships.length === 0 && spec.axes.length === 0) {
    svg += text("This figure has no elements to draw.", {
      x: ctx.pad,
      y,
      className: "pl-note",
      fontSize: 11,
      maxWidth: inner,
    });
    y += 18;
  }

  return {
    svg,
    height: y,
    legend: [
      {
        swatch: "none",
        text: `No purpose-built layout exists for “${spec.type}”, so its contents are listed rather than drawn. Each line ends with that element's epistemic standing.`,
      },
    ],
  };
}
