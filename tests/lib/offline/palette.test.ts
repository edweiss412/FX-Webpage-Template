// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { injectSavedCopyHead } from "@/lib/offline/inject";
import { notSavedPageHtml } from "@/lib/offline/notSavedPage";

// The two things the service worker paints without the app's stylesheet are the
// "not saved yet" page and the saved-copy notice's fallback colors. Both carry
// hex values copied from the runtime color tokens in app/globals.css, because the
// stylesheet may be missing exactly when they show. A copy drifts silently when the
// palette changes, and a drifted page is still a working page: it is merely
// off-palette. This file ties each copied hex to the token it came from, in the
// three places globals.css defines a scheme (light :root, the OS dark media block,
// and [data-theme="dark"]), so a palette change fails here instead.
//
// Nothing below names a hex value. Each side is read from its own CSS and compared
// to the other, so changing the palette in globals.css alone fails, and so does
// changing a copy alone.

const GLOBALS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const DARK_QUERY = "(prefers-color-scheme: dark)";
/** A token only the scheme blocks declare; it finds the blocks without naming a selector twice. */
const SCHEME_PROBE = "--color-bg-runtime";

const attached: HTMLStyleElement[] = [];
afterEach(() => {
  for (const style of attached.splice(0)) style.remove();
});

/** Builds a live sheet from `css`; jsdom only creates one for a connected style element. */
function rulesOf(css: string): CSSRule[] {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  attached.push(style);
  if (style.sheet === null) throw new Error("jsdom built no sheet");
  return Array.from(style.sheet.cssRules);
}

const isStyleRule = (rule: CSSRule): rule is CSSStyleRule => rule instanceof CSSStyleRule;
const isMediaRule = (rule: CSSRule): rule is CSSMediaRule => rule instanceof CSSMediaRule;

function theOne<T>(found: readonly T[], what: string): T {
  premiseHolds(`${what}: expected exactly one, found ${found.length}`, found.length === 1);
  return found[0] as T;
}

/** The inner style rules of the page's one dark media block, plus the top-level style rules. */
function splitByDarkMedia(rules: CSSRule[]): { top: CSSStyleRule[]; dark: CSSStyleRule[] } {
  const media = theOne(
    rules.filter(isMediaRule).filter((rule) => rule.media.mediaText === DARK_QUERY),
    `the ${DARK_QUERY} media block`,
  );
  return { top: rules.filter(isStyleRule), dark: Array.from(media.cssRules).filter(isStyleRule) };
}

/** `#rrggbb` or jsdom's normalized `rgb(r, g, b)` as "r,g,b", so the two spellings compare. */
function channels(color: string): string {
  const text = color.trim();
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (hex !== null) return [hex[1], hex[2], hex[3]].map((h) => parseInt(h as string, 16)).join(",");
  const rgb = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(text);
  if (rgb !== null) return [rgb[1], rgb[2], rgb[3]].join(",");
  throw new Error(`not a #rrggbb or rgb() color: ${color}`);
}

// --- app/globals.css -------------------------------------------------------------

type Scheme = "light" | "darkOs" | "darkTheme";
const SCHEMES: readonly Scheme[] = ["light", "darkOs", "darkTheme"];

/** The runtime color tokens each scheme block declares, by custom property name. */
function globalsSchemes(): Record<Scheme, ReadonlyMap<string, string>> {
  // jsdom cannot resolve `@import "tailwindcss"` and reports it on stderr. The rule declares
  // no tokens, so dropping it changes nothing this file reads.
  const rules = rulesOf(GLOBALS.replace(/^@import\s[^;]*;/gm, ""));
  const declaresTokens = (rule: CSSStyleRule): boolean =>
    rule.style.getPropertyValue(SCHEME_PROBE) !== "";
  const tokens = (rule: CSSStyleRule): ReadonlyMap<string, string> => {
    const out = new Map<string, string>();
    for (let i = 0; i < rule.style.length; i++) {
      const name = rule.style.item(i);
      if (/^--color-[a-z0-9-]+-runtime$/.test(name)) {
        out.set(name, rule.style.getPropertyValue(name).trim());
      }
    }
    return out;
  };
  const inDarkMedia = rules
    .filter(isMediaRule)
    .filter((rule) => rule.media.mediaText === DARK_QUERY)
    .flatMap((rule) => Array.from(rule.cssRules).filter(isStyleRule));
  const pick = (list: CSSStyleRule[], selector: string): ReadonlyMap<string, string> =>
    tokens(
      theOne(
        list.filter((rule) => rule.selectorText === selector).filter(declaresTokens),
        `the ${selector} block that declares the color tokens`,
      ),
    );
  return {
    light: pick(rules.filter(isStyleRule), ":root"),
    darkOs: pick(inDarkMedia, ':root:not([data-theme="light"])'),
    darkTheme: pick(rules.filter(isStyleRule), '[data-theme="dark"]'),
  };
}

let schemesCache: Record<Scheme, ReadonlyMap<string, string>> | undefined;
function schemes(): Record<Scheme, ReadonlyMap<string, string>> {
  schemesCache ??= globalsSchemes();
  return schemesCache;
}

function tokenValue(scheme: Scheme, token: string): string {
  const value = schemes()[scheme].get(token);
  premiseHolds(
    `${token} is declared in the ${scheme} block of app/globals.css`,
    value !== undefined,
  );
  return value as string;
}

