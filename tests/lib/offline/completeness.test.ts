import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { fontUrlsFromCss, requiredStaticUrls } from "@/lib/offline/completeness";

// What a saved copy needs before it may commit (spec 4.6 "Completeness"): the
// same-origin /_next/static/** and /fonts/** URLs named by the saved HTML's
// src, href and srcset attributes, and the /fonts/** URLs named by url(...) in
// those CSS files, one level deep (plan section 0, Q1). Every expected value is
// written from that rule, or computed by a second method (a plain pattern over
// the fixture's text), never read back from the module under test.
//
// FIXTURE: tests/lib/offline/fixtures/crew-page.html is a real production
// response, captured once from commit 2fc6f9359 as follows (nothing in it is
// edited after capture):
//   1. Build:   pnpm heavy pnpm build
//        with TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
//        so nothing reaches the validation project.
//   2. Serve:   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//                 pnpm exec next start -H 127.0.0.1 -p 3417
//        started OUTSIDE the heavy wrapper (a long-lived server holds no slot), on a free
//        port other than 3000.
//   3. Seed the LOOPBACK database only: one published show (slug `offline-fixture`, title
//        `Offline Fixture Show`), its share token 0123456789abcdef repeated four times, and
//        one crew member named `Fixture Viewer`. The seed was deleted after the capture.
//   4. Fetch:   curl -H "Cookie: __Host-fxav_picker=<value>" \
//                 http://127.0.0.1:3417/show/offline-fixture/<share token> -o crew-page.html
//        where <value> is buildPickerCookieValue([{ showId, crewMemberId, epoch: 1 }]) from
//        tests/e2e/helpers/seedPickerCookie.ts, signed with the .env.local
//        PICKER_COOKIE_SIGNING_KEY. The cookie makes the server render the crew page for that
//        viewer instead of the picker.
// To refresh it, repeat the four steps; the premises below say what a usable capture holds.

const ORIGIN = "https://app.example";
const ROOT = process.cwd();

const FIXTURE = readFileSync(
  join(ROOT, "tests", "lib", "offline", "fixtures", "crew-page.html"),
  "utf8",
);

/** The href the root layout's preload link renders (components/FontPreload.tsx). */
const FONT_HREF = (() => {
  const source = readFileSync(join(ROOT, "components", "FontPreload.tsx"), "utf8");
  const match = /href="(\/fonts\/[^"]+)"/.exec(source);
  if (match === null) throw new Error("components/FontPreload.tsx no longer names a /fonts/ href");
  return match[1] as string;
})();

/** Every match of `pattern`'s first group, in document order, with repeats. */
function allMatches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[1] as string);
}

describe("requiredStaticUrls against the production crew page", () => {
  // The oracle is a plain pattern over the raw text, a different method from the
  // module's: any src or href attribute holding a root-relative static URL.
  const ORACLE = /\b(?:src|href)="(\/(?:_next\/static|fonts)\/[^"]+)"/g;
  const scripts = allMatches(FIXTURE, /<script\b[^>]*\bsrc="(\/_next\/static\/[^"]+)"/g);
  const stylesheets = allMatches(
    FIXTURE,
    /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="(\/_next\/static\/[^"]+)"/g,
  );
  const fontPreloads = allMatches(
    FIXTURE,
    /<link\b[^>]*\brel="preload"[^>]*\bas="font"[^>]*\bhref="(\/fonts\/[^"]+)"/g,
  );
  const oracle = allMatches(FIXTURE, ORACLE);

  test("the fixture is usable: it holds a script, a stylesheet and the font preload link", () => {
    premise("the fixture holds a /_next/static/ script", scripts.length, 0);
    premise("the fixture holds a /_next/static/ stylesheet", stylesheets.length, 0);
    premiseHolds(
      "the fixture holds the font preload link components/FontPreload.tsx renders",
      fontPreloads.includes(FONT_HREF),
    );
  });

  test("returns every script, stylesheet and the font preload, as root-relative paths", () => {
    const result = requiredStaticUrls(FIXTURE, ORIGIN);
    for (const url of [...scripts, ...stylesheets, FONT_HREF]) expect(result).toContain(url);
  });

  test("returns exactly the static URLs the pattern oracle finds, each once, in document order", () => {
    premise(
      "the fixture names at least one static URL twice (a preload link and its script), so de-duplication is exercised",
      oracle.length,
      new Set(oracle).size,
    );
    expect(requiredStaticUrls(FIXTURE, ORIGIN)).toEqual([...new Set(oracle)]);
  });

  test("leaves out every URL that is not a static file: the icon, and nothing outside the two prefixes", () => {
    const icons = allMatches(FIXTURE, /<link\b[^>]*\brel="icon"[^>]*\bhref="([^"]+)"/g);
    premise("the fixture links an icon that is not under the static prefixes", icons.length, 0);
    const result = requiredStaticUrls(FIXTURE, ORIGIN);
    for (const icon of icons) expect(result).not.toContain(icon);
    for (const url of result) {
      expect(/^\/(?:_next\/static|fonts)\/./.test(url)).toBe(true);
    }
  });
});

