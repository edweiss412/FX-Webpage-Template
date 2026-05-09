import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { upsertAdminAlert as defaultUpsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { getDriveClient } from "@/lib/drive/client";

export const WATCH_CHANNEL_ORPHANED = "WATCH_CHANNEL_ORPHANED" as const;

export type WatchChannelStatus = "pending" | "active" | "superseded" | "orphaned" | "stopped";

export class DriveWatchInfraError extends Error {
  readonly kind = "drive_watch_infra_error";
  readonly rootCause: unknown;

  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    super(`Drive watch infrastructure failure during ${operation}`);
    this.name = "DriveWatchInfraError";
    this.rootCause = cause;
  }
}

export type WatchChannelRow = {
  id: string;
  status: WatchChannelStatus;
  watchedFolderId: string;
  webhookSecret: string;
  resourceId: string | null;
  expiresAt: string | null;
};

export type WatchTx = {
  insertPending(row: { id: string; watchedFolderId: string; webhookSecret: string }): Promise<void>;
  activatePending(row: {
    id: string;
    watchedFolderId: string;
    resourceId: string;
    expiresAt: string;
  }): Promise<void>;
  markOrphaned(id: string): Promise<void>;
  upsertAdminAlert(input: {
    code: typeof WATCH_CHANNEL_ORPHANED;
    context: Record<string, unknown>;
  }): Promise<void>;
  listExpiringActive(thresholdIso: string): Promise<WatchChannelRow[]>;
  listGcCandidates(): Promise<WatchChannelRow[]>;
  markStopped(id: string): Promise<void>;
  deleteOldStopped(): Promise<void>;
};

export type SubscribeResult =
  | { outcome: "active"; channelId: string }
  | { outcome: "orphaned"; channelId: string };

export type SubscribeDeps = {
  tx?: WatchTx;
  uuid?: () => string;
  webhookSecret?: () => string;
  watchFolder?: (args: {
    folderId: string;
    channelId: string;
    webhookSecret: string;
  }) => Promise<{ id: string; resourceId: string; expiration: string }>;
};

export type RefreshDeps = {
  tx?: WatchTx;
  now?: () => Date;
  subscribeToWatchedFolder?: (folderId: string) => Promise<SubscribeResult>;
};

export type GcDeps = {
  tx?: WatchTx;
  stopChannel?: (channel: { id: string; resourceId: string | null }) => Promise<void>;
};

type PostgresConnection = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Drive watch lifecycle requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function webhookPublicUrl(): string {
  const configured = process.env.DRIVE_WEBHOOK_PUBLIC_URL;
  if (!configured) {
    throw new Error("DRIVE_WEBHOOK_PUBLIC_URL is required for Drive watch subscriptions");
  }
  return configured;
}

function randomSecret(): string {
  return randomUUID();
}

async function callWatchTx<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof DriveWatchInfraError) throw cause;
    throw new DriveWatchInfraError(operation, cause);
  }
}

class PostgresWatchTx implements WatchTx {
  constructor(private readonly sql: PostgresConnection) {}

  private async rows<T>(query: string, params: unknown[] = []): Promise<T[]> {
    return (await this.sql.unsafe(query, params)) as T[];
  }

  async insertPending(row: { id: string; watchedFolderId: string; webhookSecret: string }) {
    await this.rows(
      `
        insert into public.drive_watch_channels (id, watched_folder_id, webhook_secret, status)
        values ($1, $2, $3, 'pending')
      `,
      [row.id, row.watchedFolderId, row.webhookSecret],
    );
  }

