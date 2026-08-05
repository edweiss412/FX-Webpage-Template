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
// It NOW ENFORCES the registered-face half (BL-HARNESS-FIXTURE-ENFORCEMENT).
// Every observation records the document's registered `@font-face` families, and
// `enforce()` fails the test when one appears that `app/fonts.css` does not
// declare. The kill criterion is the entry's own live mutant: emitting an
// impostor face from compileEntryCss (family "NotInter", src local("Arial"),
// token repointed) now turns `toggle-edge-layout` RED, where it stayed green
// through three earlier attempts.
//
// WHY THOSE ATTEMPTS FAILED, measured rather than reasoned about. Two defects
// stacked. Every vantage this fixture had observes a document that is ENDING —
// pre-navigate inspects the OUTGOING one, blank before the first goto — so none
// of them saw the document under test; `post-navigate` is the vantage that does.
// And `observe()` recorded only when the element WALK returned a family, but an
// empty family set joins to "" and "" is falsy, so a document that had registered
// faces and painted no text yet recorded NOTHING and was indistinguishable from a
// vantage that never fired. That is why adding a post-navigate vantage alone "did
// not close it": measured on toggle-edge-layout, the loaded harness document
// reports `families=[]` and `faces=["Inter","Inter Fallback"]`. Checking the FACE
// set is what makes the vantage reachable, and the entry says why in one line —
// whether a face is REGISTERED is independent of whether the body has children.
//
// STILL A DOCUMENTED LIMIT: a caller-local `font-family: Arial` override on an
// element. That is a computed-family defect, not a registration one, and the
// computed-family universe across 32 harnesses is wide enough (per-caller token
// stacks, mono and serif utilities, sr-only text) that asserting over it would
// trade this guard's precision for false positives. The face set is exact; the
// family set is not, and a check that has to be relaxed on its first real caller
// is the same "reads as coverage" failure in a new place.
//
// THE WIDTH CONTRACT IS PROVEN ELSEWHERE, in CI, end to end:
// `tests/e2e/harness-font-face.spec.ts` asserts the emitted face is requested
// (200), reaches `loaded` with its variable axis intact, and renders within
// 0.5px of an expectation computed from the committed bytes with fontkit.
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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test as base, expect, type BrowserContext, type Frame, type Page } from "@playwright/test";

import { familyOf, parseFontFaces } from "../../helpers/fontCss";
import { PROBE_FONT_SIZE_PX, PROBE_STYLE, WIDTH_TOLERANCE_PX, expectedWidth } from "./fontOracle";

const REPO_ROOT_FOR_FACES = join(__dirname, "..", "..", "..");

export { expect };
export type { BrowserContext, Page };

/** One observation of a document, from whichever vantage saw it end. */
interface Observation {
  readonly via: string;
  readonly families: string[];
  /** Registered `@font-face` families. Independent of whether anything rendered. */
  readonly faces: string[];
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
    // Start at the root only when it IS an element. `currentNode` begins at the
    // root and SHOW_ELEMENT filters only what `nextNode()` RETURNS, so
    // recursing into a shadow root handed a DocumentFragment to
    // `getComputedStyle`, which throws. Here that was INVISIBLE rather than
    // loud: `observe()` wraps this in `.catch(() => null)`, so the vantage
    // recorded nothing and read as a document with no families at all. Same
    // defect the census hit under mobile-safari, swept per the class rule.
    let n: Node | null = root.nodeType === Node.ELEMENT_NODE ? root : w.nextNode();
    for (; n; n = w.nextNode()) {
      const hasText = Array.from(n.childNodes).some(
        (c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "",
      );
      if (hasText) families.add(getComputedStyle(n as Element).fontFamily);
      const shadow = (n as Element).shadowRoot;
      if (shadow) walkRoot(shadow);
    }
  };
  walkRoot(body);
  return [...families].join(" ~ ");
};

/**
 * The registered `@font-face` families of a document.
 *
 * SEPARATE FROM THE WALK, and that separation is the whole repair. `WALK`
 * answers "what do rendered elements resolve to", which is empty for a document
 * that has registered faces but painted no text yet — and `observe()` used to
 * drop exactly that case, because an empty family set joins to `""` and `""` is
 * falsy. A vantage that fired on a real document therefore recorded NOTHING and
 * was indistinguishable from a vantage that never fired, which is why adding a
 * post-navigate vantage "did not close it" (BL-HARNESS-FIXTURE-ENFORCEMENT).
 *
 * Whether a face is REGISTERED is independent of whether the body has children,
 * which the entry states directly. `document.fonts` is populated as soon as the
 * stylesheet parses, so this vantage sees an impostor face the instant the
 * document loads, before anything renders.
 */
