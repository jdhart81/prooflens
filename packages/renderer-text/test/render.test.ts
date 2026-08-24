import { describe, expect, it } from "vitest";
import type { VisualSpec, VisualType } from "@prooflens/visual-ir";
import { EPISTEMIC_GLOSS } from "@prooflens/epistemics";
import {
  displayWidth,
  renderText,
  renderTextSummary,
  wrapText,
  clip,
} from "@prooflens/renderer-text";
import {
  HOSTILE_LABEL,
  assumptionSpec,
  emptySpec,
  expressionTreeSpec,
  graphSpec,
  monotonicitySpec,
  unknownTypeSpec,
  upperBoundSpec,
} from "./fixtures.js";

const ALL_SPECS: VisualSpec[] = [
  upperBoundSpec(),
  upperBoundSpec({ type: "lower-bound-plot", id: "Test.thm:lower-bound" }),
  assumptionSpec(),
  graphSpec("dependency-graph"),
  graphSpec("implication-graph"),
  monotonicitySpec("increasing"),
  monotonicitySpec("decreasing"),
  expressionTreeSpec(),
  unknownTypeSpec(),
  emptySpec(),
];

const WIDTHS = [40, 60, 78, 100, 160];

// ---------------------------------------------------------------------------
// Determinism and shape of the output
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("renders identical text for the same spec", () => {
    for (const spec of ALL_SPECS) {
      expect(renderText(spec)).toBe(renderText(spec));
    }
  });

  it("is stable across option combinations", () => {
    for (const spec of ALL_SPECS) {
      for (const width of WIDTHS) {
        for (const unicode of [true, false]) {
          const options = { width, unicode };
          expect(renderText(spec, options)).toBe(renderText(spec, options));
        }
      }
    }
  });

  it("produces no ANSI escape sequences", () => {
    for (const spec of ALL_SPECS) {
      for (const unicode of [true, false]) {
        const out = renderText(spec, { unicode });
        expect(out).not.toContain("");
        expect(out).not.toMatch(/\[\d+m/);
      }
    }
  });

  it("ends with exactly one newline and has no trailing whitespace", () => {
    for (const spec of ALL_SPECS) {
      const out = renderText(spec);
      expect(out.endsWith("\n")).toBe(true);
      expect(out.endsWith("\n\n")).toBe(false);
      for (const line of out.split("\n")) expect(line).toBe(line.replace(/\s+$/, ""));
    }
  });
});

describe("width", () => {
  it("never exceeds the requested width", () => {
    for (const spec of ALL_SPECS) {
      for (const width of WIDTHS) {
        for (const unicode of [true, false]) {
          for (const line of renderText(spec, { width, unicode }).split("\n")) {
            expect(displayWidth(line), `"${line}"`).toBeLessThanOrEqual(width);
          }
        }
      }
    }
  });

  it("defaults to 78 columns", () => {
    const out = renderText(upperBoundSpec());
    const rule = out.split("\n")[0] as string;
    expect(displayWidth(rule)).toBe(78);
  });

  it("clamps absurd widths rather than producing broken output", () => {
    expect(displayWidth(renderText(upperBoundSpec(), { width: 2 }).split("\n")[0] as string)).toBe(
      40,
    );
    expect(
      displayWidth(renderText(upperBoundSpec(), { width: 9999 }).split("\n")[0] as string),
    ).toBe(200);
    expect(() => renderText(upperBoundSpec(), { width: Number.NaN })).not.toThrow();
  });

  it("wraps long labels rather than overflowing", () => {
    const long =
      "energyBudget(P_max, t_window) / landauerCost(kB, T_ambient, D_bits) + slack(margin)";
    const spec = assumptionSpec();
    spec.entities[3]!.label = long;
    spec.entities[0]!.detail = long;
    for (const line of renderText(spec, { width: 50 }).split("\n")) {
      expect(displayWidth(line)).toBeLessThanOrEqual(50);
    }
  });
});

