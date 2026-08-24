import {
  derive,
  transcribe,
  unusualAxioms,
  type Claim,
  type EpistemicStatus,
  type Rule,
} from "@prooflens/epistemics";
import {
  argPath,
  headConstant,
  kernelWitness,
  sourceRefFor,
  type FormalDeclaration,
  type FormalExprNode,
  type FormalIRDocument,
} from "@prooflens/formal-ir";
import { annotationFor, parseDocstring } from "./annotations.js";
import {
  BINARY_OPERATORS,
  NAMED_FUNCTIONS,
  PREDICATES,
  RELATIONS,
  TRANSPARENT,
  UNARY_OPERATORS,
} from "./tables.js";
import { renderExpression, renderProposition } from "./render.js";
import {
  MATH_IR_VERSION,
  type MathExpression,
  type MathHypothesis,
  type MathIRDocument,
  type MathProposition,
  type MathVariable,
  type TheoremIR,
} from "./types.js";

/** Rules this module can cite. Rule ids are public API. */
export const MATH_IR_RULES = {
  lowerExpression: {
    id: "MATHIR_LOWER_EXPR_001",
    description:
      "Lean constants were mapped to mathematical operators using ProofLens's constant table.",
    produces: "derived",
  } satisfies Rule,
  lowerProposition: {
    id: "MATHIR_LOWER_PROP_001",
    description:
      "The conclusion's head constant was recognised as a relation, predicate, or implication.",
    produces: "derived",
  } satisfies Rule,
  unrecognised: {
    id: "MATHIR_UNRECOGNISED_001",
    description:
      "The head constant is not in ProofLens's table, so the structure is preserved but not named.",
    produces: "derived",
  } satisfies Rule,
} as const;

// ---------------------------------------------------------------------------
// Helpers over the raw tree
// ---------------------------------------------------------------------------

/** Does the subtree reference de Bruijn variable `index` (relative to here)? */
function mentionsBVar(node: FormalExprNode, index: number): boolean {
  switch (node.kind) {
    case "bvar":
      return node.index === index;
    case "app":
      return mentionsBVar(node.fn, index) || node.args.some((a) => mentionsBVar(a, index));
    case "lam":
    case "forall":
      return mentionsBVar(node.binderType, index) || mentionsBVar(node.body, index + 1);
    case "let":
      return (
        mentionsBVar(node.binderType, index) ||
        mentionsBVar(node.value, index) ||
        mentionsBVar(node.body, index + 1)
      );
    case "proj":
      return mentionsBVar(node.struct, index);
    default:
      return false;
  }
}

/** Looks like a carrier type or a typeclass instance rather than mathematics. */
function isPlumbing(node: FormalExprNode): boolean {
  if (node.kind === "const") return true;
  if (node.kind === "sort") return true;
  if (node.kind === "app") {
    const head = headConstant(node);
    if (head === undefined) return false;
    const last = head.split(".").pop() ?? head;
    return /^inst/i.test(last) || /^inst/i.test(head) || /to[A-Z]/.test(last);
  }
  return false;
}

/**
 * Drop the leading type and instance arguments Lean threads through every
 * operation, keeping the arguments that carry mathematics.
 */
function mathematicalArgs(args: FormalExprNode[]): { args: FormalExprNode[]; offset: number } {
  let i = 0;
  while (i < args.length && isPlumbing(args[i]!)) i += 1;
  return { args: args.slice(i), offset: i };
}

function shortName(name: string): string {
  return name.split(".").pop() ?? name;
}

// ---------------------------------------------------------------------------
// Expression lowering
// ---------------------------------------------------------------------------

/**
 * Render a term ProofLens could not name.
 *
 * The head stays unrecognised — that is the whole point of `opaque` — but the
 * arguments are lowered normally, so an unsupported theorem still shows the
 * mathematics a reader can follow instead of a wall of elaborator plumbing.
 */
function opaqueDisplay(node: FormalExprNode, path: string, scope: string[]): string {
  switch (node.kind) {
    case "const":
      return shortName(node.name);
    case "fvar":
      return node.name;
    case "bvar":
      return scope[scope.length - 1 - node.index] ?? `#${node.index}`;
    case "lit":
      return String(node.value);
    case "sort":
      return "Type";
    case "mvar":
      return "?m";
    case "lam":
      return `${node.binderName} ↦ ${renderExpression(
        lowerExpression(node.body, `${path}.body`, [...scope, node.binderName]),
      )}`;
    case "forall":
      return `∀ ${node.binderName}, ${opaqueDisplay(node.body, `${path}.body`, [
        ...scope,
        node.binderName,
      ])}`;
    case "let":
      return `let ${node.binderName} := …`;
    case "proj":
      return `${opaqueDisplay(node.struct, `${path}.struct`, scope)}.${node.index}`;
    case "app": {
      const head = headConstant(node);
      const { args, offset } = mathematicalArgs(node.args);
      const rendered = args.map((a, i) =>
        renderExpression(lowerExpression(a, argPath(path, offset + i), scope)),
      );
      const name = head ? shortName(head) : opaqueDisplay(node.fn, `${path}.fn`, scope);
      return rendered.length === 0 ? name : `${name}(${rendered.join(", ")})`;
    }
  }
}

