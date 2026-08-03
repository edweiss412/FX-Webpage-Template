/**
 * tests/e2e/stage-restricted-crew-schedule.spec.ts
 *
 * Real-browser (Playwright) e2e for the stage-filtered crew schedule (#248,
 * spec docs/superpowers/specs/schedule/2026-07-03-stage-filtered-schedule.md).
 * Closes DEFERRED.md SFS-1: a dedicated assertion that renders AS a specific
 * stage-restricted crew member (NOT the admin {kind:'none'} viewer that
 * crew-layout-dimensions.spec.ts uses) and proves both:
 *
 *   1. BEHAVIOR — a "Strike / Load Out ONLY" crew sees ONLY their worked day
 *      cards. The show runs travelIn→set→show×2→travelOut (5 aggregate days);
 *      the restricted viewer sees exactly the 2 days on which a Strike/Load-Out
 *      phase occurs, and the 3 non-worked days are ABSENT from the DOM (the
 *      stage restriction is a privacy trust boundary — the crew must not even
 *      learn the other days run). The admin control test renders the SAME show
 *      unrestricted (all 5 cards), proving the 2-card result is a genuine
 *      NARROWING, not a fixture artifact (anti-tautology, AGENTS.md).
 *
 *   2. DIMENSIONAL INVARIANT (SFS-1 mandatory real-browser gate) — for the
 *      stage-restricted render specifically: `[data-testid="day-card-date"]` is
 *      the fixed 50px badge (DayCard `w-12.5`) and the `self-stretch` vline
 *      fills the full row height. jsdom is NOT sufficient (this project's
 *      Tailwind v4 does not default `.flex` to `align-items: stretch`; the
 *      vline's height comes from `self-stretch`, not the parent).
 *
 * ── Why an email-matched Google session (not a picker cookie) ─────────────
 * The test-auth endpoint mints exactly two Supabase-auth fixtures, ADMIN and
 * NON_ADMIN_CREW, and neither is restricted in itself — but the RESTRICTION
 * lives on the seeded crew row, not on the fixture. Seeding a row whose
 * `email` is NON_ADMIN_CREW_FIXTURE.email makes validateGoogleSession resolve
 * the signed-in viewer TO that row (unclaimed is fine — the same pattern
 * sign-in-page.spec.ts:126-137 uses), so a generic fixture renders as a
 * stage- or date-restricted crew member.
 *
 * This file previously staged the viewer by INJECTING a signed
 * `__Host-fxav_picker` cookie. That mechanism is engine- and platform-
 * dependent and was measured DARK in CI: on 2026-08-02, the first crew-e2e run
 * after this spec was wired in, all four picker-cookie cases failed on the
 * Linux WebKit build while every signInAs case in the same file passed. The
 * `__Host-` prefix requires Secure, and Linux WebKit does not extend the
 * localhost/127.0.0.1 secure-context exemption to a programmatically injected
 * Secure cookie, so the browser dropped it and the server rendered the
 * first-contact Welcome gate (trace screencast, run 30754740917). macOS WebKit
 * DOES store it, which is why the mechanism passed locally for months.
 * Supabase session cookies carry no such prefix and ride plain http on both
 * builds — hence one mechanism for every viewer here. (Chromium is not an
 * escape hatch either: its CDP rejects addCookies for a `__Host-` cookie, per
 * playwright.config.ts:54-62. picker-flow.spec.ts, which tests the picker
 * ITSELF, stays on desktop-chromium and drives the real picker UI.)
 *
 * ── Fixture worked-day derivation (grounded, not magic) ───────────────────
 * dates = travelIn 04-20, set 04-21, showDays [04-22, 04-23], travelOut 04-24.
 * deriveSchedulePhases (lib/parser/index.ts:392) →
 *   04-21 {Set}, 04-22 {Show}, 04-23 {Show,Strike} (last show day compound),
 *   04-24 {Load Out}. (Set day gets no Load In: travelIn is a separate day.)
 * aggregateDays (lib/crew/agendaDisplay.ts:113) tags 04-20 "Travel In", 04-21
 * "Set", 04-22 "Show Day 1", 04-23 "Show Day 2", 04-24 "Travel Out".
 * stageWorksDay (lib/crew/stageSchedule.ts) unions schedule_phases[date] with
 * the phase-tag's WorkPhases; a {Strike, Load Out} crew works a day iff that
 * union intersects {Strike, Load Out}:
 *   04-20 Travel In  → {Load In, Set}      ∩ ∅ → NOT worked
 *   04-21 Set        → {Set, Load In}      ∩ ∅ → NOT worked
 *   04-22 Show Day 1 → {Show}              ∩ ∅ → NOT worked
 *   04-23 Show Day 2 → {Show, Strike}      ∩ {Strike}   → WORKED
 *   04-24 Travel Out → {Load Out}          ∩ {Load Out} → WORKED
 * ⇒ visible cards = 04-23 (label "Show Day 2" — numbered from the FULL set, so
 * the restricted viewer's single show card is Day 2, not Day 1) + 04-24
 * ("Travel Out"). Every value below is derived from this table.
 *
 * Single-writer: exactly ONE project's testMatch carries this file (desktop-chromium), so the
 * cases run once per CI invocation and each builds its OWN BrowserContext + tears down its seeded
 * show — no cross-test cookie/session/row leakage.
 *
 * There is deliberately NO `if (testInfo.project.name !== …) return;` guard clause here, and
 * `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` fails if one reappears. Whole-diff
 * review R4 (HIGH) showed why: nine such clauses made every case a silent assertion-free PASS
 * under any other project, so a one-word `testMatch` move turned the whole suite into a no-op that
 * still reported green. With no clause, the same move makes the cases RUN and FAIL loudly on the
 * wrong engine, which is the direction a coverage regression should fail in. The convention exists
 * for files matched by two or more projects; this file is matched by one. The project
 * is desktop-chromium and not mobile-safari for the reason picker-flow.spec.ts
 * already lives there: every non-admin viewer here needs the `__Host-` picker
 * cookie the bootstrap mints, and Linux WebKit refuses to store it over plain
 * http (see the mechanism note above).
 */
