/**
 * tests/e2e/stackedBandLayout.spec.ts
 * (spec docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md §9.2/§9.4)
 *
 * Real-browser geometry for the stacked mobile band at 390x844. Reuses the
 * skeleton-parity harness page and measures the LOADED strip. Worst-case
 * strings come from the REAL producers (syncStatusBucket + formatRelative) —
 * never hardcoded; the typical-state comparison restores the fixture's own
 * initially-rendered strings (anti-tautology, spec §9.2).
 */
import { test, expect } from "./helpers/fontFidelityFixture";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { syncStatusBucket } from "../../lib/admin/syncStatus";
import { formatRelative } from "../../lib/admin/showDisplay";
import { compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");
// Derived, never literal: longest catalog label + the longest minute-form
// relative string the producer can emit.
const WORST_HEALTH = syncStatusBucket("shrink_held").label;
const NOW = new Date("2026-07-24T12:00:00Z");
const WORST_EDITED = `Edited ${formatRelative(new Date(NOW.getTime() - 59 * 60_000).toISOString(), NOW)}`;

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  const workDir = mkdtempSync(join(tmpdir(), "stacked-band-"));
  const jsonPath = join(workDir, "page.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_skeletonParityHarness.tsx"), jsonPath],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, HASH_FOR_LOG_PEPPER: "test-harness-pepper-000000000000000000" },
    },
  );
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as { page: string };
  writeFileSync(
    join(workDir, "parity.html"),
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head><body class="bg-bg">${parsed.page}</body></html>`,
  );
  const entryCss = join(workDir, "entry.css");
  writeFileSync(
    entryCss,
    `@source "${join(workDir, "parity.html")}";\n` +
      readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"),
  );
  compileEntryCss({ entryCss: entryCss, outFile: join(workDir, "out.css") });
  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "parity.html" : url.replace(/^\//, "");
    try {
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(readFileSync(join(workDir, file)));
    } catch {
      res.statusCode = 404;
      res.end("nf");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

const S = (name: string) => `[data-parity="loaded"] [data-testid="${name}"]`;
// The strip's slot. Named BAND from when it was the subheader band; it is
// the footer since the dock (spec 2026-08-25-review-modal-strip-dock §3.1).
// The name is kept because every assertion below is about the STRIP's row
// and reads correctly either way — renaming would churn the whole file to
// say the same thing.
const BAND = `[data-parity="loaded"] [data-testid="published-show-review-footer"]`;

async function open390(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await expect(page.locator(S("show-status-strip"))).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

type Box = {
  name: string;
  top: number;
  bottom: number;
  height: number;
  right: number;
  width: number;
};

const MEASURED = [
  "strip-state-badge-row",
  "strip-state-badge",
  "strip-publish-toggle",
  "strip-divider-1",
  "strip-sync-age",
  "admin-resync-button",
  "strip-divider-2",
  "share-hub-group",
  "share-hub-root",
  "share-hub-primary",
  "share-hub-kebab",
] as const;

async function boxes(page: Page): Promise<Record<string, Box>> {
  const out: Record<string, Box> = {};
  for (const name of MEASURED) {
    const r = await page
      .locator(S(name))
      .evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    out[name] = {
      name,
      top: r.top,
      bottom: r.bottom,
      height: r.height,
      right: r.right,
      width: r.width,
    };
  }
  return out;
}

/** Group measured elements into disjoint vertical bands (shared line = overlap). */
function membership(all: Record<string, Box>, names: readonly string[]): string[] {
  const sorted = names.map((n) => all[n]!).sort((a, b) => a.top - b.top);
  const lines: Box[][] = [];
  for (const b of sorted) {
    const line = lines.find((l) => l.some((o) => b.top < o.bottom - 0.5 && o.top < b.bottom - 0.5));
    if (line) line.push(b);
    else lines.push([b]);
  }
  return lines.map((l) =>
    l
      .map((b) => b.name)
      .sort()
      .join("+"),
  );
}

async function readStatusText(page: Page): Promise<{ health: string; edited: string }> {
  return await page.evaluate(
    ({ syncedSel, editedSel }) => ({
      health: (document.querySelector(syncedSel) as HTMLElement).textContent ?? "",
      edited: (document.querySelector(editedSel) as HTMLElement | null)?.textContent ?? "",
    }),
    { syncedSel: S("strip-synced-line"), editedSel: S("strip-edited-age") },
  );
}

async function setStatusText(page: Page, health: string, edited: string): Promise<void> {
  await page.evaluate(
    ({ h, e, syncedSel, editedSel }) => {
      (document.querySelector(syncedSel) as HTMLElement).textContent = h;
      const ed = document.querySelector(editedSel) as HTMLElement | null;
      if (ed) ed.textContent = e;
    },
    { h: health, e: edited, syncedSel: S("strip-synced-line"), editedSel: S("strip-edited-age") },
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

test("rows, caps, clip priority, containment — worst-case vs fixture-typical", async ({ page }) => {
  await open390(page);
  const fixtureText = await readStatusText(page); // the producers' own rendered output
  await setStatusText(page, WORST_HEALTH, WORST_EDITED);
  const worst = await boxes(page);

  // (a) Row membership: four disjoint bands in spec §3 order (dividers are
  // their own 1px lines between them).
  const rowNames = [
    "strip-state-badge-row",
    "strip-publish-toggle",
    "strip-divider-1",
    "strip-sync-age",
    "admin-resync-button",
    "strip-divider-2",
    "share-hub-group",
  ] as const;
  expect(membership(worst, rowNames)).toEqual([
    "strip-state-badge-row",
    "strip-publish-toggle",
    "strip-divider-1",
    "admin-resync-button+strip-sync-age",
    "strip-divider-2",
    "share-hub-group",
  ]);

  // (b) Heights (spec §4): badge pill fixed 24±1; dividers 1±0.5; R1/R2-union/
  // R3 rows in [44,48]; sync-age fits inside its row (no vertical overflow).
  expect(worst["strip-state-badge"]!.height).toBeGreaterThanOrEqual(23);
  expect(worst["strip-state-badge"]!.height).toBeLessThanOrEqual(25);
  for (const d of ["strip-divider-1", "strip-divider-2"] as const) {
    expect(worst[d]!.height, d).toBeGreaterThan(0);
    expect(worst[d]!.height, d).toBeLessThanOrEqual(1.5);
  }
  expect(worst["strip-publish-toggle"]!.height).toBeGreaterThanOrEqual(44);
  expect(worst["strip-publish-toggle"]!.height).toBeLessThanOrEqual(48);
  const r2Top = Math.min(worst["strip-sync-age"]!.top, worst["admin-resync-button"]!.top);
  const r2Bottom = Math.max(worst["strip-sync-age"]!.bottom, worst["admin-resync-button"]!.bottom);
  expect(r2Bottom - r2Top).toBeGreaterThanOrEqual(44);
  expect(r2Bottom - r2Top).toBeLessThanOrEqual(48);
  expect(worst["strip-sync-age"]!.height).toBeLessThanOrEqual(r2Bottom - r2Top + 0.5);
  for (const n of [
    "share-hub-group",
    "share-hub-primary",
    "share-hub-kebab",
    "admin-resync-button",
  ] as const) {
    expect(worst[n]!.height, n).toBeGreaterThanOrEqual(44);
    expect(worst[n]!.height, n).toBeLessThanOrEqual(48);
  }

  // (c) Tap widths: Sync + kebab >= 44 wide (switch is pseudo-extended by
  // existing design and EXCLUDED here — spec §9.2.d).
  expect(worst["admin-resync-button"]!.width).toBeGreaterThanOrEqual(44);
  expect(worst["share-hub-kebab"]!.width).toBeGreaterThanOrEqual(44);

  // (d) Containment: no horizontal overflow at the band root AND every
  // measured child's right edge inside the band content edge (+0.5).
  const band = await page.locator(BAND).evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const contentLeft = r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const contentRight = r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    return {
      contentLeft,
      contentRight,
      contentWidth: contentRight - contentLeft,
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    };
  });
  expect(band.scrollW).toBe(band.clientW);
  for (const name of MEASURED) {
    expect(worst[name]!.right, `${name} right edge`).toBeLessThanOrEqual(band.contentRight + 0.5);
  }

  // (d2) Full-width chain + anchor datum (spec §3 R3): group == root width
  // within 0.5px, and the group/kebab right edges sit at the band content
  // edge — the popover anchor datum survives the mobile layout.
  // Every link fills the BAND CONTENT WIDTH — equal widths alone would also
  // pass a half-width right-aligned chain (plan R3 finding 2).
  expect(Math.abs(worst["share-hub-group"]!.width - band.contentWidth)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(worst["share-hub-root"]!.width - band.contentWidth)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(worst["share-hub-group"]!.right - band.contentRight)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(worst["share-hub-kebab"]!.right - band.contentRight)).toBeLessThanOrEqual(1);

  // (e) Clip priority: the health label's own box never clips.
  const health = await page
    .locator(S("strip-synced-line"))
    .evaluate((el) => ({ scrollW: el.scrollWidth, clientW: el.clientWidth }));
  expect(health.scrollW).toBeLessThanOrEqual(health.clientW + 1);

  // (f) Determinism: restore the fixture's own producer-rendered strings —
  // IDENTICAL membership and heights (fails on today's wrap layout).
  await setStatusText(page, fixtureText.health, fixtureText.edited);
  const typical = await boxes(page);
  expect(membership(typical, rowNames)).toEqual(membership(worst, rowNames));
  for (const name of MEASURED) {
    expect(Math.abs(typical[name]!.height - worst[name]!.height), name).toBeLessThanOrEqual(0.5);
  }
});

test("badge flush + single state signal + accessible names per breakpoint", async ({ page }) => {
  await open390(page);
  const badgeRight = await page
    .locator(S("strip-state-badge"))
    .evaluate((el) => el.getBoundingClientRect().right);
  const contentRight = await page.locator(BAND).evaluate((el) => {
    const cs = getComputedStyle(el);
    return (
      el.getBoundingClientRect().right -
      parseFloat(cs.paddingRight) -
      parseFloat(cs.borderRightWidth)
    );
  });
  expect(Math.abs(badgeRight - contentRight)).toBeLessThanOrEqual(1);
  await expect(page.locator(S("strip-live-badge"))).not.toBeVisible();
  const loaded = page.locator(`[data-parity="loaded"]`);
  await expect(loaded.getByRole("button", { name: "Sync" })).toBeVisible();
  await expect(loaded.getByRole("switch", { name: "Published" })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await expect(page.locator(S("strip-state-badge"))).not.toBeVisible();
  await expect(page.locator(S("strip-live-badge"))).toBeVisible();
  await expect(loaded.getByRole("button", { name: "Re-sync" })).toBeVisible();
  await expect(loaded.getByRole("switch", { name: "Published" })).toBeVisible();
});