describe("requiredStaticUrls attribute rules", () => {
  const found = (html: string, origin = ORIGIN) => requiredStaticUrls(html, origin);

  test("reads src, href and srcset on any element, in document order", () => {
    expect(
      found(
        [
          `<link rel="stylesheet" href="/_next/static/css/a.css">`,
          `<script src="/_next/static/chunks/b.js" async></script>`,
          `<img src="/_next/static/media/c.png">`,
          `<source srcset="/_next/static/media/d.avif">`,
          `<link rel="preload" as="font" href="/fonts/e.woff2">`,
        ].join(""),
      ),
    ).toEqual([
      "/_next/static/css/a.css",
      "/_next/static/chunks/b.js",
      "/_next/static/media/c.png",
      "/_next/static/media/d.avif",
      "/fonts/e.woff2",
    ]);
  });

  test("reads quoted, single-quoted, unquoted and upper-case attributes alike", () => {
    expect(
      found(
        [
          `<script src='/_next/static/chunks/single.js'></script>`,
          `<script src=/_next/static/chunks/bare.js></script>`,
          `<SCRIPT SRC="/_next/static/chunks/upper.js"></SCRIPT>`,
        ].join(""),
      ),
    ).toEqual([
      "/_next/static/chunks/single.js",
      "/_next/static/chunks/bare.js",
      "/_next/static/chunks/upper.js",
    ]);
  });

  test("de-duplicates across elements and attributes, keeping the first position", () => {
    expect(
      found(
        `<link rel="preload" href="/_next/static/chunks/a.js"><script src="/_next/static/chunks/b.js"></script>` +
          `<script src="/_next/static/chunks/a.js"></script><img srcset="/_next/static/chunks/b.js 1x">`,
      ),
    ).toEqual(["/_next/static/chunks/a.js", "/_next/static/chunks/b.js"]);
  });

  test("reads a value padded with whitespace, as a browser does", () => {
    expect(found(`<script src="  /_next/static/chunks/a.js\n"></script>`)).toEqual([
      "/_next/static/chunks/a.js",
    ]);
    expect(found(`<img srcset="\n  /_next/static/media/b.png 1x\n">`)).toEqual([
      "/_next/static/media/b.png",
    ]);
  });

  test("keeps the query (a deployment id is part of the cache key), drops the fragment, decodes entities", () => {
    expect(
      found(
        `<script src="/_next/static/chunks/a.js?dpl=abc&amp;v=2#frag"></script>` +
          `<script src="/_next/static/chunks/a.js?dpl=abc&v=2"></script>`,
      ),
    ).toEqual(["/_next/static/chunks/a.js?dpl=abc&v=2"]);
  });

  test.each([
    {
      name: "a space-separated list with descriptors",
      srcset:
        "/_next/static/media/a.png 1x, /_next/static/media/b.png 2x, /_next/static/media/c.png 3x",
      expected: [
        "/_next/static/media/a.png",
        "/_next/static/media/b.png",
        "/_next/static/media/c.png",
      ],
    },
    {
      name: "commas with no space after them",
      srcset: "/_next/static/media/a.png 480w,/_next/static/media/b.png 800w",
      expected: ["/_next/static/media/a.png", "/_next/static/media/b.png"],
    },
    {
      name: "candidates with no descriptor and a trailing comma",
      srcset: "/_next/static/media/a.png, /_next/static/media/b.png,",
      expected: ["/_next/static/media/a.png", "/_next/static/media/b.png"],
    },
    {
      name: "candidates outside the static prefixes among static ones",
      srcset:
        "/_next/image?url=%2Fx.png&w=640 1x, /_next/static/media/b.png 2x, /api/asset/diagram/z 3x",
      expected: ["/_next/static/media/b.png"],
    },
  ])("srcset: $name", ({ srcset, expected }) => {
    expect(found(`<img srcset="${srcset}">`)).toEqual(expected);
  });

  test("ignores other attributes that merely hold a static URL", () => {
    const html =
      `<div data-src="/_next/static/chunks/data.js" data-href="/fonts/data.woff2" content="/fonts/meta.woff2"></div>` +
      `<link rel="preload" as="image" imagesrcset="/_next/static/media/img.png 1x">` +
      `<script src="/_next/static/chunks/real.js"></script>`;
    expect(found(html)).toEqual(["/_next/static/chunks/real.js"]);
  });

  test("ignores text inside comments, scripts and styles, and finds the same tags outside them", () => {
    const tag = `<script src="/_next/static/chunks/hidden.js"></script>`;
    const hidden = [
      `<!-- ${tag} -->`,
      `<script>document.write('${tag}')</script>`,
      `<style>/* ${tag} */</style>`,
    ].join("");
    expect(found(hidden)).toEqual([]);
    expect(found(hidden + tag)).toEqual(["/_next/static/chunks/hidden.js"]);
  });

  test("a tag that never closes ends the scan without throwing; what came before still counts", () => {
    expect(found(`<link href="/fonts/a.woff2"><script src="/_next/static/chunks/b.js`)).toEqual([
      "/fonts/a.woff2",
    ]);
  });

  test("an empty document, and a document with no references, name nothing", () => {
    expect(found("")).toEqual([]);
    expect(found(`<html><body><p>No assets</p></body></html>`)).toEqual([]);
  });
});