/**
 * Lower a Lean expression into MathIR.
 *
 * Anything the constant tables do not recognise becomes `opaque`: the structure
 * survives, the arity survives, and ProofLens declines to say what it means.
 */
export function lowerExpression(
  node: FormalExprNode,
  path: string,
  scope: string[] = [],
): MathExpression {
  switch (node.kind) {
    case "fvar":
      return { kind: "variable", id: node.fvarId, symbol: node.name, path };
    case "bvar": {
      const symbol = scope[scope.length - 1 - node.index] ?? `#${node.index}`;
      return { kind: "variable", id: `bound:${symbol}`, symbol, path };
    }
    case "lit":
      return typeof node.value === "number"
        ? { kind: "number", value: node.value, display: String(node.value), path }
        : { kind: "constant", name: "string", display: JSON.stringify(node.value), path };
    case "const":
      return { kind: "constant", name: node.name, display: shortName(node.name), path };
    case "lam":
      return {
        kind: "lambda",
        parameter: node.binderName,
        body: lowerExpression(node.body, `${path}.body`, [...scope, node.binderName]),
        path,
      };
    case "app": {
      const head = headConstant(node);
      if (head !== undefined) {
        const transparent = TRANSPARENT[head];
        if (transparent) {
          const idx = transparent.argIndex === -1 ? node.args.length - 1 : transparent.argIndex;
          const inner = node.args[idx];
          if (inner) return lowerExpression(inner, argPath(path, idx), scope);
        }

        const binary = BINARY_OPERATORS[head];
        if (binary && node.args.length >= binary.valueArity) {
          const start = node.args.length - binary.valueArity;
          return {
            kind: "operator",
            op: binary.op,
            symbol: binary.symbol,
            args: node.args
              .slice(start)
              .map((a, i) => lowerExpression(a, argPath(path, start + i), scope)),
            path,
          };
        }

        const unary = UNARY_OPERATORS[head];
        if (unary && node.args.length >= unary.valueArity) {
          const start = node.args.length - unary.valueArity;
          return {
            kind: "operator",
            op: unary.op,
            symbol: unary.symbol,
            args: node.args
              .slice(start)
              .map((a, i) => lowerExpression(a, argPath(path, start + i), scope)),
            path,
          };
        }

        const named = NAMED_FUNCTIONS[head];
        if (named && node.args.length >= named.valueArity) {
          const start = node.args.length - named.valueArity;
          return {
            kind: "application",
            head,
            display: named.display,
            args: node.args
              .slice(start)
              .map((a, i) => lowerExpression(a, argPath(path, start + i), scope)),
            path,
          };
        }
      }
      const { args } = mathematicalArgs(node.args);
      return {
        kind: "opaque",
        head: head ?? null,
        display: opaqueDisplay(node, path, scope),
        arity: args.length,
        path,
      };
    }
    default:
      return {
        kind: "opaque",
        head: null,
        display: opaqueDisplay(node, path, scope),
        arity: 0,
        path,
      };
  }
}

// ---------------------------------------------------------------------------
// Proposition lowering
// ---------------------------------------------------------------------------

