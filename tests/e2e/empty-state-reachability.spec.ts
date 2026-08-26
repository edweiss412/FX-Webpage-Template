/**
 * Playwright E2E reachability proof for the §8.3 empty-state catalog
 * (M9 Task 9.3 / AC-9.2), re-targeted 2026-08-25 onto the redesigned
 * CrewShell (BL-E2E-EMPTY-STATE-REACHABILITY-RETIRED-ROUTE; spec
 * docs/superpowers/specs/2026-08-25-e2e-proof-retired-route-subpixel-design.md).
 *
 * WHAT CHANGED AND WHY. The previous version navigated `/show/<slug>`, a
 * route the M11.5 picker pivot retired, and waited on four testids
 * (`venue-tile`, `show-status-tile`, `tile-grid`, `lodging-tile`) that the
 * six-section redesign retired with it — none of them appears anywhere under
 * `app/`, `components/` or `lib/`. Every case failed at `toBeVisible` after
 * the goto, so the catalog had no live proof at all. It also carried four
 * `toHaveScreenshot` assertions against `*-darwin.png` baselines, which the
 * byte-comparison discipline forbids on a native Linux runner; the §8.3
 * contract is a DOM contract, so each is now expressed as behaviour.
 *
 * §8.3 categories, each mapped to the surface that ACTUALLY renders it:
 *
 *   1. Required-field-missing — `shows.dates` emptied. ScheduleSection
 *      renders the canonical placeholder INSIDE the still-rendered section
 *      (components/crew/sections/ScheduleSection.tsx:315-317).
 *
 *      DOCUMENTED LIMIT, recorded here because it is a fact about the catalog
 *      and not about this file. Master spec §8.3 says a missing REQUIRED field
 *      renders a placeholder rather than an empty card, and names the venue
 *      name as its example. The redesigned venue surface does not do that: a
 *      null `venue.name` reflows the row out through KeyValueRows' sentinel-
 *      hiding (components/crew/primitives/KeyValueRows.tsx:67), which is the
 *      OPTIONAL-field treatment, and the only EmptyState in VenueSection.tsx
 *      is the SECTION-level one at :471-475 gated on `allHidden` (:319), which
 *      any other venue content keeps false. So a crew member can see a Venue
 *      section with diagrams, no venue name, and no signal.
 *
 *      That is a §8.3 violation, not something §8.3 permits. Repairing it is a
 *      components/ change that arms invariant 8, and the placeholder's WORDING
 *      is itself unsettled — §8.3's literal copy was rejected in design review
 *      for naming Doug to the crew (components/atoms/EmptyState.tsx). Eric
 *      ruled on 2026-08-25 that this arc records the gap and ships as tests +
 *      CI config only; per the same directive it mints no ledger row. Full
 *      disposition and re-file trigger: the 2026-08-25 spec §7.4.
 *
 *      Category 1 is therefore proven on the schedule surface, which is the one
 *      crew surface where §8.3's per-field idiom still lives.
 *
 *   2. Optional-field-missing — `event_details.power` set to `TBD`. The
 *      generic-optional dispatch (lib/visibility/emptyState.ts, applied at
 *      VenueSection.tsx:189-190) drops the row entirely; no "—", no "TBD".
 *      Asserted in BOTH directions in one case, so it cannot pass on a
 *      section that failed to render.
 *
 *   3. Whole-tile-missing — the show's `hotel_reservations` rows are removed,
 *      so `hasHotels` (TravelSection.tsx:390) is false and the hotels card
 *      returns nothing while the section reflows around it. Asserted in BOTH
 *      directions, since a missing card and a broken section look identical
 *      from a single `toHaveCount(0)`.
 *
 *      NOT by viewer identity, which is what the retired version did. The
 *      redesign's Travel section renders EVERY `hotelReservations[]` entry
 *      (TravelSection.tsx:15, :387) rather than the viewer's own, so "the
 *      viewer is not named on a reservation" no longer changes what renders
 *      and would have made this case pass for the wrong reason.
 *
 *   4. Stale-sync — `shows.last_checked_at` >6h old with
 *      `last_sync_status='ok'`. StaleFooter renders the red
 *      SYNC_DELAYED_SEVERE footer (components/shared/StaleFooter.tsx:114-116).
 *
 * ROUTE + AUTH. `/show/[slug]/[shareToken]` is the only crew route and
 * `shareToken` is a REQUIRED path segment, so it is resolved from
 * `show_share_tokens` at suite start (the pattern in crew-page.spec.ts:248).
 *
 * ADMIN_FIXTURE, for the reason crew-page.spec.ts:1347-1349 records: the
 * `admin` arm of resolveShowPageAccess renders the full CrewShell for the
 * seeded crew route REGARDLESS of the picker cookie. A crew identity cannot
 * be used here — on plain http WebKit refuses to store the `__Host-`-prefixed
 * Secure picker envelope (playwright.config.ts:65-73), so the route bounces
 * through `/api/auth/picker-bootstrap` and no shell ever mounts. Measured on
 * the first run of this rewrite: all four cases failed at `crew-shell` with
 * NON_ADMIN_CREW_FIXTURE, on exactly that redirect.
 *
 * None of the four contracts is viewer-scoped: dates, the venue power row,
 * the hotels card and the stale footer are all show-level, so the admin arm
 * observes the same §8.3 behaviour a crew viewer would.
 *
 * FIXTURE ISOLATION, and the reason this suite cannot mutate the shared seed.
 * `getShowForViewer` reads through `cachedShowData` (lib/data/getShowForViewer.ts:961),
 * an `unstable_cache` entry tagged per show with `revalidate: 300`
 * (lib/data/showCacheTag.ts:6). The tag is busted by the app's own write paths
 * (`revalidateShow`, :34), so a test that writes to Postgres DIRECTLY leaves the
 * cache untouched and the next render serves the pre-write projection for up to
 * five minutes. Measured on run 2 of this rewrite: after emptying `shows.dates`
 * the schedule section still rendered its day cards, and after deleting the
 * reservations the hotels card was still there. Nothing about the assertions was
 * wrong; the page had simply not read the database.
 *
 * So each case COPIES the seed show into a fresh row with its own id, slug,
 * drive_file_id and share token, applies its mutation to that copy BEFORE the
 * first navigation, and deletes it afterwards. A fresh show id is a fresh cache
 * key, so the first render is necessarily the mutated state. Both-direction
 * cases make two copies rather than mutating one twice.
 *
 * This also removes every write to the shared Waldorf seed, so the suite is no
 * longer a contender for the single-writer contention that motivates
 * `workers: 1` (playwright.config.ts:35-49).
 *
 * PROJECT. mobile-safari ONLY: §8.4 makes the crew page mobile-primary, and the
 * admin arm that this suite needs renders there (see ROUTE + AUTH). Running one
 * behaviour suite twice buys no coverage.
 *
 * ANTI-TAUTOLOGY (AGENTS.md). Every expected value comes from the fixture or
 * from the component that owns it, never from a literal transcribed off a
 * render. Every case asserts the section root separately from the identity
 * under test, so "the page did not render" can never read as "the empty state
 * is correct". Categories 1, 2 and 3 each assert the PRESENT state as well as
 * the MISSING one, which is what makes them boundary tests rather than
 * existence checks.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { copyShowLocked, deleteShowsLocked } from "./helpers/lockedShowCopy";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const STALE_SEVERE_AGE_MS = 7 * 60 * 60 * 1000; // 7h — > 6h SYNC_DELAYED_SEVERE boundary

/**
 * The canonical required-field copy, DERIVED from the component that owns it
 * rather than transcribed here.
 *
 * A transcribed literal makes the assertion "the page renders the string this
 * test remembers", which stays green after the component's copy changes and
 * goes red for a copy edit that is not a defect. Reading the declaration means
 * the assertion is the real contract: what ScheduleSection DECLARES is what the
 * page RENDERS. A component that declares one string and renders another fails
 * here, and that is the only way this can fail.
 *
 * The premise is asserted at extraction: an EmptyState whose label this cannot
 * find throws by name instead of yielding an empty expectation that every page
 * satisfies.
 */
