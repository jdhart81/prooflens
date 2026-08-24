---
name: Unsupported mathematics
about: ProofLens extracted a Lean theorem but could not classify or visualize it
title: "unsupported: "
labels: ["unsupported-mathematics", "classifier-roadmap", "needs-triage"]
---

<!--
Thank you for filing this — these reports are the single most valuable kind of
issue for ProofLens.

ProofLens understands mathematics through a library of explicit classifier
rules. Every rule was written because someone showed us a theorem the system
could not read. Reports filed with this template are triaged directly into the
classifier roadmap: we group them by mathematical structure, and the structures
that show up most often are the rules we build next.

You do not need to know why it failed, or propose a fix. The declaration and the
Formal IR are enough. Please file one issue per theorem or per closely related
family — a broad "ProofLens doesn't understand analysis" issue is much harder
for us to act on than three specific declarations.
-->

## The Lean declaration

<!-- The full declaration, as it appears in the source. Statement is essential;
     include the proof if it is short or if you think its structure matters. -->

```lean

```

## Module

<!-- The module the declaration lives in, e.g. Mathlib.Analysis.SpecialFunctions.Log.Basic
     or MyProject.Ring.Lemmas — the name you pass to prooflens-extract. -->

- Module name:
- Source: <!-- Mathlib / Std / your own project / other (please say which, and a link if public) -->
- Mathlib or dependency revision, if relevant:

## Emitted Formal IR

<!--
Produce it with:

    cd lean
    lake exe prooflens-extract <Module.Name> > out.json

Then paste the `declarations` entry for this declaration below. If you cannot
run the extractor, paste the declaration above and say so — we can extract it
ourselves, though a Formal IR from your environment is more reliable.

Please paste as text rather than a screenshot; we diff these against fixtures.
Trim to the single declaration if the module is large.
-->

```json

```

## What you expected to see

<!--
Describe the visualization or explanation you were hoping for. Prose is fine.
A sketch, a photo of something drawn on paper, or a picture from a textbook or
another tool is even better.

Concretely, it helps to say:
  - what the mathematical content of this statement actually is;
  - which parts a reader most needs to see (a hypothesis? a bound? a
    construction? how two objects relate?);
  - what a good picture of it would emphasise, and what it could safely omit.

You know this theorem better than we do. Tell us what matters about it.
-->

## What ProofLens did instead

<!-- Tick what applies, and paste any output or error. -->

- [ ] Extraction failed outright
- [ ] Extracted fine, but no classifier rule fired — fell back to a generic view
- [ ] A rule fired but read the statement incorrectly (which rule ID, if shown? )
- [ ] Classified acceptably, but the visualization was unhelpful or misleading
- [ ] Rendered nothing at all
- [ ] Something else

Details, output, or error:

```

```

## Mathematical area

<!-- Rough tags help us cluster reports. Tick any that fit; add your own. -->

- [ ] Algebra (groups, rings, fields, modules)
- [ ] Order theory and lattices
- [ ] Analysis (limits, continuity, derivatives, integrals)
- [ ] Topology
- [ ] Number theory
- [ ] Combinatorics and graph theory
- [ ] Category theory
- [ ] Logic, set theory, or type theory
- [ ] Probability and measure
- [ ] Linear algebra
- [ ] Geometry
- [ ] Computability, semantics, or program verification
- [ ] Other:

## Structural features

<!-- What makes this statement hard? Optional, but very useful for triage —
     these are often exactly the axes along which we build new rules. -->

- [ ] Heavy typeclass or instance structure
- [ ] Dependent types in an essential way
- [ ] Universe polymorphism
- [ ] Higher-order functions or quantification over functions
- [ ] Quotients or setoids
- [ ] Coinduction, well-founded recursion, or unusual recursion
- [ ] Deeply nested quantifier alternation
- [ ] Very large statement, or many hypotheses
- [ ] Notation or macros that obscure the underlying term
- [ ] Existential or non-constructive content
- [ ] Something in the term structure the pretty-printer hides
- [ ] Not sure

## Environment

- ProofLens version / commit:
- Lean version (expected `4.24.0`):
- OS:

## Additional context

<!-- Anything else. If this theorem is representative of a wider family you
     care about, say so and name a few siblings — a rule that generalises is
     worth more to us than one that handles a single declaration. -->
