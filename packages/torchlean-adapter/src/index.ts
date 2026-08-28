import { transcribe, type EpistemicStatus, type Provenance } from "@prooflens/epistemics";
import { kernelWitness, type FormalIRDocument } from "@prooflens/formal-ir";

export const TORCHLEAN_ADAPTER_VERSION = "0.1.0";

export const TORCHLEAN_ENCLOSURE_REQUEST_FORMAT =
  "prooflens_torchlean_enclosure_request_v0_1" as const;
export const TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT =
  "prooflens_torchlean_enclosure_receipt_v0_1" as const;

export const TORCHLEAN_MARGIN_RULE = {
  id: "TORCHLEAN_MARGIN_REPORT_001",
  description:
    "Validated a pinned TorchLean margin-report excerpt and recomputed its strict top-label margins.",
  produces: "interpreted" as const,
};

export interface TorchLeanSource {
  repository: string;
  commit: string;
  path: string;
  sha256: string;
  leanToolchain: string;
}

export interface TorchLeanArchitectureNode {
  id: string;
  op: "input" | "linear" | "logits" | "margin-check";
  label: string;
  detail: string;
  shape: number[];
}

export interface TorchLeanMarginExample {
  id: number;
  label: number;
  prediction: number;
  lower: number[];
  upper: number[];
  certified: boolean;
}

export interface TorchLeanMarginSnapshot {
  format: "prooflens_torchlean_margin_snapshot_v0_1";
  source: TorchLeanSource;
  model: {
    id: string;
    title: string;
    architecture: TorchLeanArchitectureNode[];
  };
  report: {
    upstreamFormat: "robust_margin_cert_v0_1";
    norm: "linf";
    method: string;
    epsilon: number;
    inputDimension: number;
    classCount: number;
    summary: { examples: number; nominalOk: number; certifiedOk: number };
  };
  examples: TorchLeanMarginExample[];
  upstreamBoundary: {
    marginReportCheck: "not-replayed" | "replayed";
    enclosureProof: "not-established" | "established-by-imported-kernel-witness";
  };
}

export interface TorchLeanEnclosureBinding {
  sourceRepository: string;
  sourceCommit: string;
  sourcePath: string;
  sourceSha256: string;
  modelId: string;
  norm: "linf";
  method: string;
  epsilon: number;
  inputDimension: number;
  classCount: number;
  exampleIds: number[];
}

/**
 * Serializable request emitted before any enclosure proof exists. It is a
 * specification of the evidence ProofLens needs, never evidence by itself.
 */
export interface TorchLeanEnclosureRequest {
  format: typeof TORCHLEAN_ENCLOSURE_REQUEST_FORMAT;
  binding: TorchLeanEnclosureBinding;
  requiredClaim: "the listed logit intervals enclose the pinned model on the stated input regions";
  acceptedAuthority: "lean-kernel";
  note: string;
}

/** A receipt can name a theorem, but imported JSON cannot mint its witness. */
export interface TorchLeanEnclosureReceipt {
  format: typeof TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT;
  binding: TorchLeanEnclosureBinding;
  proof: {
    authority: "lean-kernel";
    protocol: "prooflens-torchlean-enclosure-v0.1";
    declaration: string;
    module: string;
    statement: string;
    formalIrSha256: string;
  };
}

export interface TrustedTorchLeanFormalIR {
  document: FormalIRDocument;
  sha256: string;
}

export interface TorchLeanEnclosureEvidence {
  status: EpistemicStatus;
  verification: "receipt-missing" | "receipt-mismatch" | "kernel-witness-matched";
  reason: string;
  request: TorchLeanEnclosureRequest;
  receipt?: TorchLeanEnclosureReceipt;
  provenance: Provenance;
}

export interface TorchLeanClassInterval {
  classId: number;
  lower: number;
  upper: number;
  isLabel: boolean;
  isStrongestCompetitor: boolean;
}

export interface TorchLeanExampleScene {
  id: number;
  label: number;
  prediction: number;
  certified: boolean;
  computedCertified: boolean;
  labelFloor: number;
  competitorCeiling: number;
  competitorClass: number;
  margin: number;
  intervals: TorchLeanClassInterval[];
  explanation: string;
}

