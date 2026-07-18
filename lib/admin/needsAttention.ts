// M12.2 Phase A Task 3 — needs-attention merge/slice/classify (PURE, no
// Supabase) + the catalog-safe pending-ingestion copy resolver (spec §5.3 / §7).
//
// Ordering model is exactly TWO streams (spec §5.3):
//   1. pending_ingestions  -> `pending_ingestion` items, keyed by last_attempt_at
//   2. pending_syncs       -> classified into first_seen / existing_staged AFTER
//      the slice, keyed by staged_modified_time
// Merge both into one list ordered newest-first by the per-item activity key,
// tie-broken by id; slice ONCE to RENDER_CAP; classify the sliced sync items
// via the existence map. Counts come from the exact totals (totalCounts), never
// the capped array — so "+N more" and the Need-review stat reflect reality.

import {
  MESSAGE_CATALOG,
  messageFor,
  plainCatalogText,
  type MessageCode,
} from "@/lib/messages/lookup";

// V4/V7 — pin the inbox max-render cap. Chosen >> FXAV scale, < PostgREST cap.
export const RENDER_CAP = 20;
// Page-variant cap, spec §4.1; single source — no other literal 100.
export const PAGE_RENDER_CAP = 100;

// Fixed catalog-backed generic Doug-facing fallback (spec §7/V8, Task 2.5).
const GENERIC_INGESTION_COPY = MESSAGE_CATALOG.SHEET_PROCESS_FAILED.dougFacing as string;
const UNRESOLVED_PLACEHOLDER_RE = /<[a-zA-Z_][a-zA-Z0-9_-]*>/;

export type NeedsAttentionIngestionInput = {
  id: string;
  driveFileId: string;
  driveFileName: string | null;
  lastErrorCode: string | null;
  lastAttemptAt: string | null;
};

export type NeedsAttentionSyncInput = {
  stagedId: string;
  driveFileId: string;
  candidateTitle: string | null;
  stagedModifiedTime: string | null;
};

export type ShowExistence = {
  slug: string;
  title: string | null;
  published: boolean;
  archived: boolean;
};

// A per-show sync-problem alert (SHEET_UNAVAILABLE / PARSE_ERROR_LAST_GOOD)
// routed into the inbox instead of the AlertBanner (spec §4.3). Sourced from an
// unresolved admin_alerts row joined to its show; `raisedAt` is the sort key.
export type NeedsAttentionSyncProblemInput = {
  alertId: string;
  showId: string;
  slug: string | null;
  title: string | null;
  code: string;
  sheetName: string | null;
  raisedAt: string | null;
};

export type BuildNeedsAttentionInput = {
  ingestions: NeedsAttentionIngestionInput[];
  syncs: NeedsAttentionSyncInput[];
  // OPTIONAL (spec §4.3): the digest caller (lib/notify/digest.ts) passes neither
  // `syncProblems` nor `totalCounts.syncProblems`; both default to []/0 so the
  // digest produces zero sync_problem items (byte-identical behavior).
  syncProblems?: NeedsAttentionSyncProblemInput[];
  // keyed by drive_file_id; spans ALL shows (published/unpublished/archived)
  existence: Record<string, ShowExistence>;
  totalCounts: { ingestions: number; syncs: number; syncProblems?: number };
  // Render cap for the merged slice; defaults to RENDER_CAP (dashboard inbox).
  // The needs-attention page threads PAGE_RENDER_CAP (spec §4.1).
  cap?: number;
};

// `activityAt` = the ISO activity time the card was sorted by (pending_ingestion
// → last_attempt_at; sync variants → staged_modified_time). Null when the source
// row carried no time. Rendered as a relative "1h ago" timestamp in the inbox
// card (NeedsAttentionInbox); never the sole carrier of meaning.
export type NeedsAttentionItem =
  | {
      variant: "pending_ingestion";
      key: string;
      id: string; // pending_ingestions.id — drives the retry/discard actions
      driveFileId: string;
      driveFileName: string | null;
      copy: string;
      activityAt: string | null;
    }
  | {
      variant: "first_seen";
      key: string;
      stagedId: string; // routes to /admin/show/staged/{stagedId} (onboarding review)
      driveFileId: string;
      candidateTitle: string | null;
      activityAt: string | null;
    }
  | {
      variant: "existing_staged";
      key: string;
      stagedId: string;
      driveFileId: string;
      slug: string; // routes to /admin?show={slug} (review modal, archived-safe)
      title: string | null;
      activityAt: string | null;
    }
  | {
      variant: "sync_problem";
      key: string;
      alertId: string; // deep-links /admin?show={slug}&alert_id={alertId}
      showId: string;
      slug: string; // non-null (null-slug rows are skipped at build time)
      title: string | null;
      code: string; // SHEET_UNAVAILABLE | PARSE_ERROR_LAST_GOOD (unconstrained DB string)
      copy: string; // catalog-safe, already resolved
      activityAt: string | null;
    };

