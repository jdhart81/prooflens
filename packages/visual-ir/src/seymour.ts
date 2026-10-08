/**
 * A finite, editable model of the pinned Seymour challenge definitions.
 *
 * The model evaluates examples. It does not verify the challenge theorem or a
 * released solution proof; the upstream challenge statement contains `sorry`.
 */
export interface OrientedEdge {
  readonly from: number;
  readonly to: number;
}

/** Vertex identifiers are exactly the integers 0, ..., vertexCount - 1. */
export interface OrientedGraph {
  readonly vertexCount: number;
  readonly edges: readonly OrientedEdge[];
}

export interface SeymourVertexNeighborhood {
  readonly vertex: number;
  readonly firstNeighbors: readonly number[];
  readonly secondNeighbors: readonly number[];
  readonly goodVertex: boolean;
}

export interface SeymourGraphEvaluation {
  readonly vertices: readonly SeymourVertexNeighborhood[];
  readonly goodVertices: readonly number[];
}

/** A product limit for this example explorer, not a theorem assumption. */
export const MAX_SEYMOUR_VERTICES = 12;

export const SEYMOUR_SOURCE = Object.freeze({
  repositoryUrl: "https://github.com/openai/math",
  commit: "adc7f1241b42e322a6451854ab7e4b4c146bf78a",
  path: "lean/ComparatorChallenges/SeymourSecondNeighborhood.lean",
  challengeUrl:
    "https://github.com/openai/math/blob/adc7f1241b42e322a6451854ab7e4b4c146bf78a/lean/ComparatorChallenges/SeymourSecondNeighborhood.lean",
  scopeUrl:
    "https://github.com/openai/math/blob/adc7f1241b42e322a6451854ab7e4b4c146bf78a/lean/docs/173.md",
  blobSha: "70d287c3f831d0698352b144d39cdf29cac6c24b",
  sourceSha256: "fa4a37831405b3fe7f6a88a2dce8918982195ee1757e05e4623055822d36ca98",
  firstNeighbors: "OAI.SeymourSecondNeighborhood.firstNeighbors",
  secondNeighbors: "OAI.SeymourSecondNeighborhood.secondNeighbors",
  goodVertex: "OAI.SeymourSecondNeighborhood.GoodVertex",
  statementName: "OAI.SeymourSecondNeighborhood.exists_goodVertex",
  statementIsPlaceholder: true,
});

function validVertex(vertex: number, vertexCount: number): boolean {
  return Number.isInteger(vertex) && vertex >= 0 && vertex < vertexCount;
}

/** Check the finite nonempty universe and the upstream IsOriented assumptions. */
export function validateOrientedGraph(graph: OrientedGraph): readonly string[] {
  const issues: string[] = [];
  if (
    !Number.isInteger(graph.vertexCount) ||
    graph.vertexCount < 1 ||
    graph.vertexCount > MAX_SEYMOUR_VERTICES
  ) {
    issues.push(`Choose an integer vertex count between 1 and ${MAX_SEYMOUR_VERTICES}.`);
  }
  if (!Array.isArray(graph.edges)) {
    issues.push("Provide the edges as an array.");
    return Object.freeze(issues);
  }
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (
      !edge ||
      !validVertex(edge.from, graph.vertexCount) ||
      !validVertex(edge.to, graph.vertexCount)
    ) {
      issues.push("Every edge endpoint must be an integer in the vertex universe.");
      continue;
    }
    if (edge.from === edge.to) issues.push("An oriented graph cannot contain a loop.");
    const key = `${edge.from}:${edge.to}`;
    if (seen.has(key)) issues.push("Each directed edge must appear only once.");
    if (seen.has(`${edge.to}:${edge.from}`) && edge.from !== edge.to) {
      issues.push("An oriented graph cannot contain both directions of the same edge.");
    }
    seen.add(key);
  }
  return Object.freeze(issues);
}

function assertOrientedGraph(graph: OrientedGraph): void {
  const issues = validateOrientedGraph(graph);
  if (issues.length > 0) throw new RangeError(issues.join(" "));
}

/**
 * N1(v) = {w | r(v,w)}.
 * N2(v) = {w | w != v, not r(v,w), and exists u, r(v,u) and r(u,w)}.
 *
 * Endpoints are sets: multiple length-two paths contribute only one neighbor.
 * The ascending vertex order is for a stable presentation, not source semantics.
 */
export function evaluateSeymourGraph(graph: OrientedGraph): SeymourGraphEvaluation {
  assertOrientedGraph(graph);
  const outgoing = Array.from({ length: graph.vertexCount }, () => new Set<number>());
  for (const edge of graph.edges) outgoing[edge.from]!.add(edge.to);
  const vertices = outgoing.map((first, vertex): SeymourVertexNeighborhood => {
    const second = new Set<number>();
    for (const intermediate of first) {
      for (const endpoint of outgoing[intermediate]!) {
        if (endpoint !== vertex && !first.has(endpoint)) second.add(endpoint);
      }
    }
    const firstNeighbors = Object.freeze([...first].sort((a, b) => a - b));
    const secondNeighbors = Object.freeze([...second].sort((a, b) => a - b));
    return Object.freeze({
      vertex,
      firstNeighbors,
      secondNeighbors,
      goodVertex: firstNeighbors.length <= secondNeighbors.length,
    });
  });
  return Object.freeze({
    vertices: Object.freeze(vertices),
    goodVertices: Object.freeze(
      vertices.filter((vertex) => vertex.goodVertex).map((v) => v.vertex),
    ),
  });
}

/**
 * Cycle one unordered pair: absent -> from-to -> to-from -> absent.
 * Neither the graph nor existing edge objects are mutated.
 */
export function cycleOrientedEdge(graph: OrientedGraph, from: number, to: number): OrientedGraph {
  assertOrientedGraph(graph);
  if (!validVertex(from, graph.vertexCount) || !validVertex(to, graph.vertexCount) || from === to) {
    throw new RangeError("Choose two distinct vertices in the vertex universe.");
  }
  const forward = graph.edges.some((edge) => edge.from === from && edge.to === to);
  const reverse = graph.edges.some((edge) => edge.from === to && edge.to === from);
  const edges = graph.edges
    .filter(
      (edge) => !((edge.from === from && edge.to === to) || (edge.from === to && edge.to === from)),
    )
    .map((edge) => Object.freeze({ from: edge.from, to: edge.to }));
  if (forward) edges.push(Object.freeze({ from: to, to: from }));
  else if (!reverse) edges.push(Object.freeze({ from, to }));
  return Object.freeze({ vertexCount: graph.vertexCount, edges: Object.freeze(edges) });
}
