# Changelog

All notable changes to ProofLens are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/) with a `0.x` caveat: minor versions may break
IR schemas until 1.0.

## [0.1.0] — 2026-08-26

First public release. Everything below is new.

### The pipeline

- Lean 4 extraction through Lean's own frontend (`#prooflens_export`), emitting
  Formal IR with full notation fidelity, measured and self-reported
  (`notationFidelity`). Extraction is resilient per declaration: a pathological
  declaration becomes one failed row with `extractionError`, never a lost sweep.
- Formal IR → MathIR lowering: relations, operators, named functions, filters,
  limits, existentials, conjunctions, membership, intervals, coercions,
  compositions, local constant resolution, definition bodies, and a strict
  separation of typeclass instances from mathematical hypotheses.
- Fifteen deterministic classifiers with stable rule ids, including bounds with
  natural-reading selection, monotonicity, limits distinguishing convergence
  from divergence, positivity, distinctness, and named properties.
- Deterministic sign/monotonicity analysis: "increasing P raises the bound" is
  asserted only when the stated hypotheses license it.
- Assumption sensitivity: occurrence analysis of the elaborated proof term
  reports hypotheses a proof states but never uses.
- VisualIR and a planner in which every figure carries a rationale and an
  epistemic status; renderers consume VisualIR only.
- SVG and text renderers; a Lean infoview widget (`#prooflens my_theorem`)
  running the identical pipeline in-editor; a local web application; a CLI
  (`extract`, `summary`, `explain`, `render`, `inspect`, `coverage`,
  `pipeline`).
- Animated figures (`--animate`): staged CSS animation in dependency order,
  final frame identical to the static render, `prefers-reduced-motion`
  respected.

### The epistemics

- Six-state lattice (`verified` … `speculative`) enforced in code: `verified`
  requires a kernel witness only the Formal IR loader can mint, and only for
  `sorry`-free, successfully extracted declarations; derivation folds a hard
  floor so confidence never increases downstream.

### The measurement

- `prooflens coverage`: measured against a 679-declaration mathlib slice —
  96.2% structurally classified, 81.3% fully readable — with two ranked
  backlogs that name exactly what would improve the number. See
  `docs/coverage.md`.

[0.1.0]: https://github.com/jdhart81/prooflens/releases/tag/v0.1.0