const SCHEDULE_SECTION_SRC = join(__dirname, "../../components/crew/sections/ScheduleSection.tsx");
function scheduleEmptyStateCopy(): string {
  const src = readFileSync(SCHEDULE_SECTION_SRC, "utf8");
  const m = /<EmptyState\s+label="([^"]+)"\s*\/>/.exec(src);
  if (!m?.[1]) {
    throw new Error(
      `empty-state-reachability.spec: no <EmptyState label="..."/> in ${SCHEDULE_SECTION_SRC} — ` +
        `the schedule required-field placeholder moved or changed shape`,
    );
  }
  return m[1].replaceAll("&apos;", "'");
}
const NO_DATES_COPY = scheduleEmptyStateCopy();

type ShowRow = Record<string, unknown>;
type ReservationRow = Record<string, unknown>;

/** The seed show + its reservations, read once and never mutated. */
type Template = { show: ShowRow; reservations: ReservationRow[] };

/** A disposable copy of the template, addressable on the crew route. */
type Copy = {
  showId: string;
  slug: string;
  shareToken: string;
  driveFileId: string;
  /** How many reservation rows this copy was given, so cleanup can check its own work. */
  reservationCount: number;
};

async function readTemplate(): Promise<Template> {
  // not-subject-to-meta: test-local fixture lookup.
  const { data, error } = await admin
    .from("shows")
    .select("*")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .single();
  if (error || !data) {
    throw new Error(
      `empty-state-reachability.spec: seed show not found (run \`pnpm db:seed\`): ${error?.message ?? "no row"}`,
    );
  }
  // not-subject-to-meta: test-local fixture lookup.
  const { data: reservations, error: resError } = await admin
    .from("hotel_reservations")
    .select("*")
    .eq("show_id", data.id as string);
  if (resError) {
    throw new Error(`empty-state-reachability.spec: reservation read failed: ${resError.message}`);
  }
  return { show: data as ShowRow, reservations: (reservations ?? []) as ReservationRow[] };
}

