import { expect, test, type Page } from "@playwright/test";
import { type ConcreteRow } from "@/app/help/_affordanceMatrix";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";
import { allWalkableRows, prepKindFor, routeForPure, walksAt } from "./helpers/walkerRoutes";

const BASE_URL = "http://localhost:3004";
const HELP_DOCS_WIZARD_SESSION_ID = "22222222-2222-4222-8222-222222222222";

// Fixed staged_id of the locked-seed first-seen fixture row. The walker is
// READ-ONLY on locked tables (plan-wide invariant 2): the pending_syncs row
// is seeded by the locked seed extension with
// drive_file_id = "seed-fixture:walker-first-seen" — never written here.
const FIRST_SEEN_STAGED_ID = "11111111-1111-4111-8111-111111111111";

// Base-seed RPAS fixture slug (scripts/help-screenshots.manifest.ts:26). The
// matrix's `rpas-central-2026` sourceRoute segment is only a placeholder
// TOKEN; the real seeded slug is looked up — pinned, not latest-by-sync —
// so an unrelated newer show can't hijack the walker's fixture routes.
const FIXTURE_SHOW_SLUG = "2026-03-retirement-plan-advisor-institute-central-2026";

type FixtureShow = {
  id: string;
  slug: string;
  drive_file_id: string;
};

type FixtureCrew = {
  id: string;
};

let fixtureShowPromise: Promise<FixtureShow> | null = null;
let fixtureCrewPromise: Promise<FixtureCrew> | null = null;

async function setDashboardAdminState(): Promise<void> {
  const { error } = await admin
    .from("app_settings")
    .update({
      watched_folder_id: "seed-fixture-folder",
      watched_folder_name: "Seed fixture folder",
      watched_folder_set_by_email: "seed-mode@fxav.local",
      watched_folder_set_at: "2026-01-01T12:00:00.000Z",
      pending_folder_id: null,
      pending_folder_name: null,
      pending_folder_set_by_email: null,
      pending_folder_set_at: null,
      pending_wizard_session_id: null,
      pending_wizard_session_at: null,
    })
    .eq("id", "default");
  if (error) throw new Error(`deep-link walker dashboard state failed: ${error.message}`);
}

