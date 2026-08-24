# Roadmap

This document is meant to be checkable. The v0.1 section describes what the code in this
repository does today, with numbers taken from a real extraction
(`examples/corpus.formal-ir.json`, reproducible with `prooflens summary`). The forward-looking
sections describe intent, and nothing in them is a commitment to a date.

## What v0.1 actually does today

ProofLens extracts Lean 4 declarations into a Formal IR, lowers them into a MathIR, runs
deterministic classifiers over that, plans figures, and renders them as SVG or plain text. There
is no language model anywhere in the core. Three surfaces run the identical TypeScript pipeline:
a Lean infoview widget, a CLI, and a browser application.

### The reference corpus

`examples/corpus.formal-ir.json` is a real extraction of five Lean modules from
`corpus/ProofLensExamples/`, at `notationFidelity: "notation"`, toolchain `4.24.0`. Running
`prooflens summary examples/corpus.formal-ir.json` gives:

```
  declarations              34
  structurally classified   32
  unsupported structure     2
  with unused hypotheses    2
  proved with sorry         0
  unusual axioms            0
  figures planned           68

  figures by epistemic status:
    derived         44  Computed from the verified statement by a deterministic rule.
    illustrative    24  A display choice. It makes no mathematical claim.
```

Of the 34 declarations: 31 are theorems and 3 are definitions. The primary classification breaks
down as 18 `upper-bound`, 6 `monotonicity`, 3 `definition`, 2 `equivalence`, 2 `equality`,
1 `functional-relationship`, 2 `unsupported`.

The two unsupported declarations are worth naming, because they fail for two different reasons:

- `unsupported_tendsto_fixture`, whose conclusion is headed by `Filter.Tendsto`. That constant is
  not in the tables, so the conclusion lowers to an `opaque` proposition. It is in the corpus
  deliberately, as a case where the correct behaviour is a clean "cannot visualise this" rather
  than a wrong picture. It still renders an `expression-tree` showing the statement's structure,
  and its rendered display is `Tendsto(n ↦ 1 / (n + 1), atTop, nhds(0))`, so the arguments were
  lowered even though the head was not.
- `switching_coefficient_ne_zero`, whose conclusion is `C · V ^ 2 ≠ 0`. This one lowers
  *successfully*: `Ne` is in `RELATIONS`, so the proposition is a named `not-equal` relation. It
  is unsupported because no structural classifier in `classify.ts` has a branch for `not-equal`.
  The table and the classifier rulebook are two separate things to extend, and this declaration is
  the standing example of the gap.

### Figures

68 figures over 34 declarations: 26 `assumption-sensitivity`, 18 `upper-bound-plot`,
11 `dependency-graph`, 6 `monotonicity-plot`, 5 `expression-tree`, 2 `implication-graph`.

The two declarations with stated-but-unused hypotheses are `simple_upper_bound` (an
assumption-sensitivity fixture where `hP` and `hT` are decorative) and `information_rate_bound`
(where `hP : 0 < P` is stated for physical completeness and never used). Those two get their
assumption-sensitivity figure ranked ahead of their plot; see [visual-ir.md](./visual-ir.md).

### What the deterministic core contains

- 6 epistemic statuses, one lattice, one combinator (`weakest`), one producer of `verified`
  (`transcribe`) gated on a witness only `@prooflens/formal-ir` can mint.
- 13 named rules in `RULES`, each with a stable id that appears in provenance output.
- 35 Lean constants across the six tables in `math-ir/src/tables.ts`: 7 relations, 6 binary
  operators, 3 unary operators, 7 named functions, 6 transparent wrappers, 6 predicates.
- 7 explanation layers (`formal`, `mathematical`, `structural`, `assumptions`, `parameters`,
  `trust`, `domain`), each carrying its own `Claim` and its own status.
- 10 declared `VisualType`s, 2 renderers.

## Known limitations

Stated plainly, because a reader who discovers these on their own will trust the rest of the
output less.

### The constant table is small, so mathlib coverage is low

Thirty-five constants is enough for the arithmetic-and-order fragment the corpus exercises and
almost nothing else. There is no vocabulary for sets, filters, topology, measure, linear algebra,
category theory, or anything with a nontrivial index type. `Filter.Tendsto` is unsupported, and so
is essentially every statement whose content lives in the interaction between structures rather
than between numbers.

The degradation is graceful (an unrecognised head becomes `opaque`, the structure survives, and a
figure still ships) but "graceful" is not "useful". A mathlib slice would report a much higher
unsupported rate than the corpus's 2 out of 34.

