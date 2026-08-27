# Contributing to ProofLens

**Visual interpretability for formal mathematics**

ProofLens turns Lean 4 machine-verified mathematics into structured explanations
and visualizations. Thank you for wanting to help.

Before anything else, please read [**Epistemic discipline**](#epistemic-discipline).
It is the one section of this document that is not negotiable. ProofLens exists to
make formal mathematics legible *without* blurring the line between what a proof
assistant has verified and what a program or a language model has guessed. That
line is not a convention here — it is a type, enforced by code and guarded by a
test suite. A patch that is otherwise excellent will be rejected if it erodes it.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Table of contents

- [Getting set up](#getting-set-up)
- [Repository layout](#repository-layout)
- [Running the pipeline end to end](#running-the-pipeline-end-to-end)
- [Things that are committed and checked](#things-that-are-committed-and-checked)
- [Epistemic discipline](#epistemic-discipline)
- [Semantic annotations](#semantic-annotations)
- [Coding standards](#coding-standards)
- [Adding a new classifier](#adding-a-new-classifier)
- [Adding a new renderer](#adding-a-new-renderer)
- [Commits, branches, and pull requests](#commits-branches-and-pull-requests)
- [Documentation map](#documentation-map)
- [Reporting mathematics we cannot handle](#reporting-mathematics-we-cannot-handle)

---

## Getting set up

You need two toolchains: Lean (for extraction) and Node (for everything
downstream). They are independent. Because a full extraction is checked into the
repository, you can work on the whole TypeScript side — classifiers, renderers,
the web app — without ever installing Lean.

### Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| [elan](https://github.com/leanprover/elan) | latest | Lean toolchain manager. Installs the pinned Lean for you. |
| Lean | `4.24.0` | Pinned in `lean/lean-toolchain` and `corpus/lean-toolchain`. Do not install Lean by hand; let elan read the pin. |
| Node.js | `22.x` | What CI runs. `package.json` allows `>=20`, but 22 is the supported target. |
| pnpm | `10.x` | This is a pnpm workspace. npm and yarn will produce a broken tree. |

Install elan and pnpm if you do not have them:

```bash
# elan (Lean toolchain manager)
curl -sSfL https://elan.lean-lang.org/elan-init.sh -o elan-init.sh
sh elan-init.sh -y
# restart your shell, then confirm
elan --version

# pnpm via corepack (ships with Node 22)
corepack enable
corepack prepare pnpm@10 --activate
pnpm --version
```

### First build

```bash
git clone https://github.com/jdhart81/prooflens
cd prooflens

# TypeScript side — install once at the repo root, never inside a package
pnpm install
pnpm build
pnpm test
```

That is enough to run the tests, the CLI, and the web app against the checked-in
corpus. To build the Lean side as well:

```bash
# The extractor. Lean core only — no mathlib, so this is quick.
cd lean && lake build && cd ..

# The example corpus. This one does use mathlib; fetch the cache or it will
# build mathlib from source and take a very long time.
cd corpus && lake exe cache get && lake build && cd ..
```

### The commands that exist

Run these from the repository root. This table is the complete set of root
scripts; if a command is not here, it does not exist.

| Command | What it does |
| --- | --- |
| `pnpm build` | Builds the nine TypeScript packages in dependency order (`tsc -b`). |
| `pnpm build:widget` | Bundles the Lean infoview widget into `lean/ProofLens/Widget/prooflens.js`. |
| `pnpm clean` | Tears down build output across packages and `apps/web`. |
| `pnpm typecheck` | `tsc -b` over the packages, plus the widget's tsconfig. |
| `pnpm test` | The full vitest suite. |
| `pnpm test:watch` | Watch mode while you iterate. |
| `pnpm lint` | ESLint over `packages` and `apps`. |
| `pnpm format` / `pnpm format:check` | Prettier write / verify. CI runs `format:check`. |
| `pnpm prooflens <subcommand>` | The CLI. Requires `pnpm build` first — it runs `packages/cli/dist/bin.js`. |
| `pnpm extract:corpus` | Re-extracts the five corpus modules to `examples/corpus.formal-ir.json`. |
| `pnpm dev:web` | Starts the `apps/web` Vite dev server. (There is no `pnpm dev`.) |

Lean commands run inside their own project directory:

| Command | Where | What it does |
| --- | --- | --- |
| `lake build` | `lean/` | Builds the `ProofLens` library and the `prooflens-extract` executable. |
| `lake build ProofLensExamples` | `corpus/` | Builds the example corpus against mathlib. |
| `lake exe cache get` | `corpus/` | Fetches prebuilt mathlib artifacts. Do this before your first corpus build. |

Before opening a pull request, these must all be clean — they are what CI runs:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Plus `lake build` in `lean/` if you touched the extractor, and a corpus build if
you touched `corpus/`.

---

## Repository layout

```
prooflens/
├── lean/                      Lake project `prooflens` — LEAN CORE ONLY, no mathlib
│   ├── lean-toolchain         Pinned Lean version (4.24.0)
│   ├── lakefile.toml          lean_lib ProofLens; lean_exe prooflens-extract
│   ├── Main.lean              The `prooflens-extract` executable
│   ├── ProofLens.lean         Library root
│   ├── ProofLens/Extract/
│   │   ├── Expr.lean          Expression payloads (pretty-printed + structural)
│   │   ├── Declaration.lean   Formal IR for one declaration
│   │   ├── Module.lean        Whole-module extraction and the envelope
│   │   └── Focus.lean         One declaration plus what its proof reaches — for the widget
│   ├── ProofLens/Export.lean  The `#prooflens_export` command (the reference extraction path)
│   ├── ProofLens/Widget.lean  The `#prooflens` infoview command
│   ├── ProofLens/Widget/prooflens.js   Committed widget bundle, inlined via `include_str`
│   └── widget/src/index.tsx   The widget's React source (workspace package)
│
├── corpus/                    Lake project `prooflensCorpus` — DOES depend on mathlib
│   ├── lakefile.toml          requires mathlib AND `prooflens` at path ../lean
│   └── ProofLensExamples/     Bounds, Monotonicity, Implication,
│                              DependencyChain, IntelligenceBound
│
├── packages/                  TypeScript workspace packages
│   ├── epistemics/            The epistemic kernel: statuses, Claim, transcribe, derive
│   ├── formal-ir/             zod schema, loader, and the ONLY minter of kernel witnesses
│   ├── math-ir/               Lowering to mathematics: constant tables, annotations
│   ├── classifier/            The rulebook: what kind of statement is this
│   ├── visual-ir/             Planning figures: what to show, never how to draw it
│   ├── pipeline/              Wires the stages together
│   ├── renderer-svg/          VisualIR → SVG
│   ├── renderer-text/         VisualIR → text diagrams
│   └── cli/                   The `prooflens` command
│
├── apps/web/                  Vite + React shell (@prooflens/web)
├── examples/corpus.formal-ir.json   Committed extraction; CI checks it is current
├── docs/                      Architecture, epistemic model, IR references, ADRs
└── scripts/build-widget.mjs   esbuild bundling for the widget
```

### Two Lake projects, and why

This is the layout detail most likely to trip you up: **the example theorems are
not in `lean/`.** They live in `corpus/`, which is a separate Lake package.

- **`lean/` depends on Lean core and nothing else.** No mathlib. This is an
  architectural invariant, not an accident of packaging: the extractor has to be
  usable against *any* Lean project, and a mathlib dependency would force every
  user of ProofLens to adopt mathlib's toolchain and build times. The lakefile
  says so, and CI enforces it with a dedicated job (**`lean-core`**) that builds
  `lean/` on a machine with no mathlib cache. If a mathlib import creeps in,
  that job fails.
- **`corpus/` depends on mathlib *and* on `../lean`.** The examples exercise
  ProofLens against the mathematics people actually write rather than against
  toy stand-ins, which means real `Real`, real order typeclasses, real coercions.

So: extractor changes go in `lean/`, example theorems go in `corpus/`, and if you
find yourself wanting mathlib in `lean/` the answer is no — move whatever needs
it to `corpus/`, or find a way to do it with core.

### Other rules about the layout

1. **The Lean side never imports the TypeScript side.** Extraction is a one-way
   boundary; `lean/` knows nothing about MathIR, VisualIR, or renderers.
2. **Renderers consume VisualIR and nothing else.** That is what lets one
   analysis drive an infoview panel, a terminal, and a web page with no second
   implementation.
3. **Tests live in `packages/<pkg>/test/`, not beside the source.** Vitest only
   collects `packages/**/test/**/*.test.ts`.

---

## Running the pipeline end to end

ProofLens is a pipeline of intermediate representations:

```
Lean 4 environment
      │  extraction, inside Lean's own frontend
      ▼
  Formal IR      what Lean said: statements, binders, dependencies, axioms
      │  lowering — proof-assistant plumbing becomes mathematics
      ▼
   MathIR        constants resolved through tables; annotations parsed
      │  classification + sign analysis
      ▼
Classifications  what kind of statement this is, with a rationale
      │  planning
      ▼
  VisualIR       what to show — renderer-agnostic
      │  renderers
      ▼
   SVG · text · Lean infoview widget
```

### Step 1 — extract Formal IR

**Extraction runs through Lean's own frontend.** The CLI generates a small driver
file that imports your modules and invokes the `#prooflens_export` command, then
runs it with `lake env lean` inside the target project:

```bash
pnpm build   # the CLI runs from dist/

pnpm prooflens extract \
  --project corpus \
  --module ProofLensExamples.Bounds \
  --out /tmp/bounds.formal-ir.json
```

`--module` may be repeated. `--project` is any Lake project whose dependencies
include the `prooflens` library.

There is also a standalone `prooflens-extract` executable (`lean/Main.lean`,
built by `lake build` in `lean/`). It works, and it tries hard — it enables
initialiser execution and configures the pretty printer by hand — but
reproducing everything Lean's frontend sets up is a moving target. **When it
falls short, notation delaborators are missing and expressions come back raw**:
`LE.le x (HDiv.hDiv P T)` instead of `x ≤ P / T`.

Rather than guess which path you got, the extractor *measures*. It pretty-prints
a known expression and reports the result in the Formal IR envelope as:

```json
"notationFidelity": "notation"   // or "raw"
```

The frontend path is the reference one because it is the only one guaranteed to
report `notation`, and CI asserts exactly that after extracting the corpus. If
you see `"raw"`, your figures and explanations will be full of `HDiv.hDiv` and
the fix is to extract through the CLI rather than the standalone binary.

The reasoning is written up in
[ADR 0001](docs/adr/0001-lean-extraction.md) — read it before changing anything
about how extraction is driven.

### Step 2 — run the TypeScript stages

Every stage is inspectable from the CLI:

```bash
pnpm prooflens summary  /tmp/bounds.formal-ir.json
pnpm prooflens explain  /tmp/bounds.formal-ir.json simple_upper_bound
pnpm prooflens render   /tmp/bounds.formal-ir.json --out-dir /tmp/figures --format both
pnpm prooflens inspect  /tmp/bounds.formal-ir.json simple_upper_bound --stage math
```

`inspect --stage` accepts `formal`, `math`, `classifier`, `visual`, `explain`,
or `bundle`. Declarations may be given by full name or by their final component.
`render --format` accepts `svg`, `text`, or `both`.

`pipeline` does extraction and rendering in one step:

```bash
pnpm prooflens pipeline --project corpus \
  --module ProofLensExamples.Bounds --out-dir /tmp/out
```

When you have no reason to re-extract, work straight from the committed corpus:

```bash
pnpm prooflens summary examples/corpus.formal-ir.json
```

### Step 3 — look at it

In the browser:

```bash
pnpm dev:web
```

In the Lean infoview, which is the primary surface:

```lean
import ProofLens.Widget
import ProofLensExamples.IntelligenceBound

#prooflens ProofLens.Examples.information_rate_bound
```

Put your cursor on the command and the analysis appears in the infoview panel.
The widget uses focused extraction (`lean/ProofLens/Extract/Focus.lean`): one
declaration plus the declarations from its module that its proof actually
reaches, which is enough for a useful local dependency graph and far cheaper than
extracting everything.

---

## Things that are committed and checked

Three build products are checked into the repository, and CI fails if any of them
is stale. This is deliberate — each one buys something specific — but it means
**you have to regenerate and commit them when you change their inputs.**

### 1. The widget bundle

`lean/ProofLens/Widget/prooflens.js` is a committed esbuild bundle of
`lean/widget/src/`. `lean/ProofLens/Widget.lean` inlines it with `include_str`, which
is what lets `lake build` work with no Node toolchain present — a Lean user
should not need npm to see a figure.

After editing anything under `lean/widget/src/`:

```bash
pnpm build:widget
git add lean/ProofLens/Widget/prooflens.js
```

The bundle is intentionally unminified so the diff is readable. React and
`@leanprover/infoview` stay external, because the infoview supplies React through
an import map and a second copy would break hooks.

### 2. The extracted corpus

`examples/corpus.formal-ir.json` is a real extraction of the five corpus modules.
The test suite reads it from disk, so the whole suite runs on a machine with only
Node — no Lean, no mathlib. `apps/web/public/corpus.formal-ir.json` is a copy of
the same file, and it is what the web app fetches at runtime.

After changing anything in `lean/` or `corpus/`:

```bash
pnpm extract:corpus
cp examples/corpus.formal-ir.json apps/web/public/corpus.formal-ir.json
git add examples/corpus.formal-ir.json apps/web/public/corpus.formal-ir.json
```

CI re-extracts and compares `examples/corpus.formal-ir.json` (ignoring the
`toolchain` field); a stale file fails the build. **Review the diff by hand
before committing it** — a change to extraction shows up here first, and this is
the likeliest place for an epistemic regression to slip past unnoticed.

Note that **nothing automates or verifies the copy under `apps/web/public/`** —
no script, no Vite plugin, and CI checks only the `examples/` file. If you
re-extract and forget the copy, the tests and the CLI will use fresh data while
the web app silently serves the old extraction. Copy it in the same commit.
`pnpm --filter @prooflens/web verify` exercises the real browser data path
against that file and will catch a badly broken copy, though not a merely stale
one.

### 3. A corpus free of `sorry`

CI greps `corpus/ProofLensExamples/` for `sorry` and fails if it finds any. The
corpus is the data behind every test and every screenshot; a `sorry` in it would
mean ProofLens's own examples are not actually proved. If you add an example, it
has to be a real proof.

(ProofLens handles `sorry`-carrying declarations correctly by design — they never
get a kernel witness, so nothing about them can be `verified`. That is a property
worth testing, but not in the reference corpus.)

---

## Epistemic discipline

This is the core architectural commitment of ProofLens. Please read it in full
before contributing anything that adds, transforms, or displays information.

ProofLens shows users mathematics that a machine has verified, alongside
explanations and pictures that a machine has *not* verified. Those two kinds of
claim look equally confident on a screen unless the system works hard to keep
them apart. Keeping them apart is the product. As `@prooflens/epistemics` puts
it: if `verified` can be manufactured anywhere, the product is a lie with good
typography.

Start with [docs/epistemic-model.md](docs/epistemic-model.md). It is the document
that matters most, and everything else is machinery in service of it.

### The six statuses

Every piece of information carries one, ordered from strongest to weakest:

| Status | Meaning | Where it may come from |
| --- | --- | --- |
| `verified` | Asserted by the Lean kernel. | **Lean extraction only**, through a kernel witness. |
| `derived` | Computed from verified data by a deterministic, inspectable rule. | Rules, via `derive`. |
| `interpreted` | A reading of the formal statement, or a human author's declaration about it. | Rules; semantic annotations. |
| `heuristic` | A rule of thumb, expected to be wrong sometimes. | Rules that opt into it. |
| `illustrative` | A display choice. It makes no mathematical claim. | Planning and rendering. |
| `speculative` | Produced by a language model or other unverified source. | Model output, when it arrives. |

### This is enforced in code, not by convention

You do not have to remember these rules, and you cannot accidentally break them.
The kernel in `packages/epistemics/src/index.ts` makes two properties true of the
running program:

**1. `verified` cannot be manufactured.** The only function that produces it is
`transcribe`, and it demands a `KernelWitness`:

```ts
export function transcribe<T>(witness: KernelWitness, value: T, provenance): Claim<T>
```

The witness is branded with a **module-local** `unique symbol` — deliberately
`Symbol(...)` and not `Symbol.for(...)`, because a registry symbol is reachable
by any code in the realm that knows the string, which would make the brand a
spelling anyone could copy rather than a capability. Since the symbol never
leaves its module, `mintKernelWitness` is the only door, and it is called from
exactly one place: the Formal IR loader in `@prooflens/formal-ir`. It returns
`null` for any declaration whose proof reaches `sorry`, so no `verified` claim
about such a declaration can exist. `transcribe` also checks `Object.hasOwn`, so
the brand must be *held*, not merely inherited.

**2. Confidence only ever decreases.** `derive` folds the rule's ceiling, every
input's status, **and a hard `"derived"` floor** through `weakest`:

```ts
const status = weakest(rule.produces, "derived", ...inputs.map((c) => c.status));
```

`Rule.produces` is typed `Exclude<EpistemicStatus, "verified">`, so a rule cannot
even *declare* kernel standing. The runtime floor is there because types are
erased and this module's job is to be true of the running program, not only of
the one that typechecked: a cast, or a plain JavaScript caller, still gets
`derived`. `weaken` likewise only moves downward — weakening a `speculative`
claim "to `verified`" leaves it `speculative`.

The guard is
[`packages/epistemics/test/no-forged-verification.test.ts`](packages/epistemics/test/no-forged-verification.test.ts).
It attempts forgery by every route we could think of — plain objects, null
prototypes, registry-symbol brands, inherited brands, casts past the type, rules
with `produces: "verified" as never` — and it walks the entire real corpus
asserting that no `verified` claim carrying a rule exists anywhere in the output
of lowering, classification, and planning.

**If a change of yours makes that file fail, do not adjust the test.** It is not
a unit test of an implementation detail; it is the executable statement of what
ProofLens is for. Changing it is a change to the project's purpose and needs to
be argued as such, in the PR, on those terms.

### What is still on you

The kernel stops forgery. It cannot stop carelessness. These remain your job:

1. **Tag at the point of creation.** Use `transcribe` (extraction only), `derive`
   (rules), or `state`/`assert_` (annotations, display choices, model output).
   Never assemble a `{value, status, provenance}` object by hand.
2. **Choose an honest ceiling.** `Rule.produces` is a promise about how reliable
   your rule is. A syntactic pattern match that will sometimes be wrong is
   `heuristic`, not `derived`, and saying so costs you nothing.
3. **Carry provenance.** Every claim records `sources` — a system, a declaration,
   and a structural `path` into the expression tree such as `conclusion.args[3]`.
   That path is what lets the UI answer "why are you showing me this?" by
   highlighting the exact subterm responsible. A transformation that drops
   provenance is a bug on the same footing as one that drops the status.
4. **Never let model output become mathematics.** When AI adapters arrive, their
   output enters as `speculative` and stays there. It may be *displayed*
   alongside the mathematics; it may never be an input to a rule that produces
   `interpreted` or better, and it may never be written into a MathIR field a
   classifier also writes.
5. **When in doubt, tag lower.** Under-claiming costs a user a little confidence
   in a true statement. Over-claiming costs the project the only thing that makes
   it worth using. If you and a reviewer disagree between `derived` and
   `interpreted`, it is `interpreted`.

### A worked example

For `theorem foo (h : 0 < n) : ...`:

- The binder `h` exists and its type prints as `0 < n` — `verified`, transcribed
  from Lean under a kernel witness.
- `h` does not occur in the elaborated proof term — `derived`, a mechanical
  occurrence check. Note what this does *not* say: the hypothesis may still be
  mathematically necessary; this proof simply does not touch it. ProofLens says
  it that way, and so should you.
- `h` is "a positivity constraint on `n`" — `derived` if it comes from the
  constant tables and the conclusion's structure; `heuristic` if you are pattern
  matching on surface syntax.
- `n` means "operating temperature in kelvin" — `interpreted`. A human wrote it
  in a docstring annotation; Lean checked nothing about it.
- The axis you plotted it on and the colour of the arrow — `illustrative`.

---

## Semantic annotations

Formal statements do not carry the information a picture needs: that `P` is a
power in watts, that this theorem is "the information-rate bound", that `T`
belongs on the x-axis. Lean docstrings are the cheapest place to put that — they
already exist, they are already extracted, and adding one requires no
metaprogramming from the author.

The syntax is one directive per line inside a docstring:

```lean
/--
The information rate of a machine is bounded by its power budget.

@prooflens.var P meaning="electrical power drawn by the machine" units="W" domain="positive reals" axis="x"
@prooflens.var T meaning="operating temperature of the heat bath" units="K" domain="positive reals"
@prooflens.visual functional-relationship
@prooflens.concept "energy budget"
-/
theorem information_rate_bound ...
```

- **`@prooflens.var <binder> key="value" ...`** — recognised keys are `meaning`,
  `units`, `domain`, `axis`, and `role`. Unknown keys are ignored; a `var`
  directive with no recognised key is recorded as malformed.
- **`@prooflens.visual <visual-type>`** — suggests a figure. The value must
  resolve through `resolveVisualHint`, which accepts either a `VisualType`
  (`upper-bound-plot`, `number-line`, `monotonicity-plot`, `relationship-diagram`,
  `dependency-graph`, `implication-graph`, `expression-tree`, ...) or one of the
  friendlier aliases authors actually write — `positivity-fact` and `sign-fact`
  map to `number-line`, `functional-relationship` and `equation-map` map to
  `relationship-diagram`. See `VISUAL_HINT_ALIASES` in
  `packages/visual-ir/src/plan.ts` for the full list. It is a hint, not a
  command: an unresolvable value is ignored rather than obeyed.
- **`@prooflens.concept "<name>"`** — the human name for what the theorem is
  about.

Everything else in the docstring is preserved as prose. Lines beginning
`@prooflens.` that cannot be parsed are collected as `malformed` and surfaced
rather than silently dropped.

**Annotations are `interpreted`, never `verified`.** They are a human being's
claim about what the symbols mean, and Lean checked exactly none of it. A
docstring saying `T` is a temperature is worth showing and worth labelling, and
ProofLens does both: the explanation output says in as many words that these
readings come from the declaration's annotations, not from anything Lean checked.
Nothing downstream may promote them, and a wrong annotation is a wrong
*interpretation*, not a wrong theorem.

See [ADR 0003](docs/adr/0003-semantic-annotations.md) for why this lives in
docstrings rather than in a Lean attribute.

---

## Coding standards

### TypeScript

- **Strict mode**, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, and
  `noFallthroughCasesInSwitch` (see `tsconfig.base.json`). Do not relax compiler
  options per package.
- **No `any`.** `@typescript-eslint/no-explicit-any` is an error, everywhere —
  not merely in public APIs. Prefer `unknown` plus a narrowing check.
- **`unknown` at the edges.** Anything crossing a process boundary arrives as
  `unknown` and is parsed, not cast.
- **Pure stage functions.** Lowering, classification, and planning are pure
  functions from document to document: no I/O, no clock, no randomness. Only the
  CLI and the extractor touch the filesystem or spawn processes.
- **Minimal dependencies.** This is a stated project rule. The CLI parses its own
  arguments by hand rather than take a dependency for six subcommands. Adding a
  runtime dependency needs a justification in the PR.

### Validation, and where zod actually lives

**zod validates one boundary: Formal IR.** `packages/formal-ir/src/schema.ts` is
the schema, and `parseFormalIR` / `parseFormalIRJson` are the doors. That is the
point where untrusted JSON — possibly from a different extractor version —
enters the system, so it is the point that needs a runtime check. A failure
throws `FormalIRParseError` carrying the zod issues.

MathIR and VisualIR are *not* zod-parsed, and this is deliberate rather than an
omission. They are never deserialised from an untrusted source: they are
constructed in-process by typed code, one stage handing a value to the next.
Their contracts are the TypeScript types in `packages/math-ir/src/types.ts` and
`packages/visual-ir/src/types.ts`. Adding a redundant runtime schema there would
cost time on every declaration and buy nothing.

So: **if you add a new way for data to enter the system from outside, it needs a
zod schema.** If you add a field to an internal IR, it needs a type and a test.
Do not "improve consistency" by wrapping the internal IRs in schemas.

### Lean

- Match the surrounding style: two-space indent, module docstring at the top of
  every file, docstrings on public definitions, the standard copyright header.
- **Keep `lean/` free of mathlib.** See above; CI enforces it.
- **Keep the extractor deterministic and interpretation-free.** `lean/` produces
  transcription and mechanical computation only. A rule that decides what a
  theorem *means* belongs in a TypeScript classifier, where it can be versioned,
  tested, and tagged.
- Never emit a field whose meaning is not stated precisely in the emitting
  function's docstring. Downstream code has to tag your field, and it can only do
  that correctly if you said exactly what it means.

### Tests

- Vitest. Tests live in `packages/<pkg>/test/**/*.test.ts`.
- Most tests run against the real committed corpus via
  `packages/pipeline/test/helpers.ts`, which gives you `corpus()` and
  `corpusRaw()`. Prefer real extracted data over hand-written JSON — hand-written
  fixtures drift from what Lean actually emits.
- **Assert the epistemic status and the provenance, not just the value:**

  ```ts
  expect(classification.claim.status).toBe("derived");
  expect(classification.claim.provenance.rule?.id).toBe("RELATION_UPPER_BOUND_001");
  ```

---

## Adding a new classifier

This is the most common contribution and the most closely reviewed. Teaching
ProofLens a new kind of statement usually touches four files in order. Not every
change needs all four — a new constant may need only the first.

### 1. Teach MathIR the constants — `packages/math-ir/src/tables.ts`

Lowering resolves Lean constants through data tables. Add your constant to the
right one: `RELATIONS`, `BINARY_OPERATORS`, `UNARY_OPERATORS`, `NAMED_FUNCTIONS`,
`PREDICATES`, or `TRANSPARENT` (for coercions and `OfNat` machinery that should
be seen through rather than displayed).

Every entry carries a **`valueArity`**, and getting it right is the whole trick:

> `valueArity` counts the **trailing** arguments that carry mathematics.

Lean threads carrier types and typeclass instances as *leading* arguments, so
`LE.le` appears as `LE.le ℝ inst x y` — four arguments, of which only the last
two are the ones a reader cares about. Hence `valueArity: 2`. Likewise
`Real.sqrt` is `valueArity: 1`, and `MonotoneOn` is `valueArity: 2` because it
takes a function and a set. Get this wrong and the lowered expression will
contain instance plumbing where mathematics should be, which is exactly the
noise MathIR exists to remove.

These tables are the entire semantic analysis of v0.1, and keeping them as data
rather than code is deliberate: they are the part that grows as ProofLens learns
more mathematics, and each entry is independently testable.

### 2. Declare the rule — `packages/classifier/src/rules.ts`

Add an entry to `RULES` with a stable id:

```ts
POSITIVITY: {
  id: "RELATION_POSITIVITY_001",
  description: "The conclusion asserts that a quantity has a definite sign.",
  produces: "derived",
},
```

Conventions, from the existing rulebook:

- **Ids are `SCREAMING_SNAKE_CASE` with a numeric suffix**, prefixed by what they
  are about: `RELATION_`, `PREDICATE_`, `PROPOSITION_`, `PROOF_`, `PARAMETER_`,
  `DECLARATION_`, `GRAPH_`, `STRUCTURE_`.
- **`description` is one sentence, phrased as what the rule concluded.**
- **`produces` is the strongest status the rule may ever emit.** The type
  excludes `verified`; pick honestly among the rest.

**Rule ids are public API.** They appear in provenance output, in the UI's
"why did it say that?" surface, in tests, and in issue reports. **Renaming one is
a breaking change.** If behaviour changes materially, add a new id with a bumped
suffix and retire the old one; do not silently repoint an existing id at
different logic.

### 3. Write the classifier — `packages/classifier/src/classify.ts`

Add a `classifyX(theorem: TheoremIR): Classification[]` function. Return an empty
array when it does not apply — classifiers are total and must never throw on
input they do not recognise. Build results with `makeClassification`, which wires
up `derive` and provenance for you, and register the function in the
`classifyTheorem` dispatch list.

The **`rationale`** is the part reviewers will read hardest. It must name the
concrete evidence, not restate the rule:

```ts
// Good — names the actual terms and where they sat.
`The conclusion \`${theorem.conclusionDisplay}\` puts \`${renderExpression(bounded)}\`
 on the smaller side of \`${symbol}\`, so \`${renderExpression(bound)}\` is an upper
 bound for it.`

// Bad — a restatement of the rule's description.
`This theorem establishes an upper bound.`
```

A user reading the rationale should be able to check your reasoning against the
statement in front of them without knowing anything about ProofLens internals.

Also pass the structural `path` of the subterm responsible. That is what lets the
UI highlight the exact expression that made the rule fire.

If a classification has a preferred *reading*, say which one. `a ≤ b` bounds `a`
above and `b` below; both are true and ProofLens reports both, but only one is
what a reader means. That is what the `natural` flag on the bound payloads is
for, and why `0 < log 2` presents as "log 2 is positive" rather than the correct
and useless "0 is bounded above by log 2".

### 4. Plan a figure — `packages/visual-ir/src/plan.ts`

If the new classification deserves a picture, add a case to the switch in
`planVisuals` and a `planX(theorem, classification): VisualSpec | null` beside
the existing planners. Returning `null` is fine and common: **not every true
statement has a good picture, and a bad picture is worse than none.**

Figures carry their own epistemic annotations — `epistemicNotice` exists so that
a schematic plot says it is schematic. If your figure's axes or shape are chosen
for legibility rather than mathematical necessity, `weaken` the claim to
`illustrative` and say why.

### 5. Test it

In `packages/classifier/test/` and `packages/visual-ir/test/`:

- **A positive case** — asserting the payload, the status, the rule id, and that
  the rationale mentions the right terms.
- **A negative case** — a near-miss where the rule must *not* fire. This is the
  important one. A rule with no test that it declines to fire is a rule that will
  eventually fire on everything.
- **Ideally a real theorem** in `corpus/ProofLensExamples/`, re-extracted with
  `pnpm extract:corpus` so the rule is exercised against genuine Lean output.

Finally: if nothing matches, `classifyTheorem` falls back to the `UNSUPPORTED`
rule, which explains *why* and still shows the statement, its structure, its
hypotheses, and its dependencies. Discarding mathematics because it cannot be
drawn is the one outcome ProofLens is not permitted to have. Preserve that
behaviour.

---

## Adding a new renderer

A renderer consumes VisualIR and produces output. Today there are two
(`renderer-svg`, `renderer-text`) plus the Lean infoview widget, which consumes
the same VisualIR through the SVG renderer.

1. **Create a package** under `packages/` and add it to the `build`, `clean`, and
   `typecheck` script lists in the root `package.json` (they name packages
   explicitly, in dependency order).

2. **Export a render function** taking a `VisualSpec` and options, matching the
   shape of the existing two:

   ```ts
   export function renderSvg(spec: VisualSpec, options: SvgOptions = {}): string;
   export function renderText(spec: VisualSpec, options: TextOptions = {}): string;
   ```

   There is no plugin registry to register with, and the CLI selects output with
   `--format svg|text|both` rather than a renderer name. Keep it that way unless
   you are adding a third format, in which case extend `--format` in
   `packages/cli/src/bin.ts` and update the usage text.

3. **Do no mathematics.** A renderer may not classify, infer, or decide what
   something means. Positions in VisualIR are *logical* — `layer`/`order` for
   graphs, normalised `[0,1]` coordinates for plots — and turning those into
   geometry is the renderer's entire job. If you need a fact VisualIR does not
   carry, add it upstream with a proper status tag rather than computing it here.

4. **Render epistemic status visibly.** Every renderer must give the statuses
   distinct, documented affordances, and must never show `speculative` or
   `heuristic` content in the same visual register as `verified` content. A user
   who learns what "unverified" looks like in one view must recognise it in
   every other.

5. **Degrade honestly.** If you cannot express a mark, show that something was
   omitted. A picture that quietly loses a hypothesis is worse than no picture.

6. **Test against the real corpus** in `packages/<pkg>/test/`, including a spec
   carrying non-`verified` content so the labelling is covered.

[docs/visual-ir.md](docs/visual-ir.md) is the reference, and has a section on
adding a renderer.

---

## Commits, branches, and pull requests

### Sign-off

**DCO sign-off is not required.** No `Signed-off-by` line, no CLA. Contributions
are accepted under the [Apache 2.0 licence](LICENSE) — as Section 5 puts it,
anything you intentionally submit for inclusion is licensed under those terms
unless you say otherwise.

**Tests, however, are required.** A pull request that changes behaviour without
adding or updating a test will be asked for one before review continues. We keep
process ceremony low and test coverage high.

### Branches

Branch off `main`. Name branches `<kind>/<short-description>`, e.g.
`feat/tendsto-classifier`, `fix/valuearity-monotoneon`.

### Conventional commits

```
<type>(<scope>): <short imperative summary>

<optional body — why, not what>

<optional footer — BREAKING CHANGE:, Closes #123>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, `revert`.

Scopes follow the packages: `lean`, `corpus`, `epistemics`, `formal-ir`,
`math-ir`, `classifier`, `visual-ir`, `pipeline`, `renderer-svg`,
`renderer-text`, `cli`, `web`, `widget`, `docs`.

Examples:

```
feat(math-ir): add Real.rpow to the named function table

valueArity 2 — Lean threads the carrier and instance ahead of the base
and exponent.

fix(classifier): prefer the natural reading of 0 < log 2

Scoring both readings stops `0` being reported as the bounded quantity.

feat(visual-ir)!: carry provenance on every annotation

BREAKING CHANGE: planners must supply a SourceReference per annotation.
```

Subject lines are imperative, lowercase after the colon, no trailing period,
under 72 characters. Add `!` before the colon for a breaking change and explain
it in a `BREAKING CHANGE:` footer.

### Pull requests

- Keep them focused. One classifier, one fix, one refactor.
- Fill in the [pull request template](.github/pull_request_template.md),
  particularly the epistemic-status and provenance boxes.
- Green CI. The three jobs are **`typescript`** (typecheck, lint, format check,
  test, web build, widget typecheck, widget bundle freshness), **`lean-core`**
  (builds `lean/` with no mathlib), and **`lean-corpus-e2e`** (builds the corpus,
  greps for `sorry`, extracts, asserts `notationFidelity: "notation"`, runs the
  full pipeline, checks the committed Formal IR is current, and elaborates the
  widget).
- Regenerate and commit the widget bundle and the corpus extraction if you
  changed their inputs.
- Update `docs/` or add an ADR if you changed architecture.
- **No new proprietary API dependency in the core path.** Extraction → MathIR →
  classification → VisualIR → render must run fully offline, deterministically,
  with no account and no API key. AI features, when they arrive, are optional
  adapters outside that path. A PR that makes a core stage require a hosted
  service will not be merged, however good the results are.

Review aims for a first response within a week. Maintainers may push small
fix-ups to your branch to land a change faster; say so in the PR if you would
rather they did not.

---

## Documentation map

| Document | What it covers |
| --- | --- |
| [docs/epistemic-model.md](docs/epistemic-model.md) | **Start here.** The distinction the whole project exists to maintain. |
| [docs/architecture.md](docs/architecture.md) | The stages, the packages, and what each one is forbidden to do. |
| [docs/math-ir.md](docs/math-ir.md) | The semantic representation, and how to teach it a new constant. |
| [docs/visual-ir.md](docs/visual-ir.md) | The visualization representation, and how to add a renderer. |
| [docs/roadmap.md](docs/roadmap.md) | What v0.1 actually does, with real numbers, and what comes next. |
| [ADR 0001](docs/adr/0001-lean-extraction.md) | How extraction works, why it runs inside Lean's frontend, and why we do not build a tracer. |
| [ADR 0002](docs/adr/0002-first-rendering-surface.md) | Why the Lean infoview was the first surface. |
| [ADR 0003](docs/adr/0003-semantic-annotations.md) | Why annotations live in docstrings rather than a Lean attribute. |

---

## Reporting mathematics we cannot handle

If ProofLens extracts a Lean theorem but cannot classify or visualize it, that is
not a nuisance report — it is the single most useful thing you can send us. The
constant table is deliberately modest, so coverage of mathlib at large is low,
and these reports are how it grows.

Please open an [**unsupported mathematics**](.github/ISSUE_TEMPLATE/unsupported_mathematics.md)
issue with the declaration, its module, and the emitted Formal IR. Those reports
drive the classifier roadmap.

Questions that are not bug reports are welcome in
[Discussions](https://github.com/jdhart81/prooflens/discussions).
Suspected security issues go through GitHub's private vulnerability reporting
(Security → Report a vulnerability) — see
[SECURITY.md](SECURITY.md), and please do not open a public issue for those.
