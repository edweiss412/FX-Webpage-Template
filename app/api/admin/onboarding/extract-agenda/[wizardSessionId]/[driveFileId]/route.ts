import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

import {
  claimExtractLease,
  releaseExtractLease,
  releaseExtractLeaseStandalone,
  defaultSlotStore,
  type InMemorySlotStore,
  type LeaseTx,
  type LeasePool,
} from "@/lib/agenda/extractAgendaLease";
import { enrichAgenda as realEnrichAgenda, type EnrichAgendaReport } from "@/lib/sync/enrichAgenda";
import { buildAdminAgendaPreview, type AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import { revisionTimesMatch } from "@/lib/sync/applyStaged";
import { AGENDA_EXTRACT_DEADLINE_MS } from "@/lib/agenda/constants";
import { defaultDriveClient } from "@/lib/sync/runScheduledCronSync";
import type { DriveClient } from "@/lib/sync/enrichWithDrivePins";
import type { ParseResult } from "@/lib/parser/types";

// Task 9: the per-show agenda-extraction POST endpoint (spec §5.2). It claims a
// durable lease, reads the staged row, fences on sheet revision + folder scope,
// extracts PDFs with NO DB connection held during the ≤300s Drive work, re-fences,
// atomically merges fresh results into parse_result, releases the lease, and
// returns the admin preview. The exact tx#1a → tx#1b → [Drive, no DB] → tx#2
// boundary sequence is load-bearing (80 review rounds converged on it) — see the
// inline step markers below.
export const maxDuration = 300;

// ─── Types ───────────────────────────────────────────────────────────────────

type RouteTx = LeaseTx;
type RoutePool = LeaseTx & {
  begin<R>(fn: (tx: RouteTx) => Promise<R>): Promise<R>;
};

type DriveMetaLike = { modifiedTime: string; parents: string[] };

/**
 * Injectable dependency seam (round-11 plan finding). The route reads its
 * collaborators from `deps`, defaulting to the production singletons, so route
 * tests can instantiate TWO handlers with SEPARATE `createInMemorySlotStore()`
 * stores and prove the cross-instance dedup guarantee comes from the DURABLE
 * lease, not the local in-flight Set.
 *
 * `enrichAgenda` + `deadlineMs` are additional test seams (the deadline-race
 * cases mock enrichAgenda and need a tiny deadline so CI doesn't wait 250s);
 * production uses the real `enrichAgenda` and `AGENDA_EXTRACT_DEADLINE_MS`.
 */
export type ExtractAgendaDeps = {
  slotStore?: InMemorySlotStore;
  sql?: RoutePool;
  driveClient?: DriveClient;
  fetchMeta?: (driveFileId: string) => Promise<DriveMetaLike>;
  enrichAgenda?: (
    result: ParseResult,
    driveClient: DriveClient,
    spreadsheetId: string,
    opts?: { signal?: AbortSignal },
  ) => Promise<EnrichAgendaReport>;
  requireAdminIdentity?: () => Promise<{ email: string }>;
  deadlineMs?: number;
};

type RouteContext = {
  params: Promise<{ wizardSessionId: string; driveFileId: string }>;
};

type AgendaLinkRecord = { label: string; fileId?: string; url?: string; extracted?: unknown };
type ParseResultLike = {
  show?: { agenda_links?: AgendaLinkRecord[] } & Record<string, unknown>;
} & Record<string, unknown>;

// ─── Production defaults ───────────────────────────────────────────────────────

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("extract-agenda route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

let _pool: RoutePool | null = null;
function defaultSql(): RoutePool {
  if (!_pool) {
    _pool = postgres(databaseUrl(), { prepare: false }) as unknown as RoutePool;
  }
  return _pool;
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function defaultFetchMeta(driveFileId: string): Promise<DriveMetaLike> {
  return fetchDriveFileMetadata(driveFileId);
}

// ─── Response helpers (spec §5.2 response shapes) ──────────────────────────────

function pendingResponse(reason: "in_progress" | "queued"): Response {
  return NextResponse.json(
    { status: "pending", reason },
    { status: 202, headers: { "Retry-After": "10" } },
  );
}

function staleResponse(): Response {
  return NextResponse.json({ status: "stale" }, { status: 409 });
}

function itemsResponse(items: AdminAgendaItem[]): Response {
  return NextResponse.json({ items }, { status: 200 });
}

// ─── Deadline timer ────────────────────────────────────────────────────────────

function makeDeadline(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms) as ReturnType<typeof setTimeout> & { unref?: () => void };
    (timer as { unref?: () => void }).unref?.();
  });
  return { promise, cancel: () => timer && clearTimeout(timer) };
}

