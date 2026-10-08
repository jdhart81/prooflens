import { useId, useMemo, useState } from "react";
import {
  cycleOrientedEdge,
  evaluateSeymourGraph,
  SEYMOUR_SOURCE,
  type OrientedGraph,
} from "@prooflens/visual-ir";

const PRESETS: readonly { name: string; note: string; graph: OrientedGraph; selected: number }[] = [
  {
    name: "Three-vertex cycle",
    note: "Every vertex has one first neighbor and one second neighbor.",
    graph: {
      vertexCount: 3,
      edges: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 0 },
      ],
    },
    selected: 0,
  },
  {
    name: "A path with a sink",
    note: "Vertex 2 has no outgoing edges. Its two counts are both zero, so it qualifies.",
    graph: {
      vertexCount: 3,
      edges: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
      ],
    },
    selected: 2,
  },
  {
    name: "Two paths, one destination",
    note: "From vertex 0, two paths reach vertex 3 in two steps. That destination counts once.",
    graph: {
      vertexCount: 4,
      edges: [
        { from: 0, to: 1 },
        { from: 0, to: 2 },
        { from: 1, to: 3 },
        { from: 2, to: 3 },
      ],
    },
    selected: 0,
  },
  {
    name: "A direct-neighbor shortcut",
    note: "Vertex 2 is reached both directly and in two steps from 0. It remains a first neighbor and is excluded from the second set.",
    graph: {
      vertexCount: 3,
      edges: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 0, to: 2 },
      ],
    },
    selected: 0,
  },
  {
    name: "No edges",
    note: "Every vertex is a sink, and every vertex qualifies with zero in both sets.",
    graph: { vertexCount: 4, edges: [] },
    selected: 0,
  },
];

function vertexSet(vertices: readonly number[]): string {
  return vertices.length ? `{ ${vertices.join(", ")} }` : "∅ (empty set)";
}

