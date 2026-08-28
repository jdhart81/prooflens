import {
  state,
  transcribe,
  type Claim,
  type EpistemicStatus,
  type Provenance,
} from "@prooflens/epistemics";
import { kernelWitness, type FormalDeclaration, type FormalIRDocument } from "@prooflens/formal-ir";

export const PAPER_PACKET_VERSION = "0.1.0";

export const PAPER_EVIDENCE_CLASSES = [
  "lean-kernel",
  "formal-target",
  "numeric",
  "assumed",
  "deferred",
] as const;

export type PaperEvidenceClass = (typeof PAPER_EVIDENCE_CLASSES)[number];

export interface PaperSourceReceipt {
  label: string;
  locator: string;
  sha256?: string;
}

export interface PaperPacketClaim {
  id: string;
  title: string;
  statement: string;
  evidenceClass: PaperEvidenceClass;
  requiresCertificate: boolean;
  lean?: {
    declaration: string;
    module: string;
    formalIrSha256: string;
  };
  note?: string;
}

export interface ProofLensPaperPacket {
  format: "prooflens_paper_packet_v0_1";
  paper: {
    id: string;
    title: string;
    version: string;
    authors: string[];
    stage: string;
    source: PaperSourceReceipt;
  };
  claims: PaperPacketClaim[];
}

export interface TrustedFormalIR {
  document: FormalIRDocument;
  sha256: string;
}

export interface CompiledPaperClaim {
  id: string;
  title: string;
  statement: string;
  evidenceClass: PaperEvidenceClass;
  requiresCertificate: boolean;
  lean?: PaperPacketClaim["lean"];
  status: EpistemicStatus;
  verification:
    | "kernel-witness-matched"
    | "trusted-formal-ir-required"
    | "formal-target-unproved"
    | "externally-reported"
    | "assumption"
    | "deferred";
  reason: string;
  provenance: Provenance;
  note?: string;
}

export interface PaperPacketScene {
  version: string;
  packet: ProofLensPaperPacket;
  claims: CompiledPaperClaim[];
  gate: "READY" | "HOLD";
  summary: {
    claims: number;
    verified: number;
    interpreted: number;
    certificateDebt: number;
  };
}

export type PaperPacketResult =
  | { status: "ready"; scene: PaperPacketScene }
  | {
      status: "blocked";
      code: "INVALID_FORMAT" | "INVALID_PAPER" | "INVALID_CLAIM" | "DUPLICATE_CLAIM";
      reason: string;
    };

export interface PaperOutputPacket {
  format: "prooflens_paper_output_v0_1";
  prooflensPaperPacketVersion: string;
  paper: ProofLensPaperPacket["paper"];
  gate: PaperPacketScene["gate"];
  summary: PaperPacketScene["summary"];
  claims: Array<
    Pick<
      CompiledPaperClaim,
      | "id"
      | "title"
      | "statement"
      | "evidenceClass"
      | "requiresCertificate"
      | "status"
      | "verification"
      | "reason"
      | "note"
      | "lean"
    >
  >;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function parseSource(value: unknown): PaperSourceReceipt | null {
  if (!record(value) || !text(value.label) || !text(value.locator)) return null;
  if (value.sha256 !== undefined && !hash(value.sha256)) return null;
  return {
    label: value.label,
    locator: value.locator,
    ...(typeof value.sha256 === "string" ? { sha256: value.sha256 } : {}),
  };
}

function parseClaim(value: unknown): PaperPacketClaim | null {
  if (
    !record(value) ||
    !text(value.id) ||
    !text(value.title) ||
    !text(value.statement) ||
    typeof value.requiresCertificate !== "boolean" ||
    !PAPER_EVIDENCE_CLASSES.includes(value.evidenceClass as PaperEvidenceClass)
  ) {
    return null;
  }
  let lean: PaperPacketClaim["lean"];
  if (value.lean !== undefined) {
    if (
      !record(value.lean) ||
      !text(value.lean.declaration) ||
      !text(value.lean.module) ||
      !hash(value.lean.formalIrSha256)
    ) {
      return null;
    }
    lean = {
      declaration: value.lean.declaration,
      module: value.lean.module,
      formalIrSha256: value.lean.formalIrSha256,
    };
  }
  if (value.evidenceClass === "lean-kernel" && lean === undefined) return null;
  if (value.evidenceClass !== "lean-kernel" && lean !== undefined) return null;
  if (
    (value.evidenceClass === "lean-kernel" || value.evidenceClass === "formal-target") &&
    value.requiresCertificate !== true
  ) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    statement: value.statement,
    evidenceClass: value.evidenceClass as PaperEvidenceClass,
    requiresCertificate: value.requiresCertificate,
    ...(lean ? { lean } : {}),
    ...(text(value.note) ? { note: value.note } : {}),
  };
}

