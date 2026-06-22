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
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`/admin/show/${slug}`);

      const list = page.getByRole("list", { name: /changes/i });
      await expect(list).toBeVisible();
      const listBox = await list.boundingBox();
      expect(listBox).not.toBeNull();

      const entries = page.locator('[data-testid^="change-feed-entry-"]');
      const n = await entries.count();
      expect(n).toBeGreaterThan(0);

      // Invariant 1: each entry <li> fills the full list content width.
      for (let i = 0; i < n; i++) {
        const eb = await entries.nth(i).boundingBox();
        expect(eb).not.toBeNull();
        expect(Math.abs(eb!.width - listBox!.width)).toBeLessThanOrEqual(TOL);
      }

      // Invariant 2: every action affordance is at least a 44px tap target.
      const buttons = page.locator(
        '[data-testid="change-feed-undo"], [data-testid="mi11-approve"], [data-testid="mi11-reject"]',
      );
      const bn = await buttons.count();
      // Seeded feed guarantees at least the Undo + Approve + Reject controls.
      expect(bn).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < bn; i++) {
        const bb = await buttons.nth(i).boundingBox();
        expect(bb).not.toBeNull();
        expect(bb!.height).toBeGreaterThanOrEqual(TAP_MIN - TOL);
        expect(bb!.width).toBeGreaterThanOrEqual(TAP_MIN - TOL);
      }
    });
  }
});
