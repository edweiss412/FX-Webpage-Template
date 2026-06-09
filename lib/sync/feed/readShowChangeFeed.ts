// Phase 5 — Server-only (service-role) feed read data layer.
//
// Merges public.show_change_log (most-recent N, occurred_at desc) with open
// public.sync_holds (pending MI-11) and shapes each row into the canonical
// FeedEntry (00-overview "TypeScript types"). NEVER via PostgREST from() — both
// tables are RLS-locked from anon/authenticated (Phase 1, resolution #10 / F9),
// so the service-role client is the ONLY read path. The consumer (Phase 6 UI)
// renders the truncation disclosure; this layer only sets { entries, truncated,
// totalShown }.

import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { canonEmail } from "@/lib/sync/holds/holdPort";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";
import {
  UNDOABLE_CHANGE_KINDS,
  type Disposition,
  type FeedEntry,
  type FeedGate,
} from "@/lib/sync/holds/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;

// invariant 9 / P5-F1: every Supabase boundary fault — service-role construction
// throw, .from() throw, network throw, AND a returned {error} — maps to the
// existing typed SyncInfraError (operation + source), so the Phase-6 admin page
// (which calls this server-side after requireAdmin) can catalog-render / degrade
// instead of surfacing an unclassified 500. Mirrors the perFileProcessor /
// readShowGateRow thrown-fault discipline.
type FeedSupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

function createFeedSupabaseClient(): FeedSupabaseClient {
  try {
    return createSupabaseServiceRoleClient();
  } catch (cause) {
    throw new SyncInfraError("readShowChangeFeed.createServiceRoleClient", "thrown_error", cause);
  }
}

async function runFeedRead<T>(
  operation: string,
  query: () => PromiseLike<{
    data: T | null;
    count?: number | null;
    error: { message?: string } | null;
  }>,
): Promise<{ data: T | null; count?: number | null }> {
  try {
    const { data, count, error } = await query();
    if (error) {
      throw new SyncInfraError(operation, "returned_error", error);
    }
    return { data, count: count ?? null };
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError(operation, "thrown_error", cause);
  }
}

// Single-source the undo-gating set so the feed predicate and Phase 4's
// undo_change change_kind guard (00-overview resolution #18 / PF22) stay in
// lockstep: exactly {crew_added, crew_removed, crew_renamed}.
const CREW_DOMAIN_CHANGE_KINDS: ReadonlySet<string> = new Set(UNDOABLE_CHANGE_KINDS);

export function isCrewDomainChangeKind(kind: string): boolean {
  return CREW_DOMAIN_CHANGE_KINDS.has(kind);
}

type ChangeLogRow = {
  id: string;
  occurred_at: string;
  status: string;
  summary: string;
  entity_ref: string | null;
  change_kind: string;
  individually_undoable: boolean;
};

type HoldRow = {
  id: string;
  entity_key: string;
  held_value: unknown;
  proposed_value: Disposition;
  base_modified_time: string | null;
  created_at: string;
};

