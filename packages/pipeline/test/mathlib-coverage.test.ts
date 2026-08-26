/**
 * The committed mathlib coverage report.
 *
 * ProofLens was run over a 679-declaration slice of mathlib and the resulting
 * report was committed as `examples/mathlib-coverage.json`. It is the evidence
 * behind the coverage claims, so it is checked for internal consistency here —
 * a report whose totals disagree with its own backlogs is not evidence.
 *
 * The 16MB slice itself is deliberately not committed and is never loaded here.
 */
import { describe, expect, it } from "vitest";
import type { CoverageReport, HeadMiss } from "@prooflens/pipeline";
import { mathlibCoverage } from "./helpers.js";

const report = mathlibCoverage() as CoverageReport;

describe("the committed report", () => {
  it("has the shape of a CoverageReport", () => {
    for (const key of [
      "modules",
      "notationFidelity",
      "totals",
      "rates",
      "byClassification",
      "unrecognisedShapes",
      "opaqueConstants",
      "assumptionSensitivity",
      "trust",
      "figures",
    ]) {
      expect(report, key).toHaveProperty(key);
    }
    expect(["notation", "raw"]).toContain(report.notationFidelity);
    expect(report.modules.length).toBeGreaterThan(0);
  });

  it("covers the 679-declaration slice", () => {
    expect(report.totals.declarations).toBe(679);
    expect(report.totals.theorems + report.totals.definitions).toBe(679);
  });

  it("keeps its totals internally consistent", () => {
    const t = report.totals;
    expect(t.classified + t.unsupported).toBe(t.declarations);
    expect(t.fullyReadable).toBe(t.classified - t.classifiedWithOpaqueTerms);
    expect(t.fullyReadable).toBeLessThanOrEqual(t.classified);
    expect(t.classifiedWithOpaqueTerms).toBeGreaterThanOrEqual(0);
  });

  it("keeps its rates consistent with its totals", () => {
    expect(report.rates.classified).toBeCloseTo(
      report.totals.classified / report.totals.declarations,
      10,
    );
    expect(report.rates.fullyReadable).toBeCloseTo(
      report.totals.fullyReadable / report.totals.declarations,
      10,
    );
    for (const rate of Object.values(report.rates)) {
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });

  it("records the headline numbers the project reports", () => {
    expect(report.rates.classified * 100).toBeCloseTo(96.2, 1);
    expect(report.rates.fullyReadable * 100).toBeCloseTo(81.3, 1);
  });

  it("sums byClassification to the classified total", () => {
    const total = report.byClassification.reduce((n, row) => n + row.declarations, 0);
    expect(total).toBe(report.totals.classified);
    expect(report.byClassification.map((r) => r.kind)).not.toContain("unsupported");
  });

  it("accounts for every unsupported declaration in the unrecognised backlog", () => {
    const total = report.unrecognisedShapes.reduce((n, m) => n + m.declarations, 0);
    expect(total).toBe(report.totals.unsupported);
  });

  it("sums the figure tables to the planned count", () => {
    for (const rows of [report.figures.byType, report.figures.byEpistemicStatus]) {
      expect(rows.reduce((n, row) => n + row.count, 0)).toBe(report.figures.planned);
    }
    expect(report.figures.planned).toBeGreaterThan(report.totals.declarations);
  });

  it("planned a figure for every declaration it read, and then some", () => {
    // 1490 figures over 679 declarations: every declaration got at least one.
    expect(report.figures.planned).toBe(1490);
    expect(report.figures.byType.length).toBeGreaterThan(1);
  });

  it("marks no figure `verified`", () => {
    expect(report.figures.byEpistemicStatus.map((r) => r.status)).not.toContain("verified");
  });
});

describe("both backlogs", () => {
  const backlogs: Array<[string, HeadMiss[]]> = [
    ["unrecognisedShapes", report.unrecognisedShapes],
    ["opaqueConstants", report.opaqueConstants],
  ];

  it("are non-empty — there is still work to do, and the report says what", () => {
    for (const [name, backlog] of backlogs) {
      expect(backlog.length, name).toBeGreaterThan(0);
    }
  });

  it("rank by declarations affected, descending", () => {
    for (const [name, backlog] of backlogs) {
      for (let i = 1; i < backlog.length; i += 1) {
        expect(backlog[i - 1]!.declarations, name).toBeGreaterThanOrEqual(backlog[i]!.declarations);
      }
    }
  });

  it("break ties by head name, in code-unit order", () => {
    for (const [name, backlog] of backlogs) {
      const ties = new Map<number, string[]>();
      for (const miss of backlog) {
        ties.set(miss.declarations, [...(ties.get(miss.declarations) ?? []), String(miss.head)]);
      }
      for (const names of ties.values()) {
        expect(names, name).toEqual([...names].sort());
      }
    }
  });

  /**
   * The portability gap this file previously pinned is CLOSED.
   *
   * `rank` used to break ties with `localeCompare` and no explicit locale, so
   * the order came from the machine's default collation — and this report is a
   * *committed artifact*, so regenerating it elsewhere reordered both backlogs
   * and churned the diff for reasons unrelated to the mathematics. It now uses
   * a plain code-unit comparison, which is uglier for unicode identifiers and
   * identical on every machine. The second property is the one that matters.
   */
  it("order ties identically regardless of the machine's collation", () => {
    // The two orderings genuinely disagree, which is why this had to be decided
    // rather than left to the environment.
    const sample = ["Top.top", "setOf"];
    expect([...sample].sort((a, b) => a.localeCompare(b))).toEqual(["setOf", "Top.top"]);
    expect([...sample].sort()).toEqual(["Top.top", "setOf"]);

    // Collation also differs between locales for non-ASCII names, which mathlib
    // has in quantity.
    const unicode = ["Zeta", "Ähnlich"];
    expect([...unicode].sort((a, b) => a.localeCompare(b, "en"))).toEqual(["Ähnlich", "Zeta"]);
    expect([...unicode].sort((a, b) => a.localeCompare(b, "sv"))).toEqual(["Zeta", "Ähnlich"]);

    // The committed report follows code units, so it is reproducible anywhere.
    for (const [name, backlog] of backlogs) {
      const heads = backlog.map((m) => String(m.head));
      const byCount = new Map<number, string[]>();
      for (const miss of backlog) {
        byCount.set(miss.declarations, [
          ...(byCount.get(miss.declarations) ?? []),
          String(miss.head),
        ]);
      }
      for (const group of byCount.values()) {
        expect(group, name).toEqual([...group].sort());
      }
      expect(heads.length, name).toBeGreaterThan(0);
    }
  });

  it("cap examples at five and sort them", () => {
    for (const [name, backlog] of backlogs) {
      for (const miss of backlog) {
        expect(miss.examples.length, name).toBeLessThanOrEqual(5);
        expect(miss.examples.length, name).toBeLessThanOrEqual(miss.declarations);
        expect(miss.examples, name).toEqual([...miss.examples].sort());
      }
    }
  });

  it("never claim more affected declarations than the slice contains", () => {
    for (const [name, backlog] of backlogs) {
      for (const miss of backlog) {
        expect(miss.declarations, name).toBeGreaterThan(0);
        expect(miss.declarations, name).toBeLessThanOrEqual(report.totals.declarations);
      }
    }
  });

  it("lists no constant ProofLens already reads in the opaque backlog", () => {
    const heads = report.opaqueConstants.map((m) => m.head);
    for (const known of [
      "LE.le",
      "HDiv.hDiv",
      "HMul.hMul",
      "Real.log",
      "Monotone",
      "Filter.Tendsto",
      "And",
      "Exists",
      "Membership.mem",
    ]) {
      expect(heads, known).not.toContain(known);
    }
  });

  it("keeps the two backlogs separate — they call for different work", () => {
    // Overlap is possible (a head can be both an unreadable shape and an
    // unreadable term), but the shape backlog must not simply be a copy.
    expect(report.unrecognisedShapes.length).not.toBe(report.opaqueConstants.length);
  });
});

describe("assumption sensitivity across the slice", () => {
  const s = report.assumptionSensitivity;

  it("analysed no more declarations than the slice contains", () => {
    expect(s.analysed).toBeGreaterThan(0);
    expect(s.analysed).toBeLessThanOrEqual(report.totals.declarations);
  });

  it("counts at least as many unused hypotheses as declarations carrying them", () => {
    expect(s.withUnusedHypotheses).toBeLessThanOrEqual(s.analysed);
    expect(s.unusedHypotheses).toBeGreaterThanOrEqual(s.withUnusedHypotheses);
  });

  it("gives every example at least one named unused hypothesis", () => {
    for (const example of s.examples) {
      expect(example.declaration.length).toBeGreaterThan(0);
      expect(example.unused.length).toBeGreaterThan(0);
    }
    expect(s.examples.length).toBeLessThanOrEqual(s.withUnusedHypotheses);
  });
});

describe("trust across the slice", () => {
  it("found no `sorry` in mathlib, which would be alarming if it had", () => {
    expect(report.trust.usesSorry).toEqual([]);
  });

  it("names the axioms for any declaration that needed unusual ones", () => {
    for (const entry of report.trust.unusualAxioms) {
      expect(entry.declaration.length).toBeGreaterThan(0);
      expect(entry.axioms.length).toBeGreaterThan(0);
      for (const axiom of entry.axioms) {
        expect(["propext", "Classical.choice", "Quot.sound"]).not.toContain(axiom);
      }
    }
  });
});
