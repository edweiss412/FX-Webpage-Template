// lib/admin/bellFeed.ts
//
// Bell notification center pipeline (spec docs/superpowers/specs/2026-07-05-
// bell-notification-center-design.md §6). `get_bell_feed_rows` (Task 2) reads
// entry-grain rows in ONE snapshot — a meta row (seen_through, cap flags,
// viewer_opened_at) plus zero-or-more entry rows, each already carrying the
// viewer's read-state (`viewer_read_at`) on the SAME row (R4: no separate
// `admin_alert_reads`/`admin_bell_state` reads in this pipeline — avoids a
// cross-tab/open race between two independent snapshots).
//
// `shapeBellEntries` is pure (hand-testable) shaping over those rows.
// `loadBellFeed`/`loadBellUnseenCount` share one pipeline (`runBellPipeline`)
// so the badge count and the panel feed can never disagree (spec §6.4).
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { bellExcludedCodes } from "@/lib/admin/bellAudience";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";
import { isAutoResolving, autoResolveNote, HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { resolveAlertActions } from "@/lib/adminAlerts/alertActions";
import { deriveAlertMessageParams } from "@/lib/adminAlerts/deriveMessageParams";
import { projectIdentityContext } from "@/lib/adminAlerts/projectIdentityContext";
import {
  resolveAlertIdentities,
  type AlertIdentitiesResult,
} from "@/lib/adminAlerts/resolveAlertIdentities";
import type { SerializedAlertIdentity } from "@/lib/adminAlerts/identityTypes";
import type { MessageParams } from "@/lib/messages/lookup";
import { log } from "@/lib/log";

export type BellEntry = {
  alertId: string;
  code: string;
  showId: string | null;
  slug: string | null;
  state: "active" | "history";
  activityAt: string;
  resolvedAt: string | null;
  occurrences: number;
  unread: boolean;
  // Producer-supplied admin_alerts.context (raw jsonb) — carried onto the entry
  // so the panel can interpolate it into catalog copy templates (parity with the
  // retired AlertBanner's `messageFor(code, context)`). Admin-only surface; the
  // sanitized identity chip below is a SEPARATE, already-projected path.
  context: Record<string, unknown> | null;
  identity: SerializedAlertIdentity | null;
  isAutoResolving: boolean;
  autoResolveNote: string | null;
  /** Ordered action links (spec 2026-07-17 §3.4) — 0..n; first leads. */
  actions: { href: string; label: string; external: boolean }[];
  /** Merged copy params (raw context scalars + identity-derived — spec §4.1/§4.2). */
  messageParams: MessageParams;
  isHealth: boolean;
};

export type BellFeedResult =
  | {
      kind: "ok";
      entries: BellEntry[];
      unseenCount: number;
      truncated: boolean;
      /** Active-list truncation only (spec §1.1 R4) — gates severity grouping. */
      activeTruncated: boolean;
      historyDays: number;
      feedCap: number;
      seenThrough: string;
    }
  | { kind: "infra_error" };

export type BellCountResult = { kind: "ok"; count: number } | { kind: "infra_error" };

export class BellFeedShapeError extends Error {}

// Mirrors get_bell_feed_rows' RETURNS TABLE shape exactly
// (supabase/migrations/20260705100001_get_bell_feed_rows.sql:12-29).
type RpcRow = {
  is_meta: boolean;
  seen_through: string | null;
  active_hit_cap: boolean | null;
  history_hit_cap: boolean | null;
  viewer_opened_at: string | null;
  id: string | null;
  code: string | null;
  show_id: string | null;
  slug: string | null;
  context: Record<string, unknown> | null;
  occurrence_count: number | null;
  raised_at: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
  resolved_occurrence_sum: number | null;
  is_active: boolean | null;
  viewer_read_at: string | null;
};

// Viewer read/watermark state arrives ON the RPC rows (same DB snapshot as the
// entries — plan-review R4: no separate state reads, no cross-tab /open race).
export function shapeBellEntries(
  rows: RpcRow[],
  feedCap: number,
): {
  entries: Omit<BellEntry, "identity">[];
  unseenCount: number;
  truncated: boolean;
  activeTruncated: boolean;
  seenThrough: string;
} {
  const meta = rows.find((r) => r.is_meta);
  if (!meta || !meta.seen_through) throw new BellFeedShapeError("missing meta row");
  const openedAt = meta.viewer_opened_at;
  const entryRows = rows.filter((r) => !r.is_meta);
  const shaped = entryRows.map((r) => {
    const activityAt = r.raised_at! > r.last_seen_at! ? r.raised_at! : r.last_seen_at!;
    const readAt = r.viewer_read_at;
    return {
      alertId: r.id!,
      code: r.code!,
      showId: r.show_id,
      slug: r.slug,
      state: (r.is_active ? "active" : "history") as "active" | "history",
      activityAt,
      resolvedAt: r.resolved_at,
      occurrences: r.is_active
        ? (r.occurrence_count ?? 0) + Number(r.resolved_occurrence_sum ?? 0)
        : Number(r.resolved_occurrence_sum ?? 0),
      // Explicit null (not undefined) so exactOptionalPropertyTypes-correct
      // consumers get the same nullable shape on active AND history rows.
      context: r.context ?? null,
      // unread compares against activityAt (greatest(raised_at,last_seen_at)) —
      // the SAME value the read stamp carries (spec §3.1 as amended per plan-review
      // R3 finding 2), so stamp and comparison can never use different clocks.
      unread: r.is_active ? readAt === null || readAt < activityAt : false,
      isAutoResolving: isAutoResolving(r.code!),
      autoResolveNote: isAutoResolving(r.code!) ? autoResolveNote(r.code!) : null,
      actions: resolveAlertActions(r.code!, r.context, { slug: r.slug }),
      // Placeholder — stamped with the identity-derived value once
      // resolveAlertIdentities resolves (loadBellFeed, below).
      messageParams: {},
      isHealth: HEALTH_CODES.includes(r.code!),
    };
  });
  shaped.sort((a, b) =>
    a.state !== b.state
      ? a.state === "active"
        ? -1
        : 1
      : a.state === "active"
        ? b.activityAt.localeCompare(a.activityAt)
        : (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""),
  );
  const sliced = shaped.slice(0, feedCap);
  const unseenCount = sliced.filter((e) => openedAt === null || e.activityAt > openedAt).length;
  return {
    entries: sliced,
    unseenCount,
    truncated:
      Boolean(meta.active_hit_cap) ||
      Boolean(meta.history_hit_cap) ||
      sliced.length < shaped.length,
    // Active-specific truncation (spec §1.1 R4): the active CTE is capped at
    // `limit p_cap`, and the combined slice sorts active-first, so an active
    // row is dropped ONLY when active_hit_cap is set. History-only capping does
    // NOT set this. Gates severity grouping (a recency-capped active window
    // cannot honor severity-completeness).
    activeTruncated: Boolean(meta.active_hit_cap),
    seenThrough: meta.seen_through,
  };
}

type BellPipelineResult =
  | {
      kind: "ok";
      supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
      rows: RpcRow[];
      shaped: ReturnType<typeof shapeBellEntries>;
      historyDays: number;
      feedCap: number;
    }
  | { kind: "infra_error" };

// Shared read pipeline for loadBellFeed/loadBellUnseenCount (spec §6.4 —
// identical pipeline so the badge and panel can never disagree). Each
// Supabase-derived await is wrapped in its OWN try/catch, adjacent to the
// await (invariant 9 / tests/admin/_metaInfraContract catch-window shape).
async function runBellPipeline(
  viewerEmail: string,
  viewerIsDeveloper: boolean,
): Promise<BellPipelineResult> {
  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch {
    return { kind: "infra_error" };
  }

  // 1. Bell bounds — read app_settings; fall back to BELL_LIMITS defaults
  // when the row's columns are null (spec §3.4). A returned error or a
  // thrown read is an infra fault, NOT a null-columns case.
  let historyDays: number = BELL_LIMITS.historyDays.default;
  let feedCap: number = BELL_LIMITS.feedCap.default;
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("bell_history_days, bell_feed_cap")
      .eq("id", "default")
      .limit(1);
    if (error) return { kind: "infra_error" };
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    if (row) {
      if (typeof row.bell_history_days === "number") historyDays = row.bell_history_days;
      if (typeof row.bell_feed_cap === "number") feedCap = row.bell_feed_cap;
    }
  } catch {
    return { kind: "infra_error" };
  }

  // 2. Entry-grain read — viewer read/watermark state rides on the returned
  // rows (R4: no separate admin_alert_reads/admin_bell_state reads here).
  let rows: RpcRow[];
  try {
    const { data, error } = await supabase.rpc("get_bell_feed_rows", {
      p_history_days: historyDays,
      p_cap: feedCap,
      p_excluded_codes: bellExcludedCodes(viewerIsDeveloper),
      p_admin_email: viewerEmail,
    });
    if (error) return { kind: "infra_error" };
    rows = (Array.isArray(data) ? data : []) as RpcRow[];
  } catch {
    return { kind: "infra_error" };
  }

  // 3. Shape. A malformed snapshot (missing meta row) is a fail-closed infra
  // fault here, not a propagated throw (R10.1).
  let shaped: ReturnType<typeof shapeBellEntries>;
  try {
    shaped = shapeBellEntries(rows, feedCap);
  } catch {
    return { kind: "infra_error" };
  }

  return { kind: "ok", supabase, rows, shaped, historyDays, feedCap };
}

