/**
 * tests/e2e/confirm-focus-probe.spec.ts — BL-CONFIRM-FOCUS-RESTORE-DESTRUCTIVE-CONTROLS
 *
 * Task 1 of the repair arc: MEASURE the controls the filing only derived.
 *
 * The filing's evidence was a derivation over one flag's writers —
 * `restoreFocusRef` is written by Cancel paths and by nothing on the Confirm
 * path, anywhere in the repo — plus a real-browser measurement of exactly one
 * control, the share-link rotate
 * (`docs/superpowers/specs/ci/probes/2026-08-31-sharelink-cue-focus-probe.md`).
 * A derivation says the mechanism is shared; it does not say the outcome is.
 * A control could restore focus by some other route the derivation cannot see,
 * so each one is measured before any of them is repaired.
 *
 * WHAT THE CLASS ACTUALLY CONTAINS, corrected here from the filing. The filing
 * named five controls. `ResetPickerEpochButton` is imported by NO source file:
 * `git grep ResetPickerEpochButton` returns its own definition, docs prose, its
 * jsdom unit test, and `tests/e2e/picker-flow.spec.ts:480`, which sits inside a
 * `test.skip`. It renders on no route, so it is not measured here and cannot be.
 * The reachable class is four, one of which is already measured:
 *
 *   rotate share link  — app/admin/show/[slug]/RotateShareTokenButton.tsx (MEASURED, merged arc)
 *   picker reset       — app/admin/show/[slug]/PickerResetControl.tsx     (here)
 *   archive show       — components/admin/ArchiveShowButton.tsx           (here)
 *   revoke admin       — app/admin/settings/admins/RevokeRowButton.tsx    (here)
 *
 * Both ShareHub controls are measured on ONE page load and ONE popover open,
 * because that is where they live (`components/admin/showpage/ShareHub.tsx:106,109`).
 *
 * The measurement itself, and the three things it does deliberately (focus
 * before click, never Playwright's own `.click()`, a Cancel-path control beside
 * every Confirm-path subject), live in `./helpers/confirmFocusProbe`.
 */
import { test, expect } from "@playwright/test";

import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { openShowReviewModal } from "./helpers/openShowReviewModal";
import {
  seedAutoPublishedShowWithUnpublishToken,
  sqlClient,
  type SeededShow,
} from "../db/_b2Helpers";
import { canonicalize } from "@/lib/email/canonicalize";
import { ensureActorActive, hardDeleteAdminEmail, insertActivePeer } from "./helpers/seedAdminPeer";
import {
  assertFocusReadings,
  captureRestoreTarget,
  measureCancelPath,
  measureConfirmPath,
  type CapturedTarget,
  type ConfirmControl,
  type FocusReading,
} from "./helpers/confirmFocusProbe";

let seeded: SeededShow & { slug: string };

