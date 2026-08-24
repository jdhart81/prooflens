---
name: Bug report
about: Something in ProofLens behaves incorrectly
title: "bug: "
labels: ["bug", "needs-triage"]
---

<!--
If ProofLens extracted a theorem but could not classify or visualize it, that is
not a bug — please use the "Unsupported mathematics" template instead. It goes to
a different place in our roadmap and we want those reports.

If this is a security issue, please do NOT file it here. Email
security@prooflens.dev instead. See SECURITY.md.
-->

## What happened

<!-- A clear description of the incorrect behaviour. -->

## What you expected

<!-- What should have happened instead. -->

## Reproduction

Steps to reproduce:

1.
2.
3.

<!--
The most useful reproduction is a minimal Lean declaration plus the exact
commands. If the problem is downstream of extraction, attaching the Formal IR
JSON lets us reproduce without your Lean environment at all.
-->

Minimal Lean declaration, if relevant:

```lean

```

Commands run:

```bash

```

## Which stage

<!-- Where in the pipeline does it go wrong? Tick what you know. -->

- [ ] Lean extraction (`prooflens-extract`)
- [ ] Formal IR → MathIR (classification)
- [ ] MathIR → VisualIR (layout / encoding)
- [ ] Renderer (which one? )
- [ ] Web shell (`apps/web`)
- [ ] Lean infoview widget
- [ ] CLI / tooling
- [ ] AI adapter (optional, off by default)
- [ ] Not sure

## Output

<!-- Error messages, stack traces, or the relevant slice of IR JSON. Please paste
     as text rather than a screenshot where you can. Trim it to what matters. -->

```

```

## Is this an epistemic-integrity issue?

<!--
Answer yes if something unverified was shown as verified, if a status was
raised along the pipeline, or if provenance was dropped, forged, or wrong.
We treat these as high severity — they are the failure mode the project exists
to prevent. If the answer is yes, please say exactly what was shown and what
its true status should have been.
-->

- [ ] Yes — information was presented with a stronger epistemic status than it
      deserves, or provenance was lost
- [ ] No

Details:

## Environment

- ProofLens version / commit:
- OS and architecture:
- Node version (`node --version`):
- pnpm version (`pnpm --version`):
- Lean version (`lean --version`, expected `4.24.0`):
- elan version (`elan --version`):
- Browser and version, if relevant:

## Additional context

<!-- Anything else: when it started, whether it used to work, a workaround
     you found. -->
