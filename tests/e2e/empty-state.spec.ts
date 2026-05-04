/**
 * Playwright E2E suite for AC-4.5 (M4 Task 4.14): empty-state discipline +
 * §10 opening-reel URL-strip render contract.
 *
 * Closes AC-4.5 with seven scenarios that drive the seeded show through
 * mutations of `event_details` (a JSONB column on `shows`) and assert the
 * crew-page DOM enforces the §10 invariants:
 *
 *   - Crew DOM MUST NEVER contain `https://`, `drive.google.com`, or
 *     `docs.google.com` substrings for any opening_reel cell — even
 *     when the raw spreadsheet cell does (URLs strip at render).
 *   - At M4 the page MUST NOT render any `<video src="/api/asset/reel/…">`
 *     element. Inline-video rendering ships in M7 Task 7.6.
 *   - Sentinel handling differs per field: `TBD` always hides;
 *     opening_reel KEEPS `N/A`/`MAYBE`/`TBA`/`BACKUP ONLY` (named §10
 *     statuses), generic optional fields HIDE `N/A`/`TBA`.
 *
 * Mutation pattern mirrors notes-tile.spec.ts: snapshot the show's
 * `event_details` in beforeAll, restore in afterAll, reset to baseline
 * in beforeEach so per-test mutations don't leak.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

type Snapshot = {
  slug: string;
  showId: string;
  leadCrewId: string;
  /** Original event_details JSONB on shows. */
  originalEventDetails: Record<string, string>;
};

async function snapshot(): Promise<Snapshot> {
  const showRes = await admin
    .from("shows")
    .select("id, slug, event_details")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (showRes.error || !showRes.data) {
    throw new Error(`empty-state.spec: seed show not found`);
  }
  const showId = showRes.data.id as string;

  const crewRes = await admin
    .from("crew_members")
    .select("id, role_flags")
    .eq("show_id", showId);
  if (crewRes.error || !crewRes.data?.length) {
    throw new Error(`empty-state.spec: no crew rows`);
  }
  const lead = crewRes.data.find(
    (c) =>
      Array.isArray(c.role_flags) &&
      (c.role_flags as string[]).includes("LEAD"),
  );
  if (!lead) throw new Error(`empty-state.spec: no LEAD`);

  return {
    slug: showRes.data.slug as string,
    showId,
    leadCrewId: lead.id as string,
    originalEventDetails:
      (showRes.data.event_details as Record<string, string> | null) ?? {},
  };
}

/** Replace event_details with a patched copy (preserves keys we don't mutate). */
async function setEventDetails(
  s: Snapshot,
  patch: Record<string, string | null>,
): Promise<void> {
  const merged: Record<string, string> = { ...s.originalEventDetails };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  const res = await admin
    .from("shows")
    .update({ event_details: merged })
    .eq("id", s.showId);
  if (res.error) throw new Error(`setEventDetails failed: ${res.error.message}`);
}

