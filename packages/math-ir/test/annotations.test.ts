import { describe, expect, it } from "vitest";
import { annotationFor, parseDocstring } from "@prooflens/math-ir";

describe("parseDocstring: @prooflens.var", () => {
  it("parses a fully specified variable annotation", () => {
    const parsed = parseDocstring('@prooflens.var P meaning="x" units="W" axis="x"');
    expect(parsed.annotations).toEqual([{ target: "P", meaning: "x", units: "W", axis: "x" }]);
    expect(parsed.malformed).toEqual([]);
    expect(parsed.prose).toBeNull();
  });

  it("parses every allowed key", () => {
    const parsed = parseDocstring(
      '@prooflens.var T meaning="temperature" units="K" domain="positive reals" axis="y" role="parameter"',
    );
    expect(parsed.annotations[0]).toEqual({
      target: "T",
      meaning: "temperature",
      units: "K",
      domain: "positive reals",
      axis: "y",
      role: "parameter",
    });
  });

  it("keeps several variable annotations in source order", () => {
    const parsed = parseDocstring(
      ['@prooflens.var x meaning="rate"', '@prooflens.var P meaning="power"'].join("\n"),
    );
    expect(parsed.annotations.map((a) => a.target)).toEqual(["x", "P"]);
  });

  it("tolerates leading whitespace on the directive line", () => {
    const parsed = parseDocstring('   @prooflens.var P meaning="power"');
    expect(parsed.annotations).toEqual([{ target: "P", meaning: "power" }]);
    expect(parsed.malformed).toEqual([]);
  });

  it("ignores unknown keys rather than storing them", () => {
    const parsed = parseDocstring('@prooflens.var P meaning="power" colour="red" fontSize="12"');
    expect(parsed.annotations).toEqual([{ target: "P", meaning: "power" }]);
    expect(parsed.annotations[0]).not.toHaveProperty("colour");
    expect(parsed.annotations[0]).not.toHaveProperty("fontSize");
  });
});

describe("parseDocstring: @prooflens.visual and @prooflens.concept", () => {
  it("parses a visual hint", () => {
    const parsed = parseDocstring("@prooflens.visual upper-bound-plot");
    expect(parsed.suggestedVisual).toBe("upper-bound-plot");
    expect(parsed.malformed).toEqual([]);
  });

  it("parses a quoted concept name and strips the quotes", () => {
    const parsed = parseDocstring('@prooflens.concept "some name"');
    expect(parsed.concept).toBe("some name");
    expect(parsed.malformed).toEqual([]);
  });

  it("accepts an unquoted concept name", () => {
    expect(parseDocstring("@prooflens.concept rate bound").concept).toBe("rate bound");
  });

  it("lets a later directive win when one is repeated", () => {
    const parsed = parseDocstring(
      ["@prooflens.visual first-plot", "@prooflens.visual second-plot"].join("\n"),
    );
    expect(parsed.suggestedVisual).toBe("second-plot");
  });
});

describe("parseDocstring: prose", () => {
  it("strips annotation lines from the prose", () => {
    const parsed = parseDocstring(
      [
        "A power-limited bound on a rate.",
        "",
        "Second paragraph.",
        '@prooflens.var P meaning="power"',
        "@prooflens.visual upper-bound-plot",
      ].join("\n"),
    );
    expect(parsed.prose).toBe("A power-limited bound on a rate.\n\nSecond paragraph.");
    expect(parsed.prose).not.toMatch(/@prooflens/);
  });

  it("returns a docstring with no annotations unchanged apart from trimming", () => {
    const prose = "Just prose.\n\nAcross two paragraphs.";
    const parsed = parseDocstring(prose);
    expect(parsed.prose).toBe(prose);
    expect(parsed.annotations).toEqual([]);
    expect(parsed.suggestedVisual).toBeNull();
    expect(parsed.concept).toBeNull();
    expect(parsed.malformed).toEqual([]);
  });

  it("returns nulls throughout for a null docstring", () => {
    expect(parseDocstring(null)).toEqual({
      prose: null,
      annotations: [],
      suggestedVisual: null,
      concept: null,
      malformed: [],
    });
  });

  it("returns null prose when the docstring is only annotations", () => {
    const parsed = parseDocstring('@prooflens.var P meaning="power"\n@prooflens.visual plot');
    expect(parsed.prose).toBeNull();
  });

  it("returns null prose for an empty or whitespace-only docstring", () => {
    expect(parseDocstring("").prose).toBeNull();
    expect(parseDocstring("   \n  \n").prose).toBeNull();
  });

  it("leaves an at-sign that is not a ProofLens directive in the prose", () => {
    const parsed = parseDocstring("See @simon for details, and @param x.");
    expect(parsed.prose).toBe("See @simon for details, and @param x.");
    expect(parsed.malformed).toEqual([]);
  });
});