async function setWizardAdminState(): Promise<void> {
  const { error } = await admin
    .from("app_settings")
    .update({
      watched_folder_id: null,
      watched_folder_name: null,
      watched_folder_set_by_email: null,
      watched_folder_set_at: null,
      pending_folder_id: null,
      pending_folder_name: null,
      pending_folder_set_by_email: null,
      pending_folder_set_at: null,
      pending_wizard_session_id: HELP_DOCS_WIZARD_SESSION_ID,
      pending_wizard_session_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) throw new Error(`deep-link walker wizard state failed: ${error.message}`);
}

async function prepareAdminState(row: ConcreteRow): Promise<void> {
  switch (prepKindFor(row.sourceRoute, row.testid)) {
    case "wizard":
      await setWizardAdminState();
      return;
    case "dashboard":
      await setDashboardAdminState();
      return;
    case "none":
      return;
  }
}

async function fixtureShow(): Promise<FixtureShow> {
  fixtureShowPromise ??= (async () => {
    const { data, error } = await admin
      .from("shows")
      .select("id, slug, drive_file_id")
      .eq("slug", FIXTURE_SHOW_SLUG)
      .limit(1);
    if (error) throw new Error(`fixture show lookup failed: ${error.message}`);
    const row = data?.[0];
    if (!row?.id || !row.slug || !row.drive_file_id) {
      throw new Error(
        `Seeded show ${FIXTURE_SHOW_SLUG} not found for deep-link walker fixture routes — re-run \`pnpm db:seed\``,
      );
    }
    return row;
  })();
  return fixtureShowPromise;
}

async function fixtureCrew(showId: string): Promise<FixtureCrew> {
  fixtureCrewPromise ??= (async () => {
    const { data, error } = await admin
      .from("crew_members")
      .select("id")
      .eq("show_id", showId)
      .order("name", { ascending: true })
      .limit(1);
    if (error) throw new Error(`fixture crew lookup failed: ${error.message}`);
    const row = data?.[0];
    if (!row?.id) {
      throw new Error(`No seeded crew member found for show ${showId}`);
    }
    return row;
  })();
  return fixtureCrewPromise;
}

// Pure READ-ONLY lookup of the locked-seed first-seen staged row. Loud-throws
// when the seeded row (fixed staged_id, invariant FIRST_SEEN_REVIEW,
// wizard_session_id null) is absent — the walker never writes pending_syncs
// (structural pin: tests/help/walker-routes.test.ts).
async function firstSeenStagedId(): Promise<string> {
  const { data, error } = await admin
    .from("pending_syncs")
    .select("staged_id, triggered_review_items")
    .eq("staged_id", FIRST_SEEN_STAGED_ID)
    .is("wizard_session_id", null);
  if (error) throw new Error(`pending_syncs first-seen lookup failed: ${error.message}`);

  const row = data?.[0];
  const items = row?.triggered_review_items;
  const hasFirstSeenInvariant =
    Array.isArray(items) &&
    items.some((item) => {
      if (item === null || typeof item !== "object") return false;
      return (item as { invariant?: unknown }).invariant === "FIRST_SEEN_REVIEW";
    });

  if (!row?.staged_id || !hasFirstSeenInvariant) {
    throw new Error(
      `Seeded first-seen pending_syncs row absent (staged_id ${FIRST_SEEN_STAGED_ID}, ` +
        `invariant FIRST_SEEN_REVIEW, wizard_session_id null). The locked seed extension ` +
        `(drive_file_id "seed-fixture:walker-first-seen") must land before the walker runs — ` +
        `re-run \`pnpm db:seed\``,
    );
  }
  return row.staged_id;
}

// Thin async wrapper: resolve real fixture values for the placeholder TOKENS
// a row actually uses, then delegate to the pure substitution in
// helpers/walkerRoutes.ts (the Vitest-pinned derivation).
async function routeFor(row: ConcreteRow): Promise<string> {
  const needsShow = row.sourceRoute.includes("rpas-central-2026");
  const needsCrew = row.sourceRoute.includes("eric-weiss");
  const needsStaged = row.sourceRoute.includes("STAGED_ID_PLACEHOLDER");
  const show = needsShow ? await fixtureShow() : null;
  return routeForPure(row, {
    slug: show?.slug ?? "",
    crewId: needsCrew && show ? (await fixtureCrew(show.id)).id : "",
    stagedId: needsStaged ? await firstSeenStagedId() : "",
  });
}

async function assertTarget(page: Page, root: ReturnType<Page["getByTestId"]>, row: ConcreteRow) {
  const directHref = await root.getAttribute("href");
  if (directHref) {
    const direct = new URL(directHref, BASE_URL);
    expect(`${direct.pathname}${direct.hash}`, `${row.testid} direct href`).toBe(row.target);
    return;
  }

  // HelpSheet arm: a trigger that opens a modal SHEET (button[aria-haspopup=
  // "dialog"]). The sheet PORTALS to <body>, so the nested Learn-more link is
  // NOT under `root` — after opening, resolve it inside the open dialog. Checked
  // BEFORE the HoverHelp arm because a HelpSheet trigger also carries
  // aria-expanded, and its click must not be double-toggled.
  const sheetTrigger = root.locator('button[aria-haspopup="dialog"]').first();
  let scope: ReturnType<Page["locator"]> = root;
  if ((await sheetTrigger.count()) > 0) {
    await sheetTrigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog, `${row.testid} sheet opens`).toBeVisible();
    scope = dialog;
  } else {
    // HoverHelp arm: a tooltip whose disclosure is a button[aria-expanded]
    // trigger (HoverHelp pattern). Click reveals the panel so the nested
    // Learn-more link below becomes resolvable.
    const hoverTrigger = root.locator("button[aria-expanded]").first();
    if ((await hoverTrigger.count()) > 0) {
      await hoverTrigger.click();
      // Playwright's mouse click moves the pointer onto the trigger first, so
      // HoverHelp's mouse-only pointerenter (hover-open) fires BEFORE the click
      // toggle — net result: open-by-hover, then toggle → closed. Real inputs
      // don't hit this (hover-readers don't click; touch taps don't hover;
      // keyboard toggles without a pointer). If the state settled closed, click
      // once more — the pointer is already inside, so no second pointerenter
      // fires and the toggle lands open.
      try {
        await expect(hoverTrigger).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
      } catch {
        await hoverTrigger.click();
      }
      // Portaled body (hoverhelp-smart-position §4.1): the popover is no
      // longer a DOM descendant of the affordance root — resolve it via the
      // root wrapper's aria-owns and search the Learn-more link THERE.
      const ownsId = await root.getAttribute("aria-owns");
      if (ownsId) {
        scope = page.locator(`[id=${JSON.stringify(ownsId)}]`);
      }
    }

    const summary = root.locator("summary").first();
    if ((await summary.count()) > 0) {
      await summary.click();
    }
  }

  const nested = scope
    .locator("a")
    .filter({ hasText: /Learn more|New here\?/i })
    .first();
  await expect(nested, `${row.testid} nested link`).toBeVisible();
  const nestedHref = await nested.getAttribute("href");
  expect(nestedHref, `${row.testid} nested href`).not.toBeNull();
  const url = new URL(nestedHref!, BASE_URL);
  expect(`${url.pathname}${url.hash}`, `${row.testid} nested href`).toBe(row.target);
}

