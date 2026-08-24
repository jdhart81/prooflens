import type { TheoremAnalysis } from "@prooflens/pipeline";
import { EpistemicChip } from "./EpistemicChip.js";
import { InlineMarkup } from "./InlineMarkup.js";

/**
 * The layered explanation, ordered from what Lean proved toward what a human
 * might make of it. Every layer carries its own chip: a reader can stop at any
 * point and know exactly how much of what they have read the kernel backs.
 */
export function InterpretationPanel({ analysis }: { analysis: TheoremAnalysis }): JSX.Element {
  return (
    <section className="panel panel--interpretation" aria-labelledby="interpretation-heading">
      <header className="panel__header">
        <h2 id="interpretation-heading" className="panel__title">
          Interpretation
        </h2>
        <span className="panel__count">{analysis.explanations.length} layers</span>
      </header>

      <p className="panel__note">
        Ordered from the kernel outward. The chip on each layer says what that layer is worth; hover
        it for the full gloss.
      </p>

      <ol className="layers">
        {analysis.explanations.map((layer) => (
          <li key={layer.id} className={`layer layer--${layer.claim.status}`}>
            <div className="layer__head">
              <h3 className="layer__title">{layer.title}</h3>
              <EpistemicChip status={layer.claim.status} />
            </div>
            <p className={`layer__text${layer.id === "formal" ? " layer__text--mono" : ""}`}>
              <InlineMarkup text={layer.claim.value} />
            </p>
            <p className="layer__rule">
              {layer.claim.provenance.rule ? (
                <>
                  via <code className="inline-code">{layer.claim.provenance.rule.id}</code>
                </>
              ) : (
                <>transcribed directly from the kernel — no rule was applied</>
              )}
              {layer.claim.provenance.sources[0]?.declaration ? (
                <span className="layer__source">
                  {" "}
                  · {layer.claim.provenance.sources[0].declaration}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
