# Releasing ProofLens

The repeatable process. The one-time first-publish steps live in the launch
runbook the maintainer holds; this file is for every release after that.

## Before tagging

1. `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run test`
2. `cd lean && lake build` and `cd corpus && lake build ProofLensExamples`
3. `pnpm extract:corpus` — the committed Formal IR must match a fresh
   extraction (CI enforces this, but catching it locally is faster).
4. `pnpm build:widget` — the committed widget bundle must be current (also
   CI-enforced).
5. Update `CHANGELOG.md`: move Unreleased into a dated version section.
6. Bump `version` in the root `package.json` and each `packages/*/package.json`
   if the release is more than a docs change.

## Tag and publish

```bash
git tag -a v0.x.y -m "ProofLens v0.x.y"
git push origin main --tags
```

Create a GitHub Release from the tag; paste the CHANGELOG section as the body
and attach nothing — the repository is the artifact.

## After

- Check the Actions run on the tag is green.
- If the release changed coverage-relevant code, trigger the
  `mathlib-coverage` workflow manually (`workflow_dispatch`) and update
  `docs/coverage.md` + `examples/mathlib-coverage.json` if the numbers moved.

## Reservoir (Lean package registry)

ProofLens is a polyglot monorepo, and [Reservoir's inclusion
criteria](https://reservoir.lean-lang.org/inclusion-criteria) require a
`lake-manifest.json` at the _repository root_, so the main repo cannot be
auto-indexed. If Lean-side adoption justifies it, publish a mirror repository
containing only the `lean/` package:

```bash
git subtree split --prefix=lean -b lean-only
# push that branch to a new repo, e.g. prooflens/prooflens-lean
```

Requirements once mirrored: public repo, root manifest (satisfied by the
split), OSI license detected by GitHub (Apache-2.0 — ensure LICENSE is copied
into the split), and ≥ 2 GitHub stars. Reservoir indexes roughly daily.
