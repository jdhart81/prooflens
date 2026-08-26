/**
 * The critical invariant.
 *
 * ProofLens's entire value proposition is that `verified` means "the Lean kernel
 * said so" and nothing else. If `verified` can be manufactured anywhere, the
 * product is a lie with good typography. These tests are the guard.
 */
import { describe, expect, it } from "vitest";
import {
  EPISTEMIC_ORDER,
  assert_,
  derive,
  mapClaim,
  mintKernelWitness,
  rank,
  transcribe,
  weaken,
  weakest,
  type Claim,
  type EpistemicStatus,
  type KernelWitness,
  type Rule,
} from "@prooflens/epistemics";
import { lowerDocument } from "@prooflens/math-ir";
import { classifyTheorem, RULES } from "@prooflens/classifier";
import { planVisuals } from "@prooflens/visual-ir";
import { MATH_IR_RULES } from "@prooflens/math-ir";
import { corpus, CORPUS_DECLARATION_COUNT } from "../../pipeline/test/helpers.js";

const ALL: readonly EpistemicStatus[] = EPISTEMIC_ORDER;

/** A witness minted through the only legitimate door. */
function realWitness(): KernelWitness {
  const w = mintKernelWitness({
    system: "lean4",
    declaration: "ProofLens.Examples.simple_upper_bound",
    module: "ProofLensExamples.Bounds",
    axioms: ["propext"],
    provedWithoutSorry: true,
  });
  if (w === null) throw new Error("mintKernelWitness refused a legitimate mint");
  return w;
}

/**
 * Is the kernel brand reachable on this object at all, by any route?
 *
 * The brand symbol is module-private, so a test cannot name it. Comparing the
 * own-symbol set of a genuine witness against what an object resolves lets the
 * test distinguish "inherits the brand" from "does not have it".
 */
function WITNESS_BRAND_IS_VISIBLE(candidate: object): boolean {
  const brand = Object.getOwnPropertySymbols(realWitness()).find(
    (symbol) => (realWitness() as unknown as Record<symbol, unknown>)[symbol] === true,
  );
  if (brand === undefined) return false;
  return (candidate as Record<symbol, unknown>)[brand] === true;
}

// ---------------------------------------------------------------------------
// transcribe rejects non-witnesses
// ---------------------------------------------------------------------------

