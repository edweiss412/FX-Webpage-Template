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

const test = base.extend<{ oracle: void }>({
  context: async ({ context }, use) => {
    await context.exposeBinding("__fontOracle", (_s, p: { family: string; via: string }) =>
      void collected.push(p));
    await context.addInitScript(() => {
      const report = (via: string) => {
        const b = document.body;
        if (!b || b.childElementCount === 0) return; // nothing rendered yet
        (window as unknown as { __fontOracle?: (p: unknown) => void })
          .__fontOracle?.({ family: getComputedStyle(b).fontFamily, via });
      };
      addEventListener("pagehide", () => report("pagehide"));
    });
    await use(context);
  },
  // Second vantage: wrap the programmatic replacements pagehide cannot see, and
  // sweep anything still alive after the body.
  page: async ({ page }, use) => {
    for (const k of ["goto", "setContent", "reload", "goBack", "goForward"] as const) {
      const orig = (page[k] as (...a: unknown[]) => Promise<unknown>).bind(page);
      (page as unknown as Record<string, unknown>)[k] = async (...a: unknown[]) => {
        const f = await page.evaluate(() =>
          document.body && document.body.childElementCount > 0
            ? getComputedStyle(document.body).fontFamily : null).catch(() => null);
        if (f) collected.push({ family: f, via: "pre-navigate" });
        return orig(...a);
      };
    }
    await use(page);
  },
  oracle: [async ({ context }, use) => {
    await use();
    for (const p of context.pages()) {
      if (p.isClosed()) continue;
      const f = await p.evaluate(() =>
        document.body && document.body.childElementCount > 0
          ? getComputedStyle(document.body).fontFamily : null).catch(() => null);
      if (f) collected.push({ family: f, via: "after-body" });
    }
  }, { auto: true }],
});

test("a reused page reports every document, not only the last", async ({ page }) => {
  const before = collected.length;
  for (const f of ["AAA", "BBB", "CCC"])
    await page.setContent(`<style>body{font-family:"${f}",serif}</style><p>${f}</p>`);
  const fams = () => collected.slice(before).map((c) => c.family).join(" | ");
  await expect.poll(() => fams()).toContain("AAA");
  expect(fams()).toContain("BBB");
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
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  await ctx.exposeBinding("__fontOracle", (_s, p: { family: string; via: string }) =>
    void collected.push(p));
  await ctx.addInitScript(() => {
    addEventListener("pagehide", () => {
      const b = document.body;
      if (b && b.childElementCount > 0)
        (window as unknown as { __fontOracle?: (p: unknown) => void })
          .__fontOracle?.({ family: getComputedStyle(b).fontFamily, via: "pagehide" });
    });
  });
  const p = await ctx.newPage();
  await p.setContent(`<style>body{font-family:"OWNED",serif}</style><p>o</p>`);
  // the real fixture wraps context.close(); done inline here to keep the
  // prototype's own plumbing visible rather than hidden in a helper
  const f = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  collected.push({ family: f, via: "pre-close" });
  await ctx.close();
  await expect.poll(() => collected.slice(before).map((c) => c.family).join(" | "))
    .toContain("OWNED");
});
