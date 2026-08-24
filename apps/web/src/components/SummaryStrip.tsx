import type { PipelineBundle } from "@prooflens/pipeline";
import type { EpistemicStatus } from "@prooflens/epistemics";
import { EpistemicChip } from "./EpistemicChip.js";

const HISTOGRAM_ORDER: readonly EpistemicStatus[] = [
  "verified",
  "derived",
  "interpreted",
  "heuristic",
  "illustrative",
  "speculative",
];

/** Corpus-level counts from `bundle.summary`, always on screen. */
export function SummaryStrip({ bundle }: { bundle: PipelineBundle }): JSX.Element {
  const s = bundle.summary;
  const stats: Array<{ label: string; value: number; tone?: "warn" }> = [
    { label: "declarations", value: s.declarations },
    { label: "classified", value: s.classified },
    { label: "unsupported", value: s.unsupported },
    { label: "with unused hypotheses", value: s.withUnusedHypotheses },
    { label: "figures planned", value: s.visualsPlanned },
  ];
  if (s.withSorry > 0) stats.push({ label: "uses sorry", value: s.withSorry, tone: "warn" });
  if (s.withUnusualAxioms > 0)
    stats.push({ label: "unusual axioms", value: s.withUnusualAxioms, tone: "warn" });

  return (
    <div className="summary" aria-label="Corpus summary">
      <ul className="summary__stats">
        {stats.map((stat) => (
          <li key={stat.label} className={`stat${stat.tone === "warn" ? " stat--warn" : ""}`}>
            <span className="stat__value">{stat.value}</span>
            <span className="stat__label">{stat.label}</span>
          </li>
        ))}
      </ul>
      <div className="summary__histogram">
        <span className="summary__histogram-label">figure epistemics</span>
        {HISTOGRAM_ORDER.filter((status) => (s.epistemicHistogram[status] ?? 0) > 0).map(
          (status) => (
            <span key={status} className="summary__histogram-item">
              <EpistemicChip status={status} size="sm" />
              <span className="summary__histogram-count">{s.epistemicHistogram[status]}</span>
            </span>
          ),
        )}
      </div>
      <div className="summary__meta">
        ProofLens {bundle.prooflensVersion} · {bundle.generatedFrom.system}{" "}
        {bundle.generatedFrom.toolchain} · {bundle.generatedFrom.modules.length} modules ·{" "}
        {bundle.generatedFrom.notationFidelity} fidelity
      </div>
    </div>
  );
}
