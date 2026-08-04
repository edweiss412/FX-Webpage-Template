// @vitest-environment jsdom
// Spec: docs/superpowers/specs/2026-08-03-nojs-loading-shell-notice-design.md §7.1
//
// LoadingShell's no-JS branch. Rendered through `react-dom/server`, NOT through
// @testing-library/react — see spec §7.0. React's client renderer leaves the
// <noscript> subtree EMPTY under jsdom (measured: childElementCount 0, innerHTML
// ""), so a testing-library version of this file would pass vacuously against a
// component that renders nothing at all. jsdom is still the environment because
// it is what supplies DOMParser; the `node` environment has no DOM parser.
//
// The markup is split at the <noscript> boundary into two halves, and each half
// is parsed separately. That is deliberate: HTML parsers treat <noscript>
// contents differently depending on whether scripting is considered enabled, and
// neither half contains a <noscript> element once split, so the ambiguity never
// arises. Assertions then use real DOM containment rather than string ordering —
// an empty <div data-loading-shell-content></div> rendered as a SIBLING of the
// status and children satisfies every "appears after" check while leaving the
// feature completely broken.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingShell } from "@/components/layout/Skeleton";

const HIDE_RULE = "[data-loading-shell-content]{display:none}";
const NOTICE = '[data-testid="loading-nojs-notice"]';
const TITLE = "JavaScript is required";
const BODY = "This page needs JavaScript to load. Turn it on, then reload.";

/**
 * `testId` is optional and `app/me/loading.tsx` omits it, so a mutation keyed on
 * the prop — `className={testId ? undefined : "hidden"}` on the wrapper — leaves
 * the probe render and the /admin e2e byte-identical while hiding /me. Any
 * assertion that runs for one variant only is blind to it.
 *
 * So the parameterization is on the DESCRIBE, not on individual cases. Running
 * both variants per-assertion was the first fix and it failed the way partial
 * fixes do: it closed the two cases it was applied to and left the other
 * thirteen single-variant, and the escaping mutant above was found against
 * exactly that state (cross-model review round 9, live mutant: 15/15 component
 * cases green, style guard green, /admin e2e markup byte-identical, `/me`
 * wrapper rendered `class="hidden"`). With the block parameterized there is no
 * per-assertion decision left to get wrong, and a NEW assertion is covered by
 * construction instead of by remembering.
 */
const VARIANTS = [
  { name: "with testId", testId: "probe" as string | undefined },
  { name: "without testId (the /me case)", testId: undefined },
];

function renderShell(testId: string | undefined): {
  html: string;
  noscriptInner: Document;
  outer: Document;
} {
  // Spread rather than pass `testId={undefined}`: under exactOptionalPropertyTypes
  // an explicit undefined is not assignable to an optional prop, and omitting the
  // prop is exactly what `app/me/loading.tsx` does.
  const idProp = testId === undefined ? {} : { testId };
  const html = renderToStaticMarkup(
    <LoadingShell {...idProp} label="Loading your dashboard…">
      <div data-testid="child" />
    </LoadingShell>,
  );
  const open = html.indexOf("<noscript>");
  const close = html.indexOf("</noscript>");
  expect(open, "LoadingShell renders no <noscript> block").toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);

  const inner = html.slice(open + "<noscript>".length, close);
  const rest = html.slice(0, open) + html.slice(close + "</noscript>".length);
  const parser = new DOMParser();
  return {
    html,
    noscriptInner: parser.parseFromString(inner, "text/html"),
    outer: parser.parseFromString(rest, "text/html"),
  };
}

/** Narrow a nullable query to a definite Element, failing the test if absent. */
function must(el: Element | null, what: string): Element {
  expect(el, `expected to find ${what}`).not.toBeNull();
  return el as Element;
}