/**
 * Clone the template show into a fresh row, apply `patch`, and mint a share
 * token for it.
 *
 * A FRESH `id` is the whole point: `cachedShowData` is tagged per show
 * (lib/data/showCacheTag.ts:16) and only the app's own write paths bust that
 * tag, so mutating an already-rendered show is invisible to the next render.
 * A show nothing has rendered yet has no cache entry, so its first render is
 * necessarily the state this function just wrote.
 *
 * `withReservations` is opt-in because the hotels card is exactly what
 * category 3 is about: copying the rows is the PRESENT half of that case and
 * omitting them is the MISSING half.
 */
async function makeCopy(
  t: Template,
  patch: ShowRow,
  opts: { withReservations: boolean } = { withReservations: true },
): Promise<Copy> {
  const showId = randomUUID();
  const suffix = showId.slice(0, 8);
  const driveFileId = `empty-state-spec:${suffix}`;
  const slug = `${t.show.slug as string}-es-${suffix}`;

  // LOCKED path, not PostgREST: `shows` is a plan-wide-invariant-2 table, and
  // tests/help/walker-routes.test.ts forbids unlocked service-role DML on it
  // anywhere under tests/e2e/. The helper clones the template row inside one
  // transaction holding the per-show advisory lock.
  copyShowLocked(SEED_DRIVE_FILE_ID, {
    ...patch,
    id: showId,
    slug,
    drive_file_id: driveFileId,
    unpublish_token: null,
    unpublish_token_expires_at: null,
  });

  // The share token is MINTED BY THE DB on show insert (show_share_tokens is
  // keyed by show_id, and an explicit insert here collides with that row —
  // measured: `duplicate key value violates unique constraint
  // "show_share_tokens_pkey"`). Read the minted one rather than racing it.
  // not-subject-to-meta: test-local fixture lookup.
  const { data: token, error: tokenError } = await admin
    .from("show_share_tokens")
    .select("share_token")
    .eq("show_id", showId)
    .maybeSingle();
  if (tokenError) throw new Error(`share-token lookup failed: ${tokenError.message}`);
  if (!token?.share_token) {
    throw new Error(`no share_token minted for copied show ${showId}`);
  }

  let reservationCount = 0;
  if (opts.withReservations && t.reservations.length > 0) {
    const rows = t.reservations.map((r) => ({ ...r, id: randomUUID(), show_id: showId }));
    reservationCount = rows.length;
    // hotel_reservations is NOT an invariant-2 locked table, so the
    // service-role PostgREST client is the right instrument here.
    // not-subject-to-meta: test-local fixture write.
    const { data: inserted, error: resError } = await admin
      .from("hotel_reservations")
      .insert(rows)
      .select("id");
    if (resError) throw new Error(`reservation copy failed: ${resError.message}`);
    if ((inserted ?? []).length !== rows.length) {
      throw new Error(
        `reservation copy wrote ${(inserted ?? []).length} of ${rows.length} rows for show ${showId}`,
      );
    }
  }
  return { showId, slug, shareToken: token.share_token as string, driveFileId, reservationCount };
}

