// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { injectSavedCopyHead, type InjectOptions } from "@/lib/offline/inject";
import { markerAttributes, readMarker } from "@/lib/offline/marker";

// What a served saved copy carries (spec 4.7.1): right after the first <head>
// start tag, a <meta name="fxav-served"> that tells <SavedCopyBar> the serve mode
// and the save time, and a <style> block that paints a sticky body::before notice
// until the bar sets data-fxav-bar="mounted" on <html>. The notice is the P0 part:
// when the page's JavaScript fails, it is the only thing that marks the document
// as a saved copy.
//
// Expected values here are written from that rule. Where the module under test
// builds a string, the test reads the result back a second way: the HTML through
// the DOM parser, the CSS through the CSSOM (jsdom's), and the CSS string through
// an unescape written here.

const SAVED_AT = "2026-10-27T11:30:00.000Z";
const NOTICE = "Saved copy from 7:30 AM";
const MODES = ["offline", "slow", "server-error", "ended"] as const;

const options = (over: Partial<InjectOptions> = {}): InjectOptions => ({
  mode: "offline",
  savedAt: SAVED_AT,
  noticeText: NOTICE,
  ...over,
});

const SHOW_ID = "0f8b1a52-3c1d-4e07-9a43-6d2b7e5c8f10";
// A real save marker, written the way the server writes it (its assets list is
// empty so the attribute needs no HTML escaping).
const MARKER = `<template ${Object.entries(
  markerAttributes({
    disposition: "save",
    showId: SHOW_ID,
    renderedAt: SAVED_AT,
    epoch: 4,
    viewer: "crew:abc",
    assets: [],
  }),
)
  .map(([name, value]) => `${name}="${value}"`)
  .join(" ")}></template>`;

function page(headOpen = "<head>"): string {
  return (
    `<!DOCTYPE html><html lang="en">${headOpen}<meta charSet="utf-8"/><title>Show</title></head>` +
    `<body>${MARKER}<main><p>Hello</p></main></body></html>`
  );
}

const parse = (html: string): Document => new DOMParser().parseFromString(html, "text/html");
const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/**
 * What `output` inserted into `input` right after the literal `headOpen`, found by
 * string search on the known start tag (not by the module's own tokenizer). The
 * assertions make "inserted exactly there and nowhere else" a precondition of
 * returning anything.
 */
function insertedAfter(input: string, headOpen: string, output: string): string {
  const at = input.indexOf(headOpen);
  premiseHolds(`the input holds the literal start tag ${headOpen}`, at !== -1);
  const split = at + headOpen.length;
  const tail = input.slice(split);
  expect(output.startsWith(input.slice(0, split))).toBe(true);
  expect(output.endsWith(tail)).toBe(true);
  return output.slice(split, output.length - tail.length);
}

// --- CSS read-back ----------------------------------------------------------

const liveStyles: HTMLStyleElement[] = [];
afterEach(() => {
  for (const style of liveStyles.splice(0)) style.remove();
});

/** The one injected <style>, attached to the live document so jsdom builds its sheet. */
function sheetOf(output: string): CSSRuleList {
  const styles = parse(output).querySelectorAll("style");
  expect(styles).toHaveLength(1);
  const live = document.createElement("style");
  live.textContent = styles[0]?.textContent ?? null;
  document.head.append(live);
  liveStyles.push(live);
  const sheet = live.sheet;
  if (sheet === null) throw new Error("jsdom built no sheet for the injected style");
  return sheet.cssRules;
}

const BASE_SELECTOR = 'html:not([data-fxav-bar="mounted"]) body::before';
const DARK_MEDIA = "(prefers-color-scheme: dark)";
// Mirrors app/globals.css: the dark values apply under the OS preference unless the
// page forced light (inside the media block), and whenever the page forced dark (outside it).
const DARK_OS_SELECTOR =
  'html:not([data-theme="light"]):not([data-fxav-bar="mounted"]) body::before';
const DARK_THEME_SELECTOR = 'html[data-theme="dark"]:not([data-fxav-bar="mounted"]) body::before';

