import { describe, expect, it } from "vitest";
import { classifyTheorem } from "@prooflens/classifier";
import { lowerDocument, type SemanticAnnotation } from "@prooflens/math-ir";
import {
  compileSemanticScene,
  evaluateMathExpression,
  evaluateSemanticScene,
  initialSceneValues,
  sampleSemanticScene,
} from "@prooflens/visual-ir";
import { corpus } from "../../pipeline/test/helpers.js";
import { num, op, rel, synthetic, v } from "../../classifier/test/synthetic.js";

function informationRateBound() {
  const theorem = lowerDocument(corpus()).theorems.find(
    (candidate) => candidate.name.split(".").pop() === "information_rate_bound",
  );
  if (!theorem) throw new Error("information_rate_bound fixture missing");
  return theorem;
}

describe("semantic scene compiler", () => {
  it("turns the Landauer intelligence bound into a numeric meaning scene", () => {
    const theorem = informationRateBound();
    const result = compileSemanticScene(theorem, classifyTheorem(theorem));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.scene.title).toBe("Landauer information-rate bound");
    expect(result.scene.direction).toBe("upper");
    expect(result.scene.parameters.map((parameter) => parameter.symbol)).toEqual([
      "P",
      "T",
      "kB",
      "D",
    ]);
    expect(
      result.scene.parameters.find((parameter) => parameter.id === result.scene.xParameterId)
        ?.symbol,
    ).toBe("P");
    expect(
      result.scene.parameters.every((parameter) => parameter.epistemic === "interpreted"),
    ).toBe(true);
    expect(result.scene.epistemic).toBe("illustrative");
    expect(result.scene.provenance.note).toContain("inequality comes from Lean");
  });

  it("evaluates the verified formula and flips feasibility at the boundary", () => {
    const theorem = informationRateBound();
    const result = compileSemanticScene(theorem, classifyTheorem(theorem));
    if (result.status !== "ready") throw new Error(result.reason);
    const values = initialSceneValues(result.scene);

    const expected = 1 / Math.log(2);
    expect(evaluateMathExpression(result.scene.bound, values)).toBeCloseTo(expected, 10);
    expect(evaluateSemanticScene(result.scene, values, expected).feasible).toBe(true);
    expect(evaluateSemanticScene(result.scene, values, expected + 0.01).feasible).toBe(false);
  });

  it("samples the author-selected x axis while holding other parameters fixed", () => {
    const theorem = informationRateBound();
    const result = compileSemanticScene(theorem, classifyTheorem(theorem));
    if (result.status !== "ready") throw new Error(result.reason);
    const points = sampleSemanticScene(result.scene, initialSceneValues(result.scene), 5);

    expect(points).toHaveLength(5);
    expect(points[0]!.x).toBe(0.1);
    expect(points.at(-1)!.x).toBe(10);
    expect(points[0]!.bound).toBeLessThan(points.at(-1)!.bound);
  });

  it("fails closed when a parameter has no declared meaning or domain", () => {
    const theorem = synthetic(rel("less-than-or-equal", v("r"), op("div", v("P"), v("C"))), {
      variables: ["r", "P", "C"],
    });
    const result = compileSemanticScene(theorem, classifyTheorem(theorem));
    expect(result).toMatchObject({ status: "blocked", code: "MISSING_SEMANTICS" });
  });

  it("fails closed for unknown domains instead of inventing a slider range", () => {
    const theorem = synthetic(rel("less-than-or-equal", v("r"), op("mul", v("P"), num(2))), {
      variables: ["r", "P"],
    });
    const annotation: SemanticAnnotation = {
      target: "P",
      meaning: "available power",
      domain: "complex projective space",
    };
    theorem.variables.find((variable) => variable.symbol === "P")!.annotation = annotation;
    theorem.annotations = [annotation];
    const result = compileSemanticScene(theorem, classifyTheorem(theorem));
    expect(result).toMatchObject({ status: "blocked", code: "UNSUPPORTED_DOMAIN" });
  });
});
