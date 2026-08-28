#!/usr/bin/env node
/**
 * The `prooflens` command.
 *
 * Hand-rolled argument parsing, on purpose: a CLI with six subcommands does not
 * justify a dependency, and "minimal dependencies" is one of this project's
 * stated development rules.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  commandExtract,
  commandRender,
  explainToText,
  loadBundle,
  stageJson,
  summarise,
  type Stage,
} from "./commands.js";
import { coverageReport, findAnalysis } from "@prooflens/pipeline";
import { parseFormalIRJson } from "@prooflens/formal-ir";
import {
  compilePaperPacket,
  formatPaperPacketSummary,
  paperOutputPacket,
} from "@prooflens/paper-packet";
import { renderCoverageMarkdown, renderCoverageText } from "./coverage-report.js";

const USAGE = `prooflens — visual interpretability for formal mathematics

USAGE
  prooflens extract  --project <dir> --module <Mod> [--module <Mod> ...] [--out <file>]
  prooflens summary  <formal-ir.json>
  prooflens explain  <formal-ir.json> <declaration>
  prooflens render   <formal-ir.json> [declaration] [--out-dir <dir>] [--format svg|text|both] [--animate]
  prooflens coverage <formal-ir.json> [--format text|markdown|json] [--out <file>]
  prooflens inspect  <formal-ir.json> [declaration] --stage formal|math|classifier|visual|explain|bundle [--out <file>]
  prooflens paper-import <paper-packet.json> [--formal-ir <formal-ir.json>] [--out <file>]
  prooflens pipeline --project <dir> --module <Mod> [...] [--out-dir <dir>]

COMMANDS
  extract   Run the Lean extractor and write Formal IR. Requires Lean and Lake
            on PATH, and a Lake project that depends on the prooflens library.
  summary   Show every extracted declaration, its classification, and any
            warnings (unused hypotheses, sorry, unusual axioms).
  explain   Print the layered explanation and text figures for one declaration.
  render    Write SVG and/or text figures to disk. With --animate, SVG figures
            animate as a proof progression — elements appear in dependency
            order, ending on exactly the static figure; text output is
            unaffected, and prefers-reduced-motion disables the animation.
  coverage  Measure what fraction of a body of mathematics ProofLens can read,
            and print a ranked backlog of what would improve it.
  inspect   Dump one pipeline stage as JSON. Every stage is inspectable.
  paper-import Validate a research-paper claim packet, match certificate-required
            claims against hash-bound Formal IR, and emit a portable output packet.
  pipeline  extract, then render everything, in one step.

Declarations may be given by full name or by their final component.
`;

interface Parsed {
  command: string | undefined;
  positional: string[];
  flags: Map<string, string[]>;
}

function parse(argv: string[]): Parsed {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      const value = next !== undefined && !next.startsWith("--") ? ((i += 1), next) : "true";
      const existing = flags.get(key) ?? [];
      existing.push(value);
      flags.set(key, existing);
    } else {
      positional.push(token);
    }
  }
  return { command, positional, flags };
}

function one(flags: Map<string, string[]>, key: string): string | undefined {
  return flags.get(key)?.[0];
}

function requirePositional(parsed: Parsed, index: number, what: string): string {
  const value = parsed.positional[index];
  if (value === undefined) {
    throw new Error(`Missing ${what}.\n\n${USAGE}`);
  }
  return value;
}

async function main(argv: string[]): Promise<number> {
  const parsed = parse(argv);
  const log = (line: string) => process.stderr.write(`${line}\n`);

  if (parsed.command === undefined || parsed.command === "help" || parsed.flags.has("help")) {
    process.stdout.write(USAGE);
    return 0;
  }

  switch (parsed.command) {
    case "extract": {
      const project = one(parsed.flags, "project");
      const modules = parsed.flags.get("module") ?? [];
      if (!project) throw new Error(`--project is required.\n\n${USAGE}`);
      if (modules.length === 0) throw new Error(`At least one --module is required.\n\n${USAGE}`);
      const out = one(parsed.flags, "out") ?? "prooflens.formal-ir.json";
      await commandExtract({ project, modules, out, log });
      return 0;
    }

    case "summary": {
      const bundle = await loadBundle(requirePositional(parsed, 0, "path to Formal IR JSON"));
      process.stdout.write(`${summarise(bundle)}\n`);
      return 0;
    }

    case "explain": {
      const bundle = await loadBundle(requirePositional(parsed, 0, "path to Formal IR JSON"));
      const name = requirePositional(parsed, 1, "declaration name");
      const analysis = findAnalysis(bundle, name);
      if (!analysis) {
        throw new Error(`No declaration named ${name}. Try \`prooflens summary\` to see the list.`);
      }
      process.stdout.write(`${explainToText(analysis)}\n`);
      return 0;
    }

    case "render": {
      const formalIr = requirePositional(parsed, 0, "path to Formal IR JSON");
      const format = (one(parsed.flags, "format") ?? "both") as "svg" | "text" | "both";
      if (!["svg", "text", "both"].includes(format)) {
        throw new Error(`--format must be svg, text, or both (got ${format}).`);
      }
      await commandRender({
        formalIr,
        declaration: parsed.positional[1],
        outDir: one(parsed.flags, "out-dir") ?? "prooflens-figures",
        format,
        animate: parsed.flags.has("animate"),
        log,
      });
      return 0;
    }

    case "coverage": {
      const bundle = await loadBundle(requirePositional(parsed, 0, "path to Formal IR JSON"));
      const report = coverageReport(bundle);
      const format = one(parsed.flags, "format") ?? "text";
      const rendered =
        format === "json"
          ? JSON.stringify(report, null, 2)
          : format === "markdown"
            ? renderCoverageMarkdown(report)
            : format === "text"
              ? renderCoverageText(report)
              : null;
      if (rendered === null) {
        throw new Error(`--format must be text, markdown, or json (got ${format}).`);
      }
      const out = one(parsed.flags, "out");
      if (out) {
        await writeFile(resolve(out), `${rendered}\n`, "utf8");
        log(`Wrote coverage report to ${out}`);
      } else {
        process.stdout.write(`${rendered}\n`);
      }
      return 0;
    }

    case "inspect": {
      const bundle = await loadBundle(requirePositional(parsed, 0, "path to Formal IR JSON"));
      const stage = (one(parsed.flags, "stage") ?? "bundle") as Stage;
      const valid: Stage[] = ["formal", "math", "classifier", "visual", "explain", "bundle"];
      if (!valid.includes(stage)) {
        throw new Error(`--stage must be one of ${valid.join(", ")} (got ${stage}).`);
      }
      const json = stageJson(bundle, stage, parsed.positional[1]);
      const out = one(parsed.flags, "out");
      if (out) {
        await writeFile(resolve(out), `${json}\n`, "utf8");
        log(`Wrote ${stage} stage to ${out}`);
      } else {
        process.stdout.write(`${json}\n`);
      }
      return 0;
    }

    case "paper-import": {
      const packetPath = resolve(requirePositional(parsed, 0, "path to paper packet JSON"));
      const packetText = await readFile(packetPath, "utf8");
      let packetValue: unknown;
      try {
        packetValue = JSON.parse(packetText) as unknown;
      } catch (error) {
        throw new Error(
          `Paper packet is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const formalIrPath = one(parsed.flags, "formal-ir");
      const formalIrText = formalIrPath ? await readFile(resolve(formalIrPath), "utf8") : null;
      const result = compilePaperPacket(packetValue, {
        ...(formalIrText
          ? {
              trustedFormalIr: {
                document: parseFormalIRJson(formalIrText),
                sha256: createHash("sha256").update(formalIrText).digest("hex"),
              },
            }
          : {}),
      });
      if (result.status === "blocked") {
        throw new Error(`Paper packet blocked (${result.code}): ${result.reason}`);
      }
      const out = one(parsed.flags, "out");
      if (out) {
        await writeFile(
          resolve(out),
          `${JSON.stringify(paperOutputPacket(result.scene), null, 2)}\n`,
        );
        log(`Wrote validated paper output packet to ${out}`);
      }
      process.stdout.write(`${formatPaperPacketSummary(result.scene)}\n`);
      return result.scene.gate === "READY" ? 0 : 3;
    }

    case "pipeline": {
      const project = one(parsed.flags, "project");
      const modules = parsed.flags.get("module") ?? [];
      if (!project) throw new Error(`--project is required.\n\n${USAGE}`);
      if (modules.length === 0) throw new Error(`At least one --module is required.\n\n${USAGE}`);
      const outDir = one(parsed.flags, "out-dir") ?? "prooflens-out";
      const formalIr = `${outDir}/formal-ir.json`;
      await commandExtract({ project, modules, out: formalIr, log });
      await commandRender({ formalIr, outDir: `${outDir}/figures`, format: "both", log });
      const bundle = await loadBundle(formalIr);
      await writeFile(`${outDir}/bundle.json`, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
      log(`Wrote full pipeline bundle to ${outDir}/bundle.json`);
      process.stdout.write(`${summarise(bundle)}\n`);
      return 0;
    }

    default:
      process.stderr.write(`Unknown command \`${parsed.command}\`.\n\n${USAGE}`);
      return 2;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
