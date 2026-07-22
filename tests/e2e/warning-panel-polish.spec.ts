/**
 * tests/e2e/warning-panel-polish.spec.ts
 * (spec 2026-07-22-warning-panel-polish §8.6 scroll with pre-click guard,
 *  §8.8 44x44 hit area + geometric overlay disjointness; plan Tasks 7-8)
 *
 * Harness: same boot/seed/sign-in shape as published-show-attention.spec.ts —
 * seeded published show whose parse warnings are ALL warn-severity and routed
 * to THREE sections (crew, rooms, contacts — the pointer cap, the worst
 * wrapping case), so the published panel renders the elsewhere state. NEVER
 * networkidle alone: the modal-visible expect is the hydration gate.
 *
 * Runs in the default playwright.config.ts (desktop-chromium project).
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const BASE = "published-show-review";
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;

const SEED_TITLE = "Warning Panel Polish E2E Show";

/** Warn rows routed to three sections (KIND_TO_SECTION,
 *  lib/admin/step3SectionStatus.ts:22). Real emitter field shapes. */
const ROUTED_WARNINGS = [
  {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: "unknown role e2e",
    rawSnippet: "Role | e2e-crew",
    blockRef: { kind: "crew", name: "e2e-crew" },
  },
  {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: "ambiguous room e2e",
    rawSnippet: "Room | e2e-room",
    blockRef: { kind: "rooms", name: "e2e-room" },
  },
  {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "unknown contact field e2e",
    rawSnippet: "Contact | e2e-contact",
    blockRef: { kind: "contacts", name: "e2e-contact" },
  },
];

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.describe.configure({ mode: "serial" });

