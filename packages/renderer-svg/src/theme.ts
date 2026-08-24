/**
 * Palette and stylesheet.
 *
 * The stylesheet is inlined into every figure. There are no external
 * stylesheets, no webfonts, no scripts and no images: a ProofLens SVG has to
 * survive being pasted into a Lean infoview, a GitHub comment, a paper, or an
 * offline archive without changing what it claims.
 *
 * Colours are declared as custom properties on `:root` (which, inside an SVG
 * document, is the `<svg>` element itself). Every property is defined in every
 * mode; nothing is left to inherit from the host page.
 */

export type Theme = "light" | "dark" | "auto";

/** The complete set of palette tokens. Both palettes must define all of them. */
interface Palette {
  bg: string;
  panel: string;
  border: string;
  fg: string;
  muted: string;
  faint: string;
  axis: string;
  accent: string;
  accentSoft: string;
  permit: string;
  permitFill: string;
  exclude: string;
  excludeFill: string;
  warn: string;
  warnBg: string;
  warnBorder: string;
  edge: string;
  unused: string;
}

const LIGHT: Palette = {
  bg: "#ffffff",
  panel: "#f5f7f9",
  border: "#d6dbe1",
  fg: "#151a20",
  muted: "#586170",
  faint: "#7d8794",
  axis: "#39424e",
  accent: "#1f5fbf",
  accentSoft: "#e2ecfb",
  permit: "#1c6f47",
  permitFill: "#dcefe4",
  exclude: "#a03521",
  excludeFill: "#f8e5e0",
  warn: "#8f2711",
  warnBg: "#fdeae4",
  warnBorder: "#e7a48f",
  edge: "#6a7482",
  unused: "#8a93a0",
};

const DARK: Palette = {
  bg: "#12161b",
  panel: "#1b212a",
  border: "#303a47",
  fg: "#e9edf2",
  muted: "#a6b0bc",
  faint: "#7d8895",
  axis: "#b8c2ce",
  accent: "#7fb0ff",
  accentSoft: "#1c2b41",
  permit: "#6ed49e",
  permitFill: "#16301f",
  exclude: "#ff9c84",
  excludeFill: "#3a1c16",
  warn: "#ffb3a0",
  warnBg: "#38160f",
  warnBorder: "#7c3827",
  edge: "#8d98a6",
  unused: "#7d8895",
};

/** Default font stacks. System fonts only: nothing is fetched. */
export const DEFAULT_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

export const MONO_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';

/**
 * Strip anything from a caller-supplied font stack that could escape the
 * `<style>` element or the CSS declaration it lives in.
 */
