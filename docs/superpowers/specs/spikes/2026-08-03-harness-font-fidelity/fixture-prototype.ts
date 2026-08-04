import { test as base, expect } from "@playwright/test";

/**
 * Prototype of the shared fixture that distributes the runtime oracle to the 31
 * harness callers. Three rounds shaped it, and each earlier shape looked correct:
 *
 *  - round 21: an after-test hook on `page` misses caller-owned contexts.
 *  - round 23: close-only inspection sees 1 of 14 documents on a reused page.
 *  - round 26: wrapping goto/setContent/reload/goBack/goForward still misses
 *    BROWSER-originated replacement (link/form activation, `location =`,
 *    history, meta refresh), browser-created pages (`window.open`), and frames.
 *
 * Neither available vantage is complete alone, and this was measured, not
 * assumed. An in-page `pagehide` listener (installed by an init script, so it
 * reaches every page AND every frame however created) is the ONLY thing that
 * sees browser-originated replacement. But it does not fire for `setContent`,
 * which replaces the document by writing into it, nor for a context being
 * closed. Wrapping the programmatic APIs covers exactly those and cannot see
 * browser-originated endings. So the fixture uses BOTH, plus an after-body
 * sweep for documents that simply outlive the test. The three tests below are
 * one per vantage; drop any one mechanism and one of them goes red.
 */
const collected: { family: string; via: string }[] = [];

/** The ONE walk. Round 28 found two vantages still reading document.body, so an
 *  Inter body with an Arial descendant passed through pre-navigate and
 *  after-body. Every vantage now calls this. */
const WALK = () => {
  const b = document.body;
  if (!b || b.childElementCount === 0) return null;
  // Round 29: a TreeWalker does not cross a shadow boundary, so text inside an
  // open shadow root was invisible to every vantage. Roots are collected and
  // walked too. A CLOSED root is unreachable by construction and is a stated
  // limit, not an oversight.
  const fams = new Set<string>();
  const walkRoot = (root: Node) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let n = w.currentNode as Element | null; n; n = w.nextNode() as Element | null) {
      const hasText = Array.from(n.childNodes).some(
        (c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "");
      if (hasText) fams.add(getComputedStyle(n).fontFamily);
      if ((n as Element).shadowRoot) walkRoot((n as Element).shadowRoot as Node);
    }
  };
  walkRoot(b);
  return [...fams].join(" ~ ");
};


const test = base.extend<{ oracle: void }>({
  // Caller-owned contexts must be covered BY THE FIXTURE, not by the test.
  browser: async ({ browser }, use) => {
    const orig = browser.newContext.bind(browser);
    (browser as unknown as { newContext: unknown }).newContext = async (...a: unknown[]) => {
      const ctx = await (orig as (...x: unknown[]) => Promise<import("@playwright/test").BrowserContext>)(...a);
      await ctx.exposeBinding("__fontOracle", (_s, q: { family: string; via: string }) =>
        void collected.push(q));
      await ctx.addInitScript({
        content: `const WALK = ${WALK.toString()};
          addEventListener("pagehide", () => {
            const f = WALK();
            if (f) window.__fontOracle && window.__fontOracle({ family: f, via: "pagehide" });
          });`,
      });
      const origClose = ctx.close.bind(ctx);
      ctx.close = async (...c: Parameters<typeof origClose>) => {
        for (const pg of ctx.pages()) {
          for (const fr of pg.frames()) {            // round 29: frames, not just pages
            const f = await fr.evaluate(WALK).catch(() => null);
            if (f) collected.push({ family: f, via: "pre-close" });
          }
        }
        return origClose(...c);
      };
      return ctx;
    };
    await use(browser);
  },
  // Second vantage: wrap the programmatic replacements pagehide cannot see, and
  // sweep anything still alive after the body.
  page: async ({ page }, use) => {
    for (const k of ["goto", "setContent", "reload", "goBack", "goForward"] as const) {
      const orig = (page[k] as (...a: unknown[]) => Promise<unknown>).bind(page);
      (page as unknown as Record<string, unknown>)[k] = async (...a: unknown[]) => {
        for (const fr of page.frames()) {
          const f = await fr.evaluate(WALK).catch(() => null);
          if (f) collected.push({ family: f, via: "pre-navigate" });
        }
        return orig(...a);
      };
    }
    // page.close() is its own ending, distinct from context.close(): round 29's
    // frame case closed the PAGE, so the context wrapper never ran.
    const origClose = page.close.bind(page);
    page.close = async (...a: Parameters<typeof origClose>) => {
      for (const fr of page.frames()) {
        const f = await fr.evaluate(WALK).catch(() => null);
        if (f) collected.push({ family: f, via: "pre-close" });
      }
      return origClose(...a);
    };
    await use(page);
  },
  oracle: [async ({ context }, use) => {
    await use();
    for (const p of context.pages()) {
      if (p.isClosed()) continue;
      for (const fr of p.frames()) {
        const f = await fr.evaluate(WALK).catch(() => null);
        if (f) collected.push({ family: f, via: "after-body" });
      }
    }
  }, { auto: true }],
});

