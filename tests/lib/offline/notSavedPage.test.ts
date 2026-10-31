import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { notSavedPageHtml } from "@/lib/offline/notSavedPage";

// The page the worker serves on a network error when the URL has no saved copy
// (spec 4.7.5). It is a whole HTML document the worker returns by itself, so
// everything it needs travels inside it: no Next chunk, no stylesheet or font
// request, nothing that would fail again with no signal.
//
// Expected values are written here from the spec, not read back from the module.
// The page is parsed with jsdom and every assertion looks at an element, so a
// string in a comment, an attribute or a template cannot satisfy it. The colors
// are pinned to app/globals.css in palette.test.ts.

const HEADING = "No signal, and this show isn't saved on this phone yet.";
const BODY =
  "Open this link once while you have signal or wifi. After that it works here even with no signal.";
const NOTE = "This page reloads by itself once it can reach the server.";
const RETRY_LABEL = "Try again";
/** The retry cadence, the bar's probe interval (spec 4.7.3, 4.7.5). */
const RETRY_INTERVAL_MS = 30_000;
const EM_DASH = "\u2014"; // spelled as an escape so this file holds no em dash itself

// jsdom ships no type declarations and @types/jsdom is not a dependency here, so a
// typed import would fail typecheck. scripts/captureStep3HeaderBaseline.ts does the same.
type JsdomError = Error & { type?: string };
type JsdomWindow = Window & typeof globalThis;
type JsdomApi = {
  JSDOM: new (
    html: string,
    options?: {
      runScripts?: "dangerously";
      url?: string;
      virtualConsole?: unknown;
      beforeParse?: (window: JsdomWindow) => void;
    },
  ) => { window: JsdomWindow };
  VirtualConsole: new () => {
    on(event: "jsdomError", listener: (error: JsdomError) => void): unknown;
  };
};
const { JSDOM, VirtualConsole } = createRequire(join(process.cwd(), "package.json"))(
  "jsdom",
) as JsdomApi;

const opened: JsdomWindow[] = [];
afterEach(() => {
  for (const window of opened.splice(0)) window.close();
});

/** The page, or any other HTML, parsed with scripts off. */
function load(html: string = notSavedPageHtml()): { window: JsdomWindow; document: Document } {
  const { window } = new JSDOM(html);
  opened.push(window);
  return { window, document: window.document };
}

/**
 * Elements whose content a browser never paints. A template is not listed: its content
 * lives in a separate fragment, so no element in the page tree has a template ancestor.
 */
const NEVER_PAINTED = new Set(["head", "noscript", "script", "style"]);

/**
 * True when `element` is painted: not inside an element that is never painted,
 * not hidden by attribute, and not hidden by any stylesheet jsdom applies.
 */
