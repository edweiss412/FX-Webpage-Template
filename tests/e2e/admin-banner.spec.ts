/**
 * tests/e2e/admin-banner.spec.ts (M5 §B Task 5.9 — Doug's portion)
 *
 * E2E coverage for the admin AlertBanner. Runs against the mobile-safari
 * project (port 3000), which has ADMIN_DEV_PANEL_ENABLED=true so the
 * /admin/dev route renders for admins.
 *
 * Spec §4.6 (admin_alerts) + §12.4 (catalog) + invariant 5 (no raw codes
 * in user-visible UI).
 *
 * Test surfaces:
 *   1. Clean state — no banner.
 *   2. Insert one row — banner renders the catalog dougFacing copy
 *      (anti-tautology: assert against the literal string from the catalog
 *      file, not messageFor()).
 *   3. Click Resolve — banner disappears; row is `resolved_at IS NOT NULL`.
 *   4. Non-admin user → /admin/dev returns 403 (the layout's requireAdmin
 *      gate fires before the banner mounts).
 */
import { test, expect } from "@playwright/test";
import { admin } from "./helpers/supabaseAdmin";
import { ADMIN_FIXTURE, NON_ADMIN_CREW_FIXTURE } from "./helpers/fixtures";
import { signInAs, signOut } from "./helpers/signInAs";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const ALERT_CODE = "AMBIGUOUS_EMAIL_BINDING" as const;

async function clearAlerts(): Promise<void> {
  // Wipe ALL admin_alerts rows — service role bypasses RLS. Use neq on a
  // never-matching id so the DELETE WHERE clause is well-formed.
  const { error } = await admin
    .from("admin_alerts")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(`clearAlerts failed: ${error.message}`);
}

async function insertAlert(code: string): Promise<string> {
  const { data, error } = await admin
    .from("admin_alerts")
    .insert({
      code,
      // show_id null — the unique partial index allows one row per
      // (coalesce(show_id::text, ''), code) where resolved_at is null.
      // We clear the table beforehand so collision isn't a concern.
      context: { source: "e2e" },
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertAlert(${code}) failed: ${error.message}`);
  return data!.id as string;
}

async function rowResolvedAt(id: string): Promise<string | null> {
  const { data, error } = await admin
    .from("admin_alerts")
    .select("resolved_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(`rowResolvedAt(${id}) failed: ${error.message}`);
  return (data?.resolved_at as string | null) ?? null;
}

test.describe("admin AlertBanner (mobile-safari, /admin/dev)", () => {
  test.beforeEach(async ({ page }) => {
    await signOut(page);
    await clearAlerts();
  });

  test("clean state: no banner mounts when admin_alerts has no unresolved rows", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(200);
    // The admin layout renders for admins; the banner slot is empty when
    // no unresolved rows exist.
    await expect(page.locator("[data-testid=admin-nav-brand]")).toBeVisible();
    await expect(page.locator("[data-testid=admin-alert-banner]")).toHaveCount(0);
  });

  test("inserted row: banner renders the dougFacing catalog copy verbatim (anti-tautology)", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const id = await insertAlert(ALERT_CODE);

    await page.goto("/admin/dev");

    const banner = page.locator("[data-testid=admin-alert-banner]");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-alert-id", id);

    // Anti-tautology: assert the literal string from MESSAGE_CATALOG, not
    // the runtime messageFor() result.
    await expect(page.locator("[data-testid=error-explainer-message]")).toHaveText(
      MESSAGE_CATALOG[ALERT_CODE].dougFacing!,
    );
  });

  test("Resolve action: two-tap confirm submits + hides banner + stamps resolved_at on the row", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const id = await insertAlert(ALERT_CODE);

    await page.goto("/admin/dev");
    await expect(page.locator("[data-testid=admin-alert-banner]")).toBeVisible();

    // M9 C4 / M5-D3 (R2 fix): Resolve is now a two-tap confirm flow per
    // shape brief §5.4. First tap moves idle → confirm; the form
    // submits only on the second tap (Confirm resolve). This test pins
    // both transitions plus the eventual server-side resolve.

    // First tap: idle → confirm. The Confirm + Cancel sibling pair
    // appears; the original Resolve button unmounts.
    await page.click("[data-testid=admin-alert-resolve-button]");
    await expect(page.locator("[data-testid=admin-alert-confirm-row]")).toBeVisible();
    await expect(
      page.locator("[data-testid=admin-alert-confirm-resolve-button]"),
    ).toBeVisible();
    await expect(page.locator("[data-testid=admin-alert-cancel-button]")).toBeVisible();

    // Second tap: Confirm resolve submits the parent <form> Server Action
    // which UPDATEs the row and revalidates /admin so the banner re-renders empty.
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click("[data-testid=admin-alert-confirm-resolve-button]"),
    ]);

    // Banner is gone (no longer mounts because the SELECT now returns 0 rows).
    await expect(page.locator("[data-testid=admin-alert-banner]")).toHaveCount(0);

    // Refresh — banner stays gone (state, not just optimistic UI).
    await page.reload();
    await expect(page.locator("[data-testid=admin-alert-banner]")).toHaveCount(0);

    // DB confirms: the row's resolved_at is non-null AND resolved_by is
    // the admin's email.
    const resolvedAt = await rowResolvedAt(id);
    expect(resolvedAt).not.toBeNull();

    const { data, error } = await admin
      .from("admin_alerts")
      .select("resolved_by")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect((data as { resolved_by: string | null } | null)?.resolved_by).toBe(ADMIN_FIXTURE.email);
  });

  test("M9 C4 / M5-D3: Cancel during two-tap confirm reverts to idle (no DB write)", async ({
    page,
  }) => {
    await signInAs(page, ADMIN_FIXTURE);
    const id = await insertAlert(ALERT_CODE);

    await page.goto("/admin/dev");
    await expect(page.locator("[data-testid=admin-alert-banner]")).toBeVisible();

    // First tap → confirm.
    await page.click("[data-testid=admin-alert-resolve-button]");
    await expect(page.locator("[data-testid=admin-alert-confirm-row]")).toBeVisible();

    // Cancel → idle. Confirm row unmounts; original Resolve returns.
    await page.click("[data-testid=admin-alert-cancel-button]");
    await expect(page.locator("[data-testid=admin-alert-confirm-row]")).toHaveCount(0);
    await expect(page.locator("[data-testid=admin-alert-resolve-button]")).toBeVisible();

    // No server round-trip happened: the row is still unresolved.
    const resolvedAt = await rowResolvedAt(id);
    expect(resolvedAt).toBeNull();
  });

  test("non-admin user: /admin/dev → 403 from the layout's requireAdmin gate (banner never mounts)", async ({
    page,
  }) => {
    // Even with an unresolved alert in the table, the non-admin must not
    // see the banner — the layout's requireAdmin call rejects first.
    await insertAlert(ALERT_CODE);

    await signInAs(page, NON_ADMIN_CREW_FIXTURE);
    const response = await page.goto("/admin/dev");
    expect(response?.status()).toBe(403);

    // Belt-and-suspenders: even if the page rendered partial chrome, the
    // banner testid must not appear in the response body.
    const body = (await response?.text()) ?? "";
    expect(body).not.toContain("admin-alert-banner");
  });
});