describe("parseDocstring: malformed directives", () => {
  it("does not throw on any malformed input", () => {
    const nasty = [
      "@prooflens.var",
      "@prooflens.unknown foo",
      "@prooflens.",
      '@prooflens.var P colour="red"',
      "@prooflens.visual",
      "@prooflens.concept",
      '@prooflens.var x meaning="unterminated',
    ].join("\n");
    expect(() => parseDocstring(nasty)).not.toThrow();
  });

  it("records `@prooflens.var` with no target as malformed", () => {
    const parsed = parseDocstring("@prooflens.var");
    expect(parsed.malformed).toEqual(["@prooflens.var"]);
    expect(parsed.annotations).toEqual([]);
  });

  it("records an unknown directive as malformed and keeps it out of the prose", () => {
    const parsed = parseDocstring("@prooflens.unknown foo");
    expect(parsed.malformed).toEqual(["@prooflens.unknown foo"]);
    expect(parsed.prose).toBeNull();
    expect(parsed.annotations).toEqual([]);
    expect(parsed.suggestedVisual).toBeNull();
    expect(parsed.concept).toBeNull();
  });

  it("records a var line with no key=value pairs as malformed", () => {
    const parsed = parseDocstring("@prooflens.var P");
    expect(parsed.malformed).toEqual(["@prooflens.var P"]);
  });

  it("records a var line whose only keys are unrecognised as malformed", () => {
    const line = '@prooflens.var P colour="red"';
    expect(parseDocstring(line).malformed).toEqual([line]);
  });

  it("records empty visual and concept directives as malformed", () => {
    const parsed = parseDocstring("@prooflens.visual\n@prooflens.concept");
    expect(parsed.malformed).toEqual(["@prooflens.visual", "@prooflens.concept"]);
    expect(parsed.suggestedVisual).toBeNull();
    expect(parsed.concept).toBeNull();
  });

  it("keeps good directives from a docstring that also has bad ones", () => {
    const parsed = parseDocstring(
      [
        "Prose stays.",
        '@prooflens.var P meaning="power"',
        "@prooflens.unknown whatever",
        "@prooflens.visual upper-bound-plot",
      ].join("\n"),
    );
    expect(parsed.prose).toBe("Prose stays.");
    expect(parsed.annotations).toEqual([{ target: "P", meaning: "power" }]);
    expect(parsed.suggestedVisual).toBe("upper-bound-plot");
    expect(parsed.malformed).toEqual(["@prooflens.unknown whatever"]);
  });
});

describe("annotationFor", () => {
  const annotations = [
    { target: "P", meaning: "power" },
    { target: "T", meaning: "temperature" },
  ];

  it("finds an annotation by symbol", () => {
    expect(annotationFor(annotations, "T")).toEqual({ target: "T", meaning: "temperature" });
  });

  it("returns null when the symbol has no annotation", () => {
    expect(annotationFor(annotations, "kB")).toBeNull();
    expect(annotationFor([], "P")).toBeNull();
  });

  it("is case sensitive, because Lean identifiers are", () => {
    expect(annotationFor(annotations, "p")).toBeNull();
  });
});
