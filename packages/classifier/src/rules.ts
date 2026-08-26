import type { Rule } from "@prooflens/epistemics";

/**
 * The deterministic classifier rulebook.
 *
 * Rule ids are stable public identifiers. They appear in provenance output, in
 * tests, and in issue reports, so renaming one is a breaking change.
 */
export const RULES = {
  UPPER_BOUND: {
    id: "RELATION_UPPER_BOUND_001",
    description: "The conclusion bounds a quantity from above.",
    produces: "derived",
  },
  LOWER_BOUND: {
    id: "RELATION_LOWER_BOUND_001",
    description: "The conclusion bounds a quantity from below.",
    produces: "derived",
  },
  POSITIVITY: {
    id: "RELATION_POSITIVITY_001",
    description: "The conclusion asserts that a quantity has a definite sign.",
    produces: "derived",
  },
  DISTINCTNESS: {
    id: "RELATION_DISTINCTNESS_001",
    description: "The conclusion asserts that two quantities differ.",
    produces: "derived",
  },
  EQUALITY: {
    id: "RELATION_EQUALITY_001",
    description: "The conclusion is an equation.",
    produces: "derived",
  },
  FUNCTIONAL: {
    id: "RELATION_FUNCTIONAL_001",
    description: "The conclusion defines one quantity in terms of others.",
    produces: "derived",
  },
  MONOTONICITY: {
    id: "PREDICATE_MONOTONICITY_001",
    description: "The conclusion asserts a monotonicity property.",
    produces: "derived",
  },
  LIMIT: {
    id: "PREDICATE_LIMIT_001",
    description: "The conclusion asserts a limit along a filter.",
    produces: "derived",
  },
  PROPERTY: {
    id: "PREDICATE_PROPERTY_001",
    description: "The conclusion asserts a named property of a subject.",
    produces: "derived",
  },
  CONJUNCTION: {
    id: "PROPOSITION_CONJUNCTION_001",
    description: "The conclusion asserts several facts at once.",
    produces: "derived",
  },
  MEMBERSHIP: {
    id: "RELATION_MEMBERSHIP_001",
    description: "The conclusion asserts that a value lies in a collection.",
    produces: "derived",
  },
  EXISTENCE: {
    id: "PROPOSITION_EXISTENCE_001",
    description: "The conclusion asserts that something exists.",
    produces: "derived",
  },
  IMPLICATION: {
    id: "PROPOSITION_IMPLICATION_001",
    description: "The conclusion is an implication between two propositions.",
    produces: "derived",
  },
  EQUIVALENCE: {
    id: "PROPOSITION_EQUIVALENCE_001",
    description: "The conclusion asserts that two propositions are equivalent.",
    produces: "derived",
  },
  ASSUMPTION_SENSITIVITY: {
    id: "PROOF_ASSUMPTION_SENSITIVITY_001",
    description:
      "Occurrence analysis of the elaborated proof term identified which stated hypotheses it actually uses.",
    produces: "derived",
  },
  TRUST: {
    id: "PROOF_TRUST_BASE_001",
    description: "The declaration's axiom dependencies were inspected.",
    produces: "derived",
  },
  DEFINITION: {
    id: "DECLARATION_DEFINITION_001",
    description: "The declaration introduces a definition rather than asserting a proposition.",
    produces: "derived",
  },
  SENSITIVITY: {
    id: "PARAMETER_SENSITIVITY_001",
    description:
      "The direction in which the bound responds to each parameter follows from the sign hypotheses.",
    produces: "derived",
  },
  DEPENDENCY_GRAPH: {
    id: "GRAPH_DEPENDENCY_001",
    description: "Edges were read from the constants each declaration's proof term references.",
    produces: "derived",
  },
  UNSUPPORTED: {
    id: "STRUCTURE_UNSUPPORTED_001",
    description: "No deterministic classifier recognises this conclusion's structure.",
    produces: "derived",
  },
} as const satisfies Record<string, Rule>;

export type RuleId = (typeof RULES)[keyof typeof RULES]["id"];