// Load .env.local into the RUNNER process (loadTestEnv side-effect import): the seed helpers
// read Supabase service-role env from process.env, which the webServer loads but the runner
// does not. CI is unaffected (no .env.local on runners; @next/env preserves job env).
import "./helpers/loadTestEnv";
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";

// The port-3000 webServer binds 127.0.0.1 (playwright.config.ts) — the Supabase
// auth cookie is host-scoped, so every leg stays on one host.
const BASE_URL = process.env.PICKER_E2E_BASE_URL ?? "http://127.0.0.1:3000";

// Server render-clock pin: an instant BEFORE every fixture date, so NO day card
// is "today" → every card wrapper carries `schedule-day-<date>` (not the
// dedicated `schedule-day-today` testid), keeping the date-keyed assertions
// deterministic and clock-independent. Honored by lib/time/now.ts under the
// ENABLE_TEST_AUTH + Bearer gate the :3000 webServer carries.
const FROZEN_NOW = "2026-01-01T12:00:00Z";

// Fixture dates (see header derivation). Kept as named constants so the
// assertions read against the derivation, never a bare literal.
const DATES = {
  travelIn: "2026-04-20",
  set: "2026-04-21",
  showDays: ["2026-04-22", "2026-04-23"],
  travelOut: "2026-04-24",
} as const;
const ALL_DAYS = ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"] as const;
const WORKED_DAYS = ["2026-04-23", "2026-04-24"] as const; // Strike (Show Day 2) + Load Out (Travel Out)
const NON_WORKED_DAYS = ["2026-04-20", "2026-04-21", "2026-04-22"] as const;

