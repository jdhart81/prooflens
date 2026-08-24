import { describe, expect, it } from "vitest";
import { rank } from "@prooflens/epistemics";
import { lowerDocument, renderExpression, type TheoremIR } from "@prooflens/math-ir";
import {
  RULES,
  classifyDocument,
  classifyTheorem,
  primaryClassification,
  type Classification,
  type ClassificationPayload,
} from "@prooflens/classifier";
import { corpus, CORPUS_DECLARATION_COUNT } from "../../pipeline/test/helpers.js";
import {
  app,
  implies,
  num,
  op,
  opaqueExpr,
  opaqueProp,
  pred,
  rel,
  synthetic,
  v,
} from "./synthetic.js";

const math = lowerDocument(corpus());

function kinds(cs: readonly Classification[]): Array<ClassificationPayload["kind"]> {
  return cs.map((c) => c.payload.kind);
}

type PayloadData<K extends ClassificationPayload["kind"]> =
  Extract<ClassificationPayload, { kind: K }> extends { data: infer D } ? D : never;

function find<K extends ClassificationPayload["kind"]>(
  cs: readonly Classification[],
  kind: K,
): PayloadData<K> {
  const found = cs.find((c) => c.payload.kind === kind);
  if (!found) throw new Error(`no ${kind} classification in [${kinds(cs).join(", ")}]`);
  return found.payload.data as PayloadData<K>;
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

describe("bounds", () => {
  it("reads `x ≤ y` as both an upper bound on x and a lower bound on y", () => {
    const cs = classifyTheorem(synthetic(rel("less-than-or-equal", v("x"), v("y"))));
    expect(kinds(cs)).toContain("upper-bound");
    expect(kinds(cs)).toContain("lower-bound");

    const upper = find(cs, "upper-bound");
    expect(renderExpression(upper.boundedQuantity)).toBe("x");
    expect(renderExpression(upper.bound)).toBe("y");
    expect(upper.strict).toBe(false);

    const lower = find(cs, "lower-bound");
    expect(renderExpression(lower.boundedQuantity)).toBe("y");
    expect(renderExpression(lower.bound)).toBe("x");
    expect(lower.strict).toBe(false);
  });

  it("marks `x < y` as strict on both readings", () => {
    const cs = classifyTheorem(synthetic(rel("less-than", v("x"), v("y"))));
    expect(find(cs, "upper-bound").strict).toBe(true);
    expect(find(cs, "lower-bound").strict).toBe(true);
  });

  it("reads `x ≥ y` as an upper bound on y", () => {
    const cs = classifyTheorem(synthetic(rel("greater-than-or-equal", v("x"), v("y"))));
    const upper = find(cs, "upper-bound");
    expect(renderExpression(upper.boundedQuantity)).toBe("y");
    expect(renderExpression(upper.bound)).toBe("x");
    expect(upper.strict).toBe(false);

    const lower = find(cs, "lower-bound");
    expect(renderExpression(lower.boundedQuantity)).toBe("x");
    expect(renderExpression(lower.bound)).toBe("y");
  });

  it("reads `x > y` as a strict upper bound on y", () => {
    const upper = find(
      classifyTheorem(synthetic(rel("greater-than", v("x"), v("y")))),
      "upper-bound",
    );
    expect(renderExpression(upper.boundedQuantity)).toBe("y");
    expect(upper.strict).toBe(true);
  });

  it("produces no bound classification for `≠`", () => {
    const cs = classifyTheorem(synthetic(rel("not-equal", v("x"), v("y"))));
    expect(kinds(cs)).not.toContain("upper-bound");
    expect(kinds(cs)).not.toContain("lower-bound");
    expect(kinds(cs)).toContain("distinctness");
  });

  it("reports the bound's sensitivity to the parameters it can determine", () => {
    const theorem = synthetic(rel("less-than-or-equal", v("x"), op("div", v("P"), v("T"))), {
      variables: ["x", "P", "T"],
      hypotheses: [
        { symbol: "hP", proposition: rel("less-than", num(0), v("P")) },
        { symbol: "hT", proposition: rel("less-than", num(0), v("T")) },
      ],
    });
    const upper = find(classifyTheorem(theorem), "upper-bound");
    expect(upper.sensitivity).toEqual([
      { variableId: "id:P", symbol: "P", direction: "increasing" },
      { variableId: "id:T", symbol: "T", direction: "decreasing" },
    ]);
  });

  it("omits parameters whose direction it cannot determine", () => {
    const theorem = synthetic(rel("less-than-or-equal", v("x"), op("div", v("P"), v("T"))), {
      variables: ["x", "P", "T"],
    });
    // No sign hypotheses, so nothing may be said about direction.
    expect(find(classifyTheorem(theorem), "upper-bound").sensitivity).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// natural readings
// ---------------------------------------------------------------------------

describe("natural readings", () => {
  function naturalKind(prop: Parameters<typeof synthetic>[0]): string {
    const cs = classifyTheorem(synthetic(prop));
    const natural = cs.filter(
      (c) =>
        (c.payload.kind === "upper-bound" || c.payload.kind === "lower-bound") &&
        c.payload.data.natural,
    );
    expect(natural).toHaveLength(1);
    return natural[0]!.payload.kind;
  }

  it("still reports both readings — neither is dropped", () => {
    const cs = classifyTheorem(
      synthetic(rel("less-than-or-equal", v("x"), op("div", v("P"), v("T")))),
    );
    expect(kinds(cs)).toContain("upper-bound");
    expect(kinds(cs)).toContain("lower-bound");
  });

  it("marks exactly one of the two readings natural", () => {
    for (const prop of [
      rel("less-than-or-equal", v("x"), op("div", v("P"), v("T"))),
      rel("less-than-or-equal", op("div", v("A"), v("B")), v("x")),
      rel("less-than", num(0), app("Real.log", "log", num(2))),
      rel("greater-than-or-equal", v("x"), v("y")),
      rel("less-than", v("a"), v("b")),
    ]) {
      const cs = classifyTheorem(synthetic(prop));
      const flags = cs
        .filter((c) => c.payload.kind === "upper-bound" || c.payload.kind === "lower-bound")
        .map((c) => (c.payload.data as { natural: boolean }).natural);
      expect(flags).toHaveLength(2);
      expect(flags.filter(Boolean)).toHaveLength(1);
    }
  });

  it("reads `x ≤ P / T` as an upper bound on x", () => {
    expect(naturalKind(rel("less-than-or-equal", v("x"), op("div", v("P"), v("T"))))).toBe(
      "upper-bound",
    );
  });

  it("reads `A / B ≤ x` as a lower bound on x", () => {
    expect(naturalKind(rel("less-than-or-equal", op("div", v("A"), v("B")), v("x")))).toBe(
      "lower-bound",
    );
  });

  it("reads `0 < log 2` as a lower bound on log 2, not an upper bound on 0", () => {
    // A number literal is never the quantity a theorem is about.
    expect(naturalKind(rel("less-than", num(0), app("Real.log", "log", num(2))))).toBe(
      "lower-bound",
    );
  });

  it("reads `x ≤ 0` as an upper bound on x, not a lower bound on 0", () => {
    expect(naturalKind(rel("less-than-or-equal", v("x"), num(0)))).toBe("upper-bound");
  });

  it("prefers a bare variable over a compound expression", () => {
    expect(naturalKind(rel("less-than-or-equal", v("x"), op("mul", v("a"), v("b"))))).toBe(
      "upper-bound",
    );
    expect(naturalKind(rel("less-than-or-equal", op("mul", v("a"), v("b")), v("x")))).toBe(
      "lower-bound",
    );
  });

  it("prefers a compound expression over an opaque one", () => {
    expect(
      naturalKind(rel("less-than-or-equal", op("mul", v("a"), v("b")), opaqueExpr("Tendsto(…)"))),
    ).toBe("upper-bound");
    expect(
      naturalKind(rel("less-than-or-equal", opaqueExpr("Tendsto(…)"), op("mul", v("a"), v("b")))),
    ).toBe("lower-bound");
  });

  it("falls back to the upper reading when the two sides are equally informative", () => {
    expect(naturalKind(rel("less-than-or-equal", v("x"), v("y")))).toBe("upper-bound");
  });

  it("computes sensitivity against each reading's own bound", () => {
    const theorem = synthetic(rel("less-than-or-equal", v("x"), op("div", v("P"), v("T"))), {
      variables: ["x", "P", "T"],
      hypotheses: [
        { symbol: "hP", proposition: rel("less-than", num(0), v("P")) },
        { symbol: "hT", proposition: rel("less-than", num(0), v("T")) },
      ],
    });
    const cs = classifyTheorem(theorem);
    expect(find(cs, "upper-bound").sensitivity.map((x) => x.symbol)).toEqual(["P", "T"]);
    // The lower reading's bound is `x`, which responds only to itself.
    expect(find(cs, "lower-bound").sensitivity.map((x) => x.symbol)).toEqual(["x"]);
  });

  it("agrees with the corpus on the two contrasting bound fixtures", () => {
    const upper = math.theorems.find((t) => t.name.endsWith(".simple_upper_bound"))!;
    expect(find(classifyTheorem(upper), "upper-bound").natural).toBe(true);
    expect(find(classifyTheorem(upper), "lower-bound").natural).toBe(false);

    const lower = math.theorems.find((t) => t.name.endsWith(".simple_lower_bound"))!;
    expect(find(classifyTheorem(lower), "upper-bound").natural).toBe(false);
    expect(find(classifyTheorem(lower), "lower-bound").natural).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// positivity
// ---------------------------------------------------------------------------

describe("positivity", () => {
  it("reads `0 < e` as a strict positivity fact", () => {
    const cs = classifyTheorem(synthetic(rel("less-than", num(0), v("e"))));
    expect(kinds(cs)).toContain("positivity");
    const data = find(cs, "positivity");
    expect(renderExpression(data.quantity)).toBe("e");
    expect(data.strict).toBe(true);
    expect(cs.find((c) => c.payload.kind === "positivity")!.rule.id).toBe(RULES.POSITIVITY.id);
  });

  it("reads `0 ≤ e` as a non-strict positivity fact", () => {
    const data = find(
      classifyTheorem(synthetic(rel("less-than-or-equal", num(0), v("e")))),
      "positivity",
    );
    expect(data.strict).toBe(false);
  });

  it("reads `e > 0` and `e ≥ 0`, the mirrored orientations", () => {
    const strict = find(
      classifyTheorem(synthetic(rel("greater-than", v("e"), num(0)))),
      "positivity",
    );
    expect(renderExpression(strict.quantity)).toBe("e");
    expect(strict.strict).toBe(true);

    const loose = find(
      classifyTheorem(synthetic(rel("greater-than-or-equal", v("e"), num(0)))),
      "positivity",
    );
    expect(loose.strict).toBe(false);
  });

  it("reads `e < 0` as negative rather than as a bound on zero", () => {
    const cs = classifyTheorem(synthetic(rel("less-than", v("e"), num(0))));
    expect(kinds(cs)).toContain("positivity");
    const classification = cs.find((c) => c.payload.kind === "positivity")!;
    expect(renderExpression(find(cs, "positivity").quantity)).toBe("e");
    expect(classification.rationale).toContain("strictly negative");
    expect(classification.rationale).not.toContain("positive");
  });

  it("reads `e ≤ 0` as non-strictly negative", () => {
    const classification = classifyTheorem(
      synthetic(rel("less-than-or-equal", v("e"), num(0))),
    ).find((c) => c.payload.kind === "positivity")!;
    expect(classification.rationale).toContain("non-strictly negative");
  });

  it("keeps the compound quantity intact rather than reducing it to a symbol", () => {
    const data = find(
      classifyTheorem(
        synthetic(rel("less-than", num(0), op("mul", v("C"), op("pow", v("V"), num(2))))),
      ),
      "positivity",
    );
    expect(renderExpression(data.quantity)).toBe("C · V ^ 2");
  });

  it("does not fire when neither side is zero", () => {
    expect(kinds(classifyTheorem(synthetic(rel("less-than", v("x"), v("y")))))).not.toContain(
      "positivity",
    );
    expect(kinds(classifyTheorem(synthetic(rel("less-than", num(1), v("y")))))).not.toContain(
      "positivity",
    );
  });

  it("does not fire for an equation against zero", () => {
    expect(kinds(classifyTheorem(synthetic(rel("equal", v("e"), num(0)))))).not.toContain(
      "positivity",
    );
  });

  it("fires for every sign fact in the corpus", () => {
    const positivity = math.theorems.filter((t) =>
      kinds(classifyTheorem(t)).includes("positivity"),
    );
    expect(positivity.map((t) => t.name.split(".").pop())).toEqual([
      "energyBudget_pos",
      "landauerCost_pos",
      "log_two_pos",
      "switching_coefficient_pos",
    ]);
  });

  it("describes the corpus fixture in words a reader can check", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".log_two_pos"))!;
    const classification = classifyTheorem(theorem).find((c) => c.payload.kind === "positivity")!;
    expect(classification.rationale).toBe(
      "The conclusion compares `log(2)` against zero, so it asserts that the quantity is strictly positive.",
    );
  });
});

// ---------------------------------------------------------------------------
// distinctness
// ---------------------------------------------------------------------------

describe("distinctness", () => {
  it("reads `a ≠ b` as a distinctness claim", () => {
    const cs = classifyTheorem(synthetic(rel("not-equal", v("a"), v("b"))));
    expect(kinds(cs)).toContain("distinctness");
    const data = find(cs, "distinctness");
    expect(renderExpression(data.left)).toBe("a");
    expect(renderExpression(data.right)).toBe("b");
    expect(cs.find((c) => c.payload.kind === "distinctness")!.rule.id).toBe(RULES.DISTINCTNESS.id);
  });

  it("does not reinterpret `a ≠ 0` as a sign fact", () => {
    const cs = classifyTheorem(synthetic(rel("not-equal", v("a"), num(0))));
    expect(kinds(cs)).toContain("distinctness");
    expect(kinds(cs)).not.toContain("positivity");
    expect(kinds(cs)).not.toContain("upper-bound");
  });

  it("does not fire for any other relation", () => {
    for (const relation of ["equal", "less-than", "less-than-or-equal", "equivalent"] as const) {
      expect(kinds(classifyTheorem(synthetic(rel(relation, v("a"), v("b")))))).not.toContain(
        "distinctness",
      );
    }
  });

  it("classifies the corpus fixture that used to be unsupported", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".switching_coefficient_ne_zero"))!;
    const cs = classifyTheorem(theorem);
    expect(kinds(cs)).toContain("distinctness");
    expect(kinds(cs)).not.toContain("unsupported");
    const data = find(cs, "distinctness");
    expect(renderExpression(data.left)).toBe("C · V ^ 2");
    expect(renderExpression(data.right)).toBe("0");
    expect(cs.find((c) => c.payload.kind === "distinctness")!.rationale).toBe(
      "The conclusion asserts that `C · V ^ 2` and `0` are different.",
    );
  });
});

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

describe("equality", () => {
  it("reads `x = f(y)` with a bare variable on the left as a functional relationship", () => {
    const cs = classifyTheorem(synthetic(rel("equal", v("R"), op("div", v("N"), v("t")))));
    expect(kinds(cs)).toContain("functional-relationship");
    expect(kinds(cs)).not.toContain("equality");
    const data = find(cs, "functional-relationship");
    expect(data.functional).toBe(true);
    expect(renderExpression(data.left)).toBe("R");
    expect(renderExpression(data.right)).toBe("N / t");
    expect(cs.find((c) => c.payload.kind === "functional-relationship")!.rule.id).toBe(
      RULES.FUNCTIONAL.id,
    );
  });

  it("reads a compound-both-sides equality as a plain equality", () => {
    const cs = classifyTheorem(
      synthetic(rel("equal", op("mul", v("a"), v("b")), op("div", v("c"), v("d")))),
    );
    expect(kinds(cs)).toContain("equality");
    expect(kinds(cs)).not.toContain("functional-relationship");
    expect(find(cs, "equality").functional).toBe(false);
    expect(cs.find((c) => c.payload.kind === "equality")!.rule.id).toBe(RULES.EQUALITY.id);
  });

  it("does not treat a variable-to-variable equality as functional", () => {
    const cs = classifyTheorem(synthetic(rel("equal", v("x"), v("y"))));
    expect(kinds(cs)).toContain("equality");
    expect(find(cs, "equality").functional).toBe(false);
  });

  it("agrees with the corpus on rate_eq_count_div_time and dynamic_power_div_cancel", () => {
    const functional = math.theorems.find((t) => t.name.endsWith(".rate_eq_count_div_time"))!;
    expect(kinds(classifyTheorem(functional))).toContain("functional-relationship");

    const plain = math.theorems.find((t) => t.name.endsWith(".dynamic_power_div_cancel"))!;
    expect(kinds(classifyTheorem(plain))).toContain("equality");
  });
});

// ---------------------------------------------------------------------------
// Monotonicity
// ---------------------------------------------------------------------------

describe("monotonicity", () => {
  const cases: Array<[string, string, "increasing" | "decreasing", boolean]> = [
    ["monotone", "Monotone", "increasing", false],
    ["strictly-monotone", "StrictMono", "increasing", true],
    ["antitone", "Antitone", "decreasing", false],
    ["strictly-antitone", "StrictAnti", "decreasing", true],
  ];

  for (const [predicate, name, direction, strict] of cases) {
    it(`maps ${name} to ${strict ? "strictly " : ""}${direction}`, () => {
      const cs = classifyTheorem(synthetic(pred(predicate as never, name, v("f"))));
      const data = find(cs, "monotonicity");
      expect(data.direction).toBe(direction);
      expect(data.strict).toBe(strict);
      expect(data.predicateName).toBe(name);
      expect(renderExpression(data.subject!)).toBe("f");
    });
  }

  it("does not fire for a predicate outside the monotonicity family", () => {
    const cs = classifyTheorem(synthetic(pred("positive", "Positive", v("f"))));
    expect(kinds(cs)).not.toContain("monotonicity");
    expect(kinds(cs)).toContain("unsupported");
  });

  it("agrees with the corpus fixtures", () => {
    const expected: Record<string, ["increasing" | "decreasing", boolean]> = {
      monotone_affine: ["increasing", false],
      strictMono_affine: ["increasing", true],
      antitone_affine: ["decreasing", false],
    };
    for (const [short, [direction, strict]] of Object.entries(expected)) {
      const theorem = math.theorems.find((t) => t.name.endsWith(`.${short}`))!;
      const data = find(classifyTheorem(theorem), "monotonicity");
      expect(data.direction).toBe(direction);
      expect(data.strict).toBe(strict);
    }
  });
});

// ---------------------------------------------------------------------------
// Implication and equivalence
// ---------------------------------------------------------------------------

describe("implication and equivalence", () => {
  it("classifies an implication conclusion", () => {
    const cs = classifyTheorem(
      synthetic(implies(rel("less-than", num(0), v("x")), rel("less-than", num(0), v("y")))),
    );
    expect(kinds(cs)).toContain("implication");
    const data = find(cs, "implication");
    expect(data.antecedent.kind).toBe("relation");
    expect(data.consequent.kind).toBe("relation");
    expect(cs.find((c) => c.payload.kind === "implication")!.rule.id).toBe(RULES.IMPLICATION.id);
  });

  it("classifies an Iff conclusion as an equivalence", () => {
    const cs = classifyTheorem(synthetic(rel("equivalent", v("A"), v("B"))));
    expect(kinds(cs)).toContain("equivalence");
    expect(kinds(cs)).not.toContain("implication");
    expect(cs.find((c) => c.payload.kind === "equivalence")!.rule.id).toBe(RULES.EQUIVALENCE.id);
  });

  it("agrees with the corpus on rate_bound_iff and abs_eq_self_iff_nonneg", () => {
    for (const short of ["rate_bound_iff", "abs_eq_self_iff_nonneg"]) {
      const theorem = math.theorems.find((t) => t.name.endsWith(`.${short}`))!;
      expect(kinds(classifyTheorem(theorem))).toContain("equivalence");
    }
  });
});

// ---------------------------------------------------------------------------
// Definitions and trust
// ---------------------------------------------------------------------------

describe("definitions and trust", () => {
  it("classifies a definition as a definition", () => {
    const cs = classifyTheorem(synthetic(opaqueProp("energyBudget P t"), { kind: "definition" }));
    expect(kinds(cs)).toContain("definition");
    expect(kinds(cs)).not.toContain("unsupported");
  });

  it("records a null body for a definition ProofLens could not unfold", () => {
    const data = find(
      classifyTheorem(synthetic(opaqueProp("Real"), { kind: "definition", name: "M.f" })),
      "definition",
    );
    expect(data.name).toBe("M.f");
    expect(data.body).toBeNull();
    expect(data.bodyDisplay).toBeNull();
  });

  it("emits no functional relationship for a definition with no body", () => {
    const cs = classifyTheorem(synthetic(opaqueProp("Real"), { kind: "definition" }));
    expect(kinds(cs)).toEqual(["definition"]);
  });

  it("carries the body into the definition payload when there is one", () => {
    const cs = classifyTheorem(
      synthetic(opaqueProp("Real"), {
        kind: "definition",
        name: "M.energyBudget",
        variables: ["P", "t"],
        definitionBody: op("mul", v("P"), v("t")),
      }),
    );
    const data = find(cs, "definition");
    expect(data.bodyDisplay).toBe("P · t");
    expect(renderExpression(data.body!)).toBe("P · t");
    expect(cs.find((c) => c.payload.kind === "definition")!.rationale).toBe(
      "`M.energyBudget` is a definition that unfolds to `P · t`.",
    );
  });

  it("also reads a definition with a body as a functional relationship", () => {
    const cs = classifyTheorem(
      synthetic(opaqueProp("Real"), {
        kind: "definition",
        name: "M.energyBudget",
        variables: ["P", "t"],
        definitionBody: op("mul", v("P"), v("t")),
      }),
    );
    expect(kinds(cs)).toEqual(["definition", "functional-relationship"]);
    const data = find(cs, "functional-relationship");
    expect(renderExpression(data.left)).toBe("energyBudget(P, t)");
    expect(renderExpression(data.right)).toBe("P · t");
    expect(data.functional).toBe(true);
    expect(cs.find((c) => c.payload.kind === "functional-relationship")!.rule.id).toBe(
      RULES.FUNCTIONAL.id,
    );
  });

  it("uses a bare constant on the left when the definition takes no parameters", () => {
    const cs = classifyTheorem(
      synthetic(opaqueProp("Real"), {
        kind: "definition",
        name: "M.answer",
        definitionBody: num(42),
      }),
    );
    const data = find(cs, "functional-relationship");
    expect(data.left.kind).toBe("constant");
    expect(renderExpression(data.left)).toBe("answer");
    expect(cs.find((c) => c.payload.kind === "functional-relationship")!.rationale).toContain(
      "no parameters",
    );
  });

  it("reads all three corpus definitions the same way", () => {
    const expected: Record<string, [string, string]> = {
      energyBudget: ["energyBudget(P, t)", "P · t"],
      landauerCost: ["landauerCost(kB, T, D)", "kB · T · log(2) / D"],
      throughput: ["throughput(ipc, f)", "ipc · f"],
    };
    for (const [short, [left, right]] of Object.entries(expected)) {
      const t = math.theorems.find((x) => x.name.endsWith(`.${short}`))!;
      const cs = classifyTheorem(t);
      expect(kinds(cs), short).toEqual(["definition", "functional-relationship"]);
      expect(find(cs, "definition").bodyDisplay, short).toBe(right);
      const functional = find(cs, "functional-relationship");
      expect(renderExpression(functional.left), short).toBe(left);
      expect(renderExpression(functional.right), short).toBe(right);
    }
  });

  it("leads a definition with its functional reading, which is what gets drawn", () => {
    for (const short of ["energyBudget", "landauerCost", "throughput"]) {
      const t = math.theorems.find((x) => x.name.endsWith(`.${short}`))!;
      expect(primaryClassification(classifyTheorem(t))!.payload.kind, short).toBe(
        "functional-relationship",
      );
    }
  });

  it("emits a definition classification only for definition-kind declarations", () => {
    for (const t of math.theorems) {
      const hasDefinition = kinds(classifyTheorem(t)).includes("definition");
      expect(hasDefinition, t.name).toBe(t.kind === "definition" || t.kind === "opaque");
    }
  });

  it("flags a sorry-carrying declaration and says it is NOT proved", () => {
    const cs = classifyTheorem(
      synthetic(rel("less-than-or-equal", v("x"), v("y")), { usesSorry: true }),
    );
    const trust = cs.find((c) => c.payload.kind === "trust")!;
    expect(trust.rationale).toMatch(/NOT been proved/);
    expect(find(cs, "trust").usesSorry).toBe(true);
  });

  it("flags unusual axioms", () => {
    const cs = classifyTheorem(
      synthetic(rel("less-than-or-equal", v("x"), v("y")), {
        unusualAxioms: ["ProofLens.riemannHypothesis"],
      }),
    );
    expect(find(cs, "trust").unusualAxioms).toEqual(["ProofLens.riemannHypothesis"]);
  });

  it("stays silent about trust for an ordinary, fully proved theorem", () => {
    const cs = classifyTheorem(synthetic(rel("less-than-or-equal", v("x"), v("y"))));
    expect(kinds(cs)).not.toContain("trust");
  });
});

// ---------------------------------------------------------------------------
// Invariants over every classification
// ---------------------------------------------------------------------------

describe("every classification the corpus produces", () => {
  const all = math.theorems.flatMap((t) => classifyTheorem(t));

  it("covers all 34 declarations", () => {
    expect(math.theorems).toHaveLength(CORPUS_DECLARATION_COUNT);
    expect(all.length).toBeGreaterThan(CORPUS_DECLARATION_COUNT);
  });

  it("carries a non-empty rationale", () => {
    for (const c of all) {
      expect(typeof c.rationale).toBe("string");
      expect(c.rationale.trim().length).toBeGreaterThan(0);
      expect(c.rationale).not.toMatch(/undefined|\[object/);
    }
  });

  it("carries a rule id matching /^[A-Z][A-Z0-9_]*$/", () => {
    for (const c of all) expect(c.rule.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  it("carries a status of `derived` or weaker — never `verified`", () => {
    for (const c of all) {
      expect(c.claim.status).not.toBe("verified");
      expect(rank(c.claim.status)).toBeGreaterThanOrEqual(rank("derived"));
    }
  });

  it("agrees between the classification's rule and the claim's provenance rule", () => {
    for (const c of all) expect(c.claim.provenance.rule).toEqual(c.rule);
  });

  it("uses only rule ids declared in the public rulebook", () => {
    const known = new Set<string>(Object.values(RULES).map((r) => r.id));
    for (const c of all) expect(known.has(c.rule.id)).toBe(true);
  });
});

describe("classifyTheorem never returns an empty array", () => {
  it("holds for all 34 corpus declarations", () => {
    for (const theorem of math.theorems) {
      const cs = classifyTheorem(theorem);
      expect(cs.length, `${theorem.name} produced no classification`).toBeGreaterThan(0);
    }
  });

  it("holds for a conclusion ProofLens has never seen", () => {
    const weird: TheoremIR = synthetic(opaqueProp("Quasar.emits x y z", "Quasar.emits"));
    expect(classifyTheorem(weird).length).toBeGreaterThan(0);
  });

  it("holds for a theorem with no hypotheses and an unrecognised conclusion", () => {
    expect(classifyTheorem(synthetic(opaqueProp("???", null))).length).toBeGreaterThan(0);
  });
});

describe("classifyDocument", () => {
  it("classifies every theorem in the document", () => {
    const classified = classifyDocument(math);
    expect(classified).toHaveLength(CORPUS_DECLARATION_COUNT);
    for (const entry of classified) {
      expect(entry.classifications.length).toBeGreaterThan(0);
      expect(entry.theorem.name).toBeTruthy();
    }
  });
});

describe("primaryClassification", () => {
  it("leads with the bound for a bound theorem", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".simple_upper_bound"))!;
    expect(primaryClassification(classifyTheorem(theorem))!.payload.kind).toBe("upper-bound");
  });

  it("leads with `unsupported` when that is all there is", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".unsupported_tendsto_fixture"))!;
    expect(primaryClassification(classifyTheorem(theorem))!.payload.kind).toBe("unsupported");
  });

  it("leads with `positivity` rather than a bound for a sign fact", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".log_two_pos"))!;
    const cs = classifyTheorem(theorem);
    // Both bound readings are still present and still true...
    expect(kinds(cs)).toContain("upper-bound");
    expect(kinds(cs)).toContain("lower-bound");
    // ...but "log 2 is positive" is what the theorem is for.
    expect(primaryClassification(cs)!.payload.kind).toBe("positivity");
  });

  it("leads with `distinctness` for a `≠` conclusion", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".switching_coefficient_ne_zero"))!;
    expect(primaryClassification(classifyTheorem(theorem))!.payload.kind).toBe("distinctness");
  });

  it("leads with the natural reading, which is `lower-bound` for simple_lower_bound", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".simple_lower_bound"))!;
    const primary = primaryClassification(classifyTheorem(theorem))!;
    expect(primary.payload.kind).toBe("lower-bound");
    expect((primary.payload.data as { natural: boolean }).natural).toBe(true);
  });

  it("never leads with a reading marked unnatural", () => {
    for (const theorem of math.theorems) {
      const primary = primaryClassification(classifyTheorem(theorem))!;
      if (primary.payload.kind !== "upper-bound" && primary.payload.kind !== "lower-bound")
        continue;
      expect(primary.payload.data.natural, theorem.name).toBe(true);
    }
  });

  it("returns something for every corpus declaration", () => {
    for (const theorem of math.theorems) {
      expect(primaryClassification(classifyTheorem(theorem))).toBeDefined();
    }
  });

  it("returns undefined only for an empty list", () => {
    expect(primaryClassification([])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unsupported
// ---------------------------------------------------------------------------

describe("the unsupported fixture", () => {
  const theorem = math.theorems.find((t) => t.name.endsWith(".unsupported_tendsto_fixture"))!;
  const cs = classifyTheorem(theorem);
  const unsupported = cs.find((c) => c.payload.kind === "unsupported")!;

  it("is classified as unsupported", () => {
    expect(unsupported).toBeDefined();
    expect(unsupported.rule.id).toBe(RULES.UNSUPPORTED.id);
  });

  it("names the structure it could not read in its rationale", () => {
    expect(unsupported.rationale).toContain(theorem.conclusionDisplay);
    expect(unsupported.rationale).toContain("Tendsto");
  });

  it("names the unrecognised head constant in its payload", () => {
    const data = find(cs, "unsupported");
    expect(data.head).toBe("Filter.Tendsto");
    expect(data.reason).toContain("Filter.Tendsto");
  });

  it("claims nothing about the mathematics it could not read", () => {
    const text = `${unsupported.rationale} ${find(cs, "unsupported").reason}`;
    // It must not assert a bound, a direction, or a truth value.
    for (const forbidden of [
      "upper bound",
      "lower bound",
      "increasing",
      "decreasing",
      "monotone",
      "is false",
      "is true",
      "verified",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("says the formal material is still available rather than dropping it", () => {
    expect(unsupported.rationale).toMatch(/still available/);
  });

  it("is now the only unsupported declaration in the corpus", () => {
    // `switching_coefficient_ne_zero` used to land here too; the `distinctness`
    // classifier reads it properly now.
    const unsupported = math.theorems.filter((t) =>
      kinds(classifyTheorem(t)).includes("unsupported"),
    );
    expect(unsupported.map((t) => t.name.split(".").pop())).toEqual([
      "unsupported_tendsto_fixture",
    ]);
  });
});
