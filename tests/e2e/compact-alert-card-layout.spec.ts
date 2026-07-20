/**
 * tests/e2e/compact-alert-card-layout.spec.ts
 * (spec 2026-07-20-show-alert-compact §9.3)
 *
 * Real-browser layout assertions for the compact alert card. Every claim here
 * is one jsdom cannot make: it computes no layout, so containment, wrapping,
 * ellipsis, and tap-target size are all unobservable there.
 *
 * Two measurement choices are deliberate, both from plan review R1:
 *
 *   - CONTAINMENT is measured against the footer bar's CONTENT box (border box
 *     minus computed padding), and over EVERY descendant, not just the two
 *     cluster elements. A descendant can overflow while its cluster's own
 *     rectangle still looks contained.
 *   - "Not clipped" is proven by HIT TESTING (`elementFromPoint`), never by
 *     geometry. A clipped popover still reports its full unclipped rectangle,
 *     so a bounding-box assertion would pass on exactly the bug it claims to
 *     catch.
 *
 * Wrapping at 320px with a long action label is CORRECT behavior, not a
 * failure: the invariant is staying inside the card, not staying on one line.
 *
 * HARNESS (standalone, no app boot, no Supabase — mirrors
 * collapse-panel-morph.spec.ts):
 *   1. bundles tests/e2e/_compactAlertCardLiveEntry.tsx out-of-process with a
 *      version-pinned esbuild;
 *   2. compiles the real token CSS with the Tailwind CLI over app/globals.css,
 *      with explicit @source entries for the card, the help leaf, and the entry
 *      so their exact class strings are emitted (without real CSS the layout
 *      would be unstyled and every assertion would pass or fail for
 *      CSS-absence reasons);
 *   3. serves live.html over node:http.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/compact-alert-card-layout.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "compact-alert-card-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_compactAlertCardLiveEntry.tsx"),
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      "--loader:.tsx=tsx",
      '--define:process.env.NODE_ENV="production"',
      "--external:node:fs",
      `--alias:node:crypto=${join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts")}`,
      `--tsconfig=${join(REPO_ROOT, "tsconfig.json")}`,
      '--banner:js=window.process=window.process||{env:{NODE_ENV:"production"}};',
      `--alias:next/navigation=${join(REPO_ROOT, "tests", "e2e", "_nextNavigationStub.ts")}`,
      `--outfile=${join(workDir, "bundle.js")}`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin", "CompactAlertCard.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "compactAlertHelp.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "HoverHelp.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_compactAlertCardLiveEntry.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "PerShowActionableWarnings.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "review", "AttentionBanner.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "admin", "PerShowAlertResolveButton.tsx")}";`,
      globals,
    ].join("\n"),
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
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
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

/**
 * Every footer descendant's horizontal extent, plus the bar's CONTENT box.
 * Content box, not border box: padding belongs to the bar, so a child sitting
 * inside the padding is still contained, while a child past it is not.
 */
async function footerContainment(page: Page, cardTestId: string) {
  return page.getByTestId(cardTestId).evaluate((card) => {
    const bar = card.querySelector('[data-testid="compact-alert-footer"]');
    if (!bar) throw new Error("no footer bar");
    const barRect = bar.getBoundingClientRect();
    const cs = getComputedStyle(bar);
    const contentLeft = barRect.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const contentRight =
      barRect.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const overflows: { tag: string; left: number; right: number }[] = [];
    for (const el of Array.from(bar.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < contentLeft - 0.5 || r.right > contentRight + 0.5) {
        overflows.push({ tag: el.tagName.toLowerCase(), left: r.left, right: r.right });
      }
    }
    return { contentLeft, contentRight, overflows, barHeight: barRect.height };
  });
}

