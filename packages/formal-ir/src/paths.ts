import type { FormalExprNode } from "./schema.js";

/**
 * Structural paths into an expression tree.
 *
 * A path such as `conclusion.args[3].args[4]` is what lets a visual element
 * point back at the precise subterm that justified it. Provenance is only as
 * good as its addressing scheme, so paths are stable and human-readable.
 */
export function childPath(base: string, segment: string): string {
  return base === "" ? segment : `${base}.${segment}`;
}

export function argPath(base: string, index: number): string {
  return `${base}.args[${index}]`;
}

/** Resolve a path produced by {@link argPath}/{@link childPath} back to a node. */
export function resolvePath(root: FormalExprNode, path: string): FormalExprNode | undefined {
  const segments = path.split(".").filter((s) => s.length > 0);
  let node: FormalExprNode | undefined = root;
  for (const segment of segments) {
    if (node === undefined) return undefined;
    const argMatch = /^args\[(\d+)\]$/.exec(segment);
    if (argMatch) {
      if (node.kind !== "app") return undefined;
      node = node.args[Number(argMatch[1])];
      continue;
    }
    switch (segment) {
      case "fn":
        node = node.kind === "app" ? node.fn : undefined;
        break;
      case "body":
        node =
          node.kind === "lam" || node.kind === "forall" || node.kind === "let"
            ? node.body
            : undefined;
        break;
      case "binderType":
        node =
          node.kind === "lam" || node.kind === "forall" || node.kind === "let"
            ? node.binderType
            : undefined;
        break;
      case "struct":
        node = node.kind === "proj" ? node.struct : undefined;
        break;
      default:
        // A leading `conclusion`/`statement`/`binders[i].type` segment addresses
        // the tree we were handed, so it is a no-op here.
        break;
    }
  }
  return node;
}

/** Head constant of an application, or of a bare constant. */
export function headConstant(node: FormalExprNode): string | undefined {
  if (node.kind === "const") return node.name;
  if (node.kind === "app" && node.fn.kind === "const") return node.fn.name;
  return undefined;
}

/** Walk every node in the tree, depth first. */
export function* walk(node: FormalExprNode): Generator<FormalExprNode> {
  yield node;
  switch (node.kind) {
    case "app":
      yield* walk(node.fn);
      for (const a of node.args) yield* walk(a);
      break;
    case "lam":
    case "forall":
      yield* walk(node.binderType);
      yield* walk(node.body);
      break;
    case "let":
      yield* walk(node.binderType);
      yield* walk(node.value);
      yield* walk(node.body);
      break;
    case "proj":
      yield* walk(node.struct);
      break;
    default:
      break;
  }
}

/** Count nodes — a cheap proxy for "how complicated is this statement". */
export function size(node: FormalExprNode): number {
  let n = 0;
  for (const child of walk(node)) {
    void child;
    n += 1;
  }
  return n;
}
