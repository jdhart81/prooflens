/**
 * End to end, over the real extraction.
 *
 * Formal IR → MathIR → classification → VisualIR → SVG, with no Lean, no
 * network, and no snapshots. Where a snapshot would be tempting, the assertion
 * names the thing it actually cares about instead.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PROOFLENS_VERSION,
  analysisCeiling,
  findAnalysis,
  runPipeline,
  runPipelineOnJson,
  runPipelineOnValue,
  coverageReport,
  type PipelineBundle,
} from "@prooflens/pipeline";
import { FormalIRParseError } from "@prooflens/formal-ir";
import { renderSvg, renderSvgDocument } from "@prooflens/renderer-svg";
import { renderText } from "@prooflens/renderer-text";
import { CORPUS_PATH, CORPUS_DECLARATION_COUNT, corpus, corpusRaw } from "./helpers.js";

const bundle: PipelineBundle = runPipeline(corpus());

// ---------------------------------------------------------------------------
// Full run
// ---------------------------------------------------------------------------

describe("a full run over the real corpus", () => {
  it("does not throw", () => {
    expect(() => runPipeline(corpus())).not.toThrow();
  });

  it("produces 34 analyses, one per declaration, in document order", () => {
    expect(bundle.analyses).toHaveLength(CORPUS_DECLARATION_COUNT);
    expect(bundle.analyses.map((a) => a.math.name)).toEqual(
      bundle.formal.declarations.map((d) => d.name),
    );
    for (const analysis of bundle.analyses) {
      expect(analysis.formal.name).toBe(analysis.math.name);
    }
  });

  it("carries the extraction metadata forward", () => {
    expect(bundle.prooflensVersion).toBe(PROOFLENS_VERSION);
    expect(bundle.generatedFrom.system).toBe("lean4");
    expect(bundle.generatedFrom.toolchain).toBe(bundle.formal.toolchain);
    expect(bundle.generatedFrom.modules).toEqual(bundle.formal.modules);
    expect(bundle.generatedFrom.notationFidelity).toBe("notation");
  });

  it("keeps every intermediate stage rather than discarding it", () => {
    expect(bundle.formal.declarations.length).toBe(CORPUS_DECLARATION_COUNT);
    expect(bundle.math.theorems.length).toBe(CORPUS_DECLARATION_COUNT);
    expect(bundle.dependencies.nodes.length).toBe(CORPUS_DECLARATION_COUNT);
    for (const analysis of bundle.analyses) {
      expect(analysis.classifications.length).toBeGreaterThan(0);
      expect(analysis.explanations.length).toBeGreaterThan(0);
      expect(analysis.visuals.length).toBeGreaterThan(0);
      expect(analysis.primary).toBeDefined();
    }
  });

  it("reads the same corpus through the JSON and value entry points", () => {
    const fromJson = runPipelineOnJson(readFileSync(CORPUS_PATH, "utf8"));
    const fromValue = runPipelineOnValue(corpusRaw());
    expect(fromJson.summary).toEqual(bundle.summary);
    expect(fromValue.summary).toEqual(bundle.summary);
  });

  it("rejects input that is not Formal IR", () => {
    expect(() => runPipelineOnValue({ declarations: "nope" })).toThrow(FormalIRParseError);
    expect(() => runPipelineOnJson("not json at all")).toThrow(FormalIRParseError);
  });
});

// ---------------------------------------------------------------------------
// Summary agrees with the classifiers
// ---------------------------------------------------------------------------

describe("the summary counts what the classifiers reported", () => {
  const s = bundle.summary;

  it("counts declarations", () => {
    expect(s.declarations).toBe(CORPUS_DECLARATION_COUNT);
    expect(s.classified + s.unsupported).toBe(s.declarations);
  });

  it("counts unsupported declarations exactly as the classifier marked them", () => {
    const unsupported = bundle.analyses.filter((a) =>
      a.classifications.some((c) => c.payload.kind === "unsupported"),
    );
    expect(s.unsupported).toBe(unsupported.length);
    // The `distinctness` classifier now reads `switching_coefficient_ne_zero`,
    // leaving only the deliberate convergence fixture unsupported.
    expect(unsupported.map((a) => a.math.name.split(".").pop())).toEqual(["energy_cost_injective"]);
    expect(s.classified).toBe(34);
    for (const analysis of bundle.analyses) {
      expect(analysis.unsupported).toBe(
        analysis.classifications.some((c) => c.payload.kind === "unsupported"),
      );
    }
  });

  it("counts declarations with unused hypotheses exactly as the classifier reported", () => {
    const withUnused = bundle.analyses.filter((a) =>
      a.classifications.some(
        (c) =>
          c.payload.kind === "assumption-sensitivity" && c.payload.data.unusedInProof.length > 0,
      ),
    );
    expect(s.withUnusedHypotheses).toBe(withUnused.length);
    expect(withUnused.map((a) => a.math.name.split(".").pop())).toEqual([
      "information_rate_bound",
      "simple_upper_bound",
    ]);
  });

  it("counts sorry and unusual axioms from the trust base", () => {
    expect(s.withSorry).toBe(bundle.analyses.filter((a) => a.math.trust.usesSorry).length);
    expect(s.withSorry).toBe(0);
    expect(s.withUnusualAxioms).toBe(
      bundle.analyses.filter((a) => a.math.trust.unusualAxioms.length > 0).length,
    );
    expect(s.withUnusualAxioms).toBe(0);
  });

  it("counts every planned figure exactly once", () => {
    const planned = bundle.analyses.reduce((n, a) => n + a.visuals.length, 0);
    expect(s.visualsPlanned).toBe(planned);
    const histogramTotal = Object.values(s.epistemicHistogram).reduce((a, b) => a + b, 0);
    expect(histogramTotal).toBe(planned);
    expect(s.visualsPlanned).toBe(75);
  });

  it("histograms the figures by the status each figure actually carries", () => {
    const expected: Record<string, number> = {};
    for (const analysis of bundle.analyses) {
      for (const visual of analysis.visuals) {
        expected[visual.epistemic] = (expected[visual.epistemic] ?? 0) + 1;
      }
    }
    expect(s.epistemicHistogram).toEqual(expected);
    expect(s.epistemicHistogram["verified"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// simple_upper_bound, all the way through
// ---------------------------------------------------------------------------

describe("the simple_upper_bound path, Formal IR to SVG", () => {
  const analysis = findAnalysis(bundle, "simple_upper_bound")!;

  it("starts from the Lean declaration the extractor produced", () => {
    expect(analysis.formal.name).toBe("ProofLens.Examples.simple_upper_bound");
    expect(analysis.formal.kind).toBe("theorem");
    expect(analysis.formal.usesSorry).toBe(false);
    expect(analysis.formal.conclusion.pretty).toBe("x ≤ P / T");
  });

  it("lowers to MathIR as `x ≤ P / T`", () => {
    expect(analysis.math.conclusionDisplay).toBe("x ≤ P / T");
    expect(analysis.math.conclusion.value.kind).toBe("relation");
    expect(analysis.math.conclusion.status).toBe("derived");
    expect(analysis.math.concept).toBe("power-limited rate bound");
  });

  it("classifies as an upper bound", () => {
    expect(analysis.primary!.payload.kind).toBe("upper-bound");
    expect(analysis.classifications.map((c) => c.payload.kind)).toEqual([
      "upper-bound",
      "lower-bound",
      "assumption-sensitivity",
    ]);
  });

  it("plans assumption-sensitivity first, then the upper-bound plot", () => {
    expect(analysis.visuals.map((v) => v.type)).toEqual([
      "assumption-sensitivity",
      "upper-bound-plot",
    ]);
  });

  it("renders the plot to an SVG fragment carrying the bound label", () => {
    const spec = analysis.visuals.find((v) => v.type === "upper-bound-plot")!;
    const svg = renderSvg(spec);
    expect(typeof svg).toBe("string");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain("P / T");
    expect(svg).toContain("x");
  });

  it("renders a standalone SVG document too", () => {
    const spec = analysis.visuals.find((v) => v.type === "upper-bound-plot")!;
    const document = renderSvgDocument(spec);
    expect(document).toContain("<svg");
    expect(document).toContain("P / T");
  });

  it("renders the assumption figure to text naming both unused hypotheses", () => {
    const spec = analysis.visuals.find((v) => v.type === "assumption-sensitivity")!;
    const text = renderText(spec);
    expect(text).toContain("hP");
    expect(text).toContain("hT");
    expect(text.length).toBeGreaterThan(0);
  });

  it("explains itself in layers, with only the formal layer verified", () => {
    const ids = analysis.explanations.map((l) => l.id);
    expect(ids[0]).toBe("formal");
    expect(ids).toContain("assumptions");
    expect(ids).toContain("parameters");
    const verified = analysis.explanations.filter((l) => l.claim.status === "verified");
    expect(verified.map((l) => l.id)).toEqual(["formal"]);
    expect(verified[0]!.claim.provenance.rule).toBeUndefined();
    expect(verified[0]!.claim.value).toBe(analysis.math.statementDisplay);
  });

  it("reports the declaration's ceiling as verified, because nothing used sorry", () => {
    expect(analysisCeiling(analysis)).toBe("verified");
  });
});

// ---------------------------------------------------------------------------
// log_two_pos, the sign-fact path the new classifiers opened
// ---------------------------------------------------------------------------

describe("the log_two_pos path, Formal IR to SVG", () => {
  const analysis = findAnalysis(bundle, "log_two_pos")!;

  it("lowers to `0 < log(2)`", () => {
    expect(analysis.formal.conclusion.pretty).toBe("0 < Real.log 2");
    expect(analysis.math.conclusionDisplay).toBe("0 < log(2)");
  });

  it("classifies as a positivity fact, keeping both bound readings alongside", () => {
    expect(analysis.primary!.payload.kind).toBe("positivity");
    expect(analysis.classifications.map((c) => c.payload.kind)).toEqual([
      "positivity",
      "upper-bound",
      "lower-bound",
    ]);
    expect(analysis.unsupported).toBe(false);
  });

  it("plans a number-line first, then the natural lower-bound plot", () => {
    expect(analysis.visuals.map((v) => v.type)).toEqual(["number-line", "lower-bound-plot"]);
  });

  it("renders both figures to SVG carrying the quantity's label", () => {
    for (const spec of analysis.visuals) {
      const svg = renderSvg(spec);
      expect(svg.startsWith("<svg"), spec.id).toBe(true);
      expect(svg, spec.id).toContain("log(2)");
    }
  });

  it("renders both figures to text", () => {
    for (const spec of analysis.visuals) {
      expect(renderText(spec)).toContain("log(2)");
    }
  });
});

describe("the switching_coefficient_ne_zero path", () => {
  const analysis = findAnalysis(bundle, "switching_coefficient_ne_zero")!;

  it("is no longer unsupported", () => {
    expect(analysis.unsupported).toBe(false);
    expect(analysis.primary!.payload.kind).toBe("distinctness");
    expect(analysis.visuals.map((v) => v.type)).not.toContain("expression-tree");
  });

  it("explains itself without claiming a structure it does not have", () => {
    const text = analysis.explanations.map((l) => l.claim.value).join("\n");
    expect(text).not.toMatch(/upper bound|lower bound|monotone/i);
  });
});

describe("every planned figure type in the corpus", () => {
  it("covers the ten the planner can currently produce", () => {
    const types = new Set(bundle.analyses.flatMap((a) => a.visuals).map((v) => v.type));
    expect([...types].sort()).toEqual([
      "assumption-sensitivity",
      "dependency-graph",
      "expression-tree",
      "implication-graph",
      "limit-plot",
      "lower-bound-plot",
      "monotonicity-plot",
      "number-line",
      "relationship-diagram",
      "upper-bound-plot",
    ]);
  });
});

// ---------------------------------------------------------------------------
// landauerCost: a definition's body, Lean through to the figure
// ---------------------------------------------------------------------------

describe("the landauerCost path, definition body to relationship diagram", () => {
  const analysis = findAnalysis(bundle, "landauerCost")!;

  it("starts from a Lean definition carrying an instantiated body", () => {
    expect(analysis.formal.kind).toBe("definition");
    expect(analysis.formal.definitionBody).not.toBeNull();
    expect(analysis.formal.definitionBody!.pretty.length).toBeGreaterThan(0);
    expect(analysis.formal.binders.map((b) => b.name)).toEqual(["kB", "T", "D"]);
  });

  it("lowers the body to `kB · T · log(2) / D`", () => {
    expect(analysis.math.definitionBody!.display).toBe("kB · T · log(2) / D");
  });

  it("classifies as a definition plus a functional relationship", () => {
    expect(analysis.classifications.map((c) => c.payload.kind)).toEqual([
      "definition",
      "functional-relationship",
    ]);
    expect(analysis.primary!.payload.kind).toBe("functional-relationship");
    expect(analysis.unsupported).toBe(false);
  });

  it("plans a relationship-diagram naming the definition and its inputs", () => {
    expect(analysis.visuals.map((v) => v.type)).toEqual(["relationship-diagram"]);
    const spec = analysis.visuals[0]!;
    expect(spec.title).toBe("landauerCost(kB, T, D) = kB · T · log(2) / D");
    expect(spec.entities.filter((e) => e.id.startsWith("in:")).map((e) => e.label)).toEqual([
      "kB",
      "T",
      "D",
    ]);
  });

  it("renders to SVG and to text, both carrying the body", () => {
    const spec = analysis.visuals[0]!;
    const svg = renderSvg(spec);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("landauerCost");
    expect(renderText(spec)).toContain("landauerCost");
  });

  it("keeps every definition body out of the theorem-kind declarations", () => {
    // The exclusion of proof terms is deliberate and must stay that way.
    for (const a of bundle.analyses) {
      const isDefinition = a.formal.kind === "definition" || a.formal.kind === "opaque";
      expect(a.formal.definitionBody === null, a.formal.name).toBe(!isDefinition);
      expect(a.math.definitionBody === null, a.math.name).toBe(!isDefinition);
    }
  });

  it("plans a relationship-diagram for every definition, and for the one theorem shaped like one", () => {
    const withDiagram = bundle.analyses.filter((a) =>
      a.visuals.some((v) => v.type === "relationship-diagram"),
    );
    expect(withDiagram.map((a) => a.math.name.split(".").pop())).toEqual([
      "energyBudget",
      "landauerCost",
      "rate_eq_count_div_time",
      "throughput",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("produces byte-identical bundles from the same input", () => {
    const first = runPipeline(corpus());
    const second = runPipeline(corpus());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("produces byte-identical bundles from two independent parses of the same file", () => {
    const text = readFileSync(CORPUS_PATH, "utf8");
    expect(JSON.stringify(runPipelineOnJson(text))).toBe(JSON.stringify(runPipelineOnJson(text)));
  });

  it("renders identical SVG on repeated runs", () => {
    const a = runPipeline(corpus());
    const b = runPipeline(corpus());
    for (let i = 0; i < a.analyses.length; i += 1) {
      const left = a.analyses[i]!.visuals.map((v) => renderSvgDocument(v)).join("\n");
      const right = b.analyses[i]!.visuals.map((v) => renderSvgDocument(v)).join("\n");
      expect(right).toBe(left);
    }
  });
});

// ---------------------------------------------------------------------------
// findAnalysis
// ---------------------------------------------------------------------------

describe("findAnalysis", () => {
  it("finds a declaration by its full name", () => {
    const found = findAnalysis(bundle, "ProofLens.Examples.information_rate_bound");
    expect(found?.math.name).toBe("ProofLens.Examples.information_rate_bound");
  });

  it("finds a declaration by its short name", () => {
    const found = findAnalysis(bundle, "information_rate_bound");
    expect(found?.math.name).toBe("ProofLens.Examples.information_rate_bound");
  });

  it("finds every declaration by both names", () => {
    for (const analysis of bundle.analyses) {
      const short = analysis.math.name.split(".").pop()!;
      expect(findAnalysis(bundle, analysis.math.name)?.math.name).toBe(analysis.math.name);
      expect(findAnalysis(bundle, short)?.math.name).toBe(analysis.math.name);
    }
  });

  it("returns undefined for a name that is not there", () => {
    expect(findAnalysis(bundle, "not_a_declaration")).toBeUndefined();
    expect(findAnalysis(bundle, "")).toBeUndefined();
  });

  it("prefers an exact full-name match over a short-name match", () => {
    expect(findAnalysis(bundle, "ProofLens.Examples.throughput")?.math.name).toBe(
      "ProofLens.Examples.throughput",
    );
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation on a hand-built document
// ---------------------------------------------------------------------------

describe("graceful degradation on an unrecognised conclusion", () => {
  /** A Formal IR document with a conclusion ProofLens has no rule for at all. */
  function unrecognisedDocument(): unknown {
    const source = {
      module: "Made.Up",
      startLine: 1,
      startColumn: 0,
      endLine: 3,
      endColumn: 12,
    };
    const expr = (pretty: string, tree: unknown, constants: string[]) => ({
      pretty,
      tree,
      constants,
    });
    return {
      formalIRVersion: "0.1.0",
      system: "lean4",
      toolchain: "4.24.0",
      notationFidelity: "notation",
      modules: ["Made.Up"],
      declarations: [
        {
          name: "Made.Up.quasar_emits",
          namespace: "Made.Up",
          kind: "theorem",
          docstring: "A statement about nothing ProofLens has ever heard of.",
          source,
          binders: [
            {
              index: 0,
              name: "hq",
              fvarId: "_uniq.1",
              binderInfo: "default",
              role: "hypothesis",
              type: expr(
                "Quasar.stable q",
                {
                  kind: "app",
                  fn: { kind: "const", name: "Quasar.stable", levels: [] },
                  args: [{ kind: "fvar", name: "q", fvarId: "_uniq.0" }],
                },
                ["Quasar.stable"],
              ),
              usage: {
                occursInProofTerm: true,
                occursInLaterBinderTypes: false,
                occursInConclusion: false,
                proofTermAvailable: true,
                unusedInProof: false,
              },
            },
          ],
          conclusion: expr(
            "Quasar.emits q Filter.atTop",
            {
              kind: "app",
              fn: { kind: "const", name: "Quasar.emits", levels: [] },
              args: [
                { kind: "fvar", name: "q", fvarId: "_uniq.0" },
                { kind: "const", name: "Filter.atTop", levels: [] },
              ],
            },
            ["Quasar.emits", "Filter.atTop"],
          ),
          statement: expr(
            "∀ q, Quasar.stable q → Quasar.emits q Filter.atTop",
            { kind: "const", name: "Quasar.emits", levels: [] },
            ["Quasar.emits"],
          ),
          dependencies: [],
          axioms: ["propext"],
          proofTermAvailable: true,
          usesSorry: false,
        },
      ],
    };
  }

  const made = runPipelineOnValue(unrecognisedDocument());
  const analysis = made.analyses[0]!;

  it("does not throw", () => {
    expect(() => runPipelineOnValue(unrecognisedDocument())).not.toThrow();
    expect(made.analyses).toHaveLength(1);
  });

  it("marks the analysis `unsupported: true`", () => {
    expect(analysis.unsupported).toBe(true);
    expect(made.summary.unsupported).toBe(1);
    expect(made.summary.classified).toBe(0);
  });

  it("still plans at least one spec, preserving the statement's structure", () => {
    expect(analysis.visuals.length).toBeGreaterThanOrEqual(1);
    const spec = analysis.visuals.find((v) => v.type === "expression-tree")!;
    expect(spec).toBeDefined();
    expect(spec.entities.map((e) => e.label)).toContain(analysis.math.conclusionDisplay);
    expect(spec.rationale.length).toBeGreaterThan(0);
  });

  it("still produces an explanation, which admits what it could not read", () => {
    expect(analysis.explanations.length).toBeGreaterThan(0);
    const text = analysis.explanations.map((l) => l.claim.value).join("\n");
    expect(text).toMatch(/does not have a reading for its head symbol|No deterministic/);
  });

  it("names the unrecognised head constant rather than inventing one", () => {
    const unsupported = analysis.classifications.find((c) => c.payload.kind === "unsupported")!;
    expect(unsupported.payload.kind).toBe("unsupported");
    expect((unsupported.payload.data as { head: string | null }).head).toBe("Quasar.emits");
  });

  it("still renders to SVG and to text", () => {
    for (const spec of analysis.visuals) {
      const svg = renderSvgDocument(spec);
      expect(svg).toContain("<svg");
      expect(renderText(spec).length).toBeGreaterThan(0);
    }
  });

  it("is deterministic too", () => {
    expect(JSON.stringify(runPipelineOnValue(unrecognisedDocument()))).toBe(
      JSON.stringify(runPipelineOnValue(unrecognisedDocument())),
    );
  });
});