describe("ascii mode", () => {
  it("emits no non-ASCII box characters when unicode is false", () => {
    for (const spec of ALL_SPECS) {
      const out = renderText(spec, { unicode: false });
      // Mathematical content from the spec may still be non-ASCII; the drawing
      // characters the renderer chooses must not be.
      for (const ch of "═─━┄├┤│└┬○●◆✔•…→") {
        expect(out, `${spec.type} contains ${ch}`).not.toContain(ch);
      }
    }
  });

  it("uses ASCII substitutes that carry the same meaning", () => {
    const out = renderText(upperBoundSpec(), { unicode: false });
    expect(out).toContain("===");
    expect(out).toContain("...");
    expect(out).toContain("o   the bound itself is excluded");
    expect(out).toContain("the bound itself is excluded (strict inequality)");
  });

  it("keeps unicode drawing on by default", () => {
    expect(renderText(upperBoundSpec())).toContain("═");
  });
});

// ---------------------------------------------------------------------------
// Header and epistemics
// ---------------------------------------------------------------------------

describe("header", () => {
  it("shows the title, subtitle and type", () => {
    const out = renderText(upperBoundSpec());
    expect(out).toContain("x < P / T");
    expect(out).toContain("power-limited rate bound");
    expect(out).toContain("upper-bound-plot");
  });

  it("states the epistemic status in words", () => {
    for (const spec of ALL_SPECS) {
      const out = renderText(spec);
      expect(out).toContain(`status: ${spec.epistemic}`);
      // The gloss may be wrapped, so compare on the first few words.
      expect(out).toContain(EPISTEMIC_GLOSS[spec.epistemic].split(" ").slice(0, 3).join(" "));
    }
  });

  it("does not escape text — this is plain text, not markup", () => {
    const spec = upperBoundSpec({ title: HOSTILE_LABEL });
    expect(renderText(spec)).toContain(`<&">'`);
  });
});

// ---------------------------------------------------------------------------
// Number line
// ---------------------------------------------------------------------------

describe("number line", () => {
  it("draws an axis with a marked bound", () => {
    const out = renderText(upperBoundSpec());
    expect(out).toMatch(/├[━┄○●◆─]+┤/);
    expect(out).toContain("○"); // strict bound
    expect(out).toContain("P / T");
  });

  it("uses a filled marker for a non-strict bound", () => {
    const spec = upperBoundSpec();
    spec.entities[1]!.state = "permitted";
    const out = renderText(spec);
    expect(out).toContain("●");
    expect(out).toContain("the bound itself is permitted");
  });

  it("distinguishes permitted from excluded stretches by glyph", () => {
    const axis = axisLine(renderText(upperBoundSpec()));
    expect(axis).toContain("━");
    expect(axis).toContain("┄");
    // The permitted stretch is on the left of the bound for an upper bound.
    expect(axis.indexOf("━")).toBeLessThan(axis.indexOf("┄"));
  });

  it("puts the excluded stretch on the left for a lower bound", () => {
    const spec = upperBoundSpec({ type: "lower-bound-plot" });
    spec.entities[2]!.position = { x: 0.75 }; // permitted region moves right
    spec.entities[3]!.position = { x: 0.25 }; // excluded region moves left
    const axis = axisLine(renderText(spec));
    expect(axis.indexOf("┄")).toBeLessThan(axis.indexOf("━"));
  });

  it("labels the axis and says when the scale is schematic", () => {
    const out = renderText(upperBoundSpec());
    expect(out).toContain("axis: operation rate (ops/s) — schematic scale");
    expect(out).toContain("the axis is schematic");
  });

  it("renders the region labels", () => {
    const out = renderText(upperBoundSpec());
    expect(out).toContain("x may lie here");
    expect(out).toContain("ruled out by the theorem");
  });

  it("never lets two labels overwrite each other", () => {
    const spec = upperBoundSpec();
    // Force a collision: quantity and bound at the same position.
    spec.entities[0]!.position = { x: 0.5 };
    spec.entities[0]!.detail = undefined;
    const out = renderText(spec, { width: 78 });
    expect(out).toContain("P / T");
    expect(out).toMatch(/\bx\b/);
  });
});

// ---------------------------------------------------------------------------
// Assumption sensitivity
// ---------------------------------------------------------------------------

