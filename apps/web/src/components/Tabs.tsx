import { useRef, type KeyboardEvent } from "react";

export interface TabItem<Id extends string = string> {
  id: Id;
  label: string;
  /** Optional short suffix, e.g. a count. */
  hint?: string;
}

interface TabsProps<Id extends string> {
  items: readonly TabItem<Id>[];
  activeId: Id;
  onSelect: (id: Id) => void;
  label: string;
  /** Prefix used to build the `id`/`aria-controls` pair. */
  idPrefix: string;
}

/**
 * A real ARIA tablist: buttons, roving tabindex, arrow/Home/End navigation.
 * The matching panel must render with id `${idPrefix}-panel-${activeId}` and
 * `aria-labelledby={`${idPrefix}-tab-${activeId}`}`.
 */
export function Tabs<Id extends string>({
  items,
  activeId,
  onSelect,
  label,
  idPrefix,
}: TabsProps<Id>): JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    onSelect(item.id);
    refs.current[next]?.focus();
  }

  return (
    <div className="tablist" role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={`tab${selected ? " tab--active" : ""}`}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
            {item.hint ? <span className="tab__hint">{item.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