export function sanitizeFontFamily(family: string | undefined): string {
  if (!family) return DEFAULT_FONT_FAMILY;
  const cleaned = family
    .replace(/[<>&{};@\\]/g, "")
    .replace(/'/g, '"')
    .trim();
  return cleaned === "" ? DEFAULT_FONT_FAMILY : cleaned;
}

function vars(p: Palette): string {
  return [
    `--pl-bg:${p.bg}`,
    `--pl-panel:${p.panel}`,
    `--pl-border:${p.border}`,
    `--pl-fg:${p.fg}`,
    `--pl-muted:${p.muted}`,
    `--pl-faint:${p.faint}`,
    `--pl-axis:${p.axis}`,
    `--pl-accent:${p.accent}`,
    `--pl-accent-soft:${p.accentSoft}`,
    `--pl-permit:${p.permit}`,
    `--pl-permit-fill:${p.permitFill}`,
    `--pl-exclude:${p.exclude}`,
    `--pl-exclude-fill:${p.excludeFill}`,
    `--pl-warn:${p.warn}`,
    `--pl-warn-bg:${p.warnBg}`,
    `--pl-warn-border:${p.warnBorder}`,
    `--pl-edge:${p.edge}`,
    `--pl-unused:${p.unused}`,
  ].join(";");
}

/**
 * Build the inline stylesheet.
 *
 * - `light` / `dark` emit exactly one palette, so the figure looks the same
 *   wherever it is embedded.
 * - `auto` emits the light palette on `:root` and redefines every token inside
 *   a `prefers-color-scheme: dark` media query. Because the dark block
 *   redefines the same tokens rather than adding new ones, no colour can end
 *   up undefined in either mode.
 *
 * The CSS text contains no `<` or `&`, so it needs no escaping and no CDATA
 * section — which matters, because CDATA behaves differently when an SVG is
 * inlined into HTML.
 */
export function buildStylesheet(theme: Theme, fontFamily: string): string {
  const sans = sanitizeFontFamily(fontFamily);
  let palette: string;
  if (theme === "dark") {
    palette = `:root{${vars(DARK)}}`;
  } else if (theme === "light") {
    palette = `:root{${vars(LIGHT)}}`;
  } else {
    palette = `:root{${vars(LIGHT)}}@media (prefers-color-scheme:dark){:root{${vars(DARK)}}}`;
  }

  const rules = [
    `.pl-bg{fill:var(--pl-bg)}`,
    `text{font-family:${sans};fill:var(--pl-fg);white-space:pre}`,
    `.pl-mono{font-family:${MONO_FONT_FAMILY}}`,
    `.pl-title{font-size:17px;font-weight:600;fill:var(--pl-fg)}`,
    `.pl-subtitle{font-size:11px;fill:var(--pl-muted);letter-spacing:.08em}`,
    `.pl-status{font-size:10.5px;fill:var(--pl-faint);letter-spacing:.06em}`,
    `.pl-heading{font-size:10px;fill:var(--pl-faint);letter-spacing:.1em;font-weight:600}`,
    `.pl-label{font-size:12px;fill:var(--pl-fg)}`,
    `.pl-label-strong{font-size:12.5px;font-weight:600;fill:var(--pl-fg)}`,
    `.pl-detail{font-size:10.5px;fill:var(--pl-muted)}`,
    `.pl-tick{font-size:10px;fill:var(--pl-muted)}`,
    `.pl-axis-title{font-size:10.5px;fill:var(--pl-muted)}`,
    `.pl-axis{stroke:var(--pl-axis);stroke-width:1.5;fill:none;stroke-linecap:round}`,
    `.pl-guide{stroke:var(--pl-border);stroke-width:1;fill:none;stroke-dasharray:2 3}`,
    `.pl-schematic{stroke-dasharray:7 4}`,
    `.pl-marker{stroke:var(--pl-accent);stroke-width:2;fill:none;stroke-linecap:round}`,
    `.pl-dot{fill:var(--pl-accent);stroke:none}`,
    `.pl-dot-open{fill:var(--pl-bg);stroke:var(--pl-accent);stroke-width:2.25}`,
    `.pl-region-permit{fill:var(--pl-permit-fill);stroke:var(--pl-permit);stroke-width:1}`,
    `.pl-region-exclude{fill:var(--pl-exclude-fill);stroke:var(--pl-exclude);stroke-width:1}`,
    `.pl-permit-text{font-size:10.5px;fill:var(--pl-permit);font-weight:600}`,
    `.pl-exclude-text{font-size:10.5px;fill:var(--pl-exclude);font-weight:600}`,
    `.pl-box{fill:var(--pl-panel);stroke:var(--pl-border);stroke-width:1}`,
    `.pl-box-primary{fill:var(--pl-accent-soft);stroke:var(--pl-accent);stroke-width:1.5}`,
    `.pl-box-unused{fill:var(--pl-bg);stroke:var(--pl-unused);stroke-width:1;stroke-dasharray:5 3}`,
    `.pl-unused-text{fill:var(--pl-unused)}`,
    `.pl-badge{font-size:9px;fill:var(--pl-unused);letter-spacing:.09em;font-weight:600}`,
    `.pl-edge{stroke:var(--pl-edge);stroke-width:1.4;fill:none}`,
    `.pl-edge-used{stroke:var(--pl-accent);stroke-width:1.75;fill:none}`,
    `.pl-curve{stroke:var(--pl-accent);stroke-width:2.25;fill:none;stroke-linecap:round}`,
    `.pl-rule{stroke:var(--pl-border);stroke-width:1}`,
    `.pl-rationale-bar{fill:var(--pl-accent);stroke:none}`,
    `.pl-rationale{font-size:12px;fill:var(--pl-fg)}`,
    `.pl-warn-box{fill:var(--pl-warn-bg);stroke:var(--pl-warn-border);stroke-width:1.25}`,
    `.pl-warn-text{font-size:11.5px;fill:var(--pl-warn);font-weight:600}`,
    `.pl-note{font-size:10.5px;fill:var(--pl-muted)}`,
    // The epistemic encoding. Anything weaker than `derived` is drawn with a
    // broken stroke and a lightened fill, and the legend says so in words.
    `.pl-weak-stroke{stroke-dasharray:5 3}`,
    `.pl-weak-fill{fill-opacity:.55}`,
    `.pl-weak-text{fill:var(--pl-muted)}`,
  ].join("");

  return palette + rules;
}
