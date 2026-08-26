/**
 * Local constant resolution.
 *
 * A constant extracted alongside the declaration that mentions it is not a
 * mystery: ProofLens holds its name, its docstring, its source position and
 * often its body. Before this, `energyBudget P t` lowered to `opaque` purely
 * because it is not in the global constant table.
 *
 * The change is invisible in rendered output and very visible in coverage, so
 * these tests pin the exact display strings as well as the node kinds — a
 * silent rendering regression here would be easy to miss.
 */
import { describe, expect, it } from "vitest";
import {
  localConstantsOf,
  lowerDeclaration,
  lowerDocument,
  lowerExpression,
  lowerProposition,
  opaqueHeadsIn,
  renderExpression,
  renderProposition,
  type MathExpression,
  type MathProposition,
  type TheoremIR,
} from "@prooflens/math-ir";
import type { FormalExprNode } from "@prooflens/formal-ir";
import { corpus, decl } from "../../pipeline/test/helpers.js";

const doc = corpus();
const math = lowerDocument(doc);

function theorem(shortName: string): TheoremIR {
  const found = math.theorems.find((t) => t.name.split(".").pop() === shortName);
  if (!found) throw new Error(`no theorem ${shortName}`);
  return found;
}

/** `energyBudget P t` as Lean hands it over: a const applied to two fvars. */
function energyBudgetCall(): FormalExprNode {
  return {
    kind: "app",
    fn: { kind: "const", name: "ProofLens.Examples.energyBudget", levels: [] },
    args: [
      { kind: "fvar", name: "P", fvarId: "_uniq.1" },
      { kind: "fvar", name: "t", fvarId: "_uniq.2" },
    ],
  };
}

// ---------------------------------------------------------------------------
// localConstantsOf
// ---------------------------------------------------------------------------

