import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFormalIR } from "@prooflens/formal-ir";
import {
  compilePaperPacket,
  paperOutputPacket,
  type ProofLensPaperPacket,
} from "@prooflens/paper-packet";

const CORPUS_SHA = "99423637c7e256800e514bb617ff44ffea7d0e92cf8507cfdd0fc568adf4a5d3";
const corpus = parseFormalIR(
  JSON.parse(readFileSync(resolve("examples/corpus.formal-ir.json"), "utf8")) as unknown,
);
const packet = JSON.parse(
  readFileSync(resolve("examples/viridis-intelligence-bound.paper-packet.json"), "utf8"),
) as ProofLensPaperPacket;

describe("paper packet compiler", () => {
  it("matches a paper claim to a trusted zero-sorry Formal IR declaration", () => {
    const result = compilePaperPacket(packet, {
      trustedFormalIr: { document: corpus, sha256: CORPUS_SHA },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.scene.gate).toBe("READY");
    expect(result.scene.summary).toMatchObject({ claims: 3, verified: 1, certificateDebt: 0 });
    expect(result.scene.claims[0]).toMatchObject({
      status: "verified",
      verification: "kernel-witness-matched",
    });
  });

  it("holds the same packet when no trusted Formal IR is supplied", () => {
    const result = compilePaperPacket(packet);
    if (result.status !== "ready") throw new Error(result.reason);
    expect(result.scene.gate).toBe("HOLD");
    expect(result.scene.summary.certificateDebt).toBe(1);
    expect(result.scene.claims[0]).toMatchObject({
      status: "interpreted",
      verification: "trusted-formal-ir-required",
    });
  });

  it("fails closed on a changed source hash or changed statement", () => {
    const changedHash = structuredClone(packet);
    changedHash.claims[0]!.lean!.formalIrSha256 = "0".repeat(64);
    const hashResult = compilePaperPacket(changedHash, {
      trustedFormalIr: { document: corpus, sha256: CORPUS_SHA },
    });
    if (hashResult.status !== "ready") throw new Error(hashResult.reason);
    expect(hashResult.scene.gate).toBe("HOLD");

    const changedStatement = structuredClone(packet);
    changedStatement.claims[0]!.statement += " ";
    const statementResult = compilePaperPacket(changedStatement, {
      trustedFormalIr: { document: corpus, sha256: CORPUS_SHA },
    });
    if (statementResult.status !== "ready") throw new Error(statementResult.reason);
    expect(statementResult.scene.claims[0]!.status).toBe("interpreted");
  });

  it("blocks malformed and duplicate claims", () => {
    const duplicate = structuredClone(packet);
    duplicate.claims[1]!.id = duplicate.claims[0]!.id;
    expect(compilePaperPacket(duplicate)).toMatchObject({
      status: "blocked",
      code: "DUPLICATE_CLAIM",
    });

    const malformed = structuredClone(packet) as unknown as {
      claims: Array<Record<string, unknown>>;
    };
    malformed.claims[0]!.evidenceClass = "magic-verification";
    expect(compilePaperPacket(malformed)).toMatchObject({
      status: "blocked",
      code: "INVALID_CLAIM",
    });

    const hiddenDebt = structuredClone(packet);
    hiddenDebt.claims[0]!.requiresCertificate = false;
    expect(compilePaperPacket(hiddenDebt)).toMatchObject({
      status: "blocked",
      code: "INVALID_CLAIM",
    });
  });

  it("emits a serializable output packet without witness capabilities", () => {
    const result = compilePaperPacket(packet, {
      trustedFormalIr: { document: corpus, sha256: CORPUS_SHA },
    });
    if (result.status !== "ready") throw new Error(result.reason);
    const output = paperOutputPacket(result.scene);
    expect(output.format).toBe("prooflens_paper_output_v0_1");
    expect(output.claims[0]).not.toHaveProperty("provenance");
    expect(output.claims[0]!.status).toBe("verified");
  });
});