export type NeedsAttention = {
  items: NeedsAttentionItem[];
  renderedCount: number;
  totalCount: number;
  overflowCount: number;
  // Exact per-stream totals (R6-F1) — from the head-counts, NOT the capped
  // row arrays; underivable from `items` once either stream exceeds the cap.
  ingestionTotal: number;
  syncTotal: number;
  syncProblemTotal: number;
};

// Per-code generic fallbacks for a sync-problem card when no sheet name is
// available (spec §4.3). These mirror the catalog `title` strings.
const SYNC_PROBLEM_GENERIC: Record<string, string> = {
  SHEET_UNAVAILABLE: "Sheet no longer in folder",
  PARSE_ERROR_LAST_GOOD: "Latest edit didn't parse",
};

/**
 * Catalog-safe copy for a sync-problem inbox card (spec §4.3). Interpolates the
 * sheet name into the code's dougFacing and strips Markdown emphasis (the inbox
 * renders the string raw). Falls back sheetName → title → a fixed per-code
 * generic when the code is uncataloged, has null dougFacing, or an unfilled
 * `<…>` placeholder survives interpolation. Never returns a raw code.
 */
export function resolveSyncProblemCopy(input: {
  code: string;
  sheetName: string | null;
  title: string | null;
}): string {
  const generic = SYNC_PROBLEM_GENERIC[input.code] ?? "Needs your attention";
  if (!(input.code in MESSAGE_CATALOG)) return generic;
  const template = messageFor(input.code as MessageCode).dougFacing;
  if (!template) return generic;
  const name = input.sheetName ?? input.title ?? undefined;
  const doug = plainCatalogText(template, name ? { sheet_name: name } : undefined);
  if (UNRESOLVED_PLACEHOLDER_RE.test(doug)) return generic;
  return doug;
}

/**
 * Catalog-safe copy for a pending-ingestion item (spec §7). NEVER renders a
 * raw code, raw last_error_message, or an unfilled `<…>` placeholder. Returns
 * the generic fallback copy when the code is missing, not a catalog code, has
 * a null dougFacing, or still contains an unresolved placeholder after
 * interpolation.
 *
 * `genericFallback` lets each surface supply context-appropriate generic copy.
 * Default is SHEET_PROCESS_FAILED ("Open the show to see the staged change…"),
 * correct for the needs-attention inbox + emails where a show exists. The
 * wizard step-3 passes its own generic that points at the row's Retry/Defer/
 * Ignore controls, because a phase-1 hard-fail may have produced no show to
 * open (Codex R6). The catalog-code path is surface-agnostic and unaffected;
 * only the generic fallback differs.
 */
export function resolveIngestionCopy(input: {
  code: string | null;
  driveFileName: string | null;
  genericFallback?: string;
}): string {
  const { code, driveFileName } = input;
  const generic = input.genericFallback ?? GENERIC_INGESTION_COPY;
  if (!code) return generic;
  // No parser→catalog error-code alias map exists (spec §7 step 1 → rely on
  // the generic fallback): a non-catalog code goes straight to generic.
  if (!(code in MESSAGE_CATALOG)) return generic;
  // Raw template (no params) so plainCatalogText can strip the catalog's
  // Markdown emphasis markers BEFORE interpolating the sheet name. This copy
  // feeds plaintext surfaces only — the realtime/digest email bodies and the
  // in-app NeedsAttentionInbox copy line (item.copy, rendered raw) — none of
  // which render Markdown, so a literal "_<sheet>_" would leak. Stripping on
  // the template keeps it param-safe: a sheet named "Foo *draft*" survives.
  const template = messageFor(code as MessageCode).dougFacing;
  if (!template) return generic; // crew-only code (null dougFacing)
  const params = driveFileName ? { sheet_name: driveFileName } : undefined;
  const doug = plainCatalogText(template, params);
  if (UNRESOLVED_PLACEHOLDER_RE.test(doug)) return generic; // unfilled <…>
  return doug;
}

