/**
 * app/admin/show/[slug]/_actions/roleToken.ts
 * Per-show "recognize this role" create action (spec 2026-07-15 §8.3).
 *
 * Admin-gated. Maps a novel/unrecognized role token to a small closed set of
 * capability grants (or recognize-only), stored GLOBALLY in `role_token_mappings`,
 * then delegates the apply to the existing per-show re-sync entry.
 *
 * The mapping upsert is LOCKLESS (spec §8.4 — `role_token_mappings` is a global
 * table outside the invariant-2 mutation list; it takes NO per-show advisory lock).
 * `runManualSyncForShow` acquires its OWN pipeline lock exactly as it does today —
 * this action introduces no new lock holder.
 *
 * Pinned evaluation order (§8.3, §7):
 *   validation → EXISTING-ROW branch (set-equal → idempotent success that STILL
 *   re-syncs; different grants → conflict, row untouched) → warning-provenance
 *   (only when NO row) → upsert → logAdminOutcome STRICTLY AFTER the successful
 *   write (a failed upsert emits NOTHING) → follow-up re-sync (mirrors
 *   `useRaw.ts:155-170`: a thrown fault is caught → apply_pending, never escapes).
 */
"use server";

import { revalidateShow } from "@/lib/data/showCacheTag";
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { canonicalRoleToken, isBuiltInRoleToken } from "@/lib/parser/roleVocabulary";
import { normalizeGrants } from "@/lib/sync/roleMappingOverlay";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ParseWarning } from "@/lib/parser/types";
import { resolveShowById } from "./shared";

export type MapRoleTokenResult =
  | { ok: true; state: "applied" | "apply_pending" }
  | {
      ok: false;
      code: "stale" | "conflict" | "infra_error" | "show_not_found" | "validation_error";
    };

/** Set-equality over already-normalized (deduped, stable-ordered) grant arrays. */
function grantsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((g, i) => g === b[i]);
}

export async function mapRoleToken(
  showId: string,
  rawToken: string,
  rawGrants: string[],
): Promise<MapRoleTokenResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();

  // `decided_by` write shape (§8.3): canonicalize the identity email immediately
  // before the upsert; a malformed identity source → infra_error, NOTHING written
  // (invariant 3 — a non-email string never persists into decided_by).
  const actor = canonicalize(email);
  if (actor === null) return { ok: false, code: "infra_error" };

  // Boundary validation (§8.3 / §5.3): canonical token, non-empty, ≤64, reject
  // built-in tokens (create-path guard), grants a subset of the four grantable
  // flags (fail-closed via normalizeGrants → null, not silently filtered).
  const token = canonicalRoleToken(rawToken);
  if (token.length === 0 || token.length > 64) return { ok: false, code: "validation_error" };
  if (isBuiltInRoleToken(token)) return { ok: false, code: "validation_error" };
  const grants = normalizeGrants(rawGrants);
  if (grants === null) return { ok: false, code: "validation_error" };

  // Server-derive the show (lock key + provenance target) — never a client value.
  const resolved = await resolveShowById(showId);
  if (resolved.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (resolved.kind === "not_found") return { ok: false, code: "show_not_found" };
  const { id, driveFileId } = resolved.show;

  // Service-role client: `role_token_mappings` is REVOKEd from anon/authenticated
  // and granted only to service_role (migration §3) — the lockless global write path.
  // not-subject-to-meta: app/admin server action (outside the auth-domain roots the
  // _metaInfraContract walker owns); every await below destructures { data, error }
  // and distinguishes returned-error from thrown-fault (invariant 9).
  let svc: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    svc = createSupabaseServiceRoleClient();
  } catch {
    return { ok: false, code: "infra_error" };
  }

  // (1) EXISTING ROW FIRST (§8.3 — a stale/tampered create must not silently
  // overwrite another admin's global decision): set-equal → idempotent, skip the
  // provenance check + write + emit and fall through to the re-sync; different
  // grants → conflict, nothing written (the settings edit path is the only mutator).
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
    // set-equal → idempotent no-op; this show may not have applied it yet (that is
    // why its control rendered), so still run the follow-up below.
  } else {
    // (2) Warning-provenance (only when NO row exists) — re-read the show's current
    // persisted parse warnings; require an UNKNOWN_ROLE_TOKEN warning naming this
    // exact token, else `stale` (nothing written). Closes create-without-warning:
    // a tampered client cannot mint a global row for a token no sheet produced.
    let warnings: ParseWarning[];
    try {
      const { data, error } = await svc
        .from("shows_internal")
        .select("parse_warnings")
        .eq("show_id", id)
        .maybeSingle<{ parse_warnings: ParseWarning[] | null }>();
      if (error) return { ok: false, code: "infra_error" };
      warnings = data?.parse_warnings ?? [];
    } catch {
      return { ok: false, code: "infra_error" };
    }
    const hasWarning = warnings.some(
      (w) => w.code === "UNKNOWN_ROLE_TOKEN" && w.roleToken === token,
    );
    if (!hasWarning) return { ok: false, code: "stale" };

    // (3) Upsert (insert — every existing-row case already returned above). A failed
    // write → infra_error and emits NOTHING (post-commit ordering, invariant 10).
    // Create-race carve-out (§8.3): two admins submitting the same novel token both
    // clear the no-row provenance check; the loser's insert trips the unique
    // constraint (Postgres 23505). Re-read the winner's row and honor the same
    // idempotent set-equal contract as the existing-row branch above — set-equal → the
    // write already happened (emit NOTHING, fall through to re-sync); different grants →
    // conflict. Any non-23505 error stays infra_error.
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

    // POST-COMMIT forensic outcome (outside any lock tx, invariant 10). `await` is
    // load-bearing. Context carries { token, grants } only — no secrets, no crew PII.
    // Skipped on a resolved race: THIS caller wrote nothing (the winner did).
    if (!raceResolved) {
      await logAdminOutcome({
        code: "ROLE_TOKEN_MAPPING_SET",
        source: "admin.show.roleToken",
        actorEmail: actor,
        showId: id,
        extra: { token, grants },
      });
    }
  }

  // (4) Follow-up re-sync (its OWN lock — sequential, never nested). A thrown fault
  // must NOT escape after the mapping is durable + the outcome emitted; surface the
  // same apply_pending state the UI self-heals to (§7; mirrors useRaw.ts:155-170).
  let applied = false;
  try {
    const sync = await runManualSyncForShow(driveFileId);
    applied =
      sync !== null &&
      typeof sync === "object" &&
      "outcome" in sync &&
      (sync as { outcome?: unknown }).outcome === "applied";
  } catch {
    applied = false;
  }
  revalidateShow(id);
  return { ok: true, state: applied ? "applied" : "apply_pending" };
}
