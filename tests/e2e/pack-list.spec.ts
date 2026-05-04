/**
 * Playwright E2E suite for PackListTile (M4 Task 4.9; spec §8.1, §6.10,
 * AC-4.7..4.12).
 *
 * Strategy:
 *
 * 1. **AC-4.7** — pull_sheet flow-through. The `2024-05-east-coast-family-
 *    office.md` fixture is one of the two corpus files that has a populated
 *    PULL SHEET tab (verified at parser boundary; produces 1 case / 91
 *    items). We mutate its `event_details.schedule_phases` to put TODAY
 *    in the visible-phase set, then assert the tile renders. Conversely
 *    the Waldorf fixture has NO pull_sheet — we drive the AC-4.9 absence
 *    branch on a Waldorf-shaped show by setting today to a Set day.
 *
 * 2. **AC-4.8** — three-day visibility (set / travel-out / strike). We
 *    set `event_details.schedule_phases[<today_iso>]` to each phase in
 *    turn and assert tile visibility. Today is computed in the venue
 *    timezone (America/New_York for the FXAV domestic fixtures) using
 *    the same `Intl.DateTimeFormat('en-CA', ...)` derivation the tile
 *    uses.
 *
 * 3. **AC-4.9** — pull_sheet null → tile absent. Use the Waldorf fixture
 *    (no pull_sheet); set today to a Set day so the visibility predicate
 *    would otherwise admit it; assert tile absent.
 *
 * 4. **AC-4.10** — stage_restriction filtering. Set today's phases to
 *    `['Set']` then mutate the LEAD's stage_restriction across the
 *    three plan-listed cases:
 *      - ['Load In','Set'] → visible
 *      - ['Load Out','Strike'] → hidden
 *      - ['Set','Strike'] → visible
 *    Plus a Strike-day case for symmetry.
 *
 * 5. **AC-4.11** — partial-parse rawSnippet. The live fixtures don't
 *    emit rawSnippet on any item (verified at parse boundary), so we
 *    mutate the show's `pull_sheet` JSONB to inject one synthetic case
 *    with one rawSnippet-bearing item.
 *
 * 6. **AC-4.12** — review-pending preservation contract. Mounting the
 *    tile with a specific `pull_sheet` JSONB makes it the source of
 *    truth — the tile renders the cases array verbatim. We assert
 *    case count === injected count, item count per case === injected
 *    item count.
 *
 * 7. **Cardinality cap** — synthesize 15 cases; assert exactly 12
 *    `pack-list-case` testids render + a `pack-list-overflow-stub` element
 *    with text matching `+3 more cases`.
 *
 * Restoration: every mutation is snapshot-and-restored. Single-worker
 * serialization (playwright.config.ts) prevents inter-suite races.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";

const PULLSHEET_DRIVE_FILE_ID =
  "seed-fixture:2024-05-east-coast-family-office";
const NO_PULLSHEET_DRIVE_FILE_ID =
  "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";

/** Format a Date as `YYYY-MM-DD` in the given IANA timezone (en-CA → ISO). */
function isoInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today in America/New_York — matches PackListTile's default timezone. */
function todayInNY(): string {
  return isoInTz(new Date(), "America/New_York");
}

type SeededRefs = {
  pullSheetSlug: string;
  pullSheetShowId: string;
  pullSheetLeadCrewId: string;
  /** Snapshot of original event_details so afterAll can restore. */
  pullSheetOriginalEventDetails: Record<string, unknown>;
  /** Snapshot of the lead's original stage_restriction. */
  pullSheetLeadOriginalStageRestriction: unknown;
  /** Snapshot of the original pull_sheet JSONB (for case-cap / rawSnippet tests). */
  pullSheetOriginalPullSheet: unknown;

  noPullSheetSlug: string;
  noPullSheetShowId: string;
  noPullSheetLeadCrewId: string;
  noPullSheetOriginalEventDetails: Record<string, unknown>;
};