function isOnScreen(window: JsdomWindow, element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (NEVER_PAINTED.has(node.localName)) return false;
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

// --- Copy ---------------------------------------------------------------------

describe("copy", () => {
  const ROWS = [
    { tag: "h1", text: HEADING },
    { tag: "p", text: BODY },
    { tag: "button", text: RETRY_LABEL },
    { tag: "small", text: NOTE },
  ];

  test.each(ROWS)("the $tag holds its string and is on screen", ({ tag, text }) => {
    const { window, document } = load();
    const found = document.querySelectorAll(tag);
    expect(found).toHaveLength(1);
    const element = found[0] as Element;
    expect(element.textContent?.trim()).toBe(text);
    expect(isOnScreen(window, element)).toBe(true);
  });

  test("the four strings are everything the page says, in reading order", () => {
    const { document } = load();
    const body = document.body.cloneNode(true) as HTMLElement;
    for (const code of body.querySelectorAll("script, style")) code.remove();
    const said = (body.textContent ?? "").replace(/\s+/g, " ").trim();
    premise("the page says something", said.length, 0);
    expect(said).toBe([HEADING, BODY, RETRY_LABEL, NOTE].join(" "));
  });

  describe("the on-screen check rejects every way to hold a string without showing it", () => {
    const HIDDEN = [
      ["a hidden attribute", `<h1 hidden>${HEADING}</h1>`],
      ["aria-hidden", `<h1 aria-hidden="true">${HEADING}</h1>`],
      ["an inline display:none", `<h1 style="display:none">${HEADING}</h1>`],
      ["a stylesheet display:none", `<style>h1 { display: none }</style><h1>${HEADING}</h1>`],
      ["a noscript", `<noscript><h1>${HEADING}</h1></noscript>`],
      ["an ancestor that is hidden", `<div hidden><h1>${HEADING}</h1></div>`],
    ] as const;

    test.each(HIDDEN)("%s", (_name, markup) => {
      const { window, document } = load(`<!doctype html><body>${markup}</body>`);
      const heading = document.querySelector("h1");
      premiseHolds("the decoy holds the heading element", heading !== null);
      expect(isOnScreen(window, heading as Element)).toBe(false);
    });

    test("a template keeps its content out of the page tree altogether", () => {
      const { document } = load(
        `<!doctype html><body><template><h1>${HEADING}</h1></template></body>`,
      );
      premiseHolds("the decoy holds a template", document.querySelector("template") !== null);
      expect(document.querySelector("h1")).toBeNull();
    });

    test("and accepts a plain one", () => {
      const { window, document } = load(`<!doctype html><body><h1>${HEADING}</h1></body>`);
      expect(isOnScreen(window, document.querySelector("h1") as Element)).toBe(true);
    });
  });
});

describe("document", () => {
  test("it is a standards-mode English UTF-8 document with a viewport and a title", () => {
    const { document } = load();
    expect(document.compatMode).toBe("CSS1Compat");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(document.querySelector("meta[charset]")?.getAttribute("charset")).toBe("utf-8");
    // Both schemes are supported, so the browser paints the matching canvas and scrollbars.
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(
      "light dark",
    );
    const viewports = document.querySelectorAll('meta[name="viewport"]');
    expect(viewports).toHaveLength(1);
    // Exact, so a later "maximum-scale=1" or "user-scalable=no" cannot ride in unnoticed.
    expect(viewports[0]?.getAttribute("content")).toBe("width=device-width, initial-scale=1");
    // The tab says what the heading says, so the page carries no copy the spec did not give.
    expect(document.title).toBe(HEADING);
  });
});

// --- Nothing to fetch -----------------------------------------------------------

/**
 * Everything on the page that could load or navigate to anything. The accept-list
 * is closed on purpose: a new element or attribute fails here until it is added,
 * rather than a deny-list having to name every URL-bearing tag.
 */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  html: ["lang"],
  head: [],
  meta: ["charset", "name", "content"],
  title: [],
  style: [],
  body: [],
  main: [],
  h1: [],
  p: [],
  button: ["type"],
  small: [],
  script: [],
};

function strays(document: Document): string[] {
  const found: string[] = [];
  for (const element of document.querySelectorAll("*")) {
    const allowed = Object.hasOwn(ALLOWED, element.localName) ? ALLOWED[element.localName] : null;
    if (allowed === null || allowed === undefined) {
      found.push(`<${element.localName}>`);
      continue;
    }
    for (const attribute of element.attributes) {
      if (!allowed.includes(attribute.name)) {
        found.push(`<${element.localName} ${attribute.name}>`);
      }
    }
  }
  return found;
}

describe("self-contained", () => {
  test("no element carries a src or an href", () => {
    const { document } = load();
    premise("the scan walks the whole page", document.querySelectorAll("*").length, 8);
    expect([...document.querySelectorAll("[src], [href]")].map((el) => el.localName)).toEqual([]);
  });

  test("only the elements and attributes this page needs exist", () => {
    expect(strays(load().document)).toEqual([]);
  });

  test("the accept-list sees an element or attribute that could fetch or navigate", () => {
    const DECOYS = [
      ['<img src="/a.png">', "<img>"],
      ['<link rel="stylesheet" href="/a.css">', "<link>"],
      ['<a href="/">x</a>', "<a>"],
      ['<iframe src="/a"></iframe>', "<iframe>"],
      ['<meta http-equiv="refresh" content="0;url=/">', "<meta http-equiv>"],
      ['<script src="/a.js"></script>', "<script src>"],
      ['<p style="background:url(/a.png)">x</p>', "<p style>"],
    ] as const;
    for (const [markup, expected] of DECOYS) {
      const { document } = load(`<!doctype html><html><head></head><body>${markup}</body></html>`);
      expect(strays(document), markup).toContain(expected);
    }
  });

  test("the stylesheet imports and fetches nothing", () => {
    const { document } = load();
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
    premise("the page has a stylesheet", css.length, 0);
    expect(css).not.toMatch(/@import|url\s*\(/i);
  });

  test("there is exactly one script, inline", () => {
    const { document } = load();
    const scripts = document.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.hasAttribute("src")).toBe(false);
    expect((scripts[0]?.textContent ?? "").trim().length).toBeGreaterThan(0);
  });
});

