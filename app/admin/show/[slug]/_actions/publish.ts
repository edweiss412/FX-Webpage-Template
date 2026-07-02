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
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { publishShow, type LifecycleResult } from "@/lib/showLifecycle/publishShow";
import { resolveShowBySlug, SHOW_NOT_FOUND } from "./shared";

export async function publishShowAction(slug: string): Promise<LifecycleResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();
  const resolved = await resolveShowBySlug(slug);
  // R7: a Supabase outage during resolution surfaces as infra_error (retry copy), NOT as a missing show.
  if (resolved.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (resolved.kind === "not_found") return SHOW_NOT_FOUND;
  const result = await publishShow(resolved.show.id);
  if (result.ok) {
    // nav-perf tag-caching (Task 8): publish flips shows.published (gates crew visibility,
    // getShowForViewer.ts:291) — a rendered-data change. publishShow's self-locking RPC has
    // committed by the time it resolves, so revalidateShow here is POST-COMMIT.
    revalidateShow(resolved.show.id);
    revalidatePath(`/admin/show/${slug}`);
    revalidatePath("/admin");
    // Task 7: durable admin-outcome telemetry — POST-COMMIT (publishShow's RPC has
    // committed by resolve time). Code literal rides the logAdminOutcome span (stripped → exempt).
    await logAdminOutcome({
      code: "SHOW_PUBLISHED",
      source: "admin.show.publish",
      actorEmail: email,
      showId: resolved.show.id,
    });
  }
  return result;
}