test("a reused page reports every document, not only the last", async ({ page }) => {
  const before = collected.length;
  // Round 28: this varied only body families, so it could not tell whether the
  // pre-navigate vantage walked. Each document now hides a descendant.
  for (const f of ["AAA", "BBB", "CCC"])
    await page.setContent(
      `<style>body{font-family:"${f}",serif}</style><p>${f}</p>` +
      `<span style="font-family:'${f}_CHILD',serif">c</span>`);
  const fams = () => collected.slice(before).map((c) => c.family).join(" | ");
  await expect.poll(() => fams()).toContain("AAA");
  expect(fams()).toContain("BBB");
  expect(fams(), "pre-navigate walks descendants, not just body").toContain("AAA_CHILD");
});

test("a browser-originated navigation reports the outgoing document", async ({ page }) => {
  const before = collected.length;
  await page.route("http://x.test/first", (r) => r.fulfill({ contentType: "text/html",
    body: `<style>body{font-family:"ARIAL_IMPOSTOR",serif}</style><a id="go" href="/next">go</a><p>d</p>` }));
  await page.route("http://x.test/next", (r) => r.fulfill({ contentType: "text/html",
    body: `<style>body{font-family:"CLEAN",serif}</style><p>c</p>` }));
  await page.goto("http://x.test/first");
  await page.click("#go");                    // wraps nothing; only the document sees this
  await page.waitForLoadState("load");
  await expect.poll(() => collected.slice(before).map((c) => c.family).join(" | "))
    .toContain("ARIAL_IMPOSTOR");
});

test("a caller-owned context that closes itself is still reported", async ({ browser }) => {
  const before = collected.length;
  // Round 27: an earlier version hand-installed the binding and pushed the
  // pre-close result itself, which BYPASSED the fixture instead of testing it.
  // The context now comes from the wrapped `browser` fixture, so everything
  // below is the fixture's own behaviour.
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.setContent(`<style>body{font-family:"OUTER",serif}</style><p>o</p><span style="font-family:'OWNED',serif">x</span>`);
  await ctx.close();
  const seen = () => collected.slice(before).map((c) => c.family).join(" | ");
  await expect.poll(seen, { timeout: 5000 }).toContain("OUTER");
  expect(seen(), "a descendant cannot hide behind its root").toContain("OWNED");
});

test("shadow-root and frame text are both observed", async ({ page }) => {
  const before = collected.length;
  await page.route("http://y.test/outer", (r) => r.fulfill({ contentType: "text/html",
    body: `<style>body{font-family:"OUTER",serif}</style><div id="host"></div>
           <iframe src="/inner"></iframe>
           <script>document.getElementById("host").attachShadow({mode:"open"})
             .innerHTML = '<span style="font-family:SHADOW_WRONG,serif">s</span>';</script>` }));
  await page.route("http://y.test/inner", (r) => r.fulfill({ contentType: "text/html",
    body: `<style>body{font-family:"FRAME_WRONG",serif}</style><p>f</p>` }));
  await page.goto("http://y.test/outer");
  await page.waitForLoadState("load");
  await page.close();
  const seen = collected.slice(before).map((c) => c.family).join(" | ");
  expect(seen, "open shadow root is walked").toContain("SHADOW_WRONG");
  expect(seen, "child frame document is walked").toContain("FRAME_WRONG");
});