test.describe("warning panel polish (spec §8.6/§8.8)", () => {
  test.beforeAll(async () => {
    restoreDashboardState = await settleDashboardAdminState();
    show = await seedShowWithCrew({
      title: SEED_TITLE,
      crew: [{ name: "Casey Reyes", role: "A1", email: "casey@fxav.test" }],
    });
    const { error } = await admin
      .from("shows_internal")
      .upsert({ show_id: show.showId, parse_warnings: ROUTED_WARNINGS }, { onConflict: "show_id" });
    if (error) throw new Error(`polish spec parse_warnings seed failed: ${error.message}`);
  });

  test.afterAll(async () => {
    if (show) await deleteSeededShow(show.driveFileId);
    if (restoreDashboardState) await restoreDashboardState();
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  function selectors(dfid: string) {
    return {
      SCROLLER: `[data-testid="wizard-step3-card-${dfid}-review-content"]`,
      SENTENCE: `[data-testid="wizard-step3-card-${dfid}-warnings-elsewhere"]`,
      SECTION_CREW: `[data-testid="wizard-step3-card-${dfid}-review-section-crew"]`,
    };
  }

  async function openModal(page: import("@playwright/test").Page) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/admin?show=${show.slug}`);
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
  }

  test("pointer button scrolls its section to the aligned position", async ({ page }) => {
    await openModal(page);
    const { SCROLLER, SENTENCE, SECTION_CREW } = selectors(show.driveFileId);
    await expect(page.locator(SENTENCE)).toBeVisible();
    const btn = page.locator(`${SENTENCE} button`, { hasText: "Crew" }).first();
    await expect(btn).toBeVisible();
    // The modal re-renders once after open (post-open refresh) and swaps the
    // first-mounted nodes; a click dispatched into that swap lands on a
    // detached node and scrolls nothing. Settle gate: poll until the button's
    // geometry is stable across two frames before clicking.
    await expect
      .poll(
        async () => {
          const a = await btn.evaluate((el) => el.getBoundingClientRect().top).catch(() => -1);
          await page.evaluate(() => new Promise(requestAnimationFrame));
          const b = await btn.evaluate((el) => el.getBoundingClientRect().top).catch(() => -2);
          return a >= 0 && a === b ? "stable" : "settling";
        },
        { timeout: 15_000 },
      )
      .toBe("stable");
    const align = async () =>
      page.evaluate(
        ([sec, scr]) => {
          const t = document.querySelector(sec!)!.getBoundingClientRect().top;
          const s = document.querySelector(scr!)!.getBoundingClientRect().top;
          return Math.abs(t - s - 8);
        },
        [SECTION_CREW, SCROLLER] as const,
      );
    // Pre-click guard (spec §8.6): target NOT already aligned, else vacuous.
    expect(await align()).toBeGreaterThan(24);
    await btn.click();
    await expect.poll(align, { timeout: 10_000 }).toBeLessThanOrEqual(24);
  });

  test("pointer buttons: 44x44 effective hit area, adjacent overlays disjoint", async ({
    page,
  }) => {
    // Mobile viewport: the three inline buttons wrap — wrapping is what makes
    // 2D overlay intersection possible (spec §8.8).
    await page.setViewportSize({ width: 390, height: 844 });
    await openModal(page);
    const { SENTENCE } = selectors(show.driveFileId);
    await expect(page.locator(SENTENCE)).toBeVisible();
    const buttons = page.locator(`${SENTENCE} button`);
    await expect(buttons).toHaveCount(3); // the seeded cap-count; not vacuous
    // block:"center", not scrollIntoViewIfNeeded: nearest-edge alignment parks
    // the sentence at the pane top, where the mobile layout's sticky chip rail
    // overlaps the probe zone above the first line (intermittent nulls).
    await page.locator(SENTENCE).evaluate((el) => el.scrollIntoView({ block: "center" }));
    // The modal re-renders once after open (post-open refresh), detaching the
    // first-mounted nodes. Selector-based single-shot measurement is
    // detach-safe: no element handles held across the settle. Poll until all
    // three buttons report real geometry in the SAME evaluation.
    type R = { left: number; right: number; top: number; bottom: number; cx: number; cy: number };
    const measure = () =>
      page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(`${sel} button`)).map((el) => {
          const box = el.getBoundingClientRect();
          const cs = getComputedStyle(el, "::before");
          const w = Math.max(parseFloat(cs.width) || 0, box.width);
          const h = Math.max(parseFloat(cs.height) || 0, box.height);
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          return {
            left: cx - w / 2,
            right: cx + w / 2,
            top: cy - h / 2,
            bottom: cy + h / 2,
            cx,
            cy,
          };
        });
      }, SENTENCE);
    await expect
      .poll(
        async () => {
          const rs = await measure();
          return rs.length === 3 && rs.every((r) => r.right - r.left > 0) ? "ready" : "settling";
        },
        { timeout: 15_000 },
      )
      .toBe("ready");
    const rects: R[] = await measure();
    for (const r of rects) {
      expect(r.right - r.left).toBeGreaterThanOrEqual(44);
      expect(r.bottom - r.top).toBeGreaterThanOrEqual(44);
    }
    // Geometric disjointness (spec §8.8): full 2D rect-intersection check over
    // every pair — not elementFromPoint (topmost-only), not x-axis alone.
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlap =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `overlay ${i} intersects overlay ${j}`).toBe(false);
      }
    }
    // +/-21px offset clicks resolve to the intended button (behavioral floor
    // probe). ATOMIC: center derivation and all four probes run in ONE
    // evaluate, so a late re-render cannot shift layout between measure and
    // probe (the flake mode two prior runs hit).
    const probeResult = await page.evaluate((sel) => {
      const btn = document.querySelector(`${sel} button`);
      if (!btn) return { label: null, hits: [] as Array<string | null> };
      const box = btn.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const offsets: Array<[number, number]> = [
        [0, -21],
        [0, 21],
        [-21, 0],
        [21, 0],
      ];
      return {
        label: btn.textContent,
        hits: offsets.map(
          ([dx, dy]) =>
            document.elementFromPoint(cx + dx, cy + dy)?.closest("button")?.textContent ?? null,
        ),
      };
    }, SENTENCE);
    expect(probeResult.label).not.toBeNull();
    for (const hit of probeResult.hits) {
      expect(hit).toBe(probeResult.label);
    }
  });
});
