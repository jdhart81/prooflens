import { useEffect, useMemo, useState } from "react";
import { runPipelineOnValue, type PipelineBundle, type TheoremAnalysis } from "@prooflens/pipeline";
import { FormalPanel } from "./components/FormalPanel.js";
import { InterpretationPanel } from "./components/InterpretationPanel.js";
import { PaperPacketPanel } from "./components/PaperPacketPanel.js";
import { StagePanels, type StageId } from "./components/StagePanels.js";
import { SummaryStrip } from "./components/SummaryStrip.js";
import { TheoremList, type ListFilters } from "./components/TheoremList.js";
import { TorchLeanPanel } from "./components/TorchLeanPanel.js";
import { VisualizationPanel } from "./components/VisualizationPanel.js";
import { InputPanel } from "./components/InputPanel.js";
import { SeymourExplorer } from "./components/SeymourExplorer.js";
import { KIND_LABEL, primaryKind, unusedHypothesisCount } from "./lib/format.js";

const CORPUS_URL = "corpus.formal-ir.json";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string; detail?: string }
  | { status: "ready"; bundle: PipelineBundle; formalIrSha256: string };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function App(): JSX.Element {
  const [view, setView] = useState<"corpus" | "seymour">(() =>
    typeof window !== "undefined" && window.location.hash === "#seymour" ? "seymour" : "corpus",
  );
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [examples, setExamples] = useState<Extract<LoadState, { status: "ready" }> | null>(null);
  const [inputName, setInputName] = useState("Bundled examples");
  const [selectedName, setSelectedName] = useState<string>("");
  const [visualIndex, setVisualIndex] = useState(0);
  const [stage, setStage] = useState<StageId>("provenance");
  const [filters, setFilters] = useState<ListFilters>({
    query: "",
    onlyUnusedHypotheses: false,
    onlyUnsupported: false,
  });

  useEffect(() => {
    const onHashChange = (): void => {
      if (window.location.hash === "#seymour") setView("seymour");
      else if (window.location.hash === "#corpus" || window.location.hash === "") setView("corpus");
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      let raw: unknown;
      let formalIrSha256: string;
      try {
        const response = await fetch(CORPUS_URL);
        if (!response.ok) {
          throw new Error(`the server answered ${response.status} ${response.statusText}`);
        }
        const text = await response.text();
        raw = JSON.parse(text) as unknown;
        formalIrSha256 = await sha256(text);
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
        setLoad({ status: "ready", bundle, formalIrSha256 });
        setExamples({ status: "ready", bundle, formalIrSha256 });
        const first =
          bundle.analyses.find((analysis) => analysis.semanticScene.status === "ready") ??
          bundle.analyses[0];
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
  const inputPanel = (
    <InputPanel
      onLoad={async (imported, text, name, skipped) => {
        const formalIrSha256 = await sha256(text);
        setLoad({ status: "ready", bundle: imported, formalIrSha256 });
        setInputName(`${name}${skipped ? ` · ${skipped} unsupported statements skipped` : ""}`);
        setSelectedName(
          imported.analyses.find((a) => a.exploration.status === "ready")?.math.name ??
            imported.analyses[0]?.math.name ??
            "",
        );
        setFilters({ query: "", onlyUnusedHypotheses: false, onlyUnsupported: false });
      }}
      onExamples={() => {
        if (examples) {
          setLoad(examples);
          setInputName("Bundled examples");
          setSelectedName(
            examples.bundle.analyses.find((a) => a.semanticScene.status === "ready")?.math.name ??
              examples.bundle.analyses[0]?.math.name ??
              "",
          );
          setFilters({ query: "", onlyUnusedHypotheses: false, onlyUnsupported: false });
        } else window.location.reload();
      }}
    />
  );

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
    const selected = bundle?.analyses.find((analysis) => analysis.math.name === selectedName);
    const mathematicalFigure = selected?.visuals.findIndex(
      (visual) => !["assumption-sensitivity", "dependency-graph"].includes(visual.type),
    );
    setVisualIndex(Math.max(0, mathematicalFigure ?? 0));
  }, [selectedName, bundle]);

  if (view === "seymour") {
    return (
      <Shell activeView="seymour">
        <SeymourExplorer />
      </Shell>
    );
  }

  if (load.status === "loading") {
    return (
      <Shell>
        <div className="status-screen">
          <div className="spinner" aria-hidden="true" />
          <p role="status">Preparing the mathematical examples and their visual explanations…</p>
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
        {inputPanel}
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
    <Shell>
      {inputPanel}
      <p className="workspace-intro">
        {inputName} · Choose a statement, then change its values to explore the mathematics.
      </p>
      {load.bundle.formal.inputOrigin ? (
        <p className="import-status" role="status">
          <strong>
            {load.bundle.formal.inputOrigin === "source-preview"
              ? "Source preview · not checked by Lean."
              : "Imported extraction · proof status not independently checked."}
          </strong>{" "}
          These explanations describe the supplied statements. Numerical examples do not verify
          conjectures or certify this input.
        </p>
      ) : null}
      <main className="workspace" id="math-workspace" tabIndex={-1}>
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
        <InterpretationPanel analysis={analysis} />
        <FormalPanel analysis={analysis} />
      </main>
      <details className="workspace-details">
        <summary>How this explanation was produced</summary>
        <SummaryStrip bundle={load.bundle} />
        <StagePanels
          analysis={analysis}
          activeStage={stage}
          onSelectStage={setStage}
          selectedSpec={analysis.visuals[clampedVisual]}
        />
      </details>
      <details className="workspace-details">
        <summary>Research paper certificates</summary>
        <PaperPacketPanel formalIr={load.bundle.formal} formalIrSha256={load.formalIrSha256} />
      </details>
      <details className="workspace-details">
        <summary>Neural network example · TorchLean</summary>
        <TorchLeanPanel />
      </details>
    </Shell>
  );
}

function Shell({
  children,
  summary,
  activeView = "corpus",
}: {
  children: React.ReactNode;
  summary?: React.ReactNode;
  activeView?: "corpus" | "seymour";
}): JSX.Element {
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#math-workspace"
        onClick={(event) => {
          const workspace = document.getElementById("math-workspace");
          if (workspace) {
            event.preventDefault();
            workspace.focus();
          }
        }}
      >
        Skip to mathematical exploration
      </a>
      <header className="masthead">
        <h1>
          ProofLens <span className="masthead__sep">—</span>{" "}
          <span className="masthead__tagline">See what the mathematics is saying</span>
        </h1>
      </header>
      <nav className="workspace-nav" aria-label="ProofLens examples">
        <a href="#corpus" aria-current={activeView === "corpus" ? "page" : undefined}>
          Explore statements
        </a>
        <a href="#seymour" aria-current={activeView === "seymour" ? "page" : undefined}>
          OpenAI · Seymour graph explorer
        </a>
      </nav>
      {summary}
      {children}
    </div>
  );
}
