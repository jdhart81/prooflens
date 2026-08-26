/**
 * The proposition kinds added for the mathlib slice: `limit`, `existential`,
 * `conjunction` and `membership`.
 *
 * Each is checked at three layers — lowering from Lean, rendering to text, and
 * traversal — because a kind that lowers but does not traverse silently drops
 * out of coverage analysis, and one that lowers but does not render shows a
 * reader nothing.
 */
import { describe, expect, it } from "vitest";
import type { FormalExprNode } from "@prooflens/formal-ir";
import {
  FILTERS,
  lowerProposition,
  renderProposition,
  variablesInProposition,
  walkProposition,
  type MathExpression,
  type MathProposition,
} from "@prooflens/math-ir";

// --- Lean-shaped node builders --------------------------------------------

const c = (name: string): FormalExprNode => ({ kind: "const", name, levels: [] });
const fv = (name: string, id = `_uniq.${name}`): FormalExprNode => ({
  kind: "fvar",
  name,
  fvarId: id,
});
const app = (name: string, ...args: FormalExprNode[]): FormalExprNode => ({
  kind: "app",
  fn: c(name),
  args,
});
const lam = (binderName: string, body: FormalExprNode): FormalExprNode => ({
  kind: "lam",
  binderName,
  binderInfo: "default",
  binderType: c("Real"),
  body,
});
/** `a < b` over the reals, with Lean's carrier and instance arguments. */
const lt = (a: FormalExprNode, b: FormalExprNode): FormalExprNode =>
  app("LT.lt", c("Real"), c("Real.instLT"), a, b);
const nat = (value: number): FormalExprNode => ({ kind: "lit", litKind: "nat", value });

function lower(node: FormalExprNode): MathProposition {
  return lowerProposition(node, "conclusion");
}

// ---------------------------------------------------------------------------
// limit
// ---------------------------------------------------------------------------

/** `Filter.Tendsto {α β} f l₁ l₂` — five arguments, the last three meaningful. */
function tendsto(
  f: FormalExprNode,
  source: FormalExprNode,
  target: FormalExprNode,
): FormalExprNode {
  return app("Filter.Tendsto", c("Nat"), c("Real"), f, source, target);
}

