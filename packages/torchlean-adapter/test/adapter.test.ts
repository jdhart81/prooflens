import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFormalIR } from "@prooflens/formal-ir";
import {
  compileTorchLeanMarginScene,
  exportTorchLeanEnclosureRequest,
  inspectTorchLeanApplicationAudit,
  parseExactDecimalToken,
  parseJsonWithExactDecimals,
  TORCHLEAN_DIGITS_MARGIN_FIXTURE,
  TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT,
  TORCHLEAN_IBP_SOUNDNESS_PIN,
  type TorchLeanMarginSnapshot,
} from "@prooflens/torchlean-adapter";

const applicationAudit = JSON.parse(
  readFileSync(resolve("examples/torchlean-digits-application-audit.json"), "utf8"),
) as unknown;
const enclosureFormalIrBytes = readFileSync(
  resolve("examples/torchlean-digits-enclosure.formal-ir.json"),
);
const enclosureFormalIr = parseFormalIR(JSON.parse(enclosureFormalIrBytes.toString("utf8")));
const enclosureReceipt = JSON.parse(
  readFileSync(resolve("examples/torchlean-digits-enclosure.receipt.json"), "utf8"),
) as unknown;
const trustedEnclosure = {
  document: enclosureFormalIr,
  sha256: createHash("sha256").update(enclosureFormalIrBytes).digest("hex"),
};

function fixture(): TorchLeanMarginSnapshot {
  return structuredClone(TORCHLEAN_DIGITS_MARGIN_FIXTURE);
}

const corpus = parseFormalIR(
  JSON.parse(readFileSync(resolve("examples/corpus.formal-ir.json"), "utf8")) as unknown,
);
const soundnessBytes = readFileSync(resolve("examples/torchlean-ibp-soundness.formal-ir.json"));
const soundness = parseFormalIR(JSON.parse(soundnessBytes.toString("utf8")) as unknown);
const trustedSoundness = {
  document: soundness,
  sha256: createHash("sha256").update(soundnessBytes).digest("hex"),
};

