/**
 * app/admin/show/[slug]/_actions/shared.ts (M12.2 Phase B2 Task 7.1)
 *
 * Show-resolution helpers shared by the archive / unarchive / publish server
 * actions. NOT a `"use server"` module — these are plain helpers imported by
 * the action modules (a `"use server"` file may only export async functions).
 *
 * Resolution returns a DISCRIMINATED result (AGENTS.md invariant 9 — R7): an
 * infrastructure fault must NOT be masked as a missing row.
 *   - `{ kind: "found", show }`     — the row resolved.
 *   - `{ kind: "not_found" }`       — no row matches (stale tab → deleted/renamed
 *     show). Actions map this to the GENERIC `code:"show_not_found"` refresh
 *     prompt; `ADMIN_LINK_SHOW_NOT_FOUND` is a RETIRED §12.4 code so the UI must
 *     NOT messageFor it.
 *   - `{ kind: "infra_error" }`     — client construction threw, the query threw,
 *     OR Supabase returned an error. Actions surface this as `code:"infra_error"`
 *     (the buttons render plain-language retry copy) — distinct from a true row
 *     absence, so a Supabase outage is never presented as a deleted show.
 *
 * Every Supabase await destructures `{ data, error }`; a returned error OR a
 * thrown fault both resolve to `infra_error` (NOT silently → not_found). Actions
 * fail closed on every non-found kind (no mutation).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResolvedShow = { id: string; driveFileId: string };

/** Discriminated show-resolution outcome — infra faults are distinct from a genuine row absence. */
export type ShowResolution =
  | { kind: "found"; show: ResolvedShow }
  | { kind: "not_found" }
  | { kind: "infra_error" };

/** Sentinel result for a slug/show that no longer resolves (generic, NOT a §12.4 code). */
export const SHOW_NOT_FOUND = { ok: false as const, code: "show_not_found" as const };

async function resolveBy(column: "slug" | "id", value: string): Promise<ShowResolution> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { kind: "infra_error" };
  }
  try {
    const { data, error } = await supabase
      .from("shows")
      .select("id, drive_file_id")
      .eq(column, value)
      .maybeSingle<{ id: string; drive_file_id: string }>();
    if (error) return { kind: "infra_error" };
    if (!data) return { kind: "not_found" };
    return { kind: "found", show: { id: data.id, driveFileId: data.drive_file_id } };
  } catch {
    return { kind: "infra_error" };
  }
}

export const resolveShowBySlug = (slug: string) => resolveBy("slug", slug);
export const resolveShowById = (showId: string) => resolveBy("id", showId);
