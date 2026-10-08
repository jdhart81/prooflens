import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cycleOrientedEdge,
  evaluateSeymourGraph,
  MAX_SEYMOUR_VERTICES,
  SEYMOUR_SOURCE,
  validateOrientedGraph,
  type OrientedEdge,
  type OrientedGraph,
} from "@prooflens/visual-ir";

function graph(vertexCount: number, pairs: readonly (readonly [number, number])[]): OrientedGraph {
  return { vertexCount, edges: pairs.map(([from, to]) => ({ from, to })) };
}

/**
 * An independent oracle computes shortest distances with breadth-first search.
 * It does not reuse the model's two-edge path enumeration or neighbor functions.
 * In a loopless oriented graph the upstream excluded-endpoint definition of N2
 * is equivalent to shortest directed distance exactly two.
 */
function distanceOracle(input: OrientedGraph, start: number) {
  const adjacency = Array.from({ length: input.vertexCount }, () => [] as number[]);
  for (const edge of input.edges) adjacency[edge.from]!.push(edge.to);
  const distance = Array<number>(input.vertexCount).fill(Infinity);
  distance[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    for (const next of adjacency[current]!) {
      if (distance[next] !== Infinity) continue;
      distance[next] = distance[current]! + 1;
      queue.push(next);
    }
  }
  return {
    firstNeighbors: distance.flatMap((d, vertex) => (d === 1 ? [vertex] : [])),
    secondNeighbors: distance.flatMap((d, vertex) => (d === 2 ? [vertex] : [])),
  };
}

