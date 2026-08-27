import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  findAnalysis,
  runPipelineOnJson,
  type PipelineBundle,
  type TheoremAnalysis,
} from "@prooflens/pipeline";
import { renderSvgDocument } from "@prooflens/renderer-svg";
import { renderText } from "@prooflens/renderer-text";
import { EPISTEMIC_GLOSS } from "@prooflens/epistemics";
import { runExtraction } from "./extract.js";

async function writeOut(path: string, contents: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), contents, "utf8");
}

export async function loadBundle(formalIrPath: string): Promise<PipelineBundle> {
  const text = await readFile(resolve(formalIrPath), "utf8");
  return runPipelineOnJson(text);
}

export interface ExtractCommandOptions {
  project: string;
  modules: string[];
  out: string;
  log: (line: string) => void;
}

export async function commandExtract(options: ExtractCommandOptions): Promise<void> {
  options.log(`Extracting ${options.modules.length} module(s) from ${options.project} …`);
  await runExtraction({
    project: options.project,
    modules: options.modules,
    outputPath: options.out,
    onProgress: (line) => options.log(`  lean: ${line}`),
  });
  const bundle = await loadBundle(options.out);
  options.log(`Wrote Formal IR for ${bundle.summary.declarations} declarations to ${options.out}`);
  if (bundle.generatedFrom.notationFidelity === "raw") {
    options.log(
      "  warning: notation delaborators were unavailable, so expressions are rendered as raw applications.",
    );
  }
}

/** Human-readable overview of an entire extraction. */
export function summarise(bundle: PipelineBundle): string {
  const s = bundle.summary;
  const lines: string[] = [];
  lines.push(
    `ProofLens ${bundle.prooflensVersion} — ${bundle.generatedFrom.system} (${bundle.generatedFrom.toolchain})`,
  );
  lines.push(`modules: ${bundle.generatedFrom.modules.join(", ")}`);
  lines.push(`notation fidelity: ${bundle.generatedFrom.notationFidelity}`);
  lines.push("");
  lines.push(`  declarations              ${s.declarations}`);
  lines.push(`  structurally classified   ${s.classified}`);
  lines.push(`  unsupported structure     ${s.unsupported}`);
  lines.push(`  with unused hypotheses    ${s.withUnusedHypotheses}`);
  lines.push(`  proved with sorry         ${s.withSorry}`);
  lines.push(`  unusual axioms            ${s.withUnusualAxioms}`);
  lines.push(`  figures planned           ${s.visualsPlanned}`);
  lines.push("");
  lines.push("  figures by epistemic status:");
  for (const [status, count] of Object.entries(s.epistemicHistogram).sort()) {
    lines.push(
      `    ${status.padEnd(13)} ${String(count).padStart(4)}  ${EPISTEMIC_GLOSS[status as keyof typeof EPISTEMIC_GLOSS] ?? ""}`,
    );
  }
  lines.push("");
  lines.push("declarations:");
  for (const analysis of bundle.analyses) {
    const short = analysis.math.name.split(".").pop() ?? analysis.math.name;
    const kind = analysis.primary?.payload.kind ?? "—";
    const flags: string[] = [];
    if (analysis.math.trust.usesSorry) flags.push("NOT PROVED");
    if (
      analysis.classifications.some(
        (c) =>
          c.payload.kind === "assumption-sensitivity" && c.payload.data.unusedInProof.length > 0,
      )
    )
      flags.push("unused hypotheses");
    if (analysis.unsupported) flags.push("unsupported");
    lines.push(
      `  ${short.padEnd(32)} ${kind.padEnd(24)} ${flags.length ? `[${flags.join(", ")}]` : ""}`,
    );
  }
  return lines.join("\n");
}

/** Full text report for one declaration: every explanation layer and figure. */
export function explainToText(analysis: TheoremAnalysis): string {
  const out: string[] = [];
  const rule = "=".repeat(78);
  out.push(rule);
  out.push(analysis.math.name);
  out.push(rule);
  if (analysis.math.documentation) {
    out.push(analysis.math.documentation.trim());
    out.push("");
  }
  for (const layer of analysis.explanations) {
    out.push(`${layer.title.toUpperCase()}  [${layer.claim.status}]`);
    for (const line of layer.claim.value.split("\n")) out.push(`  ${line}`);
    out.push("");
  }
  out.push("CLASSIFIERS");
  for (const c of analysis.classifications) {
    out.push(`  ${c.rule.id}  [${c.claim.status}]`);
    out.push(`    ${c.rationale}`);
  }
  out.push("");
  for (const visual of analysis.visuals) {
    out.push(renderText(visual));
    out.push("");
  }
  return out.join("\n");
}

