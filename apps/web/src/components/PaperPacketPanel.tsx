import { useEffect, useState } from "react";
import {
  compilePaperPacket,
  paperOutputPacket,
  type PaperPacketResult,
  type TrustedFormalIR,
} from "@prooflens/paper-packet";
import { EpistemicChip } from "./EpistemicChip.js";

const DEFAULT_PACKET_URL = "viridis-intelligence-bound.paper-packet.json";

type PacketState =
  | { status: "loading" }
  | { status: "blocked"; reason: string }
  | { status: "ready"; result: Extract<PaperPacketResult, { status: "ready" }>; label: string };

export function PaperPacketPanel({
  formalIr,
  formalIrSha256,
}: {
  formalIr: TrustedFormalIR["document"];
  formalIrSha256: string;
}): JSX.Element {
  const [packet, setPacket] = useState<PacketState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function loadDefault(): Promise<void> {
      try {
        const response = await fetch(DEFAULT_PACKET_URL);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const value = (await response.json()) as unknown;
        if (cancelled) return;
        setCompiled(
          value,
          "Built-in public demonstration",
          { document: formalIr, sha256: formalIrSha256 },
          setPacket,
        );
      } catch (error) {
        if (!cancelled) {
          setPacket({
            status: "blocked",
            reason: `Could not load the demonstration paper packet: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }
    void loadDefault();
    return () => {
      cancelled = true;
    };
  }, [formalIr, formalIrSha256]);

  async function importFile(file: File): Promise<void> {
    try {
      const value = JSON.parse(await file.text()) as unknown;
      setCompiled(value, file.name, { document: formalIr, sha256: formalIrSha256 }, setPacket);
    } catch (error) {
      setPacket({
        status: "blocked",
        reason: `The selected file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (packet.status === "loading") {
    return (
      <section className="panel paper-packet" aria-labelledby="paper-packet-title">
        <h2 id="paper-packet-title">Viridis paper packet</h2>
        <p role="status">Loading and validating the public demonstration packet…</p>
      </section>
    );
  }

  if (packet.status === "blocked") {
    return (
      <section
        className="panel paper-packet paper-packet--blocked"
        aria-labelledby="paper-packet-title"
      >
        <header className="paper-packet__header">
          <div>
            <p className="semantic-scene__eyebrow">ProofLens v0.2 preview</p>
            <h2 id="paper-packet-title">Paper packet blocked</h2>
          </div>
          <PacketImport onFile={importFile} />
        </header>
        <p className="paper-packet__error" role="alert">
          {packet.reason}
        </p>
      </section>
    );
  }

  const { scene } = packet.result;
  return (
    <section className="panel paper-packet" aria-labelledby="paper-packet-title">
      <header className="paper-packet__header">
        <div>
          <p className="semantic-scene__eyebrow">ProofLens v0.2 preview · {packet.label}</p>
          <h2 id="paper-packet-title">{scene.packet.paper.title}</h2>
          <p>
            A hash-bound bridge from a research-paper claim inventory to the exact Lean declarations
            ProofLens is allowed to call verified.
          </p>
        </div>
        <div className="paper-packet__actions">
          <PacketImport onFile={importFile} />
          <button type="button" onClick={() => downloadOutput(scene)}>
            Download output packet
          </button>
        </div>
      </header>

      <div className={`paper-packet__gate paper-packet__gate--${scene.gate.toLowerCase()}`}>
        <div>
          <span>PACKAGE GATE</span>
          <strong>{scene.gate}</strong>
        </div>
        <p>
          {scene.gate === "READY"
            ? "Every claim that requires a certificate matched a trusted, zero-sorry Formal IR declaration."
            : `${scene.summary.certificateDebt} required certificate${scene.summary.certificateDebt === 1 ? "" : "s"} did not match trusted Formal IR.`}
        </p>
      </div>

      <div className="paper-packet__summary" aria-label="Paper packet summary">
        <Summary value={scene.summary.claims} label="claims" />
        <Summary value={scene.summary.verified} label="kernel verified" />
        <Summary value={scene.summary.interpreted} label="interpreted" />
        <Summary value={scene.summary.certificateDebt} label="certificate debt" />
      </div>

      <ol className="paper-packet__claims" aria-label="Paper claims">
        {scene.claims.map((claim) => (
          <li key={claim.id}>
            <div className="paper-packet__claim-topline">
              <code>{claim.id}</code>
              <span className="paper-packet__evidence">{claim.evidenceClass}</span>
              <EpistemicChip status={claim.status} />
            </div>
            <h3>{claim.title}</h3>
            <p className="paper-packet__statement">{claim.statement}</p>
            <p className="paper-packet__reason">
              <strong>{claim.verification.replaceAll("-", " ")}</strong> · {claim.reason}
            </p>
            {claim.note ? <p className="paper-packet__note">{claim.note}</p> : null}
          </li>
        ))}
      </ol>

      <footer className="paper-packet__source">
        <div>
          <strong>Paper source receipt</strong>
          <span>
            {scene.packet.paper.id} · {scene.packet.paper.version} · {scene.packet.paper.stage}
          </span>
        </div>
        {scene.packet.paper.source.locator.startsWith("https://") ? (
          <a href={scene.packet.paper.source.locator} target="_blank" rel="noreferrer">
            Open source
          </a>
        ) : (
          <code>{scene.packet.paper.source.locator}</code>
        )}
      </footer>
    </section>
  );
}

function setCompiled(
  value: unknown,
  label: string,
  trustedFormalIr: TrustedFormalIR,
  setPacket: React.Dispatch<React.SetStateAction<PacketState>>,
): void {
  const result = compilePaperPacket(value, { trustedFormalIr });
  if (result.status === "blocked") {
    setPacket({ status: "blocked", reason: result.reason });
  } else {
    setPacket({ status: "ready", result, label });
  }
}

function PacketImport({ onFile }: { onFile: (file: File) => Promise<void> }): JSX.Element {
  return (
    <label className="paper-packet__import">
      Import paper packet
      <input
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void onFile(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function Summary({ value, label }: { value: number; label: string }): JSX.Element {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function downloadOutput(scene: Extract<PaperPacketResult, { status: "ready" }>["scene"]): void {
  const output = paperOutputPacket(scene);
  const blob = new Blob([`${JSON.stringify(output, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${scene.packet.paper.id}.prooflens-output.json`;
  link.click();
  URL.revokeObjectURL(url);
}
