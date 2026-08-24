import { describe, expect, it } from "vitest";
import {
  EPISTEMIC_GLOSS,
  EPISTEMIC_ORDER,
  STANDARD_AXIOMS,
  isAtLeast,
  rank,
  unusualAxioms,
  weakest,
  type EpistemicStatus,
} from "@prooflens/epistemics";

const ALL: readonly EpistemicStatus[] = EPISTEMIC_ORDER;

describe("EPISTEMIC_ORDER", () => {
  it("lists the six statuses strongest first", () => {
    expect([...EPISTEMIC_ORDER]).toEqual([
      "verified",
      "derived",
      "interpreted",
      "heuristic",
      "illustrative",
      "speculative",
    ]);
  });

  it("has a human gloss for every status and no extras", () => {
    expect(Object.keys(EPISTEMIC_GLOSS).sort()).toEqual([...ALL].sort());
    for (const status of ALL) {
      expect(EPISTEMIC_GLOSS[status].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

describe("rank", () => {
  it("assigns 0..5 in declaration order", () => {
    expect(ALL.map(rank)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("is strictly increasing as certainty decreases", () => {
    for (let i = 1; i < ALL.length; i += 1) {
      expect(rank(ALL[i]!)).toBeGreaterThan(rank(ALL[i - 1]!));
    }
  });

  it("gives `verified` the unique minimum", () => {
    expect(rank("verified")).toBe(0);
    for (const status of ALL) {
      if (status !== "verified") expect(rank(status)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// weakest
// ---------------------------------------------------------------------------

describe("weakest", () => {
  it("returns `speculative` for an empty list", () => {
    // Nothing was supplied, so nothing may be believed.
    expect(weakest()).toBe("speculative");
    expect(weakest(...([] as EpistemicStatus[]))).toBe("speculative");
  });

  it("is the identity on a single status", () => {
    for (const status of ALL) expect(weakest(status)).toBe(status);
  });

  it("picks whichever of a pair has the higher rank", () => {
    for (const a of ALL) {
      for (const b of ALL) {
        const expected = rank(a) >= rank(b) ? a : b;
        expect(weakest(a, b)).toBe(expected);
      }
    }
  });

  it("is commutative", () => {
    for (const a of ALL) {
      for (const b of ALL) {
        expect(weakest(a, b)).toBe(weakest(b, a));
      }
    }
  });

  it("is associative", () => {
    for (const a of ALL) {
      for (const b of ALL) {
        for (const c of ALL) {
          expect(weakest(weakest(a, b), c)).toBe(weakest(a, weakest(b, c)));
        }
      }
    }
  });

  it("is idempotent", () => {
    for (const a of ALL) expect(weakest(a, a)).toBe(a);
  });

  it("never returns something stronger than any of its inputs", () => {
    for (const a of ALL) {
      for (const b of ALL) {
        for (const c of ALL) {
          const result = weakest(a, b, c);
          expect(rank(result)).toBeGreaterThanOrEqual(rank(a));
          expect(rank(result)).toBeGreaterThanOrEqual(rank(b));
          expect(rank(result)).toBeGreaterThanOrEqual(rank(c));
        }
      }
    }
  });

  it("only returns `verified` when every input is `verified`", () => {
    for (const a of ALL) {
      for (const b of ALL) {
        if (weakest(a, b) === "verified") {
          expect(a).toBe("verified");
          expect(b).toBe("verified");
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isAtLeast
// ---------------------------------------------------------------------------

describe("isAtLeast", () => {
  it("agrees with rank comparison over every pair", () => {
    for (const status of ALL) {
      for (const floor of ALL) {
        expect(isAtLeast(status, floor)).toBe(rank(status) <= rank(floor));
      }
    }
  });

  it("is reflexive", () => {
    for (const status of ALL) expect(isAtLeast(status, status)).toBe(true);
  });

  it("holds for `verified` against every floor", () => {
    for (const floor of ALL) expect(isAtLeast("verified", floor)).toBe(true);
  });

  it("fails for `speculative` against every floor except itself", () => {
    for (const floor of ALL) {
      expect(isAtLeast("speculative", floor)).toBe(floor === "speculative");
    }
  });
});

// ---------------------------------------------------------------------------
// unusualAxioms
// ---------------------------------------------------------------------------

describe("unusualAxioms", () => {
  it("filters exactly the three standard axioms", () => {
    expect([...STANDARD_AXIOMS]).toEqual(["propext", "Classical.choice", "Quot.sound"]);
    expect(unusualAxioms(["propext", "Classical.choice", "Quot.sound"])).toEqual([]);
  });

  it("keeps anything outside the standard three, in order", () => {
    expect(
      unusualAxioms(["propext", "ProofLens.myAxiom", "Classical.choice", "sorryAx", "Quot.sound"]),
    ).toEqual(["ProofLens.myAxiom", "sorryAx"]);
  });

  it("returns an empty list for no axioms", () => {
    expect(unusualAxioms([])).toEqual([]);
  });

  it("does not treat a name that merely contains a standard axiom as standard", () => {
    expect(unusualAxioms(["Classical.choice_spec", "propextensionality"])).toEqual([
      "Classical.choice_spec",
      "propextensionality",
    ]);
  });

  it("does not mutate its argument", () => {
    const input = ["propext", "weird"];
    unusualAxioms(input);
    expect(input).toEqual(["propext", "weird"]);
  });
});
