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
  FILTERS,
  NAMED_FUNCTIONS,
  POSITIONAL,
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
  type FilterSpec,
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
function opaqueDisplay(
  node: FormalExprNode,
  path: string,
  scope: string[],
  locals: LocalConstants = NO_LOCALS,
): string {
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
        lowerExpression(node.body, `${path}.body`, [...scope, node.binderName], locals),
      )}`;
    case "forall":
      return `∀ ${node.binderName}, ${opaqueDisplay(
        node.body,
        `${path}.body`,
        [...scope, node.binderName],
        locals,
      )}`;
    case "let":
      return `let ${node.binderName} := …`;
    case "proj":
      return `${opaqueDisplay(node.struct, `${path}.struct`, scope, locals)}.${node.index}`;
    case "app": {
      const head = headConstant(node);
      const { args, offset } = mathematicalArgs(node.args);
      const rendered = args.map((a, i) =>
        renderExpression(lowerExpression(a, argPath(path, offset + i), scope, locals)),
      );
      const name = head ? shortName(head) : opaqueDisplay(node.fn, `${path}.fn`, scope, locals);
      return rendered.length === 0 ? name : `${name}(${rendered.join(", ")})`;
    }
  }
}

/**
 * Constants ProofLens can name because they were extracted alongside.
 *
 * A declaration in the same extraction is not a mystery: we have its name, its
 * docstring, its source position and often its body. Treating `energyBudget P t`
 * as opaque merely because it is not in the global constant table would be
 * throwing away information we are already holding.
 */
export type LocalConstants = ReadonlyMap<string, { display: string }>;

const NO_LOCALS: LocalConstants = new Map();

/**
 * Lower a Lean expression into MathIR.
 *
 * Anything neither the constant tables nor `locals` recognise becomes `opaque`:
 * the structure survives, the arity survives, and ProofLens declines to say
 * what it means.
 */
export function lowerExpression(
  node: FormalExprNode,
  path: string,
  scope: string[] = [],
  locals: LocalConstants = NO_LOCALS,
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
        body: lowerExpression(node.body, `${path}.body`, [...scope, node.binderName], locals),
        path,
      };
    case "app": {
      const head = headConstant(node);
      if (head !== undefined) {
        const transparent = TRANSPARENT[head];
        if (transparent) {
          const idx = transparent.argIndex === -1 ? node.args.length - 1 : transparent.argIndex;
          const inner = node.args[idx];
          if (inner) return lowerExpression(inner, argPath(path, idx), scope, locals);
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
              .map((a, i) => lowerExpression(a, argPath(path, start + i), scope, locals)),
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
              .map((a, i) => lowerExpression(a, argPath(path, start + i), scope, locals)),
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
              .map((a, i) => lowerExpression(a, argPath(path, start + i), scope, locals)),
            path,
          };
        }

        // Coercions and compositions: the function sits at a fixed index and
        // may itself be applied to further arguments. Guarded on the argument
        // count so a signature change degrades to `opaque` rather than to a
        // confidently wrong reading.
        const positional = POSITIONAL[head];
        if (positional && node.args.length > positional.index) {
          const primary = node.args[positional.index]!;
          if (positional.kind === "coercion") {
            const applied = node.args.slice(positional.index + 1);
            const fn = lowerExpression(primary, argPath(path, positional.index), scope, locals);
            if (applied.length === 0) return fn;
            return {
              kind: "application",
              head,
              display: renderExpression(fn),
              args: applied.map((a, i) =>
                lowerExpression(a, argPath(path, positional.index + 1 + i), scope, locals),
              ),
              path,
            };
          }
          const second = node.args[positional.index + 1];
          if (second) {
            const composed: MathExpression = {
              kind: "operator",
              op: "comp",
              symbol: "∘",
              args: [
                lowerExpression(primary, argPath(path, positional.index), scope, locals),
                lowerExpression(second, argPath(path, positional.index + 1), scope, locals),
              ],
              path,
            };
            const applied = node.args.slice(positional.index + 2);
            if (applied.length === 0) return composed;
            return {
              kind: "application",
              head,
              display: renderExpression(composed),
              args: applied.map((a, i) =>
                lowerExpression(a, argPath(path, positional.index + 2 + i), scope, locals),
              ),
              path,
            };
          }
        }

        // A constant defined in this same extraction. We know its name and can
        // point at its declaration, so it is an application, not a mystery.
        const local = locals.get(head);
        if (local) {
          const { args: values, offset } = mathematicalArgs(node.args);
          return {
            kind: "application",
            head,
            display: local.display,
            args: values.map((a, i) =>
              lowerExpression(a, argPath(path, offset + i), scope, locals),
            ),
            path,
          };
        }
      }
      const { args } = mathematicalArgs(node.args);
      return {
        kind: "opaque",
        head: head ?? null,
        display: opaqueDisplay(node, path, scope, locals),
        arity: args.length,
        path,
      };
    }
    default:
      return {
        kind: "opaque",
        head: null,
        display: opaqueDisplay(node, path, scope, locals),
        arity: 0,
        path,
      };
  }
}

// ---------------------------------------------------------------------------
// Proposition lowering
// ---------------------------------------------------------------------------

/** Describe a filter argument of `Filter.Tendsto`. */
function lowerFilter(
  node: FormalExprNode,
  path: string,
  scope: string[],
  locals: LocalConstants,
): FilterSpec {
  const head = headConstant(node);
  const entry = head === undefined ? undefined : FILTERS[head];
  if (!entry) {
    return {
      kind: "unknown",
      display: opaqueDisplay(node, path, scope, locals),
      label: "an unnamed filter",
      point: null,
    };
  }
  let point: MathExpression | null = null;
  if (entry.pointIndex !== null && node.kind === "app") {
    const { args, offset } = mathematicalArgs(node.args);
    const index = entry.pointIndex < 0 ? args.length + entry.pointIndex : entry.pointIndex;
    const chosen = args[index];
    if (chosen) point = lowerExpression(chosen, argPath(path, offset + index), scope, locals);
  }
  const display =
    entry.kind === "at-top"
      ? "+∞"
      : entry.kind === "at-bot"
        ? "−∞"
        : point
          ? renderExpression(point)
          : shortName(head!);
  return { kind: entry.kind, display, label: entry.label, point };
}

export function lowerProposition(
  node: FormalExprNode,
  path: string,
  scope: string[] = [],
  locals: LocalConstants = NO_LOCALS,
): MathProposition {
  if (node.kind === "forall") {
    // An arrow is a `forall` whose bound variable is never used.
    if (!mentionsBVar(node.body, 0)) {
      return {
        kind: "implication",
        antecedent: lowerProposition(node.binderType, `${path}.binderType`, scope, locals),
        consequent: lowerProposition(
          node.body,
          `${path}.body`,
          [...scope, node.binderName],
          locals,
        ),
        path,
      };
    }
    return { kind: "opaque", head: null, display: opaqueDisplay(node, path, scope, locals), path };
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
          const left = lowerProposition(node.args[start]!, argPath(path, start), scope, locals);
          const right = lowerProposition(
            node.args[start + 1]!,
            argPath(path, start + 1),
            scope,
            locals,
          );
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
          lhs: lowerExpression(node.args[start]!, argPath(path, start), scope, locals),
          rhs: lowerExpression(node.args[start + 1]!, argPath(path, start + 1), scope, locals),
          path,
        };
      }

      // `Filter.Tendsto {α β} (f) (l₁) (l₂)` — the most common analysis shape
      // ProofLens could not read.
      if (head === "Filter.Tendsto" && node.args.length >= 5) {
        return {
          kind: "limit",
          subject: lowerExpression(node.args[2]!, argPath(path, 2), scope, locals),
          source: lowerFilter(node.args[3]!, argPath(path, 3), scope, locals),
          target: lowerFilter(node.args[4]!, argPath(path, 4), scope, locals),
          path,
        };
      }

      // `And a b`. Nested conjunctions are flattened, because `A ∧ B ∧ C` is
      // one list of facts to a reader, not a tree.
      if (head === "And" && node.args.length >= 2) {
        const conjuncts: MathProposition[] = [];
        const collect = (n: FormalExprNode, p: string): void => {
          if (headConstant(n) === "And" && n.kind === "app" && n.args.length >= 2) {
            collect(n.args[n.args.length - 2]!, argPath(p, n.args.length - 2));
            collect(n.args[n.args.length - 1]!, argPath(p, n.args.length - 1));
            return;
          }
          conjuncts.push(lowerProposition(n, p, scope, locals));
        };
        collect(node, path);
        return { kind: "conjunction", conjuncts, path };
      }

      // `Membership.mem {γ α} [inst] (s : γ) (a : α)` — note that Lean puts the
      // collection first, while a reader writes `a ∈ s`.
      if (head === "Membership.mem" && node.args.length >= 2) {
        const collectionIndex = node.args.length - 2;
        const elementIndex = node.args.length - 1;
        return {
          kind: "membership",
          element: lowerExpression(
            node.args[elementIndex]!,
            argPath(path, elementIndex),
            scope,
            locals,
          ),
          collection: lowerExpression(
            node.args[collectionIndex]!,
            argPath(path, collectionIndex),
            scope,
            locals,
          ),
          path,
        };
      }

      // `Exists {α} (p : α → Prop)`. The predicate is a lambda, and its binder
      // name is what a reader calls the witness.
      if (head === "Exists" && node.args.length >= 2) {
        const predicateArg = node.args[node.args.length - 1]!;
        if (predicateArg.kind === "lam") {
          return {
            kind: "existential",
            binder: predicateArg.binderName,
            body: lowerProposition(
              predicateArg.body,
              `${argPath(path, node.args.length - 1)}.body`,
              [...scope, predicateArg.binderName],
              locals,
            ),
            path,
          };
        }
      }

      const predicate = PREDICATES[head];
      if (predicate && node.args.length >= predicate.valueArity) {
        const start = node.args.length - predicate.valueArity;
        const values = node.args
          .slice(start)
          .map((a, i) => lowerExpression(a, argPath(path, start + i), scope, locals));
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
    display: opaqueDisplay(node, path, scope, locals),
    path,
  };
}

// ---------------------------------------------------------------------------
// Declaration lowering
// ---------------------------------------------------------------------------

/** Lower one Lean declaration into a `TheoremIR`. */
export function lowerDeclaration(
  doc: FormalIRDocument,
  decl: FormalDeclaration,
  locals: LocalConstants = NO_LOCALS,
): TheoremIR {
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

  const instances = decl.binders
    .filter((b) => b.role === "instance")
    .map((b) => ({ id: b.fvarId, symbol: b.name, typeDisplay: b.type.pretty }));

  const hypotheses: MathHypothesis[] = decl.binders
    .filter((b) => b.role === "hypothesis")
    .map((b) => {
      const proposition = lowerProposition(b.type.tree, `binders[${b.index}].type`, [], locals);
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
        const expression = lowerExpression(decl.definitionBody!.tree, "definitionBody", [], locals);
        return { expression, display: renderExpression(expression) };
      })()
    : null;

  const conclusionProp = lowerProposition(decl.conclusion.tree, "conclusion", [], locals);
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
    instances,
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

/**
 * Names of definitions in this document, so references to them are readable.
 *
 * Only definitional constants qualify. A theorem's name appearing inside another
 * proof is a dependency edge, not a term in a statement.
 */
export function localConstantsOf(doc: FormalIRDocument): LocalConstants {
  const locals = new Map<string, { display: string }>();
  for (const decl of doc.declarations) {
    if (decl.kind === "definition" || decl.kind === "opaque" || decl.kind === "axiom") {
      locals.set(decl.name, { display: decl.name.split(".").pop() ?? decl.name });
    }
  }
  return locals;
}

/** Lower a whole Formal IR document. */
export function lowerDocument(doc: FormalIRDocument): MathIRDocument {
  const locals = localConstantsOf(doc);
  return {
    mathIRVersion: MATH_IR_VERSION,
    system: doc.system,
    notationFidelity: doc.notationFidelity,
    theorems: doc.declarations.map((d) => lowerDeclaration(doc, d, locals)),
  };
}

export { renderExpression };