// ─── Folder-scope + revision fence ─────────────────────────────────────────────

function fencePasses(
  meta: DriveMetaLike,
  stagedModifiedTime: unknown,
  pendingFolderId: string | null,
): boolean {
  // revisionTimesMatch (NOT strict ===): staged_modified_time is a postgres.js Date,
  // meta.modifiedTime is an ISO string — same instant must compare equal (round-25).
  const revOk = revisionTimesMatch(meta.modifiedTime, stagedModifiedTime as string | Date | null);
  const scopeOk = pendingFolderId !== null && meta.parents.includes(pendingFolderId);
  return revOk && scopeOk;
}

// ─── Report → parse_result merge (ordinal-first, driven by the report) ─────────

/**
 * Ordinal-first 3-way merge driven by `report.perLink` (NOT the mutated
 * `link.extracted`, round j-from-report). For each ordinal:
 *   fresh       → set `extracted` from the report's `extraction` payload
 *   known_stale → CLEAR `extracted`
 *   unknown     → LEAVE as-is
 * `recoveredFileId` is applied additively for any verdict.
 */
function mergeReportIntoParseResult(
  parseResult: ParseResultLike,
  report: EnrichAgendaReport,
): ParseResultLike {
  const merged = structuredClone(parseResult);
  const links = merged.show?.agenda_links;
  if (!Array.isArray(links)) return merged;
  for (const v of report.perLink) {
    const link = links[v.ordinal];
    if (!link) continue;
    if (v.recoveredFileId !== undefined) link.fileId = v.recoveredFileId;
    if (v.verdict === "fresh") {
      link.extracted = v.extraction;
    } else if (v.verdict === "known_stale") {
      delete link.extracted;
    }
    // "unknown" → leave existing
  }
  return merged;
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function handleExtractAgenda(
  _request: Request,
  context: RouteContext,
  routeDeps: ExtractAgendaDeps = {},
): Promise<Response> {
  const slotStore = routeDeps.slotStore ?? defaultSlotStore;
  const sql = routeDeps.sql ?? defaultSql();
  const driveClient = routeDeps.driveClient ?? defaultDriveClient();
  const fetchMeta = routeDeps.fetchMeta ?? defaultFetchMeta;
  const enrichAgenda = routeDeps.enrichAgenda ?? realEnrichAgenda;
  const requireAdmin = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  const deadlineMs = routeDeps.deadlineMs ?? AGENDA_EXTRACT_DEADLINE_MS;

  // ── 1. AUTH — BEFORE any lease / DB / Drive work (invariant 9, round-14). ──
  // Forbidden/control-flow → 403 ADMIN_FORBIDDEN; AdminInfraError
  // (ADMIN_SESSION_LOOKUP_FAILED) → typed 500 (mirror finalize/route.ts:900-907).
  try {
    await requireAdmin();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") {
      return NextResponse.json({ code: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ code: "ADMIN_FORBIDDEN" }, { status: 403 });
  }

  const { wizardSessionId, driveFileId } = await context.params;
  const owner = randomUUID();
  const slotKey = `${wizardSessionId}:${driveFileId}`;

  // ── 2. In-memory fast-path (Task-8 slot store). ──
  const slot = slotStore.tryAcquire(slotKey);
  if (slot.ownsInFlight) return pendingResponse("in_progress");
  if (!slot.acquiredSlot) return pendingResponse("queued");

  let leaseClaimed = false;
  let leaseReleased = false;
  try {
    // ── tx#1a — admit lock + durable lease claim ONLY (round-19). ──
    // The deployment-wide admit advisory lock lives here and is released at THIS
    // commit, BEFORE the staged read (tx#1b).
    const claim = await sql.begin((tx) =>
      claimExtractLease(tx, { wizardSessionId, driveFileId, owner }),
    );
    if (!claim.ok) {
      // queued = global cap; in_progress = a live durable lease for this row.
      return pendingResponse(claim.reason);
    }
    leaseClaimed = true;

    // ── tx#1b — staged read + lifecycle guard + folder + generation (staged_id). ──
    type StagedRead =
      | { kind: "missing" }
      | { kind: "superseded" }
      | {
          kind: "ok";
          stagedId: string;
          stagedModifiedTime: unknown;
          parseResult: ParseResultLike;
          pendingFolderId: string | null;
        };
    const read: StagedRead = await sql.begin(async (tx) => {
      const rows = await tx<{
        staged_id: string;
        staged_modified_time: unknown;
        parse_result: ParseResultLike;
        session_active: boolean;
        pending_folder_id: string | null;
      }>`
        SELECT ps.staged_id,
               ps.staged_modified_time,
               ps.parse_result,
               (s.pending_wizard_session_id = ${wizardSessionId}::uuid) AS session_active,
               s.pending_folder_id
          FROM public.pending_syncs ps
          CROSS JOIN (
            SELECT pending_wizard_session_id, pending_folder_id
              FROM public.app_settings
             WHERE id = 'default'
          ) s
         WHERE ps.drive_file_id = ${driveFileId}
           AND ps.wizard_session_id = ${wizardSessionId}::uuid
      `;
      if (rows.length === 0) return { kind: "missing" };
      const r = rows[0]!;
      // Superseded session OR finalize-consumed (active session cleared/rotated)
      // → no longer the active wizard session. Approved rows (wizard_approved=true)
      // are NOT stale — wizard_approved is deliberately not part of this guard.
      if (!r.session_active) return { kind: "superseded" };
      return {
        kind: "ok",
        stagedId: r.staged_id,
        stagedModifiedTime: r.staged_modified_time,
        parseResult: r.parse_result,
        pendingFolderId: r.pending_folder_id,
      };
    });

    if (read.kind === "missing") return itemsResponse([]); // 200 { items: [] }
    if (read.kind === "superseded") return staleResponse(); // 409 stale

    // ── before-fence + extract/merge region — inner try catches unexpected throws
    // as a typed 500 { status: "error" } (invariant 9: infra faults must be
    // discriminable). The catch is INSIDE the outer try whose finally releases the
    // lease + slot, so release still fires on this path. The before-fence Drive
    // metadata read is INSIDE this try (Codex whole-diff R1): a fetchMeta
    // timeout/5xx/auth fault now returns the uniform JSON 500 instead of a bare
    // framework 500. The 504 timeout branch + the 409 fence-mismatch return from
    // inside this try (never reaching the catch); auth 403/500 are above and unchanged.
    try {
      // ── before-fence (Drive metadata, NO DB connection held). ──
      const beforeMeta = await fetchMeta(driveFileId);
      if (!fencePasses(beforeMeta, read.stagedModifiedTime, read.pendingFolderId)) {
        return staleResponse(); // 409, NO Drive download
      }

      // ── extract with the deadline race (no DB connection held). ──
      const controller = new AbortController();
      const extractionPromise = enrichAgenda(
        read.parseResult as unknown as ParseResult,
        driveClient,
        driveFileId,
        { signal: controller.signal },
      ).then((report) => ({ kind: "report" as const, report }));

      const deadline = makeDeadline(deadlineMs);
      let outcome: { kind: "report"; report: EnrichAgendaReport } | { kind: "timed_out" };
      try {
        outcome = await Promise.race([
          extractionPromise,
          deadline.promise.then(() => ({ kind: "timed_out" as const })),
        ]);
      } finally {
        deadline.cancel();
      }

      if (outcome.kind === "timed_out") {
        // Abort, then AWAIT settlement BEFORE the finally releases capacity
        // (round-12): never release the lease/slot while the extraction may still be
        // running, or a retry could claim a 2nd lease and breach the cap. Production
        // Drive deps reject on abort and settle promptly. SKIP tx#2 entirely (no
        // report.perLink deref). The row stays note-only; agenda lands via cron.
        controller.abort();
        await extractionPromise.catch(() => {});
        return NextResponse.json({ status: "timeout" }, { status: 504 });
      }

      const report = outcome.report;

      // ── after-fence part 1 (Drive metadata re-fetch, NO DB held). ──
      const afterMeta = await fetchMeta(driveFileId);

      // ── tx#2 — after-fence current-folder re-read folds in here (round-26: keeps
      // exactly THREE DB windows). Then show-lock → reread → merge → atomic persist
      // → owner-scoped lease release, ALL in this one tx. ──
      type PersistResult = { kind: "stale" } | { kind: "ok"; merged: ParseResultLike };
      const persist: PersistResult = await sql.begin(async (tx) => {
        // FIRST DB op: re-read the CURRENT pending_folder_id (do NOT reuse tx#1b's
        // value, round-17) and complete the after-fence BEFORE the show lock.
        const settingsRows = await tx<{ pending_folder_id: string | null }>`
        SELECT pending_folder_id FROM public.app_settings WHERE id = 'default'
      `;
        const currentFolder = settingsRows[0]?.pending_folder_id ?? null;
        if (!fencePasses(afterMeta, read.stagedModifiedTime, currentFolder)) {
          // Roll back: NO persist, NO show lock acquired (revision OR current-scope).
          return { kind: "stale" };
        }

        // Per-show advisory lock (canonical hashtext→bigint form; round-15).
        await tx`SELECT pg_advisory_xact_lock(hashtext('show:' || ${driveFileId}))`;

        // REREAD the current parse_result under the lock.
        const curRows = await tx<{ parse_result: ParseResultLike }>`
        SELECT parse_result FROM public.pending_syncs
         WHERE wizard_session_id = ${wizardSessionId}::uuid
           AND drive_file_id = ${driveFileId}
      `;
        if (curRows.length === 0) return { kind: "stale" };

        const merged = mergeReportIntoParseResult(curRows[0]!.parse_result, report);

        // Atomic generation-fenced + active + lease-owner-scoped UPDATE. 0 rows →
        // staged row replaced (rescan), session superseded, or lease expired and was
        // reclaimed by another owner (d5 clobber prevention) → 409, no overwrite.
        const updated = await tx<{ ok: boolean }>`
        UPDATE public.pending_syncs
           SET parse_result = ${merged as unknown as object}::jsonb
         WHERE wizard_session_id = ${wizardSessionId}::uuid
           AND drive_file_id = ${driveFileId}
           AND staged_id = ${read.stagedId}::uuid
           AND staged_modified_time = ${read.stagedModifiedTime as Date}
           AND EXISTS (
             SELECT 1 FROM public.app_settings
              WHERE id = 'default'
                AND pending_wizard_session_id = ${wizardSessionId}::uuid
           )
           AND EXISTS (
             SELECT 1 FROM public.agenda_extract_leases
              WHERE wizard_session_id = ${wizardSessionId}::uuid
                AND drive_file_id = ${driveFileId}
                AND owner = ${owner}
                AND expires_at > now()
           )
        RETURNING true AS ok
      `;
        if (updated.length === 0) return { kind: "stale" };

        // Owner-scoped lease release in the SAME tx#2.
        await releaseExtractLease(tx, { wizardSessionId, driveFileId, owner });
        return { kind: "ok", merged };
      });

      if (persist.kind === "stale") {
        return staleResponse(); // 409 — lease NOT released in tx; finally releases it.
      }

      // tx#2 committed the owner-scoped release.
      leaseReleased = true;

      const freshByLinkKey = new Set(
        report.perLink.filter((v) => v.verdict === "fresh").map((v) => v.ordinal),
      );
      const links = (persist.merged.show?.agenda_links ?? []) as AgendaLinkRecord[];
      const items = buildAdminAgendaPreview(links, { freshByLinkKey, validatedHrefs: true });
      return itemsResponse(items);
    } catch (extractErr) {
      // Unexpected throw from the extract/after-fence/merge region. Log the
      // underlying fault for ops (mirrors how finalize/route.ts surfaces infra
      // faults), and return a typed 500 with the SAME `{ status }` discriminator
      // shape as the sibling non-2xx responses (504 `{ status: "timeout" }`, 409
      // `{ status: "stale" }`) so the client's error-state mapping is uniform and
      // we don't mint a user-facing §12.4 catalog code for a purely-internal,
      // never-rendered server fault (the card shows its generic error copy on any
      // non-2xx). Discriminability for ops comes from the console.error + HTTP 500.
      // The outer finally still fires after this return and releases the lease + slot.
      console.error("[extract-agenda] unexpected error in extract/merge region:", extractErr);
      return NextResponse.json({ status: "error" }, { status: 500 });
    }
  } catch (preExtractErr) {
    // Catch-all typed boundary for the PRE-extraction post-auth path (Codex
    // whole-diff R4 — same-vector close): tx#1a (claimExtractLease / admit lock),
    // tx#1b (pending_syncs + app_settings staged read), and any other throw before
    // the inner extract-region try. A DB fault here (schema drift, connection loss,
    // bad migration) must surface as the uniform `{ status: "error" }` 500 — logged
    // and classified — NOT a bare framework 500 (invariant 9). The `finally` below
    // still releases the lease (if claimed) + the in-memory slot. Together with the
    // inner extract-region catch, EVERY post-auth throw path returns the typed 500.
    console.error("[extract-agenda] unexpected error before extraction:", preExtractErr);
    return NextResponse.json({ status: "error" }, { status: 500 });
  } finally {
    // Lease-release boundary (round-1): every post-claim early exit
    // (before/after-fence 409, enrichAgenda throw, tx#2-stale 409, timeout) that
    // did NOT already release in-tx DELETEs the lease IMMEDIATELY (not TTL).
    if (leaseClaimed && !leaseReleased) {
      await releaseExtractLeaseStandalone(sql as unknown as LeasePool, {
        wizardSessionId,
        driveFileId,
        owner,
      }).catch(() => {});
    }
    // Release the in-memory slot/in-flight (idempotent; no-op for 202 paths beyond
    // the acquired slot).
    slot.release();
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleExtractAgenda(request, context);
}
