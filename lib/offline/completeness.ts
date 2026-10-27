/**
 * What a saved copy needs before it may commit (spec 4.6 "Completeness"): every
 * same-origin `/_next/static/**` and `/fonts/**` file the saved HTML names, and
 * every `/fonts/**` file a CSS file among them names through `url(...)`, one
 * level deep (plan section 0, Q1: the CSS clause keeps the typeface even when no
 * preload link is rendered).
 *
 * The worker applies `requiredStaticUrls` to the HTML, `fontUrlsFromCss` to each
 * CSS file among the result, and never to CSS those files import. A required
 * file it cannot fetch abandons the save.
 *
 * Both functions answer in root-relative form (`pathname` plus `search`), the
 * form `StoredCopy.assets` and the static index already use, so one origin's
 * URLs compare equal wherever they were read from. The query stays because a
 * deployment id there is part of what the browser requests.
 *
 * Only a reference that can be resolved from what these functions are given is
 * followed: a root-relative path, a protocol-relative URL or an absolute URL. A
 * document-relative path (`_next/static/x.js`, `../fonts/x.woff2`) depends on
 * the URL of the page or stylesheet that holds it, which is not an input here,
 * so it names nothing; resolving it against the site root would invent a URL
 * the browser never requests. Next writes root-relative paths.
 *
 * Pure and dependency-free apart from the marker module's tokenizer: the worker
 * bundle imports this file, and Vitest imports the same source.
 */

import { startTags } from "./marker";

const STATIC_PREFIXES: readonly string[] = ["/_next/static/", "/fonts/"];
const FONT_PREFIXES: readonly string[] = ["/fonts/"];

/** A scheme (`https:`, `data:`), as opposed to a path. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolves a reference to the root-relative path of a file under one of
 * `prefixes` on `origin`, or null for anything else. A directory is not a file,
 * so a path ending in a slash is null. `new URL` collapses `..`, `%2e%2e` and
 * backslashes first, so a path cannot climb out of its folder.
 */
function makeResolver(origin: string, prefixes: readonly string[]): (raw: string) => string | null {
  const base = new URL(origin);
  if (base.origin === "null") throw new TypeError(`not an origin that serves pages: ${origin}`);
  const root = `${base.origin}/`;
  return (raw) => {
    const value = raw.trim();
    if (!value.startsWith("/") && !SCHEME.test(value)) return null;
    let url: URL;
    try {
      url = new URL(value, root);
    } catch {
      return null;
    }
    if (url.origin !== base.origin) return null;
    const { pathname, search } = url;
    if (pathname.endsWith("/") || !prefixes.some((prefix) => pathname.startsWith(prefix))) {
      return null;
    }
    return `${pathname}${search}`;
  };
}

const WHITESPACE = /\s/;

/**
 * The URLs of a `srcset` value, the way a browser reads it: a candidate's URL is
 * the run up to whitespace, trailing commas on it end the candidate, and
 * otherwise its descriptor (`2x`, `480w`) runs to the next comma.
 */
function srcsetUrls(value: string): string[] {
  const urls: string[] = [];
  let at = 0;
  while (at < value.length) {
    while (at < value.length && (value[at] === "," || WHITESPACE.test(value[at] ?? ""))) at += 1;
    if (at >= value.length) break;
    const start = at;
    while (at < value.length && !WHITESPACE.test(value[at] ?? "")) at += 1;
    let url = value.slice(start, at);
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      while (at < value.length && value[at] !== ",") at += 1;
    }
    if (url !== "") urls.push(url);
  }
  return urls;
}

/**
 * The same-origin `/_next/static/**` and `/fonts/**` URLs named by the `src`,
 * `href` and `srcset` attributes of `html`'s elements, each once, in the order
 * first met. Text inside comments, scripts and styles is not an element, so the
 * RSC payload that quotes markup is not read. Throws a TypeError when `origin`
 * is not an origin that serves pages: an empty answer there would let a copy
 * commit with nothing required.
 */
export function requiredStaticUrls(html: string, origin: string): readonly string[] {
  const resolve = makeResolver(origin, STATIC_PREFIXES);
  const found = new Set<string>();
  const add = (raw: string) => {
    const path = resolve(raw);
    if (path !== null) found.add(path);
  };
  for (const tag of startTags(html)) {
    for (const [name, value] of tag.attributes) {
      if (name === "src" || name === "href") add(value);
      else if (name === "srcset") srcsetUrls(value).forEach(add);
    }
  }
  return [...found];
}

/** `url(` with a quoted or unquoted value, as a minifier or an author writes it. */
const CSS_URL = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^\s"'()]*))\s*\)/gi;
/** A comment, or an unterminated one that runs to the end, as a browser reads it. */
const CSS_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/g;

/**
 * The same-origin `/fonts/**` URLs named by `url(...)` in one CSS file, each
 * once, in the order first met. A `data:` URI, a relative url, a URL on another
 * origin and anything outside `/fonts/` name nothing, and an `@import` is not
 * followed (one level deep). Comments are removed first; a `url(` spelled inside
 * a CSS string is read as a url, which can only ask for one file too many, and
 * that abandons a save rather than committing an incomplete one. Throws a
 * TypeError when `origin` is not an origin that serves pages.
 */
export function fontUrlsFromCss(css: string, origin: string): readonly string[] {
  const resolve = makeResolver(origin, FONT_PREFIXES);
  const found = new Set<string>();
  for (const match of css.replace(CSS_COMMENT, "").matchAll(CSS_URL)) {
    const path = resolve(match[1] ?? match[2] ?? match[3] ?? "");
    if (path !== null) found.add(path);
  }
  return [...found];
}