describe("requiredStaticUrls scope: same origin and the two prefixes", () => {
  // Each decoy is paired with a real URL, so an implementation that returns
  // nothing at all fails the pairing instead of passing the decoy half.
  const REAL = "/_next/static/chunks/real.js";
  const withReal = (decoyAttributes: string) =>
    requiredStaticUrls(
      `<script ${decoyAttributes}></script><script src="${REAL}"></script>`,
      ORIGIN,
    );

  test.each([
    ["another host", `src="https://cdn.example.net/_next/static/chunks/x.js"`],
    ["another port", `src="https://app.example:8443/_next/static/chunks/x.js"`],
    ["another scheme", `src="http://app.example/_next/static/chunks/x.js"`],
    ["a protocol-relative URL on another host", `src="//cdn.example.net/fonts/x.woff2"`],
    [
      "the image optimizer, which is not a static file",
      `src="/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fx.png&w=64&q=75"`,
    ],
    ["the favicon", `src="/favicon.ico?favicon.abc.ico"`],
    ["an asset route", `src="/api/asset/diagram/x"`],
    ["the prefix itself, with no file", `src="/_next/static/"`],
    ["the prefix with no trailing slash", `src="/_next/static"`],
    ["a sibling folder that merely starts with the prefix", `src="/_next/staticfoo/x.js"`],
    ["the fonts folder with no file", `src="/fonts/"`],
    ["a sibling of the fonts folder", `src="/fontsx/a.woff2"`],
    ["a traversal out of the static folder", `src="/_next/static/../../api/secret"`],
    ["an encoded traversal out of the fonts folder", `src="/fonts/%2e%2e/secret.woff2"`],
    ["a backslash traversal out of the static folder", `src="/_next/static\\..\\..\\api\\secret"`],
    [
      "a document-relative path, which cannot be resolved without the page URL",
      `src="_next/static/chunks/x.js"`,
    ],
    ["a dot-relative path", `src="./fonts/x.woff2"`],
    ["a data URI", `src="data:text/javascript,/_next/static/x.js"`],
    ["a javascript URL", `src="javascript:void('/_next/static/x.js')"`],
    ["a blob URL", `src="blob:https://app.example/_next/static/x"`],
    ["an empty value", `src=""`],
  ])("excludes %s", (_name, attributes) => {
    expect(withReal(attributes)).toEqual([REAL]);
  });

  test.each([
    [
      "an absolute URL on the same origin, as a root-relative path",
      `https://app.example/_next/static/chunks/a.js`,
      "/_next/static/chunks/a.js",
    ],
    ["a protocol-relative URL on the same host", `//app.example/fonts/a.woff2`, "/fonts/a.woff2"],
    [
      "a traversal that stays inside the folder, normalised",
      `/_next/static/chunks/../media/a.woff2`,
      "/_next/static/media/a.woff2",
    ],
    [
      "a name with encoded characters, kept encoded",
      `/_next/static/chunks/a%20b.js`,
      "/_next/static/chunks/a%20b.js",
    ],
  ])("includes %s", (_name, value, expected) => {
    expect(requiredStaticUrls(`<script src="${value}"></script>`, ORIGIN)).toEqual([expected]);
  });

  test("the origin may carry a trailing slash or a path; only its origin counts", () => {
    const html = `<script src="https://app.example/_next/static/chunks/a.js"></script>`;
    expect(requiredStaticUrls(html, "https://app.example/")).toEqual(["/_next/static/chunks/a.js"]);
    expect(requiredStaticUrls(html, "https://app.example/show/x?y=1")).toEqual([
      "/_next/static/chunks/a.js",
    ]);
    expect(requiredStaticUrls(html, "https://other.example")).toEqual([]);
  });

  test("an origin that is not a URL is a caller error, not an empty result", () => {
    const html = `<script src="/_next/static/chunks/a.js"></script>`;
    expect(requiredStaticUrls(html, ORIGIN)).toEqual(["/_next/static/chunks/a.js"]);
    expect(() => requiredStaticUrls(html, "")).toThrow(TypeError);
    expect(() => requiredStaticUrls(html, "not a url")).toThrow(TypeError);
    // A URL with no origin to compare against (opaque), which would match nothing.
    expect(() => requiredStaticUrls(html, "about:blank")).toThrow(TypeError);
  });
});

