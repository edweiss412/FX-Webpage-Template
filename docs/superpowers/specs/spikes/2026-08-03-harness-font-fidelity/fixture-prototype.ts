import { test as base, expect, type Browser } from "@playwright/test";

// Prototype of the shared fixture: wraps page CREATION, records at load,
// so a caller closing its own contexts cannot lose the result.
type Collected = { url: string; family: string };
const collected: Collected[] = [];

async function runOracle(page: import("@playwright/test").Page) {
  if (page.isClosed()) return;
  try {
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    collected.push({ url: page.url().slice(0, 40), family });
  } catch { /* page already gone */ }
}

// Recording on `load` LOSES the result: the evaluate is async and the caller's
// close() wins the race. So the oracle is run FROM the close path instead, which
// is the only point guaranteed to be after the document is final and before it
// is destroyed.
function watch(page: import("@playwright/test").Page) {
  const origClose = page.close.bind(page);
  page.close = async (...a: Parameters<typeof origClose>) => { await runOracle(page); return origClose(...a); };
  pages.add(page);
}
const pages = new Set<import("@playwright/test").Page>();

const test = base.extend<{ fontOracle: void }>({
  browser: async ({ browser }, use) => {
    const orig = browser.newContext.bind(browser);
    (browser as Browser).newContext = async (...a: Parameters<Browser["newContext"]>) => {
      const ctx = await orig(...a);
      const origNew = ctx.newPage.bind(ctx);
      ctx.newPage = async () => { const p = await origNew(); watch(p); return p; };
      const origCtxClose = ctx.close.bind(ctx);
      ctx.close = async (...c: Parameters<typeof origCtxClose>) => {
        for (const p of ctx.pages()) await runOracle(p);
        return origCtxClose(...c);
      };
      return ctx;
    };
    await use(browser);
  },
  fontOracle: [async ({ page }, use) => { watch(page); await use(); await runOracle(page); }, { auto: true }],
});

test("caller-owned contexts are observed even though it closes them", async ({ browser }) => {
  const a = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const pa = await a.newPage();
  await pa.setContent(`<style>body{font-family:"AAA",serif}</style><p>x</p>`);
  await pa.waitForLoadState("load");
  await a.close();                       // closed BEFORE teardown, as agendaScheduleLayout does

  const b = await browser.newContext({ reducedMotion: "reduce" });
  const pb = await b.newPage();
  await pb.setContent(`<style>body{font-family:"BBB",serif}</style><p>y</p>`);
  await pb.waitForLoadState("load");
  await b.close();

  await expect.poll(() => collected.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  const fams = collected.map((c) => c.family).join(" ");
  expect(fams, "both caller-owned documents were observed").toContain("AAA");
  expect(fams).toContain("BBB");
});
