import { mintKernelWitness, type KernelWitness, type SourceReference } from "@prooflens/epistemics";
import { FormalIRDocumentSchema, type FormalDeclaration, type FormalIRDocument } from "./schema.js";

export class FormalIRParseError extends Error {
  constructor(
    message: string,
    readonly issues: unknown,
  ) {
    super(message);
    this.name = "FormalIRParseError";
  }
}

/** Validate an untrusted JSON value as a Formal IR document. */
export function parseFormalIR(value: unknown): FormalIRDocument {
  const result = FormalIRDocumentSchema.safeParse(value);
  if (!result.success) {
    throw new FormalIRParseError(
      "Input is not valid ProofLens Formal IR. " +
        "It was probably produced by a different extractor version.",
      result.error.issues,
    );
  }
  return result.data;
}

/** Parse a Formal IR document from JSON text. */
export function parseFormalIRJson(text: string): FormalIRDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new FormalIRParseError(`Formal IR is not valid JSON: ${(e as Error).message}`, null);
  }
  return parseFormalIR(raw);
}

/**
 * Mint the kernel witness for a declaration, if it deserves one.
 *
 * This is the single gate between "Lean said so" and everything downstream that
 * is allowed to be labelled `verified`. A declaration whose proof reaches
 * `sorryAx` gets `null`, and every claim ProofLens later makes about it will be
 * marked `derived` or weaker — which is exactly right, because nothing about it
 * was actually proved. The same applies to a declaration whose extraction
 * failed: a stub row is a record of what ProofLens could not read, not evidence
 * of what Lean accepted.
 */
export function kernelWitness(
  doc: FormalIRDocument,
  decl: FormalDeclaration,
): KernelWitness | null {
  return mintKernelWitness({
    system: doc.system,
    declaration: decl.name,
    module: decl.source?.module ?? null,
    axioms: decl.axioms,
    // A stub row means extraction failed, so ProofLens never saw the real
    // declaration. `usesSorry: false` records that no `sorry` was *observed* —
    // which is not evidence the kernel accepted anything.
    provedWithoutSorry: !decl.usesSorry && decl.extractionError === null,
  });
}

/** A source reference pointing at a declaration, optionally at a subterm of it. */
export function sourceRefFor(
  doc: FormalIRDocument,
  decl: FormalDeclaration,
  path?: string,
): SourceReference {
  const ref: SourceReference = {
    system: doc.system,
    declaration: decl.name,
    module: decl.source?.module ?? null,
    span: decl.source
      ? {
          startLine: decl.source.startLine,
          startColumn: decl.source.startColumn,
          endLine: decl.source.endLine,
          endColumn: decl.source.endColumn,
        }
      : null,
  };
  if (path !== undefined) ref.path = path;
  return ref;
}

/** Index declarations by name for dependency resolution. */
export function indexByName(doc: FormalIRDocument): Map<string, FormalDeclaration> {
  return new Map(doc.declarations.map((d) => [d.name, d]));
}

/**
 * Dependency edges restricted to declarations present in this document.
 *
 * Lean reports every constant a proof term touches, which for a mathlib-backed
 * theorem is hundreds of library lemmas. For a v0.1 dependency graph we keep the
 * edges the reader can actually follow, and report how many we dropped so the
 * UI can say so rather than implying the graph is complete.
 */
export function localDependencyEdges(doc: FormalIRDocument): {
  edges: Array<{ from: string; to: string }>;
  externalCount: number;
} {
  const local = new Set(doc.declarations.map((d) => d.name));
  const edges: Array<{ from: string; to: string }> = [];
  let externalCount = 0;
  for (const decl of doc.declarations) {
    for (const dep of decl.dependencies) {
      if (dep === decl.name) continue;
      if (local.has(dep)) edges.push({ from: decl.name, to: dep });
      else externalCount += 1;
    }
  }
  return { edges, externalCount };
}
