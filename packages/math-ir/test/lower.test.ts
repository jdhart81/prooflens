import { describe, expect, it } from "vitest";
import {
  MATH_IR_VERSION,
  containsOpaque,
  lowerDeclaration,
  lowerDocument,
  lowerExpression,
  lowerProposition,
  renderExpression,
  renderProposition,
  variablesIn,
  variablesInProposition,
  type MathExpression,
  type MathIRDocument,
  type MathProposition,
  type TheoremIR,
} from "@prooflens/math-ir";
import { corpus, decl } from "../../pipeline/test/helpers.js";

const doc = corpus();
const math: MathIRDocument = lowerDocument(doc);

function theorem(shortName: string): TheoremIR {
  const found = math.theorems.find((t) => t.name.split(".").pop() === shortName);
  if (!found) throw new Error(`no theorem ${shortName}`);
  return found;
}

// ---------------------------------------------------------------------------
// Document level
// ---------------------------------------------------------------------------

describe("lowerDocument", () => {
  it("lowers every declaration in the corpus", () => {
    expect(math.mathIRVersion).toBe(MATH_IR_VERSION);
    expect(math.system).toBe("lean4");
    expect(math.notationFidelity).toBe(doc.notationFidelity);
    expect(math.theorems).toHaveLength(doc.declarations.length);
    expect(math.theorems.map((t) => t.name)).toEqual(doc.declarations.map((d) => d.name));
  });

  it("lowers every declaration without throwing", () => {
    for (const d of doc.declarations) {
      expect(() => lowerDeclaration(doc, d)).not.toThrow();
    }
  });

  it("produces a non-empty conclusionDisplay for every declaration", () => {
    for (const t of math.theorems) {
      expect(t.conclusionDisplay.trim().length).toBeGreaterThan(0);
      expect(t.conclusionDisplay).not.toMatch(/undefined|\[object/);
    }
  });

  it("never claims `verified` for a lowered conclusion, whatever the ceiling says", () => {
    for (const t of math.theorems) {
      expect(t.conclusion.status).toBe("derived");
      expect(t.ceiling).toBe("verified"); // nothing in this corpus uses sorry
      expect(t.conclusion.provenance.rule).toBeDefined();
    }
  });

  it("carries the trust base forward from the Formal IR", () => {
    for (const t of math.theorems) {
      const d = doc.declarations.find((x) => x.name === t.name)!;
      expect(t.trust.axioms).toEqual(d.axioms);
      expect(t.trust.usesSorry).toBe(d.usesSorry);
      expect(t.trust.unusualAxioms).toEqual([]);
    }
  });

  it("splits binders into parameters and hypotheses without losing any", () => {
    for (const t of math.theorems) {
      const d = doc.declarations.find((x) => x.name === t.name)!;
      expect(t.variables.length + t.hypotheses.length).toBe(d.binders.length);
    }
  });

  it("degrades the ceiling to `derived` for a declaration that uses sorry", () => {
    const sorried = lowerDeclaration(doc, { ...decl("simple_upper_bound"), usesSorry: true });
    expect(sorried.ceiling).toBe("derived");
    expect(sorried.trust.usesSorry).toBe(true);
    expect(sorried.conclusion.status).toBe("derived");
  });
});

// ---------------------------------------------------------------------------
// Named fixtures
// ---------------------------------------------------------------------------

describe("simple_upper_bound", () => {
  const t = theorem("simple_upper_bound");
  const prop = t.conclusion.value;

  it("lowers to a `less-than-or-equal` relation", () => {
    expect(prop.kind).toBe("relation");
    expect((prop as Extract<MathProposition, { kind: "relation" }>).relation).toBe(
      "less-than-or-equal",
    );
  });

  it("has a bare variable `x` on the left", () => {
    const lhs = (prop as Extract<MathProposition, { kind: "relation" }>).lhs;
    expect(lhs.kind).toBe("variable");
    expect((lhs as Extract<MathExpression, { kind: "variable" }>).symbol).toBe("x");
  });

  it("has a `div` operator on the right", () => {
    const rhs = (prop as Extract<MathProposition, { kind: "relation" }>).rhs;
    expect(rhs.kind).toBe("operator");
    const op = rhs as Extract<MathExpression, { kind: "operator" }>;
    expect(op.op).toBe("div");
    expect(op.args.map((a) => (a as { symbol: string }).symbol)).toEqual(["P", "T"]);
  });

  it("renders as `x ≤ P / T`", () => {
    expect(t.conclusionDisplay).toBe("x ≤ P / T");
    expect(renderProposition(prop)).toBe("x ≤ P / T");
  });

  it("keeps the author's annotations and hints", () => {
    expect(t.suggestedVisual).toBe("upper-bound-plot");
    expect(t.concept).toBe("power-limited rate bound");
    expect(t.variables.find((v) => v.symbol === "P")?.annotation?.units).toBe("W");
    expect(t.documentation).not.toMatch(/@prooflens/);
  });

  it("keeps the three hypotheses with their occurrence analysis", () => {
    expect(t.hypotheses.map((h) => h.symbol)).toEqual(["hP", "hT", "h"]);
    expect(t.hypotheses.map((h) => h.usage.unusedInProof)).toEqual([true, true, false]);
    expect(t.hypotheses.map((h) => h.display)).toEqual(["0 < P", "0 < T", "x ≤ P / T"]);
  });

  it("gives every subexpression a path into the formal tree", () => {
    const rel = prop as Extract<MathProposition, { kind: "relation" }>;
    expect(rel.path).toBe("conclusion");
    expect(rel.lhs.path).toBe("conclusion.args[2]");
    expect(rel.rhs.path).toBe("conclusion.args[3]");
  });
});

describe("information_rate_bound", () => {
  const t = theorem("information_rate_bound");

  it("renders as `N / t ≤ P · D / (kB · T · log(2))`", () => {
    expect(renderProposition(t.conclusion.value)).toBe("N / t ≤ P · D / (kB · T · log(2))");
    expect(t.conclusionDisplay).toBe("N / t ≤ P · D / (kB · T · log(2))");
  });

  it("sees through the OfNat wrapper on the literal 2", () => {
    expect(t.conclusionDisplay).toContain("log(2)");
    expect(t.conclusionDisplay).not.toContain("ofNat");
    expect(t.conclusionDisplay).not.toContain("OfNat");
  });

  it("shows no elaborator plumbing in the rendered conclusion", () => {
    for (const noise of ["inst", "HDiv", "hDiv", "HMul", "Real.instLE", "LE.le"]) {
      expect(t.conclusionDisplay).not.toContain(noise);
    }
  });

  it("mentions all six parameters between its two sides", () => {
    const symbols = new Set(t.variables.map((v) => v.symbol));
    expect(symbols).toEqual(new Set(["P", "T", "kB", "D", "N", "t"]));
    expect(variablesInProposition(t.conclusion.value).size).toBe(6);
  });
});

describe("monotone_affine", () => {
  const t = theorem("monotone_affine");
  const prop = t.conclusion.value;

  it("lowers to a `monotone` predicate", () => {
    expect(prop.kind).toBe("predicate");
    const pred = prop as Extract<MathProposition, { kind: "predicate" }>;
    expect(pred.predicate).toBe("monotone");
    expect(pred.name).toBe("Monotone");
  });

  it("keeps the affine function as the subject", () => {
    const pred = prop as Extract<MathProposition, { kind: "predicate" }>;
    expect(pred.subject?.kind).toBe("lambda");
    expect(renderExpression(pred.subject!)).toBe("x ↦ a · x + b");
  });

  it("maps the other monotonicity predicates too", () => {
    expect((theorem("strictMono_affine").conclusion.value as { predicate: string }).predicate).toBe(
      "strictly-monotone",
    );
    expect((theorem("antitone_affine").conclusion.value as { predicate: string }).predicate).toBe(
      "antitone",
    );
  });
});

describe("rate_bound_iff", () => {
  const t = theorem("rate_bound_iff");
  const prop = t.conclusion.value;

  it("lowers to the `equivalent` relation", () => {
    expect(prop.kind).toBe("relation");
    expect((prop as Extract<MathProposition, { kind: "relation" }>).relation).toBe("equivalent");
  });

  it("keeps both sides readable as propositions", () => {
    const rel = prop as Extract<MathProposition, { kind: "relation" }>;
    expect(renderExpression(rel.lhs)).toBe("x ≤ P / T");
    expect(renderExpression(rel.rhs)).toBe("x · T ≤ P");
    expect(t.conclusionDisplay).toBe("x ≤ P / T ↔ x · T ≤ P");
  });
});

describe("sequence_limit_example", () => {
  const t = theorem("sequence_limit_example");
  const prop = t.conclusion.value;

  it("lowers `Filter.Tendsto` to a `limit` proposition", () => {
    // This declaration used to be the unsupported fixture, named
    // `unsupported_tendsto_fixture`. The `limit` proposition kind is what
    // changed; the Lean statement and its proof did not.
    expect(prop.kind).toBe("limit");
  });

  it("keeps the sequence as its subject, with its arguments lowered", () => {
    const limit = prop as Extract<MathProposition, { kind: "limit" }>;
    expect(renderExpression(limit.subject)).toBe("n ↦ 1 / (n + 1)");
    expect(limit.subject.kind).toBe("lambda");
  });

  it("names both filters rather than leaving them opaque", () => {
    const limit = prop as Extract<MathProposition, { kind: "limit" }>;
    expect(limit.source.kind).toBe("at-top");
    expect(limit.source.display).toBe("+∞");
    expect(limit.source.label).toBe("grows without bound");
    expect(limit.target.kind).toBe("neighbourhood");
    expect(limit.target.display).toBe("0");
    expect(limit.target.point).not.toBeNull();
  });

  it("renders the whole statement in ordinary notation", () => {
    expect(t.conclusionDisplay).toBe("n ↦ 1 / (n + 1) ⟶ 0 (along +∞)");
  });

  it("shows no elaborator plumbing", () => {
    for (const noise of ["hDiv", "ofNat", "inst", "cast", "Tendsto"]) {
      expect(t.conclusionDisplay).not.toContain(noise);
    }
  });

  it("sees through the Nat.cast coercion on the index", () => {
    expect(t.conclusionDisplay).toMatch(/\bn \+ 1\b/);
  });
});

describe("energy_cost_injective, the deliberate unsupported fixture", () => {
  const t = theorem("energy_cost_injective");

  it("lowers to `opaque`, because `Function.Injective` is not in the tables", () => {
    expect(t.conclusion.value.kind).toBe("opaque");
    expect((t.conclusion.value as Extract<MathProposition, { kind: "opaque" }>).head).toBe(
      "Function.Injective",
    );
  });

  it("still lowers the function it is about", () => {
    expect(t.conclusionDisplay).toContain("landauerCost(kB, T, D)");
    expect(t.conclusionDisplay).toContain("N ↦");
  });

  it("shows no elaborator plumbing inside the opaque display", () => {
    for (const noise of ["hMul", "inst", "ofNat"]) {
      expect(t.conclusionDisplay).not.toContain(noise);
    }
  });
});

describe("simple_lower_bound", () => {
  const t = theorem("simple_lower_bound");

  it("lowers with the compound side on the left, exactly as Lean stated it", () => {
    expect(t.conclusionDisplay).toBe("A / B ≤ x");
    const rel = t.conclusion.value as Extract<MathProposition, { kind: "relation" }>;
    expect(rel.relation).toBe("less-than-or-equal");
    expect(rel.lhs.kind).toBe("operator");
    expect(rel.rhs.kind).toBe("variable");
  });
});

describe("switching_coefficient_ne_zero", () => {
  const t = theorem("switching_coefficient_ne_zero");

  it("lowers `≠` to the `not-equal` relation rather than an opaque term", () => {
    const rel = t.conclusion.value as Extract<MathProposition, { kind: "relation" }>;
    expect(rel.kind).toBe("relation");
    expect(rel.relation).toBe("not-equal");
    expect(t.conclusionDisplay).toBe("C · V ^ 2 ≠ 0");
  });
});

describe("sign facts in the corpus", () => {
  it("lowers `0 < e` with the literal zero on the left", () => {
    for (const short of ["log_two_pos", "energyBudget_pos", "landauerCost_pos"]) {
      const rel = theorem(short).conclusion.value as Extract<MathProposition, { kind: "relation" }>;
      expect(rel.relation, short).toBe("less-than");
      expect(rel.lhs.kind, short).toBe("number");
      expect((rel.lhs as Extract<MathExpression, { kind: "number" }>).value).toBe(0);
    }
  });

  it("renders `0 < log 2` with the literal seen through the OfNat wrapper", () => {
    expect(theorem("log_two_pos").conclusionDisplay).toBe("0 < log(2)");
  });
});

describe("definitionBody lowering", () => {
  it("lowers each corpus definition's body to the expression a reader expects", () => {
    expect(theorem("energyBudget").definitionBody!.display).toBe("P · t");
    expect(theorem("landauerCost").definitionBody!.display).toBe("kB · T · log(2) / D");
    expect(theorem("throughput").definitionBody!.display).toBe("ipc · f");
  });

  it("is null for every theorem-kind declaration", () => {
    for (const t of math.theorems) {
      if (t.kind === "definition" || t.kind === "opaque") continue;
      expect(t.definitionBody, `${t.name} carries a body it should not`).toBeNull();
    }
  });

  it("gives the body real structure, not an opaque display string", () => {
    const body = theorem("landauerCost").definitionBody!.expression;
    expect(body.kind).toBe("operator");
    const div = body as Extract<MathExpression, { kind: "operator" }>;
    expect(div.op).toBe("div");
    expect(renderExpression(div.args[1]!)).toBe("D");
    expect(containsOpaque(body)).toBe(false);
  });

  it("sees through the OfNat wrapper inside a body, exactly as in a conclusion", () => {
    expect(theorem("landauerCost").definitionBody!.display).toContain("log(2)");
    expect(theorem("landauerCost").definitionBody!.display).not.toContain("ofNat");
  });

  it("names the definition's own parameters in the body", () => {
    const t = theorem("landauerCost");
    const ids = variablesIn(t.definitionBody!.expression);
    const parameterIds = new Set(t.variables.map((v) => v.id));
    expect(ids.size).toBe(3);
    for (const id of ids) expect(parameterIds.has(id), id).toBe(true);
  });

  it("roots every body path at `definitionBody`, so provenance can address it", () => {
    for (const t of math.theorems) {
      if (!t.definitionBody) continue;
      expect(t.definitionBody.expression.path).toBe("definitionBody");
    }
  });

  it("agrees with `renderExpression` on the display it stores", () => {
    for (const t of math.theorems) {
      if (!t.definitionBody) continue;
      expect(t.definitionBody.display).toBe(renderExpression(t.definitionBody.expression));
    }
  });

  it("lowers a declaration whose Formal IR body is null to a null MathIR body", () => {
    const withoutBody = lowerDeclaration(doc, { ...decl("landauerCost"), definitionBody: null });
    expect(withoutBody.definitionBody).toBeNull();
  });
});

describe("binder display names", () => {
  it("carries Lean's display name into the hypothesis symbol, macro scopes stripped", () => {
    const t = theorem("budget_implies_rate_bound");
    const inaccessible = t.hypotheses.find((h) => h.symbol.includes("✝"));
    expect(inaccessible).toBeDefined();
    expect(inaccessible!.symbol).toBe("a✝");
    expect(inaccessible!.display).toBe("x · T ≤ P");
  });

  it("leaks no macro-scope encoding into any lowered symbol or display string", () => {
    for (const t of math.theorems) {
      const strings = [
        t.conclusionDisplay,
        t.statementDisplay,
        ...t.variables.map((v) => v.symbol),
        ...t.hypotheses.flatMap((h) => [h.symbol, h.display]),
      ];
      for (const text of strings) {
        expect(text, `${t.name}: ${text}`).not.toMatch(/_hyg|_@|\._internal\./);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Transparency
// ---------------------------------------------------------------------------

describe("transparent constants", () => {
  it("sees through OfNat.ofNat to the underlying literal", () => {
    const expr = lowerExpression(
      {
        kind: "app",
        fn: { kind: "const", name: "OfNat.ofNat", levels: [] },
        args: [
          { kind: "const", name: "Real", levels: [] },
          { kind: "lit", litKind: "nat", value: 2 },
          { kind: "const", name: "instOfNatReal", levels: [] },
        ],
      },
      "e",
    );
    expect(expr).toEqual({ kind: "number", value: 2, display: "2", path: "e.args[1]" });
    expect(renderExpression(expr)).toBe("2");
  });

  it("sees through Nat.cast to its final argument", () => {
    const expr = lowerExpression(
      {
        kind: "app",
        fn: { kind: "const", name: "Nat.cast", levels: [] },
        args: [
          { kind: "const", name: "Real", levels: [] },
          { kind: "const", name: "instNatCastReal", levels: [] },
          { kind: "fvar", name: "n", fvarId: "_uniq.1" },
        ],
      },
      "e",
    );
    expect(expr.kind).toBe("variable");
    expect(renderExpression(expr)).toBe("n");
  });

  it("sees through Int.cast, Rat.cast and NNReal.toReal the same way", () => {
    for (const head of ["Int.cast", "Rat.cast", "NNReal.toReal"]) {
      const expr = lowerExpression(
        {
          kind: "app",
          fn: { kind: "const", name: head, levels: [] },
          args: [
            { kind: "const", name: "Real", levels: [] },
            { kind: "fvar", name: "z", fvarId: "_uniq.9" },
          ],
        },
        "e",
      );
      expect(renderExpression(expr)).toBe("z");
    }
  });

  it("renders `Real.log 2` as `log(2)` with the literal unwrapped", () => {
    const expr = lowerExpression(
      {
        kind: "app",
        fn: { kind: "const", name: "Real.log", levels: [] },
        args: [
          {
            kind: "app",
            fn: { kind: "const", name: "OfNat.ofNat", levels: [] },
            args: [
              { kind: "const", name: "Real", levels: [] },
              { kind: "lit", litKind: "nat", value: 2 },
              { kind: "const", name: "inst", levels: [] },
            ],
          },
        ],
      },
      "e",
    );
    expect(renderExpression(expr)).toBe("log(2)");
    expect(renderExpression(expr)).not.toContain("ofNat");
  });
});

// ---------------------------------------------------------------------------
// Unrecognised structure
// ---------------------------------------------------------------------------

describe("lowerProposition on unrecognised structure", () => {
  it("produces `opaque` with the head recorded", () => {
    const prop = lowerProposition(
      {
        kind: "app",
        fn: { kind: "const", name: "Mystery.predicate", levels: [] },
        args: [{ kind: "fvar", name: "y", fvarId: "_uniq.2" }],
      },
      "conclusion",
    );
    expect(prop.kind).toBe("opaque");
    expect((prop as { head: string | null }).head).toBe("Mystery.predicate");
    expect(renderProposition(prop)).toBe("predicate(y)");
  });

  it("recognises an arrow as an implication", () => {
    const prop = lowerProposition(
      {
        kind: "forall",
        binderName: "a",
        binderInfo: "default",
        binderType: {
          kind: "app",
          fn: { kind: "const", name: "LT.lt", levels: [] },
          args: [
            { kind: "const", name: "Real", levels: [] },
            { kind: "const", name: "inst", levels: [] },
            { kind: "lit", litKind: "nat", value: 0 },
            { kind: "fvar", name: "x", fvarId: "_uniq.3" },
          ],
        },
        body: {
          kind: "app",
          fn: { kind: "const", name: "LT.lt", levels: [] },
          args: [
            { kind: "const", name: "Real", levels: [] },
            { kind: "const", name: "inst", levels: [] },
            { kind: "lit", litKind: "nat", value: 0 },
            { kind: "fvar", name: "y", fvarId: "_uniq.4" },
          ],
        },
      },
      "conclusion",
    );
    expect(prop.kind).toBe("implication");
    expect(renderProposition(prop)).toBe("0 < x → 0 < y");
  });

  it("marks an expression containing an unnamed head as opaque", () => {
    const expr = lowerExpression(
      {
        kind: "app",
        fn: { kind: "const", name: "HAdd.hAdd", levels: [] },
        args: [
          { kind: "const", name: "Real", levels: [] },
          { kind: "const", name: "Real", levels: [] },
          { kind: "const", name: "Real", levels: [] },
          { kind: "const", name: "instHAdd", levels: [] },
          { kind: "fvar", name: "x", fvarId: "_uniq.5" },
          {
            kind: "app",
            fn: { kind: "const", name: "Weird.thing", levels: [] },
            args: [{ kind: "fvar", name: "y", fvarId: "_uniq.6" }],
          },
        ],
      },
      "e",
    );
    expect(containsOpaque(expr)).toBe(true);
    expect(renderExpression(expr)).toBe("x + thing(y)");
  });
});

// ---------------------------------------------------------------------------
// Precedence
// ---------------------------------------------------------------------------

function v(symbol: string): MathExpression {
  return { kind: "variable", id: `id:${symbol}`, symbol, path: `p:${symbol}` };
}

function op(
  kind: "add" | "sub" | "mul" | "div" | "pow",
  a: MathExpression,
  b: MathExpression,
): MathExpression {
  const symbol = { add: "+", sub: "−", mul: "·", div: "/", pow: "^" }[kind];
  return { kind: "operator", op: kind, symbol, args: [a, b], path: "p" };
}

describe("renderExpression precedence", () => {
  const a = v("a");
  const b = v("b");
  const c = v("c");

  it("parenthesises a sum inside a product: (a + b) * c", () => {
    expect(renderExpression(op("mul", op("add", a, b), c))).toBe("(a + b) · c");
  });

  it("leaves a product inside a sum unparenthesised: a + b * c", () => {
    expect(renderExpression(op("add", a, op("mul", b, c)))).toBe("a + b · c");
  });

  it("parenthesises a product in a divisor: a / (b * c)", () => {
    expect(renderExpression(op("div", a, op("mul", b, c)))).toBe("a / (b · c)");
  });

  it("parenthesises a right-nested subtraction: a - (b - c)", () => {
    expect(renderExpression(op("sub", a, op("sub", b, c)))).toBe("a − (b − c)");
  });

  it("leaves a left-nested subtraction unparenthesised: (a - b) - c", () => {
    expect(renderExpression(op("sub", op("sub", a, b), c))).toBe("a − b − c");
  });

  it("parenthesises a right-nested division but not a left-nested one", () => {
    expect(renderExpression(op("div", a, op("div", b, c)))).toBe("a / (b / c)");
    expect(renderExpression(op("div", op("div", a, b), c))).toBe("a / b / c");
  });

  it("parenthesises a sum under a power on either side", () => {
    expect(renderExpression(op("pow", op("add", a, b), c))).toBe("(a + b) ^ c");
    expect(renderExpression(op("pow", a, op("add", b, c)))).toBe("a ^ (b + c)");
  });

  it("does not parenthesise a variable, number or application argument", () => {
    expect(renderExpression(op("mul", a, b))).toBe("a · b");
    expect(
      renderExpression(
        op("mul", a, {
          kind: "application",
          head: "Real.log",
          display: "log",
          args: [b],
          path: "p",
        }),
      ),
    ).toBe("a · log(b)");
  });

  it("renders the unary operators without spurious parentheses", () => {
    const neg: MathExpression = { kind: "operator", op: "neg", symbol: "−", args: [a], path: "p" };
    const abs: MathExpression = {
      kind: "operator",
      op: "abs",
      symbol: "abs",
      args: [op("add", a, b)],
      path: "p",
    };
    expect(renderExpression(neg)).toBe("−a");
    expect(renderExpression(abs)).toBe("|a + b|");
    expect(
      renderExpression({ kind: "operator", op: "inv", symbol: "⁻¹", args: [a], path: "p" }),
    ).toBe("a⁻¹");
  });

  it("reproduces the corpus bound exactly from its lowered tree", () => {
    // P · D / (kB · T · log(2)): the divisor is a product, so it takes brackets.
    const t = theorem("information_rate_bound");
    const rhs = (t.conclusion.value as Extract<MathProposition, { kind: "relation" }>).rhs;
    expect(renderExpression(rhs)).toBe("P · D / (kB · T · log(2))");
  });
});
