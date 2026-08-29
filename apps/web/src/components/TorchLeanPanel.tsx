import { useMemo, useState } from "react";
import { parseFormalIR } from "@prooflens/formal-ir";
import {
  compileTorchLeanMarginScene,
  formatMargin,
  TORCHLEAN_IBP_SOUNDNESS_PIN,
  TORCHLEAN_DIGITS_MARGIN_FIXTURE,
  type TorchLeanExampleScene,
  type TorchLeanScene,
} from "@prooflens/torchlean-adapter";
import torchLeanSoundnessFormalIr from "../../../../examples/torchlean-ibp-soundness.formal-ir.json";
import torchLeanApplicationAudit from "../../../../examples/torchlean-digits-application-audit.json";
import torchLeanEnclosureFormalIr from "../../../../examples/torchlean-digits-enclosure.formal-ir.json";
import torchLeanEnclosureReceipt from "../../../../examples/torchlean-digits-enclosure.receipt.json";
import { EpistemicChip } from "./EpistemicChip.js";

const RESULT = compileTorchLeanMarginScene(TORCHLEAN_DIGITS_MARGIN_FIXTURE, {
  trustedSoundnessFormalIr: {
    document: parseFormalIR(torchLeanSoundnessFormalIr as unknown),
    sha256: TORCHLEAN_IBP_SOUNDNESS_PIN.formalIrSha256,
  },
  applicationAudit: torchLeanApplicationAudit,
  receipt: torchLeanEnclosureReceipt,
  trustedFormalIr: {
    document: parseFormalIR(torchLeanEnclosureFormalIr as unknown),
    sha256: "2d0965c5c2198bde88f90a521ba39bb6e94dc8474094547a9c95b741348bc0e0",
  },
});

export function TorchLeanPanel(): JSX.Element {
  if (RESULT.status !== "ready") {
    return (
      <section
        className="panel torchlean-panel torchlean-panel--blocked"
        aria-labelledby="torchlean-title"
      >
        <h2 id="torchlean-title">TorchLean adapter blocked</h2>
        <p>{RESULT.reason}</p>
      </section>
    );
  }
  return <TorchLeanSceneView scene={RESULT.scene} />;
}