test("AFFORDANCE_MATRIX has walkable rows including the first-seen staged route", () => {
  expect(allWalkableRows.length).toBeGreaterThan(0);
  expect(allWalkableRows.some((row) => row.sourceRoute.includes("STAGED_ID_PLACEHOLDER"))).toBe(
    true,
  );
});

for (const row of allWalkableRows) {
  test(`${row.testid} resolves on ${row.sourceRoute}`, async ({ page }) => {
    const vp = test.info().project.name === "help-docs-desktop" ? "desktop" : "mobile";
    test.skip(!walksAt(row, vp), `visibleAt=${row.visibleAt} — not walked at ${vp}`);

    await prepareAdminState(row);
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE_URL });
    const sourceRoute = await routeFor(row);
    const response = await page.goto(sourceRoute, { waitUntil: "domcontentloaded" });
    expect(response?.ok(), `${sourceRoute} should load`).toBe(true);

    const root = page.getByTestId(row.testid);
    await expect(root, `${row.testid} should be visible on ${sourceRoute}`).toBeVisible();
    await assertTarget(page, root, row);
  });
}

// Gap fix (2026-07-17): the "Recently auto-applied" strip must sit directly
// beneath the Needs-attention inbox (no detached band). Originally this guarded
// an `h-full` inbox root that ballooned inside the items-stretch-stretched
// sidebar column. The two-col split is now a grid with `items-start` (2026-07-17
// ignored-sheets order fix): the inbox column is content-sized, NEVER stretched
// to a taller shows column, so the ballooning condition can no longer arise — the
// strip follows the inbox by content flow. The assertion is therefore now a
// direct adjacency check (strip top ≈ inbox bottom + the wrapper's gap-3), which
// still fails loudly on any future layout that detaches the strip. Real-browser
// only (jsdom can't compute layout). Reuses the help-docs locked seeds:
// walker-first-seen pending_syncs populates the inbox, the sentinel auto_apply
// show_change_log renders the strip — NO new DB write here. Desktop-only (the
// inbox column is hidden below 720px; this spec also runs the mobile help-docs
// project).
test("recently-auto-applied strip sits directly beneath the needs-attention inbox (no gap)", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "help-docs-desktop",
    "desktop-only dashboard two-column layout",
  );
  await setDashboardAdminState();
  await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE_URL });
  const response = await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  expect(response?.ok(), "/admin should load").toBe(true);

  const inbox = page.getByTestId("needs-attention-inbox");
  const strip = page.getByTestId("recent-auto-applied-strip");
  await expect(inbox, "populated inbox present").toBeVisible();
  await expect(strip, "strip present").toBeVisible();
  // OK-path proof (not the infra_error fallback, whose header also carries the ?):
  await expect(page.getByTestId("recent-auto-applied-count-chip")).toBeVisible();
  await expect(page.getByTestId("auto-applied-error")).toHaveCount(0);

  // Also force the shows column tall (DOM-only, no DB write) to reproduce the
  // real-world long-Active-shows condition that used to stretch the sidebar and
  // detach the strip. Under the grid+items-start split this must NOT propagate to
  // the inbox column (it stays content-sized) — so the strip stays adjacent to the
  // inbox regardless. Fail loud if the target is missing (future testid rename).
  const forced = await page.evaluate(() => {
    const col = document.querySelector('[data-testid="dashboard-shows-col"]');
    if (!(col instanceof HTMLElement)) return false;
    col.style.minHeight = "2000px";
    return true;
  });
  expect(forced, "dashboard-shows-col must exist to induce the tall-shows-column condition").toBe(
    true,
  );
  await expect(strip).toBeVisible();

  const inboxBox = await inbox.boundingBox();
  const stripBox = await strip.boundingBox();
  expect(inboxBox, "inbox has a box").not.toBeNull();
  expect(stripBox, "strip has a box").not.toBeNull();
  // THE FIX (adjacency): the strip sits DIRECTLY beneath the inbox — its top is at
  // the inbox bottom plus only the wrapper's gap-3 (12px). The detached-band
  // regression (an h-full inbox ballooning in a stretched column, or any layout
  // that re-parents/strands the strip) would push this to hundreds/~1500px. A
  // small band tolerates sub-pixel rounding + the 12px flex gap without admitting
  // a real gap. Even with the shows column forced to 2000px, items-start keeps the
  // inbox column content-sized so this stays tight.
  const gap = stripBox!.y - (inboxBox!.y + inboxBox!.height);
  expect(
    gap,
    `strip top - inbox bottom = ${Math.round(gap)}px — the strip must follow the inbox ` +
      `content (≈ gap-3 = 12px), not detach into a band below a stretched column`,
  ).toBeLessThanOrEqual(20);
  expect(gap, "strip must not overlap the inbox").toBeGreaterThanOrEqual(-2);
});