describe("TorchLean margin-report adapter", () => {
  it("compiles the pinned official report and recomputes all 360 outcomes", () => {
    const result = compileTorchLeanMarginScene(fixture());
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.scene.source.commit).toBe("12f5c651f03b3890ec012d0a6bb45e3ea698c8d3");
    expect(result.scene.summary).toMatchObject({ examples: 360, nominalOk: 349, certifiedOk: 318 });
    expect(result.scene.summary.certifiedRate).toBeCloseTo(318 / 360, 12);
    expect(result.scene.examples).toHaveLength(360);

    // Check sample 0 (positive margin)
    expect(result.scene.examples[0]).toMatchObject({
      id: 0,
      label: 7,
      competitorClass: 9,
      certified: true,
      computedCertified: true,
    });
    expect(result.scene.examples[0]!.margin).toBeCloseTo(6.481595185957846 - 4.82769997820258, 12);

    // Check sample 7 (overlapping intervals / not certified)
    expect(result.scene.examples[7]).toMatchObject({
      id: 7,
      label: 8,
      competitorClass: 9,
      certified: false,
      computedCertified: false,
    });

    const certifiedCount = result.scene.examples.filter((e) => e.certified).length;
    const computedCertifiedCount = result.scene.examples.filter((e) => e.computedCertified).length;
    expect(certifiedCount).toBe(318);
    expect(computedCertifiedCount).toBe(318);
  });

  it("never upgrades the external report to kernel-verified standing", () => {
    const result = compileTorchLeanMarginScene(fixture());
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.epistemic).toBe("interpreted");
    expect(result.scene.boundary).toContain("has not established");
    expect(result.scene.provenance.note).toContain("TorchLean was not executed");
    expect(result.scene.enclosure).toMatchObject({
      status: "interpreted",
      verification: "receipt-missing",
    });
    expect(result.scene.soundness.verification).toBe("formal-ir-missing");
  });

  it("verifies the pinned generic IBP theorem without upgrading the concrete report", () => {
    expect(trustedSoundness.sha256).toBe(TORCHLEAN_IBP_SOUNDNESS_PIN.formalIrSha256);
    const result = compileTorchLeanMarginScene(fixture(), {
      trustedSoundnessFormalIr: trustedSoundness,
    });
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.soundness).toMatchObject({
      status: "verified",
      verification: "kernel-theorem-verified",
    });
    expect(result.scene.soundness.premises).toHaveLength(4);
    expect(result.scene.soundness.premises.every((premise) => premise.status === "owed")).toBe(
      true,
    );
    expect(result.scene.enclosure).toMatchObject({
      status: "interpreted",
      verification: "receipt-missing",
    });
    expect(result.scene.epistemic).toBe("interpreted");
    expect(result.scene.boundary).toContain("generic IBP enclosure theorem is kernel-verified");
  });

  it("fails the concrete theorem application closed on unsupported graph operations", () => {
    const result = compileTorchLeanMarginScene(fixture(), {
      trustedSoundnessFormalIr: trustedSoundness,
      applicationAudit,
    });
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.application).toMatchObject({
      status: "blocked",
      gates: expect.arrayContaining([
        expect.objectContaining({ id: "artifacts", status: "matched" }),
        expect.objectContaining({ id: "topology", status: "matched" }),
        expect.objectContaining({ id: "operations", status: "blocked" }),
        expect.objectContaining({ id: "rounding", status: "blocked" }),
      ]),
    });
    expect(
      result.scene.application?.nodes.filter((node) => !node.supported).map((node) => node.op),
    ).toEqual([
      "reshape",
      "reshape",
      "reshape",
      "reshape",
      "reshape",
      "reshape",
      "reshape",
      "concat",
      "reshape",
    ]);
    expect(result.scene.epistemic).toBe("interpreted");
    expect(result.scene.enclosure.status).toBe("interpreted");
  });

  it("verifies the direct exact-real certificate and closes the concrete application gate", () => {
    expect(trustedEnclosure.sha256).toBe(
      "ad820e109c6fa4fbfd4bbb3feacea2eec69e200f9965cce332198aa7a4fa7757",
    );
    const result = compileTorchLeanMarginScene(fixture(), {
      trustedSoundnessFormalIr: trustedSoundness,
      applicationAudit,
      receipt: enclosureReceipt,
      trustedFormalIr: trustedEnclosure,
    });
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.enclosure).toMatchObject({
      status: "verified",
      verification: "kernel-witness-matched",
    });
    expect(result.scene.application).toMatchObject({
      status: "verified",
      gates: expect.arrayContaining([
        expect.objectContaining({ id: "operations", status: "not-used" }),
        expect.objectContaining({ id: "inputs", status: "verified" }),
        expect.objectContaining({ id: "rounding", status: "verified" }),
      ]),
    });
    expect(result.scene.epistemic).toBe("interpreted");
    expect(result.scene.boundary).toContain("matching trusted Lean kernel witness");

    // Check that displayed examples have lean-exact-outward-certificate authority
    expect(result.scene.examples[0]!.intervalAuthority).toBe("lean-exact-outward-certificate");
    expect(result.scene.examples[7]!.intervalAuthority).toBe("lean-exact-outward-certificate");
  });

  it("rejects altered concrete application audits", () => {
    const altered = structuredClone(applicationAudit) as Record<string, unknown>;
    const lowering = altered.lowering as { nodes: Array<{ id: number; parents: number[] }> };
    lowering.nodes[1]!.parents = [15];
    expect(inspectTorchLeanApplicationAudit(altered, fixture())).toBeNull();

    const falseGreen = structuredClone(applicationAudit) as Record<string, unknown>;
    (falseGreen.conclusion as { status: string }).status = "verified";
    expect(inspectTorchLeanApplicationAudit(falseGreen, fixture())).toBeNull();

    const alteredArtifact = structuredClone(applicationAudit) as Record<string, unknown>;
    const artifacts = alteredArtifact.artifacts as { weights: { sha256: string } };
    artifacts.weights.sha256 = "0".repeat(64);
    expect(inspectTorchLeanApplicationAudit(alteredArtifact, fixture())).toBeNull();
  });

  it("fails the generic theorem gate closed on altered extraction evidence", () => {
    const wrongHash = compileTorchLeanMarginScene(fixture(), {
      trustedSoundnessFormalIr: { ...trustedSoundness, sha256: "0".repeat(64) },
    });
    if (wrongHash.status !== "ready") throw new Error(wrongHash.reason);
    expect(wrongHash.scene.soundness.verification).toBe("formal-ir-mismatch");

    const altered = structuredClone(soundness);
    const theorem = altered.declarations.find(
      (candidate) => candidate.name === TORCHLEAN_IBP_SOUNDNESS_PIN.declaration,
    );
    if (!theorem) throw new Error("Expected pinned TorchLean theorem");
    theorem.usesSorry = true;
    const sorry = compileTorchLeanMarginScene(fixture(), {
      trustedSoundnessFormalIr: { document: altered, sha256: trustedSoundness.sha256 },
    });
    if (sorry.status !== "ready") throw new Error(sorry.reason);
    expect(sorry.scene.soundness.verification).toBe("formal-ir-mismatch");
    expect(sorry.scene.enclosure.status).toBe("interpreted");
  });

  it("exports certificate debt bound to the exact report inputs", () => {
    const request = exportTorchLeanEnclosureRequest(fixture());
    expect(request).toMatchObject({
      format: "prooflens_torchlean_enclosure_request_v0_1",
      acceptedAuthority: "lean-kernel",
      binding: {
        sourceCommit: "12f5c651f03b3890ec012d0a6bb45e3ea698c8d3",
        modelId: "torchlean:digits-linear-margin",
        method: "ibp_linear",
        exampleIds: Array.from({ length: 360 }, (_, i) => i),
      },
    });
    expect(request.note).toContain("not a certificate");
  });

  it("does not trust a serialized receipt without matching trusted Formal IR", () => {
    const snapshot = fixture();
    const receipt = {
      format: TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT,
      binding: exportTorchLeanEnclosureRequest(snapshot).binding,
      proof: {
        authority: "lean-kernel",
        protocol: "prooflens-torchlean-enclosure-v0.1",
        declaration: "Example.encloses",
        module: "Example",
        statement: "True",
        formalIrSha256: "0".repeat(64),
      },
    };
    const result = compileTorchLeanMarginScene(snapshot, { receipt });
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.enclosure).toMatchObject({
      status: "interpreted",
      verification: "receipt-mismatch",
    });
    expect(result.scene.enclosure.reason).toContain("no matching trusted Formal IR");
  });

  it("rejects a receipt whose report binding has changed", () => {
    const snapshot = fixture();
    const binding = exportTorchLeanEnclosureRequest(snapshot).binding;
    const result = compileTorchLeanMarginScene(snapshot, {
      receipt: {
        format: TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT,
        binding: { ...binding, epsilon: 0.03 },
        proof: {
          authority: "lean-kernel",
          protocol: "prooflens-torchlean-enclosure-v0.1",
          declaration: "Example.encloses",
          module: "Example",
          statement: "True",
          formalIrSha256: "0".repeat(64),
        },
      },
    });
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.enclosure.verification).toBe("receipt-mismatch");
    expect(result.scene.enclosure.reason).toContain("exactly bind");
  });

  it("upgrades only through a matched protocol theorem and real kernel-witness capability", () => {
    const snapshot = fixture();
    const trustedDocument = structuredClone(corpus);
    const theorem = trustedDocument.declarations.find(
      (declaration) => declaration.name === "ProofLens.Examples.simple_upper_bound",
    );
    if (!theorem?.source?.module) throw new Error("Expected corpus theorem fixture");
    theorem.docstring = `${theorem.docstring ?? ""}\n@prooflens.torchlean-enclosure v0.1`;
    const formalIrSha256 = "1".repeat(64);
    const receipt = {
      format: TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT,
      binding: exportTorchLeanEnclosureRequest(snapshot).binding,
      proof: {
        authority: "lean-kernel" as const,
        protocol: "prooflens-torchlean-enclosure-v0.1" as const,
        declaration: theorem.name,
        module: theorem.source.module,
        statement: theorem.statement.pretty,
        formalIrSha256,
      },
    };
    const result = compileTorchLeanMarginScene(snapshot, {
      receipt,
      trustedFormalIr: { document: trustedDocument, sha256: formalIrSha256 },
    });
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.enclosure).toMatchObject({
      status: "verified",
      verification: "kernel-witness-matched",
    });

    theorem.docstring = theorem.docstring.replace(
      "@prooflens.torchlean-enclosure v0.1",
      "@prooflens.torchlean-enclosure missing",
    );
    const missingProtocol = compileTorchLeanMarginScene(snapshot, {
      receipt,
      trustedFormalIr: { document: trustedDocument, sha256: formalIrSha256 },
    });
    if (missingProtocol.status !== "ready") throw new Error(missingProtocol.reason);
    expect(missingProtocol.scene.enclosure.verification).toBe("receipt-mismatch");
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
    expect(
      compileTorchLeanMarginScene({
        format: "prooflens_torchlean_margin_snapshot_v0_1",
      } as TorchLeanMarginSnapshot),
    ).toMatchObject({ status: "blocked", code: "INVALID_SOURCE" });

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

  it("fails closed on missing, extra, or duplicate rows", () => {
    const missingRow = fixture();
    missingRow.examples.pop();
    expect(compileTorchLeanMarginScene(missingRow)).toMatchObject({
      status: "blocked",
      code: "INVALID_EXAMPLE",
      reason: expect.stringContaining("example count does not match"),
    });

    const extraRow = fixture();
    extraRow.examples.push({ ...extraRow.examples[0]!, id: 360 });
    expect(compileTorchLeanMarginScene(extraRow)).toMatchObject({
      status: "blocked",
      code: "INVALID_EXAMPLE",
      reason: expect.stringContaining("example count does not match"),
    });

    const duplicateId = fixture();
    duplicateId.examples[1]!.id = 0;
    expect(compileTorchLeanMarginScene(duplicateId)).toMatchObject({
      status: "blocked",
      code: "INVALID_EXAMPLE",
      reason: expect.stringContaining("Duplicate example id 0"),
    });
  });

  it("fails closed on reordered rows between snapshot and receipt binding", () => {
    const reordered = fixture();
    const temp = reordered.examples[0]!;
    reordered.examples[0] = reordered.examples[1]!;
    reordered.examples[1] = temp;

    const result = compileTorchLeanMarginScene(reordered, {
      trustedSoundnessFormalIr: trustedSoundness,
      applicationAudit,
      receipt: enclosureReceipt,
      trustedFormalIr: trustedEnclosure,
    });
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.enclosure.status).toBe("interpreted");
    expect(result.scene.enclosure.verification).toBe("receipt-mismatch");
  });

  it("fails closed on endpoint drift and inverted intervals", () => {
    const invertedInterval = fixture();
    invertedInterval.examples[0]!.lower[0] = 5;
    invertedInterval.examples[0]!.upper[0] = -5;
    expect(compileTorchLeanMarginScene(invertedInterval)).toMatchObject({
      status: "blocked",
      code: "INVALID_EXAMPLE",
    });

    const driftedEndpoint = fixture();
    // For sample 0 (label 7, certified true), shift label floor below competitor ceiling
    driftedEndpoint.examples[0]!.lower[7] = -10.0;
    expect(compileTorchLeanMarginScene(driftedEndpoint)).toMatchObject({
      status: "blocked",
      code: "CERTIFICATE_MISMATCH",
    });
  });

  it("fails closed on mismatched source hashes or altered constants in receipt", () => {
    const snapshot = fixture();
    const binding = exportTorchLeanEnclosureRequest(snapshot).binding;
    const mismatchedSha = compileTorchLeanMarginScene(snapshot, {
      receipt: {
        format: TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT,
        binding: { ...binding, sourceSha256: "0".repeat(64) },
        proof: {
          authority: "lean-kernel",
          protocol: "prooflens-torchlean-enclosure-v0.1",
          declaration: "ProofLens.Examples.TorchLeanDigits.digits_examples_enclosed",
          module: "ProofLensExamples.TorchLeanDigits",
          statement: "True",
          formalIrSha256: trustedEnclosure.sha256,
        },
      },
      trustedFormalIr: trustedEnclosure,
    });
    if (mismatchedSha.status !== "ready") throw new Error(mismatchedSha.reason);
    expect(mismatchedSha.scene.enclosure.verification).toBe("receipt-mismatch");

    const mismatchedModel = compileTorchLeanMarginScene(snapshot, {
      receipt: {
        format: TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT,
        binding: { ...binding, modelId: "torchlean:different-model" },
        proof: {
          authority: "lean-kernel",
          protocol: "prooflens-torchlean-enclosure-v0.1",
          declaration: "ProofLens.Examples.TorchLeanDigits.digits_examples_enclosed",
          module: "ProofLensExamples.TorchLeanDigits",
          statement: "True",
          formalIrSha256: trustedEnclosure.sha256,
        },
      },
      trustedFormalIr: trustedEnclosure,
    });
    if (mismatchedModel.status !== "ready") throw new Error(mismatchedModel.reason);
    expect(mismatchedModel.scene.enclosure.verification).toBe("receipt-mismatch");
  });

  it("parses exact decimal tokens without binary floating-point representation drift", () => {
    // 0.07 cannot be represented exactly in IEEE 754 float64 (naive float 0.07 * 1e19 drifts to ...128)
    expect(parseExactDecimalToken("0.07", 19)).toBe(700000000000000000n);
    expect(parseExactDecimalToken("0.1", 19)).toBe(1000000000000000000n);
    expect(parseExactDecimalToken("0.29", 19)).toBe(2900000000000000000n);
    expect(parseExactDecimalToken("-0.1428571428571428571", 19)).toBe(-1428571428571428571n);
    expect(parseExactDecimalToken("0.0625", 19)).toBe(625000000000000000n);
    expect(parseExactDecimalToken("-9.797004565895", 12)).toBe(-9797004565895n);
    expect(parseExactDecimalToken("1e-5", 19)).toBe(100000000000000n);
    expect(parseExactDecimalToken("-2.5e-3", 19)).toBe(-25000000000000000n);
    expect(parseExactDecimalToken("1.25e2", 19)).toBe(1250000000000000000000n);
    expect(parseExactDecimalToken("0", 19)).toBe(0n);
    expect(parseExactDecimalToken("-0", 19)).toBe(0n);
    expect(parseExactDecimalToken("0.50000000000000000000000", 19)).toBe(5000000000000000000n);
  });

  it("rejects malformed decimal tokens and unsupported excess precision", () => {
    expect(() => parseExactDecimalToken("", 19)).toThrow("Empty decimal token");
    expect(() => parseExactDecimalToken("abc", 19)).toThrow("non-digit");
    expect(() => parseExactDecimalToken("1.2.3", 19)).toThrow("multiple dots");
    expect(() => parseExactDecimalToken("1e-", 19)).toThrow("Invalid exponent");
    expect(() => parseExactDecimalToken("0.1234567890123456789123", 19)).toThrow(
      "Unsupported fractional precision",
    );
  });

  it("parses raw JSON files preserving exact numeric string tokens", () => {
    const rawJson = JSON.stringify({
      weight: [-0.0009358525276184082, 0.07, 1e-5],
      bias: [-0.09520449489355087],
      pixel: 0.125,
    });
    const parsed = parseJsonWithExactDecimals(rawJson) as {
      weight: string[];
      bias: string[];
      pixel: string;
    };
    expect(parsed.weight[0]).toBe("-0.0009358525276184082");
    expect(parsed.weight[1]).toBe("0.07");
    expect(parsed.weight[2]).toBe("0.00001");
    expect(parsed.bias[0]).toBe("-0.09520449489355087");
    expect(parsed.pixel).toBe("0.125");

    // Check exact BigInt conversion
    expect(parseExactDecimalToken(parsed.weight[0]!, 19)).toBe(-9358525276184082n);
    expect(parseExactDecimalToken(parsed.weight[1]!, 19)).toBe(700000000000000000n);
    expect(parseExactDecimalToken(parsed.bias[0]!, 19)).toBe(-952044948935508700n);
    expect(parseExactDecimalToken(parsed.pixel, 19)).toBe(1250000000000000000n);
  });
});
