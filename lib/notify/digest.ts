import postgres from "postgres";
import {
  buildNeedsAttention,
  type NeedsAttentionIngestionInput,
  type NeedsAttentionSyncInput,
  type ShowExistence,
} from "@/lib/admin/needsAttention";
import { canonicalize } from "@/lib/email/canonicalize";
import type { DigestShowInput } from "@/lib/notify/templates/digest";

export type DigestBuilderSql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

export type DigestModel = {
  recipient: string;
  dateET: string;
  shows: DigestShowInput[];
  sourceTotals: { ingestions: number; syncs: number; shows: number };
};

export type DigestModelResult =
  | { kind: "ok"; model: DigestModel }
  | { kind: "no_send"; sourceTotals: DigestModel["sourceTotals"] }
  | { kind: "infra_error" };

type IngestionRow = {
  id: string;
  drive_file_id: string;
  drive_file_name: string | null;
  last_error_code: string | null;
  last_attempt_at: string | null;
  first_seen_at: string | Date;
};

type SyncRow = {
  staged_id: string;
  drive_file_id: string;
  candidate_title: string | null;
  staged_modified_time: string | null;
};

type ShowRow = {
  drive_file_id: string;
  slug: string;
  title: string | null;
  published: boolean;
  archived: boolean;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("digest builder requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function dateET(value: string | Date): string {
  if (typeof value === "string") return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function asIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function groupTitleFor(
  item: ReturnType<typeof buildNeedsAttention>["items"][number],
): string | null {
  if (item.variant === "pending_ingestion") return item.driveFileName;
  if (item.variant === "first_seen") return item.candidateTitle;
  return item.title;
}

function itemCopy(item: ReturnType<typeof buildNeedsAttention>["items"][number]): string {
  if (item.variant === "pending_ingestion") return item.copy;
  if (item.variant === "first_seen") return "New show ready for review";
  return "Changes staged for review";
}

function slugFor(item: ReturnType<typeof buildNeedsAttention>["items"][number]): string | null {
  return item.variant === "existing_staged" ? item.slug : null;
}

function groupNeedsAttention(
  items: ReturnType<typeof buildNeedsAttention>["items"],
): DigestShowInput[] {
  const groups = new Map<string, DigestShowInput>();
  for (const item of items) {
    const title = groupTitleFor(item);
    const slug = slugFor(item);
    const key = `${slug ?? ""}\u0000${title ?? ""}\u0000${item.key}`;
    const existing = groups.get(key) ?? { showTitle: title, slug, items: [] };
    existing.items.push(itemCopy(item));
    groups.set(key, existing);
  }
  return [...groups.values()];
}

export async function buildDigestModel(
  rawRecipient: string,
  nowET: string | Date,
  deps: { sql?: DigestBuilderSql } = {},
): Promise<DigestModelResult> {
  const recipient = canonicalize(rawRecipient);
  if (!recipient) {
    return { kind: "no_send", sourceTotals: { ingestions: 0, syncs: 0, shows: 0 } };
  }

  const sql =
    deps.sql ??
    (postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      prepare: false,
    }) as DigestBuilderSql);
  const ownsConnection = !deps.sql;

  try {
    const ingestions = await sql<IngestionRow>`
      select
        pi.id::text as id,
        pi.drive_file_id,
        pi.drive_file_name,
        pi.last_error_code,
        pi.last_attempt_at,
        pi.first_seen_at
      from public.pending_ingestions pi
      where pi.wizard_session_id is null
        and not exists (
          select 1
            from public.email_deliveries sent
           where sent.kind = 'realtime_problem'
             and sent.status = 'sent'
             and sent.recipient = ${recipient}
             and sent.dedup_key =
               'ingestion:' || pi.drive_file_id || ':' ||
               (floor(extract(epoch from pi.first_seen_at) * 1e6)::bigint)::text
        )
      order by pi.last_attempt_at desc, pi.id asc
    `;

    const syncs = await sql<SyncRow>`
      select
        ps.staged_id::text as staged_id,
        ps.drive_file_id,
        coalesce(
          ps.parse_result->>'title',
          ps.parse_result->>'showTitle',
          ps.parse_result->'meta'->>'title'
        ) as candidate_title,
        ps.staged_modified_time
      from public.pending_syncs ps
      where ps.wizard_session_id is null
      order by ps.staged_modified_time desc, ps.staged_id asc
    `;

    const driveIds = [...new Set(syncs.map((row) => row.drive_file_id))];
    const shows =
      driveIds.length === 0
        ? []
        : await sql<ShowRow>`
            select drive_file_id, slug, title, published, archived
              from public.shows
             where drive_file_id = any(${driveIds}::text[])
          `;

    const existence = Object.fromEntries(
      shows.map((row): [string, ShowExistence] => [
        row.drive_file_id,
        {
          slug: row.slug,
          title: row.title,
          published: row.published,
          archived: row.archived,
        },
      ]),
    );

    const mirrored = buildNeedsAttention({
      ingestions: ingestions.map(
        (row): NeedsAttentionIngestionInput => ({
          id: row.id,
          driveFileId: row.drive_file_id,
          driveFileName: row.drive_file_name,
          lastErrorCode: row.last_error_code,
          lastAttemptAt: asIso(row.last_attempt_at),
        }),
      ),
      syncs: syncs.map(
        (row): NeedsAttentionSyncInput => ({
          stagedId: row.staged_id,
          driveFileId: row.drive_file_id,
          candidateTitle: row.candidate_title,
          stagedModifiedTime: asIso(row.staged_modified_time),
        }),
      ),
      existence,
      totalCounts: { ingestions: ingestions.length, syncs: syncs.length },
    });

    const groups = groupNeedsAttention(mirrored.items);
    const sourceTotals = {
      ingestions: ingestions.length,
      syncs: syncs.length,
      shows: groups.length,
    };
    if (mirrored.items.length === 0) return { kind: "no_send", sourceTotals };
    return {
      kind: "ok",
      model: {
        recipient,
        dateET: dateET(nowET),
        shows: groups,
        sourceTotals,
      },
    };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) {
      await sql.end?.({ timeout: 5 });
    }
  }
}
