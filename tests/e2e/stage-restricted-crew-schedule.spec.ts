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
 * ── Why a picker-cookie viewer (not signInAs) ─────────────────────────────
 * The only Supabase-auth fixtures the test-auth endpoint mints are ADMIN and
 * the single NON_ADMIN_CREW fixture (route.ts:63) — neither is a stage-
 * restricted crew member, and the admin viewer always resolves {kind:'none'}.
 * A stage-restricted render therefore uses the picker-cookie path: seed a
 * fresh `__Host-fxav_picker` selection for an UNCLAIMED seeded crew member and
 * navigate with NO Google session. resolveShowPageAccess skips the
 * `google.kind==='success'` bootstrap branch (anon → auth_email_canonical()
 * returns null, no error) and returns `resolved`/source cookie directly — so
 * there is NO picker-bootstrap redirect and thus NO 127.0.0.1→localhost host-
 * flip (the trap that skips the OAuth-happy-path scenario in
 * picker-flow.spec.ts). Verified against resolveShowPageAccess.ts:204-263 +
 * resolvePickerSelection.ts (unclaimed row + fresh epoch + null session → resolved).
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
 * Single-writer: gated to the mobile-safari project (its testMatch is the only
 * one carrying this file); each test builds its OWN BrowserContext + tears down
 * its seeded show, so no cross-test cookie/session/row leakage.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { seedPickerCookie } from "./helpers/seedPickerCookie";
import { TEST_AUTH_SECRET } from "./helpers/testAuthConfig";

// The port-3000 webServer binds 127.0.0.1 (playwright.config.ts) — the picker
// cookie + Supabase auth cookie are host-scoped, so every leg stays on one host.
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
  let restrictedCrewId: string;

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer
    show = await seedShowWithCrew({
      title: "Stage-Restricted E2E Show",
      dates: { ...DATES, showDays: [...DATES.showDays] },
      crew: [
        {
          name: "Strike Sam",
          role: "- Strike / Load Out ONLY",
          // email omitted: the picker-cookie viewer is anon; selection is by id only.
          stageRestriction: { kind: "explicit", stages: ["Strike", "Load Out"] },
        },
      ],
    });
    restrictedCrewId = show.crew[0]!.id;
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    if (show) await deleteSeededShow(show.driveFileId);
  });

  test("restricted crew sees ONLY their worked day cards; non-worked days are absent", async ({
    browser,
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    try {
      await seedPickerCookie(
        ctx,
        [{ showId: show.showId, crewMemberId: restrictedCrewId, epoch: show.pickerEpoch }],
        { url: BASE_URL },
      );
      const page = await ctx.newPage();
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": FROZEN_NOW,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      const res = await page.goto(`/show/${show.slug}/${show.shareToken}?s=schedule`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status(), "crew route must render (resolved via picker cookie)").toBe(200);

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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
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
  }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    const ctx = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1000, height: 1200 },
    });
    try {
      await seedPickerCookie(
        ctx,
        [{ showId: show.showId, crewMemberId: restrictedCrewId, epoch: show.pickerEpoch }],
        { url: BASE_URL },
      );
      const page = await ctx.newPage();
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": FROZEN_NOW,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      await page.goto(`/show/${show.slug}/${show.shareToken}?s=schedule`, {
        waitUntil: "domcontentloaded",
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
