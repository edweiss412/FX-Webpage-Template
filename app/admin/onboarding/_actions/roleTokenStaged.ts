/**
 * app/admin/onboarding/_actions/roleTokenStaged.ts
 * Wizard-staged "recognize this role" create action (spec 2026-07-15 §8.3 staged twin).
 *
 * Admin-gated. Pre-create there is NO `shows` row — the staged parse + warnings live
 * in `pending_syncs.parse_result`. This action upserts the GLOBAL `role_token_mappings`
 * row (LOCKLESS, §8.4), then re-stages the current wizard session so step-3 refreshes
 * (use-raw staged pattern, `useRawStaged.ts`). The mapping is durable regardless of the
 * re-stage outcome (§7): a failed/thrown re-stage → `apply_pending`, never an error.
 *
 * Pinned evaluation order mirrors the live action (`roleToken.ts`): validation →
 * EXISTING-ROW branch (set-equal → re-stage; different → conflict) → staged-warning
 * provenance (only when NO row) → upsert → logAdminOutcome STRICTLY AFTER the write →
 * re-stage follow-up.
 */
"use server";

import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { canonicalRoleToken, isBuiltInRoleToken } from "@/lib/parser/roleVocabulary";
import { normalizeGrants } from "@/lib/sync/roleMappingOverlay";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { rescanWizardSheet } from "@/lib/onboarding/rescanWizardSheet";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import type { MapRoleTokenResult } from "@/app/admin/show/[slug]/_actions/roleToken";

function grantsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((g, i) => g === b[i]);
}

function warningsOf(parseResult: unknown): ParseWarning[] {
  if (parseResult && typeof parseResult === "object" && "warnings" in parseResult) {
    const w = (parseResult as ParseResult).warnings;
    return Array.isArray(w) ? w : [];
  }
  return [];
}

export async function mapRoleTokenStaged(
  wizardSessionId: string,
  driveFileId: string,
  rawToken: string,
  rawGrants: string[],
): Promise<MapRoleTokenResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();

  const actor = canonicalize(email);
  if (actor === null) return { ok: false, code: "infra_error" };

  const token = canonicalRoleToken(rawToken);
  if (token.length === 0 || token.length > 64) return { ok: false, code: "validation_error" };
  if (isBuiltInRoleToken(token)) return { ok: false, code: "validation_error" };
  const grants = normalizeGrants(rawGrants);
  if (grants === null) return { ok: false, code: "validation_error" };

  // Service-role client (role_token_mappings is service-role only, §3); the staged
  // parse warnings live on pending_syncs (service-role bypasses RLS).
  // not-subject-to-meta: app/admin server action (outside the auth-domain roots the
  // _metaInfraContract walker owns); every await destructures { data, error } and
  // distinguishes returned-error from thrown-fault (invariant 9).
  let svc: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    svc = createSupabaseServiceRoleClient();
  } catch {
    return { ok: false, code: "infra_error" };
  }

  // (1) EXISTING ROW FIRST — set-equal → idempotent (re-stage below); different → conflict.
  let existing: { grants: string[] } | null;
  try {
    const { data, error } = await svc
      .from("role_token_mappings")
      .select("grants")
      .eq("token", token)
      .maybeSingle<{ grants: string[] }>();
    if (error) return { ok: false, code: "infra_error" };
    existing = data;
  } catch {
    return { ok: false, code: "infra_error" };
  }

  if (existing) {
    const existingGrants = normalizeGrants(existing.grants) ?? [];
    if (!grantsEqual(existingGrants, grants)) return { ok: false, code: "conflict" };
    // set-equal → idempotent no-op; fall through to the re-stage.
  } else {
    // (2) Provenance against the wizard session's STAGED parse warnings. An absent
    // pending_syncs row yields no warnings → stale (nothing written). This is the
    // create-without-warning guard: the staged parse must name this exact token.
    let warnings: ParseWarning[];
    try {
      const { data, error } = await svc
        .from("pending_syncs")
        .select("parse_result")
        .eq("wizard_session_id", wizardSessionId)
        .eq("drive_file_id", driveFileId)
        .maybeSingle<{ parse_result: unknown }>();
      if (error) return { ok: false, code: "infra_error" };
      warnings = warningsOf(data?.parse_result);
    } catch {
      return { ok: false, code: "infra_error" };
    }
    const hasWarning = warnings.some(
      (w) => w.code === "UNKNOWN_ROLE_TOKEN" && w.roleToken === token,
    );
    if (!hasWarning) return { ok: false, code: "stale" };

    // (3) Upsert (insert). A failed write → infra_error, emits NOTHING.
    // Create-race carve-out (§8.3, mirrors roleToken.ts): the loser of a concurrent
    // identical create trips the unique constraint (23505). Re-read the winner's row —
    // set-equal → idempotent (no emit, fall through to re-stage); different → conflict;
    // any non-23505 error stays infra_error.
    const nowIso = new Date().toISOString(); // not-render-side: mapping decision timestamp
    let raceResolved = false;
    try {
      const { error } = await svc.from("role_token_mappings").insert({
        token,
        grants,
        decided_by: actor,
        decided_at: nowIso,
        updated_at: nowIso,
      });
      if (error) {
        if (error.code !== "23505") return { ok: false, code: "infra_error" };
        const { data: raced, error: raceError } = await svc
          .from("role_token_mappings")
          .select("grants")
          .eq("token", token)
          .maybeSingle<{ grants: string[] }>();
        if (raceError || !raced) return { ok: false, code: "infra_error" };
        const racedGrants = normalizeGrants(raced.grants) ?? [];
        if (!grantsEqual(racedGrants, grants)) return { ok: false, code: "conflict" };
        raceResolved = true; // winner wrote the same grants — idempotent, no emit
      }
    } catch {
      return { ok: false, code: "infra_error" };
    }

    // POST-COMMIT forensic outcome (invariant 10). Context: { token, grants } only.
    // Skipped on a resolved race: THIS caller wrote nothing (the winner did).
    if (!raceResolved) {
      await logAdminOutcome({
        code: "ROLE_TOKEN_MAPPING_SET",
        source: "admin.onboarding.roleTokenStaged",
        actorEmail: actor,
        wizardSessionId,
        driveFileId,
        extra: { token, grants },
      });
    }
  }

  // (4) Follow-up re-stage. `applied` (§8.3 Codex R14 F1) = the re-stage COMPLETED
  // (`status:"updated"`) AND the refreshed staged parse no longer contains this
  // token's warning. A failed/thrown re-stage after the durable upsert → apply_pending
  // (never an error). The mapping is already durable, so we never surface a fault.
  let applied = false;
  try {
    const rescan = await rescanWizardSheet(driveFileId, wizardSessionId);
    if (rescan.status === "updated") {
      const { data, error } = await svc
        .from("pending_syncs")
        .select("parse_result")
        .eq("wizard_session_id", wizardSessionId)
        .eq("drive_file_id", driveFileId)
        .maybeSingle<{ parse_result: unknown }>();
      if (!error) {
        const refreshed = warningsOf(data?.parse_result);
        applied = !refreshed.some((w) => w.code === "UNKNOWN_ROLE_TOKEN" && w.roleToken === token);
      }
    }
  } catch {
    applied = false;
  }
  return { ok: true, state: applied ? "applied" : "apply_pending" };
}
