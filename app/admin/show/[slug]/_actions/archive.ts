/**
 * app/admin/show/[slug]/_actions/archive.ts (M12.2 Phase B2 Task 7.1 — spec §2.2)
 *
 * Admin-gated Archive server action. requireAdmin() runs FIRST (defense in
 * depth — the per-show page already gated, but a direct action dispatch must
 * re-authorize). Then slug→id resolve → the existing `archiveShow` caller
 * (which invokes the self-locking `archive_show` RPC; the JS caller MUST NOT
 * wrap it in withShowLock — single-holder rule, AGENTS.md invariant 2).
 *
 * Returns the caller's typed LifecycleResult; a missing show → the generic
 * not-found sentinel (the UI shows a refresh prompt; ADMIN_LINK_SHOW_NOT_FOUND
 * is retired so the UI never messageFor's it). On success revalidates the
 * per-show page + the dashboard so the row relocates into the Archived segment.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { archiveShow, type LifecycleResult } from "@/lib/showLifecycle/archiveShow";
import { resolveShowBySlug, SHOW_NOT_FOUND } from "./shared";

export async function archiveShowAction(slug: string): Promise<LifecycleResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();
  const resolved = await resolveShowBySlug(slug);
  // R7: a Supabase outage during resolution surfaces as infra_error (retry copy), NOT as a missing show.
  if (resolved.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (resolved.kind === "not_found") return SHOW_NOT_FOUND;
  const result = await archiveShow(resolved.show.id);
  if (result.ok) {
    // nav-perf tag-caching (Task 8): archive flips shows.archived + published=false (gates crew
    // visibility) — a rendered-data change. archiveShow's self-locking RPC has committed by the
    // time it resolves, so revalidateShow here is POST-COMMIT.
    revalidateShow(resolved.show.id);
    revalidatePath(`/admin/show/${slug}`);
    revalidatePath("/admin");
    // Durable forensic telemetry: emitted ONLY on the committed-success branch (post-RPC-commit),
    // never on a refusal/no-op. `await` is load-bearing — the record must persist before the
    // action returns. The code literal rides the logAdminOutcome(...) call (stripped → not a §12.4 producer).
    await logAdminOutcome({
      code: "SHOW_ARCHIVED",
      source: "admin.show.archive",
      actorEmail: email,
      showId: resolved.show.id,
    });
  }
  return result;
}