export interface TorchLeanScene {
  version: string;
  id: string;
  type: "torchlean-margin-report";
  title: string;
  architecture: TorchLeanArchitectureNode[];
  method: string;
  norm: "linf";
  epsilon: number;
  inputDimension: number;
  classCount: number;
  summary: {
    examples: number;
    nominalOk: number;
    certifiedOk: number;
    certifiedRate: number;
  };
  examples: TorchLeanExampleScene[];
  source: TorchLeanSource;
  sourceCompatibility: "isolated-toolchain";
  epistemic: "interpreted";
  provenance: Provenance;
  enclosure: TorchLeanEnclosureEvidence;
  boundary: string;
}

export type TorchLeanSceneResult =
  | { status: "ready"; scene: TorchLeanScene }
  | {
      status: "blocked";
      code:
        | "INVALID_FORMAT"
        | "INVALID_SOURCE"
        | "INVALID_ARCHITECTURE"
        | "INVALID_REPORT"
        | "INVALID_EXAMPLE"
        | "CERTIFICATE_MISMATCH";
      reason: string;
    };

function finite(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function validHash(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bindingFor(snapshot: TorchLeanMarginSnapshot): TorchLeanEnclosureBinding {
  return {
    sourceRepository: snapshot.source.repository,
    sourceCommit: snapshot.source.commit,
    sourcePath: snapshot.source.path,
    sourceSha256: snapshot.source.sha256,
    modelId: snapshot.model.id,
    norm: snapshot.report.norm,
    method: snapshot.report.method,
    epsilon: snapshot.report.epsilon,
    inputDimension: snapshot.report.inputDimension,
    classCount: snapshot.report.classCount,
    exampleIds: snapshot.examples.map((example) => example.id),
  };
}

export function exportTorchLeanEnclosureRequest(
  snapshot: TorchLeanMarginSnapshot,
): TorchLeanEnclosureRequest {
  return {
    format: TORCHLEAN_ENCLOSURE_REQUEST_FORMAT,
    binding: bindingFor(snapshot),
    requiredClaim:
      "the listed logit intervals enclose the pinned model on the stated input regions",
    acceptedAuthority: "lean-kernel",
    note: "This request is certificate debt, not a certificate. Return a receipt naming an exact theorem in trusted Formal IR.",
  };
}

function parseBinding(value: unknown): TorchLeanEnclosureBinding | null {
  if (
    !record(value) ||
    typeof value.sourceRepository !== "string" ||
    typeof value.sourceCommit !== "string" ||
    typeof value.sourcePath !== "string" ||
    !validHash(String(value.sourceSha256)) ||
    typeof value.modelId !== "string" ||
    value.norm !== "linf" ||
    typeof value.method !== "string" ||
    !finite(Number(value.epsilon)) ||
    !Number.isSafeInteger(value.inputDimension) ||
    !Number.isSafeInteger(value.classCount) ||
    !Array.isArray(value.exampleIds) ||
    value.exampleIds.some((id) => !Number.isSafeInteger(id))
  ) {
    return null;
  }
  return value as unknown as TorchLeanEnclosureBinding;
}

function parseReceipt(value: unknown): TorchLeanEnclosureReceipt | null {
  if (!record(value) || value.format !== TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT) return null;
  const binding = parseBinding(value.binding);
  const proof = value.proof;
  if (
    !binding ||
    !record(proof) ||
    proof.authority !== "lean-kernel" ||
    proof.protocol !== "prooflens-torchlean-enclosure-v0.1" ||
    typeof proof.declaration !== "string" ||
    proof.declaration.length === 0 ||
    typeof proof.module !== "string" ||
    proof.module.length === 0 ||
    typeof proof.statement !== "string" ||
    proof.statement.length === 0 ||
    !validHash(String(proof.formalIrSha256))
  ) {
    return null;
  }
  return {
    format: TORCHLEAN_ENCLOSURE_RECEIPT_FORMAT,
    binding,
    proof,
  } as TorchLeanEnclosureReceipt;
}

function sameBinding(left: TorchLeanEnclosureBinding, right: TorchLeanEnclosureBinding): boolean {
  return (
    left.sourceRepository === right.sourceRepository &&
    left.sourceCommit === right.sourceCommit &&
    left.sourcePath === right.sourcePath &&
    left.sourceSha256 === right.sourceSha256 &&
    left.modelId === right.modelId &&
    left.norm === right.norm &&
    left.method === right.method &&
    Object.is(left.epsilon, right.epsilon) &&
    left.inputDimension === right.inputDimension &&
    left.classCount === right.classCount &&
    left.exampleIds.length === right.exampleIds.length &&
    left.exampleIds.every((id, index) => id === right.exampleIds[index])
  );
}

function enclosureEvidence(
  snapshot: TorchLeanMarginSnapshot,
  receiptValue: unknown,
  trusted: TrustedTorchLeanFormalIR | undefined,
): TorchLeanEnclosureEvidence {
  const request = exportTorchLeanEnclosureRequest(snapshot);
  const source = {
    system: "torchlean-receipt",
    declaration: snapshot.model.id,
    path: "enclosure",
  };
  const interpreted = (
    verification: TorchLeanEnclosureEvidence["verification"],
    reason: string,
    receipt?: TorchLeanEnclosureReceipt,
  ): TorchLeanEnclosureEvidence => ({
    status: "interpreted",
    verification,
    reason,
    request,
    ...(receipt ? { receipt } : {}),
    provenance: { sources: [source], inputs: [snapshot.source.sha256] },
  });
  if (receiptValue === undefined) {
    return interpreted(
      "receipt-missing",
      "No enclosure receipt was supplied. The margin report remains interpreted.",
    );
  }
  const receipt = parseReceipt(receiptValue);
  if (!receipt || !sameBinding(receipt.binding, request.binding)) {
    return interpreted(
      "receipt-mismatch",
      "The receipt is malformed or does not exactly bind the source, model, method, dimensions, and examples.",
      receipt ?? undefined,
    );
  }
  if (!trusted || receipt.proof.formalIrSha256 !== trusted.sha256) {
    return interpreted(
      "receipt-mismatch",
      "The receipt has no matching trusted Formal IR, so its serialized proof reference cannot verify anything.",
      receipt,
    );
  }
  const declaration = trusted.document.declarations.find(
    (candidate) => candidate.name === receipt.proof.declaration,
  );
  if (
    !declaration ||
    declaration.kind !== "theorem" ||
    !declaration.docstring?.includes("@prooflens.torchlean-enclosure v0.1") ||
    declaration.source?.module !== receipt.proof.module ||
    declaration.statement.pretty !== receipt.proof.statement
  ) {
    return interpreted(
      "receipt-mismatch",
      "The receipt does not match a trusted theorem carrying the ProofLens TorchLean enclosure protocol marker.",
      receipt,
    );
  }
  const witness = kernelWitness(trusted.document, declaration);
  if (!witness) {
    return interpreted(
      "receipt-mismatch",
      "The matched declaration cannot mint a kernel witness because extraction failed or reached sorry.",
      receipt,
    );
  }
  const verified = transcribe(witness, receipt.proof.statement, {
    sources: [
      {
        system: trusted.document.system,
        declaration: declaration.name,
        module: declaration.source?.module ?? null,
        path: "statement",
      },
      source,
    ],
    inputs: [trusted.sha256, snapshot.source.sha256, snapshot.source.commit],
    note: "The receipt binding matched the snapshot and its exact theorem matched trusted zero-sorry Formal IR.",
  });
  return {
    status: verified.status,
    verification: "kernel-witness-matched",
    reason: "A hash-bound receipt matched an exact zero-sorry theorem in trusted Formal IR.",
    request,
    receipt,
    provenance: verified.provenance,
  };
}

function computeExample(example: TorchLeanMarginExample): TorchLeanExampleScene | null {
  if (
    !Number.isSafeInteger(example.id) ||
    example.id < 0 ||
    !Number.isSafeInteger(example.label) ||
    !Number.isSafeInteger(example.prediction) ||
    example.lower.length === 0 ||
    example.lower.length !== example.upper.length ||
    example.label < 0 ||
    example.label >= example.lower.length ||
    example.prediction < 0 ||
    example.prediction >= example.lower.length
  ) {
    return null;
  }
  if (
    example.lower.some((value) => !finite(value)) ||
    example.upper.some((value) => !finite(value)) ||
    example.lower.some((value, index) => value > example.upper[index]!)
  ) {
    return null;
  }

  let competitorClass = example.label === 0 ? 1 : 0;
  let competitorCeiling = example.upper[competitorClass]!;
  for (let index = 0; index < example.upper.length; index += 1) {
    if (index !== example.label && example.upper[index]! > competitorCeiling) {
      competitorClass = index;
      competitorCeiling = example.upper[index]!;
    }
  }
  const labelFloor = example.lower[example.label]!;
  const margin = labelFloor - competitorCeiling;
  const computedCertified = margin > 0;
  return {
    id: example.id,
    label: example.label,
    prediction: example.prediction,
    certified: example.certified,
    computedCertified,
    labelFloor,
    competitorCeiling,
    competitorClass,
    margin,
    intervals: example.lower.map((lower, classId) => ({
      classId,
      lower,
      upper: example.upper[classId]!,
      isLabel: classId === example.label,
      isStrongestCompetitor: classId === competitorClass,
    })),
    explanation: computedCertified
      ? `The label-${example.label} floor stays above every competing class ceiling by ${formatMargin(margin)}.`
      : `The strongest competing ceiling reaches ${formatMargin(-margin)} above the label-${example.label} floor, so this report cannot certify the label.`,
  };
}

/**
 * Compile a pinned TorchLean robustness-report snapshot without claiming that
 * ProofLens ran TorchLean or imported a kernel witness. The adapter validates
 * structure and recomputes the report's margin predicate; any mismatch blocks.
 */
export function compileTorchLeanMarginScene(
  snapshot: TorchLeanMarginSnapshot,
  options: { receipt?: unknown; trustedFormalIr?: TrustedTorchLeanFormalIR } = {},
): TorchLeanSceneResult {
  if (!record(snapshot) || snapshot.format !== "prooflens_torchlean_margin_snapshot_v0_1") {
    return {
      status: "blocked",
      code: "INVALID_FORMAT",
      reason: "Unknown TorchLean snapshot format.",
    };
  }
  if (
    !record(snapshot.source) ||
    snapshot.source.repository !== "https://github.com/lean-dojo/TorchLean" ||
    !/^[a-f0-9]{40}$/u.test(snapshot.source.commit) ||
    !validHash(snapshot.source.sha256) ||
    snapshot.source.path.length === 0 ||
    snapshot.source.leanToolchain.length === 0
  ) {
    return {
      status: "blocked",
      code: "INVALID_SOURCE",
      reason: "The TorchLean source pin is incomplete or malformed.",
    };
  }
  if (
    !record(snapshot.model) ||
    typeof snapshot.model.id !== "string" ||
    snapshot.model.id.length === 0 ||
    typeof snapshot.model.title !== "string" ||
    snapshot.model.title.length === 0 ||
    !Array.isArray(snapshot.model.architecture)
  ) {
    return {
      status: "blocked",
      code: "INVALID_ARCHITECTURE",
      reason: "The model identity or architecture path is malformed.",
    };
  }
  const architecture = snapshot.model.architecture;
  if (
    architecture.length < 2 ||
    architecture.some(
      (node, index) =>
        !record(node) ||
        typeof node.id !== "string" ||
        node.id.length === 0 ||
        typeof node.label !== "string" ||
        node.label.length === 0 ||
        typeof node.detail !== "string" ||
        node.detail.length === 0 ||
        !Array.isArray(node.shape) ||
        node.shape.some((dimension) => !Number.isSafeInteger(dimension) || dimension <= 0) ||
        (index === 0 && node.op !== "input") ||
        (index > 0 && node.op === "input"),
    )
  ) {
    return {
      status: "blocked",
      code: "INVALID_ARCHITECTURE",
      reason: "The architecture must be an ordered, shaped path beginning with one input node.",
    };
  }
  const { report } = snapshot;
  if (
    !record(report) ||
    !record(report.summary) ||
    report.upstreamFormat !== "robust_margin_cert_v0_1" ||
    report.norm !== "linf" ||
    !finite(report.epsilon) ||
    report.epsilon < 0 ||
    !Number.isSafeInteger(report.inputDimension) ||
    report.inputDimension <= 0 ||
    !Number.isSafeInteger(report.classCount) ||
    report.classCount < 2 ||
    !Number.isSafeInteger(report.summary.examples) ||
    !Number.isSafeInteger(report.summary.nominalOk) ||
    !Number.isSafeInteger(report.summary.certifiedOk) ||
    report.summary.examples <= 0 ||
    report.summary.nominalOk < 0 ||
    report.summary.certifiedOk < 0 ||
    report.summary.nominalOk > report.summary.examples ||
    report.summary.certifiedOk > report.summary.examples
  ) {
    return {
      status: "blocked",
      code: "INVALID_REPORT",
      reason: "The report metadata is inconsistent.",
    };
  }
  if (
    !record(snapshot.upstreamBoundary) ||
    !["not-replayed", "replayed"].includes(snapshot.upstreamBoundary.marginReportCheck) ||
    !["not-established", "established-by-imported-kernel-witness"].includes(
      snapshot.upstreamBoundary.enclosureProof,
    )
  ) {
    return {
      status: "blocked",
      code: "INVALID_REPORT",
      reason: "The upstream verification boundary is missing or malformed.",
    };
  }
  if (
    architecture[0]!.shape.at(-1) !== report.inputDimension ||
    architecture.at(-2)?.shape.at(-1) !== report.classCount
  ) {
    return {
      status: "blocked",
      code: "INVALID_ARCHITECTURE",
      reason: "The architecture shapes do not match the report input and class dimensions.",
    };
  }
  if (!Array.isArray(snapshot.examples) || snapshot.examples.length === 0) {
    return {
      status: "blocked",
      code: "INVALID_EXAMPLE",
      reason: "The snapshot contains no examples.",
    };
  }
  const examples: TorchLeanExampleScene[] = [];
  for (const example of snapshot.examples) {
    if (!record(example) || !Array.isArray(example.lower) || !Array.isArray(example.upper)) {
      return {
        status: "blocked",
        code: "INVALID_EXAMPLE",
        reason: "A report example is malformed.",
      };
    }
    const compiled = computeExample(example);
    if (!compiled || example.lower.length !== report.classCount) {
      return {
        status: "blocked",
        code: "INVALID_EXAMPLE",
        reason: `Example ${example.id} has invalid dimensions or interval bounds.`,
      };
    }
    if (compiled.computedCertified !== example.certified) {
      return {
        status: "blocked",
        code: "CERTIFICATE_MISMATCH",
        reason: `Example ${example.id} disagrees with the strict top-label margin predicate.`,
      };
    }
    examples.push(compiled);
  }

  const sourceUrl = `${snapshot.source.repository}/blob/${snapshot.source.commit}/${snapshot.source.path}`;
  const enclosure = enclosureEvidence(snapshot, options.receipt, options.trustedFormalIr);
  return {
    status: "ready",
    scene: {
      version: TORCHLEAN_ADAPTER_VERSION,
      id: snapshot.model.id,
      type: "torchlean-margin-report",
      title: snapshot.model.title,
      architecture,
      method: report.method,
      norm: report.norm,
      epsilon: report.epsilon,
      inputDimension: report.inputDimension,
      classCount: report.classCount,
      summary: {
        ...report.summary,
        certifiedRate: report.summary.certifiedOk / report.summary.examples,
      },
      examples,
      source: snapshot.source,
      sourceCompatibility: "isolated-toolchain",
      epistemic: "interpreted",
      provenance: {
        sources: [
          {
            system: "torchlean",
            declaration: snapshot.model.id,
            module: sourceUrl,
            path: snapshot.source.path,
          },
        ],
        rule: TORCHLEAN_MARGIN_RULE,
        inputs: [snapshot.source.sha256, snapshot.source.commit],
        note: "The source artifact is pinned and the margin arithmetic is recomputed by ProofLens. TorchLean was not executed by this adapter build.",
      },
      enclosure,
      boundary:
        enclosure.status === "verified"
          ? "A matching trusted Lean kernel witness establishes the receipt's enclosure theorem; ProofLens separately recomputes the displayed margin."
          : "This official TorchLean report excerpt is source-pinned and internally recomputed, but ProofLens has not established that its logit intervals enclose the model. TorchLean's own MarginCert documentation requires a separate verifier or propagation theorem for that claim.",
    },
  };
}

export function formatMargin(value: number): string {
  if (!Number.isFinite(value)) return "undefined";
  return Number(value.toPrecision(5)).toString();
}

export function sceneEpistemicStatus(scene: TorchLeanScene): EpistemicStatus {
  return scene.epistemic;
}

/**
 * Exact excerpt from TorchLean's checked-in digits margin report at the pinned
 * commit. The upstream file hash covers the complete 360-example report.
 */
export const TORCHLEAN_DIGITS_MARGIN_FIXTURE: TorchLeanMarginSnapshot = {
  format: "prooflens_torchlean_margin_snapshot_v0_1",
  source: {
    repository: "https://github.com/lean-dojo/TorchLean",
    commit: "12f5c651f03b3890ec012d0a6bb45e3ea698c8d3",
    path: "NN/Examples/Verification/Robustness/digits_linear_margin_cert.json",
    sha256: "c517ffd45f2f9e7b844750fcc9e937c1c70509466b973f770644b5d7962aa060",
    leanToolchain: "leanprover/lean4:v4.33.0",
  },
  model: {
    id: "torchlean:digits-linear-margin",
    title: "TorchLean digits robustness margin",
    architecture: [
      {
        id: "input",
        op: "input",
        label: "Input region",
        detail: "64 pixels within L∞ ε = 0.02",
        shape: [64],
      },
      {
        id: "linear",
        op: "linear",
        label: "Linear classifier",
        detail: "weights and bias from pinned artifact metadata",
        shape: [10],
      },
      {
        id: "logits",
        op: "logits",
        label: "Logit intervals",
        detail: "lower and upper bound for each digit class",
        shape: [10],
      },
      {
        id: "margin",
        op: "margin-check",
        label: "Strict margin",
        detail: "label floor > every competitor ceiling",
        shape: [1],
      },
    ],
  },
  report: {
    upstreamFormat: "robust_margin_cert_v0_1",
    norm: "linf",
    method: "ibp_linear",
    epsilon: 0.02,
    inputDimension: 64,
    classCount: 10,
    summary: { examples: 360, nominalOk: 349, certifiedOk: 318 },
  },
  examples: [
    {
      id: 0,
      label: 7,
      prediction: 7,
      lower: [
        -3.5199479980766775, -4.809585591368378, -5.87269105270505, -3.222637274600567,
        0.0115853622555719, -5.780080342516885, -9.822131575085226, 6.481595185957846,
        -2.5693868583440787, 2.5780630433559457,
      ],
      upper: [
        -1.6454172085970626, -2.5290233483910556, -3.380054753869771, -0.8568661421909926,
        2.6149377566576018, -3.471410013931453, -7.780179555453358, 8.552639330215754,
        -0.40159816820174504, 4.82769997820258,
      ],
      certified: true,
    },
    {
      id: 7,
      label: 8,
      prediction: 8,
      lower: [
        -4.318381078317762, -5.795382956941611, -3.3290309052914426, -4.737175854342061,
        -6.414815610684455, -5.815598512273282, -3.1549935729056626, -4.447404530579225,
        2.5221911004325355, 0.7156953443773107,
      ],
      upper: [
        -2.264176481217145, -3.316743357633236, -0.5548930796235759, -2.1709662308264517,
        -3.565227807201445, -3.2203799229394647, -0.7565220762044157, -2.134645992154252,
        4.810892301737332, 3.1576093788631265,
      ],
      certified: false,
    },
  ],
  upstreamBoundary: {
    marginReportCheck: "not-replayed",
    enclosureProof: "not-established",
  },
};