// --- No em dash ------------------------------------------------------------------

/** True when the markup holds an em dash as written, as an entity, or in an attribute. */
function holdsEmDash(html: string): boolean {
  if (html.includes(EM_DASH)) return true;
  const { document } = load(html);
  if ((document.documentElement.textContent ?? "").includes(EM_DASH)) return true;
  return [...document.querySelectorAll("*")].some((element) =>
    [...element.attributes].some((attribute) => attribute.value.includes(EM_DASH)),
  );
}

describe("no em dash", () => {
  test("the detector sees one however it is written", () => {
    expect(holdsEmDash(`<p>a ${EM_DASH} b</p>`)).toBe(true);
    expect(holdsEmDash("<p>a &mdash; b</p>")).toBe(true);
    expect(holdsEmDash("<p>a &#8212; b</p>")).toBe(true);
    expect(holdsEmDash("<p>a &#x2014; b</p>")).toBe(true);
    expect(holdsEmDash(`<meta name="x" content="a&mdash;b">`)).toBe(true);
    expect(holdsEmDash("<p>a - b</p>")).toBe(false);
  });

  test("the page has none", () => {
    const html = notSavedPageHtml();
    premise("the page is a real document", html.length, 300);
    expect(holdsEmDash(html)).toBe(false);
  });
});

// --- Retrying: the button, the interval, the tab coming back, the online event ---

type Retry = {
  window: JsdomWindow;
  navigations: string[];
  other: string[];
  /** Every fetch the page made, as its arguments. */
  fetches: Array<{ url: unknown; init: unknown }>;
  /** Every interval the page scheduled; `run` calls one tick of it. */
  intervals: Array<{ ms: number; run: () => void }>;
  setOnline(value: boolean): void;
  setVisibility(value: "visible" | "hidden"): void;
};

/** A settled turn of the event loop, so the page's fetch chain has run to its end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Loads `html` with scripts running and reports every navigation jsdom was asked
 * to make. jsdom cannot navigate, so `location.reload()` surfaces as a "Not
 * implemented: navigation" error on its virtual console; that is the observable.
 * Anything else the page throws lands in `other`.
 *
 * jsdom has no fetch, no controllable connection and no visibility, so they are
 * stubbed before the page's script runs: `fetch` answers with `answer` and is
 * recorded, `navigator.onLine` and `document.visibilityState` read the values
 * the test sets, and `setInterval` records its callback for the test to tick.
 */
function loadAndWatch(
  html: string,
  answer: () => Promise<{ ok: boolean }> = async () => ({ ok: true }),
): Retry {
  const navigations: string[] = [];
  const other: string[] = [];
  const fetches: Retry["fetches"] = [];
  const intervals: Retry["intervals"] = [];
  let online = true;
  let visibility: "visible" | "hidden" = "visible";
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    if (error.type === "not-implemented" && /^Not implemented: navigation/.test(error.message)) {
      navigations.push(error.message);
    } else {
      other.push(error.message);
    }
  });
  const { window } = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://example.test/show/saved-copy-test/share-token",
    virtualConsole,
    beforeParse(target) {
      Object.defineProperty(target.navigator, "onLine", { configurable: true, get: () => online });
      Object.defineProperty(target.document, "visibilityState", {
        configurable: true,
        get: () => visibility,
      });
      Object.assign(target, {
        fetch: (url: unknown, init: unknown) => {
          fetches.push({ url, init });
          return answer();
        },
        setInterval: (run: () => void, ms: number) => {
          intervals.push({ ms, run });
          return intervals.length;
        },
      });
    },
  });
  opened.push(window);
  return {
    window,
    navigations,
    other,
    fetches,
    intervals,
    setOnline: (value) => {
      online = value;
    },
    setVisibility: (value) => {
      visibility = value;
    },
  };
}