function parsePacket(
  value: unknown,
): Extract<PaperPacketResult, { status: "blocked" }> | ProofLensPaperPacket {
  if (!record(value) || value.format !== "prooflens_paper_packet_v0_1") {
    return {
      status: "blocked",
      code: "INVALID_FORMAT",
      reason: "Unknown or missing ProofLens paper packet format.",
    };
  }
  const paper = value.paper;
  if (
    !record(paper) ||
    !text(paper.id) ||
    !text(paper.title) ||
    !text(paper.version) ||
    !Array.isArray(paper.authors) ||
    paper.authors.length === 0 ||
    paper.authors.some((author) => !text(author)) ||
    !text(paper.stage)
  ) {
    return { status: "blocked", code: "INVALID_PAPER", reason: "Paper metadata is incomplete." };
  }
  const source = parseSource(paper.source);
  if (!source) {
    return {
      status: "blocked",
      code: "INVALID_PAPER",
      reason: "The paper source receipt is incomplete or malformed.",
    };
  }
  if (!Array.isArray(value.claims) || value.claims.length === 0) {
    return {
      status: "blocked",
      code: "INVALID_CLAIM",
      reason: "A paper packet must contain at least one claim.",
    };
  }
  const claims: PaperPacketClaim[] = [];
  for (const rawClaim of value.claims) {
    const claim = parseClaim(rawClaim);
    if (!claim) {
      return {
        status: "blocked",
        code: "INVALID_CLAIM",
        reason: "A claim is malformed or has evidence fields that do not match its evidence class.",
      };
    }
    claims.push(claim);
  }
  if (new Set(claims.map((claim) => claim.id)).size !== claims.length) {
    return {
      status: "blocked",
      code: "DUPLICATE_CLAIM",
      reason: "Every paper claim must have a unique id.",
    };
  }
  return {
    format: value.format,
    paper: {
      id: paper.id,
      title: paper.title,
      version: paper.version,
      authors: paper.authors as string[],
      stage: paper.stage,
      source,
    },
    claims,
  };
}

function declarationFor(
  trusted: TrustedFormalIR,
  claim: PaperPacketClaim,
): FormalDeclaration | null {
  if (!claim.lean || claim.lean.formalIrSha256 !== trusted.sha256) return null;
  const declaration = trusted.document.declarations.find(
    (candidate) => candidate.name === claim.lean?.declaration,
  );
  if (
    !declaration ||
    declaration.source?.module !== claim.lean.module ||
    declaration.statement.pretty !== claim.statement
  ) {
    return null;
  }
  return declaration;
}

function externalClaim(
  claim: PaperPacketClaim,
  verification: CompiledPaperClaim["verification"],
  reason: string,
): CompiledPaperClaim {
  const source = {
    system: "paper-packet",
    declaration: claim.id,
    path: `claims.${claim.id}`,
  };
  const asserted: Claim<string> = state(claim.statement, "interpreted", { sources: [source] });
  return {
    ...claim,
    status: asserted.status,
    verification,
    reason,
    provenance: asserted.provenance,
  };
}