describe("fontUrlsFromCss", () => {
  const INTER = "/fonts/InterVariable-latin.d5549562.woff2";

  /** The rule at app/fonts.css:28, as written in the source the build compiles into a CSS chunk. */
  const SOURCE_RULE = `@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("${INTER}") format("woff2");
}`;

  /** The same rule as the production build emitted it into its CSS chunk: minified, the url unquoted and flush against format(). */
  const BUILT_RULE = `@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(${INTER})format("woff2")}`;

  test("the source rule names the Inter woff2 file", () => {
    expect(fontUrlsFromCss(SOURCE_RULE, ORIGIN)).toEqual([INTER]);
  });

  test("the rule as the build emits it (minified, unquoted) names the same file", () => {
    expect(fontUrlsFromCss(BUILT_RULE, ORIGIN)).toEqual([INTER]);
  });

  test("app/fonts.css itself names exactly the file the root layout preloads", () => {
    // Two files declare one font (the CSS rule and the preload link). Completeness
    // must see the same file through either, or a copy would require a font the page
    // never asks for, or miss the one it does.
    const css = readFileSync(join(ROOT, "app", "fonts.css"), "utf8");
    expect(fontUrlsFromCss(css, ORIGIN)).toEqual([FONT_HREF]);
  });

  test("a minified unquoted url to /fonts/x.woff2", () => {
    expect(fontUrlsFromCss(`@font-face{src:url(/fonts/x.woff2)format("woff2")}`, ORIGIN)).toEqual([
      "/fonts/x.woff2",
    ]);
  });

  test.each([
    ["double quotes", `url("/fonts/a.woff2")`],
    ["single quotes", `url('/fonts/a.woff2')`],
    ["no quotes", `url(/fonts/a.woff2)`],
    ["space inside the parentheses", `url( "/fonts/a.woff2" )`],
    ["a newline inside the parentheses", `url(\n  /fonts/a.woff2\n)`],
    ["an upper-case function name", `URL(/fonts/a.woff2)`],
  ])("reads %s", (_name, value) => {
    expect(fontUrlsFromCss(`@font-face{src:${value} format("woff2")}`, ORIGIN)).toEqual([
      "/fonts/a.woff2",
    ]);
  });

  test("reads a quoted value padded with whitespace", () => {
    expect(fontUrlsFromCss(`@font-face{src:url(" /fonts/a.woff2 ")}`, ORIGIN)).toEqual([
      "/fonts/a.woff2",
    ]);
  });

  test("returns every font in a multi-source declaration and a stylesheet, once each, in order", () => {
    const css =
      `@font-face{src:url(/fonts/a.woff2)format("woff2"),url(/fonts/a.woff)format("woff")}` +
      `@font-face{src:url("/fonts/b.woff2")}` +
      `@font-face{src:url(/fonts/a.woff2)}`;
    expect(fontUrlsFromCss(css, ORIGIN)).toEqual([
      "/fonts/a.woff2",
      "/fonts/a.woff",
      "/fonts/b.woff2",
    ]);
  });

  test("keeps a query, and takes an absolute URL on the same origin as a path", () => {
    expect(
      fontUrlsFromCss(
        `@font-face{src:url(/fonts/a.woff2?v=3)}@font-face{src:url(https://app.example/fonts/z.woff2)}`,
        ORIGIN,
      ),
    ).toEqual(["/fonts/a.woff2?v=3", "/fonts/z.woff2"]);
  });

  // Each decoy is a whole stylesheet fragment. It must yield nothing alone, and
  // must neither hide nor add anything when it sits before or after a real font,
  // so a "return nothing" implementation fails the pairing and an "accept
  // anything" one fails the decoy.
  test.each([
    ["a base64 data URI", `@font-face{src:url(data:font/woff2;base64,d09GMgABAAAAAA==)}`],
    [
      "a quoted data URI that holds parentheses and single quotes",
      `a{background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0h(1)'/></svg>")}`,
    ],
    ["a relative url pointing at ../media/x.woff2", `@font-face{src:url(../media/x.woff2)}`],
    [
      "a relative url that would reach /fonts/ if it were resolved against the site root",
      `@font-face{src:url(../fonts/x.woff2)}`,
    ],
    ["a bare relative url", `@font-face{src:url(fonts/x.woff2)}`],
    ["a /_next/static/media/ URL", `@font-face{src:url(/_next/static/media/x.woff2)}`],
    ["a font on another origin", `@font-face{src:url(https://cdn.example.net/fonts/x.woff2)}`],
    ["a sibling of the fonts folder", `@font-face{src:url(/fontsx/x.woff2)}`],
    ["the fonts folder with no file", `@font-face{src:url(/fonts/)}`],
    ["a traversal out of the fonts folder", `@font-face{src:url(/fonts/../secret.woff2)}`],
    ["a font named only in a comment", `/* @font-face{src:url(/fonts/old.woff2)} */`],
    ["a local() source", `@font-face{src:local("Arial")}`],
    [
      "an @import with a string (the CSS an imported file holds is never followed)",
      `@import "/fonts/other.css";`,
    ],
    ["an @import of a static chunk", `@import url(/_next/static/chunks/other.css);`],
  ])("excludes %s", (_name, decoy) => {
    expect(fontUrlsFromCss(decoy, ORIGIN)).toEqual([]);
    expect(fontUrlsFromCss(`${decoy}\n${SOURCE_RULE}`, ORIGIN)).toEqual([INTER]);
    expect(fontUrlsFromCss(`${SOURCE_RULE}\n${decoy}`, ORIGIN)).toEqual([INTER]);
  });

  test("an empty stylesheet, and one with no urls, name nothing", () => {
    expect(fontUrlsFromCss("", ORIGIN)).toEqual([]);
    expect(fontUrlsFromCss("body{color:red;background:#fff}", ORIGIN)).toEqual([]);
  });

  test("an unterminated url( ends the scan without throwing; what came before still counts", () => {
    expect(fontUrlsFromCss(`a{src:url(/fonts/a.woff2)}b{src:url(/fonts/b.woff2`, ORIGIN)).toEqual([
      "/fonts/a.woff2",
    ]);
  });

  test("an origin that is not a URL is a caller error, not an empty result", () => {
    expect(fontUrlsFromCss(SOURCE_RULE, ORIGIN)).toEqual([INTER]);
    expect(() => fontUrlsFromCss(SOURCE_RULE, "")).toThrow(TypeError);
    expect(() => fontUrlsFromCss(SOURCE_RULE, "about:blank")).toThrow(TypeError);
  });
});
