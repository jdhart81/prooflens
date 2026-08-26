# Roadmap

This document is meant to be checkable. The "what it does today" section describes the code in
this repository, with numbers taken from two real extractions: `examples/corpus.formal-ir.json`
(the project's own corpus) and a 679-declaration mathlib slice whose full report is committed as
[coverage.md](./coverage.md) and `examples/mathlib-coverage.json`. Both are reproducible with
`prooflens summary` and `prooflens coverage`. The forward-looking sections describe intent, and
nothing in them is a commitment to a date.

## The working method

ProofLens understands mathematics through explicit constant tables and explicit classifier rules.
Which entries are missing, and which of the missing ones matter, is an empirical question, so it
is answered by measurement rather than by taste.

`prooflens coverage` produces two separately ranked backlogs over any body of Lean: statement
shapes no classifier reads, and constants that appear inside statements that already classify.
The second is usually the cheaper win. Everything in the "what it does today" section below was
built by taking the top of one of those two lists, implementing it, and re-measuring. See
[The coverage loop](./architecture.md#the-coverage-loop) for the mechanism.

## What v0.1 does today

ProofLens extracts Lean 4 declarations into a Formal IR, lowers them into a MathIR, runs
deterministic classifiers over that, plans figures, and renders them as SVG or plain text. There
is no language model anywhere in the core. Three surfaces run the identical TypeScript pipeline:
a Lean infoview widget, a CLI, and a browser application.

### Measured against mathlib

Seven modules, 679 declarations, at `notationFidelity: "notation"`:

| | Round 0 | Round 1 | Round 2 |
|---|---:|---:|---:|
| Structurally classified | 516 (76.0%) | 582 (85.7%) | **653 (96.2%)** |
| Fully readable | 230 (33.9%) | 443 (65.2%) | **552 (81.3%)** |
| Classified with opaque subterms | 286 | 139 | 101 |
| Unrecognised shape | 163 | 97 | **26** |

"Fully readable" is the strict number: the conclusion classified *and* every term inside it has a
name in ProofLens's tables. "Structurally classified" is the weaker one: ProofLens recognised the
statement's shape, which does not mean the resulting figure is illuminating.

Two rounds of work separate those columns, and neither was planned in advance:

- **Round 1** took the top of the backlog. `Filter.Tendsto` was the single most common unreadable
  shape at 44 declarations, so ProofLens gained a `limit` proposition kind, a `FILTERS` table, a
  classifier that separates convergence from divergence, and a `limit-plot` figure. The round also
  fixed a measurement error the report itself exposed: 208 typeclass instance binders were being
  counted as mathematical hypotheses, which distorted assumption sensitivity and filled the opaque
  backlog with entries like `IsStrictOrderedRing`.
- **Round 2** worked the tail: named properties (`Continuous`, `Summable`, `CauchySeq`, `IsLUB`),
  `StrictMonoOn`/`StrictAntiOn`, conjunctions, set membership, intervals, coercions and
  compositions.

The 653 classified declarations break down as 165 `equivalence`, 108 `upper-bound`, 104
`equality`, 72 `monotonicity`, 52 `property`, 44 `limit`, 36 `positivity`, 22 `existence`, 20
`lower-bound`, 13 `functional-relationship`, 7 `distinctness`, 6 `definition`, 4 `conjunction`.

### Measured against the project's own corpus

Five modules, 35 declarations:

```
  declarations              35
  structurally classified   34
  unsupported structure     1
  with unused hypotheses    2
  proved with sorry         0
  unusual axioms            0
  figures planned           75

  figures by epistemic status:
    derived         46  Computed from the verified statement by a deterministic rule.
    illustrative    29  A display choice. It makes no mathematical claim.
```

The single unsupported declaration is `energy_cost_injective`, headed by `Function.Injective`. It
is there on purpose, as the corpus's standing check that ProofLens fails cleanly rather than
plausibly: the function inside it is affine, so a classifier keying on the shape of the body
rather than on the head of the proposition could easily emit a monotonicity figure for a statement
that is not about monotonicity.

Its predecessor in that role, `unsupported_tendsto_fixture`, was renamed `sequence_limit_example`
when limits became supported. The statement and its proof are unchanged; only the tooling moved.
The old docstring's claim that its content "lives in the interaction between two filters, which
the v0.1 renderer has no vocabulary for" was true when it was written and is not true now, and
the corpus keeps the history because it is the one worked example of a measured gap being closed.

### What the deterministic core contains

- 6 epistemic statuses, one lattice, one combinator (`weakest`), one producer of `verified`
  (`transcribe`) gated on a witness only `@prooflens/formal-ir` can mint.
- 20 named rules in `RULES`, each with a stable id that appears in provenance output.
- 100 Lean constants across the eight tables in `math-ir/src/tables.ts`: 7 relations, 6 binary
  operators, 3 unary operators, 43 named functions, 3 positional constants, 6 filters, 7
  transparent wrappers, 25 predicates.
- 8 proposition kinds, 7 expression kinds, 11 visual types, 2 renderers.
- 7 explanation layers (`formal`, `mathematical`, `structural`, `assumptions`, `parameters`,
  `trust`, `domain`), each carrying its own `Claim` and its own status.
- 1,116 tests across 24 files, run by `pnpm test` and by CI on every push.

## Known limitations

Stated plainly, because a reader who discovers these on their own will trust the rest of the
output less.

### Coverage is high on order and analysis, and unmeasured elsewhere

The 96.2% and 81.3% figures are over seven modules chosen from order theory, real analysis and
inequalities, which is exactly where ProofLens's classifiers are aimed. That is a selection bias
and the coverage document says so. Algebra, topology and category theory are not in the slice;
coverage over them would be lower, and by how much is not currently known.

What can be said is what the tail looks like where it has been measured. The remaining 26
unrecognised declarations are a genuine long tail rather than one missing feature: six of them are
headed by an unnamed structure, and the rest are spread across `Asymptotics.IsLittleO` (3),
`Filter.EventuallyEq` (2), `Function.Injective` (2), `Not` (2), `StrictConcaveOn` (2),
`WellFoundedGT` (2), `WellFoundedLT` (2), and one each of `DenselyOrdered`, `Filter.HasBasis`,
`Function.Surjective`, `IsGreatest`, `IsSquare`. No single addition moves the number much.

### Recognising a property is not understanding it

`classifyProperty` reads `Continuous f` and reports "the theorem asserts that `f` is continuous".
It does not know what continuity means, cannot draw it, and cannot reason with it. 52 of the 653
classified mathlib declarations are in this category, and they contribute to "structurally
classified" without contributing much to a reader.

Recognition requires an explicit `PREDICATES` entry, deliberately. A blanket rule matching any
predicate would have pushed the classified number toward 100% while the backlog, which is the
instrument that tells us what to build, went quiet.

### No tactic-level or proof-state analysis

ProofLens sees the final elaborated proof term, plus definition bodies. It does not see the tactic
script, the intermediate goals, or the order in which they were closed.

This bounds the assumption-sensitivity result in a specific way. `unusedInProof` means the free
variable does not occur in the elaborated term, in any later binder type, or in the conclusion. A
hypothesis can be doing real work the occurrence check cannot see, and a different proof of the
same statement may need a hypothesis this one does not. Every such figure ships with that caveat
attached, and the caveat is not boilerplate; it is the accurate description of what was computed.

### Assumption sensitivity found nothing in mathlib, and that is the finding

Over the slice, `prooflens coverage` analysed 437 declarations that had both a proof term and at
least one stated hypothesis, and reported **zero** with a hypothesis the proof never references.

This is a calibration result, not a disappointment, and it deserves to be stated rather than
buried. Mathlib is curated and linted, and Lean's `variable` mechanism only includes variables a
declaration actually mentions, so redundant hypotheses do not survive to be found. Assumption
sensitivity is therefore **not a tool for auditing a mature library**. It is a tool for drafts,
for reformalizations, and above all for machine-generated proofs, where redundant hypotheses
accumulate precisely because nothing is grooming them. ProofLens's own hand-written corpus, which
nobody linted for this, has two.

The consequence for the roadmap is concrete: the highest-value place to point this analysis is at
proof output that has not been through human review, and "assumption sensitivity across theorem
families" below is worth more than assumption sensitivity over any single curated library.

### Plots are schematic, not numeric

Nothing in ProofLens evaluates an expression. There is no arithmetic on `MathExpression`, no
sampling, and no numeric axis. Every axis the planner emits carries `scale: "schematic"` and
`epistemic: "illustrative"`, and every bound, number-line, monotonicity and limit plot is
therefore an `illustrative` figure: 29 of the corpus's 75, and 316 of the slice's 1,490. What a
bound plot tells you is which side of the bound a quantity lies on. It tells you nothing about how
far.

The sign and direction analysis in `signs.ts` is symbolic and conservative, and returns `unknown`
for anything its rules do not cover. It has three unconditional facts (`Real.sqrt` nonnegative,
`Real.exp` positive, `Real.log` of a numeric literal) and otherwise reads signs off the theorem's
own hypotheses.

### Dependency graphs are single-module

`localDependencyEdges` keeps only edges between declarations present in the same extraction. For
the mathlib slice that is 22 local edges against 1,837 dependencies on declarations outside the
extracted modules. Figures state the count they dropped, in a legend row, rather than implying the
graph is the whole proof, but a graph drawing roughly 1% of the edges is a map of the
neighbourhood and not of the proof. `Extract/Focus.lean` has the same boundary by construction:
`localClosure` stops at the module edge.

### Smaller things a reader will notice

- Six classification kinds produce no figure of their own: `distinctness`, `equality`, `property`,
  `conjunction`, `membership`, `existence`. They classify correctly and then contribute only their
  explanation layers, their assumption-sensitivity figure and their dependency graph. This is
  right for `distinctness` (a number line marking one excluded point carries almost no
  information) and is simply unbuilt for the others.
- `text-diagram` is a declared `VisualType` that nothing plans. Both renderers handle it through
  their generic layout.
- `@prooflens.var` keys `domain` and `role` are parsed, validated against `ALLOWED_KEYS`, and
  carried through to `MathVariable.annotation`. Nothing reads them.
- `DependencyNode.concept` is declared and always set to `null`, even for declarations that carry
  a `@prooflens.concept` annotation.
- Because `forallTelescope` strips arrows along with quantifiers, a theorem stated as `A → B`
  arrives with `A` as a hypothesis and `B` as the conclusion. The `implication` classifier fires on
  hypothesis types; the `implication-graph` figure is reached through `Iff` in practice.
- `POSITIONAL` hard-codes argument indices into mathlib signatures. Every use is guarded on the
  argument count, so a signature change degrades to `opaque` and shows up in the backlog rather
  than producing a wrong reading, but it will need revisiting on mathlib bumps.

## Near term (v0.2)

Ordered roughly by value per unit of work.

- **Figures for the classification kinds that have none.** `existence`, `conjunction` and
  `membership` all have obvious pictures (a witness box, a list of simultaneous facts, a point
  inside an interval) and 22, 4 and some part of the slice respectively waiting for them.
- **Work Backlog 2 down.** The top rows are `SummationFilter.unconditional` (44 declarations),
  then `LT.lt` in `Mathlib.Meta.Positivity` contexts, `Set.image`, `Top.top`, `setOf` (4 each).
  Each is a table entry improving statements that already classify.
- **Work Backlog 1's clusters.** `WellFoundedLT`/`WellFoundedGT` and
  `Function.Injective`/`Function.Surjective` are two-declaration pairs that a single `PREDICATES`
  block each would cover.
- **A second, differently-shaped slice.** Algebra and topology modules, measured the same way, so
  that the coverage number stops being a statement about order theory.
- **More sign rules.** `Real.log` on an argument known to exceed 1, even powers nonnegative. Each
  unlocks parameter-sensitivity callouts on theorems that currently get none.
- **Read `domain` and `role`.** `domain="positive reals"` is exactly the constraint a future
  slider needs, and it is already being parsed and thrown away.

## Medium term

### Proof-to-concept graphs

Today's dependency graph is a graph of *declarations*. `@prooflens.concept` already lets an author
name the idea a declaration is about, and `DependencyChain.lean` and `IntelligenceBound.lean` are
both written as chains of named concepts for exactly this reason. Collapsing the declaration graph
along concept names would turn "this lemma calls that lemma" into "positivity of the logarithm
supports the Landauer cost, which supports the rate bound". `DependencyNode.concept` exists and is
waiting for it.

### Assumption sensitivity across theorem families, and on machine-generated proofs

Assumption sensitivity is currently per-declaration. The more interesting question is comparative:
across a family of related theorems, which hypotheses are load-bearing everywhere, which are
load-bearing in one variant only, and which are stated by convention and never used.
`simple_upper_bound` and `div_upper_bound` are in the corpus as a deliberate pair for this, with
identical conclusions and different hypothesis usage.

The mathlib calibration result above says where to point this: not at curated libraries, but at
proof output that has not been groomed. A sweep over a machine-generated corpus is the experiment
that would tell us whether the analysis earns its place, and it is a cheap one to run because the
tooling already exists.

### Theorem comparison

Two declarations side by side: what is the same, what differs, and which differences matter. A
strengthening of a bound, a weakening of a hypothesis, a generalisation of a carrier type. This
needs a structural diff over MathIR, not over text.

### Counterfactual exploration

"What would this bound look like without `hT`?" is the question readers actually ask. ProofLens
could show the shape of the answer by re-planning a figure with a hypothesis removed.

The hard constraint: a counterfactual result is never "proved". Removing a hypothesis and
redrawing the figure produces a picture of a statement nobody has verified, and it must be
labelled as such. The lattice already has room for it (`heuristic` at best, never above), and the
`weakest` combinator means a counterfactual figure cannot come back stronger than its weakest
input. Anything a counterfactual suggests has to be sent back to Lean and proved separately before
it can be called a theorem.

### Parameter sliders within mathematically valid domains

A slider is a numeric claim, which is why v0.1 has none. It becomes defensible once two things
exist: numeric evaluation of `MathExpression`, and a domain to constrain the slider to. The
`@prooflens.var … domain="positive reals"` key is already parsed and carried through for this, and
hypotheses like `0 < T` already give `signFactsOf` the same information formally. A slider that
can be dragged to `T = 0` when the theorem assumes `0 < T` would be showing a value the theorem
says nothing about, so the domain is not a nicety. `AxisSpec.scale` already has a `numeric` value
waiting for the day an axis can honestly claim one.

### Proof animation

Stepping through a proof rather than seeing its end state. This needs tactic-level information
that v0.1 deliberately does not extract, so it is gated on a real change to the Lean side rather
than on TypeScript work.

## Long term

- **Formal knowledge graphs across whole libraries.** A concept graph over all of mathlib rather
  than over one module. This needs the extraction cost per declaration to come down a great deal
  and needs an answer to the 1,837-external-edges problem: which edges are worth drawing.
- **Structural semantic search.** "Find me theorems shaped like this one" over MathIR rather than
  over names and docstrings. The `path` addressing, the lowered trees and `walkTheorem` are the
  substrate; the missing piece is an index.
- **AI-theorem interpretability.** When a model proposes or proves a theorem, the question "what
  does this say, and does it say what we wanted" is the same question ProofLens already answers
  for human-written theorems. The pipeline does not care who wrote the Lean, and the assumption
  sensitivity calibration says this is where that analysis pays.
- **Optional AI adapters.** A model could propose a reading of an unsupported statement, suggest
  an annotation, or draft prose for a figure. Three constraints, none negotiable:
  1. Adapters are optional and off by default. The deterministic core stays useful with none
     installed, which is the case today.
  2. Model output enters as `speculative`. That status already exists in the lattice, is already
     glossed as "Generated by a model. Not verified by anything.", and is already rendered
     distinctly by both renderers.
  3. An adapter cannot upgrade anything. `weakest` is the only combinator, `transcribe` is the
     only producer of `verified`, and it requires a `KernelWitness` that only
     `@prooflens/formal-ir` can mint from a Lean extraction. There is no code path by which a
     model's opinion becomes a verified claim, and there will not be one.
     `packages/epistemics/test/no-forged-verification.test.ts` exists to keep it that way.

A note on adapters and coverage. An adapter that guessed at unrecognised statements would improve
the *apparent* number while emptying the backlog that drives real work, which is the same failure
mode `classifyProperty`'s table gate exists to prevent. Any adapter has to leave the coverage
report measuring the deterministic core, not the core plus a model.

## How to help

The single most useful contribution is a theorem ProofLens could not read.

Every entry in the constant tables and every classifier rule exists because a statement needed it,
and since the mathlib sweep, most of them exist because the ranked backlog said that statement
form was common. Reports filed with the
[`unsupported_mathematics` issue template](../.github/ISSUE_TEMPLATE/unsupported_mathematics.md)
are triaged into that same backlog: grouped by mathematical structure, with the structures that
appear most often built next.

You do not need to know why it failed or propose a fix. The declaration and its Formal IR are
enough:

```bash
cd lean
lake exe prooflens-extract <Module.Name> > out.json
```

Then paste the `declarations` entry for the declaration in question. If you have a whole module,
`prooflens coverage out.json --format markdown` is even more useful, because it says how common
each gap is rather than only that a gap exists. One issue per theorem or per closely related
family; a broad "ProofLens doesn't understand analysis" is much harder to act on than three
specific declarations.

The template also asks what you expected to see. That section is the valuable one. You know the
theorem better than we do, and what a good picture of it would emphasise is exactly the thing a
classifier rule has to encode.

If you would rather write the rule than file the report, [math-ir.md](./math-ir.md) has a
step-by-step walkthrough for adding a Lean constant that starts with running `prooflens coverage`,
and [visual-ir.md](./visual-ir.md) has one for adding a renderer.

## Related documents

- [coverage.md](./coverage.md) — the full generated report and both ranked backlogs
- [architecture.md](./architecture.md) — stages, packages, the coverage loop, and what v0.1 omits
- [math-ir.md](./math-ir.md) — the constant tables and how to extend them
- [visual-ir.md](./visual-ir.md) — visual types, the planner, and the renderer contract
- [epistemic-model.md](./epistemic-model.md) — why an AI adapter cannot upgrade a claim
