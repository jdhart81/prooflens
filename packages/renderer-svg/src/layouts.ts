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
 */
export function layoutNumberLine(spec: VisualSpec, ctx: RenderContext): LayoutResult {
  const legend: LegendRow[] = [];
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
    svg += box({
      x: left,
      y: NL_BAND_TOP,
      width: right - left,
      height: NL_BAND_BOTTOM - NL_BAND_TOP,
      className: `${cls}${weakStrokeClass(region.epistemic)}${weakFillClass(region.epistemic)}`,
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
        },
        "",
      );
    }
    const labelWidth = right - left - 14;
    svg += text(region.label, {
      x: (left + right) / 2,
      y: NL_REGION_LABEL_Y,
      className: excluded ? "pl-exclude-text" : "pl-permit-text",
      anchor: "middle",
      fontSize: 10.5,
      maxWidth: Math.max(20, labelWidth),
      title: entityTooltip(region),
    });
  }

  // --- axis --------------------------------------------------------------
  const axisStatus = axis?.epistemic ?? "illustrative";
  const axisClass = `pl-axis${schematic ? " pl-schematic" : ""}${weakStrokeClass(axisStatus)}`;
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
    svg += line(tx, NL_BAND_BOTTOM, tx, NL_BAND_BOTTOM + 6, "pl-axis", tick.label);
    const width = measureText(tick.label, 10);
    svg += text(tick.label, {
      x: clampCenter(tx, width, ctx.pad, ctx.width - ctx.pad),
      y: NL_TICK_LABEL_Y,
      className: "pl-tick",
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
      className: "pl-axis-title",
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
      `pl-dot${weakFillClass(quantity.epistemic)}`,
      entityTooltip(quantity),
    );
    const label = quantity.detail ? `${quantity.label}  ·  ${quantity.detail}` : quantity.label;
    const width = measureText(label, 12);
    svg += text(label, {
      x: clampCenter(qx, width, ctx.pad, ctx.width - ctx.pad),
      y: NL_QTY_LABEL_Y,
      className: `pl-label pl-mono${isWeak(quantity.epistemic) ? " pl-weak-text" : ""}`,
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
    svg += line(
      bx,
      NL_MARKER_TOP,
      bx,
      NL_MARKER_BOTTOM,
      // Strictness is carried by the open circle alone. A dash here would
      // collide with the epistemic encoding, where dashed means "illustrative".
      `pl-marker${weakStrokeClass(bound.epistemic)}`,
      entityTooltip(bound),
    );
    svg += circle(
      bx,
      NL_AXIS_Y,
      5.5,
      strict ? "pl-dot-open" : "pl-dot",
      `${entityTooltip(bound)} — ${strict ? "open circle: the bound is excluded (strict)" : "filled circle: the bound is included (non-strict)"}`,
    );
    const width = measureText(bound.label, 12.5);
    svg += text(bound.label, {
      x: clampCenter(bx, width, ctx.pad, ctx.width - ctx.pad),
      y: NL_BOUND_LABEL_Y,
      className: "pl-label-strong pl-mono",
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
  const axisClass = `pl-axis${schematic ? " pl-schematic" : ""}`;

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
  const d = `M ${num(ax)} ${num(ay)} C ${num(c1x)} ${num(ay)} ${num(c2x)} ${num(by)} ${num(bx)} ${num(by)}`;
  svg += path(
    d,
    `pl-curve${weakStrokeClass(status)}`,
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
    svg += line(sx, py1, sx, sy, "pl-guide");
    svg += line(px0, sy, sx, sy, "pl-guide");
    svg += circle(sx, sy, 3.5, "pl-dot", entityTooltip(sample));
    svg += text(sample.label, {
      x: sx,
      y: py1 + 15,
      className: "pl-label pl-mono",
      anchor: "middle",
      fontSize: 11.5,
      maxWidth: 60,
      title: entityTooltip(sample),
    });
  }

  svg += text(xAxis?.label ?? "input", {
    x: px1 + 12,
    y: py1 + 15,
    className: "pl-axis-title",
    fontSize: 10.5,
    maxWidth: 90,
  });
  svg += el(
    "text",
    {
      x: px0 - 14,
      y: (py0 + py1) / 2,
      class: "pl-axis-title",
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
      className: "pl-label-strong pl-mono",
      fontSize: 13,
      maxWidth: capWidth,
      title: fn ? entityTooltip(fn) : undefined,
    });
    capY += 18;
    if (fn?.detail) {
      const para = paragraph(fn.detail, {
        x: capX,
        y: capY,
        className: "pl-detail",
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
        className: `pl-label pl-mono${isWeak(relationship.epistemic) ? " pl-weak-text" : ""}`,
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

  const boxes: HypBox[] = [];
  let svg = "";
  let y = 12;

  const layoutGroup = (group: VisualEntity[], heading: string, isUsed: boolean): void => {
    if (group.length === 0) return;
    svg += text(heading, {
      x: leftX,
      y,
      className: "pl-heading",
      fontSize: 10,
      maxWidth: colWidth,
    });
    y += 12;
    for (const entity of group) {
      const height = hypothesisBoxHeight(entity, colWidth, isUsed);
      boxes.push({ entity, x: leftX, y, width: colWidth, height, used: isUsed });
      svg += renderHypothesisBox(entity, leftX, y, colWidth, isUsed);
      y += height + 10;
    }
    y += 8;
  };

  layoutGroup(used, `USED BY THE PROOF TERM (${used.length})`, true);
  if (unused.length > 0) {
    svg += line(leftX, y - 4, leftX + colWidth, y - 4, "pl-rule");
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
      className: "pl-heading",
      fontSize: 10,
      maxWidth: colWidth,
    });
    rightSvg += box({
      x: rightX,
      y: top,
      width: colWidth,
      height,
      className: `pl-box-primary${weakStrokeClass(conclusion.epistemic)}`,
      tooltip: entityTooltip(conclusion),
    });
    const para = paragraph(label, {
      x: rightX + 10,
      y: top + 22,
      className: "pl-label pl-mono",
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
      const d = connector(
        source.x + source.width,
        source.y + source.height / 2,
        rightX,
        conclusionCy,
      );
      svg += path(
        d,
        `pl-edge-used${weakStrokeClass(relationship.epistemic)}`,
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
): string {
  const height = hypothesisBoxHeight(entity, width, used);
  const className = used
    ? `pl-box${weakStrokeClass(entity.epistemic)}`
    : `pl-box-unused${weakFillClass(entity.epistemic)}`;
  let svg = box({ x, y, width, height, className, tooltip: entityTooltip(entity) });
  let cursor = y + 22;
  svg += text(entity.label, {
    x: x + 10,
    y: cursor,
    className: `pl-label-strong pl-mono${used ? "" : " pl-unused-text"}`,
    fontSize: 12.5,
    maxWidth: width - 20,
    title: entityTooltip(entity),
  });
  cursor += 15;
  if (entity.detail) {
    const para = paragraph(entity.detail, {
      x: x + 10,
      y: cursor,
      className: `pl-detail pl-mono${used ? "" : " pl-unused-text"}`,
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
      className: "pl-badge",
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
  for (const relationship of spec.relationships) {
    const from = rects.get(relationship.from);
    const to = rects.get(relationship.to);
    if (!from || !to) continue;
    const d = routeEdge(from, to, horizontal);
    const weak = isWeak(relationship.epistemic);
    svg += path(
      d,
      `pl-edge${weak ? " pl-weak-stroke" : ""}`,
      { "marker-end": `url(#${ctx.id("arrow-muted")})` },
      `${labelFor(spec, relationship.from)} ${relationship.kind} ${labelFor(spec, relationship.to)} — ${statusPhrase(relationship.epistemic)}`,
    );
    if (relationship.label) {
      const mid = midpoint(from, to);
      svg += text(relationship.label, {
        x: mid.x,
        y: mid.y - 5,
        className: "pl-detail",
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
    svg += box({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      className: `${primary ? "pl-box-primary" : "pl-box"}${weakStrokeClass(entity.epistemic)}`,
      tooltip: entityTooltip(entity),
    });
    svg += text(entity.label, {
      x: rect.x + 9,
      y: rect.y + (entity.detail ? 19 : 19),
      className: `pl-label pl-mono${isWeak(entity.epistemic) ? " pl-weak-text" : ""}`,
      fontSize: 11.5,
      maxWidth: rect.width - 18,
      title: entityTooltip(entity),
    });
    if (entity.detail) {
      svg += text(entity.detail, {
        x: rect.x + 9,
        y: rect.y + 33,
        className: "pl-detail",
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

  let svg = "";
  let y = 12;
  let spineTop = y;

  if (conclusion) {
    svg += text("CONCLUSION", {
      x: ctx.pad,
      y,
      className: "pl-heading",
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
      className: `pl-box-primary${weakStrokeClass(conclusion.epistemic)}`,
      tooltip: entityTooltip(conclusion),
    });
    svg += paragraph(conclusion.label, {
      x: ctx.pad + 10,
      y: y + 21,
      className: "pl-label pl-mono",
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
      className: "pl-heading",
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
      svg += renderHypothesisBox(entity, boxX, y, boxWidth, used);
      lastCenter = y + height / 2;
      svg += line(
        spineX,
        lastCenter,
        boxX,
        lastCenter,
        used ? "pl-edge-used" : "pl-edge pl-weak-stroke",
      );
      y += height + 10;
    }
    svg += line(spineX, spineTop, spineX, lastCenter, "pl-edge");
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
