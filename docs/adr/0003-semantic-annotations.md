# ADR 0003: Semantic annotations live in docstrings, not in a Lean attribute

- Status: accepted
- Date: 2026-08-24
- Applies to: `packages/math-ir/src/annotations.ts`, `corpus/ProofLensExamples/*.lean`

## Context

Formal notation does not record what a symbol means. `P : ℝ` is a real number;
that it is electrical power measured in watts, that it is positive because
physics rather than because a hypothesis says so, that a plot should put it on
the x-axis — none of that is in the statement, and none of it can be recovered
from the statement.

Without that information every generated figure is a generic unlabelled axis.
The original specification listed a semantic annotation system as optional. It
is not optional: it is what separates a diagram of `x ≤ P / T` from a diagram of
a power-limited rate bound.

The specification sketched a Lean attribute:

```lean
@[prooflens.semantic "available power"]
@[prooflens.units "watts"]
variable P : ℝ
```

## Decision

**For v0.1, semantic annotations are structured lines inside ordinary Lean
docstrings, parsed deterministically by `@prooflens/math-ir`.**

```lean
/--
The bound. A machine drawing `P` watts at temperature `T` ...

@prooflens.var P meaning="electrical power drawn by the machine" units="W"
@prooflens.var T meaning="operating temperature of the heat bath" units="K"
@prooflens.visual upper-bound-plot
@prooflens.concept "Landauer information-rate bound"
-/
theorem information_rate_bound ...
```

Grammar: `@prooflens.var <binderName> key="value" ...` with keys drawn from
`meaning`, `units`, `domain`, `axis`, `role`; `@prooflens.visual <visual-type>`;
`@prooflens.concept "<name>"`. Unrecognised keys are ignored, unparseable
directives are collected into a `malformed` list rather than thrown away, and
the remaining prose is preserved as documentation.

## Why not the attribute

**Docstrings already exist and are already extracted.** ProofLens reads
`findDocString?` regardless. Annotations cost zero additional Lean
metaprogramming, zero additional environment extensions, and zero additional
build surface.

**It works on code ProofLens does not own.** An attribute requires the author to
import ProofLens. A docstring convention can be applied to a fork, a downstream
project, or a patch to someone else's file, and a Lean project with no knowledge
of ProofLens still parses and builds.

**It is Invariant 4 compliant by construction.** Parsing is a regular expression
over text the extractor already carries. There is no elaboration, no attribute
registration, and nothing that can fail at Lean build time.

**We do not yet know the right schema.** An attribute is a commitment: once
declarations in the wild carry `@[prooflens.units "W"]`, changing the shape
breaks them. A docstring convention can be revised while it is still only our
corpus using it. Choosing the reversible option and writing down why is what an
ADR is for.

## Epistemic standing

An annotation is a **claim by the declaration's author**, not something Lean
checked. Lean will happily let you annotate a temperature as "available power".

Annotations therefore enter the pipeline as `interpreted`, never `verified` and
never `derived`, under rule `SEMANTIC_ANNOTATION_001`, and the explanation layer
that uses them says so in as many words: *"These readings come from the
declaration's ProofLens annotations, not from anything Lean checked."*

This is a small thing that matters. The most seductive failure mode for a tool
like this is to let a plausible human gloss inherit the authority of the theorem
it is attached to.

## Consequences

- Annotations are invisible to Lean. A typo in a binder name silently produces
  no annotation rather than an error. Mitigation for v0.2: report annotations
  whose `target` matches no binder as a diagnostic.
- Docstrings now serve two audiences. The parser strips annotation lines before
  the prose is displayed, so a reader never sees them, but an author must know
  the convention. It is documented in `docs/math-ir.md` and in `CONTRIBUTING.md`.
- `@prooflens.visual` is honoured as a **preference**, not an instruction. The
  planner can reorder figures it already chose; it cannot conjure one the
  analysis does not support, because such a figure would have nothing behind it.
  A hint matching nothing is recorded on the figure as a `hint-unmatched`
  annotation so the author finds out rather than wondering.
- Migrating to a Lean attribute later is additive: the attribute would populate
  the same `SemanticAnnotation` structure, and both sources can coexist with the
  attribute winning. That path stays open, which was the point.
