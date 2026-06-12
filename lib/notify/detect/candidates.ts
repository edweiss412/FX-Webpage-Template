import postgres from "postgres";
import { SYNC_PROBLEM_CODES, type SyncProblemCode } from "@/lib/notify/constants";
import { mintIdFor } from "@/lib/sync/unpublishBinding";

export type CandidateSql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

export type ShowRealtimeCandidate = {
  kind: "show";
  dedupKey: string;
  alertId: string;
  showId: string;
  code: SyncProblemCode;
  raisedAt: Date;
  slug: string;
  showTitle: string;
  contextSheetName: string | null;
};

export type GlobalRealtimeCandidate = {
  kind: "global";
  dedupKey: string;
  alertId: string;
  code: "SYNC_STALLED";
  raisedAt: Date;
};

export type IngestionRealtimeCandidate = {
  kind: "ingestion";
  dedupKey: string;
  driveFileId: string;
  driveFileName: string;
  firstSeenAt: Date;
  lastErrorCode: string;
};

export type AutoPublishUndoCandidate = {
  kind: "auto_publish_undo";
  dedupKey: string;
  showId: string;
  slug: string;
  showTitle: string;
  // The raw bearer token — carried in-memory ONLY (renders into the per-recipient
  // email link; the deliver-time currentness guard checks full token equality).
  // NEVER persisted: email_deliveries stores the one-way mintId instead (§4.1).
  token: string;
  mintId: string;
  expiresAt: Date;
};

export type RealtimeCandidate =
  | ShowRealtimeCandidate
  | GlobalRealtimeCandidate
  | IngestionRealtimeCandidate
  | AutoPublishUndoCandidate;

export type CandidateResult =
  | { kind: "ok"; candidates: RealtimeCandidate[] }
  | { kind: "infra_error" };

type ShowRow = {
  alert_id: string;
  show_id: string;
  code: SyncProblemCode;
  raised_at: Date | string;
  dedup_key: string;
  slug: string;
  title: string;
  context: unknown;
};

type GlobalRow = {
  alert_id: string;
  code: "SYNC_STALLED";
  raised_at: Date | string;
  dedup_key: string;
};

type IngestionRow = {
  drive_file_id: string;
  drive_file_name: string;
  first_seen_at: Date | string;
  last_error_code: string;
  dedup_key: string;
};

type UndoRow = {
  show_id: string;
  slug: string;
  title: string;
  token: string;
  expires_at: Date | string;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("candidate queries require DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function contextSheetName(context: unknown): string | null {
  if (!context || typeof context !== "object") return null;
  const value = (context as { sheet_name?: unknown }).sheet_name;
  return typeof value === "string" && value.trim() ? value : null;
}

export async function listRealtimeCandidates(sql?: CandidateSql): Promise<CandidateResult> {
  const db =
    sql ??
    (postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      prepare: false,
    }) as CandidateSql);
  const ownsConnection = !sql;

  try {
    const showRows = await db<ShowRow>`
      select
        a.id::text as alert_id,
        a.show_id::text as show_id,
        a.code::text as code,
        a.raised_at,
        (
          a.show_id::text || ':' ||
          a.code || ':' ||
          (floor(extract(epoch from a.raised_at) * 1e6)::bigint)::text
        ) as dedup_key,
        s.slug,
        s.title,
        a.context
      from public.admin_alerts a
      join public.shows s on s.id = a.show_id
      where a.resolved_at is null
        and a.code = any(${SYNC_PROBLEM_CODES}::text[])
        and a.raised_at <= now() - interval '1 hour'
        and s.published is true
        and s.archived is false
      order by a.raised_at asc, a.id asc
    `;

    const globalRows = await db<GlobalRow>`
      select
        a.id::text as alert_id,
        a.code::text as code,
        a.raised_at,
        (
          'global:SYNC_STALLED:' ||
          (floor(extract(epoch from a.raised_at) * 1e6)::bigint)::text
        ) as dedup_key
      from public.admin_alerts a
      where a.resolved_at is null
        and a.show_id is null
        and a.code = 'SYNC_STALLED'
      order by a.raised_at asc, a.id asc
    `;

    const ingestionRows = await db<IngestionRow>`
      select
        drive_file_id,
        drive_file_name,
        first_seen_at,
        last_error_code,
        (
          'ingestion:' ||
          drive_file_id || ':' ||
          (floor(extract(epoch from first_seen_at) * 1e6)::bigint)::text
        ) as dedup_key
      from public.pending_ingestions
      where wizard_session_id is null
        and now() - first_seen_at > interval '1 hour'
      order by first_seen_at asc, drive_file_id asc
    `;

    // Auto-publish-undo candidates (§4.1): shows still inside their 24h undo
    // window (live token + unexpired). Read-only — no locked-table writes
    // (invariant 2 untouched). The mint identity + dedupKey are derived app-side
    // from the token hash (mintIdFor), so a same-ms re-mint can never collide.
    const undoRows = await db<UndoRow>`
      select
        s.id::text as show_id,
        s.slug,
        s.title,
        s.unpublish_token::text as token,
        s.unpublish_token_expires_at as expires_at
      from public.shows s
      where s.unpublish_token is not null
        and s.unpublish_token_expires_at > now()
      order by s.unpublish_token_expires_at asc, s.id asc
    `;

    return {
      kind: "ok",
      candidates: [
        ...showRows.map(
          (row): ShowRealtimeCandidate => ({
            kind: "show",
            dedupKey: row.dedup_key,
            alertId: row.alert_id,
            showId: row.show_id,
            code: row.code,
            raisedAt: asDate(row.raised_at),
            slug: row.slug,
            showTitle: row.title,
            contextSheetName: contextSheetName(row.context),
          }),
        ),
        ...globalRows.map(
          (row): GlobalRealtimeCandidate => ({
            kind: "global",
            dedupKey: row.dedup_key,
            alertId: row.alert_id,
            code: row.code,
            raisedAt: asDate(row.raised_at),
          }),
        ),
        ...ingestionRows.map(
          (row): IngestionRealtimeCandidate => ({
            kind: "ingestion",
            dedupKey: row.dedup_key,
            driveFileId: row.drive_file_id,
            driveFileName: row.drive_file_name,
            firstSeenAt: asDate(row.first_seen_at),
            lastErrorCode: row.last_error_code,
          }),
        ),
        ...undoRows.map((row): AutoPublishUndoCandidate => {
          const mintId = mintIdFor(row.token);
          return {
            kind: "auto_publish_undo",
            // colon-free mintId keeps deliver.ts's split(":").at(-1) intact (§4.1 R4).
            dedupKey: `${row.show_id}:${mintId}`,
            showId: row.show_id,
            slug: row.slug,
            showTitle: row.title,
            token: row.token,
            mintId,
            expiresAt: asDate(row.expires_at),
          };
        }),
      ],
    };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) {
      await db.end?.({ timeout: 5 });
    }
  }
}
