import { describe, expect, it } from "vitest";
import { rank, type EpistemicStatus } from "@prooflens/epistemics";
import { lowerDocument, type TheoremIR } from "@prooflens/math-ir";
import { classifyTheorem, dependencyGraph, type Classification } from "@prooflens/classifier";
import {
  VISUAL_IR_VERSION,
  planVisuals,
  resolveVisualHint,
  type VisualSpec,
} from "@prooflens/visual-ir";
import { corpus, CORPUS_DECLARATION_COUNT } from "../../pipeline/test/helpers.js";
import { num, op, opaqueProp, rel, synthetic, v } from "../../classifier/test/synthetic.js";

const ALL_VISUAL_TYPES = [
  "upper-bound-plot",
  "lower-bound-plot",
  "number-line",
  "monotonicity-plot",
  "relationship-diagram",
  "dependency-graph",
  "implication-graph",
  "assumption-sensitivity",
  "expression-tree",
  "text-diagram",
] as const;

const doc = corpus();
const math = lowerDocument(doc);
const graph = dependencyGraph(doc);

interface Planned {
  theorem: TheoremIR;
  classifications: Classification[];
  specs: VisualSpec[];
  specsWithGraph: VisualSpec[];
}

const planned: Planned[] = math.theorems.map((theorem) => {
  const classifications = classifyTheorem(theorem);
  return {
    theorem,
    classifications,
    specs: planVisuals(theorem, classifications),
    specsWithGraph: planVisuals(theorem, classifications, { dependencies: graph.value }),
  };
});

function forName(shortName: string): Planned {
  const found = planned.find((p) => p.theorem.name.split(".").pop() === shortName);
  if (!found) throw new Error(`no theorem ${shortName}`);
  return found;
}

function hasUnusedHypotheses(p: Planned): boolean {
  return p.classifications.some(
    (c) => c.payload.kind === "assumption-sensitivity" && c.payload.data.unusedInProof.length > 0,
  );
}

// ---------------------------------------------------------------------------
// Always at least one spec
// ---------------------------------------------------------------------------

