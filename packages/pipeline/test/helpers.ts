/**
 * Shared corpus loading for the ProofLens test suite.
 *
 * The corpus is real extracted data — 34 declarations produced by running the
 * Lean extractor over `corpus/` against mathlib. Tests read it from disk rather
 * than regenerating it, so the suite runs on a machine with only Node.
 *
 * Vitest only collects `*.test.ts`, so this module is a plain helper.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseFormalIR, type FormalDeclaration, type FormalIRDocument } from "@prooflens/formal-ir";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the checked-in extraction. */
export const CORPUS_PATH = resolve(HERE, "../../../examples/corpus.formal-ir.json");

let rawCache: unknown;
let docCache: FormalIRDocument | undefined;

/** The corpus as an untyped JSON value, freshly parsed each call. */
export function corpusRaw(): unknown {
  rawCache ??= JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as unknown;
  // Deep clone so a mutating test cannot leak into another one.
  return structuredClone(rawCache);
}

/** The corpus, validated through the Formal IR schema. */
export function corpus(): FormalIRDocument {
  docCache ??= parseFormalIR(corpusRaw());
  return docCache;
}

/** How many declarations the checked-in corpus contains. */
export const CORPUS_DECLARATION_COUNT = 35;

/** Absolute path to the committed 679-declaration mathlib coverage report. */
export const MATHLIB_COVERAGE_PATH = resolve(HERE, "../../../examples/mathlib-coverage.json");

/** The committed mathlib coverage report, as JSON. */
export function mathlibCoverage(): unknown {
  return JSON.parse(readFileSync(MATHLIB_COVERAGE_PATH, "utf8")) as unknown;
}

/** Look a declaration up by its short name, e.g. `simple_upper_bound`. */
export function decl(shortName: string): FormalDeclaration {
  const found = corpus().declarations.find(
    (d) => d.name === shortName || d.name.split(".").pop() === shortName,
  );
  if (!found) throw new Error(`No declaration named ${shortName} in the corpus.`);
  return found;
}

/** Every short name in the corpus, useful for exhaustive `it.each` style loops. */
export function shortNames(): string[] {
  return corpus().declarations.map((d) => d.name.split(".").pop()!);
}
