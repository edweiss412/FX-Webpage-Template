/**
 * app/admin/settings/_actions/roleTokenMappings.ts
 * Settings-page role-mapping edit/delete actions (spec 2026-07-15 §8.3, §8.2).
 *
 * Admin-gated. These operate on an EXISTING `role_token_mappings` row as a historical
 * fact — the settings page has NO create affordance (§8.2), so both actions are
 * LOOKUP-ONLY: `canonicalRoleToken` + non-empty/≤64, then row lookup. Deliberately NO
 * `isBuiltInRoleToken` guard (Codex R14 F3) — that guard is create-only; a dormant row
 * whose token later became built-in stays editable + removable (it is inert either way).
 *
 * Writes are LOCKLESS (global table, §8.4); no attached re-sync (per-show convergence is
 * cron-driven, §7). The forensic outcome is emitted post-write on success only.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { canonicalRoleToken } from "@/lib/parser/roleVocabulary";
import { normalizeGrants } from "@/lib/sync/roleMappingOverlay";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type UpdateRoleTokenMappingResult =
  | { ok: true }
  | { ok: false; code: "stale" | "infra_error" | "validation_error" };
export type DeleteRoleTokenMappingResult = { ok: true } | { ok: false; code: "infra_error" };

const SETTINGS_ROLES_PATH = "/admin/settings/roles";

export async function updateRoleTokenMapping(
  rawToken: string,
  rawGrants: string[],
): Promise<UpdateRoleTokenMappingResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();

  const actor = canonicalize(email);
  if (actor === null) return { ok: false, code: "infra_error" };

  // LOOKUP-ONLY validation (§8.3): canonical + non-empty/≤64 — NO isBuiltInRoleToken.
  const token = canonicalRoleToken(rawToken);
  if (token.length === 0 || token.length > 64) return { ok: false, code: "validation_error" };
  const grants = normalizeGrants(rawGrants);
  if (grants === null) return { ok: false, code: "validation_error" };

  // not-subject-to-meta: app/admin server action (outside the auth-domain roots the
  // _metaInfraContract walker owns); every await destructures { data, error } (invariant 9).
  let svc: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    svc = createSupabaseServiceRoleClient();
  } catch {
    return { ok: false, code: "infra_error" };
  }

  // EXISTING row only — `.eq(token)` scopes the update; zero updated rows means the row
  // is gone (deleted by another admin) → stale. It NEVER recreates (recreation would
  // bypass the create-path provenance gate). last-decided: grants + decided_by + fresh
  // decided_at/updated_at (Codex R12 F3/R13 F1).
  const nowIso = new Date().toISOString(); // not-render-side: last-decided mutation timestamp
  let updatedRows: Array<{ token: string }>;
  try {
    const { data, error } = await svc
      .from("role_token_mappings")
      .update({ grants, decided_by: actor, decided_at: nowIso, updated_at: nowIso })
      .eq("token", token)
      .select("token");
    if (error) return { ok: false, code: "infra_error" };
    updatedRows = (data ?? []) as Array<{ token: string }>;
  } catch {
    return { ok: false, code: "infra_error" };
  }
  if (updatedRows.length === 0) return { ok: false, code: "stale" };

  revalidatePath(SETTINGS_ROLES_PATH);
  // POST-COMMIT forensic outcome (invariant 10). Context: { token, grants } only.
  await logAdminOutcome({
    code: "ROLE_TOKEN_MAPPING_SET",
    source: "admin.settings.roleTokenMappings",
    actorEmail: actor,
    extra: { token, grants },
  });
  return { ok: true };
}

export async function deleteRoleTokenMapping(
  rawToken: string,
): Promise<DeleteRoleTokenMappingResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();

  const actor = canonicalize(email);
  if (actor === null) return { ok: false, code: "infra_error" };

  // LOOKUP-ONLY (§8.3): canonical token; NO isBuiltInRoleToken guard. An out-of-shape
  // token simply matches no row → idempotent success (the delete union has no
  // validation_error; the desired end state — no such row — already holds).
  const token = canonicalRoleToken(rawToken);

  // not-subject-to-meta: app/admin server action (outside the auth-domain roots the
  // _metaInfraContract walker owns); destructures { error } (invariant 9).
  let svc: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    svc = createSupabaseServiceRoleClient();
  } catch {
    return { ok: false, code: "infra_error" };
  }

  // Absent row → the delete matches nothing and resolves without error → idempotent
  // success (§8.3). A returned/thrown fault → infra_error.
  try {
    const { error } = await svc.from("role_token_mappings").delete().eq("token", token);
    if (error) return { ok: false, code: "infra_error" };
  } catch {
    return { ok: false, code: "infra_error" };
  }

  revalidatePath(SETTINGS_ROLES_PATH);
  // Settings delete is audited unconditionally on success (Codex R13 F2). Context: token only.
  await logAdminOutcome({
    code: "ROLE_TOKEN_MAPPING_DELETED",
    source: "admin.settings.roleTokenMappings",
    actorEmail: actor,
    extra: { token },
  });
  return { ok: true };
}
