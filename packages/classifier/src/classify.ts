import { derive, type Claim } from "@prooflens/epistemics";
import {
  renderExpression,
  renderProposition,
  type MathExpression,
  type MathIRDocument,
  type TheoremIR,
} from "@prooflens/math-ir";
import { PREDICATES } from "@prooflens/math-ir";
import { RULES } from "./rules.js";
import { directionOf, signFactsOf, type Direction } from "./signs.js";
import type { Classification, ClassificationPayload } from "./types.js";

function makeClassification(
  theorem: TheoremIR,
  rule: (typeof RULES)[keyof typeof RULES],
  payload: ClassificationPayload,
  rationale: string,
  path: string,
): Classification {
  const claim: Claim<ClassificationPayload> = derive(payload, rule, [theorem.conclusion], {
    sources: [
      {
        ...(theorem.provenance.sources[0] ?? {
          system: "lean4",
          declaration: theorem.name,
        }),
        path,
      },
    ],
    inputs: [theorem.id],
  });
  return { rule, payload, claim, rationale };
}

/** Sensitivity of a bound expression to each of the theorem's parameters. */
function sensitivityOf(
  theorem: TheoremIR,
  bound: MathExpression,
): Array<{ variableId: string; symbol: string; direction: Direction }> {
  const facts = signFactsOf(theorem);
  return theorem.variables
    .map((v) => ({
      variableId: v.id,
      symbol: v.symbol,
      direction: directionOf(bound, v.id, facts),
    }))
    .filter((s) => s.direction !== "constant" && s.direction !== "unknown");
}

/**
 * How much does this reading of an inequality tell a reader?
 *
 * A number literal is never the quantity a theorem is "about", and a bare
 * variable almost always is. Scoring both readings and preferring the higher
 * one is what turns `0 < log 2` from "0 is bounded above" into "log 2 is
 * positive".
 */
function readingScore(bounded: MathExpression, bound: MathExpression): number {
  const boundedScore =
    bounded.kind === "number"
      ? 0
      : bounded.kind === "variable"
        ? 3
        : bounded.kind === "opaque"
          ? 1
          : 2;
  const boundBonus = bound.kind === "number" ? 1 : 0;
  return boundedScore + boundBonus;
}

/** `0 < e` and `0 ≤ e` are sign facts, not bounds between two quantities. */
function classifyPositivity(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "relation") return [];
  const { relation, lhs, rhs } = prop;
  const zeroLeft = lhs.kind === "number" && lhs.value === 0;
  const zeroRight = rhs.kind === "number" && rhs.value === 0;

  let quantity: MathExpression | null = null;
  let strict = false;
  let sense: "positive" | "negative" = "positive";
  if (zeroLeft && (relation === "less-than" || relation === "less-than-or-equal")) {
    quantity = rhs;
    strict = relation === "less-than";
  } else if (zeroRight && (relation === "greater-than" || relation === "greater-than-or-equal")) {
    quantity = lhs;
    strict = relation === "greater-than";
  } else if (zeroRight && (relation === "less-than" || relation === "less-than-or-equal")) {
    quantity = lhs;
    strict = relation === "less-than";
    sense = "negative";
  }
  if (!quantity) return [];

  return [
    makeClassification(
      theorem,
      RULES.POSITIVITY,
      { kind: "positivity", data: { quantity, strict, sense } },
      `The conclusion compares \`${renderExpression(quantity)}\` against zero, so it asserts that the quantity is ${
        strict ? "strictly " : "non-strictly "
      }${sense}.`,
      quantity.path,
    ),
  ];
}

function classifyDistinctness(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "relation" || prop.relation !== "not-equal") return [];
  return [
    makeClassification(
      theorem,
      RULES.DISTINCTNESS,
      { kind: "distinctness", data: { left: prop.lhs, right: prop.rhs } },
      `The conclusion asserts that \`${renderExpression(prop.lhs)}\` and \`${renderExpression(
        prop.rhs,
      )}\` are different.`,
      prop.path,
    ),
  ];
}

