import { describe, expect, it } from "vitest";
import {
  FORMAL_IR_VERSION,
  FormalIRParseError,
  argPath,
  childPath,
  headConstant,
  indexByName,
  kernelWitness,
  localDependencyEdges,
  parseFormalIR,
  parseFormalIRJson,
  resolvePath,
  size,
  sourceRefFor,
  walk,
  type FormalDeclaration,
  type FormalExprNode,
  type FormalIRDocument,
} from "@prooflens/formal-ir";
import { corpus, corpusRaw, CORPUS_DECLARATION_COUNT, decl } from "../../pipeline/test/helpers.js";

/** Mutate a deep clone of the real corpus and try to parse it. */
function parseMutated(mutate: (raw: Record<string, unknown>) => void): FormalIRDocument {
  const raw = corpusRaw() as Record<string, unknown>;
  mutate(raw);
  return parseFormalIR(raw);
}

function issuesOf(fn: () => unknown): Array<{ path: unknown[]; code: string; message: string }> {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(FormalIRParseError);
    const error = e as FormalIRParseError;
    expect(Array.isArray(error.issues)).toBe(true);
    return error.issues as Array<{ path: unknown[]; code: string; message: string }>;
  }
  throw new Error("expected parsing to throw FormalIRParseError, but it succeeded");
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("parseFormalIR on the real corpus", () => {
  it("parses the checked-in extraction", () => {
    const doc = corpus();
    expect(doc.system).toBe("lean4");
    expect(doc.formalIRVersion).toBe(FORMAL_IR_VERSION);
    expect(doc.declarations).toHaveLength(CORPUS_DECLARATION_COUNT);
    expect(doc.modules.length).toBeGreaterThan(0);
  });

  it("parses the same bytes through the JSON entry point", () => {
    const text = JSON.stringify(corpusRaw());
    const doc = parseFormalIRJson(text);
    expect(doc.declarations).toHaveLength(CORPUS_DECLARATION_COUNT);
  });

  it("reports non-JSON text as a FormalIRParseError with null issues", () => {
    try {
      parseFormalIRJson("{ not json");
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(FormalIRParseError);
      expect((e as FormalIRParseError).issues).toBeNull();
      expect((e as Error).message).toMatch(/not valid JSON/);
    }
  });

  it("keeps every declaration's binder indices contiguous from zero", () => {
    for (const d of corpus().declarations) {
      expect(d.binders.map((b) => b.index)).toEqual(d.binders.map((_, i) => i));
    }
  });
});

// ---------------------------------------------------------------------------
// Malformed input
// ---------------------------------------------------------------------------

