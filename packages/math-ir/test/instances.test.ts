/**
 * Typeclass instances are not stated assumptions.
 *
 * `[IsStrictOrderedRing α]` is Lean plumbing that makes the statement typecheck,
 * not something the author is asking a reader to grant. Counting 208 of them as
 * hypotheses across the mathlib slice distorted assumption sensitivity and made
 * `IsStrictOrderedRing` the largest entry in the opaque backlog.
 *
 * The checked-in corpus contains no instance binders at all, so these fixtures
 * are constructed. That absence is itself asserted, so this file starts failing
 * the day a real one appears and can be pinned against instead.
 */
import { describe, expect, it } from "vitest";
import { parseFormalIR, type FormalBinder } from "@prooflens/formal-ir";
import { lowerDeclaration, opaqueHeadsIn } from "@prooflens/math-ir";
import { classifyTheorem } from "@prooflens/classifier";
import { corpus, corpusRaw, decl } from "../../pipeline/test/helpers.js";

/** A binder as the extractor emits it. */
function binder(
  index: number,
  name: string,
  role: "hypothesis" | "parameter" | "instance",
  binderInfo: string,
  typePretty: string,
  typeTree: unknown,
): Record<string, unknown> {
  return {
    index,
    name,
    fvarId: `_uniq.${name}`,
    binderInfo,
    role,
    type: { pretty: typePretty, tree: typeTree, constants: [] },
    usage: {
      occursInProofTerm: true,
      occursInLaterBinderTypes: false,
      occursInConclusion: false,
      proofTermAvailable: true,
      unusedInProof: false,
    },
  };
}

/**
 * A declaration shaped like a mathlib lemma: a carrier, an instance, a real
 * hypothesis, and a conclusion.
 */
