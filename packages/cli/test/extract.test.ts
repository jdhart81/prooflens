/**
 * CLI surface tests.
 *
 * Nothing here invokes Lean. `buildDriver` is pure string generation, and the
 * reporting commands work off a bundle built from the checked-in corpus.
 */
import { describe, expect, it } from "vitest";
import { buildDriver, explainToText, stageJson, summarise, type Stage } from "@prooflens/cli";
import { findAnalysis, runPipeline, type PipelineBundle } from "@prooflens/pipeline";
import { corpus, CORPUS_DECLARATION_COUNT } from "../../pipeline/test/helpers.js";

const bundle: PipelineBundle = runPipeline(corpus());

// ---------------------------------------------------------------------------
// buildDriver
// ---------------------------------------------------------------------------

describe("buildDriver", () => {
  const modules = ["ProofLensExamples.Bounds", "ProofLensExamples.Monotonicity"];
  const driver = buildDriver(modules, "/tmp/out.json");
  const lines = driver.split("\n").filter((l) => l.trim() !== "");

  it("imports the ProofLens exporter first", () => {
    expect(lines[0]).toBe("import ProofLens.Export");
  });

  it("imports every requested module, in order", () => {
    expect(lines.slice(1, 3)).toEqual([
      "import ProofLensExamples.Bounds",
      "import ProofLensExamples.Monotonicity",
    ]);
  });

  it("ends with a #prooflens_export line naming the output path and the modules", () => {
    const last = lines[lines.length - 1]!;
    expect(last).toBe(
      '#prooflens_export "/tmp/out.json" ProofLensExamples.Bounds ProofLensExamples.Monotonicity',
    );
    expect(driver.endsWith("\n")).toBe(true);
  });

  it("puts a blank line between the imports and the command", () => {
    expect(driver).toContain("\n\n#prooflens_export");
  });

  it("escapes a double quote in the output path", () => {
    const generated = buildDriver(["M"], '/tmp/we"ird.json');
    expect(generated).toContain('#prooflens_export "/tmp/we\\"ird.json" M');
    // The path's quote must not terminate the Lean string literal.
    const command = generated.trim().split("\n").pop()!;
    expect(command.match(/(?<!\\)"/g)).toHaveLength(2);
  });

  it("escapes a backslash in the output path", () => {
    expect(buildDriver(["M"], "C:\\out\\ir.json")).toContain(
      '#prooflens_export "C:\\\\out\\\\ir.json" M',
    );
  });

  it("escapes backslashes before quotes, so a trailing backslash cannot escape the closing quote", () => {
    const generated = buildDriver(["M"], "/tmp/dir\\");
    expect(generated).toContain('#prooflens_export "/tmp/dir\\\\" M');
  });

  it("handles a single module", () => {
    expect(buildDriver(["Only.One"], "/o.json")).toBe(
      'import ProofLens.Export\nimport Only.One\n\n#prooflens_export "/o.json" Only.One\n',
    );
  });

  it("still produces syntactically plausible Lean with no modules", () => {
    const generated = buildDriver([], "/o.json");
    expect(generated).toBe('import ProofLens.Export\n\n#prooflens_export "/o.json" \n');
    expect(generated.split("\n")[0]).toBe("import ProofLens.Export");
  });

  it("emits no line that is neither an import, a command, nor blank", () => {
    for (const line of buildDriver(modules, "/tmp/out.json").split("\n")) {
      if (line.trim() === "") continue;
      expect(line.startsWith("import ") || line.startsWith("#prooflens_export ")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// stageJson
// ---------------------------------------------------------------------------

const STAGES: Stage[] = ["formal", "math", "classifier", "visual", "explain", "bundle"];

describe("stageJson", () => {
  it("returns parseable JSON for every stage, with no declaration", () => {
    for (const stage of STAGES) {
      const text = stageJson(bundle, stage);
      expect(typeof text).toBe("string");
      expect(() => JSON.parse(text)).not.toThrow();
      expect(text.length).toBeGreaterThan(2);
    }
  });

  it("returns parseable JSON for every stage, for a named declaration", () => {
    for (const stage of STAGES) {
      const text = stageJson(bundle, stage, "simple_upper_bound");
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });

  it("returns the whole document for the un-scoped `formal` and `math` stages", () => {
    const formal = JSON.parse(stageJson(bundle, "formal")) as { declarations: unknown[] };
    expect(formal.declarations).toHaveLength(CORPUS_DECLARATION_COUNT);
    const math = JSON.parse(stageJson(bundle, "math")) as { theorems: unknown[] };
    expect(math.theorems).toHaveLength(CORPUS_DECLARATION_COUNT);
  });

  it("returns one array entry per declaration for the un-scoped analysis stages", () => {
    for (const stage of ["classifier", "visual", "explain"] as Stage[]) {
      const parsed = JSON.parse(stageJson(bundle, stage)) as unknown[][];
      expect(parsed).toHaveLength(CORPUS_DECLARATION_COUNT);
      for (const entry of parsed) expect(Array.isArray(entry)).toBe(true);
    }
  });

  it("scopes each stage to the named declaration", () => {
    const formal = JSON.parse(stageJson(bundle, "formal", "simple_upper_bound")) as {
      name: string;
    };
    expect(formal.name).toBe("ProofLens.Examples.simple_upper_bound");

    const math = JSON.parse(stageJson(bundle, "math", "simple_upper_bound")) as {
      conclusionDisplay: string;
    };
    expect(math.conclusionDisplay).toBe("x ≤ P / T");

    const classifications = JSON.parse(
      stageJson(bundle, "classifier", "simple_upper_bound"),
    ) as Array<{ rule: { id: string } }>;
    expect(classifications.map((c) => c.rule.id)).toContain("RELATION_UPPER_BOUND_001");

    const visuals = JSON.parse(stageJson(bundle, "visual", "simple_upper_bound")) as Array<{
      type: string;
    }>;
    expect(visuals.map((v) => v.type)).toEqual(["assumption-sensitivity", "upper-bound-plot"]);

    const explanations = JSON.parse(stageJson(bundle, "explain", "simple_upper_bound")) as Array<{
      id: string;
    }>;
    expect(explanations[0]!.id).toBe("formal");
  });

  it("accepts the full declaration name as well as the short one", () => {
    expect(stageJson(bundle, "math", "ProofLens.Examples.simple_upper_bound")).toBe(
      stageJson(bundle, "math", "simple_upper_bound"),
    );
  });

  it("ignores the declaration argument for the `bundle` stage", () => {
    expect(stageJson(bundle, "bundle", "simple_upper_bound")).toBe(stageJson(bundle, "bundle"));
  });

  it("throws a clear error for an unknown declaration", () => {
    for (const stage of ["formal", "math", "classifier", "visual", "explain"] as Stage[]) {
      expect(() => stageJson(bundle, stage, "no_such_theorem")).toThrow(
        "No declaration named no_such_theorem.",
      );
    }
  });

  it("round-trips the bundle stage as the whole bundle", () => {
    const parsed = JSON.parse(stageJson(bundle, "bundle")) as PipelineBundle;
    expect(parsed.analyses).toHaveLength(CORPUS_DECLARATION_COUNT);
    expect(parsed.summary.declarations).toBe(CORPUS_DECLARATION_COUNT);
  });

  it("is deterministic", () => {
    for (const stage of STAGES) {
      expect(stageJson(bundle, stage)).toBe(stageJson(runPipeline(corpus()), stage));
    }
  });
});

// ---------------------------------------------------------------------------
// summarise
// ---------------------------------------------------------------------------

describe("summarise", () => {
  const text = summarise(bundle);

  it("reports the declaration count", () => {
    expect(text).toMatch(/declarations\s+35/);
    expect(text).toContain(`ProofLens ${bundle.prooflensVersion}`);
    expect(text).toContain("lean4");
  });

  it("reports every summary counter", () => {
    expect(text).toMatch(/structurally classified\s+34/);
    expect(text).toMatch(/unsupported structure\s+1/);
    expect(text).toMatch(/with unused hypotheses\s+2/);
    expect(text).toMatch(/proved with sorry\s+0/);
    expect(text).toMatch(/unusual axioms\s+0/);
    expect(text).toMatch(/figures planned\s+\d+/);
  });

  it("reports the modules and the notation fidelity", () => {
    expect(text).toContain("ProofLensExamples.Bounds");
    expect(text).toContain("notation fidelity: notation");
  });

  it("lists every declaration by its short name", () => {
    for (const analysis of bundle.analyses) {
      const short = analysis.math.name.split(".").pop()!;
      expect(text, short).toContain(short);
    }
  });

  it("lists a known declaration with its primary classification", () => {
    const line = text.split("\n").find((l) => l.trim().startsWith("simple_upper_bound"))!;
    expect(line).toBeDefined();
    expect(line).toContain("upper-bound");
    expect(line).toContain("unused hypotheses");
  });

  it("lists the new classifier kinds as primaries", () => {
    const line = (short: string) => text.split("\n").find((l) => l.trim().startsWith(short))!;
    expect(line("log_two_pos")).toContain("positivity");
    expect(line("switching_coefficient_ne_zero")).toContain("distinctness");
    expect(line("simple_lower_bound")).toContain("lower-bound");
  });

  it("lists a definition by its functional reading, which is what gets drawn", () => {
    for (const short of ["energyBudget", "landauerCost", "throughput"]) {
      const line = text.split("\n").find((l) => l.trim().startsWith(short))!;
      expect(line, short).toContain("functional-relationship");
    }
  });

  it("no longer flags switching_coefficient_ne_zero as unsupported", () => {
    const line = text
      .split("\n")
      .find((l) => l.trim().startsWith("switching_coefficient_ne_zero"))!;
    expect(line).not.toContain("unsupported");
  });

  it("flags the unsupported fixture", () => {
    const line = text.split("\n").find((l) => l.trim().startsWith("energy_cost_injective"))!;
    expect(line).toBeDefined();
    expect(line).toContain("unsupported");
  });

  it("lists the limit fixture by its classification rather than as unsupported", () => {
    const line = text.split("\n").find((l) => l.trim().startsWith("sequence_limit_example"))!;
    expect(line).toBeDefined();
    expect(line).toContain("limit");
    expect(line).not.toContain("unsupported");
  });

  it("does not flag a declaration whose hypotheses are all used", () => {
    const line = text.split("\n").find((l) => l.trim().startsWith("div_upper_bound"))!;
    expect(line).not.toContain("unused hypotheses");
    expect(line).not.toContain("NOT PROVED");
  });

  it("glosses each epistemic status in the histogram", () => {
    expect(text).toContain("figures by epistemic status:");
    expect(text).toContain("A display choice. It makes no mathematical claim.");
    expect(text).not.toContain("Checked by the Lean kernel.");
  });
});

// ---------------------------------------------------------------------------
// explainToText
// ---------------------------------------------------------------------------

describe("explainToText", () => {
  it("prints the name, every explanation layer and every classifier", () => {
    const analysis = findAnalysis(bundle, "simple_upper_bound")!;
    const text = explainToText(analysis);
    expect(text).toContain("ProofLens.Examples.simple_upper_bound");
    expect(text).toContain("CLASSIFIERS");
    for (const layer of analysis.explanations) {
      expect(text).toContain(layer.title.toUpperCase());
      expect(text).toContain(`[${layer.claim.status}]`);
    }
    for (const c of analysis.classifications) expect(text).toContain(c.rule.id);
  });

  it("prints a definition's body and its relationship diagram", () => {
    const text2 = explainToText(findAnalysis(bundle, "landauerCost")!);
    expect(text2).toContain("kB · T · log(2) / D");
    expect(text2).toContain("relationship-diagram");
    expect(text2).toContain("RELATION_FUNCTIONAL_001");
  });

  it("strips the ProofLens annotations from the documentation it prints", () => {
    const text = explainToText(findAnalysis(bundle, "simple_upper_bound")!);
    expect(text).not.toContain("@prooflens.var");
  });

  it("renders every declaration in the corpus without throwing", () => {
    for (const analysis of bundle.analyses) {
      expect(() => explainToText(analysis)).not.toThrow();
      expect(explainToText(analysis).length).toBeGreaterThan(0);
    }
  });
});