  async activatePending(row: {
    id: string;
    watchedFolderId: string;
    resourceId: string;
    expiresAt: string;
  }) {
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'superseded',
               superseded_at = now()
         where watched_folder_id = $1
           and status = 'active'
           and id <> $2
      `,
      [row.watchedFolderId, row.id],
    );
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'active',
               resource_id = $2,
               expires_at = $3::timestamptz,
               activated_at = now()
         where id = $1
           and status = 'pending'
      `,
      [row.id, row.resourceId, row.expiresAt],
    );
  }

  async markOrphaned(id: string) {
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'orphaned'
         where id = $1
           and status = 'pending'
      `,
      [id],
    );
  }

  async upsertAdminAlert(input: {
    code: typeof WATCH_CHANNEL_ORPHANED;
    context: Record<string, unknown>;
  }) {
    await defaultUpsertAdminAlert({ showId: null, code: input.code, context: input.context });
  }

  async listExpiringActive(thresholdIso: string): Promise<WatchChannelRow[]> {
    const rows = await this.rows<{
      id: string;
      status: WatchChannelStatus;
      watched_folder_id: string;
      webhook_secret: string;
      resource_id: string | null;
      expires_at: string | null;
    }>(
      `
        select id, status, watched_folder_id, webhook_secret, resource_id, expires_at
          from public.drive_watch_channels
         where status = 'active'
           and expires_at < $1::timestamptz
      `,
      [thresholdIso],
    );
    return rows.map(fromDbRow);
  }

  async listGcCandidates(): Promise<WatchChannelRow[]> {
    const rows = await this.rows<{
      id: string;
      status: WatchChannelStatus;
      watched_folder_id: string;
      webhook_secret: string;
      resource_id: string | null;
      expires_at: string | null;
    }>(
      `
        select id, status, watched_folder_id, webhook_secret, resource_id, expires_at
          from public.drive_watch_channels
         where status in ('superseded', 'orphaned')
      `,
    );
    return rows.map(fromDbRow);
  }

  async markStopped(id: string) {
    await this.rows(
      `
        update public.drive_watch_channels
           set status = 'stopped',
               stopped_at = now()
         where id = $1
      `,
      [id],
    );
  }

  async deleteOldStopped() {
    await this.rows(
      `
        delete from public.drive_watch_channels
         where status = 'stopped'
           and stopped_at < now() - interval '7 days'
      `,
    );
  }
}

function fromDbRow(row: {
  id: string;
  status: WatchChannelStatus;
  watched_folder_id: string;
  webhook_secret: string;
  resource_id: string | null;
  expires_at: string | null;
}): WatchChannelRow {
  return {
    id: row.id,
    status: row.status,
    watchedFolderId: row.watched_folder_id,
    webhookSecret: row.webhook_secret,
    resourceId: row.resource_id,
    expiresAt: row.expires_at,
  };
}

async function withDefaultTx<R>(fn: (tx: WatchTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(new PostgresWatchTx(rawTx as unknown as PostgresConnection)),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultWatchFolder(args: {
  folderId: string;
  channelId: string;
  webhookSecret: string;
}): Promise<{ id: string; resourceId: string; expiration: string }> {
  const response = await getDriveClient().files.watch({
    fileId: args.folderId,
    requestBody: {
      id: args.channelId,
      type: "web_hook",
      address: webhookPublicUrl(),
      token: args.webhookSecret,
    },
  });
  const data = response.data;
  if (!data.id || !data.resourceId || !data.expiration) {
    throw new Error("Drive files.watch response missing id/resourceId/expiration");
  }
  return {
    id: data.id,
    resourceId: data.resourceId,
    expiration: new Date(Number(data.expiration)).toISOString(),
  };
}

async function defaultStopChannel(channel: {
  id: string;
  resourceId: string | null;
}): Promise<void> {
  if (!channel.resourceId) return;
  await getDriveClient().channels.stop({
    requestBody: {
      id: channel.id,
      resourceId: channel.resourceId,
    },
  });
}

async function subscribeWithTx(
  tx: WatchTx,
  folderId: string,
  deps: SubscribeDeps,
): Promise<SubscribeResult> {
  const channelId = (deps.uuid ?? randomUUID)();
  const webhookSecret = (deps.webhookSecret ?? randomSecret)();
  await callWatchTx("drive_watch_channels.insert_pending", () =>
    tx.insertPending({ id: channelId, watchedFolderId: folderId, webhookSecret }),
  );

  let watch: { id: string; resourceId: string; expiration: string };
  try {
    watch = await (deps.watchFolder ?? defaultWatchFolder)({
      folderId,
      channelId,
      webhookSecret,
    });
  } catch {
    await callWatchTx("drive_watch_channels.mark_orphaned", () => tx.markOrphaned(channelId));
    await callWatchTx("admin_alerts.upsert_watch_orphaned", () =>
      tx.upsertAdminAlert({
        code: WATCH_CHANNEL_ORPHANED,
        context: { watched_folder_id: folderId, channel_id: channelId },
      }),
    );
    return { outcome: "orphaned", channelId };
  }

  await callWatchTx("drive_watch_channels.activate_pending", () =>
    tx.activatePending({
      id: watch.id,
      watchedFolderId: folderId,
      resourceId: watch.resourceId,
      expiresAt: watch.expiration,
    }),
  );
  return { outcome: "active", channelId: watch.id };
}

export async function subscribeToWatchedFolder(
  folderId: string,
  deps: SubscribeDeps = {},
): Promise<SubscribeResult> {
  if (deps.tx) return await subscribeWithTx(deps.tx, folderId, deps);
  return await withDefaultTx((tx) => subscribeWithTx(tx, folderId, deps));
}

export async function refreshWatchSubscriptions(
  deps: RefreshDeps = {},
): Promise<{ refreshed: string[] }> {
  if (!deps.tx) {
    return await withDefaultTx((tx) => refreshWatchSubscriptions({ ...deps, tx }));
  }

  const tx = deps.tx;
  const now = deps.now ?? (() => new Date());
  const threshold = new Date(now().getTime() + 24 * 60 * 60 * 1000).toISOString();
  const due = await callWatchTx("drive_watch_channels.list_expiring_active", () =>
    tx.listExpiringActive(threshold),
  );
  const subscribe =
    deps.subscribeToWatchedFolder ?? ((folderId) => subscribeToWatchedFolder(folderId));
  const refreshed: string[] = [];
  for (const row of due) {
    await subscribe(row.watchedFolderId);
    refreshed.push(row.watchedFolderId);
  }
  return { refreshed };
}

export async function gcWatchChannels(deps: GcDeps = {}): Promise<{ stopped: string[] }> {
  if (!deps.tx) {
    return await withDefaultTx((tx) => gcWatchChannels({ ...deps, tx }));
  }

  const tx = deps.tx;
  const stopChannel = deps.stopChannel ?? defaultStopChannel;
  const candidates = await callWatchTx("drive_watch_channels.list_gc_candidates", () =>
    tx.listGcCandidates(),
  );
  const stopped: string[] = [];
  for (const channel of candidates) {
    try {
      await stopChannel({ id: channel.id, resourceId: channel.resourceId });
    } catch {
      // Best-effort cleanup: Drive may already have dropped an orphaned channel.
    }
    await callWatchTx("drive_watch_channels.mark_stopped", () => tx.markStopped(channel.id));
    stopped.push(channel.id);
  }
  await callWatchTx("drive_watch_channels.delete_old_stopped", () => tx.deleteOldStopped());
  return { stopped };
}