/**
 * Bound classification.
 *
 * A conclusion `a ≤ b` bounds `a` from above; it equally bounds `b` from below.
 * ProofLens reports it as an upper bound on the side that is a bare quantity,
 * because that is what a reader means by "the theorem bounds x". When both sides
 * are compound, we report both readings rather than picking one arbitrarily.
 */
function classifyBounds(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "relation") return [];
  const { relation, lhs, rhs } = prop;

  const out: Classification[] = [];
  const strict = relation === "less-than" || relation === "greater-than";

  const upper =
    relation === "less-than" || relation === "less-than-or-equal"
      ? { bounded: lhs, bound: rhs, boundedPath: lhs.path, boundPath: rhs.path }
      : relation === "greater-than" || relation === "greater-than-or-equal"
        ? { bounded: rhs, bound: lhs, boundedPath: rhs.path, boundPath: lhs.path }
        : null;

  if (upper) {
    const symbol = relation === "less-than" || relation === "greater-than" ? "<" : "≤";
    const upperScore = readingScore(upper.bounded, upper.bound);
    const lowerScore = readingScore(upper.bound, upper.bounded);
    const upperIsNatural = upperScore >= lowerScore;
    out.push(
      makeClassification(
        theorem,
        RULES.UPPER_BOUND,
        {
          kind: "upper-bound",
          data: {
            boundedQuantity: upper.bounded,
            bound: upper.bound,
            strict,
            natural: upperIsNatural,
            sensitivity: sensitivityOf(theorem, upper.bound),
          },
        },
        `The conclusion \`${theorem.conclusionDisplay}\` puts \`${renderExpression(
          upper.bounded,
        )}\` on the smaller side of \`${symbol}\`, so \`${renderExpression(
          upper.bound,
        )}\` is an upper bound for it.`,
        upper.boundedPath,
      ),
    );
    out.push(
      makeClassification(
        theorem,
        RULES.LOWER_BOUND,
        {
          kind: "lower-bound",
          data: {
            boundedQuantity: upper.bound,
            bound: upper.bounded,
            strict,
            natural: !upperIsNatural,
            sensitivity: sensitivityOf(theorem, upper.bounded),
          },
        },
        `The same conclusion bounds \`${renderExpression(
          upper.bound,
        )}\` from below by \`${renderExpression(upper.bounded)}\`.`,
        upper.boundPath,
      ),
    );
  }
  return out;
}

function classifyEquality(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "relation" || prop.relation !== "equal") return [];
  const functional = prop.lhs.kind === "variable" && prop.rhs.kind !== "variable";
  const rule = functional ? RULES.FUNCTIONAL : RULES.EQUALITY;
  return [
    makeClassification(
      theorem,
      rule,
      {
        kind: functional ? "functional-relationship" : "equality",
        data: { left: prop.lhs, right: prop.rhs, functional },
      },
      functional
        ? `The left side is the single quantity \`${renderExpression(
            prop.lhs,
          )}\`, so the equation expresses it in terms of the others.`
        : `The conclusion equates \`${renderExpression(prop.lhs)}\` and \`${renderExpression(
            prop.rhs,
          )}\`.`,
      prop.path,
    ),
  ];
}

function classifyMonotonicity(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "predicate") return [];
  const map: Record<string, { direction: "increasing" | "decreasing"; strict: boolean }> = {
    monotone: { direction: "increasing", strict: false },
    "strictly-monotone": { direction: "increasing", strict: true },
    antitone: { direction: "decreasing", strict: false },
    "strictly-antitone": { direction: "decreasing", strict: true },
  };
  const entry = map[prop.predicate];
  if (!entry) return [];
  return [
    makeClassification(
      theorem,
      RULES.MONOTONICITY,
      {
        kind: "monotonicity",
        data: {
          direction: entry.direction,
          strict: entry.strict,
          subject: prop.subject,
          predicateName: prop.name,
        },
      },
      `The conclusion applies \`${prop.name}\`, which asserts a ${
        entry.strict ? "strictly " : ""
      }${entry.direction === "increasing" ? "increasing" : "decreasing"} relationship.`,
      prop.path,
    ),
  ];
}

