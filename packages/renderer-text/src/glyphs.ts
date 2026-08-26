/**
 * Character sets for the two output modes.
 *
 * ProofLens's text renderer has to be readable in a modern terminal and in a
 * log file that will be opened by something with a CP437 font in 2031, so every
 * glyph the renderer uses has an ASCII counterpart chosen for the same
 * *meaning*, not merely a similar shape. `unicode: false` swaps the whole set;
 * nothing else about the layout changes, so the two forms line up column for
 * column.
 */
export interface Glyphs {
  /** Heavy horizontal rule, used for the header band. */
  rule: string;
  /** Light horizontal rule, used between sections. */
  thinRule: string;
  /** Axis segment inside a permitted region. */
  permitted: string;
  /** Axis segment inside an excluded region. */
  excluded: string;
  /** Plain axis segment, used when no region covers it. */
  axis: string;
  /** Left and right terminators of a number line. */
  axisStart: string;
  axisEnd: string;
  /** Vertical axis, and the corner where the two axes meet. */
  vAxis: string;
  corner: string;
  /** A bound whose value is itself excluded (strict inequality). */
  dotOpen: string;
  /** A bound whose value is permitted (non-strict inequality). */
  dotFilled: string;
  /** A plotted quantity. */
  dotQuantity: string;
  /** Tick mark below the axis. */
  tick: string;
  /** Tree drawing. */
  branch: string;
  lastBranch: string;
  trunk: string;
  gap: string;
  /** Falling and rising segments of a schematic curve. */
  curveFall: string;
  curveRise: string;
  /** A stretch of curve that has levelled off. */
  curveFlat: string;
  /**
   * The limit line a convergent curve closes on. Distinct from `excluded`: this
   * one is a value being approached, not a region being ruled out.
   */
  asymptote: string;
  /** A curve leaving the top or the bottom of the frame. */
  arrowUp: string;
  arrowDown: string;
  /** Inline arrow, e.g. in an edge listing. */
  arrow: string;
  /** Checkbox states for the hypothesis list. */
  checked: string;
  unchecked: string;
  bullet: string;
  warning: string;
}

export const UNICODE_GLYPHS: Glyphs = {
  rule: "═",
  thinRule: "─",
  permitted: "━",
  excluded: "┄",
  axis: "─",
  axisStart: "├",
  axisEnd: "┤",
  vAxis: "│",
  corner: "└",
  dotOpen: "○",
  dotFilled: "●",
  dotQuantity: "◆",
  tick: "┬",
  branch: "├─ ",
  lastBranch: "└─ ",
  trunk: "│  ",
  gap: "   ",
  curveFall: "╲",
  curveRise: "╱",
  curveFlat: "─",
  asymptote: "┈",
  arrowUp: "↑",
  arrowDown: "↓",
  arrow: "→",
  checked: "✔",
  unchecked: "·",
  bullet: "•",
  warning: "!!",
};

export const ASCII_GLYPHS: Glyphs = {
  rule: "=",
  thinRule: "-",
  permitted: "=",
  excluded: ".",
  axis: "-",
  axisStart: "|",
  axisEnd: "|",
  vAxis: "|",
  corner: "+",
  dotOpen: "o",
  dotFilled: "*",
  dotQuantity: "+",
  tick: "^",
  branch: "|- ",
  lastBranch: "`- ",
  trunk: "|  ",
  gap: "   ",
  curveFall: "\\",
  curveRise: "/",
  curveFlat: "-",
  asymptote: ".",
  arrowUp: "^",
  arrowDown: "v",
  arrow: "->",
  checked: "x",
  unchecked: " ",
  bullet: "*",
  warning: "!!",
};

/**
 * Visible width of a string, in terminal columns.
 *
 * Counted in code points rather than UTF-16 units so that astral-plane
 * mathematical symbols do not silently double every measurement. Combining
 * marks are ignored (they add no column) and wide East Asian characters are
 * counted as two.
 */
export function displayWidth(value: string): number {
  let width = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue; // combining diacritics
    if (code === 0x200d || code === 0xfe0f) continue; // ZWJ, variation selector
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/** Pad `value` on the right to `width` display columns. */
export function padEnd(value: string, width: number): string {
  const deficit = width - displayWidth(value);
  return deficit > 0 ? value + " ".repeat(deficit) : value;
}

/** Truncate to `width` columns, appending an ellipsis when anything was cut. */
export function clip(value: string, width: number, unicode: boolean): string {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  const ellipsis = unicode ? "…" : "...";
  const budget = width - displayWidth(ellipsis);
  if (budget <= 0) return unicode ? "…".slice(0, width) : ".".repeat(width);
  let out = "";
  let used = 0;
  for (const ch of value) {
    const w = displayWidth(ch);
    if (used + w > budget) break;
    out += ch;
    used += w;
  }
  return `${out.replace(/\s+$/, "")}${ellipsis}`;
}

/** Greedy word wrap. Words wider than the column are hard-broken. */
export function wrapText(value: string, width: number): string[] {
  if (width <= 0) return [];
  const words = value.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (displayWidth(candidate) <= width) {
      current = candidate;
      continue;
    }
    if (current !== "") {
      lines.push(current);
      current = "";
    }
    let rest = word;
    while (displayWidth(rest) > width) {
      let chunk = "";
      let used = 0;
      for (const ch of rest) {
        const w = displayWidth(ch);
        if (used + w > width) break;
        chunk += ch;
        used += w;
      }
      if (chunk === "") break;
      lines.push(chunk);
      rest = rest.slice(chunk.length);
    }
    current = rest;
  }
  if (current !== "") lines.push(current);
  return lines;
}
