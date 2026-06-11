/**
 * lib/admin/loadNeedsAttention.ts (mobile needs-attention Task 1 — spec §4.1)
 *
 * Needs-attention assembly extracted verbatim from
 * components/admin/Dashboard.tsx fetchDashboardData: two bounded pending
 * streams (.limit(cap + 1)) + two exact head-counts + the bounded existence
 * lookup, merged/sliced/classified by buildNeedsAttention (catalog-safe copy).
 * The dashboard injects its already-constructed client + RENDER_CAP; the
 * needs-attention page constructs internally + threads PAGE_RENDER_CAP.
 *
 * Count integrity (ratified R2-F3): a null/undefined head-count with no error
 * is an integrity failure, NOT a clean total — it returns a typed infra_error
 * instead of silently falling back to the capped row-array length.
 *
 * Every Supabase await is wrapped per AGENTS.md §1.9 (typed infra_error).
 * Registered in tests/admin/_metaInfraContract.test.ts (infraRegistry).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildNeedsAttention,
  type NeedsAttention,
  type ShowExistence,
} from "@/lib/admin/needsAttention";

export type LoadNeedsAttentionResult = NeedsAttention | { kind: "infra_error"; message: string };

export async function loadNeedsAttention(opts: {
  cap: number;
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}): Promise<LoadNeedsAttentionResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  if (opts.supabase) {
    supabase = opts.supabase;
  } else {
    try {
      supabase = await createSupabaseServerClient();
    } catch (err) {
      return {
        kind: "infra_error",
        message: `supabase client construction failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Needs-attention: two bounded pending streams + exact counts ──
  // invariant 9: every read destructures { data, error } (alertCount.ts:26
  // pattern), never a bare result object — pinned by the source-regex test in
  // tests/admin/loadNeedsAttention.test.ts.
  let ingestionRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const { data: ingestionData, error: ingestionRowsError } = await supabase
      .from("pending_ingestions")
      .select("id, drive_file_id, drive_file_name, last_attempt_at, last_error_code")
      .is("wizard_session_id", null)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(opts.cap + 1);
    if (ingestionRowsError) {
      return {
        kind: "infra_error",
        message: `pending_ingestions query failed: ${ingestionRowsError.message}`,
      };
    }
    ingestionRows = (ingestionData ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_ingestions query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let ingestionCount: number;
  try {
    const {
      data: _ingestionCountData,
      count: ingestionHeadCount,
      error: ingestionCountError,
    } = await supabase
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    void _ingestionCountData;
    if (ingestionCountError) {
      return {
        kind: "infra_error",
        message: `pending_ingestions count query failed: ${ingestionCountError.message}`,
      };
    }
    if (typeof ingestionHeadCount !== "number") {
      return { kind: "infra_error", message: "pending_ingestions head-count returned non-number" };
    }
    ingestionCount = ingestionHeadCount;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_ingestions count query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let syncRows: ReadonlyArray<Record<string, unknown>>;
  try {
    const { data: syncData, error: syncRowsError } = await supabase
      .from("pending_syncs")
      .select(
        "staged_id, drive_file_id, staged_modified_time, parse_result, triggered_review_items",
      )
      .is("wizard_session_id", null)
      .order("staged_modified_time", { ascending: false })
      .limit(opts.cap + 1);
    if (syncRowsError) {
      return {
        kind: "infra_error",
        message: `pending_syncs query failed: ${syncRowsError.message}`,
      };
    }
    syncRows = (syncData ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_syncs query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let syncCount: number;
  try {
    const {
      data: _syncCountData,
      count: syncHeadCount,
      error: syncCountError,
    } = await supabase
      .from("pending_syncs")
      .select("staged_id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    void _syncCountData;
    if (syncCountError) {
      return {
        kind: "infra_error",
        message: `pending_syncs count query failed: ${syncCountError.message}`,
      };
    }
    if (typeof syncHeadCount !== "number") {
      return { kind: "infra_error", message: "pending_syncs head-count returned non-number" };
    }
    syncCount = syncHeadCount;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_syncs count query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Existence lookup keyed FROM the pending rows' drive_file_ids (bounded by the
  // capped pending reads, §3.3) — spans ALL shows (no published/archived
  // filter) so an archived/unpublished existing show classifies as
  // existing_staged, not first_seen. Short-circuit on empty id set (R28).
  const pendingDriveFileIds = Array.from(
    new Set(
      [
        ...ingestionRows.map((r) => r.drive_file_id as string),
        ...syncRows.map((r) => r.drive_file_id as string),
      ].filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const existence: Record<string, ShowExistence> = {};
  if (pendingDriveFileIds.length > 0) {
    try {
      const { data: existenceData, error: existenceError } = await supabase
        .from("shows")
        .select("drive_file_id, slug, title, archived, published")
        .in("drive_file_id", pendingDriveFileIds);
      if (existenceError) {
        return {
          kind: "infra_error",
          message: `existence query failed: ${existenceError.message}`,
        };
      }
      const existenceRows = (existenceData ?? []) as ReadonlyArray<Record<string, unknown>>;
      for (const row of existenceRows) {
        const id = row.drive_file_id as string | undefined;
        if (!id) continue;
        existence[id] = {
          slug: row.slug as string,
          title: (row.title as string | null) ?? null,
          published: Boolean(row.published),
          archived: Boolean(row.archived),
        };
      }
    } catch (err) {
      return {
        kind: "infra_error",
        message: `existence query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return buildNeedsAttention({
    ingestions: ingestionRows.map((r) => ({
      id: r.id as string,
      driveFileId: r.drive_file_id as string,
      driveFileName: (r.drive_file_name as string | null) ?? null,
      lastErrorCode: (r.last_error_code as string | null) ?? null,
      lastAttemptAt: (r.last_attempt_at as string | null) ?? null,
    })),
    syncs: syncRows.map((r) => {
      const parseResult = r.parse_result as { show?: { title?: string | null } } | null;
      return {
        stagedId: r.staged_id as string,
        driveFileId: r.drive_file_id as string,
        candidateTitle: parseResult?.show?.title ?? null,
        stagedModifiedTime: (r.staged_modified_time as string | null) ?? null,
      };
    }),
    existence,
    totalCounts: { ingestions: ingestionCount, syncs: syncCount },
    cap: opts.cap,
  });
}