function TorchLeanSceneView({ scene }: { scene: TorchLeanScene }): JSX.Element {
  const [selectedId, setSelectedId] = useState(scene.examples[0]!.id);
  const selected =
    scene.examples.find((example) => example.id === selectedId) ?? scene.examples[0]!;
  const sourceUrl = `${scene.source.repository}/blob/${scene.source.commit}/${scene.source.path}`;

  return (
    <section className="panel torchlean-panel" aria-labelledby="torchlean-title">
      <header className="torchlean-panel__header">
        <div>
          <p className="semantic-scene__eyebrow">Optional adapter · first integration</p>
          <h2 id="torchlean-title">{scene.title}</h2>
          <p>
            Follow a real TorchLean robustness-report excerpt from its model path to the exact
            margin decision.
          </p>
        </div>
        <div className="torchlean-panel__chips">
          <EpistemicChip status={scene.epistemic} prefix="adapter output" />
          <span className="torchlean-panel__toolchain">TorchLean Lean 4.33 · isolated</span>
        </div>
      </header>

      <div className="torchlean-boundary">
        <strong>Trust boundary</strong>
        <span>{scene.boundary}</span>
      </div>

      <section className="torchlean-receipt" aria-labelledby="torchlean-receipt-title">
        <div className="torchlean-receipt__heading">
          <div>
            <p className="semantic-scene__eyebrow">Evidence chain</p>
            <h3 id="torchlean-receipt-title">What is checked—and what is still owed</h3>
          </div>
          <button type="button" onClick={() => downloadEvidencePacket(scene)}>
            Download evidence packet
          </button>
        </div>
        <ol className="torchlean-receipt__steps">
          <ReceiptStep
            number="1"
            status="matched"
            title="Source pinned"
            description="Commit, artifact path, and complete SHA-256 identify the report."
          />
          <ReceiptStep
            number="2"
            status="matched"
            title="Margin replayed"
            description="ProofLens recomputes label floor minus strongest competitor ceiling."
          />
          <ReceiptStep
            number="3"
            status={scene.soundness.status === "verified" ? "verified" : "owed"}
            title="Generic IBP rule"
            description={scene.soundness.reason}
          />
          <ReceiptStep
            number="4"
            status={scene.enclosure.status === "verified" ? "verified" : "owed"}
            title="This model enclosed"
            description={scene.enclosure.reason}
          />
        </ol>
        {scene.application ? <ApplicationBridge scene={scene} /> : null}
        <div className="torchlean-soundness" aria-label="TorchLean IBP theorem explained">
          <div className="torchlean-soundness__header">
            <span>LEAN THEOREM · {scene.soundness.status.toUpperCase()}</span>
            <code>{scene.soundness.theorem.declaration.split(".").at(-1)}</code>
          </div>
          <div className="torchlean-soundness__rule">
            <div className="torchlean-soundness__side">
              <strong>IF</strong>
              <div className="torchlean-soundness__premises">
                {scene.soundness.premises.slice(1).map((premise) => (
                  <span key={premise.id} title={premise.description}>
                    {premise.label}
                  </span>
                ))}
              </div>
            </div>
            <span className="torchlean-soundness__arrow" aria-hidden="true">
              →
            </span>
            <div className="torchlean-soundness__side torchlean-soundness__side--result">
              <strong>THEN</strong>
              <span>Every returned IBP box encloses the graph’s evaluated value.</span>
            </div>
          </div>
          <p>
            {scene.application?.status === "verified"
              ? "This generic graph rule is proved but not used for the concrete receipt. The direct exact-linear theorem above closes the displayed-example enclosure without the unsupported wrapper operations."
              : "The rule is proved. Applying it to this report still needs the concrete artifact binding and the three displayed premises."}
          </p>
        </div>
        <p className="torchlean-receipt__binding">
          The request binds model <code>{scene.id}</code>, method <code>{scene.method}</code>, ε ={" "}
          <code>{scene.epsilon}</code>, and examples{" "}
          <code>{scene.enclosure.request.binding.exampleIds.join(", ")}</code>. Editing any field
          invalidates a returned receipt.
        </p>
      </section>

      <div className="torchlean-summary" aria-label="TorchLean report summary">
        <div>
          <strong>{scene.summary.examples}</strong>
          <span>examples</span>
        </div>
        <div>
          <strong>{scene.summary.nominalOk}</strong>
          <span>nominally correct</span>
        </div>
        <div>
          <strong>{scene.summary.certifiedOk}</strong>
          <span>positive margins</span>
        </div>
        <div className="torchlean-summary__rate">
          <strong>{(scene.summary.certifiedRate * 100).toFixed(1)}%</strong>
          <span>report rate</span>
          <span className="torchlean-summary__track" aria-hidden="true">
            <span style={{ width: `${scene.summary.certifiedRate * 100}%` }} />
          </span>
        </div>
      </div>

      <section className="torchlean-view" aria-labelledby="torchlean-architecture-title">
        <div className="torchlean-view__heading">
          <span>1</span>
          <div>
            <h3 id="torchlean-architecture-title">Model path</h3>
            <p>What receives the perturbation, transforms it, and produces the claim.</p>
          </div>
        </div>
        <ol className="torchlean-architecture">
          {scene.architecture.map((node, index) => (
            <li
              key={node.id}
              className={
                index === scene.architecture.length - 1
                  ? "torchlean-node torchlean-node--decision"
                  : "torchlean-node"
              }
            >
              <span className="torchlean-node__op">{node.op}</span>
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
              <code>[{node.shape.join(" × ")}]</code>
            </li>
          ))}
        </ol>
      </section>

      <div className="torchlean-example-tabs" role="tablist" aria-label="Report examples">
        {scene.examples.map((example) => (
          <button
            key={example.id}
            id={`torchlean-example-tab-${example.id}`}
            type="button"
            role="tab"
            aria-selected={example.id === selected.id}
            aria-controls="torchlean-example-panel"
            className={
              example.id === selected.id
                ? "torchlean-example-tab torchlean-example-tab--active"
                : "torchlean-example-tab"
            }
            onClick={() => setSelectedId(example.id)}
          >
            Example {example.id} · {example.certified ? "positive margin" : "not certified"}
          </button>
        ))}
      </div>

      <div
        className="torchlean-detail-grid"
        id="torchlean-example-panel"
        role="tabpanel"
        aria-labelledby={`torchlean-example-tab-${selected.id}`}
      >
        <MarginStory example={selected} epsilon={scene.epsilon} />
        <IntervalChart example={selected} />
      </div>

      <footer className="torchlean-source">
        <div>
          <strong>Source receipt</strong>
          <span>
            commit <code>{scene.source.commit.slice(0, 12)}</code> · SHA-256{" "}
            <code>{scene.source.sha256.slice(0, 16)}…</code>
          </span>
        </div>
        <a href={sourceUrl} target="_blank" rel="noreferrer">
          Open pinned TorchLean artifact
        </a>
      </footer>
    </section>
  );
}

function ReceiptStep({
  number,
  status,
  title,
  description,
}: {
  number: string;
  status: "matched" | "owed" | "verified";
  title: string;
  description: string;
}): JSX.Element {
  return (
    <li className={`torchlean-receipt-step torchlean-receipt-step--${status}`}>
      <span className="torchlean-receipt-step__number">{number}</span>
      <div>
        <span className="torchlean-receipt-step__status">
          {status === "owed" ? "CERTIFICATE DEBT" : status.toUpperCase()}
        </span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </li>
  );
}

