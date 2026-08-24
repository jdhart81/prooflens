/**
 * @prooflens/visual-ir
 *
 * VisualIR and the planner that produces it.
 *
 * The planner is the only place that decides *what a theorem should look like*,
 * and every decision it makes is recorded as a rationale a user can read. If a
 * figure cannot say why it exists, it does not get planned.
 *
 * @packageDocumentation
 */
export * from "./types.js";
export * from "./plan.js";
