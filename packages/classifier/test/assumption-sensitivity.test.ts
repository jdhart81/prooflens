/**
 * ProofLens's flagship analysis, checked against the real extraction.
 *
 * The corpus deliberately contains contrast fixtures: `simple_upper_bound`
 * states two hypotheses its proof never touches, `div_upper_bound` states the
 * same shape of conclusion with hypotheses that do real work, and
 * `information_rate_bound` is the physically interesting middle case.
 */
import { describe, expect, it } from "vitest";
import { lowerDocument, type TheoremIR } from "@prooflens/math-ir";
import {
  RULES,
  classifyTheorem,
  explain,
  type AssumptionSensitivityPayload,
  type Classification,
} from "@prooflens/classifier";
import { corpus, decl } from "../../pipeline/test/helpers.js";
import { num, rel, synthetic, v } from "./synthetic.js";

const doc = corpus();
const math = lowerDocument(doc);

function theorem(shortName: string): TheoremIR {
  const found = math.theorems.find((t) => t.name.split(".").pop() === shortName);
  if (!found) throw new Error(`no theorem ${shortName}`);
  return found;
}

function sensitivityOf(shortName: string): {
  classification: Classification;
  data: AssumptionSensitivityPayload;
} {
  const classification = classifyTheorem(theorem(shortName)).find(
    (c) => c.payload.kind === "assumption-sensitivity",
  );
  if (!classification) throw new Error(`${shortName} produced no assumption-sensitivity analysis`);
  return { classification, data: classification.payload.data as AssumptionSensitivityPayload };
}

function symbols(hypotheses: AssumptionSensitivityPayload["used"]): string[] {
  return hypotheses.map((h) => h.symbol);
}

// ---------------------------------------------------------------------------
// simple_upper_bound — the redundancy fixture
// ---------------------------------------------------------------------------

describe("simple_upper_bound", () => {
  const { classification, data } = sensitivityOf("simple_upper_bound");

  it("reports exactly `hP` and `hT` as unused in the proof", () => {
    expect(symbols(data.unusedInProof)).toEqual(["hP", "hT"]);
  });

  it("reports `h` as used", () => {
    expect(symbols(data.used)).toEqual(["h"]);
  });

  it("accounts for every stated hypothesis exactly once", () => {
    expect(symbols(data.used).concat(symbols(data.unusedInProof)).sort()).toEqual(
      theorem("simple_upper_bound")
        .hypotheses.map((h) => h.symbol)
        .sort(),
    );
    expect(data.proofTermAvailable).toBe(true);
  });

  it("keeps each unused hypothesis's statement so a reader can see what was assumed", () => {
    expect(data.unusedInProof.map((h) => h.display)).toEqual(["0 < P", "0 < T"]);
  });

  it("names both unused hypotheses in the rationale", () => {
    expect(classification.rationale).toContain("`hP`");
    expect(classification.rationale).toContain("`hT`");
    expect(classification.rule.id).toBe(RULES.ASSUMPTION_SENSITIVITY.id);
  });

  it("phrases the rationale as a fact about the proof term, not about necessity", () => {
    const text = classification.rationale;
    expect(text).toMatch(/proof term/);
    expect(text).toMatch(/elaborated/);
    // It must not overclaim that the hypotheses are unnecessary.
    expect(text.toLowerCase()).not.toContain("unnecessary");
    expect(text.toLowerCase()).not.toContain("redundant");
    expect(text.toLowerCase()).not.toContain("can be removed");
  });

  it("carries the caveat into the explanation layer a reader actually sees", () => {
    const layers = explain(
      theorem("simple_upper_bound"),
      classifyTheorem(theorem("simple_upper_bound")),
      {
        formalDocument: doc,
        formalDeclaration: decl("simple_upper_bound"),
      },
    );
    const assumptions = layers.find((l) => l.id === "assumptions");
    expect(assumptions).toBeDefined();
    const text = assumptions!.claim.value;
    expect(text).toContain("hP");
    expect(text).toContain("hT");
    expect(text).toMatch(/proof term/);
    expect(text).toMatch(/does not mean the hypothesis is mathematically unnecessary/);
    expect(text).toMatch(/this particular proof does not touch it/);
    expect(assumptions!.claim.status).toBe("derived");
  });
});

// ---------------------------------------------------------------------------
// div_upper_bound — the contrast fixture
// ---------------------------------------------------------------------------

describe("div_upper_bound", () => {
  const { classification, data } = sensitivityOf("div_upper_bound");

  it("reports zero unused hypotheses", () => {
    expect(data.unusedInProof).toEqual([]);
  });

  it("reports both stated hypotheses as used", () => {
    expect(symbols(data.used)).toEqual(["hT", "h"]);
  });

  it("says so plainly in the rationale, without a caveat it does not need", () => {
    expect(classification.rationale).toMatch(/Every one of the 2 stated hypotheses/);
    expect(classification.rationale).toMatch(/elaborated proof term/);
  });

  it("reports all-used in the explanation layer", () => {
    const t = theorem("div_upper_bound");
    const layers = explain(t, classifyTheorem(t), {
      formalDocument: doc,
      formalDeclaration: decl("div_upper_bound"),
    });
    const assumptions = layers.find((l) => l.id === "assumptions")!;
    expect(assumptions.claim.value).toBe("All 2 stated hypotheses are used by this proof.");
  });

  it("has the same conclusion as simple_upper_bound, so the difference is the proof", () => {
    expect(theorem("div_upper_bound").conclusionDisplay).toBe(
      theorem("simple_upper_bound").conclusionDisplay,
    );
  });
});

