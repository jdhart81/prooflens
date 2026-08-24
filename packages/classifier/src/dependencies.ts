import { derive, type Claim } from "@prooflens/epistemics";
import { localDependencyEdges, type FormalIRDocument } from "@prooflens/formal-ir";
import { RULES } from "./rules.js";

export interface DependencyNode {
  id: string;
  label: string;
  kind: string;
  /** Longest path from a node with no local dependencies. Used for layout. */
  depth: number;
  concept: string | null;
}

export interface DependencyEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  /**
   * Dependencies on declarations outside the extracted modules — mathlib
   * lemmas, mostly. Reported so the UI can say the graph is local rather than
   * implying it is the whole proof.
   */
  externalDependencyCount: number;
}

/**
 * Build the local dependency graph.
 *
 * Edges point from a declaration to the declarations its proof term uses. Only
 * declarations present in the same extraction are included; see
 * `externalDependencyCount` for what was left out.
 */
export function dependencyGraph(doc: FormalIRDocument): Claim<DependencyGraph> {
  const { edges, externalCount } = localDependencyEdges(doc);

  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    const list = outgoing.get(e.from) ?? [];
    list.push(e.to);
    outgoing.set(e.from, list);
  }

  // Depth = length of the longest chain of local dependencies below a node.
  const depthCache = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // defensive: Lean cannot produce cycles here
    visiting.add(id);
    const deps = outgoing.get(id) ?? [];
    const depth = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depthOf));
    visiting.delete(id);
    depthCache.set(id, depth);
    return depth;
  };

  const nodes: DependencyNode[] = doc.declarations.map((d) => ({
    id: d.name,
    label: d.name.split(".").pop() ?? d.name,
    kind: d.kind,
    depth: depthOf(d.name),
    concept: null,
  }));

  const graph: DependencyGraph = { nodes, edges, externalDependencyCount: externalCount };

  return derive(graph, RULES.DEPENDENCY_GRAPH, [], {
    sources: doc.declarations.map((d) => ({
      system: doc.system,
      declaration: d.name,
      module: d.source?.module ?? null,
    })),
    note: "Edges are the constants each proof term actually references. Dependencies on declarations outside the extracted modules are counted, not drawn.",
  });
}

/** Restrict the graph to a declaration and everything it transitively uses. */
export function subgraphFor(graph: DependencyGraph, root: string): DependencyGraph {
  const keep = new Set<string>();
  const stack = [root];
  const adjacency = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (keep.has(id)) continue;
    keep.add(id);
    for (const next of adjacency.get(id) ?? []) stack.push(next);
  }
  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    externalDependencyCount: graph.externalDependencyCount,
  };
}
