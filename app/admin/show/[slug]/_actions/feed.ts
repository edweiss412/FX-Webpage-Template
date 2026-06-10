/**
 * app/admin/show/[slug]/_actions/feed.ts (Phase 6 T6.7 — changes-feed actions)
 *
 * THREE thin admin server actions for the per-show changes feed: undoChangeAction,
 * mi11ApproveAction, mi11RejectAction. Each is `"use server"`-scoped (this file
 * carries the directive), requireAdmin()s FIRST (defense in depth — the page
 * already gated, but a direct dispatch must re-authorize), reads its field(s) from
 * FormData, then DELEGATES to the already-advisory-lock-guarded Phase 3/4 helpers.
 *
 * PF15: these actions NEVER call supabase.rpc() inline and NEVER wrap the call in
 * withShowAdvisoryLock — the lock-taking SECURITY DEFINER RPCs self-lock; wrapping
 * would nest two holders on the same hashkey and deadlock (invariant 2 /
 * tests/auth/advisoryLockRpcDeadlock.test.ts). The only RPC path is the guarded
 * helper.
 *
 * PF23: approve/reject forward ONLY holdId (plus the PF40 token below); undo
 * forwards ONLY changeLogId. The page/client NEVER binds showId/driveFileId — the
 * helpers resolve drive_file_id from the hold/log server-side (a holdId from
 * another show would otherwise re-check the wrong file).
 *
 * PF40: approve/reject ALSO read the CLIENT-SUBMITTED expectedBaseModifiedTime form
 * field (the value the feed RENDERED, mirroring how holdId is read) and forward it
 * to the helper as the 2nd arg — NEVER a fresh server re-read (a re-read makes the
 * Phase 2 MI11_TARGET_MOVED retarget guard vacuous; the RPC must compare against
 * what the admin SAW). A null base round-trips through the hidden input as "", so
 * the action normalizes "" → null before delegating.
 *
 * The gate actions take (prevState, formData) so they can drive useActionState in
 * Mi11GateActions; prevState is ignored (the result is derived fresh each submit).
 * On a helper success the action revalidates the per-show page so the entry flips
 * status. Every {ok:false, code} maps to a lib/messages code (no raw codes,
 * invariant 5) — surfaced via ErrorExplainer in the client component.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  approveMi11Hold,
  rejectMi11Hold,
  type Mi11GateResult,
} from "@/lib/sync/holds/mi11GateActions";
import { undoChange, type UndoChangeResult } from "@/lib/sync/holds/undoChange";

/** "" (a null base_modified_time round-tripped through the hidden input) → null. */
function normalizeExpectedBase(formData: FormData): string | null {
  const raw = formData.get("expectedBaseModifiedTime");
  return raw === "" || raw == null ? null : String(raw);
}

export async function mi11ApproveAction(
  _prev: Mi11GateResult | null,
  formData: FormData,
): Promise<Mi11GateResult> {
  await requireAdmin();
  const holdId = String(formData.get("holdId") ?? "");
  const expectedBaseModifiedTime = normalizeExpectedBase(formData);
  const result = await approveMi11Hold(holdId, expectedBaseModifiedTime);
  if (result.ok) {
    revalidatePath("/admin/show/[slug]", "page");
  }
  return result;
}

export async function mi11RejectAction(
  _prev: Mi11GateResult | null,
  formData: FormData,
): Promise<Mi11GateResult> {
  await requireAdmin();
  const holdId = String(formData.get("holdId") ?? "");
  const expectedBaseModifiedTime = normalizeExpectedBase(formData);
  const result = await rejectMi11Hold(holdId, expectedBaseModifiedTime);
  if (result.ok) {
    revalidatePath("/admin/show/[slug]", "page");
  }
  return result;
}

// P6-F1: (prevState, formData) so UndoChangeButton can drive it via useActionState
// and surface the typed failure post-submit; prevState is ignored (the result is
// derived fresh each submit). On success the page revalidates so the row flips to
// undone; every {ok:false, code} is rendered via ErrorExplainer (no raw code).
export async function undoChangeAction(
  _prev: UndoChangeResult | null,
  formData: FormData,
): Promise<UndoChangeResult> {
  await requireAdmin();
  const changeLogId = String(formData.get("changeLogId") ?? "");
  const result = await undoChange(changeLogId);
  if (result.ok) {
    revalidatePath("/admin/show/[slug]", "page");
  }
  return result;
}
