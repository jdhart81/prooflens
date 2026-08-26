import { describe, expect, it } from "vitest";
import {
  lowerDocument,
  opaqueHeadsIn,
  walkExpression,
  walkProposition,
  walkTheorem,
  type MathExpression,
  type MathIRDocument,
  type MathProposition,
  type TheoremIR,
} from "@prooflens/math-ir";
import { corpus } from "../../pipeline/test/helpers.js";
import {
  app,
  num,
  op,
  opaqueExpr,
  opaqueProp,
  pred,
  rel,
  synthetic,
  v,
} from "../../classifier/test/synthetic.js";

const math: MathIRDocument = lowerDocument(corpus());

function theorem(shortName: string): TheoremIR {
  const found = math.theorems.find((t) => t.name.split(".").pop() === shortName);
  if (!found) throw new Error(`no theorem ${shortName}`);
  return found;
}

// ---------------------------------------------------------------------------
// walkExpression
// ---------------------------------------------------------------------------

describe("walkExpression", () => {
  it("yields a leaf exactly once", () => {
    expect([...walkExpression(v("x"))]).toHaveLength(1);
    expect([...walkExpression(num(3))]).toHaveLength(1);
    expect([...walkExpression(opaqueExpr("mystery"))]).toHaveLength(1);
  });

  it("yields the node before its children", () => {
    const expr = op("add", v("a"), v("b"));
    const walked = [...walkExpression(expr)];
    expect(walked[0]).toBe(expr);
    expect(walked.map((n) => n.kind)).toEqual(["operator", "variable", "variable"]);
  });

  it("reaches every node of a deep, hand-built expression", () => {
    // ((a + 1) · log(b / c)) − |d|   — 12 nodes, counted by hand:
    //   sub, mul, add, a, 1, log(), div, b, c, abs, d  = 11
    const deep: MathExpression = op(
      "sub",
      op("mul", op("add", v("a"), num(1)), app("Real.log", "log", op("div", v("b"), v("c")))),
      { kind: "operator", op: "abs", symbol: "abs", args: [v("d")], path: "p" },
    );
    const walked = [...walkExpression(deep)];
    expect(walked).toHaveLength(11);
    expect(
      walked.filter((n) => n.kind === "variable").map((n) => (n as { symbol: string }).symbol),
    ).toEqual(["a", "b", "c", "d"]);
    expect(walked.filter((n) => n.kind === "operator")).toHaveLength(5);
    expect(walked.filter((n) => n.kind === "application")).toHaveLength(1);
    expect(walked.filter((n) => n.kind === "number")).toHaveLength(1);
  });

  it("descends into a lambda body", () => {
    const lambda: MathExpression = {
      kind: "lambda",
      parameter: "x",
      body: op("mul", v("a"), v("x")),
      path: "p",
    };
    const walked = [...walkExpression(lambda)];
    expect(walked).toHaveLength(4);
    expect(walked[0]).toBe(lambda);
    expect(walked.map((n) => n.kind)).toEqual(["lambda", "operator", "variable", "variable"]);
  });

  it("descends into application arguments", () => {
    const expr = app("Real.log", "log", op("add", v("x"), num(1)));
    expect([...walkExpression(expr)]).toHaveLength(4);
  });

  it("does not descend into an opaque node, which has no children to descend into", () => {
    // `opaque` keeps a display string, not a subtree, so there is nothing below.
    const expr = op("add", opaqueExpr("Tendsto(…)", "Filter.Tendsto"), v("y"));
    expect([...walkExpression(expr)]).toHaveLength(3);
  });

  it("is lazy enough to be stopped early", () => {
    const deep = op("add", op("mul", v("a"), v("b")), v("c"));
    const first: MathExpression[] = [];
    for (const node of walkExpression(deep)) {
      first.push(node);
      if (first.length === 2) break;
    }
    expect(first).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// walkProposition
// ---------------------------------------------------------------------------

describe("walkProposition", () => {
  it("yields the proposition then both sides of a relation", () => {
    const prop = rel("less-than-or-equal", v("x"), op("div", v("P"), v("T")));
    const walked = [...walkProposition(prop)];
    expect(walked[0]).toBe(prop);
    expect(walked).toHaveLength(5);
  });

  it("walks a predicate's subject and its extra arguments", () => {
    const prop: MathProposition = {
      kind: "predicate",
      predicate: "monotone",
      name: "MonotoneOn",
      subject: op("mul", v("a"), v("x")),
      args: [v("s")],
      path: "conclusion",
    };
    expect([...walkProposition(prop)]).toHaveLength(5);
  });

  it("walks a predicate with no subject", () => {
    expect([...walkProposition(pred("monotone", "Monotone", null))]).toHaveLength(1);
  });

  it("recurses through both halves of an implication", () => {
    const prop = {
      kind: "implication" as const,
      antecedent: rel("less-than", num(0), v("x")),
      consequent: rel("less-than", num(0), v("y")),
      path: "conclusion",
    };
    const walked = [...walkProposition(prop)];
    expect(walked[0]).toBe(prop);
    expect(walked).toHaveLength(7);
  });

  it("yields an opaque proposition once and stops", () => {
    expect([...walkProposition(opaqueProp("Tendsto(…)", "Filter.Tendsto"))]).toHaveLength(1);
  });

  it("walks a nested implication to full depth", () => {
    const inner = {
      kind: "implication" as const,
      antecedent: rel("less-than", num(0), v("y")),
      consequent: rel("less-than", num(0), v("z")),
      path: "c",
    };
    const outer = {
      kind: "implication" as const,
      antecedent: rel("less-than", num(0), v("x")),
      consequent: inner,
      path: "conclusion",
    };
    const walked = [...walkProposition(outer)];
    expect(walked).toContain(inner);
    // outer(1) + `0 < x`(3) + inner(1) + `0 < y`(3) + `0 < z`(3)
    expect(walked).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------
// walkTheorem
// ---------------------------------------------------------------------------

describe("walkTheorem", () => {
  it("covers the conclusion and every hypothesis of a theorem", () => {
    const t = theorem("simple_upper_bound");
    const walked = [...walkTheorem(t)];
    expect(walked).toContain(t.conclusion.value);
    for (const hypothesis of t.hypotheses) expect(walked).toContain(hypothesis.proposition);
  });

  it("visits the conclusion before the hypotheses", () => {
    const t = theorem("simple_upper_bound");
    const walked = [...walkTheorem(t)];
    expect(walked[0]).toBe(t.conclusion.value);
  });

  it("yields nothing at all for a theorem with an empty statement shape", () => {
    // An opaque conclusion is one node; no hypotheses, no body.
    const t = synthetic(opaqueProp("Mystery", "Mystery"));
    expect([...walkTheorem(t)]).toHaveLength(1);
  });

  it("skips a definition's conclusion, because a return type is not a claim", () => {
    // `landauerCost : ℝ → ℝ → ℝ → ℝ` has conclusion `ℝ`, which is opaque.
    // Counting it as an unreadable term would inflate the backlog with noise.
    const t = theorem("landauerCost");
    expect(t.kind).toBe("definition");
    expect(t.conclusion.value.kind).toBe("opaque");
    const walked = [...walkTheorem(t)];
    expect(walked).not.toContain(t.conclusion.value);
  });

  it("still walks a definition's body", () => {
    const t = theorem("landauerCost");
    const walked = [...walkTheorem(t)];
    expect(walked).toContain(t.definitionBody!.expression);
    expect(walked.length).toBeGreaterThan(1);
  });

  it("skips the conclusion for every definition in the corpus, and for none of the theorems", () => {
    for (const t of math.theorems) {
      const isDefinition = t.kind === "definition" || t.kind === "opaque";
      const walked = [...walkTheorem(t)];
      expect(walked.includes(t.conclusion.value), t.name).toBe(!isDefinition);
    }
  });

  it("honours the `opaque` kind as well as `definition`", () => {
    const t = synthetic(opaqueProp("Real", "Real"), {
      kind: "opaque",
      definitionBody: v("k"),
    });
    const walked = [...walkTheorem(t)];
    expect(walked).not.toContain(t.conclusion.value);
    expect(walked).toContain(t.definitionBody!.expression);
  });

  it("does not throw on any corpus declaration", () => {
    for (const t of math.theorems) {
      expect(() => [...walkTheorem(t)]).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// opaqueHeadsIn
// ---------------------------------------------------------------------------

describe("opaqueHeadsIn", () => {
  it("returns an empty set for a theorem with nothing opaque in it", () => {
    expect(opaqueHeadsIn(theorem("simple_upper_bound")).size).toBe(0);
    expect(opaqueHeadsIn(theorem("information_rate_bound")).size).toBe(0);
  });

  it("finds a head nested deep inside an expression", () => {
    const t = synthetic(
      rel(
        "less-than-or-equal",
        v("x"),
        op("add", num(1), op("mul", num(2), opaqueExpr("∑ i, f i", "Finset.sum"))),
      ),
    );
    expect([...opaqueHeadsIn(t)]).toEqual(["Finset.sum"]);
  });

  it("finds heads inside hypotheses, not only the conclusion", () => {
    const t = synthetic(rel("less-than-or-equal", v("x"), v("y")), {
      hypotheses: [{ symbol: "h", proposition: opaqueProp("Tendsto(…)", "Filter.Tendsto") }],
    });
    expect([...opaqueHeadsIn(t)]).toEqual(["Filter.Tendsto"]);
  });

  it("finds heads inside a definition body", () => {
    const t = synthetic(opaqueProp("Real", "Real"), {
      kind: "definition",
      definitionBody: op("mul", v("a"), opaqueExpr("∫ x, f x", "MeasureTheory.integral")),
    });
    expect([...opaqueHeadsIn(t)]).toEqual(["MeasureTheory.integral"]);
  });

  it("dedupes a head that appears several times", () => {
    const t = synthetic(
      rel(
        "less-than-or-equal",
        op("add", opaqueExpr("∑ a", "Finset.sum"), opaqueExpr("∑ b", "Finset.sum")),
        opaqueExpr("∑ c", "Finset.sum"),
      ),
    );
    const heads = opaqueHeadsIn(t);
    expect(heads.size).toBe(1);
    expect([...heads]).toEqual(["Finset.sum"]);
  });

  it("collects several distinct heads", () => {
    const t = synthetic(
      rel(
        "less-than-or-equal",
        opaqueExpr("∑ a", "Finset.sum"),
        opaqueExpr("∫ f", "MeasureTheory.integral"),
      ),
    );
    expect([...opaqueHeadsIn(t)].sort()).toEqual(["Finset.sum", "MeasureTheory.integral"]);
  });

  it("ignores an opaque node with no head to name", () => {
    const t = synthetic(rel("less-than-or-equal", v("x"), opaqueExpr("something", null)));
    expect(opaqueHeadsIn(t).size).toBe(0);
  });

  it("does not report a definition's return type as an unreadable term", () => {
    // This is the whole reason `walkTheorem` skips a definition's conclusion.
    for (const short of ["energyBudget", "landauerCost", "throughput"]) {
      expect(opaqueHeadsIn(theorem(short)).size, short).toBe(0);
    }
  });

  it("no longer reports Filter.Tendsto, now that limits are a proposition kind", () => {
    const t = math.theorems.find((x) => x.name.endsWith(".sequence_limit_example"))!;
    expect(t.conclusion.value.kind).toBe("limit");
    expect(opaqueHeadsIn(t).size).toBe(0);
  });

  it("finds exactly one opaque head across the whole corpus", () => {
    const all = new Map<string, string[]>();
    for (const t of math.theorems) {
      for (const head of opaqueHeadsIn(t)) {
        all.set(head, [...(all.get(head) ?? []), t.name.split(".").pop()!]);
      }
    }
    // `Filter.Tendsto` used to be the entry here; the `limit` proposition kind
    // reads it now, leaving the deliberate injectivity fixture as the only miss.
    expect([...all.entries()]).toEqual([["Function.Injective", ["energy_cost_injective"]]]);
  });
});
