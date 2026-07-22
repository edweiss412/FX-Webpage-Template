/**
 * tests/e2e/attention-pill-focus.spec.ts
 * (spec 2026-07-21-attention-needs-attention-split §6, §6a, §11.5a, §11.9)
 *
 * REAL-BROWSER focus probe: the §6a ratification. jsdom can pin the state
 * reconciliation but cannot observe paint-order focus races; this measures
 * `document.activeElement` in a real engine across EVERY interactive →
 * non-interactive transition while the menu is open.
 *
 * The transition set is the GENERATED cartesian ENTRY × EXIT product (3 × 3 =
 * 9 cells, count asserted) — never a hand-listed table (hand lists dropped
 * cells across review rounds R5/R6).
 *
 * Boot mirrors compact-alert-card-layout.spec.ts: bundle the live entry
 * out-of-process with pinned esbuild, compile real Tailwind CSS, serve from a
 * tmp dir. Hydration gate: `window.__hydrated` (never networkidle). Driving:
 * `window.__setItems` (React state — detach-safe, no locator.evaluate on
 * unmounting nodes).
 *
 * Run:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/attention-pill-focus.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "attention-pill-focus-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // The modal's import graph reaches "use server" actions + node builtins
  // (postgres, node:async_hooks) that Next elides from client bundles. The
  // pinned esbuild JS-API helper replicates that elision — plain esbuild flags
  // cannot resolve this graph (see _step3ReviewModalBundle.mjs rationale).
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"),
      join(REPO_ROOT, "tests", "e2e", "_pillFocusLiveEntry.tsx"),
      join(workDir, "bundle.js"),
      join(REPO_ROOT, "tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "admin")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_pillFocusLiveEntry.tsx")}";`,
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
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const PILL = '[data-testid="published-show-review-alert-pill"]';
const MENU = '[data-testid="published-show-review-attention-menu"]';

async function boot(page: Page, a: number, n: number, s: number) {
  await page.goto(baseUrl);
  await page.waitForFunction(
    () => (window as unknown as { __hydrated?: boolean }).__hydrated === true,
  );
  await page.evaluate(
    ([aa, nn, ss]) =>
      (
        window as unknown as { __setItems: (a: number, n: number, s: number, d: boolean) => void }
      ).__setItems(aa!, nn!, ss!, false),
    [a, n, s],
  );
  // §5.2 auto-open: when actionable items exist the menu opens once per mount,
  // so the pill click is needed only when the menu is still closed (e.g. the
  // needs-look-only entry, where auto-open does not fire).
  if ((await page.locator(MENU).count()) === 0) await page.locator(PILL).click();
  await expect(page.locator(MENU)).toBeVisible();
  // move focus INTO the menu (first interactive descendant; the pill otherwise)
  const target = page.locator(`${MENU} button, ${MENU} a`).first();
  if ((await target.count()) > 0) await target.focus();
  else await page.locator(PILL).focus();
}

// ENTRY: every interactive shape incl. monitoring-only [0,0] (selfHeal boot).
// EXIT: every non-interactive target — C degraded, D in-sync (B left the exit
// set: monitoring-only is interactive now — monitoring-badge-expand §3.3).
const ENTRY: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [0, 0],
];
const EXIT = [
  { label: "C", selfHeal: 0, degraded: true },
  { label: "D", selfHeal: 0, degraded: false },
] as const;
const cells = ENTRY.flatMap(([a, n]) => EXIT.map((x) => ({ a, n, x })));

test("exactly 8 transition cells (a shrunk product fails)", () => {
  expect(cells.length).toBe(8);
});

for (const { a, n, x } of cells) {
  test(`open [a=${a},n=${n}] -> ${x.label}: menu closed, focus on dialog root, never body`, async ({
    page,
  }) => {
    await boot(page, a, n, 1);
    await page.evaluate(
      ([ss, dd]) =>
        (
          window as unknown as { __setItems: (a: number, n: number, s: number, d: boolean) => void }
        ).__setItems(0, 0, ss as number, dd as boolean),
      [x.selfHeal, x.degraded],
    );
    await expect(page.locator(MENU)).toHaveCount(0);
    const state = await page.evaluate(() => ({
      staleExpanded: document.querySelector('[aria-expanded="true"]') !== null,
      activeIsBody: document.activeElement === document.body,
      // the rescue contract targets the dialog ROOT itself (tabindex ensured,
      // then focus()) — a descendant check would also pass when the rescue
      // never ran because focus happened to start inside the subtree.
      activeIsDialogRoot: document.activeElement?.getAttribute?.("role") === "dialog",
    }));
    expect(state.staleExpanded, "stale aria-expanded").toBe(false);
    expect(state.activeIsBody, "focus dropped to <body>").toBe(false);
    expect(state.activeIsDialogRoot, "focus not on the dialog root").toBe(true);
  });
}

test("§11.9 nav: sheet link exact href + target, click closes the menu", async ({
  page,
  context,
}) => {
  await boot(page, 0, 1, 0);
  const link = page.locator(`${MENU} a`).first();
  await expect(link).toHaveAttribute(
    "href",
    "https://docs.google.com/spreadsheets/d/PROBEFILE/edit#gid=0",
  );
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  const popupPromise = context.waitForEvent("page").catch(() => null);
  await link.click();
  await expect(page.locator(MENU)).toHaveCount(0); // menu-close on activation (§3.4)
  const popup = await Promise.race([popupPromise, new Promise((r) => setTimeout(r, 1500, null))]);
  if (popup && typeof (popup as { close?: () => Promise<void> }).close === "function") {
    await (popup as { close: () => Promise<void> }).close();
  }
});

// ---------------------------------------------------------------------------
// monitoring-badge-expand §3.3/§3.4/§5 items 6-7: stays-open probes (the
// AUTHORITATIVE ratification — jsdom removal-focus semantics differ), node
// identity across palette flips, and computed-style treatment ground truth.
// ---------------------------------------------------------------------------

const SEGMENT = '[data-testid="attention-pill-monitoring-segment"]';
const MON_GROUP = '[data-testid="attention-monitoring-group"]';

async function setItems(page: Page, a: number, n: number, s: number, d = false) {
  await page.evaluate(
    ([aa, nn, ss, dd]) =>
      (
        window as unknown as {
          __setItems: (a: number, n: number, s: number, d: boolean) => void;
        }
      ).__setItems(aa as number, nn as number, ss as number, dd as boolean),
    [a, n, s, d],
  );
}

async function settledFocusIsPill(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement?.getAttribute?.("data-testid") ===
          "published-show-review-alert-pill",
      ),
    )
    .toBe(true);
  const onBody = await page.evaluate(() => document.activeElement === document.body);
  expect(onBody, "settled focus must not be <body>").toBe(false);
}

test("rescue probe (a): focused actionable row removed → menu open, aria-expanded, settled focus = pill", async ({
  page,
}) => {
  await boot(page, 1, 0, 1);
  await page.locator(`${MENU} [data-testid^="attention-menu-row-"]`).first().focus();
  await setItems(page, 0, 0, 1);
  await expect(page.locator(MENU)).toBeVisible();
  await expect(page.locator(PILL)).toHaveAttribute("aria-expanded", "true");
  await settledFocusIsPill(page);
});

test("rescue probe (b): focused needs-look LINK removed → menu open, aria-expanded, settled focus = pill", async ({
  page,
}) => {
  await boot(page, 0, 1, 1);
  await page.locator(`${MENU} a`).first().focus();
  await setItems(page, 0, 0, 1);
  await expect(page.locator(MENU)).toBeVisible();
  await expect(page.locator(PILL)).toHaveAttribute("aria-expanded", "true");
  await settledFocusIsPill(page);
});

test("insertion cell (c): (1,0,0)→(0,0,1) stays open, monitoring rows inserted, quiet root, same node", async ({
  page,
}) => {
  await boot(page, 1, 0, 0);
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="published-show-review-alert-pill"]');
    if (el instanceof HTMLElement) el.dataset.pin = "1";
  });
  await setItems(page, 0, 0, 1);
  await expect(page.locator(MENU)).toBeVisible();
  await expect(page.locator(`${MENU} [data-testid^="attention-monitoring-row-"]`)).toHaveCount(1);
  await expect(page.locator(PILL)).toHaveAttribute("aria-expanded", "true");
  await settledFocusIsPill(page);
  // the root cross-fade (transition-colors duration-fast) needs a beat to
  // settle — poll the computed color to its target token (§3.4 contract:
  // animated, not instant, so an immediate sample sees the interpolation)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="published-show-review-alert-pill"]');
        const probe = document.createElement("span");
        probe.className = "bg-surface-sunken";
        document.body.appendChild(probe);
        const want = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return el ? getComputedStyle(el).backgroundColor === want : false;
      }),
    )
    .toBe(true);
  const pinSurvived = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="published-show-review-alert-pill"]');
    return el instanceof HTMLElement && el.dataset.pin === "1" && el.isConnected;
  });
  expect(pinSurvived, "same pill node must survive the flip").toBe(true);
});

test("reverse cell (d): (0,0,1)→(1,0,0) stays open, group swap, amber root, same node", async ({
  page,
}) => {
  await boot(page, 0, 0, 1);
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="published-show-review-alert-pill"]');
    if (el instanceof HTMLElement) el.dataset.pin = "1";
  });
  await setItems(page, 1, 0, 0);
  await expect(page.locator(MENU)).toBeVisible();
  await expect(page.locator(`${MENU} [data-testid^="attention-monitoring-row-"]`)).toHaveCount(0);
  await expect(page.locator(`${MENU} [data-testid^="attention-menu-row-"]`)).toHaveCount(1);
  await expect(page.locator(PILL)).toHaveAttribute("aria-expanded", "true");
  await settledFocusIsPill(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="published-show-review-alert-pill"]');
        const probe = document.createElement("span");
        probe.className = "bg-warning-bg";
        document.body.appendChild(probe);
        const want = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return el ? getComputedStyle(el).backgroundColor === want : false;
      }),
    )
    .toBe(true);
  const pinSurvived = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="published-show-review-alert-pill"]');
    return el instanceof HTMLElement && el.dataset.pin === "1" && el.isConnected;
  });
  expect(pinSurvived, "same pill node must survive the flip").toBe(true);
});

// Computed-style treatment probe (§3.4 ground truth), both palette states.
for (const [a, n, s0, label] of [
  [1, 0, 1, "composite/amber"],
  [0, 0, 1, "monitoring-only/quiet"],
] as const) {
  test(`treatment probe (${label}): root cross-fades; segment/dots/middots/group/rows instant; chevron transform-only`, async ({
    page,
  }) => {
    await boot(page, a, n, s0);
    const report = await page.evaluate(() => {
      const pill = document.querySelector('[data-testid="published-show-review-alert-pill"]')!;
      const instant = (el: Element) => {
        const cs = getComputedStyle(el);
        const noTransition =
          cs.transitionProperty === "none" ||
          cs.transitionDuration.split(",").every((d) => parseFloat(d) === 0);
        return { noTransition, animationName: cs.animationName };
      };
      const rootCs = getComputedStyle(pill);
      const rootProps = rootCs.transitionProperty;
      const rootDur = parseFloat(rootCs.transitionDuration.split(",")[0] ?? "0");
      const seg = pill.querySelector('[data-testid="attention-pill-monitoring-segment"]');
      const dots = [...pill.querySelectorAll('[class*="rounded-pill"]')].filter(
        (el) => el !== pill,
      );
      const middots = [...pill.querySelectorAll("span")].filter(
        (el) => (el.textContent ?? "").trim() === "\u00b7",
      );
      const group = document.querySelector('[data-testid="attention-monitoring-group"]');
      const rows = [...document.querySelectorAll('[data-testid^="attention-monitoring-row-"]')];
      const chev = pill.querySelector("svg");
      const chevCs = chev ? getComputedStyle(chev) : null;
      const groupAnimations = [group, ...rows]
        .filter((el): el is Element => !!el)
        .flatMap((el) => (el as HTMLElement).getAnimations?.() ?? []).length;
      return {
        rootProps,
        rootDur,
        instantTargets: [seg, ...dots, ...middots, group, ...rows]
          .filter((el): el is Element => !!el)
          .map((el) => instant(el)),
        chevProps: chevCs?.transitionProperty ?? "",
        chevDur: parseFloat(chevCs?.transitionDuration.split(",")[0] ?? "0"),
        groupAnimations,
        segPresent: !!seg,
        groupPresent: !!group,
        rowCount: rows.length,
      };
    });
    expect(report.segPresent).toBe(true);
    expect(report.groupPresent).toBe(true);
    expect(report.rowCount).toBeGreaterThan(0);
    // root: color cross-fade with real duration
    expect(report.rootProps === "all" || /background-color/.test(report.rootProps)).toBe(true);
    expect(/color/.test(report.rootProps) || report.rootProps === "all").toBe(true);
    expect(report.rootDur).toBeGreaterThan(0);
    // instant targets: no transition, no animation
    for (const t of report.instantTargets) {
      expect(t.noTransition, JSON.stringify(t)).toBe(true);
      expect(t.animationName).toBe("none");
    }
    // chevron: transform present, no color-related property with duration > 0
    expect(/transform/.test(report.chevProps), report.chevProps).toBe(true);
    if (report.chevDur > 0) {
      expect(/color/.test(report.chevProps)).toBe(false);
    }
    expect(report.groupAnimations).toBe(0);
  });
}
