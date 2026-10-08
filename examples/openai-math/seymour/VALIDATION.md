# Seymour explorer validation

Initial implementation checked locally on October 7, 2026. This records engineering evidence for the
finite example explorer and caption corrections, not a certificate for OpenAI's
released solution or evidence of community adoption.

| Check                    | Result                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Repository tests         | 1,231 passing tests in 33 files                                                                         |
| Independent graph oracle | All 59,809 oriented graphs on one to five vertices; 298,249 vertex neighborhoods agree                  |
| Lean correspondence      | 18 audited proofs; only standard Lean axioms, no `sorryAx` or native evaluation axioms in our proofs    |
| TypeScript and lint      | Passed for packages, widget, and web app                                                                |
| Web data path            | All 16 checks pass, including the 35 existing declarations and new explorer                             |
| Production web build     | Passed; existing large-bundle warning remains                                                           |
| Generated Lean widget    | Rebuilt with corrected captions                                                                         |
| Browser interactions     | Cycle, sink, repeated paths, shortcut exclusion, keyboard selection, edge cycling, and resizing checked |
| Small-screen layout      | No horizontal overflow at 375 CSS pixels; graph and counts remain readable                              |
| Browser export           | Downloaded JSON agrees with the current evaluator and exact pinned source metadata                      |
| Existing app             | Corpus navigation still displays all 35 statements                                                      |

The caption changes suppress assumption-use findings when a declaration uses
`sorry` or has no available proof term. Declaration-reference diagrams now
describe constants from the statement and body; they do not present those
references as proof steps. Regression tests retain completed-proof behavior.

Reproduce the checks from the repository root:

```sh
pnpm typecheck
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm lint
pnpm format:check
pnpm test
pnpm --filter @prooflens/web verify
pnpm --filter @prooflens/web build
pnpm build:widget
pnpm verify:seymour-lean
```

The Lean verifier needs the corpus's existing pinned toolchain and cached
mathlib dependencies. See the [companion specification](README.md) for exact
source hashes, prerequisites, fixture results, and receipt options. Its CI check
runs after the existing corpus dependency preparation.

This is a curated scene wired to its own finite graph model. It does not add
automatic extraction of arbitrary graph theorems, reproduce the upstream Lean
4.34.1 environment, verify the released solution, or establish reader
comprehension. The separate Lean specification and TypeScript oracle are two
forms of evidence; no formal theorem connecting the TypeScript program to Lean
is claimed. Independent reader trials remain the next community validation step.

## Integration with current main

Before pushing, the implementation was merged with remote main
`ea3aeb4`, preserving its security fixes, MCP tools, injectivity visualization,
and 360-example TorchLean certificate work. With the updated locked dependencies
and Node 24.19.0, all **1,276 tests in 35 files** and all **18 web checks** passed.
Package/widget/web type checks, lint, formatting, production web build, regenerated
widget, and the **18-proof Lean correspondence check** also passed. This later
integration check supersedes the initial engineering counts above; mathematical
and reader-evaluation scope remains the same.
