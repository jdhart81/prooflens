import { z } from "zod";

/**
 * Lean expression trees, transcribed structurally.
 *
 * Applications are flattened (`f a b c` is one node with three arguments)
 * because that is the shape mathematical analysis wants. Everything else keeps
 * Lean's own shape, including de Bruijn indices, so the tree is lossless.
 */
export type FormalExprNode =
  | { kind: "bvar"; index: number }
  | { kind: "fvar"; name: string; fvarId: string }
  | { kind: "mvar"; mvarId: string }
  | { kind: "sort"; level: string }
  | { kind: "const"; name: string; levels: string[] }
  | { kind: "app"; fn: FormalExprNode; args: FormalExprNode[] }
  | {
      kind: "lam";
      binderName: string;
      binderInfo: string;
      binderType: FormalExprNode;
      body: FormalExprNode;
    }
  | {
      kind: "forall";
      binderName: string;
      binderInfo: string;
      binderType: FormalExprNode;
      body: FormalExprNode;
    }
  | {
      kind: "let";
      binderName: string;
      binderType: FormalExprNode;
      value: FormalExprNode;
      body: FormalExprNode;
    }
  | { kind: "lit"; litKind: "nat" | "str"; value: number | string }
  | { kind: "proj"; structName: string; index: number; struct: FormalExprNode };

export const FormalExprNodeSchema: z.ZodType<FormalExprNode> = z.lazy(
  () =>
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("bvar"), index: z.number().int() }),
      z.object({ kind: z.literal("fvar"), name: z.string(), fvarId: z.string() }),
      z.object({ kind: z.literal("mvar"), mvarId: z.string() }),
      z.object({ kind: z.literal("sort"), level: z.string() }),
      z.object({ kind: z.literal("const"), name: z.string(), levels: z.array(z.string()) }),
      z.object({
        kind: z.literal("app"),
        fn: FormalExprNodeSchema,
        args: z.array(FormalExprNodeSchema),
      }),
      z.object({
        kind: z.literal("lam"),
        binderName: z.string(),
        binderInfo: z.string(),
        binderType: FormalExprNodeSchema,
        body: FormalExprNodeSchema,
      }),
      z.object({
        kind: z.literal("forall"),
        binderName: z.string(),
        binderInfo: z.string(),
        binderType: FormalExprNodeSchema,
        body: FormalExprNodeSchema,
      }),
      z.object({
        kind: z.literal("let"),
        binderName: z.string(),
        binderType: FormalExprNodeSchema,
        value: FormalExprNodeSchema,
        body: FormalExprNodeSchema,
      }),
      z.object({
        kind: z.literal("lit"),
        litKind: z.enum(["nat", "str"]),
        value: z.union([z.number(), z.string()]),
      }),
      z.object({
        kind: z.literal("proj"),
        structName: z.string(),
        index: z.number().int(),
        struct: FormalExprNodeSchema,
      }),
    ]) as z.ZodType<FormalExprNode>,
);

/** An expression plus the two other views a human or a tool might need. */
export const FormalExprSchema = z.object({
  /** Lean's own pretty printer output. */
  pretty: z.string(),
  tree: FormalExprNodeSchema,
  /** Every constant mentioned anywhere in the expression. */
  constants: z.array(z.string()),
});
export type FormalExpr = z.infer<typeof FormalExprSchema>;

/**
 * Occurrence analysis for one binder.
 *
 * These three booleans are computed by a syntactic occurrence check on the
 * *elaborated* terms, which is why they are trustworthy but narrow: a binder
 * that occurs nowhere is unused **by this proof term**, which is a different
 * and weaker statement than "mathematically unnecessary".
 */
export const BinderUsageSchema = z.object({
  occursInProofTerm: z.boolean(),
  occursInLaterBinderTypes: z.boolean(),
  occursInConclusion: z.boolean(),
  proofTermAvailable: z.boolean(),
  unusedInProof: z.boolean(),
});
export type BinderUsage = z.infer<typeof BinderUsageSchema>;

export const FormalBinderSchema = z.object({
  index: z.number().int(),
  /** Display name. Inaccessible binders are shown Lean-style, as `a✝`. */
  name: z.string(),
  /** The underlying Lean name, macro scopes included. */
  rawName: z.string().optional(),
  fvarId: z.string(),
  binderInfo: z.enum(["default", "implicit", "strictImplicit", "instImplicit"]),
  /**
   * `instance` for typeclass instance binders, `hypothesis` for other
   * `Prop`-valued binders, `parameter` otherwise.
   *
   * Instances are separated because they are plumbing rather than mathematics:
   * counting `[IsStrictOrderedRing α]` as a stated assumption would distort
   * assumption sensitivity and fill figures with noise.
   */
  role: z.enum(["hypothesis", "parameter", "instance"]),
  type: FormalExprSchema,
  usage: BinderUsageSchema,
});
export type FormalBinder = z.infer<typeof FormalBinderSchema>;

export const SourceLocationSchema = z
  .object({
    module: z.string().nullable(),
    startLine: z.number().int(),
    startColumn: z.number().int(),
    endLine: z.number().int(),
    endColumn: z.number().int(),
  })
  .nullable();
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

export const FormalDeclarationSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  kind: z.enum([
    "axiom",
    "definition",
    "theorem",
    "opaque",
    "inductive",
    "constructor",
    "recursor",
    "quot",
  ]),
  docstring: z.string().nullable(),
  source: SourceLocationSchema,
  binders: z.array(FormalBinderSchema),
  /** The statement with all binders stripped. */
  conclusion: FormalExprSchema,
  /**
   * For a definition, the body with its binders instantiated: what the
   * definition unfolds to. `null` for theorems (proof terms are excluded on
   * purpose) and for definitions whose body is too large to be worth showing.
   */
  definitionBody: FormalExprSchema.nullable().default(null),
  /** The full type, binders included. */
  statement: FormalExprSchema,
  dependencies: z.array(z.string()),
  /** The trust base: axioms this declaration ultimately rests on. */
  axioms: z.array(z.string()),
  proofTermAvailable: z.boolean(),
  /**
   * Set when extraction of this declaration failed. The row is kept rather than
   * dropped, so a sweep reports what it could not read instead of quietly
   * returning fewer declarations than the module contains.
   */
  extractionError: z.string().nullable().default(null),
  /** True if the "proof" bottoms out in `sorryAx`. Such a declaration is NOT proved. */
  usesSorry: z.boolean(),
});
export type FormalDeclaration = z.infer<typeof FormalDeclarationSchema>;

export const FormalIRDocumentSchema = z.object({
  formalIRVersion: z.string(),
  system: z.string(),
  toolchain: z.string(),
  /**
   * Whether the extractor's pretty printer had notation delaborators available.
   * `raw` means expressions render as `LE.le x y` rather than `x ≤ y`; the
   * mathematics is identical but the display is degraded, and ProofLens says so
   * rather than pretending otherwise.
   */
  notationFidelity: z.enum(["notation", "raw"]).default("notation"),
  modules: z.array(z.string()),
  declarations: z.array(FormalDeclarationSchema),
});
export type FormalIRDocument = z.infer<typeof FormalIRDocumentSchema>;

export const FORMAL_IR_VERSION = "0.1.0";
