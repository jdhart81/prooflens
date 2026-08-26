/**
 * The classifiers added for the mathlib slice: `limit`, `existence`,
 * `property`, `conjunction` and `membership`.
 *
 * The most important test in this file is the last one. `classifyProperty`
 * fires only for predicates present in the `PREDICATES` table, and that
 * restriction is what keeps the unsupported backlog honest: a blanket rule over
 * every predicate would make coverage look complete while the list of things to
 * build next went quiet.
 */
import { describe, expect, it } from "vitest";
import { renderExpression, renderProposition, type FilterSpec } from "@prooflens/math-ir";
import {
  RULES,
  classifyTheorem,
  primaryClassification,
  type Classification,
  type ClassificationPayload,
} from "@prooflens/classifier";
import { num, op, opaqueExpr, opaqueProp, pred, rel, synthetic, v } from "./synthetic.js";

function kinds(cs: readonly Classification[]): Array<ClassificationPayload["kind"]> {
  return cs.map((c) => c.payload.kind);
}

type Data<K extends ClassificationPayload["kind"]> =
  Extract<ClassificationPayload, { kind: K }> extends { data: infer D } ? D : never;

function find<K extends ClassificationPayload["kind"]>(
  cs: readonly Classification[],
  kind: K,
): Data<K> {
  const found = cs.find((c) => c.payload.kind === kind);
  if (!found) throw new Error(`no ${kind} in [${kinds(cs).join(", ")}]`);
  return found.payload.data as Data<K>;
}

