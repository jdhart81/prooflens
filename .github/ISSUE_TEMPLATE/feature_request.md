---
name: Feature request
about: Suggest a capability or improvement for ProofLens
title: "feat: "
labels: ["enhancement", "needs-triage"]
---

<!--
If you are asking for a specific theorem or family of theorems to be understood
and visualized, the "Unsupported mathematics" template is a better fit — it
captures the Lean declaration and Formal IR we need to actually build the rule.
-->

## The problem

<!-- What is hard or impossible today? Describe the situation you are in, not
     the solution you have in mind. Concrete examples from real Lean code are
     far more persuasive than abstractions. -->

## Proposed solution

<!-- What would you like ProofLens to do? -->

## Where it fits in the pipeline

<!-- ProofLens is layered: Formal IR → MathIR → VisualIR → renderers. Knowing
     which layer your idea belongs to helps enormously. Best guess is fine. -->

- [ ] Lean extraction — more information out of the Lean environment
- [ ] Classification — a new rule for understanding statements
- [ ] MathIR — a new structural concept the IR cannot currently express
- [ ] VisualIR — a new visual vocabulary (marks, channels, annotations)
- [ ] Renderer — a new or improved output target
- [ ] Web shell / infoview widget — interaction and UI
- [ ] CLI / developer experience
- [ ] Documentation
- [ ] Not sure

## Epistemic status of what this would show

<!--
Every piece of information ProofLens displays is tagged: verified, derived,
interpreted, heuristic, illustrative, or speculative. If your feature would put
new information in front of a user, what status would it honestly carry?

`verified` may only come from Lean extraction. If your idea requires ProofLens
to assert something Lean did not check, it needs a lower status — that is fine
and normal, but it shapes how the feature can be presented.
-->

- [ ] `verified` — comes directly from Lean
- [ ] `derived` — mechanically computed from verified data
- [ ] `interpreted` — an explicit, reviewable rule reading the structure
- [ ] `heuristic` — a useful rule that will sometimes be wrong
- [ ] `illustrative` — a visual or example aid making no mathematical claim
- [ ] `speculative` — generated prose or model output
- [ ] Not applicable — this does not add displayed information

Notes:

## Alternatives considered

<!-- Other approaches, and why they are worse. Including "do nothing". -->

## Does this require anything new from outside?

- [ ] Needs a new runtime dependency
- [ ] Needs network access or a hosted API

<!--
Note: the core path — extraction through rendering — must run fully offline and
deterministically, with no account and no API key. Ideas that need a hosted
service can still work, but only as an optional adapter outside the core path.
-->

## Would you be willing to work on this?

- [ ] Yes, with some guidance
- [ ] Yes, I know where to start
- [ ] No, but I would test it
- [ ] No

## Additional context

<!-- Prior art, screenshots, papers, links to how other tools handle it. -->
