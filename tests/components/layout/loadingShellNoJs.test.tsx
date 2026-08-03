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

function renderShell(): { html: string; noscriptInner: Document; outer: Document } {
  const html = renderToStaticMarkup(
    <LoadingShell testId="probe" label="Loading your dashboard…">
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

describe("LoadingShell no-JavaScript notice", () => {
  it("renders the notice INSIDE <noscript> and nowhere else (else every visitor sees it)", () => {
    const { noscriptInner, outer } = renderShell();
    expect(noscriptInner.querySelector(NOTICE)).not.toBeNull();
    expect(outer.querySelector(NOTICE)).toBeNull();
  });

  it("carries the exact hide rule (a typo'd selector leaves the skeleton visible)", () => {
    const { noscriptInner } = renderShell();
    const style = must(noscriptInner.querySelector("style"), "a <style> inside <noscript>");
    expect(style.textContent).toBe(HIDE_RULE);
  });

  it("hide rule's selector actually matches the content wrapper (they can disagree)", () => {
    const { noscriptInner, outer } = renderShell();
    const style = must(noscriptInner.querySelector("style"), "a <style> inside <noscript>");
    const match = /^(\[[^\]]+\])\{/.exec(style.textContent ?? "");
    expect(match, "style text is not a single attribute-selector rule").not.toBeNull();
    const selector = (match as RegExpExecArray)[1] as string;
    expect(outer.querySelector(selector), `nothing matches ${selector}`).not.toBeNull();
  });

  it("wrapper CONTAINS the announcement and the children (not merely precedes them)", () => {
    const { outer } = renderShell();
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
    const { noscriptInner } = renderShell();
    expect(must(noscriptInner.querySelector("h1"), "the notice heading").textContent).toBe(TITLE);
    expect(must(noscriptInner.querySelector("p"), "the notice body").textContent).toBe(BODY);
  });

  it("titles with a heading element, not a styled paragraph", () => {
    const { noscriptInner } = renderShell();
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    expect(must(notice.querySelector("h1"), "an h1 inside the notice").tagName).toBe("H1");
  });

  it("keeps the copy conventions no existing scan reaches", () => {
    const { noscriptInner } = renderShell();
    const text = must(noscriptInner.querySelector(NOTICE), "the notice").textContent ?? "";
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z0-9_]+/);
  });

  it("gives the notice its own gutter and width cap (page padding is inside the hidden half)", () => {
    const { noscriptInner } = renderShell();
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    const gutter = notice.parentElement;
    expect(gutter, "the notice has no wrapping gutter element").not.toBeNull();
    for (const cls of ["mx-auto", "max-w-2xl", "px-4"]) {
      expect((gutter as Element).classList.contains(cls), `gutter is missing ${cls}`).toBe(true);
    }
  });

  it("keeps the card's token classes (a classless card passes every other check)", () => {
    const { noscriptInner } = renderShell();
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    for (const cls of ["rounded-md", "border", "border-border", "bg-surface", "p-tile-pad"]) {
      expect(notice.classList.contains(cls), `notice is missing ${cls}`).toBe(true);
    }
  });

  it("keeps the heading and body token classes", () => {
    const { noscriptInner } = renderShell();
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    const heading = must(notice.querySelector("h1"), "the heading");
    const body = must(notice.querySelector("p"), "the body paragraph");
    for (const cls of ["text-base", "font-semibold", "text-text-strong"]) {
      expect(heading.classList.contains(cls), `heading is missing ${cls}`).toBe(true);
    }
    for (const cls of ["mt-1", "text-sm", "text-text-subtle"]) {
      expect(body.classList.contains(cls), `body is missing ${cls}`).toBe(true);
    }
  });

  it("nests the copy inside the card (loose copy beside an empty card would pass)", () => {
    const { noscriptInner } = renderShell();
    const notice = must(noscriptInner.querySelector(NOTICE), "the notice");
    expect(notice.contains(must(noscriptInner.querySelector("h1"), "the heading"))).toBe(true);
    expect(notice.contains(must(noscriptInner.querySelector("p"), "the body"))).toBe(true);
  });

  it("serializes the wrapper attribute as the empty string, not the bare-JSX true", () => {
    const { html } = renderShell();
    expect(html).toContain('data-loading-shell-content=""');
  });
});