describe("assumption sensitivity", () => {
  it("lists every hypothesis with a used / unused mark", () => {
    const out = renderText(assumptionSpec());
    expect(out).toContain("HYPOTHESES (3)");
    expect(out).toContain("[✔] h ");
    expect(out).toContain("[·] hP");
    expect(out).toContain("[·] hT");
  });

  it("says in words that a hypothesis is unused", () => {
    const out = renderText(assumptionSpec());
    expect(occurrences(out, "NEVER USED BY THIS PROOF")).toBe(2);
    expect(out).toContain("2 of 3 hypotheses (hP, hT) never appear in this proof term");
    expect(out).toContain("not about mathematical necessity");
  });

  it("shows the conclusion", () => {
    const out = renderText(assumptionSpec());
    expect(out).toContain("CONCLUSION");
    expect(out).toContain("x ≤ P / T");
  });

  it("says so plainly when every hypothesis is used", () => {
    const spec = assumptionSpec();
    spec.entities = spec.entities.filter((e) => e.state !== "unused");
    const out = renderText(spec);
    expect(out).toContain("Every stated hypothesis is referenced by the proof term.");
    expect(out).not.toContain("NEVER USED");
  });
});

// ---------------------------------------------------------------------------
// Graphs and trees
// ---------------------------------------------------------------------------

describe("graphs", () => {
  it("renders an indented tree", () => {
    const out = renderText(graphSpec("dependency-graph"));
    expect(out).toContain("energy_ops_bound");
    expect(out).toContain("├─ landauerCost");
    expect(out).toContain("└─ log_two_pos");
  });

  it("uses ASCII tree characters when asked", () => {
    const out = renderText(graphSpec("dependency-graph"), { unicode: false });
    expect(out).toContain("|- landauerCost");
    expect(out).toContain("`- log_two_pos");
  });

  it("marks a node reached twice instead of recursing forever", () => {
    const spec = graphSpec("dependency-graph");
    spec.relationships.push({
      id: "cycle",
      kind: "depends-on",
      from: "b",
      to: "a",
      epistemic: "derived",
    });
    const out = renderText(spec);
    expect(out).toContain("already shown above");
    expect(out.split("\n").length).toBeLessThan(80);
  });

  it("still shows nodes that no root reaches", () => {
    const spec = graphSpec("dependency-graph");
    spec.relationships = [];
    const out = renderText(spec);
    for (const entity of spec.entities) expect(out).toContain(entity.label);
  });

  it("lists labelled edges", () => {
    const out = renderText(graphSpec("implication-graph"));
    expect(out).toContain("EDGES");
    expect(out).toContain("uses");
  });
});

describe("expression tree", () => {
  it("shows the conclusion then the hypotheses, marking unused ones", () => {
    const out = renderText(expressionTreeSpec());
    const conclusionAt = out.indexOf("CONCLUSION");
    const hypothesesAt = out.indexOf("HYPOTHESES (2)");
    expect(conclusionAt).toBeGreaterThan(-1);
    expect(hypothesesAt).toBeGreaterThan(conclusionAt);
    expect(out).toContain("h1 : n ≤ 10 [never used by this proof]");
    expect(out).not.toContain("h0 : 0 < n [never used");
  });
});

describe("monotonicity", () => {
  it("plots a rising trace for an increasing function", () => {
    const rows = plotRows(renderText(monotonicitySpec("increasing")));
    expect(firstMarkColumn(rows[0] as string)).toBeGreaterThan(
      firstMarkColumn(rows[rows.length - 1] as string),
    );
  });

  it("plots a falling trace for a decreasing function", () => {
    const rows = plotRows(renderText(monotonicitySpec("decreasing")));
    expect(firstMarkColumn(rows[0] as string)).toBeLessThan(
      firstMarkColumn(rows[rows.length - 1] as string),
    );
  });

  it("says the shape is arbitrary", () => {
    expect(renderText(monotonicitySpec())).toContain("one arbitrary function");
    expect(renderText(monotonicitySpec())).toContain("u ≤ v ⟹ f u ≤ f v");
  });
});

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

