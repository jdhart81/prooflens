import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFormalIR } from "@prooflens/formal-ir";
import {
  compileTorchLeanMarginScene,
  exportTorchLeanEnclosureRequest,
  inspectTorchLeanApplicationAudit,
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
      "2d0965c5c2198bde88f90a521ba39bb6e94dc8474094547a9c95b741348bc0e0",
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
        exampleIds: [0, 7],
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
});
