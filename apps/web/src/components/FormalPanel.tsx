import type { TheoremAnalysis } from "@prooflens/pipeline";
import { formatSpan, namespaceOf, shortName } from "../lib/format.js";

/**
 * The exact Lean statement, unedited. Everything else in the app is a reading
 * of this block, so it is shown verbatim and never reflowed.
 */
export function FormalPanel({ analysis }: { analysis: TheoremAnalysis }): JSX.Element {
  const source = analysis.formal.source;
  const name = analysis.math.name;

  return (
    <section className="panel panel--formal" aria-labelledby="formal-heading">
      <header className="panel__header">
        <h2 id="formal-heading" className="panel__title">
          Formal
        </h2>
        <span className="panel__count">{analysis.formal.kind}</span>
      </header>

      <pre className="lean" aria-label="Lean statement">
        <code>{analysis.math.statementDisplay}</code>
      </pre>

      <dl className="meta">
        <div className="meta__row">
          <dt>Declaration</dt>
          <dd>
            <code className="inline-code">{shortName(name)}</code>
            {namespaceOf(name) ? <span className="meta__dim"> in {namespaceOf(name)}</span> : null}
          </dd>
        </div>
        <div className="meta__row">
          <dt>Module</dt>
          <dd>
            <code className="inline-code">{source?.module ?? "unknown"}</code>
          </dd>
        </div>
        <div className="meta__row">
          <dt>Lines</dt>
          <dd>
            <code className="inline-code">{formatSpan(source)}</code>
          </dd>
        </div>
        <div className="meta__row">
          <dt>Axioms</dt>
          <dd>
            {analysis.math.trust.axioms.length === 0 ? (
              <span className="meta__dim">none recorded</span>
            ) : (
              analysis.math.trust.axioms.join(", ")
            )}
          </dd>
        </div>
        <div className="meta__row">
          <dt>Proof term</dt>
          <dd>
            {analysis.math.trust.proofTermAvailable
              ? "available — occurrence analysis is meaningful"
              : "unavailable — hypothesis usage cannot be checked"}
          </dd>
        </div>
      </dl>

      {analysis.math.documentation ? (
        <p className="docstring">{analysis.math.documentation}</p>
      ) : null}
    </section>
  );
}
