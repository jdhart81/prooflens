import { useEffect, useRef, type KeyboardEvent } from "react";
import type { TheoremAnalysis } from "@prooflens/pipeline";
import { KIND_LABEL, primaryKind, shortName, unusedHypothesisCount } from "../lib/format.js";

export interface ListFilters {
  query: string;
  onlyUnusedHypotheses: boolean;
  onlyUnsupported: boolean;
}

interface TheoremListProps {
  total: number;
  visible: readonly TheoremAnalysis[];
  selectedName: string;
  onSelect: (name: string) => void;
  filters: ListFilters;
  onFiltersChange: (filters: ListFilters) => void;
}

/**
 * ARIA listbox with selection-following-focus: arrow keys, Home and End move
 * the selection and DOM focus together, so the whole app is drivable from the
 * keyboard once this list has focus.
 */
export function TheoremList({
  total,
  visible,
  selectedName,
  onSelect,
  filters,
  onFiltersChange,
}: TheoremListProps): JSX.Element {
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    itemRefs.current.length = visible.length;
  }, [visible.length]);

  function moveTo(index: number, event: KeyboardEvent<HTMLLIElement>): void {
    const clamped = Math.max(0, Math.min(visible.length - 1, index));
    const target = visible[clamped];
    if (!target) return;
    event.preventDefault();
    onSelect(target.math.name);
    itemRefs.current[clamped]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number): void {
    switch (event.key) {
      case "ArrowDown":
        moveTo(index + 1, event);
        break;
      case "ArrowUp":
        moveTo(index - 1, event);
        break;
      case "Home":
        moveTo(0, event);
        break;
      case "End":
        moveTo(visible.length - 1, event);
        break;
      case "PageDown":
        moveTo(index + 8, event);
        break;
      case "PageUp":
        moveTo(index - 8, event);
        break;
      case "Enter":
      case " ": {
        const target = visible[index];
        if (target) {
          event.preventDefault();
          onSelect(target.math.name);
        }
        break;
      }
      default:
        break;
    }
  }

  return (
    <section className="panel panel--list" aria-labelledby="theorems-heading">
      <header className="panel__header">
        <h2 id="theorems-heading" className="panel__title">
          Theorems
        </h2>
        <span className="panel__count">
          {visible.length} of {total}
        </span>
      </header>

      <div className="filters">
        <label className="filters__search">
          <span className="sr-only">Filter theorems by name, module or statement</span>
          <input
            type="search"
            value={filters.query}
            placeholder="Filter by name, module or statement…"
            onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
          />
        </label>
        <div className="filters__toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={filters.onlyUnusedHypotheses}
              onChange={(event) =>
                onFiltersChange({ ...filters, onlyUnusedHypotheses: event.target.checked })
              }
            />
            <span>has unused hypotheses</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={filters.onlyUnsupported}
              onChange={(event) =>
                onFiltersChange({ ...filters, onlyUnsupported: event.target.checked })
              }
            />
            <span>unsupported</span>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="empty">No declaration matches these filters.</p>
      ) : (
        <ul className="thm-list" role="listbox" aria-label="Theorems" tabIndex={-1}>
          {visible.map((analysis, index) => {
            const name = analysis.math.name;
            const selected = name === selectedName;
            const kind = primaryKind(analysis);
            const unused = unusedHypothesisCount(analysis);
            const sorry = analysis.math.trust.usesSorry;
            const axioms = analysis.math.trust.unusualAxioms.length > 0;
            return (
              <li
                key={name}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                role="option"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`thm${selected ? " thm--selected" : ""}`}
                onClick={() => onSelect(name)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className="thm__name">{shortName(name)}</span>
                <span className="thm__markers">
                  <span className={`badge badge--${kind ?? "none"}`}>
                    {kind ? KIND_LABEL[kind] : "unclassified"}
                  </span>
                  {unused > 0 ? (
                    <span
                      className="marker marker--unused"
                      title={`${unused} stated ${
                        unused === 1 ? "hypothesis is" : "hypotheses are"
                      } never used by this proof term`}
                    >
                      <span aria-hidden="true">⊘</span>
                      <span className="sr-only">
                        {unused} unused {unused === 1 ? "hypothesis" : "hypotheses"}
                      </span>
                      {unused}
                    </span>
                  ) : null}
                  {sorry ? (
                    <span
                      className="marker marker--sorry"
                      title="Proof reaches sorryAx — not proved"
                    >
                      <span aria-hidden="true">✕</span>
                      <span className="sr-only">uses sorry, not proved</span>
                      sorry
                    </span>
                  ) : null}
                  {!sorry && axioms ? (
                    <span
                      className="marker marker--axioms"
                      title={`Depends on ${analysis.math.trust.unusualAxioms.join(", ")}`}
                    >
                      <span aria-hidden="true">!</span>
                      <span className="sr-only">unusual axioms</span>
                      axioms
                    </span>
                  ) : null}
                </span>
                <span className="thm__module">
                  {analysis.formal.source?.module ?? "unknown module"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
