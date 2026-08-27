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
import {
  deriveFieldsDiff,
  FIELDCHANGES_INVALID_CODE,
  type FieldChangeEntry,
} from "@/lib/sync/changeLog/fieldChanges";
import { log } from "@/lib/log";

export type AutoAppliedDiff =
  | { kind: "fromTo"; from: string; to: string }
  | { kind: "single"; caption: "Added" | "Removed"; value: string }
  | { kind: "fields"; entries: FieldChangeEntry[] }
  | { kind: "none" };

export type AutoAppliedRow = {
  id: string;
  changeKind: string;
  summary: string;
  occurredAt: string;
  undoable: boolean;
  diff: AutoAppliedDiff;
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
// Exported for monitor-digest filter parity (flow 6.2 §3, §13.3): the email
// digest's auto-applied query MUST use this same change-kind allow-list.
export const STRIP_KINDS = [
  "crew_added",
  "crew_removed",
  "crew_renamed",
  "field_changed",
  "crew_email_changed",
] as const;
const UNDOABLE_KINDS = new Set<string>(["crew_added", "crew_removed", "crew_renamed"]);

// Reads ONLY `name` from a change-log image; everything else (email/phone/id/
// oauth/role) is deliberately never touched (PII posture, spec §3.1). Returns a
// display-safe non-empty name or null.
function readName(image: Record<string, unknown> | null | undefined): string | null {
  if (!image || typeof image !== "object") return null;
  const n = (image as { name?: unknown }).name;
  return typeof n === "string" && n.trim() !== "" ? n : null;
}

// Derives the display-safe From→To diff from the change-log images. crew kinds
// only; everything else → { kind:"none" } (renders the summary sentence).
function deriveDiff(
  changeKind: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AutoAppliedDiff {
  if (changeKind === "crew_renamed") {
    const from = readName(before);
    const to = readName(after);
    return from && to ? { kind: "fromTo", from, to } : { kind: "none" };
  }
  if (changeKind === "crew_added") {
    const value = readName(after);
    return value ? { kind: "single", caption: "Added", value } : { kind: "none" };
  }
  if (changeKind === "crew_removed") {
    const value = readName(before);
    return value ? { kind: "single", caption: "Removed", value } : { kind: "none" };
  }
  if (changeKind === "field_changed") {
    // Read-side re-validation of the stored after_image (defence-in-depth). The
    // corrupt-payload warn is emitted at the call site (which has the row id), keeping
    // deriveDiff pure of side effects it can't attribute to a specific row.
    return deriveFieldsDiff(after).diff;
  }
  return { kind: "none" };
}

type RawEmbed = { slug?: string | null; title?: string | null };
type RawRow = {
  id: string;
  show_id: string;
  change_kind: string;
  summary: string;
  occurred_at: string;
  individually_undoable: boolean | null;
  before_image: Record<string, unknown> | null;
  after_image: Record<string, unknown> | null;
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
    void log.error("recent auto-applied client construction failed", {
      source: "admin.recentAutoApplied",
      code: "RECENT_AUTO_APPLIED_CLIENT_THREW",
      error: err,
    });
    return {
      kind: "infra_error",
      message: `service-role client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let rawRows: RawRow[];
  let matchedTotal: number;
  try {
    // `count: "exact"` returns the TRUE total of all matching rows independent
    // of `.limit()` (PostgREST Content-Range), so the overflow figure is the real
    // backlog — not `rawRows.length`, which the render cap bounds. Deriving
    // overflow from the capped row count would forever report at most +1.
    const { data, count, error } = await supabase
      .from("show_change_log")
      .select(
        "id, show_id, change_kind, summary, occurred_at, individually_undoable, before_image, after_image, shows(slug, title)",
        { count: "exact" },
      )
      .eq("source", "auto_apply")
      .eq("status", "applied")
      .is("acknowledged_at", null)
      .in("change_kind", [...STRIP_KINDS])
      .order("occurred_at", { ascending: false })
      .limit(STRIP_RENDER_CAP);
    if (error) {
      // The last dark arm of this loader's two-by-two. #882 repaired the other
      // three; this one is a .from() table read, and its title scoped that PR to
      // the RPC boundary. The observer installed by #899 records a 5xx here at
      // debug, which never persists (lib/log/logger.ts:29) — and a sub-500
      // returned error (42501, 42P01, a schema-cache miss) is below its threshold
      // entirely. This emit is the persisted record for the first and the ONLY
      // record for the second.
      void log.error("show_change_log read returned error", {
        source: "admin.recentAutoApplied",
        code: "SHOW_CHANGE_LOG_READ_RETURNED_ERROR",
        error,
      });
      return { kind: "infra_error", message: `show_change_log read failed: ${error.message}` };
    }
    rawRows = (data ?? []) as RawRow[];
    matchedTotal = count ?? rawRows.length;
  } catch (err) {
    void log.error("show_change_log read threw", {
      source: "admin.recentAutoApplied",
      code: "SHOW_CHANGE_LOG_READ_THREW",
      error: err,
    });
    return {
      kind: "infra_error",
      message: `show_change_log read threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const overflowCount = Math.max(0, matchedTotal - STRIP_RENDER_CAP);
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
      diff: (() => {
        if (r.change_kind !== "field_changed") {
          return deriveDiff(r.change_kind, r.before_image, r.after_image);
        }
        const { diff, invalid } = deriveFieldsDiff(r.after_image);
        if (invalid) {
          // Row-attributed forensic warn. `LogFields` REQUIRES `source`; the show
          // correlation field is the reserved `showId` (NOT `show_id`), so the persisted
          // app_event is show-filterable (`observe events --show`). Row id in the message
          // so the corrupt row is findable via `observe events --q <id>` (R4 F1).
          log.warn(`auto-applied field_changed row ${r.id} has an invalid fieldChanges payload`, {
            source: "admin.loadRecentAutoApplied",
            code: FIELDCHANGES_INVALID_CODE,
            showId: r.show_id,
          });
        }
        return diff;
      })(),
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
      // Returned rather than logged, and its caller renders instead of logging, so an
      // upstream 502 here left NO record anywhere. The message travels in the result AND
      // reaches the log (invariant 9: an infra fault is recorded where it arrives).
      void log.error("roster_shift_counts rpc failed", {
        source: "admin.recentAutoApplied",
        code: "ROSTER_SHIFT_COUNTS_READ_RETURNED_ERROR",
        // `error`, not `error.message`: buildRecord runs serializeError on this
        // field (lib/log/logger.ts:38), which captures a PostgREST returned-error's
        // own code/details/hint. Those three tell 42501 from 42P01 from a
        // schema-cache miss, and flattening to the message discards all of them.
        error,
      });
      return { kind: "infra_error", message: `roster_shift_counts rpc failed: ${error.message}` };
    }
    for (const r of (data ?? []) as RosterRow[]) {
      const added = r.added ?? 0;
      const removed = r.removed ?? 0;
      const renamed = r.renamed ?? 0;
      rosterShiftByShow[r.show_id] = { added, removed, renamed, total: added + removed + renamed };
    }
  } catch (err) {
    // A typed result carries the fault to the CALLER, which satisfies invariant 9 — but the only
    // caller (app/admin/needs-attention/page.tsx) degrades on it without logging, so the message
    // reached nobody durable. The retry wrapper absorbs upstream 502s here; an absorbed fault that
    // leaves no trace is the exact thing this arc exists to stop.
    void log.error("roster_shift_counts rpc threw", {
      source: "admin.recentAutoApplied",
      code: "ROSTER_SHIFT_COUNTS_READ_THREW",
      error: err,
    });
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
