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

It has two sources of vocabulary: the constant tables in `tables.ts`, which are global and
maintained by this project, and the *local* constants of whatever document is being lowered,
which are free. `localConstantsOf` collects the definitions in the same extraction so that
`energyBudget P t` lowers as an application rather than as a mystery.

Everything MathIR produces is `derived` at best. The mapping from Lean constants to mathematical
meaning is a table this project maintains, not something the kernel checked. `lowerDeclaration`
uses `transcribe` only for the pretty-printed statement string (which is a transcription of what
Lean said), and `derive` for the lowered conclusion:

```ts
  const conclusion = derive<MathProposition>(
    conclusionProp,
    conclusionProp.kind === "opaque" ? MATH_IR_RULES.unrecognised : MATH_IR_RULES.lowerProposition,
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
  "id": "_uniq.135",
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

`OperatorKind` also includes `comp`, rendered `∘`. It is the one operator with no table entry:
`Function.comp` is handled by `POSITIONAL` rather than by `BINARY_OPERATORS`, because its function
arguments sit at fixed indices and may themselves be applied.

### `application`

A named function from `NAMED_FUNCTIONS`. Unlike `opaque`, ProofLens is asserting that it knows
what this head means. From `sqrt_upper_bound`, conclusion `√(x) ≤ (x + 1) / 2`:

```json
{
  "kind": "application",
  "head": "Real.sqrt",
  "display": "√",
  "args": [
    { "kind": "variable", "id": "_uniq.141", "symbol": "x", "path": "conclusion.args[2].args[0]" }
  ],
  "path": "conclusion.args[2]"
}
```

`head` is the full Lean name and is load-bearing downstream: `signOf` in
`@prooflens/classifier` checks `expr.head === "Real.sqrt"` to conclude `nonnegative`.

Three other paths produce an `application` node:

- **`POSITIONAL`**, for coercions and compositions. See [below](#positional-and-filters).
- **Local constants**, for definitions extracted alongside. From `energy_ops_bound`, whose
  conclusion is `N ≤ energyBudget(P, t) / landauerCost(kB, T, D)`:

  ```json
  {
    "kind": "application",
    "head": "ProofLens.Examples.landauerCost",
    "display": "landauerCost",
    "args": [
      { "kind": "variable", "id": "_uniq.57", "symbol": "kB", "path": "conclusion.args[3].args[5].args[0]" },
      { "kind": "variable", "id": "_uniq.56", "symbol": "T",  "path": "conclusion.args[3].args[5].args[1]" },
      { "kind": "variable", "id": "_uniq.58", "symbol": "D",  "path": "conclusion.args[3].args[5].args[2]" }
    ],
    "path": "conclusion.args[3].args[5]"
  }
  ```
- **Interval and floor displays**, whose `display` carries `·` placeholders. `renderExpression`
  fills them rather than calling them, so `Set.Icc 0 1` renders `[0, 1]` and not `[·, ·](0, 1)`.

A display containing `·` is therefore a rendering instruction, not a name. That is worth knowing
before adding a `NAMED_FUNCTIONS` entry whose conventional notation happens to contain a middle
dot.

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
          { "kind": "variable", "id": "_uniq.100", "symbol": "a", "path": "conclusion.args[4].body.args[4].args[4]" },
          { "kind": "variable", "id": "bound:x", "symbol": "x", "path": "conclusion.args[4].body.args[4].args[5]" }
        ],
        "path": "conclusion.args[4].body.args[4]"
      },
      { "kind": "variable", "id": "_uniq.101", "symbol": "b", "path": "conclusion.args[4].body.args[5]" }
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

The case that makes the rest of ProofLens honest. When the head constant is in neither the tables
nor `locals`, MathIR does not guess. It records the head (or `null`), the arity of the
mathematical arguments, and a display string built by `opaqueDisplay`, which recursively lowers
the arguments so that a reader still sees mathematics rather than elaborator plumbing.

The ProofLens corpus no longer contains an opaque *expression* with a named head, which is itself
the point: `Monotone (throughput ipc)` used to lower with an opaque `throughput(ipc)` subject, and
local constant resolution turned it into an `application`. What remains are the zero-arity
opaque nodes `Iff` produces, from `rate_bound_iff`:

```json
{
  "kind": "opaque",
  "head": null,
  "display": "x ≤ P / T",
  "arity": 0,
  "path": "conclusion.args[0]"
}
```

A named-head example, lowering `Finsupp.sum` (2 declarations in the mathlib slice, and still
absent from the tables), would read:

```json
{
  "kind": "opaque",
  "head": "Finsupp.sum",
  "display": "sum(f, g)",
  "arity": 2,
  "path": "conclusion.args[2]"
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
render that fallback like any other spec. One of the 35 declarations in
`examples/corpus.formal-ir.json` takes this path (`energy_cost_injective`, headed by
`Function.Injective`), and it is not dropped.

`opaque` is also the unit of measurement for coverage. `opaqueHeadsIn` in `traverse.ts` collects
every `opaque` head reachable from a theorem, and those heads are what populate the
`opaqueConstants` backlog in [coverage.md](./coverage.md). A head that ProofLens quietly guessed
at instead of marking opaque would vanish from that backlog, which is the practical reason the
`opaque` discipline is enforced rather than merely encouraged.

## `MathProposition`

```ts
export type MathProposition =
  | {
      kind: "relation";
      relation: RelationKind;
      lhs: MathExpression;
      rhs: MathExpression;
      path: string;
    }
  | {
      kind: "predicate";
      predicate: PredicateKind;
      name: string;
      subject: MathExpression | null;
      args: MathExpression[];
      path: string;
    }
  | { kind: "implication"; antecedent: MathProposition; consequent: MathProposition; path: string }
  | {
      kind: "limit";
      subject: MathExpression;
      source: FilterSpec;
      target: FilterSpec;
      path: string;
    }
  | { kind: "existential"; binder: string; body: MathProposition; path: string }
  | { kind: "conjunction"; conjuncts: MathProposition[]; path: string }
  | { kind: "membership"; element: MathExpression; collection: MathExpression; path: string }
  | { kind: "opaque"; head: string | null; display: string; path: string };
```

Four of these kinds (`limit`, `existential`, `conjunction`, `membership`) were added because the
mathlib coverage sweep ranked them at the top of the unrecognised-shape backlog. Each is checked
at three layers in `packages/math-ir/test/propositions.test.ts` — lowering, rendering, and
traversal — because a kind that lowers but does not traverse silently drops out of coverage
analysis, and one that lowers but does not render shows a reader nothing.

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

### `limit`

`Filter.Tendsto f l₁ l₂`, the single most common statement shape the mathlib sweep found ProofLens
could not read: 44 declarations, more than any other unrecognised head. `subject` is the function;
`source` and `target` are `FilterSpec`s.

```ts
/**
 * A filter, described in terms a reader can follow.
 *
 * `Filter.atTop` is "the input grows without bound"; `nhds L` is "approaches L".
 * Anything else keeps its structure and admits it has no description.
 */
export interface FilterSpec {
  kind: "at-top" | "at-bot" | "neighbourhood" | "punctured" | "other" | "unknown";
  /** Compact rendering, e.g. `+∞` or the limit point. */
  display: string;
  /** Prose fragment, e.g. "grows without bound". */
  label: string;
  /** The point being approached, when there is one. */
  point: MathExpression | null;
}
```

From `sequence_limit_example`, whose statement is
`Filter.Tendsto (fun n : ℕ => (1 : ℝ) / (n + 1)) Filter.atTop (nhds 0)`, abridged at the subject:

```json
{
  "kind": "limit",
  "subject": { "kind": "lambda", "parameter": "n", "body": "…1 / (n + 1)…", "path": "conclusion.args[2]" },
  "source": {
    "kind": "at-top",
    "display": "+∞",
    "label": "grows without bound",
    "point": null
  },
  "target": {
    "kind": "neighbourhood",
    "display": "0",
    "label": "approaches",
    "point": { "kind": "number", "value": 0, "display": "0", "path": "conclusion.args[4].args[2].args[1]" }
  },
  "path": "conclusion"
}
```

`renderProposition` renders that as `n ↦ 1 / (n + 1) ⟶ 0 (along +∞)`.

Note `kind: "unknown"` on `FilterSpec`, which is distinct from the five named kinds. A filter that
is not in the `FILTERS` table keeps its structure, gets `label: "an unnamed filter"`, and does not
pretend to a description. Downstream, `classifyLimit` distinguishes convergence from divergence
by `target.kind`, so an unknown target reads as a divergence rather than as a limit value, which
is the conservative direction.

### `existential`

`Exists α (fun w => p w)`. The predicate is a lambda, and its binder name is what a reader calls
the witness, so it is lifted onto the proposition. Lowering the shape `Exists ℝ (fun ε => 0 < ε)`
gives:

```json
{
  "kind": "existential",
  "binder": "ε",
  "body": {
    "kind": "relation",
    "relation": "less-than",
    "lhs": { "kind": "number", "value": 0, "display": "0", "path": "conclusion.args[1].body.args[2]" },
    "rhs": { "kind": "variable", "id": "bound:ε", "symbol": "ε", "path": "conclusion.args[1].body.args[3]" },
    "path": "conclusion.args[1].body"
  },
  "path": "conclusion"
}
```

Rendered: `∃ ε, 0 < ε`. If the last argument is not a `lam` — an existential stated over an
already-named predicate — lowering falls through to `opaque` rather than inventing a binder.

22 declarations in the mathlib slice classify as `existence`.

### `conjunction`

`And a b`, with nested conjunctions flattened:

```ts
      // `And a b`. Nested conjunctions are flattened, because `A ∧ B ∧ C` is
      // one list of facts to a reader, not a tree.
```

Lowering `And (0 < x) (And (x ≤ 1) (x < y))` produces a single `conjunction` with three
`conjuncts`, rendered `0 < x ∧ x ≤ 1 ∧ x < y`. The two-conjunct case:

```json
{
  "kind": "conjunction",
  "conjuncts": [
    {
      "kind": "relation",
      "relation": "less-than",
      "lhs": { "kind": "number", "value": 0, "display": "0", "path": "conclusion.args[0].args[2]" },
      "rhs": { "kind": "variable", "id": "_uniq.x", "symbol": "x", "path": "conclusion.args[0].args[3]" },
      "path": "conclusion.args[0]"
    },
    {
      "kind": "relation",
      "relation": "less-than-or-equal",
      "lhs": { "kind": "variable", "id": "_uniq.x", "symbol": "x", "path": "conclusion.args[1].args[2]" },
      "rhs": { "kind": "number", "value": 1, "display": "1", "path": "conclusion.args[1].args[3]" },
      "path": "conclusion.args[1]"
    }
  ],
  "path": "conclusion"
}
```

### `membership`

`Membership.mem`, with one detail that will bite anyone reading the Lean signature quickly:

```ts
      // `Membership.mem {γ α} [inst] (s : γ) (a : α)` — note that Lean puts the
      // collection first, while a reader writes `a ∈ s`.
```

Lowering `Membership.mem ℝ Set inst (Set.Icc 0 1) x`:

```json
{
  "kind": "membership",
  "element": { "kind": "variable", "id": "_uniq.x", "symbol": "x", "path": "conclusion.args[4]" },
  "collection": {
    "kind": "application",
    "head": "Set.Icc",
    "display": "[·, ·]",
    "args": [
      { "kind": "number", "value": 0, "display": "0", "path": "conclusion.args[3].args[2]" },
      { "kind": "number", "value": 1, "display": "1", "path": "conclusion.args[3].args[3]" }
    ],
    "path": "conclusion.args[3]"
  },
  "path": "conclusion"
}
```

Rendered `x ∈ [0, 1]`: the element first, the interval display filled in from its placeholders.
The `element`/`collection` field names, rather than positional `args`, are what keep the reversal
from having to be remembered twice.

### `opaque`

Same contract as the expression case. From `energy_cost_injective`, the corpus's current
deliberate unsupported fixture:

```json
{
  "kind": "opaque",
  "head": "Function.Injective",
  "display": "Injective(N ↦ N · landauerCost(kB, T, D))",
  "path": "conclusion"
}
```

The display is worth reading closely. ProofLens could not name `Function.Injective`, but it did
lower the argument: the lambda rendered as `N ↦ N · landauerCost(kB, T, D)`, with the local
constant `landauerCost` resolved to an application. This is what `opaqueDisplay` buys. The
classifier's rationale for this declaration reads:

```
`Function.Injective` is not in ProofLens's constant table yet.
```

The fixture is chosen adversarially: the function inside is affine, so a classifier that keyed on
the shape of the body rather than on the head could confidently emit a monotonicity figure for a
statement that is not about monotonicity.

Definitions also land here. `throughput`'s "conclusion" after `forallTelescope` is its codomain,
so the lowered proposition is `{ "kind": "opaque", "head": "Real", "display": "Real" }`.
`classifyDefinition` fires first on `kind === "definition"`, so this never reaches the
unsupported path, and `walkTheorem` skips a definition's conclusion entirely:

```ts
  // A definition's "conclusion" is its return type, not a claim. Counting `ℝ`
  // as an unreadable term would inflate the miss list with noise.
```

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
 *
 * …
 */
```

| Table | Size | Examples | What it maps to |
| --- | ---: | --- | --- |
| `RELATIONS` | 7 | `Eq`, `Ne`, `LE.le`, `LT.lt`, `GE.ge`, `GT.gt`, `Iff` | `RelationKind` |
| `BINARY_OPERATORS` | 6 | `HAdd.hAdd`, `HMul.hMul`, `HDiv.hDiv`, `HPow.hPow` | `OperatorKind` + symbol |
| `UNARY_OPERATORS` | 3 | `Neg.neg`, `Inv.inv`, `abs` | `OperatorKind` + symbol |
| `NAMED_FUNCTIONS` | 43 | `Real.sqrt`, `Real.log`, `Finset.sum`, `Set.Icc`, `Nat.floor`, `Max.max`, `ite` | display string |
| `POSITIONAL` | 3 | `DFunLike.coe`, `FunLike.coe`, `Function.comp` | a fixed argument index and a kind |
| `FILTERS` | 6 | `Filter.atTop`, `Filter.atBot`, `nhds`, `nhdsWithin`, `Filter.cofinite` | `FilterSpec` kind, label, point index |
| `TRANSPARENT` | 7 | `Nat.cast`, `Int.cast`, `OfNat.ofNat`, `Decidable.decide` | an argument index to descend into |
| `PREDICATES` | 25 | `Monotone`, `StrictMonoOn`, `Continuous`, `Summable`, `IsLUB`, `Set.InjOn` | `PredicateKind` + label |

One hundred constants in total. Two further tables, `RELATION_PHRASE` and `RELATION_SYMBOL`, map
each `RelationKind` to prose ("is at most") and to a symbol ("≤"). The explanation engine uses the
first, `renderProposition` the second.

Three of these tables carry design decisions worth reading rather than skimming.

`NAMED_FUNCTIONS` renders aggregations as named applications rather than as big-operator notation:

```ts
  // Aggregations. Rendered as named applications rather than big-operator
  // notation: `∑(s, i ↦ f i)` is honest about the two arguments, where a bare
  // `∑` would hide which set is being summed over.
```

The same table names `OrderDual.toDual` rather than making it transparent, because order duality
is a change of viewpoint and hiding it would silently turn a statement about the dual order into
a statement about the original.

`PREDICATES` mixes two populations. The first eight entries carry a real `PredicateKind`
(`monotone`, `strictly-monotone`, `antitone`, `strictly-antitone`) that `classifyMonotonicity`
acts on. The rest carry `predicate: "other"` and a label, and feed `classifyProperty`, which
reads them without interpreting them. Membership in this table is what recognition *means*:

```ts
  // Named properties ProofLens can *read* without claiming to interpret. Being
  // in this table is an explicit statement that ProofLens recognises the
  // property; anything absent stays `unsupported`, which is the honest answer
  // and keeps the unsupported-mathematics backlog meaningful.
```

### `POSITIONAL` and `FILTERS`

`POSITIONAL` exists because `valueArity` does not cover everything:

```ts
/**
 * Constants whose interesting argument sits at a fixed index rather than at the
 * end.
 *
 * Most Lean operations put their carrier type and instances first and their
 * mathematics last, which is what `valueArity` exploits. These do not: a
 * coercion or a composition can itself be applied to further arguments, so the
 * function sits at a known index with its own arguments trailing behind it.
 *
 * The indices are Lean-version-sensitive by nature. Every use is guarded on the
 * argument count, so a signature change degrades to `opaque` rather than
 * producing a confidently wrong reading.
 */
export const POSITIONAL: Record<string, { kind: "coercion" | "composition"; index: number }> = {
  // `DFunLike.coe {F α β} [inst] (f : F) : ∀ a, β a`
  "DFunLike.coe": { kind: "coercion", index: 4 },
  "FunLike.coe": { kind: "coercion", index: 4 },
  // `Function.comp {α β γ} (f : β → γ) (g : α → β) : α → γ`
  "Function.comp": { kind: "composition", index: 3 },
};
```

The guard is the important part and it is worth restating, because a fixed index into someone
else's signature is exactly the kind of thing that rots. `lowerExpression` checks
`node.args.length > positional.index` before touching the entry, and the composition branch
additionally checks that a second function argument exists. If mathlib changes the signature, the
term becomes `opaque` and shows up in the coverage backlog, which is a visible failure. Reading a
confidently wrong function out of the wrong slot would not be.

A coercion applied to no further arguments lowers to the coerced function itself; applied to
arguments, it becomes an `application` whose `display` is the rendered function. A composition
lowers to an `operator` with `op: "comp"` and symbol `∘`.

`FILTERS` supports the `limit` proposition:

```ts
/**
 * Filters ProofLens can describe in words.
 *
 * `Filter.Tendsto f l₁ l₂` was the single most common statement shape in the
 * analysis parts of mathlib that ProofLens could not read. Naming the filters is
 * what turns it from an opaque term into "f approaches L as its input grows
 * without bound".
 */
```

Each entry carries a `kind`, a prose `label`, and a `pointIndex`: `null` when the filter has no
point (`Filter.atTop`), a negative index counting from the end otherwise (`nhds` uses `-1`,
`nhdsWithin` uses `-2`). `lowerFilter` resolves the index against the *mathematical* arguments,
after `mathematicalArgs` has dropped the plumbing, and produces `kind: "unknown"` with
`label: "an unnamed filter"` for anything absent from the table.

### The `valueArity` convention

Lean threads carrier types and typeclass instances through every operation as leading arguments.
`x ≤ P / T` elaborates with `LE.le` applied to four arguments: `Real`, `Real.instLE`, `x`, and
the division. Only the last two carry mathematics.

`valueArity` counts the trailing arguments that do:

```ts
/**
 * …
 *
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

…

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
  "id": "_uniq.72",
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
- `planFunctionalRelationship` uses `meaning` and `units` for each input node's `detail`, falling
  back to the variable's `typeDisplay`.
- `theorem.concept` becomes the `subtitle` of bound, limit, monotonicity and relationship figures.
- `suggestedVisual` reaches `applyAuthorHint`, which may move the requested figure to the front of
  the planned list. It cannot create one. See [visual-ir.md](./visual-ir.md).

`domain`, `axis` and `role` are parsed, validated against `ALLOWED_KEYS`, and carried through to
`MathVariable.annotation`, but nothing reads them yet; see [roadmap.md](./roadmap.md).

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
  instances: MathInstance[];
  conclusion: Claim<MathProposition>;
  conclusionDisplay: string;
  definitionBody: { expression: MathExpression; display: string } | null;
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
| `hypotheses` | binders with `role === "hypothesis"` | `Prop`-valued binders that are not instances. Each carries the lowered `proposition`, its rendered `display`, and the `usage` record from the Formal IR verbatim. |
| `instances` | binders with `role === "instance"` | Typeclass instance binders, as `MathInstance` (`id`, `symbol`, `typeDisplay`). Recorded for completeness and provenance, deliberately excluded from `hypotheses`. |
| `conclusion` | `derive(lowerProposition(decl.conclusion.tree, "conclusion"), …)` | A `Claim`, not a bare value. Its rule is `MATHIR_UNRECOGNISED_001` when the result is opaque and `MATHIR_LOWER_PROP_001` otherwise. |
| `conclusionDisplay` | `renderProposition(conclusionProp)` | ProofLens's own rendering, built from the lowered tree. Unaffected by `notationFidelity`. |
| `definitionBody` | `lowerExpression(decl.definitionBody.tree, "definitionBody", …)` | What a definition unfolds to. `null` for theorems, and for definitions whose body the extractor judged too large. |
| `statementDisplay` | `decl.statement.pretty` | Lean's pretty printer, binders included. This *is* affected by `notationFidelity`. |
| `dependencies` | `decl.dependencies` | Every constant the type or proof term references, unfiltered. `localDependencyEdges` does the filtering. |
| `trust` | `decl.axioms`, `unusualAxioms(...)`, `decl.usesSorry`, `decl.proofTermAvailable` | `unusualAxioms` is everything beyond `propext`, `Classical.choice`, `Quot.sound`. |
| `annotations` | `parseDocstring(...).annotations` | All of them, including ones whose `target` matches no binder. |
| `suggestedVisual` | `@prooflens.visual` | Read by `applyAuthorHint` in the planner, via `resolveVisualHint`. See [visual-ir.md](./visual-ir.md). |
| `concept` | `@prooflens.concept` | Used as figure `subtitle`. |
| `ceiling` | `witness ? "verified" : "derived"` | The strongest status any claim about this declaration may carry. Degrades when the proof used `sorry`. |
| `provenance` | `sourceRefFor(doc, decl)` | Declaration-level source reference with its span. |

`MathIRDocument` wraps `theorems` with `mathIRVersion` (`"0.1.0"`), `system`, and
`notationFidelity` carried forward from the Formal IR.

### The instance split

`role` is assigned during extraction, not during lowering:

```lean
        -- A typeclass instance is plumbing, not an assumption a mathematician
        -- made. `[IsStrictOrderedRing α]` is `Prop`-valued and would otherwise
        -- be counted as a hypothesis, which distorts assumption sensitivity and
        -- fills figures with noise.
        , ("role", Json.str (
            if decl.binderInfo == BinderInfo.instImplicit then "instance"
            else if isProp then "hypothesis" else "parameter"))
```

The test is `binderInfo == instImplicit`, not a guess about the type. The mathlib sweep found 208
binders that the earlier `isProp`-only rule was counting as stated mathematical assumptions. The
ProofLens corpus has zero instance binders, because every declaration in it is stated over
concrete `ℝ`, which is why the problem was invisible until the tool was pointed at mathlib.

### Definition bodies

`definitionBody` is the one place a Lean *term* rather than a *statement* crosses into the IR, and
the boundary is drawn deliberately:

```lean
    -- A definition's body is the mathematics it introduces, and showing it is
    -- what turns a definition from an opaque name into a concept a reader can
    -- follow. Proof terms are excluded: they are enormous, and the interesting
    -- facts about them (which hypotheses they touch, which constants they use)
    -- are already computed above.
```

It is size-guarded (`exprSize body 4000 < 3000`, with fuel so the measurement itself terminates),
so a pathological definition yields `null` rather than a megabyte of JSON. For `landauerCost` the
result is:

```json
{
  "expression": { "kind": "operator", "op": "div", "symbol": "/", "args": ["…kB · T · log(2)…", "…D…"], "path": "definitionBody" },
  "display": "kB · T · log(2) / D"
}
```

Downstream, `classifyDefinition` emits a second classification when a body is present: the
definition *is* a functional relationship, with the defined name on one side and the quantities it
is built from on the other. That is what lets `landauerCost` and `rate_eq_count_div_time` share a
figure.

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
    { "kind": "fvar", "name": "x", "fvarId": "_uniq.135" },
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
        { "kind": "fvar", "name": "P", "fvarId": "_uniq.136" },
        { "kind": "fvar", "name": "T", "fvarId": "_uniq.137" }
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
    "id": "_uniq.135",
    "symbol": "x",
    "path": "conclusion.args[2]"
  },
  "rhs": {
    "kind": "operator",
    "op": "div",
    "symbol": "/",
    "args": [
      { "kind": "variable", "id": "_uniq.136", "symbol": "P", "path": "conclusion.args[3].args[4]" },
      { "kind": "variable", "id": "_uniq.137", "symbol": "T", "path": "conclusion.args[3].args[5]" }
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

The first step is not to write code. It is to find out whether the constant is worth adding, and
the tool for that is `prooflens coverage`.

### 1. Measure

```bash
cd lean
lake exe prooflens-extract MyProject.MyModule > /tmp/mine.json
prooflens coverage /tmp/mine.json
```

The report ends in two ranked backlogs, and which one your constant appears in decides what kind
of work it needs:

- **Backlog 1, unrecognised conclusion shapes.** No classifier read the statement at all. Adding
  the constant to a table is necessary but not sufficient; a classifier branch is also required.
- **Backlog 2, constants to add to the MathIR tables.** The statement classified fine and some
  term inside it is opaque. These are the cheaper wins: one table entry improves every statement
  that already works. A row marked `alsoUnrecognised` (`†` in the markdown output) is the
  exception — it has no already-classifying statements to improve.

Both are ranked by declarations affected, which is the number that should decide the order. This
is how the mathlib work was sequenced: `Filter.Tendsto` was added first because it sat at the top
of Backlog 1 with 44 declarations, not because limits are interesting.

If you are working from a single declaration rather than a module, the same information is in the
classifier stage:

```bash
prooflens inspect /tmp/mine.json my_theorem --stage classifier
```

The `STRUCTURE_UNSUPPORTED_001` entry's `payload.data.head` is the constant name, in full. That
name is what goes in the table: ProofLens matches on `headConstant`, which is the full dotted name
of the application's head `const` node.

### 2. Count the value arity

Look at the raw tree:

```bash
prooflens inspect /tmp/mine.json my_theorem --stage formal
```

Count the arguments of the application, then count how many of the *trailing* ones carry
mathematics. For `Real.tanh x` the answer is one: `Real.tanh` is monomorphic in `ℝ`, so there is
no carrier type or instance argument at all, and `valueArity: 1`. For a typeclass-generic
operation like `HAdd.hAdd`, the argument list is `α β γ inst a b` and `valueArity: 2`.

If the interesting argument is *not* at the end — a coercion, a composition, anything that can be
applied to further arguments — `valueArity` is the wrong mechanism and `POSITIONAL` is the right
one. Note that a `POSITIONAL` entry hard-codes an index into someone else's signature, so it must
stay guarded on the argument count.

### 3. Add the entry

Pick the table by what the constant *is*:

| The constant is | Table |
| --- | --- |
| a proposition-forming relation between two values | `RELATIONS` |
| an arithmetic operation with a conventional infix or prefix symbol | `BINARY_OPERATORS` / `UNARY_OPERATORS` |
| a function with a conventional name or notation | `NAMED_FUNCTIONS` |
| a coercion or composition whose function sits at a fixed index | `POSITIONAL` |
| a filter appearing in `Filter.Tendsto` | `FILTERS` |
| a coercion or literal wrapper that should be invisible | `TRANSPARENT` |
| a named property of a subject | `PREDICATES` |

```ts
export const NAMED_FUNCTIONS: Record<string, { display: string } & Signature> = {
  "Real.sqrt": { display: "√", valueArity: 1 },
  "Real.log": { display: "log", valueArity: 1 },
  "Real.tanh": { display: "tanh", valueArity: 1 },
  …
};
```

Two notes on `NAMED_FUNCTIONS` displays. A display containing `·` is treated as a template and
filled in by `renderExpression`, which is what makes `Set.Icc` render `[0, 1]`; a display without
one is called, as `log(2)`. And a `valueArity: 0` entry (`Set.univ`) renders as a bare name.

Adding to `PREDICATES` with `predicate: "other"` is enough to make `classifyProperty` fire; the
`label` is the phrase that appears in its rationale. Adding a genuinely new `PredicateKind` or
`RelationKind` is a bigger change: `RELATION_PHRASE` and `RELATION_SYMBOL` are exhaustive
`Record`s over `RelationKind`, so the compiler will list the sites to fill in, and a classifier
branch in `packages/classifier/src/classify.ts` is needed or the conclusion still classifies as
`unsupported`.

### 4. Make sure it traverses

If you added a new proposition or expression *kind* rather than a table entry, add it to
`walkExpression`/`walkProposition` in `traverse.ts` in the same change. A kind that lowers but
does not traverse disappears from coverage analysis, which means the backlog stops reporting
whatever is unreadable inside it. `packages/math-ir/test/propositions.test.ts` exists to catch
this: it checks each kind at lowering, rendering, and traversal.

### 5. Consider the sign rules

`signOf` in `packages/classifier/src/signs.ts` handles `application` nodes with a small number of
hard-coded cases:

```ts
    case "application": {
      // `√x` is nonnegative wherever it is defined.
      if (expr.head === "Real.sqrt") return "nonnegative";
      // `exp` is positive everywhere.
      if (expr.head === "Real.exp") return "positive";
```

If your function has a sign that follows from its definition rather than from a hypothesis, this
is where to say so. Leaving it `unknown` is always safe: it means parameter-sensitivity callouts
will be omitted, not that they will be wrong. It is not free, though. `Real.log` needed a rule
precisely because its absence silenced the Landauer bound:

```ts
      // `log` of a *literal* is decidable without any hypothesis. This matters:
      // constants like `log 2` appear in the denominator of real bounds, and
      // without this the whole bound becomes sign-unknown and ProofLens goes
      // silent about parameters it could legitimately reason about.
```

### 6. Verify, then re-measure

```bash
prooflens inspect /tmp/mine.json my_theorem --stage math      # the head should no longer be opaque
prooflens explain /tmp/mine.json my_theorem                   # the explanation layers should read correctly
prooflens coverage /tmp/mine.json                             # the backlog should have moved
```

The last one is the real check, and it is worth running over the committed mathlib slice as well
as over your own module: an entry that fixes one declaration and an entry that fixes forty look
identical in a diff.

If you hit a constant you cannot add yourself, file it with the
[`unsupported_mathematics` issue template](../.github/ISSUE_TEMPLATE/unsupported_mathematics.md).
Those reports are triaged into the same backlog the coverage report produces.

## Related documents

- [architecture.md](./architecture.md) — where MathIR sits in the pipeline
- [visual-ir.md](./visual-ir.md) — what the planner does with a `TheoremIR`
- [epistemic-model.md](./epistemic-model.md) — `Claim`, `derive`, and the lattice
- [adr/0003-semantic-annotations.md](./adr/0003-semantic-annotations.md) — why annotations live in docstrings
- [coverage.md](./coverage.md) — the measured backlogs the tables are grown from
- [roadmap.md](./roadmap.md) — table coverage and what is planned