/**
 * Limits.
 *
 * `Filter.Tendsto f atTop (nhds 0)` is not an opaque predicate: it says the
 * function settles on a value as its input runs off to infinity, and that is a
 * shape a reader can picture. Divergence is distinguished from convergence,
 * because "grows without bound" and "approaches 0" are different pictures.
 */
function classifyLimit(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "limit") return [];
  const convergent = prop.target.kind === "neighbourhood" || prop.target.kind === "punctured";
  return [
    makeClassification(
      theorem,
      RULES.LIMIT,
      {
        kind: "limit",
        data: {
          subject: prop.subject,
          source: prop.source,
          target: prop.target,
          convergent,
        },
      },
      `The conclusion is a \`Filter.Tendsto\`: \`${renderExpression(prop.subject)}\` ${
        convergent ? `approaches \`${prop.target.display}\`` : `${prop.target.label}`
      } as its input ${prop.source.label}.`,
      prop.path,
    ),
  ];
}

function classifyExistence(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "existential") return [];
  return [
    makeClassification(
      theorem,
      RULES.EXISTENCE,
      { kind: "existence", data: { binder: prop.binder, body: prop.body } },
      `The conclusion is an existential: it asserts that some \`${prop.binder}\` satisfying \`${renderProposition(
        prop.body,
      )}\` exists, without ProofLens knowing which one the proof produces.`,
      prop.path,
    ),
  ];
}

/**
 * Named properties.
 *
 * `Continuous f` is not a shape ProofLens can draw, but it is a shape ProofLens
 * can *read*, and saying "the theorem asserts that f is continuous" is strictly
 * better than "no classifier supports this".
 *
 * Being recognised requires an entry in the `PREDICATES` table. That is
 * deliberate: a blanket rule covering every predicate would classify things
 * ProofLens has never been taught about, and the unsupported backlog — the
 * thing that tells us what to build next — would go quiet while coverage looked
 * artificially complete.
 */
function classifyProperty(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "predicate" || prop.predicate !== "other") return [];
  const label = PREDICATES[prop.name]?.label ?? prop.name;
  return [
    makeClassification(
      theorem,
      RULES.PROPERTY,
      {
        kind: "property",
        data: { name: prop.name, label, subject: prop.subject, args: prop.args },
      },
      `The conclusion applies \`${prop.name}\`, which ProofLens reads as "${
        prop.subject ? renderExpression(prop.subject) : "the subject"
      } is ${label}". ProofLens recognises the property but does not interpret what it means.`,
      prop.path,
    ),
  ];
}

function classifyConjunction(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "conjunction") return [];
  return [
    makeClassification(
      theorem,
      RULES.CONJUNCTION,
      { kind: "conjunction", data: { conjuncts: prop.conjuncts } },
      `The conclusion asserts ${prop.conjuncts.length} facts at once: ${prop.conjuncts
        .map((c) => `\`${renderProposition(c)}\``)
        .join(" and ")}.`,
      prop.path,
    ),
  ];
}

function classifyMembership(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind !== "membership") return [];
  return [
    makeClassification(
      theorem,
      RULES.MEMBERSHIP,
      { kind: "membership", data: { element: prop.element, collection: prop.collection } },
      `The conclusion places \`${renderExpression(prop.element)}\` inside \`${renderExpression(
        prop.collection,
      )}\`.`,
      prop.path,
    ),
  ];
}

