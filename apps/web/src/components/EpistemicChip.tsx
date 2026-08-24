import { EPISTEMIC_GLOSS, type EpistemicStatus } from "@prooflens/epistemics";
import { STATUS_LABEL } from "../lib/format.js";

interface EpistemicChipProps {
  status: EpistemicStatus;
  /** `sm` for dense tables, `md` for section headings. */
  size?: "sm" | "md";
  /** Optional prefix, e.g. "figure" -> "figure · derived". */
  prefix?: string;
}

/**
 * The single place a status is turned into pixels.
 *
 * Every chip is colour-coded *and* labelled in words, and carries the gloss as
 * its accessible name and its tooltip, so the distinction never depends on
 * colour perception alone. This is invariant 1 of the project: a reader must
 * never be unsure which parts are verified.
 */
export function EpistemicChip({ status, size = "md", prefix }: EpistemicChipProps): JSX.Element {
  const gloss = EPISTEMIC_GLOSS[status];
  return (
    <span
      className={`chip chip--${status} chip--${size}`}
      data-status={status}
      title={`${STATUS_LABEL[status]} — ${gloss}`}
    >
      <span className="chip__dot" aria-hidden="true" />
      <span className="chip__text">
        {prefix ? `${prefix} · ` : ""}
        {STATUS_LABEL[status]}
      </span>
      <span className="sr-only">. {gloss}</span>
    </span>
  );
}
