# The epistemic model

This is the document that matters most. Everything else in ProofLens is
machinery in service of the distinction described here.

## The problem

A proof assistant tells you one thing very precisely: that a particular
proposition follows from particular assumptions, by rules a kernel checked.

Everything a human wants to know beyond that — what the theorem *means*, why it
is interesting, what it implies physically, what the bound looks like, which
assumption is doing the work — is not in the kernel's answer. It is
interpretation. Some of it is mechanically derived and reliable; some of it is a
convention this project chose; some of it, in future versions, will come from a
language model and be worth rather less.

The failure mode ProofLens exists to prevent is simple to state and easy to fall
into: **interpretation borrowing the authority of the theorem it is attached
to.** A confident diagram beside a verified statement reads as though the
diagram were verified too. It is not, and a system that blurs the two is worse
than no system, because it launders guesses into apparent certainty.

## The six states

ProofLens tags every piece of information with one of six statuses, ordered from
strongest to weakest. The order is a lattice, and it is used, not decorative.

| Status | Means | Example |
|---|---|---|
| `verified` | Asserted by the proof assistant's kernel. | The exact Lean statement of a theorem. |
| `derived` | Computed from verified data by a deterministic, inspectable rule. | "The conclusion's relation is `≤`, so this is an upper bound." |
| `interpreted` | A reading of the formal statement, or a human author's declaration about it. | "`P` is electrical power, measured in watts." |
| `heuristic` | A rule of thumb expected to be wrong sometimes. | A guess at which of several plots would be most useful. |
| `illustrative` | A display choice that makes no mathematical claim. | The position of a marker on a schematic axis. |
| `speculative` | Produced by a language model or other unverified source. | A generated analogy. |

`heuristic` and `speculative` are unused in v0.1, because v0.1's core contains
no heuristics and no model. They exist in the schema because the architecture
has to be right before the features arrive, not after.

## Two guarantees, enforced in code

These are not conventions that reviewers are asked to uphold. They are
properties of `@prooflens/epistemics`.

### 1. `verified` cannot be manufactured

The only function that produces a `verified` claim is `transcribe`, and it
requires a `KernelWitness`:

```ts
export function transcribe<T>(
  witness: KernelWitness,
  value: T,
  provenance: Omit<Provenance, "rule"> & { rule?: never },
): Claim<T>
```

A `KernelWitness` carries a brand keyed by a **module-local** symbol. Not
`Symbol.for`: a registry symbol is reachable by any code in the realm that knows
the string, which would make the brand a naming convention rather than a
capability. Because the symbol is unreachable from outside the module, the only
way to obtain a witness is `mintKernelWitness`, and that is called from exactly
one place — the Formal IR loader in `@prooflens/formal-ir`.

`mintKernelWitness` returns `null` when the declaration's proof reached
`sorryAx`. A statement that was not proved therefore cannot yield a `verified`
claim anywhere in the system, no matter what any later stage would like to say
about it.

### 2. Confidence only ever decreases

`derive` is the only way to move a claim through the pipeline:

```ts
const status = weakest(rule.produces, "derived", ...inputs.map((c) => c.status));
```

The result is the weakest of the rule's ceiling, a hard `derived` floor, and
every input's status. `Rule.produces` is typed `Exclude<EpistemicStatus,
"verified">`, so a rule claiming kernel standing does not compile; the explicit
`"derived"` in the fold means it does not work at runtime either, because types
are erased and this module's job is to be true of the running program.

A chain of transformations can therefore only travel downhill. There is no API
that turns `speculative` back into `derived`, and `weaken` exists to move in the
one direction that is always sound.

## Provenance

An epistemic status without provenance is an assertion about an assertion. Every
claim carries:

```ts
interface Provenance {
  sources: SourceReference[];   // declaration, module, source span, structural path
  rule?: Rule;                  // stable id, e.g. RELATION_UPPER_BOUND_001
  inputs?: string[];            // upstream claim ids
  note?: string;
}
```

`SourceReference.path` is a structural path into the declaration's expression
tree — `conclusion.args[3]` — which is what lets a visual element point at the
exact subterm responsible for it. Rule ids are public API: they appear in
provenance output, in tests, and in issue reports, so renaming one is a breaking
change.

The question the UI must be able to answer is *"why are you showing me this?"*,
and the answer must name evidence rather than restate the conclusion. Compare:

> The conclusion `x ≤ P / T` puts `x` on the smaller side of `≤`, so `P / T` is
> an upper bound for it.

against "This theorem defines an upper bound." The first can be checked; the
second must be believed.

## Where each stage sits

| Stage | Strongest status it can emit | Why |
|---|---|---|
| Formal IR | `verified` | Transcription of what the kernel accepted. |
| MathIR | `derived` | The Lean-constant-to-mathematics table is ours, not the kernel's. |
| Classifiers | `derived` | Deterministic rules over verified structure. |
| Semantic annotations | `interpreted` | A human author's claim. Lean checked none of it. |
| Visualization planner | `derived` | Selection is deterministic and explains itself. |
| Schematic axes and positions | `illustrative` | Chosen for legibility. They assert nothing. |
| AI adapters (future) | `speculative` | Nothing underwrites them. |

The last row is the one the whole design exists for. When a language model
eventually writes an explanation, the architecture already guarantees it arrives
labelled, that it cannot be promoted, and that a reader can tell it apart from
the theorem at a glance.

## Three worked consequences

**A schematic plot is `illustrative`, even for a verified theorem.** The figure
for `x ≤ P / T` shows which side of a marker `x` may lie on. It says nothing
about magnitudes, because nothing in the theorem determines them. The axis is
tagged `illustrative`, the spec's overall status is the weakest of its parts, and
the figure carries a legend saying so in words. This is not pedantry: an axis
that looks measured but is not is a lie told in a visual grammar readers trust.

**A `sorry` collapses everything.** If a proof reaches `sorryAx`, no witness is
minted, the `formal` explanation layer switches from "What was proved" to "What
was stated", a warning banner leads the panel, and every downstream claim is
`derived` at best. The statement's *structure* is still analysable — it is a real
Lean term — but nothing about its truth is.

**An unused hypothesis is `derived`, not `verified`, and the wording says why.**
Occurrence analysis on the elaborated proof term is mechanical and reliable, so
it is `derived`. But "this proof does not use `hP`" and "`hP` is unnecessary" are
different statements, and only the first is supported. Every surface that reports
it says so:

> `hP : 0 < P` is stated but never used by this proof term. That does not mean
> the hypothesis is mathematically unnecessary — only that this particular proof
> does not touch it.

## Testing the invariant

`packages/epistemics/test/no-forged-verification.test.ts` is the test that
matters. It attempts to forge a witness (including with `Symbol.for`, which was
a real hole during development and is now closed), asserts that `derive` can
never emit `verified` for any combination of rule ceiling and input statuses,
and walks the entire object graph produced by running the real corpus through
the pipeline to confirm that every `verified` claim in the system is a rule-less
transcription and nothing else.

A change that makes those tests fail is not a refactor. It is a change to what
ProofLens is for.

## Related

- [architecture.md](architecture.md) — where each stage lives
- [ADR 0003](adr/0003-semantic-annotations.md) — why author annotations are `interpreted`
- [visual-ir.md](visual-ir.md) — how epistemic status is encoded in figures
