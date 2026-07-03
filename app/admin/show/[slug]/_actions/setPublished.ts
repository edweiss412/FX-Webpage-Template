"use server";
/**
 * app/admin/show/[slug]/_actions/setPublished.ts — the Published-toggle dispatcher.
 * next=true → the self-locking `publish_show` RPC (via lib/showLifecycle/publishShow);
 * next=false → the self-locking `unpublish_show` RPC (via lib/showLifecycle/unpublishShow).
 * These literal RPC names are load-bearing: tests/db/showCacheRevalidateCoverage.test.ts's
 * WRITING_RPCS honesty check greps this file for "publish_show"/"unpublish_show" (same
 * pattern as _actions/publish.ts's header naming its RPC).
 *
 * requireAdmin() FIRST → slug→id resolve → dispatch → typed LifecycleResult. On ok the show
 * re-renders (revalidateShow is POST-COMMIT: both RPCs self-lock and have committed by the
 * time the caller resolves).
 */

import { revalidatePath } from "next/cache";
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { publishShow, type LifecycleResult } from "@/lib/showLifecycle/publishShow";
import { unpublishShow } from "@/lib/showLifecycle/unpublishShow";
import { resolveShowBySlug, SHOW_NOT_FOUND } from "./shared";

export async function setShowPublishedAction(
  slug: string,
  next: boolean,
): Promise<LifecycleResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();
  const resolved = await resolveShowBySlug(slug);
  // A Supabase outage during resolution surfaces as infra_error (retry copy), NOT a missing show.
  if (resolved.kind === "infra_error") return { ok: false, code: "infra_error" };
  if (resolved.kind === "not_found") return SHOW_NOT_FOUND;
  const result = next ? await publishShow(resolved.show.id) : await unpublishShow(resolved.show.id);
  if (result.ok) {
    revalidateShow(resolved.show.id);
    revalidatePath(`/admin/show/${slug}`);
    revalidatePath("/admin");
    // Durable admin-outcome telemetry — POST-COMMIT (both RPCs self-lock and have
    // committed by resolve time). Code literals ride the logAdminOutcome span
    // (stripped → §12.4-scanner-exempt), same contract as _actions/publish.ts.
    await logAdminOutcome({
      code: next ? "SHOW_PUBLISHED" : "SHOW_UNPUBLISHED_BY_ADMIN",
      source: "admin.show.setPublished",
      actorEmail: email,
      showId: resolved.show.id,
    });
  }
  return result;
}
