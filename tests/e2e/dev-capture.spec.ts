/**
 * tests/e2e/dev-capture.spec.ts — dev-modal-capture spec §3.4/§9 e2e.
 *
 * Visibility (dev/non-dev, real app through the real layout provider) plus the
 * §3.4 full-content proof: both inner panes overflowed, one sentinel div at the
 * bottom of each, capture downloaded, PNG pixel-scanned for BOTH sentinel
 * colors, telemetry JSON shape-checked and redaction-checked against the REAL
 * seeded crew email and the REAL 64-hex share token.
 *
 * Sentinels are injected in the SAME evaluate tick as the capture click —
 * React reconciliation wipes foreign pane children injected earlier
 * (SPIKE.md operational finding 1).
 *
 * Runs in the desktop-chromium project (playwright.config.ts testMatch) at
 * ≥ lg viewport — the section rail is `hidden lg:flex`.
 */
import "./helpers/loadTestEnv";
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { PNG } from "pngjs";
import { signInAs, signOut } from "./helpers/signInAs";
import { ADMIN_FIXTURE, NORMAL_ADMIN_FIXTURE } from "./helpers/fixtures";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";
import { seedStagedRow, cleanupStagedRow, openStep3Modal } from "./helpers/devCaptureStaged";

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.beforeAll(async () => {
  show = await seedShowWithCrew();
  restoreDashboardState = await settleDashboardAdminState();
});

test.afterAll(async () => {
  await deleteSeededShow(show.driveFileId);
  await restoreDashboardState?.();
});

/** Effect-flush hydration gate (published-review-modal.interactions:104-120
 *  pattern): synthetic clicks before the shell's initial-focus effect are
 *  silently lost — wait for focus to land on the modal close button. */
async function awaitModalHydrated(page: Page): Promise<void> {
  // Loaded frame, not the streaming skeleton twin (both carry the panel data
  // attribute — crew-actions.spec.ts:18-22 pattern): anchor on the title.
  const loaded = `[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])`;
  await expect(page.locator(loaded)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`[data-testid="published-show-review-modal"]`)).toHaveCount(1);
  await expect
    .poll(
      () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid),
      { message: "modal effect flush (initial focus applied)" },
    )
    .toBe("published-show-review-close");
}

const RAIL_RGB = "rgb(255, 0, 254)";
const CONTENT_RGB = "rgb(1, 255, 0)";

/** Inject filler + sentinel at the bottom of both panes (same-tick rule). */
async function injectSentinels(page: Page): Promise<void> {
  await page.evaluate(
    ({ rail, content }) => {
      const panel =
        document.querySelector("[data-review-modal-panel]") ??
        document.querySelector("[data-step3-review-panel]");
      if (!panel) throw new Error("no panel");
      const railEl = panel.querySelector('[data-testid$="-review-rail"]');
      const contentEl = panel.querySelector('[data-testid$="-review-content"]');
      if (!railEl || !contentEl) throw new Error("panes missing");
      const mk = (h: number, color?: string) => {
        const d = document.createElement("div");
        d.style.height = `${h}px`;
        d.style.flexShrink = "0";
        if (color) {
          d.style.width = "120px";
          d.style.backgroundColor = color;
        }
        return d;
      };
      railEl.appendChild(mk(2000));
      railEl.appendChild(mk(24, rail));
      contentEl.appendChild(mk(3000));
      contentEl.appendChild(mk(24, content));
    },
    { rail: RAIL_RGB, content: CONTENT_RGB },
  );
}

function countPixels(png: PNG, rgb: string): number {
  const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(rgb);
  if (!m) throw new Error("bad rgb");
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let hits = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (
      Math.abs((png.data[i] ?? 0) - r) <= 2 &&
      Math.abs((png.data[i + 1] ?? 0) - g) <= 2 &&
      Math.abs((png.data[i + 2] ?? 0) - b) <= 2
    ) {
      hits += 1;
    }
  }
  return hits;
}