describe("Seymour finite graph example model", () => {
  it("uses the exact pinned upstream source bytes and labels the challenge placeholder", () => {
    const bytes = readFileSync(
      new URL(
        "../../../examples/openai-math/seymour/ComparatorChallenges/SeymourSecondNeighborhood.lean",
        import.meta.url,
      ),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SEYMOUR_SOURCE.sourceSha256);
    expect(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")).toBe(
      SEYMOUR_SOURCE.blobSha,
    );
    expect(SEYMOUR_SOURCE.challengeUrl).toContain(`/blob/${SEYMOUR_SOURCE.commit}/`);
    expect(SEYMOUR_SOURCE.statementIsPlaceholder).toBe(true);
    expect(bytes.toString()).toMatch(/theorem exists_goodVertex[\s\S]*?:= by\s+sorry/);
  });

  it("includes isolated vertices and accepts sinks with zero first and second neighbors", () => {
    const result = evaluateSeymourGraph(
      graph(3, [
        [0, 1],
        [1, 2],
      ]),
    );
    expect(result.vertices[2]).toEqual({
      vertex: 2,
      firstNeighbors: [],
      secondNeighbors: [],
      goodVertex: true,
    });
    expect(result.goodVertices).toEqual([0, 2]);
    expect(evaluateSeymourGraph(graph(1, [])).goodVertices).toEqual([0]);
    expect(evaluateSeymourGraph(graph(MAX_SEYMOUR_VERTICES, [])).goodVertices).toHaveLength(
      MAX_SEYMOUR_VERTICES,
    );
  });

  it("computes one and two neighborhoods in a directed cycle", () => {
    const result = evaluateSeymourGraph(
      graph(3, [
        [0, 1],
        [1, 2],
        [2, 0],
      ]),
    );
    expect(result.vertices).toEqual([
      { vertex: 0, firstNeighbors: [1], secondNeighbors: [2], goodVertex: true },
      { vertex: 1, firstNeighbors: [2], secondNeighbors: [0], goodVertex: true },
      { vertex: 2, firstNeighbors: [0], secondNeighbors: [1], goodVertex: true },
    ]);
  });

  it("counts an endpoint once when several length-two paths reach it", () => {
    const result = evaluateSeymourGraph(
      graph(4, [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
      ]),
    );
    expect(result.vertices[0]).toEqual({
      vertex: 0,
      firstNeighbors: [1, 2],
      secondNeighbors: [3],
      goodVertex: false,
    });
  });

  it("excludes direct neighbors from N2 even when reached by a two-edge path", () => {
    const result = evaluateSeymourGraph(
      graph(4, [
        [0, 1],
        [0, 2],
        [1, 2],
        [1, 3],
      ]),
    );
    expect(result.vertices[0]).toEqual({
      vertex: 0,
      firstNeighbors: [1, 2],
      secondNeighbors: [3],
      goodVertex: false,
    });
    expect(
      evaluateSeymourGraph(
        graph(3, [
          [0, 1],
          [1, 2],
          [0, 2],
        ]),
      ).vertices[0]?.secondNeighbors,
    ).toEqual([]);
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, MAX_SEYMOUR_VERTICES + 1])(
    "rejects invalid vertex count %s before evaluating",
    (vertexCount) => {
      const input = graph(vertexCount, []);
      expect(validateOrientedGraph(input).length).toBeGreaterThan(0);
      expect(() => evaluateSeymourGraph(input)).toThrow(RangeError);
    },
  );

  it.each([-1, 3, 0.5, NaN, Infinity, -Infinity])(
    "rejects invalid edge endpoint %s in either position",
    (endpoint) => {
      for (const pair of [
        [endpoint, 0],
        [0, endpoint],
      ] as const) {
        const input = graph(3, [pair]);
        expect(validateOrientedGraph(input).length).toBeGreaterThan(0);
        expect(() => evaluateSeymourGraph(input)).toThrow(RangeError);
      }
    },
  );

  it.each([
    { name: "loops", pairs: [[0, 0]] },
    {
      name: "opposite edge pairs",
      pairs: [
        [0, 1],
        [1, 0],
      ],
    },
    {
      name: "duplicate edges",
      pairs: [
        [0, 1],
        [0, 1],
      ],
    },
  ] as const)("rejects $name", ({ pairs }) => {
    const input = graph(3, pairs);
    expect(validateOrientedGraph(input).length).toBeGreaterThan(0);
    expect(() => evaluateSeymourGraph(input)).toThrow(RangeError);
  });

  it("rejects malformed runtime edge containers and nonnumeric endpoints", () => {
    for (const input of [
      { vertexCount: "3", edges: [] },
      { vertexCount: 3, edges: null },
      { vertexCount: 3, edges: [{ from: "0", to: 1 }] },
      { vertexCount: 3, edges: [null] },
    ]) {
      expect(validateOrientedGraph(input as unknown as OrientedGraph).length).toBeGreaterThan(0);
      expect(() => evaluateSeymourGraph(input as unknown as OrientedGraph)).toThrow(RangeError);
    }
  });

  it("cycles edges immutably and preserves the oriented assumptions", () => {
    const initial = Object.freeze({
      vertexCount: 3,
      edges: Object.freeze([Object.freeze({ from: 1, to: 2 })]),
    });
    const forward = cycleOrientedEdge(initial, 0, 1);
    const reverse = cycleOrientedEdge(forward, 0, 1);
    const absent = cycleOrientedEdge(reverse, 0, 1);
    expect(initial.edges).toEqual([{ from: 1, to: 2 }]);
    expect(forward.edges).toEqual([
      { from: 1, to: 2 },
      { from: 0, to: 1 },
    ]);
    expect(reverse.edges).toEqual([
      { from: 1, to: 2 },
      { from: 1, to: 0 },
    ]);
    expect(absent.edges).toEqual(initial.edges);
    for (const input of [initial, forward, reverse, absent]) {
      expect(validateOrientedGraph(input)).toEqual([]);
    }
    expect(() => cycleOrientedEdge(initial, 0, 0)).toThrow(RangeError);
    expect(() => cycleOrientedEdge(initial, -1, 1)).toThrow(RangeError);
    expect(() => cycleOrientedEdge(initial, 0, 3)).toThrow(RangeError);
    expect(() => cycleOrientedEdge(initial, 0, NaN)).toThrow(RangeError);
    expect(() =>
      cycleOrientedEdge(
        graph(3, [
          [0, 1],
          [1, 0],
        ]),
        0,
        1,
      ),
    ).toThrow(RangeError);
  });

  it("agrees with a shortest-distance oracle on every oriented graph up to five vertices", () => {
    let checkedGraphs = 0;
    let checkedVertices = 0;
    for (let vertexCount = 1; vertexCount <= 5; vertexCount++) {
      const pairs: [number, number][] = [];
      for (let from = 0; from < vertexCount; from++) {
        for (let to = from + 1; to < vertexCount; to++) pairs.push([from, to]);
      }
      for (let code = 0; code < 3 ** pairs.length; code++) {
        let remaining = code;
        const edges: OrientedEdge[] = [];
        for (const [from, to] of pairs) {
          const direction = remaining % 3;
          remaining = Math.floor(remaining / 3);
          if (direction === 1) edges.push({ from, to });
          else if (direction === 2) edges.push({ from: to, to: from });
        }
        const input = { vertexCount, edges };
        const actual = evaluateSeymourGraph(input);
        const expectedGood: number[] = [];
        for (let vertex = 0; vertex < vertexCount; vertex++) {
          const expected = distanceOracle(input, vertex);
          const goodVertex = expected.firstNeighbors.length <= expected.secondNeighbors.length;
          if (goodVertex) expectedGood.push(vertex);
          const result = actual.vertices[vertex]!;
          // One assertion after the enumeration would lose the failing graph.
          // Report its exact code and source vertex if the independent oracle differs.
          if (
            JSON.stringify(result.firstNeighbors) !== JSON.stringify(expected.firstNeighbors) ||
            JSON.stringify(result.secondNeighbors) !== JSON.stringify(expected.secondNeighbors) ||
            result.goodVertex !== goodVertex
          ) {
            throw new Error(
              `Oracle mismatch: vertexCount=${vertexCount}, graph=${code}, vertex=${vertex}`,
            );
          }
          checkedVertices++;
        }
        if (JSON.stringify(actual.goodVertices) !== JSON.stringify(expectedGood)) {
          throw new Error(`Good-vertex mismatch: vertexCount=${vertexCount}, graph=${code}`);
        }
        checkedGraphs++;
      }
    }
    expect(checkedGraphs).toBe(59_809);
    expect(checkedVertices).toBe(298_249);
  }, 30_000);
});
