/**
 * Provenance is the whole product surface.
 *
 * Every classification and every planned figure has to be able to answer "why
 * are you showing me this?" by pointing at a declaration and naming a rule.
 * These tests check that across the entire real corpus.
 */
import { describe, expect, it } from "vitest";
import { lowerDocument, renderExpression } from "@prooflens/math-ir";
import {
  RULES,
  classifyTheorem,
  dependencyGraph,
  explain,
  subgraphFor,
} from "@prooflens/classifier";
import { planVisuals, type VisualSpec } from "@prooflens/visual-ir";
import { corpus, CORPUS_DECLARATION_COUNT, decl } from "../../pipeline/test/helpers.js";
import { opaqueProp, synthetic } from "./synthetic.js";

const doc = corpus();
const math = lowerDocument(doc);
const graph = dependencyGraph(doc);
const declarationNames = new Set(doc.declarations.map((d) => d.name));

const analysed = math.theorems.map((theorem) => {
  const classifications = classifyTheorem(theorem);
  return {
    theorem,
    classifications,
    visuals: planVisuals(theorem, classifications, { dependencies: graph.value }),
  };
});

// ---------------------------------------------------------------------------
// Classifications
// ---------------------------------------------------------------------------

describe("classification provenance", () => {
  it("has something to check for all 34 declarations", () => {
    expect(analysed).toHaveLength(CORPUS_DECLARATION_COUNT);
    expect(analysed.flatMap((a) => a.classifications).length).toBeGreaterThan(50);
  });

  it("gives every classification a non-empty list of sources", () => {
    for (const { theorem, classifications } of analysed) {
      for (const c of classifications) {
        expect(c.claim.provenance.sources.length, `${theorem.name} / ${c.rule.id}`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("points every source at the theorem it is about", () => {
    for (const { theorem, classifications } of analysed) {
      for (const c of classifications) {
        for (const source of c.claim.provenance.sources) {
          expect(source.declaration, `${theorem.name} / ${c.rule.id}`).toBe(theorem.name);
          expect(source.system).toBe("lean4");
        }
      }
    }
  });

  it("records a rule on every classification claim", () => {
    const known = new Set<string>(Object.values(RULES).map((r) => r.id));
    for (const { classifications } of analysed) {
      for (const c of classifications) {
        expect(c.claim.provenance.rule).toBeDefined();
        expect(c.claim.provenance.rule!.id).toBe(c.rule.id);
        expect(known.has(c.claim.provenance.rule!.id)).toBe(true);
        expect(c.claim.provenance.rule!.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("records the theorem as an input on every classification claim", () => {
    for (const { theorem, classifications } of analysed) {
      for (const c of classifications) {
        expect(c.claim.provenance.inputs).toEqual([theorem.id]);
      }
    }
  });

  it("gives every source a structural path into the declaration", () => {
    for (const { classifications } of analysed) {
      for (const c of classifications) {
        for (const source of c.claim.provenance.sources) {
          expect(typeof source.path).toBe("string");
          expect(source.path!.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Visual specs
// ---------------------------------------------------------------------------

describe("visual spec provenance", () => {
  const specs: VisualSpec[] = analysed.flatMap((a) => a.visuals);

  it("plans a substantial number of figures to check", () => {
    expect(specs.length).toBeGreaterThanOrEqual(CORPUS_DECLARATION_COUNT);
  });

  it("gives every spec a non-empty rationale", () => {
    for (const spec of specs) {
      expect(typeof spec.rationale).toBe("string");
      expect(spec.rationale.trim().length, spec.id).toBeGreaterThan(0);
      expect(spec.rationale).not.toMatch(/undefined|\[object/);
    }
  });

  it("gives every spec non-empty provenance sources", () => {
    for (const spec of specs) {
      expect(spec.provenance.sources.length, spec.id).toBeGreaterThan(0);
      for (const source of spec.provenance.sources) {
        expect(declarationNames.has(source.declaration), `${spec.id} → ${source.declaration}`).toBe(
          true,
        );
      }
    }
  });

  it("records the originating theorem as an input on every spec", () => {
    for (const { theorem, visuals } of analysed) {
      for (const spec of visuals) {
        expect(spec.provenance.inputs, spec.id).toEqual([theorem.id]);
      }
    }
  });

  it("names a known rule whenever a spec cites one", () => {
    const known = new Set<string>(Object.values(RULES).map((r) => r.id));
    for (const spec of specs) {
      if (!spec.provenance.rule) continue;
      expect(known.has(spec.provenance.rule.id), `${spec.id} → ${spec.provenance.rule.id}`).toBe(
        true,
      );
    }
  });

  it("gives every spec a non-empty title and a stable id prefixed by its declaration", () => {
    for (const { theorem, visuals } of analysed) {
      for (const spec of visuals) {
        expect(spec.title.trim().length).toBeGreaterThan(0);
        expect(spec.id.startsWith(`${theorem.id}:`), spec.id).toBe(true);
      }
    }
  });

  it("gives each declaration's specs distinct ids", () => {
    for (const { visuals } of analysed) {
      const ids = visuals.map((v) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

describe("visual entity provenance", () => {
  const entities = analysed.flatMap((a) => a.visuals).flatMap((v) => v.entities);

  it("has entities to check", () => {
    expect(entities.length).toBeGreaterThan(100);
  });

  it("names a real declaration in every entity sourceRef", () => {
    for (const entity of entities) {
      if (!entity.sourceRef) continue;
      expect(
        declarationNames.has(entity.sourceRef.declaration),
        `${entity.id} → ${entity.sourceRef.declaration}`,
      ).toBe(true);
    }
  });

  it("names a real declaration in every relationship sourceRef", () => {
    for (const spec of analysed.flatMap((a) => a.visuals)) {
      for (const relationship of spec.relationships) {
        if (!relationship.sourceRef) continue;
        expect(declarationNames.has(relationship.sourceRef.declaration)).toBe(true);
      }
    }
  });

  it("points every entity of a theorem's own figures at that theorem, except graph nodes", () => {
    for (const { theorem, visuals } of analysed) {
      for (const spec of visuals) {
        if (spec.type === "dependency-graph") continue; // nodes are other declarations
        for (const entity of spec.entities) {
          if (!entity.sourceRef) continue;
          expect(entity.sourceRef.declaration, `${spec.id} / ${entity.id}`).toBe(theorem.name);
        }
      }
    }
  });

  it("gives every entity a non-empty label and a lattice status", () => {
    for (const entity of entities) {
      expect(entity.label.length, entity.id).toBeGreaterThan(0);
      expect([
        "verified",
        "derived",
        "interpreted",
        "heuristic",
        "illustrative",
        "speculative",
      ]).toContain(entity.epistemic);
    }
  });

  it("never marks a visual element `verified` — a picture is never what the kernel checked", () => {
    for (const entity of entities) expect(entity.epistemic).not.toBe("verified");
  });
});

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

describe("explanation provenance", () => {
  const layered = math.theorems.map((theorem) => ({
    theorem,
    layers: explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: doc.declarations.find((d) => d.name === theorem.name)!,
    }),
  }));

  it("produces layers for every declaration", () => {
    for (const { theorem, layers } of layered) {
      expect(layers.length, theorem.name).toBeGreaterThan(0);
      expect(layers[0]!.id).toBe("formal");
    }
  });

  it("gives every layer a non-empty title, text and source list", () => {
    for (const { layers } of layered) {
      for (const layer of layers) {
        expect(layer.title.length).toBeGreaterThan(0);
        expect(layer.claim.value.trim().length).toBeGreaterThan(0);
        expect(layer.claim.provenance.sources.length).toBeGreaterThan(0);
      }
    }
  });

  it("marks only the formal layer `verified`, and only by transcription", () => {
    for (const { theorem, layers } of layered) {
      for (const layer of layers) {
        if (layer.claim.status !== "verified") continue;
        expect(layer.id).toBe("formal");
        const isDefinition = theorem.kind === "definition" || theorem.kind === "opaque";
        expect(layer.title, theorem.name).toBe(
          isDefinition ? "What was defined" : "What was proved",
        );
        expect(layer.claim.provenance.rule).toBeUndefined();
      }
    }
  });

  it("titles the kernel layer by what the kernel actually did", () => {
    const titles = new Map<string, number>();
    for (const { layers } of layered) {
      for (const layer of layers) {
        if (layer.claim.status !== "verified") continue;
        titles.set(layer.title, (titles.get(layer.title) ?? 0) + 1);
      }
    }
    // 31 theorems were proved; 3 definitions were accepted, not proved.
    expect([...titles.entries()].sort()).toEqual([
      ["What was defined", 3],
      ["What was proved", 31],
    ]);
  });

  it("drops the formal layer to `derived` when there is no kernel witness", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".simple_upper_bound"))!;
    const layers = explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: { ...decl("simple_upper_bound"), usesSorry: true },
    });
    expect(layers[0]!.id).toBe("formal");
    expect(layers[0]!.title).toBe("What was stated");
    expect(layers[0]!.claim.status).toBe("derived");
  });

  it("reads a definition out loud instead of claiming it cannot", () => {
    // The `mathematical` layer used to build itself from `theorem.conclusion`,
    // which for a definition is its return type — so it reported that ProofLens
    // had no reading for `ℝ`, contradicting the layer directly beneath it.
    const theorem = math.theorems.find((t) => t.name.endsWith(".landauerCost"))!;
    const layers = explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: decl("landauerCost"),
    });

    const mathematical = layers.find((l) => l.id === "mathematical")!;
    expect(mathematical.claim.value).toBe("landauerCost is defined to be kB · T · log(2) / D.");
    expect(mathematical.claim.value).not.toContain("does not have a reading");
    expect(mathematical.claim.status).toBe("derived");

    // And it agrees with the structural layer rather than contradicting it.
    expect(layers.find((l) => l.id === "structural")!.claim.value).toContain(
      "landauerCost(kB, T, D)",
    );
  });

  it("names the body in the `In words` layer for every corpus definition", () => {
    const expected: Record<string, string> = {
      energyBudget: "energyBudget is defined to be P · t.",
      landauerCost: "landauerCost is defined to be kB · T · log(2) / D.",
      throughput: "throughput is defined to be ipc · f.",
    };
    for (const [short, sentence] of Object.entries(expected)) {
      const theorem = math.theorems.find((t) => t.name.endsWith(`.${short}`))!;
      const layers = explain(theorem, classifyTheorem(theorem), {
        formalDocument: doc,
        formalDeclaration: decl(short),
      });
      expect(layers.find((l) => l.id === "mathematical")!.claim.value, short).toBe(sentence);
    }
  });

  it("says something true when a definition's body was not extracted", () => {
    // The extractor skips bodies past a size threshold; no corpus declaration
    // hits it, so this branch has to be constructed to be checked at all.
    const theorem = synthetic(opaqueProp("Real", "Real"), {
      name: "Made.Up.enormous",
      kind: "definition",
    });
    expect(theorem.definitionBody).toBeNull();

    const mathematical = explain(theorem, classifyTheorem(theorem)).find(
      (l) => l.id === "mathematical",
    )!;
    expect(mathematical.claim.value).toBe(
      "enormous introduces a definition of type Real. Its body was not extracted.",
    );
    // It must not claim to be stumped, and it must not invent a body.
    expect(mathematical.claim.value).not.toContain("does not have a reading");
    expect(mathematical.claim.value).toContain("not extracted");
  });

  it("still admits it cannot read a theorem whose structure it does not recognise", () => {
    // The definition branches must not have swallowed the honest admission.
    const theorem = math.theorems.find((t) => t.name.endsWith(".unsupported_tendsto_fixture"))!;
    const mathematical = explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: decl("unsupported_tendsto_fixture"),
    }).find((l) => l.id === "mathematical")!;
    expect(mathematical.claim.value).toContain("does not have a reading for its head symbol");
  });

  it("titles a definition's kernel layer `What was defined`", () => {
    // The kernel accepted that `landauerCost : ℝ → ℝ → ℝ → ℝ`. It proved nothing.
    const theorem = math.theorems.find((t) => t.name.endsWith(".landauerCost"))!;
    const layers = explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: decl("landauerCost"),
    });
    expect(layers[0]!.id).toBe("formal");
    expect(layers[0]!.title).toBe("What was defined");
    expect(layers[0]!.claim.value).toBe("ℝ → ℝ → ℝ → ℝ");
    expect(layers[0]!.claim.status).toBe("verified");
  });

  it("keeps `What was proved` for theorems", () => {
    for (const short of ["simple_upper_bound", "information_rate_bound", "log_two_pos"]) {
      const theorem = math.theorems.find((t) => t.name.endsWith(`.${short}`))!;
      const layers = explain(theorem, classifyTheorem(theorem), {
        formalDocument: doc,
        formalDeclaration: decl(short),
      });
      expect(layers[0]!.title, short).toBe("What was proved");
    }
  });

  it("words the structural layer for what the declaration is", () => {
    const structuralOf = (short: string) => {
      const theorem = math.theorems.find((t) => t.name.endsWith(`.${short}`))!;
      return explain(theorem, classifyTheorem(theorem), {
        formalDocument: doc,
        formalDeclaration: decl(short),
      }).find((l) => l.id === "structural")!.claim.value;
    };

    // A definition expresses; a theorem defines.
    expect(structuralOf("landauerCost")).toBe(
      "The definition expresses `landauerCost(kB, T, D)` in terms of the other quantities.",
    );
    expect(structuralOf("rate_eq_count_div_time")).toBe(
      "The theorem defines `R` in terms of the other quantities.",
    );
  });

  it("never calls a definition a theorem in any layer", () => {
    for (const short of ["energyBudget", "landauerCost", "throughput"]) {
      const theorem = math.theorems.find((t) => t.name.endsWith(`.${short}`))!;
      const layers = explain(theorem, classifyTheorem(theorem), {
        formalDocument: doc,
        formalDeclaration: decl(short),
      });
      for (const layer of layers) {
        expect(layer.claim.value, `${short} / ${layer.id}`).not.toMatch(/\btheorem\b/i);
        expect(layer.title).not.toMatch(/proved/i);
      }
    }
  });

  it("describes the informative reading of a lower-bound-natural theorem", () => {
    // `A / B ≤ x` reads naturally as "x is at least A / B". Before the layers
    // were gated on `natural`, this said "`A / B` cannot exceed `x`" — true,
    // and useless.
    const theorem = math.theorems.find((t) => t.name.endsWith(".simple_lower_bound"))!;
    const classifications = classifyTheorem(theorem);
    expect(
      (
        classifications.find((c) => c.payload.kind === "lower-bound")!.payload.data as {
          natural: boolean;
        }
      ).natural,
    ).toBe(true);

    const layers = explain(theorem, classifications, {
      formalDocument: doc,
      formalDeclaration: decl("simple_lower_bound"),
    });
    const structural = layers.find((l) => l.id === "structural")!.claim.value;
    expect(structural).toBe("The theorem establishes a lower bound: `x` is at least `A / B`.");
    expect(structural).not.toContain("cannot exceed");
  });

  it("keeps the upper wording for an upper-bound-natural theorem", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".simple_upper_bound"))!;
    const structural = explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: decl("simple_upper_bound"),
    }).find((l) => l.id === "structural")!.claim.value;
    expect(structural).toBe(
      "The theorem establishes an upper bound: `x` cannot exceed `P / T` under the stated assumptions.",
    );
  });

  it("never describes a bound the classifier marked unnatural", () => {
    for (const { theorem, layers } of layered) {
      const unnatural = classifyTheorem(theorem).find(
        (c) =>
          (c.payload.kind === "upper-bound" || c.payload.kind === "lower-bound") &&
          !c.payload.data.natural,
      );
      if (!unnatural || unnatural.payload.kind === "assumption-sensitivity") continue;
      const structural = layers.find((l) => l.id === "structural")!.claim.value;
      const data = unnatural.payload.data as { boundedQuantity: { path: string } };
      const uselessSubject = renderExpression(
        data.boundedQuantity as Parameters<typeof renderExpression>[0],
      );
      const naturalClassification = classifyTheorem(theorem).find(
        (c) =>
          (c.payload.kind === "upper-bound" || c.payload.kind === "lower-bound") &&
          c.payload.data.natural,
      )!;
      const goodSubject = renderExpression(
        (
          naturalClassification.payload.data as {
            boundedQuantity: Parameters<typeof renderExpression>[0];
          }
        ).boundedQuantity,
      );
      // The sentence must be about the natural reading's subject.
      if (uselessSubject !== goodSubject) {
        expect(structural, theorem.name).toContain(`\`${goodSubject}\``);
      }
    }
  });

  it("attaches the parameters layer only to a natural bound, of either direction", () => {
    for (const { theorem, layers } of layered) {
      const hasParameters = layers.some((l) => l.id === "parameters");
      if (!hasParameters) continue;
      const natural = classifyTheorem(theorem).find(
        (c) =>
          (c.payload.kind === "upper-bound" || c.payload.kind === "lower-bound") &&
          c.payload.data.natural,
      );
      expect(
        natural,
        `${theorem.name} has a parameters layer without a natural bound`,
      ).toBeDefined();
      expect(
        (natural!.payload.data as { sensitivity: unknown[] }).sensitivity.length,
      ).toBeGreaterThan(0);
    }
  });

  it("describes how a lower bound responds, not how the useless upper reading does", () => {
    // A lower bound responds to its parameters exactly as meaningfully as an
    // upper one. What must never happen is a sentence about the reading nobody
    // asked for -- here, the trivial claim that `x` bounds `A / B` above.
    const theorem = math.theorems.find((t) => t.name.endsWith(".simple_lower_bound"))!;
    const layers = explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: decl("simple_lower_bound"),
    });
    const parameters = layers.find((l) => l.id === "parameters");
    expect(parameters).toBeDefined();
    expect(parameters!.title).toBe("How the lower bound responds");
    expect(parameters!.claim.value).toContain("The lower bound is `A / B`");
    expect(parameters!.claim.value).toContain("increasing `A` increases it");
    expect(parameters!.claim.value).not.toContain("upper bound");
  });

  it("still gives the Landauer bound its parameters layer, with all four directions", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".information_rate_bound"))!;
    const parameters = explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: decl("information_rate_bound"),
    }).find((l) => l.id === "parameters")!;
    expect(parameters).toBeDefined();
    expect(parameters.title).toBe("How the upper bound responds");
    for (const clause of [
      "increasing `P` increases it",
      "increasing `T` decreases it",
      "increasing `kB` decreases it",
      "increasing `D` increases it",
    ]) {
      expect(parameters.claim.value).toContain(clause);
    }
  });

  it("marks author-declared symbol meanings as `interpreted`, never stronger", () => {
    const theorem = math.theorems.find((t) => t.name.endsWith(".simple_upper_bound"))!;
    const layers = explain(theorem, classifyTheorem(theorem), {
      formalDocument: doc,
      formalDeclaration: decl("simple_upper_bound"),
    });
    const domain = layers.find((l) => l.id === "domain")!;
    expect(domain.claim.status).toBe("interpreted");
    expect(domain.claim.value).toMatch(/not from anything Lean checked/);
    expect(domain.claim.provenance.rule?.id).toBe("SEMANTIC_ANNOTATION_001");
  });
});

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