export interface RenderCommandOptions {
  formalIr: string;
  declaration?: string;
  outDir: string;
  format: "svg" | "text" | "both";
  /**
   * Animate SVG figures as a proof progression (renderer option `animate`).
   * Text output is unaffected: a text figure has no frames to stage.
   */
  animate?: boolean;
  log: (line: string) => void;
}

/**
 * Encode a fully-qualified Lean declaration name as one portable file stem.
 *
 * The qualification is essential: different namespaces routinely generate
 * declarations with the same short name (`mk`, `rec`, `casesOn`, …). Using
 * only the final name component silently overwrote figures in large corpora.
 * Percent is encoded too, so this byte-wise encoding is reversible and cannot
 * create a second collision while escaping punctuation or Unicode.
 */
export function renderFileStem(declarationName: string): string {
  let stem = "";
  for (const byte of Buffer.from(declarationName, "utf8")) {
    const safe =
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      byte === 0x2d ||
      byte === 0x2e ||
      byte === 0x5f;
    stem += safe
      ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return stem;
}

export async function commandRender(options: RenderCommandOptions): Promise<void> {
  const bundle = await loadBundle(options.formalIr);
  const analyses = options.declaration
    ? [findAnalysis(bundle, options.declaration)].filter(
        (a): a is TheoremAnalysis => a !== undefined,
      )
    : bundle.analyses;

  if (analyses.length === 0) {
    throw new Error(
      `No declaration named ${options.declaration}. Run \`prooflens summary\` to list what is available.`,
    );
  }

  let written = 0;
  const destinations = new Set<string>();
  for (const analysis of analyses) {
    const declaration = renderFileStem(analysis.math.name);
    for (const visual of analysis.visuals) {
      const base = `${declaration}.${visual.type}`;
      if (options.format === "svg" || options.format === "both") {
        const destination = join(options.outDir, `${base}.svg`);
        if (destinations.has(destination)) {
          throw new Error(`Duplicate render destination: ${destination}`);
        }
        destinations.add(destination);
        await writeOut(
          destination,
          renderSvgDocument(visual, { animate: options.animate === true }),
        );
        written += 1;
      }
      if (options.format === "text" || options.format === "both") {
        const destination = join(options.outDir, `${base}.txt`);
        if (destinations.has(destination)) {
          throw new Error(`Duplicate render destination: ${destination}`);
        }
        destinations.add(destination);
        await writeOut(destination, renderText(visual));
        written += 1;
      }
    }
  }
  options.log(`Wrote ${written} file(s) to ${options.outDir}`);
}

export type Stage = "formal" | "math" | "classifier" | "visual" | "explain" | "bundle";

/**
 * Dump one pipeline stage.
 *
 * Invariant 10: every transformation stage must be inspectable. This is the
 * command that makes that true from a terminal.
 */
export function stageJson(bundle: PipelineBundle, stage: Stage, declaration?: string): string {
  if (stage === "bundle") return JSON.stringify(bundle, null, 2);
  if (!declaration) {
    switch (stage) {
      case "formal":
        return JSON.stringify(bundle.formal, null, 2);
      case "math":
        return JSON.stringify(bundle.math, null, 2);
      default:
        return JSON.stringify(
          bundle.analyses.map((a) => a[stageKey(stage)]),
          null,
          2,
        );
    }
  }
  const analysis = findAnalysis(bundle, declaration);
  if (!analysis) throw new Error(`No declaration named ${declaration}.`);
  switch (stage) {
    case "formal":
      return JSON.stringify(analysis.formal, null, 2);
    case "math":
      return JSON.stringify(analysis.math, null, 2);
    case "classifier":
      return JSON.stringify(analysis.classifications, null, 2);
    case "visual":
      return JSON.stringify(analysis.visuals, null, 2);
    case "explain":
      return JSON.stringify(analysis.explanations, null, 2);
  }
}

function stageKey(stage: Stage): "classifications" | "visuals" | "explanations" {
  if (stage === "classifier") return "classifications";
  if (stage === "visual") return "visuals";
  return "explanations";
}

export { findAnalysis, renderSvgDocument, renderText };