type Rect = { x: number; y: number; width: number; height: number };
async function rectOf(locator: import("@playwright/test").Locator): Promise<Rect> {
  const box = await locator.evaluate((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return box;
}

test.describe("stage-restricted crew schedule (SFS-1)", () => {
  let show: SeededShow;

  test.beforeAll(async () => {
    show = await seedShowWithCrew({
      title: "Stage-Restricted E2E Show",
      dates: { ...DATES, showDays: [...DATES.showDays] },
      crew: [
        {
          name: "Strike Sam",
          role: "- Strike / Load Out ONLY",
          // The restriction lives HERE, on the row the signed-in fixture resolves to.
          email: NON_ADMIN_CREW_FIXTURE.email,
          stageRestriction: { kind: "explicit", stages: ["Strike", "Load Out"] },
        },
      ],
    });
  });

  test.afterAll(async () => {
    if (show) await deleteSeededShow(show.driveFileId);
  });

  test("restricted crew sees ONLY their worked day cards; non-worked days are absent", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    try {
      const page = await ctx.newPage();
      await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: BASE_URL });
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": FROZEN_NOW,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      // TWO-STEP navigation, and it is load-bearing. A Google session with no cookie
      // entry yet resolves to needs_picker_bootstrap, which redirects through
      // /api/auth/picker-bootstrap; that handler REJECTS a `next` carrying a query
      // string and renders "Sign-in unavailable" (measured 2026-08-02 on both engines).
      // So bootstrap on the BARE show URL first, then re-navigate with the load-bearing
      // `?s=schedule` once the picker cookie exists. networkidle here (not
      // domcontentloaded) because the bootstrap hop runs a claim RPC before the render.
      await page.goto(`/show/${show.slug}/${show.shareToken}`, { waitUntil: "networkidle" });
      const res = await page.goto(`/show/${show.slug}/${show.shareToken}?s=schedule`, {
        waitUntil: "networkidle",
      });
      expect(res?.status(), "crew route must render (resolved via email-matched session)").toBe(
        200,
      );

      // Renders AS the stage-restricted crew member (not the first-contact gate).
      await expect(page.getByTestId("crew-shell")).toBeVisible();
      await expect(page.getByTestId("section-schedule")).toBeVisible();

      // Exactly the 2 worked days — the stage restriction narrowed 5 → 2.
      const dayCards = page.locator('[data-testid^="schedule-day"]');
      await expect(dayCards).toHaveCount(WORKED_DAYS.length);
      for (const d of WORKED_DAYS) {
        await expect(page.locator(`[data-testid="schedule-day-${d}"]`)).toBeVisible();
      }
      // The 3 non-worked days must be ABSENT (privacy trust boundary — the crew
      // must not learn the show runs on those days).
      for (const d of NON_WORKED_DAYS) {
        await expect(page.locator(`[data-testid="schedule-day-${d}"]`)).toHaveCount(0);
      }

      // Numbering is preserved from the FULL aggregate: the single visible show
      // card is "Show Day 2" (04-23), NOT renumbered to Day 1; 04-24 is Travel Out.
      await expect(page.locator('[data-testid="schedule-day-2026-04-23"]')).toContainText(
        "Show Day 2",
      );
      await expect(page.locator('[data-testid="schedule-day-2026-04-24"]')).toContainText(
        "Travel Out",
      );
    } finally {
      await ctx.close();
    }
  });

  test("admin (unrestricted) sees the FULL schedule — proves the stage filter narrows", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    try {
      const page = await ctx.newPage();
      await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE_URL });
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": FROZEN_NOW,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      const res = await page.goto(`/show/${show.slug}/${show.shareToken}?s=schedule`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status(), "admin resolves the same show").toBe(200);
      await expect(page.getByTestId("crew-shell")).toBeVisible();
      await expect(page.getByTestId("section-schedule")).toBeVisible();

      // Admin viewer is {kind:'none'} → every aggregate day renders. This is the
      // anti-tautology control: the restricted 2-card result above is a genuine
      // narrowing of this 5-card full set, not the fixture only having 2 days.
      const dayCards = page.locator('[data-testid^="schedule-day"]');
      await expect(dayCards).toHaveCount(ALL_DAYS.length);
      for (const d of ALL_DAYS) {
        await expect(page.locator(`[data-testid="schedule-day-${d}"]`)).toBeVisible();
      }
    } finally {
      await ctx.close();
    }
  });

  test("§5.5 DayCard dimensional invariant holds for the stage-restricted render (≥720px)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1000, height: 1200 },
    });
    try {
      const page = await ctx.newPage();
      await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: BASE_URL });
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": FROZEN_NOW,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      // TWO-STEP navigation, and it is load-bearing. A Google session with no cookie
      // entry yet resolves to needs_picker_bootstrap, which redirects through
      // /api/auth/picker-bootstrap; that handler REJECTS a `next` carrying a query
      // string and renders "Sign-in unavailable" (measured 2026-08-02 on both engines).
      // So bootstrap on the BARE show URL first, then re-navigate with the load-bearing
      // `?s=schedule` once the picker cookie exists. networkidle here (not
      // domcontentloaded) because the bootstrap hop runs a claim RPC before the render.
      await page.goto(`/show/${show.slug}/${show.shareToken}`, { waitUntil: "networkidle" });
      await page.goto(`/show/${show.slug}/${show.shareToken}?s=schedule`, {
        waitUntil: "networkidle",
      });
      await expect(page.getByTestId("crew-shell")).toBeVisible();

      // Every date badge on the restricted render is the fixed 50px column
      // (DayCard `w-12.5` = 3.125rem). Regression: a stretch/flex change that
      // let the badge grow would fail here in a real layout engine.
      const badges = page.locator('[data-testid="day-card-date"]');
      const count = await badges.count();
      expect(count, "restricted render shows exactly the 2 worked-day badges").toBe(
        WORKED_DAYS.length,
      );
      for (let i = 0; i < count; i++) {
        expect((await rectOf(badges.nth(i))).width).toBeCloseTo(50, 0);
      }

      // self-stretch vline fills the card's CONTENT box. The stacked date badge
      // (11px dow over 23px dnum) drives the row taller than the single phase
      // line, so a dropped `self-stretch` (Tailwind v4 .flex ≠ items-stretch)
      // would collapse the vline to its natural height (~0). Measure the content
      // box directly (clientHeight − vertical padding; border-box independent)
      // rather than reconstructing from the border-box rect.
      const firstCard = page.locator('[data-testid="day-card"]').first();
      const { contentH, vlineH } = await firstCard.evaluate((card) => {
        const cs = getComputedStyle(card as HTMLElement);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const vlineEl = (card as HTMLElement).querySelector("span.self-stretch") as HTMLElement;
        return {
          // clientHeight excludes border, includes padding → content box = clientHeight − padY.
          contentH: (card as HTMLElement).clientHeight - padY,
          vlineH: vlineEl.getBoundingClientRect().height,
        };
      });
      // Guard against a tautological 0 == 0 (both would be ~0 if the card failed
      // to render): the badge alone forces ≥30px of content height.
      expect(contentH, "day-card content box must be laid out (badge height)").toBeGreaterThan(30);
      expect(Math.abs(vlineH - contentH)).toBeLessThanOrEqual(0.5);
    } finally {
      await ctx.close();
    }
  });
});

