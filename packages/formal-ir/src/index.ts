/**
 * @prooflens/formal-ir
 *
 * The Formal IR is the *preservation* layer. It mirrors what Lean told us and
 * nothing more: no mathematical interpretation happens here.
 *
 * Its job is to be complete enough that later stages can be rewritten, or new
 * ones added, without ever going back to parse Lean source again.
 *
 * @packageDocumentation
 */
export * from "./schema.js";
export * from "./load.js";
export * from "./paths.js";
