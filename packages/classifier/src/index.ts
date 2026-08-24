/**
 * @prooflens/classifier
 *
 * Deterministic structural analysis. No language model is involved anywhere in
 * this package, and none is required for ProofLens to be useful.
 *
 * Each classifier is a named rule with a stable id. When one fires it records
 * the concrete evidence that made it fire, which is what lets the interface
 * answer "why are you showing me this?" with something better than a shrug.
 *
 * @packageDocumentation
 */
export * from "./types.js";
export * from "./rules.js";
export * from "./signs.js";
export * from "./classify.js";
export * from "./explain.js";
export * from "./dependencies.js";
