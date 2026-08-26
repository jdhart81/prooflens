/**
 * @prooflens/renderer-text
 *
 * Renders a {@link VisualSpec} as plain text for a terminal, a log, a code
 * review comment, or a Lean `#eval`.
 *
 * This renderer is not a degraded fallback. It is the form of a ProofLens
 * figure that survives being pasted anywhere, and it is held to the same
 * standards as the SVG one: the epistemic status is stated in words, an unused
 * hypothesis is called unused, and the rationale that justifies the figure's
 * existence is printed with it.
 *
 * Output is deterministic and contains no ANSI escape sequences — colour is the
 * caller's business, and a figure that has been through a pipe should still
 * diff cleanly.
 *
 * @packageDocumentation
 */
import { EPISTEMIC_GLOSS, type EpistemicStatus } from "@prooflens/epistemics";
import type { VisualEntity, VisualSpec } from "@prooflens/visual-ir";
import {
  ASCII_GLYPHS,
  UNICODE_GLYPHS,
  clip,
  displayWidth,
  padEnd,
  wrapText,
  type Glyphs,
} from "./glyphs.js";

export interface TextOptions {
  /** Total line width in columns. Default 78. Clamped to [40, 200]. */
  width?: number;
  /** Use box-drawing characters. Default true; `false` gives pure ASCII. */
  unicode?: boolean;
}

export { displayWidth, wrapText, clip } from "./glyphs.js";
export type { Glyphs } from "./glyphs.js";

interface Ctx {
  width: number;
  glyphs: Glyphs;
  unicode: boolean;
  /** Width available inside the two-column indent. */
  inner: number;
}

const INDENT = "  ";

/** Render one figure as plain text. */
export function renderText(spec: VisualSpec, options: TextOptions = {}): string {
  const width = clampWidth(options.width ?? 78);
  const unicode = options.unicode !== false;
  const ctx: Ctx = {
    width,
    unicode,
    glyphs: unicode ? UNICODE_GLYPHS : ASCII_GLYPHS,
    inner: width - INDENT.length * 2,
  };

  const lines: string[] = [];
  pushHeader(lines, spec, ctx);
  lines.push("");
  pushBody(lines, spec, ctx);
  lines.push("");
  pushAnnotations(lines, spec, ctx);
  return `${trimTrailingBlanks(lines).join("\n")}\n`;
}

/**
 * A compact index of several figures.
 *
 * Used when a run produces many analyses and the reader needs to choose one:
 * it names each figure, what kind it is, what it is epistemically worth, and
 * why it was planned.
 */