describe("planVisuals always produces something", () => {
  it("exports a version", () => {
    expect(VISUAL_IR_VERSION).toBe("0.1.0");
  });

  it("returns at least one spec for all 34 corpus declarations", () => {
    expect(planned).toHaveLength(CORPUS_DECLARATION_COUNT);
    for (const p of planned) {
      expect(p.specs.length, p.theorem.name).toBeGreaterThanOrEqual(1);
      expect(p.specsWithGraph.length, p.theorem.name).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns a spec even for a definition, which asserts no proposition", () => {
    for (const short of ["energyBudget", "landauerCost", "throughput"]) {
      expect(forName(short).specs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses only declared visual types", () => {
    const types = new Set(planned.flatMap((p) => p.specsWithGraph).map((s) => s.type));
    for (const type of types) expect(ALL_VISUAL_TYPES).toContain(type);
  });
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe("ordering", () => {
  it("leads with the assumption-sensitivity spec when a hypothesis goes unused", () => {
    const interesting = planned.filter(hasUnusedHypotheses);
    expect(interesting.map((p) => p.theorem.name.split(".").pop())).toEqual([
      "information_rate_bound",
      "simple_upper_bound",
    ]);
    for (const p of interesting) {
      expect(p.specs[0]!.type, p.theorem.name).toBe("assumption-sensitivity");
      expect(p.specsWithGraph[0]!.type, p.theorem.name).toBe("assumption-sensitivity");
    }
  });

  it("puts the assumption-sensitivity spec after the plot when every hypothesis is used", () => {
    const p = forName("div_upper_bound");
    expect(hasUnusedHypotheses(p)).toBe(false);
    expect(p.specs.map((s) => s.type)).toEqual(["upper-bound-plot", "assumption-sensitivity"]);
  });

  it("plans no assumption-sensitivity spec for a hypothesis-free declaration", () => {
    const p = forName("log_two_pos");
    expect(p.theorem.hypotheses).toEqual([]);
    expect(p.specs.map((s) => s.type)).not.toContain("assumption-sensitivity");
  });
});

describe("planned orderings", () => {
  const expected: Record<string, string[]> = {
    simple_upper_bound: ["assumption-sensitivity", "upper-bound-plot"],
    information_rate_bound: ["assumption-sensitivity", "upper-bound-plot", "dependency-graph"],
    log_two_pos: ["number-line", "lower-bound-plot"],
    simple_lower_bound: ["lower-bound-plot", "assumption-sensitivity"],
    div_upper_bound: ["upper-bound-plot", "assumption-sensitivity"],
    unsupported_tendsto_fixture: ["expression-tree"],
    switching_coefficient_ne_zero: ["assumption-sensitivity", "dependency-graph"],
    landauerCost: ["relationship-diagram"],
    energyBudget: ["relationship-diagram"],
    throughput: ["relationship-diagram"],
    rate_eq_count_div_time: ["relationship-diagram", "assumption-sensitivity"],
  };

  for (const [short, types] of Object.entries(expected)) {
    it(`plans ${short} as [${types.join(", ")}]`, () => {
      expect(forName(short).specsWithGraph.map((spec) => spec.type)).toEqual(types);
    });
  }
});

// ---------------------------------------------------------------------------
// Positivity number lines
// ---------------------------------------------------------------------------

describe("positivity theorems", () => {
  const positivity = planned.filter((p) =>
    p.classifications.some((c) => c.payload.kind === "positivity"),
  );

  it("plans a number-line for every sign fact in the corpus", () => {
    expect(positivity.map((p) => p.theorem.name.split(".").pop())).toEqual([
      "energyBudget_pos",
      "landauerCost_pos",
      "log_two_pos",
      "switching_coefficient_pos",
    ]);
    for (const p of positivity) {
      expect(
        p.specs.map((spec) => spec.type),
        p.theorem.name,
      ).toContain("number-line");
    }
  });

  it("leads with the number-line rather than the bound plot", () => {
    for (const p of positivity) {
      if (p.specs[0]!.type === "assumption-sensitivity") continue; // a finding leads
      expect(p.specs[0]!.type, p.theorem.name).toBe("number-line");
    }
  });

  it("puts zero and the quantity on opposite sides of the line", () => {
    const spec = forName("log_two_pos").specs.find((x) => x.type === "number-line")!;
    expect(spec.title).toBe("log(2) > 0");
    const zero = spec.entities.find((e) => e.id === "zero")!;
    const quantity = spec.entities.find((e) => e.id === "quantity")!;
    expect(zero.label).toBe("0");
    expect(quantity.label).toBe("log(2)");
    expect(zero.position!.x!).toBeLessThan(quantity.position!.x!);
    expect(zero.state).toBe("excluded"); // strict: zero itself is ruled out
    expect(quantity.state).toBe("permitted");
  });

  it("marks a non-strict sign fact's zero as permitted", () => {
    const theorem = synthetic(rel("less-than-or-equal", num(0), v("e")), { variables: ["e"] });
    const spec = planVisuals(theorem, classifyTheorem(theorem)).find(
      (x) => x.type === "number-line",
    )!;
    expect(spec.title).toBe("e ≥ 0");
    expect(spec.entities.find((e) => e.id === "zero")!.state).toBe("permitted");
  });

  it("is illustrative overall, because the line is schematic", () => {
    for (const p of positivity) {
      const spec = p.specs.find((x) => x.type === "number-line")!;
      expect(spec.axes.map((a) => a.scale)).toEqual(["schematic"]);
      expect(spec.epistemic).toBe("illustrative");
    }
  });

  it("mirrors the whole figure for a negative sign fact", () => {
    // `PositivityPayload.sense` carries what `classifyPositivity` worked out, so
    // the figure can put the quantity on the correct side of zero. This used to
    // render `e < 0` as `e > 0`, with `e` drawn to the right of zero — a
    // confident picture of the negation of the theorem.
    const theorem = synthetic(rel("less-than", v("e"), num(0)), { variables: ["e"] });
    const classifications = classifyTheorem(theorem);
    expect(
      (
        classifications.find((c) => c.payload.kind === "positivity")!.payload.data as {
          sense: string;
        }
      ).sense,
    ).toBe("negative");

    const spec = planVisuals(theorem, classifications).find((x) => x.type === "number-line")!;
    expect(spec.title).toBe("e < 0");

    const zero = spec.entities.find((x) => x.id === "zero")!;
    const quantity = spec.entities.find((x) => x.id === "quantity")!;
    expect(quantity.position!.x).toBe(0.32);
    expect(zero.position!.x).toBe(0.68);
    expect(quantity.position!.x!).toBeLessThan(zero.position!.x!);

    // The permitted side is the negative one; the excluded side is positive.
    const permitted = spec.entities.find((x) => x.id === "permitted-region")!;
    const excluded = spec.entities.find((x) => x.id === "excluded-region")!;
    expect(permitted.position!.x!).toBeLessThan(zero.position!.x!);
    expect(excluded.position!.x!).toBeGreaterThan(zero.position!.x!);

    // The axis tick marking zero moves with it.
    expect(spec.axes[0]!.ticks).toEqual([{ at: 0.68, label: "0", emphasis: "primary" }]);

    // And the arrow runs from the quantity to zero, not the other way.
    expect(spec.relationships[0]!.from).toBe("quantity");
    expect(spec.relationships[0]!.to).toBe("zero");
    expect(spec.relationships[0]!.label).toBe("strictly less than");
  });

  it("uses the non-strict comparator for `e ≤ 0`", () => {
    const theorem = synthetic(rel("less-than-or-equal", v("e"), num(0)), { variables: ["e"] });
    const spec = planVisuals(theorem, classifyTheorem(theorem)).find(
      (x) => x.type === "number-line",
    )!;
    expect(spec.title).toBe("e ≤ 0");
    expect(spec.entities.find((x) => x.id === "zero")!.state).toBe("permitted");
    expect(spec.relationships[0]!.label).toBe("at most");
  });

  it("mirrors positive and negative facts about each other", () => {
    const mirror = (prop: Parameters<typeof classifyTheorem>[0]["conclusion"]["value"]) => {
      const theorem = synthetic(prop, { variables: ["e"] });
      const spec = planVisuals(theorem, classifyTheorem(theorem)).find(
        (x) => x.type === "number-line",
      )!;
      return {
        title: spec.title,
        zero: spec.entities.find((x) => x.id === "zero")!.position!.x,
        quantity: spec.entities.find((x) => x.id === "quantity")!.position!.x,
      };
    };
    const positive = mirror(rel("less-than", num(0), v("e")));
    const negative = mirror(rel("less-than", v("e"), num(0)));
    expect(positive.title).toBe("e > 0");
    expect(negative.title).toBe("e < 0");
    expect(positive.zero).toBe(negative.quantity);
    expect(positive.quantity).toBe(negative.zero);
  });

  it("keeps every corpus sign fact on the positive side, because all four are positive", () => {
    for (const p of positivity) {
      const spec = p.specs.find((x) => x.type === "number-line")!;
      expect(spec.title, p.theorem.name).toMatch(/ > 0$/);
      const zero = spec.entities.find((x) => x.id === "zero")!;
      const quantity = spec.entities.find((x) => x.id === "quantity")!;
      expect(zero.position!.x!).toBeLessThan(quantity.position!.x!);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveVisualHint
// ---------------------------------------------------------------------------

describe("resolveVisualHint", () => {
  const aliases: Array<[string, string]> = [
    ["monotone-curve", "monotonicity-plot"],
    ["antitone-curve", "monotonicity-plot"],
    ["monotonicity-curve", "monotonicity-plot"],
    ["positivity-fact", "number-line"],
    ["sign-fact", "number-line"],
    ["iff-equivalence", "implication-graph"],
    ["implication-arrow", "implication-graph"],
    ["implication-chain", "implication-graph"],
    ["functional-relationship", "relationship-diagram"],
    ["equation-map", "relationship-diagram"],
    ["bound-plot", "upper-bound-plot"],
    ["dependency", "dependency-graph"],
    ["proof-dependencies", "dependency-graph"],
    ["structure", "expression-tree"],
  ];

  for (const [hint, type] of aliases) {
    it(`maps the author's \`${hint}\` to \`${type}\``, () => {
      expect(resolveVisualHint(hint)).toBe(type);
    });
  }

  it("passes a literal VisualType straight through", () => {
    for (const type of ALL_VISUAL_TYPES) {
      expect(resolveVisualHint(type)).toBe(type);
    }
  });

  it("returns null for a word that names nothing", () => {
    for (const nonsense of ["sankey-diagram", "pie-chart", "", "  ", "Monotone-Curve", "plot"]) {
      expect(resolveVisualHint(nonsense), nonsense).toBeNull();
    }
  });

  it("only ever returns a real VisualType or null", () => {
    for (const [hint] of aliases) {
      expect(ALL_VISUAL_TYPES).toContain(resolveVisualHint(hint)!);
    }
  });

  it("resolves every hint the corpus actually uses", () => {
    const hints = new Set(
      planned.map((p) => p.theorem.suggestedVisual).filter((h): h is string => h !== null),
    );
    expect(hints.size).toBeGreaterThan(5);
    for (const hint of hints) {
      expect(resolveVisualHint(hint), `corpus hint \`${hint}\` resolves to nothing`).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Definitions and relationship diagrams
// ---------------------------------------------------------------------------

describe("definitions with a body", () => {
  const definitions = planned.filter((p) => p.theorem.kind === "definition");

  it("finds the three corpus definitions", () => {
    expect(definitions.map((p) => p.theorem.name.split(".").pop())).toEqual([
      "energyBudget",
      "landauerCost",
      "throughput",
    ]);
  });

  it("plans a relationship-diagram for each, and nothing else", () => {
    for (const p of definitions) {
      expect(
        p.specs.map((spec) => spec.type),
        p.theorem.name,
      ).toEqual(["relationship-diagram"]);
    }
  });

  it("titles the diagram with the definition applied to its parameters", () => {
    const titles = definitions.map((p) => p.specs[0]!.title);
    expect(titles).toEqual([
      "energyBudget(P, t) = P · t",
      "landauerCost(kB, T, D) = kB · T · log(2) / D",
      "throughput(ipc, f) = ipc · f",
    ]);
  });

  it("puts the inputs on layer 0 and the defined quantity on layer 1", () => {
    const spec = forName("landauerCost").specs[0]!;
    const inputs = spec.entities.filter((e) => e.id.startsWith("in:"));
    expect(inputs.map((e) => e.label)).toEqual(["kB", "T", "D"]);
    for (const input of inputs) expect(input.position!.layer).toBe(0);
    expect(inputs.map((e) => e.position!.order)).toEqual([0, 1, 2]);

    const defined = spec.entities.find((e) => e.id === "defined")!;
    expect(defined.position!.layer).toBe(1);
    expect(defined.label).toBe("landauerCost(kB, T, D)");
    expect(defined.detail).toBe("kB · T · log(2) / D");
  });

  it("draws one maps-to edge from each input to the defined quantity", () => {
    const spec = forName("landauerCost").specs[0]!;
    expect(spec.relationships).toHaveLength(3);
    for (const relationship of spec.relationships) {
      expect(relationship.kind).toBe("maps-to");
      expect(relationship.to).toBe("defined");
      expect(spec.entities.some((e) => e.id === relationship.from)).toBe(true);
    }
  });

  it("labels each input with the author's meaning where one was annotated", () => {
    const spec = forName("landauerCost").specs[0]!;
    expect(spec.entities.find((e) => e.label === "kB")!.detail).toBe("Boltzmann constant (J/K)");
    expect(spec.entities.find((e) => e.label === "T")!.detail).toBe(
      "operating temperature of the heat bath (K)",
    );
  });

  it("says the arrows are not causal claims", () => {
    for (const p of definitions) {
      const legends = p.specs[0]!.annotations.filter((a) => a.kind === "legend");
      expect(
        legends.some((l) => /not causal claims/.test(l.text)),
        p.theorem.name,
      ).toBe(true);
    }
  });

  it("has no axes, so it is `derived` rather than `illustrative`", () => {
    for (const p of definitions) {
      expect(p.specs[0]!.axes).toEqual([]);
      expect(p.specs[0]!.epistemic).toBe("derived");
    }
  });

  it("serves a theorem-shaped functional relationship with the same figure", () => {
    const p = forName("rate_eq_count_div_time");
    expect(p.theorem.kind).toBe("theorem");
    expect(p.theorem.definitionBody).toBeNull();
    expect(p.specs.map((spec) => spec.type)).toEqual([
      "relationship-diagram",
      "assumption-sensitivity",
    ]);
    const spec = p.specs[0]!;
    expect(spec.title).toBe("R = N / t");
    expect(spec.entities.filter((e) => e.id.startsWith("in:")).map((e) => e.label)).toEqual([
      "N",
      "t",
    ]);
    expect(spec.entities.find((e) => e.id === "defined")!.label).toBe("R");
  });

  it("plans no diagram when the right-hand side mentions no variable", () => {
    // An arrow from nowhere is not a diagram; the planner falls back instead.
    const theorem = synthetic(opaqueProp("Made.Up.constant", "Made.Up.constant"), {
      name: "Made.Up.c",
      kind: "definition",
      definitionBody: num(42),
    });
    const classifications = classifyTheorem(theorem);
    expect(classifications.map((c) => c.payload.kind)).toContain("functional-relationship");
    const specs = planVisuals(theorem, classifications);
    expect(specs.map((spec) => spec.type)).not.toContain("relationship-diagram");
    expect(specs.length).toBeGreaterThanOrEqual(1);
  });

  it("plans no diagram for a definition with no body at all", () => {
    const theorem = synthetic(opaqueProp("Real", "Real"), {
      name: "Made.Up.opaqueDef",
      kind: "definition",
    });
    expect(theorem.definitionBody).toBeNull();
    const specs = planVisuals(theorem, classifyTheorem(theorem));
    expect(specs.map((spec) => spec.type)).toEqual(["expression-tree"]);
  });

  it("only draws inputs the body actually mentions", () => {
    // `b` is a parameter of the definition but does not appear in the body, so
    // it gets no arrow — the diagram shows what the value is computed from.
    const theorem = synthetic(opaqueProp("Real", "Real"), {
      name: "Made.Up.f",
      kind: "definition",
      variables: ["a", "b"],
      definitionBody: op("mul", v("a"), num(2)),
    });
    const spec = planVisuals(theorem, classifyTheorem(theorem)).find(
      (x) => x.type === "relationship-diagram",
    )!;
    expect(spec.entities.filter((e) => e.id.startsWith("in:")).map((e) => e.label)).toEqual(["a"]);
    expect(spec.relationships).toHaveLength(1);
    // The title still names the full signature, which is what the definition is.
    expect(spec.title).toBe("f(a, b) = a · 2");
  });
});

// ---------------------------------------------------------------------------
// Author hints
// ---------------------------------------------------------------------------

describe("@prooflens.visual hints", () => {
  /** A theorem whose planner output is `[number-line, lower-bound-plot]`. */
  function signFact(options: Parameters<typeof synthetic>[1] = {}) {
    return synthetic(rel("less-than", num(0), v("e")), { variables: ["e"], ...options });
  }

  function plan(theorem: ReturnType<typeof synthetic>) {
    return planVisuals(theorem, classifyTheorem(theorem)).map((spec) => spec.type);
  }

  it("leaves the order alone when there is no hint", () => {
    expect(plan(signFact())).toEqual(["number-line", "lower-bound-plot"]);
  });

  it("moves a matching hinted figure to the front", () => {
    expect(plan(signFact({ suggestedVisual: "lower-bound-plot" }))).toEqual([
      "lower-bound-plot",
      "number-line",
    ]);
  });

  it("leaves a hint that already leads exactly where it is", () => {
    expect(plan(signFact({ suggestedVisual: "number-line" }))).toEqual([
      "number-line",
      "lower-bound-plot",
    ]);
  });

  it("never displaces a finding: an unused hypothesis still leads", () => {
    const theorem = signFact({
      suggestedVisual: "lower-bound-plot",
      hypotheses: [
        { symbol: "hu", proposition: rel("less-than", num(0), v("u")), unusedInProof: true },
        { symbol: "h", proposition: rel("less-than", num(0), v("e")) },
      ],
    });
    expect(plan(theorem)).toEqual(["assumption-sensitivity", "lower-bound-plot", "number-line"]);
  });

  it("never displaces a finding: a `sorry` keeps the hint out of first place", () => {
    const theorem = signFact({ suggestedVisual: "lower-bound-plot", usesSorry: true });
    const types = plan(theorem);
    expect(types[0]).toBe("number-line");
    expect(types[1]).toBe("lower-bound-plot");
  });

  it("records an unmatched hint on the lead figure instead of dropping it", () => {
    const theorem = signFact({ suggestedVisual: "sankey-diagram" });
    const specs = planVisuals(theorem, classifyTheorem(theorem));
    const annotation = specs[0]!.annotations.find((a) => a.id === "hint-unmatched")!;
    expect(annotation).toBeDefined();
    expect(annotation.kind).toBe("legend");
    expect(annotation.text).toContain("sankey-diagram");
    expect(annotation.epistemic).toBe("derived");
    // Only the lead figure carries it, and no figure was invented for the hint.
    expect(specs.map((spec) => spec.type)).toEqual(["number-line", "lower-bound-plot"]);
    expect(
      specs.slice(1).some((spec) => spec.annotations.some((a) => a.id === "hint-unmatched")),
    ).toBe(false);
  });

  it("never conjures a figure the analysis did not support", () => {
    for (const hint of ["dependency-graph", "monotonicity-plot", "implication-graph"]) {
      expect(plan(signFact({ suggestedVisual: hint }))).toEqual([
        "number-line",
        "lower-bound-plot",
      ]);
    }
  });

  it("honours the corpus hints that resolve to a planned figure", () => {
    const matched = planned.filter((p) => {
      const hint = p.theorem.suggestedVisual;
      if (hint === null) return false;
      const resolved = resolveVisualHint(hint);
      return resolved !== null && p.specsWithGraph.some((spec) => spec.type === resolved);
    });
    for (const p of matched) {
      const lead = p.specsWithGraph[0]!;
      const target = lead.type === "assumption-sensitivity" ? 1 : 0;
      expect(p.specsWithGraph[target]!.type, p.theorem.name).toBe(
        resolveVisualHint(p.theorem.suggestedVisual!),
      );
      expect(
        p.specsWithGraph.some((spec) => spec.annotations.some((a) => a.id === "hint-unmatched")),
        p.theorem.name,
      ).toBe(false);
    }
    // The alias table is what makes most of these match at all.
    expect(matched.length).toBeGreaterThanOrEqual(20);
  });

  it("flags exactly the seven corpus hints that name no planned figure", () => {
    const unmatched = planned.filter((p) =>
      p.specsWithGraph.some((spec) => spec.annotations.some((a) => a.id === "hint-unmatched")),
    );
    expect(unmatched.map((p) => p.theorem.name.split(".").pop())).toEqual([
      "budget_div_landauerCost",
      "budget_implies_rate_bound",
      "ceiling_of_budget",
      "dynamic_power_div_cancel",
      "energy_budget_chain",
      "le_chain_of_three",
      "switching_coefficient_ne_zero",
    ]);
    for (const p of unmatched) {
      const annotation = p.specsWithGraph[0]!.annotations.find((a) => a.id === "hint-unmatched")!;
      expect(annotation, p.theorem.name).toBeDefined();
      expect(annotation.text).toContain(p.theorem.suggestedVisual!);
    }
  });

  it("tells the author their hint is a real type ProofLens simply did not plan", () => {
    // `switching_coefficient_ne_zero` is labelled `positivity-fact`, but its
    // conclusion is `≠`. The annotation is the mechanism catching a mislabel.
    const p = forName("switching_coefficient_ne_zero");
    expect(resolveVisualHint("positivity-fact")).toBe("number-line");
    const annotation = p.specsWithGraph[0]!.annotations.find((a) => a.id === "hint-unmatched")!;
    expect(annotation.text).toBe(
      "The declaration requests a `positivity-fact` figure, but no ProofLens classifier produced one for this statement.",
    );
  });

  it("gives a different message when the hint is not a type at all", () => {
    const theorem = signFact({ suggestedVisual: "sankey-diagram" });
    const annotation = planVisuals(theorem, classifyTheorem(theorem))[0]!.annotations.find(
      (a) => a.id === "hint-unmatched",
    )!;
    expect(annotation.text).toBe(
      "The declaration requests a `sankey-diagram` figure, which is not a visualization type ProofLens knows.",
    );
    expect(annotation.text).not.toContain("no ProofLens classifier produced one");
  });

  it("quotes the author's own word back, not the resolved type", () => {
    const theorem = synthetic(rel("not-equal", v("a"), v("b")), {
      suggestedVisual: "positivity-fact",
    });
    const annotation = planVisuals(theorem, classifyTheorem(theorem))[0]!.annotations.find(
      (a) => a.id === "hint-unmatched",
    )!;
    expect(annotation.text).toContain("`positivity-fact`");
    expect(annotation.text).not.toContain("number-line");
  });

  it("honours an aliased hint by reordering, exactly as a literal one would", () => {
    // `sign-fact` is an alias for `number-line`, which here is planned second.
    const theorem = synthetic(rel("less-than", num(0), v("e")), {
      variables: ["e"],
      suggestedVisual: "lower-bound-plot",
    });
    expect(plan(theorem)).toEqual(["lower-bound-plot", "number-line"]);

    const aliased = synthetic(rel("less-than", num(0), v("e")), {
      variables: ["e"],
      suggestedVisual: "sign-fact",
    });
    expect(plan(aliased)).toEqual(["number-line", "lower-bound-plot"]);
  });

  it("adds no hint annotation to a declaration with no hint at all", () => {
    const noHint = planned.filter((p) => p.theorem.suggestedVisual === null);
    expect(noHint.length).toBeGreaterThan(0);
    for (const p of noHint) {
      for (const spec of p.specsWithGraph) {
        expect(spec.annotations.some((a) => a.id === "hint-unmatched")).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bound plots
// ---------------------------------------------------------------------------

describe("bound theorems", () => {
  const boundTheorems = planned.filter((p) =>
    p.classifications.some((c) => c.payload.kind === "upper-bound"),
  );

  /** The reading the classifier marked informative, for a planned theorem. */
  function naturalDirection(p: Planned): "upper" | "lower" {
    const natural = p.classifications.find(
      (c) =>
        (c.payload.kind === "upper-bound" || c.payload.kind === "lower-bound") &&
        c.payload.data.natural,
    )!;
    return natural.payload.kind === "upper-bound" ? "upper" : "lower";
  }

  it("finds bound theorems in the corpus", () => {
    expect(boundTheorems.length).toBeGreaterThan(5);
  });

  it("plans a bound plot of the natural direction for every one of them", () => {
    for (const p of boundTheorems) {
      const expected = `${naturalDirection(p)}-bound-plot`;
      expect(
        p.specs.map((s) => s.type),
        p.theorem.name,
      ).toContain(expected);
    }
  });

  it("plans exactly one bound plot per theorem — never both readings", () => {
    for (const p of boundTheorems) {
      const plots = p.specs.filter(
        (spec) => spec.type === "upper-bound-plot" || spec.type === "lower-bound-plot",
      );
      expect(plots, p.theorem.name).toHaveLength(1);
    }
  });

  it("reaches the lower-bound-plot renderer, which the natural reading unlocked", () => {
    const lower = planned.filter((p) => p.specs.some((s) => s.type === "lower-bound-plot"));
    expect(lower.map((p) => p.theorem.name.split(".").pop())).toEqual([
      "energyBudget_pos",
      "landauerCost_pos",
      "log_two_pos",
      "simple_lower_bound",
      "switching_coefficient_pos",
    ]);
  });

  it("plans a lower-bound-plot titled from the bounded quantity for simple_lower_bound", () => {
    const spec = forName("simple_lower_bound").specs.find((x) => x.type === "lower-bound-plot")!;
    expect(spec.title).toBe("x ≥ A / B");
    expect(spec.entities.find((e) => e.id === "bounded")!.label).toBe("x");
    expect(spec.entities.find((e) => e.id === "bound")!.label).toBe("A / B");
  });

  it("shows the bounded quantity, the bound and both regions", () => {
    const spec = forName("simple_upper_bound").specs.find((s) => s.type === "upper-bound-plot")!;
    expect(spec.entities.map((e) => e.id)).toEqual([
      "bounded",
      "bound",
      "permitted-region",
      "excluded-region",
    ]);
    expect(spec.entities.find((e) => e.id === "bounded")!.label).toBe("x");
    expect(spec.entities.find((e) => e.id === "bound")!.label).toBe("P / T");
    expect(spec.title).toBe("x ≤ P / T");
  });

  it("carries the author's annotation onto the bounded quantity and the axis", () => {
    const spec = forName("simple_upper_bound").specs.find((s) => s.type === "upper-bound-plot")!;
    expect(spec.entities.find((e) => e.id === "bounded")!.detail).toBe(
      "achieved operation rate (ops/s)",
    );
    expect(spec.axes[0]!.label).toBe("achieved operation rate");
    expect(spec.axes[0]!.units).toBe("ops/s");
  });

  it("marks a non-strict bound as permitted and a strict one as excluded", () => {
    const nonStrict = forName("simple_upper_bound").specs.find(
      (s) => s.type === "upper-bound-plot",
    )!;
    expect(nonStrict.entities.find((e) => e.id === "bound")!.state).toBe("permitted");

    // `0 < log 2` is strict, and its natural reading is the lower one.
    const strict = forName("log_two_pos").specs.find((s) => s.type === "lower-bound-plot")!;
    expect(strict.entities.find((e) => e.id === "bound")!.state).toBe("excluded");
  });

  it("adds a sensitivity callout only where a direction was determined", () => {
    const spec = forName("simple_upper_bound").specs.find((s) => s.type === "upper-bound-plot")!;
    const callouts = spec.annotations.filter((a) => a.id.startsWith("sensitivity:"));
    expect(callouts.map((c) => c.text)).toEqual([
      "Increasing P increases the bound.",
      "Increasing T decreases the bound.",
    ]);

    // The Landauer bound now ranks all four of its parameters, because the
    // positivity of `log 2` is decidable from the literal.
    const landauer = forName("information_rate_bound").specs.find(
      (s) => s.type === "upper-bound-plot",
    )!;
    expect(
      landauer.annotations.filter((a) => a.id.startsWith("sensitivity:")).map((a) => a.text),
    ).toEqual([
      "Increasing P increases the bound.",
      "Increasing T decreases the bound.",
      "Increasing kB decreases the bound.",
      "Increasing D increases the bound.",
    ]);
  });

  it("emits no sensitivity callout where no direction was determined", () => {
    // `div_upper_bound` states `0 < T` but nothing about `P`.
    const spec = forName("div_upper_bound").specs.find((s) => s.type === "upper-bound-plot")!;
    expect(
      spec.annotations.filter((a) => a.id.startsWith("sensitivity:")).map((a) => a.text),
    ).toEqual(["Increasing P increases the bound."]);
  });

  it("never emits a callout containing the `unknown` phrasing", () => {
    for (const spec of planned.flatMap((p) => p.specsWithGraph)) {
      for (const annotation of spec.annotations) {
        expect(annotation.text).not.toMatch(/cannot determine from the stated hypotheses/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Schematic axes and epistemic status
// ---------------------------------------------------------------------------

describe("schematic axes are illustrative", () => {
  const allSpecs = planned.flatMap((p) => p.specsWithGraph);
  const withSchematic = allSpecs.filter((s) => s.axes.some((a) => a.scale === "schematic"));

  it("finds schematic axes in the corpus", () => {
    expect(withSchematic.length).toBeGreaterThan(10);
  });

  it("tags every schematic axis `illustrative`", () => {
    for (const spec of allSpecs) {
      for (const axis of spec.axes) {
        if (axis.scale === "schematic") {
          expect(axis.epistemic, `${spec.id} / ${axis.id}`).toBe("illustrative");
        }
      }
    }
  });

  it("gives any spec containing a schematic axis an overall `illustrative` status", () => {
    for (const spec of withSchematic) {
      expect(spec.epistemic, spec.id).toBe("illustrative");
    }
  });

  it("carries at least one illustrative legend disclaiming what the drawing shows", () => {
    for (const spec of withSchematic) {
      const legends = spec.annotations.filter((a) => a.kind === "legend");
      expect(legends.length, spec.id).toBeGreaterThan(0);
      // Not every legend is illustrative — `hint-unmatched` is a `derived` fact
      // about the author's annotation, not a statement about the drawing — but
      // the disclaimer about the figure itself always is.
      const disclaimers = legends.filter((l) => /schematic|arbitrary/i.test(l.text));
      expect(
        disclaimers.length,
        `${spec.id}: ${legends.map((l) => l.text).join(" | ")}`,
      ).toBeGreaterThan(0);
      for (const disclaimer of disclaimers) {
        expect(disclaimer.epistemic, `${spec.id} / ${disclaimer.id}`).toBe("illustrative");
      }
    }
  });

  it("keeps a spec with no schematic axis at the status of its content", () => {
    const assumptions = allSpecs.filter((s) => s.type === "assumption-sensitivity");
    expect(assumptions.length).toBeGreaterThan(0);
    for (const spec of assumptions) {
      expect(spec.axes).toEqual([]);
      expect(spec.epistemic).toBe("derived");
    }
  });

  it("gives every spec a status no stronger than every element it contains", () => {
    for (const spec of allSpecs) {
      const elements: EpistemicStatus[] = [
        ...spec.entities.map((e) => e.epistemic),
        ...spec.relationships.map((r) => r.epistemic),
        ...spec.axes.map((a) => a.epistemic),
      ];
      for (const element of elements) {
        expect(rank(spec.epistemic), `${spec.id} vs ${element}`).toBeGreaterThanOrEqual(
          Math.min(rank(element), rank(spec.epistemic)),
        );
      }
      // The figure as a whole is never stronger than its weakest axis.
      for (const axis of spec.axes) {
        expect(rank(spec.epistemic)).toBeGreaterThanOrEqual(rank(axis.epistemic));
      }
    }
  });

  it("never marks a figure `verified`", () => {
    for (const spec of allSpecs) expect(spec.epistemic).not.toBe("verified");
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation
// ---------------------------------------------------------------------------

describe("the unsupported fixture degrades gracefully", () => {
  const p = forName("unsupported_tendsto_fixture");

  it("still gets a spec", () => {
    expect(p.specs.length).toBeGreaterThanOrEqual(1);
    expect(p.specs.map((s) => s.type)).toContain("expression-tree");
  });

  it("preserves the conclusion as an entity", () => {
    const spec = p.specs.find((s) => s.type === "expression-tree")!;
    const conclusion = spec.entities.find((e) => e.id === "conclusion")!;
    expect(conclusion.label).toBe(p.theorem.conclusionDisplay);
    expect(conclusion.label).toContain("Tendsto");
  });

  it("says why it is showing structure instead of a picture", () => {
    const spec = p.specs.find((s) => s.type === "expression-tree")!;
    expect(spec.rationale).toContain("Filter.Tendsto");
    expect(spec.annotations.map((a) => a.text).join(" ")).toMatch(/Nothing here is guessed/);
  });

  it("preserves hypotheses and conclusion when an unsupported theorem has some", () => {
    // Built by hand: every unsupported declaration left in the corpus is
    // hypothesis-free, so this shape needs constructing to be checked at all.
    const theorem = synthetic(opaqueProp("Quasar.emits q atTop", "Quasar.emits"), {
      name: "Made.Up.quasar",
      hypotheses: [
        { symbol: "hq", proposition: rel("less-than", num(0), v("q")) },
        {
          symbol: "hr",
          proposition: rel("less-than-or-equal", v("q"), v("r")),
          unusedInProof: true,
        },
      ],
    });
    const classifications = classifyTheorem(theorem);
    expect(classifications.map((c) => c.payload.kind)).toContain("unsupported");

    const spec = planVisuals(theorem, classifications).find((x) => x.type === "expression-tree")!;
    const labels = spec.entities.map((e) => e.label);
    expect(labels).toContain(theorem.conclusionDisplay);
    for (const h of theorem.hypotheses) {
      expect(labels).toContain(`${h.symbol} : ${h.display}`);
    }
    expect(spec.relationships).toHaveLength(theorem.hypotheses.length);
    const states = spec.entities.filter((e) => e.kind === "hypothesis").map((e) => e.state);
    expect(states).toEqual(["used", "unused"]);
  });

  it("plans an expression tree for every unsupported declaration in the corpus", () => {
    const unsupported = planned.filter((x) =>
      x.classifications.some((c) => c.payload.kind === "unsupported"),
    );
    // `switching_coefficient_ne_zero` is read by the `distinctness` classifier
    // now, leaving the deliberate convergence fixture as the only one.
    expect(unsupported.map((x) => x.theorem.name.split(".").pop())).toEqual([
      "unsupported_tendsto_fixture",
    ]);
    for (const x of unsupported) {
      expect(x.specs.map((s) => s.type)).toContain("expression-tree");
    }
  });
});

// ---------------------------------------------------------------------------
// Structural invariant renderers depend on
// ---------------------------------------------------------------------------

describe("relationship endpoints", () => {
  const allSpecs = [
    ...planned.flatMap((p) => p.specs),
    ...planned.flatMap((p) => p.specsWithGraph),
  ];

  it("has relationships to check", () => {
    expect(allSpecs.flatMap((s) => s.relationships).length).toBeGreaterThan(50);
  });

  it("resolves every `from` and `to` to an entity in the same spec", () => {
    for (const spec of allSpecs) {
      const ids = new Set(spec.entities.map((e) => e.id));
      for (const relationship of spec.relationships) {
        expect(
          ids.has(relationship.from),
          `${spec.id}: ${relationship.id}.from=${relationship.from}`,
        ).toBe(true);
        expect(
          ids.has(relationship.to),
          `${spec.id}: ${relationship.id}.to=${relationship.to}`,
        ).toBe(true);
      }
    }
  });

  it("gives every entity within a spec a unique id", () => {
    for (const spec of allSpecs) {
      const ids = spec.entities.map((e) => e.id);
      expect(new Set(ids).size, spec.id).toBe(ids.length);
    }
  });

  it("gives every relationship within a spec a unique id", () => {
    for (const spec of allSpecs) {
      const ids = spec.relationships.map((r) => r.id);
      expect(new Set(ids).size, spec.id).toBe(ids.length);
    }
  });

  it("gives every annotation within a spec a unique id", () => {
    for (const spec of allSpecs) {
      const ids = spec.annotations.map((a) => a.id);
      expect(new Set(ids).size, spec.id).toBe(ids.length);
    }
  });

  it("keeps normalised positions inside [0,1] and layers non-negative", () => {
    for (const spec of allSpecs) {
      for (const entity of spec.entities) {
        const position = entity.position;
        if (!position) continue;
        if (position.x !== undefined) {
          expect(position.x).toBeGreaterThanOrEqual(0);
          expect(position.x).toBeLessThanOrEqual(1);
        }
        if (position.y !== undefined) {
          expect(position.y).toBeGreaterThanOrEqual(0);
          expect(position.y).toBeLessThanOrEqual(1);
        }
        if (position.layer !== undefined) expect(position.layer).toBeGreaterThanOrEqual(0);
        if (position.order !== undefined) expect(position.order).toBeGreaterThanOrEqual(0);
      }
      for (const axis of spec.axes) {
        for (const tick of axis.ticks) {
          expect(tick.at).toBeGreaterThanOrEqual(0);
          expect(tick.at).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Assumption-sensitivity figure
// ---------------------------------------------------------------------------

describe("the assumption-sensitivity figure", () => {
  const spec = forName("simple_upper_bound").specs.find(
    (s) => s.type === "assumption-sensitivity",
  )!;

  it("draws every hypothesis plus the conclusion", () => {
    expect(spec.entities.map((e) => e.label)).toEqual(["h", "hP", "hT", "x ≤ P / T"]);
  });

  it("marks used hypotheses `used` and unused ones `unused`", () => {
    const state = (label: string) => spec.entities.find((e) => e.label === label)!.state;
    expect(state("h")).toBe("used");
    expect(state("hP")).toBe("unused");
    expect(state("hT")).toBe("unused");
  });

  it("only draws support edges from the hypotheses the proof uses", () => {
    expect(spec.relationships).toHaveLength(1);
    expect(spec.relationships[0]!.to).toBe("conclusion");
    expect(spec.entities.find((e) => e.id === spec.relationships[0]!.from)!.label).toBe("h");
  });

  it("carries the caveat that this is a fact about the proof", () => {
    const caveat = spec.annotations.find((a) => a.id === "caveat")!;
    expect(caveat.text).toMatch(/a fact about the proof, not about mathematical necessity/);
  });

  it("counts the unused hypotheses in a callout", () => {
    expect(spec.annotations.find((a) => a.id === "callout:unused")!.text).toBe(
      "2 of 3 hypotheses are never used.",
    );
  });

  it("omits the callout when nothing is unused", () => {
    const clean = forName("div_upper_bound").specs.find(
      (s) => s.type === "assumption-sensitivity",
    )!;
    expect(clean.annotations.map((a) => a.id)).not.toContain("callout:unused");
    expect(clean.relationships).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Dependency graph specs
// ---------------------------------------------------------------------------

describe("dependency graph specs", () => {
  it("appear only when a dependency context is supplied", () => {
    for (const p of planned) {
      expect(p.specs.map((s) => s.type)).not.toContain("dependency-graph");
    }
    const withGraph = planned.filter((p) =>
      p.specsWithGraph.some((s) => s.type === "dependency-graph"),
    );
    expect(withGraph.length).toBeGreaterThan(0);
  });

  it("are skipped for a declaration with no local dependencies", () => {
    const isolated = planned.filter((p) => !graph.value.edges.some((e) => e.from === p.theorem.id));
    expect(isolated.length).toBeGreaterThan(0);
    for (const p of isolated) {
      expect(p.specsWithGraph.map((s) => s.type)).not.toContain("dependency-graph");
    }
  });

  it("say how many dependencies were left undrawn", () => {
    for (const spec of planned
      .flatMap((p) => p.specsWithGraph)
      .filter((s) => s.type === "dependency-graph")) {
      expect(spec.annotations.map((a) => a.text).join(" ")).toMatch(
        /further dependencies lie outside the extracted modules/,
      );
    }
  });
});