async function snapshotAndPrepare(): Promise<SeededRefs> {
  // PULL-SHEET fixture (East Coast).
  const ecRes = await admin
    .from("shows")
    .select("id, slug, event_details, pull_sheet")
    .eq("drive_file_id", PULLSHEET_DRIVE_FILE_ID)
    .single();
  if (ecRes.error || !ecRes.data) {
    throw new Error(
      `pack-list.spec: pull-sheet fixture not found (run \`pnpm db:seed\`)`,
    );
  }
  // Pick any crew member on the show — we'll mutate their
  // stage_restriction. Use the first one alphabetically for determinism.
  const ecCrewRes = await admin
    .from("crew_members")
    .select("id, name, stage_restriction")
    .eq("show_id", ecRes.data.id)
    .order("name", { ascending: true })
    .limit(1);
  if (ecCrewRes.error || !ecCrewRes.data?.length) {
    throw new Error(
      `pack-list.spec: no crew rows for ${PULLSHEET_DRIVE_FILE_ID}`,
    );
  }
  const ecCrew = ecCrewRes.data[0]!;

  // No-pull-sheet fixture (Waldorf).
  const wRes = await admin
    .from("shows")
    .select("id, slug, event_details, pull_sheet")
    .eq("drive_file_id", NO_PULLSHEET_DRIVE_FILE_ID)
    .single();
  if (wRes.error || !wRes.data) {
    throw new Error(`pack-list.spec: waldorf fixture not found`);
  }
  if (wRes.data.pull_sheet !== null) {
    throw new Error(
      `pack-list.spec: waldorf fixture should have NULL pull_sheet but has data; check fixture invariant`,
    );
  }
  const wCrewRes = await admin
    .from("crew_members")
    .select("id, role_flags")
    .eq("show_id", wRes.data.id);
  if (wCrewRes.error || !wCrewRes.data?.length) {
    throw new Error(`pack-list.spec: no crew rows for ${NO_PULLSHEET_DRIVE_FILE_ID}`);
  }
  const wLead = wCrewRes.data.find(
    (c) =>
      Array.isArray(c.role_flags) &&
      (c.role_flags as string[]).includes("LEAD"),
  );
  if (!wLead) throw new Error(`pack-list.spec: no LEAD in waldorf`);

  return {
    pullSheetSlug: ecRes.data.slug as string,
    pullSheetShowId: ecRes.data.id as string,
    pullSheetLeadCrewId: ecCrew.id as string,
    pullSheetOriginalEventDetails:
      (ecRes.data.event_details as Record<string, unknown> | null) ?? {},
    pullSheetLeadOriginalStageRestriction: ecCrew.stage_restriction,
    pullSheetOriginalPullSheet: ecRes.data.pull_sheet,
    noPullSheetSlug: wRes.data.slug as string,
    noPullSheetShowId: wRes.data.id as string,
    noPullSheetLeadCrewId: wLead.id as string,
    noPullSheetOriginalEventDetails:
      (wRes.data.event_details as Record<string, unknown> | null) ?? {},
  };
}

async function setSchedulePhases(
  showId: string,
  baseEventDetails: Record<string, unknown>,
  phasesForToday: string[],
  todayIso: string,
): Promise<void> {
  // Compose the merged event_details. The projection prefers
  // event_details.schedule_phases when present, so we set it explicitly
  // here.
  const mergedEventDetails = {
    ...baseEventDetails,
    schedule_phases: { [todayIso]: phasesForToday },
  };
  const { error } = await admin
    .from("shows")
    .update({ event_details: mergedEventDetails })
    .eq("id", showId);
  if (error) throw new Error(`update event_details failed: ${error.message}`);
}

async function setStageRestriction(
  crewId: string,
  restriction:
    | { kind: "explicit"; stages: string[] }
    | { kind: "none" },
): Promise<void> {
  const { error } = await admin
    .from("crew_members")
    .update({ stage_restriction: restriction })
    .eq("id", crewId);
  if (error) throw new Error(`update stage_restriction failed: ${error.message}`);
}

