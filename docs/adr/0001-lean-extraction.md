# ADR 0001: How ProofLens extracts information from Lean 4

- Status: accepted
- Date: 2026-08-24
- Applies to: `lean/ProofLens/Extract/*`, `lean/ProofLens/Export.lean`, `lean/Main.lean`, `packages/cli/src/extract.ts`

## Context

ProofLens needs structured information about Lean declarations: the statement,
its binders, which of them are hypotheses, the conclusion, the proof's
dependencies, and the axioms it rests on. Everything downstream is built on the
fidelity of this step, so getting it wrong is expensive to discover later.

Three constraints shaped the decision.

1. Invariant 4 requires the extraction path to be deterministic and to work
   without any language model.
2. Invariant 6 requires an intermediate representation rich enough that later
   stages can be rewritten without going back to Lean source.
3. The extractor must work against *any* Lean project, not only ours, which
   rules out anything that depends on mathlib being present.

## Options considered

### A. Parse Lean source with regular expressions or a hand-written parser

Rejected outright. Lean 4's surface syntax is user-extensible: notation,
macros, and elaborators mean the text of a declaration does not determine its
meaning. A parser would be wrong on the day it shipped and wrong differently
every release. The spec that commissioned this work explicitly forbids regex
parsing as an architecture, and it is right to.

### B. Consume an existing extraction tool

Two mature options exist.

[LeanDojo](https://github.com/lean-dojo/LeanDojo) traces a whole repository and
emits ASTs, premise information, and tactic-level proof steps. It is the most
complete Lean extraction tooling that exists, and it is aimed squarely at
machine learning over proofs.

[doc-gen4](https://github.com/leanprover/doc-gen4) walks the environment and
renders declaration data, docstrings, and source positions.

Neither was adopted as a dependency, for different reasons. doc-gen4's output
is shaped for HTML documentation rather than for an IR: it renders where we need
structure. LeanDojo does far more than v0.1 needs, brings a Python toolchain,
and traces whole repositories when we want a single module.

The important decision, though, is the negative one, and it is binding:
**ProofLens does not build a tracer.** If ProofLens ever needs traced ASTs,
premise selection, or tactic-step granularity, it consumes LeanDojo rather than
reimplementing it. Duplicating that work is the most obvious way to spend six
months not building an interpretability layer.

### C. A thin Lake target over `Lean.Environment` — chosen

ProofLens ships a small Lean library that walks `Environment.constants`, and for
each declaration reads `ConstantInfo` directly:

- `forallTelescope` over the type gives the binders, with `Meta.isProp`
  separating hypotheses from parameters.
- `Expr` is transcribed structurally to JSON, with applications flattened,
  because that is the shape mathematical analysis wants.
- `Expr.getUsedConstants` over the type and value gives dependency edges.
- `collectAxioms` gives the trust base, and `sorryAx` appearing in it means the
  declaration is not proved at all.
- `findDocString?` and `findDeclarationRanges?` give documentation and source
  spans.

This is roughly 300 lines of Lean, uses only official APIs, and depends on Lean
core alone — the `prooflens` Lake package does **not** require mathlib, so it
can be pointed at any project. Only the example corpus depends on mathlib, and
it lives in a separate Lake package (`corpus/`) for exactly that reason.

## The one analysis that is not transcription

`Extract/Declaration.lean` also computes, per binder, whether the free variable
occurs in the elaborated proof term, in any later binder's type, or in the
conclusion. A hypothesis that occurs in none of the three was stated but never
used by this proof.

This is deliberately a *syntactic occurrence check on the elaborated term*, and
its limits are stated wherever it is surfaced: it is a fact about one proof, not
about mathematical necessity. A different proof of the same statement may need
the hypothesis. It powers ProofLens's assumption-sensitivity view, which is
cheap to compute, `derived` rather than guessed, and immediately useful — see
ADR 0002 for why it became the flagship rather than the plots.

## Two runners, and why the IR reports which one ran

The extraction *logic* is one library. It can be driven two ways.

**The frontend path (reference).** `#prooflens_export "out.json" Some.Module`
is a Lean command. The ProofLens CLI generates a three-line driver file that
imports the target modules and invokes it, then runs `lake env lean driver.lean`.

**The standalone path.** `lake exe prooflens-extract Some.Module` imports the
modules with `withImportModules` and runs the same code.

The standalone runner has a problem that took a while to diagnose: outside the
frontend, notation delaborators are not reliably available, and the pretty
printer falls back to raw applications. `x ≤ P / T` comes back as
`LE.le x (HDiv.hDiv P T)`. `lean/Main.lean` mitigates this — it calls
`enableInitializersExecution` and disables generalised field notation, which
alone would render `Real.instLE.le x y` — but reproducing everything the
frontend configures is a moving target across Lean releases.

Rather than guess, the extractor **measures**. `probeNotationFidelity`
pretty-prints a known `0 ≤ 1` and checks whether a `≤` came back, and the result
is recorded in the Formal IR as `notationFidelity: "notation" | "raw"`. Every
consumer can see whether the mathematics it is displaying is in the notation a
reader expects.

This matters more than it sounds. Silently degrading the display of a formal
statement is precisely the class of failure ProofLens exists to prevent. A
system whose whole premise is separating what is known from what is guessed does
not get to quietly show you a worse version of a theorem.

The frontend path is the reference because it is the only one guaranteed to
report `notation`. The CLI uses it by default.

## Consequences

- Extraction requires a working Lean toolchain and a Lake project. There is no
  pure-JavaScript path, and there should not be one.
- Extraction cost is dominated by importing the target modules. Against a
  mathlib-backed corpus this is tens of seconds, which is fine for a CLI and
  fine for the infoview widget, which extracts a single declaration plus its
  same-module dependency closure (`Extract/Focus.lean`) rather than a whole
  module.
- Only the *final proof term* is visible. Tactic structure, intermediate goals,
  and proof-state evolution are not extracted in v0.1. Adding them is where
  LeanDojo becomes the right dependency rather than a rejected one.
- Adding a second proof assistant means writing a new extractor that emits the
  same Formal IR schema. Nothing above the Formal IR boundary mentions Lean.

## Limitations we accept for now

- Dependency edges are constants referenced by the proof term. For a
  mathlib-backed theorem, most of them are library lemmas outside the extracted
  modules; ProofLens counts those and says how many rather than drawing a graph
  that implies completeness.
- `Expr` is transcribed but not normalised. Two definitionally equal statements
  written differently produce different trees, and ProofLens will treat them as
  different. Definitional unfolding is a v0.2+ question.
- Universe levels are serialised as strings. They are preserved but not
  analysed.
