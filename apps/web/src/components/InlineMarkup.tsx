import { Fragment } from "react";

/**
 * The explanation layers and rationales are prose with `backticked` Lean
 * fragments. Render those as <code> and leave everything else as text — no
 * markdown parser, and nothing here interprets HTML.
 */
export function InlineMarkup({ text }: { text: string }): JSX.Element {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="inline-code">
            {part}
          </code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
