import { expect, test, type Page } from "@playwright/test";
import { AFFORDANCE_MATRIX, type ConcreteRow } from "@/app/help/_affordanceMatrix";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { seedLinkSession } from "./helpers/seedLinkSession";
import { signInAs } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const BASE_URL = "http://localhost:3004";

const concreteRows = AFFORDANCE_MATRIX.filter((row): row is ConcreteRow =>
  row.kind === "concrete",
);

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

async function fixtureShow(): Promise<FixtureShow> {
  fixtureShowPromise ??= (async () => {
    const { data, error } = await admin
      .from("shows")
      .select("id, slug, drive_file_id")
      .order("last_synced_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`fixture show lookup failed: ${error.message}`);
    const row = data?.[0];
    if (!row?.id || !row.slug || !row.drive_file_id) {
      throw new Error("No seeded show found for deep-link walker fixture routes");
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

async function firstSeenStagedId(): Promise<string> {
  const stagedId = "11111111-1111-4111-8111-111111111111";
  const driveFileId = "g5-first-seen-fixture";
  const { error: deleteError } = await admin
    .from("pending_syncs")
    .delete()
    .eq("drive_file_id", driveFileId);
  if (deleteError) {
    throw new Error(`pending_syncs first-seen cleanup failed: ${deleteError.message}`);
  }

  const { error: insertError } = await admin.from("pending_syncs").insert({
    drive_file_id: driveFileId,
    staged_id: stagedId,
    staged_modified_time: "2026-03-24T15:00:00.000Z",
    base_modified_time: null,
    parse_result: {
      show: {
        title: "G.5 First-seen affordance fixture",
      },
    },
    triggered_review_items: [
      {
        id: "g5-first-seen",
        invariant: "FIRST_SEEN_REVIEW",
      },
    ],
    source_kind: "cron",
    warning_summary: "First-seen review fixture for deep-link affordance walker",
  });
  if (insertError) {
    throw new Error(`pending_syncs first-seen insert failed: ${insertError.message}`);
  }

  const { data, error } = await admin
    .from("pending_syncs")
    .select("staged_id, triggered_review_items")
    .is("wizard_session_id", null);
  if (error) throw new Error(`pending_syncs lookup failed: ${error.message}`);

  const row = (data ?? []).find((candidate) => {
    const items = candidate.triggered_review_items;
    return (
      Array.isArray(items) &&
      items.some((item) => {
        if (item === null || typeof item !== "object") return false;
        const invariant = (item as { invariant?: unknown }).invariant;
        return invariant === "FIRST_SEEN_REVIEW" || invariant === "ONBOARDING_SCAN_REVIEW";
      })
    );
  });

  if (!row?.staged_id) {
    throw new Error("No first-seen staged_id found in seeded pending_syncs fixture");
  }
  return row.staged_id;
}

async function routeFor(row: ConcreteRow): Promise<string> {
  if (row.sourceRoute.includes("STAGED_ID_PLACEHOLDER")) {
    return row.sourceRoute.replace("STAGED_ID_PLACEHOLDER", await firstSeenStagedId());
  }

  const show = await fixtureShow();
  if (row.sourceRoute === "/admin/show/rpas-central-2026") {
    return `/admin/show/${show.slug}`;
  }
  if (row.sourceRoute === "/admin/show/rpas-central-2026/preview/eric-weiss") {
    const crew = await fixtureCrew(show.id);
    return `/admin/show/${show.slug}/preview/${crew.id}`;
  }

  return row.sourceRoute;
}

async function assertTarget(root: ReturnType<Page["getByTestId"]>, row: ConcreteRow) {
  const directHref = await root.getAttribute("href");
  if (directHref) {
    const direct = new URL(directHref, BASE_URL);
    expect(`${direct.pathname}${direct.hash}`, `${row.testid} direct href`).toBe(row.target);
    return;
  }

  const summary = root.locator("summary").first();
  if ((await summary.count()) > 0) {
    await summary.click();
  }

  const nested = root.locator("a").filter({ hasText: /Learn more|Take the tour/i }).first();
  await expect(nested, `${row.testid} nested link`).toBeVisible();
  const nestedHref = await nested.getAttribute("href");
  expect(nestedHref, `${row.testid} nested href`).not.toBeNull();
  const url = new URL(nestedHref!, BASE_URL);
  expect(`${url.pathname}${url.hash}`, `${row.testid} nested href`).toBe(row.target);
}

test("AFFORDANCE_MATRIX has concrete rows including the first-seen staged route", () => {
  expect(concreteRows.length).toBeGreaterThan(0);
  expect(
    concreteRows.some((row) => row.sourceRoute.includes("STAGED_ID_PLACEHOLDER")),
  ).toBe(true);
});

for (const row of concreteRows) {
  test(`${row.testid} resolves on ${row.sourceRoute}`, async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE_URL });
    const sourceRoute = await routeFor(row);
    const response = await page.goto(sourceRoute, { waitUntil: "domcontentloaded" });
    expect(response?.ok(), `${sourceRoute} should load`).toBe(true);

    const root = page.getByTestId(row.testid);
    await expect(root, `${row.testid} should be visible on ${sourceRoute}`).toBeVisible();
    await assertTarget(root, row);
  });
}

test("negative row: crew page renders no admin help affordance testids", async ({ page }) => {
  const show = await fixtureShow();
  const crew = await fixtureCrew(show.id);

  const { cookieValue } = await seedLinkSession({
    showId: show.id,
    crewMemberId: crew.id,
  });

  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: cookieValue,
      url: BASE_URL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const response = await page.goto(`/show/${show.slug}`, { waitUntil: "domcontentloaded" });
  expect(response?.ok(), `/show/${show.slug} should load`).toBe(true);
  await expect(page.locator('[data-testid^="help-affordance--"]')).toHaveCount(0);
});
