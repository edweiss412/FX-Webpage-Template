/**
 * tests/e2e/admin-changes-feed-layout.spec.ts (Phase 6 T6.8 — real-browser layout)
 *
 * MANDATORY real-browser dimensional-invariant assertions for the per-show
 * changes feed. jsdom computes NO layout; Tailwind v4 does NOT default `.flex` to
 * `align-items: stretch` (DESIGN §7), so each parent→child dimension relationship
 * is verified end-to-end here against a real browser render.
 *
 * Dimensional Invariants (from §8 + DESIGN.md):
 *   1. Each `change-feed-entry-*` <li> fills the full width of the <ul> (entry
 *      width === list content width, ±0.5px).
 *   2. Every action button (Undo / Approve / Reject) is ≥ 44×44 CSS px
 *      (min-h-tap-min / min-w-tap-min) at the 390px mobile band AND desktop.
 *   3. Band sweep at 390 / 720 / 1280 — a single desktop width misses the
 *      intermediate track collapse (feedback_layout_gate_band_sweep).
 *
 * Requires the e2e env (server on :3000 + seeded Supabase: `pnpm db:seed`). The
 * spec seeds one `undo` row (show_change_log) and one `approve_reject` row
 * (open mi11_pending sync_hold) for the Waldorf show so BOTH affordances render,
 * then cleans them up. Verified against a PROD build (local dev hydration is
 * broken in the sandbox).
 */
import { test, expect } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const SEED_DRIVE_FILE_ID = "seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf";
const BANDS = [390, 720, 1280];
const TAP_MIN = 44;
const TOL = 0.5;

// admin-show-modal: the per-show surface is the /admin?show= review modal. The
// Suspense SKELETON shares the shell testIdBase, and both frames transiently
// coexist during the streaming swap — scope to the LOADED modal (the skeleton
// renders no title node) so the twin never trips Playwright strict mode.
const LOADED_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])';

// Stable marker so seeded rows are unambiguous to clean up.
const UNDO_ENTITY = "ZZ-Phase6-LayoutUndo";
const HOLD_ENTITY = "ZZ-Phase6-LayoutHold";

async function resolveShow(): Promise<{ id: string; slug: string; driveFileId: string }> {
  const res = await admin
    .from("shows")
    .select("id, slug, drive_file_id")
    .eq("drive_file_id", SEED_DRIVE_FILE_ID)
    .maybeSingle();
  if (res.error || !res.data?.slug) {
    throw new Error(
      `admin-changes-feed-layout: seeded show not found (run \`pnpm db:seed\`). error=${res.error?.message ?? "no row"}`,
    );
  }
  return {
    id: res.data.id as string,
    slug: res.data.slug as string,
    driveFileId: res.data.drive_file_id as string,
  };
}

async function cleanup(showId: string): Promise<void> {
  await admin.from("show_change_log").delete().eq("show_id", showId).eq("entity_ref", UNDO_ENTITY);
  await admin.from("sync_holds").delete().eq("show_id", showId).eq("entity_key", HOLD_ENTITY);
}

async function seedFeed(show: { id: string; driveFileId: string }): Promise<void> {
  await cleanup(show.id);
  // (a) an undoable auto-applied crew_removed row → feed action='undo'.
  const logIns = await admin.from("show_change_log").insert({
    show_id: show.id,
    drive_file_id: show.driveFileId,
    source: "auto_apply",
    change_kind: "crew_removed",
    entity_ref: UNDO_ENTITY,
    summary: `Removed ${UNDO_ENTITY} from the crew list`,
    before_image: { name: UNDO_ENTITY, email: "phase6-undo@example.com" },
    after_image: null,
    status: "applied",
    individually_undoable: true,
  });
  if (logIns.error) throw new Error(`seed show_change_log: ${logIns.error.message}`);

  // (b) an open mi11_pending hold → feed pending entry with action='approve_reject'.
  const holdIns = await admin.from("sync_holds").insert({
    show_id: show.id,
    drive_file_id: show.driveFileId,
    domain: "crew_email",
    entity_key: HOLD_ENTITY,
    held_value: { name: HOLD_ENTITY, email: "phase6-old@example.com" },
    proposed_value: {
      disposition: "email_change",
      name: HOLD_ENTITY,
      email: "phase6-new@example.com",
    },
    base_modified_time: "2026-06-09T10:00:00.000Z",
    kind: "mi11_pending",
    created_by: "system",
  });
  if (holdIns.error) throw new Error(`seed sync_holds: ${holdIns.error.message}`);
}

test.describe("changes feed layout (real browser, §8 dimensional invariants)", () => {
  let slug = "";
  let showId = "";

  test.beforeAll(async () => {
    const show = await resolveShow();
    slug = show.slug;
    showId = show.id;
    await seedFeed(show);
  });

  test.afterAll(async () => {
    if (showId) await cleanup(showId);
  });

  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  for (const w of BANDS) {
    test(`entries fill the list and tap targets are >=44px @${w}`, async ({ page }) => {
      // Reduced motion: the modal's entrance animation SCALES the panel
      // (pop-in 0.985→1) — sequential boundingBox reads mid-entrance compare
      // widths captured at different scale frames and drift by px-level
      // deltas. app/globals.css collapses the entrance under reduced motion,
      // so geometry is final on load (the layout-spec convention).
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: w, height: 900 });
      // admin-show-modal: the per-show surface is now the dashboard modal.
      await page.goto(`/admin?show=${slug}`);
      const modal = page.locator(LOADED_REVIEW_MODAL);
      await expect(modal).toBeVisible({ timeout: 30_000 });

      const list = modal.getByRole("list", { name: /changes/i });
      await expect(list).toBeVisible();

      // Both invariants are measured ATOMICALLY (one evaluate, one layout
      // pass) and POLLED: the modal body streams + hydrates in stages, and a
      // cross-locator sequence can straddle a React re-render (a stale handle
      // returns a null boundingBox) or a mid-stream reflow (phantom width
      // deltas). The poll settles on the committed DOM; the ASSERTED values
      // are unchanged (entry width === list width ±TOL; every action ≥44px).
      const measure = () =>
        list.evaluate(
          (ul, { tapMin, tol }) => {
            const ulWidth = ul.getBoundingClientRect().width;
            const entries = Array.from(ul.querySelectorAll('[data-testid^="change-feed-entry-"]'));
            if (entries.length === 0) return "no feed entries";
            for (const li of entries) {
              const delta = Math.abs(li.getBoundingClientRect().width - ulWidth);
              if (delta > tol) {
                return `${li.getAttribute("data-testid")} width off the list width by ${delta.toFixed(2)}px`;
              }
            }
            const buttons = Array.from(
              ul.querySelectorAll(
                '[data-testid="change-feed-undo"], [data-testid="mi11-approve"], [data-testid="mi11-reject"]',
              ),
            );
            // Seeded feed guarantees at least the Undo + Approve + Reject controls.
            if (buttons.length < 3) return `only ${buttons.length} action buttons`;
            for (const b of buttons) {
              const r = b.getBoundingClientRect();
              if (r.height < tapMin - tol || r.width < tapMin - tol) {
                return `${b.getAttribute("data-testid")} tap target ${r.width.toFixed(1)}×${r.height.toFixed(1)}`;
              }
            }
            return "ok";
          },
          { tapMin: TAP_MIN, tol: TOL },
        );
      await expect
        .poll(measure, {
          message: `entries fill the list and action tap targets are ≥44px @${w}`,
        })
        .toBe("ok");
    });
  }
});