// ── BL-AGENDA-FOLD-NO-SEEDED-E2E: the per-viewer agenda day fold through the REAL crew page ──
//
// Spec docs/superpowers/specs/schedule/2026-08-02-agenda-fold-seeded-e2e-webkit-design.md §3.
// Two date-restricted viewers with COMPLEMENTARY day assignments (Fiona → row 0, Theo →
// row 1) over one two-day extraction: a seam regression that returns a constant subset for
// every explicit viewer fails one of the two tests, so the suite pins the
// viewerDates/restrictionDays → row composition, not just "some row folded" (spec §3.4).
// The admin control proves the fold is a narrowing (admins bypass the matcher entirely).
// `?s=schedule` is LOAD-BEARING (spec §3.3): absent `s` resolves to "today"
// (lib/crew/resolveActiveSection.ts) and CrewSections mounts ONLY the active section.

const FOLD_DATES = {
  travelIn: "2026-05-04",
  set: "2026-05-05",
  showDays: ["2026-05-06", "2026-05-07"],
  travelOut: "2026-05-08",
} as const;

// Shape per lib/agenda/normalizeAgendaExtraction.ts: confidence high|low, numeric
// corrections + extractorVersion, days[].dayLabel string, date string|null, sessions with
// non-empty time and string|null title/room/drift, tracks array. Labels parse to exactly one
// date each (weekday-accurate: 2026-05-06 IS a Wednesday), so the matcher's completeness,
// ambiguity, and every-row-parses gates all pass (probe: rows [0] / rows [1]).
const FOLD_AGENDA_LINKS = [
  {
    label: "AGENDA",
    // Fake fileId: AgendaEmbed renders buttons only; the PDF proxy is fetched solely on
    // click (components/agenda/AgendaEmbed.tsx), which these tests never perform.
    fileId: "agenda-fold-e2e-fileid",
    extracted: {
      // `confidence: "high"` is a CLAIM about the producer, so the payload satisfies the real
      // gates rather than merely asserting the label (whole-diff review R5 HIGH). The extractor
      // requires n >= 5 sessions, >= 95% parsed time anchors, >= 80% titled and >= 75% roomed
      // (lib/agenda/constants.ts AGENDA_CONFIDENCE, enforced at
      // lib/agenda/extractAgendaSchedule.ts:602-608): this fixture is 6 sessions, all with a
      // parseable time, a title and a room, monotonic within each day.
      confidence: "high" as const,
      corrections: 0,
      extractorVersion: 1,
      days: [
        {
          dayLabel: "Wednesday, May 6, 2026",
          date: null,
          sessions: [
            { time: "9:00 AM", title: "Keynote", room: "Grand Ballroom", tracks: [], drift: null },
            {
              time: "10:30 AM",
              title: "Product Deep Dive",
              room: "Salon A",
              tracks: [],
              drift: null,
            },
            { time: "1:00 PM", title: "Partner Panel", room: "Salon B", tracks: [], drift: null },
          ],
        },
        {
          dayLabel: "Thursday, May 7, 2026",
          date: null,
          sessions: [
            { time: "10:00 AM", title: "Breakouts", room: "Salon A", tracks: [], drift: null },
            {
              time: "11:30 AM",
              title: "Customer Stories",
              room: "Salon B",
              tracks: [],
              drift: null,
            },
            {
              time: "2:00 PM",
              title: "Closing Remarks",
              room: "Grand Ballroom",
              tracks: [],
              drift: null,
            },
          ],
        },
      ],
    },
  },
];