### No tactic-level or proof-state analysis

ProofLens sees the final elaborated proof term. It does not see the tactic script, the
intermediate goals, or the order in which they were closed. Everything the tool says about a
proof is derived from that one term plus `collectAxioms`.

This bounds the assumption-sensitivity result in a specific way. `unusedInProof` means the free
variable does not occur in the elaborated term, in any later binder type, or in the conclusion. A
hypothesis can be doing real work the occurrence check cannot see, for instance by making an
instance argument typecheck, and a different proof of the same statement may need a hypothesis
this one does not. Every such figure ships with that caveat attached, and the caveat is not
boilerplate; it is the accurate description of what was computed.

### Plots are schematic, not numeric

Nothing in ProofLens evaluates an expression. There is no arithmetic on `MathExpression`, no
sampling, and no numeric axis. Every axis the planner emits carries `scale: "schematic"` and
`epistemic: "illustrative"`, and every bound plot's overall status is therefore `illustrative`.
What a bound plot tells you is which side of the bound a quantity lies on. It tells you nothing
about how far.

The sign and direction analysis in `signs.ts` is symbolic and conservative, and returns `unknown`
for anything its rules do not cover. That conservatism has a visible cost: `Real.log` has no sign
rule, so the denominator `kB · T · log 2` in `information_rate_bound` has unknown sign, so
`directionOf` returns `unknown` for every parameter, so the flagship theorem gets no
"How the bound responds" layer at all. Eight of the 34 declarations do get sensitivity callouts.
That is the right failure direction, but it is a failure.

### The corpus is our own, not a mathlib slice

`corpus/ProofLensExamples/` is five modules written for this project. They depend on mathlib, so
the elaborated terms are the real thing rather than toy stand-ins, but the statements were chosen
partly because ProofLens could read them. That is a selection bias, and the headline numbers
above should be read with it in mind.

`corpus/ProofLensExamples/IntelligenceBound.lean` includes `unsupported_tendsto_fixture`
specifically to keep the corpus from being uniformly favourable, but one adversarial fixture is
not a benchmark.

### Dependency graphs are single-module

`localDependencyEdges` keeps only edges between declarations present in the same extraction. For
the reference corpus that is 22 local edges against 1,837 dependencies on declarations outside the
extracted modules. The figure states the count it dropped, in a legend row, rather than implying
the graph is the whole proof, but a graph that draws roughly 1% of the edges is a map of the
neighbourhood and not of the proof.

`Extract/Focus.lean` has the same boundary by construction: `localClosure` stops at the module
edge.

### Other things a reader will notice

- `lower-bound-plot` is a declared `VisualType` with layout support in both renderers, and
  `classifyBounds` produces a `lower-bound` classification for every inequality, but `planVisuals`
  only ever calls `planBound(..., "upper")`. No lower-bound plot is emitted today.
- `primaryClassification` ranks `upper-bound` first, and `classifyBounds` emits both readings of
  every inequality, so `simple_lower_bound` (`A / B ≤ x`) and positivity facts like
  `log_two_pos` (`0 < Real.log 2`) both appear as `upper-bound` in `prooflens summary`. The
  reading is technically correct (`0` is bounded above by `log 2`) and unhelpful.
- `@prooflens.visual` is parsed and stored on `TheoremIR.suggestedVisual`, and the planner does
  not read it. The corpus uses values like `positivity-fact` and `implication-chain` that are not
  `VisualType`s at all.
- `@prooflens.var` keys `domain` and `role` are parsed, validated and carried through, and nothing
  reads them.
- `DependencyNode.concept` is declared and always set to `null`, even for declarations that carry
  a `@prooflens.concept` annotation.
- Because `forallTelescope` strips arrows along with quantifiers, a theorem stated as `A → B`
  arrives with `A` as a hypothesis and `B` as the conclusion. The `implication` classifier and
  the `implication-graph` figure are reached only through `Iff` in practice. Anonymous arrow
  antecedents also surface with Lean's internal binder names, for example
  `a._@._internal._hyg.0`.
- Test coverage is uneven. `packages/epistemics`, `packages/renderer-svg` and
  `packages/renderer-text` have real suites; the `test/` directories under `classifier`,
  `formal-ir`, `math-ir`, `visual-ir` and `cli` are empty, and `packages/pipeline/test/` contains
  a scratch file rather than assertions.

## Near term (v0.2)

Ordered roughly by how much they would improve the tool per unit of work.

- **Classifier branches for the relations that already lower correctly.** `not-equal` is the
  concrete case: the MathIR is already right and only `classify.ts` needs a branch.