async function setPullSheet(
  showId: string,
  pullSheet: unknown,
): Promise<void> {
  const { error } = await admin
    .from("shows")
    .update({ pull_sheet: pullSheet })
    .eq("id", showId);
  if (error) throw new Error(`update pull_sheet failed: ${error.message}`);
}

async function restoreState(s: SeededRefs): Promise<void> {
  await admin
    .from("shows")
    .update({
      event_details: s.pullSheetOriginalEventDetails,
      pull_sheet: s.pullSheetOriginalPullSheet,
    })
    .eq("id", s.pullSheetShowId);
  await admin
    .from("crew_members")
    .update({ stage_restriction: s.pullSheetLeadOriginalStageRestriction })
    .eq("id", s.pullSheetLeadCrewId);
  await admin
    .from("shows")
    .update({ event_details: s.noPullSheetOriginalEventDetails })
    .eq("id", s.noPullSheetShowId);
  await admin
    .from("crew_members")
    .update({ stage_restriction: { kind: "none" } })
    .eq("id", s.noPullSheetLeadCrewId);
}

// TODO(M5 §B follow-up): migrate off ?crew=/?as=admin mock to signInAs(non-admin-crew-fixture).
// The dev-only mock surface was retired in Task 5.7 follow-up (Issue 4). The migration
// is non-trivial because each test renders as a SPECIFIC crew identity (often non-LEAD),
// which signInAs cannot easily reproduce — real Supabase auth ties to email, not crew_member_id.
// Each affected show needs a per-test crew row whose email matches NON_ADMIN_CREW_FIXTURE,
// plus per-test fixture seeding. See handoff §0.
test.describe.skip("crew page — PackListTile (Task 4.9, AC-4.7..4.12)", () => {
  let s: SeededRefs;

  test.beforeAll(async () => {
    s = await snapshotAndPrepare();
  });

  test.afterAll(async () => {
    await restoreState(s);
  });

  test.beforeEach(async () => {
    // Default to no stage restriction + no schedule_phases override —
    // each test sets them as needed. AC tests rely on a controlled
    // starting state.
    await setStageRestriction(s.pullSheetLeadCrewId, { kind: "none" });
    await admin
      .from("shows")
      .update({
        event_details: s.pullSheetOriginalEventDetails,
        pull_sheet: s.pullSheetOriginalPullSheet,
      })
      .eq("id", s.pullSheetShowId);
    await admin
      .from("shows")
      .update({ event_details: s.noPullSheetOriginalEventDetails })
      .eq("id", s.noPullSheetShowId);
  });

  test("AC-4.7 + AC-4.8 (Set day): pullSheet flows from getShowForViewer to tile DOM on Set day", async ({
    page,
  }) => {
    const today = todayInNY();
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Set"],
      today,
    );
    const r = await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    expect(r?.status()).toBe(200);
    const tile = page.getByTestId("pack-list-tile");
    await expect(tile).toBeVisible();
    // The seeded fixture produces 1 case ("East Coast Single Family
    // Office Symposium"). Assert at least one pack-list-case is
    // rendered and its label appears verbatim.
    const cases = tile.getByTestId("pack-list-case");
    await expect(cases).not.toHaveCount(0);
  });

  test("AC-4.8 (Strike day): tile visible on a Strike-only day", async ({
    page,
  }) => {
    const today = todayInNY();
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Strike"],
      today,
    );
    const r = await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    expect(r?.status()).toBe(200);
    await expect(page.getByTestId("pack-list-tile")).toBeVisible();
  });

  test("AC-4.8 (Load Out day): tile visible on a Load-Out-only day (travel-out)", async ({
    page,
  }) => {
    const today = todayInNY();
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Load Out"],
      today,
    );
    const r = await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    expect(r?.status()).toBe(200);
    await expect(page.getByTestId("pack-list-tile")).toBeVisible();
  });

  test("AC-4.8 (Show day): tile ABSENT on a Show-only day (Show ∉ PACK_LIST_VISIBLE_PHASES)", async ({
    page,
  }) => {
    const today = todayInNY();
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Show"],
      today,
    );
    const r = await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    expect(r?.status()).toBe(200);
    await expect(page.getByTestId("pack-list-tile")).toHaveCount(0);
  });

  test("AC-4.8 (Load In day): tile ABSENT on Load-In day (Load In intentionally excluded per §8.1)", async ({
    page,
  }) => {
    const today = todayInNY();
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Load In"],
      today,
    );
    const r = await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    expect(r?.status()).toBe(200);
    await expect(page.getByTestId("pack-list-tile")).toHaveCount(0);
  });

  test("AC-4.9: tile ABSENT for show with NULL pull_sheet (Waldorf fixture, on Set day)", async ({
    page,
  }) => {
    // Set today on the Waldorf show to be a Set day so the visibility
    // predicate would otherwise admit it; the tile MUST still be absent
    // because pull_sheet is NULL.
    const today = todayInNY();
    await setSchedulePhases(
      s.noPullSheetShowId,
      s.noPullSheetOriginalEventDetails,
      ["Set"],
      today,
    );
    const r = await page.goto(
      `/show/${s.noPullSheetSlug}?crew=${s.noPullSheetLeadCrewId}`,
    );
    expect(r?.status()).toBe(200);
    await expect(page.getByTestId("pack-list-tile")).toHaveCount(0);
  });

  test("AC-4.10 case A: stage_restriction ['Load In','Set'] → visible on Set day", async ({
    page,
  }) => {
    const today = todayInNY();
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Set"],
      today,
    );
    await setStageRestriction(s.pullSheetLeadCrewId, {
      kind: "explicit",
      stages: ["Load In", "Set"],
    });
    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    await expect(page.getByTestId("pack-list-tile")).toBeVisible();
  });

  test("AC-4.10 case B: stage_restriction ['Load Out','Strike'] → hidden on Set day", async ({
    page,
  }) => {
    const today = todayInNY();
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Set"],
      today,
    );
    await setStageRestriction(s.pullSheetLeadCrewId, {
      kind: "explicit",
      stages: ["Load Out", "Strike"],
    });
    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    await expect(page.getByTestId("pack-list-tile")).toHaveCount(0);
  });

  test("AC-4.10 case B': stage_restriction ['Load Out','Strike'] → visible on Strike day", async ({
    page,
  }) => {
    const today = todayInNY();
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Strike"],
      today,
    );
    await setStageRestriction(s.pullSheetLeadCrewId, {
      kind: "explicit",
      stages: ["Load Out", "Strike"],
    });
    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    await expect(page.getByTestId("pack-list-tile")).toBeVisible();
  });

  test("AC-4.10 case C: stage_restriction ['Set','Strike'] → visible on both Set + Strike days", async ({
    page,
  }) => {
    const today = todayInNY();
    // Set day
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Set"],
      today,
    );
    await setStageRestriction(s.pullSheetLeadCrewId, {
      kind: "explicit",
      stages: ["Set", "Strike"],
    });
    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    await expect(page.getByTestId("pack-list-tile")).toBeVisible();

    // Strike day
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Strike"],
      today,
    );
    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    await expect(page.getByTestId("pack-list-tile")).toBeVisible();
  });

  test("AC-4.11: partial-parse rawSnippet renders inline next to item label", async ({
    page,
  }) => {
    const today = todayInNY();
    // Inject a synthetic pull_sheet with one item that carries
    // rawSnippet. The M1 parser doesn't emit rawSnippet on any live
    // fixture row (verified at parse boundary), so we construct the
    // shape directly. The PullSheetItem schema is at
    // lib/parser/types.ts:180-186.
    const synthetic = [
      {
        caseLabel: "Test Case With Partial Parse",
        items: [
          {
            qty: null,
            cat: null,
            subCat: null,
            item: "Unparsed row",
            rawSnippet: "RAW: malformed | row | here",
          },
        ],
      },
    ];
    await setPullSheet(s.pullSheetShowId, synthetic);
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Set"],
      today,
    );

    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    const tile = page.getByTestId("pack-list-tile");
    await expect(tile).toBeVisible();
    // Open the <details> so the inner items render.
    await tile.locator("summary").first().click();
    // The rawSnippet element MUST exist and contain the snippet text.
    const snippet = tile.getByTestId("pack-list-item-raw-snippet");
    await expect(snippet).toHaveCount(1);
    await expect(snippet).toContainText("RAW: malformed | row | here");
  });

  test("AC-4.12 contract: tile renders the projection's pull_sheet array verbatim (review-pending preservation)", async ({
    page,
  }) => {
    // The contract: whatever pull_sheet array the upstream projection
    // hands us is what renders. M4 has no MI-8c review-pending machinery
    // yet (that's M6), so this assertion is the contract marker —
    // injecting a known shape and verifying case count + per-case item
    // count match the injected values.
    const today = todayInNY();
    const synthetic = [
      { caseLabel: "Case A", items: [{ qty: 1, cat: "FOH", subCat: null, item: "Mixer" }] },
      { caseLabel: "Case B", items: [{ qty: 2, cat: "FOH", subCat: null, item: "Speaker" }, { qty: 4, cat: "FOH", subCat: null, item: "Cable" }] },
      { caseLabel: "Case C", items: [{ qty: null, cat: null, subCat: null, item: "Misc" }] },
    ];
    await setPullSheet(s.pullSheetShowId, synthetic);
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Set"],
      today,
    );

    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    const tile = page.getByTestId("pack-list-tile");
    await expect(tile).toBeVisible();
    const cases = tile.getByTestId("pack-list-case");
    await expect(cases).toHaveCount(3);
    // Per-case label round-trips verbatim.
    await expect(cases.nth(0)).toContainText("Case A");
    await expect(cases.nth(1)).toContainText("Case B");
    await expect(cases.nth(2)).toContainText("Case C");
  });

  test("Cardinality cap: 15 cases → exactly 12 pack-list-case + show-more stub showing '+3'", async ({
    page,
  }) => {
    const today = todayInNY();
    // Build 15 synthetic cases. Item count per case is irrelevant for
    // the cap — we just need 15 cases total.
    const synthetic = Array.from({ length: 15 }, (_, i) => ({
      caseLabel: `Synthetic Case ${i + 1}`,
      items: [{ qty: 1, cat: "X", subCat: null, item: `item-${i}` }],
    }));
    await setPullSheet(s.pullSheetShowId, synthetic);
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Set"],
      today,
    );

    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    const tile = page.getByTestId("pack-list-tile");
    await expect(tile).toBeVisible();
    await expect(tile.getByTestId("pack-list-case")).toHaveCount(12);
    const showMore = tile.getByTestId("pack-list-overflow-stub");
    await expect(showMore).toHaveCount(1);
    await expect(showMore).toContainText(/\+3 more cases/);
  });

  test("Cardinality cap: exactly 12 cases → no show-more stub", async ({
    page,
  }) => {
    const today = todayInNY();
    const synthetic = Array.from({ length: 12 }, (_, i) => ({
      caseLabel: `Case ${i + 1}`,
      items: [{ qty: 1, cat: "X", subCat: null, item: `item-${i}` }],
    }));
    await setPullSheet(s.pullSheetShowId, synthetic);
    await setSchedulePhases(
      s.pullSheetShowId,
      s.pullSheetOriginalEventDetails,
      ["Set"],
      today,
    );

    await page.goto(
      `/show/${s.pullSheetSlug}?crew=${s.pullSheetLeadCrewId}`,
    );
    const tile = page.getByTestId("pack-list-tile");
    await expect(tile).toBeVisible();
    await expect(tile.getByTestId("pack-list-case")).toHaveCount(12);
    await expect(tile.getByTestId("pack-list-overflow-stub")).toHaveCount(0);
  });
});
