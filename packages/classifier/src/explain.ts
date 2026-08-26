import { derive, transcribe, type Claim, type EpistemicStatus } from "@prooflens/epistemics";
import { kernelWitness, type FormalDeclaration, type FormalIRDocument } from "@prooflens/formal-ir";
import {
  renderExpression,
  renderProposition,
  RELATION_PHRASE,
  type TheoremIR,
} from "@prooflens/math-ir";
import { RULES } from "./rules.js";
import { DIRECTION_PHRASE } from "./signs.js";
import type { Classification } from "./types.js";

/**
 * Layered explanation.
 *
 * The layers are ordered from what Lean proved toward what a human might make
 * of it, and each carries its own epistemic status. A reader should be able to
 * stop reading at any point and know exactly how much of what they have read is
 * underwritten by the kernel.
 */
export type ExplanationLayerId =
  "formal" | "mathematical" | "structural" | "assumptions" | "parameters" | "trust" | "domain";

export interface ExplanationLayer {
  id: ExplanationLayerId;
  title: string;
  claim: Claim<string>;
}

export interface ExplanationOptions {
  /** Needed to mint the `verified` claim for the formal layer. */
  formalDocument?: FormalIRDocument;
  formalDeclaration?: FormalDeclaration;
}

function layer(
  id: ExplanationLayerId,
  title: string,
  text: string,
  status: Exclude<EpistemicStatus, "verified">,
  rule: (typeof RULES)[keyof typeof RULES],
  theorem: TheoremIR,
): ExplanationLayer {
  return {
    id,
    title,
    claim: derive(text, { ...rule, produces: status }, [theorem.conclusion], {
      sources: theorem.provenance.sources,
      inputs: [theorem.id],
    }),
  };
}

/**
 * Build the explanation stack for a theorem.
 *
 * Deterministic throughout. No language model is consulted, and none is
 * required — the optional AI layers append to this list rather than replacing it.
 */