function classifyImplication(theorem: TheoremIR): Classification[] {
  const prop = theorem.conclusion.value;
  if (prop.kind === "implication") {
    return [
      makeClassification(
        theorem,
        RULES.IMPLICATION,
        { kind: "implication", data: { antecedent: prop.antecedent, consequent: prop.consequent } },
        `The conclusion has the shape \`A → B\`, with A = \`${renderProposition(
          prop.antecedent,
        )}\` and B = \`${renderProposition(prop.consequent)}\`.`,
        prop.path,
      ),
    ];
  }
  if (prop.kind === "relation" && prop.relation === "equivalent") {
    return [
      makeClassification(
        theorem,
        RULES.EQUIVALENCE,
        {
          kind: "equivalence",
          data: {
            antecedent: {
              kind: "opaque",
              head: null,
              display: renderExpression(prop.lhs),
              path: prop.lhs.path,
            },
            consequent: {
              kind: "opaque",
              head: null,
              display: renderExpression(prop.rhs),
              path: prop.rhs.path,
            },
          },
        },
        `The conclusion is an \`↔\`, so each side holds exactly when the other does.`,
        prop.path,
      ),
    ];
  }
  return [];
}

/**
 * Assumption sensitivity — ProofLens's flagship analysis.
 *
 * A hypothesis that appears nowhere in the elaborated proof term was stated but
 * not used. This is a fact about the proof, not about mathematical necessity,
 * and the rationale text is careful to say so: a different proof of the same
 * statement might need it, and a hypothesis can be doing work that the term-level
 * check cannot see (for example by making an instance argument typecheck).
 */
function classifyAssumptionSensitivity(theorem: TheoremIR): Classification[] {
  if (theorem.hypotheses.length === 0) return [];
  const unused = theorem.hypotheses.filter((h) => h.usage.unusedInProof);
  const used = theorem.hypotheses.filter((h) => !h.usage.unusedInProof);
  const proofTermAvailable = theorem.hypotheses.some((h) => h.usage.proofTermAvailable);
  if (!proofTermAvailable) return [];

  const rationale =
    unused.length === 0
      ? `Every one of the ${theorem.hypotheses.length} stated hypotheses occurs in the elaborated proof term.`
      : `${unused.map((h) => `\`${h.symbol}\``).join(", ")} ${
          unused.length === 1 ? "does" : "do"
        } not occur in the elaborated proof term, in any later hypothesis type, or in the conclusion.`;

  return [
    makeClassification(
      theorem,
      RULES.ASSUMPTION_SENSITIVITY,
      { kind: "assumption-sensitivity", data: { used, unusedInProof: unused, proofTermAvailable } },
      rationale,
      "proofTerm",
    ),
  ];
}

function classifyTrust(theorem: TheoremIR): Classification[] {
  const { usesSorry, unusualAxioms } = theorem.trust;
  if (!usesSorry && unusualAxioms.length === 0) return [];
  return [
    makeClassification(
      theorem,
      RULES.TRUST,
      { kind: "trust", data: { usesSorry, unusualAxioms } },
      usesSorry
        ? "The proof term reaches `sorryAx`. This statement has NOT been proved."
        : `The proof depends on axioms beyond Lean's standard three: ${unusualAxioms.join(", ")}.`,
      "axioms",
    ),
  ];
}

