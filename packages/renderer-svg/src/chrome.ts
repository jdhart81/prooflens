/**
 * Figure chrome: the header, the legend, and the annotation block.
 *
 * These parts are identical for every visual type, and they are where the
 * figure explains itself. The legend is not decoration — it is where the
 * epistemic encoding is stated in words, which is the only thing that makes a
 * dashed stroke mean something to a reader who has never seen ProofLens.
 */
import { EPISTEMIC_GLOSS, type EpistemicStatus } from "@prooflens/epistemics";
import type { VisualAnnotation, VisualSpec } from "@prooflens/visual-ir";
import {
  box,
  circle,
  line,
  paragraph,
  path,
  text,
  type LegendRow,
  type RenderContext,
} from "./context.js";
import { num } from "./xml.js";

/** Height of the header band, given whether a subtitle is present. */
export function headerHeight(spec: VisualSpec): number {
  return spec.subtitle ? 62 : 46;
}

/**
 * Title, subtitle and the figure's epistemic status.
 *
 * The status is stated on the face of the figure, not only in the `<desc>`,
 * because a figure that is exported as a PNG loses its accessibility tree but
 * must not lose its epistemic label.
 */
export function renderHeader(spec: VisualSpec, ctx: RenderContext): string {
  const inner = ctx.width - ctx.pad * 2;
  let svg = text(spec.title, {
    x: ctx.pad,
    y: 26,
    className: "pl-title",
    fontSize: 17,
    maxWidth: inner,
  });
  let y = 42;
  if (spec.subtitle) {
    svg += text(spec.subtitle.toUpperCase(), {
      x: ctx.pad,
      y,
      className: "pl-subtitle",
      fontSize: 11,
      maxWidth: inner,
      title: spec.subtitle,
    });
    y += 16;
  }
  svg += text(`${spec.type} · ${spec.epistemic}`.toUpperCase(), {
    x: ctx.pad,
    y,
    className: "pl-status",
    fontSize: 10.5,
    maxWidth: inner,
    title: `${spec.type}: ${EPISTEMIC_GLOSS[spec.epistemic]}`,
  });
  svg += line(ctx.pad, y + 8, ctx.width - ctx.pad, y + 8, "pl-rule");
  return svg;
}

/** Draw a legend swatch, vertically centred on `cy`, occupying x..x+22. */
function swatch(kind: LegendRow["swatch"], x: number, cy: number, arrowId: string): string {
  switch (kind) {
    case "none":
      return "";
    case "solid-line":
      return line(x, cy, x + 22, cy, "pl-axis");
    case "dashed-line":
      return line(x, cy, x + 22, cy, "pl-axis pl-schematic");
    case "permit":
      return box({ x, y: cy - 6, width: 22, height: 12, className: "pl-region-permit", radius: 2 });
    case "exclude":
      return box({
        x,
        y: cy - 6,
        width: 22,
        height: 12,
        className: "pl-region-exclude",
        radius: 2,
      });
    case "open-dot":
      return line(x, cy, x + 22, cy, "pl-axis") + circle(x + 11, cy, 5, "pl-dot-open");
    case "filled-dot":
      return line(x, cy, x + 22, cy, "pl-axis") + circle(x + 11, cy, 5, "pl-dot");
    case "used-box":
      return box({ x, y: cy - 6, width: 22, height: 12, className: "pl-box-primary", radius: 3 });
    case "unused-box":
      return box({ x, y: cy - 6, width: 22, height: 12, className: "pl-box-unused", radius: 3 });
    case "arrow":
      return path(`M ${num(x)} ${num(cy)} L ${num(x + 16)} ${num(cy)}`, "pl-edge", {
        "marker-end": `url(#${arrowId})`,
      });
    case "curve":
      return path(
        `M ${num(x)} ${num(cy + 5)} C ${num(x + 8)} ${num(cy + 5)} ${num(x + 14)} ${num(cy - 5)} ${num(x + 22)} ${num(cy - 5)}`,
        "pl-curve",
      );
    case "asymptote":
      return line(x, cy, x + 22, cy, "pl-asymptote");
    default:
      return "";
  }
}

/**
 * Render the legend.
 *
 * Returns local-coordinate markup starting at y = 0 and the height consumed.
 */