describe("dependency graph provenance", () => {
  it("is a derived claim citing every declaration it drew", () => {
    expect(graph.status).toBe("derived");
    expect(graph.provenance.rule!.id).toBe(RULES.DEPENDENCY_GRAPH.id);
    expect(graph.provenance.sources).toHaveLength(doc.declarations.length);
    expect(graph.provenance.note).toMatch(/outside the extracted modules/);
  });

  it("only contains nodes and edges naming real declarations", () => {
    for (const node of graph.value.nodes) expect(declarationNames.has(node.id)).toBe(true);
    for (const edge of graph.value.edges) {
      expect(declarationNames.has(edge.from)).toBe(true);
      expect(declarationNames.has(edge.to)).toBe(true);
    }
  });

  it("says how many dependencies it left out rather than implying completeness", () => {
    expect(graph.value.externalDependencyCount).toBeGreaterThan(0);
  });

  it("assigns depth 0 to declarations with no local dependencies", () => {
    const withEdges = new Set(graph.value.edges.map((e) => e.from));
    for (const node of graph.value.nodes) {
      if (!withEdges.has(node.id)) expect(node.depth).toBe(0);
      else expect(node.depth).toBeGreaterThan(0);
    }
  });

  it("restricts a subgraph to the transitive closure below its root", () => {
    const root = "ProofLens.Examples.information_rate_bound";
    const sub = subgraphFor(graph.value, root);
    expect(sub.nodes.map((n) => n.id)).toContain(root);
    const kept = new Set(sub.nodes.map((n) => n.id));
    for (const edge of sub.edges) {
      expect(kept.has(edge.from)).toBe(true);
      expect(kept.has(edge.to)).toBe(true);
    }
    expect(sub.externalDependencyCount).toBe(graph.value.externalDependencyCount);
  });
});