type MergedEntry =
  | {
      kind: "ingestion";
      sortKey: string;
      id: string;
      driveFileId: string;
      driveFileName: string | null;
      code: string | null;
    }
  | {
      kind: "sync";
      sortKey: string;
      id: string;
      driveFileId: string;
      candidateTitle: string | null;
    }
  | {
      kind: "sync_problem";
      sortKey: string;
      id: string; // alertId (tie-break + card key)
      alertId: string;
      showId: string;
      slug: string;
      title: string | null;
      code: string;
      sheetName: string | null;
    };

export function buildNeedsAttention(input: BuildNeedsAttentionInput): NeedsAttention {
  const merged: MergedEntry[] = [
    ...input.ingestions.map(
      (g): MergedEntry => ({
        kind: "ingestion",
        sortKey: g.lastAttemptAt ?? "",
        id: g.id,
        driveFileId: g.driveFileId,
        driveFileName: g.driveFileName,
        code: g.lastErrorCode,
      }),
    ),
    ...input.syncs.map(
      (s): MergedEntry => ({
        kind: "sync",
        sortKey: s.stagedModifiedTime ?? "",
        id: s.stagedId,
        driveFileId: s.driveFileId,
        candidateTitle: s.candidateTitle,
      }),
    ),
    // Skip any sync-problem with a null slug (defensive — the loader's shows!inner
    // guarantees a slug; a null here would produce a dead /admin?show=undefined link).
    ...(input.syncProblems ?? [])
      .filter((sp): sp is NeedsAttentionSyncProblemInput & { slug: string } => sp.slug !== null)
      .map(
        (sp): MergedEntry => ({
          kind: "sync_problem",
          sortKey: sp.raisedAt ?? "",
          id: sp.alertId,
          alertId: sp.alertId,
          showId: sp.showId,
          slug: sp.slug,
          title: sp.title,
          code: sp.code,
          sheetName: sp.sheetName,
        }),
      ),
  ];

  // Newest-first by activity time; tie-break by id ascending for determinism.
  merged.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return b.sortKey.localeCompare(a.sortKey);
    return a.id.localeCompare(b.id);
  });

  // Slice ONCE across the merged list (no stream's older rows bury the other's
  // newer rows), THEN classify the sliced sync items.
  const sliced = merged.slice(0, input.cap ?? RENDER_CAP);

  const items: NeedsAttentionItem[] = sliced.map((entry) => {
    // sortKey is the ISO activity time (or "" when the source row had none).
    const activityAt = entry.sortKey.length > 0 ? entry.sortKey : null;
    if (entry.kind === "ingestion") {
      return {
        variant: "pending_ingestion",
        key: `ingestion:${entry.id}`,
        id: entry.id,
        driveFileId: entry.driveFileId,
        driveFileName: entry.driveFileName,
        copy: resolveIngestionCopy({ code: entry.code, driveFileName: entry.driveFileName }),
        activityAt,
      };
    }
    if (entry.kind === "sync_problem") {
      return {
        variant: "sync_problem",
        key: `alert:${entry.alertId}`,
        alertId: entry.alertId,
        showId: entry.showId,
        slug: entry.slug,
        title: entry.title,
        code: entry.code,
        copy: resolveSyncProblemCopy({
          code: entry.code,
          sheetName: entry.sheetName,
          title: entry.title,
        }),
        activityAt,
      };
    }
    const existing = input.existence[entry.driveFileId];
    if (existing) {
      return {
        variant: "existing_staged",
        key: `sync:${entry.id}`,
        stagedId: entry.id,
        driveFileId: entry.driveFileId,
        slug: existing.slug,
        title: existing.title,
        activityAt,
      };
    }
    return {
      variant: "first_seen",
      key: `sync:${entry.id}`,
      stagedId: entry.id,
      driveFileId: entry.driveFileId,
      candidateTitle: entry.candidateTitle,
      activityAt,
    };
  });

  const syncProblemsTotal = input.totalCounts.syncProblems ?? 0;
  const totalCount = input.totalCounts.ingestions + input.totalCounts.syncs + syncProblemsTotal;
  const renderedCount = items.length;
  return {
    items,
    renderedCount,
    totalCount,
    overflowCount: Math.max(0, totalCount - renderedCount),
    ingestionTotal: input.totalCounts.ingestions,
    syncTotal: input.totalCounts.syncs,
    syncProblemTotal: syncProblemsTotal,
  };
}