// ---------------------------------------------------------------------------
// sequence_limit_example: the fixture that stopped being unsupported
// ---------------------------------------------------------------------------

describe("the sequence_limit_example path, Formal IR to SVG", () => {
  const analysis = findAnalysis(bundle, "sequence_limit_example")!;

  it("starts from the Lean convergence statement", () => {
    // Renamed from `unsupported_tendsto_fixture`: the statement and the proof
    // are unchanged, ProofLens simply learned to read it.
    expect(analysis.formal.name).toBe("ProofLens.Examples.sequence_limit_example");
    expect(analysis.formal.conclusion.pretty).toContain("Filter.Tendsto");
  });

  it("lowers to a `limit` proposition rather than an opaque term", () => {
    expect(analysis.math.conclusion.value.kind).toBe("limit");
    expect(analysis.math.conclusionDisplay).toBe("n ↦ 1 / (n + 1) ⟶ 0 (along +∞)");
  });

  it("classifies as a convergent limit", () => {
    expect(analysis.unsupported).toBe(false);
    expect(analysis.primary!.payload.kind).toBe("limit");
    const payload = analysis.primary!.payload;
    expect(payload.kind === "limit" && payload.data.convergent).toBe(true);
  });

  it("plans a limit-plot", () => {
    expect(analysis.visuals.map((v) => v.type)).toEqual(["limit-plot"]);
  });

  it("renders to SVG and to text carrying the limit value", () => {
    for (const spec of analysis.visuals) {
      const svg = renderSvg(spec);
      expect(svg.startsWith("<svg"), spec.id).toBe(true);
      expect(renderText(spec).length).toBeGreaterThan(0);
    }
  });

  it("explains itself without claiming it cannot read the statement", () => {
    const text = analysis.explanations.map((l) => l.claim.value).join("\n");
    expect(text).not.toContain("does not have a reading for its head symbol");
  });

  it("no longer appears in the coverage backlog", () => {
    const report = coverageReport(bundle);
    for (const backlog of [report.unrecognisedShapes, report.opaqueConstants]) {
      expect(backlog.flatMap((m) => m.examples)).not.toContain(analysis.math.name);
      expect(backlog.map((m) => m.head)).not.toContain("Filter.Tendsto");
    }
  });
});

