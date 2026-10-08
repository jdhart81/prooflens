# Use ProofLens from an MCP client

This local developer preview explains supplied Lean statements and Formal IR JSON.
It uses the same guarded input loaders and deterministic analysis as browser imports.
No Lean installation, provider API key, wallet, account or hosted service is required.
It does not compile projects or authenticate proofs.

## Install from this checkout

Use Node 22 and pnpm 10.28.0, then run:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Add this server entry using your client's configuration format. Replace both paths
with absolute paths on your machine. Run Node directly: launching via `pnpm mcp`
can put package-manager output on the protocol stream.

```json
{
  "mcpServers": {
    "prooflens": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/prooflens/packages/mcp/dist/bin.js"]
    }
  }
}
```

The repository package is a local preview, not a published npm package. Configuration
syntax and SVG display vary between clients. The integration test uses the official
TypeScript SDK client over stdio; it does not establish compatibility with every app.

## First useful call

Ask the assistant to call `prooflens_capabilities`, then `prooflens_preview_statement`:

```json
{
  "source": "theorem cooling_bound (P T : ℝ) (hP : 0 < P) (hT : 0 < T) : 0 < P / T := by sorry",
  "declaration": "cooling_bound",
  "values": { "P": 2, "T": 1 }
}
```

Expected: source preview, `verified: false`, `usesSorry: true`, assumptions holding
at these values and a numerical right side of 2. Ask the client to read `markdownUri`
and `svgUri` through MCP resources. The SVG is the first available **structural
figure**, not the browser's numeric curve and not a plot of supplied values.

Repeat with `T: 0`. The response must show a failed assumption and undefined
arithmetic, not a successful numerical assessment. Change the proof body to
`positivity`: it still remains unverified because this server does not run Lean.

Use `prooflens_explain_artifact` with `formalIrJson` (a JSON string) and a declaration
name to analyse an extraction. Uploaded provenance does not establish kernel
verification. Prefer exact names; ambiguous short names are rejected.

## Limits and data handling

- Source: 32,000 UTF-8 bytes, at most 64 nested delimiters. JSON: 512,000 UTF-8 bytes.
  Both retain the loaders' maximum of 250 declarations and supported syntax limits.
- Source analysis accepts explicit real arithmetic and supported comparisons,
  scaling and limit forms. Unsupported syntax returns a useful error or gap.
- Numeric values use returned control IDs or unambiguous symbols. Duplicate aliases,
  unknown symbols and non-finite values are rejected. Omitted controls use displayed defaults.
- Input and generated artifacts remain in the local server process. The MCP client
  or its model provider may separately retain or transmit what you supply; choose
  inputs appropriate to that client's policies.
- Generated resources are held in memory only, capped at 12 artifacts / 2 MB.
  Older artifacts expire; restarting clears them. Rerun an analysis to recreate one.
- The adapter does not read supplied filesystem paths, fetch URLs, execute proof
  bodies, compile projects, call models or write input files.
- Source text and annotations are untrusted data. A numerical example, structural
  figure or imported extraction is not a new proof or a certification.

## Validate the installation

```bash
pnpm build
pnpm exec vitest run packages/mcp/test/mcp.test.ts
```

The test launches the actual stdio entrypoint with the official MCP client,
discovers tools, reads Markdown/SVG resources and exercises error recovery and
artifact expiry. It also checks source and imported-data trust boundaries.

For an outside trial, use a statement of your own and report what became clearer,
which assumption mattered, and any unsupported form using the existing
[trial report](https://github.com/jdhart81/prooflens/issues/new?template=builder_trial.yml).