async function captureAndUnzip(
  page: Page,
  clickCapture: () => Promise<void>,
): Promise<{ png: PNG; telemetry: Record<string, unknown>; rawJson: string }> {
  await injectSentinels(page);
  const downloadPromise = page.waitForEvent("download");
  await clickCapture();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^dev-capture-[a-z0-9-]+-\d{8}-\d{6}\.zip$/);
  const path = await download.path();
  const entries = unzipSync(new Uint8Array(readFileSync(path)));
  expect(Object.keys(entries).sort()).toEqual(["screenshot.png", "telemetry.json"]);
  const rawJson = strFromU8(entries["telemetry.json"]!);
  return {
    png: PNG.sync.read(Buffer.from(entries["screenshot.png"]!)),
    telemetry: JSON.parse(rawJson) as Record<string, unknown>,
    rawJson,
  };
}

test.describe("dev-capture full-content proof + redaction (spec §3.4/§4.4)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("published: both sentinels in the PNG; telemetry shape; no email, no share token", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto(`/admin?show=${show.slug}`);
    await awaitModalHydrated(page);
    await page.getByTestId("share-hub-kebab").click();
    await expect(page.getByTestId("share-hub-dev-capture")).toBeVisible();
    const { png, telemetry, rawJson } = await captureAndUnzip(page, async () => {
      await page.getByTestId("share-hub-dev-capture").click();
    });
    expect(countPixels(png, RAIL_RGB)).toBeGreaterThanOrEqual(1);
    expect(countPixels(png, CONTENT_RGB)).toBeGreaterThanOrEqual(1);
    expect(Object.keys(telemetry).sort()).toEqual(["clientSnapshot", "meta", "server"]);
    const meta = telemetry["meta"] as Record<string, unknown>;
    expect(meta["modalKind"]).toBe("published");
    expect(meta["driveFileId"]).toBeNull();
    const snap = telemetry["clientSnapshot"] as Record<string, unknown>;
    expect(snap["slug"]).toBe(show.slug);
    // Hard secret-exclusion (§4.4): the REAL token and the REAL seeded email.
    expect(rawJson).not.toContain(show.shareToken);
    for (const member of show.crew) {
      if (member.email !== null) expect(rawJson).not.toContain(member.email);
    }
    await signOut(page);
  });

  test("staged: full sentinel acceptance on the wizard Step3 modal", async ({ page }) => {
    // Seed a first-seen staged row (admin-parse-panel.spec.ts:76-93 pattern
    // via the shared helper below), open the wizard Step3 review modal.
    // Sign in FIRST: signInAs recreates the fixture auth user, and user
    // bootstrap touches app_settings — seeding before it gets trampled.
    await signInAs(page, ADMIN_FIXTURE);
    const dfid = await seedStagedRow();
    try {
      await openStep3Modal(page, dfid);
      const { png, telemetry } = await captureAndUnzip(page, async () => {
        await page.getByTestId(`wizard-step3-card-${dfid}-dev-capture`).click();
      });
      expect(countPixels(png, RAIL_RGB)).toBeGreaterThanOrEqual(1);
      expect(countPixels(png, CONTENT_RGB)).toBeGreaterThanOrEqual(1);
      const meta = telemetry["meta"] as Record<string, unknown>;
      expect(meta["modalKind"]).toBe("staged");
      expect(meta["showId"]).toBeNull();
      expect(meta["driveFileId"]).toBe(dfid);
      await signOut(page);
    } finally {
      await cleanupStagedRow(dfid);
    }
  });
});

test.describe("dev-capture visibility (spec §2.1-§2.3)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("developer sees the kebab capture row in the published modal", async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto(`/admin?show=${show.slug}`);
    await awaitModalHydrated(page);
    await page.getByTestId("share-hub-kebab").click();
    await expect(page.getByTestId("share-hub-dev-capture")).toBeVisible();
    await signOut(page);
  });

  test("non-developer admin never sees the capture affordances", async ({ page }) => {
    await signInAs(page, NORMAL_ADMIN_FIXTURE);
    await page.goto(`/admin?show=${show.slug}`);
    await awaitModalHydrated(page);
    await page.getByTestId("share-hub-kebab").click();
    await expect(page.getByTestId("share-hub-popover")).toBeVisible();
    await expect(page.getByTestId("share-hub-dev-capture")).toHaveCount(0);
    await signOut(page);
  });
});
