import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * Structural guard for audit idx26/#115. The wizard Step-2 <progress>
 * INDETERMINATE shimmer must live on the TRACK pseudo-elements
 * (::-webkit-progress-bar / ::-moz-progress-bar) under :indeterminate — NOT on
 * the bare <progress> element, where WebKit occludes it under the opaque
 * progress-bar and Firefox paints a misleading solid 100% accent bar.
 *
 * CSS visual behavior can't be verified in jsdom (no pseudo-element layout /
 * paint), so these assertions regex the ACTUAL selectors + declarations. Full
 * visual confirmation still needs a real browser (getComputedStyle on the
 * pseudo-element background-image); this structural test pins the source so the
 * occlusion/solid-bar regression can't silently return.
 */
const css = readFileSync("app/globals.css", "utf8");

// `progress[data-testid="wizard-step2-progressbar"]` with regex metachars escaped.
const PB = String.raw`progress\[data-testid="wizard-step2-progressbar"\]`;

/** First rule block body ({...}) for a selector source (no nested braces inside). */
function firstBlock(selectorSource: string): string | null {
  const m = css.match(new RegExp(selectorSource + String.raw`\s*\{([^}]*)\}`));
  return m ? (m[1] ?? null) : null;
}

const SHIMMER_IMAGE = /background-image:\s*linear-gradient\(/;
const SHIMMER_ANIM = /animation:\s*scan-progress-indeterminate\b/;

describe("wizard-step2 indeterminate progress shimmer on track pseudo-elements (idx26/#115)", () => {
  it("(a-webkit) the shimmer bg-image + scan-progress-indeterminate animation are on :indeterminate::-webkit-progress-bar", () => {
    const body = firstBlock(PB + String.raw`:indeterminate::-webkit-progress-bar`);
    expect(body, "missing :indeterminate::-webkit-progress-bar rule").not.toBeNull();
    expect(body!).toMatch(SHIMMER_IMAGE);
    expect(body!).toMatch(SHIMMER_ANIM);
  });

  it("(a-moz) the shimmer bg-image + scan-progress-indeterminate animation are on :indeterminate::-moz-progress-bar", () => {
    const body = firstBlock(PB + String.raw`:indeterminate::-moz-progress-bar`);
    expect(body, "missing :indeterminate::-moz-progress-bar rule").not.toBeNull();
    expect(body!).toMatch(SHIMMER_IMAGE);
    expect(body!).toMatch(SHIMMER_ANIM);
  });

  it("(a-not-bare) the shimmer is NOT on the bare :indeterminate element (that form is occluded/solid)", () => {
    // A bare `progress[...]:indeterminate { ... }` rule (immediately a brace, no
    // ::pseudo) is the occluded-in-WebKit / solid-in-Firefox bug. Every
    // `:indeterminate` occurrence must be followed by a `::` pseudo-element, so
    // requiring `{` right after `:indeterminate` matches nothing.
    expect(firstBlock(PB + String.raw`:indeterminate`)).toBeNull();
  });

  it("(b) :indeterminate::-moz-progress-bar sets background-color: transparent (defeats Firefox's solid 100% bar)", () => {
    const body = firstBlock(PB + String.raw`:indeterminate::-moz-progress-bar`);
    expect(body).not.toBeNull();
    expect(body!).toMatch(/background-color:\s*transparent/);
  });

  it("(c) prefers-reduced-motion kills the shimmer (animation: none) on the indeterminate progressbar pseudo-elements", () => {
    // The comma-grouped rule (both pseudo-elements) is the reduced-motion override.
    const groupRe = new RegExp(
      PB +
        String.raw`:indeterminate::-webkit-progress-bar\s*,\s*` +
        PB +
        String.raw`:indeterminate::-moz-progress-bar\s*\{([^}]*)\}`,
    );
    const m = css.match(groupRe);
    expect(
      m,
      "missing comma-grouped reduced-motion rule for the progressbar pseudo-elements",
    ).not.toBeNull();
    expect(m![1]).toMatch(/animation:\s*none/);
    // …and that rule is inside a prefers-reduced-motion media block (nearest
    // preceding @media before it is a reduced-motion one).
    const idx = m!.index!;
    const lastMedia = css.slice(0, idx).lastIndexOf("@media");
    expect(lastMedia).toBeGreaterThan(-1);
    expect(css.slice(lastMedia, idx)).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("(determinate unchanged) the filled-state pseudo-elements still paint the solid accent", () => {
    // ::-webkit-progress-value and the base (non-indeterminate) ::-moz-progress-bar
    // keep the accent fill — the determinate progress display must not regress.
    expect(firstBlock(PB + String.raw`::-webkit-progress-value`)).toMatch(
      /background-color:\s*var\(--color-accent\)/,
    );
    expect(firstBlock(PB + String.raw`::-moz-progress-bar`)).toMatch(
      /background-color:\s*var\(--color-accent\)/,
    );
  });
});
