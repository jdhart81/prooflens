import { describe, expect, it } from "vitest";
import {
  compileTorchLeanMarginScene,
  TORCHLEAN_DIGITS_MARGIN_FIXTURE,
  type TorchLeanMarginSnapshot,
} from "@prooflens/torchlean-adapter";

function fixture(): TorchLeanMarginSnapshot {
  return structuredClone(TORCHLEAN_DIGITS_MARGIN_FIXTURE);
}

describe("TorchLean margin-report adapter", () => {
  it("compiles the pinned official report excerpt and recomputes both outcomes", () => {
    const result = compileTorchLeanMarginScene(fixture());
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.scene.source.commit).toBe("12f5c651f03b3890ec012d0a6bb45e3ea698c8d3");
    expect(result.scene.summary).toMatchObject({ examples: 360, certifiedOk: 318 });
    expect(result.scene.summary.certifiedRate).toBeCloseTo(318 / 360, 12);
    expect(result.scene.examples[0]).toMatchObject({
      id: 0,
      label: 7,
      competitorClass: 9,
      certified: true,
      computedCertified: true,
    });
    expect(result.scene.examples[0]!.margin).toBeCloseTo(6.481595185957846 - 4.82769997820258, 12);
    expect(result.scene.examples[1]).toMatchObject({
      id: 7,
      label: 8,
      competitorClass: 9,
      certified: false,
      computedCertified: false,
    });
  });

  it("never upgrades the external report to kernel-verified standing", () => {
    const result = compileTorchLeanMarginScene(fixture());
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.epistemic).toBe("interpreted");
    expect(result.scene.boundary).toContain("has not established");
    expect(result.scene.provenance.note).toContain("TorchLean was not executed");
  });

  it("fails closed when the serialized certified flag disagrees with the margin", () => {
    const changed = fixture();
    changed.examples[0]!.certified = false;
    expect(compileTorchLeanMarginScene(changed)).toMatchObject({
      status: "blocked",
      code: "CERTIFICATE_MISMATCH",
    });
  });

  it("fails closed on malformed source pins, shapes, and intervals", () => {
    const badSource = fixture();
    badSource.source.sha256 = "not-a-hash";
    expect(compileTorchLeanMarginScene(badSource)).toMatchObject({
      status: "blocked",
      code: "INVALID_SOURCE",
    });

    const badShape = fixture();
    badShape.model.architecture[0]!.shape = [63];
    expect(compileTorchLeanMarginScene(badShape)).toMatchObject({
      status: "blocked",
      code: "INVALID_ARCHITECTURE",
    });

    const badInterval = fixture();
    badInterval.examples[0]!.lower[0] = 10;
    expect(compileTorchLeanMarginScene(badInterval)).toMatchObject({
      status: "blocked",
      code: "INVALID_EXAMPLE",
    });
  });
});
