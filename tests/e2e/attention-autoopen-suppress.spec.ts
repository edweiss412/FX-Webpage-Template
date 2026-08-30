/**
 * tests/e2e/attention-autoopen-suppress.spec.ts
 * (spec 2026-08-29-attention-auto-open-phone-suppression §8, §9.2)
 *
 * The geometry half of the suppression change. jsdom computes no layout, so
 * everything here -- what a finger actually hits -- exists only in a real
 * engine. The predicate's effect on `menuOpen` is asserted in the jsdom twin
 * (tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx).
 *
 * Boot mirrors popover-clip-fit.spec.ts: bundle the LIVE entry out of process
 * through _step3ReviewModalBundle.mjs (a plain esbuild call fails -- the modal's
 * import graph reaches "use server" actions and node builtins that helper
 * elides), compile real Tailwind, serve from a tmp dir on an ephemeral port.
 *
 * READINESS GATE: `window.__hydrated`, never `networkidle`, and deliberately
 * NOT tests/e2e/helpers/awaitModalHydrated.ts. That helper polls until
 * document.activeElement is the close button, which is exactly what
 * AC-FOCUS-IDENTITY asserts; gating on it would make that assertion unfailable,
 * and a defect would surface as a timeout that reads like harness flake rather
 * than as a finding.
 *
 * Run:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/attention-autoopen-suppress.spec.ts
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { compileEntryCss } from "./helpers/liveEntryToolchain";
import { probeOcclusion } from "./helpers/occlusionProbe";

const REPO_ROOT = resolve(__dirname, "..", "..");
const PILL_ENTRY = join(REPO_ROOT, "tests", "e2e", "_pillFocusLiveEntry.tsx");

const CLIP = "[data-review-modal-panel]";
const PILL = '[data-testid="published-show-review-alert-pill"]';
const MENU = '[data-testid="published-show-review-attention-menu"]';
// The INTERACTIVE control, not its wrapper. `strip-publish-toggle` is a plain
// <div> (StatusStrip.tsx:281) and so is never in the probe's control set; the
// helper's mustInclude guard caught that on the first run, which is what it is
// for. The switch itself is a <button role="switch"> (PublishedToggle.tsx:517).
const TOGGLE_ID = "published-toggle";

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "attn-suppress-"));
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      PILL_ENTRY,
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin")}";`,
      `@source "${PILL_ENTRY}";`,
      readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"),
    ].join("\n"),
  );
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="out.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader(
        "content-type",
        file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/** Boot at a viewport with N actionable items. Gates on `__hydrated`, then on
 *  the modal's own presence -- never on focus, per the note at the top. */
async function boot(page: Page, width: number, height: number, actionable = 3) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height });
  await page.goto(baseUrl);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => (window as unknown as { __hydrated?: boolean }).__hydrated === true,
  );
  await page.evaluate(
    ([a]) =>
      (
        window as unknown as {
          __setItems: (a: number, n: number, s: number, d: boolean) => void;
        }
      ).__setItems(a!, 3, 3, false),
    [actionable] as const,
  );
  await expect(page.locator(CLIP)).toBeVisible();
  await expect(page.locator(PILL)).toBeVisible();
  // The reveal is a paint-time decision; give it frames to have happened, so a
  // "menu absent" assertion is a decision rather than a race.
  await page.waitForTimeout(250);
}

test("AC-TOGGLE-OPERABLE: at 375x667 the published toggle takes its own pointer events", async ({
  page,
}) => {
  await boot(page, 375, 667);

  // Precondition, or the whole case is vacuous: the menu really is closed.
  await expect(page.locator(MENU)).toHaveCount(0);

  // Premise on THIS case's own inputs (spec 2026-08-30 AC-2). The risk this
  // case exists for is a TALL pill's hit band reaching the toggle, and the
  // pill is only tall when every segment is populated. Without this, a
  // dropped or unreachable segment shrinks it to one line and the occlusion
  // assertion below passes on a load that never exercised the risk.
  const pillText = ((await page.locator(PILL).textContent()) ?? "").replace(/\s+/g, " ");
  expect(pillText, "issues segment present").toMatch(/\d+ issues?/);
  expect(pillText, "monitoring segment present").toMatch(/\d+ monitoring/);
  // AC-2b, not AC-2. The sheet-warnings segment is deliberately absent: this
  // entry cannot render it (see the DOCUMENTED LIMIT in _pillFocusLiveEntry.tsx
  // -- the warning model is subprocess-only), so this case runs at the tallest
  // load the entry CAN reach. Asserting its absence rather than ignoring it
  // keeps the limit visible: if the segment ever appears here, the limit was
  // lifted and this premise should be widened back to all three.
  expect(pillText, "AC-2b: sheet-warnings segment is unreachable in this entry").not.toMatch(
    /sheet warnings?/,
  );

  const report = await probeOcclusion(page, CLIP, null, PILL, [TOGGLE_ID]);
  const onToggle = report.interceptions.filter((i) => i.control === TOGGLE_ID);

  // Assert the WHOLE set, not just the panel's share.
  //
  // The first version filtered to `insidePanel` on the reasoning that the pill's
  // `before:-inset-y-3` band is pre-existing and not this arc's -- true, but it
  // makes the assertion blind to the case that matters most: an INVISIBLE 12px
  // pseudo-element eating taps on the primary publish control. If that ever
  // starts happening, "not this arc's" is no comfort to Doug, and a filtered
  // assertion would stay green through it. Impeccable critique P1.
  //
  // So: with the menu suppressed, NOTHING may intercept the toggle. If a
  // pre-existing interceptor does appear, this fails and names it, which is the
  // outcome worth having.
  expect(
    onToggle,
    `the toggle does not take its own pointer events: ${JSON.stringify(onToggle)}`,
  ).toEqual([]);
});