describe("annotations", () => {
  it("always prints the rationale under a heading", () => {
    for (const spec of ALL_SPECS) {
      const out = renderText(spec);
      expect(out).toContain("WHY THIS FIGURE");
      expect(out).toContain(spec.rationale.split(" ").slice(0, 4).join(" "));
    }
  });

  it("gives warnings their own block", () => {
    const out = renderText(upperBoundSpec());
    expect(out).toContain("WARNING");
    expect(out).toContain("sorryAx");
    expect(out.indexOf("WARNING")).toBeGreaterThan(out.indexOf("WHY THIS FIGURE"));
  });

  it("groups the quiet annotations under NOTES", () => {
    const out = renderText(upperBoundSpec());
    expect(out).toContain("NOTES");
    expect(out).toContain("Positions are schematic.");
  });

  it("does not print the rationale twice when an annotation repeats it", () => {
    const rationale = "The conclusion puts x on the smaller side.";
    const spec = upperBoundSpec({ rationale });
    spec.annotations[0] = {
      id: "rationale",
      kind: "rationale",
      text: rationale,
      epistemic: "derived",
    };
    expect(occurrences(renderText(spec), "smaller side.")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation
// ---------------------------------------------------------------------------

describe("graceful degradation", () => {
  it("does not throw on an unknown type", () => {
    expect(() => renderText(unknownTypeSpec())).not.toThrow();
    const out = renderText(unknownTypeSpec());
    expect(out).toContain("ELEMENTS (1)");
    expect(out).toContain("speculative");
  });

  it("does not throw on an empty spec", () => {
    expect(() => renderText(emptySpec())).not.toThrow();
    expect(renderText(emptySpec())).toContain("no elements to show");
  });

  it("renders every declared VisualType without throwing", () => {
    const types: VisualType[] = [
      "upper-bound-plot",
      "lower-bound-plot",
      "number-line",
      "monotonicity-plot",
      "relationship-diagram",
      "dependency-graph",
      "implication-graph",
      "assumption-sensitivity",
      "expression-tree",
      "text-diagram",
    ];
    for (const type of types) {
      expect(() => renderText({ ...upperBoundSpec(), type })).not.toThrow();
    }
  });

  it("survives malformed positions and dangling relationship endpoints", () => {
    const spec = graphSpec();
    spec.entities[0]!.position = { layer: Number.NaN, order: Number.NaN };
    spec.relationships.push({
      id: "dangling",
      kind: "implies",
      from: "nope",
      to: "also-nope",
      epistemic: "derived",
    });
    expect(() => renderText(spec)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

describe("renderTextSummary", () => {
  it("is deterministic", () => {
    expect(renderTextSummary(ALL_SPECS)).toBe(renderTextSummary(ALL_SPECS));
  });

  it("names every figure with its type, status and rationale", () => {
    const out = renderTextSummary([upperBoundSpec(), assumptionSpec()]);
    expect(out).toContain("ProofLens — 2 figures");
    expect(out).toContain("upper-bound-plot");
    expect(out).toContain("assumption-sensitivity");
    expect(out).toContain("illustrative");
    expect(out).toContain("derived");
    expect(out).toContain("smaller side");
  });

  it("tallies the epistemic statuses", () => {
    const out = renderTextSummary([upperBoundSpec(), upperBoundSpec(), assumptionSpec()]);
    expect(out).toContain("illustrative: 2");
    expect(out).toContain("derived: 1");
  });

  it("handles an empty list", () => {
    const out = renderTextSummary([]);
    expect(out).toContain("ProofLens — 0 figures");
    expect(out).toContain("No figures were planned.");
  });

  it("respects the width", () => {
    for (const width of WIDTHS) {
      for (const line of renderTextSummary(ALL_SPECS, { width }).split("\n")) {
        expect(displayWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

describe("text helpers", () => {
  it("measures display width in code points, counting wide characters twice", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("≤ ⟹")).toBe(3);
    expect(displayWidth("漢字")).toBe(4);
  });

  it("wraps to the requested width", () => {
    const lines = wrapText("alpha beta gamma delta epsilon", 12);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(12);
  });

  it("hard-breaks a word that cannot fit", () => {
    const lines = wrapText("x".repeat(30), 10);
    expect(lines.length).toBe(3);
    for (const line of lines) expect(displayWidth(line)).toBe(10);
  });

  it("clips with an ellipsis appropriate to the mode", () => {
    expect(clip("abcdefghij", 5, true)).toBe("abcd…");
    expect(clip("abcdefghij", 5, false)).toBe("ab...");
    expect(clip("abc", 5, true)).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function occurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

function axisLine(out: string): string {
  return out.split("\n").find((line) => /├.*┤/.test(line)) ?? "";
}

function plotRows(out: string): string[] {
  return out.split("\n").filter((line) => line.includes("◆"));
}

function firstMarkColumn(row: string): number {
  return row.indexOf("◆");
}