export function renderTextSummary(specs: VisualSpec[], options: TextOptions = {}): string {
  const width = clampWidth(options.width ?? 78);
  const unicode = options.unicode !== false;
  const glyphs = unicode ? UNICODE_GLYPHS : ASCII_GLYPHS;
  const lines: string[] = [];

  lines.push(glyphs.rule.repeat(width));
  lines.push(`ProofLens — ${specs.length} figure${specs.length === 1 ? "" : "s"}`);
  lines.push(glyphs.rule.repeat(width));

  if (specs.length === 0) {
    lines.push("");
    lines.push(`${INDENT}No figures were planned.`);
    return `${lines.join("\n")}\n`;
  }

  // Status tally first: the single most useful thing about a batch of figures
  // is how much of it is actually backed by the kernel.
  const tally = new Map<EpistemicStatus, number>();
  for (const spec of specs) tally.set(spec.epistemic, (tally.get(spec.epistemic) ?? 0) + 1);
  const tallyLine = Array.from(tally.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([status, count]) => `${status}: ${count}`)
    .join(`  ${glyphs.bullet}  `);
  lines.push("");
  for (const line of wrapText(tallyLine, width - INDENT.length)) lines.push(`${INDENT}${line}`);
  lines.push("");

  const indexWidth = String(specs.length).length;
  specs.forEach((spec, i) => {
    const number = String(i + 1).padStart(indexWidth, " ");
    lines.push(
      `${INDENT}${number}. ${clip(spec.title, width - INDENT.length - indexWidth - 4, unicode)}`,
    );
    const meta = `${spec.type}  ${glyphs.bullet}  ${spec.epistemic}`;
    lines.push(
      `${INDENT}${" ".repeat(indexWidth + 2)}${clip(meta, width - INDENT.length - indexWidth - 4, unicode)}`,
    );
    for (const line of wrapText(spec.rationale, width - INDENT.length - indexWidth - 4)) {
      lines.push(`${INDENT}${" ".repeat(indexWidth + 2)}${line}`);
    }
    if (i < specs.length - 1) lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function pushHeader(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  lines.push(g.rule.repeat(ctx.width));
  for (const line of wrapText(spec.title, ctx.width)) lines.push(line);
  const meta = spec.subtitle ? `${spec.subtitle}  ${g.bullet}  ${spec.type}` : spec.type;
  lines.push(clip(meta, ctx.width, ctx.unicode));
  lines.push(g.rule.repeat(ctx.width));
  // The status is part of the figure, not a footnote to it.
  for (const line of wrapText(
    `status: ${spec.epistemic} — ${EPISTEMIC_GLOSS[spec.epistemic]}`,
    ctx.width,
  )) {
    lines.push(line);
  }
}

// ---------------------------------------------------------------------------
// Body dispatch
// ---------------------------------------------------------------------------

function pushBody(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  switch (spec.type) {
    case "upper-bound-plot":
    case "lower-bound-plot":
    case "number-line":
      pushNumberLine(lines, spec, ctx);
      return;
    case "assumption-sensitivity":
      pushAssumptions(lines, spec, ctx);
      return;
    case "dependency-graph":
    case "implication-graph":
    case "relationship-diagram":
      pushGraph(lines, spec, ctx);
      return;
    case "expression-tree":
      pushExpressionTree(lines, spec, ctx);
      return;
    case "monotonicity-plot":
      pushMonotonicity(lines, spec, ctx);
      return;
    case "limit-plot":
      pushLimit(lines, spec, ctx);
      return;
    default:
      pushGeneric(lines, spec, ctx);
  }
}

// ---------------------------------------------------------------------------
// Number line
// ---------------------------------------------------------------------------

/**
 * A character-cell number line.
 *
 * The axis is drawn into a fixed-width row so that permitted and excluded
 * stretches are distinguishable by glyph (heavy vs dotted) and not only by a
 * caption — the same encoding the SVG uses with fills. Labels are placed into
 * their own rows with collision avoidance, so nothing is ever overwritten.
 */
function pushNumberLine(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  const span = ctx.inner - 2; // room for the two terminators
  const col = (p: number | undefined, fallback = 0.5): number =>
    Math.round(clamp01(p, fallback) * (span - 1));

  const axis = spec.axes[0];
  const schematic = axis === undefined || axis.scale === "schematic";
  const bound = spec.entities.find((e) => e.kind === "bound");
  const boundCol = col(bound?.position?.x, 0.5);

  // Axis row, filled region by region.
  const cells: string[] = new Array<string>(span).fill(g.axis);
  for (const region of spec.entities.filter((e) => e.kind === "region")) {
    const at = clamp01(region.position?.x, 0.25);
    const excluded = region.state === "excluded";
    const from = at <= clamp01(bound?.position?.x, 0.5) ? 0 : boundCol;
    const to = at <= clamp01(bound?.position?.x, 0.5) ? boundCol : span - 1;
    for (let i = from; i <= to; i += 1) cells[i] = excluded ? g.excluded : g.permitted;
  }

  const strict = bound?.state === "excluded";
  if (bound) cells[boundCol] = strict ? g.dotOpen : g.dotFilled;
  for (const quantity of spec.entities.filter((e) => e.kind === "quantity")) {
    const c = col(quantity.position?.x);
    if (c !== boundCol) cells[c] = g.dotQuantity;
  }

  // Label rows above the axis: the bound on its own line, quantities below it.
  const boundRow = blankRow(span);
  if (bound) place(boundRow, boundCol, bound.label, ctx);
  const quantityRow = blankRow(span);
  for (const quantity of spec.entities.filter((e) => e.kind === "quantity")) {
    const label = quantity.detail ? `${quantity.label} (${quantity.detail})` : quantity.label;
    place(quantityRow, col(quantity.position?.x), label, ctx);
  }

  // Region labels below the axis, centred on their band.
  const regionRow = blankRow(span);
  for (const region of spec.entities.filter((e) => e.kind === "region")) {
    const at = clamp01(region.position?.x, 0.25);
    const from = at <= clamp01(bound?.position?.x, 0.5) ? 0 : boundCol;
    const to = at <= clamp01(bound?.position?.x, 0.5) ? boundCol : span - 1;
    place(regionRow, Math.round((from + to) / 2), region.label, ctx);
  }

  // Ticks and their labels.
  const tickRow = blankRow(span);
  const tickLabelRow = blankRow(span);
  for (const tick of axis?.ticks ?? []) {
    const c = col(tick.at);
    tickRow[c] = g.tick;
    place(tickLabelRow, c, tick.label, ctx);
  }

  const emit = (row: string[], pad = " "): void => {
    const rendered = `${INDENT}${pad}${row.join("").replace(/\s+$/, "")}`;
    if (rendered.trim() !== "") lines.push(rendered);
  };

  emit(quantityRow);
  emit(boundRow);
  lines.push(`${INDENT}${g.axisStart}${cells.join("")}${g.axisEnd}`);
  emit(tickRow);
  emit(tickLabelRow);
  emit(regionRow);

  if (axis) {
    const units = axis.units ? ` (${axis.units})` : "";
    lines.push("");
    lines.push(
      `${INDENT}${clip(`axis: ${axis.label}${units} — ${axis.scale} scale`, ctx.inner, ctx.unicode)}`,
    );
  }

  lines.push("");
  lines.push(`${INDENT}key:`);
  // Each key row is wrapped against the glyph gutter so that a narrow terminal
  // shortens the prose rather than spilling past the requested width.
  const keyRow = (glyph: string, description: string): void => {
    const gutter = `${INDENT}  ${padEnd(glyph, 4)}`;
    const available = ctx.width - displayWidth(gutter);
    const wrapped = wrapText(description, Math.max(8, available));
    wrapped.forEach((line, i) => {
      lines.push(i === 0 ? `${gutter}${line}` : `${" ".repeat(displayWidth(gutter))}${line}`);
    });
  };
  keyRow(g.permitted.repeat(3), "permitted by the theorem");
  keyRow(g.excluded.repeat(3), "ruled out by the theorem");
  if (bound) {
    keyRow(
      strict ? g.dotOpen : g.dotFilled,
      strict
        ? "the bound itself is excluded (strict inequality)"
        : "the bound itself is permitted (non-strict inequality)",
    );
  }
  if (schematic) {
    keyRow(
      "",
      "the axis is schematic: which side of the marker a value lies on is meaningful, the distance is not",
    );
  }
}

// ---------------------------------------------------------------------------
// Assumption sensitivity
// ---------------------------------------------------------------------------

/**
 * The hypothesis ledger.
 *
 * Every stated hypothesis is listed with a mark saying whether the proof term
 * touches it, and the unused ones are named again in a closing line so that a
 * reader skimming the output cannot miss the finding.
 */
function pushAssumptions(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  const hypotheses = ordered(spec.entities.filter((e) => e.kind === "hypothesis"));
  const conclusion = spec.entities.find((e) => e.kind === "conclusion");
  const unused = hypotheses.filter((h) => h.state === "unused");

  lines.push(`${INDENT}HYPOTHESES (${hypotheses.length})`);
  if (hypotheses.length === 0) lines.push(`${INDENT}  (none stated)`);

  const symbolWidth = hypotheses.reduce((w, h) => Math.max(w, displayWidth(h.label)), 0);
  for (const hypothesis of hypotheses) {
    const isUnused = hypothesis.state === "unused";
    const mark = isUnused ? g.unchecked : g.checked;
    const head = `${INDENT}  [${mark}] ${padEnd(hypothesis.label, symbolWidth)}`;
    const detail = hypothesis.detail ? ` : ${hypothesis.detail}` : "";
    lines.push(clip(`${head}${detail}`, ctx.width, ctx.unicode));
    if (isUnused) {
      lines.push(
        clip(
          `${INDENT}  ${" ".repeat(symbolWidth + 4)}NEVER USED BY THIS PROOF`,
          ctx.width,
          ctx.unicode,
        ),
      );
    }
  }

  lines.push("");
  lines.push(`${INDENT}${g.arrow} CONCLUSION`);
  if (conclusion) {
    for (const line of wrapText(conclusion.label, ctx.inner - 2)) lines.push(`${INDENT}  ${line}`);
  } else {
    lines.push(`${INDENT}  (not recorded)`);
  }

  lines.push("");
  if (unused.length === 0) {
    lines.push(`${INDENT}Every stated hypothesis is referenced by the proof term.`);
  } else {
    for (const line of wrapText(
      `${unused.length} of ${hypotheses.length} hypotheses (${unused.map((h) => h.label).join(", ")}) never appear in this proof term. That is a fact about this proof, not about mathematical necessity.`,
      ctx.inner,
    )) {
      lines.push(`${INDENT}${line}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Graphs
// ---------------------------------------------------------------------------

/**
 * An indented tree over the relationship edges.
 *
 * Roots are the nodes nothing points at (falling back to the lowest layer, and
 * then to every node, so a fully cyclic graph still prints). A node reached a
 * second time is marked rather than expanded, which keeps a cyclic dependency
 * graph finite without silently dropping the edge.
 */
function pushGraph(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  const byId = new Map(spec.entities.map((e) => [e.id, e] as const));
  const children = new Map<string, string[]>();
  const hasIncoming = new Set<string>();
  for (const relationship of spec.relationships) {
    if (!byId.has(relationship.from) || !byId.has(relationship.to)) continue;
    const bucket = children.get(relationship.from);
    if (bucket) bucket.push(relationship.to);
    else children.set(relationship.from, [relationship.to]);
    hasIncoming.add(relationship.to);
  }

  let roots = spec.entities.filter((e) => !hasIncoming.has(e.id));
  if (roots.length === 0) {
    const minLayer = spec.entities.reduce(
      (min, e) => Math.min(min, e.position?.layer ?? 0),
      Number.POSITIVE_INFINITY,
    );
    roots = spec.entities.filter((e) => (e.position?.layer ?? 0) === minLayer);
  }
  if (roots.length === 0) roots = spec.entities.slice();

  const seen = new Set<string>();

  const walk = (id: string, prefix: string, isLast: boolean, depth: number): void => {
    const entity = byId.get(id);
    if (!entity) return;
    const connectorGlyph = depth === 0 ? "" : isLast ? g.lastBranch : g.branch;
    const repeated = seen.has(id);
    const detail = entity.detail ? `  (${entity.detail})` : "";
    const suffix = repeated ? `  ${g.arrow} already shown above` : detail;
    lines.push(
      clip(`${INDENT}${prefix}${connectorGlyph}${entity.label}${suffix}`, ctx.width, ctx.unicode),
    );
    if (repeated) return;
    seen.add(id);
    const kids = children.get(id) ?? [];
    const childPrefix = depth === 0 ? prefix : prefix + (isLast ? g.gap : g.trunk);
    kids.forEach((child, i) => walk(child, childPrefix, i === kids.length - 1, depth + 1));
  };

  roots.forEach((root, i) => {
    walk(root.id, "", i === roots.length - 1, 0);
    if (i < roots.length - 1) lines.push("");
  });

  // Anything unreachable from a root still has to be shown; dropping a node
  // would misrepresent the graph.
  const orphans = spec.entities.filter((e) => !seen.has(e.id));
  if (orphans.length > 0) {
    lines.push("");
    lines.push(`${INDENT}NOT CONNECTED TO ANY ROOT`);
    for (const orphan of orphans) {
      lines.push(clip(`${INDENT}  ${g.bullet} ${orphan.label}`, ctx.width, ctx.unicode));
    }
  }

  const labelled = spec.relationships.filter((r) => r.label);
  if (labelled.length > 0) {
    lines.push("");
    lines.push(`${INDENT}EDGES`);
    for (const relationship of labelled) {
      const from = byId.get(relationship.from)?.label ?? relationship.from;
      const to = byId.get(relationship.to)?.label ?? relationship.to;
      lines.push(
        clip(`${INDENT}  ${from} ${g.arrow} ${to}   ${relationship.label}`, ctx.width, ctx.unicode),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Expression tree
// ---------------------------------------------------------------------------

function pushExpressionTree(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  const conclusion = spec.entities.find((e) => e.kind === "conclusion");
  const hypotheses = ordered(spec.entities.filter((e) => e.kind === "hypothesis"));

  lines.push(`${INDENT}CONCLUSION`);
  if (conclusion) {
    for (const line of wrapText(conclusion.label, ctx.inner - 2)) lines.push(`${INDENT}  ${line}`);
  } else {
    lines.push(`${INDENT}  (not recorded)`);
  }

  if (hypotheses.length === 0) return;
  lines.push("");
  lines.push(`${INDENT}HYPOTHESES (${hypotheses.length})`);
  hypotheses.forEach((hypothesis, i) => {
    const last = i === hypotheses.length - 1;
    const isUnused = hypothesis.state === "unused";
    const marker = isUnused ? " [never used by this proof]" : "";
    lines.push(
      clip(
        `${INDENT}${last ? g.lastBranch : g.branch}${hypothesis.label}${marker}`,
        ctx.width,
        ctx.unicode,
      ),
    );
    if (hypothesis.detail) {
      const prefix = `${INDENT}${last ? g.gap : g.trunk}`;
      for (const line of wrapText(hypothesis.detail, ctx.width - displayWidth(prefix))) {
        lines.push(`${prefix}${line}`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Monotonicity
// ---------------------------------------------------------------------------

/**
 * A miniature schematic plot.
 *
 * Eight rows is enough to show a direction of travel and not enough to imply a
 * shape, which is exactly the claim the theorem makes.
 */
function pushMonotonicity(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  const fn = spec.entities.find((e) => e.kind === "function");
  const decreasing = (fn?.detail ?? "").toLowerCase().includes("decreasing");
  const rows = 8;
  const cols = Math.min(48, ctx.inner - 6);

  for (let r = 0; r < rows; r += 1) {
    const row: string[] = new Array<string>(cols).fill(" ");
    for (let c = 0; c < cols; c += 1) {
      const t = cols === 1 ? 0 : c / (cols - 1);
      const height = decreasing ? 1 - t : t;
      const plotted = Math.round((1 - height) * (rows - 1));
      if (plotted === r) row[c] = g.dotQuantity;
    }
    lines.push(`${INDENT}${g.vAxis}${row.join("").replace(/\s+$/, "")}`);
  }
  lines.push(`${INDENT}${g.corner}${g.axis.repeat(cols)}${g.axisEnd}`);
  const xLabel = spec.axes.find((a) => a.orientation === "horizontal")?.label ?? "input";
  const yLabel = spec.axes.find((a) => a.orientation === "vertical")?.label ?? "output";
  lines.push(clip(`${INDENT}${yLabel} against ${xLabel} (schematic)`, ctx.width, ctx.unicode));

  if (fn) {
    lines.push("");
    lines.push(clip(`${INDENT}${fn.label}: ${fn.detail ?? "monotone"}`, ctx.width, ctx.unicode));
  }
  for (const relationship of spec.relationships) {
    if (!relationship.label) continue;
    lines.push(clip(`${INDENT}${relationship.label}`, ctx.width, ctx.unicode));
  }
  lines.push("");
  for (const line of wrapText(
    "The plotted points are one arbitrary function with the proved order property. The theorem constrains the ordering, not the shape.",
    ctx.inner,
  )) {
    lines.push(`${INDENT}${line}`);
  }
}

// ---------------------------------------------------------------------------
// Limit
// ---------------------------------------------------------------------------

/** Rows in the schematic plots. Eight is enough for a direction, not a shape. */
const PLOT_ROWS = 8;

/**
 * A miniature limit plot.
 *
 * Which of the two pictures is drawn is read from the spec — the planner emits
 * a `limit-value` entity exactly when the limit is a finite value — and never
 * from the wording of the title.
 *
 * Convergent limits get a dotted line at the limit value with the trace
 * levelling off one row above it. That row is never closed: `Tendsto f l
 * (nhds L)` says the values get arbitrarily close to `L`, not that any of them
 * is `L`, and a trace drawn sitting on its own limit would claim more than the
 * theorem does. Divergences get no limit line at all and an arrow marking the
 * trace leaving the frame, in the direction the function's own detail names.
 */
function pushLimit(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  const fn = spec.entities.find((e) => e.kind === "function");
  const limit =
    spec.entities.find((e) => e.id === "limit-value") ??
    spec.entities.find((e) => e.kind === "bound");
  const direction =
    spec.entities.find((e) => e.id === "direction") ??
    spec.entities.find((e) => e.kind === "label");
  const convergent = limit !== undefined;
  const downward =
    !convergent && (fn?.detail ?? "").toLowerCase().includes("decreases without bound");

  // The gutter carries the limit value, in the position an axis tick label
  // would occupy. It is the one number in this figure that was proved.
  const limitLabel = convergent ? clip(limit.label, 10, ctx.unicode) : "";
  const gutter = displayWidth(limitLabel);
  // The 18 columns held back are for the trailing note ("the limit", "leaves
  // every bound"), which names what the drawing is doing and must not be the
  // thing that gets clipped on a narrow terminal.
  const cols = Math.max(8, Math.min(48, ctx.inner - 18 - gutter));

  const asymRow = convergent
    ? Math.max(
        2,
        Math.min(
          PLOT_ROWS - 1,
          Math.round((1 - clamp01(limit.position?.y, 0.3)) * (PLOT_ROWS - 1)),
        ),
      )
    : -1;
  const settleRow = asymRow - 1;

  const grid: string[][] = [];
  for (let r = 0; r < PLOT_ROWS; r += 1) grid.push(new Array<string>(cols).fill(" "));

  const rowAt = (t: number): number => {
    if (convergent) return Math.round(settleRow * (1 - Math.pow(1 - t, 3)));
    // Flat for most of the frame and then steep: the shape of leaving, with no
    // rate claimed by either the theorem or the picture.
    return downward
      ? Math.round((PLOT_ROWS - 1) * Math.pow(t, 3))
      : Math.round((PLOT_ROWS - 1) * (1 - Math.pow(t, 3)));
  };

  let previous = -1;
  for (let c = 0; c < cols; c += 1) {
    const t = cols === 1 ? 0 : c / (cols - 1);
    const r = Math.max(0, Math.min(PLOT_ROWS - 1, rowAt(t)));
    const row = grid[r] as string[];
    row[c] =
      previous === -1 || r === previous ? g.curveFlat : r > previous ? g.curveFall : g.curveRise;
    previous = r;
  }

  const exitRow = convergent ? -1 : downward ? PLOT_ROWS - 1 : 0;
  if (!convergent) {
    (grid[exitRow] as string[])[cols - 1] = downward ? g.arrowDown : g.arrowUp;
  }
  if (convergent) {
    for (let c = 0; c < cols; c += 1) (grid[asymRow] as string[])[c] = g.asymptote;
  }

  const pad = (label: string): string =>
    `${" ".repeat(Math.max(0, gutter - displayWidth(label)))}${label}${gutter > 0 ? " " : ""}`;

  /** Append a trailing note to a row, but only when it will fit legibly. */
  const withNote = (row: string, note: string): string => {
    const tail = ctx.width - displayWidth(row) - 2;
    return tail >= 12 ? `${row}  ${clip(note, tail, ctx.unicode)}` : row;
  };

  // Blank rows below the last drawn feature say nothing, so they are dropped —
  // all but one, which keeps the limit line off the input axis.
  let lastRow = 0;
  for (let r = 0; r < PLOT_ROWS; r += 1) {
    if ((grid[r] as string[]).some((cell) => cell !== " ")) lastRow = r;
  }
  const drawnRows = Math.min(PLOT_ROWS - 1, lastRow + 1);

  for (let r = 0; r <= drawnRows; r += 1) {
    const label = convergent && r === asymRow ? limitLabel : "";
    let row = `${INDENT}${pad(label)}${g.vAxis}${(grid[r] as string[]).join("")}`;
    row = row.replace(/\s+$/, "");
    if (r === exitRow) row = withNote(row, "leaves every bound");
    if (convergent && r === asymRow) row = withNote(row, "the limit");
    lines.push(row);
  }

  const xAxis = spec.axes.find((a) => a.orientation === "horizontal");
  const yAxis = spec.axes.find((a) => a.orientation === "vertical");
  const axisRow = `${INDENT}${" ".repeat(displayWidth(pad("")))}${g.corner}${g.axis.repeat(cols)}${g.arrow}`;
  lines.push(clip(direction ? `${axisRow} ${direction.label}` : axisRow, ctx.width, ctx.unicode));

  lines.push(
    clip(
      `${INDENT}${yAxis?.label ?? "value"} against ${xAxis?.label ?? "input"} — both scales schematic`,
      ctx.width,
      ctx.unicode,
    ),
  );

  if (fn) {
    lines.push("");
    lines.push(
      clip(
        `${INDENT}${fn.label}: ${fn.detail ?? (convergent ? "converges" : "leaves every bound")}`,
        ctx.width,
        ctx.unicode,
      ),
    );
  }
  for (const relationship of spec.relationships) {
    if (!relationship.label) continue;
    lines.push(clip(`${INDENT}${relationship.label}`, ctx.width, ctx.unicode));
  }
  if (direction?.detail) {
    lines.push(clip(`${INDENT}${direction.detail} (${direction.label})`, ctx.width, ctx.unicode));
  }

  lines.push("");
  for (const line of wrapText(
    convergent
      ? `The ${g.asymptote.repeat(3)} line is the limit value. The trace closes on it and never touches it, which is exactly what the theorem claims: the values get arbitrarily close, not equal.`
      : `The ${downward ? g.arrowDown : g.arrowUp} marks the trace leaving the frame and continuing past it. There is no limit line to draw, and no rate of growth is claimed.`,
    ctx.inner,
  )) {
    lines.push(`${INDENT}${line}`);
  }
}

// ---------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------

function pushGeneric(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  if (spec.entities.length > 0) {
    lines.push(`${INDENT}ELEMENTS (${spec.entities.length})`);
    for (const entity of spec.entities) {
      const state = entity.state && entity.state !== "neutral" ? `/${entity.state}` : "";
      lines.push(
        clip(
          `${INDENT}  ${g.bullet} ${entity.label}  [${entity.kind}${state}, ${entity.epistemic}]`,
          ctx.width,
          ctx.unicode,
        ),
      );
      if (entity.detail) {
        for (const line of wrapText(entity.detail, ctx.inner - 4))
          lines.push(`${INDENT}    ${line}`);
      }
    }
  }
  if (spec.relationships.length > 0) {
    lines.push("");
    lines.push(`${INDENT}RELATIONSHIPS (${spec.relationships.length})`);
    for (const relationship of spec.relationships) {
      const from =
        spec.entities.find((e) => e.id === relationship.from)?.label ?? relationship.from;
      const to = spec.entities.find((e) => e.id === relationship.to)?.label ?? relationship.to;
      const label = relationship.label ? `  ${relationship.label}` : "";
      lines.push(
        clip(
          `${INDENT}  ${from} ${g.arrow} ${to}  [${relationship.kind}]${label}`,
          ctx.width,
          ctx.unicode,
        ),
      );
    }
  }
  if (spec.axes.length > 0) {
    lines.push("");
    lines.push(`${INDENT}AXES (${spec.axes.length})`);
    for (const axis of spec.axes) {
      const units = axis.units ? ` (${axis.units})` : "";
      lines.push(
        clip(
          `${INDENT}  ${g.bullet} ${axis.label}${units}  [${axis.orientation}, ${axis.scale}]`,
          ctx.width,
          ctx.unicode,
        ),
      );
    }
  }
  if (spec.entities.length === 0 && spec.relationships.length === 0 && spec.axes.length === 0) {
    lines.push(`${INDENT}This figure has no elements to show.`);
  }
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

const ANNOTATION_RANK: Record<string, number> = {
  rationale: 0,
  warning: 1,
  callout: 2,
  caption: 3,
  legend: 4,
};

function pushAnnotations(lines: string[], spec: VisualSpec, ctx: Ctx): void {
  const g = ctx.glyphs;
  lines.push(g.thinRule.repeat(ctx.width));
  lines.push("WHY THIS FIGURE");
  for (const line of wrapText(spec.rationale, ctx.inner)) lines.push(`${INDENT}${line}`);

  const rest = spec.annotations
    .map((annotation, index) => ({ annotation, index }))
    .filter(
      (a) =>
        !(a.annotation.kind === "rationale" && a.annotation.text.trim() === spec.rationale.trim()),
    )
    .sort(
      (a, b) =>
        (ANNOTATION_RANK[a.annotation.kind] ?? 9) - (ANNOTATION_RANK[b.annotation.kind] ?? 9) ||
        a.index - b.index,
    )
    .map((a) => a.annotation);

  const warnings = rest.filter((a) => a.kind === "warning");
  const notes = rest.filter((a) => a.kind !== "warning");

  for (const warning of warnings) {
    lines.push("");
    lines.push(`${g.warning} WARNING`);
    for (const line of wrapText(warning.text, ctx.inner)) lines.push(`${INDENT}${line}`);
  }

  if (notes.length > 0) {
    lines.push("");
    lines.push("NOTES");
    for (const note of notes) {
      const wrapped = wrapText(`${note.text}`, ctx.inner - 2);
      wrapped.forEach((line, i) => {
        lines.push(i === 0 ? `${INDENT}${g.bullet} ${line}` : `${INDENT}  ${line}`);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return 78;
  return Math.min(200, Math.max(40, Math.round(width)));
}

function clamp01(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Entities in planner order: `position.order` when present, else declaration order. */
function ordered(entities: VisualEntity[]): VisualEntity[] {
  return entities
    .map((entity, index) => ({ entity, index }))
    .sort((a, b) => (a.entity.position?.order ?? a.index) - (b.entity.position?.order ?? b.index))
    .map((e) => e.entity);
}

function blankRow(width: number): string[] {
  return new Array<string>(Math.max(0, width)).fill(" ");
}

/**
 * Write `label` into `row`, centred on `col`, without overwriting anything.
 *
 * A label that will not fit at its natural position is nudged sideways to the
 * nearest free run, and dropped only if the row has no room at all. Silently
 * clobbering a neighbouring label would produce a figure that reads as
 * confident nonsense, which is the failure mode this project exists to avoid.
 */
function place(row: string[], col: number, label: string, ctx: Ctx): void {
  const text = clip(label, row.length, ctx.unicode);
  const chars = Array.from(text);
  const len = chars.length;
  if (len === 0 || len > row.length) return;

  const preferred = Math.max(0, Math.min(row.length - len, col - Math.floor(len / 2)));
  for (let offset = 0; offset <= row.length; offset += 1) {
    for (const candidate of offset === 0 ? [preferred] : [preferred + offset, preferred - offset]) {
      if (candidate < 0 || candidate + len > row.length) continue;
      if (isFree(row, candidate, len)) {
        for (let i = 0; i < len; i += 1) row[candidate + i] = chars[i] as string;
        return;
      }
    }
  }
}

/** A run is free when it and a one-column gutter on each side are blank. */
function isFree(row: string[], start: number, len: number): boolean {
  for (let i = start - 1; i <= start + len; i += 1) {
    if (i < 0 || i >= row.length) continue;
    if (row[i] !== " ") return false;
  }
  return true;
}

function trimTrailingBlanks(lines: string[]): string[] {
  const out = lines.slice();
  while (out.length > 0 && (out[out.length - 1] ?? "").trim() === "") out.pop();
  return out;
}

export type { EpistemicStatus };
