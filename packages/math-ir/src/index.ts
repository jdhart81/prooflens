/**
 * @prooflens/math-ir
 *
 * MathIR is where proof-assistant plumbing becomes mathematics: `LE.le ℝ inst x y`
 * becomes "x is at most y". It is the last stage that is still about *what was
 * proved* rather than *how to show it*.
 *
 * Everything MathIR produces is `derived` at best. The mapping from Lean
 * constants to mathematical meaning is a table this project maintains, not
 * something the kernel checked, and the epistemic layer records that honestly.
 *
 * @packageDocumentation
 */
export * from "./types.js";
export * from "./tables.js";
export * from "./annotations.js";
export * from "./render.js";
export * from "./traverse.js";
export * from "./lower.js";