- **Emit `lower-bound-plot`.** `planBound` already takes a direction argument. The work is
  deciding when a lower-bound reading is the more informative one rather than emitting both.
- **Honour `@prooflens.visual`.** The author of a theorem often knows which figure is the useful
  one. The planner should treat it as a preference over its own ordering, at `interpreted` status,
  and should say when it declined to follow it.
- **Grow the constant tables from real reports.** Each entry is independently testable and each
  is small. Reports filed with the `unsupported_mathematics` template are what decides the order.
- **More sign rules.** `Real.log` on an argument known to exceed 1, `Real.exp` always positive,
  even powers nonnegative. Each unlocks parameter-sensitivity callouts on theorems that currently
  get none.
- **Fill in the empty test directories**, starting with the classifiers, where a rule that
  silently stops firing is the failure mode nobody notices.

## Medium term

### Proof-to-concept graphs

Today's dependency graph is a graph of *declarations*. `@prooflens.concept` already lets an author
name the idea a declaration is about, and `DependencyChain.lean` and `IntelligenceBound.lean` are
both written as chains of named concepts for exactly this reason. Collapsing the declaration graph
along concept names would turn "this lemma calls that lemma" into "positivity of the logarithm
supports the Landauer cost, which supports the rate bound", which is the graph a reader wants.
`DependencyNode.concept` exists and is waiting for it.

### Assumption sensitivity across theorem families

Assumption sensitivity is currently per-declaration. The more interesting question is comparative:
across a family of related theorems, which hypotheses are load-bearing everywhere, which are
load-bearing in one variant only, and which are stated by convention and never used.
`simple_upper_bound` and `div_upper_bound` are in the corpus as a deliberate pair for this, with
identical conclusions and different hypothesis usage.

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
`@prooflens.var … domain="positive reals"` key is already parsed and carried through for this,
and hypotheses like `0 < T` already give `signFactsOf` the same information formally. A slider
that can be dragged to `T = 0` when the theorem assumes `0 < T` would be showing a value the
theorem says nothing about, so the domain is not a nicety.

### Proof animation

Stepping through a proof rather than seeing its end state. This needs tactic-level information
that v0.1 deliberately does not extract, so it is gated on a real change to the Lean side rather
than on TypeScript work.

## Long term

- **Formal knowledge graphs across whole libraries.** A concept graph over all of mathlib rather
  than over one module. This needs the extraction cost per declaration to come down a great deal
  and needs an answer to the 1,837-external-edges problem: which edges are worth drawing.
- **Structural semantic search.** "Find me theorems shaped like this one" over MathIR rather than
  over names and docstrings. The `path` addressing and the lowered trees are the substrate; the
  missing piece is an index.
- **AI-theorem interpretability.** When a model proposes or proves a theorem, the question "what
  does this say, and does it say what we wanted" is the same question ProofLens already answers
  for human-written theorems. The pipeline does not care who wrote the Lean.
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

## How to help

The single most useful contribution is a theorem ProofLens could not read.

ProofLens understands mathematics through explicit classifier rules and an explicit constant
table. Every entry in both exists because someone showed us a statement the system could not
handle. Reports filed with the
[`unsupported_mathematics` issue template](../.github/ISSUE_TEMPLATE/unsupported_mathematics.md)
are triaged directly into the classifier roadmap: they are grouped by mathematical structure, and
the structures that appear most often are the rules built next.

You do not need to know why it failed or propose a fix. The declaration and its Formal IR are
enough:

```bash
cd lean
lake exe prooflens-extract <Module.Name> > out.json
```

Then paste the `declarations` entry for the declaration in question. One issue per theorem or per
closely related family; a broad "ProofLens doesn't understand analysis" is much harder to act on
than three specific declarations.

The template also asks what you expected to see. That section is the valuable one. You know the
theorem better than we do, and what a good picture of it would emphasise is exactly the thing a
classifier rule has to encode.

If you would rather write the rule than file the report, [math-ir.md](./math-ir.md) has a
step-by-step walkthrough for adding a Lean constant, and [visual-ir.md](./visual-ir.md) has one
for adding a renderer.

## Related documents

- [architecture.md](./architecture.md) — stages, packages, and what v0.1 deliberately omits
- [math-ir.md](./math-ir.md) — the constant tables and how to extend them
- [visual-ir.md](./visual-ir.md) — visual types, the planner, and the renderer contract
- [epistemic-model.md](./epistemic-model.md) — why an AI adapter cannot upgrade a claim
