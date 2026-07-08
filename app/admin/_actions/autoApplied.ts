/**
 * app/admin/_actions/autoApplied.ts (Flow-4 auto-applied strip — dashboard actions)
 *
 * THREE thin admin server actions for the admin dashboard's auto-applied changes
 * strip: acceptChangeAction, acceptAllAction, undoFromDashboardAction. Each is
 * `"use server"`-scoped (this file carries the directive), requireAdminIdentity()s
 * FIRST (defense in depth — the page already gated, but a direct dispatch must
 * re-authorize), reads its field(s) from FormData, then DELEGATES to the
 * already-guarded Flow-3/4 helpers acknowledgeChanges / undoChange.
 *
 * Mirrors app/admin/show/[slug]/_actions/feed.ts::undoChangeAction exactly:
 *   - NEVER wraps the helper in withShowAdvisoryLock — undoChange self-locks and
 *     acknowledgeChanges is lock-free (single-holder §4.1; wrapping would nest two
 *     holders on the same hashkey and deadlock, invariant 2).
 *   - On a helper success: POST-COMMIT revalidate + best-effort logAdminOutcome
 *     (forensic CHANGES_ACKNOWLEDGED / CHANGE_UNDONE, emitted OUTSIDE any lock tx,
 *     invariant 10). The logger is fail-open — a telemetry throw must never fail a
 *     committed mutation (invariant 9).
 *   - Every {ok:false, code} maps to a lib/messages code (no raw codes, invariant 5),
 *     surfaced via ErrorExplainer in the client component.
 *
 * The actions take (prevState, formData) so they can drive useActionState; prevState
 * is ignored (the result is derived fresh each submit). Both accept actions REQUIRE a
 * non-empty showId form field — a missing/empty showId early-returns a typed failure
 * and NEVER calls acknowledgeChanges with an undefined show scope. undoFromDashboard
 * reads ONLY changeLogId (undoChange self-resolves the show server-side, never
 * client-supplied).
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import {
  acknowledgeChanges,
  type AcknowledgeChangesResult,
} from "@/lib/sync/holds/acknowledgeChanges";
import { undoChange, type UndoChangeResult } from "@/lib/sync/holds/undoChange";

/** Accept a SINGLE auto-applied change from the dashboard strip. */
export async function acceptChangeAction(
  _prev: AcknowledgeChangesResult | null,
  formData: FormData,
): Promise<AcknowledgeChangesResult> {
  const admin = await requireAdminIdentity();
  const showId = String(formData.get("showId") ?? "");
  const changeLogId = String(formData.get("changeLogId") ?? "");
  // Missing show scope → typed refusal; NEVER call acknowledgeChanges with an
  // undefined/empty show (would acknowledge across an unintended scope).
  if (!showId) return { ok: false, code: "SYNC_INFRA_ERROR" };
  const result = await acknowledgeChanges(showId, [changeLogId]);
  if (result.ok) {
    revalidatePath("/admin", "page");
    // Durable forensic telemetry: committed-success branch only, fail-open,
    // POST-COMMIT (acknowledge_changes committed by the time the await resolved).
    try {
      await logAdminOutcome({
        code: "CHANGES_ACKNOWLEDGED",
        source: "admin.dashboard.autoApplied.accept",
        actorEmail: admin.email,
        showId,
        extra: { changeLogId, count: result.count },
      });
    } catch {
      /* best-effort */
    }
  }
  return result;
}

/** Accept ALL currently-acceptable auto-applied changes for one show. */
export async function acceptAllAction(
  _prev: AcknowledgeChangesResult | null,
  formData: FormData,
): Promise<AcknowledgeChangesResult> {
  const admin = await requireAdminIdentity();
  const showId = String(formData.get("showId") ?? "");
  const acceptableIds = String(formData.get("ids") ?? "")
    .split(",")
    .filter(Boolean);
  if (!showId) return { ok: false, code: "SYNC_INFRA_ERROR" };
  const result = await acknowledgeChanges(showId, acceptableIds);
  if (result.ok) {
    revalidatePath("/admin", "page");
    try {
      await logAdminOutcome({
        code: "CHANGES_ACKNOWLEDGED",
        source: "admin.dashboard.autoApplied.acceptAll",
        actorEmail: admin.email,
        showId,
        extra: { count: result.count, requested: acceptableIds.length },
      });
    } catch {
      /* best-effort */
    }
  }
  return result;
}

/** Undo a single auto-applied change from the dashboard strip. */
export async function undoFromDashboardAction(
  _prev: UndoChangeResult | null,
  formData: FormData,
): Promise<UndoChangeResult> {
  const admin = await requireAdminIdentity();
  const changeLogId = String(formData.get("changeLogId") ?? "");
  const result = await undoChange(changeLogId);
  if (result.ok) {
    // nav-perf tag-caching: undo reverts the crew identity it applied (crew DATA) —
    // POST-COMMIT revalidate of the server-resolved show id (omitted if unresolved).
    if (result.showId) revalidateShow(result.showId);
    revalidatePath("/admin", "page");
    try {
      await logAdminOutcome({
        code: "CHANGE_UNDONE",
        source: "admin.dashboard.autoApplied.undo",
        actorEmail: admin.email,
        ...(result.showId ? { showId: result.showId } : {}),
        extra: { changeLogId },
      });
    } catch {
      /* best-effort */
    }
  }
  return result;
}
