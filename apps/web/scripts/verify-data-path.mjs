/**
 * Verifies the exact data path the UI depends on:
 *   corpus JSON -> runPipelineOnValue -> 34 analyses -> renderSvg -> "<svg ..."
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
    `export { runPipelineOnValue, findAnalysis } from "@prooflens/pipeline";`,
    `export { renderSvg } from "@prooflens/renderer-svg";`,
    // Also pull in the panels themselves, so a component that throws on real
    // corpus data fails here rather than as a blank page in the browser.
    `export { renderToStaticMarkup } from "react-dom/server";`,
    `export { VisualizationPanel } from "${join(here, "..", "src", "components", "VisualizationPanel.js")}";`,
    `export { InterpretationPanel } from "${join(here, "..", "src", "components", "InterpretationPanel.js")}";`,
    `export { FormalPanel } from "${join(here, "..", "src", "components", "FormalPanel.js")}";`,
    `export { ProvenanceTable } from "${join(here, "..", "src", "components", "ProvenanceTable.js")}";`,
    `export { SummaryStrip } from "${join(here, "..", "src", "components", "SummaryStrip.js")}";`,
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
  runPipelineOnValue,
  findAnalysis,
  renderSvg,
  renderToStaticMarkup,
  VisualizationPanel,
  InterpretationPanel,
  FormalPanel,
  ProvenanceTable,
  SummaryStrip,
} = await import(pathToFileURL(out).href);
rmSync(out, { force: true });
const { createElement } = await import("react");

const corpus = JSON.parse(readFileSync(join(here, "..", "public", "corpus.formal-ir.json"), "utf8"));
const bundle = runPipelineOnValue(corpus);

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

check("bundle has 34 analyses", bundle.analyses.length === 34, `got ${bundle.analyses.length}`);
check(
  "summary.declarations === 34",
  bundle.summary.declarations === 34,
  `classified=${bundle.summary.classified} unsupported=${bundle.summary.unsupported} unusedHyps=${bundle.summary.withUnusedHypotheses} sorry=${bundle.summary.withSorry} visuals=${bundle.summary.visualsPlanned}`,
);

const sub = findAnalysis(bundle, "simple_upper_bound");
check("findAnalysis('simple_upper_bound') resolves", Boolean(sub), sub ? sub.math.name : "not found");
check("simple_upper_bound has >= 1 visual", Boolean(sub) && sub.visuals.length > 0, sub ? `${sub.visuals.length} visual(s): ${sub.visuals.map((v) => v.type).join(", ")}` : "");

const svg = sub && sub.visuals[0] ? renderSvg(sub.visuals[0], { theme: "auto" }) : "";
check(
  "renderSvg returns a string starting with '<svg'",
  typeof svg === "string" && svg.startsWith("<svg"),
  `${typeof svg}, ${svg.length} chars, head=${JSON.stringify(svg.slice(0, 48))}`,
);

const everyAnalysisRenders = bundle.analyses.every((a) =>
  a.visuals.every((v) => renderSvg(v, { theme: "auto" }).startsWith("<svg")),
);
check("every planned visual in the corpus renders", everyAnalysisRenders, `${bundle.summary.visualsPlanned} figures`);

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
  "every panel renders for all 34 declarations",
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

console.log("\nsummary:", JSON.stringify(bundle.summary, null, 2));

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) FAILED`);
  process.exit(1);
}
console.log(`\nall ${checks.length} checks passed`);