describe("localConstantsOf", () => {
  const locals = localConstantsOf(doc);

  it("includes every definition in the document", () => {
    expect([...locals.keys()].sort()).toEqual([
      "ProofLens.Examples.energyBudget",
      "ProofLens.Examples.landauerCost",
      "ProofLens.Examples.throughput",
    ]);
  });

  it("maps each to its short display name", () => {
    expect(locals.get("ProofLens.Examples.landauerCost")).toEqual({ display: "landauerCost" });
  });

  it("excludes theorems — a theorem name in a proof is a dependency, not a term", () => {
    for (const d of doc.declarations) {
      if (d.kind === "definition" || d.kind === "opaque") continue;
      expect(locals.has(d.name), `${d.name} must not qualify as a local constant`).toBe(false);
    }
    expect(locals.has("ProofLens.Examples.simple_upper_bound")).toBe(false);
    expect(locals.has("ProofLens.Examples.log_two_pos")).toBe(false);
  });

  it("would include an axiom, which is definitional in the sense that matters", () => {
    const withAxiom = {
      ...doc,
      declarations: [{ ...decl("log_two_pos"), name: "M.myAxiom", kind: "axiom" as const }],
    };
    expect([...localConstantsOf(withAxiom).keys()]).toEqual(["M.myAxiom"]);
  });

  it("is empty for a document with no definitions", () => {
    const noDefinitions = {
      ...doc,
      declarations: doc.declarations.filter((d) => d.kind === "theorem"),
    };
    expect(localConstantsOf(noDefinitions).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The default must not resolve anything
// ---------------------------------------------------------------------------

describe("lowering without a `locals` map", () => {
  it("leaves a local constant opaque, so nothing resolves by accident", () => {
    const expr = lowerExpression(energyBudgetCall(), "conclusion");
    expect(expr.kind).toBe("opaque");
    expect((expr as Extract<MathExpression, { kind: "opaque" }>).head).toBe(
      "ProofLens.Examples.energyBudget",
    );
  });

  it("leaves a proposition mentioning one opaque too", () => {
    const prop = lowerProposition(
      {
        kind: "app",
        fn: { kind: "const", name: "LT.lt", levels: [] },
        args: [
          { kind: "const", name: "Real", levels: [] },
          { kind: "const", name: "Real.instLT", levels: [] },
          { kind: "lit", litKind: "nat", value: 0 },
          energyBudgetCall(),
        ],
      },
      "conclusion",
    );
    expect(prop.kind).toBe("relation");
    const rhs = (prop as Extract<MathProposition, { kind: "relation" }>).rhs;
    expect(rhs.kind).toBe("opaque");
  });

  it("lowers a whole declaration opaquely when no locals are passed", () => {
    const bare = lowerDeclaration(doc, decl("energyBudget_pos"));
    const rhs = (bare.conclusion.value as Extract<MathProposition, { kind: "relation" }>).rhs;
    expect(rhs.kind).toBe("opaque");
    expect(opaqueHeadsIn(bare)).toContain("ProofLens.Examples.energyBudget");
  });

  it("renders identically either way — only the node kind changes", () => {
    const bare = lowerDeclaration(doc, decl("energyBudget_pos"));
    expect(bare.conclusionDisplay).toBe("0 < energyBudget(P, t)");
    expect(theorem("energyBudget_pos").conclusionDisplay).toBe("0 < energyBudget(P, t)");
  });
});

// ---------------------------------------------------------------------------
// With locals
// ---------------------------------------------------------------------------

describe("lowering with a `locals` map", () => {
  const locals = localConstantsOf(doc);

  it("resolves a local constant to an application, not an opaque term", () => {
    const expr = lowerExpression(energyBudgetCall(), "conclusion", [], locals);
    expect(expr.kind).toBe("application");
    const application = expr as Extract<MathExpression, { kind: "application" }>;
    expect(application.head).toBe("ProofLens.Examples.energyBudget");
    expect(application.display).toBe("energyBudget");
    expect(application.args.map((a) => renderExpression(a))).toEqual(["P", "t"]);
  });

  it("still leaves a constant from outside the document opaque", () => {
    const foreign: FormalExprNode = {
      kind: "app",
      fn: { kind: "const", name: "Mathlib.Nowhere.nearby", levels: [] },
      args: [{ kind: "fvar", name: "x", fvarId: "_uniq.9" }],
    };
    expect(lowerExpression(foreign, "conclusion", [], locals).kind).toBe("opaque");
  });

  it("does not resolve a theorem name even when it appears in term position", () => {
    const theoremCall: FormalExprNode = {
      kind: "app",
      fn: { kind: "const", name: "ProofLens.Examples.log_two_pos", levels: [] },
      args: [],
    };
    expect(lowerExpression(theoremCall, "conclusion", [], locals).kind).toBe("opaque");
  });
});

// ---------------------------------------------------------------------------
// Against the real corpus
// ---------------------------------------------------------------------------

describe("energyBudget_pos", () => {
  const t = theorem("energyBudget_pos");
  const rhs = (t.conclusion.value as Extract<MathProposition, { kind: "relation" }>).rhs;

  it("lowers its right-hand side to an application", () => {
    expect(rhs.kind).toBe("application");
    expect(rhs.kind === "application" && rhs.head).toBe("ProofLens.Examples.energyBudget");
  });

  it("is not opaque", () => {
    expect(rhs.kind).not.toBe("opaque");
    expect(opaqueHeadsIn(t).size).toBe(0);
  });

  it("keeps the arguments as real subexpressions rather than a display string", () => {
    const application = rhs as Extract<MathExpression, { kind: "application" }>;
    expect(application.args).toHaveLength(2);
    expect(application.args.map((a) => a.kind)).toEqual(["variable", "variable"]);
    expect(application.args.map((a) => (a as { symbol: string }).symbol)).toEqual(["P", "t"]);
  });

  it("renders exactly as it did before the change", () => {
    expect(t.conclusionDisplay).toBe("0 < energyBudget(P, t)");
    expect(renderProposition(t.conclusion.value)).toBe("0 < energyBudget(P, t)");
  });
});

describe("energy_ops_bound: two local constants in one statement", () => {
  const t = theorem("energy_ops_bound");
  const rhs = (t.conclusion.value as Extract<MathProposition, { kind: "relation" }>).rhs;

  it("renders exactly as it did before the change", () => {
    expect(t.conclusionDisplay).toBe("N ≤ energyBudget(P, t) / landauerCost(kB, T, D)");
  });

  it("resolves both sides of the quotient", () => {
    expect(rhs.kind).toBe("operator");
    const quotient = rhs as Extract<MathExpression, { kind: "operator" }>;
    expect(quotient.op).toBe("div");
    expect(quotient.args.map((a) => a.kind)).toEqual(["application", "application"]);
    expect(quotient.args.map((a) => (a as { head: string }).head)).toEqual([
      "ProofLens.Examples.energyBudget",
      "ProofLens.Examples.landauerCost",
    ]);
  });

  it("leaves nothing opaque in the statement", () => {
    expect(opaqueHeadsIn(t).size).toBe(0);
  });

  it("makes each local constant's arguments reachable by traversal", () => {
    const quotient = rhs as Extract<MathExpression, { kind: "operator" }>;
    const landauer = quotient.args[1] as Extract<MathExpression, { kind: "application" }>;
    expect(landauer.args.map((a) => renderExpression(a))).toEqual(["kB", "T", "D"]);
  });
});

describe("a local constant applied to another local constant", () => {
  it("resolves both, at both depths", () => {
    const locals = localConstantsOf(doc);
    const nested: FormalExprNode = {
      kind: "app",
      fn: { kind: "const", name: "ProofLens.Examples.throughput", levels: [] },
      args: [energyBudgetCall(), { kind: "fvar", name: "f", fvarId: "_uniq.3" }],
    };
    const expr = lowerExpression(nested, "conclusion", [], locals);

    expect(expr.kind).toBe("application");
    const outer = expr as Extract<MathExpression, { kind: "application" }>;
    expect(outer.head).toBe("ProofLens.Examples.throughput");
    expect(outer.args[0]!.kind).toBe("application");
    expect((outer.args[0] as Extract<MathExpression, { kind: "application" }>).head).toBe(
      "ProofLens.Examples.energyBudget",
    );
    expect(renderExpression(expr)).toBe("throughput(energyBudget(P, t), f)");
  });
});

// ---------------------------------------------------------------------------
// Document-wide
// ---------------------------------------------------------------------------

describe("lowerDocument wires the locals through", () => {
  it("leaves only the deliberate fixture with an opaque term", () => {
    const withOpaque = math.theorems.filter((t) => opaqueHeadsIn(t).size > 0);
    expect(withOpaque.map((t) => t.name.split(".").pop())).toEqual(["energy_cost_injective"]);
  });

  it("resolves every reference to a corpus definition, in every declaration", () => {
    const localNames = new Set(localConstantsOf(doc).keys());
    for (const t of math.theorems) {
      for (const head of opaqueHeadsIn(t)) {
        expect(localNames.has(head), `${t.name} left ${head} opaque`).toBe(false);
      }
    }
  });

  it("changes no rendered conclusion anywhere in the corpus", () => {
    // The whole point: coverage moved, output did not. Lowering each declaration
    // with no locals must produce byte-identical display strings.
    for (const d of doc.declarations) {
      const bare = lowerDeclaration(doc, d);
      const resolved = math.theorems.find((t) => t.name === d.name)!;
      expect(bare.conclusionDisplay, d.name).toBe(resolved.conclusionDisplay);
      expect(
        bare.hypotheses.map((h) => h.display),
        d.name,
      ).toEqual(resolved.hypotheses.map((h) => h.display));
      expect(bare.definitionBody?.display ?? null, d.name).toBe(
        resolved.definitionBody?.display ?? null,
      );
    }
  });
});