test.describe("crew page — §8.3 empty-state reachability (Task 9.3, AC-9.2)", () => {
  test.setTimeout(180_000);

  let t: Template;
  const created: Copy[] = [];

  /**
   * Navigate to one section of a copy and wait for the shell + that section's
   * root. Returns only once BOTH are visible, so every "the thing is missing"
   * assertion is made against a page that demonstrably rendered — the
   * difference between proving an empty state and proving a blank page.
   */
  async function gotoSection(page: Page, c: Copy, section: string): Promise<void> {
    const url = `/show/${c.slug}/${c.shareToken}?s=${section}`;
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `crew route ${url} must render`).toBe(200);
    await expect(page.getByTestId("crew-shell")).toBeVisible();
    await expect(page.getByTestId(`section-${section}`)).toBeVisible();
  }

  async function copy(patch: ShowRow, opts?: { withReservations: boolean }): Promise<Copy> {
    const c = await makeCopy(t, patch, opts);
    created.push(c);
    return c;
  }

  test.beforeAll(async () => {
    t = await readTemplate();
  });

  test.afterAll(async () => {
    if (created.length === 0) return;
    // Every response is destructured and checked. A cleanup that discards its
    // results fails silently and leaves fixture rows behind for the NEXT spec
    // to trip over, which is the shape invariant 9 exists to stop.
    // not-subject-to-meta: test-local fixture cleanup.
    const { data: removed, error: resError } = await admin
      .from("hotel_reservations")
      .delete()
      .in(
        "show_id",
        created.map((c) => c.showId),
      )
      .select("id");
    if (resError) throw new Error(`reservation cleanup failed: ${resError.message}`);
    // `data` is CHECKED, not merely named. A delete that matches nothing returns
    // no error, so the returned row count is the only signal the cleanup removed
    // what the run created — and each copy recorded how many rows it was given,
    // so the expected total is derived rather than assumed.
    const expectedReservations = created.reduce((n, c) => n + c.reservationCount, 0);
    if ((removed ?? []).length !== expectedReservations) {
      throw new Error(
        `reservation cleanup removed ${(removed ?? []).length} rows, expected ${expectedReservations}`,
      );
    }
    // show_share_tokens rows are removed by the shows delete's FK cascade;
    // `shows` itself goes through the locked path, one transaction per show.
    deleteShowsLocked(created.map((c) => c.driveFileId));
  });

  test.beforeEach(async ({ page }) => {
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("category 1: required-field-missing — no show dates → canonical placeholder", async ({
    page,
  }) => {
    // PREMISE, asserted against the fixture rather than assumed: the template
    // must HAVE dates, or "the placeholder appears once they are removed"
    // proves nothing and the case would pass on a permanently empty schedule.
    const seededShowDays = (t.show.dates as { showDays?: unknown } | null)?.showDays;
    expect(
      Array.isArray(seededShowDays) && seededShowDays.length,
      "premise: the seed fixture must carry show days",
    ).toBeTruthy();

    // PRESENT half, on its own copy: with the template's dates the placeholder
    // is absent and the day list renders. Without this an assertion that the
    // placeholder appears would also pass on a section that always renders it.
    const withDates = await copy({});
    await gotoSection(page, withDates, "schedule");
    const before = page.getByTestId("section-schedule");
    await expect(before.getByText(NO_DATES_COPY)).toHaveCount(0);
    await expect(before.getByTestId("day-card").first()).toBeVisible();

    // MISSING half. The patch keeps the template's dates OBJECT and empties the
    // four fields `aggregateDays` actually reads — `travelIn`, `set`,
    // `showDays`, `travelOut` (lib/crew/agendaDisplay.ts:120-123). Two earlier
    // shapes were measured and rejected:
    //   • `dates: {}` renders HTTP 200 with NO `crew-shell` at all —
    //     `getShowForViewer` CASTS this jsonb rather than validating it, so the
    //     shell faults above the section's own try/catch.
    //   • `showDays: []` alone leaves the section rendering day cards, because
    //     travel-in / set / travel-out are days too. Emptying only the show days
    //     would have made this case assert against a schedule that still had
    //     four cards in it.
    const noDates = await copy({
      dates: {
        ...(t.show.dates as Record<string, unknown>),
        showDays: [],
        travelIn: null,
        set: null,
        travelOut: null,
      },
    });
    await gotoSection(page, noDates, "schedule");
    const schedule = page.getByTestId("section-schedule");
    // The section still renders: this is required-field-missing INSIDE a
    // rendered surface (§8.3 category 1), not whole-section-missing.
    const placeholder = schedule.getByTestId("empty-state").filter({ hasText: NO_DATES_COPY });
    await expect(placeholder).toBeVisible();
    // The atom's own discriminant, so a future EmptyState variant that looks
    // right but is classified wrong fails here.
    await expect(placeholder).toHaveAttribute("data-variant", "required-field");
    await expect(schedule.getByTestId("day-card")).toHaveCount(0);
  });

  test("category 2: optional-field-missing — event_details.power='TBD' → row omitted", async ({
    page,
  }) => {
    // Scoped to the venue section's own key/value TERMS, so the locator cannot
    // drift onto the word "Power" rendered anywhere else on the page.
    const powerTerm = (p: Page) =>
      p.getByTestId("section-venue").locator("dt", { hasText: /^Power$/ });

    const details = (t.show.event_details as Record<string, string> | null) ?? {};
    const seededPower = details["power"];
    // PREMISE: the fixture carries a real power value. Expected text is derived
    // from it, never transcribed as a literal.
    expect(seededPower, "premise: the seed fixture must carry event_details.power").toBeTruthy();

    const withPower = await copy({});
    await gotoSection(page, withPower, "venue");
    await expect(powerTerm(page)).toHaveCount(1);
    await expect(page.getByTestId("section-venue")).toContainText(seededPower!);

    const tbd = await copy({ event_details: { ...details, power: "TBD" } });
    await gotoSection(page, tbd, "venue");
    // The whole ROW goes, not just the value. §8.3's optional-field contract is
    // omission, so asserting only that "TBD" is absent would pass on a row
    // rendered with an em dash, and on a section that failed to render at all.
    await expect(powerTerm(page)).toHaveCount(0);
    await expect(page.getByTestId("section-venue")).not.toContainText("TBD");
    // The surface is alive, so the count-0 above is an omission, not a blank.
    await expect(page.getByTestId("section-venue").locator("dt").first()).toBeVisible();
  });

  test("category 3: whole-tile-missing — no reservations → hotels card absent, section reflows", async ({
    page,
  }) => {
    // PREMISE, read from the DB rather than assumed from a comment.
    expect(
      t.reservations.length,
      "premise: the seed show must carry at least one hotel reservation",
    ).toBeGreaterThan(0);

    // PRESENT half. Without it the count-0 below would also pass on a Travel
    // section that never renders the card under any data.
    const withHotels = await copy({});
    await gotoSection(page, withHotels, "travel");
    await expect(page.getByTestId("section-travel").getByTestId("travel-hotels")).toBeVisible();

    // MISSING half: the same show, minus the reservation rows.
    const noHotels = await copy({}, { withReservations: false });
    await gotoSection(page, noHotels, "travel");
    const travel = page.getByTestId("section-travel");
    await expect(travel.getByTestId("travel-hotels")).toHaveCount(0);
    // The section reflowed around the missing card rather than collapsing:
    // either other travel content or the section-level empty state is there.
    const alive = travel
      .getByTestId("travel-getting-there")
      .or(travel.getByTestId("section-empty"));
    await expect(alive.first()).toBeVisible();
  });

  test("category 4: stale-sync — last_checked_at >6h ago → SYNC_DELAYED_SEVERE footer", async ({
    page,
  }) => {
    // FRESH half first, so the assertion below cannot pass on a footer that is
    // always red. The footer still RENDERS when the show was checked recently —
    // `selectCodeAndTier` returns `{code: null, tier: "subtle"}` under ten
    // minutes (components/shared/StaleFooter.tsx:80-81), and the code-less
    // branch emits the element without a `data-code`
    // (StaleFooter.tsx:96-107). So the fresh contrast is on the TIER and the
    // ABSENCE of a code, never on the element's absence. Measured: asserting
    // count 0 here failed against exactly that subtle-tier footer.
    const fresh = await copy({
      last_checked_at: new Date().toISOString(),
      last_sync_status: "ok",
    });
    await gotoSection(page, fresh, "today");
    const freshFooter = page.getByTestId("stale-footer");
    await expect(freshFooter).toBeVisible();
    await expect(freshFooter).toHaveAttribute("data-tier", "subtle");
    await expect(freshFooter).not.toHaveAttribute("data-code", /.*/);

    const stale = await copy({
      last_checked_at: new Date(Date.now() - STALE_SEVERE_AGE_MS).toISOString(),
      last_sync_status: "ok",
    });
    await gotoSection(page, stale, "today");
    const footer = page.getByTestId("stale-footer");
    await expect(footer).toBeVisible();
    await expect(footer).toHaveAttribute("data-tier", "red");
    await expect(footer).toHaveAttribute("data-code", "SYNC_DELAYED_SEVERE");
    // Per-tile content stays as last-good — there is no per-tile staleness
    // signal (§8.3 invariant, spec line 2437). The section still renders.
    await expect(page.getByTestId("section-today")).toBeVisible();
  });
});
