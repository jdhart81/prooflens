/**
 * Approximate text metrics.
 *
 * An SVG renderer that cannot measure text will overflow its own viewBox the
 * first time a theorem has a long name. We have no font engine here, so we
 * estimate: each character contributes a fixed fraction of the font size, with
 * a handful of width classes that are good enough to keep labels inside their
 * boxes. The estimate deliberately errs wide — a slightly early ellipsis is a
 * far cheaper mistake than a label spilling off the figure.
 *
 * Every function here is pure and deterministic.
 */

const NARROW = new Set(" .,:;!|'`ijlt()[]{}/\\-¬′".split(""));
const WIDE = new Set("mwMW@%⟹⟺⟶→↔≤≥∀∃∫∑∏".split(""));

/** Width of one character as a fraction of the font size. */
function charRatio(ch: string): number {
  if (NARROW.has(ch)) return 0.34;
  if (WIDE.has(ch)) return 0.95;
  if (ch >= "A" && ch <= "Z") return 0.69;
  if (ch >= "0" && ch <= "9") return 0.57;
  if (ch >= "a" && ch <= "z") return 0.55;
  const code = ch.codePointAt(0) ?? 0;
  // CJK and other full-width ranges really are about one em.
  if (code >= 0x1100 && code <= 0x1fff) return 1.0;
  if (code >= 0x2e80 && code <= 0xa4cf) return 1.0;
  if (code >= 0xff00 && code <= 0xff60) return 1.0;
  // Mathematical operators, arrows, Greek: assume slightly wide.
  if (code > 0x2000) return 0.7;
  return 0.58;
}

/** Estimated rendered width, in user units, of `text` at `fontSize`. */
export function measureText(text: string, fontSize: number): number {
  let ratio = 0;
  for (const ch of text) ratio += charRatio(ch);
  return ratio * fontSize;
}

/**
 * Shorten `text` so that it fits `maxWidth`, appending a single-character
 * ellipsis when anything was removed.
 *
 * Callers are expected to put the original string in the element's `<title>`;
 * truncation must never destroy information, only hide it.
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
): { text: string; truncated: boolean } {
  if (maxWidth <= 0) return { text: "", truncated: text.length > 0 };
  if (measureText(text, fontSize) <= maxWidth) return { text, truncated: false };

  const chars = Array.from(text);
  const ellipsisWidth = measureText("…", fontSize);
  const budget = maxWidth - ellipsisWidth;
  if (budget <= 0) return { text: "…", truncated: true };

  let used = 0;
  let kept = 0;
  for (const ch of chars) {
    const w = charRatio(ch) * fontSize;
    if (used + w > budget) break;
    used += w;
    kept += 1;
  }
  const head = chars.slice(0, kept).join("").replace(/\s+$/, "");
  return { text: `${head}…`, truncated: true };
}

/**
 * Greedy word wrap with a hard line budget.
 *
 * Words longer than the line width are broken mid-word rather than allowed to
 * overflow, and when the budget runs out the final line is ellipsised.
 */
export function wrapToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
): { lines: string[]; truncated: boolean } {
  if (maxLines <= 0 || maxWidth <= 0) return { lines: [], truncated: text.length > 0 };
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { lines: [], truncated: false };

  const lines: string[] = [];
  let current = "";
  let truncated = false;

  const pushCurrent = (): void => {
    if (current !== "") lines.push(current);
    current = "";
  };

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] as string;
    const candidate = current === "" ? word : `${current} ${word}`;
    if (measureText(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== "") {
      pushCurrent();
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }
    // The word alone may still be too wide; break it into hard chunks.
    let rest = word;
    while (measureText(rest, fontSize) > maxWidth) {
      const chunk = truncateHard(rest, maxWidth, fontSize);
      if (chunk === "") break;
      lines.push(chunk);
      rest = rest.slice(chunk.length);
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }
    if (lines.length >= maxLines) {
      if (rest.length > 0) truncated = true;
      break;
    }
    current = rest;
  }

  if (lines.length < maxLines) pushCurrent();
  else if (current !== "") truncated = true;

  if (lines.length > maxLines) {
    truncated = true;
    lines.length = maxLines;
  }

  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1] as string;
    lines[lines.length - 1] = truncateToWidth(`${last}…`, maxWidth, fontSize).text;
  }

  return { lines, truncated };
}

/** Longest prefix of `text` that fits `maxWidth`, with no ellipsis added. */
function truncateHard(text: string, maxWidth: number, fontSize: number): string {
  let used = 0;
  let kept = 0;
  for (const ch of text) {
    const w = charRatio(ch) * fontSize;
    if (used + w > maxWidth) break;
    used += w;
    kept += 1;
  }
  return text.slice(0, Math.max(1, kept));
}

/**
 * Shift the x of a middle-anchored label so that it stays inside `[min,max]`.
 *
 * Number-line labels sit above their marker, and a marker near either end of
 * the axis would otherwise push its label past the viewBox edge.
 */
export function clampCenter(x: number, textWidth: number, min: number, max: number): number {
  const half = textWidth / 2;
  if (max - min < textWidth) return (min + max) / 2;
  if (x - half < min) return min + half;
  if (x + half > max) return max - half;
  return x;
}
