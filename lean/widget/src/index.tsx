/**
 * The ProofLens panel widget.
 *
 * Runs the entire deterministic pipeline — Formal IR → MathIR → classification
 * → VisualIR → SVG — inside the Lean infoview. The Lean side hands us Formal IR
 * as props and does nothing else, which is what keeps the analysis identical
 * across the widget, the CLI, and the web application.
 *
 * Styling uses VS Code's own theme variables so the panel belongs to whatever
 * theme the reader is using, with fallbacks for hosts that do not define them.
 */
import * as React from "react";
import { runPipelineOnValue, findAnalysis } from "@prooflens/pipeline";
import type { PipelineBundle, TheoremAnalysis } from "@prooflens/pipeline";
import { renderSvg } from "@prooflens/renderer-svg";
import { EPISTEMIC_GLOSS } from "@prooflens/epistemics";
import type { EpistemicStatus } from "@prooflens/epistemics";

type Props = Record<string, unknown> & { focus?: string };

const v = (name: string, fallback: string) => `var(${name}, ${fallback})`;

const colors = {
  fg: v("--vscode-editor-foreground", "#1f2328"),
  bg: v("--vscode-editor-background", "#ffffff"),
  muted: v("--vscode-descriptionForeground", "#57606a"),
  border: v("--vscode-panel-border", "#d0d7de"),
  accent: v("--vscode-textLink-foreground", "#0969da"),
  warnBg: v("--vscode-inputValidation-warningBackground", "#fff8c5"),
  warnFg: v("--vscode-inputValidation-warningForeground", "#4d2d00"),
  errBg: v("--vscode-inputValidation-errorBackground", "#ffebe9"),
  errFg: v("--vscode-inputValidation-errorForeground", "#82071e"),
  code: v("--vscode-textCodeBlock-background", "#f6f8fa"),
};

/**
 * Epistemic status is the one thing in this panel a reader must never have to
 * guess about, so it gets a colour, a glyph, and a tooltip rather than relying
 * on any single channel.
 */
const STATUS_STYLE: Record<EpistemicStatus, { glyph: string; color: string }> = {
  verified: { glyph: "✔", color: "#1a7f37" },
  derived: { glyph: "⟹", color: "#0969da" },
  interpreted: { glyph: "≈", color: "#8250df" },
  heuristic: { glyph: "?", color: "#9a6700" },
  illustrative: { glyph: "◇", color: "#57606a" },
  speculative: { glyph: "✦", color: "#bf3989" },
};

function StatusChip({ status }: { status: EpistemicStatus }): React.ReactElement {
  const style = STATUS_STYLE[status];
  return (
    <span
      title={EPISTEMIC_GLOSS[status]}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3em",
        border: `1px solid ${style.color}`,
        borderStyle: status === "illustrative" || status === "speculative" ? "dashed" : "solid",
        borderRadius: "999px",
        padding: "0 0.55em",
        fontSize: "0.78em",
        lineHeight: "1.6",
        color: style.color,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true">{style.glyph}</span>
      {status}
    </span>
  );
}

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={{ marginBottom: "1.1em" }}>
      <h3
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.6em",
          margin: "0 0 0.4em",
          fontSize: "0.82em",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: colors.muted,
          fontWeight: 600,
        }}
      >
        <span>{title}</span>
        {right}
      </h3>
      {children}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <pre
      style={{
        margin: 0,
        padding: "0.6em 0.7em",
        background: colors.code,
        border: `1px solid ${colors.border}`,
        borderRadius: "4px",
        overflowX: "auto",
        fontSize: "0.92em",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </pre>
  );
}

