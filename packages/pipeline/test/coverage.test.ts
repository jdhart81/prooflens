/**
 * Coverage analysis.
 *
 * The headline number matters, but the two backlogs are the point: they are a
 * ranked, evidence-backed work queue rather than a guess. These tests check the
 * arithmetic is internally consistent and that the two backlogs stay separate,
 * because they call for different work.
 */
import { describe, expect, it } from "vitest";
import {
  coverageReport,
  runPipeline,
  runPipelineOnValue,
  type CoverageReport,
  type PipelineBundle,
} from "@prooflens/pipeline";
import { classifyTheorem } from "@prooflens/classifier";
import { opaqueHeadsIn } from "@prooflens/math-ir";
import { corpus, corpusRaw, CORPUS_DECLARATION_COUNT } from "./helpers.js";

const bundle: PipelineBundle = runPipeline(corpus());
const report: CoverageReport = coverageReport(bundle);

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

describe("totals", () => {
  const t = report.totals;

  it("counts every declaration exactly once", () => {
    expect(t.declarations).toBe(CORPUS_DECLARATION_COUNT);
    expect(t.theorems + t.definitions).toBe(t.declarations);
    expect(t.theorems).toBe(32);
    expect(t.definitions).toBe(3);
  });

  it("partitions declarations into classified and unsupported", () => {
    expect(t.classified + t.unsupported).toBe(t.declarations);
    expect(t.classified).toBe(bundle.summary.classified);
    expect(t.unsupported).toBe(bundle.summary.unsupported);
  });

  it("keeps fullyReadable within classified", () => {
    expect(t.fullyReadable).toBeLessThanOrEqual(t.classified);
    expect(t.fullyReadable).toBeGreaterThanOrEqual(0);
    expect(t.fullyReadable).toBe(t.classified - t.classifiedWithOpaqueTerms);
  });

  it("reports the corpus as 34 of 35 readable, with the injectivity fixture the only miss", () => {
    expect(t.classified).toBe(34);
    expect(t.unsupported).toBe(1);
    expect(t.classifiedWithOpaqueTerms).toBe(0);
    expect(t.fullyReadable).toBe(34);
  });

  it("agrees with `opaqueHeadsIn` on which classified declarations have opaque terms", () => {
    const expected = bundle.analyses.filter(
      (a) => !a.unsupported && opaqueHeadsIn(a.math).size > 0,
    ).length;
    expect(t.classifiedWithOpaqueTerms).toBe(expected);
  });
});

