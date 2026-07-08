/**
 * lib/admin/loadRecentAutoApplied.ts (Flow-4 auto-applied strip Task 3 — spec §6.1)
 *
 * Loads the un-dispositioned auto-applied changes for the strip: rows with
 * source='auto_apply', status='applied', acknowledged_at IS NULL, and a
 * change_kind in the 5 strip kinds. Rows are grouped by show (newest-first,
 * occurred_at desc), the render is capped at STRIP_RENDER_CAP, and per-show
 * roster-shift counts are fetched separately via the roster_shift_counts RPC.
 *
 * Service-role ONLY: show_change_log is REVOKEd from authenticated (admin-only
 * read, carries crew PII in the before/after images) and roster_shift_counts is
 * granted to service_role ONLY — so this loader MUST use the service-role client
 * (mirrors lib/observe/query/changeLog.ts). A test may inject a client.
 *
 * Every Supabase await destructures { data, error } and is wrapped per
 * AGENTS.md invariant 9 (typed infra_error). Registered in
 * tests/admin/_metaInfraContract.test.ts (infraRegistry) and
 * tests/admin/_metaBoundedReads.test.ts (READ_MODULES).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { RosterShiftSummary } from "@/lib/admin/showDisplay";

export type AutoAppliedRow = {
  id: string;
  changeKind: string;
  summary: string;
  occurredAt: string;
  undoable: boolean;
};

export type AutoAppliedGroup = {
  showId: string;
  slug: string;
  showName: string;
  rows: AutoAppliedRow[];
  acceptableIds: string[];
  undoableIds: string[];
};

export type RecentAutoApplied =
  | {
      kind: "ok";
      groups: AutoAppliedGroup[];
      renderedCount: number;
      overflowCount: number;
      rosterShiftByShow: Record<string, RosterShiftSummary>;
    }
  | { kind: "infra_error"; message: string };

export const STRIP_RENDER_CAP = 50;

// The 5 change_kinds the strip surfaces. crew_* kinds are undoable (subject to
// individually_undoable); field_changed / crew_email_changed are never undoable.
const STRIP_KINDS = [
  "crew_added",
  "crew_removed",
  "crew_renamed",
  "field_changed",
  "crew_email_changed",
] as const;
const UNDOABLE_KINDS = new Set<string>(["crew_added", "crew_removed", "crew_renamed"]);

type RawEmbed = { slug?: string | null; title?: string | null };
type RawRow = {
  id: string;
  show_id: string;
  change_kind: string;
  summary: string;
  occurred_at: string;
  individually_undoable: boolean | null;
  shows: RawEmbed | RawEmbed[] | null;
};
type RosterRow = {
  show_id: string;
  added: number | null;
  removed: number | null;
  renamed: number | null;
};

export async function loadRecentAutoApplied(deps: {
  publishedShowIds: string[];
  supabase?: SupabaseClient;
}): Promise<RecentAutoApplied> {
  let supabase: SupabaseClient;
  try {
    supabase = deps.supabase ?? createSupabaseServiceRoleClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `service-role client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let rawRows: RawRow[];
  try {
    const { data, error } = await supabase
      .from("show_change_log")
      .select(
        "id, show_id, change_kind, summary, occurred_at, individually_undoable, shows(slug, title)",
      )
      .eq("source", "auto_apply")
      .eq("status", "applied")
      .is("acknowledged_at", null)
      .in("change_kind", [...STRIP_KINDS])
      .order("occurred_at", { ascending: false })
      .limit(STRIP_RENDER_CAP + 1);
    if (error) {
      return { kind: "infra_error", message: `show_change_log read failed: ${error.message}` };
    }
    rawRows = (data ?? []) as RawRow[];
  } catch (err) {
    return {
      kind: "infra_error",
      message: `show_change_log read threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const matched = rawRows.length;
  const overflowCount = Math.max(0, matched - STRIP_RENDER_CAP);
  const displayed = rawRows.slice(0, STRIP_RENDER_CAP);

  const groupMap = new Map<string, AutoAppliedGroup>();
  for (const r of displayed) {
    const embed = Array.isArray(r.shows) ? r.shows[0] : r.shows;
    const slug = embed?.slug ?? "";
    const showName = embed?.title ?? slug;
    const undoable = UNDOABLE_KINDS.has(r.change_kind) && r.individually_undoable === true;
    const row: AutoAppliedRow = {
      id: r.id,
      changeKind: r.change_kind,
      summary: r.summary,
      occurredAt: r.occurred_at,
      undoable,
    };
    let group = groupMap.get(r.show_id);
    if (!group) {
      group = { showId: r.show_id, slug, showName, rows: [], acceptableIds: [], undoableIds: [] };
      groupMap.set(r.show_id, group);
    }
    group.rows.push(row);
    group.acceptableIds.push(row.id);
    if (undoable) group.undoableIds.push(row.id);
  }

  const rosterShiftByShow: Record<string, RosterShiftSummary> = {};
  try {
    const { data, error } = await supabase.rpc("roster_shift_counts", {
      p_show_ids: deps.publishedShowIds,
    });
    if (error) {
      return { kind: "infra_error", message: `roster_shift_counts rpc failed: ${error.message}` };
    }
    for (const r of (data ?? []) as RosterRow[]) {
      const added = r.added ?? 0;
      const removed = r.removed ?? 0;
      const renamed = r.renamed ?? 0;
      rosterShiftByShow[r.show_id] = { added, removed, renamed, total: added + removed + renamed };
    }
  } catch (err) {
    return {
      kind: "infra_error",
      message: `roster_shift_counts rpc threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    kind: "ok",
    groups: Array.from(groupMap.values()),
    renderedCount: displayed.length,
    overflowCount,
    rosterShiftByShow,
  };
}