test.describe("date-restricted agenda fold (BL-AGENDA-FOLD-NO-SEEDED-E2E)", () => {
  // ONE show per viewer, not one show with two viewers. The single NON_ADMIN_CREW fixture
  // email can identify only ONE row per show (two rows sharing it would make the
  // validateGoogleSession match ambiguous), so each complementary viewer gets an otherwise
  // IDENTICAL show — same dates, same agenda links, same two crew rows — differing only in
  // which row carries the email. That keeps the anti-tautology property the two-viewer design
  // exists for: the fixture that sees row 0 open in one show sees row 1 open in the other, so
  // neither result can be a constant of the fixture or the agenda payload. The admin control
  // then runs against Fiona's show, whose fold it must NOT reproduce.
  const shows: Record<"fiona" | "theo", SeededShow | undefined> = {
    fiona: undefined,
    theo: undefined,
  };

  const seedFoldShow = async (emailOn: "fiona" | "theo"): Promise<SeededShow> =>
    seedShowWithCrew({
      title: `Agenda Fold E2E Show (${emailOn})`,
      dates: { ...FOLD_DATES, showDays: [...FOLD_DATES.showDays] },
      agendaLinks: FOLD_AGENDA_LINKS,
      crew: [
        {
          name: "Fold Fiona",
          role: "- Video",
          ...(emailOn === "fiona" ? { email: NON_ADMIN_CREW_FIXTURE.email } : {}),
          dateRestriction: { kind: "explicit", days: ["2026-05-06"] },
        },
        {
          name: "Thursday Theo",
          role: "- Audio",
          ...(emailOn === "theo" ? { email: NON_ADMIN_CREW_FIXTURE.email } : {}),
          dateRestriction: { kind: "explicit", days: ["2026-05-07"] },
        },
      ],
    });

  test.beforeAll(async () => {
    shows.fiona = await seedFoldShow("fiona");
    shows.theo = await seedFoldShow("theo");
  });

  test.afterAll(async () => {
    for (const s of [shows.fiona, shows.theo]) {
      if (s) await deleteSeededShow(s.driveFileId);
    }
  });

  // Labels are the FIXTURE's, so the assertion is derived from the seeded payload rather than
  // restated: FOLD_AGENDA_LINKS[0].extracted.days[i].dayLabel.
  const DAY_LABELS = FOLD_AGENDA_LINKS[0]!.extracted.days.map((d) => d.dayLabel);
  for (const viewer of [
    {
      label: "Fiona (day 1)",
      key: "fiona" as const,
      own: 0,
      other: 1,
      ownLabel: DAY_LABELS[0]!,
      otherLabel: DAY_LABELS[1]!,
    },
    {
      label: "Theo (day 2)",
      key: "theo" as const,
      own: 1,
      other: 0,
      ownLabel: DAY_LABELS[1]!,
      otherLabel: DAY_LABELS[0]!,
    },
  ]) {
    test(`${viewer.label}: own agenda day open+marked, other day folded`, async ({ browser }) => {
      const seeded = shows[viewer.key]!;
      const ctx = await browser.newContext({ baseURL: BASE_URL });
      try {
        const page = await ctx.newPage();
        await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: BASE_URL });
        await page.setExtraHTTPHeaders({
          "X-Screenshot-Frozen-Now": FROZEN_NOW,
          Authorization: `Bearer ${TEST_AUTH_SECRET}`,
        });
        // TWO-STEP navigation, and it is load-bearing. A Google session with no cookie
        // entry yet resolves to needs_picker_bootstrap, which redirects through
        // /api/auth/picker-bootstrap; that handler REJECTS a `next` carrying a query
        // string and renders "Sign-in unavailable" (measured 2026-08-02 on both engines).
        // So bootstrap on the BARE show URL first, then re-navigate with the load-bearing
        // `?s=schedule` once the picker cookie exists. networkidle here (not
        // domcontentloaded) because the bootstrap hop runs a claim RPC before the render.
        await page.goto(`/show/${seeded.slug}/${seeded.shareToken}`, {
          waitUntil: "networkidle",
        });
        const res = await page.goto(`/show/${seeded.slug}/${seeded.shareToken}?s=schedule`, {
          waitUntil: "networkidle",
        });
        expect(res?.status(), "crew route must render (email-matched session)").toBe(200);
        await expect(page.getByTestId("crew-shell")).toBeVisible();
        await expect(page.getByTestId("section-schedule")).toBeVisible();

        // Spec §3.3 assertions 1-5. `open` is asserted as the DOM property (toHaveJSProperty),
        // not attribute string-matching — <details>.open is the live boolean either way.
        //
        // Everything below is SCOPED TO ITS OWN DISCLOSURE and the day is identified by its
        // LABEL, not by index alone (whole-diff review R12 HIGH). Index-only, page-global
        // assertions passed against two mutants that break the feature: swapping the
        // Wednesday/Thursday content (the viewer's open row is then the wrong day) and
        // rendering `agenda-day-marker-0` as a sibling of its row rather than inside it. Row
        // index is a position; the label is the claim.
        await expect(page.getByTestId("agenda-schedule")).toBeVisible();
        const ownRow = page.getByTestId(`agenda-day-${viewer.own}`);
        const otherRow = page.getByTestId(`agenda-day-${viewer.other}`);
        await expect(ownRow).toHaveJSProperty("open", true);
        await expect(
          ownRow.getByRole("heading", { level: 3 }),
          "the open row must be the viewer's OWN day, by label",
        ).toHaveText(viewer.ownLabel);
        await expect(
          otherRow.getByRole("heading", { level: 3 }),
          "the folded row must be the OTHER day, by label",
        ).toHaveText(viewer.otherLabel);
        const marker = ownRow.getByTestId(`agenda-day-marker-${viewer.own}`);
        await expect(marker).toBeVisible();
        await expect(marker).toHaveText("Your day");
        await expect(otherRow).toHaveJSProperty("open", false);
        // Folded ≠ hidden: the summary stays visible (fold is de-emphasis, not the day-card
        // privacy boundary).
        await expect(otherRow.getByTestId(`agenda-day-summary-${viewer.other}`)).toBeVisible();
        await expect(otherRow.getByTestId(`agenda-day-marker-${viewer.other}`)).toHaveCount(0);
        // Page-global too: exactly ONE marker exists anywhere, and it is the own row's. A
        // sibling-rendered marker satisfies neither this nor the scoped assertion above.
        await expect(page.locator('[data-testid^="agenda-day-marker-"]')).toHaveCount(1);
      } finally {
        await ctx.close();
      }
    });
  }

  test("admin (unrestricted) sees both days open, no markers", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    try {
      const page = await ctx.newPage();
      await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE_URL });
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": FROZEN_NOW,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      const seeded = shows.fiona!;
      const res = await page.goto(`/show/${seeded.slug}/${seeded.shareToken}?s=schedule`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status(), "admin resolves the same show Fiona folds").toBe(200);
      // Admin resolves {kind:'none'} → viewerDays {kind:'all'} → nothing folds, nothing marks
      // (marker renders only when it DISTINGUISHES — spec §3.4).
      await expect(page.getByTestId("agenda-schedule")).toBeVisible();
      await expect(page.getByTestId("agenda-day-0")).toHaveJSProperty("open", true);
      await expect(page.getByTestId("agenda-day-1")).toHaveJSProperty("open", true);
      await expect(page.getByTestId("agenda-day-0").getByRole("heading", { level: 3 })).toHaveText(
        DAY_LABELS[0]!,
      );
      await expect(page.getByTestId("agenda-day-1").getByRole("heading", { level: 3 })).toHaveText(
        DAY_LABELS[1]!,
      );
      await expect(page.locator('[data-testid^="agenda-day-marker-"]')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
