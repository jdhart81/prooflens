import { useMemo } from "react";
import { renderSvg } from "@prooflens/renderer-svg";
import type { VisualSpec } from "@prooflens/visual-ir";
import type { TheoremAnalysis } from "@prooflens/pipeline";
import { EpistemicChip } from "./EpistemicChip.js";
import { InlineMarkup } from "./InlineMarkup.js";
import { Tabs, type TabItem } from "./Tabs.js";
import { TrustBanner } from "./TrustBanner.js";

interface VisualizationPanelProps {
  analysis: TheoremAnalysis;
  activeIndex: number;
  onSelectIndex: (index: number) => void;
}

export function VisualizationPanel({
  analysis,
  activeIndex,
  onSelectIndex,
}: VisualizationPanelProps): JSX.Element {
  const visuals = analysis.visuals;
  const index = Math.min(activeIndex, Math.max(0, visuals.length - 1));
  const spec: VisualSpec | undefined = visuals[index];

  const tabs: TabItem[] = visuals.map((visual, i) => ({
    id: String(i),
    label: visual.type,
  }));

  const svg = useMemo(() => {
    if (!spec) return null;
    try {
      // The markup below is produced by @prooflens/renderer-svg, our own
      // deterministic renderer: no network input, no user-authored HTML, and
      // every string it embeds passes through its escapeXml(). That is why
      // injecting it with dangerouslySetInnerHTML is safe here — do not extend
      // this to any SVG that did not come out of renderSvg().
      return renderSvg(spec, { theme: "auto" });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [spec]);

  return (
    <section className="panel panel--visual" aria-labelledby="visual-heading">
      <header className="panel__header">
        <h2 id="visual-heading" className="panel__title">
          Visualization
        </h2>
        {spec ? <EpistemicChip status={spec.epistemic} prefix="figure" /> : null}
      </header>

      <TrustBanner analysis={analysis} />

      {visuals.length === 0 || !spec ? (
        <p className="empty">
          No deterministic classifier planned a figure for this declaration. That is a reported
          outcome, not a failure: ProofLens draws nothing rather than inventing a reading.
        </p>
      ) : (
        <>
          {visuals.length > 1 ? (
            <Tabs
              items={tabs}
              activeId={String(index)}
              onSelect={(id) => onSelectIndex(Number(id))}
              label="Figures for this theorem"
              idPrefix="visual"
            />
          ) : null}

          <div
            className="figure-wrap"
            id={`visual-panel-${index}`}
            role={visuals.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={visuals.length > 1 ? `visual-tab-${index}` : undefined}
            tabIndex={0}
          >
            <div className="figure-heading">
              <h3 className="figure-title">{spec.title}</h3>
              {spec.subtitle ? <p className="figure-subtitle">{spec.subtitle}</p> : null}
            </div>

            {svg && typeof svg === "object" ? (
              <p className="empty empty--error">This figure failed to render: {svg.error}</p>
            ) : (
              <div className="figure" dangerouslySetInnerHTML={{ __html: svg ?? "" }} />
            )}

            <div className="rationale">
              <h4 className="rationale__label">Why this figure</h4>
              <p className="rationale__text">
                <InlineMarkup text={spec.rationale} />
              </p>
              {spec.provenance.rule ? (
                <p className="rationale__rule">
                  Rule <code className="inline-code">{spec.provenance.rule.id}</code> ·{" "}
                  {spec.provenance.rule.description}
                </p>
              ) : null}
              {spec.provenance.note ? (
                <p className="rationale__rule">{spec.provenance.note}</p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
