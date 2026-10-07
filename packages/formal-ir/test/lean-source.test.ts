import { describe, expect, it } from "vitest";
import { kernelWitness, previewLeanSource, walk } from "@prooflens/formal-ir";

describe("source preview natural literals", () => {
  it.each(["9007199254740992", "10000000000000000001", "9".repeat(400)])(
    "preserves the exact digits of an unsafe integer token",
    (value) => {
      const { document, skipped } = previewLeanSource(
        `theorem literal : (${value} : ℝ) = ${value} := by rfl`,
      );
      expect(skipped).toEqual([]);
      const declaration = document.declarations[0]!;
      const literal = [...walk(declaration.conclusion.tree)].find((node) => node.kind === "lit");
      expect(literal).toEqual({ kind: "lit", litKind: "nat", value });
      expect(document.inputOrigin).toBe("source-preview");
      expect(document.system).toBe("lean4-source-preview");
      expect(document.toolchain).toBe("not elaborated");
      expect(declaration.usesSorry).toBe(false);
      expect(kernelWitness(document, declaration)).toBeNull();
    },
  );

  it.each([0, 1, 2, Number.MAX_SAFE_INTEGER])("keeps safe integer token %s numeric", (value) => {
    const { document } = previewLeanSource(`theorem bound (x : ℝ) : x ≤ ${value} := by sorry`);
    const literal = [...walk(document.declarations[0]!.conclusion.tree)].find(
      (node) => node.kind === "lit",
    );
    expect(literal).toEqual({ kind: "lit", litKind: "nat", value });
  });
});