// ---------------------------------------------------------------------------
// information_rate_bound — the physically interesting case
// ---------------------------------------------------------------------------

describe("information_rate_bound", () => {
  const { classification, data } = sensitivityOf("information_rate_bound");

  it("reports exactly `hP` as unused", () => {
    expect(symbols(data.unusedInProof)).toEqual(["hP"]);
  });

  it("reports the other five hypotheses as load-bearing", () => {
    expect(symbols(data.used)).toEqual(["hT", "hkB", "hD", "ht", "hN"]);
  });

  it("uses the singular in the rationale for a single unused hypothesis", () => {
    expect(classification.rationale).toMatch(/`hP` does not occur in the elaborated proof term/);
    expect(classification.rationale).not.toMatch(/ do not occur/);
  });

  it("names only the proof term, never mathematical necessity, in the rationale", () => {
    expect(classification.rationale).toMatch(/proof term/);
    expect(classification.rationale.toLowerCase()).not.toContain("unnecessary");
  });

  it("carries the caveat into the explanation layer", () => {
    const t = theorem("information_rate_bound");
    const layers = explain(t, classifyTheorem(t), {
      formalDocument: doc,
      formalDeclaration: decl("information_rate_bound"),
    });
    const text = layers.find((l) => l.id === "assumptions")!.claim.value;
    expect(text).toContain("`hP : 0 < P`");
    expect(text).toMatch(/does not mean the hypothesis is mathematically unnecessary/);
  });
});

// ---------------------------------------------------------------------------
// No hypotheses
// ---------------------------------------------------------------------------

describe("declarations with no hypotheses", () => {
  it("produces no assumption-sensitivity classification for log_two_pos", () => {
    const t = theorem("log_two_pos");
    expect(t.hypotheses).toEqual([]);
    expect(classifyTheorem(t).map((c) => c.payload.kind)).not.toContain("assumption-sensitivity");
  });

  it("produces no assumption-sensitivity classification for any hypothesis-free declaration", () => {
    for (const t of math.theorems) {
      if (t.hypotheses.length > 0) continue;
      expect(
        classifyTheorem(t).map((c) => c.payload.kind),
        `${t.name} should not have an assumption-sensitivity analysis`,
      ).not.toContain("assumption-sensitivity");
    }
  });

  it("produces no assumption-sensitivity explanation layer either", () => {
    const t = theorem("log_two_pos");
    const layers = explain(t, classifyTheorem(t), {
      formalDocument: doc,
      formalDeclaration: decl("log_two_pos"),
    });
    expect(layers.map((l) => l.id)).not.toContain("assumptions");
  });

  it("stays silent when the proof term was not available to analyse", () => {
    // Occurrence analysis with no term to inspect would be a guess, so nothing
    // is reported at all.
    const t = synthetic(rel("less-than-or-equal", v("x"), v("y")), {
      hypotheses: [{ symbol: "hx", proposition: rel("less-than", num(0), v("x")) }],
      proofTermAvailable: false,
    });
    expect(classifyTheorem(t).map((c) => c.payload.kind)).not.toContain("assumption-sensitivity");
  });
});

// ---------------------------------------------------------------------------
// Corpus-wide invariants
// ---------------------------------------------------------------------------

describe("across the whole corpus", () => {
  const analyses = math.theorems.map((t) => ({
    theorem: t,
    classification: classifyTheorem(t).find((c) => c.payload.kind === "assumption-sensitivity"),
  }));

  it("fires for exactly the declarations that state at least one hypothesis", () => {
    for (const { theorem: t, classification } of analyses) {
      expect(Boolean(classification), t.name).toBe(t.hypotheses.length > 0);
    }
  });

  it("partitions the hypotheses without duplication or loss", () => {
    for (const { theorem: t, classification } of analyses) {
      if (!classification) continue;
      const data = classification.payload.data as AssumptionSensitivityPayload;
      const ids = [...data.used, ...data.unusedInProof].map((h) => h.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.sort()).toEqual(t.hypotheses.map((h) => h.id).sort());
    }
  });

  it("agrees with the Formal IR's own occurrence analysis", () => {
    for (const { theorem: t, classification } of analyses) {
      if (!classification) continue;
      const data = classification.payload.data as AssumptionSensitivityPayload;
      const expected = t.hypotheses.filter((h) => h.usage.unusedInProof).map((h) => h.symbol);
      expect(symbols(data.unusedInProof)).toEqual(expected);
    }
  });

  it("finds exactly the two known redundancy fixtures in this corpus", () => {
    const withUnused = analyses
      .filter(
        ({ classification }) =>
          classification &&
          (classification.payload.data as AssumptionSensitivityPayload).unusedInProof.length > 0,
      )
      .map(({ theorem: t }) => t.name.split(".").pop());
    expect(withUnused).toEqual(["information_rate_bound", "simple_upper_bound"]);
  });
});
