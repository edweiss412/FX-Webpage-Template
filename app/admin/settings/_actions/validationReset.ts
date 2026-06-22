/**
 * app/admin/settings/_actions/validationReset.ts — Task 6 (validation-reset-button).
 *
 * Triple-guarded server actions for the admin "Reset validation data" and
 * "Reseed validation fixtures" buttons. Both actions share three gate layers:
 *
 *   1. requireAdmin()           — session/auth gate (throws AdminInfraError on infra fault)
 *   2. destructiveResetAllowed() — env gate: validation project ref + ALLOW_DESTRUCTIVE_RESET flag
 *   3. DB assert RPC            — DB-side gate: assert_destructive_reset_enabled() raises
 *                                 if the DB-side flag is off or the caller is not admin.
 *
 * Service-role client is constructed ONLY after the assert RPC passes.
 *
 * Supabase call-boundary discipline (invariant 9): every rpc() call destructures
 * { data, error }; returned-error and thrown-error paths are distinguished;
 * infra faults surface as discriminable typed codes, never silent continue.
 *
 * not-subject-to-meta: these are destructive admin server actions, not
 * sync-pipeline read helpers. They destructure { data, error } per invariant 9;
 * infra faults from requireAdmin() propagate as AdminInfraError (cataloged 500
 * boundary). RPC errors are mapped to typed codes returned to the caller.
 * No `.from()` / builder pattern is used — the single entry points are direct
 * `.rpc()` calls wrapped in try/catch below.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { destructiveResetAllowed } from "@/lib/admin/validationDeployment";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { buildFixtures, R_COMBOS, SW_COMBOS, type Combo } from "@/lib/validation/fixtures";
import { mintFixtureCombos, finalizeFixtures } from "@/lib/validation/reseedFixtures";
import type { MessageCode } from "@/lib/messages/catalog";

export type ValidationActionResult = { ok: true; count: number } | { ok: false; code: MessageCode };

// ---------------------------------------------------------------------------
// resetValidationDataAction
//
// Calls the reset_validation_data() RPC (session client so RLS + is_admin()
// apply at the DB layer too). Returns the count of cleared shows on success.
// ---------------------------------------------------------------------------
export async function resetValidationDataAction(): Promise<ValidationActionResult> {
  // Gate 1: auth
  await requireAdmin();

  // Gate 2: env (validation project ref + ALLOW_DESTRUCTIVE_RESET flag)
  if (!destructiveResetAllowed()) {
    return { ok: false, code: "VALIDATION_RESET_NOT_ALLOWED" };
  }

  // Gate 3 + RPC: session client, let RLS enforce admin identity at the DB layer
  const supabase = await createSupabaseServerClient();
  let data: { clearedShows: number } | null;
  let error: { message?: string } | null;
  try {
    const result = await supabase.rpc("reset_validation_data");
    data = result.data as { clearedShows: number } | null;
    error = result.error;
  } catch {
    return { ok: false, code: "VALIDATION_RESET_FAILED" };
  }

  if (error) {
    // Distinguish the DB-side gate-disabled raise from other RPC errors
    const msg = error.message ?? "";
    if (msg.includes("destructive reset not enabled")) {
      return { ok: false, code: "VALIDATION_RESET_NOT_ENABLED" };
    }
    return { ok: false, code: "VALIDATION_RESET_FAILED" };
  }

  const count = (data as { clearedShows: number } | null)?.clearedShows ?? 0;
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { ok: true, count };
}

// ---------------------------------------------------------------------------
// reseedValidationFixturesAction
//
// Full 16-combo reseed via the service-role client (bypasses RLS for the
// fixture writes). The service-role client is constructed ONLY after the
// assert_destructive_reset_enabled() RPC passes (session client), so the
// DB-side gate fires before any elevated-privilege operations begin.
// ---------------------------------------------------------------------------
export async function reseedValidationFixturesAction(): Promise<ValidationActionResult> {
  // Gate 1: auth
  await requireAdmin();

  // Gate 2: env (validation project ref + ALLOW_DESTRUCTIVE_RESET flag)
  if (!destructiveResetAllowed()) {
    return { ok: false, code: "VALIDATION_RESET_NOT_ALLOWED" };
  }

  // Gate 3: session-client assert RPC — DB-side gate fires BEFORE service-role
  // client is constructed. Per brief: "Construct the service-role client ONLY
  // after the assert passes."
  const sessionClient = await createSupabaseServerClient();
  let assertError: { message?: string } | null;
  try {
    const result = await sessionClient.rpc("assert_destructive_reset_enabled");
    assertError = result.error;
  } catch {
    return { ok: false, code: "VALIDATION_RESEED_FAILED" };
  }

  if (assertError) {
    const msg = assertError.message ?? "";
    if (msg.includes("destructive reset not enabled")) {
      return { ok: false, code: "VALIDATION_RESET_NOT_ENABLED" };
    }
    return { ok: false, code: "VALIDATION_RESEED_FAILED" };
  }

  // Assert passed — now safe to construct the service-role client.
  // Compute validationTodayIso ONCE (UTC-midnight-drift safe; same value
  // is passed to buildFixtures, mintFixtureCombos, and finalizeFixtures).
  // Pattern sourced from scripts/validation-reseed.ts:131.
  const validationTodayIso = new Date().toISOString().slice(0, 10);
  const serviceClient =
    createSupabaseServiceRoleClient() as unknown as import("@/lib/validation/reseedFixtures").LooseSupabaseClient;

  const fixtures = buildFixtures(validationTodayIso);
  const ALL_COMBOS: Combo[] = [...R_COMBOS, ...SW_COMBOS];

  try {
    const { minted } = await mintFixtureCombos(serviceClient, fixtures, validationTodayIso);
    await finalizeFixtures(serviceClient, ALL_COMBOS, validationTodayIso);

    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    return { ok: true, count: minted };
  } catch {
    return { ok: false, code: "VALIDATION_RESEED_FAILED" };
  }
}