// ---------------------------------------------------------------------------
// The whole-corpus sweep
// ---------------------------------------------------------------------------

describe("a sweep over every planned figure", () => {
  // A cheap stand-in for the 679-declaration mathlib run, which produced 1490
  // figures with zero render failures and zero dangling relationship endpoints.
  // The committed corpus is small, but the invariants are the same ones.
  const specs = bundle.analyses.flatMap((a) => a.visuals);

  it("plans at least one figure for every declaration", () => {
    for (const analysis of bundle.analyses) {
      expect(analysis.visuals.length, analysis.math.name).toBeGreaterThanOrEqual(1);
    }
    expect(specs.length).toBeGreaterThan(bundle.analyses.length);
  });

  it("resolves every relationship endpoint to an entity in the same spec", () => {
    let checked = 0;
    for (const spec of specs) {
      const ids = new Set(spec.entities.map((e) => e.id));
      for (const relationship of spec.relationships) {
        expect(ids.has(relationship.from), `${spec.id}: ${relationship.id}.from`).toBe(true);
        expect(ids.has(relationship.to), `${spec.id}: ${relationship.id}.to`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("renders every figure without throwing", () => {
    for (const spec of specs) {
      expect(() => renderSvgDocument(spec), spec.id).not.toThrow();
      expect(() => renderText(spec), spec.id).not.toThrow();
    }
  });

  it("produces non-degenerate output for every figure", () => {
    for (const spec of specs) {
      const svg = renderSvgDocument(spec);
      expect(svg, spec.id).toContain("</svg>");
      expect(svg.length, spec.id).toBeGreaterThan(200);
      expect(renderText(spec).trim().length, spec.id).toBeGreaterThan(0);
    }
  });

  it("gives every figure a rationale and a source", () => {
    for (const spec of specs) {
      expect(spec.rationale.trim().length, spec.id).toBeGreaterThan(0);
      expect(spec.provenance.sources.length, spec.id).toBeGreaterThan(0);
    }
  });

  it("marks no figure `verified`", () => {
    for (const spec of specs) expect(spec.epistemic, spec.id).not.toBe("verified");
  });
});

// ---------------------------------------------------------------------------
// Resilient extraction: a declaration the extractor could not read
// ---------------------------------------------------------------------------

describe("a stub row from a failed extraction", () => {
  const FAILED = {
    pretty: "<extraction failed>",
    tree: { kind: "sort", level: "0" },
    constants: [] as string[],
  };

  function stubDocument(): unknown {
    return {
      formalIRVersion: "0.1.0",
      system: "lean4",
      toolchain: "4.24.0",
      notationFidelity: "notation",
      modules: ["Broken.Module"],
      declarations: [
        {
          name: "Broken.Module.exploded",
          namespace: "Broken.Module",
          kind: "theorem",
          docstring: null,
          source: null,
          binders: [],
          conclusion: FAILED,
          statement: FAILED,
          dependencies: [],
          axioms: [],
          proofTermAvailable: false,
          extractionError: "(deterministic) maximum recursion depth has been reached",
          usesSorry: false,
        },
      ],
    };
  }

  const made = runPipelineOnValue(stubDocument());
  const analysis = made.analyses[0]!;

  it("does not throw", () => {
    expect(() => runPipelineOnValue(stubDocument())).not.toThrow();
  });

  it("produces an analysis rather than dropping the declaration", () => {
    // Losing a theorem silently is the outcome this project is not allowed to
    // have; a row that says "I could not read this" is strictly better.
    expect(made.analyses).toHaveLength(1);
    expect(analysis.formal.name).toBe("Broken.Module.exploded");
    expect(analysis.formal.extractionError).toContain("maximum recursion depth");
  });

  it("marks it unsupported and still plans a figure", () => {
    expect(analysis.unsupported).toBe(true);
    expect(analysis.visuals.length).toBeGreaterThanOrEqual(1);
    expect(analysis.visuals.map((v) => v.type)).toEqual(["expression-tree"]);
  });

  it("still produces explanation layers", () => {
    expect(analysis.explanations.length).toBeGreaterThan(0);
    expect(analysis.explanations[0]!.id).toBe("formal");
  });

  it("never claims the kernel verified anything about it", () => {
    // `usesSorry: false` on a stub means no `sorry` was *observed*, not that
    // Lean accepted the declaration — ProofLens never saw the declaration at all.
    expect(analysis.math.ceiling).toBe("derived");
    expect(analysisCeiling(analysis)).toBe("derived");
    expect(analysis.math.conclusion.status).toBe("derived");
    for (const layer of analysis.explanations) {
      expect(layer.claim.status, layer.id).not.toBe("verified");
    }
    expect(JSON.stringify(analysis)).not.toContain('"verified"');
  });

  it("titles the formal layer `What was stated`, not `What was proved`", () => {
    const formal = analysis.explanations[0]!;
    expect(formal.title).toBe("What was stated");
    expect(formal.claim.value).toBe("<extraction failed>");
  });

  it("still renders to SVG and to text", () => {
    for (const spec of analysis.visuals) {
      expect(renderSvgDocument(spec)).toContain("<svg");
      expect(renderText(spec).length).toBeGreaterThan(0);
    }
  });

  it("counts as unrecognised in the coverage report", () => {
    const report = coverageReport(made);
    expect(report.totals.classified).toBe(0);
    expect(report.totals.unsupported).toBe(1);
    expect(report.unrecognisedShapes.map((m) => m.examples)).toEqual([["Broken.Module.exploded"]]);
  });

  it("keeps a stub alongside real declarations without disturbing them", () => {
    const raw = corpusRaw() as Record<string, unknown>;
    const stub = (stubDocument() as { declarations: unknown[] }).declarations[0]!;
    const mixed = runPipelineOnValue({
      ...raw,
      declarations: [...(raw["declarations"] as unknown[]), stub],
    });
    expect(mixed.analyses).toHaveLength(CORPUS_DECLARATION_COUNT + 1);
    expect(mixed.summary.unsupported).toBe(2);

    // The real declarations keep their kernel standing.
    const real = findAnalysis(mixed, "simple_upper_bound")!;
    expect(real.math.ceiling).toBe("verified");
    expect(real.explanations[0]!.claim.status).toBe("verified");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(runPipelineOnValue(stubDocument()))).toBe(
      JSON.stringify(runPipelineOnValue(stubDocument())),
    );
  });
});

// ---------------------------------------------------------------------------
// Every analysis renders
// ---------------------------------------------------------------------------

describe("every figure in the corpus renders", () => {
  it("produces an SVG document per spec, none of them empty", () => {
    for (const analysis of bundle.analyses) {
      for (const spec of analysis.visuals) {
        const svg = renderSvgDocument(spec);
        expect(svg.startsWith("<?xml") || svg.startsWith("<svg"), spec.id).toBe(true);
        expect(svg).toContain("</svg>");
      }
    }
  });

  it("produces text output per spec, none of them empty", () => {
    for (const analysis of bundle.analyses) {
      for (const spec of analysis.visuals) {
        expect(renderText(spec).trim().length, spec.id).toBeGreaterThan(0);
      }
    }
  });
});
