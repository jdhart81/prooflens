# MathIR reference

## Purpose

MathIR is the stage where proof-assistant plumbing becomes mathematics. The Formal IR faithfully
preserves what Lean said, which for `x ≤ P / T` means a seven-node application tree headed by
`LE.le` with a carrier type, a typeclass instance, and a nested `HDiv.hDiv` carrying three more
type arguments and an instance chain. None of that is mathematics a reader wants to see. MathIR
turns it into a `relation` node with a `less-than-or-equal` relation, a variable on the left and
a `div` operator on the right.

MathIR is also the last stage that is still about *what was proved* rather than *how to show it*.
Nothing in this package knows what a figure is.

Everything MathIR produces is `derived` at best. The mapping from Lean constants to mathematical
meaning is a table this project maintains, not something the kernel checked. `lowerDeclaration`
uses `transcribe` only for the pretty-printed statement string (which is a transcription of what
Lean said), and `derive` for the lowered conclusion:

```ts
  const conclusion = derive<MathProposition>(
    conclusionProp,
    conclusionProp.kind === "opaque"
      ? MATH_IR_RULES.unrecognised
      : MATH_IR_RULES.lowerProposition,
    [statementClaim],
    { sources: [sourceRefFor(doc, decl, "conclusion")] },
  );
```

See [architecture.md](./architecture.md) for where this stage sits, and
[epistemic-model.md](./epistemic-model.md) for what `derive` guarantees.

## `MathExpression`

```ts
export type MathExpression =
  | { kind: "variable"; id: string; symbol: string; path: string }
  | { kind: "number"; value: number; display: string; path: string }
  | { kind: "constant"; name: string; display: string; path: string }
  | {
      kind: "operator";
      op: OperatorKind;
      symbol: string;
      args: MathExpression[];
      path: string;
    }
  | { kind: "application"; head: string; display: string; args: MathExpression[]; path: string }
  | { kind: "lambda"; parameter: string; body: MathExpression; path: string }
  | { kind: "opaque"; head: string | null; display: string; arity: number; path: string };
```

Every variant carries a `path`. It is a structural address into the declaration's expression
trees, produced by `argPath`/`childPath` in `@prooflens/formal-ir` and resolvable back to the
originating Lean node with `resolvePath`. Provenance is only as good as its addressing scheme,
and this is the scheme: a `VisualEntity` that says `sourceRef.path = "conclusion.args[3]"` can be
traced to the exact subterm it was drawn from.

### `variable`

A Lean free variable (`fvar`) or bound variable (`bvar`). `id` is the `fvarId` for free
variables and `bound:<name>` for bound ones, which is what makes sign facts and sensitivity
lookups keyed by `id` work.

From `ProofLens.Examples.simple_upper_bound`, conclusion `x ≤ P / T`:

```json
{
  "kind": "variable",
  "id": "_uniq.129",
  "symbol": "x",
  "path": "conclusion.args[2]"
}
```

