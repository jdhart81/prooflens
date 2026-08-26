/**
 * Coverage report rendering.
 *
 * The headline percentage has to be visible and the tables have to be
 * well-formed, because this output is meant to be pasted into an issue tracker
 * and acted on.
 */
import { describe, expect, it } from "vitest";
import { renderCoverageMarkdown, renderCoverageText } from "@prooflens/cli";
import {
  coverageReport,
  runPipeline,
  runPipelineOnValue,
  type CoverageReport,
} from "@prooflens/pipeline";
import { corpus, corpusRaw } from "../../pipeline/test/helpers.js";

const report: CoverageReport = coverageReport(runPipeline(corpus()));
const text = renderCoverageText(report);
const markdown = renderCoverageMarkdown(report);

/** A report with nothing in either backlog. */
function emptyBacklogReport(): CoverageReport {
  const raw = corpusRaw() as Record<string, unknown>;
  const declarations = (raw["declarations"] as Array<Record<string, unknown>>).filter(
    (d) => d["name"] !== "ProofLens.Examples.energy_cost_injective",
  );
  const built = coverageReport(runPipelineOnValue({ ...raw, declarations }));
  expect(built.unrecognisedShapes).toEqual([]);
  expect(built.opaqueConstants).toEqual([]);
  return built;
}

/** Every markdown table in a document, as arrays of cell counts per row. */
function markdownTables(source: string): string[][] {
  const tables: string[][] = [];
  let current: string[] = [];
  for (const line of source.split("\n")) {
    if (line.startsWith("|")) {
      current.push(line);
    } else if (current.length > 0) {
      tables.push(current);
      current = [];
    }
  }
  if (current.length > 0) tables.push(current);
  return tables;
}