/** The page's one stylesheet, as jsdom parsed it. */
function theOnlyStyleSheet(window: JsdomWindow, document: Document): CSSStyleSheet {
  const styles = document.querySelectorAll("style");
  expect(styles).toHaveLength(1);
  const sheet = (styles[0] as HTMLStyleElement).sheet;
  premiseHolds("jsdom parsed the page's stylesheet", sheet instanceof window.CSSStyleSheet);
  return sheet as CSSStyleSheet;
}

/** The page's one retry interval, at the bar's probe cadence. */
function retryInterval(page: Retry): { ms: number; run: () => void } {
  expect(page.intervals).toHaveLength(1);
  const interval = page.intervals[0]!;
  expect(interval.ms).toBe(RETRY_INTERVAL_MS);
  return interval;
}

const PAGE_URL = "https://example.test/show/saved-copy-test/share-token";

describe("the Try again button", () => {
  test("is the page's one button, a plain button and on screen", () => {
    const { window, document } = load();
    const buttons = document.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    const button = buttons[0] as HTMLButtonElement;
    // Not a submit button: there is no form, and a default type is one edit away from one.
    expect(button.getAttribute("type")).toBe("button");
    expect(button.textContent?.trim()).toBe(RETRY_LABEL);
    expect(isOnScreen(window, button)).toBe(true);
  });

  test("is at least 44 px tall, and its keyboard focus draws a ring", () => {
    const { window, document } = load();
    const button = document.querySelector("button") as HTMLButtonElement;
    expect(window.getComputedStyle(button).minHeight).toBe("44px");
    const sheet = theOnlyStyleSheet(window, document);
    const ring = Array.from(sheet.cssRules).filter(
      (rule): rule is CSSStyleRule =>
        rule instanceof window.CSSStyleRule && rule.selectorText === "button:focus-visible",
    );
    expect(ring).toHaveLength(1);
    expect(ring[0]!.style.getPropertyValue("outline-style")).toBe("solid");
    expect(parseFloat(ring[0]!.style.getPropertyValue("outline-width"))).toBeGreaterThanOrEqual(2);
  });

  // UI gate re-check E3: a tap in a dead zone reloads into this same page, so the
  // button's own pressed state is what shows a try happened. Hover is gated on a
  // pointer that hovers, so a touch never leaves it stuck on.
  test("has a pressed state and a hover state of its own, and keeps its focus ring", () => {
    const { window, document } = load();
    const sheet = theOnlyStyleSheet(window, document);
    const top = Array.from(sheet.cssRules);
    const styleRules = (rules: CSSRule[], selector: string): CSSStyleRule[] =>
      rules.filter(
        (rule): rule is CSSStyleRule =>
          rule instanceof window.CSSStyleRule && rule.selectorText === selector,
      );
    const base = styleRules(top, "button");
    expect(base).toHaveLength(1);

    const pressed = styleRules(top, "button:active");
    expect(pressed).toHaveLength(1);
    const pressedFill = pressed[0]!.style.getPropertyValue("background-color");
    expect(pressedFill).not.toBe("");
    expect(pressedFill).not.toBe(base[0]!.style.getPropertyValue("background-color"));

    const hoverMedia = top.filter(
      (rule): rule is CSSMediaRule =>
        rule instanceof window.CSSMediaRule && rule.media.mediaText === "(hover: hover)",
    );
    expect(hoverMedia).toHaveLength(1);
    const hover = styleRules(Array.from(hoverMedia[0]!.cssRules), "button:hover");
    expect(hover).toHaveLength(1);
    const hoverOutline = hover[0]!.style.getPropertyValue("border-color");
    expect(hoverOutline).not.toBe("");
    expect(hoverOutline).not.toBe(base[0]!.style.getPropertyValue("border-color"));

    // Neither state touches the outline, so the focus ring draws over both.
    for (const rule of [...pressed, ...hover]) {
      expect(rule.style.getPropertyValue("outline")).toBe("");
      expect(rule.style.getPropertyValue("outline-style")).toBe("");
      expect(rule.style.getPropertyValue("outline-color")).toBe("");
    }
    expect(styleRules(top, "button:focus-visible")).toHaveLength(1);
  });

  test("a tap reloads the page at once, without asking the network first", async () => {
    const page = loadAndWatch(notSavedPageHtml());
    const button = page.window.document.querySelector("button") as HTMLButtonElement;
    button.click();
    await settle();
    expect(page.other).toEqual([]);
    expect(page.fetches).toEqual([]);
    expect(page.navigations).toHaveLength(1);
  });
});

