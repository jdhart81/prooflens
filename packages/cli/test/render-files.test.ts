import { describe, expect, it } from "vitest";
import { renderFileStem } from "@prooflens/cli";

describe("renderFileStem", () => {
  it("keeps fully-qualified declarations with the same short name distinct", () => {
    expect(renderFileStem("Alpha.Widget.mk")).toBe("Alpha.Widget.mk");
    expect(renderFileStem("Beta.Widget.mk")).toBe("Beta.Widget.mk");
    expect(renderFileStem("Alpha.Widget.mk")).not.toBe(renderFileStem("Beta.Widget.mk"));
  });

  it("encodes punctuation and Unicode without introducing collisions", () => {
    expect(renderFileStem("Viridis/Proof.δ%bound")).toBe("Viridis%2FProof.%CE%B4%25bound");
    expect(renderFileStem("Viridis/Proof.δ%bound")).not.toBe(
      renderFileStem("Viridis%2FProof.δ%bound"),
    );
  });
});