function compileClaim(
  claim: PaperPacketClaim,
  trusted: TrustedFormalIR | undefined,
): CompiledPaperClaim {
  if (claim.evidenceClass === "lean-kernel") {
    if (!trusted) {
      return externalClaim(
        claim,
        "trusted-formal-ir-required",
        "The packet names a Lean declaration, but no trusted, hash-matched Formal IR was supplied.",
      );
    }
    const declaration = declarationFor(trusted, claim);
    if (!declaration) {
      return externalClaim(
        claim,
        "trusted-formal-ir-required",
        "The declaration, module, statement, or Formal IR hash does not match the trusted corpus.",
      );
    }
    const witness = kernelWitness(trusted.document, declaration);
    if (!witness) {
      return externalClaim(
        claim,
        "trusted-formal-ir-required",
        "The matched declaration cannot mint a kernel witness because extraction failed or reached sorry.",
      );
    }
    const verified = transcribe(witness, claim.statement, {
      sources: [
        {
          system: trusted.document.system,
          declaration: declaration.name,
          module: declaration.source?.module ?? null,
          path: "statement",
        },
      ],
      inputs: [trusted.sha256],
      note: "The packet claim exactly matched a declaration in the trusted, hash-bound Formal IR.",
    });
    return {
      ...claim,
      status: verified.status,
      verification: "kernel-witness-matched",
      reason: "The statement exactly matches a zero-sorry declaration in the trusted Formal IR.",
      provenance: verified.provenance,
    };
  }
  if (claim.evidenceClass === "formal-target") {
    return externalClaim(
      claim,
      "formal-target-unproved",
      "This is a proposed Lean target, not a kernel-verified theorem.",
    );
  }
  if (claim.evidenceClass === "numeric") {
    return externalClaim(
      claim,
      "externally-reported",
      "The packet reports a numerical result; ProofLens has not independently reproduced it.",
    );
  }
  if (claim.evidenceClass === "assumed") {
    return externalClaim(claim, "assumption", "The paper declares this as an input assumption.");
  }
  return externalClaim(claim, "deferred", "Assessment or evidence is explicitly deferred.");
}

/**
 * Validate and compile an untrusted paper packet. Imported JSON cannot create
 * `verified`; only an exact match against trusted Formal IR can mint the
 * KernelWitness required by `transcribe`.
 */
export function compilePaperPacket(
  value: unknown,
  options: { trustedFormalIr?: TrustedFormalIR } = {},
): PaperPacketResult {
  const parsed = parsePacket(value);
  if (!("format" in parsed)) return parsed;
  const claims = parsed.claims.map((claim) => compileClaim(claim, options.trustedFormalIr));
  const certificateDebt = claims.filter(
    (claim) => claim.requiresCertificate && claim.status !== "verified",
  ).length;
  return {
    status: "ready",
    scene: {
      version: PAPER_PACKET_VERSION,
      packet: parsed,
      claims,
      gate: certificateDebt === 0 ? "READY" : "HOLD",
      summary: {
        claims: claims.length,
        verified: claims.filter((claim) => claim.status === "verified").length,
        interpreted: claims.filter((claim) => claim.status === "interpreted").length,
        certificateDebt,
      },
    },
  };
}

export function paperOutputPacket(scene: PaperPacketScene): PaperOutputPacket {
  return {
    format: "prooflens_paper_output_v0_1",
    prooflensPaperPacketVersion: scene.version,
    paper: scene.packet.paper,
    gate: scene.gate,
    summary: scene.summary,
    claims: scene.claims.map(
      ({ provenance: _provenance, ...claim }): PaperOutputPacket["claims"][number] => claim,
    ),
  };
}

export function formatPaperPacketSummary(scene: PaperPacketScene): string {
  return [
    `PAPER ${scene.packet.paper.id} — ${scene.packet.paper.title}`,
    `PACKAGE ${scene.gate}`,
    `CLAIMS ${scene.summary.claims} · VERIFIED ${scene.summary.verified} · CERTIFICATE DEBT ${scene.summary.certificateDebt}`,
  ].join("\n");
}