describe("retrying by itself", () => {
  test("the observation channel sees a reload", () => {
    const { window, navigations } = loadAndWatch("<!doctype html><body></body>");
    // Runs a fixed one-line script inside the throwaway jsdom window (runScripts is on),
    // never in the test process; it is the control for the channel, nothing else.
    (window as unknown as { eval(code: string): unknown }).eval("location.reload()");
    expect(navigations).toHaveLength(1);
  });

  test("loading the page neither fetches nor reloads", async () => {
    const page = loadAndWatch(notSavedPageHtml());
    await settle();
    expect(page.other).toEqual([]);
    expect(page.fetches).toEqual([]);
    expect(page.navigations).toEqual([]);
  });

  test("a retry asks for this page past every cache, and reloads when the answer is ok", async () => {
    const page = loadAndWatch(notSavedPageHtml());
    retryInterval(page).run();
    await settle();
    expect(page.fetches).toEqual([{ url: PAGE_URL, init: { cache: "no-store" } }]);
    expect(page.other).toEqual([]);
    expect(page.navigations).toHaveLength(1);
  });

  test("the interval retries only while the phone reports a connection", async () => {
    const page = loadAndWatch(notSavedPageHtml());
    const interval = retryInterval(page);
    page.setOnline(false);
    interval.run();
    interval.run();
    await settle();
    expect(page.fetches).toEqual([]);
    expect(page.navigations).toEqual([]);

    page.setOnline(true);
    interval.run();
    await settle();
    expect(page.fetches).toHaveLength(1);
    expect(page.navigations).toHaveLength(1);
  });

  test.each([
    ["the fetch fails", async () => Promise.reject(new TypeError("Failed to fetch"))],
    ["the answer is not ok", async () => ({ ok: false })],
  ] as const)(
    "no reload when %s, so a dead connection never shows the browser's error page",
    async (_name, answer) => {
      const page = loadAndWatch(notSavedPageHtml(), answer);
      retryInterval(page).run();
      page.window.dispatchEvent(new page.window.Event("online"));
      await settle();
      expect(page.fetches).toHaveLength(2);
      expect(page.other).toEqual([]);
      expect(page.navigations).toEqual([]);
    },
  );

  test("the tab coming back into view retries; going out of view does not", async () => {
    const page = loadAndWatch(notSavedPageHtml());
    const { document } = page.window;
    page.setVisibility("hidden");
    document.dispatchEvent(new page.window.Event("visibilitychange"));
    await settle();
    expect(page.fetches).toEqual([]);

    page.setVisibility("visible");
    document.dispatchEvent(new page.window.Event("visibilitychange"));
    await settle();
    expect(page.fetches).toHaveLength(1);
    expect(page.navigations).toHaveLength(1);
  });

  test("the online event retries once", async () => {
    const page = loadAndWatch(notSavedPageHtml());
    page.window.dispatchEvent(new page.window.Event("online"));
    await settle();
    expect(page.other).toEqual([]);
    expect(page.fetches).toHaveLength(1);
    expect(page.navigations).toHaveLength(1);
  });

  test("the offline event does not", async () => {
    const page = loadAndWatch(notSavedPageHtml());
    page.window.dispatchEvent(new page.window.Event("offline"));
    await settle();
    expect(page.other).toEqual([]);
    expect(page.fetches).toEqual([]);
    expect(page.navigations).toEqual([]);
  });
});
