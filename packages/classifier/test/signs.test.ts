/**
 * Sign and monotonicity analysis.
 *
 * The point of this module is that it is allowed to stay silent. Most of these
 * tests therefore check that it *refuses* to answer rather than that it answers
 * correctly: a wrong direction on a figure is worse than no direction at all.
 */
import { describe, expect, it } from "vitest";
import { lowerDocument, type MathExpression } from "@prooflens/math-ir";
import {
  DIRECTION_PHRASE,
  classifyTheorem,
  directionOf,
  signFactsOf,
  signOf,
  type Direction,
  type Sign,
  type SignFacts,
} from "@prooflens/classifier";
import { corpus } from "../../pipeline/test/helpers.js";
import { app, num, op, opaqueExpr, pred, rel, synthetic, v } from "./synthetic.js";

function facts(...entries: Array<[string, Sign]>): SignFacts {
  return new Map(entries);
}

// ---------------------------------------------------------------------------
// signFactsOf
// ---------------------------------------------------------------------------

describe("signFactsOf", () => {
  it("reads `0 < T` as T positive", () => {
    const t = synthetic(rel("less-than-or-equal", v("x"), v("T")), {
      variables: ["T"],
      hypotheses: [{ symbol: "hT", proposition: rel("less-than", num(0), v("T")) }],
    });
    expect(signFactsOf(t).get("id:T")).toBe("positive");
  });

  it("reads `T > 0` as T positive — the other orientation", () => {
    const t = synthetic(rel("less-than-or-equal", v("x"), v("T")), {
      variables: ["T"],
      hypotheses: [{ symbol: "hT", proposition: rel("greater-than", v("T"), num(0)) }],
    });
    expect(signFactsOf(t).get("id:T")).toBe("positive");
  });

  it("reads `0 ≤ T` as T nonnegative", () => {
    const t = synthetic(rel("less-than-or-equal", v("x"), v("T")), {
      variables: ["T"],
      hypotheses: [{ symbol: "hT", proposition: rel("less-than-or-equal", num(0), v("T")) }],
    });
    expect(signFactsOf(t).get("id:T")).toBe("nonnegative");
  });

  it("reads `T ≥ 0` as T nonnegative — the other orientation", () => {
    const t = synthetic(rel("less-than-or-equal", v("x"), v("T")), {
      variables: ["T"],
      hypotheses: [{ symbol: "hT", proposition: rel("greater-than-or-equal", v("T"), num(0)) }],
    });
    expect(signFactsOf(t).get("id:T")).toBe("nonnegative");
  });

  it("reads `T < 0` and `T ≤ 0` as negative and nonpositive", () => {
    const negative = synthetic(rel("equal", v("T"), v("T")), {
      hypotheses: [{ symbol: "h", proposition: rel("less-than", v("T"), num(0)) }],
    });
    expect(signFactsOf(negative).get("id:T")).toBe("negative");

    const nonpositive = synthetic(rel("equal", v("T"), v("T")), {
      hypotheses: [{ symbol: "h", proposition: rel("less-than-or-equal", v("T"), num(0)) }],
    });
    expect(signFactsOf(nonpositive).get("id:T")).toBe("nonpositive");
  });

  it("keeps the stronger fact when a variable is constrained twice", () => {
    const t = synthetic(rel("equal", v("T"), v("T")), {
      hypotheses: [
        { symbol: "h1", proposition: rel("less-than", num(0), v("T")) },
        { symbol: "h2", proposition: rel("less-than-or-equal", num(0), v("T")) },
      ],
    });
    expect(signFactsOf(t).get("id:T")).toBe("positive");
  });

  it("records nothing at all from `T ≠ 0`", () => {
    const t = synthetic(rel("equal", v("T"), v("T")), {
      hypotheses: [{ symbol: "h", proposition: rel("not-equal", v("T"), num(0)) }],
    });
    expect(signFactsOf(t).has("id:T")).toBe(false);
  });

  it("records nothing from a comparison against a non-zero quantity", () => {
    const t = synthetic(rel("equal", v("T"), v("T")), {
      hypotheses: [{ symbol: "h", proposition: rel("less-than", v("a"), v("T")) }],
    });
    expect([...signFactsOf(t).keys()]).toEqual([]);
  });

  it("records nothing from a non-relational hypothesis", () => {
    const t = synthetic(rel("equal", v("T"), v("T")), {
      hypotheses: [{ symbol: "h", proposition: pred("monotone", "Monotone", v("f")) }],
    });
    expect([...signFactsOf(t).keys()]).toEqual([]);
  });

  it("records nothing when the non-zero side is compound rather than a bare variable", () => {
    const t = synthetic(rel("equal", v("T"), v("T")), {
      hypotheses: [
        { symbol: "h", proposition: rel("less-than", num(0), op("mul", v("a"), v("b"))) },
      ],
    });
    expect([...signFactsOf(t).keys()]).toEqual([]);
  });

  it("reads the real corpus fixture's positivity hypotheses", () => {
    const math = lowerDocument(corpus());
    const t = math.theorems.find((x) => x.name.endsWith(".information_rate_bound"))!;
    const f = signFactsOf(t);
    for (const symbol of ["P", "T", "kB", "D", "t"]) {
      const id = t.variables.find((x) => x.symbol === symbol)!.id;
      expect(f.get(id), symbol).toBe("positive");
    }
    // `N` is not constrained by any hypothesis, so nothing is known about it.
    const nId = t.variables.find((x) => x.symbol === "N")!.id;
    expect(f.has(nId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signOf
// ---------------------------------------------------------------------------

describe("signOf", () => {
  const f = facts(["id:P", "positive"], ["id:T", "positive"], ["id:z", "nonnegative"]);

  it("reads numeric literals directly", () => {
    expect(signOf(num(3), f)).toBe("positive");
    expect(signOf(num(-3), f)).toBe("negative");
    expect(signOf(num(0), f)).toBe("zero");
  });

  it("returns `unknown` for a variable with no recorded fact", () => {
    expect(signOf(v("q"), f)).toBe("unknown");
  });

  it("multiplies and divides known signs", () => {
    expect(signOf(op("mul", v("P"), v("T")), f)).toBe("positive");
    expect(signOf(op("div", v("P"), v("T")), f)).toBe("positive");
    expect(signOf(op("mul", v("P"), num(-1)), f)).toBe("negative");
    expect(signOf(op("mul", v("P"), v("z")), f)).toBe("nonnegative");
  });

  it("returns `unknown` as soon as one factor's sign is unknown", () => {
    expect(signOf(op("mul", v("P"), v("q")), f)).toBe("unknown");
    expect(signOf(op("div", v("q"), v("T")), f)).toBe("unknown");
  });

  it("adds known-sign quantities but refuses mixed signs", () => {
    expect(signOf(op("add", v("P"), v("z")), f)).toBe("positive");
    expect(signOf(op("add", v("z"), v("z")), f)).toBe("nonnegative");
    expect(signOf(op("add", v("P"), num(-1)), f)).toBe("unknown");
  });

  it("knows |x| and √x are nonnegative", () => {
    expect(
      signOf({ kind: "operator", op: "abs", symbol: "abs", args: [v("q")], path: "p" }, f),
    ).toBe("nonnegative");
    expect(signOf(app("Real.sqrt", "√", v("q")), f)).toBe("nonnegative");
  });

  it("knows exp is positive for any argument at all", () => {
    expect(signOf(app("Real.exp", "exp", v("P")), f)).toBe("positive");
    expect(signOf(app("Real.exp", "exp", v("q")), f)).toBe("positive");
    expect(signOf(app("Real.exp", "exp", num(-17)), f)).toBe("positive");
    expect(signOf(app("Real.exp", "exp", opaqueExpr("something")), f)).toBe("positive");
  });

  it("decides the sign of log applied to a numeric literal", () => {
    // Decidable without any hypothesis, which is what lets a bound whose
    // denominator contains `log 2` keep its parameter-sensitivity layer.
    expect(signOf(app("Real.log", "log", num(2)), f)).toBe("positive");
    expect(signOf(app("Real.log", "log", num(10)), f)).toBe("positive");
    expect(signOf(app("Real.log", "log", num(1)), f)).toBe("zero");
    expect(signOf(app("Real.log", "log", num(0.5)), f)).toBe("negative");
    expect(signOf(app("Real.log", "log", num(0.001)), f)).toBe("negative");
  });

  it("declines to sign log of a non-literal argument", () => {
    expect(signOf(app("Real.log", "log", v("x")), f)).toBe("unknown");
    // Even a variable known to be positive: log of it may be either sign.
    expect(signOf(app("Real.log", "log", v("P")), f)).toBe("unknown");
    expect(signOf(app("Real.log", "log", op("add", v("P"), num(1))), f)).toBe("unknown");
    expect(signOf(app("Real.log", "log", opaqueExpr("something")), f)).toBe("unknown");
  });

  it("declines to sign log at or below zero, where the mathlib convention is a trap", () => {
    // `Real.log 0 = 0` and `Real.log (-x) = Real.log x` in mathlib; guessing
    // from the literal's sign alone would be wrong.
    expect(signOf(app("Real.log", "log", num(0)), f)).toBe("unknown");
    expect(signOf(app("Real.log", "log", num(-2)), f)).toBe("unknown");
  });

  it("still says nothing about other named functions", () => {
    expect(signOf(app("Real.sin", "sin", v("P")), f)).toBe("unknown");
    expect(signOf(app("Real.cos", "cos", num(2)), f)).toBe("unknown");
    expect(signOf(app("Real.rpow", "rpow", v("P"), num(2)), f)).toBe("unknown");
  });

  it("propagates the new function signs through arithmetic", () => {
    // kB · T · log 2 with kB, T positive is now a positive denominator.
    const denominator = op("mul", op("mul", v("P"), v("T")), app("Real.log", "log", num(2)));
    expect(signOf(denominator, f)).toBe("positive");
    expect(signOf(op("div", v("P"), denominator), f)).toBe("positive");
  });

  it("returns `unknown` for opaque, constant and lambda expressions", () => {
    expect(signOf(opaqueExpr("Tendsto(…)"), f)).toBe("unknown");
    expect(signOf({ kind: "constant", name: "Real.pi", display: "π", path: "p" }, f)).toBe(
      "unknown",
    );
    expect(signOf({ kind: "lambda", parameter: "x", body: v("P"), path: "p" }, f)).toBe("unknown");
  });

  it("refuses to guess the sign of a subtraction", () => {
    // `P − T` with both positive is genuinely indeterminate.
    expect(signOf(op("sub", v("P"), v("T")), f)).toBe("unknown");
  });

  it("only calls a power positive when its base is known positive", () => {
    expect(signOf(op("pow", v("P"), num(2)), f)).toBe("positive");
    expect(signOf(op("pow", v("q"), num(2)), f)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// directionOf — the cases that must be answered
// ---------------------------------------------------------------------------

describe("directionOf on P / T with T positive", () => {
  const f = facts(["id:P", "positive"], ["id:T", "positive"]);
  const quotient = op("div", v("P"), v("T"));

  it("is increasing in P", () => {
    expect(directionOf(quotient, "id:P", f)).toBe("increasing");
  });

  it("is decreasing in T", () => {
    expect(directionOf(quotient, "id:T", f)).toBe("decreasing");
  });

  it("is constant in a variable it does not mention", () => {
    expect(directionOf(quotient, "id:x", f)).toBe("constant");
  });
});

describe("directionOf on a * x + b", () => {
  const affine = op("add", op("mul", v("a"), v("x")), v("b"));

  it("is increasing in x when a is positive", () => {
    expect(directionOf(affine, "id:x", facts(["id:a", "positive"]))).toBe("increasing");
  });

  it("is decreasing in x when a is negative", () => {
    expect(directionOf(affine, "id:x", facts(["id:a", "negative"]))).toBe("decreasing");
  });

  it("is `unknown` in x when a's sign is unknown", () => {
    expect(directionOf(affine, "id:x", facts())).toBe("unknown");
  });

  it("is `unknown` in x when a is merely nonnegative", () => {
    // `a = 0` makes the response constant, so "increasing" would be a lie.
    expect(directionOf(affine, "id:x", facts(["id:a", "nonnegative"]))).toBe("unknown");
  });

  it("is increasing in b regardless of a", () => {
    expect(directionOf(affine, "id:b", facts())).toBe("increasing");
  });
});

describe("directionOf on x / x", () => {
  it("is `unknown` when the variable appears on both sides of a division", () => {
    expect(directionOf(op("div", v("x"), v("x")), "id:x", facts(["id:x", "positive"]))).toBe(
      "unknown",
    );
  });

  it("is `unknown` when the variable appears on both sides of a multiplication", () => {
    expect(directionOf(op("mul", v("x"), v("x")), "id:x", facts(["id:x", "positive"]))).toBe(
      "unknown",
    );
  });
});

describe("directionOf on an expression that does not mention the variable", () => {
  it("is `constant`", () => {
    const f = facts(["id:P", "positive"], ["id:T", "positive"]);
    expect(directionOf(op("div", v("P"), v("T")), "id:zzz", f)).toBe("constant");
    expect(directionOf(num(7), "id:x", f)).toBe("constant");
    expect(directionOf(v("y"), "id:x", f)).toBe("constant");
    expect(directionOf(opaqueExpr("something"), "id:x", f)).toBe("constant");
  });
});

// ---------------------------------------------------------------------------
// directionOf — conservatism. These are the important ones.
// ---------------------------------------------------------------------------

describe("directionOf is conservative", () => {
  const enumerated: Array<{ what: string; expr: MathExpression; f: SignFacts }> = [
    {
      what: "a quotient whose denominator has no recorded sign",
      expr: op("div", v("x"), v("T")),
      f: facts(),
    },
    {
      what: "a quotient whose denominator is only nonnegative (it could be zero)",
      expr: op("div", v("x"), v("T")),
      f: facts(["id:T", "nonnegative"]),
    },
    {
      what: "a reciprocal whose numerator has no recorded sign",
      expr: op("div", v("k"), v("x")),
      f: facts(["id:x", "positive"]),
    },
    {
      what: "a reciprocal whose denominator is only nonnegative",
      expr: op("div", v("k"), v("x")),
      f: facts(["id:k", "positive"], ["id:x", "nonnegative"]),
    },
    {
      what: "a product whose coefficient has no recorded sign",
      expr: op("mul", v("a"), v("x")),
      f: facts(),
    },
    {
      what: "a product whose coefficient is only nonnegative",
      expr: op("mul", v("a"), v("x")),
      f: facts(["id:a", "nonnegative"]),
    },
    {
      what: "a product whose coefficient is only nonpositive",
      expr: op("mul", v("a"), v("x")),
      f: facts(["id:a", "nonpositive"]),
    },
    {
      what: "a coefficient that is itself a compound of indeterminate sign",
      expr: op("mul", op("sub", v("a"), v("b")), v("x")),
      f: facts(["id:a", "positive"], ["id:b", "positive"]),
    },
    {
      what: "a variable appearing in both operands of a product",
      expr: op("mul", v("x"), v("x")),
      f: facts(["id:x", "positive"]),
    },
    {
      what: "a variable appearing in both operands of a quotient",
      expr: op("div", op("add", v("x"), v("a")), v("x")),
      f: facts(["id:x", "positive"]),
    },
    {
      what: "a sum in which one summand's direction is unknown",
      expr: op("add", v("x"), op("mul", v("a"), v("x"))),
      f: facts(),
    },
    {
      what: "a function application, even a familiar monotone one",
      expr: app("Real.log", "log", v("x")),
      f: facts(["id:x", "positive"]),
    },
    {
      what: "a square root, whose sign is known but whose direction is not asserted",
      expr: app("Real.sqrt", "√", v("x")),
      f: facts(["id:x", "positive"]),
    },
    {
      what: "a modulus, which the rules do not cover",
      expr: op("mod", v("x"), v("y")),
      f: facts(["id:x", "positive"], ["id:y", "positive"]),
    },
    {
      what: "a power, which the rules do not cover",
      expr: op("pow", v("x"), num(2)),
      f: facts(["id:x", "positive"]),
    },
    {
      what: "an inverse, which the rules do not cover",
      expr: op("inv", v("x")),
      f: facts(["id:x", "positive"]),
    },
    {
      what: "an absolute value, which is not monotone",
      expr: { kind: "operator", op: "abs", symbol: "abs", args: [v("x")], path: "p" },
      f: facts(),
    },
  ];

  for (const { what, expr, f } of enumerated) {
    it(`returns \`unknown\` rather than guessing for ${what}`, () => {
      expect(directionOf(expr, "id:x", f)).toBe("unknown");
    });
  }

  it("never invents a direction for a variable whose sign is unrecorded anywhere", () => {
    const shapes = [
      op("div", v("a"), v("x")),
      op("mul", v("a"), v("x")),
      op("div", v("x"), v("a")),
      op("mul", op("div", v("a"), v("b")), v("x")),
    ];
    for (const shape of shapes) {
      expect(directionOf(shape, "id:x", facts())).toBe("unknown");
    }
  });

  it("returns a direction only from `increasing`, `decreasing`, `constant`, `unknown`", () => {
    const allowed: Direction[] = ["increasing", "decreasing", "constant", "unknown"];
    for (const { expr, f } of enumerated) {
      expect(allowed).toContain(directionOf(expr, "id:x", f));
      expect(allowed).toContain(directionOf(expr, "id:y", f));
    }
  });

  it("handles the k / x shape only when both numerator and denominator are strictly signed", () => {
    expect(
      directionOf(
        op("div", v("k"), v("x")),
        "id:x",
        facts(["id:k", "positive"], ["id:x", "positive"]),
      ),
    ).toBe("decreasing");
    expect(
      directionOf(
        op("div", v("k"), v("x")),
        "id:x",
        facts(["id:k", "negative"], ["id:x", "positive"]),
      ),
    ).toBe("increasing");
  });

  it("cancels a sum that genuinely does not move, rather than calling it unknown", () => {
    // x + (−1)·x really is constant in x; conservatism is not the same as
    // refusing to do arithmetic it can actually do.
    expect(directionOf(op("add", v("x"), op("mul", num(-1), v("x"))), "id:x", facts())).toBe(
      "constant",
    );
    expect(directionOf(op("sub", v("x"), v("x")), "id:x", facts())).toBe("constant");
  });

  it("flips correctly through negation", () => {
    expect(directionOf(op("neg", v("x")), "id:x", facts())).toBe("decreasing");
    expect(directionOf(op("neg", op("neg", v("x"))), "id:x", facts())).toBe("increasing");
  });

  /**
   * A variable that only survives inside an `opaque` display is invisible to
   * `mentions`, so `directionOf` calls the expression `constant` in it — an
   * affirmative claim it is not entitled to make.
   *
   * It never reaches a reader today: `classifyBounds` drops every `constant`
   * and `unknown` entry before building the sensitivity payload, and the
   * explanation layer only reads that payload. The test pins the current
   * behaviour, and the filter below is what makes it harmless.
   */
  it("calls an opaque bound `constant` in a variable it cannot see (latent, and filtered out downstream)", () => {
    const bound = opaqueExpr("energyBudget(P, t)", "ProofLens.Examples.energyBudget");
    expect(directionOf(bound, "id:P", facts(["id:P", "positive"]))).toBe("constant");
  });

  it("reports no sensitivity at all for a corpus bound that is opaque", () => {
    const math = lowerDocument(corpus());
    const t = math.theorems.find((x) => x.name.endsWith(".energyBudget_pos"))!;
    const upper = classifyTheorem(t).find((c) => c.payload.kind === "upper-bound")!;
    expect((upper.payload.data as { sensitivity: unknown[] }).sensitivity).toEqual([]);
  });

  it("reports the corpus bound P / T as increasing in P and decreasing in T", () => {
    const math = lowerDocument(corpus());
    const t = math.theorems.find((x) => x.name.endsWith(".simple_upper_bound"))!;
    const f = signFactsOf(t);
    const rhs = (t.conclusion.value as { rhs: MathExpression }).rhs;
    const id = (symbol: string) => t.variables.find((x) => x.symbol === symbol)!.id;
    expect(directionOf(rhs, id("P"), f)).toBe("increasing");
    expect(directionOf(rhs, id("T"), f)).toBe("decreasing");
    expect(directionOf(rhs, id("x"), f)).toBe("constant");
  });

  it("ranks the Landauer bound in all four of its parameters", () => {
    // `P · D / (kB · T · log 2)`. The positivity of `log 2` comes from the
    // literal argument — `signOf` decides it outright — rather than from any
    // hypothesis this theorem states. Without that the whole denominator is
    // sign-unknown and the bound loses its parameter-sensitivity layer.
    const math = lowerDocument(corpus());
    const t = math.theorems.find((x) => x.name.endsWith(".information_rate_bound"))!;
    const f = signFactsOf(t);
    const rhs = (t.conclusion.value as { rhs: MathExpression }).rhs;
    const id = (symbol: string) => t.variables.find((x) => x.symbol === symbol)!.id;

    expect(directionOf(rhs, id("P"), f)).toBe("increasing");
    expect(directionOf(rhs, id("D"), f)).toBe("increasing");
    expect(directionOf(rhs, id("T"), f)).toBe("decreasing");
    expect(directionOf(rhs, id("kB"), f)).toBe("decreasing");

    // `N` and `t` genuinely do not appear in the bound: that is the physics.
    expect(directionOf(rhs, id("N"), f)).toBe("constant");
    expect(directionOf(rhs, id("t"), f)).toBe("constant");
  });

  it("carries those four directions into the upper-bound classification", () => {
    const math = lowerDocument(corpus());
    const t = math.theorems.find((x) => x.name.endsWith(".information_rate_bound"))!;
    const upper = classifyTheorem(t).find((c) => c.payload.kind === "upper-bound")!;
    expect(
      (upper.payload.data as { sensitivity: Array<{ symbol: string; direction: string }> })
        .sensitivity,
    ).toEqual([
      {
        variableId: t.variables.find((v) => v.symbol === "P")!.id,
        symbol: "P",
        direction: "increasing",
      },
      {
        variableId: t.variables.find((v) => v.symbol === "T")!.id,
        symbol: "T",
        direction: "decreasing",
      },
      {
        variableId: t.variables.find((v) => v.symbol === "kB")!.id,
        symbol: "kB",
        direction: "decreasing",
      },
      {
        variableId: t.variables.find((v) => v.symbol === "D")!.id,
        symbol: "D",
        direction: "increasing",
      },
    ]);
  });

  it("still declines where the sign genuinely is not settled", () => {
    // `div_upper_bound` states `0 < T` but says nothing about `P`, so the
    // reciprocal direction in `T` stays unknown even though `P / T` is the same
    // shape that `simple_upper_bound` ranks in both parameters.
    const math = lowerDocument(corpus());
    const t = math.theorems.find((x) => x.name.endsWith(".div_upper_bound"))!;
    const f = signFactsOf(t);
    const rhs = (t.conclusion.value as { rhs: MathExpression }).rhs;
    const id = (symbol: string) => t.variables.find((x) => x.symbol === symbol)!.id;
    expect(directionOf(rhs, id("P"), f)).toBe("increasing");
    expect(directionOf(rhs, id("T"), f)).toBe("unknown");
  });
});

describe("DIRECTION_PHRASE", () => {
  it("has a phrase for every direction", () => {
    for (const direction of ["increasing", "decreasing", "constant", "unknown"] as Direction[]) {
      expect(DIRECTION_PHRASE[direction].length).toBeGreaterThan(0);
    }
  });

  it("phrases `unknown` as an admission rather than a claim", () => {
    expect(DIRECTION_PHRASE.unknown).toMatch(/cannot determine/);
  });
});
