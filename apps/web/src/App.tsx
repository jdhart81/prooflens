import { useEffect, useMemo, useState } from "react";
import { runPipelineOnValue, type PipelineBundle, type TheoremAnalysis } from "@prooflens/pipeline";
import { FormalPanel } from "./components/FormalPanel.js";
import { InterpretationPanel } from "./components/InterpretationPanel.js";
import { StagePanels, type StageId } from "./components/StagePanels.js";
import { SummaryStrip } from "./components/SummaryStrip.js";
import { TheoremList, type ListFilters } from "./components/TheoremList.js";
import { TorchLeanPanel } from "./components/TorchLeanPanel.js";
import { VisualizationPanel } from "./components/VisualizationPanel.js";
import { KIND_LABEL, primaryKind, unusedHypothesisCount } from "./lib/format.js";

const CORPUS_URL = "corpus.formal-ir.json";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string; detail?: string }
  | { status: "ready"; bundle: PipelineBundle };

export function App(): JSX.Element {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selectedName, setSelectedName] = useState<string>("");
  const [visualIndex, setVisualIndex] = useState(0);
  const [stage, setStage] = useState<StageId>("provenance");
  const [filters, setFilters] = useState<ListFilters>({
    query: "",
    onlyUnusedHypotheses: false,
    onlyUnsupported: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      let raw: unknown;
      try {
        const response = await fetch(CORPUS_URL);
        if (!response.ok) {
          throw new Error(`the server answered ${response.status} ${response.statusText}`);
        }
        raw = await response.json();
      } catch (error) {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: `Could not load the Formal IR corpus from ${CORPUS_URL}.`,
          detail: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        const bundle = runPipelineOnValue(raw);
        if (cancelled) return;
        setLoad({ status: "ready", bundle });
        const first = bundle.analyses[0];
        if (first) setSelectedName(first.math.name);
      } catch (error) {
        if (cancelled) return;
        setLoad({
          status: "error",
          message:
            "The corpus loaded but the pipeline rejected it. Formal IR that does not validate is refused rather than partially interpreted.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const bundle = load.status === "ready" ? load.bundle : null;

  const visible = useMemo<readonly TheoremAnalysis[]>(() => {
    if (!bundle) return [];
    const query = filters.query.trim().toLowerCase();
    return bundle.analyses.filter((analysis) => {
      if (filters.onlyUnusedHypotheses && unusedHypothesisCount(analysis) === 0) return false;
      if (filters.onlyUnsupported && !analysis.unsupported) return false;
      if (!query) return true;
      const kind = primaryKind(analysis);
      const haystack = [
        analysis.math.name,
        analysis.math.statementDisplay,
        analysis.formal.source?.module ?? "",
        analysis.math.concept ?? "",
        kind ? KIND_LABEL[kind] : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [bundle, filters]);

  // Keep the selection inside the filtered set, so the detail panels always
  // describe something the list is actually showing.
  useEffect(() => {
    if (visible.length === 0) return;
    if (visible.some((a) => a.math.name === selectedName)) return;
    const first = visible[0];
    if (first) setSelectedName(first.math.name);
  }, [visible, selectedName]);

  useEffect(() => {
    setVisualIndex(0);
  }, [selectedName]);

  if (load.status === "loading") {
    return (
      <Shell>
        <div className="status-screen">
          <div className="spinner" aria-hidden="true" />
          <p role="status">Loading the Formal IR corpus and running the pipeline…</p>
        </div>
      </Shell>
    );
  }

  if (load.status === "error") {
    return (
      <Shell>
        <div className="status-screen status-screen--error" role="alert">
          <h2>ProofLens could not start</h2>
          <p>{load.message}</p>
          {load.detail ? <pre className="json">{load.detail}</pre> : null}
          <p className="meta__dim">
            The app serves the corpus from <code className="inline-code">public/{CORPUS_URL}</code>.
            Check that the file is present and is valid Formal IR.
          </p>
        </div>
      </Shell>
    );
  }

  const analysis =
    load.bundle.analyses.find((a) => a.math.name === selectedName) ?? load.bundle.analyses[0];

  if (!analysis) {
    return (
      <Shell>
        <div className="status-screen status-screen--error" role="alert">
          <h2>The corpus is empty</h2>
          <p>It parsed as valid Formal IR but contains no declarations to analyse.</p>
        </div>
      </Shell>
    );
  }

  const clampedVisual = Math.min(visualIndex, Math.max(0, analysis.visuals.length - 1));

  return (
    <Shell summary={<SummaryStrip bundle={load.bundle} />}>
      <TorchLeanPanel />
      <main className="workspace">
        <TheoremList
          total={load.bundle.analyses.length}
          visible={visible}
          selectedName={analysis.math.name}
          onSelect={setSelectedName}
          filters={filters}
          onFiltersChange={setFilters}
        />
        <VisualizationPanel
          analysis={analysis}
          activeIndex={clampedVisual}
          onSelectIndex={setVisualIndex}
        />
        <FormalPanel analysis={analysis} />
        <InterpretationPanel analysis={analysis} />
      </main>
      <StagePanels
        analysis={analysis}
        activeStage={stage}
        onSelectStage={setStage}
        selectedSpec={analysis.visuals[clampedVisual]}
      />
    </Shell>
  );
}

function Shell({
  children,
  summary,
}: {
  children: React.ReactNode;
  summary?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="app">
      <a className="skip-link" href="#stages-heading">
        Skip to pipeline stages
      </a>
      <header className="masthead">
        <h1>
          ProofLens <span className="masthead__sep">—</span>{" "}
          <span className="masthead__tagline">Visual Interpretability for Formal Math</span>
        </h1>
      </header>
      {summary}
      {children}
    </div>
  );
}