describe("rates", () => {
  it("matches the totals exactly", () => {
    expect(report.rates.classified).toBe(report.totals.classified / report.totals.declarations);
    expect(report.rates.fullyReadable).toBe(
      report.totals.fullyReadable / report.totals.declarations,
    );
  });

  it("lands where the corpus actually is", () => {
    expect(report.rates.classified).toBeCloseTo(34 / 35, 10);
    expect(report.rates.fullyReadable).toBeCloseTo(34 / 35, 10);
    expect(report.rates.fullyReadable * 100).toBeCloseTo(97.14, 1);
  });

  it("stays within [0,1]", () => {
    for (const rate of Object.values(report.rates)) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// The two backlogs
// ---------------------------------------------------------------------------

describe("unrecognisedShapes", () => {
  it("contains exactly the injectivity fixture", () => {
    // `Filter.Tendsto` used to sit here; the `limit` classifier reads it now.
    expect(report.unrecognisedShapes).toEqual([
      {
        head: "Function.Injective",
        declarations: 1,
        examples: ["ProofLens.Examples.energy_cost_injective"],
      },
    ]);
  });

  it("accounts for every unsupported declaration exactly once", () => {
    const total = report.unrecognisedShapes.reduce((n, m) => n + m.declarations, 0);
    expect(total).toBe(report.totals.unsupported);
  });

  it("names only declarations the pipeline actually marked unsupported", () => {
    const unsupported = new Set(
      bundle.analyses.filter((a) => a.unsupported).map((a) => a.math.name),
    );
    for (const miss of report.unrecognisedShapes) {
      for (const example of miss.examples) expect(unsupported.has(example)).toBe(true);
    }
  });
});

describe("opaqueConstants", () => {
  it("contains exactly Function.Injective", () => {
    expect(report.opaqueConstants.map((m) => m.head)).toEqual(["Function.Injective"]);
  });

  it("no longer lists Filter.Tendsto, now that limits are read properly", () => {
    expect(report.opaqueConstants.map((m) => m.head)).not.toContain("Filter.Tendsto");
  });

  it("agrees with `opaqueHeadsIn` declaration by declaration", () => {
    const expected = new Map<string, Set<string>>();
    for (const analysis of bundle.analyses) {
      for (const head of opaqueHeadsIn(analysis.math)) {
        expected.set(head, (expected.get(head) ?? new Set()).add(analysis.math.name));
      }
    }
    expect(report.opaqueConstants).toHaveLength(expected.size);
    for (const miss of report.opaqueConstants) {
      expect(miss.declarations).toBe(expected.get(miss.head!)!.size);
    }
  });

  it("never lists a constant ProofLens can already name", () => {
    const named = report.opaqueConstants.map((m) => m.head);
    for (const local of [
      "ProofLens.Examples.energyBudget",
      "ProofLens.Examples.landauerCost",
      "ProofLens.Examples.throughput",
    ]) {
      expect(named).not.toContain(local);
    }
    // Nor anything from the built-in tables.
    for (const builtin of ["LE.le", "HDiv.hDiv", "Real.log", "Monotone", "Filter.Tendsto"]) {
      expect(named).not.toContain(builtin);
    }
  });
});

describe("backlog ranking", () => {
  /** Build a bundle from hand-written declarations to control the counts. */
  function bundleWithOpaqueHeads(): PipelineBundle {
    const raw = corpusRaw() as { declarations: unknown[] };
    return runPipelineOnValue(raw);
  }

  it("ranks by declarations affected, descending", () => {
    for (const backlog of [report.unrecognisedShapes, report.opaqueConstants]) {
      for (let i = 1; i < backlog.length; i += 1) {
        expect(backlog[i - 1]!.declarations).toBeGreaterThanOrEqual(backlog[i]!.declarations);
      }
    }
  });

  it("breaks ties deterministically, by head name", () => {
    const built = coverageReport(bundleWithOpaqueHeads());
    const ties = new Map<number, string[]>();
    for (const miss of built.opaqueConstants) {
      ties.set(miss.declarations, [...(ties.get(miss.declarations) ?? []), String(miss.head)]);
    }
    for (const names of ties.values()) {
      // The same comparator `rank` uses; see the locale note in
      // `mathlib-coverage.test.ts`.
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it("produces byte-identical output on repeated runs", () => {
    const again = coverageReport(runPipeline(corpus()));
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });

  it("caps examples at five and sorts them", () => {
    for (const backlog of [report.unrecognisedShapes, report.opaqueConstants]) {
      for (const miss of backlog) {
        expect(miss.examples.length).toBeLessThanOrEqual(5);
        expect(miss.examples.length).toBeLessThanOrEqual(miss.declarations);
        expect(miss.examples).toEqual([...miss.examples].sort());
      }
    }
  });

  it("caps examples at five even when many declarations share a head", () => {
    // Twelve declarations, all with the same unreadable conclusion shape.
    const raw = corpusRaw() as Record<string, unknown>;
    const template = (raw["declarations"] as Array<Record<string, unknown>>).find(
      (d) => d["name"] === "ProofLens.Examples.energy_cost_injective",
    )!;
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...template,
      name: `ProofLens.Examples.injective_${String(i).padStart(2, "0")}`,
    }));
    const built = coverageReport(runPipelineOnValue({ ...raw, declarations: many }));
    const miss = built.unrecognisedShapes[0]!;
    expect(miss.declarations).toBe(12);
    expect(miss.examples).toHaveLength(5);
    expect(miss.examples).toEqual([
      "ProofLens.Examples.injective_00",
      "ProofLens.Examples.injective_01",
      "ProofLens.Examples.injective_02",
      "ProofLens.Examples.injective_03",
      "ProofLens.Examples.injective_04",
    ]);
  });
});

// ---------------------------------------------------------------------------
// byClassification
// ---------------------------------------------------------------------------

describe("byClassification", () => {
  it("sums to the classified total", () => {
    const total = report.byClassification.reduce((n, row) => n + row.declarations, 0);
    expect(total).toBe(report.totals.classified);
  });

  it("counts each declaration under its primary classification only", () => {
    const expected = new Map<string, number>();
    for (const analysis of bundle.analyses) {
      if (analysis.unsupported) continue;
      const kind = analysis.primary!.payload.kind;
      expected.set(kind, (expected.get(kind) ?? 0) + 1);
    }
    expect(report.byClassification).toHaveLength(expected.size);
    for (const row of report.byClassification) {
      expect(row.declarations, row.kind).toBe(expected.get(row.kind));
    }
  });

  it("is sorted by count descending", () => {
    for (let i = 1; i < report.byClassification.length; i += 1) {
      expect(report.byClassification[i - 1]!.declarations).toBeGreaterThanOrEqual(
        report.byClassification[i]!.declarations,
      );
    }
  });

  it("leads with upper bounds, the corpus's most common shape", () => {
    expect(report.byClassification[0]).toEqual({ kind: "upper-bound", declarations: 13 });
  });

  it("never lists `unsupported` as a classification", () => {
    expect(report.byClassification.map((r) => r.kind)).not.toContain("unsupported");
  });
});

// ---------------------------------------------------------------------------
// assumptionSensitivity
// ---------------------------------------------------------------------------

describe("assumptionSensitivity", () => {
  const s = report.assumptionSensitivity;

  it("agrees with what classifyTheorem reports", () => {
    let analysed = 0;
    let withUnused = 0;
    let unusedTotal = 0;
    for (const analysis of bundle.analyses) {
      const found = classifyTheorem(analysis.math).find(
        (c) => c.payload.kind === "assumption-sensitivity",
      );
      if (!found || found.payload.kind !== "assumption-sensitivity") continue;
      analysed += 1;
      const unused = found.payload.data.unusedInProof;
      if (unused.length > 0) {
        withUnused += 1;
        unusedTotal += unused.length;
      }
    }
    expect(s.analysed).toBe(analysed);
    expect(s.withUnusedHypotheses).toBe(withUnused);
    expect(s.unusedHypotheses).toBe(unusedTotal);
  });

  it("finds the two known redundancy fixtures", () => {
    expect(s.withUnusedHypotheses).toBe(2);
    expect(s.unusedHypotheses).toBe(3);
    expect(s.examples).toEqual([
      { declaration: "ProofLens.Examples.information_rate_bound", unused: ["hP"] },
      { declaration: "ProofLens.Examples.simple_upper_bound", unused: ["hP", "hT"] },
    ]);
  });

  it("agrees with the pipeline summary", () => {
    expect(s.withUnusedHypotheses).toBe(bundle.summary.withUnusedHypotheses);
  });

  it("lists an example for every declaration with an unused hypothesis", () => {
    expect(s.examples).toHaveLength(Math.min(s.withUnusedHypotheses, 20));
    for (const example of s.examples) expect(example.unused.length).toBeGreaterThan(0);
  });

  it("counts no more analysed declarations than there are with hypotheses", () => {
    const withHypotheses = bundle.analyses.filter((a) => a.math.hypotheses.length > 0).length;
    expect(s.analysed).toBeLessThanOrEqual(withHypotheses);
  });
});

// ---------------------------------------------------------------------------
// trust and figures
// ---------------------------------------------------------------------------

describe("trust", () => {
  it("reports a clean corpus", () => {
    expect(report.trust.usesSorry).toEqual([]);
    expect(report.trust.unusualAxioms).toEqual([]);
  });

  it("names a sorry-carrying declaration when there is one", () => {
    const raw = corpusRaw() as Record<string, unknown>;
    const declarations = raw["declarations"] as Array<Record<string, unknown>>;
    declarations[0]!["usesSorry"] = true;
    const built = coverageReport(runPipelineOnValue(raw));
    expect(built.trust.usesSorry).toEqual([declarations[0]!["name"]]);
  });

  it("names unusual axioms when there are some", () => {
    const raw = corpusRaw() as Record<string, unknown>;
    const declarations = raw["declarations"] as Array<Record<string, unknown>>;
    declarations[0]!["axioms"] = ["propext", "ProofLens.riemannHypothesis"];
    const built = coverageReport(runPipelineOnValue(raw));
    expect(built.trust.unusualAxioms).toEqual([
      { declaration: declarations[0]!["name"], axioms: ["ProofLens.riemannHypothesis"] },
    ]);
  });
});

describe("figures", () => {
  it("byType sums to planned", () => {
    const total = report.figures.byType.reduce((n, row) => n + row.count, 0);
    expect(total).toBe(report.figures.planned);
    expect(report.figures.planned).toBe(bundle.summary.visualsPlanned);
  });

  it("byEpistemicStatus sums to planned", () => {
    const total = report.figures.byEpistemicStatus.reduce((n, row) => n + row.count, 0);
    expect(total).toBe(report.figures.planned);
  });

  it("matches the pipeline's own histogram", () => {
    const fromSummary = Object.entries(bundle.summary.epistemicHistogram).sort();
    const fromReport = report.figures.byEpistemicStatus
      .map((r) => [r.status, r.count] as [string, number])
      .sort();
    expect(fromReport).toEqual(fromSummary);
  });

  it("never reports a `verified` figure", () => {
    expect(report.figures.byEpistemicStatus.map((r) => r.status)).not.toContain("verified");
  });

  it("is sorted by count descending in both tables", () => {
    for (const rows of [report.figures.byType, report.figures.byEpistemicStatus]) {
      for (let i = 1; i < rows.length; i += 1) {
        expect(rows[i - 1]!.count).toBeGreaterThanOrEqual(rows[i]!.count);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Metadata and degenerate input
// ---------------------------------------------------------------------------

describe("metadata", () => {
  it("carries the extraction's modules and fidelity through", () => {
    expect(report.modules).toEqual(bundle.generatedFrom.modules);
    expect(report.notationFidelity).toBe("notation");
  });
});

describe("an empty bundle", () => {
  const raw = corpusRaw() as Record<string, unknown>;
  const empty = coverageReport(runPipelineOnValue({ ...raw, declarations: [] }));

  it("does not divide by zero", () => {
    expect(empty.rates.classified).toBe(0);
    expect(empty.rates.fullyReadable).toBe(0);
    expect(Number.isNaN(empty.rates.classified)).toBe(false);
    expect(Number.isNaN(empty.rates.fullyReadable)).toBe(false);
    expect(Number.isFinite(empty.rates.classified)).toBe(true);
  });

  it("reports zeroes and empty backlogs rather than throwing", () => {
    expect(empty.totals).toEqual({
      declarations: 0,
      theorems: 0,
      definitions: 0,
      classified: 0,
      unsupported: 0,
      classifiedWithOpaqueTerms: 0,
      fullyReadable: 0,
    });
    expect(empty.unrecognisedShapes).toEqual([]);
    expect(empty.opaqueConstants).toEqual([]);
    expect(empty.byClassification).toEqual([]);
    expect(empty.figures.planned).toBe(0);
    expect(empty.figures.byType).toEqual([]);
  });

  it("still reports the document's metadata", () => {
    expect(empty.modules).toEqual(bundle.generatedFrom.modules);
  });
});

describe("a single-declaration bundle", () => {
  it("reports 100% when that declaration is fully readable", () => {
    const raw = corpusRaw() as Record<string, unknown>;
    const one = (raw["declarations"] as Array<Record<string, unknown>>).find(
      (d) => d["name"] === "ProofLens.Examples.simple_upper_bound",
    )!;
    const built = coverageReport(runPipelineOnValue({ ...raw, declarations: [one] }));
    expect(built.rates.classified).toBe(1);
    expect(built.rates.fullyReadable).toBe(1);
    expect(built.unrecognisedShapes).toEqual([]);
  });

  it("reports 0% when that declaration is the unreadable one", () => {
    const raw = corpusRaw() as Record<string, unknown>;
    const one = (raw["declarations"] as Array<Record<string, unknown>>).find(
      (d) => d["name"] === "ProofLens.Examples.energy_cost_injective",
    )!;
    const built = coverageReport(runPipelineOnValue({ ...raw, declarations: [one] }));
    expect(built.rates.classified).toBe(0);
    expect(built.rates.fullyReadable).toBe(0);
    expect(built.unrecognisedShapes.map((m) => m.head)).toEqual(["Function.Injective"]);
  });
});
