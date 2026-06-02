/**
 * app/admin/show/[slug]/_actions/publish.ts (M12.2 Phase B2 Task 7.1 — spec §2.4)
 *
 * Admin-gated Publish server action. requireAdmin() FIRST → slug→id resolve →
 * the existing `publishShow` caller (self-locking `publish_show` RPC; gates
 * atomically — refuses archived / finalize-owned / requires_resync /
 * pending-review with PUBLISH_BLOCKED_PENDING_REVIEW). Returns the caller's
 * typed result so the UI can route PUBLISH_BLOCKED_PENDING_REVIEW through
 * messageFor() + a Re-sync affordance. On success revalidates so the show
 * re-renders into its live presentation (share/rotate controls return).
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { publishShow, type LifecycleResult } from "@/lib/showLifecycle/publishShow";
import { resolveShowBySlug, SHOW_NOT_FOUND } from "./shared";

export async function publishShowAction(slug: string): Promise<LifecycleResult> {
  await requireAdmin();
  const show = await resolveShowBySlug(slug);
  if (!show) return SHOW_NOT_FOUND;
  const result = await publishShow(show.id);
  if (result.ok) {
    revalidatePath(`/admin/show/${slug}`);
    revalidatePath("/admin");
  }
  return result;
}