`args[2]`, not `args[0]`: the first two arguments of `LE.le` are the carrier type `Real` and the
instance `Real.instLE`. See [`valueArity`](#the-valuearity-convention) below.

### `number`

A numeric literal, after the `OfNat` machinery has been seen through. From
`information_rate_bound`, hypothesis `hP : 0 < P`:

```json
{
  "kind": "number",
  "value": 0,
  "display": "0",
  "path": "binders[6].type.args[2].args[1]"
}
```

The trailing `.args[1]` is the `TRANSPARENT` redirect: Lean's `0 : ℝ` is
`OfNat.ofNat ℝ 0 inst`, and `TRANSPARENT["OfNat.ofNat"] = { argIndex: 1 }` picks out the raw
literal. The path records where the number actually lives, not where the coercion did.

### `constant`

A bare Lean constant that is not an operator, a named function, or transparent. `display` is the
last dot-separated component. From `strictMono_exp`, conclusion `StrictMono Real.exp`:

```json
{
  "kind": "constant",
  "name": "Real.exp",
  "display": "exp",
  "path": "conclusion.args[4]"
}
```

`lowerExpression` also produces a `constant` with `name: "string"` for string literals, so that
`display` can hold the JSON-quoted text.

### `operator`

An arithmetic operation from `BINARY_OPERATORS` or `UNARY_OPERATORS`. `symbol` is the rendering
`renderExpression` will use, and precedence-driven parenthesisation happens there rather than
here. From `abs_upper_bound`, conclusion `|a + b| ≤ |a| + |b|`:

```json
{
  "kind": "operator",
  "op": "abs",
  "symbol": "abs",
  "args": [
    {
      "kind": "operator",
      "op": "add",
      "symbol": "+",
      "args": [
        { "kind": "variable", "id": "_uniq.2", "symbol": "a", "path": "conclusion.args[2].args[3].args[4]" },
        { "kind": "variable", "id": "_uniq.3", "symbol": "b", "path": "conclusion.args[2].args[3].args[5]" }
      ],
      "path": "conclusion.args[2].args[3]"
    }
  ],
  "path": "conclusion.args[2]"
}
```

`abs` is the one entry in `UNARY_OPERATORS` whose `symbol` is not the rendered form:
`renderExpression` special-cases `abs` to `|x|`, and `neg`/`inv` to `−x` and `x⁻¹`.

### `application`

A named function from `NAMED_FUNCTIONS`. Unlike `opaque`, ProofLens is asserting that it knows
what this head means. From `sqrt_upper_bound`, conclusion `√(x) ≤ (x + 1) / 2`:

```json
{
  "kind": "application",
  "head": "Real.sqrt",
  "display": "√",
  "args": [
    { "kind": "variable", "id": "_uniq.135", "symbol": "x", "path": "conclusion.args[2].args[0]" }
  ],
  "path": "conclusion.args[2]"
}
```

`head` is the full Lean name and is load-bearing downstream: `signOf` in
`@prooflens/classifier` checks `expr.head === "Real.sqrt"` to conclude `nonnegative`.

### `lambda`

A Lean `lam` node, kept as a binder rather than flattened. From `monotone_affine`, conclusion
`Monotone x ↦ a · x + b`:

```json
{
  "kind": "lambda",
  "parameter": "x",
  "body": {
    "kind": "operator",
    "op": "add",
    "symbol": "+",
    "args": [
      {
        "kind": "operator",
        "op": "mul",
        "symbol": "·",
        "args": [
          { "kind": "variable", "id": "_uniq.94", "symbol": "a", "path": "conclusion.args[4].body.args[4].args[4]" },
          { "kind": "variable", "id": "bound:x", "symbol": "x", "path": "conclusion.args[4].body.args[4].args[5]" }
        ],
        "path": "conclusion.args[4].body.args[4]"
      },
      { "kind": "variable", "id": "_uniq.95", "symbol": "b", "path": "conclusion.args[4].body.args[5]" }
    ],
    "path": "conclusion.args[4].body"
  },
  "path": "conclusion.args[4]"
}
```

The bound occurrence of `x` gets `id: "bound:x"`, produced by resolving the de Bruijn index
against the `scope` array that `lowerExpression` threads through. Bound ids deliberately do not
collide with `fvarId`s, so a bound variable can never be mistaken for a theorem parameter by
`sensitivityOf`.

### `opaque`

The case that makes the rest of ProofLens honest. When the head constant is not in any table,
MathIR does not guess. It records the head (or `null`), the arity of the mathematical arguments,
and a display string built by `opaqueDisplay`, which recursively lowers the arguments so that a
reader still sees mathematics rather than elaborator plumbing.

From `monotone_throughput`, conclusion `Monotone (throughput ipc)`:

```json
{
  "kind": "opaque",
  "head": "ProofLens.Examples.throughput",
  "display": "throughput(ipc)",
  "arity": 1,
  "path": "conclusion.args[4]"
}
```

The type comment states the requirement:

```ts
/**
 * A mathematical expression.
 *
 * Note the `opaque` case. ProofLens is required to say "I can see the structure
 * but I cannot name it" rather than inventing meaning to satisfy a renderer.
 * Every stage downstream must handle `opaque` gracefully.
 */
```

"Gracefully" is concrete, not aspirational. `classifyTheorem` turns an opaque conclusion into a
`STRUCTURE_UNSUPPORTED_001` classification naming the head; `planVisuals` falls back to
`planExpressionTree`, which still draws the statement's structure; and `renderText`/`renderSvg`
render that fallback like any other spec. Two of the 34 declarations in
`examples/corpus.formal-ir.json` take this path, and neither is dropped.

## `MathProposition`

```ts
export type MathProposition =
  | { kind: "relation"; relation: RelationKind; lhs: MathExpression; rhs: MathExpression; path: string }
  | {
      kind: "predicate";
      predicate: PredicateKind;
      name: string;
      subject: MathExpression | null;
      args: MathExpression[];
      path: string;
    }
  | { kind: "implication"; antecedent: MathProposition; consequent: MathProposition; path: string }
  | { kind: "opaque"; head: string | null; display: string; path: string };
```

### `relation`

Head constant found in `RELATIONS`. From `information_rate_bound`, conclusion
`N / t ≤ P · D / (kB · T · log(2))`:

```json
{
  "kind": "relation",
  "relation": "less-than-or-equal",
  "lhs": { "kind": "operator", "op": "div", "symbol": "/", "args": ["…N…", "…t…"], "path": "conclusion.args[2]" },
  "rhs": { "kind": "operator", "op": "div", "symbol": "/", "args": ["…P · D…", "…kB · T · log(2)…"], "path": "conclusion.args[3]" },
  "path": "conclusion"
}
```

`Iff` is handled specially. It relates propositions rather than values, so `lowerProposition`
lowers both sides as propositions, renders them, and wraps each rendering in a zero-arity
`opaque` expression so that the `relation` shape survives. From `rate_bound_iff`, conclusion
`x ≤ P / T ↔ x · T ≤ P`:

```json
{
  "kind": "relation",
  "relation": "equivalent",
  "lhs": { "kind": "opaque", "head": null, "display": "x ≤ P / T", "arity": 0, "path": "conclusion.args[0]" },
  "rhs": { "kind": "opaque", "head": null, "display": "x · T ≤ P", "arity": 0, "path": "conclusion.args[1]" },
  "path": "conclusion"
}
```

`Iff` takes no carrier type or instance, so its value arguments really are `args[0]` and
`args[1]`.

### `predicate`

Head constant found in `PREDICATES`. `subject` is the first mathematical argument and `args`
holds the rest, so `MonotoneOn f s` puts `f` in `subject` and `s` in `args`. From
`strictMono_exp`:

```json
{
  "kind": "predicate",
  "predicate": "strictly-monotone",
  "name": "StrictMono",
  "subject": { "kind": "constant", "name": "Real.exp", "display": "exp", "path": "conclusion.args[4]" },
  "args": [],
  "path": "conclusion"
}
```

`predicate` is the `PredicateKind` the classifiers switch on; `name` is the short Lean name used
for display. The two are separate so that `MonotoneOn` and `Monotone` can share
`predicate: "monotone"` while still rendering under their own names.

### `implication`

Produced when a Lean `forall` node's bound variable is never mentioned in the body, which is
what an arrow is:

```ts
  if (node.kind === "forall") {
    // An arrow is a `forall` whose bound variable is never used.
    if (!mentionsBVar(node.body, 0)) {
```

Worth knowing where this actually shows up. `extractDeclaration` calls `forallTelescope` on the
declaration's type, which strips arrows along with everything else, so a theorem stated as
`A → B` arrives with `A` as a hypothesis binder and `B` as the conclusion. Implication
propositions therefore appear in *hypothesis types*, not in conclusions. From
`ceiling_of_budget`, whose second hypothesis is `x ≤ P → x ≤ B`:

```json
{
  "kind": "implication",
  "antecedent": {
    "kind": "relation",
    "relation": "less-than-or-equal",
    "lhs": { "kind": "variable", "id": "_uniq.20", "symbol": "x", "path": "binders[4].type.binderType.args[2]" },
    "rhs": { "kind": "variable", "id": "_uniq.21", "symbol": "P", "path": "binders[4].type.binderType.args[3]" },
    "path": "binders[4].type.binderType"
  },
  "consequent": {
    "kind": "relation",
    "relation": "less-than-or-equal",
    "lhs": { "kind": "variable", "id": "_uniq.20", "symbol": "x", "path": "binders[4].type.body.args[2]" },
    "rhs": { "kind": "variable", "id": "_uniq.22", "symbol": "B", "path": "binders[4].type.body.args[3]" },
    "path": "binders[4].type.body"
  },
  "path": "binders[4].type"
}
```

A `forall` whose variable *is* used (a genuine quantifier) falls through to `opaque`. v0.1 has no
vocabulary for quantifier structure.

### `opaque`

Same contract as the expression case. From `unsupported_tendsto_fixture`:

```json
{
  "kind": "opaque",
  "head": "Filter.Tendsto",
  "display": "Tendsto(n ↦ 1 / (n + 1), atTop, nhds(0))",
  "path": "conclusion"
}
```

The display is worth reading closely. ProofLens could not name `Filter.Tendsto`, but it did lower
the arguments: the lambda rendered as `n ↦ 1 / (n + 1)`, and `Filter.atTop` and `nhds 0` shortened
to `atTop` and `nhds(0)`. This is what `opaqueDisplay` buys. The classifier's rationale for this
declaration reads:

```
`Filter.Tendsto` is not in ProofLens's constant table yet.
```

Definitions also land here. `throughput`'s "conclusion" after `forallTelescope` is its codomain,
so the lowered proposition is `{ "kind": "opaque", "head": "Real", "display": "Real" }`.
`classifyDefinition` fires first on `kind === "definition"`, so this never reaches the
unsupported path.

## The constant tables

`packages/math-ir/src/tables.ts` is the entire semantic knowledge of v0.1. It is data rather than
code on purpose:

```ts
/**
 * Lean constant → mathematical meaning.
 *
 * These tables are the entire "semantic analysis" of v0.1, and keeping them as
 * data rather than code is deliberate: they are the thing that grows as
 * ProofLens learns more mathematics, and each entry is independently testable.
 */
```

| Table | Entries | What it maps to |
| --- | --- | --- |
| `RELATIONS` | `Eq`, `Ne`, `LE.le`, `LT.lt`, `GE.ge`, `GT.gt`, `Iff` | `RelationKind` |
| `BINARY_OPERATORS` | `HAdd.hAdd`, `HSub.hSub`, `HMul.hMul`, `HDiv.hDiv`, `HPow.hPow`, `HMod.hMod` | `OperatorKind` + symbol |
| `UNARY_OPERATORS` | `Neg.neg`, `Inv.inv`, `abs` | `OperatorKind` + symbol |
| `NAMED_FUNCTIONS` | `Real.sqrt`, `Real.log`, `Real.exp`, `Real.sin`, `Real.cos`, `Real.rpow`, `Nat.succ` | display string |
| `TRANSPARENT` | `Nat.cast`, `Int.cast`, `Rat.cast`, `NNReal.toReal`, `OfNat.ofNat`, `OfScientific.ofScientific` | an argument index to descend into |
| `PREDICATES` | `Monotone`, `StrictMono`, `Antitone`, `StrictAnti`, `MonotoneOn`, `AntitoneOn` | `PredicateKind` + label |

Two further tables, `RELATION_PHRASE` and `RELATION_SYMBOL`, map each `RelationKind` to prose
("is at most") and to a symbol ("≤"). The explanation engine uses the first, `renderProposition`
the second.

### The `valueArity` convention

Lean threads carrier types and typeclass instances through every operation as leading arguments.
`x ≤ P / T` elaborates with `LE.le` applied to four arguments: `Real`, `Real.instLE`, `x`, and
the division. Only the last two carry mathematics.

`valueArity` counts the trailing arguments that do:

```ts
/**
 * `valueArity` counts the *trailing* arguments that carry mathematics. Lean puts
 * the carrier type and typeclass instances first, so `LE.le ℝ inst x y` has four
 * arguments of which the last two are the ones a reader cares about.
 */
export interface Signature {
  valueArity: number;
}
```

Lowering slices from the end, never from a fixed offset:

```ts
        const binary = BINARY_OPERATORS[head];
        if (binary && node.args.length >= binary.valueArity) {
          const start = node.args.length - binary.valueArity;
```

Counting from the end is what makes the tables robust against heterogeneous operations.
`HDiv.hDiv` carries three type arguments plus an instance before its two operands, `LE.le`
carries one type plus one instance before its two, and `Iff` carries none. One number,
`valueArity: 2`, covers all three.

There is a second, separate mechanism for the same problem. `mathematicalArgs` drops leading
arguments that *look like* plumbing, and it is used for `opaque` arity and display, where no
table entry exists to consult:

```ts
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
```

This is a heuristic and is only ever used where the alternative is showing the reader an
instance chain. A bare `const` argument that really is mathematics (`Real.exp` passed to a
function ProofLens does not recognise) will be dropped from the opaque display. Recognising the
head in `NAMED_FUNCTIONS` is the fix.

## Semantic annotations

Formal notation does not record that `P` is watts. A human has to say so, and when they do it is
their claim rather than Lean's, which is why the explanation engine emits it at `interpreted`
and never at `verified`. Annotations live in Lean docstrings, one directive per line, because
docstrings already exist and are already extracted; see
[adr/0003-semantic-annotations.md](./adr/0003-semantic-annotations.md).

```text
@prooflens.var P meaning="available electrical power" units="W" axis="x"
@prooflens.visual upper-bound-plot
@prooflens.concept "information rate bound"
```

### Directives

| Directive | Parsed into | Notes |
| --- | --- | --- |
| `@prooflens.var <symbol> key="value" …` | `SemanticAnnotation` appended to `annotations` | Allowed keys: `meaning`, `units`, `domain`, `axis`, `role`. Unknown keys are ignored. A `var` line with no recognised key is recorded in `malformed` but the annotation is still kept. |
| `@prooflens.visual <name>` | `suggestedVisual` | Surrounding double quotes are stripped. Last one wins. |
| `@prooflens.concept <name>` | `concept` | Surrounding double quotes are stripped. Last one wins. |

Any other `@prooflens.` line is recorded in `malformed` and dropped. Every non-directive line is
kept as prose and becomes `TheoremIR.documentation`, so the docstring a human reads is not
polluted by the machine-readable part.

### A real example

From `corpus/ProofLensExamples/IntelligenceBound.lean`, the docstring of
`information_rate_bound`:

```lean
/-- **The bound.** A machine drawing `P` watts at temperature `T`, whose `N`
operations fit inside the energy it can draw in `t` seconds, sustains an
operation rate of at most `P · D / (k_B · T · ln 2)`.

...

@prooflens.var P meaning="electrical power drawn by the machine" units="W" domain="positive reals" axis="x"
@prooflens.var T meaning="operating temperature of the heat bath" units="K" domain="positive reals"
@prooflens.var kB meaning="Boltzmann constant" units="J/K" domain="positive reals"
@prooflens.var D meaning="useful operations extracted per erased bit" units="dimensionless" domain="positive reals"
@prooflens.var N meaning="number of logical operations performed" units="ops" domain="reals"
@prooflens.var t meaning="length of the operating window" units="s" domain="positive reals"
@prooflens.visual upper-bound-plot
@prooflens.concept "Landauer information-rate bound"
-/
theorem information_rate_bound
    (P T kB D N t : ℝ)
    (hP : 0 < P) (hT : 0 < T) (hkB : 0 < kB) (hD : 0 < D) (ht : 0 < t)
    (hN : N * (kB * T * Real.log 2 / D) ≤ P * t) :
    N / t ≤ P * D / (kB * T * Real.log 2) := by
```

`annotationFor` matches each annotation's `target` against the binder name, so the lowered
`MathVariable` for `P` reads:

```json
{
  "id": "_uniq.66",
  "symbol": "P",
  "typeDisplay": "ℝ",
  "binderInfo": "default",
  "annotation": {
    "target": "P",
    "meaning": "electrical power drawn by the machine",
    "units": "W",
    "domain": "positive reals",
    "axis": "x"
  }
}
```

Where annotations reach the output:

- The `domain` explanation layer, at status `interpreted`, under rule id
  `SEMANTIC_ANNOTATION_001`, with the sentence "These readings come from the declaration's
  ProofLens annotations, not from anything Lean checked."
- `planBound` uses `meaning` and `units` for the bounded quantity's `detail` and for the axis
  label, so the text figure for `simple_upper_bound` prints
  `axis: achieved operation rate (ops/s) — schematic scale`.
- `theorem.concept` becomes the `subtitle` of bound and monotonicity figures.

`domain`, `axis` and `role` are parsed and carried through to `MathVariable.annotation`, but
nothing in v0.1 reads them. `suggestedVisual` is likewise parsed, stored on `TheoremIR`, and not
consulted by the planner; see [roadmap.md](./roadmap.md).

## `TheoremIR`

```ts
export interface TheoremIR {
  id: string;
  name: string;
  namespace: string;
  kind: string;
  documentation: string | null;
  variables: MathVariable[];
  hypotheses: MathHypothesis[];
  conclusion: Claim<MathProposition>;
  conclusionDisplay: string;
  statementDisplay: string;
  dependencies: string[];
  trust: TrustBase;
  annotations: SemanticAnnotation[];
  suggestedVisual: string | null;
  concept: string | null;
  ceiling: EpistemicStatus;
  provenance: Provenance;
}
```

| Field | Source | Notes |
| --- | --- | --- |
| `id` | `decl.name` | Equal to `name` in v0.1. Used as the `inputs` entry in derived claims and as the dependency-graph node id. |
| `name` | `decl.name` | Fully qualified, e.g. `ProofLens.Examples.information_rate_bound`. |
| `namespace` | `decl.namespace` | Lean's `declName.getPrefix`. |
| `kind` | `decl.kind` | One of `axiom`, `definition`, `theorem`, `opaque`, `inductive`, `constructor`, `recursor`, `quot`. `classifyDefinition` switches on `definition` and `opaque`. |
| `documentation` | `parseDocstring(...).prose` | The docstring with every `@prooflens.` line removed, trimmed, `null` if empty. |
| `variables` | binders with `role === "parameter"` | Binders whose type is not a `Prop`. Each carries its `annotation` or `null`. |
| `hypotheses` | binders with `role === "hypothesis"` | Binders whose type is a `Prop`. Each carries the lowered `proposition`, its rendered `display`, and the `usage` record from the Formal IR verbatim. |
| `conclusion` | `derive(lowerProposition(decl.conclusion.tree, "conclusion"), …)` | A `Claim`, not a bare value. Its rule is `MATHIR_UNRECOGNISED_001` when the result is opaque and `MATHIR_LOWER_PROP_001` otherwise. |
| `conclusionDisplay` | `renderProposition(conclusionProp)` | ProofLens's own rendering, built from the lowered tree. Unaffected by `notationFidelity`. |
| `statementDisplay` | `decl.statement.pretty` | Lean's pretty printer, binders included. This *is* affected by `notationFidelity`. |
| `dependencies` | `decl.dependencies` | Every constant the type or proof term references, unfiltered. `localDependencyEdges` does the filtering. |
| `trust` | `decl.axioms`, `unusualAxioms(...)`, `decl.usesSorry`, `decl.proofTermAvailable` | `unusualAxioms` is everything beyond `propext`, `Classical.choice`, `Quot.sound`. |
| `annotations` | `parseDocstring(...).annotations` | All of them, including ones whose `target` matches no binder. |
| `suggestedVisual` | `@prooflens.visual` | Parsed and stored. Not read by the planner in v0.1. |
| `concept` | `@prooflens.concept` | Used as figure `subtitle`. |
| `ceiling` | `witness ? "verified" : "derived"` | The strongest status any claim about this declaration may carry. Degrades when the proof used `sorry`. |
| `provenance` | `sourceRefFor(doc, decl)` | Declaration-level source reference with its span. |

`MathIRDocument` wraps `theorems` with `mathIRVersion` (`"0.1.0"`), `system`, and
`notationFidelity` carried forward from the Formal IR.

## Before and after

The full worked example, from `examples/corpus.formal-ir.json` to lowered MathIR.

### Formal IR

`ProofLens.Examples.simple_upper_bound`, whose conclusion is `x ≤ P / T`. The `pretty` and
`constants` fields, then the tree:

```json
{
  "pretty": "x ≤ P / T",
  "constants": ["LE.le", "Real", "Real.instLE", "HDiv.hDiv", "instHDiv", "DivInvMonoid.toDiv", "Real.instDivInvMonoid"]
}
```

```json
{
  "kind": "app",
  "fn": { "kind": "const", "name": "LE.le", "levels": ["0"] },
  "args": [
    { "kind": "const", "name": "Real", "levels": [] },
    { "kind": "const", "name": "Real.instLE", "levels": [] },
    { "kind": "fvar", "name": "x", "fvarId": "_uniq.129" },
    {
      "kind": "app",
      "fn": { "kind": "const", "name": "HDiv.hDiv", "levels": ["0", "0", "0"] },
      "args": [
        { "kind": "const", "name": "Real", "levels": [] },
        { "kind": "const", "name": "Real", "levels": [] },
        { "kind": "const", "name": "Real", "levels": [] },
        {
          "kind": "app",
          "fn": { "kind": "const", "name": "instHDiv", "levels": ["0"] },
          "args": [
            { "kind": "const", "name": "Real", "levels": [] },
            {
              "kind": "app",
              "fn": { "kind": "const", "name": "DivInvMonoid.toDiv", "levels": ["0"] },
              "args": [
                { "kind": "const", "name": "Real", "levels": [] },
                { "kind": "const", "name": "Real.instDivInvMonoid", "levels": [] }
              ]
            }
          ]
        },
        { "kind": "fvar", "name": "P", "fvarId": "_uniq.130" },
        { "kind": "fvar", "name": "T", "fvarId": "_uniq.131" }
      ]
    }
  ]
}
```

Nineteen nodes (`size(tree)` from `@prooflens/formal-ir` agrees), of which three carry
mathematics.

### MathIR

Produced by `prooflens inspect examples/corpus.formal-ir.json simple_upper_bound --stage math`:

```json
{
  "kind": "relation",
  "relation": "less-than-or-equal",
  "lhs": {
    "kind": "variable",
    "id": "_uniq.129",
    "symbol": "x",
    "path": "conclusion.args[2]"
  },
  "rhs": {
    "kind": "operator",
    "op": "div",
    "symbol": "/",
    "args": [
      { "kind": "variable", "id": "_uniq.130", "symbol": "P", "path": "conclusion.args[3].args[4]" },
      { "kind": "variable", "id": "_uniq.131", "symbol": "T", "path": "conclusion.args[3].args[5]" }
    ],
    "path": "conclusion.args[3]"
  },
  "path": "conclusion"
}
```

Five nodes. `renderProposition` renders it as `x ≤ P / T`, which happens to agree with Lean's
pretty printer here, and would still be `x ≤ P / T` under `notationFidelity: "raw"`, where
Lean's own rendering would read `LE.le x (HDiv.hDiv P T)`.

## How to add support for a new Lean constant

Worked from a real gap: `examples/corpus.formal-ir.json` contains
`unsupported_tendsto_fixture`, whose conclusion is headed by `Filter.Tendsto`. Suppose instead
you want `Real.tanh` recognised as a named function.

### 1. Get the Formal IR and find the head

```bash
cd lean
lake exe prooflens-extract MyProject.MyModule > /tmp/mine.json
prooflens summary /tmp/mine.json
```

Declarations that fell through appear with `unsupported` in the classification column. For the
detail, ask the classifier stage:

```bash
prooflens inspect /tmp/mine.json my_theorem --stage classifier
```

The `STRUCTURE_UNSUPPORTED_001` entry's `payload.data.head` is the constant name, in full. That
name is what goes in the table; ProofLens matches on `headConstant`, which is the full dotted
name of the application's head `const` node.

### 2. Count the value arity

Look at the raw tree:

```bash
prooflens inspect /tmp/mine.json my_theorem --stage formal
```

Count the arguments of the application, then count how many of the *trailing* ones carry
mathematics. For `Real.tanh x`, the answer is one: `Real.tanh` is monomorphic in `ℝ`, so there is
no carrier type or instance argument at all, and `valueArity: 1`. For a typeclass-generic
operation like `HAdd.hAdd`, the argument list is `α β γ inst a b` and `valueArity: 2`.

### 3. Add the entry

Pick the table by what the constant *is*:

- a proposition-forming relation between two values, `RELATIONS`;
- an arithmetic operation with a conventional infix or prefix symbol, `BINARY_OPERATORS` or `UNARY_OPERATORS`;
- a function with a conventional name, `NAMED_FUNCTIONS`;
- a coercion or literal wrapper that should be invisible, `TRANSPARENT`;
- a named property of a subject, `PREDICATES`.

```ts
export const NAMED_FUNCTIONS: Record<string, { display: string } & Signature> = {
  "Real.sqrt": { display: "√", valueArity: 1 },
  "Real.log": { display: "log", valueArity: 1 },
  "Real.tanh": { display: "tanh", valueArity: 1 },
  …
};
```

An entry in `RELATIONS` or `PREDICATES` also needs its `RelationKind` or `PredicateKind` to
exist in `types.ts`. Adding a new kind is a bigger change: `RELATION_PHRASE` and
`RELATION_SYMBOL` are exhaustive `Record`s over `RelationKind`, so the compiler will list the
sites you need to fill in, and the classifiers in
`packages/classifier/src/classify.ts` will need a branch or the conclusion will still classify as
`unsupported`. (`Ne` is the standing example: it is in `RELATIONS`, so `C · V ^ 2 ≠ 0` lowers to
a named `not-equal` relation, but no structural classifier handles `not-equal`, so
`switching_coefficient_ne_zero` still reports `unsupported`.)

### 4. Consider the sign rules

`signOf` in `packages/classifier/src/signs.ts` handles `application` nodes with a single
hard-coded case:

```ts
    case "application":
      // `√x` is nonnegative wherever it is defined; nothing else is assumed.
      return expr.head === "Real.sqrt" ? "nonnegative" : "unknown";
```

If your function has a sign that follows from its definition rather than from a hypothesis, this
is where to say so. Leaving it `unknown` is always safe: it means parameter-sensitivity callouts
will be omitted, not that they will be wrong.

### 5. Verify

```bash
prooflens inspect /tmp/mine.json my_theorem --stage math      # the head should no longer be opaque
prooflens explain /tmp/mine.json my_theorem                   # the explanation layers should read correctly
prooflens summary /tmp/mine.json                              # `unsupported structure` should have dropped
```

If you hit a constant you cannot add yourself, file it with the
[`unsupported_mathematics` issue template](../.github/ISSUE_TEMPLATE/unsupported_mathematics.md).
Those reports are triaged directly into the classifier roadmap.

## Related documents

- [architecture.md](./architecture.md) — where MathIR sits in the pipeline
- [visual-ir.md](./visual-ir.md) — what the planner does with a `TheoremIR`
- [epistemic-model.md](./epistemic-model.md) — `Claim`, `derive`, and the lattice
- [adr/0003-semantic-annotations.md](./adr/0003-semantic-annotations.md) — why annotations live in docstrings
- [roadmap.md](./roadmap.md) — table coverage and what is planned