export function renderLegend(
  rows: readonly LegendRow[],
  ctx: RenderContext,
  arrowId: string,
): { svg: string; height: number } {
  if (rows.length === 0) return { svg: "", height: 0 };

  const textX = ctx.pad + 30;
  const maxWidth = ctx.width - ctx.pad - textX;
  let y = 0;
  let svg = line(ctx.pad, y, ctx.width - ctx.pad, y, "pl-rule");
  y += 16;
  svg += text("HOW TO READ THIS FIGURE", {
    x: ctx.pad,
    y,
    className: "pl-heading",
    fontSize: 10,
    maxWidth,
  });
  y += 14;

  for (const row of rows) {
    const para = paragraph(row.text, {
      x: textX,
      y: y + 9,
      className: "pl-note",
      maxWidth,
      fontSize: 10.5,
      lineHeight: 13,
      maxLines: 3,
    });
    const rowHeight = Math.max(18, para.height + 16);
    svg += swatch(row.swatch, ctx.pad, y + 5, arrowId);
    svg += para.svg;
    y += rowHeight;
  }
  return { svg, height: y + 4 };
}

/** Annotation ordering: the loudest thing a reader needs first. */
const ANNOTATION_RANK: Record<VisualAnnotation["kind"], number> = {
  rationale: 0,
  warning: 1,
  callout: 2,
  caption: 3,
  legend: 4,
};

/**
 * Render the annotation block.
 *
 * `rationale` is the "why am I looking at this?" line and gets an accent bar;
 * `warning` gets a filled, bordered panel so it cannot be skimmed past; the
 * quieter kinds are set small and muted so they do not compete with the figure.
 */
export function renderAnnotations(
  spec: VisualSpec,
  ctx: RenderContext,
): { svg: string; height: number } {
  const inner = ctx.width - ctx.pad * 2;
  const ordered = spec.annotations
    .map((annotation, index) => ({ annotation, index }))
    .sort(
      (a, b) =>
        ANNOTATION_RANK[a.annotation.kind] - ANNOTATION_RANK[b.annotation.kind] ||
        a.index - b.index,
    )
    .map((a) => a.annotation);

  // The spec-level rationale is mandatory; an annotation repeating it verbatim
  // would just be noise, so it is folded into the same prominent line.
  const rationaleTexts = new Set<string>();
  const items: Array<{ kind: VisualAnnotation["kind"]; text: string; status: EpistemicStatus }> =
    [];
  items.push({ kind: "rationale", text: spec.rationale, status: spec.epistemic });
  rationaleTexts.add(spec.rationale.trim());
  for (const annotation of ordered) {
    if (annotation.kind === "rationale" && rationaleTexts.has(annotation.text.trim())) continue;
    if (annotation.kind === "rationale") rationaleTexts.add(annotation.text.trim());
    items.push({ kind: annotation.kind, text: annotation.text, status: annotation.epistemic });
  }

  let y = 0;
  let svg = line(ctx.pad, y, ctx.width - ctx.pad, y, "pl-rule");
  y += 14;

  for (const item of items) {
    if (item.kind === "rationale") {
      const para = paragraph(item.text, {
        x: ctx.pad + 12,
        y: y + 11,
        className: "pl-rationale",
        maxWidth: inner - 12,
        fontSize: 12,
        lineHeight: 16,
        maxLines: 5,
      });
      const h = para.height + 16;
      svg += box({
        x: ctx.pad,
        y,
        width: 3,
        height: h,
        className: "pl-rationale-bar",
        radius: 1.5,
        tooltip: `Why this figure was chosen — ${item.status}: ${EPISTEMIC_GLOSS[item.status]}`,
      });
      svg += para.svg;
      y += h + 10;
      continue;
    }

    if (item.kind === "warning") {
      const para = paragraph(`⚠  ${item.text}`, {
        x: ctx.pad + 10,
        y: y + 18,
        className: "pl-warn-text",
        maxWidth: inner - 20,
        fontSize: 11.5,
        lineHeight: 15,
        maxLines: 5,
      });
      const h = para.height + 26;
      svg += box({
        x: ctx.pad,
        y,
        width: inner,
        height: h,
        className: "pl-warn-box",
        radius: 4,
        tooltip: `Warning — ${item.text}`,
      });
      svg += para.svg;
      y += h + 10;
      continue;
    }

    const label = item.kind === "callout" ? "•" : "—";
    const para = paragraph(`${label}  ${item.text}`, {
      x: ctx.pad,
      y: y + 10,
      className: "pl-note",
      maxWidth: inner,
      fontSize: 10.5,
      lineHeight: 13.5,
      maxLines: 4,
    });
    svg += para.svg;
    y += para.height + 18;
  }

  return { svg, height: y };
}