function downloadEvidencePacket(scene: TorchLeanScene): void {
  const packet = {
    format: "prooflens_torchlean_evidence_packet_v0_1",
    applicationAudit: torchLeanApplicationAudit,
    genericTheorem: scene.soundness.theorem,
    concreteCertificate: {
      receipt: torchLeanEnclosureReceipt,
      formalIr: torchLeanEnclosureFormalIr,
    },
    enclosureRequest: scene.enclosure.request,
    conclusion: {
      status: scene.application?.status ?? "owed",
      reason: scene.application?.reason ?? scene.enclosure.reason,
    },
  };
  const blob = new Blob([`${JSON.stringify(packet, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "prooflens-torchlean-evidence-packet.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function ApplicationBridge({ scene }: { scene: TorchLeanScene }): JSX.Element | null {
  const application = scene.application;
  if (!application) return null;
  const variables = [
    {
      symbol: "g",
      name: "lowered graph",
      detail:
        application.status === "verified"
          ? "the observed 16-node wrapper graph is shown for provenance but is not the certificate path"
          : `${application.nodes.length} ordered operations from input node 0 to output node 15`,
      status: application.status === "verified" ? "not-used" : "matched",
    },
    {
      symbol: "ps",
      name: "parameter store",
      detail:
        application.status === "verified"
          ? "pinned decimal weights and bias are interpreted as exact rationals in Lean"
          : "weights and bias are hash-bound; their exact-real interpretation is not proved",
      status: application.status === "verified" ? "verified" : "owed",
    },
    {
      symbol: "inputs",
      name: "admitted values",
      detail:
        application.status === "verified"
          ? "the theorem covers every 64-value input inside either exact ±0.02 box"
          : "64 pixels may move ±0.02; membership in every Lean input box remains owed",
      status: application.status === "verified" ? "verified" : "owed",
    },
    {
      symbol: "B",
      name: "output boxes",
      detail:
        application.status === "verified"
          ? "exactLower and exactUpper are symbolic real sums, avoiding binary64 rounding"
          : "replayed binary64 endpoints are not yet outward-rounded exact-real bounds",
      status: application.status === "verified" ? "verified" : "blocked",
    },
  ] as const;
  return (
    <div
      className={`torchlean-application torchlean-application--${application.status}`}
      aria-label="Concrete theorem application audit"
    >
      <header>
        <div>
          <span>CONCRETE APPLICATION · {application.status.toUpperCase()}</span>
          <strong>
            {application.status === "verified"
              ? "Why the exact-real certificate encloses this model"
              : "Why the proved rule cannot certify this model yet"}
          </strong>
        </div>
        <code>
          {application.status === "verified"
            ? "zero sorry · 2 source examples"
            : "16 nodes · 2 unsupported operations"}
        </code>
      </header>
      {application.status === "verified" ? (
        <div className="torchlean-exact-flow" aria-label="Exact certificate flow">
          <span>64 values inside x ± 0.02</span>
          <i aria-hidden="true">→</i>
          <span>exact decimal weights + bias</span>
          <i aria-hidden="true">→</i>
          <strong>exactLower ≤ score ≤ exactUpper</strong>
        </div>
      ) : null}
      <div className="torchlean-application__variables">
        {variables.map((variable) => (
          <div
            key={variable.symbol}
            className={`torchlean-variable torchlean-variable--${variable.status}`}
          >
            <code>{variable.symbol}</code>
            <div>
              <strong>{variable.name}</strong>
              <span>{variable.detail}</span>
            </div>
          </div>
        ))}
      </div>
      <div
        className={`torchlean-graph torchlean-graph--${application.status}`}
        aria-label="Observed TorchLean lowering graph"
      >
        {application.nodes.map((node, index) => (
          <div
            key={node.id}
            className={
              node.supported
                ? "torchlean-graph__node"
                : "torchlean-graph__node torchlean-graph__node--blocked"
            }
            title={`node ${node.id}; parents ${node.parents.join(", ") || "none"}; shape ${node.shape}`}
          >
            <small>{node.id}</small>
            <strong>{node.op}</strong>
            <span>{node.shape}</span>
            {index < application.nodes.length - 1 ? <i aria-hidden="true">→</i> : null}
          </div>
        ))}
      </div>
      <div className="torchlean-application__gates">
        {application.gates.map((gate) => (
          <div
            key={gate.id}
            className={`torchlean-application-gate torchlean-application-gate--${gate.status}`}
          >
            <span>{gate.status.toUpperCase()}</span>
            <strong>{gate.label}</strong>
            <p>{gate.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarginStory({
  example,
  epsilon,
}: {
  example: TorchLeanExampleScene;
  epsilon: number;
}): JSX.Element {
  return (
    <section className="torchlean-view torchlean-margin" aria-labelledby="torchlean-margin-title">
      <div className="torchlean-view__heading">
        <span>2</span>
        <div>
          <h3 id="torchlean-margin-title">Why this example passes or fails</h3>
          <p>
            {example.intervalAuthority === "lean-exact-outward-certificate"
              ? "The strict margin is recomputed from Lean-proved outward bounds."
              : "The strict margin test is recomputed from the displayed report intervals."}
          </p>
        </div>
      </div>
      <div className="torchlean-margin__perturbation">
        Every one of the 64 inputs may move within <strong>±{epsilon}</strong> in L∞.
      </div>
      <div className="torchlean-margin__equation" aria-label="Robustness margin calculation">
        <Term
          value={formatMargin(example.labelFloor)}
          label={`lowest possible score for label ${example.label}`}
        />
        <span className="torchlean-margin__operator">−</span>
        <Term
          value={formatMargin(example.competitorCeiling)}
          label={`highest competing score · class ${example.competitorClass}`}
        />
        <span className="torchlean-margin__operator">=</span>
        <Term
          value={formatMargin(example.margin)}
          label={
            example.margin > 0
              ? example.intervalAuthority === "lean-exact-outward-certificate"
                ? "positive certified margin"
                : "positive report margin"
              : "overlap · no label certificate"
          }
          outcome={example.margin > 0 ? "pass" : "fail"}
        />
      </div>
      <div
        className={`torchlean-margin__result torchlean-margin__result--${example.certified ? "pass" : "fail"}`}
      >
        <strong>
          {example.certified && example.intervalAuthority === "lean-exact-outward-certificate"
            ? "ROBUSTNESS CERTIFIED"
            : example.certified
              ? "POSITIVE MARGIN"
              : "NOT CERTIFIED"}
        </strong>
        <span>{example.explanation}</span>
      </div>
      <p className="torchlean-margin__note">
        “Not certified” means these bounds overlap. It does not prove that the model is wrong or
        vulnerable.
      </p>
    </section>
  );
}

function Term({
  value,
  label,
  outcome,
}: {
  value: string;
  label: string;
  outcome?: "pass" | "fail";
}): JSX.Element {
  return (
    <span className={`torchlean-term${outcome ? ` torchlean-term--${outcome}` : ""}`}>
      <strong>{value}</strong>
      <span className="torchlean-term__brace" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function IntervalChart({ example }: { example: TorchLeanExampleScene }): JSX.Element {
  const { min, max } = useMemo(() => {
    const values = example.intervals.flatMap((interval) => [interval.lower, interval.upper]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const padding = Math.max((hi - lo) * 0.06, 0.25);
    return { min: lo - padding, max: hi + padding };
  }, [example]);
  const at = (value: number): number => ((value - min) / (max - min)) * 100;
  const ticks = [min, (min + max) / 2, max];

  return (
    <section
      className="torchlean-view torchlean-intervals"
      aria-labelledby="torchlean-intervals-title"
    >
      <div className="torchlean-view__heading">
        <span>3</span>
        <div>
          <h3 id="torchlean-intervals-title">What the bound represents</h3>
          <p>
            {example.intervalAuthority === "lean-exact-outward-certificate"
              ? "Every segment is an outward-rounded enclosure proved from exact model arithmetic."
              : "Every horizontal segment is a reported score interval under the input perturbation."}
          </p>
        </div>
      </div>
      <div className="torchlean-axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} style={{ left: `${at(tick)}%` }}>
            {formatMargin(tick)}
          </span>
        ))}
      </div>
      <ol className="torchlean-interval-list" aria-label="Class score intervals">
        {example.intervals.map((interval) => {
          const left = at(interval.lower);
          const width = Math.max(0.8, at(interval.upper) - left);
          const className = interval.isLabel
            ? "torchlean-interval torchlean-interval--label"
            : interval.isStrongestCompetitor
              ? "torchlean-interval torchlean-interval--competitor"
              : "torchlean-interval";
          return (
            <li key={interval.classId} className={className}>
              <span className="torchlean-interval__class">{interval.classId}</span>
              <span className="torchlean-interval__track">
                <span
                  className="torchlean-interval__range"
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`class ${interval.classId}: ${formatMargin(interval.lower)} to ${formatMargin(interval.upper)}`}
                />
              </span>
              <span className="torchlean-interval__values">
                {formatMargin(interval.lower)} … {formatMargin(interval.upper)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="torchlean-intervals__legend">
        <span>
          <i className="torchlean-key torchlean-key--label" /> reported label
        </span>
        <span>
          <i className="torchlean-key torchlean-key--competitor" /> strongest competitor
        </span>
      </div>
    </section>
  );
}