test.describe("compact alert card layout (real browser, real CSS)", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(baseUrl + "live.html");
    await expect(page.getByTestId("card-short-400")).toBeVisible();
    // CSS sanity guard: if Tailwind did not emit, every layout assertion below
    // would pass or fail for the wrong reason.
    const padded = await page
      .getByTestId("card-short-400")
      .locator('[data-testid="compact-alert-footer"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(padded, "footer padding must come from real compiled CSS").toBeGreaterThan(0);
  });

  // The hard invariant. Wrapping is fine; escaping the card is not.
  for (const card of [
    "card-short-400",
    "card-long-400",
    "card-short-320",
    "card-long-320",
    "card-unbreakable-320",
    "card-token-320",
  ]) {
    test(`${card}: no footer descendant escapes the bar's content box`, async ({ page }) => {
      const { overflows } = await footerContainment(page, card);
      expect(overflows, JSON.stringify(overflows)).toEqual([]);
    });
  }

  // Truncation asserted DIRECTLY: ancestor clipping can satisfy containment
  // without ellipsis ever engaging, so containment alone does not prove this.
  test("an unbreakable label ellipsizes rather than widening the row", async ({ page }) => {
    // Note the fixture choice: a MULTI-WORD long label ("Open branch settings")
    // never truncates, because flex-wrap gives it its own line first. Only a
    // single unbroken token forces the ellipsis, so that is what proves
    // `truncate` is doing work rather than being decorative.
    const { scrollWidth, clientWidth } = await page
      .getByTestId("link-unbreakable-320")
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  test("short-label footer stays on one line with clusters vertically centred", async ({
    page,
  }) => {
    const geom = await page.getByTestId("card-short-400").evaluate((card) => {
      const left = card.querySelector('[data-testid="compact-alert-footer-left"]')!;
      const right = card.querySelector('[data-testid="compact-alert-footer-right"]')!;
      const l = left.getBoundingClientRect();
      const r = right.getBoundingClientRect();
      return {
        leftCentre: l.top + l.height / 2,
        rightCentre: r.top + r.height / 2,
        sameLine: Math.abs(l.top - r.top) < 8,
      };
    });
    expect(Math.abs(geom.leftCentre - geom.rightCentre)).toBeLessThanOrEqual(TOL);
    expect(geom.sameLine).toBe(true);
  });

  // Wrapping is the CORRECT outcome at 320px with a long label — asserted as a
  // positive expectation so a future "fix" that forces one line and overflows
  // fails here rather than looking like an improvement.
  test("long-label footer at 320px wraps to a second line without overflowing", async ({
    page,
  }) => {
    const rows = await page.getByTestId("card-long-320").evaluate((card) => {
      const left = card.querySelector('[data-testid="compact-alert-footer-left"]')!;
      const right = card.querySelector('[data-testid="compact-alert-footer-right"]')!;
      return {
        leftTop: left.getBoundingClientRect().top,
        rightTop: right.getBoundingClientRect().top,
      };
    });
    expect(rows.rightTop).toBeGreaterThan(rows.leftTop);
    const { overflows } = await footerContainment(page, "card-long-320");
    expect(overflows).toEqual([]);
  });

  test("help trigger meets the 44px tap-target floor (22px box + overlay extent)", async ({
    page,
  }) => {
    // warning-card-copy-restore §3.4: the box is 22px by design; the 44px
    // floor is carried by the before:-inset-[11px] overlay (22 + 11 + 11).
    const btn = page.getByTestId("help-short-400-trigger");
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.width - 22)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(box!.height - 22)).toBeLessThanOrEqual(TOL);
    const insets = await btn.evaluate((el) => {
      const s = getComputedStyle(el, "::before");
      return [s.top, s.right, s.bottom, s.left];
    });
    expect(insets).toEqual(["-11px", "-11px", "-11px", "-11px"]);
  });

  test("footer links meet the 44px tap-target floor", async ({ page }) => {
    const box = await page.getByTestId("link-short-400").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44 - TOL);
  });

  // Hit testing, not geometry: a clipped popover still reports its full
  // rectangle, so elementFromPoint is the only observable that distinguishes
  // "painted here" from "measured here".
  test("opened popover actually paints where it measures (hit test)", async ({ page }) => {
    // Opened by HOVER, not click. With a real mouse, HoverHelp's pointerenter
    // opens the popover and the ensuing click TOGGLES it shut, so a click-to-open
    // step lands on a closed popover. That behavior predates this work (the
    // pointer-type gate guards the touch race, not the mouse one) and is out of
    // scope here; the test matches the real interaction rather than papering
    // over it.
    await page.getByTestId("help-short-400-trigger").hover();
    await expect(page.getByTestId("help-short-400-trigger")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    const hit = await page.getByTestId("help-short-400-body").evaluate((body) => {
      const r = body.getBoundingClientRect();
      const el = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + Math.min(12, r.height / 2),
      );
      return { insideBody: el ? body.contains(el) || el === body : false, width: r.width };
    });
    expect(hit.width).toBeGreaterThan(0);
    expect(hit.insideBody, "popover centre must hit the popover itself").toBe(true);
  });

  // min-w-0 on the message block: without it the unbroken token pushes the
  // trigger past the card's right edge.
  test("unbroken token keeps the help trigger inside the card", async ({ page }) => {
    const res = await page.getByTestId("card-token-320").evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const trigger = card.querySelector('[data-testid="help-token-320-trigger"]')!;
      const t = trigger.getBoundingClientRect();
      return { cardRight: cardRect.right, triggerRight: t.right };
    });
    expect(res.triggerRight).toBeLessThanOrEqual(res.cardRight + TOL);
  });
});

