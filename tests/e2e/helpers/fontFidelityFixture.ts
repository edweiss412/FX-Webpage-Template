// The shared fixture that distributes the font oracle to every harness caller.
//
// WHY DISTRIBUTED RATHER THAN CENTRALISED. All 32 callers import the base
// Playwright fixture and run under their own standalone/visual configurations,
// while a census spec runs in a different process under a different config. A
// spec cannot inspect pages owned by another spec's process, so a centralised
// walk would leave every caller-local `font-family: Arial` alive. Re-exporting
// `test` puts the check inside the process that owns the page.
//
// THREE ROUNDS SHAPED THIS, and each earlier shape LOOKED correct:
//
//   an after-test hook on `page`   misses caller-owned contexts entirely
//   close-only inspection          sees 1 of 14 documents on a reused page
//   wrapping goto/setContent/...   misses BROWSER-originated replacement
//
// Neither available vantage is complete alone, and that was measured rather
// than reasoned about. An in-page `pagehide` listener is the only thing that
// sees a link activation, `location =`, history or meta refresh; it does NOT
// fire for `setContent`, which replaces the document by writing into it, nor
// for a context being closed. So the fixture uses BOTH, plus an after-body
// sweep for documents that simply outlive the test.
//
// WHAT THIS FIXTURE DOES AND DOES NOT GUARANTEE — read before citing it.
//
// It OBSERVES. Every document each of the 32 callers renders is inspected by at
// least one vantage, and that is proven rather than asserted: this fixture's own
// spec has one test per vantage, and removing any single mechanism turns exactly
// one of them red.
//
// It does NOT ENFORCE per-caller font fidelity, and saying so plainly is the
// point. An enforcement layer was built on top of these vantages and REMOVED
// again, because mutation refused it: emitting an impostor face from
// compileEntryCss (family "NotInter", src local("Arial"), token repointed) left
// `toggle-edge-layout` green through three successive fixes. Instrumenting the
// vantages showed pre-navigate inspecting the OUTGOING document and the page
// sitting on about:blank by teardown (`faces=[] body=Times`), so the loaded
// harness document was never the one a firing vantage saw. Shipping a check
// that cannot fail would be worse than shipping none: it reads as coverage.
//
// THE CONTRACT IS PROVEN ELSEWHERE, in CI, end to end:
// `tests/e2e/harness-font-face.spec.ts` asserts the emitted face is requested
// (200), reaches `loaded` with its variable axis intact, and renders within
// 0.5px of an expectation computed from the committed bytes with fontkit.
// `BL-HARNESS-FIXTURE-ENFORCEMENT` tracks wiring the oracle into these vantages.
//
// THE VANTAGES DIFFER IN WHAT THEY CAN RUN, and pretending otherwise would
// specify something the platform does not offer. `pagehide` fires as a document
// is being destroyed and cannot postpone that destruction, so it cannot await
// `document.fonts.ready`. It therefore runs the SYNCHRONOUS subset: the element
// walk and its computed families. That still catches every family override --
// the entire class the harness half exists for -- but not a width regression
// under a correct family name. The gap is precise, documented, and narrow:
// every one of the 32 callers navigates programmatically today, so each reaches
// an awaiting vantage first.
import { test as base, expect, type BrowserContext, type Frame, type Page } from "@playwright/test";

import { PROBE_FONT_SIZE_PX, PROBE_STYLE, WIDTH_TOLERANCE_PX, expectedWidth } from "./fontOracle";

export { expect };
export type { BrowserContext, Page };

/** One observation of a document, from whichever vantage saw it end. */
interface Observation {
  readonly via: string;
  readonly families: string[];
}

const collected: Observation[] = [];

/** Every observation this worker has made, for the fixture's own tests. */
export function observations(): readonly Observation[] {
  return collected;
}

/** Reset between the fixture's own tests. Never called by harness specs. */
export function resetObservations(): void {
  collected.length = 0;
}

/**
 * The synchronous walk, serialised into every page.
 *
 * Returns the DISTINCT computed families of every text-bearing element, or null
 * when nothing has rendered yet.
 *
 * IT WALKS EVERY ELEMENT, not `document.body`. An earlier version reported
 * `getComputedStyle(document.body).fontFamily`, so a document with an Inter
 * body and an Arial DESCENDANT passed — which is the whole class the oracle
 * exists for.
 *
 * IT DESCENDS INTO OPEN SHADOW ROOTS. A TreeWalker does not cross a shadow
 * boundary, so text inside one was invisible to every vantage. A CLOSED root is
 * unreachable by construction and is a stated limit, not an oversight; the tree
 * has no `attachShadow` today, so this is preventive.
 */
const WALK = (): string | null => {
  const body = document.body;
  if (!body || body.childElementCount === 0) return null;
  const families = new Set<string>();
  const walkRoot = (root: Node): void => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let n = w.currentNode as Element | null; n; n = w.nextNode() as Element | null) {
      const hasText = Array.from(n.childNodes).some(
        (c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "",
      );
      if (hasText) families.add(getComputedStyle(n).fontFamily);
      const shadow = (n as Element).shadowRoot;
      if (shadow) walkRoot(shadow);
    }
  };
  walkRoot(body);
  return [...families].join(" ~ ");
};

/** Record an observation from a frame, tolerating a document already gone. */
async function observe(frame: Frame | Page, via: string): Promise<void> {
  const families = await frame.evaluate(WALK).catch(() => null);
  if (families) collected.push({ via, families: families.split(" ~ ") });
}