function styleRules(rules: CSSRuleList): CSSStyleRule[] {
  return Array.from(rules).filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
}

/** A top-level rule: one that applies without any enclosing condition. */
function topLevelRule(output: string, selector: string): CSSStyleRule {
  const found = styleRules(sheetOf(output)).filter((rule) => rule.selectorText === selector);
  expect(found).toHaveLength(1);
  return found[0] as CSSStyleRule;
}

/** The rules inside the one `@media (prefers-color-scheme: dark)` block, which must be top level. */
function darkRules(output: string): CSSStyleRule[] {
  const media = Array.from(sheetOf(output)).filter(
    (rule): rule is CSSMediaRule => rule instanceof CSSMediaRule,
  );
  expect(media.map((rule) => rule.media.mediaText)).toEqual([DARK_MEDIA]);
  return styleRules((media[0] as CSSMediaRule).cssRules);
}

/**
 * A CSS string token (quotes included) back to the text it spells, per CSS Syntax:
 * a backslash then 1 to 6 hex digits and one optional whitespace is a code point,
 * a backslash then a newline is nothing, and a backslash then anything else is
 * that character.
 */
function cssStringToText(token: string): string {
  expect(token.startsWith('"') && token.endsWith('"')).toBe(true);
  return token
    .slice(1, -1)
    .replace(
      /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|(\r\n|[\n\r\f])|([\s\S]))/g,
      (_match, hex?: string, newline?: string, other?: string) =>
        hex !== undefined
          ? String.fromCodePoint(parseInt(hex, 16))
          : newline !== undefined
            ? ""
            : (other ?? ""),
    );
}

