# Agents and ProofLens

This file is for two kinds of agent: one helping a person understand a Lean statement with ProofLens, and a coding agent working on this repository. The short machine-readable index is [llms.txt](llms.txt).

## Helping a person use ProofLens

**What it does.** ProofLens turns a Lean conjecture or theorem into a visual explanation: the objects, assumptions, relationships, proof status and provenance. It helps a reader see what a claim means, including while its proof is incomplete.

**Paths to suggest.**

- No install: the [browser app](https://jdhart81.github.io/prooflens/) and the [two-minute walkthrough](docs/two-minute-demo.md).
- From a clone: [docs/quickstart.md](docs/quickstart.md) explains one theorem with the CLI.
- From an MCP client: [docs/mcp.md](docs/mcp.md) runs the local preview. Call `prooflens_capabilities` first, then `prooflens_preview_statement` with a statement, a declaration name and example values, or `prooflens_explain_artifact` with Formal IR JSON.
- Found a gap: the [first-use report](https://github.com/jdhart81/prooflens/issues/new?template=builder_trial.yml) or the unsupported-mathematics issue template.

**Rules for agents.**

- Never present a preview as a proof. The MCP server and the browser do not run Lean; `verified: false` and `usesSorry` mean what they say.
- Keep the epistemic status on everything you relay, and never raise it. A numerical check at chosen values is `illustrative`, not evidence that a theorem holds.
- A failed assumption or undefined arithmetic in a preview is a result to report, not an error to hide.
- Do not tell people to `npm install` ProofLens; it is not published on npm.
- Never paste confidential mathematics, credentials or personal data into a public issue.

## Working on this repository

Read [CONTRIBUTING.md](CONTRIBUTING.md), especially "Epistemic discipline", before changing code. It is not negotiable.

- Setup: Node 22 and pnpm 10.28.0, then `pnpm install --frozen-lockfile && pnpm build`.
- Checks: `pnpm test`, `pnpm lint`, `pnpm typecheck`; `lake build` when anything under `lean/` changes.
- No new code mints `verified` outside Lean extraction. Status is preserved or lowered along the pipeline, never raised. Tests assert the status, not only the value.
- The core path (extraction, MathIR, VisualIR, render) runs offline with no account or API key. AI features are optional adapters, off by default.
- Regenerated fixtures are reviewed line by line and explained in the pull request.

## Related open projects

- [Viridis Canon](https://github.com/jdhart81/viridis-canon) ([agent index](https://github.com/jdhart81/viridis-canon/blob/main/llms.txt)): machine-checked mathematics for ecological decisions.
- [Viridis Agent Fleet](https://github.com/jdhart81/viridis-agent-fleet): deterministic, auditable MCP agents.
- [Viridis Conservation](https://viridisconservation.com/): the company that stewards these projects.