function withInstances(): ReturnType<typeof parseFormalIR> {
  const raw = corpusRaw() as Record<string, unknown>;
  const template = (raw["declarations"] as Array<Record<string, unknown>>).find(
    (d) => d["name"] === "ProofLens.Examples.simple_upper_bound",
  )!;
  const instanceType = {
    kind: "app",
    fn: { kind: "const", name: "IsStrictOrderedRing", levels: [] },
    args: [{ kind: "fvar", name: "α", fvarId: "_uniq.α" }],
  };
  const hypothesisType = {
    kind: "app",
    fn: { kind: "const", name: "LT.lt", levels: [] },
    args: [
      { kind: "const", name: "Real", levels: [] },
      { kind: "const", name: "Real.instLT", levels: [] },
      { kind: "lit", litKind: "nat", value: 0 },
      { kind: "fvar", name: "x", fvarId: "_uniq.x" },
    ],
  };
  return parseFormalIR({
    ...raw,
    declarations: [
      {
        ...template,
        name: "Made.Up.with_instances",
        binders: [
          binder(0, "α", "parameter", "implicit", "Type", { kind: "sort", level: "1" }),
          binder(1, "x", "parameter", "default", "ℝ", { kind: "const", name: "Real", levels: [] }),
          binder(2, "inst", "instance", "instImplicit", "IsStrictOrderedRing α", instanceType),
          binder(3, "inst2", "instance", "instImplicit", "OrderTopology α", {
            kind: "app",
            fn: { kind: "const", name: "OrderTopology", levels: [] },
            args: [{ kind: "fvar", name: "α", fvarId: "_uniq.α" }],
          }),
          binder(4, "hx", "hypothesis", "default", "0 < x", hypothesisType),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe("the binder role enum", () => {
  it("accepts all three roles", () => {
    const doc = withInstances();
    expect(doc.declarations[0]!.binders.map((b) => b.role)).toEqual([
      "parameter",
      "parameter",
      "instance",
      "instance",
      "hypothesis",
    ]);
  });

  it("round-trips a role through parsing unchanged", () => {
    const doc = withInstances();
    const instances = doc.declarations[0]!.binders.filter((b) => b.role === "instance");
    expect(instances).toHaveLength(2);
    for (const b of instances) expect(b.binderInfo).toBe("instImplicit");
  });

  it("rejects a role outside the enum", () => {
    const raw = corpusRaw() as Record<string, unknown>;
    const declarations = raw["declarations"] as Array<{ binders: Array<Record<string, unknown>> }>;
    declarations[0]!.binders[0]!["role"] = "typeclass";
    expect(() => parseFormalIR(raw)).toThrow();
  });

  it("finds no instance binder in the checked-in corpus", () => {
    // Every fixture below is constructed because of this. If a corpus
    // declaration ever gains one, pin against it instead.
    const roles = new Set(
      corpus()
        .declarations.flatMap((d) => d.binders)
        .map((b) => b.role),
    );
    expect([...roles].sort()).toEqual(["hypothesis", "parameter"]);
  });

  it("carries `instImplicit` for every instance binder and for no other", () => {
    for (const b of withInstances().declarations[0]!.binders) {
      expect(b.role === "instance", b.name).toBe(b.binderInfo === "instImplicit");
    }
  });
});

// ---------------------------------------------------------------------------
// Lowering
// ---------------------------------------------------------------------------

describe("lowering a declaration with instances", () => {
  const doc = withInstances();
  const theorem = lowerDeclaration(doc, doc.declarations[0]!);

  it("collects them into `instances`", () => {
    expect(theorem.instances.map((i) => i.symbol)).toEqual(["inst", "inst2"]);
    expect(theorem.instances.map((i) => i.typeDisplay)).toEqual([
      "IsStrictOrderedRing α",
      "OrderTopology α",
    ]);
    for (const instance of theorem.instances) expect(instance.id).toBeTruthy();
  });

  it("keeps them out of `hypotheses`", () => {
    expect(theorem.hypotheses.map((h) => h.symbol)).toEqual(["hx"]);
    for (const h of theorem.hypotheses) {
      expect(h.symbol).not.toMatch(/^inst/);
    }
  });

  it("keeps them out of `variables`", () => {
    expect(theorem.variables.map((v) => v.symbol)).toEqual(["α", "x"]);
  });

  it("accounts for every binder exactly once across the three lists", () => {
    const total = theorem.variables.length + theorem.hypotheses.length + theorem.instances.length;
    expect(total).toBe(doc.declarations[0]!.binders.length);
  });

  it("reports no instance class name as an unreadable term", () => {
    // `IsStrictOrderedRing` was the largest entry in the opaque backlog purely
    // because instance types were being lowered as though they were assumptions.
    const heads = opaqueHeadsIn(theorem);
    expect(heads.has("IsStrictOrderedRing")).toBe(false);
    expect(heads.has("OrderTopology")).toBe(false);
  });

  it("leaves `instances` empty for every declaration in the corpus", () => {
    const document = corpus();
    for (const d of document.declarations) {
      expect(lowerDeclaration(document, d).instances, d.name).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Assumption sensitivity
// ---------------------------------------------------------------------------

describe("assumption sensitivity ignores instances", () => {
  const doc = withInstances();
  const theorem = lowerDeclaration(doc, doc.declarations[0]!);
  const classification = classifyTheorem(theorem).find(
    (c) => c.payload.kind === "assumption-sensitivity",
  )!;

  it("analyses only the real hypotheses", () => {
    expect(classification).toBeDefined();
    const data =
      classification.payload.kind === "assumption-sensitivity" ? classification.payload.data : null;
    expect(data).not.toBeNull();
    const all = [...data!.used, ...data!.unusedInProof].map((h) => h.symbol);
    expect(all).toEqual(["hx"]);
  });

  it("counts one hypothesis, not three", () => {
    expect(classification.rationale).toContain("1 stated hypotheses");
    expect(classification.rationale).not.toContain("inst");
  });

  it("produces no analysis at all when every binder is an instance", () => {
    // An instance-only declaration states no assumptions, so there is nothing
    // to be sensitive to.
    const raw = corpusRaw() as Record<string, unknown>;
    const template = (raw["declarations"] as Array<Record<string, unknown>>)[0]!;
    const instanceOnly = parseFormalIR({
      ...raw,
      declarations: [
        {
          ...template,
          name: "Made.Up.instances_only",
          binders: [
            binder(0, "inst", "instance", "instImplicit", "Countable α", {
              kind: "app",
              fn: { kind: "const", name: "Countable", levels: [] },
              args: [{ kind: "fvar", name: "α", fvarId: "_uniq.α" }],
            }),
          ],
        },
      ],
    });
    const lowered = lowerDeclaration(instanceOnly, instanceOnly.declarations[0]!);
    expect(lowered.hypotheses).toEqual([]);
    expect(lowered.instances).toHaveLength(1);
    expect(classifyTheorem(lowered).map((c) => c.payload.kind)).not.toContain(
      "assumption-sensitivity",
    );
  });
});

// ---------------------------------------------------------------------------
// A real corpus declaration, re-roled
// ---------------------------------------------------------------------------

describe("re-roling a real hypothesis as an instance", () => {
  it("moves it out of the assumption analysis without changing the conclusion", () => {
    const doc = corpus();
    const original = decl("simple_upper_bound");
    const before = lowerDeclaration(doc, original);

    const rerolled = {
      ...original,
      binders: original.binders.map((b): FormalBinder =>
        b.name === "hP" ? { ...b, role: "instance" as const } : b,
      ),
    };
    const after = lowerDeclaration(doc, rerolled);

    expect(before.hypotheses.map((h) => h.symbol)).toEqual(["hP", "hT", "h"]);
    expect(after.hypotheses.map((h) => h.symbol)).toEqual(["hT", "h"]);
    expect(after.instances.map((i) => i.symbol)).toEqual(["hP"]);

    // The mathematics is untouched.
    expect(after.conclusionDisplay).toBe(before.conclusionDisplay);
  });
});
