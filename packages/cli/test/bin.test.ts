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
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS_PATH } from "../../pipeline/test/helpers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGES = resolve(HERE, "../..");

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

describe("prooflens usage", () => {
  it("lists the coverage command in its usage text", () => {
    const result = run("not-a-command");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("prooflens coverage");
    expect(result.stderr).toContain("Unknown command");
  });
});
