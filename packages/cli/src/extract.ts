import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Driving Lean extraction.
 *
 * ProofLens runs its extractor **inside Lean's own frontend** rather than from a
 * standalone `importModules` binary. The `prooflens-extract` executable still
 * exists and does its best — it enables initialiser execution and configures
 * the pretty printer by hand — but reproducing everything the frontend sets up
 * is a moving target, and when it falls short expressions come back as
 * `LE.le x (HDiv.hDiv P T)` instead of `x ≤ P / T`.
 *
 * Rather than guess, the extractor *measures*: it pretty-prints a known
 * expression and reports the result as `notationFidelity` in the Formal IR. The
 * frontend path is the reference one because it is the only one guaranteed to
 * report `notation`. See ADR 0001.
 *
 * The generated driver is a few lines of Lean that import the target modules
 * and invoke the `#prooflens_export` command.
 */
export interface ExtractOptions {
  /** Lake project directory whose `lake env` provides the module search path. */
  project: string;
  modules: string[];
  outputPath: string;
  /** Extra arguments passed through to `lake`. */
  lakeArgs?: string[];
  onProgress?: (line: string) => void;
}

export function buildDriver(modules: readonly string[], outputPath: string): string {
  const imports = ["import ProofLens.Export", ...modules.map((m) => `import ${m}`)].join("\n");
  const escaped = outputPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${imports}\n\n#prooflens_export "${escaped}" ${modules.join(" ")}\n`;
}

export async function runExtraction(options: ExtractOptions): Promise<string> {
  if (options.modules.length === 0) {
    throw new Error("At least one Lean module must be given to extract.");
  }
  const project = resolve(options.project);
  const outputPath = resolve(options.outputPath);
  const scratch = await mkdtemp(join(tmpdir(), "prooflens-"));
  const driverPath = join(scratch, "ProofLensDriver.lean");

  try {
    await writeFile(driverPath, buildDriver(options.modules, outputPath), "utf8");
    await execute("lake", ["env", "lean", driverPath, ...(options.lakeArgs ?? [])], {
      cwd: project,
      onProgress: options.onProgress,
    });
    return await readFile(outputPath, "utf8");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function execute(
  command: string,
  args: string[],
  opts: { cwd: string; onProgress?: (line: string) => void },
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const forward = (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split("\n")) {
        if (line.trim() !== "") opts.onProgress?.(line);
      }
    };
    child.stdout.on("data", forward);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      forward(chunk);
    });
    child.on("error", (err) => {
      reject(
        new Error(`Could not run \`${command}\`. Is Lean installed and on PATH? (${err.message})`),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else
        reject(new Error(`\`${command} ${args.join(" ")}\` exited with code ${code}.\n${stderr}`));
    });
  });
}
