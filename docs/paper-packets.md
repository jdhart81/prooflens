# Research-paper packets

ProofLens v0.2 begins with a versioned bridge between a paper's claim inventory and the Lean
declarations allowed to support those claims. The bridge is deliberately narrow: importing JSON
cannot manufacture `verified` standing.

## Packet format

`prooflens_paper_packet_v0_1` contains:

- paper identity, authors, stage, and a source receipt;
- stable claim ids and exact claim text;
- an evidence class for each claim;
- whether each claim requires a formal certificate; and
- for `lean-kernel` evidence, the declaration, module, and SHA-256 of the Formal IR expected to
  contain the theorem.

The accepted evidence classes are:

| Evidence class  | Meaning in an imported packet                                                       |
| --------------- | ----------------------------------------------------------------------------------- |
| `lean-kernel`   | May become `verified`, but only after an exact trusted Formal IR match.             |
| `formal-target` | Proposed theorem; remains `interpreted` and creates certificate debt.               |
| `numeric`       | Externally reported computation; remains `interpreted` until separately reproduced. |
| `assumed`       | An input assumption, not a theorem output.                                          |
| `deferred`      | Evidence or assessment is explicitly outstanding.                                   |

Unknown evidence classes, malformed hashes, mismatched evidence fields, and duplicate claim ids
block the packet. `lean-kernel` and `formal-target` claims are always certificate-required; a packet
cannot hide formal debt by switching that flag off.

## The witness gate

A `lean-kernel` claim becomes `verified` only when all of the following match trusted Formal IR:

1. the complete Formal IR file's SHA-256;
2. the fully-qualified declaration name;
3. the Lean module;
4. the exact pretty-printed statement; and
5. the declaration can mint ProofLens's private `KernelWitness`, meaning extraction succeeded and
   did not reach `sorry`.

If any check fails, the claim becomes `interpreted`, its required certificate remains debt, and the
packet gate is `HOLD`. A serialized receipt is not itself a witness capability.

## Command line

Validate the checked-in demonstration packet against trusted Formal IR and write a portable output
packet:

```bash
prooflens paper-import examples/viridis-intelligence-bound.paper-packet.json \
  --formal-ir examples/corpus.formal-ir.json \
  --out prooflens-paper-output.json
```

Omitting `--formal-ir` is allowed for inspection, but any certificate-required Lean claim stays on
hold. The command exits `0` for `READY`, `3` for a valid `HOLD`, and `1` for malformed input.

## Browser workflow

The web application loads the public Intelligence Bound demonstration packet against its committed
Formal IR. The **Import paper packet** control accepts another JSON packet. The **Download output
packet** control emits the normalized decision, claim statuses, reasons, and certificate-debt count.

The current browser does not accept an arbitrary embedded Formal IR as trusted. New Viridis papers
must first pass the normal Lean extraction and repository review path; only then can their packet
bind to that committed extraction.

## Next gate

Add a TorchLean exporter that attaches a model-enclosure witness receipt to this packet envelope.
The margin-report adapter remains `interpreted` until that receipt is checked through an
authoritative TorchLean propagation theorem or verifier.