export function explain(
  theorem: TheoremIR,
  classifications: readonly Classification[],
  options: ExplanationOptions = {},
): ExplanationLayer[] {
  const layers: ExplanationLayer[] = [];

  // --- Formal ------------------------------------------------------------
  const witness =
    options.formalDocument && options.formalDeclaration
      ? kernelWitness(options.formalDocument, options.formalDeclaration)
      : null;
  const isDefinition = theorem.kind === "definition" || theorem.kind === "opaque";
  const shortName = theorem.name.split(".").pop() ?? theorem.name;

  if (witness) {
    layers.push({
      id: "formal",
      // A definition is accepted by the kernel, not proved by it. Titling its
      // type "What was proved" would be a small lie in the layer a reader
      // trusts most.
      title: isDefinition ? "What was defined" : "What was proved",
      claim: transcribe(witness, theorem.statementDisplay, {
        sources: theorem.provenance.sources,
      }),
    });
  } else {
    layers.push(
      layer("formal", "What was stated", theorem.statementDisplay, "derived", RULES.TRUST, theorem),
    );
  }

  // --- Mathematical ------------------------------------------------------
  const prop = theorem.conclusion.value;
  let mathematical: string;
  if (prop.kind === "relation") {
    mathematical = `${renderExpression(prop.lhs)} ${RELATION_PHRASE[prop.relation]} ${renderExpression(prop.rhs)}.`;
  } else if (prop.kind === "predicate") {
    mathematical = `${prop.subject ? renderExpression(prop.subject) : "the subject"} satisfies ${prop.name}.`;
  } else if (prop.kind === "limit") {
    mathematical = `${renderExpression(prop.subject)} ${
      prop.target.kind === "neighbourhood" || prop.target.kind === "punctured"
        ? `approaches ${prop.target.display}`
        : prop.target.label
    } as its input ${prop.source.label}.`;
  } else if (prop.kind === "conjunction") {
    mathematical = `The conclusion asserts ${prop.conjuncts.length} things at once.`;
  } else if (prop.kind === "membership") {
    mathematical = `${renderExpression(prop.element)} lies in ${renderExpression(prop.collection)}.`;
  } else if (prop.kind === "existential") {
    mathematical = `Some ${prop.binder} exists for which ${renderProposition(prop.body)}.`;
  } else if (prop.kind === "implication") {
    mathematical = "The conclusion asserts that one proposition follows from another.";
  } else if (isDefinition && theorem.definitionBody) {
    // A definition's "conclusion" is its return type, not a claim. Reporting
    // that ProofLens cannot read `ℝ` would be a category error, and a false one
    // besides: the body is right here.
    mathematical = `${shortName} is defined to be ${theorem.definitionBody.display}.`;
  } else if (isDefinition) {
    mathematical = `${shortName} introduces a ${theorem.kind} of type ${theorem.conclusionDisplay}. Its body was not extracted.`;
  } else {
    mathematical = `The conclusion is \`${theorem.conclusionDisplay}\`. ProofLens does not have a reading for its head symbol.`;
  }
  layers.push(layer("mathematical", "In words", mathematical, "derived", RULES.EQUALITY, theorem));

  // --- Structural --------------------------------------------------------
  const bound = classifications.find(
    (c) => c.payload.kind === "upper-bound" && c.payload.data.natural,
  );
  const lower = classifications.find((c) => c.payload.kind === "lower-bound");
  const mono = classifications.find((c) => c.payload.kind === "monotonicity");
  const limit = classifications.find((c) => c.payload.kind === "limit");
  const functional = classifications.find((c) => c.payload.kind === "functional-relationship");
  const unsupported = classifications.find((c) => c.payload.kind === "unsupported");

  let structural: string;
  if (bound && bound.payload.kind === "upper-bound") {
    const { boundedQuantity, bound: boundExpr, strict } = bound.payload.data;
    structural = `The theorem establishes ${
      strict ? "a strict " : "an "
    }upper bound: \`${renderExpression(boundedQuantity)}\` cannot exceed \`${renderExpression(
      boundExpr,
    )}\` under the stated assumptions.`;
  } else if (lower && lower.payload.kind === "lower-bound") {
    const { boundedQuantity, bound: boundExpr } = lower.payload.data;
    structural = `The theorem establishes a lower bound: \`${renderExpression(
      boundedQuantity,
    )}\` is at least \`${renderExpression(boundExpr)}\`.`;
  } else if (limit && limit.payload.kind === "limit") {
    const { subject, source, target, convergent } = limit.payload.data;
    structural = convergent
      ? `The theorem establishes a limit: \`${renderExpression(subject)}\` converges to \`${target.display}\` as its input ${source.label}.`
      : `The theorem establishes a divergence: \`${renderExpression(subject)}\` ${target.label} as its input ${source.label}.`;
  } else if (mono && mono.payload.kind === "monotonicity") {
    const { direction, strict, subject } = mono.payload.data;
    structural = `The theorem establishes that ${
      subject ? `\`${renderExpression(subject)}\`` : "the function"
    } is ${strict ? "strictly " : ""}${direction}.`;
  } else if (functional && functional.payload.kind === "functional-relationship") {
    structural = `${isDefinition ? "The definition expresses" : "The theorem defines"} \`${renderExpression(
      functional.payload.data.left,
    )}\` in terms of the other quantities.`;
  } else if (unsupported && unsupported.payload.kind === "unsupported") {
    structural = `No deterministic visualization classifier currently supports this theorem structure. ${unsupported.payload.data.reason}`;
  } else {
    structural = "The theorem relates the quantities in its statement.";
  }
  layers.push(
    layer(
      "structural",
      "What kind of statement this is",
      structural,
      "derived",
      RULES.UPPER_BOUND,
      theorem,
    ),
  );

  // --- Assumptions -------------------------------------------------------
  const sensitivity = classifications.find((c) => c.payload.kind === "assumption-sensitivity");
  if (sensitivity && sensitivity.payload.kind === "assumption-sensitivity") {
    const { unusedInProof, used } = sensitivity.payload.data;
    const text =
      unusedInProof.length === 0
        ? `All ${used.length} stated hypotheses are used by this proof.`
        : `${unusedInProof.map((h) => `\`${h.symbol} : ${h.display}\``).join(" and ")} ${
            unusedInProof.length === 1 ? "is" : "are"
          } stated but never used by this proof term. That does not mean the hypothesis is mathematically unnecessary — only that this particular proof does not touch it.`;
    layers.push(
      layer(
        "assumptions",
        "Which assumptions did the work",
        text,
        "derived",
        RULES.ASSUMPTION_SENSITIVITY,
        theorem,
      ),
    );
  }

  // --- Parameters --------------------------------------------------------
  // Whichever reading of the inequality is the informative one. A lower bound
  // responds to its parameters exactly as meaningfully as an upper bound does;
  // only the wording differs.
  const naturalBound = classifications.find(
    (c) =>
      (c.payload.kind === "upper-bound" || c.payload.kind === "lower-bound") &&
      c.payload.data.natural,
  );
  if (
    naturalBound &&
    (naturalBound.payload.kind === "upper-bound" || naturalBound.payload.kind === "lower-bound")
  ) {
    const { sensitivity: directions, bound: boundExpr } = naturalBound.payload.data;
    const which = naturalBound.payload.kind === "upper-bound" ? "upper bound" : "lower bound";
    if (directions.length > 0) {
      const clauses = directions.map(
        (d) => `increasing \`${d.symbol}\` ${DIRECTION_PHRASE[d.direction]} it`,
      );
      layers.push(
        layer(
          "parameters",
          `How the ${which} responds`,
          `The ${which} is \`${renderExpression(
            boundExpr,
          )}\`. Holding the other quantities fixed, and using only the sign hypotheses this theorem states: ${clauses.join(
            "; ",
          )}.`,
          "derived",
          RULES.SENSITIVITY,
          theorem,
        ),
      );
    }
  }

  // --- Trust -------------------------------------------------------------
  if (theorem.trust.usesSorry) {
    layers.push(
      layer(
        "trust",
        "Not proved",
        "This declaration's proof reaches `sorryAx`. Nothing about it has been verified, and every reading below is about the statement, not about a theorem.",
        "derived",
        RULES.TRUST,
        theorem,
      ),
    );
  } else if (theorem.trust.unusualAxioms.length > 0) {
    layers.push(
      layer(
        "trust",
        "Trust base",
        `Beyond Lean's standard axioms, this proof depends on: ${theorem.trust.unusualAxioms.join(", ")}.`,
        "derived",
        RULES.TRUST,
        theorem,
      ),
    );
  }

  // --- Domain ------------------------------------------------------------
  const annotated = theorem.variables.filter((v) => v.annotation?.meaning);
  if (annotated.length > 0) {
    const text = annotated
      .map(
        (v) =>
          `\`${v.symbol}\` is ${v.annotation!.meaning}${
            v.annotation!.units ? ` (${v.annotation!.units})` : ""
          }`,
      )
      .join("; ");
    layers.push({
      id: "domain",
      title: "What the symbols mean",
      // Author-declared meaning. Lean verified none of it.
      claim: derive(
        `${text}. These readings come from the declaration's ProofLens annotations, not from anything Lean checked.`,
        { ...RULES.SENSITIVITY, id: "SEMANTIC_ANNOTATION_001", produces: "interpreted" },
        [],
        { sources: theorem.provenance.sources },
      ),
    });
  }

  return layers;
}