const FACES = (): string[] => {
  const seen = new Set<string>();
  document.fonts.forEach((f) => seen.add(f.family.replace(/^["']|["']$/g, "")));
  return [...seen];
};

/** Record an observation from a frame, tolerating a document already gone. */
async function observe(frame: Frame | Page, via: string): Promise<void> {
  const families = await frame.evaluate(WALK).catch(() => null);
  const faces = await frame.evaluate(FACES).catch(() => null);
  // Record when EITHER half saw something. Gating on `families` alone dropped
  // every document that had registered a face but not yet painted text.
  if (!families && (faces === null || faces.length === 0)) return;
  collected.push({
    via,
    families: families ? families.split(" ~ ") : [],
    faces: faces ?? [],
  });
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
      await ctx.exposeBinding(
        "__fontOracle",
        (_source, seen: { families: string; faces: string[] }) => {
          if (seen.families || seen.faces.length > 0) {
            collected.push({
              via: "pagehide",
              families: seen.families ? seen.families.split(" ~ ") : [],
              faces: seen.faces,
            });
          }
        },
      );
      await ctx.addInitScript({
        content: `const __walk = ${WALK.toString()};
          const __faces = ${FACES.toString()};
          addEventListener("pagehide", () => {
            const f = __walk();
            const faces = __faces();
            if ((f || faces.length) && window.__fontOracle) window.__fontOracle({ families: f, faces });
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
        const result = await original(...a);
        // THE VANTAGE THAT SEES THE LOADED DOCUMENT. Every other vantage in this
        // fixture observes a document that is ENDING: pre-navigate inspects the
        // outgoing one (blank before the first goto), pagehide fires as one is
        // destroyed, pre-close and after-body run when the page has already
        // moved on — measured at `faces=[] body=Times` on about:blank. So no
        // vantage saw the document under test, and enforcement built on them
        // could not fail. This one runs after the navigation resolves, on the
        // document the caller actually asked for.
        await observePage(page, "post-navigate");
        return result;
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
      const mark = collected.length;
      await provide();
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        await observePage(page, "after-body");
      }
      if (process.env.FONT_ORACLE_DUMP === "1") {
        for (const o of collected.slice(mark)) {
          process.stdout.write(
            `[font-oracle] via=${o.via} faces=${JSON.stringify(o.faces)} families=${JSON.stringify(o.families)}\n`,
          );
        }
      }
      enforce(collected.slice(mark));
    },
    { auto: true },
  ],
});

/**
 * The `@font-face` families a harness document may register.
 *
 * DERIVED FROM `app/fonts.css`, not listed here, for the same reason
 * `emitCommittedFace` derives the emitted block from it rather than duplicating
 * it: the two cannot drift the first time one is edited. That file is exactly
 * what `compileEntryCss` appends, so adding a legitimate face there admits it
 * automatically, while a face arriving from anywhere else — a caller's CSS, a
 * dependency, a mutant — is not in the set and cannot be.
 *
 * This is not circular with respect to what the guard catches. The impostor is
 * injected into the COMPILED OUTPUT, downstream of `app/fonts.css`; deriving the
 * accept-set from the source stylesheet is precisely what makes the injected
 * face inadmissible.
 */
const allowedFaces = (): ReadonlySet<string> =>
  new Set(
    parseFontFaces(readFileSync(join(REPO_ROOT_FOR_FACES, "app", "fonts.css"), "utf8")).map(
      familyOf,
    ),
  );

/**
 * Assert what the vantages observed.
 *
 * SCOPED TO REGISTERED FACES, not computed families. A face set is exact: the
 * toolchain emits one, so anything else is a defect with no judgement call. The
 * computed-family universe across 32 harnesses is wide (each caller's own token
 * stack, mono and serif utilities, `sr-only` text), and asserting over it would
 * trade this guard's precision for false positives — the caller-local
 * `font-family` override therefore stays a DOCUMENTED LIMIT below rather than a
 * check that has to be relaxed on its first real caller.
 */
function enforce(seen: readonly Observation[]): void {
  const allowed = allowedFaces();
  // PREMISE. The accept-set is read from a file, and a read that silently
  // yielded nothing would make every comparison below vacuously true — the
  // exact shape `tests/_shared/premise.ts` exists to prevent. `app/fonts.css`
  // declares Inter and its size-adjust fallback, so an empty or one-element set
  // means the parse broke, not that the stylesheet shrank.
  if (allowed.size < 2) {
    throw new Error(
      `font oracle: parsed ${allowed.size} face families out of app/fonts.css, expected at least 2 ` +
        `(Inter plus its fallback). An empty accept-set would let every observation pass.`,
    );
  }
  const bad = seen
    .flatMap((o) => o.faces.filter((f) => !allowed.has(f)).map((f) => `${o.via}:${f}`))
    .filter((v, i, all) => all.indexOf(v) === i);
  if (bad.length > 0) {
    throw new Error(
      `font oracle: harness document registered an unexpected @font-face family: ${bad.join(", ")}. ` +
        `Only [${[...allowed].join(", ")}] are emitted by compileEntryCss from app/fonts.css; anything ` +
        `else means the document is measuring geometry against a face the product never renders.`,
    );
  }
}

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