describe("limit propositions", () => {
  it("lowers `Filter.Tendsto f atTop (nhds L)` to a limit", () => {
    const prop = lower(tendsto(fv("f"), c("Filter.atTop"), app("nhds", c("Real"), fv("L"))));
    expect(prop.kind).toBe("limit");
    const limit = prop as Extract<MathProposition, { kind: "limit" }>;
    expect(limit.subject.kind).toBe("variable");
    expect(limit.source.kind).toBe("at-top");
    expect(limit.target.kind).toBe("neighbourhood");
  });

  it("names `atTop` and `atBot` with their conventional symbols", () => {
    const top = lower(tendsto(fv("f"), c("Filter.atTop"), c("Filter.atTop")));
    const source = (top as Extract<MathProposition, { kind: "limit" }>).source;
    expect(source.display).toBe("+∞");
    expect(source.label).toBe("grows without bound");

    const bot = lower(tendsto(fv("f"), c("Filter.atBot"), c("Filter.atBot")));
    const target = (bot as Extract<MathProposition, { kind: "limit" }>).target;
    expect(target.kind).toBe("at-bot");
    expect(target.display).toBe("−∞");
    expect(target.label).toBe("decreases without bound");
  });

  it("carries the limit point out of `nhds`", () => {
    const prop = lower(
      tendsto(fv("f"), c("Filter.atTop"), app("nhds", c("Real"), c("Real.instTopology"), fv("L"))),
    );
    const limit = prop as Extract<MathProposition, { kind: "limit" }>;
    expect(limit.target.point).not.toBeNull();
    expect(limit.target.display).toBe("L");
    expect((limit.target.point as MathExpression).kind).toBe("variable");
  });

  it("describes the other filters in the table", () => {
    for (const [name, expected] of [
      ["Filter.cofinite", "outside any finite set"],
      ["Filter.cocompact", "outside any compact set"],
    ] as const) {
      const prop = lower(tendsto(fv("f"), c(name), c("Filter.atTop")));
      expect((prop as Extract<MathProposition, { kind: "limit" }>).source.label).toBe(expected);
    }
  });

  it("degrades an unknown filter honestly rather than guessing", () => {
    const prop = lower(tendsto(fv("f"), app("Filter.principal", fv("s")), c("Filter.atTop")));
    const limit = prop as Extract<MathProposition, { kind: "limit" }>;
    expect(limit.source.kind).toBe("unknown");
    expect(limit.source.label).toBe("an unnamed filter");
    expect(limit.source.point).toBeNull();
    // The structure is still shown; only the description is withheld.
    expect(limit.source.display.length).toBeGreaterThan(0);
  });

  it("covers every filter in the FILTERS table", () => {
    for (const name of Object.keys(FILTERS)) {
      const filterNode = FILTERS[name]!.pointIndex === null ? c(name) : app(name, fv("x"), fv("y"));
      const prop = lower(tendsto(fv("f"), filterNode, c("Filter.atTop")));
      expect(prop.kind, name).toBe("limit");
      expect((prop as Extract<MathProposition, { kind: "limit" }>).source.kind, name).not.toBe(
        "unknown",
      );
    }
  });

  it("stays opaque when Lean hands over too few arguments", () => {
    // A signature change must degrade to `opaque`, never to a wrong reading.
    for (let n = 0; n < 5; n += 1) {
      const truncated: FormalExprNode = {
        kind: "app",
        fn: c("Filter.Tendsto"),
        args: [c("Nat"), c("Real"), fv("f"), c("Filter.atTop")].slice(0, n),
      };
      expect(lower(truncated).kind, `${n} args`).toBe("opaque");
    }
  });

  it("renders as an arrow naming both filters", () => {
    const prop = lower(tendsto(fv("f"), c("Filter.atTop"), app("nhds", c("Real"), fv("L"))));
    expect(renderProposition(prop)).toBe("f ⟶ L (along +∞)");
  });

  it("collects variables from the subject and from both filter points", () => {
    const prop = lower(
      tendsto(fv("f"), app("nhds", c("Real"), fv("a")), app("nhds", c("Real"), fv("b"))),
    );
    const ids = variablesInProposition(prop);
    expect(ids.size).toBe(3);
    expect([...ids].sort()).toEqual(["_uniq.a", "_uniq.b", "_uniq.f"]);
  });

  it("walks the subject and both filter points", () => {
    const prop = lower(
      tendsto(fv("f"), app("nhds", c("Real"), fv("a")), app("nhds", c("Real"), fv("b"))),
    );
    const walked = [...walkProposition(prop)];
    expect(walked[0]).toBe(prop);
    expect(walked.filter((n) => n.kind === "variable")).toHaveLength(3);
  });

  it("walks nothing extra when neither filter has a point", () => {
    const prop = lower(tendsto(fv("f"), c("Filter.atTop"), c("Filter.atBot")));
    expect([...walkProposition(prop)]).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// existential
// ---------------------------------------------------------------------------

describe("existential propositions", () => {
  const exists = (binder: string, body: FormalExprNode): FormalExprNode =>
    app("Exists", c("Real"), lam(binder, body));

  it("lowers `Exists` with a lambda predicate", () => {
    const prop = lower(exists("x", lt(nat(0), fv("x"))));
    expect(prop.kind).toBe("existential");
    const existential = prop as Extract<MathProposition, { kind: "existential" }>;
    expect(existential.binder).toBe("x");
    expect(existential.body.kind).toBe("relation");
  });

  it("carries the binder name through as the reader's name for the witness", () => {
    for (const name of ["x", "n", "ε", "witness"]) {
      const prop = lower(exists(name, lt(nat(0), fv("y"))));
      expect((prop as Extract<MathProposition, { kind: "existential" }>).binder).toBe(name);
    }
  });

  it("renders with the existential quantifier", () => {
    expect(renderProposition(lower(exists("x", lt(nat(0), fv("x")))))).toBe("∃ x, 0 < x");
  });

  it("nests", () => {
    const inner = exists("y", lt(fv("y"), fv("z")));
    const prop = lower(exists("x", inner));
    expect(renderProposition(prop)).toBe("∃ x, ∃ y, y < z");
  });

  it("stays opaque when the predicate argument is not a lambda", () => {
    // `Exists p` with `p` a bare function has no binder name to report.
    const prop = lower(app("Exists", c("Real"), fv("p")));
    expect(prop.kind).toBe("opaque");
  });

  it("stays opaque when Lean hands over too few arguments", () => {
    expect(lower(app("Exists", c("Real"))).kind).toBe("opaque");
    expect(lower(app("Exists")).kind).toBe("opaque");
  });

  it("walks and collects variables from the body", () => {
    const prop = lower(exists("x", lt(fv("a"), fv("b"))));
    expect([...variablesInProposition(prop)].sort()).toEqual(["_uniq.a", "_uniq.b"]);
    const walked = [...walkProposition(prop)];
    expect(walked[0]).toBe(prop);
    expect(walked.filter((n) => n.kind === "variable")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// conjunction
// ---------------------------------------------------------------------------

describe("conjunction propositions", () => {
  const and = (a: FormalExprNode, b: FormalExprNode): FormalExprNode => app("And", a, b);

  it("lowers `And a b` to two conjuncts", () => {
    const prop = lower(and(lt(nat(0), fv("x")), lt(nat(0), fv("y"))));
    expect(prop.kind).toBe("conjunction");
    expect((prop as Extract<MathProposition, { kind: "conjunction" }>).conjuncts).toHaveLength(2);
  });

  it("flattens a right-nested chain into one list", () => {
    // `A ∧ (B ∧ C)` is three facts to a reader, not a tree of two.
    const prop = lower(and(lt(nat(0), fv("a")), and(lt(nat(0), fv("b")), lt(nat(0), fv("c")))));
    const conjunction = prop as Extract<MathProposition, { kind: "conjunction" }>;
    expect(conjunction.conjuncts).toHaveLength(3);
    expect(conjunction.conjuncts.every((x) => x.kind === "relation")).toBe(true);
    expect(renderProposition(prop)).toBe("0 < a ∧ 0 < b ∧ 0 < c");
  });

  it("flattens a left-nested chain too", () => {
    const prop = lower(and(and(lt(nat(0), fv("a")), lt(nat(0), fv("b"))), lt(nat(0), fv("c"))));
    expect((prop as Extract<MathProposition, { kind: "conjunction" }>).conjuncts).toHaveLength(3);
  });

  it("flattens a deep chain to a flat list of five", () => {
    const chain = and(
      lt(nat(0), fv("a")),
      and(
        lt(nat(0), fv("b")),
        and(lt(nat(0), fv("c")), and(lt(nat(0), fv("d")), lt(nat(0), fv("e")))),
      ),
    );
    const conjunction = lower(chain) as Extract<MathProposition, { kind: "conjunction" }>;
    expect(conjunction.conjuncts).toHaveLength(5);
    // No conjunct is itself a conjunction — that is what flattening means.
    expect(conjunction.conjuncts.some((x) => x.kind === "conjunction")).toBe(false);
  });

  it("keeps the conjuncts in source order", () => {
    const prop = lower(and(lt(nat(0), fv("a")), and(lt(nat(0), fv("b")), lt(nat(0), fv("c")))));
    expect(renderProposition(prop)).toBe("0 < a ∧ 0 < b ∧ 0 < c");
  });

  it("stays opaque when Lean hands over too few arguments", () => {
    expect(lower(app("And", lt(nat(0), fv("a")))).kind).toBe("opaque");
    expect(lower(app("And")).kind).toBe("opaque");
  });

  it("walks and collects variables from every conjunct", () => {
    const prop = lower(and(lt(nat(0), fv("a")), and(lt(nat(0), fv("b")), lt(nat(0), fv("c")))));
    expect([...variablesInProposition(prop)].sort()).toEqual(["_uniq.a", "_uniq.b", "_uniq.c"]);
    const walked = [...walkProposition(prop)];
    expect(walked[0]).toBe(prop);
    expect(walked.filter((n) => n.kind === "relation")).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// membership
// ---------------------------------------------------------------------------

describe("membership propositions", () => {
  /** `Membership.mem {γ α} [inst] (s : γ) (a : α)` — collection first. */
  const mem = (collection: FormalExprNode, element: FormalExprNode): FormalExprNode =>
    app("Membership.mem", c("Set"), c("Real"), c("Set.instMembership"), collection, element);

  it("puts the element on the left, though Lean puts the collection first", () => {
    // Getting this backwards would be a silently wrong reading: `s ∈ a`.
    const prop = lower(mem(fv("s"), fv("a")));
    expect(prop.kind).toBe("membership");
    const membership = prop as Extract<MathProposition, { kind: "membership" }>;
    expect((membership.element as { symbol: string }).symbol).toBe("a");
    expect((membership.collection as { symbol: string }).symbol).toBe("s");
  });

  it("renders as `a ∈ s`", () => {
    expect(renderProposition(lower(mem(fv("s"), fv("a"))))).toBe("a ∈ s");
  });

  it("keeps the order when the element is a compound expression", () => {
    const sum = app("HAdd.hAdd", c("Real"), c("Real"), c("Real"), c("instHAdd"), fv("x"), fv("y"));
    const interval = app("Set.Icc", c("Real"), c("inst"), nat(0), nat(1));
    const rendered = renderProposition(lower(mem(interval, sum)));
    expect(rendered.startsWith("x + y ∈ ")).toBe(true);
    // Intervals fill their placeholders rather than being called: `[0, 1]`,
    // not `[·, ·](0, 1)`.
    expect(rendered).toContain("[0, 1]");
    // The element side is what this test is about; the interval's own notation
    // is covered in the named-functions tests.
    expect(rendered).not.toMatch(/^\[/);
  });

  it("stays opaque when Lean hands over too few arguments", () => {
    expect(lower(app("Membership.mem", fv("s"))).kind).toBe("opaque");
    expect(lower(app("Membership.mem")).kind).toBe("opaque");
  });

  it("walks and collects variables from both sides", () => {
    const prop = lower(mem(fv("s"), fv("a")));
    expect([...variablesInProposition(prop)].sort()).toEqual(["_uniq.a", "_uniq.s"]);
    const walked = [...walkProposition(prop)];
    expect(walked[0]).toBe(prop);
    expect(walked.filter((n) => n.kind === "variable")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting
// ---------------------------------------------------------------------------

describe("every new proposition kind", () => {
  const samples: Array<[string, MathProposition]> = [
    ["limit", lower(tendsto(fv("f"), c("Filter.atTop"), app("nhds", c("Real"), fv("L"))))],
    ["existential", lower(app("Exists", c("Real"), lam("x", lt(nat(0), fv("x")))))],
    ["conjunction", lower(app("And", lt(nat(0), fv("a")), lt(nat(0), fv("b"))))],
    ["membership", lower(app("Membership.mem", c("Set"), c("Real"), c("inst"), fv("s"), fv("a")))],
  ];

  it("lowers to the kind it claims", () => {
    for (const [kind, prop] of samples) expect(prop.kind).toBe(kind);
  });

  it("renders to non-empty text with no plumbing leaking through", () => {
    for (const [kind, prop] of samples) {
      const rendered = renderProposition(prop);
      expect(rendered.trim().length, kind).toBeGreaterThan(0);
      expect(rendered, kind).not.toMatch(/undefined|\[object|inst|Membership|Filter\./);
    }
  });

  it("is walkable, yielding itself first", () => {
    for (const [kind, prop] of samples) {
      const walked = [...walkProposition(prop)];
      expect(walked[0], kind).toBe(prop);
      expect(walked.length, kind).toBeGreaterThan(1);
    }
  });

  it("reports its variables", () => {
    for (const [kind, prop] of samples) {
      expect(variablesInProposition(prop).size, kind).toBeGreaterThan(0);
    }
  });

  it("carries a path back into the formal tree", () => {
    for (const [kind, prop] of samples) expect(prop.path, kind).toBe("conclusion");
  });
});