const FALLBACK_VAR = /^var\((--color-[a-z-]+), (#[0-9a-f]{6})\)$/;

/** `var(--name, #hex)` as `{ name, hex }`; fails when the value has any other shape. */
function colorVar(value: string): { name: string; hex: string } {
  const match = FALLBACK_VAR.exec(value);
  if (match === null) throw new Error(`not a var() with a hex fallback: ${value}`);
  return { name: match[1] as string, hex: match[2] as string };
}

// --- Placement ----------------------------------------------------------------

describe("placement", () => {
  const HEAD_OPENS = ["<head>", '<head lang="en">', "<HEAD>", '<head data-note="a>b">', "<head\n>"];

  test.each(HEAD_OPENS)("inserts right after %j and changes nothing else", (headOpen) => {
    const input = page(headOpen);
    const out = injectSavedCopyHead(input, options());
    const inserted = insertedAfter(input, headOpen, out);
    expect(inserted).toMatch(/^<meta name="fxav-served" [^>]*><style>[^<]*<\/style>$/);
  });

  test.each(HEAD_OPENS)(
    "the meta is the first element child of head, then the style (%j)",
    (headOpen) => {
      const doc = parse(injectSavedCopyHead(page(headOpen), options({ mode: "slow" })));
      const [meta, style, ...rest] = Array.from(doc.head.children);
      expect(meta?.tagName).toBe("META");
      expect(meta?.getAttribute("name")).toBe("fxav-served");
      expect(style?.tagName).toBe("STYLE");
      // The page's own head elements follow, in order, untouched.
      expect(rest.map((element) => element.tagName)).toEqual(["META", "TITLE"]);
      expect(doc.title).toBe("Show");
    },
  );

  test("only the first head start tag is used", () => {
    const input = `<html><head><title>a</title></head><body><p>x</p></body></html><head></head>`;
    const out = injectSavedCopyHead(input, options());
    insertedAfter(input, "<head>", out);
    expect(out.match(/<meta name="fxav-served"/g)).toHaveLength(1);
  });

  test("a <head> inside a comment before the real one is not taken for it", () => {
    const real = '<head lang="en">';
    const input = `<!DOCTYPE html><html><!-- <head> --><!--<head>-->${real}<title>x</title></head><body></body></html>`;
    const out = injectSavedCopyHead(input, options());
    const inserted = insertedAfter(input, real, out);
    expect(inserted.startsWith('<meta name="fxav-served"')).toBe(true);
    expect(out.match(/<meta name="fxav-served"/g)).toHaveLength(1);
  });

  test("a <header> element is not a head start tag", () => {
    const input = "<header>site</header><p>body</p>";
    const out = injectSavedCopyHead(input, options());
    // No <head>, so both elements are prepended (see the next group), not put after <header.
    expect(out.startsWith('<meta name="fxav-served"')).toBe(true);
    expect(out.endsWith(input)).toBe(true);
  });

  test("the body, the title and the marker template are untouched", () => {
    const input = page();
    const out = injectSavedCopyHead(input, options());
    expect(out.includes(MARKER)).toBe(true);
    expect(parse(out).body.innerHTML).toBe(parse(input).body.innerHTML);

    const before = readMarker(input);
    premiseHolds("the input's marker reads as a valid save marker", before.kind === "valid");
    expect(readMarker(out)).toEqual(before);
  });

  test("a real production page is the input plus the inserted text, byte for byte", () => {
    const fixture = readFileSync(
      join(process.cwd(), "tests", "lib", "offline", "fixtures", "crew-page.html"),
      "utf8",
    );
    const headOpen = "<head>";
    premise("the production page holds a head start tag", fixture.indexOf(headOpen), -1);
    const out = injectSavedCopyHead(fixture, options());
    const inserted = insertedAfter(fixture, headOpen, out);
    expect(inserted.startsWith('<meta name="fxav-served"')).toBe(true);
    expect(inserted.endsWith("</style>")).toBe(true);
    expect(parse(out).head.firstElementChild?.getAttribute("name")).toBe("fxav-served");
  });
});

describe("a document with no head", () => {
  test.each([
    ["no head at all", "<p>hello</p>"],
    ["an empty document", ""],
    ["a header element only", "<header>site</header>"],
    ["a head start tag that never closes", '<head lang="en"'],
    ["a comment that never closes, holding a head", "<!-- <head>"],
  ])("prepends both elements: %s", (_label, input) => {
    const out = injectSavedCopyHead(input, options({ mode: "ended" }));
    expect(out.endsWith(input)).toBe(true);
    const inserted = out.slice(0, out.length - input.length);
    expect(inserted).toMatch(
      /^<meta name="fxav-served" content="ended" [^>]*><style>[^<]*<\/style>$/,
    );
  });

  test("the prepended elements are found by the parser and the notice still shows", () => {
    const out = injectSavedCopyHead("<p>hello</p>", options());
    const doc = parse(out);
    expect(doc.querySelectorAll('meta[name="fxav-served"]')).toHaveLength(1);
    expect(doc.querySelectorAll("style")).toHaveLength(1);
    expect(topLevelRule(out, BASE_SELECTOR).style.getPropertyValue("content")).not.toBe("");
  });
});

// --- The meta -----------------------------------------------------------------

describe("the meta", () => {
  test.each(MODES)("carries mode %s and the save time, and nothing else", (mode) => {
    const doc = parse(injectSavedCopyHead(page(), options({ mode })));
    const meta = doc.head.firstElementChild;
    expect(meta?.getAttributeNames().sort()).toEqual(["content", "data-saved-at", "name"]);
    expect(meta?.getAttribute("name")).toBe("fxav-served");
    expect(meta?.getAttribute("content")).toBe(mode);
    expect(meta?.getAttribute("data-saved-at")).toBe(SAVED_AT);
  });

  test("the save time follows the argument", () => {
    const savedAt = "2025-01-02T03:04:05.678Z";
    const doc = parse(injectSavedCopyHead(page(), options({ savedAt })));
    expect(doc.head.firstElementChild?.getAttribute("data-saved-at")).toBe(savedAt);
  });

  test("a save time with markup in it stays an attribute value", () => {
    // The trailing references decode to "<&" if the ampersand is written unescaped.
    const hostile = `2026"><script>window.x=1</script><meta a="&lt;&amp;`;
    const out = injectSavedCopyHead(page(), options({ savedAt: hostile }));
    const doc = parse(out);
    expect(doc.head.firstElementChild?.getAttribute("data-saved-at")).toBe(hostile);
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(doc.head.children).toHaveLength(4);
  });
});

describe("the mode allowlist", () => {
  test.each(MODES)("accepts %s", (mode) => {
    expect(() => injectSavedCopyHead(page(), options({ mode }))).not.toThrow();
  });

  test.each([
    "live",
    "",
    "OFFLINE",
    "Offline",
    " offline",
    "bogus",
    "constructor",
    "__proto__",
    "toString",
  ])("throws for %j and returns nothing", (mode) => {
    expect(() =>
      injectSavedCopyHead(page(), options({ mode: mode as InjectOptions["mode"] })),
    ).toThrow(/serve mode/i);
  });
});

// --- The notice -----------------------------------------------------------------

describe("the CSS notice", () => {
  test("is a top-level rule that shows while the bar has not mounted", () => {
    const out = injectSavedCopyHead(page(), options());
    const rule = topLevelRule(out, BASE_SELECTOR);
    expect(rule.style.getPropertyValue("position")).toBe("sticky");
    expect(["0", "0px"]).toContain(rule.style.getPropertyValue("top"));
    expect(rule.style.getPropertyValue("display")).toBe("block");
    expect(cssStringToText(rule.style.getPropertyValue("content"))).toBe(NOTICE);
    // Above the page's own sticky chrome: the semantic sticky-banner band.
    expect(rule.style.getPropertyValue("z-index")).toBe("var(--z-index-sticky-banner, 100)");
  });

  test("the style element is plain: no media, no type, no attributes of any kind", () => {
    const style = parse(injectSavedCopyHead(page(), options())).querySelector("style");
    expect(style?.getAttributeNames()).toEqual([]);
  });

  test("adds no element to the body", () => {
    const input = page();
    const out = injectSavedCopyHead(input, options());
    expect(parse(out).body.children.length).toBe(parse(input).body.children.length);
    expect(parse(out).body.outerHTML).toBe(parse(input).body.outerHTML);
  });

  test("the text follows the argument, with and without a time", () => {
    for (const noticeText of ["Saved copy from Fri Oct 24, 6:02 PM", "Saved copy"]) {
      const out = injectSavedCopyHead(page(), options({ noticeText }));
      const rule = topLevelRule(out, BASE_SELECTOR);
      expect(cssStringToText(rule.style.getPropertyValue("content"))).toBe(noticeText);
    }
  });

  test.each([
    ["a double quote", 'Saved copy from "7:30 AM"'],
    ["a backslash", "Saved copy from 7:30\\AM"],
    ["a backslash before a quote", 'a\\"b'],
    ["a trailing backslash", "Saved copy\\"],
    ["a newline", "Saved copy\nfrom 7:30 AM"],
    ["a newline before a hex digit", "line\nabc"],
    ["a carriage return", "Saved copy\r\nfrom"],
    ["a form feed", "Saved\fcopy"],
    ["an escaped-looking sequence", "Saved copy \\A done \\22 x"],
    ["a closing style tag and a script", 'x</style><script>window.x=1</script><style>"'],
    ["braces and a semicolon", "}; body { display: none } /* x */"],
    ["a non-ASCII time", "Copie enregistrée à 19 h \u{1F4F6}"],
  ])("escapes %s so the text survives intact", (_label, noticeText) => {
    const input = page();
    const out = injectSavedCopyHead(input, options({ noticeText }));

    // Read back through the CSS parser and an independent unescape.
    const rule = topLevelRule(out, BASE_SELECTOR);
    expect(cssStringToText(rule.style.getPropertyValue("content"))).toBe(noticeText);
    // The rule after the string still applies: a bad string would swallow it.
    expect(rule.style.getPropertyValue("position")).toBe("sticky");

    // And through the HTML parser: nothing in the text can end the style element.
    const doc = parse(out);
    expect(doc.querySelectorAll("style")).toHaveLength(1);
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(doc.body.outerHTML).toBe(parse(input).body.outerHTML);
    const inserted = insertedAfter(input, "<head>", out);
    expect(inserted.match(/<\/style/gi)).toHaveLength(1);
  });

  test("a quote and a backslash are written escaped", () => {
    const out = injectSavedCopyHead(page(), options({ noticeText: 'a"b\\c' }));
    expect(out).toContain('content: "a\\"b\\\\c"');
  });

  test.each(["", " ", "\n\t "])("a blank text %j falls back to the plain notice", (noticeText) => {
    const out = injectSavedCopyHead(page(), options({ noticeText }));
    const shown = cssStringToText(
      topLevelRule(out, BASE_SELECTOR).style.getPropertyValue("content"),
    );
    expect(shown).toBe("Saved copy");
  });

  test("grows the document by exactly the inserted text, counted in bytes", () => {
    for (const noticeText of [NOTICE, "Copie enregistrée à 19 h \u{1F4F6}"]) {
      const input = page();
      const out = injectSavedCopyHead(input, options({ noticeText }));
      const inserted = insertedAfter(input, "<head>", out);
      expect(byteLength(out)).toBe(byteLength(input) + byteLength(inserted));
    }
    // Non-ASCII text must make the byte count differ from the character count, or this proves nothing.
    const wide = injectSavedCopyHead(page(), options({ noticeText: "ééé" }));
    premise("a non-ASCII notice makes bytes outnumber characters", byteLength(wide), wide.length);
  });
});

describe("the notice colors", () => {
  // The light values are the runtime tokens at app/globals.css:366 (--color-bg-runtime) and :370
  // (--color-text-runtime) plus the border token, and the dark values are their dark counterparts.
  // The injected CSS reads the page's custom properties first and keeps the hex as the fallback for
  // a page whose stylesheet is missing. Task 9 pins these hex values to app/globals.css.
  const globals = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  test("the light values read the page's tokens with a hex fallback", () => {
    const out = injectSavedCopyHead(page(), options());
    const rule = topLevelRule(out, BASE_SELECTOR);
    expect(colorVar(rule.style.getPropertyValue("background"))).toEqual({
      name: "--color-bg",
      hex: "#fafaf9",
    });
    expect(colorVar(rule.style.getPropertyValue("color"))).toEqual({
      name: "--color-text",
      hex: "#1a1b1f",
    });
    expect(rule.style.getPropertyValue("border-bottom")).toContain("var(--color-border, #e5e4e0)");
  });

  function expectDarkValues(rule: CSSStyleRule | undefined): void {
    expect(rule).toBeDefined();
    expect(colorVar(rule?.style.getPropertyValue("background") ?? "")).toEqual({
      name: "--color-bg",
      hex: "#0f1014",
    });
    expect(colorVar(rule?.style.getPropertyValue("color") ?? "")).toEqual({
      name: "--color-text",
      hex: "#e8e6e0",
    });
    expect(rule?.style.getPropertyValue("border-bottom")).toContain("var(--color-border, #2a2b30)");
  }

  test("the dark values apply under the OS preference, inside the dark media block", () => {
    const out = injectSavedCopyHead(page(), options());
    expectDarkValues(darkRules(out).find((rule) => rule.selectorText === DARK_OS_SELECTOR));
  });

  test("the dark values apply when the page forced the dark theme, outside the media block", () => {
    const out = injectSavedCopyHead(page(), options());
    expectDarkValues(topLevelRule(out, DARK_THEME_SELECTOR));
  });

  test("every custom property named is a theme token that globals.css declares", () => {
    const out = injectSavedCopyHead(page(), options());
    const names = new Set(
      [...out.matchAll(/var\((--[a-z-]+)/g)].map((match) => match[1] as string),
    );
    premise("the notice reads at least the color tokens and the z-index band", names.size, 3);
    for (const name of names) {
      const declared = new RegExp(`^\\s*${name}:`, "m");
      expect(globals, `${name} is declared in app/globals.css`).toMatch(declared);
    }
  });

  test("the light and dark fallbacks differ, so a swapped pair cannot pass", () => {
    const out = injectSavedCopyHead(page(), options());
    const light = colorVar(
      topLevelRule(out, BASE_SELECTOR).style.getPropertyValue("background"),
    ).hex;
    const dark = colorVar(darkRules(out)[0]?.style.getPropertyValue("background") ?? "").hex;
    expect(light).not.toBe(dark);
  });
});
