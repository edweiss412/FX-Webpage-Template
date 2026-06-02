/**
 * app/admin/show/[slug]/_actions/unarchive.ts (M12.2 Phase B2 Task 7.1 — spec §2.3)
 *
 * Admin-gated Unarchive server action. Replaces Phase 6's
 * `unarchiveActionPlaceholder`. requireAdmin() FIRST → id→drive_file_id resolve
 * → the existing `unarchiveShow(showId, driveFileId)` caller (self-locking
 * `unarchive_show` RPC, then a SEPARATE self-locked catch-up sync; §2.3). The
 * RPC durably sets requires_resync=true so Publish stays blocked across the
 * catch-up gap.
 *
 * Signature is `unarchiveShowAction(showId: string): Promise<void>` to match
 * BOTH the dashboard's `unarchiveAction(showId)` prop (the ArchivedShowRow's
 * UnarchiveShowButton) AND the per-show page (which binds it with its showId).
 * It returns void: the typed result is consumed only for the success-revalidate
 * decision — the row relocates to the Active segment as Held on the next render.
 * A missing show is a no-op (the stale row vanishes on refresh).
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { unarchiveShow } from "@/lib/showLifecycle/unarchiveShow";
import { resolveShowById } from "./shared";

export async function unarchiveShowAction(showId: string): Promise<void> {
  await requireAdmin();
  const show = await resolveShowById(showId);
  if (!show) return;
  const result = await unarchiveShow(show.id, show.driveFileId);
  if (result.ok) {
    revalidatePath(`/admin/show`);
    revalidatePath("/admin");
  }
}
