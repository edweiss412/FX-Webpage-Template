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

import { MESSAGE_CATALOG, messageFor, type MessageCode } from "@/lib/messages/lookup";

// V4/V7 — pin the inbox max-render cap. Chosen >> FXAV scale, < PostgREST cap.
export const RENDER_CAP = 20;

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

export type BuildNeedsAttentionInput = {
  ingestions: NeedsAttentionIngestionInput[];
  syncs: NeedsAttentionSyncInput[];
  // keyed by drive_file_id; spans ALL shows (published/unpublished/archived)
  existence: Record<string, ShowExistence>;
  totalCounts: { ingestions: number; syncs: number };
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
      slug: string; // routes to /admin/show/{slug} (per-show review, archived-safe)
      title: string | null;
      activityAt: string | null;
    };

export type NeedsAttention = {
  items: NeedsAttentionItem[];
  renderedCount: number;
  totalCount: number;
  overflowCount: number;
};

/**
 * Catalog-safe copy for a pending-ingestion item (spec §7). NEVER renders a
 * raw code, raw last_error_message, or an unfilled `<…>` placeholder. Returns
 * the FIXED generic SHEET_PROCESS_FAILED copy when the code is missing, not a
 * catalog code, has a null dougFacing, or still contains an unresolved
 * placeholder after interpolation.
 */
export function resolveIngestionCopy(input: {
  code: string | null;
  driveFileName: string | null;
}): string {
  const { code, driveFileName } = input;
  if (!code) return GENERIC_INGESTION_COPY;
  // No parser→catalog error-code alias map exists (spec §7 step 1 → rely on
  // the generic fallback): a non-catalog code goes straight to generic.
  if (!(code in MESSAGE_CATALOG)) return GENERIC_INGESTION_COPY;
  const params = driveFileName ? { sheet_name: driveFileName } : undefined;
  const doug = messageFor(code as MessageCode, params).dougFacing;
  if (!doug) return GENERIC_INGESTION_COPY; // crew-only code (null dougFacing)
  if (UNRESOLVED_PLACEHOLDER_RE.test(doug)) return GENERIC_INGESTION_COPY; // unfilled <…>
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
  ];

  // Newest-first by activity time; tie-break by id ascending for determinism.
  merged.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return b.sortKey.localeCompare(a.sortKey);
    return a.id.localeCompare(b.id);
  });

  // Slice ONCE across the merged list (no stream's older rows bury the other's
  // newer rows), THEN classify the sliced sync items.
  const sliced = merged.slice(0, RENDER_CAP);

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

  const totalCount = input.totalCounts.ingestions + input.totalCounts.syncs;
  const renderedCount = items.length;
  return {
    items,
    renderedCount,
    totalCount,
    overflowCount: Math.max(0, totalCount - renderedCount),
  };
}