function classifyDefinition(theorem: TheoremIR): Classification[] {
  if (theorem.kind !== "definition" && theorem.kind !== "opaque") return [];
  const body = theorem.definitionBody;

  const out: Classification[] = [
    makeClassification(
      theorem,
      RULES.DEFINITION,
      {
        kind: "definition",
        data: {
          name: theorem.name,
          body: body?.expression ?? null,
          bodyDisplay: body?.display ?? null,
        },
      },
      body
        ? `\`${theorem.name}\` is a ${theorem.kind} that unfolds to \`${body.display}\`.`
        : `\`${theorem.name}\` is a ${theorem.kind}, so it introduces a concept rather than asserting a proposition.`,
      "statement",
    ),
  ];

  // A definition with a body IS a functional relationship: the defined name on
  // one side, the quantities it is built from on the other. Saying so lets the
  // same figure serve `R = N / t` and `landauerCost kB T D = kB · T · log 2 / D`.
  if (body) {
    const short = theorem.name.split(".").pop() ?? theorem.name;
    const args = theorem.variables.map((v): MathExpression => ({
      kind: "variable",
      id: v.id,
      symbol: v.symbol,
      path: `binders.${v.symbol}`,
    }));
    const left: MathExpression =
      args.length === 0
        ? { kind: "constant", name: theorem.name, display: short, path: "statement" }
        : { kind: "application", head: theorem.name, display: short, args, path: "statement" };
    out.push(
      makeClassification(
        theorem,
        RULES.FUNCTIONAL,
        {
          kind: "functional-relationship",
          data: { left, right: body.expression, functional: true },
        },
        `The definition expresses \`${short}\` in terms of ${
          args.length === 0
            ? "no parameters"
            : args.map((a) => `\`${renderExpression(a)}\``).join(", ")
        }.`,
        "definitionBody",
      ),
    );
  }

  return out;
}

/**
 * Classify one theorem.
 *
 * Always returns at least one classification. When nothing matches, the
 * `unsupported` classification carries the formal structure forward so the UI
 * can still show the theorem in full — ProofLens never drops mathematics just
 * because it cannot draw it.
 */
export function classifyTheorem(theorem: TheoremIR): Classification[] {
  const structural = [
    ...classifyDefinition(theorem),
    ...classifyLimit(theorem),
    ...classifyProperty(theorem),
    ...classifyConjunction(theorem),
    ...classifyMembership(theorem),
    ...classifyExistence(theorem),
    ...classifyPositivity(theorem),
    ...classifyDistinctness(theorem),
    ...classifyBounds(theorem),
    ...classifyEquality(theorem),
    ...classifyMonotonicity(theorem),
    ...classifyImplication(theorem),
  ];

  const analytical = [...classifyAssumptionSensitivity(theorem), ...classifyTrust(theorem)];

  if (structural.length === 0) {
    const prop = theorem.conclusion.value;
    const head = prop.kind === "opaque" ? prop.head : null;
    structural.push(
      makeClassification(
        theorem,
        RULES.UNSUPPORTED,
        {
          kind: "unsupported",
          data: {
            reason:
              head === null
                ? "The conclusion's structure is not one ProofLens has a rule for yet."
                : prop.kind === "opaque"
                  ? `\`${head}\` is not in ProofLens's constant table yet.`
                  : `ProofLens can read this conclusion as a ${prop.kind} on \`${head}\`, but has no classifier that acts on it yet.`,
            head,
          },
        },
        `No deterministic classifier matched \`${theorem.conclusionDisplay}\`. The formal statement, its structure, and its dependencies are still available below.`,
        theorem.conclusion.value.path,
      ),
    );
  }

  return [...structural, ...analytical];
}

export interface ClassifiedTheorem {
  theorem: TheoremIR;
  classifications: Classification[];
}

export function classifyDocument(doc: MathIRDocument): ClassifiedTheorem[] {
  return doc.theorems.map((theorem) => ({ theorem, classifications: classifyTheorem(theorem) }));
}

/** The classification a visualisation planner should lead with, if any. */
export function primaryClassification(
  classifications: readonly Classification[],
): Classification | undefined {
  // An inequality yields both readings; lead with whichever is informative.
  const naturalBound = classifications.find(
    (c) =>
      (c.payload.kind === "upper-bound" || c.payload.kind === "lower-bound") &&
      c.payload.data.natural,
  );

  const priority: Array<ClassificationPayload["kind"]> = [
    "limit",
    "positivity",
    "monotonicity",
    "distinctness",
    "upper-bound",
    "lower-bound",
    "functional-relationship",
    "equality",
    "implication",
    "equivalence",
    "existence",
    "property",
    "membership",
    "conjunction",
    "definition",
    "unsupported",
  ];
  for (const kind of priority) {
    if ((kind === "upper-bound" || kind === "lower-bound") && naturalBound) return naturalBound;
    const found = classifications.find((c) => c.payload.kind === kind);
    if (found) return found;
  }
  return classifications[0];
}