// ── warning-card-copy-restore (spec 2026-07-20-warning-card-copy-restore §3.4/§6/§7) ──
// Compact trigger geometry on BOTH changed CompactAlertHelp consumers.
test.describe("compact trigger geometry (warning-card-copy-restore)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(baseUrl + "live.html");
    await page.getByTestId("mount-warning-card").waitFor();
  });

  for (const mount of ["mount-warning-card", "mount-attention-banner"] as const) {
    test(`compact trigger geometry - ${mount} (spec §3.4/§6/§7)`, async ({ page }) => {
      const scope = page.getByTestId(mount);
      const btn = scope.getByTestId(/-trigger$/);
      const btnId = (await btn.getAttribute("data-testid"))!;
      const box = (await btn.boundingBox())!;
      expect(Math.abs(box.width - 22)).toBeLessThanOrEqual(TOL);
      expect(Math.abs(box.height - 22)).toBeLessThanOrEqual(TOL);
      // ::before extent = exact 44×44 (spec §7c)
      const insets = await btn.evaluate((el) => {
        const s = getComputedStyle(el, "::before");
        return [s.top, s.right, s.bottom, s.left];
      });
      expect(insets).toEqual(["-11px", "-11px", "-11px", "-11px"]);
      // corner probes just inside the overlay
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const PROBES: ReadonlyArray<readonly [number, number]> = [
        [-21.5, -21.5],
        [21.5, -21.5],
        [-21.5, 21.5],
        [21.5, 21.5],
      ];
      for (const [dx, dy] of PROBES) {
        const hit = await page.evaluate(
          ([x, y]: readonly [number, number]) =>
            document.elementFromPoint(x, y)?.closest("button")?.getAttribute("data-testid") ?? null,
          [cx + dx, cy + dy] as const,
        );
        expect(hit, `probe ${dx},${dy}`).toBe(btnId);
      }
      // glyph centering (spec §6 fixed-dimension parent invariant, rendered)
      const glyph = scope.getByTestId("compact-help-glyph");
      const gbox = (await glyph.boundingBox())!;
      expect(Math.abs(gbox.x + gbox.width / 2 - cx)).toBeLessThanOrEqual(1);
      expect(Math.abs(gbox.y + gbox.height / 2 - cy)).toBeLessThanOrEqual(1);
    });
  }

  test("trigger top-aligns with the title line WITH guidance rendered (spec §3.4)", async ({
    page,
  }) => {
    const scope = page.getByTestId("mount-warning-card");
    await expect(scope.getByTestId("per-show-actionable-guidance")).toBeVisible();
    const btn = (await scope.getByTestId(/-trigger$/).boundingBox())!;
    const title = (await scope.getByTestId("per-show-actionable-title").boundingBox())!;
    expect(Math.abs(btn.y - title.y)).toBeLessThanOrEqual(4);
  });
});