async function restore(s: Snapshot): Promise<void> {
  const res = await admin
    .from("shows")
    .update({ event_details: s.originalEventDetails })
    .eq("id", s.showId);
  if (res.error) throw new Error(`restore failed: ${res.error.message}`);
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — empty-state discipline + §10 URL-strip (Task 4.14, AC-4.5)", () => {
  let s: Snapshot;

  test.beforeAll(async () => {
    s = await snapshot();
  });

  test.afterAll(async () => {
    await restore(s);
  });

  test.beforeEach(async () => {
    // Reset to baseline before each test so mutations don't leak.
    await restore(s);
  });

  test("opening_reel = 'TBD' renders NO opening-reel row (hide sentinel)", async ({
    page,
  }) => {
    // Task 4.14 review fix-round: ShowStatusTile renders opening-reel as
    // `<dt>Opening reel</dt><dd>{value}</dd>` (no inline `Opening reel:`
    // prefix in the <dd> after the dt/dd cleanup). Assert via the
    // testid scope rather than the literal "Opening reel:" substring —
    // the testid is the canonical AC-4.5 contract surface.
    await setEventDetails(s, { opening_reel: "TBD" });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const main = page.locator("main");
    await expect(main).toBeVisible();
    await expect(page.getByTestId("opening-reel")).toHaveCount(0);
  });

  test("opening_reel ∈ {YES, MAYBE, N/A, TBA, BACKUP ONLY} all render the line", async ({
    page,
  }) => {
    // §10 named statuses — must be visible on the crew page.
    for (const value of ["YES", "MAYBE", "N/A", "TBA", "BACKUP ONLY"]) {
      await setEventDetails(s, { opening_reel: value });
      await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
      const reel = page.getByTestId("opening-reel");
      await expect(reel).toBeVisible();
      await expect(reel).toContainText(value);
    }
  });

  test("URL-strip regression: 'YES - <drive-url>' renders 'YES'; DOM has no https/drive.google.com", async ({
    page,
  }) => {
    await setEventDetails(s, {
      opening_reel: "YES - https://drive.google.com/file/d/abc/view",
    });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const reel = page.getByTestId("opening-reel");
    await expect(reel).toContainText("YES");

    // Crew DOM MUST NEVER contain Drive URLs (§10).
    const main = page.locator("main");
    const text = (await main.textContent()) ?? "";
    expect(text).not.toContain("https://");
    expect(text).not.toContain("drive.google.com");

    // M4 ships URL-stripped TEXT only — NO inline <video> element.
    await expect(page.locator('video[src*="/api/asset/reel/"]')).toHaveCount(0);
  });

  test("pure-URL cell renders NO line; DOM has no https/drive.google.com", async ({
    page,
  }) => {
    await setEventDetails(s, {
      opening_reel: "https://drive.google.com/file/d/abc/view",
    });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const main = page.locator("main");
    // Task 4.14 review fix-round: assert no opening-reel row by testid
    // (matches the dt/dd pattern), then assert no Drive URL leakage in
    // any rendered text.
    await expect(page.getByTestId("opening-reel")).toHaveCount(0);
    const text = (await main.textContent()) ?? "";
    expect(text).not.toContain("https://");
    expect(text).not.toContain("drive.google.com");
  });

  test("'LOOP VIDEO - <docs-url>' renders 'LOOP VIDEO'; DOM has no docs.google.com", async ({
    page,
  }) => {
    await setEventDetails(s, {
      opening_reel:
        "LOOP VIDEO - https://docs.google.com/document/d/abc/edit",
    });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const reel = page.getByTestId("opening-reel");
    await expect(reel).toContainText("LOOP VIDEO");

    const main = page.locator("main");
    const text = (await main.textContent()) ?? "";
    expect(text).not.toContain("docs.google.com");
    expect(text).not.toContain("https://");
  });

  test("M4 page MUST NOT render any `<video src=/api/asset/reel/...>` element (deferred to M7)", async ({
    page,
  }) => {
    // Even with the seed value (which IS a Drive URL pointing at a reel),
    // M4 ships text-only. M7 Task 7.6 will add the inline element.
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    await expect(page.locator('video[src*="/api/asset/reel/"]')).toHaveCount(0);
  });

  test("event_details.power = 'N/A' hides the field; 'House power, 20A' renders it", async ({
    page,
  }) => {
    // Hide branch: N/A is a generic-optional sentinel. Task 4.14 review
    // fix-round (Minor 1): assert via testid rather than the brittle
    // `^Power:|\sPower:` regex — the dt/dd cleanup means the rendered
    // textContent reads "Power House power…" with no colon, and the
    // testid is the canonical contract surface.
    await setEventDetails(s, { power: "N/A" });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    await expect(page.getByTestId("power")).toHaveCount(0);

    // Render branch: real content shows up.
    await setEventDetails(s, { power: "House power, 20A" });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    const power = page.getByTestId("power");
    await expect(power).toBeVisible();
    await expect(power).toContainText("House power, 20A");
    const text = (await page.locator("main").textContent()) ?? "";
    expect(text).toContain("House power, 20A");
  });
});
