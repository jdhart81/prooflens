import { useEffect, useMemo, useState } from "react";
import {
  evaluateSemanticScene,
  formatNumber,
  initialSceneValues,
  sampleSemanticScene,
  type NumericBoundScene,
} from "@prooflens/visual-ir";
import { EpistemicChip } from "./EpistemicChip.js";

interface SemanticSceneProps {
  scene: NumericBoundScene;
}

function initialTarget(scene: NumericBoundScene, values: Record<string, number>): number {
  const bound = evaluateSemanticScene(scene, values, 0).boundValue;
  const target = scene.direction === "upper" ? bound * 0.8 : bound * 1.2;
  return Number(target.toFixed(3));
}

export function SemanticScene({ scene }: SemanticSceneProps): JSX.Element {
  const [values, setValues] = useState<Record<string, number>>(() => initialSceneValues(scene));
  const [target, setTarget] = useState<number>(() => initialTarget(scene, values));

  useEffect(() => {
    const next = initialSceneValues(scene);
    setValues(next);
    setTarget(initialTarget(scene, next));
  }, [scene]);

  const evaluation = useMemo(
    () => evaluateSemanticScene(scene, values, target),
    [scene, target, values],
  );
  const points = useMemo(() => sampleSemanticScene(scene, values), [scene, values]);
  const targetMin = Math.min(
    0,
    evaluation.boundValue * 1.5,
    ...points.map((point) => point.bound * 1.2),
  );
  const targetMax = Math.max(
    1,
    evaluation.boundValue * 1.5,
    ...points.map((point) => point.bound * 1.2),
  );

  return (
    <section className="semantic-scene" aria-labelledby="semantic-scene-title">
      <header className="semantic-scene__header">
        <div>
          <p className="semantic-scene__eyebrow">Meaning scene</p>
          <h3 id="semantic-scene-title" className="semantic-scene__title">
            {scene.title}
          </h3>
          <p className="semantic-scene__formula">
            {scene.boundedLabel}{" "}
            {scene.direction === "upper" ? (scene.strict ? "<" : "≤") : scene.strict ? ">" : "≥"}{" "}
            {scene.boundLabel}
          </p>
        </div>
        <EpistemicChip status={scene.epistemic} prefix="scene" />
      </header>

      <div
        className={`semantic-scene__status semantic-scene__status--${evaluation.feasible ? "feasible" : "infeasible"}`}
        role="status"
        aria-live="polite"
      >
        {evaluation.statement}
      </div>

      <div className="semantic-scene__controls" aria-label="Illustrative mathematical parameters">
        {scene.parameters.map((parameter) => (
          <label className="scene-control" key={parameter.id}>
            <span className="scene-control__label">
              <span>{parameter.label}</span>
              <strong>{formatNumber(values[parameter.id]!)}</strong>
            </span>
            <input
              type="range"
              min={parameter.range.min}
              max={parameter.range.max}
              step={parameter.range.step}
              value={values[parameter.id]}
              aria-label={parameter.label}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [parameter.id]: Number(event.currentTarget.value),
                }))
              }
            />
            <span className="scene-control__meta">
              {parameter.symbol}
              {parameter.units ? ` · ${parameter.units}` : ""} · {parameter.domain} · interpreted
            </span>
          </label>
        ))}
        <label className="scene-control scene-control--target">
          <span className="scene-control__label">
            <span>{scene.targetLabel}</span>
            <span className="scene-control__exact">
              <input
                type="number"
                min={targetMin}
                max={targetMax}
                step={0.001}
                value={target}
                aria-label={`Exact ${scene.targetLabel}`}
                onChange={(event) => setTarget(Number(event.currentTarget.value))}
              />
              {scene.targetUnits ? <span>{scene.targetUnits}</span> : null}
            </span>
          </span>
          <input
            type="range"
            min={targetMin}
            max={targetMax}
            step={0.001}
            value={Math.max(targetMin, Math.min(target, targetMax))}
            aria-label={scene.targetLabel}
            onChange={(event) => setTarget(Number(event.currentTarget.value))}
          />
          <span className="scene-control__meta">scenario target · illustrative</span>
        </label>
      </div>

      <BoundChart
        scene={scene}
        values={values}
        target={target}
        points={points}
        feasible={evaluation.feasible}
      />

      <div className="semantic-scene__description">
        <p>{evaluation.description}</p>
        <p className="semantic-scene__caveat">{scene.caveat}</p>
      </div>
    </section>
  );
}

