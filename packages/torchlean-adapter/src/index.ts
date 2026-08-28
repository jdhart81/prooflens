import type { EpistemicStatus, Provenance } from "@prooflens/epistemics";

export const TORCHLEAN_ADAPTER_VERSION = "0.1.0";

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
): TorchLeanSceneResult {
  if (snapshot.format !== "prooflens_torchlean_margin_snapshot_v0_1") {
    return {
      status: "blocked",
      code: "INVALID_FORMAT",
      reason: "Unknown TorchLean snapshot format.",
    };
  }
  if (
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
  const architecture = snapshot.model.architecture;
  if (
    architecture.length < 2 ||
    architecture.some(
      (node, index) =>
        node.id.length === 0 ||
        node.label.length === 0 ||
        node.detail.length === 0 ||
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
    architecture[0]!.shape.at(-1) !== report.inputDimension ||
    architecture.at(-2)?.shape.at(-1) !== report.classCount
  ) {
    return {
      status: "blocked",
      code: "INVALID_ARCHITECTURE",
      reason: "The architecture shapes do not match the report input and class dimensions.",
    };
  }
  if (snapshot.examples.length === 0) {
    return {
      status: "blocked",
      code: "INVALID_EXAMPLE",
      reason: "The snapshot contains no examples.",
    };
  }
  const examples: TorchLeanExampleScene[] = [];
  for (const example of snapshot.examples) {
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
      boundary:
        snapshot.upstreamBoundary.enclosureProof === "established-by-imported-kernel-witness"
          ? "An imported kernel witness establishes enclosure; ProofLens recomputes only the displayed margin."
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
