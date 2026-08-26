/**
 * Proof animation (§27): the progression hypotheses → lemmas → transformations
 * → conclusion, as pure CSS inside the figure's one inline `<style>`.
 *
 * Animation is a renderer capability, not a VisualIR concept. The ORDER of
 * appearance is derived — it is read from the same `position.layer` /
 * `position.order` / `state` / relationship data the static layout already
 * trusts, so a stage sequence is exactly as honest as the figure it stages.
 * The TIMING is illustrative: the durations and offsets below are display
 * choices, and the appended legend row says so in words.
 *
 * Four properties are load-bearing:
 *
 *  1. **The final frame equals the static render.** Every keyframe block
 *     declares only a `from`; the implicit `to` is the element's computed
 *     (static) style, and `animation-fill-mode: both` holds it there. Stripping
 *     the animation CSS and class tokens from an animated figure must yield
 *     the static figure, byte for byte — there is a test that does exactly
 *     that.
 *  2. **`prefers-reduced-motion: reduce` disables everything**, via the same
 *     `@media` mechanism the theming already uses. Because no animation state
 *     lives outside the CSS, disabling the CSS *is* the static figure.
 *  3. **Determinism.** Stages come from the spec, class tokens from emission
 *     order, and nothing reads a clock. Same spec + same options → identical
 *     bytes.
 *  4. **Coexistence.** Keyframe names are minted through the same
 *     spec-and-prefix id mechanism as every other id, so two animated figures
 *     inlined into one HTML page cannot capture each other's keyframes.
 *
 * No JavaScript and no SMIL: a `<script>` would break self-containment, and
 * SMIL is deprecated in some engines. Engines that apply CSS but not CSS
 * animations simply show the final (static) frame, because nothing outside
 * `@keyframes ... from` ever hides an element.
 */
import type { LegendRow, RenderContext } from "./context.js";
import { num } from "./xml.js";

/** Seconds between the start of one stage and the start of the next. */
export const STAGE_STEP = 0.55;

/** Duration of a staged entrance or fade. */
export const ENTER_DURATION = 0.45;

/** Duration of a curve trace (limit and monotonicity plots). */
export const TRACE_DURATION = 2;

/** Duration of the final chrome fade (legend and annotations, together). */
export const CHROME_FADE_DURATION = 0.35;

/** When stage `n` begins. */
export function stageDelay(stage: number): number {
  return stage * STAGE_STEP;
}

/**
 * When everything in stage `n` has finished entering — the earliest honest
 * moment for an edge whose endpoints belong to stage `n` to start drawing.
 */
export function afterStage(stage: number): number {
  return stageDelay(stage) + ENTER_DURATION;
}

/**
 * The legend row appended to every animated figure.
 *
 * This sentence is the epistemic line between a proof animation and a
 * slideshow: the order is a fact about the proof, the pacing is not.
 */
export const ANIMATION_LEGEND_ROW: LegendRow = {
  swatch: "none",
  text: "Order of appearance follows the proof's dependency structure. The pacing is a display choice.",
};

/**
 * Build the animation stylesheet for one render.
 *
 * Emitted, in order: the `@keyframes` blocks actually used, one class rule per
 * distinct (kind, delay, duration, length) binding, and the reduced-motion
 * override last. Every keyframe block declares only a `from`, so the implicit
 * `to` is the element's own static style — including a presentation-attribute
 * `transform` or `marker-end`, which is what makes the final frame equal the
 * static render without this module knowing what any element looks like.
 */
export function buildAnimationStylesheet(ctx: RenderContext): string {
  const targets = ctx.animTargets;
  if (targets.length === 0) return "";

  let css = "";

  if (targets.some((t) => t.kind === "enter")) {
    css += `@keyframes ${ctx.id("enter")}{from{opacity:0;transform:translateY(6px)}}`;
  }
  if (targets.some((t) => t.kind === "fade")) {
    css += `@keyframes ${ctx.id("fade")}{from{opacity:0}}`;
  }
  const drawLengths: number[] = [];
  for (const target of targets) {
    if (target.kind === "draw" && !drawLengths.includes(target.length)) {
      drawLengths.push(target.length);
    }
  }
  for (const length of drawLengths) {
    css += `@keyframes ${ctx.id(`draw-${length}`)}{from{stroke-dashoffset:${num(length)}}}`;
  }
  if (targets.some((t) => t.kind === "draw" && t.revealMarker !== undefined)) {
    // `step-end` holds `marker-end: none` until the trace completes, so an
    // arrowhead appears exactly when the stroke reaches it. Engines that do
    // not animate `marker-end` show the marker throughout — early, never wrong.
    css += `@keyframes ${ctx.id("marker")}{from{marker-end:none}}`;
  }

  for (const target of targets) {
    const name =
      target.kind === "enter"
        ? ctx.id("enter")
        : target.kind === "fade"
          ? ctx.id("fade")
          : ctx.id(`draw-${target.length}`);
    const delay = `${num(target.delay)}s`;
    let declarations = "";
    let animations = `${name} ${num(target.duration)}s ease-out both`;
    let delays = delay;
    if (target.kind === "draw") {
      // The dash is at least as long as the path, so an already-finished (or
      // never-run) animation shows an unbroken stroke: the static picture.
      declarations += `stroke-dasharray:${num(target.length)};`;
      if (target.revealMarker !== undefined) {
        animations += `,${ctx.id("marker")} ${num(target.duration)}s step-end both`;
        delays += `,${delay}`;
      }
    }
    css += `.${target.className}{${declarations}animation:${animations};animation-delay:${delays}}`;
  }

  // Last, so it outranks every binding above by order, and `!important` so it
  // also outranks bindings from *other* figures inlined later in the same
  // page. A reader who asked for no motion gets the static figure, instantly.
  css += `@media (prefers-reduced-motion:reduce){[class*="pl-anim-"]{animation:none !important}}`;

  return css;
}
