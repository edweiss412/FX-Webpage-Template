/**
 * tests/e2e/staged-preview.spec.ts (AC-6)
 *
 * Real-browser proof for the staged crew preview
 * (docs/superpowers/specs/step3-onboarding/2026-08-15-step3-crew-preview-and-opslog-disposition-design.md §2.1).
 *
 * Four things only a real server + browser can settle:
 *   1. the banner and the REAL crew page render together, at 390px and 1280px,
 *      in light and dark;
 *   2. picker navigation switches the identity line (landing on the default
 *      section by design, §2.3);
 *   3. the page emits ZERO requests to /api/report, /api/realtime/ or
 *      /api/asset/ — the browser half of AC-2 (the jsdom half scans the HTML for
 *      dormant references a network capture cannot see);
 *   4. a real segment throw routes to THIS segment's error.tsx, not the admin
 *      layout catch and not Next's generic error page. jsdom can render the
 *      boundary component but can never exercise Next's segment ROUTING.
 *
 * Seeding goes through the shared `helpers/stagedSync.ts` pair (the ONE staged
 * seed/cleanup in tests/e2e), with a parse_result carrying >= 2 crew members so
 * the picker has something to switch between.
 *
 * Force-fail mechanics for arm 4 are that file's verbatim: ENABLE_TEST_AUTH +
 * TEST_AUTH_SECRET + `Authorization: Bearer <secret>` + header
 * `x-test-force-infra-fail: page` makes PAGE gates throw while the layout gate
 * (layer:"layout") falls through to normal cookie auth.
 */
import { test, expect, type Page } from "@playwright/test";

import { clearStagedFor, insertStagedFor } from "./helpers/stagedSync";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";

const FORCE_HEADERS = {
  "x-test-force-infra-fail": "page",
  authorization: "Bearer fxav-m3-test-auth-2026-DO-NOT-SHIP",
} as const;

const DRIVE_FILE_ID = "seed-fixture:staged-crew-preview-e2e";

/** Crew names the seeded parse_result carries, in surrogate-id order. */
const CREW = [
  { name: "Dana Lead", role: "Technical Director", flags: ["LEAD"] },
  { name: "Ravi Stage", role: "A1", flags: ["A1"] },
] as const;

const SHOW_DAYS = ["2026-06-24", "2026-06-25"];

function seededParseResult(): Record<string, unknown> {
  return {
    show: {
      title: "Staged Preview E2E",
      client_label: "Northwind",
      client_contact: null,
      template_version: "v4",
      venue: { name: "Grand Hall", address: "1 Main St" },
      dates: {
        travelIn: "2026-06-22",
        set: "2026-06-23",
        showDays: SHOW_DAYS,
        travelOut: "2026-06-26",
      },
      schedule_phases: { "2026-06-24": ["Show"], "2026-06-25": ["Show", "Strike"] },
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: CREW.map((c) => ({
      name: c.name,
      email: null,
      phone: null,
      role: c.role,
      role_flags: [...c.flags],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    hardErrors: [],
  };
}

/** Readiness gate: the page's OWN testid, never networkidle alone. */
async function awaitPreview(page: Page): Promise<void> {
  await expect(page.getByTestId("staged-preview-banner")).toBeVisible();
  await expect(page.getByTestId("crew-shell")).toBeVisible();
}

test.describe("staged crew preview (AC-6)", () => {
  let stagedId: string;

  test.beforeEach(async ({ page }) => {
    await clearStagedFor(DRIVE_FILE_ID);
    stagedId = await insertStagedFor(DRIVE_FILE_ID, seededParseResult());
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  test.afterEach(async () => {
    await clearStagedFor(DRIVE_FILE_ID);
  });

  for (const width of [390, 1280]) {
    for (const theme of ["light", "dark"] as const) {
      test(`renders the banner and the real crew page at ${width}px, ${theme}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/admin/wizard/preview/${stagedId}`);
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        await awaitPreview(page);

        await expect(page.getByTestId("staged-preview-banner-title")).toHaveText(
          "Previewing from the sheet (not published yet)",
        );
        await expect(page.getByTestId("staged-preview-banner-identity")).toContainText(
          CREW[0].name,
        );
        // No failure surface reached this render.
        await expect(page.getByTestId("staged-preview-infra-error")).toHaveCount(0);
        await expect(page.getByTestId("staged-preview-decode-error")).toHaveCount(0);
      });
    }
  }

  test("picker navigation switches the identity line to the other crew member", async ({
    page,
  }) => {
    await page.goto(`/admin/wizard/preview/${stagedId}`);
    await awaitPreview(page);
    await expect(page.getByTestId("staged-preview-banner-identity")).toContainText(CREW[0].name);

    await page.getByTestId("staged-preview-picker-link").first().click();
    await awaitPreview(page);
    await expect(page.getByTestId("staged-preview-banner-identity")).toContainText(CREW[1].name);
    // The switched-to entry is now the non-link current entry.
    await expect(page.getByTestId("staged-preview-picker-current")).toContainText(CREW[1].name);
  });

  test("Back to setup returns to /admin", async ({ page }) => {
    await page.goto(`/admin/wizard/preview/${stagedId}`);
    await awaitPreview(page);
    await page.getByTestId("staged-preview-banner-exit").click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("emits no request to /api/report, /api/realtime/ or /api/asset/ (AC-2 browser half)", async ({
    page,
  }) => {
    const forbidden: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/\/api\/report|\/api\/realtime\/|\/api\/asset\//.test(url)) forbidden.push(url);
    });

    await page.goto(`/admin/wizard/preview/${stagedId}`);
    await awaitPreview(page);
    // Switch viewer too: a second render must stay silent as well.
    await page.getByTestId("staged-preview-picker-link").first().click();
    await awaitPreview(page);

    expect(forbidden, `forbidden requests: ${forbidden.join(", ")}`).toEqual([]);

    // POSITIVE CONTROL (diff review round 1): the assertion above is negative-only,
    // so a detached listener or a narrowed pattern would keep it green forever.
    // Drive one request that MUST match, and require the same listener to record it.
    forbidden.length = 0;
    await page.request.get("/api/report").catch(() => undefined);
    await page.evaluate(async () => {
      await fetch("/api/report", { method: "GET" }).catch(() => undefined);
    });
    expect(
      forbidden.length,
      "the request listener + pattern must fire on a real hit",
    ).toBeGreaterThan(0);
  });

  test("a real segment throw routes to THIS segment's error.tsx", async ({ page }) => {
    await page.setExtraHTTPHeaders({ ...FORCE_HEADERS });
    await page.goto(`/admin/wizard/preview/${stagedId}`);

    await expect(page.getByTestId("staged-preview-render-error")).toBeVisible();
    // Negative-regression flip: neither the admin LAYOUT catch nor the admin
    // catch-all page boundary may be what rendered.
    await expect(page.getByTestId("admin-layout-infra-error")).toHaveCount(0);
    await expect(page.getByTestId("admin-route-error-boundary")).toHaveCount(0);
  });
});
