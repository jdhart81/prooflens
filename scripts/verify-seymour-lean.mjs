#!/usr/bin/env node
/**
 * Reproduce the Seymour definition correspondence check without downloading
 * dependencies, installing toolchains, or adding the target to our corpus.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = join(root, "corpus");
const example = join(root, "examples/openai-math/seymour");
const targetName = "ComparatorChallenges/SeymourSecondNeighborhood.lean";
const expectedTargetSha256 = "fa4a37831405b3fe7f6a88a2dce8918982195ee1757e05e4623055822d36ca98";
const expectedTargetGitBlob = "70d287c3f831d0698352b144d39cdf29cac6c24b";
const expectedMathlibRevision = "f897ebcf72cd16f89ab4577d0c826cd14afaafc7";
const expectedToolchain = "leanprover/lean4:v4.24.0";
const allowedAxioms = new Set(["propext", "Classical.choice", "Quot.sound"]);
const expectedProofs = [
  "firstNeighbors_eq_upstream",
  "secondNeighbors_eq_upstream",
  "neighborhood_card_eq_upstream",
  "goodVertex_iff_upstream",
  "secondNeighbors_excludes_origin",
  "secondNeighbors_excludes_first",
  "path3_oriented",
  "cycle3_oriented",
  "diamond4_oriented",
  "shortcut3_oriented",
  "overlap4_oriented",
  "sink_fixture",
  "cycle_fixture",
  "multiple_paths_fixture",
  "direct_edge_exclusion_fixture",
  "overlap_fixture",
  "two_cycle_origin_exclusion_fixture",
  "two_cycle_fails_orientation",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--receipt")) {
  console.error("Usage: node scripts/verify-seymour-lean.mjs [--receipt path.json]");
  process.exit(2);
}
const scratch = mkdtempSync(join(realpathSync(tmpdir()), "prooflens-seymour-"));
const receiptPath = args.length === 2 ? resolve(args[1]) : `${scratch}.receipt.json`;
const receipt = {
  result: "FAIL",
  checkedAtUtc: new Date().toISOString(),
  verifierSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  upstream: {
    repository: "openai/math",
    revision: "adc7f1241b42e322a6451854ab7e4b4c146bf78a",
    source: `lean/${targetName}`,
    targetSha256: expectedTargetSha256,
    targetGitBlob: expectedTargetGitBlob,
  },
  scope:
    "Computable Lean neighbor sets, counts, and good-vertex classification agree with exact upstream target definitions. This checks a specification, not the TypeScript implementation, the general conjecture, or the released solution. Alternate Lean/mathlib 4.24 compatibility run; upstream Lean 4.34.1 is not reproduced.",
  compilation: {},
};

try {
  const targetBytes = readFileSync(join(example, targetName));
  const targetGitBlob = createHash("sha1")
    .update(Buffer.from(`blob ${targetBytes.length}\0`))
    .update(targetBytes)
    .digest("hex");
  if (hash(targetBytes) !== expectedTargetSha256 || targetGitBlob !== expectedTargetGitBlob) {
    throw new Error("Vendored upstream target does not match its pinned source bytes.");
  }
  const sceneBytes = readFileSync(join(example, "SeymourScene.lean"));
  if (/\b(?:sorry|admit|axiom|native_decide)\b/u.test(sceneBytes.toString("utf8"))) {
    throw new Error(
      "Own check source contains a prohibited proof placeholder, axiom, or native evaluation.",
    );
  }
  receipt.checkModule = {
    source: "examples/openai-math/seymour/SeymourScene.lean",
    sha256: hash(sceneBytes),
  };
  const toolchain = readFileSync(join(corpus, "lean-toolchain"), "utf8").trim();
  if (toolchain !== expectedToolchain) {
    throw new Error(`This check requires the corpus pin ${expectedToolchain}; found ${toolchain}.`);
  }
  const manifestBytes = readFileSync(join(corpus, "lake-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const mathlib = manifest.packages.find((pkg) => pkg.name === "mathlib");
  if (mathlib?.rev !== expectedMathlibRevision || mathlib.inputRev !== "v4.24.0") {
    throw new Error("Corpus mathlib manifest does not match the pinned v4.24.0 revision.");
  }
  receipt.dependencies = {
    toolchainPin: toolchain,
    mathlibRevision: mathlib.rev,
    manifestSha256: hash(manifestBytes),
  };
  const mathlibDirectory = join(corpus, ".lake/packages/mathlib");
  const cachedMathlib = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: mathlibDirectory,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (cachedMathlib.status !== 0 || cachedMathlib.stdout.trim() !== expectedMathlibRevision) {
    throw new Error("Cached mathlib checkout does not match the pinned manifest revision.");
  }
  receipt.dependencies.cachedMathlibRevision = cachedMathlib.stdout.trim();
  receipt.dependencies.cachedImportedModules = {};
  for (const file of ["Mathlib/Data/Fintype/Card.olean", "Mathlib/Data/Finset/Union.olean"]) {
    const moduleFile = join(mathlibDirectory, ".lake/build/lib/lean", file);
    if (!existsSync(moduleFile)) {
      throw new Error(
        "Cached mathlib artifacts are missing. Prepare the corpus dependencies before this offline check.",
      );
    }
    receipt.dependencies.cachedImportedModules[file] = hash(readFileSync(moduleFile));
  }
  const elanDirectory = process.env.ELAN_HOME ?? join(homedir(), ".elan");
  const toolchainBin = join(elanDirectory, "toolchains/leanprover--lean4---v4.24.0/bin");
  const lake = join(toolchainBin, process.platform === "win32" ? "lake.exe" : "lake");
  if (!existsSync(lake)) {
    throw new Error(
      "Cached Lean 4.24 toolchain is missing. The verifier does not install or download it.",
    );
  }
  const environment = {
    ...process.env,
    ELAN_TOOLCHAIN: expectedToolchain,
    PATH: `${toolchainBin}${delimiter}${process.env.PATH ?? ""}`,
    LEAN_PATH: scratch,
  };
  const runLean = (name, arguments_) => {
    const run = spawnSync(lake, ["env", "lean", ...arguments_], {
      cwd: corpus,
      env: environment,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const normalize = (value) => (value ?? "").replaceAll(scratch, "<scratch>");
    receipt.compilation[name] = {
      exitCode: run.status,
      stdout: normalize(run.stdout),
      stderr: normalize(run.stderr),
    };
    if (run.error || run.status !== 0) {
      throw new Error(
        `${name} failed: ${run.error?.message ?? normalize(run.stderr + run.stdout)}`,
      );
    }
    return run.stdout;
  };
  receipt.toolchain = runLean("version", ["--version"]).trim();
  if (!/^Lean \(version 4\.24\.0,/u.test(receipt.toolchain)) {
    throw new Error(`Unexpected Lean version: ${receipt.toolchain}`);
  }
  mkdirSync(join(scratch, "ComparatorChallenges"), { recursive: true });
  copyFileSync(join(example, targetName), join(scratch, targetName));
  copyFileSync(join(example, "SeymourScene.lean"), join(scratch, "SeymourScene.lean"));
  const targetOlean = join(scratch, "ComparatorChallenges/SeymourSecondNeighborhood.olean");
  runLean("upstreamTarget", [`--root=${scratch}`, "-o", targetOlean, join(scratch, targetName)]);
  receipt.upstream.compiledTargetSha256 = hash(readFileSync(targetOlean));
  const sceneOutput = runLean("correspondenceCheck", [
    `--root=${scratch}`,
    join(scratch, "SeymourScene.lean"),
  ]);
  const axiomPattern = /'ProofLens\.SeymourScene\.([^']+)' depends on axioms: \[([^\]]*)\]/gu;
  const audits = [...sceneOutput.matchAll(axiomPattern)].map((match) => ({
    theorem: match[1],
    axioms: match[2].trim() ? match[2].split(",").map((name) => name.trim()) : [],
  }));
  receipt.axiomAudits = audits;
  if (
    audits.length !== expectedProofs.length ||
    new Set(audits.map((row) => row.theorem)).size !== expectedProofs.length
  ) {
    throw new Error(
      `Expected ${expectedProofs.length} distinct proof audits; found ${audits.length}.`,
    );
  }
  for (const name of expectedProofs) {
    const row = audits.find((audit) => audit.theorem === name);
    if (!row || row.axioms.some((axiom) => !allowedAxioms.has(axiom))) {
      throw new Error(`Missing audit or nonstandard axiom in own proof ${name}.`);
    }
  }
  if (/warning:|error:/u.test(sceneOutput)) {
    throw new Error("Own correspondence module compiled with diagnostics.");
  }
  receipt.result = "PASS";
  console.log(
    `PASS: ${expectedProofs.length} Lean proofs audited; source pin matches; no proof placeholders or native evaluation axioms.`,
  );
} catch (error) {
  receipt.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(`FAIL: ${receipt.error}`);
} finally {
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  rmSync(scratch, { recursive: true, force: true });
  console.log(`Receipt: ${receiptPath}`);
}
