import type { SemanticAnnotation } from "./types.js";

/**
 * ProofLens semantic annotations.
 *
 * Formal statements do not carry the information a picture needs: that `P` is
 * a power in watts, that `T` is positive by physics rather than by hypothesis,
 * that this theorem is "the information-rate bound". Lean docstrings are the
 * cheapest place to put that, because they already exist, they are already
 * extracted, and adding one requires no metaprogramming from the author.
 *
 * Syntax, one directive per line inside a docstring:
 *
 * ```text
 * @prooflens.var P meaning="available electrical power" units="W" axis="x"
 * @prooflens.visual upper-bound-plot
 * @prooflens.concept "information rate bound"
 * ```
 *
 * See ADR 0003 for why this was chosen over a Lean attribute for v0.1.
 */
export interface ParsedDocstring {
  /** The prose, with every annotation line removed. */
  prose: string | null;
  annotations: SemanticAnnotation[];
  suggestedVisual: string | null;
  concept: string | null;
  /** Lines that began with `@prooflens.` but could not be parsed. */
  malformed: string[];
}

const DIRECTIVE = /^\s*@prooflens\.([a-zA-Z][\w-]*)\s*(.*)$/;
const KEY_VALUE = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;

const ALLOWED_KEYS = new Set(["meaning", "units", "domain", "axis", "role"]);

export function parseDocstring(docstring: string | null): ParsedDocstring {
  if (docstring === null) {
    return { prose: null, annotations: [], suggestedVisual: null, concept: null, malformed: [] };
  }

  const proseLines: string[] = [];
  const annotations: SemanticAnnotation[] = [];
  const malformed: string[] = [];
  let suggestedVisual: string | null = null;
  let concept: string | null = null;

  for (const line of docstring.split("\n")) {
    const match = DIRECTIVE.exec(line);
    if (!match) {
      proseLines.push(line);
      continue;
    }
    const [, directive, rest] = match;
    switch (directive) {
      case "var": {
        const spaceIdx = rest!.search(/\s/);
        const target = (spaceIdx === -1 ? rest! : rest!.slice(0, spaceIdx)).trim();
        if (target === "") {
          malformed.push(line);
          break;
        }
        const annotation: SemanticAnnotation = { target };
        let sawKey = false;
        for (const kv of rest!.matchAll(KEY_VALUE)) {
          const key = kv[1]!;
          const value = kv[2]!;
          if (!ALLOWED_KEYS.has(key)) continue;
          sawKey = true;
          (annotation as unknown as Record<string, string>)[key] = value;
        }
        if (!sawKey) malformed.push(line);
        annotations.push(annotation);
        break;
      }
      case "visual": {
        const value = rest!.trim().replace(/^"|"$/g, "");
        if (value === "") malformed.push(line);
        else suggestedVisual = value;
        break;
      }
      case "concept": {
        const value = rest!.trim().replace(/^"|"$/g, "");
        if (value === "") malformed.push(line);
        else concept = value;
        break;
      }
      default:
        malformed.push(line);
        break;
    }
  }

  const prose = proseLines.join("\n").trim();
  return {
    prose: prose === "" ? null : prose,
    annotations,
    suggestedVisual,
    concept,
    malformed,
  };
}

/** Look up the annotation for a symbol, if the author supplied one. */
export function annotationFor(
  annotations: readonly SemanticAnnotation[],
  symbol: string,
): SemanticAnnotation | null {
  return annotations.find((a) => a.target === symbol) ?? null;
}
