/**
 * Proof animation (§27).
 *
 * The invariants under test, in order of importance:
 *
 *  1. The final frame equals the static render: stripping the animation CSS
 *     and the animation-only markup (class tokens plus the one appended
 *     legend row) from an animated figure yields the static figure, byte for
 *     byte, modulo the extra height that legend row occupies.
 *  2. `prefers-reduced-motion: reduce` disables every animation.
 *  3. Same spec + same options → byte-identical animated output.
 *  4. Keyframe names are namespaced by idPrefix, so two animated figures can
 *     share one HTML page.
 *  5. The order of appearance is the proof's order: foundations before the
 *     theorem, endpoints before their edges, and unused hypotheses never
 *     entering before the used ones.
 *  6. Types with no purpose-built animation render statically — never throw.
 */
import { describe, expect, it } from "vitest";
import type { VisualSpec } from "@prooflens/visual-ir";
import { escapeXml, renderSvg } from "@prooflens/renderer-svg";
import {
  ANIMATION_LEGEND_ROW,
  ENTER_DURATION,
  STAGE_STEP,
  TRACE_DURATION,
} from "../src/animate.js";
import {
  assumptionSpec,
  emptySpec,
  expressionTreeSpec,
  graphSpec,
  limitSpec,
  monotonicitySpec,
  unknownTypeSpec,
  upperBoundSpec,
} from "./fixtures.js";

const ANIMATED_SPECS: Array<[string, VisualSpec]> = [
  ["upper-bound-plot", upperBoundSpec()],
  ["lower-bound-plot", upperBoundSpec({ type: "lower-bound-plot", id: "Test.thm:lower-bound" })],
  ["assumption-sensitivity", assumptionSpec()],
  ["dependency-graph", graphSpec("dependency-graph")],
  ["implication-graph", graphSpec("implication-graph")],
  ["relationship-diagram", graphSpec("relationship-diagram")],
  ["monotonicity-plot (increasing)", monotonicitySpec("increasing")],
  ["monotonicity-plot (decreasing)", monotonicitySpec("decreasing")],
  ["limit-plot (convergent)", limitSpec("convergent")],
  ["limit-plot (grows)", limitSpec("grows")],
  ["limit-plot (decreases)", limitSpec("decreases")],
  ["expression-tree", expressionTreeSpec()],
];

// ---------------------------------------------------------------------------
// Backwards compatibility
// ---------------------------------------------------------------------------

describe("animation is opt-in", () => {
  it("is absent by default and when animate is false", () => {
    for (const [, spec] of ANIMATED_SPECS) {
      for (const svg of [renderSvg(spec), renderSvg(spec, { animate: false })]) {
        expect(svg).not.toContain("@keyframes");
        expect(svg).not.toContain("pl-anim-");
        expect(svg).not.toContain("prefers-reduced-motion");
        expect(svg).not.toContain(escapeXml(ANIMATION_LEGEND_ROW.text));
      }
    }
  });

  it("animate: false and the default render identically", () => {
    for (const [, spec] of ANIMATED_SPECS) {
      expect(renderSvg(spec, { animate: false })).toBe(renderSvg(spec));
    }
  });
});

// ---------------------------------------------------------------------------
// The hard invariant: the final frame is the static render
// ---------------------------------------------------------------------------

