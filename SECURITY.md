# Security Policy

## Supported versions

ProofLens is pre-1.0. Only the current minor series receives security fixes.

| Version | Supported |
| --- | --- |
| `0.1.x` | Yes — fixes land on the latest `0.1.x` patch release |
| `< 0.1` | No |

There are no long-term support branches yet. If you are running ProofLens,
track the latest `0.1.x` patch.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: on the repository page, open
**Security → Report a vulnerability**. This reaches the maintainers privately
without depending on an email domain.

**Please do not open a public issue, pull request, or discussion thread for a
suspected vulnerability.** Public reports expose users before a fix exists. Use
the email address above and give us a chance to ship a patch first.

A useful report includes:

- what the issue is, and what an attacker gains from it;
- the affected version, commit, or release;
- the affected component — Lean extractor, a TypeScript package, `apps/web`, an
  AI adapter, or CI;
- reproduction steps, ideally a minimal input file or repository;
- any proof-of-concept you have.

If you would like to encrypt your report, say so in a first email without
details and we will arrange a key.

### What to expect

- **Acknowledgement within 5 business days** of your report.
- An initial assessment — whether we can reproduce it, and our severity read —
  in the same reply or shortly after.
- Regular updates while we work on a fix.
- Credit in the release notes when the fix ships, unless you prefer to stay
  anonymous. Tell us which you want.

We ask that you give us reasonable time to release a fix before disclosing
publicly. We will not pursue legal action against anyone who reports in good
faith, acts in accordance with this policy, and does not access or modify data
belonging to others.

ProofLens is a volunteer, open-source project. We do not operate a paid bug
bounty.

## Scope and trust boundaries

Read this section before deciding how to run ProofLens. Some of what follows is
not a bug — it is the design, and it has consequences.

### ProofLens executes no untrusted code — but it *does* elaborate Lean modules

The ProofLens pipeline downstream of extraction (Formal IR → MathIR → VisualIR →
renderers) evaluates nothing. It is pure data transformation over
schema-validated JSON, with no `eval`, no dynamic module loading, and no
subprocess execution.

**Extraction is different, and this is the project's principal trust boundary.**

The `prooflens-extract` executable imports and elaborates the Lean modules you
point it at. Importing a Lean module means running Lean's elaborator over that
code, and Lean is a language with a full metaprogramming layer: `macro`,
`elab`, `#eval`, `initialize` blocks, and tactics are ordinary Lean programs
that run at elaboration time with `IO` available. The extractor imports at a
high trust level so that it can read the environment it needs.

Stated plainly:

> **Running ProofLens extraction over a Lean project is equivalent to running
> that project's code.** A hostile Lean file can read your files, open network
> connections, and execute arbitrary commands the moment it is imported — before
> ProofLens has produced a single byte of Formal IR.

This is not a defect we intend to fix, and it is not specific to ProofLens: it
is true of `lake build`, of the Lean language server, and of any tool that
elaborates Lean source. There is no sandbox in the extractor, and you should not
assume one.

**What this means in practice:**

- Only run extraction over Lean code you would be willing to `lake build` — that
  is, code you trust as much as you trust any other program you run.
- Do not build a service that accepts Lean source from the public internet and
  extracts it, unless you have put it inside a real sandbox: a container or VM
  with no credentials, no writable host mounts, and no network egress. Process
  isolation alone is not enough.
- Treat Lean dependencies pulled in by `lake` the way you treat any other
  package-manager dependency. `lake-manifest.json` pins revisions; review
  changes to it.
- CI that extracts from a pull request's branch is running that pull request's
  code. Gate it accordingly.

By contrast, **Formal IR JSON is inert**. Once extraction has happened, the JSON
can be moved between machines and processed by the TypeScript side without
re-running any Lean code. If you need to analyse untrusted mathematics, extract
it inside a sandbox and carry the JSON out.

### Optional AI adapters send data to third parties

ProofLens can optionally use a language model to produce prose explanations.
These adapters:

- are **off by default** and require explicit configuration plus an API key you
  supply;
- live outside the core path — extraction, MathIR, VisualIR, and rendering all
  run fully offline with no account and no network;
- **send theorem statements, and surrounding context such as names, docstrings,
  and hypotheses, to a third-party API** when enabled.

If your Lean development is confidential — unpublished results, work under
embargo, code under NDA — do not enable an AI adapter, or point it at a model
you host yourself. Once enabled, the adapter's data handling is governed by that
provider's terms, not by this project. We cannot make guarantees on their
behalf.

Adapter output is always tagged `speculative` and is never presented as
formally verified. That is an integrity property of the pipeline, described in
[CONTRIBUTING.md](CONTRIBUTING.md#epistemic-discipline) — but note that it
protects the *reader*, not your *confidentiality*. Both matter, and they are
separate concerns.

### The web shell

`apps/web` is a client-side viewer over VisualIR. It has no server component, no
authentication, and no persistence beyond the browser. Rendering a VisualIR
document from an untrusted source is a lower-risk operation than extraction, but
it is not zero-risk: documents contain text that ends up in the DOM. We treat
DOM-injection issues in the renderers as in scope, and would like to hear about
them.

### Also in scope

- Schema-validation bypasses that let unvalidated data reach a later stage.
- Anything that lets non-`verified` information be presented as `verified`, or
  that strips or forges provenance. We treat epistemic-integrity failures as
  security issues, because misrepresenting an unproved claim as machine-checked
  is exactly the harm this project exists to prevent.
- Path traversal or unintended file writes in the CLI.
- Dependency vulnerabilities that are actually reachable from ProofLens code.

### Out of scope

- Arbitrary code execution achieved by pointing the extractor at hostile Lean
  source. That is the documented trust boundary above, not a vulnerability.
- Vulnerabilities in Lean, Lake, elan, Node, or pnpm themselves — report those
  upstream. Tell us anyway if ProofLens amplifies the impact.
- Denial of service from deliberately enormous inputs — huge Lean modules or
  deeply nested IR documents may exhaust memory. Bounds are an open engineering
  problem, not a security response.
- Data handling by third-party model providers used through an optional adapter
  you enabled.
- Findings from an automated scanner with no demonstrated impact.

## Security-relevant design commitments

These are properties we intend to keep. If you find one violated, that is worth
reporting:

1. The core pipeline runs offline. No network access is required to go from
   Formal IR to a rendered visualization.
2. No telemetry. ProofLens does not phone home.
3. No proprietary API is a dependency of the core path.
4. Every IR boundary validates with a strict schema on both input and output.
5. Extraction is the only component that executes anything.