describe("transcribe", () => {
  it("accepts a witness minted by mintKernelWitness", () => {
    const claim = transcribe(realWitness(), "x ≤ P / T", { sources: [] });
    expect(claim.status).toBe("verified");
    expect(claim.value).toBe("x ≤ P / T");
    expect(claim.provenance.rule).toBeUndefined();
  });

  it("throws a TypeError for a plain object", () => {
    expect(() => transcribe({ hello: "world" } as never, 1, { sources: [] })).toThrow(TypeError);
  });

  it("throws a TypeError for `{}`", () => {
    expect(() => transcribe({} as never, 1, { sources: [] })).toThrow(TypeError);
  });

  it("throws a TypeError for null and undefined", () => {
    expect(() => transcribe(null as never, 1, { sources: [] })).toThrow(TypeError);
    expect(() => transcribe(undefined as never, 1, { sources: [] })).toThrow(TypeError);
  });

  it("throws a TypeError for primitives that are not witnesses", () => {
    for (const bogus of [0, 1, "", "witness", true, false, Symbol("w"), 123n]) {
      expect(() => transcribe(bogus as never, 1, { sources: [] })).toThrow(TypeError);
    }
  });

  it("throws a TypeError for a hand-rolled fake with all the right-looking fields", () => {
    // Everything a real witness has, except the brand.
    const fake = {
      system: "lean4",
      declaration: "ProofLens.Examples.simple_upper_bound",
      module: "ProofLensExamples.Bounds",
      axioms: ["propext", "Classical.choice", "Quot.sound"],
      verified: true,
      provedWithoutSorry: true,
    };
    expect(() => transcribe(fake as never, "2 + 2 = 5", { sources: [] })).toThrow(TypeError);
  });

  it("throws a TypeError when the brand is a plain string key rather than the symbol", () => {
    const fake = { "prooflens.kernel-witness": true, system: "lean4", declaration: "X" };
    expect(() => transcribe(fake as never, 1, { sources: [] })).toThrow(TypeError);
  });

  it("throws a TypeError when the brand is a *different* symbol", () => {
    const wrong = Symbol.for("prooflens.kernel-witness.v2");
    const fake = { [wrong]: true, system: "lean4", declaration: "X" };
    expect(() => transcribe(fake as never, 1, { sources: [] })).toThrow(TypeError);
    const local = Symbol("prooflens.kernel-witness");
    expect(() => transcribe({ [local]: true } as never, 1, { sources: [] })).toThrow(TypeError);
  });

  it("throws a TypeError when the brand is present but not exactly `true`", () => {
    const brand = Symbol.for("prooflens.kernel-witness");
    for (const value of [1, "true", {}, null]) {
      expect(() => transcribe({ [brand]: value } as never, 1, { sources: [] })).toThrow(TypeError);
    }
  });

  it("names the reason in the error message", () => {
    expect(() => transcribe({} as never, 1, { sources: [] })).toThrow(
      /KernelWitness minted by @prooflens\/formal-ir/,
    );
  });

  /**
   * The brand is a capability, not a naming convention.
   *
   * `WITNESS_BRAND` is a module-local `Symbol(...)`, not `Symbol.for(...)`. A
   * registry symbol is reachable by any code in the realm that knows the
   * string, which would make the brand a spelling anyone could copy. Because
   * this symbol never leaves its module, `mintKernelWitness` is the only way to
   * obtain a value `transcribe` will accept — and that function refuses to mint
   * for a declaration whose proof reached `sorryAx`.
   *
   * This test previously asserted the opposite, because the brand used to be a
   * registry symbol and the forgery below succeeded.
   */
  it("rejects a forgery built with Symbol.for — the brand is not in the global registry", () => {
    const registryBrand = Symbol.for("prooflens.kernel-witness");
    const forged = {
      [registryBrand]: true as const,
      system: "not-lean-at-all",
      declaration: "Totally.Made.Up",
      module: null,
      axioms: [] as readonly string[],
    };
    expect(() =>
      transcribe(forged as unknown as KernelWitness, "2 + 2 = 5", { sources: [] }),
    ).toThrow(TypeError);
  });

  it("rejects a Symbol.for forgery however it is dressed up", () => {
    const registryBrand = Symbol.for("prooflens.kernel-witness");
    const shapes: unknown[] = [
      { [registryBrand]: true },
      Object.assign(Object.create(null) as object, { [registryBrand]: true }),
      Object.freeze({ [registryBrand]: true, system: "lean4", declaration: "D" }),
      new (class Witness {
        [registryBrand] = true;
        system = "lean4";
        declaration = "D";
      })(),
    ];
    for (const shape of shapes) {
      expect(() => transcribe(shape as KernelWitness, 1, { sources: [] })).toThrow(TypeError);
    }
  });

  it("rejects a null-prototype object", () => {
    expect(() => transcribe(Object.create(null) as KernelWitness, 1, { sources: [] })).toThrow(
      TypeError,
    );
    const withFields = Object.assign(Object.create(null) as object, {
      system: "lean4",
      declaration: "D",
      module: null,
      axioms: [],
    });
    expect(() => transcribe(withFields as unknown as KernelWitness, 1, { sources: [] })).toThrow(
      TypeError,
    );
  });

  /**
   * The brand must be *held*, not merely visible.
   *
   * `transcribe` checks `Object.hasOwn` before reading the brand, so an object
   * that inherits it from a genuine witness is rejected. This was never a hole —
   * building one requires already holding a real witness, and `transcribe` reads
   * nothing off the witness except the brand — but the invariant reads better as
   * "holds the brand" than "can see the brand", and the guard is one call.
   */
  it("rejects an object that only inherits the brand from a genuine witness", () => {
    const inherited = Object.create(realWitness()) as KernelWitness;
    // The brand is visible through the prototype chain...
    expect(WITNESS_BRAND_IS_VISIBLE(inherited)).toBe(true);
    // ...but it is not held, so it does not count.
    expect(() => transcribe(inherited, "x ≤ P / T", { sources: [] })).toThrow(TypeError);
  });

  it("rejects a deeper prototype chain, and any chain over a forged prototype", () => {
    const deep = Object.create(Object.create(realWitness())) as KernelWitness;
    expect(() => transcribe(deep, 1, { sources: [] })).toThrow(TypeError);

    const registryBrand = Symbol.for("prooflens.kernel-witness");
    const forgedProto = { [registryBrand]: true };
    expect(() =>
      transcribe(Object.create(forgedProto) as KernelWitness, 1, { sources: [] }),
    ).toThrow(TypeError);
  });

  it("still accepts the witness the prototype came from", () => {
    // The tightening must not have cost the legitimate case.
    const witness = realWitness();
    expect(transcribe(witness, "x ≤ P / T", { sources: [] }).status).toBe("verified");
  });

  it("freezes the claims it produces", () => {
    const claim = transcribe(realWitness(), "x", { sources: [] });
    expect(Object.isFrozen(claim)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mintKernelWitness is the gate
// ---------------------------------------------------------------------------

describe("mintKernelWitness", () => {
  it("returns null when provedWithoutSorry is false", () => {
    expect(
      mintKernelWitness({
        system: "lean4",
        declaration: "ProofLens.Examples.sorry_carrying",
        module: "M",
        axioms: ["sorryAx"],
        provedWithoutSorry: false,
      }),
    ).toBeNull();
  });

  it("returns a witness carrying exactly the data it was given", () => {
    const w = mintKernelWitness({
      system: "lean4",
      declaration: "D",
      module: "M",
      axioms: ["propext"],
      provedWithoutSorry: true,
    })!;
    expect(w.system).toBe("lean4");
    expect(w.declaration).toBe("D");
    expect(w.module).toBe("M");
    expect([...w.axioms]).toEqual(["propext"]);
  });

  it("means no `verified` claim can be produced for a sorry-carrying declaration", () => {
    const witness = mintKernelWitness({
      system: "lean4",
      declaration: "ProofLens.Examples.sorry_carrying",
      module: "M",
      axioms: ["sorryAx"],
      provedWithoutSorry: false,
    });
    expect(witness).toBeNull();
    // The only route to `verified` demands the witness, and there isn't one.
    expect(() =>
      transcribe(witness as unknown as KernelWitness, "anything", { sources: [] }),
    ).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// derive cannot launder confidence upward
// ---------------------------------------------------------------------------

type Ceiling = Exclude<EpistemicStatus, "verified">;

/** Every status a well-typed `Rule` is allowed to declare as its ceiling. */
const CEILINGS: readonly Ceiling[] = ALL.filter((s): s is Ceiling => s !== "verified");

function ruleProducing(produces: Ceiling): Rule {
  return { id: "TEST_RULE_001", description: "test", produces };
}

function claimWith(status: EpistemicStatus): Claim<number> {
  if (status === "verified") return transcribe(realWitness(), 1, { sources: [] });
  return assert_(1, status as Ceiling, { sources: [] });
}

describe("Rule.produces", () => {
  it("cannot be `verified` — the type excludes it", () => {
    // `Exclude<EpistemicStatus, "verified">` leaves exactly the other five.
    expect(CEILINGS).toEqual([
      "derived",
      "interpreted",
      "heuristic",
      "illustrative",
      "speculative",
    ]);
  });
});

describe("derive", () => {
  it("never produces a status stronger than the rule's ceiling or any input", () => {
    for (const produces of CEILINGS) {
      const rule = ruleProducing(produces);
      for (const a of ALL) {
        for (const b of ALL) {
          for (const inputs of [[], [claimWith(a)], [claimWith(a), claimWith(b)]]) {
            const result = derive("payload", rule, inputs, { sources: [] });
            expect(rank(result.status)).toBeGreaterThanOrEqual(rank(produces));
            for (const input of inputs) {
              expect(rank(result.status)).toBeGreaterThanOrEqual(rank(input.status));
            }
            expect(result.status).toBe(
              weakest(produces, "derived", ...inputs.map((c) => c.status)),
            );
          }
        }
      }
    }
  });

  it("can never return `verified` for any well-typed rule and any inputs", () => {
    for (const produces of CEILINGS) {
      const rule = ruleProducing(produces);
      expect(derive(1, rule, [], { sources: [] }).status).not.toBe("verified");
      for (const a of ALL) {
        expect(derive(1, rule, [claimWith(a)], { sources: [] }).status).not.toBe("verified");
        for (const b of ALL) {
          expect(derive(1, rule, [claimWith(a), claimWith(b)], { sources: [] }).status).not.toBe(
            "verified",
          );
        }
      }
    }
  });

  /**
   * The runtime floor.
   *
   * `Rule.produces` excludes `verified` in the type, but types are erased, so
   * `derive` also folds `"derived"` into the `weakest` call. A cast, or a plain
   * JavaScript caller, no longer buys kernel standing: a rule is a computation,
   * and no computation earns `verified` whatever it claims about itself.
   */
  it("clamps a rule whose ceiling was cast past the type down to `derived`", () => {
    const forgedRule = {
      id: "FORGED_RULE_001",
      description: "a rule that should not exist",
      produces: "verified" as never,
    };
    expect(derive("2 + 2 = 5", forgedRule, [], { sources: [] }).status).toBe("derived");
  });

  it("keeps the floor no matter what inputs a forged rule is handed", () => {
    const forgedRule = {
      id: "FORGED_RULE_001",
      description: "a rule that should not exist",
      produces: "verified" as never,
    };
    // Verified inputs do not lift it either: the floor is on the rule.
    expect(
      derive(1, forgedRule, [transcribe(realWitness(), 1, { sources: [] })], { sources: [] })
        .status,
    ).toBe("derived");
    // And a weaker input still drags it further down.
    for (const status of ALL) {
      const result = derive(1, forgedRule, [claimWith(status)], { sources: [] });
      expect(result.status).toBe(weakest("derived", status));
      expect(result.status).not.toBe("verified");
    }
  });

  it("cannot be made to emit `verified` by any combination of rule and inputs", () => {
    const ceilings: EpistemicStatus[] = [...ALL];
    for (const produces of ceilings) {
      const rule = { id: "R", description: "d", produces: produces as never };
      expect(derive(1, rule, [], { sources: [] }).status).not.toBe("verified");
      for (const a of ALL) {
        expect(derive(1, rule, [claimWith(a)], { sources: [] }).status).not.toBe("verified");
      }
    }
  });

  it("cannot reach `verified` from any rule ProofLens actually declares", () => {
    const declared: Rule[] = [...Object.values(RULES), ...Object.values(MATH_IR_RULES)];
    expect(declared.length).toBeGreaterThan(10);
    for (const rule of declared) {
      expect(rule.produces).not.toBe("verified");
      for (const a of ALL) {
        expect(derive(1, rule, [claimWith(a)], { sources: [] }).status).not.toBe("verified");
      }
      expect(derive(1, rule, [], { sources: [] }).status).not.toBe("verified");
    }
  });

  it("stamps the rule onto the provenance", () => {
    const rule = ruleProducing("derived");
    const claim = derive("v", rule, [], { sources: [] });
    expect(claim.provenance.rule).toEqual(rule);
    expect(Object.isFrozen(claim)).toBe(true);
  });
});

describe("assert_", () => {
  it("carries the status it was handed, for every non-verified status", () => {
    for (const status of ALL) {
      if (status === "verified") continue;
      const claim = assert_("v", status as Ceiling, { sources: [] });
      expect(claim.status).toBe(status);
    }
  });
});

// ---------------------------------------------------------------------------
// weaken only moves one way
// ---------------------------------------------------------------------------

describe("weaken", () => {
  it("only ever moves toward less certainty", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const claim = claimWith(from);
        const weakened = weaken(claim, to, "because");
        expect(rank(weakened.status)).toBeGreaterThanOrEqual(rank(claim.status));
        expect(weakened.status).toBe(weakest(from, to));
      }
    }
  });

  it("cannot promote a weak claim by weakening it to something strong", () => {
    const speculative = assert_("guess", "speculative", { sources: [] });
    expect(weaken(speculative, "verified", "wishful thinking").status).toBe("speculative");
    expect(weaken(speculative, "derived", "wishful thinking").status).toBe("speculative");
  });

  it("records the note and preserves the value", () => {
    const claim = assert_(42, "derived", { sources: [], note: "old" });
    const weakened = weaken(claim, "illustrative", "axes chosen for legibility");
    expect(weakened.value).toBe(42);
    expect(weakened.provenance.note).toBe("axes chosen for legibility");
  });
});

describe("mapClaim", () => {
  it("changes the payload but never the status", () => {
    for (const status of ALL) {
      const claim = claimWith(status);
      const mapped = mapClaim(claim, (n) => `${n}!`);
      expect(mapped.status).toBe(status);
      expect(mapped.value).toBe("1!");
    }
  });
});

// ---------------------------------------------------------------------------
// The whole corpus, walked generically
// ---------------------------------------------------------------------------

interface FoundClaim {
  path: string;
  status: EpistemicStatus;
  ruleId: string | undefined;
}

/** Find every `{value, status, provenance}` shape anywhere in an object graph. */
function findClaims(root: unknown): FoundClaim[] {
  const found: FoundClaim[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, `${path}[${i}]`));
      return;
    }
    const record = node as Record<string, unknown>;
    if ("value" in record && "status" in record && "provenance" in record) {
      const provenance = record["provenance"] as { rule?: { id?: string } } | undefined;
      found.push({
        path,
        status: record["status"] as EpistemicStatus,
        ruleId: provenance?.rule?.id,
      });
    }
    for (const key of Object.keys(record)) visit(record[key], `${path}.${key}`);
  };
  visit(root, "$");
  return found;
}

describe("the real corpus", () => {
  const doc = corpus();
  const math = lowerDocument(doc);
  const analysed = math.theorems.map((theorem) => {
    const classifications = classifyTheorem(theorem);
    return { theorem, classifications, visuals: planVisuals(theorem, classifications) };
  });
  const claims = findClaims(analysed);

  it("finds a large number of claims to check (the walk is not vacuous)", () => {
    expect(analysed.length).toBe(CORPUS_DECLARATION_COUNT);
    expect(claims.length).toBeGreaterThan(100);
  });

  it("has no `verified` claim anywhere that carries a rule", () => {
    const offenders = claims.filter((c) => c.status === "verified" && c.ruleId !== undefined);
    expect(offenders).toEqual([]);
  });

  it("carries no `verified` claim at all through lowering, classification and planning", () => {
    // Every one of these stages is an interpretation of Lean's output, so the
    // strongest thing any of them may say is `derived`.
    expect(claims.filter((c) => c.status === "verified")).toEqual([]);
  });

  it("gives every claim a status drawn from the lattice", () => {
    for (const claim of claims) expect(ALL).toContain(claim.status);
  });

  it("proves the walker really does spot verified transcriptions", () => {
    // Control: a structure that *does* contain a verified transcription.
    const control = { nested: [{ deep: transcribe(realWitness(), "x", { sources: [] }) }] };
    const spotted = findClaims(control);
    expect(spotted).toHaveLength(1);
    expect(spotted[0]!.status).toBe("verified");
    expect(spotted[0]!.ruleId).toBeUndefined();
  });
});
