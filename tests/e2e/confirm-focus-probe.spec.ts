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
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { canonicalize } from "@/lib/email/canonicalize";
import { ensureActorActive, hardDeleteAdminEmail, insertActivePeer } from "./helpers/seedAdminPeer";
import {
  measureCancelPath,
  measureConfirmPath,
  type ConfirmControl,
  type FocusReading,
} from "./helpers/confirmFocusProbe";

let seeded: SeededShow;

/** Unique per run, so a leftover row from an aborted run cannot be measured instead. */
const RUN_TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe("confirm-path focus probe (BL-CONFIRM-FOCUS-RESTORE-DESTRUCTIVE-CONTROLS)", () => {
  test.beforeAll(async () => {
    // PickerResetControl renders only when the show has crew
    // (`components/admin/showpage/ShareHub.tsx:55`, the hasCrew check), and the
    // share-hub URL row renders only when the link is live, so the seed has to
    // satisfy both at once.
    seeded = await seedShowWithCrew({
      published: true,
      archived: false,
      crew: [{ name: "Probe Crew One" }, { name: "Probe Crew Two" }],
    });
  });

  test.afterAll(async () => {
    if (seeded) await deleteSeededShow(seeded.driveFileId);
  });

  test.beforeEach(async ({ page }) => {
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
      trigger: "picker-reset-all-button",
      confirm: "picker-reset-confirm-button",
      cancel: "picker-reset-cancel-button",
    };

    const readings: FocusReading[] = [];
    // Cancel FIRST for this control: the confirm is destructive and would
    // change the state the control arm needs. Order is the reason, not habit.
    readings.push(await measureCancelPath(page, pickerReset));
    readings.push(...(await measureConfirmPath(page, pickerReset)));

    console.log(`PROBE-PICKER-RESET ${JSON.stringify(readings)}`);

    // The premise: every reading came from a control that was actually there.
    // Without this the whole case passes vacuously if a testid ever moves.
    expect(readings.length).toBe(5);
    expect(readings.some((r) => r.at.endsWith(":armed"))).toBe(true);
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

    const archive: ConfirmControl = {
      name: "archive-show",
      root: popover,
      trigger: "archive-show-button",
      confirm: "archive-show-confirm-button",
      cancel: "archive-show-cancel-button",
    };

    const readings: FocusReading[] = [];
    readings.push(await measureCancelPath(page, archive));
    readings.push(...(await measureConfirmPath(page, archive)));

    console.log(`PROBE-ARCHIVE-SHOW ${JSON.stringify(readings)}`);

    expect(readings.length).toBe(5);
    expect(readings.some((r) => r.at.endsWith(":armed"))).toBe(true);
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
        root: activeList,
        trigger: "admin-allowlist-revoke-button",
        confirm: "admin-allowlist-revoke-confirm-button",
        cancel: "admin-allowlist-revoke-cancel-button",
      };

      const readings: FocusReading[] = [];
      readings.push(await measureCancelPath(page, revoke));
      readings.push(...(await measureConfirmPath(page, revoke)));

      console.log(`PROBE-REVOKE-ADMIN ${JSON.stringify(readings)}`);

      expect(readings.length).toBe(5);
      expect(readings.some((r) => r.at.endsWith(":armed"))).toBe(true);
    } finally {
      await hardDeleteAdminEmail(peerEmail);
    }
  });
});
