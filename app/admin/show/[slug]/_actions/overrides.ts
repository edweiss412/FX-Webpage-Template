/**
 * app/admin/show/[slug]/_actions/overrides.ts (spec 2026-07-07 §8.4 / §11).
 *
 * The thin server-action layer behind every <OverrideableField> save/revert/
 * repoint/discard on BOTH edit surfaces (live-show detail + review wizard). It:
 *   (a) gates on requireAdminIdentity() FIRST (authorization before any client),
 *   (b) canonicalizes the actor email at the boundary (invariant 3 primary
 *       mechanism; the admin_overrides_created_by_canonical CHECK is the net),
 *   (c) DELEGATES to lib/overrides/setFieldOverride.ts — the service-role RPC
 *       helper (§8.4 critical: set_field_override EXECUTE is granted only to
 *       service_role). NO inline `.rpc` here — the advisory lock is held IN-RPC
 *       (single-holder rule, AGENTS.md invariant 2 / feed.ts:10-14),
 *   (d) on the committed-success branch, POST-COMMIT (outside any tx): the per-op
 *       forensic outcome code (§11), a best-effort coarse-bell re-derivation for
 *       BOTH override alert codes (R3b-7 — a discard/repoint/reactivate that
 *       cleared the last paused row of a code resolves its bell), and a cache bust.
 *
 * The four op→code literals ride the logAdminOutcome(...) call (stripped → NOT a
 * §12.4 producer) and are registered in tests/log/_auditableMutations.ts +
 * proven in tests/log/adminOutcomeBehavior.test.ts (invariant 10 admin contract).
 */
"use server";

import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  setFieldOverride,
  type SetFieldOverrideParams,
  type SetFieldOverrideResult,
} from "@/lib/overrides/setFieldOverride";
import { validateOverrideValue } from "@/lib/overrides/validateOverrideValue";
import { resolveOverrideAlertsForShow } from "@/lib/adminAlerts/resolveOverrideAlertsForShow";

// op → distinct forensic outcome code (§11 R9: repoint/discard are real mutations,
// so each op gets first-class audit coverage). String literals so Assertion 1 of
// _metaAdminOutcomeContract sees each code carried by this file.
function mapOpToCode(op: SetFieldOverrideParams["p_op"]): string {
  switch (op) {
    case "upsert":
      return "FIELD_OVERRIDE_SET";
    case "revert":
      return "FIELD_OVERRIDE_REVERTED";
    case "repoint":
      return "FIELD_OVERRIDE_REPOINTED";
    case "discard":
      return "FIELD_OVERRIDE_DISCARDED";
  }
}

// Resolve the show UUID from the drive_file_id (post-commit, for telemetry +
// alert re-derivation + cache-bust). Service-role read; {data,error} discipline.
async function resolveShowId(driveFileId: string): Promise<string | null> {
  try {
    const client = createSupabaseServiceRoleClient();
    const { data, error } = await client
      .from("shows")
      .select("id")
      .eq("drive_file_id", driveFileId)
      .maybeSingle<{ id: string }>();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

// The pre-RPC shape-guard status code. It belongs to the LOCAL override-RPC-status
// family (§10 leaves these UNcataloged — mapped to copy in OverrideableField's
// OVERRIDE_RPC_COPY, alongside OVERRIDE_STALE_REVIEW / OVERRIDE_INVALID_OP /
// OVERRIDE_INVALID_STATE), NOT the §12.4 catalog. Held as a named const (referenced,
// never an inline `code: "..."` literal) so the §12.4 producer scan
// (lib/messages/__internal__/codeProducers.ts) does not misread a local RPC-status code
// as an orphan catalog producer — matching how the sibling codes stay off that scan.
const OVERRIDE_INVALID_SHAPE = "OVERRIDE_INVALID_SHAPE" as const;

export async function setFieldOverrideAction(
  params: SetFieldOverrideParams,
): Promise<SetFieldOverrideResult> {
  // (a) authorization gate FIRST — before any service-role client is constructed.
  const identity = await requireAdminIdentity();
  // (b) canonicalize the actor at the boundary (invariant 3). Empty ("") if the
  //     identity email is somehow blank — the CHECK safety-net rejects it downstream.
  const actor = canonicalize(identity.email) ?? "";

  // (b2) §7.4 dates/venue SHAPE guard — the authoritative TS validation the spec
  //      designates (§389/391 shared helper; migration §178 "precise pre-RPC UI
  //      message"). The RPC only rejects null / non-object / empty for show fields, so
  //      a valid-JSON-but-wrong-shape object (e.g. {"foo":"bar"}) would otherwise be
  //      written straight into shows.dates/venue (adversarial R2 HIGH). Only ops that
  //      carry a value to write (upsert/repoint) on the show domain need this.
  if (
    params.p_domain === "show" &&
    (params.p_field === "dates" || params.p_field === "venue") &&
    (params.p_op === "upsert" || params.p_op === "repoint") &&
    params.p_override_value != null
  ) {
    const shape = validateOverrideValue(params.p_field, params.p_override_value, {
      matchKey: params.p_match_key,
    });
    if (!shape.ok) return { ok: false, code: OVERRIDE_INVALID_SHAPE };
  }

  // (c) delegate to the service-role RPC helper — NO inline `.rpc` (deadlock rule).
  const result = await setFieldOverride({ ...params, p_actor: actor });
  if (!result.ok) return result;

  // (d) POST-COMMIT, outside any tx (invariant 10): forensic outcome + best-effort
  //     coarse-bell re-derivation for BOTH codes + cache bust.
  const showId = await resolveShowId(params.p_drive_file_id);
  await logAdminOutcome({
    code: mapOpToCode(params.p_op),
    source: "admin.show.overrides",
    actorEmail: actor,
    driveFileId: params.p_drive_file_id,
    ...(showId ? { showId } : {}),
  });

  if (showId) {
    // R3b-7: a discard/repoint/reactivate that cleared the LAST paused row of a
    // code resolves its bell. Best-effort + idempotent — the durable inactive-row
    // needs-attention stream stays authoritative if this throws.
    for (const code of ["OVERRIDE_TARGET_MISSING", "OVERRIDE_NAME_CONFLICT"] as const) {
      try {
        await resolveOverrideAlertsForShow({}, showId, code);
      } catch {
        /* best-effort — never fail the committed override mutation */
      }
    }
    revalidateShow(showId);
  }

  return result;
}