function filter(overrides: Partial<FilterSpec> = {}): FilterSpec {
  return {
    kind: "at-top",
    display: "+∞",
    label: "grows without bound",
    point: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// limit
// ---------------------------------------------------------------------------

describe("the limit classifier", () => {
  function limitTheorem(target: FilterSpec) {
    return synthetic({
      kind: "limit",
      subject: v("f"),
      source: filter(),
      target,
      path: "conclusion",
    });
  }

  it("classifies a convergent limit and says so", () => {
    const cs = classifyTheorem(
      limitTheorem(
        filter({ kind: "neighbourhood", display: "L", label: "approaches", point: v("L") }),
      ),
    );
    expect(kinds(cs)).toContain("limit");
    const data = find(cs, "limit");
    expect(data.convergent).toBe(true);
    expect(renderExpression(data.subject)).toBe("f");
    expect(data.target.display).toBe("L");
    expect(cs.find((c) => c.payload.kind === "limit")!.rule.id).toBe(RULES.LIMIT.id);
    expect(RULES.LIMIT.id).toBe("PREDICATE_LIMIT_001");
  });

  it("treats a punctured neighbourhood as convergent too", () => {
    const data = find(
      classifyTheorem(
        limitTheorem(filter({ kind: "punctured", display: "a", label: "approaches within a set" })),
      ),
      "limit",
    );
    expect(data.convergent).toBe(true);
  });

  it("classifies divergence to `atTop` as not convergent", () => {
    const data = find(classifyTheorem(limitTheorem(filter({ kind: "at-top" }))), "limit");
    expect(data.convergent).toBe(false);
  });

  it("classifies divergence to `atBot` as not convergent", () => {
    const data = find(
      classifyTheorem(
        limitTheorem(filter({ kind: "at-bot", display: "−∞", label: "decreases without bound" })),
      ),
      "limit",
    );
    expect(data.convergent).toBe(false);
  });

  it("treats an unnamed target filter as not convergent, rather than guessing", () => {
    const data = find(
      classifyTheorem(
        limitTheorem(filter({ kind: "unknown", display: "𝓕", label: "an unnamed filter" })),
      ),
      "limit",
    );
    expect(data.convergent).toBe(false);
  });

  it("words the rationale differently for convergence and divergence", () => {
    const convergent = classifyTheorem(
      limitTheorem(
        filter({ kind: "neighbourhood", display: "L", label: "approaches", point: v("L") }),
      ),
    ).find((c) => c.payload.kind === "limit")!;
    expect(convergent.rationale).toContain("approaches `L`");
    expect(convergent.rationale).toContain("grows without bound");

    const divergent = classifyTheorem(limitTheorem(filter({ kind: "at-top" }))).find(
      (c) => c.payload.kind === "limit",
    )!;
    expect(divergent.rationale).toContain("grows without bound");
    expect(divergent.rationale).not.toContain("approaches `");
  });

  it("carries both filters into the payload", () => {
    const data = find(
      classifyTheorem(limitTheorem(filter({ kind: "at-bot", display: "−∞" }))),
      "limit",
    );
    expect(data.source.kind).toBe("at-top");
    expect(data.target.kind).toBe("at-bot");
  });

  it("is the primary classification for a limit statement", () => {
    const cs = classifyTheorem(limitTheorem(filter({ kind: "at-top" })));
    expect(primaryClassification(cs)!.payload.kind).toBe("limit");
  });

  it("does not fire for any other proposition kind", () => {
    expect(kinds(classifyTheorem(synthetic(rel("less-than", v("x"), v("y")))))).not.toContain(
      "limit",
    );
  });
});

// ---------------------------------------------------------------------------
// existence
// ---------------------------------------------------------------------------

describe("the existence classifier", () => {
  const existential = synthetic({
    kind: "existential",
    binder: "x",
    body: rel("less-than", num(0), v("x")),
    path: "conclusion",
  });

  it("classifies an existential and names the witness binder", () => {
    const cs = classifyTheorem(existential);
    expect(kinds(cs)).toContain("existence");
    const data = find(cs, "existence");
    expect(data.binder).toBe("x");
    expect(renderProposition(data.body)).toBe("0 < x");
    expect(cs.find((c) => c.payload.kind === "existence")!.rule.id).toBe(
      "PROPOSITION_EXISTENCE_001",
    );
  });

  it("admits it does not know which witness the proof produces", () => {
    const rationale = classifyTheorem(existential).find(
      (c) => c.payload.kind === "existence",
    )!.rationale;
    expect(rationale).toContain("without ProofLens knowing which one");
    // It must not claim to have the witness.
    expect(rationale).not.toMatch(/the witness is|equals/);
  });

  it("is the primary classification for an existential", () => {
    expect(primaryClassification(classifyTheorem(existential))!.payload.kind).toBe("existence");
  });
});

// ---------------------------------------------------------------------------
// property
// ---------------------------------------------------------------------------

describe("the property classifier", () => {
  it("classifies a named property from the table", () => {
    const cs = classifyTheorem(synthetic(pred("other", "Continuous", v("f"))));
    expect(kinds(cs)).toContain("property");
    const data = find(cs, "property");
    expect(data.name).toBe("Continuous");
    expect(data.label.length).toBeGreaterThan(0);
    expect(renderExpression(data.subject!)).toBe("f");
    expect(cs.find((c) => c.payload.kind === "property")!.rule.id).toBe("PREDICATE_PROPERTY_001");
  });

  it("says it recognises the property without interpreting it", () => {
    const rationale = classifyTheorem(synthetic(pred("other", "Summable", v("f")))).find(
      (c) => c.payload.kind === "property",
    )!.rationale;
    expect(rationale).toContain("recognises the property but does not interpret");
  });

  it("falls back to the bare name when the table has no label for it", () => {
    // A predicate proposition can only be built by the table, but a hand-built
    // one must still render rather than throw.
    const data = find(classifyTheorem(synthetic(pred("other", "NotInTable", v("f")))), "property");
    expect(data.label).toBe("NotInTable");
  });

  it("does not fire for the monotonicity family, which has its own classifier", () => {
    for (const [kind, name] of [
      ["monotone", "Monotone"],
      ["strictly-monotone", "StrictMono"],
      ["antitone", "Antitone"],
      ["strictly-antitone", "StrictAnti"],
    ] as const) {
      const cs = classifyTheorem(synthetic(pred(kind, name, v("f"))));
      expect(kinds(cs), name).toContain("monotonicity");
      expect(kinds(cs), name).not.toContain("property");
    }
  });

  it("is the primary classification when nothing stronger matches", () => {
    const cs = classifyTheorem(synthetic(pred("other", "Continuous", v("f"))));
    expect(primaryClassification(cs)!.payload.kind).toBe("property");
  });
});

/**
 * The load-bearing restriction.
 *
 * `classifyProperty` reads named properties out of the `PREDICATES` table, and
 * `lowerProposition` only builds a `predicate` proposition for heads that are in
 * that table. Anything else stays `opaque` and comes out `unsupported`, which is
 * how the backlog keeps telling us what to build next. A blanket rule over every
 * predicate-shaped conclusion would push coverage to look complete while the
 * backlog fell silent.
 */
describe("a predicate absent from the table stays unsupported", () => {
  it("classifies an unrecognised predicate-shaped conclusion as unsupported", () => {
    const cs = classifyTheorem(opaqueTheorem("Function.Injective"));
    expect(kinds(cs)).toContain("unsupported");
    expect(kinds(cs)).not.toContain("property");
    expect(find(cs, "unsupported").head).toBe("Function.Injective");
  });

  it("holds for every property mathlib has that ProofLens has not been taught", () => {
    for (const name of [
      "Function.Injective",
      "Function.Surjective",
      "Function.Bijective",
      "Filter.EventuallyEq",
      "Asymptotics.IsLittleO",
      "StrictConcaveOn",
      "Countable",
      "IsStrictOrderedRing",
    ]) {
      const cs = classifyTheorem(opaqueTheorem(name));
      expect(kinds(cs), name).toContain("unsupported");
      expect(kinds(cs), name).not.toContain("property");
    }
  });

  it("keeps such a conclusion visible in the backlog rather than swallowing it", () => {
    const cs = classifyTheorem(opaqueTheorem("Asymptotics.IsLittleO"));
    const unsupported = cs.find((c) => c.payload.kind === "unsupported")!;
    expect(unsupported.rationale).toContain("still available");
    expect(find(cs, "unsupported").reason).toContain("Asymptotics.IsLittleO");
  });

  function opaqueTheorem(head: string) {
    return synthetic(opaqueProp(`${head.split(".").pop()} f`, head));
  }
});

// ---------------------------------------------------------------------------
// conjunction
// ---------------------------------------------------------------------------

describe("the conjunction classifier", () => {
  const three = synthetic({
    kind: "conjunction",
    conjuncts: [
      rel("less-than", num(0), v("a")),
      rel("less-than", num(0), v("b")),
      rel("less-than", num(0), v("c")),
    ],
    path: "conclusion",
  });

  it("classifies a conjunction, keeping every conjunct", () => {
    const cs = classifyTheorem(three);
    expect(kinds(cs)).toContain("conjunction");
    expect(find(cs, "conjunction").conjuncts).toHaveLength(3);
    expect(cs.find((c) => c.payload.kind === "conjunction")!.rule.id).toBe(
      "PROPOSITION_CONJUNCTION_001",
    );
  });

  it("counts the facts in its rationale and lists them", () => {
    const rationale = classifyTheorem(three).find(
      (c) => c.payload.kind === "conjunction",
    )!.rationale;
    expect(rationale).toContain("3 facts at once");
    for (const symbol of ["0 < a", "0 < b", "0 < c"]) expect(rationale).toContain(symbol);
  });

  it("handles a two-conjunct case", () => {
    const cs = classifyTheorem(
      synthetic({
        kind: "conjunction",
        conjuncts: [rel("less-than", num(0), v("a")), rel("less-than", num(0), v("b"))],
        path: "conclusion",
      }),
    );
    expect(find(cs, "conjunction").conjuncts).toHaveLength(2);
    expect(cs.find((c) => c.payload.kind === "conjunction")!.rationale).toContain(
      "2 facts at once",
    );
  });
});

// ---------------------------------------------------------------------------
// membership
// ---------------------------------------------------------------------------

describe("the membership classifier", () => {
  const membership = synthetic({
    kind: "membership",
    element: v("a"),
    collection: v("s"),
    path: "conclusion",
  });

  it("classifies a membership with the element and collection the right way round", () => {
    const cs = classifyTheorem(membership);
    expect(kinds(cs)).toContain("membership");
    const data = find(cs, "membership");
    expect(renderExpression(data.element)).toBe("a");
    expect(renderExpression(data.collection)).toBe("s");
    expect(cs.find((c) => c.payload.kind === "membership")!.rule.id).toBe(
      "RELATION_MEMBERSHIP_001",
    );
  });

  it("words the rationale as the element being inside the collection", () => {
    const rationale = classifyTheorem(membership).find(
      (c) => c.payload.kind === "membership",
    )!.rationale;
    expect(rationale).toBe("The conclusion places `a` inside `s`.");
  });

  it("keeps a compound element intact", () => {
    const data = find(
      classifyTheorem(
        synthetic({
          kind: "membership",
          element: op("add", v("x"), v("y")),
          collection: opaqueExpr("[0, 1]", "Set.Icc"),
          path: "conclusion",
        }),
      ),
      "membership",
    );
    expect(renderExpression(data.element)).toBe("x + y");
  });
});

// ---------------------------------------------------------------------------
// Shared invariants
// ---------------------------------------------------------------------------

describe("every new classifier", () => {
  const samples: Classification[] = [
    ...classifyTheorem(
      synthetic({
        kind: "limit",
        subject: v("f"),
        source: filter(),
        target: filter(),
        path: "conclusion",
      }),
    ),
    ...classifyTheorem(
      synthetic({
        kind: "existential",
        binder: "x",
        body: rel("less-than", num(0), v("x")),
        path: "conclusion",
      }),
    ),
    ...classifyTheorem(synthetic(pred("other", "Continuous", v("f")))),
    ...classifyTheorem(
      synthetic({
        kind: "conjunction",
        conjuncts: [rel("less-than", num(0), v("a"))],
        path: "conclusion",
      }),
    ),
    ...classifyTheorem(
      synthetic({ kind: "membership", element: v("a"), collection: v("s"), path: "conclusion" }),
    ),
  ];

  it("produces a classification for each shape", () => {
    expect(samples.length).toBeGreaterThanOrEqual(5);
  });

  it("uses a rule id matching the project's convention", () => {
    for (const c of samples) expect(c.rule.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  it("declares a `derived` ceiling and never claims `verified`", () => {
    for (const c of samples) {
      expect(c.rule.produces).toBe("derived");
      expect(c.claim.status).not.toBe("verified");
    }
  });

  it("carries a non-empty rationale with no placeholder text", () => {
    for (const c of samples) {
      expect(c.rationale.trim().length).toBeGreaterThan(0);
      expect(c.rationale).not.toMatch(/undefined|\[object/);
    }
  });

  it("registers each new rule in the public rulebook", () => {
    const ids = new Set<string>(Object.values(RULES).map((r) => r.id));
    for (const id of [
      "PREDICATE_LIMIT_001",
      "PROPOSITION_EXISTENCE_001",
      "PREDICATE_PROPERTY_001",
      "PROPOSITION_CONJUNCTION_001",
      "RELATION_MEMBERSHIP_001",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("never returns an empty classification list for any of these shapes", () => {
    for (const prop of [
      {
        kind: "limit" as const,
        subject: v("f"),
        source: filter(),
        target: filter(),
        path: "conclusion",
      },
      {
        kind: "existential" as const,
        binder: "x",
        body: rel("less-than", num(0), v("x")),
        path: "conclusion",
      },
      { kind: "conjunction" as const, conjuncts: [], path: "conclusion" },
      { kind: "membership" as const, element: v("a"), collection: v("s"), path: "conclusion" },
    ]) {
      expect(classifyTheorem(synthetic(prop)).length, prop.kind).toBeGreaterThan(0);
    }
  });
});