function TrustBanner({ analysis }: { analysis: TheoremAnalysis }): React.ReactElement | null {
  const { usesSorry, unusualAxioms } = analysis.math.trust;
  if (!usesSorry && unusualAxioms.length === 0) return null;
  const isError = usesSorry;
  return (
    <div
      role="alert"
      style={{
        background: isError ? colors.errBg : colors.warnBg,
        color: isError ? colors.errFg : colors.warnFg,
        border: `1px solid ${isError ? "#cf222e" : "#bf8700"}`,
        borderRadius: "4px",
        padding: "0.5em 0.7em",
        marginBottom: "0.9em",
        fontSize: "0.92em",
      }}
    >
      <strong>{isError ? "Not proved." : "Extra axioms."}</strong>{" "}
      {isError
        ? "This declaration's proof reaches `sorryAx`. Nothing below describes a theorem — only a statement."
        : `This proof depends on axioms beyond Lean's standard three: ${unusualAxioms.join(", ")}.`}
    </div>
  );
}

/**
 * The SVG comes from ProofLens's own renderer, which escapes every piece of
 * text it emits. Nothing user-supplied reaches this string unescaped. Do not
 * extend this pattern to markup from any other source.
 */
function Figure({ svg }: { svg: string }): React.ReactElement {
  return <div style={{ margin: "0.2em 0 0.5em" }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Figures({ analysis }: { analysis: TheoremAnalysis }): React.ReactElement {
  const [active, setActive] = React.useState(0);
  const visuals = analysis.visuals;
  const current = visuals[Math.min(active, visuals.length - 1)];
  if (!current) return <p style={{ color: colors.muted }}>No figure was planned.</p>;

  const svg = React.useMemo(
    () => renderSvg(current, { theme: "auto", idPrefix: `pl-${active}` }),
    [current, active],
  );

  return (
    <div>
      {visuals.length > 1 ? (
        <div
          role="tablist"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.35em", marginBottom: "0.5em" }}
        >
          {visuals.map((visual, index) => (
            <button
              key={visual.id}
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              style={{
                border: `1px solid ${index === active ? colors.accent : colors.border}`,
                background: index === active ? colors.accent : "transparent",
                color: index === active ? colors.bg : colors.fg,
                borderRadius: "999px",
                padding: "0.1em 0.7em",
                fontSize: "0.8em",
                cursor: "pointer",
              }}
            >
              {visual.type}
            </button>
          ))}
        </div>
      ) : null}
      <Figure svg={svg} />
      <p style={{ margin: "0.2em 0", fontSize: "0.88em", color: colors.muted }}>
        <strong style={{ color: colors.fg }}>Why this figure: </strong>
        {current.rationale}
      </p>
      <div style={{ marginTop: "0.35em" }}>
        <StatusChip status={current.epistemic} />
      </div>
    </div>
  );
}

function Explanation({ analysis }: { analysis: TheoremAnalysis }): React.ReactElement {
  return (
    <div>
      {analysis.explanations.map((layer) => (
        <div key={layer.id} style={{ marginBottom: "0.7em" }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.5em", marginBottom: "0.2em" }}
          >
            <strong style={{ fontSize: "0.93em" }}>{layer.title}</strong>
            <StatusChip status={layer.claim.status} />
          </div>
          {layer.id === "formal" ? (
            <Code>{layer.claim.value}</Code>
          ) : (
            <p style={{ margin: 0, fontSize: "0.93em", lineHeight: 1.5 }}>{layer.claim.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Provenance({ analysis }: { analysis: TheoremAnalysis }): React.ReactElement {
  return (
    <div style={{ fontSize: "0.88em" }}>
      {analysis.classifications.map((c) => (
        <div
          key={c.rule.id}
          style={{
            borderLeft: `2px solid ${colors.border}`,
            paddingLeft: "0.7em",
            marginBottom: "0.7em",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5em", flexWrap: "wrap" }}>
            <code style={{ color: colors.accent }}>{c.rule.id}</code>
            <StatusChip status={c.claim.status} />
          </div>
          <div style={{ marginTop: "0.2em" }}>{c.rationale}</div>
          {c.claim.provenance.sources[0]?.path ? (
            <div style={{ color: colors.muted, marginTop: "0.15em" }}>
              evidence at <code>{c.claim.provenance.sources[0].path}</code>
            </div>
          ) : null}
        </div>
      ))}
      <div style={{ color: colors.muted }}>
        trust base: {analysis.math.trust.axioms.join(", ") || "none recorded"}
      </div>
    </div>
  );
}

function Stages({ analysis }: { analysis: TheoremAnalysis }): React.ReactElement {
  const stages: Array<[string, unknown]> = [
    ["Formal IR", analysis.formal],
    ["MathIR", analysis.math],
    ["Classifier output", analysis.classifications],
    ["VisualIR", analysis.visuals],
  ];
  return (
    <div>
      {stages.map(([label, value]) => (
        <details key={label} style={{ marginBottom: "0.4em" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.9em" }}>{label}</summary>
          <Code>{JSON.stringify(value, null, 2)}</Code>
        </details>
      ))}
    </div>
  );
}

const TABS = ["Figures", "Explanation", "Provenance", "Stages"] as const;
type Tab = (typeof TABS)[number];

export default function ProofLensWidget(props: Props): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>("Figures");

  const result = React.useMemo(() => {
    try {
      const bundle = runPipelineOnValue(props);
      const focus = typeof props.focus === "string" ? props.focus : undefined;
      const analysis = focus ? findAnalysis(bundle, focus) : bundle.analyses[0];
      return { bundle, analysis, error: null as string | null };
    } catch (error) {
      return {
        bundle: null as PipelineBundle | null,
        analysis: undefined as TheoremAnalysis | undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [props]);

  if (result.error !== null) {
    return (
      <div
        style={{
          color: colors.errFg,
          background: colors.errBg,
          padding: "0.7em",
          borderRadius: "4px",
        }}
      >
        <strong>ProofLens could not read this declaration.</strong>
        <Code>{result.error}</Code>
      </div>
    );
  }

  const analysis = result.analysis;
  if (!analysis) {
    return <p style={{ color: colors.muted }}>ProofLens found no declaration to analyse.</p>;
  }

  const shortName = analysis.math.name.split(".").pop() ?? analysis.math.name;
  const kinds = Array.from(new Set(analysis.classifications.map((c) => c.payload.kind)));

  return (
    <div style={{ color: colors.fg, fontFamily: "inherit", fontSize: "1em", lineHeight: 1.45 }}>
      <header
        style={{
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: "0.5em",
          marginBottom: "0.8em",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5em", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "1.05em" }}>{shortName}</strong>
          <span style={{ color: colors.muted, fontSize: "0.85em" }}>{analysis.math.kind}</span>
        </div>
        <div style={{ display: "flex", gap: "0.3em", flexWrap: "wrap", marginTop: "0.35em" }}>
          {kinds.map((kind) => (
            <span
              key={kind}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: "3px",
                padding: "0 0.45em",
                fontSize: "0.78em",
                color: colors.muted,
              }}
            >
              {kind}
            </span>
          ))}
        </div>
      </header>

      <TrustBanner analysis={analysis} />

      <Section title="Formal statement">
        <Code>{analysis.math.statementDisplay}</Code>
      </Section>

      <div
        role="tablist"
        style={{ display: "flex", gap: "0.35em", marginBottom: "0.8em", flexWrap: "wrap" }}
      >
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            style={{
              border: "none",
              borderBottom: `2px solid ${tab === name ? colors.accent : "transparent"}`,
              background: "transparent",
              color: tab === name ? colors.fg : colors.muted,
              padding: "0.2em 0.4em",
              fontSize: "0.9em",
              cursor: "pointer",
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Figures" ? <Figures analysis={analysis} /> : null}
      {tab === "Explanation" ? <Explanation analysis={analysis} /> : null}
      {tab === "Provenance" ? <Provenance analysis={analysis} /> : null}
      {tab === "Stages" ? <Stages analysis={analysis} /> : null}

      <footer
        style={{
          marginTop: "1.2em",
          paddingTop: "0.5em",
          borderTop: `1px solid ${colors.border}`,
          fontSize: "0.8em",
          color: colors.muted,
        }}
      >
        ProofLens {result.bundle?.prooflensVersion} · Lean determines what was proved; ProofLens
        helps you read it.
      </footer>
    </div>
  );
}
