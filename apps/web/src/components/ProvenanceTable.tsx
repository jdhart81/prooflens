import type { SourceReference } from "@prooflens/epistemics";
import type { VisualSpec } from "@prooflens/visual-ir";
import { EpistemicChip } from "./EpistemicChip.js";
import { formatSpan, shortName } from "../lib/format.js";
import type { EpistemicStatus } from "@prooflens/epistemics";

interface ProvenanceRow {
  key: string;
  role: "entity" | "relationship" | "axis" | "annotation";
  element: string;
  label: string;
  detail: string;
  status: EpistemicStatus;
  ruleId: string | null;
  ruleInherited: boolean;
  sourceRef: SourceReference | undefined;
}

/**
 * The "why is ProofLens showing me this?" surface.
 *
 * Every mark in the selected figure gets a row: what it is, what it is worth,
 * which named rule put it there, which declaration it came from, and the
 * structural path into that declaration's expression tree that it stands for.
 */
export function ProvenanceTable({ spec }: { spec: VisualSpec | undefined }): JSX.Element {
  if (!spec) {
    return (
      <p className="empty">
        No figure is selected, so there is nothing to account for. Provenance is per-figure.
      </p>
    );
  }

  const specRule = spec.provenance.rule?.id ?? null;
  const fallbackSource = spec.provenance.sources[0];

  const rows: ProvenanceRow[] = [
    ...spec.entities.map<ProvenanceRow>((entity) => ({
      key: `entity:${entity.id}`,
      role: "entity",
      element: entity.kind,
      label: entity.label,
      detail: [entity.detail, entity.state, entity.emphasis].filter(Boolean).join(" · "),
      status: entity.epistemic,
      ruleId: specRule,
      ruleInherited: true,
      sourceRef: entity.sourceRef,
    })),
    ...spec.relationships.map<ProvenanceRow>((rel) => ({
      key: `rel:${rel.id}`,
      role: "relationship",
      element: rel.kind,
      label: rel.label ?? `${rel.from} → ${rel.to}`,
      detail: [rel.state, rel.emphasis].filter(Boolean).join(" · "),
      status: rel.epistemic,
      ruleId: specRule,
      ruleInherited: true,
      sourceRef: rel.sourceRef,
    })),
  ];

  const extras: ProvenanceRow[] = [
    ...spec.axes.map<ProvenanceRow>((axis) => ({
      key: `axis:${axis.id}`,
      role: "axis",
      element: `${axis.orientation} axis (${axis.scale})`,
      label: axis.label,
      detail: [axis.units, `${axis.ticks.length} ticks`].filter(Boolean).join(" · "),
      status: axis.epistemic,
      ruleId: specRule,
      ruleInherited: true,
      sourceRef: undefined,
    })),
    ...spec.annotations.map<ProvenanceRow>((annotation) => ({
      key: `ann:${annotation.id}`,
      role: "annotation",
      element: annotation.kind,
      label: annotation.text,
      detail: annotation.target ? `targets ${annotation.target}` : "",
      status: annotation.epistemic,
      ruleId: specRule,
      ruleInherited: true,
      sourceRef: undefined,
    })),
  ];

  return (
    <div className="provenance">
      <dl className="provenance__spec">
        <div className="meta__row">
          <dt>Figure</dt>
          <dd>
            <code className="inline-code">{spec.id}</code> · {spec.type}
          </dd>
        </div>
        <div className="meta__row">
          <dt>Worth</dt>
          <dd>
            <EpistemicChip status={spec.epistemic} size="sm" />
            <span className="meta__dim"> the weakest status of anything drawn in it</span>
          </dd>
        </div>
        <div className="meta__row">
          <dt>Rule</dt>
          <dd>
            {spec.provenance.rule ? (
              <>
                <code className="inline-code">{spec.provenance.rule.id}</code>{" "}
                <span className="meta__dim">{spec.provenance.rule.description}</span>
              </>
            ) : (
              <span className="meta__dim">no rule recorded</span>
            )}
          </dd>
        </div>
        <div className="meta__row">
          <dt>Sources</dt>
          <dd>
            {spec.provenance.sources.length === 0 ? (
              <span className="meta__dim">none</span>
            ) : (
              spec.provenance.sources.map((source) => (
                <span key={`${source.declaration}:${source.path ?? ""}`} className="source-pill">
                  <code className="inline-code">{shortName(source.declaration)}</code>
                  {source.path ? <span className="meta__dim"> {source.path}</span> : null}
                  {source.span ? (
                    <span className="meta__dim"> ({formatSpan(source.span)})</span>
                  ) : null}
                </span>
              ))
            )}
          </dd>
        </div>
        {spec.provenance.inputs && spec.provenance.inputs.length > 0 ? (
          <div className="meta__row">
            <dt>Inputs</dt>
            <dd>
              <code className="inline-code">{spec.provenance.inputs.join(", ")}</code>
            </dd>
          </div>
        ) : null}
        {spec.provenance.note ? (
          <div className="meta__row">
            <dt>Note</dt>
            <dd>{spec.provenance.note}</dd>
          </div>
        ) : null}
      </dl>

      <ProvenanceRows
        caption={`Entities and relationships (${rows.length})`}
        rows={rows}
        fallbackDeclaration={fallbackSource?.declaration}
      />
      {extras.length > 0 ? (
        <ProvenanceRows
          caption={`Axes and annotations (${extras.length})`}
          rows={extras}
          fallbackDeclaration={fallbackSource?.declaration}
        />
      ) : null}
    </div>
  );
}

function ProvenanceRows({
  caption,
  rows,
  fallbackDeclaration,
}: {
  caption: string;
  rows: readonly ProvenanceRow[];
  fallbackDeclaration: string | undefined;
}): JSX.Element {
  return (
    <div className="table-scroll">
      <table className="prov-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Element</th>
            <th scope="col">Label</th>
            <th scope="col">Status</th>
            <th scope="col">Rule</th>
            <th scope="col">Declaration</th>
            <th scope="col">Path</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const declaration = row.sourceRef?.declaration ?? fallbackDeclaration;
            return (
              <tr key={row.key}>
                <td>
                  <span className={`role role--${row.role}`}>{row.role}</span>
                </td>
                <td>
                  <code className="inline-code">{row.element}</code>
                </td>
                <td className="prov-table__label">
                  <span>{row.label}</span>
                  {row.detail ? <span className="meta__dim"> — {row.detail}</span> : null}
                </td>
                <td>
                  <EpistemicChip status={row.status} size="sm" />
                </td>
                <td>
                  {row.ruleId ? (
                    <code
                      className="inline-code"
                      title={
                        row.ruleInherited
                          ? "Inherited from the figure's rule: this element was placed by that rule."
                          : undefined
                      }
                    >
                      {row.ruleId}
                    </code>
                  ) : (
                    <span className="meta__dim">—</span>
                  )}
                </td>
                <td>
                  {declaration ? (
                    <code className="inline-code" title={declaration}>
                      {shortName(declaration)}
                    </code>
                  ) : (
                    <span className="meta__dim">—</span>
                  )}
                  {row.sourceRef?.span ? (
                    <div className="meta__dim">{formatSpan(row.sourceRef.span)}</div>
                  ) : null}
                </td>
                <td>
                  {row.sourceRef?.path ? (
                    <code className="inline-code">{row.sourceRef.path}</code>
                  ) : (
                    <span className="meta__dim">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