export function lowerProposition(
  node: FormalExprNode,
  path: string,
  scope: string[] = [],
): MathProposition {
  if (node.kind === "forall") {
    // An arrow is a `forall` whose bound variable is never used.
    if (!mentionsBVar(node.body, 0)) {
      return {
        kind: "implication",
        antecedent: lowerProposition(node.binderType, `${path}.binderType`, scope),
        consequent: lowerProposition(node.body, `${path}.body`, [...scope, node.binderName]),
        path,
      };
    }
    return { kind: "opaque", head: null, display: opaqueDisplay(node, path, scope), path };
  }

  if (node.kind === "app") {
    const head = headConstant(node);
    if (head !== undefined) {
      const relation = RELATIONS[head];
      if (relation && node.args.length >= relation.valueArity) {
        const start = node.args.length - relation.valueArity;
        // `Iff` relates propositions, not values; keep it as a relation between
        // rendered propositions so the shape is still visible.
        if (head === "Iff") {
          const left = lowerProposition(node.args[start]!, argPath(path, start), scope);
          const right = lowerProposition(node.args[start + 1]!, argPath(path, start + 1), scope);
          return {
            kind: "relation",
            relation: "equivalent",
            lhs: {
              kind: "opaque",
              head: null,
              display: renderProposition(left),
              arity: 0,
              path: argPath(path, start),
            },
            rhs: {
              kind: "opaque",
              head: null,
              display: renderProposition(right),
              arity: 0,
              path: argPath(path, start + 1),
            },
            path,
          };
        }
        return {
          kind: "relation",
          relation: relation.relation,
          lhs: lowerExpression(node.args[start]!, argPath(path, start), scope),
          rhs: lowerExpression(node.args[start + 1]!, argPath(path, start + 1), scope),
          path,
        };
      }

      const predicate = PREDICATES[head];
      if (predicate && node.args.length >= predicate.valueArity) {
        const start = node.args.length - predicate.valueArity;
        const values = node.args
          .slice(start)
          .map((a, i) => lowerExpression(a, argPath(path, start + i), scope));
        return {
          kind: "predicate",
          predicate: predicate.predicate,
          name: shortName(head),
          subject: values[0] ?? null,
          args: values.slice(1),
          path,
        };
      }
    }
  }

  return {
    kind: "opaque",
    head: headConstant(node) ?? null,
    display: opaqueDisplay(node, path, scope),
    path,
  };
}

// ---------------------------------------------------------------------------
// Declaration lowering
// ---------------------------------------------------------------------------

/** Lower one Lean declaration into a `TheoremIR`. */
export function lowerDeclaration(doc: FormalIRDocument, decl: FormalDeclaration): TheoremIR {
  const witness = kernelWitness(doc, decl);
  const parsed = parseDocstring(decl.docstring);
  const ref = sourceRefFor(doc, decl);

  const statementClaim: Claim<string> = witness
    ? transcribe(witness, decl.statement.pretty, { sources: [ref] })
    : derive(decl.statement.pretty, MATH_IR_RULES.lowerProposition, [], { sources: [ref] });

  const variables: MathVariable[] = decl.binders
    .filter((b) => b.role === "parameter")
    .map((b) => ({
      id: b.fvarId,
      symbol: b.name,
      typeDisplay: b.type.pretty,
      binderInfo: b.binderInfo,
      annotation: annotationFor(parsed.annotations, b.name),
    }));

  const hypotheses: MathHypothesis[] = decl.binders
    .filter((b) => b.role === "hypothesis")
    .map((b) => {
      const proposition = lowerProposition(b.type.tree, `binders[${b.index}].type`);
      return {
        id: b.fvarId,
        symbol: b.name,
        proposition,
        display: renderProposition(proposition),
        usage: b.usage,
      };
    });

  const definitionBody = decl.definitionBody
    ? (() => {
        const expression = lowerExpression(decl.definitionBody!.tree, "definitionBody");
        return { expression, display: renderExpression(expression) };
      })()
    : null;

  const conclusionProp = lowerProposition(decl.conclusion.tree, "conclusion");
  const conclusion = derive<MathProposition>(
    conclusionProp,
    conclusionProp.kind === "opaque" ? MATH_IR_RULES.unrecognised : MATH_IR_RULES.lowerProposition,
    [statementClaim],
    { sources: [sourceRefFor(doc, decl, "conclusion")] },
  );

  const ceiling: EpistemicStatus = witness ? "verified" : "derived";

  return {
    id: decl.name,
    name: decl.name,
    namespace: decl.namespace,
    kind: decl.kind,
    documentation: parsed.prose,
    variables,
    hypotheses,
    conclusion,
    conclusionDisplay: renderProposition(conclusionProp),
    definitionBody,
    statementDisplay: decl.statement.pretty,
    dependencies: decl.dependencies,
    trust: {
      axioms: decl.axioms,
      unusualAxioms: unusualAxioms(decl.axioms),
      usesSorry: decl.usesSorry,
      proofTermAvailable: decl.proofTermAvailable,
    },
    annotations: parsed.annotations,
    suggestedVisual: parsed.suggestedVisual,
    concept: parsed.concept,
    ceiling,
    provenance: { sources: [ref] },
  };
}

/** Lower a whole Formal IR document. */
export function lowerDocument(doc: FormalIRDocument): MathIRDocument {
  return {
    mathIRVersion: MATH_IR_VERSION,
    system: doc.system,
    notationFidelity: doc.notationFidelity,
    theorems: doc.declarations.map((d) => lowerDeclaration(doc, d)),
  };
}

export { renderExpression };