/** Unique per run, so a leftover row from an aborted run cannot be measured instead. */
const RUN_TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe("confirm-path focus probe (BL-CONFIRM-FOCUS-RESTORE-DESTRUCTIVE-CONTROLS)", () => {
  test.beforeAll(async () => {
    // The SEED IS NOT INTERCHANGEABLE, learned by measurement rather than
    // assumed: `seedShowWithCrew` builds a show the crew ROUTE can resolve, and
    // `openShowReviewModal` never mounted for one of its slugs. The merged
    // rotate probe used this `_b2Helpers` seed and did mount, so the admin
    // review modal wants what this one writes.
    seeded = await seedAutoPublishedShowWithUnpublishToken();
    // PickerResetControl renders only when the show has crew
    // (`components/admin/showpage/ShareHub.tsx:55`), and this seed writes none,
    // so the rows go in directly.
    await sqlClient`
      insert into public.crew_members (id, show_id, name, role)
      values (gen_random_uuid(), ${seeded.showId}::uuid, 'Probe Crew One', 'Camera'),
             (gen_random_uuid(), ${seeded.showId}::uuid, 'Probe Crew Two', 'Audio')`;
  });

  /**
   * PREMISE ON THE PROBE ITSELF.
   *
   * Two granted playwright turns were burned on harness bring-up, and both
   * failed in a way that could have been mistaken for a result: a bad fixture
   * shape aborted `beforeAll`, and a seed the admin review modal cannot mount
   * failed inside the cases themselves. A probe whose surface never appeared
   * reports "no reading", and "no reading" sits one careless sentence away from
   * "no defect". So the mount is asserted ONCE, under a name that cannot be
   * misread, before any case is allowed to claim anything about focus.
   */
  test("PREMISE: the review modal mounts for the seeded show", async ({ page }) => {
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
    try {
      const modal = await openShowReviewModal(page, seeded.slug, { timeoutMs: 30_000 });
      await expect(modal.getByTestId("share-hub-kebab")).toBeVisible({ timeout: 15_000 });
    } catch (cause) {
      throw new Error(
        `PREMISE-FAILED-no-modal: the review modal never mounted for slug=${seeded.slug}, ` +
          `so every focus reading in this file would be absence-of-surface rather than ` +
          `absence-of-defect. Fix the seed before reading anything into the other cases. ` +
          `Underlying: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  });

  test.afterAll(async () => {
    // crew_members cascades from shows via the drive_file_id-keyed FKs.
    if (seeded) await sqlClient`delete from public.shows where id = ${seeded.showId}::uuid`;
  });

  /**
   * Re-assert the watched folder before EVERY navigation, not once per file.
   *
   * `app/api/admin/onboarding/finalize-cas/route.ts` is the only path that nulls
   * `app_settings.watched_folder_id`, and a sibling session's onboarding e2e
   * does exactly that against the shared local DB. When it is null, `/admin`
   * renders the onboarding wizard instead of the dashboard, the review modal
   * never mounts, and every case here fails on its readiness gate for a reason
   * that has nothing to do with focus. Measured on run 3 of this probe: the
   * column was NULL and the premise guard fired. `admin-lifecycle-layout.spec.ts`
   * carries the same beforeEach for the same reason, which is why the rotate
   * probe never hit this.
   */
  async function ensureWatchedFolder(): Promise<void> {
    await sqlClient`
      update public.app_settings
         set watched_folder_id = coalesce(watched_folder_id, 'seed-fixture-folder'),
             watched_folder_name = coalesce(watched_folder_name, 'Seed fixture folder')
       where id = 'default'`;
  }

  test.beforeEach(async ({ page }) => {
    await ensureWatchedFolder();
    await signOut(page);
    await signInAs(page, ADMIN_FIXTURE);
  });

  test("390x560: the two ShareHub controls, confirm path against cancel path", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 560 });

    const modal = await openShowReviewModal(page, seeded.slug, { timeoutMs: 30_000 });
    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    const pickerReset: ConfirmControl = {
      name: "picker-reset",
      root: popover,
      rootSelector: '[data-testid="share-hub-popover"]',
      restoreTargetSelector: '[data-testid="picker-reset-all-button"]',
      trigger: "picker-reset-all-button",
      confirm: "picker-reset-confirm-button",
      cancel: "picker-reset-cancel-button",
    };

    const target: CapturedTarget = await captureRestoreTarget(page, pickerReset);
    const readings: FocusReading[] = [];
    // Cancel FIRST for this control: the confirm is destructive and would
    // change the state the control arm needs. Order is the reason, not habit.
    readings.push(await measureCancelPath(page, pickerReset));
    readings.push(...(await measureConfirmPath(page, pickerReset)));

    console.log(`PROBE-PICKER-RESET ${JSON.stringify(readings)}`);

    // The premise: every reading came from a control that was actually there.
    // Without this the whole case passes vacuously if a testid ever moves.
    assertFocusReadings(readings, target);
  });

  test("390x560: archive show, confirm path against cancel path", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 560 });

    const modal = await openShowReviewModal(page, seeded.slug, { timeoutMs: 30_000 });
    const popover = modal.getByTestId("share-hub-popover");
    await expect(async () => {
      await modal.getByTestId("share-hub-kebab").click();
      await expect(popover).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    // ROOT IS THE MODAL, NOT THE POPOVER. Archiving unmounts the share-hub
    // popover BY DESIGN — the show is no longer live — so the popover root died
    // with the action under measurement and run 4 hung on it to the 180s
    // timeout. The modal outlives the archive, so it can still answer where
    // focus went. The reading is also taken from the page now rather than
    // through a Locator, so even a vanished root reports rootPresent:false
    // instead of hanging.
    const archive: ConfirmControl = {
      name: "archive-show",
      root: modal,
      rootSelector: '[data-testid="published-show-review-modal"]',
      restoreTargetSelector: '[data-testid="share-hub-kebab"]',
      trigger: "archive-show-button",
      confirm: "archive-show-confirm-button",
      cancel: "archive-show-cancel-button",
    };

    const target: CapturedTarget = await captureRestoreTarget(page, archive);
    const readings: FocusReading[] = [];
    readings.push(await measureCancelPath(page, archive));
    readings.push(...(await measureConfirmPath(page, archive)));

    console.log(`PROBE-ARCHIVE-SHOW ${JSON.stringify(readings)}`);

    assertFocusReadings(readings, target);
  });

  test("390x560: revoke admin, confirm path against cancel path", async ({ page }) => {
    test.setTimeout(180_000);
    const peerEmail = canonicalize(`probe-peer-${RUN_TAG}@example.com`)!;
    await ensureActorActive(ADMIN_FIXTURE.email);
    await insertActivePeer(peerEmail);

    try {
      await page.setViewportSize({ width: 390, height: 560 });
      await page.goto("/admin/settings");

      const activeList = page.getByTestId("admin-active-list");
      await expect(activeList).toBeVisible();
      const peerRow = activeList.locator(
        `[data-testid="admin-allowlist-row"][data-row-email="${peerEmail}"]`,
      );
      await expect(peerRow).toHaveCount(1);
      // The actor's OWN Revoke is disabled, so a probe that hit the wrong row
      // would measure a control nobody can press. Assert enabled before reading.
      await expect(peerRow.getByTestId("admin-allowlist-revoke-button")).toBeEnabled();

      // Root is the LIST, not the row: a successful revoke unmounts the row, and
      // a detached root cannot answer where focus went afterwards.
      const revoke: ConfirmControl = {
        name: "revoke-admin",
        // ROOT IS THE SECTION, and `root` and `rootSelector` must name the SAME
        // element. Round 2 moved the reading root off the active list because the
        // ratified restore target — the heading — sits outside it. Round 4 caught
        // that the move went too far in one place and not at all in another: the
        // selector became the HEADING, which contains no controls, so `insideRoot`
        // is false for the trigger and the cancel arm fails before the settled
        // assertion is ever reached, while the Locator still pointed at the list.
        // The section wraps both the heading and the list, so it is the only root
        // under which every element this case touches is inside.
        root: page.getByTestId("admin-settings-admins-section"),
        rootSelector: '[data-testid="admin-settings-admins-section"]',
        restoreTargetSelector: "#admin-settings-admins-heading",
        trigger: "admin-allowlist-revoke-button",
        confirm: "admin-allowlist-revoke-confirm-button",
        cancel: "admin-allowlist-revoke-cancel-button",
      };

      const target: CapturedTarget = await captureRestoreTarget(page, revoke);
      const readings: FocusReading[] = [];
      readings.push(await measureCancelPath(page, revoke));
      readings.push(...(await measureConfirmPath(page, revoke)));

      console.log(`PROBE-REVOKE-ADMIN ${JSON.stringify(readings)}`);

      assertFocusReadings(readings, target);
    } finally {
      await hardDeleteAdminEmail(peerEmail);
    }
  });
});