function saveExample(graph: OrientedGraph, selectedVertex: number): void {
  const content = JSON.stringify(
    {
      format: "prooflens-seymour-example-v1",
      claim: "Finite example; does not prove the general conjecture or verify a released solution.",
      source: SEYMOUR_SOURCE,
      graph,
      selectedVertex,
      evaluation: evaluateSeymourGraph(graph),
    },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([content + "\n"], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "prooflens-seymour-example.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SeymourExplorer(): JSX.Element {
  const [graph, setGraph] = useState<OrientedGraph>(PRESETS[0]!.graph);
  const [selectedVertex, setSelectedVertex] = useState(0);
  const [presetNote, setPresetNote] = useState(PRESETS[0]!.note);
  const evaluation = useMemo(() => evaluateSeymourGraph(graph), [graph]);
  const selected = evaluation.vertices[selectedVertex]!;
  const markerId = `seymour-arrow-${useId().replace(/:/g, "")}`;
  const positions = Array.from({ length: graph.vertexCount }, (_, vertex) => {
    const angle = -Math.PI / 2 + (vertex * 2 * Math.PI) / graph.vertexCount;
    return { x: 300 + 158 * Math.cos(angle), y: 215 + 158 * Math.sin(angle) };
  });
  const pairs = Array.from({ length: graph.vertexCount }, (_, from) =>
    Array.from({ length: graph.vertexCount - from - 1 }, (_, offset) => ({
      from,
      to: from + offset + 1,
    })),
  ).flat();

  function changeCount(vertexCount: number): void {
    setGraph((current) => ({
      vertexCount,
      edges: current.edges.filter((edge) => edge.from < vertexCount && edge.to < vertexCount),
    }));
    setSelectedVertex((current) => Math.min(current, vertexCount - 1));
    setPresetNote("Your edited graph. Select a vertex to inspect its two neighborhoods.");
  }

  return (
    <main className="seymour" id="math-workspace" tabIndex={-1}>
      <div className="seymour-heading">
        <p className="seymour-eyebrow">OpenAI mathematics · Community example</p>
        <h2>Explore Seymour’s second neighborhood</h2>
        <p>
          Can you find a vertex with at least as many second neighbors as first neighbors? Change a
          graph and see exactly which vertices qualify.
        </p>
        <p className="seymour-boundary">
          <strong>Finite example explorer.</strong> This illustrates the released definitions. It
          does not prove the general conjecture or verify OpenAI’s solution.
        </p>
      </div>

      <section className="seymour-presets" aria-label="Example graphs">
        <span>Start with an example</span>
        <div className="seymour-presets__buttons">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => {
                setGraph(preset.graph);
                setSelectedVertex(preset.selected);
                setPresetNote(preset.note);
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <p className="seymour-note">{presetNote}</p>
      </section>

      <div className="seymour-workspace">
        <section className="panel seymour-graph" aria-labelledby="seymour-graph-title">
          <div className="seymour-panel-heading">
            <h3 id="seymour-graph-title">Follow the arrows</h3>
            <label>
              Vertices{" "}
              <select
                aria-label="Vertices"
                value={graph.vertexCount}
                onChange={(event) => changeCount(Number(event.target.value))}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <svg
            viewBox="0 0 600 440"
            className="seymour-canvas"
            role="group"
            aria-label={`Oriented graph with ${graph.vertexCount} vertices and ${graph.edges.length} arrows. Select a vertex to inspect its neighbors.`}
          >
            <title>Editable oriented graph</title>
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {graph.edges.map((edge) => {
              const from = positions[edge.from]!;
              const to = positions[edge.to]!;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const length = Math.hypot(dx, dy);
              return (
                <line
                  key={`${edge.from}:${edge.to}`}
                  x1={from.x + (dx * 29) / length}
                  y1={from.y + (dy * 29) / length}
                  x2={to.x - (dx * 32) / length}
                  y2={to.y - (dy * 32) / length}
                  className={
                    edge.from === selectedVertex
                      ? "seymour-edge seymour-edge--first"
                      : selected.firstNeighbors.includes(edge.from) &&
                          selected.secondNeighbors.includes(edge.to)
                        ? "seymour-edge seymour-edge--second"
                        : "seymour-edge"
                  }
                  markerEnd={`url(#${markerId})`}
                />
              );
            })}
            {positions.map((position, vertex) => {
              const kind =
                vertex === selectedVertex
                  ? "selected"
                  : selected.firstNeighbors.includes(vertex)
                    ? "first"
                    : selected.secondNeighbors.includes(vertex)
                      ? "second"
                      : "other";
              const label =
                vertex === selectedVertex
                  ? "selected vertex"
                  : kind === "first"
                    ? "first neighbor"
                    : kind === "second"
                      ? "second neighbor"
                      : "outside both neighborhoods";
              return (
                <g
                  key={vertex}
                  transform={`translate(${position.x} ${position.y})`}
                  className={`seymour-vertex seymour-vertex--${kind}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={vertex === selectedVertex}
                  aria-label={`Vertex ${vertex}, ${label}`}
                  onClick={() => setSelectedVertex(vertex)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedVertex(vertex);
                    }
                  }}
                >
                  <circle r="25" />
                  <text textAnchor="middle" dy=".35em">
                    {vertex}
                  </text>
                  {evaluation.goodVertices.includes(vertex) ? (
                    <text className="seymour-vertex-check" textAnchor="middle" y="43">
                      ✓ qualifies
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <ul className="seymour-legend" aria-label="Graph legend">
            <li>
              <span className="seymour-dot seymour-dot--selected" />
              Selected vertex
            </li>
            <li>
              <span className="seymour-dot seymour-dot--first" />
              First neighbors
            </li>
            <li>
              <span className="seymour-dot seymour-dot--second" />
              Second neighbors
            </li>
          </ul>
          <p className="seymour-small">
            Arrows show direction. A check beneath a vertex means its second count is at least its
            first count.
          </p>
        </section>

        <section
          className="panel seymour-neighborhood"
          aria-labelledby="seymour-neighborhood-title"
        >
          <div className="seymour-panel-heading">
            <h3 id="seymour-neighborhood-title">Inspect a vertex</h3>
            <label>
              Vertex{" "}
              <select
                aria-label="Vertex"
                value={selectedVertex}
                onChange={(event) => setSelectedVertex(Number(event.target.value))}
              >
                {evaluation.vertices.map((v) => (
                  <option key={v.vertex} value={v.vertex}>
                    {v.vertex}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="seymour-counts" aria-live="polite" aria-atomic="true">
            <div className="seymour-count seymour-count--first">
              <strong>{selected.firstNeighbors.length}</strong>
              <span>First neighbors</span>
              <code>{vertexSet(selected.firstNeighbors)}</code>
            </div>
            <span
              className="seymour-comparator"
              aria-label={selected.goodVertex ? "less than or equal to" : "greater than"}
            >
              {selected.goodVertex ? "≤" : ">"}
            </span>
            <div className="seymour-count seymour-count--second">
              <strong>{selected.secondNeighbors.length}</strong>
              <span>Second neighbors</span>
              <code>{vertexSet(selected.secondNeighbors)}</code>
            </div>
            <p className={`seymour-result ${selected.goodVertex ? "seymour-result--good" : ""}`}>
              Vertex {selectedVertex} {selected.goodVertex ? "qualifies" : "does not qualify"} in
              this graph.
            </p>
          </div>
          <dl className="seymour-definitions">
            <dt>First neighbors</dt>
            <dd>Vertices reached by one outgoing arrow from the selected vertex.</dd>
            <dt>Second neighbors</dt>
            <dd>
              Vertices reached in two steps, excluding the starting vertex and all first neighbors.
              Each destination counts once, even if several paths reach it.
            </dd>
          </dl>
          <h4>Every vertex in this graph</h4>
          <table className="seymour-table">
            <thead>
              <tr>
                <th scope="col">Vertex</th>
                <th scope="col">First</th>
                <th scope="col">Second</th>
                <th scope="col">Qualifies?</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.vertices.map((v) => (
                <tr
                  key={v.vertex}
                  className={v.vertex === selectedVertex ? "seymour-row--selected" : ""}
                >
                  <th scope="row">
                    <button
                      type="button"
                      onClick={() => setSelectedVertex(v.vertex)}
                      aria-label={`Inspect vertex ${v.vertex}`}
                      aria-pressed={v.vertex === selectedVertex}
                    >
                      {v.vertex}
                    </button>
                  </th>
                  <td>{v.firstNeighbors.length}</td>
                  <td>{v.secondNeighbors.length}</td>
                  <td>{v.goodVertex ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel seymour-editor" aria-labelledby="seymour-editor-title">
        <div className="seymour-panel-heading">
          <h3 id="seymour-editor-title">Change the arrows</h3>
          <button type="button" onClick={() => saveExample(graph, selectedVertex)}>
            Save this example
          </button>
        </div>
        <p>
          Each button cycles through no arrow, the forward arrow, the reverse arrow, then no arrow.
          The graph always has no loops and at most one direction between each pair.
        </p>
        <div className="seymour-pairs">
          {pairs.map(({ from, to }) => {
            const forward = graph.edges.some((edge) => edge.from === from && edge.to === to);
            const reverse = graph.edges.some((edge) => edge.from === to && edge.to === from);
            const label = forward
              ? `${from} → ${to}`
              : reverse
                ? `${to} → ${from}`
                : `${from} · ${to}`;
            const next = forward ? `${to} to ${from}` : reverse ? "no arrow" : `${from} to ${to}`;
            return (
              <button
                key={`${from}:${to}`}
                type="button"
                className={forward || reverse ? "seymour-pair--active" : ""}
                aria-label={`Pair ${from} and ${to}: ${forward ? `arrow ${from} to ${to}` : reverse ? `arrow ${to} to ${from}` : "no arrow"}. Change to ${next}.`}
                onClick={() => {
                  setGraph((current) => cycleOrientedEdge(current, from, to));
                  setPresetNote(
                    "Your edited graph. Select a vertex to inspect its two neighborhoods.",
                  );
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {pairs.length === 0 ? (
          <p className="seymour-small">
            One vertex has no possible arrows. It qualifies with two empty neighborhoods.
          </p>
        ) : null}
      </section>

      <details className="seymour-evidence">
        <summary>Released statement, source, and what has been checked</summary>
        <p>
          The released statement asks for a qualifying vertex in every finite, nonempty oriented
          graph. A sink qualifies because both neighborhood sizes are zero.
        </p>
        <p>
          ProofLens follows the exact <a href={SEYMOUR_SOURCE.challengeUrl}>released definitions</a>{" "}
          and <a href={SEYMOUR_SOURCE.scopeUrl}>formalization scope</a>. The challenge declaration
          contains <code>sorry</code>; it supplies a statement rather than a completed proof. This
          demo has not checked the separate released solution.
        </p>
        <pre className="seymour-source">{`secondNeighbors r v := { w | w ≠ v ∧ ¬ r v w ∧ ∃ u, r v u ∧ r u w }\nGoodVertex r v := |firstNeighbors r v| ≤ |secondNeighbors r v|\n\n∀ finite nonempty oriented graphs r, ∃ v, GoodVertex r v`}</pre>
        <p>
          Definitions checked in Lean; browser calculations tested against an independent oracle.
          The oracle covers all 59,809 oriented graphs with one to five vertices. These checks
          support the example calculations and do not establish the general theorem.
        </p>
        <p className="seymour-small">
          The companion Lean check uses Lean 4.24.0. OpenAI’s repository pins 4.34.1; that native
          environment has not been reproduced here. The explorer allows up to eight vertices for
          readability.
        </p>
        <dl className="seymour-provenance">
          <dt>Source commit</dt>
          <dd>
            <a href={`${SEYMOUR_SOURCE.repositoryUrl}/commit/${SEYMOUR_SOURCE.commit}`}>
              <code>{SEYMOUR_SOURCE.commit}</code>
            </a>
          </dd>
          <dt>Source SHA-256</dt>
          <dd>
            <code>{SEYMOUR_SOURCE.sourceSha256}</code>
          </dd>
        </dl>
      </details>
    </main>
  );
}
