/**
 * XML/SVG serialisation primitives.
 *
 * Everything the renderer emits goes through {@link escapeXml}. The renderer
 * builds strings rather than a DOM because the output must be byte-identical
 * across runs and across environments that have no DOM at all (Lean's
 * infoview, a CLI, a build script).
 */

/** Attribute values we accept. `undefined`/`null`/`false` mean "omit". */
export type AttrValue = string | number | undefined | null | false;

/**
 * Escape a string for inclusion in XML text or an XML attribute value.
 *
 * All five predefined entities are escaped unconditionally, so the same helper
 * is safe in both positions. Control characters that XML 1.0 forbids outright
 * (anything below U+0020 except tab/LF/CR) are replaced with a space rather
 * than dropped, so that word boundaries survive.
 */
export function escapeXml(value: string): string {
  let out = "";
  for (const ch of value) {
    switch (ch) {
      case "&":
        out += "&amp;";
        break;
      case "<":
        out += "&lt;";
        break;
      case ">":
        out += "&gt;";
        break;
      case '"':
        out += "&quot;";
        break;
      case "'":
        out += "&apos;";
        break;
      default: {
        const code = ch.codePointAt(0) ?? 0;
        const illegal = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
        out += illegal ? " " : ch;
        break;
      }
    }
  }
  return out;
}

/**
 * Turn an arbitrary spec/entity id into something usable as an XML `id`.
 *
 * XML ids may not start with a digit and may not contain most punctuation, and
 * spec ids routinely contain `:`, `.` and spaces. The mapping is total and
 * deterministic: the same input always yields the same id, which is what keeps
 * repeated renders byte-identical.
 */
export function sanitizeId(raw: string): string {
  let out = "";
  for (const ch of raw) {
    out += /[A-Za-z0-9_-]/.test(ch) ? ch : "-";
  }
  out = out.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  if (out === "" || /^[0-9-]/.test(out)) out = `i${out}`;
  return out;
}

/**
 * Format a number for SVG geometry.
 *
 * Rounded to two decimals so that floating-point noise (0.30000000000000004)
 * can never make two renders of the same spec differ.
 */
export function num(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

/** Serialise an attribute map, skipping `undefined`, `null` and `false`. */
export function attrs(map: Record<string, AttrValue>): string {
  let out = "";
  for (const key of Object.keys(map)) {
    const value = map[key];
    if (value === undefined || value === null || value === false) continue;
    const text = typeof value === "number" ? num(value) : value;
    out += ` ${key}="${escapeXml(text)}"`;
  }
  return out;
}

/** Serialise an element. Empty children produce a self-closing tag. */
export function el(name: string, attrMap: Record<string, AttrValue>, children = ""): string {
  const head = `<${name}${attrs(attrMap)}`;
  return children === "" ? `${head}/>` : `${head}>${children}</${name}>`;
}

/**
 * A `<title>` child.
 *
 * Every shape that carries meaning gets one of these: it is the accessible
 * name of the shape and the browser's native tooltip, and it is where the
 * untruncated version of any shortened label lives.
 */
export function titleEl(text: string): string {
  return `<title>${escapeXml(text)}</title>`;
}

/** Clamp to the unit interval; logical positions are documented as `[0,1]`. */
export function clamp01(n: number | undefined, fallback = 0.5): number {
  if (n === undefined || !Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