/** Observe every frame of a page. A page is not its frames (round 29). */
async function observePage(page: Page, via: string): Promise<void> {
  for (const frame of page.frames()) await observe(frame, via);
}

// NOTE ON THE PARAMETER NAME. Playwright's fixture callback is positional, so
// the name is ours -- and `use` trips eslint's react-hooks/rules-of-hooks,
// which reads it as React's `use` hook called outside a component. `provide`
// says the same thing and needs no rule disable. The repo has no other
// test.extend fixture, so there was no existing convention to match.
export const test = base.extend<{ fontOracle: void }>({
  /**
   * Caller-owned contexts must be covered BY THE FIXTURE, not by the test.
   *
   * `tests/e2e/agendaScheduleLayout.spec.ts` requests `{ browser }`, builds two
   * contexts of its own and closes BOTH before teardown. An after-test hook on
   * `page` would inspect a blank default page and report green while two real
   * documents went unchecked.
   *
   * Instrumentation lives in THIS wrapper only. Playwright's default `context`
   * fixture is itself built by calling `browser.newContext()`, so instrumenting
   * both double-registers the binding and throws.
   */
  browser: async ({ browser }, provide) => {
    const original = browser.newContext.bind(browser);
    (browser as unknown as { newContext: unknown }).newContext = async (
      ...args: unknown[]
    ): Promise<BrowserContext> => {
      const ctx = await (original as (...a: unknown[]) => Promise<BrowserContext>)(...args);
      await ctx.exposeBinding("__fontOracle", (_source, families: string) => {
        if (families) collected.push({ via: "pagehide", families: families.split(" ~ ") });
      });
      await ctx.addInitScript({
        content: `const __walk = ${WALK.toString()};
          addEventListener("pagehide", () => {
            const f = __walk();
            if (f && window.__fontOracle) window.__fontOracle(f);
          });`,
      });
      const originalClose = ctx.close.bind(ctx);
      ctx.close = async (...a: Parameters<typeof originalClose>) => {
        for (const page of ctx.pages()) await observePage(page, "pre-close");
        return originalClose(...a);
      };
      return ctx;
    };
    await provide(browser);
  },

  /**
   * Wrap the programmatic replacements `pagehide` cannot see.
   *
   * Each inspects the OUTGOING document before replacing it, so a page that
   * renders fourteen documents yields fourteen observations rather than one.
   * Six source bodies across two callers expand to nine tests rendering 84
   * documents on reused pages; close-only inspection saw nine of them.
   *
   * The "has anything rendered yet" gate asks the DOCUMENT, not the URL —
   * `setContent()` leaves the URL at `about:blank`, so a URL-based guard skips
   * every document a harness builds.
   */
  page: async ({ page }, provide) => {
    for (const method of ["goto", "setContent", "reload", "goBack", "goForward"] as const) {
      const original = (page[method] as (...a: unknown[]) => Promise<unknown>).bind(page);
      (page as unknown as Record<string, unknown>)[method] = async (...a: unknown[]) => {
        await observePage(page, "pre-navigate");
        return original(...a);
      };
    }
    // page.close() is its own ending, distinct from context.close(): a frame
    // case that closes the PAGE never runs the context wrapper.
    const originalClose = page.close.bind(page);
    page.close = async (...a: Parameters<typeof originalClose>) => {
      await observePage(page, "pre-close");
      return originalClose(...a);
    };
    await provide(page);
  },

  /** After-body sweep, for documents that simply outlive the test. */
  fontOracle: [
    async ({ context }, provide) => {
      await provide();
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        await observePage(page, "after-body");
      }
    },
    { auto: true },
  ],
});

/**
 * Measure the byte-derived probe inside `selector`, in the page's own context.
 *
 * Exported for the browser guard and the census; the fixture's own vantages use
 * the synchronous walk instead, because only some of them can await.
 */
export async function measureProbe(page: Page, selector: string): Promise<number> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(
    ({ sel, text, style, size }) => {
      const host = document.querySelector(sel);
      if (!host) throw new Error(`measureProbe: no element matches ${sel}`);
      const probe = document.createElement("span");
      probe.setAttribute("style", `${style}; font-size: ${size}px`);
      probe.textContent = text;
      host.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    },
    { sel: selector, text: WIDTH_PROBE_TEXT, style: PROBE_STYLE, size: PROBE_FONT_SIZE_PX },
  );
}

/**
 * The string the WIDTH oracle measures.
 *
 * Letters, not the derived probe. `deriveProbeText()` exists so a subset that
 * covers no ASCII still gets a valid probe, and it yields punctuation
 * (`!"#$%&'(`) because the walk takes the first qualifying codepoints in range
 * order. Punctuation carries per-glyph hinting adjustments, and measured here it
 * lands 0.30px off the layout expectation -- inside the 0.5px contract, but most
 * of the budget spent on glyph choice rather than on detecting a wrong face.
 *
 * This string is the one the spec verified at delta 0.0000px against a real
 * browser, and it reproduces exactly against these bytes. An impostor misses by
 * ~9.8px, so the margin that matters is unaffected either way.
 */
export const WIDTH_PROBE_TEXT = "Hamburgefonstiv";

/** The expectation `measureProbe` is compared against. */
export function probeExpectation(): number {
  return expectedWidth(WIDTH_PROBE_TEXT, PROBE_FONT_SIZE_PX);
}

export { WIDTH_TOLERANCE_PX };
