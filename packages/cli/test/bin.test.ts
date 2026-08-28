/**
 * The `bin.ts` command surface.
 *
 * `bin.ts` runs `main(process.argv)` on import, so it cannot simply be imported.
 * These tests bundle it with esbuild — aliasing `@prooflens/*` to the sources,
 * exactly as `vitest.config.ts` does — and run the result in a child process.
 * That keeps the test self-contained: it needs no prior `tsc -b`, no Lean and
 * no network.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS_PATH } from "../../pipeline/test/helpers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGES = resolve(HERE, "../..");
const PAPER_PACKET_PATH = resolve(
  HERE,
  "../../../examples/viridis-intelligence-bound.paper-packet.json",
);

let cliPath: string;

beforeAll(async () => {
  const result = await esbuild.build({
    entryPoints: [resolve(PACKAGES, "cli/src/bin.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
    plugins: [
      {
        name: "prooflens-alias",
        setup(build) {
          build.onResolve({ filter: /^@prooflens\// }, (args) => ({
            path: join(PACKAGES, `${args.path.slice("@prooflens/".length)}/src/index.ts`),
          }));
        },
      },
    ],
  });
  cliPath = join(mkdtempSync(join(tmpdir(), "prooflens-cli-")), "bin.mjs");
  writeFileSync(cliPath, result.outputFiles[0]!.text, "utf8");
}, 30_000);

function run(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("prooflens coverage", () => {
  it("defaults to the text renderer", () => {
    const result = run("coverage", CORPUS_PATH);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ProofLens coverage");
    expect(result.stdout).toContain("97.1%");
  });

  it("accepts --format text", () => {
    const result = run("coverage", CORPUS_PATH, "--format", "text");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("BACKLOG 1");
  });

  it("accepts --format markdown", () => {
    const result = run("coverage", CORPUS_PATH, "--format", "markdown");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# ProofLens coverage report");
    expect(result.stdout).toContain("| Fully readable |");
  });

  it("accepts --format json and emits a parseable report", () => {
    const result = run("coverage", CORPUS_PATH, "--format", "json");
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { totals: { declarations: number } };
    expect(parsed.totals.declarations).toBe(35);
  });

  it("rejects an unknown --format, naming the ones it accepts", () => {
    const result = run("coverage", CORPUS_PATH, "--format", "yaml");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--format must be text, markdown, or json");
    expect(result.stderr).toContain("got yaml");
    expect(result.stdout).toBe("");
  });

  it("rejects an unknown --format before writing anything to --out", () => {
    const out = join(mkdtempSync(join(tmpdir(), "prooflens-out-")), "report.md");
    const result = run("coverage", CORPUS_PATH, "--format", "xml", "--out", out);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--format must be text, markdown, or json");
  });

  it("rejects a bare --format with no value", () => {
    // The parser turns a valueless flag into "true", which is not a format.
    const result = run("coverage", CORPUS_PATH, "--format");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--format must be text, markdown, or json");
  });

  it("reports a missing Formal IR path rather than crashing", () => {
    const result = run("coverage");
    expect(result.status).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("is deterministic across runs", () => {
    expect(run("coverage", CORPUS_PATH, "--format", "markdown").stdout).toBe(
      run("coverage", CORPUS_PATH, "--format", "markdown").stdout,
    );
  });
});

describe("prooflens render --animate", () => {
  function renderTo(...extra: string[]): { dir: string; svgs: string[] } {
    const dir = mkdtempSync(join(tmpdir(), "prooflens-render-"));
    const result = run(
      "render",
      CORPUS_PATH,
      "sequence_limit_example",
      "--format",
      "svg",
      "--out-dir",
      dir,
      ...extra,
    );
    expect(result.status).toBe(0);
    const svgs = readdirSync(dir)
      .filter((f) => f.endsWith(".svg"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"));
    expect(svgs.length).toBeGreaterThan(0);
    return { dir, svgs };
  }

  it("adds the CSS proof animation to every SVG figure", () => {
    const { svgs } = renderTo("--animate");
    // Every figure of an animatable type carries keyframes, a delay
    // progression, and the reduced-motion override.
    const animated = svgs.filter((svg) => svg.includes("@keyframes"));
    expect(animated.length).toBeGreaterThan(0);
    for (const svg of animated) {
      expect(svg).toContain("animation-delay:");
      expect(svg).toContain("@media (prefers-reduced-motion:reduce)");
      expect(svg).toContain("Order of appearance");
    }
  });

  it("renders statically without the flag", () => {
    const { svgs } = renderTo();
    for (const svg of svgs) {
      expect(svg).not.toContain("@keyframes");
      expect(svg).not.toContain("pl-anim-");
    }
  });

  it("leaves text output untouched by --animate", () => {
    const dir = mkdtempSync(join(tmpdir(), "prooflens-render-"));
    const result = run(
      "render",
      CORPUS_PATH,
      "simple_upper_bound",
      "--format",
      "text",
      "--out-dir",
      dir,
      "--animate",
    );
    expect(result.status).toBe(0);
    const texts = readdirSync(dir).filter((f) => f.endsWith(".txt"));
    expect(texts.length).toBeGreaterThan(0);
    for (const file of texts) {
      expect(readFileSync(join(dir, file), "utf8")).not.toContain("@keyframes");
    }
  });
});

describe("prooflens paper-import", () => {
  it("emits a READY output packet when the claim matches trusted Formal IR", () => {
    const out = join(mkdtempSync(join(tmpdir(), "prooflens-paper-")), "output.json");
    const result = run("paper-import", PAPER_PACKET_PATH, "--formal-ir", CORPUS_PATH, "--out", out);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PACKAGE READY");
    expect(result.stdout).toContain("VERIFIED 1");
    const output = JSON.parse(readFileSync(out, "utf8")) as {
      format: string;
      gate: string;
    };
    expect(output).toMatchObject({
      format: "prooflens_paper_output_v0_1",
      gate: "READY",
    });
  });

  it("returns the distinct HOLD exit code without trusted Formal IR", () => {
    const result = run("paper-import", PAPER_PACKET_PATH);
    expect(result.status).toBe(3);
    expect(result.stdout).toContain("PACKAGE HOLD");
    expect(result.stdout).toContain("CERTIFICATE DEBT 1");
  });
});

describe("prooflens usage", () => {
  it("lists the coverage and paper import commands in its usage text", () => {
    const result = run("not-a-command");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("prooflens coverage");
    expect(result.stderr).toContain("prooflens paper-import");
    expect(result.stderr).toContain("Unknown command");
  });

  it("documents --animate on the render command", () => {
    const result = run("help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--animate");
  });
});
