/**
 * Verifies the exact data path the UI depends on:
 *   corpus JSON -> runPipelineOnValue -> 35 analyses -> renderSvg -> "<svg ..."
 *
 * Bundles the workspace packages from source with the same alias Vite uses,
 * so this exercises the code the browser bundle will actually contain.
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");

const alias = {
  name: "prooflens-src-alias",
  setup(b) {
    b.onResolve({ filter: /^@prooflens\// }, (args) => ({
      path: join(repo, "packages", args.path.replace("@prooflens/", ""), "src", "index.ts"),
    }));
  },
};

// Both files live inside the app, so bare imports such as `react-dom/server`
// resolve against apps/web/node_modules exactly as they do in the real build.
const out = join(here, "..", ".verify-bundle.mjs");
const entry = join(here, "..", ".verify-entry.tsx");
writeFileSync(
  entry,
  [
    `export { runPipeline, runPipelineOnValue, findAnalysis } from "@prooflens/pipeline";`,
    `export { previewLeanSource, importFormalIR } from "@prooflens/formal-ir";`,
    `export { renderSvg } from "@prooflens/renderer-svg";`,
    // Also pull in the panels themselves, so a component that throws on real
    // corpus data fails here rather than as a blank page in the browser.
    `export { renderToStaticMarkup } from "react-dom/server";`,
    `export { VisualizationPanel } from "${join(here, "..", "src", "components", "VisualizationPanel.js")}";`,
    `export { InterpretationPanel } from "${join(here, "..", "src", "components", "InterpretationPanel.js")}";`,
    `export { FormalPanel } from "${join(here, "..", "src", "components", "FormalPanel.js")}";`,
    `export { ProvenanceTable } from "${join(here, "..", "src", "components", "ProvenanceTable.js")}";`,
    `export { SummaryStrip } from "${join(here, "..", "src", "components", "SummaryStrip.js")}";`,
    `export { SeymourExplorer } from "${join(here, "..", "src", "components", "SeymourExplorer.js")}";`,
    `export { TorchLeanPanel } from "${join(here, "..", "src", "components", "TorchLeanPanel.js")}";`,
    "",
  ].join("\n"),
);
let buildError = null;
try {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    // React stays external and is loaded by node from apps/web/node_modules;
    // only the ProofLens packages and the components are bundled from source.
    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server"],
    outfile: out,
    plugins: [alias],
    logLevel: "error",
  });
} catch (error) {
  buildError = error;
} finally {
  rmSync(entry, { force: true });
}
if (buildError) throw buildError;

const {
  runPipeline,
  previewLeanSource,
  importFormalIR,
  runPipelineOnValue,
  findAnalysis,
  renderSvg,
  renderToStaticMarkup,
  VisualizationPanel,
  InterpretationPanel,
  FormalPanel,
  ProvenanceTable,
  SummaryStrip,
  SeymourExplorer,
  TorchLeanPanel,
} = await import(pathToFileURL(out).href);
rmSync(out, { force: true });
const { createElement } = await import("react");

const corpus = JSON.parse(
  readFileSync(join(here, "..", "public", "corpus.formal-ir.json"), "utf8"),
);
const bundle = runPipelineOnValue(corpus);

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

check("bundle has 35 analyses", bundle.analyses.length === 35, `got ${bundle.analyses.length}`);
check(
  "summary.declarations === 35",
  bundle.summary.declarations === 35,
  `classified=${bundle.summary.classified} unsupported=${bundle.summary.unsupported} unusedHyps=${bundle.summary.withUnusedHypotheses} sorry=${bundle.summary.withSorry} visuals=${bundle.summary.visualsPlanned}`,
);

const sub = findAnalysis(bundle, "simple_upper_bound");
check(
  "findAnalysis('simple_upper_bound') resolves",
  Boolean(sub),
  sub ? sub.math.name : "not found",
);
check(
  "simple_upper_bound has >= 1 visual",
  Boolean(sub) && sub.visuals.length > 0,
  sub ? `${sub.visuals.length} visual(s): ${sub.visuals.map((v) => v.type).join(", ")}` : "",
);

const svg = sub && sub.visuals[0] ? renderSvg(sub.visuals[0], { theme: "auto" }) : "";
check(
  "renderSvg returns a string starting with '<svg'",
  typeof svg === "string" && svg.startsWith("<svg"),
  `${typeof svg}, ${svg.length} chars, head=${JSON.stringify(svg.slice(0, 48))}`,
);

const everyAnalysisRenders = bundle.analyses.every((a) =>
  a.visuals.every((v) => renderSvg(v, { theme: "auto" }).startsWith("<svg")),
);
check(
  "every planned visual in the corpus renders",
  everyAnalysisRenders,
  `${bundle.summary.visualsPlanned} figures`,
);

check(
  "every explanation layer carries an epistemic status",
  bundle.analyses.every((a) => a.explanations.every((l) => typeof l.claim.status === "string")),
);

// --- component smoke render ------------------------------------------------
let renderFailure = null;
let markupChars = 0;
for (const analysis of bundle.analyses) {
  try {
    for (let i = 0; i < Math.max(1, analysis.visuals.length); i += 1) {
      markupChars += renderToStaticMarkup(
        createElement(VisualizationPanel, {
          analysis,
          activeIndex: i,
          onSelectIndex: () => {},
        }),
      ).length;
      markupChars += renderToStaticMarkup(
        createElement(ProvenanceTable, { spec: analysis.visuals[i] }),
      ).length;
    }
    markupChars += renderToStaticMarkup(createElement(InterpretationPanel, { analysis })).length;
    markupChars += renderToStaticMarkup(createElement(FormalPanel, { analysis })).length;
  } catch (error) {
    renderFailure = `${analysis.math.name}: ${error instanceof Error ? error.message : String(error)}`;
    break;
  }
}
markupChars += renderToStaticMarkup(createElement(SummaryStrip, { bundle })).length;
check(
  "every panel renders for all 35 declarations",
  renderFailure === null,
  renderFailure ?? `${markupChars.toLocaleString()} chars of markup`,
);

const subMarkup = sub
  ? renderToStaticMarkup(
      createElement(VisualizationPanel, { analysis: sub, activeIndex: 1, onSelectIndex: () => {} }),
    )
  : "";
check(
  "the figure panel embeds the rendered SVG and its rationale",
  subMarkup.includes("<svg") && subMarkup.includes("Why this figure"),
);

const incompleteCorpus = structuredClone(corpus);
const incompleteBound = incompleteCorpus.declarations.find((declaration) =>
  declaration.name.endsWith(".information_rate_bound"),
);
incompleteBound.usesSorry = true;
incompleteBound.axioms.push("sorryAx");
const conjecture = findAnalysis(runPipelineOnValue(incompleteCorpus), "information_rate_bound");
const conjectureMarkup = renderToStaticMarkup(
  createElement(VisualizationPanel, {
    analysis: conjecture,
    activeIndex: 0,
    onSelectIndex: () => {},
  }),
);
check(
  "an unproved bound keeps its interactive explanation without a verified equation story",
  conjectureMarkup.includes("Unproved statement") &&
    conjectureMarkup.includes('type="range"') &&
    !conjectureMarkup.includes("Lean verifies") &&
    !conjectureMarkup.includes("proof-story__trust--verified"),
);

// A display-only strict variant exercises the comparator without changing the source corpus.
const strictBound = structuredClone(findAnalysis(bundle, "information_rate_bound"));
strictBound.semanticScene.scene.strict = true;
const strictMarkup = renderToStaticMarkup(
  createElement(VisualizationPanel, {
    analysis: strictBound,
    activeIndex: 0,
    onSelectIndex: () => {},
  }),
);
check(
  "equation anatomy preserves a strict comparator",
  strictMarkup.includes('class="equation-anatomy__relation">&lt;</span>'),
);

const paperSource = ["ShadowPrice", "InverseSquare", "ShadowPriceLevelCurves", "SLSPTTowerOrdering"]
  .map((name) =>
    readFileSync(
      join(repo, "packages/pipeline/test/fixtures/viridis-run026", `${name}.lean`),
      "utf8",
    ),
  )
  .join("\n\n");
const paper = runPipeline(previewLeanSource(paperSource).document);
check(
  "all 19 Viridis source statements render numerical experiments with controls and exports",
  paper.analyses.length === 19 &&
    paper.analyses.every((analysis) => {
      const markup = renderToStaticMarkup(
        createElement(VisualizationPanel, { analysis, activeIndex: 0, onSelectIndex: () => {} }),
      );
      return (
        markup.includes("Numerical illustration") &&
        markup.includes("Save explanation") &&
        markup.includes('type="number"') &&
        markup.includes("Numerical plot:")
      );
    }),
);
check(
  "uploaded extraction metadata never yields a verified statement",
  runPipeline(importFormalIR(JSON.stringify(corpus))).analyses.every(
    (a) =>
      a.math.ceiling !== "verified" && a.explanations.every((e) => e.claim.status !== "verified"),
  ),
);

const seymourMarkup = renderToStaticMarkup(createElement(SeymourExplorer));
check(
  "Seymour explorer renders the default cycle with exact sets and source pin",
  seymourMarkup.includes("{ 1 }") &&
    seymourMarkup.includes("{ 2 }") &&
    seymourMarkup.includes("Vertex 0 qualifies") &&
    seymourMarkup.includes("adc7f1241b42e322a6451854ab7e4b4c146bf78a"),
);
check(
  "Seymour explorer exposes keyboard controls and example export",
  seymourMarkup.includes('role="button" tabindex="0"') &&
    seymourMarkup.includes('aria-label="Pair 0 and 1:') &&
    seymourMarkup.includes("Save this example"),
);
check(
  "Seymour explorer distinguishes definitions and finite tests from the released proof",
  seymourMarkup.includes("Finite example explorer.") &&
    seymourMarkup.includes("does not prove the general conjecture") &&
    seymourMarkup.includes("has not checked the separate released solution") &&
    seymourMarkup.includes("4.34.1"),
);

const torchLeanMarkup = renderToStaticMarkup(createElement(TorchLeanPanel));
check("the bundled TorchLean panel binds the witnessed 360-example certificate",
  torchLeanMarkup.includes("CONCRETE APPLICATION · VERIFIED") &&
    torchLeanMarkup.includes("zero sorry · 360 source examples") &&
    !torchLeanMarkup.includes("The receipt has no matching trusted Formal IR"));
check("the TorchLean panel preserves the exact-decimal and floating-point claim boundary",
  torchLeanMarkup.includes("JSON decimal tokens") &&
    torchLeanMarkup.includes("IEEE/PyTorch") &&
    torchLeanMarkup.includes("remains unproved"));

console.log("\nsummary:", JSON.stringify(bundle.summary, null, 2));

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) FAILED`);
  process.exit(1);
}
console.log(`\nall ${checks.length} checks passed`);
