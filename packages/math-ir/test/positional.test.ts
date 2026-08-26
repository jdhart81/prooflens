/**
 * Positional constants and the grown constant tables.
 *
 * `DFunLike.coe` and `Function.comp` carry their interesting argument at a
 * fixed index rather than at the end, so every use is guarded on the argument
 * count. Those guards are the point: a Lean signature change must degrade to
 * `opaque`, never to a confidently wrong reading of whichever argument happens
 * to sit at that index afterwards.
 */
import { describe, expect, it } from "vitest";
import type { FormalExprNode } from "@prooflens/formal-ir";
import {
  NAMED_FUNCTIONS,
  POSITIONAL,
  PREDICATES,
  TRANSPARENT,
  containsOpaque,
  lowerExpression,
  lowerProposition,
  renderExpression,
  renderProposition,
  type MathExpression,
  type MathProposition,
} from "@prooflens/math-ir";

const c = (name: string): FormalExprNode => ({ kind: "const", name, levels: [] });
const fv = (name: string): FormalExprNode => ({ kind: "fvar", name, fvarId: `_uniq.${name}` });
const app = (name: string, ...args: FormalExprNode[]): FormalExprNode => ({
  kind: "app",
  fn: c(name),
  args,
});

function lower(node: FormalExprNode): MathExpression {
  return lowerExpression(node, "e");
}

// ---------------------------------------------------------------------------
// DFunLike.coe
// ---------------------------------------------------------------------------