describe("final frame equals the static render", () => {
  it("strips back to the static figure, byte for byte", () => {
    for (const [name, spec] of ANIMATED_SPECS) {
      for (const options of [{}, { width: 480 }, { idPrefix: "fig" }]) {
        const animated = renderSvg(spec, { ...options, animate: true });
        const staticSvg = renderSvg(spec, options);
        expect(animated, name).toContain("@keyframes");
        expect(stripAnimation(animated, staticSvg), `${name} ${JSON.stringify(options)}`).toBe(
          staticSvg,
        );
      }
    }
  });

  it("holds for the vertical (top-to-bottom) graph layout too", () => {
    const spec = graphSpec("dependency-graph");
    spec.entities = spec.entities.map((e, i) => ({ ...e, position: { layer: i, order: 0 } }));
    const animated = renderSvg(spec, { width: 320, animate: true });
    expect(animated).toContain("Layers run top to bottom");
    expect(stripAnimation(animated, renderSvg(spec, { width: 320 }))).toBe(
      renderSvg(spec, { width: 320 }),
    );
  });

  it("uses fill-mode both on every animation binding", () => {
    for (const [name, spec] of ANIMATED_SPECS) {
      const svg = renderSvg(spec, { animate: true });
      const bindings = (svg.match(/animation:[^;}]*/g) ?? []).filter(
        (b) => b !== "animation:none !important", // the reduced-motion override
      );
      expect(bindings.length, name).toBeGreaterThan(0);
      for (const binding of bindings) {
        for (const one of binding.slice("animation:".length).split(",")) {
          expect(one, name).toContain(" both");
        }
      }
    }
  });

  it("declares only `from` keyframes, so the implicit end state is the static style", () => {
    for (const [name, spec] of ANIMATED_SPECS) {
      const svg = renderSvg(spec, { animate: true });
      const blocks = svg.match(/@keyframes [A-Za-z0-9_-]+\{[^@]*?\}\}/g) ?? [];
      expect(blocks.length, name).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block, name).toContain("{from{");
        expect(block, name).not.toContain("to{");
        expect(block, name).not.toContain("%");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

describe("prefers-reduced-motion", () => {
  it("disables every animation via the same @media mechanism as theming", () => {
    for (const [name, spec] of ANIMATED_SPECS) {
      const svg = renderSvg(spec, { animate: true });
      expect(svg, name).toContain(
        '@media (prefers-reduced-motion:reduce){[class*="pl-anim-"]{animation:none !important}}',
      );
      // Last in the stylesheet, so it also outranks bindings by order.
      const style = styleOf(svg);
      expect(style.indexOf("prefers-reduced-motion"), name).toBeGreaterThan(
        style.lastIndexOf("animation-delay"),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Determinism and namespacing
// ---------------------------------------------------------------------------

describe("animated determinism", () => {
  it("renders byte-identical animated output for the same spec and options", () => {
    for (const [, spec] of ANIMATED_SPECS) {
      for (const options of [
        { animate: true },
        { animate: true, width: 480, idPrefix: "fig", theme: "dark" as const },
      ]) {
        expect(renderSvg(spec, options)).toBe(renderSvg(spec, options));
      }
    }
  });
});

describe("keyframe namespacing", () => {
  it("gives two figures with different idPrefix disjoint keyframe names", () => {
    const a = renderSvg(graphSpec("dependency-graph"), { animate: true, idPrefix: "figA" });
    const b = renderSvg(graphSpec("dependency-graph"), { animate: true, idPrefix: "figB" });
    const namesA = keyframeNames(a);
    const namesB = keyframeNames(b);
    expect(namesA.size).toBeGreaterThan(0);
    expect(namesB.size).toBeGreaterThan(0);
    for (const name of namesA) {
      expect(name.startsWith("figA-")).toBe(true);
      expect(namesB.has(name)).toBe(false);
    }
  });

  it("never defines the same keyframe name twice within one figure", () => {
    for (const [name, spec] of ANIMATED_SPECS) {
      const svg = renderSvg(spec, { animate: true });
      const all = Array.from(svg.matchAll(/@keyframes ([A-Za-z0-9_-]+)\{/g)).map(
        (m) => m[1] as string,
      );
      expect(new Set(all).size, name).toBe(all.length);
    }
  });

  it("references only keyframes the figure itself defines", () => {
    for (const [name, spec] of ANIMATED_SPECS) {
      const svg = renderSvg(spec, { animate: true, idPrefix: "solo" });
      const defined = keyframeNames(svg);
      for (const match of svg.matchAll(/animation:([^;}]*)/g)) {
        if (match[1] === "none !important") continue; // the reduced-motion override
        for (const one of (match[1] as string).split(",")) {
          const referenced = one.trim().split(" ")[0] as string;
          expect(defined.has(referenced), `${name}: ${referenced}`).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation
// ---------------------------------------------------------------------------

describe("types with no purpose-built animation", () => {
  it("renders an unknown type statically, without throwing", () => {
    expect(() => renderSvg(unknownTypeSpec(), { animate: true })).not.toThrow();
    expect(renderSvg(unknownTypeSpec(), { animate: true })).toBe(renderSvg(unknownTypeSpec()));
  });

  it("renders an empty spec statically, without throwing", () => {
    expect(() => renderSvg(emptySpec(), { animate: true })).not.toThrow();
    expect(renderSvg(emptySpec(), { animate: true })).toBe(renderSvg(emptySpec()));
  });
});

// ---------------------------------------------------------------------------
// The epistemic line: order of appearance is the proof's order
// ---------------------------------------------------------------------------

describe("order of appearance", () => {
  it("appends the legend row that says the order is derived and the pacing is not", () => {
    for (const [name, spec] of ANIMATED_SPECS) {
      expect(renderSvg(spec, { animate: true }), name).toContain(
        escapeXml(ANIMATION_LEGEND_ROW.text),
      );
    }
  });

  it("stages graph layers in ascending layer order", () => {
    const svg = renderSvg(graphSpec("dependency-graph"), { animate: true });
    // Layer 0 holds the primary node in this fixture; layer 1 the two others.
    const layer0 = delayOf(svg, tokenOf(svg, /class="pl-box-primary (pl-anim-[A-Za-z0-9_-]+)"/));
    const layer1 = delayOf(svg, tokenOf(svg, /class="pl-box (pl-anim-[A-Za-z0-9_-]+)"/));
    expect(layer0).toBe(0);
    expect(layer1).toBeCloseTo(STAGE_STEP, 5);
  });

  it("draws edges only after both endpoints' layers have entered", () => {
    const svg = renderSvg(graphSpec("dependency-graph"), { animate: true });
    const nodeDelays = [
      delayOf(svg, tokenOf(svg, /class="pl-box-primary (pl-anim-[A-Za-z0-9_-]+)"/)),
      delayOf(svg, tokenOf(svg, /class="pl-box (pl-anim-[A-Za-z0-9_-]+)"/)),
      delayOf(svg, tokenOf(svg, /class="pl-box pl-weak-stroke (pl-anim-[A-Za-z0-9_-]+)"/)),
    ];
    const edgeDelay = delayOf(svg, tokenOf(svg, /class="pl-edge (pl-anim-[A-Za-z0-9_-]+)"/));
    for (const nodeDelay of nodeDelays) {
      expect(edgeDelay).toBeGreaterThanOrEqual(nodeDelay + ENTER_DURATION);
    }
    // And edges draw as a stroke trace, not a pop.
    const rule = ruleOf(svg, tokenOf(svg, /class="pl-edge (pl-anim-[A-Za-z0-9_-]+)"/));
    expect(rule).toContain("stroke-dasharray:");
    expect(rule).toMatch(/-draw-\d+/);
  });

  it("never lets an unused hypothesis enter before a used one", () => {
    const svg = renderSvg(assumptionSpec(), { animate: true });
    const used = delayOf(svg, tokenOf(svg, /class="pl-box (pl-anim-[A-Za-z0-9_-]+)"/));
    const unused = delayOf(svg, tokenOf(svg, /class="pl-box-unused (pl-anim-[A-Za-z0-9_-]+)"/));
    const conclusion = delayOf(
      svg,
      tokenOf(svg, /class="pl-box-primary (pl-anim-[A-Za-z0-9_-]+)"/),
    );
    expect(used).toBe(0);
    expect(unused).toBeGreaterThan(used);
    expect(unused).toBeLessThanOrEqual(conclusion);
    // Unused hypotheses appear in place: a plain fade, not the entrance.
    const unusedRule = ruleOf(svg, tokenOf(svg, /class="pl-box-unused (pl-anim-[A-Za-z0-9_-]+)"/));
    expect(unusedRule).toContain("-fade");
    expect(unusedRule).not.toContain("-enter");
    const usedRule = ruleOf(svg, tokenOf(svg, /class="pl-box (pl-anim-[A-Za-z0-9_-]+)"/));
    expect(usedRule).toContain("-enter");
  });

  it("draws the assumption wires only after the conclusion stands", () => {
    const svg = renderSvg(assumptionSpec(), { animate: true });
    const conclusion = delayOf(
      svg,
      tokenOf(svg, /class="pl-box-primary (pl-anim-[A-Za-z0-9_-]+)"/),
    );
    const wire = delayOf(svg, tokenOf(svg, /class="pl-edge-used (pl-anim-[A-Za-z0-9_-]+)"/));
    expect(wire).toBeGreaterThanOrEqual(conclusion + ENTER_DURATION);
  });

  it("builds the bound plot axis → bound → permitted → excluded → quantity", () => {
    const svg = renderSvg(upperBoundSpec(), { animate: true });
    const axis = delayOf(
      svg,
      tokenOf(svg, /class="pl-axis pl-schematic pl-weak-stroke (pl-anim-[A-Za-z0-9_-]+)"/),
    );
    const bound = delayOf(svg, tokenOf(svg, /class="pl-marker (pl-anim-[A-Za-z0-9_-]+)"/));
    const permitted = delayOf(
      svg,
      tokenOf(svg, /class="pl-region-permit (pl-anim-[A-Za-z0-9_-]+)"/),
    );
    const excluded = delayOf(
      svg,
      tokenOf(svg, /class="pl-region-exclude (pl-anim-[A-Za-z0-9_-]+)"/),
    );
    const quantity = delayOf(svg, tokenOf(svg, /class="pl-dot (pl-anim-[A-Za-z0-9_-]+)"/));
    expect(axis).toBe(0);
    expect(bound).toBeGreaterThan(axis);
    expect(permitted).toBeGreaterThan(bound);
    expect(excluded).toBeGreaterThan(permitted);
    expect(quantity).toBeGreaterThan(excluded);
    // The bound marker draws in rather than popping.
    expect(ruleOf(svg, tokenOf(svg, /class="pl-marker (pl-anim-[A-Za-z0-9_-]+)"/))).toContain(
      "stroke-dasharray:64",
    );
  });

  it("emits a real animation-delay progression", () => {
    const svg = renderSvg(upperBoundSpec(), { animate: true });
    const delays = Array.from(svg.matchAll(/animation-delay:([0-9.]+)s/g)).map((m) => Number(m[1]));
    expect(new Set(delays).size).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Curve traces
// ---------------------------------------------------------------------------

describe("curve traces", () => {
  it("fades the asymptote in before the curve traces towards it", () => {
    const svg = renderSvg(limitSpec("convergent"), { animate: true });
    const asymptote = delayOf(svg, tokenOf(svg, /class="pl-asymptote (pl-anim-[A-Za-z0-9_-]+)"/));
    const curveToken = tokenOf(svg, /class="pl-curve (pl-anim-[A-Za-z0-9_-]+)"/);
    expect(asymptote).toBeLessThan(delayOf(svg, curveToken));
    const rule = ruleOf(svg, curveToken);
    expect(rule).toContain(`${TRACE_DURATION}s`);
    expect(rule).toContain("stroke-dasharray:");
  });

  it("reveals the divergence arrowhead only at the end of the trace", () => {
    const divergent = renderSvg(limitSpec("grows"), { animate: true });
    expect(divergent).toContain("{from{marker-end:none}}");
    expect(
      ruleOf(divergent, tokenOf(divergent, /class="pl-curve (pl-anim-[A-Za-z0-9_-]+)"/)),
    ).toContain("step-end");
    // A convergent curve has no arrowhead, so nothing to reveal.
    expect(renderSvg(limitSpec("convergent"), { animate: true })).not.toContain(
      "{from{marker-end:none}}",
    );
  });

  it("traces the monotonicity curve over the long duration", () => {
    const svg = renderSvg(monotonicitySpec("increasing"), { animate: true });
    const rule = ruleOf(svg, tokenOf(svg, /class="pl-curve (pl-anim-[A-Za-z0-9_-]+)"/));
    expect(rule).toContain(`${TRACE_DURATION}s`);
    expect(rule).toMatch(/-draw-\d+/);
  });

  it("fades a weak curve instead of sliding its dash pattern", () => {
    const spec = limitSpec("convergent");
    const fn = spec.entities.find((e) => e.kind === "function");
    fn!.epistemic = "illustrative";
    const svg = renderSvg(spec, { animate: true });
    const token = tokenOf(svg, /class="pl-curve pl-weak-stroke (pl-anim-[A-Za-z0-9_-]+)"/);
    const rule = ruleOf(svg, token);
    expect(rule).toContain("-fade");
    expect(rule).not.toContain("stroke-dasharray");
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function styleOf(svg: string): string {
  return /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? "";
}

function keyframeNames(svg: string): Set<string> {
  return new Set(
    Array.from(svg.matchAll(/@keyframes ([A-Za-z0-9_-]+)\{/g)).map((m) => m[1] as string),
  );
}

/** The animation class token bound to the first element the pattern matches. */
function tokenOf(svg: string, elementPattern: RegExp): string {
  const match = elementPattern.exec(svg);
  expect(match, String(elementPattern)).not.toBeNull();
  return match![1] as string;
}

/** The CSS rule for one animation class token. */
function ruleOf(svg: string, token: string): string {
  const match = new RegExp(`\\.${token}\\{([^}]*)\\}`).exec(svg);
  expect(match, token).not.toBeNull();
  return match![1] as string;
}

/** The animation-delay, in seconds, of one animation class token. */
function delayOf(svg: string, token: string): number {
  const match = /animation-delay:([0-9.]+)s/.exec(ruleOf(svg, token));
  expect(match, token).not.toBeNull();
  return Number(match![1]);
}

/**
 * Remove everything the `animate` option is allowed to add:
 *
 *  1. the animation CSS — a contiguous suffix of the `<style>` element,
 *     starting at the first `@keyframes`;
 *  2. `pl-anim-*` class tokens (and any class attribute left empty);
 *  3. the appended legend row's text lines;
 *  4. the extra height that legend row occupies — the animated figure is
 *     taller, so the annotation block's translate, the viewBox height and the
 *     background rect height are rebased onto the static figure's values.
 *
 * Anything else that differs is an animation leaking into geometry or
 * content, and the byte comparison in the test will expose it.
 */
function stripAnimation(animated: string, staticSvg: string): string {
  let s = animated;

  // 1. The animation stylesheet suffix.
  s = s.replace(/(<style>[\s\S]*?)@keyframes [\s\S]*?<\/style>/, "$1</style>");

  // 2. Class tokens: attributes that are only the token, then embedded ones.
  s = s.replace(/ class=" ?pl-anim-[A-Za-z0-9_-]+"/g, "");
  s = s.replace(/ pl-anim-[A-Za-z0-9_-]+/g, "");
  s = s.replace(/ class=""/g, "");

  // 3. The legend row: its wrapped lines are substrings of the row text.
  const rowText = escapeXml(ANIMATION_LEGEND_ROW.text);
  s = s.replace(/<text x="[0-9.]+" y="[0-9.]+" class="pl-note">([^<]*)<\/text>/g, (m, line) =>
    rowText.includes((line as string).replace(/…$/, "")) ? "" : m,
  );

  // 4. Rebase the heights the removed row occupied.
  const staticHeights = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(staticSvg);
  expect(staticHeights).not.toBeNull();
  const height = staticHeights![2] as string;
  s = s.replace(/(viewBox="0 0 [0-9.]+ )[0-9.]+"/, `$1${height}"`);
  s = s.replace(
    /(<rect x="0" y="0" width="[0-9.]+" height=")[0-9.]+(" class="pl-bg")/,
    `$1${height}$2`,
  );
  const staticGroupYs = Array.from(
    staticSvg.matchAll(/<g transform="translate\(0 ([0-9.]+)\)"/g),
  ).map((m) => m[1] as string);
  let index = 0;
  s = s.replace(/(<g transform="translate\(0 )([0-9.]+)(\)")/g, (whole, before, y, after) => {
    const replacement = staticGroupYs[index];
    index += 1;
    return replacement === undefined
      ? (whole as string)
      : `${before as string}${replacement}${after as string}`;
  });
  expect(index).toBe(staticGroupYs.length);

  return s;
}
