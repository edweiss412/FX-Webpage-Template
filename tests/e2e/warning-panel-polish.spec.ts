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
    // Failure-safe order: a rejected seed delete must not skip the dashboard
    // state restore (shared state leak into later suites).
    try {
      if (show) await deleteSeededShow(show.driveFileId);
    } finally {
      if (restoreDashboardState) await restoreDashboardState();
    }
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
    try {
      await expect(page.locator(SENTENCE)).toBeVisible();
    } catch (e) {
      const panel = await page
        .locator(`[data-testid$="-breakdown-warnings"]`)
        .first()
        .textContent()
        .catch(() => "(panel not found)");
      const status = await page
        .locator(`[data-testid="warnings-panel-status"]`)
        .textContent()
        .catch(() => "(status not found)");
      console.log("DIAG panel:", panel, "| status:", status);
      throw e;
    }
    const btn = page.locator(`${SENTENCE} button`, { hasText: "Crew" }).first();
    await expect(btn).toBeVisible();
    // The modal re-renders once after open (post-open refresh) and swaps the
    // first-mounted nodes; a click dispatched into that swap lands on a
    // detached node and scrolls nothing. No frame-count settle gate can prove
    // the refresh already happened, so the click itself retries: re-resolve a
    // FRESH locator each attempt and accept only an observed alignment.
    // Clicking twice is idempotent (same scroll target).
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
    let aligned = false;
    for (let attempt = 0; attempt < 3 && !aligned; attempt++) {
      await page.locator(`${SENTENCE} button`, { hasText: "Crew" }).first().click();
      try {
        await expect.poll(align, { timeout: 4_000 }).toBeLessThanOrEqual(24);
        aligned = true;
      } catch {
        // node swapped mid-click; re-resolve and retry
      }
    }
    expect(aligned, "section aligned after at most 3 click attempts").toBe(true);
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
    expect(rects.length, "all three buttons measurable at assert time").toBe(3);
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
    // probe). ATOMIC (center derived and probed in ONE evaluate, so layout
    // cannot shift between measure and probe) AND POLLED (a late re-render
    // between iterations self-heals on the next sample).
    await expect
      .poll(
        async () =>
          page.evaluate((sel) => {
            const btn = document.querySelector(`${sel} button`);
            if (!btn) return "no-button";
            const label = btn.textContent;
            let box = btn.getBoundingClientRect();
            if (box.width === 0) return "zero-box";
            // Self-heal: the modal's post-open refresh can reset scroll after
            // our earlier scrollIntoView, leaving the button outside the
            // viewport where elementFromPoint sees nothing. Re-center and
            // retry on the next poll sample.
            if (box.top < 0 || box.bottom > window.innerHeight) {
              btn.scrollIntoView({ block: "center" });
              return "re-scrolled";
            }
            box = btn.getBoundingClientRect();
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height / 2;
            const offsets: Array<[number, number]> = [
              [0, -21],
              [0, 21],
              [-21, 0],
              [21, 0],
            ];
            const hits = offsets.map(([dx, dy]) => {
              const el = document.elementFromPoint(cx + dx, cy + dy);
              return `${dx},${dy}=>${el?.tagName}.${
                (el as HTMLElement | null)?.className?.toString().split(" ")[0]
              }#${el?.closest("button")?.textContent ?? "-"}`;
            });
            const ok = hits.every((h) => h.endsWith(`#${label}`));
            return ok
              ? "all-hit"
              : `miss:${hits.join(" | ")} box=${box.width}x${box.height}@${cx},${cy}`;
          }, SENTENCE),
        { timeout: 10_000 },
      )
      .toBe("all-hit");
  });
});
