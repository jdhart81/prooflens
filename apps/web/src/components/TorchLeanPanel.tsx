import { useMemo, useState } from "react";
import {
  compileTorchLeanMarginScene,
  formatMargin,
  TORCHLEAN_DIGITS_MARGIN_FIXTURE,
  type TorchLeanExampleScene,
  type TorchLeanScene,
} from "@prooflens/torchlean-adapter";
import { EpistemicChip } from "./EpistemicChip.js";

const RESULT = compileTorchLeanMarginScene(TORCHLEAN_DIGITS_MARGIN_FIXTURE);

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
          <p>The strict margin test is recomputed from the displayed intervals.</p>
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
          label={example.margin > 0 ? "positive report margin" : "overlap · no certificate"}
          outcome={example.margin > 0 ? "pass" : "fail"}
        />
      </div>
      <div
        className={`torchlean-margin__result torchlean-margin__result--${example.certified ? "pass" : "fail"}`}
      >
        <strong>{example.certified ? "POSITIVE MARGIN" : "NOT CERTIFIED"}</strong>
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
          <p>Every horizontal segment is a possible score interval under the input perturbation.</p>
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