// Render the timestamptz the read layer returns as a stable ISO-8601 string |
// null. postgres-rest returns timestamptz as an ISO-ish string; normalize it
// via Date so the feed-rendered token is the canonical ISO form Phase 6
// submits back as p_expected_base_modified_time (resolution #26 / PF40).
function toIso(value: string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function strOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Render the pending MI-11 summary via lib/messages (invariant 5 — no raw
// codes). The catalog dougFacing carries {name}/{old}/{new} placeholders; this
// layer interpolates them from the hold's held_value (old) + proposed_value
// (proposed) — the only renderer for pending holds, which have no
// show_change_log row of their own.
function renderPendingSummary(hold: HoldRow): string {
  const disposition = hold.proposed_value;
  const held = asRecord(hold.held_value);
  const proposed = asRecord(hold.proposed_value);

  if (disposition.disposition === "email_change") {
    return fill(getRequiredDougFacing("mi11_pending_email_change"), {
      name: hold.entity_key,
      old: strOrEmpty(held.email),
      new: strOrEmpty(proposed.email),
    });
  }
  if (disposition.disposition === "rename") {
    // P5-F3: a FOLDED rename (Phase-2 Task 2.5 retargets an open email_change
    // hold to {disposition:'rename', name, email} when an added row matches the
    // held/proposed email) ALSO moves the email / OAuth-login anchor. Doug sees
    // ONLY entry.summary, so a folded rename must warn that the email changes
    // too — the settled contract reserves `mi11_pending_rename_folded` for
    // exactly this. The anchor MOVES iff the proposed email differs from the
    // held identity email (the email the OAuth claim currently uses). A future
    // pure rename (same email) keeps the plain `mi11_pending_rename` copy — the
    // branch is conditional, never hardcoded-folded. Compare canonicalized so
    // it matches the fold's own canonEmail-keyed match (holdAwareApply.ts:241).
    const heldEmail = canonEmail(strOrEmpty(held.email) || null);
    const proposedEmail = canonEmail(strOrEmpty(proposed.email) || null);
    const emailAnchorMoved = proposedEmail !== heldEmail;
    if (emailAnchorMoved) {
      return fill(getRequiredDougFacing("mi11_pending_rename_folded"), {
        name: hold.entity_key,
        old: strOrEmpty(held.name) || hold.entity_key,
        new: strOrEmpty(proposed.name),
      });
    }
    return fill(getRequiredDougFacing("mi11_pending_rename"), {
      name: hold.entity_key,
      old: strOrEmpty(held.name) || hold.entity_key,
      new: strOrEmpty(proposed.name),
    });
  }
  // removal
  return fill(getRequiredDougFacing("mi11_pending_removal"), {
    name: hold.entity_key,
    old: "",
    new: "",
  });
}

function fill(template: string, params: { name: string; old: string; new: string }): string {
  return template
    .replaceAll("{name}", params.name)
    .replaceAll("{old}", params.old)
    .replaceAll("{new}", params.new);
}

/**
 * Server-only (service-role) read of the per-show changes feed.
 *
 * Reads show_change_log (most-recent `limit`, occurred_at desc) + open
 * sync_holds (kind='mi11_pending'), shapes each into a FeedEntry, merges, and
 * returns them newest-first. Pending MI-11 holds are ALWAYS included (the
 * actionable items) and do NOT count toward `truncated` (resolution #8 — that
 * keys only off the show_change_log row count). undo_override holds are NOT
 * feed entries (their effect already shows as an undone/rejected log row).
 *
 * NEVER via PostgREST from() on a cookie-bound client — both tables are
 * RLS-locked from anon/authenticated (Phase 1, F9). The service-role client is
 * the only read path. Every Supabase call destructures { data, error } and
 * throws a typed error on a returned-error (invariant 9).
 */
export async function readShowChangeFeed(
  showId: string,
  opts?: { limit?: number },
): Promise<{ entries: FeedEntry[]; truncated: boolean; totalShown: number }> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const supabase = createFeedSupabaseClient();

  // 1. Most-recent N show_change_log rows for the show (feed history + undo).
  //    Every read goes through runFeedRead → returned {error} AND thrown faults
  //    become a typed SyncInfraError (invariant 9 / P5-F1).
  const { data: logData } = await runFeedRead<ChangeLogRow[]>(
    "readShowChangeFeed.showChangeLog",
    () =>
      supabase
        .from("show_change_log")
        .select("id, occurred_at, status, summary, entity_ref, change_kind, individually_undoable")
        .eq("show_id", showId)
        .order("occurred_at", { ascending: false })
        .limit(limit),
  );

  // 2. Total log-row count for the truncation flag (pending holds excluded —
  //    they always render and never count toward truncation, resolution #8).
  const { count: totalLogRows } = await runFeedRead<unknown>(
    "readShowChangeFeed.showChangeLogCount",
    () => supabase.from("show_change_log").select("id", { count: "exact", head: true }).eq("show_id", showId),
  );

  // 3. Open pending MI-11 holds (actionable approve_reject entries). The select
  //    list MUST include base_modified_time (the PF40 staleness token). The
  //    kind='undo_override' holds are internal suppression state, NOT entries.
  const { data: holdData } = await runFeedRead<HoldRow[]>(
    "readShowChangeFeed.syncHolds",
    () =>
      supabase
        .from("sync_holds")
        .select("id, entity_key, held_value, proposed_value, base_modified_time, created_at")
        .eq("show_id", showId)
        .eq("kind", "mi11_pending"),
  );

  const logEntries: FeedEntry[] = ((logData ?? []) as ChangeLogRow[]).map((row) => {
    const base: FeedEntry = {
      id: row.id,
      occurredAt: toIso(row.occurred_at) ?? row.occurred_at,
      status: row.status as FeedEntry["status"],
      summary: row.summary,
      action: "none",
      entityRef: row.entity_ref,
    };
    // Undo iff crew-domain change_kind AND status='applied' AND
    // individually_undoable (resolution #P4-F4). The third conjunct hides the
    // perpetually-failing Undo on multi-node closed-group rename-swap rows.
    if (
      row.status === "applied" &&
      isCrewDomainChangeKind(row.change_kind) &&
      row.individually_undoable === true
    ) {
      return { ...base, action: "undo", changeLogId: row.id };
    }
    return base;
  });

  const holdEntries: FeedEntry[] = ((holdData ?? []) as HoldRow[]).map((hold) => {
    const gate: FeedGate = {
      holdId: hold.id,
      disposition: hold.proposed_value,
      baseModifiedTime: toIso(hold.base_modified_time),
    };
    return {
      id: hold.id,
      occurredAt: toIso(hold.created_at) ?? hold.created_at,
      status: "pending",
      summary: renderPendingSummary(hold),
      action: "approve_reject",
      entityRef: hold.entity_key,
      gate,
    };
  });

  const entries = [...holdEntries, ...logEntries].sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
  );

  return {
    entries,
    truncated: (totalLogRows ?? 0) > limit,
    totalShown: entries.length,
  };
}
