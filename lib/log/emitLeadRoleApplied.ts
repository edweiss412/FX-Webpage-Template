import { log } from "@/lib/log";
import { serializeError } from "@/lib/log/serializeError";
import { persistAppEventStrict } from "@/lib/log/persist";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";

/**
 * Durable, failure-visible CAPABILITY-role audit trail (spec 2026-07-17-mi9-lead-autoapply-fyi §3.4;
 * capability-narrow 2026-07-17).
 *
 * A capability-role change — LEAD or FINANCIALS gain/loss, both granting `shows_internal` financial
 * access (scopeTiles.ts:141 / getShowForViewer.ts:380) — auto-applies (owner option B). The
 * coalescing `ROLE_FLAGS_NOTICE` admin_alert is the operator feed nudge, but it coalesces by
 * (show_id, code) and can be overwritten — so a capability grant can be hidden by a later role
 * change. This emits a durable, non-coalescing `app_event` per capability change via the
 * failure-visible writer `persistAppEventStrict` (returns `{ ok }`, does NOT swallow). Post-commit,
 * OUTSIDE the advisory-lock tx (invariant 10). The event derives from the SAME
 * `roleFlagsNotice.context.changes` that feed the feed nudge, filtered to the CAPABILITY subset
 * (entries where a LEAD or FINANCIALS set-membership flipped), so it rides the SAME set of caller
 * sites (§3.4 cross-caller topology).
 *
 * The forensic app_events code LEAD_ROLE_APPLIED is NOT a §12.4 user-facing code — the
 * persistAppEventStrict(...) span is recognized by stripLogEmissionCalls so the code never
 * registers in the §12.4 / internal-code-enum producer scans. Redaction-safe (crew name + flag
 * tokens only — no email/phone/token; persistAppEventStrict also runs sanitizeContext).
 *
 * Failure policy (§3.4 honest durability): a post-commit event is not transactionally atomic with
 * the committed change, so the guarantee is durable + failure-visible. On `{ ok: false }` the
 * failure is surfaced loudly via `log.error` with a distinct code — never silently swallowed
 * (invariant 9). Residual double-fault (strict insert AND the escalation both fail) is documented.
 */
const CAPABILITY_FLAGS = ["LEAD", "FINANCIALS"] as const;
type CapabilityChange = { flag: "LEAD" | "FINANCIALS"; direction: "gained" | "lost" };

// The per-flag capability transitions between prior and new flag sets. Empty iff no capability flag
// flipped (LEAD→FINANCIALS and simultaneous toggles are represented accurately as multiple entries).
function capabilityChanges(prior: readonly string[], next: readonly string[]): CapabilityChange[] {
  return CAPABILITY_FLAGS.filter((flag) => prior.includes(flag) !== next.includes(flag)).map(
    (flag) => ({ flag, direction: next.includes(flag) ? "gained" : "lost" }),
  );
}

export async function emitLeadRoleApplied(
  notice: RoleFlagsNotice | undefined,
  ctx: { source: string },
): Promise<void> {
  if (!notice) return;
  for (const change of notice.context.changes) {
    // Capability subset only — a scope-tile-only change is covered by the feed nudge alone.
    const capability_changes = capabilityChanges(change.prior_flags, change.new_flags);
    if (capability_changes.length === 0) continue;
    // The strict writer returns a discriminated union `{ ok: true } | { ok: false; error }`; narrow
    // via `result.ok` (a bare `{ ok, error }` destructure would not typecheck — `error` is only on
    // the failure branch). Returned-error vs thrown are distinguished: a thrown fault propagates,
    // a returned `{ ok: false }` is surfaced loudly below (invariant 9 — never swallowed).
    const result = await persistAppEventStrict({
      level: "info",
      source: ctx.source,
      message: "capability role applied",
      code: "LEAD_ROLE_APPLIED",
      showId: notice.showId,
      driveFileId: notice.context.drive_file_id,
      context: {
        crew_name: change.crew_name,
        prior_flags: change.prior_flags,
        new_flags: change.new_flags,
        capability_changes,
      },
    });
    if (!result.ok) {
      // Surface loudly — the authoritative capability audit write failed. Never swallow (invariant 9).
      await log.error("durable capability audit write failed", {
        source: ctx.source,
        code: "LEAD_ROLE_APPLIED_PERSIST_FAILED",
        showId: notice.showId,
        crew_name: change.crew_name,
        capability_changes,
        error: serializeError(result.error),
      });
    }
  }
}
