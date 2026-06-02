/**
 * app/admin/show/[slug]/_actions/shared.ts (M12.2 Phase B2 Task 7.1)
 *
 * Show-resolution helpers shared by the archive / unarchive / publish server
 * actions. NOT a `"use server"` module — these are plain helpers imported by
 * the action modules (a `"use server"` file may only export async functions).
 *
 * Resolution returns `null` when no row matches (a stale tab pointing at a
 * deleted/renamed show). The actions map that to the GENERIC not-found result:
 * `ADMIN_LINK_SHOW_NOT_FOUND` is a RETIRED §12.4 code, so the UI must NOT call
 * messageFor on it — it surfaces a refresh prompt keyed off `code:"show_not_found"`.
 *
 * Every Supabase await wraps in try/catch and destructures `{ data, error }`
 * (AGENTS.md invariant 9): a returned error or a thrown fault both collapse to
 * `null` (treated as not-found by the actions, which fail closed — no mutation).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResolvedShow = { id: string; driveFileId: string };

/** Sentinel result for a slug/show that no longer resolves (generic, NOT a §12.4 code). */
export const SHOW_NOT_FOUND = { ok: false as const, code: "show_not_found" as const };

async function resolveBy(column: "slug" | "id", value: string): Promise<ResolvedShow | null> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return null;
  }
  try {
    const { data, error } = await supabase
      .from("shows")
      .select("id, drive_file_id")
      .eq(column, value)
      .maybeSingle<{ id: string; drive_file_id: string }>();
    if (error || !data) return null;
    return { id: data.id, driveFileId: data.drive_file_id };
  } catch {
    return null;
  }
}

export const resolveShowBySlug = (slug: string) => resolveBy("slug", slug);
export const resolveShowById = (showId: string) => resolveBy("id", showId);