describe("DFunLike.coe", () => {
  it("is registered as a coercion at index 4", () => {
    expect(POSITIONAL["DFunLike.coe"]).toEqual({ kind: "coercion", index: 4 });
    expect(POSITIONAL["FunLike.coe"]).toEqual({ kind: "coercion", index: 4 });
  });

  it("is transparent when the coerced function is not applied to anything", () => {
    // `⇑f` on its own is just `f`.
    const expr = lower(app("DFunLike.coe", c("F"), c("α"), c("β"), c("inst"), fv("f")));
    expect(expr.kind).toBe("variable");
    expect(renderExpression(expr)).toBe("f");
  });

  it("becomes an application of the coerced function when it is applied", () => {
    const expr = lower(app("DFunLike.coe", c("F"), c("α"), c("β"), c("inst"), fv("f"), fv("x")));
    expect(expr.kind).toBe("application");
    const applied = expr as Extract<MathExpression, { kind: "application" }>;
    expect(applied.display).toBe("f");
    expect(applied.args).toHaveLength(1);
    expect(renderExpression(expr)).toBe("f(x)");
  });

  it("carries several applied arguments through", () => {
    const expr = lower(
      app("DFunLike.coe", c("F"), c("α"), c("β"), c("inst"), fv("f"), fv("x"), fv("y")),
    );
    expect(renderExpression(expr)).toBe("f(x, y)");
  });

  it("lowers the coerced function itself, not just its name", () => {
    const composed = app("Function.comp", c("α"), c("β"), c("γ"), fv("g"), fv("h"));
    const expr = lower(app("DFunLike.coe", c("F"), c("α"), c("β"), c("inst"), composed, fv("x")));
    expect(renderExpression(expr)).toBe("g ∘ h(x)");
  });

  it("degrades to `opaque` when there are too few arguments to reach index 4", () => {
    // The guard is what stops ProofLens reading argument 4 of a signature that
    // no longer has one.
    for (let n = 0; n <= 4; n += 1) {
      const truncated: FormalExprNode = {
        kind: "app",
        fn: c("DFunLike.coe"),
        args: [c("F"), c("α"), c("β"), c("inst")].slice(0, n),
      };
      const expr = lower(truncated);
      expect(expr.kind, `${n} args`).toBe("opaque");
      expect((expr as Extract<MathExpression, { kind: "opaque" }>).head, `${n} args`).toBe(
        "DFunLike.coe",
      );
    }
  });

  it("never silently reads the wrong argument at a shorter arity", () => {
    // Four arguments: index 4 does not exist. A reading of `inst` would be wrong.
    const expr = lower(app("DFunLike.coe", c("F"), c("α"), c("β"), fv("notTheFunction")));
    expect(expr.kind).toBe("opaque");
    expect(containsOpaque(expr)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Function.comp
// ---------------------------------------------------------------------------

describe("Function.comp", () => {
  it("is registered as a composition at index 3", () => {
    expect(POSITIONAL["Function.comp"]).toEqual({ kind: "composition", index: 3 });
  });

  it("becomes a `comp` operator", () => {
    const expr = lower(app("Function.comp", c("α"), c("β"), c("γ"), fv("f"), fv("g")));
    expect(expr.kind).toBe("operator");
    const operator = expr as Extract<MathExpression, { kind: "operator" }>;
    expect(operator.op).toBe("comp");
    expect(operator.symbol).toBe("∘");
    expect(renderExpression(expr)).toBe("f ∘ g");
  });

  it("keeps the operands in Lean's order — `f ∘ g` applies `g` first", () => {
    const expr = lower(app("Function.comp", c("α"), c("β"), c("γ"), fv("outer"), fv("inner")));
    const operator = expr as Extract<MathExpression, { kind: "operator" }>;
    expect(renderExpression(operator.args[0]!)).toBe("outer");
    expect(renderExpression(operator.args[1]!)).toBe("inner");
  });

  it("becomes an application of the composition when applied to an argument", () => {
    const expr = lower(app("Function.comp", c("α"), c("β"), c("γ"), fv("f"), fv("g"), fv("x")));
    expect(expr.kind).toBe("application");
    expect(renderExpression(expr)).toBe("f ∘ g(x)");
  });

  it("nests", () => {
    const inner = app("Function.comp", c("α"), c("β"), c("γ"), fv("g"), fv("h"));
    const expr = lower(app("Function.comp", c("α"), c("β"), c("γ"), fv("f"), inner));
    expect(renderExpression(expr)).toBe("f ∘ (g ∘ h)");
  });

  it("degrades to `opaque` when there are too few arguments to reach index 3", () => {
    for (let n = 0; n <= 3; n += 1) {
      const truncated: FormalExprNode = {
        kind: "app",
        fn: c("Function.comp"),
        args: [c("α"), c("β"), c("γ")].slice(0, n),
      };
      expect(lower(truncated).kind, `${n} args`).toBe("opaque");
    }
  });

  it("degrades to `opaque` when the second operand is missing", () => {
    // Index 3 exists but index 4 does not: a one-sided composition is not one.
    const expr = lower(app("Function.comp", c("α"), c("β"), c("γ"), fv("f")));
    expect(expr.kind).toBe("opaque");
    expect((expr as Extract<MathExpression, { kind: "opaque" }>).head).toBe("Function.comp");
  });
});

// ---------------------------------------------------------------------------
// Transparency
// ---------------------------------------------------------------------------

describe("Decidable.decide", () => {
  it("is transparent at argument 0", () => {
    expect(TRANSPARENT["Decidable.decide"]).toEqual({ argIndex: 0 });
  });

  it("is seen through to the proposition it wraps", () => {
    const expr = lower(app("Decidable.decide", fv("p"), c("inst")));
    expect(renderExpression(expr)).toBe("p");
    expect(expr.kind).toBe("variable");
  });
});

describe("OrderDual.toDual is named, not transparent", () => {
  it("is absent from the transparent table", () => {
    // Hiding it would silently turn a statement about the dual order into a
    // statement about the original one — the same expression, the opposite
    // mathematics.
    expect(TRANSPARENT["OrderDual.toDual"]).toBeUndefined();
    expect(TRANSPARENT["OrderDual.ofDual"]).toBeUndefined();
  });

  it("is a named function that stays visible in the rendering", () => {
    expect(NAMED_FUNCTIONS["OrderDual.toDual"]).toEqual({ display: "toDual", valueArity: 1 });
    const expr = lower(app("OrderDual.toDual", c("α"), fv("x")));
    expect(renderExpression(expr)).toBe("toDual(x)");
    expect(renderExpression(expr)).not.toBe("x");
  });

  it("keeps `ofDual` visible too", () => {
    const expr = lower(app("OrderDual.ofDual", c("α"), fv("x")));
    expect(renderExpression(expr)).toBe("ofDual(x)");
  });

  it("survives inside a larger statement rather than vanishing", () => {
    const prop = lowerProposition(
      app(
        "Monotone",
        c("α"),
        c("β"),
        c("inst"),
        c("inst2"),
        app("OrderDual.toDual", c("α"), fv("f")),
      ),
      "conclusion",
    );
    expect(renderProposition(prop)).toContain("toDual");
  });
});

// ---------------------------------------------------------------------------
// Table growth
// ---------------------------------------------------------------------------

describe("the grown NAMED_FUNCTIONS table", () => {
  const cases: Array<[string, number, string]> = [
    ["Finset.sum", 2, "∑"],
    ["Finset.prod", 2, "∏"],
    ["tsum", 1, "∑'"],
    ["Finset.card", 1, "card"],
    ["Max.max", 2, "max"],
    ["Min.min", 2, "min"],
    ["Dist.dist", 2, "dist"],
  ];

  for (const [name, arity, display] of cases) {
    it(`renders \`${name}\` as \`${display}\``, () => {
      const entry = NAMED_FUNCTIONS[name];
      expect(entry, name).toBeDefined();
      expect(entry!.display).toBe(display);
      expect(entry!.valueArity).toBe(arity);

      const args = Array.from({ length: arity }, (_, i) => fv(`a${i}`));
      const expr = lower(app(name, c("α"), c("inst"), ...args));
      expect(expr.kind).toBe("application");
      expect(renderExpression(expr).startsWith(display)).toBe(true);
    });
  }

  it("registers every interval constructor", () => {
    for (const name of [
      "Set.Icc",
      "Set.Ico",
      "Set.Ioc",
      "Set.Ioo",
      "Set.Iic",
      "Set.Iio",
      "Set.Ici",
      "Set.Ioi",
    ]) {
      expect(NAMED_FUNCTIONS[name], name).toBeDefined();
      expect(NAMED_FUNCTIONS[name]!.display.length, name).toBeGreaterThan(0);
    }
  });

  it("degrades a named function to `opaque` when its arity is not met", () => {
    for (const [name, arity] of cases) {
      if (arity === 0) continue;
      const tooFew = Array.from({ length: arity - 1 }, (_, i) => fv(`a${i}`));
      const expr = lowerExpression({ kind: "app", fn: c(name), args: tooFew }, "e");
      expect(expr.kind, `${name} with ${arity - 1} args`).toBe("opaque");
    }
  });

  it("gives every entry a non-empty display and a sane arity", () => {
    for (const [name, entry] of Object.entries(NAMED_FUNCTIONS)) {
      expect(entry.display.trim().length, name).toBeGreaterThan(0);
      expect(entry.valueArity, name).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the grown PREDICATES table", () => {
  it("adds the on-a-set monotonicity variants with the right direction", () => {
    expect(PREDICATES["StrictMonoOn"]?.predicate).toBe("strictly-monotone");
    expect(PREDICATES["StrictAntiOn"]?.predicate).toBe("strictly-antitone");
  });

  const named = [
    "Summable",
    "HasSum",
    "Continuous",
    "ContinuousAt",
    "ContinuousOn",
    "ContinuousWithinAt",
    "CauchySeq",
    "Differentiable",
    "DifferentiableAt",
    "HasDerivAt",
    "Real.HolderConjugate",
    "Set.InjOn",
    "Set.SurjOn",
    "IsLUB",
    "IsGLB",
    "IsMax",
    "IsMin",
  ];

  for (const name of named) {
    it(`registers \`${name}\` as a named property`, () => {
      const entry = PREDICATES[name];
      expect(entry, name).toBeDefined();
      expect(entry!.predicate).toBe("other");
      expect(entry!.label.trim().length).toBeGreaterThan(0);
    });
  }

  it("lowers a named property to a `predicate` proposition with its subject", () => {
    const prop = lowerProposition(
      app("Continuous", c("α"), c("β"), c("inst"), fv("f")),
      "conclusion",
    );
    expect(prop.kind).toBe("predicate");
    const predicate = prop as Extract<MathProposition, { kind: "predicate" }>;
    expect(predicate.name).toBe("Continuous");
    expect(predicate.predicate).toBe("other");
    expect(renderExpression(predicate.subject!)).toBe("f");
  });

  it("shortens a namespaced predicate for display but keeps the table key long", () => {
    const prop = lowerProposition(app("Set.InjOn", c("α"), c("β"), fv("f"), fv("s")), "conclusion");
    expect((prop as Extract<MathProposition, { kind: "predicate" }>).name).toBe("InjOn");
  });

  it("leaves a predicate absent from the table opaque", () => {
    // The table is the gate. Anything not in it must stay unreadable, so the
    // backlog keeps reporting it.
    for (const name of ["Function.Injective", "Function.Surjective", "Filter.EventuallyEq"]) {
      expect(PREDICATES[name], name).toBeUndefined();
      const prop = lowerProposition(app(name, c("α"), c("β"), fv("f")), "conclusion");
      expect(prop.kind, name).toBe("opaque");
      expect((prop as Extract<MathProposition, { kind: "opaque" }>).head, name).toBe(name);
    }
  });

  it("gives every entry a label and a valid predicate kind", () => {
    const kinds = [
      "monotone",
      "strictly-monotone",
      "antitone",
      "strictly-antitone",
      "positive",
      "nonnegative",
      "other",
    ];
    for (const [name, entry] of Object.entries(PREDICATES)) {
      expect(kinds, name).toContain(entry.predicate);
      expect(entry.label.trim().length, name).toBeGreaterThan(0);
      expect(entry.valueArity, name).toBeGreaterThanOrEqual(1);
    }
  });
});
