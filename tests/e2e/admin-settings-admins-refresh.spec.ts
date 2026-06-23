/**
 * tests/e2e/admin-settings-admins-refresh.spec.ts (M12.2 Phase B1 — Task 6.3 Steps 5–6)
 *
 * Observable-refresh e2e for the EMBEDDED `/admin/settings` Administrators
 * section (spec §3.2). The Task 6.3 unit test (tests/app/admin/
 * adminActionsRevalidate.test.ts) proves the `revalidatePath("/admin/settings")`
 * CALL on each action's ok-path. THIS proves the user-visible outcome: that
 * the RSC payload actually revalidates the canonical embedded surface so the
 * rendered active list refreshes WITHOUT a manual reload.
 *
 *   (a) revoke a PEER admin via the embedded section → the peer's email
 *       LEAVES `admin-active-list` without page.reload() (it may still appear
 *       in the "Revoked admins" disclosure — correct; we assert only ACTIVE).
 *   (b) add an admin via the embedded add form → the new email APPEARS in
 *       `admin-active-list` without reload.
 *
 * A misconfigured embed / stale-props bug passes the mock-only unit test but
 * fails HERE (the canonical surface stays stale). Negative-regression: with
 * the new revalidatePath("/admin/settings") removed from revokeAdminAction,
 * the revoked row stays visible in admin-active-list without reload (RED).
 *
 * The DB is shared/stateful — the peer + added rows are cleaned up in a
 * try/finally so reruns are idempotent and other specs aren't polluted.
 */
import { test, expect } from "@playwright/test";

import { canonicalize } from "@/lib/email/canonicalize";

import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { admin } from "./helpers/supabaseAdmin";

const RUN_TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/**
 * Hard-delete any admin_emails row for this email (service-role bypasses RLS).
 * Used for test isolation — the runtime RPCs only ever revoke (soft-delete),
 * so cleanup must physically remove the test rows to stay idempotent and to
 * keep the canonical seed admins untouched.
 */
async function hardDeleteAdminEmail(rawEmail: string): Promise<void> {
  const email = canonicalize(rawEmail);
  if (!email) return;
  const { error } = await admin.from("admin_emails").delete().eq("email", email);
  if (error) throw new Error(`cleanup delete(${email}) failed: ${error.message}`);
}

/**
 * Ensure ADMIN_FIXTURE is an ACTIVE admin row (not just is_admin()-allowlisted)
 * — the embedded section reads admin_emails, and the actor must appear active
 * so it is NOT the sole admin once the peer is added/revoked. The seed inserts
 * edweiss412@gmail.com, but if a prior run left it revoked, re-activate it.
 */
async function ensureActorActive(rawEmail: string): Promise<void> {
  const email = canonicalize(rawEmail);
  if (!email) throw new Error(`ensureActorActive: un-canonicalizable email ${rawEmail}`);
  const { error } = await admin.from("admin_emails").upsert(
    {
      email,
      added_by: null,
      added_at: new Date().toISOString(),
      revoked_by: null,
      revoked_at: null,
    },
    { onConflict: "email" },
  );
  if (error) throw new Error(`ensureActorActive upsert(${email}) failed: ${error.message}`);
}

/** Insert a fresh, active PEER admin row directly via service-role. */
async function insertActivePeer(rawEmail: string): Promise<void> {
  const email = canonicalize(rawEmail);
  if (!email) throw new Error(`insertActivePeer: un-canonicalizable email ${rawEmail}`);
  // Start clean (in case a prior aborted run left residue), then insert active.
  await hardDeleteAdminEmail(email);
  const { error } = await admin.from("admin_emails").insert({
    email,
    added_by: null,
    added_at: new Date().toISOString(),
    revoked_by: null,
    revoked_at: null,
  });
  if (error) throw new Error(`insertActivePeer insert(${email}) failed: ${error.message}`);
}

test.describe("embedded /admin/settings Administrators — observable refresh (desktop-chromium)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
  });

  test("revoke a peer + add an admin refresh the embedded active list without reload", async ({
    page,
  }) => {
    const peerEmail = canonicalize(`peer-refresh-${RUN_TAG}@example.com`)!;
    const addEmail = canonicalize(`added-refresh-${RUN_TAG}@example.com`)!;

    await ensureActorActive(ADMIN_FIXTURE.email);
    await insertActivePeer(peerEmail);

    try {
      await signInAs(page, ADMIN_FIXTURE);
      await page.goto("/admin/settings");

      const activeList = page.getByTestId("admin-active-list");
      await expect(activeList).toBeVisible();

      // Sanity: the peer starts visible in the ACTIVE region.
      await expect(activeList.getByText(peerEmail, { exact: false })).toHaveCount(1);

      // --- (a) REVOKE the peer via the two-tap confirm flow ---
      // RevokeRowButton: idle [Revoke] → confirm [Confirm revoke]+[Cancel]
      //   → resolving [Revoking…] → on ok the page revalidates and the row
      //   moves out of the active list.
      // Each active row is <li data-testid="admin-allowlist-row"
      // data-row-email={email}> — scope to the PEER's row by its email
      // attribute so we never touch the actor's own (possibly-disabled)
      // Revoke button.
      const peerRow = activeList.locator(
        `[data-testid="admin-allowlist-row"][data-row-email="${peerEmail}"]`,
      );
      await expect(peerRow).toHaveCount(1);
      const revokeButton = peerRow.getByTestId("admin-allowlist-revoke-button");
      await expect(revokeButton).toBeEnabled();
      await revokeButton.click();

      const confirmButton = peerRow.getByTestId("admin-allowlist-revoke-confirm-button");
      await expect(confirmButton).toBeVisible();
      await confirmButton.click();

      // Assert the peer LEAVES the active list WITHOUT page.reload(). If the
      // canonical surface didn't revalidate, the soft-deleted row would stay
      // rendered in the active region (Step 6 negative-regression target).
      await expect(activeList.getByText(peerEmail, { exact: false })).toHaveCount(0);

      // The peer is allowed to still appear in the Revoked disclosure — that's
      // correct (we assert only the ACTIVE region above).

      // --- (b) ADD a new admin via the embedded add form ---
      const addForm = page.getByTestId("admin-allowlist-add-form");
      await addForm.getByTestId("admin-allowlist-email-input").fill(addEmail);
      await addForm.getByTestId("admin-allowlist-add-button").click();

      // The new email APPEARS in the active list WITHOUT reload.
      await expect(activeList.getByText(addEmail, { exact: false })).toHaveCount(1);
    } finally {
      // Idempotent cleanup: physically remove both test rows regardless of
      // outcome so reruns start clean and no test row pollutes other specs.
      await hardDeleteAdminEmail(peerEmail);
      await hardDeleteAdminEmail(addEmail);
    }
  });
});
