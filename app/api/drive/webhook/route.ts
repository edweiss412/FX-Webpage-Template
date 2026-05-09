import { timingSafeEqual } from "node:crypto";
import postgres from "postgres";
import { after, NextResponse, type NextRequest } from "next/server";
import { upsertAdminAlert as defaultUpsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { listFolder as defaultListFolder, type DriveListedFile } from "@/lib/drive/list";
import {
  runPushSyncForShow as defaultRunPushSyncForShow,
  type RunPushSyncForShowDeps,
} from "@/lib/sync/runPushSyncForShow";

export const WEBHOOK_HEADERS_MISSING = "WEBHOOK_HEADERS_MISSING" as const;
export const WEBHOOK_CHANNEL_INACTIVE = "WEBHOOK_CHANNEL_INACTIVE" as const;
export const WEBHOOK_TOKEN_INVALID = "WEBHOOK_TOKEN_INVALID" as const;

export class DriveWebhookInfraError extends Error {
  readonly kind = "drive_webhook_infra_error";
  readonly rootCause: unknown;

  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    super(`Drive webhook infrastructure failure during ${operation}`);
    this.name = "DriveWebhookInfraError";
    this.rootCause = cause;
  }
}

export type DriveWebhookChannel = {
  id: string;
  watchedFolderId: string;
  webhookSecret: string;
  resourceId: string;
};

export type DriveWebhookTx = {
  readActiveWatchChannel(channelId: string): Promise<DriveWebhookChannel | null>;
  upsertAdminAlert(input: {
    code: typeof WEBHOOK_TOKEN_INVALID;
    context: Record<string, unknown>;
  }): Promise<void>;
};

export type DriveWebhookDeps = {
  tx?: DriveWebhookTx;
  listFolder?: (folderId: string) => Promise<DriveListedFile[]>;
  runPushSyncForShow?: (
    driveFileId: string,
    deps?: Pick<RunPushSyncForShowDeps, "fileMeta">,
  ) => Promise<Awaited<ReturnType<typeof defaultRunPushSyncForShow>>>;
  defer?: (task: () => Promise<void>) => void;
};

type PostgresConnection = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Drive webhook requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

class PostgresDriveWebhookTx implements DriveWebhookTx {
  constructor(private readonly sql: PostgresConnection) {}

  async readActiveWatchChannel(channelId: string): Promise<DriveWebhookChannel | null> {
    const rows = (await this.sql.unsafe(
      `
        select id, watched_folder_id, webhook_secret, resource_id
          from public.drive_watch_channels
         where id = $1
           and status = 'active'
         limit 1
      `,
      [channelId],
    )) as Array<{
      id: string;
      watched_folder_id: string;
      webhook_secret: string;
      resource_id: string | null;
    }>;
    const row = rows[0];
    if (!row?.resource_id) return null;
    return {
      id: row.id,
      watchedFolderId: row.watched_folder_id,
      webhookSecret: row.webhook_secret,
      resourceId: row.resource_id,
    };
  }

  async upsertAdminAlert(input: {
    code: typeof WEBHOOK_TOKEN_INVALID;
    context: Record<string, unknown>;
  }): Promise<void> {
    await defaultUpsertAdminAlert({ showId: null, code: input.code, context: input.context });
  }
}

async function withDefaultTx<R>(fn: (tx: DriveWebhookTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return await fn(new PostgresDriveWebhookTx(sql as unknown as PostgresConnection));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function header(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  return value && value.length > 0 ? value : null;
}

function tokensMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length) {
    timingSafeEqual(expectedBytes, expectedBytes);
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

function isDispatchingState(state: string): boolean {
  return state === "add" || state === "update";
}

async function callWebhookTx<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof DriveWebhookInfraError) throw cause;
    throw new DriveWebhookInfraError(operation, cause);
  }
}