export async function loadBellFeed(
  viewerEmail: string,
  viewerIsDeveloper: boolean,
): Promise<BellFeedResult> {
  const pipeline = await runBellPipeline(viewerEmail, viewerIsDeveloper);
  if (pipeline.kind === "infra_error") return { kind: "infra_error" };
  const { supabase, rows, shaped, historyDays, feedCap } = pipeline;

  // At-a-glance identity (spec §3.1-§3.3), mirroring healthAlerts.ts:112-154.
  // Each entry's OWN show_id is the ResolverRow show_id. Resolve ONCE over
  // the SLICED entries (≤feedCap) so batching stays bounded. includePii:
  // true (requireAdmin-gated surface). Identity is additive, never gating —
  // on ANY fault (thrown or infra_error) log a degraded event and keep every
  // row, with whatever identities survived.
  const contextByAlertId = new Map(
    rows.filter((r) => !r.is_meta).map((r) => [r.id as string, r.context]),
  );
  const resolverRows = shaped.entries.map((e) => ({
    id: e.alertId,
    code: e.code,
    show_id: e.showId,
    occurrence_count: e.occurrences,
    identityContext: projectIdentityContext(contextByAlertId.get(e.alertId) ?? null, {
      includePii: true,
    }),
  }));
  let identities: AlertIdentitiesResult["identities"] = new Map();
  try {
    const resolved = await resolveAlertIdentities(
      resolverRows,
      // Cast through the resolver's own narrow parameter type — the full
      // generated SupabaseClient type triggers TS2589 against the direct
      // pass (production precedent: lib/admin/healthAlerts.ts:136,
      // lib/observe/query/alerts.ts:85).
      supabase as unknown as Parameters<typeof resolveAlertIdentities>[1],
      { includePii: true },
    );
    identities = resolved.identities;
    if (resolved.kind === "infra_error") {
      log.error("bell identity resolve degraded", { source: "admin.bellFeed" });
    }
  } catch (err) {
    log.error("bell identity resolve degraded", { source: "admin.bellFeed", error: err });
  }

  const entries: BellEntry[] = shaped.entries.map((e) => {
    const identity = identities.get(e.alertId) ?? null;
    return {
      ...e,
      identity,
      messageParams: deriveAlertMessageParams(
        e.code,
        contextByAlertId.get(e.alertId) ?? null,
        identity,
        "global",
      ),
    };
  });

  return {
    kind: "ok",
    entries,
    unseenCount: shaped.unseenCount,
    truncated: shaped.truncated,
    activeTruncated: shaped.activeTruncated,
    historyDays,
    feedCap,
    seenThrough: shaped.seenThrough,
  };
}

export async function loadBellUnseenCount(
  viewerEmail: string,
  viewerIsDeveloper: boolean,
): Promise<BellCountResult> {
  const pipeline = await runBellPipeline(viewerEmail, viewerIsDeveloper);
  if (pipeline.kind === "infra_error") return { kind: "infra_error" };
  return { kind: "ok", count: pipeline.shaped.unseenCount };
}