describe("app/globals.css", () => {
  test("each scheme block declares the color tokens, and the schemes differ", () => {
    for (const scheme of SCHEMES) {
      premise(`the ${scheme} block declares color tokens`, schemes()[scheme].size, 10);
    }
    expect(tokenValue("light", SCHEME_PROBE)).not.toBe(tokenValue("darkOs", SCHEME_PROBE));
  });
});

// --- The not-saved page ------------------------------------------------------------

/** Each color the page paints, where the page paints it, and the token it must equal. */
const PAGE_COLORS = [
  {
    role: "background",
    selector: "body",
    property: "background-color",
    token: "--color-bg-runtime",
  },
  { role: "text", selector: "body", property: "color", token: "--color-text-runtime" },
  {
    role: "subtle text",
    selector: "small",
    property: "color",
    token: "--color-text-subtle-runtime",
  },
] as const;

function pageRules(): { light: CSSStyleRule[]; dark: CSSStyleRule[] } {
  const page = new DOMParser().parseFromString(notSavedPageHtml(), "text/html");
  const style = theOne([...page.querySelectorAll("style")], "the page's style element");
  const { top, dark } = splitByDarkMedia(rulesOf(style.textContent ?? ""));
  return { light: top, dark };
}

function declared(rules: CSSStyleRule[], selector: string, property: string): string {
  const found = rules.filter((rule) => rule.selectorText === selector);
  const rule = theOne(
    found.filter((candidate) => candidate.style.getPropertyValue(property) !== ""),
    `the ${selector} rule declaring ${property}`,
  );
  return rule.style.getPropertyValue(property);
}

describe("the not-saved page", () => {
  describe.each(PAGE_COLORS)("$role", ({ selector, property, token }) => {
    test("in the light scheme it is the light runtime token", () => {
      const page = declared(pageRules().light, selector, property);
      expect(channels(page)).toBe(channels(tokenValue("light", token)));
    });

    test("under the OS dark preference it is the dark runtime token", () => {
      premiseHolds(
        `${token} differs between light and dark, so a swapped pair shows`,
        channels(tokenValue("light", token)) !== channels(tokenValue("darkOs", token)),
      );
      const page = declared(pageRules().dark, selector, property);
      expect(channels(page)).toBe(channels(tokenValue("darkOs", token)));
      expect(channels(page)).toBe(channels(tokenValue("darkTheme", token)));
    });
  });
});

// --- The saved-copy notice's fallbacks ---------------------------------------------

/** What the notice's CSS carries for each scheme, as the rules a browser would apply. */
function noticeRules(): Record<Scheme, CSSStyleRule> {
  const html = injectSavedCopyHead("<!doctype html><html><head></head><body></body></html>", {
    mode: "offline",
    savedAt: "2026-10-27T11:30:00.000Z",
    noticeText: "Saved copy",
  });
  const page = new DOMParser().parseFromString(html, "text/html");
  const style = theOne([...page.querySelectorAll("style")], "the notice's style element");
  const { top, dark } = splitByDarkMedia(rulesOf(style.textContent ?? ""));
  const forcedDark = (rule: CSSStyleRule): boolean =>
    rule.selectorText.includes('[data-theme="dark"]');
  return {
    light: theOne(
      top.filter((rule) => !forcedDark(rule)),
      "the notice's light rule",
    ),
    darkOs: theOne(dark, "the notice's rule inside the dark media block"),
    darkTheme: theOne(top.filter(forcedDark), "the notice's forced-dark rule"),
  };
}

/** Every `var(--name, #hex)` a rule carries, as written. */
function fallbacksIn(rule: CSSStyleRule): { name: string; hex: string }[] {
  return [...rule.cssText.matchAll(/var\((--[a-z0-9-]+),\s*(#[0-9a-f]{6})\)/gi)].map((match) => ({
    name: match[1] as string,
    hex: match[2] as string,
  }));
}

/** The runtime token a theme token resolves to, from `--color-bg: var(--color-bg-runtime);`. */
function runtimeTokenOf(name: string): string {
  const declaration = new RegExp(`^\\s*${name}:\\s*var\\((--[a-z0-9-]+)\\)\\s*;`, "gm");
  const found = [...GLOBALS.matchAll(declaration)];
  premiseHolds(
    `app/globals.css declares ${name} exactly once, as var(--...): found ${found.length}`,
    found.length === 1,
  );
  return (found[0] as RegExpMatchArray)[1] as string;
}

describe("the saved-copy notice", () => {
  test.each(SCHEMES)("the %s fallbacks are the runtime tokens' values", (scheme) => {
    const fallbacks = fallbacksIn(noticeRules()[scheme]);
    premise(`the ${scheme} notice rule names its color fallbacks`, fallbacks.length, 2);
    for (const { name, hex } of fallbacks) {
      const token = runtimeTokenOf(name);
      expect(channels(hex), `${name} fallback ${hex} against ${token}`).toBe(
        channels(tokenValue(scheme, token)),
      );
    }
  });

  test("the light and dark fallbacks differ, so a swapped pair shows", () => {
    const light = fallbacksIn(noticeRules().light).map(({ hex }) => channels(hex));
    const dark = fallbacksIn(noticeRules().darkOs).map(({ hex }) => channels(hex));
    expect(dark).toHaveLength(light.length);
    light.forEach((value, i) => expect(value).not.toBe(dark[i]));
  });
});
