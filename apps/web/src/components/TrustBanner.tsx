import type { TheoremAnalysis } from "@prooflens/pipeline";

/**
 * Shown above the figure whenever the declaration is not worth what a reader
 * would assume: a `sorry` in the proof term, or axioms beyond Lean's standard
 * three. Silent otherwise — a banner that appears for everything is furniture.
 */
export function TrustBanner({ analysis }: { analysis: TheoremAnalysis }): JSX.Element | null {
  const trust = analysis.math.trust;
  if (!trust.usesSorry && trust.unusualAxioms.length === 0) return null;

  return (
    <div className={`trust-banner${trust.usesSorry ? " trust-banner--severe" : ""}`} role="alert">
      <span className="trust-banner__icon" aria-hidden="true">
        {trust.usesSorry ? "✕" : "!"}
      </span>
      <div className="trust-banner__body">
        {trust.usesSorry ? (
          <>
            <strong>Not proved.</strong> This declaration&rsquo;s proof reaches{" "}
            <code className="inline-code">sorryAx</code>. Nothing below is verified — every figure
            and every reading is about the <em>statement</em>, not about a theorem.
          </>
        ) : (
          <>
            <strong>Extended trust base.</strong> Beyond Lean&rsquo;s standard axioms this proof
            depends on{" "}
            {trust.unusualAxioms.map((axiom, index) => (
              <span key={axiom}>
                {index > 0 ? ", " : ""}
                <code className="inline-code">{axiom}</code>
              </span>
            ))}
            .
          </>
        )}
      </div>
    </div>
  );
}