describe.each(VARIANTS)("LoadingShell no-JavaScript notice — $name", ({ testId }) => {
  it("renders the notice INSIDE <noscript> and nowhere else (else every visitor sees it)", () => {
    const { noscriptInner, outer } = renderShell(testId);
    expect(noscriptInner.querySelector(NOTICE)).not.toBeNull();
    expect(outer.querySelector(NOTICE)).toBeNull();
  });

  it("carries the exact hide rule (a typo'd selector leaves the skeleton visible)", () => {
    const { noscriptInner } = renderShell(testId);
    const style = must(noscriptInner.querySelector("style"), "a <style> inside <noscript>");
    expect(style.textContent).toBe(HIDE_RULE);
  });

  it("hide rule's selector actually matches the content wrapper (they can disagree)", () => {
    const { noscriptInner, outer } = renderShell(testId);
    const style = must(noscriptInner.querySelector("style"), "a <style> inside <noscript>");
    const match = /^(\[[^\]]+\])\{/.exec(style.textContent ?? "");
    expect(match, "style text is not a single attribute-selector rule").not.toBeNull();
    const selector = (match as RegExpExecArray)[1] as string;
    expect(outer.querySelector(selector), `nothing matches ${selector}`).not.toBeNull();
  });

  it("wrapper CONTAINS the announcement and the children (not merely precedes them)", () => {
    const { outer } = renderShell(testId);
    const wrapper = must(
      outer.querySelector("[data-loading-shell-content]"),
      "the content wrapper",
    );
    const status = must(outer.querySelector('[role="status"]'), "the role=status announcement");
    const child = must(outer.querySelector('[data-testid="child"]'), "the passed-in child");
    expect(wrapper.contains(status)).toBe(true);
    expect(wrapper.contains(child)).toBe(true);
  });

  it("says exactly what it should say (any benign wrong message passes the rest)", () => {
    const { noscriptInner } = renderShell(testId);
    expect(must(noscriptInner.querySelector("h1"), "the notice heading").textContent).toBe(TITLE);
    expect(must(noscriptInner.querySelector("p"), "the notice body").textContent).toBe(BODY);
  });

  it("titles with a heading element, not a styled paragraph", () => {
    const { noscriptInner } = renderShell(testId);
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    expect(must(notice.querySelector("h1"), "an h1 inside the notice").tagName).toBe("H1");
  });

  it("keeps the copy conventions no existing scan reaches", () => {
    const { noscriptInner } = renderShell(testId);
    const text = must(noscriptInner.querySelector(NOTICE), "the notice").textContent ?? "";
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z0-9_]+/);
  });

  it("gives the notice its own gutter and width cap (the crew route supplies none)", () => {
    const { noscriptInner } = renderShell(testId);
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    const gutter = notice.parentElement;
    expect(gutter, "the notice has no wrapping gutter element").not.toBeNull();
    for (const cls of ["mx-auto", "max-w-2xl", "px-4"]) {
      expect((gutter as Element).classList.contains(cls), `gutter is missing ${cls}`).toBe(true);
    }
  });

  it("keeps the card's token classes (a classless card passes every other check)", () => {
    const { noscriptInner } = renderShell(testId);
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    for (const cls of ["rounded-md", "border", "border-border", "bg-surface", "p-tile-pad"]) {
      expect(notice.classList.contains(cls), `notice is missing ${cls}`).toBe(true);
    }
  });

  it("keeps the heading and body token classes", () => {
    const { noscriptInner } = renderShell(testId);
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    const heading = must(notice.querySelector("h1"), "the heading");
    const body = must(notice.querySelector("p"), "the body paragraph");
    for (const cls of ["text-2xl", "font-semibold", "text-text-strong"]) {
      expect(heading.classList.contains(cls), `heading is missing ${cls}`).toBe(true);
    }
    for (const cls of ["mt-2", "text-base", "text-text-subtle"]) {
      expect(body.classList.contains(cls), `body is missing ${cls}`).toBe(true);
    }
  });

  it("nests the copy inside the card (loose copy beside an empty card would pass)", () => {
    const { noscriptInner } = renderShell(testId);
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    expect(notice.contains(must(noscriptInner.querySelector("h1"), "the heading"))).toBe(true);
    expect(notice.contains(must(noscriptInner.querySelector("p"), "the body"))).toBe(true);
  });

  it("leaves the wrapper intrinsically visible (a `hidden` attr would pass everything else)", () => {
    const { outer } = renderShell(testId);
    const wrapper = must(
      outer.querySelector("[data-loading-shell-content]"),
      "the content wrapper",
    );
    // Exactly one attribute, and it is the hook itself. Anything else on this
    // element -- `hidden`, `class="hidden"`, `style="display:none"` -- would
    // break the JavaScript-ENABLED loading path on all nine routes while every
    // other assertion here and all four e2e cases stayed green, because they
    // check the notice and the no-JS branch, never this element's visibility.
    //
    // The describe is parameterized, so this runs for the no-`testId` variant
    // too. That matters: when it ran only against the probe, a wrapper class
    // applied solely when `testId` was absent hid `/me` with the whole suite
    // green (round 9's escaping mutant).
    expect(Array.from(wrapper.attributes).map((a) => a.name)).toEqual([
      "data-loading-shell-content",
    ]);
    expect(wrapper.getAttribute("data-loading-shell-content")).toBe("");
  });

  it("puts NOTHING between the shell root and the wrapper", () => {
    const { outer } = renderShell(testId);
    const wrapper = must(
      outer.querySelector("[data-loading-shell-content]"),
      "the content wrapper",
    );

    // Blacklisting hiding mechanisms is a losing game: `hidden`, then
    // `display:none`, then `visibility:hidden`, then `opacity:0`, then
    // `clip`/`height:0`... each round found the next one. So pin the SHAPE.
    // Inside LoadingShell the wrapper's only ancestor is the root, and that
    // root carries `data-testid` (when given) and nothing else.
    const root = must(wrapper.parentElement, "the wrapper's parent");
    expect(root.parentElement?.tagName).toBe("BODY");
    const expected = testId === undefined ? [] : ["data-testid"];
    expect(
      Array.from(root.attributes)
        .map((a) => a.name)
        .sort(),
    ).toEqual(expected);

    // Element TYPE too, not just attributes: swapping either div for a
    // `<dialog>` keeps every attribute assertion true while UA styling hides
    // the JS-on fallback outright.
    expect(root.tagName).toBe("DIV");
    expect(wrapper.tagName).toBe("DIV");
  });

  it("serializes the wrapper attribute as the empty string, not the bare-JSX true", () => {
    const { html } = renderShell(testId);
    expect(html).toContain('data-loading-shell-content=""');
  });
});
