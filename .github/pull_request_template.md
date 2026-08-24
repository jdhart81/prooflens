## Summary

<!-- What does this change do, and why? One or two paragraphs. Link the issue it closes. -->

Closes #

## Type of change

<!-- Tick all that apply. Matches the conventional-commit type in your commits. -->

- [ ] `feat` — new functionality
- [ ] `fix` — bug fix
- [ ] `docs` — documentation only
- [ ] `refactor` — no behaviour change
- [ ] `perf` — performance
- [ ] `test` — tests only
- [ ] `build` / `ci` / `chore`
- [ ] Breaking change (`!` in the commit subject and a `BREAKING CHANGE:` footer)

## Checklist

### Tests

- [ ] Tests added or updated for this change
- [ ] `pnpm build` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] `lake build` passes (if anything under `lean/` changed)
- [ ] Any regenerated fixtures were reviewed line by line, and the diff is
      explained below

<!-- PRs that change behaviour need a test. Sign-off/DCO is NOT required. -->

### Epistemic status

<!-- The non-negotiable part. See CONTRIBUTING.md → Epistemic discipline. -->

- [ ] Every new piece of information this PR introduces is tagged with an
      epistemic status at the point it is created
      (`verified` / `derived` / `interpreted` / `heuristic` / `illustrative` / `speculative`)
- [ ] No status is claimed higher than its inputs warrant — status is preserved
      or lowered along the pipeline, never raised
- [ ] **No new code mints `verified` outside Lean extraction**
- [ ] No AI-generated or otherwise `speculative` content can be presented as
      formally verified, and none of it feeds a rule that produces
      `interpreted` or better
- [ ] Tests assert the epistemic status, not only the value

If this PR adds or changes information, describe what it adds and the status of each piece:

| New information | Status | Why that status |
| --- | --- | --- |
|  |  |  |

### Provenance

- [ ] Every new `interpreted` or `heuristic` value carries a provenance record
      (`ruleId`, `ruleVersion`, `inputs`)
- [ ] Provenance is preserved through every stage this PR touches — nothing
      drops or rewrites it in transit
- [ ] New classifier rules have a **stable rule ID** that follows the naming
      convention and does not reuse or rename an existing ID
- [ ] `ruleVersion` bumped for any rule whose behaviour changed

New or changed rule IDs:

<!-- e.g. hyp.positivity.strict-lt-zero (new, v1) -->

### Dependencies and the core path

- [ ] **No new proprietary or hosted API dependency in the core path**
      (extraction → MathIR → VisualIR → render still runs fully offline,
      deterministically, with no account and no API key)
- [ ] Any AI functionality is an optional adapter, off by default, outside the
      core path
- [ ] New runtime dependencies are justified below, and their licences are
      compatible with Apache-2.0

New dependencies (or "none"):

### Architecture and docs

- [ ] `docs/` updated, or a new ADR added, if this changes architecture — a new
      pipeline stage, a changed IR contract, a new trust boundary, or a new
      dependency in the core path
- [ ] IR schema version bumped if a schema change is not backward compatible
- [ ] Public API changes are reflected in the relevant package docs

### Classifiers (if applicable)

- [ ] Rule registered in the rule registry
- [ ] Positive test: a fixture where the rule fires
- [ ] Negative test: a near-miss fixture where the rule must **not** fire
- [ ] `maxStatus` is honest about how reliable the rule really is
- [ ] The rule is total (never throws on unfamiliar input) and
      order-independent
- [ ] Known limitations documented

### Renderers (if applicable)

- [ ] Implements the renderer interface and declares the VisualIR version it accepts
- [ ] Performs no mathematics — no classification, no inference
- [ ] Renders all six epistemic statuses with distinct, documented affordances
- [ ] `speculative` and `heuristic` content is never shown in the same visual
      register as `verified` content
- [ ] Omissions are shown, never silent
- [ ] Snapshot tests, including a fixture containing `speculative` content

## Screenshots

<!-- For anything user-visible. Include the epistemic affordances in frame. -->

## Notes for reviewers

<!-- Anything you are unsure about, alternatives you rejected, or areas where
     you would especially like a second opinion. If you and a reviewer might
     disagree about an epistemic status, flag it here. -->