function BoundChart({
  scene,
  values,
  target,
  points,
  feasible,
}: {
  scene: NumericBoundScene;
  values: Record<string, number>;
  target: number;
  points: ReturnType<typeof sampleSemanticScene>;
  feasible: boolean;
}): JSX.Element {
  const width = 680;
  const height = 310;
  const pad = { left: 70, right: 24, top: 24, bottom: 54 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const xParameter = scene.parameters.find((parameter) => parameter.id === scene.xParameterId)!;
  const xMin = xParameter.range.min;
  const xMax = xParameter.range.max;
  const boundValues = points.map((point) => point.bound);
  const rawMin = Math.min(0, target, ...boundValues);
  const rawMax = Math.max(1, target, ...boundValues);
  const yPad = Math.max((rawMax - rawMin) * 0.08, 0.1);
  const yMin = rawMin - (rawMin < 0 ? yPad : 0);
  const yMax = rawMax + yPad;
  const X = (value: number): number => pad.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const Y = (value: number): number => pad.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;
  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${X(point.x).toFixed(2)},${Y(point.bound).toFixed(2)}`,
    )
    .join(" ");
  const regionPath =
    points.length === 0
      ? ""
      : scene.direction === "upper"
        ? `${linePath} L${X(points.at(-1)!.x).toFixed(2)},${Y(yMin).toFixed(2)} L${X(points[0]!.x).toFixed(2)},${Y(yMin).toFixed(2)} Z`
        : `${linePath} L${X(points.at(-1)!.x).toFixed(2)},${Y(yMax).toFixed(2)} L${X(points[0]!.x).toFixed(2)},${Y(yMax).toFixed(2)} Z`;
  const currentX = values[xParameter.id]!;
  const currentBound = evaluateSemanticScene(scene, values, target).boundValue;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="semantic-scene__chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Numeric ${scene.direction} bound chart. ${scene.targetLabel} is ${formatNumber(target)} and the current bound is ${formatNumber(currentBound)}. The target is ${feasible ? "feasible" : "infeasible"}.`}
      >
        {ticks.map((fraction) => {
          const y = pad.top + fraction * plotHeight;
          const value = yMax - fraction * (yMax - yMin);
          return (
            <g key={`y-${fraction}`}>
              <line className="scene-grid" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
              <text className="scene-tick" x={pad.left - 10} y={y + 4} textAnchor="end">
                {formatNumber(value)}
              </text>
            </g>
          );
        })}
        {ticks.map((fraction) => {
          const x = pad.left + fraction * plotWidth;
          const value = xMin + fraction * (xMax - xMin);
          return (
            <text
              className="scene-tick"
              key={`x-${fraction}`}
              x={x}
              y={height - 30}
              textAnchor="middle"
            >
              {formatNumber(value)}
            </text>
          );
        })}
        <path className="scene-region" d={regionPath} />
        <path className="scene-bound" d={linePath} />
        <line
          className={`scene-target scene-target--${feasible ? "feasible" : "infeasible"}`}
          x1={pad.left}
          x2={width - pad.right}
          y1={Y(target)}
          y2={Y(target)}
        />
        <circle className="scene-current" cx={X(currentX)} cy={Y(currentBound)} r={5} />
        <text className="scene-callout" x={X(currentX) + 9} y={Y(currentBound) - 9}>
          bound {formatNumber(currentBound)}
        </text>
        <text
          className="scene-target-label"
          x={width - pad.right - 4}
          y={Y(target) - 7}
          textAnchor="end"
        >
          target {formatNumber(target)}
        </text>
        <text
          className="scene-axis-title"
          x={pad.left + plotWidth / 2}
          y={height - 5}
          textAnchor="middle"
        >
          {xParameter.label}
          {xParameter.units ? ` (${xParameter.units})` : ""}
        </text>
        <text
          className="scene-axis-title"
          transform={`translate(16 ${pad.top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {scene.direction === "upper" ? "upper bound" : "lower bound"} · illustrative inputs
        </text>
      </svg>
    </div>
  );
}