describe("parseFormalIR on malformed input", () => {
  it("rejects a document with no `declarations`", () => {
    const issues = issuesOf(() => parseMutated((raw) => delete raw["declarations"]));
    expect(issues.some((i) => i.path.join(".") === "declarations")).toBe(true);
  });

  it("rejects a declaration missing `usesSorry`", () => {
    const issues = issuesOf(() =>
      parseMutated((raw) => {
        delete (raw["declarations"] as Array<Record<string, unknown>>)[0]!["usesSorry"];
      }),
    );
    expect(issues.some((i) => i.path.join(".") === "declarations.0.usesSorry")).toBe(true);
  });

  it("rejects a bad `kind` enum value and lists the permitted ones", () => {
    const issues = issuesOf(() =>
      parseMutated((raw) => {
        (raw["declarations"] as Array<Record<string, unknown>>)[0]!["kind"] = "lemma";
      }),
    );
    const issue = issues.find((i) => i.path.join(".") === "declarations.0.kind");
    expect(issue).toBeDefined();
    expect(issue!.message).toMatch(/theorem/);
  });

  it("rejects an expression node with an unknown `kind`", () => {
    const issues = issuesOf(() =>
      parseMutated((raw) => {
        const first = (raw["declarations"] as Array<Record<string, unknown>>)[0]!;
        (first["conclusion"] as Record<string, unknown>)["tree"] = { kind: "quasar", value: 1 };
      }),
    );
    expect(issues.some((i) => i.path.join(".") === "declarations.0.conclusion.tree.kind")).toBe(
      true,
    );
  });

  it("rejects an unknown `kind` nested deep inside an expression tree", () => {
    const issues = issuesOf(() =>
      parseMutated((raw) => {
        const first = (raw["declarations"] as Array<Record<string, unknown>>)[0]!;
        const tree = (first["conclusion"] as Record<string, unknown>)["tree"] as {
          args?: unknown[];
        };
        expect(Array.isArray(tree.args)).toBe(true);
        tree.args![0] = { kind: "not-a-node" };
      }),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects a completely unrelated value", () => {
    for (const junk of [null, 42, "hello", [], {}]) {
      expect(() => parseFormalIR(junk)).toThrow(FormalIRParseError);
    }
  });

  it("explains that the input probably came from a different extractor version", () => {
    expect(() => parseFormalIR({})).toThrow(/different extractor version/);
  });
});

// ---------------------------------------------------------------------------
// notationFidelity default
// ---------------------------------------------------------------------------

describe("notationFidelity", () => {
  it("defaults to `notation` when absent", () => {
    const doc = parseMutated((raw) => delete raw["notationFidelity"]);
    expect(doc.notationFidelity).toBe("notation");
  });

  it("round-trips an explicit `raw`", () => {
    expect(parseMutated((raw) => (raw["notationFidelity"] = "raw")).notationFidelity).toBe("raw");
  });

  it("rejects a value outside the enum", () => {
    expect(() => parseMutated((raw) => (raw["notationFidelity"] = "pretty"))).toThrow(
      FormalIRParseError,
    );
  });
});

// ---------------------------------------------------------------------------
// definitionBody
// ---------------------------------------------------------------------------

describe("definitionBody", () => {
  const doc = corpus();
  const definitions = doc.declarations.filter(
    (d) => d.kind === "definition" || d.kind === "opaque",
  );

  it("is present on every definition in the corpus", () => {
    expect(definitions.map((d) => d.name.split(".").pop())).toEqual([
      "energyBudget",
      "landauerCost",
      "throughput",
    ]);
    for (const d of definitions) {
      expect(d.definitionBody, d.name).not.toBeNull();
      expect(d.definitionBody!.pretty.length).toBeGreaterThan(0);
      expect(d.definitionBody!.tree).toBeDefined();
    }
  });

  it("is null on every theorem-kind declaration — proof terms are excluded on purpose", () => {
    const theorems = doc.declarations.filter((d) => d.kind !== "definition" && d.kind !== "opaque");
    expect(theorems.length).toBe(CORPUS_DECLARATION_COUNT - definitions.length);
    for (const d of theorems) {
      expect(d.definitionBody, `${d.name} carries a body it should not`).toBeNull();
    }
  });

  it("carries a body that is a real expression tree, walkable like any other", () => {
    const landauer = decl("landauerCost");
    const body = landauer.definitionBody!;
    expect(size(body.tree)).toBeGreaterThan(1);
    expect(headConstant(body.tree)).toBe("HDiv.hDiv");
    for (const name of body.constants) {
      expect([...walk(body.tree)].some((n) => n.kind === "const" && n.name === name)).toBe(true);
    }
  });

  it("instantiates the binders, so the body names the parameters rather than de Bruijn indices", () => {
    for (const d of definitions) {
      const fvars = [...walk(d.definitionBody!.tree)].filter((n) => n.kind === "fvar");
      expect(fvars.length, d.name).toBeGreaterThan(0);
      const binderIds = new Set(d.binders.map((b) => b.fvarId));
      for (const fvar of fvars) {
        expect(
          binderIds.has((fvar as Extract<FormalExprNode, { kind: "fvar" }>).fvarId),
          `${d.name}: ${(fvar as { name: string }).name} is not one of its binders`,
        ).toBe(true);
      }
      expect([...walk(d.definitionBody!.tree)].some((n) => n.kind === "bvar")).toBe(false);
    }
  });

  it("defaults to null when the field is absent, so an older extraction still parses", () => {
    const older = parseMutated((raw) => {
      for (const d of raw["declarations"] as Array<Record<string, unknown>>) {
        delete d["definitionBody"];
      }
    });
    expect(older.declarations).toHaveLength(CORPUS_DECLARATION_COUNT);
    for (const d of older.declarations) expect(d.definitionBody).toBeNull();
  });

  it("accepts an explicit null", () => {
    const doc2 = parseMutated((raw) => {
      for (const d of raw["declarations"] as Array<Record<string, unknown>>) {
        d["definitionBody"] = null;
      }
    });
    expect(doc2.declarations.every((d) => d.definitionBody === null)).toBe(true);
  });

  it("rejects a body that is not a well-formed expression", () => {
    expect(() =>
      parseMutated((raw) => {
        const first = (raw["declarations"] as Array<Record<string, unknown>>)[0]!;
        first["definitionBody"] = { pretty: "x", tree: { kind: "quasar" }, constants: [] };
      }),
    ).toThrow(FormalIRParseError);

    expect(() =>
      parseMutated((raw) => {
        const first = (raw["declarations"] as Array<Record<string, unknown>>)[0]!;
        first["definitionBody"] = "P * t";
      }),
    ).toThrow(FormalIRParseError);
  });

  it("resolves paths into a body the same way as into a conclusion", () => {
    const body = decl("energyBudget").definitionBody!;
    expect(resolvePath(body.tree, "definitionBody")).toBe(body.tree);
    if (body.tree.kind === "app") {
      body.tree.args.forEach((arg, i) => {
        expect(resolvePath(body.tree, argPath("definitionBody", i))).toBe(arg);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Binder names
// ---------------------------------------------------------------------------

describe("binder names", () => {
  const doc = corpus();
  const binders = doc.declarations.flatMap((d) => d.binders);

  it("has binders to check", () => {
    expect(binders.length).toBeGreaterThan(50);
  });

  it("never leaks Lean's macro-scope encoding into a display name", () => {
    for (const binder of binders) {
      expect(binder.name, `${binder.name} contains macro scopes`).not.toMatch(/_hyg/);
      expect(binder.name).not.toMatch(/_@/);
      expect(binder.name).not.toMatch(/\._internal\./);
    }
  });

  it("renders an inaccessible binder Lean-style, with a dagger", () => {
    const inaccessible = binders.filter((b) => b.name.includes("✝"));
    expect(inaccessible.length).toBeGreaterThan(0);
    for (const binder of inaccessible) {
      // `a✝`, `a✝¹`, … — a readable stem plus the marker, nothing else.
      expect(binder.name).toMatch(/^[^\s]+✝[¹²³⁴⁵⁶⁷⁸⁹⁰]*$/);
    }
  });

  it("carries the underlying Lean name in `rawName` where the display name differs", () => {
    const withRaw = binders.filter((b) => b.rawName !== undefined);
    expect(withRaw.length).toBeGreaterThan(0);
    for (const binder of withRaw) {
      expect(typeof binder.rawName).toBe("string");
      expect(binder.rawName!.length).toBeGreaterThan(0);
    }
  });

  it("keeps `rawName` optional, so an older extraction still parses", () => {
    const doc2 = parseMutated((raw) => {
      for (const d of raw["declarations"] as Array<{ binders: Array<Record<string, unknown>> }>) {
        for (const b of d.binders) delete b["rawName"];
      }
    });
    expect(doc2.declarations).toHaveLength(CORPUS_DECLARATION_COUNT);
    expect(doc2.declarations.flatMap((d) => d.binders).every((b) => b.rawName === undefined)).toBe(
      true,
    );
  });

  it("rejects a non-string `rawName`", () => {
    expect(() =>
      parseMutated((raw) => {
        const first = (
          raw["declarations"] as Array<{ binders: Array<Record<string, unknown>> }>
        )[0]!;
        first.binders[0]!["rawName"] = 42;
      }),
    ).toThrow(FormalIRParseError);
  });

  it("gives every binder a non-empty display name", () => {
    for (const binder of binders) {
      expect(binder.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every binder a unique fvarId within its declaration", () => {
    for (const d of doc.declarations) {
      const ids = d.binders.map((b) => b.fvarId);
      expect(new Set(ids).size, d.name).toBe(ids.length);
    }
  });
});

// ---------------------------------------------------------------------------
// kernelWitness
// ---------------------------------------------------------------------------

describe("kernelWitness", () => {
  const doc = corpus();

  it("returns a witness for a normal declaration", () => {
    const d = decl("simple_upper_bound");
    const witness = kernelWitness(doc, d);
    expect(witness).not.toBeNull();
    expect(witness!.declaration).toBe(d.name);
    expect(witness!.system).toBe("lean4");
    expect(witness!.module).toBe(d.source?.module ?? null);
    expect([...witness!.axioms]).toEqual(d.axioms);
  });

  it("mints a witness for every declaration in this corpus, none of which uses sorry", () => {
    for (const d of doc.declarations) {
      expect(d.usesSorry).toBe(false);
      expect(kernelWitness(doc, d)).not.toBeNull();
    }
  });

  it("returns null for a declaration constructed with usesSorry: true", () => {
    const sorried: FormalDeclaration = { ...decl("simple_upper_bound"), usesSorry: true };
    expect(kernelWitness(doc, sorried)).toBeNull();
  });

  it("returns null even when the sorry-carrying declaration lists only standard axioms", () => {
    const sorried: FormalDeclaration = {
      ...decl("div_upper_bound"),
      usesSorry: true,
      axioms: ["propext"],
    };
    expect(kernelWitness(doc, sorried)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sourceRefFor / indexByName
// ---------------------------------------------------------------------------

describe("sourceRefFor", () => {
  const doc = corpus();

  it("points at the declaration, with a span when the source location is known", () => {
    const d = decl("simple_upper_bound");
    const ref = sourceRefFor(doc, d);
    expect(ref.system).toBe("lean4");
    expect(ref.declaration).toBe(d.name);
    expect(ref.span).not.toBeNull();
    expect(ref.span!.startLine).toBeGreaterThan(0);
    expect(ref.path).toBeUndefined();
  });

  it("carries a path through when one is given", () => {
    expect(sourceRefFor(doc, decl("simple_upper_bound"), "conclusion.args[2]").path).toBe(
      "conclusion.args[2]",
    );
  });
});

describe("indexByName", () => {
  it("indexes every declaration exactly once", () => {
    const doc = corpus();
    const index = indexByName(doc);
    expect(index.size).toBe(doc.declarations.length);
    for (const d of doc.declarations) expect(index.get(d.name)).toBe(d);
  });
});

// ---------------------------------------------------------------------------
// localDependencyEdges
// ---------------------------------------------------------------------------

describe("localDependencyEdges", () => {
  const doc = corpus();
  const { edges, externalCount } = localDependencyEdges(doc);
  const local = new Set(doc.declarations.map((d) => d.name));

  it("only emits edges between declarations present in the document", () => {
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(local.has(edge.from)).toBe(true);
      expect(local.has(edge.to)).toBe(true);
    }
  });

  it("counts the mathlib dependencies it dropped rather than silently hiding them", () => {
    expect(externalCount).toBeGreaterThan(0);
    const totalDeps = doc.declarations.reduce(
      (n, d) => n + d.dependencies.filter((dep) => dep !== d.name).length,
      0,
    );
    expect(edges.length + externalCount).toBe(totalDeps);
  });

  it("never emits a self edge", () => {
    for (const edge of edges) expect(edge.from).not.toBe(edge.to);
  });

  it("drops a self dependency instead of counting it as external", () => {
    const solo = parseFormalIR({
      ...(corpusRaw() as Record<string, unknown>),
      declarations: [{ ...decl("log_two_pos"), dependencies: [decl("log_two_pos").name] }],
    });
    expect(localDependencyEdges(solo)).toEqual({ edges: [], externalCount: 0 });
  });

  it("reports every dependency as external when the document holds one declaration", () => {
    const one = decl("budget_div_landauerCost");
    const solo = parseFormalIR({
      ...(corpusRaw() as Record<string, unknown>),
      declarations: [one],
    });
    const result = localDependencyEdges(solo);
    expect(result.edges).toEqual([]);
    expect(result.externalCount).toBe(one.dependencies.filter((d) => d !== one.name).length);
  });

  it("finds the hand-checked chain from budget_div_landauerCost to energyBudget", () => {
    expect(edges).toContainEqual({
      from: "ProofLens.Examples.budget_div_landauerCost",
      to: "ProofLens.Examples.energyBudget",
    });
  });
});

// ---------------------------------------------------------------------------
// Paths over a real expression tree
// ---------------------------------------------------------------------------

describe("expression paths on a real corpus tree", () => {
  const d = decl("simple_upper_bound");
  const tree = d.conclusion.tree;

  it("has `LE.le` at the head", () => {
    expect(tree.kind).toBe("app");
    expect(headConstant(tree)).toBe("LE.le");
  });

  it("returns the constant's own name for a bare constant, and undefined otherwise", () => {
    expect(headConstant({ kind: "const", name: "Real.log", levels: [] })).toBe("Real.log");
    expect(headConstant({ kind: "bvar", index: 0 })).toBeUndefined();
    expect(headConstant({ kind: "fvar", name: "x", fvarId: "_uniq.1" })).toBeUndefined();
  });

  it("builds paths that resolve back to the node they address", () => {
    expect(childPath("", "conclusion")).toBe("conclusion");
    expect(childPath("conclusion", "body")).toBe("conclusion.body");
    expect(argPath("conclusion", 2)).toBe("conclusion.args[2]");

    const lhs = resolvePath(tree, argPath("conclusion", 2));
    expect(lhs).toEqual({ kind: "fvar", name: "x", fvarId: "_uniq.129" });

    const numerator = resolvePath(tree, "conclusion.args[3].args[4]");
    expect(numerator?.kind).toBe("fvar");
    expect((numerator as { name: string }).name).toBe("P");

    const denominator = resolvePath(tree, "conclusion.args[3].args[5]");
    expect((denominator as { name: string }).name).toBe("T");
  });

  it("round-trips every argument of the application through argPath/resolvePath", () => {
    expect(tree.kind).toBe("app");
    const app = tree as Extract<FormalExprNode, { kind: "app" }>;
    app.args.forEach((arg, i) => {
      expect(resolvePath(tree, argPath("conclusion", i))).toBe(arg);
    });
    expect(resolvePath(tree, "conclusion.fn")).toBe(app.fn);
  });

  it("returns undefined for a path that does not address anything", () => {
    expect(resolvePath(tree, "conclusion.args[99]")).toBeUndefined();
    expect(resolvePath(tree, "conclusion.args[0].args[0]")).toBeUndefined();
    expect(resolvePath(tree, "conclusion.body")).toBeUndefined();
    expect(resolvePath(tree, "conclusion.struct")).toBeUndefined();
  });

  it("treats the leading addressing segment as a no-op", () => {
    expect(resolvePath(tree, "")).toBe(tree);
    expect(resolvePath(tree, "conclusion")).toBe(tree);
    expect(resolvePath(tree, "statement")).toBe(tree);
  });

  it("walks every node exactly once and `size` agrees with the walk", () => {
    const nodes = [...walk(tree)];
    expect(nodes[0]).toBe(tree);
    expect(size(tree)).toBe(nodes.length);
    expect(size(tree)).toBe(19);
  });

  it("walk reaches every constant the extractor recorded", () => {
    const walked = new Set(
      [...walk(d.conclusion.tree)]
        .filter((n): n is Extract<FormalExprNode, { kind: "const" }> => n.kind === "const")
        .map((n) => n.name),
    );
    for (const name of d.conclusion.constants) expect(walked.has(name)).toBe(true);
  });

  it("resolves a path into every declaration's conclusion in the corpus", () => {
    for (const each of corpus().declarations) {
      const root = each.conclusion.tree;
      expect(resolvePath(root, "conclusion")).toBe(root);
      if (root.kind === "app") {
        root.args.forEach((arg, i) => {
          expect(resolvePath(root, argPath("conclusion", i))).toBe(arg);
        });
      }
      expect(size(root)).toBeGreaterThan(0);
    }
  });

  it("navigates binder bodies of a lambda and a forall", () => {
    const inner: FormalExprNode = { kind: "bvar", index: 0 };
    const type: FormalExprNode = { kind: "const", name: "Real", levels: [] };
    const lam: FormalExprNode = {
      kind: "lam",
      binderName: "x",
      binderInfo: "default",
      binderType: type,
      body: inner,
    };
    expect(resolvePath(lam, "body")).toBe(inner);
    expect(resolvePath(lam, "binderType")).toBe(type);
    expect(size(lam)).toBe(3);

    const proj: FormalExprNode = { kind: "proj", structName: "S", index: 0, struct: lam };
    expect(resolvePath(proj, "struct")).toBe(lam);
    expect(resolvePath(proj, "struct.body")).toBe(inner);
    expect(size(proj)).toBe(4);
  });
});