function cellCount(row: string): number {
  // `| a | b |` → 2. Split on unescaped pipes and drop the outer empties.
  return row.split("|").slice(1, -1).length;
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("renders identical text on repeated calls", () => {
    expect(renderCoverageText(report)).toBe(text);
    expect(renderCoverageText(coverageReport(runPipeline(corpus())))).toBe(text);
  });

  it("renders identical markdown on repeated calls", () => {
    expect(renderCoverageMarkdown(report)).toBe(markdown);
    expect(renderCoverageMarkdown(coverageReport(runPipeline(corpus())))).toBe(markdown);
  });

  it("does not mutate the report it was handed", () => {
    const before = JSON.stringify(report);
    renderCoverageText(report);
    renderCoverageMarkdown(report);
    expect(JSON.stringify(report)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Headline numbers
// ---------------------------------------------------------------------------

describe("headline percentages", () => {
  it("shows both rates in the text renderer", () => {
    expect(text).toContain("97.1%");
    expect(text).toMatch(/structurally classified\s+34/);
    expect(text).toMatch(/fully readable\s+34/);
  });

  it("shows both rates in the markdown renderer", () => {
    expect(markdown).toContain("(97.1%)");
    expect(markdown).toContain("| Structurally classified | **34** (97.1%) |");
    expect(markdown).toContain("| Fully readable | **34** (97.1%) |");
  });

  it("formats a percentage to one decimal place", () => {
    const raw = corpusRaw() as Record<string, unknown>;
    const declarations = (raw["declarations"] as Array<Record<string, unknown>>).slice(0, 3);
    const built = coverageReport(runPipelineOnValue({ ...raw, declarations }));
    expect(renderCoverageText(built)).toContain("100.0%");
  });

  it("explains what `fully readable` means, in both renderers", () => {
    expect(text).toContain("fully readable");
    expect(text).toContain("constant table");
    expect(markdown).toContain("constant table");
  });

  it("names the modules and the notation fidelity", () => {
    for (const module of report.modules) {
      expect(text).toContain(module);
      expect(markdown).toContain(module);
    }
    expect(text).toContain("notation fidelity  notation");
    expect(markdown).toContain("`notation`");
  });
});

// ---------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------

describe("the progress bar", () => {
  /** Pull the bar out of a rendered line. */
  function barOf(source: string, label: string): string {
    const line = source.split("\n").find((l) => l.includes(label))!;
    const match = /([█░]+)/.exec(line);
    expect(match, `no bar on the ${label} line`).not.toBeNull();
    return match![1]!;
  }

  function renderAtRate(rate: number): CoverageReport {
    return { ...report, rates: { classified: rate, fullyReadable: rate } };
  }

  it("is 28 characters wide, whatever the rate", () => {
    for (const rate of [0, 0.25, 0.5, 0.75, 1]) {
      const bar = barOf(renderCoverageText(renderAtRate(rate)), "structurally classified");
      expect(bar, `rate ${rate}`).toHaveLength(28);
    }
  });

  it("is entirely empty at 0", () => {
    const bar = barOf(renderCoverageText(renderAtRate(0)), "structurally classified");
    expect(bar).toBe("░".repeat(28));
    expect(bar).not.toContain("█");
  });

  it("is half full at 0.5", () => {
    const bar = barOf(renderCoverageText(renderAtRate(0.5)), "structurally classified");
    expect(bar).toBe(`${"█".repeat(14)}${"░".repeat(14)}`);
  });

  it("is entirely full at 1", () => {
    const bar = barOf(renderCoverageText(renderAtRate(1)), "structurally classified");
    expect(bar).toBe("█".repeat(28));
    expect(bar).not.toContain("░");
  });

  it("grows monotonically with the rate", () => {
    let previous = -1;
    for (const rate of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const filled = barOf(renderCoverageText(renderAtRate(rate)), "fully readable").split("░")[0]!
        .length;
      expect(filled).toBeGreaterThanOrEqual(previous);
      previous = filled;
    }
  });
});

// ---------------------------------------------------------------------------
// Markdown structure
// ---------------------------------------------------------------------------

describe("markdown tables", () => {
  const tables = markdownTables(markdown);

  it("finds every table", () => {
    expect(tables.length).toBeGreaterThanOrEqual(5);
  });

  it("gives every table a separator row directly under its header", () => {
    for (const table of tables) {
      expect(table.length).toBeGreaterThanOrEqual(2);
      expect(table[1], table[0]).toMatch(/^\|[\s:|-]+\|$/);
    }
  });

  it("gives every row in a table the same number of cells", () => {
    for (const table of tables) {
      const expected = cellCount(table[0]!);
      expect(expected).toBeGreaterThan(0);
      for (const row of table) {
        expect(cellCount(row), `${table[0]} / ${row}`).toBe(expected);
      }
    }
  });

  it("starts with a level-1 heading and uses only level 1 and 2", () => {
    expect(markdown.split("\n")[0]).toBe("# ProofLens coverage report");
    for (const line of markdown.split("\n")) {
      if (!line.startsWith("#")) continue;
      expect(line, line).toMatch(/^#{1,2} /);
    }
  });

  it("has both backlog sections, in order", () => {
    const first = markdown.indexOf("## Backlog 1");
    const second = markdown.indexOf("## Backlog 2");
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it("lists the unsupported fixture in both backlogs", () => {
    expect(markdown).toContain("`Function.Injective`");
    expect(markdown).toContain("`ProofLens.Examples.energy_cost_injective`");
  });

  it("carries the assumption-sensitivity caveat", () => {
    expect(markdown).toContain("It may still be mathematically necessary");
  });

  it("stays well formed for a report whose backlogs are empty", () => {
    for (const table of markdownTables(renderCoverageMarkdown(emptyBacklogReport()))) {
      const expected = cellCount(table[0]!);
      for (const row of table) expect(cellCount(row)).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Empty backlogs
// ---------------------------------------------------------------------------

describe("a report with empty backlogs", () => {
  const empty = emptyBacklogReport();

  it("says `(none)` in the text renderer rather than leaving a blank section", () => {
    const rendered = renderCoverageText(empty);
    const between = (from: string, to: string) => {
      const lines = rendered.split("\n");
      const start = lines.findIndex((l) => l.includes(from));
      const end = lines.findIndex((l, i) => i > start && l.includes(to));
      return lines.slice(start, end === -1 ? undefined : end).join("\n");
    };
    expect(between("BACKLOG 1", "BACKLOG 2")).toContain("(none)");
    expect(between("BACKLOG 2", "ASSUMPTION SENSITIVITY")).toContain("(none)");
  });

  it("says `(none)` in the markdown renderer too, rather than an empty table", () => {
    // This used to emit a table header and separator with no rows under them,
    // which renders as an empty box: a reader could not tell "nothing to do"
    // from "this section is broken".
    const rendered = renderCoverageMarkdown(empty);
    const lines = rendered.split("\n");
    const section = (from: string, to: string) => {
      const start = lines.findIndex((l) => l.startsWith(from));
      const end = lines.findIndex((l) => l.startsWith(to));
      return lines.slice(start, end).join("\n");
    };
    expect(section("## Backlog 1", "## Backlog 2")).toContain("(none)");
    expect(section("## Backlog 2", "## Assumption")).toContain("(none)");
  });

  it("emits no headerless table rows for an empty backlog", () => {
    const lines = renderCoverageMarkdown(empty).split("\n");
    const start = lines.findIndex((l) => l.startsWith("## Backlog 1"));
    const end = lines.findIndex((l) => l.startsWith("## Backlog 2"));
    expect(lines.slice(start, end).filter((l) => l.startsWith("|"))).toHaveLength(0);
  });

  it("still reports its totals and figures correctly", () => {
    const rendered = renderCoverageText(empty);
    expect(rendered).toContain("100.0%");
    expect(rendered).toContain("FIGURES");
    expect(renderCoverageMarkdown(empty)).toContain("## Figures");
  });
});

// ---------------------------------------------------------------------------
// Hostile input
// ---------------------------------------------------------------------------

describe("long and awkward names", () => {
  const hostile: CoverageReport = {
    ...report,
    opaqueConstants: [
      {
        head: "Mathlib.Analysis.SpecialFunctions.Trigonometric.Inverse.VeryLongNamespace.arcsinReallyQuiteLong",
        declarations: 3,
        examples: ["A.b.c".padEnd(120, "x")],
      },
      { head: null, declarations: 1, examples: [] },
    ],
    unrecognisedShapes: [{ head: null, declarations: 2, examples: ["X.y"] }],
  };

  it("does not truncate or wrap a long constant name in the text renderer", () => {
    const rendered = renderCoverageText(hostile);
    expect(rendered).toContain(hostile.opaqueConstants[0]!.head);
    expect(rendered).not.toContain("…and");
  });

  it("keeps every text line on one line — no embedded newlines from a long name", () => {
    const rendered = renderCoverageText(hostile);
    const backlogLines = rendered.split("\n").filter((l) => l.includes("arcsinReallyQuiteLong"));
    expect(backlogLines).toHaveLength(1);
  });

  it("renders a null head with a readable placeholder rather than `null`", () => {
    const rendered = renderCoverageText(hostile);
    expect(rendered).toContain("<unnamed structure>");
    expect(rendered).toContain("<unnamed>");
    expect(rendered).not.toMatch(/^\s+\d+\s+null$/m);
  });

  it("keeps the markdown tables well formed with long names and null heads", () => {
    for (const table of markdownTables(renderCoverageMarkdown(hostile))) {
      const expected = cellCount(table[0]!);
      for (const row of table) expect(cellCount(row)).toBe(expected);
    }
  });

  it("renders an entry with no examples without emitting an empty trailing cell mismatch", () => {
    const rendered = renderCoverageMarkdown(hostile);
    const row = rendered.split("\n").find((l) => l.includes("<unnamed>"))!;
    expect(cellCount(row)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Truncation notices
// ---------------------------------------------------------------------------

describe("long backlogs", () => {
  function manyHeads(count: number): CoverageReport {
    return {
      ...report,
      opaqueConstants: Array.from({ length: count }, (_, i) => ({
        head: `M.constant${String(i).padStart(3, "0")}`,
        declarations: count - i,
        examples: [`M.decl${i}`],
      })),
    };
  }

  it("truncates the text backlog at 30 rows and says how many are left", () => {
    const rendered = renderCoverageText(manyHeads(45));
    expect(rendered).toContain("M.constant029");
    expect(rendered).not.toContain("M.constant030");
    expect(rendered).toContain("… and 15 more");
    expect(rendered).toContain("--json");
  });

  it("adds no truncation notice when the backlog fits", () => {
    expect(renderCoverageText(manyHeads(30))).not.toContain("more (use --json");
  });

  it("truncates the markdown backlog at 40 rows", () => {
    const rendered = renderCoverageMarkdown(manyHeads(45));
    expect(rendered).toContain("`M.constant039`");
    expect(rendered).not.toContain("`M.constant040`");
  });
});