test("AC-TOGGLE-OPERABLE, positive control: with the menu OPEN at 375 the toggle IS covered", async ({
  page,
}) => {
  // Without this, the assertion above passes if the probe is BLIND rather than
  // because the toggle is clear -- the non-discriminating-fixture class this arc
  // has hit repeatedly. Here the same probe, on the same page, at the same
  // width, must SEE the occlusion when the panel is open.
  //
  // It is also the only place the arc's original defect is still observable:
  // once suppression ships, the menu is never open on arrival at 375, so the
  // pre-fix measurement cannot be reproduced by disabling the predicate -- the
  // suppressed case fails its own precondition first. Opening by tap reaches the
  // same geometry deliberately.
  await boot(page, 375, 667);
  await page.locator(PILL).click();
  await expect(page.locator(MENU)).toBeVisible();

  const report = await probeOcclusion(page, CLIP, MENU, PILL, [TOGGLE_ID]);
  const fromPanel = report.interceptions.filter((i) => i.control === TOGGLE_ID && i.insidePanel);
  expect(
    fromPanel.length,
    "the open panel does NOT cover the toggle, so the suppressed assertion proves nothing",
  ).toBeGreaterThan(0);
  // Recorded rather than asserted: the interceptor's identity is the arc's
  // original evidence (BACKLOG.md probed 2026-08-28, "intercepted by an
  // attention monitoring row"). Pinning the exact row would break on a fixture
  // change without telling anyone anything new.
  console.log(`AC-TOGGLE-OPERABLE control: ${JSON.stringify(fromPanel)}`);
});

test("AC-PILL-TAP: the pill takes a tap at 375 and opens the menu", async ({ page }) => {
  await boot(page, 375, 667);
  await expect(page.locator(MENU)).toHaveCount(0);
  await page.locator(PILL).click();
  await expect(page.locator(MENU)).toBeVisible();
});

test("AC-ANCHOR-PANEL-HANGS-BELOW: the open panel hangs at or below the pill's bottom edge", async ({
  page,
}) => {
  await boot(page, 375, 667);
  await page.locator(PILL).click();
  await expect(page.locator(MENU)).toBeVisible();

  const g = await page.evaluate(
    ([pillSel, menuSel]) => {
      const pill = document.querySelector(pillSel as string)!.getBoundingClientRect();
      const menu = document.querySelector(menuSel as string)!.getBoundingClientRect();
      return { pillBottom: pill.bottom, menuTop: menu.top };
    },
    [PILL, MENU] as const,
  );
  // Falsifiable: a mutant anchoring the panel higher puts its top above this
  // edge and over the content the pill sits in.
  expect(g.menuTop).toBeGreaterThanOrEqual(g.pillBottom - 0.5);
});

test("AC-OPERATOR-OPENED-SURVIVES: a tapped-open menu survives a resize in both directions", async ({
  page,
}) => {
  await boot(page, 375, 667);
  await page.locator(PILL).click();
  await expect(page.locator(MENU)).toBeVisible();

  // Widen past the breakpoint: nothing closes a menu the operator opened.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);
  await expect(page.locator(MENU), "widening closed an operator-opened menu").toBeVisible();

  // And back below it.
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(250);
  await expect(page.locator(MENU), "shrinking closed an operator-opened menu").toBeVisible();
});

test("AC-RESIZE-SHRINK-STAYS-OPEN: auto-opened at desktop, then shrunk below sm, stays open", async ({
  page,
}) => {
  await boot(page, 1280, 800);
  await expect(page.locator(MENU), "the desktop control did not auto-open").toBeVisible();

  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(250);
  await expect(page.locator(MENU), "shrinking force-closed an auto-opened menu").toBeVisible();
});

test("AC-RESIZE-WIDEN-STAYS-CLOSED: suppressed at 375, then widened, stays closed", async ({
  page,
}) => {
  await boot(page, 375, 667);
  await expect(page.locator(MENU)).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);
  // The one-shot was consumed at the suppression decision, so widening does not
  // retroactively fire a reveal the operator never asked for.
  await expect(page.locator(MENU), "widening retroactively opened the menu").toHaveCount(0);
});
