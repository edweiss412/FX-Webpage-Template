import { log } from "@/lib/log";
import { serializeError } from "@/lib/log/serializeError";
import { persistAppEventStrict } from "@/lib/log/persist";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";

/**
 * Durable, failure-visible LEAD-bit audit trail (spec 2026-07-17-mi9-lead-autoapply-fyi §3.4).
 *
 * A LEAD change (an ops + `shows_internal` financial access grant/loss) auto-applies (owner option
 * B). The coalescing `ROLE_FLAGS_NOTICE` admin_alert is the operator feed nudge, but it coalesces
 * by (show_id, code) and can be overwritten — so a LEAD grant can be hidden by a later role change.
 * This emits a durable, non-coalescing `app_event` per LEAD-bit change via the failure-visible
 * writer `persistAppEventStrict` (returns `{ ok }`, does NOT swallow). Post-commit, OUTSIDE the
 * advisory-lock tx (invariant 10). The event derives from the SAME `roleFlagsNotice.context.changes`
 * that feed the feed nudge, filtered to the LEAD-bit subset (entries where the LEAD-bit set
 * membership flipped), so it rides the SAME set of caller sites (§3.4 cross-caller topology).
 *
 * The forensic app_events code LEAD_ROLE_APPLIED is NOT a §12.4 user-facing code — the
 * persistAppEventStrict(...) span is recognized by stripLogEmissionCalls so the code never
 * registers in the §12.4 / internal-code-enum producer scans. Redaction-safe (crew name + flag
 * tokens only — no email/phone/token; persistAppEventStrict also runs sanitizeContext).
 *
 * Failure policy (§3.4 honest durability): a post-commit event is not transactionally atomic with
 * the committed LEAD change, so the guarantee is durable + failure-visible. On `{ ok: false }` the
 * failure is surfaced loudly via `log.error` with a distinct code — never silently swallowed
 * (invariant 9). Residual double-fault (strict insert AND the escalation both fail) is documented.
 */
function hasLead(flags: readonly string[]): boolean {
  return flags.includes("LEAD");
}

export async function emitLeadRoleApplied(
  notice: RoleFlagsNotice | undefined,
  ctx: { source: string },
): Promise<void> {
  if (!notice) return;
  for (const change of notice.context.changes) {
    // LEAD-bit subset only — a non-LEAD department/scope change is covered by the feed nudge alone.
    if (hasLead(change.prior_flags) === hasLead(change.new_flags)) continue;
    const direction: "gained" | "lost" = hasLead(change.new_flags) ? "gained" : "lost";
    const result = await persistAppEventStrict({
      level: "info",
      source: ctx.source,
      message: "lead role applied",
      code: "LEAD_ROLE_APPLIED",
      showId: notice.showId,
      driveFileId: notice.context.drive_file_id,
      context: {
        crew_name: change.crew_name,
        prior_flags: change.prior_flags,
        new_flags: change.new_flags,
        direction,
      },
    });
    if (!result.ok) {
      // Surface loudly — the authoritative LEAD audit write failed. Never swallow (invariant 9).
      await log.error("durable LEAD audit write failed", {
        source: ctx.source,
        code: "LEAD_ROLE_APPLIED_PERSIST_FAILED",
        showId: notice.showId,
        crew_name: change.crew_name,
        direction,
        error: serializeError(result.error),
      });
    }
  }
}