function dedupeFiles(files: DriveListedFile[]): DriveListedFile[] {
  const seen = new Set<string>();
  const deduped: DriveListedFile[] = [];
  for (const file of files) {
    const key = `${file.driveFileId}\0${file.modifiedTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(file);
  }
  return deduped;
}

function classifyDispatchError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "SYNC_FILE_FAILED";
}

export async function dispatchDriveWebhookFiles(
  channel: DriveWebhookChannel,
  deps: Pick<DriveWebhookDeps, "listFolder" | "runPushSyncForShow"> = {},
): Promise<{
  dispatched: Array<{
    driveFileId: string;
    result:
      | Awaited<ReturnType<typeof defaultRunPushSyncForShow>>
      | { outcome: "error"; code: string };
  }>;
}> {
  const listFolder = deps.listFolder ?? defaultListFolder;
  const runPushSyncForShow = deps.runPushSyncForShow ?? defaultRunPushSyncForShow;
  const files = dedupeFiles(await listFolder(channel.watchedFolderId));
  const dispatched = [];
  for (const file of files) {
    try {
      const result = await runPushSyncForShow(file.driveFileId, { fileMeta: file });
      dispatched.push({ driveFileId: file.driveFileId, result });
    } catch (error) {
      dispatched.push({
        driveFileId: file.driveFileId,
        result: { outcome: "error" as const, code: classifyDispatchError(error) },
      });
    }
  }
  return { dispatched };
}

function deferWebhookDispatch(task: () => Promise<void>, deps: DriveWebhookDeps): void {
  if (deps.defer) {
    deps.defer(task);
    return;
  }
  after(task);
}

export async function handleDriveWebhook(
  request: NextRequest,
  deps: DriveWebhookDeps = {},
): Promise<Response> {
  const channelId = header(request, "X-Goog-Channel-ID");
  const channelToken = header(request, "X-Goog-Channel-Token");
  const resourceId = header(request, "X-Goog-Resource-ID");
  const resourceState = header(request, "X-Goog-Resource-State");

  if (!channelId || !channelToken || !resourceId || !resourceState) {
    return NextResponse.json({ ok: false, code: WEBHOOK_HEADERS_MISSING }, { status: 400 });
  }

  const run = async (tx: DriveWebhookTx): Promise<Response> => {
    const channel = await callWebhookTx("drive_watch_channels.read_active", () =>
      tx.readActiveWatchChannel(channelId),
    );
    if (!channel) {
      return NextResponse.json({ ok: false, code: WEBHOOK_CHANNEL_INACTIVE }, { status: 410 });
    }

    if (!tokensMatch(channelToken, channel.webhookSecret)) {
      await callWebhookTx("admin_alerts.upsert_webhook_token_invalid", () =>
        tx.upsertAdminAlert({
          code: WEBHOOK_TOKEN_INVALID,
          context: { channel_id: channelId, reason: "token_mismatch" },
        }),
      );
      return NextResponse.json({ ok: false, code: WEBHOOK_TOKEN_INVALID }, { status: 401 });
    }

    if (resourceId !== channel.resourceId) {
      await callWebhookTx("admin_alerts.upsert_webhook_token_invalid", () =>
        tx.upsertAdminAlert({
          code: WEBHOOK_TOKEN_INVALID,
          context: { channel_id: channelId, reason: "resource_mismatch" },
        }),
      );
      return NextResponse.json({ ok: false, code: WEBHOOK_TOKEN_INVALID }, { status: 401 });
    }

    if (!isDispatchingState(resourceState)) {
      return NextResponse.json({ ok: true, ignored: resourceState });
    }

    deferWebhookDispatch(async () => {
      await dispatchDriveWebhookFiles(channel, deps);
    }, deps);

    return NextResponse.json({ ok: true, queued: true });
  };

  if (deps.tx) return await run(deps.tx);
  return await withDefaultTx(run);
}

export async function POST(request: NextRequest): Promise<Response> {
  return await handleDriveWebhook(request);
}
