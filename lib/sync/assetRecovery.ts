import { createHash } from "node:crypto";
import postgres from "postgres";
import { upsertAdminAlert as defaultUpsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { getDriveAccessToken, getDriveClient } from "@/lib/drive/client";
import type { PersistedDiagrams } from "@/lib/parser/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  readBoundedNodeStream,
  readBoundedWebStream,
  type BoundedByteResult,
} from "@/lib/sync/boundedBytes";
import {
  CONCURRENT_SYNC_SKIPPED,
  type ConcurrentSyncSkipped,
  type LockableSyncTx,
  withShowLock,
} from "@/lib/sync/lockedShowTx";

export { CONCURRENT_SYNC_SKIPPED };

export const ASSET_RECOVERY_BYTES_EXCEEDED = "ASSET_RECOVERY_BYTES_EXCEEDED";
export const ASSET_RECOVERY_REVISION_DRIFT = "ASSET_RECOVERY_REVISION_DRIFT";
export const ASSET_RECOVERY_DRIFT_COOLDOWN = "ASSET_RECOVERY_DRIFT_COOLDOWN";
export const EMBEDDED_RECOVERY_REQUIRES_RESTAGE = "EMBEDDED_RECOVERY_REQUIRES_RESTAGE";

const MAX_RECOVERY_ENTRIES = 60;
const MAX_RECOVERY_SINGLE_BYTES = 50 * 1024 * 1024;
const MAX_RECOVERY_TOTAL_BYTES = 3 * 1024 * 1024 * 1024;

export type AssetRecoveryStorage = {
  upload(path: string, bytes: Uint8Array, options: { contentType: string }): Promise<void>;
};

export type AssetRecoveryDrive = {
  fetchEmbeddedImageBytes(
    entry: PersistedDiagrams["embeddedImages"][number],
  ): Promise<RecoveryAssetBytes | null>;
  fetchLinkedRevisionBytes(
    entry: PersistedDiagrams["linkedFolderItems"][number],
  ): Promise<RecoveryAssetBytes | null>;
};

type RecoveryAssetBytes = Uint8Array | BoundedByteResult;

export type AssetRecoveryShow = {
  showId: string;
  driveFileId: string;
  diagrams: PersistedDiagrams | { current?: PersistedDiagrams | null; pending?: unknown };
};

export type AssetRecoveryTx = {
  readLockedShow(showId: string): Promise<AssetRecoveryShow | null>;
  updateRecoveredDiagrams(
    showId: string,
    diagrams: PersistedDiagrams,
    expectedSnapshotRevisionId: string,
  ): Promise<boolean>;
  upsertRecoveryCooldown(showId: string, previewRevisionId: string): Promise<void>;
  deleteRecoveryCooldown(showId: string, snapshotRevisionId?: string): Promise<void>;
  upsertAdminAlert(showId: string, code: string, context?: Record<string, unknown>): Promise<void>;
};

export type AssetRecoveryDeps = {
  readPreviewShow(showId: string): Promise<AssetRecoveryShow | null>;
  readRecoveryCooldown?(
    showId: string,
    snapshotRevisionId: string,
  ): Promise<{ lastDriftAt: string; retryCount: number } | null>;
  now?: () => Date;
  withShowLock<R>(
    driveFileId: string,
    fn: (tx: AssetRecoveryTx) => Promise<R>,
  ): Promise<R | ConcurrentSyncSkipped>;
  storage: AssetRecoveryStorage;
  drive: AssetRecoveryDrive;
  upsertAdminAlert?(showId: string, code: string, context?: Record<string, unknown>): Promise<void>;
};

type VerifiedAsset = {
  kind: "embedded" | "linked";
  id: string;
  path: string;
  contentType: string;
  bytes: Uint8Array;
};

export type AssetRecoveryResult =
  | { outcome: "recovered"; snapshotRevisionId: string }
  | { outcome: "restage_required"; snapshotRevisionId: string }
  | { outcome: "partial_failure"; snapshotRevisionId: string }
  | { outcome: "skipped"; code: typeof CONCURRENT_SYNC_SKIPPED }
  | {
      outcome: "revision_drift";
      code: typeof ASSET_RECOVERY_REVISION_DRIFT;
      previewRevisionId: string;
    }
  | { outcome: "drift_cooldown"; code: typeof ASSET_RECOVERY_DRIFT_COOLDOWN }
  | { outcome: "bytes_exceeded"; code: typeof ASSET_RECOVERY_BYTES_EXCEEDED }
  | { outcome: "no_op" };

export type AssetRecoveryCronResult = {
  processed: Array<{ showId: string; result: AssetRecoveryResult }>;
};

export type AssetRecoveryCronDeps = {
  listRecoverableShows?: () => Promise<string[]>;
  recover?: (showId: string) => Promise<AssetRecoveryResult>;
};

type PostgresTransaction = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("runAssetRecoveryCron requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function unwrapDiagrams(diagrams: AssetRecoveryShow["diagrams"]): PersistedDiagrams | null {
  if ("snapshot_revision_id" in diagrams) return diagrams;
  return diagrams.current ?? null;
}

function extForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function canonicalPrefix(showId: string, snapshotRevisionId: string): string {
  return `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/`;
}

function sha256Base64Url(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

function md5Hex(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

function recoveryBytes(asset: RecoveryAssetBytes): Uint8Array {
  return asset instanceof Uint8Array ? asset : asset.bytes;
}

function recoverySha256(asset: RecoveryAssetBytes): string {
  return asset instanceof Uint8Array ? sha256Base64Url(asset) : asset.sha256Base64Url;
}

function recoveryMd5(asset: RecoveryAssetBytes): string {
  return asset instanceof Uint8Array ? md5Hex(asset) : asset.md5Hex;
}

function bytesFrom(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return new Uint8Array();
}

function assetPath(
  showId: string,
  snapshotRevisionId: string,
  asset:
    | PersistedDiagrams["embeddedImages"][number]
    | PersistedDiagrams["linkedFolderItems"][number],
): string {
  const prefix = canonicalPrefix(showId, snapshotRevisionId);
  if ("objectId" in asset) {
    return `${prefix}embedded-${asset.objectId}.${extForMime(asset.mimeType)}`;
  }
  return `${prefix}folder-${asset.driveFileId}.${extForMime(asset.mimeType)}`;
}

function snapshotStatus(diagrams: PersistedDiagrams): PersistedDiagrams["snapshot_status"] {
  const unresolved = [...diagrams.embeddedImages, ...diagrams.linkedFolderItems].filter(
    (entry) => !entry.snapshotPath,
  );
  if (unresolved.length === 0) return "complete";
  if (
    unresolved.every(
      (entry) =>
        "recovery_disposition" in entry && entry.recovery_disposition === "restage_required",
    )
  ) {
    return "partial_failure_restage_required";
  }
  return "partial_failure";
}

async function collectVerifiedAssets(
  showId: string,
  diagrams: PersistedDiagrams,
  deps: Pick<AssetRecoveryDeps, "drive">,
): Promise<VerifiedAsset[] | typeof ASSET_RECOVERY_BYTES_EXCEEDED> {
  const unresolvedCount =
    diagrams.embeddedImages.filter((entry) => !entry.snapshotPath).length +
    diagrams.linkedFolderItems.filter((entry) => !entry.snapshotPath).length;

  if (unresolvedCount > MAX_RECOVERY_ENTRIES) {
    return ASSET_RECOVERY_BYTES_EXCEEDED;
  }

  const verified: VerifiedAsset[] = [];
  let totalBytes = 0;
  const acceptBytes = (asset: RecoveryAssetBytes): boolean => {
    const byteLength = recoveryBytes(asset).byteLength;
    if (byteLength > MAX_RECOVERY_SINGLE_BYTES) return false;
    if (totalBytes + byteLength > MAX_RECOVERY_TOTAL_BYTES) return false;
    totalBytes += byteLength;
    return true;
  };
  for (const entry of diagrams.embeddedImages) {
    if (
      entry.snapshotPath ||
      entry.recovery_disposition === "restage_required" ||
      !entry.embeddedFingerprint
    ) {
      continue;
    }

    const bytes = await deps.drive.fetchEmbeddedImageBytes(entry);
    if (bytes && !acceptBytes(bytes)) return ASSET_RECOVERY_BYTES_EXCEEDED;
    if (bytes && recoverySha256(bytes) === entry.embeddedFingerprint) {
      verified.push({
        kind: "embedded",
        id: entry.objectId,
        path: assetPath(showId, diagrams.snapshot_revision_id, entry),
        contentType: entry.mimeType,
        bytes: recoveryBytes(bytes),
      });
    }
  }

  for (const entry of diagrams.linkedFolderItems) {
    if (entry.snapshotPath) continue;
    const bytes = await deps.drive.fetchLinkedRevisionBytes(entry);
    if (bytes && !acceptBytes(bytes)) return ASSET_RECOVERY_BYTES_EXCEEDED;
    if (bytes && recoveryMd5(bytes) === entry.md5Checksum) {
      verified.push({
        kind: "linked",
        id: entry.driveFileId,
        path: assetPath(showId, diagrams.snapshot_revision_id, entry),
        contentType: entry.mimeType,
        bytes: recoveryBytes(bytes),
      });
    }
  }

  return verified;
}

function applyVerifiedAssets(
  diagrams: PersistedDiagrams,
  verified: VerifiedAsset[],
): PersistedDiagrams {
  const paths = new Map(verified.map((asset) => [`${asset.kind}:${asset.id}`, asset.path]));
  const next: PersistedDiagrams = {
    ...diagrams,
    embeddedImages: diagrams.embeddedImages.map((entry) => ({
      ...entry,
      snapshotPath: entry.snapshotPath ?? paths.get(`embedded:${entry.objectId}`) ?? null,
    })),
    linkedFolderItems: diagrams.linkedFolderItems.map((entry) => ({
      ...entry,
      snapshotPath: entry.snapshotPath ?? paths.get(`linked:${entry.driveFileId}`) ?? null,
    })),
  };

  return {
    ...next,
    snapshot_status: snapshotStatus(next),
  };
}

function isConcurrentSyncSkipped(
  result: AssetRecoveryResult | ConcurrentSyncSkipped,
): result is ConcurrentSyncSkipped {
  return "skipped" in result && result.skipped === CONCURRENT_SYNC_SKIPPED;
}

function cooldownActive(cooldown: { lastDriftAt: string; retryCount: number }, now: Date): boolean {
  const lastDrift = Date.parse(cooldown.lastDriftAt);
  if (!Number.isFinite(lastDrift)) return false;
  const seconds = Math.min(60 * 2 ** cooldown.retryCount, 600);
  return now.getTime() < lastDrift + seconds * 1000;
}

export async function assetRecovery(
  showId: string,
  deps: AssetRecoveryDeps,
): Promise<AssetRecoveryResult> {
  const previewShow = await deps.readPreviewShow(showId);
  const previewDiagrams = previewShow ? unwrapDiagrams(previewShow.diagrams) : null;
  if (!previewShow || !previewDiagrams || previewDiagrams.snapshot_status !== "partial_failure") {
    return { outcome: "no_op" };
  }
  const cooldown = await deps.readRecoveryCooldown?.(showId, previewDiagrams.snapshot_revision_id);
  if (cooldown && cooldownActive(cooldown, deps.now?.() ?? new Date())) {
    await deps.upsertAdminAlert?.(showId, ASSET_RECOVERY_DRIFT_COOLDOWN, {
      snapshotRevisionId: previewDiagrams.snapshot_revision_id,
    });
    return { outcome: "drift_cooldown", code: ASSET_RECOVERY_DRIFT_COOLDOWN };
  }

  const verified = await collectVerifiedAssets(showId, previewDiagrams, deps);
  if (verified === ASSET_RECOVERY_BYTES_EXCEEDED) {
    await deps.upsertAdminAlert?.(showId, ASSET_RECOVERY_BYTES_EXCEEDED, {
      snapshotRevisionId: previewDiagrams.snapshot_revision_id,
    });
    return { outcome: "bytes_exceeded", code: ASSET_RECOVERY_BYTES_EXCEEDED };
  }

  const locked = await deps.withShowLock<AssetRecoveryResult>(
    previewShow.driveFileId,
    async (tx) => {
      const lockedShow = await tx.readLockedShow(showId);
      const lockedDiagrams = lockedShow ? unwrapDiagrams(lockedShow.diagrams) : null;
      if (!lockedDiagrams || lockedDiagrams.snapshot_status !== "partial_failure") {
        return { outcome: "no_op" } satisfies AssetRecoveryResult;
      }

      if (lockedDiagrams.snapshot_revision_id !== previewDiagrams.snapshot_revision_id) {
        await tx.upsertRecoveryCooldown(showId, previewDiagrams.snapshot_revision_id);
        await tx.upsertAdminAlert(showId, ASSET_RECOVERY_REVISION_DRIFT, {
          snapshotRevisionId: previewDiagrams.snapshot_revision_id,
          currentSnapshotRevisionId: lockedDiagrams.snapshot_revision_id,
        });
        return {
          outcome: "revision_drift",
          code: ASSET_RECOVERY_REVISION_DRIFT,
          previewRevisionId: previewDiagrams.snapshot_revision_id,
        } satisfies AssetRecoveryResult;
      }

      for (const asset of verified) {
        await deps.storage.upload(asset.path, asset.bytes, { contentType: asset.contentType });
      }

      const recovered = applyVerifiedAssets(lockedDiagrams, verified);
      const updated = await tx.updateRecoveredDiagrams(
        showId,
        recovered,
        previewDiagrams.snapshot_revision_id,
      );
      if (!updated) {
        await tx.upsertRecoveryCooldown(showId, previewDiagrams.snapshot_revision_id);
        await tx.upsertAdminAlert(showId, ASSET_RECOVERY_REVISION_DRIFT, {
          snapshotRevisionId: previewDiagrams.snapshot_revision_id,
        });
        return {
          outcome: "revision_drift",
          code: ASSET_RECOVERY_REVISION_DRIFT,
          previewRevisionId: previewDiagrams.snapshot_revision_id,
        } satisfies AssetRecoveryResult;
      }

      if (recovered.snapshot_status === "partial_failure_restage_required") {
        await tx.upsertAdminAlert(showId, EMBEDDED_RECOVERY_REQUIRES_RESTAGE, {
          snapshotRevisionId: recovered.snapshot_revision_id,
        });
      }

      if (recovered.snapshot_status !== "partial_failure") {
        await tx.deleteRecoveryCooldown(showId, recovered.snapshot_revision_id);
        if (recovered.snapshot_revision_id !== previewDiagrams.snapshot_revision_id) {
          await tx.deleteRecoveryCooldown(showId, previewDiagrams.snapshot_revision_id);
        }
      }

      if (recovered.snapshot_status === "complete") {
        return {
          outcome: "recovered",
          snapshotRevisionId: recovered.snapshot_revision_id,
        } satisfies AssetRecoveryResult;
      }
      if (recovered.snapshot_status === "partial_failure_restage_required") {
        return {
          outcome: "restage_required",
          snapshotRevisionId: recovered.snapshot_revision_id,
        } satisfies AssetRecoveryResult;
      }
      return {
        outcome: "partial_failure",
        snapshotRevisionId: recovered.snapshot_revision_id,
      } satisfies AssetRecoveryResult;
    },
  );

  if (isConcurrentSyncSkipped(locked)) {
    return { outcome: "skipped", code: CONCURRENT_SYNC_SKIPPED };
  }

  return locked;
}

class AssetRecoveryPostgresTx implements AssetRecoveryTx, LockableSyncTx {
  constructor(private readonly tx: PostgresTransaction) {}

  async queryOne<T>(sql: string, params: unknown[]): Promise<T> {
    const rows = await this.tx.unsafe(sql, params as never[]);
    return rows[0] as T;
  }

  async readLockedShow(showId: string): Promise<AssetRecoveryShow | null> {
    const row = await this.queryOne<{
      show_id: string;
      drive_file_id: string;
      diagrams: AssetRecoveryShow["diagrams"];
    } | null>(
      `
        select id::text as show_id, drive_file_id, diagrams
          from public.shows
         where id = $1::uuid
         for update
      `,
      [showId],
    );
    if (!row) return null;
    return { showId: row.show_id, driveFileId: row.drive_file_id, diagrams: row.diagrams };
  }

  async updateRecoveredDiagrams(
    showId: string,
    diagrams: PersistedDiagrams,
    expectedSnapshotRevisionId: string,
  ): Promise<boolean> {
    const rows = await this.tx.unsafe(
      `
        update public.shows
           set diagrams = case
             when diagrams ? 'current' then jsonb_set(diagrams, '{current}', $2::jsonb)
             else $2::jsonb
           end
         where id = $1::uuid
           and coalesce(
             diagrams->'current'->>'snapshot_revision_id',
             diagrams->>'snapshot_revision_id'
           ) = $3
         returning id
      `,
      [showId, JSON.stringify(diagrams), expectedSnapshotRevisionId] as never[],
    );
    return rows.length > 0;
  }

  async upsertRecoveryCooldown(showId: string, previewRevisionId: string): Promise<void> {
    await this.tx.unsafe(
      `
        insert into public.recovery_drift_cooldowns (
          show_id, preview_revision_id, last_drift_at, retry_count
        )
        values ($1::uuid, $2::uuid, now(), 1)
        on conflict (show_id, preview_revision_id)
        do update set last_drift_at = now(),
                      retry_count = public.recovery_drift_cooldowns.retry_count + 1
      `,
      [showId, previewRevisionId] as never[],
    );
  }

  async deleteRecoveryCooldown(showId: string, snapshotRevisionId?: string): Promise<void> {
    await this.tx.unsafe(
      snapshotRevisionId
        ? `
          delete from public.recovery_drift_cooldowns
           where show_id = $1::uuid
             and preview_revision_id = $2::uuid
        `
        : `
          delete from public.recovery_drift_cooldowns
           where show_id = $1::uuid
        `,
      (snapshotRevisionId ? [showId, snapshotRevisionId] : [showId]) as never[],
    );
  }

  async upsertAdminAlert(
    showId: string,
    code: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.tx.unsafe("select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)", [
      showId,
      code,
      JSON.stringify(context ?? {}),
    ] as never[]);
  }
}

async function defaultListRecoverableShows(): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from("shows").select("id,diagrams");
  if (error) throw error;
  return (data ?? [])
    .filter((row) => {
      const diagrams = row.diagrams as AssetRecoveryShow["diagrams"] | null;
      const current = diagrams ? unwrapDiagrams(diagrams) : null;
      return current?.snapshot_status === "partial_failure";
    })
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => Boolean(id));
}

async function defaultReadPreviewShow(showId: string): Promise<AssetRecoveryShow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = (await supabase
    .from("shows")
    .select("id,drive_file_id,diagrams")
    .eq("id", showId)
    .maybeSingle()) as {
    data: { id: string; drive_file_id: string; diagrams: AssetRecoveryShow["diagrams"] } | null;
    error: unknown;
  };
  if (error) throw error;
  if (!data) return null;
  return { showId: data.id, driveFileId: data.drive_file_id, diagrams: data.diagrams };
}

async function defaultReadRecoveryCooldown(
  showId: string,
  snapshotRevisionId: string,
): Promise<{ lastDriftAt: string; retryCount: number } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = (await supabase
    .from("recovery_drift_cooldowns")
    .select("last_drift_at,retry_count")
    .eq("show_id", showId)
    .eq("preview_revision_id", snapshotRevisionId)
    .maybeSingle()) as {
    data: { last_drift_at: string; retry_count: number } | null;
    error: unknown;
  };
  if (error) throw error;
  if (!data) return null;
  return { lastDriftAt: data.last_drift_at, retryCount: data.retry_count };
}

function defaultRecover(showId: string): Promise<AssetRecoveryResult> {
  const storageClient = createSupabaseServiceRoleClient().storage.from("diagram-snapshots");
  const drive = getDriveClient();
  return assetRecovery(showId, {
    readPreviewShow: defaultReadPreviewShow,
    readRecoveryCooldown: defaultReadRecoveryCooldown,
    async withShowLock<R>(driveFileId: string, fn: (tx: AssetRecoveryTx) => Promise<R>) {
      const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
      try {
        return (await sql.begin(async (rawTx) => {
          const tx = new AssetRecoveryPostgresTx(rawTx as unknown as PostgresTransaction);
          return await withShowLock<AssetRecoveryPostgresTx, R>(driveFileId, fn, {
            tx,
            tryOnly: true,
          });
        })) as R | ConcurrentSyncSkipped;
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    storage: {
      async upload(path, bytes, options) {
        const objectPath = path.startsWith("diagram-snapshots/")
          ? path.slice("diagram-snapshots/".length)
          : path;
        const { error } = await storageClient.upload(objectPath, bytes, {
          contentType: options.contentType,
          upsert: true,
        });
        if (error) throw error;
      },
    },
    drive: {
      async fetchEmbeddedImageBytes(entry) {
        if (!entry.contentUrl) return null;
        const token = await getDriveAccessToken();
        const response = await fetch(entry.contentUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || !response.body) return null;
        return await readBoundedWebStream(response.body, MAX_RECOVERY_SINGLE_BYTES);
      },
      async fetchLinkedRevisionBytes(entry) {
        const { data } = await drive.revisions.get(
          {
            fileId: entry.driveFileId,
            revisionId: entry.headRevisionId,
            alt: "media",
          },
          { responseType: "stream" },
        );
        if (data instanceof ReadableStream) {
          return await readBoundedWebStream(data, MAX_RECOVERY_SINGLE_BYTES);
        }
        if (data && typeof data === "object" && "pipe" in data) {
          return await readBoundedNodeStream(
            data as NodeJS.ReadableStream,
            MAX_RECOVERY_SINGLE_BYTES,
          );
        }
        return bytesFrom(data);
      },
    },
    upsertAdminAlert: async (alertShowId, code, context) => {
      await defaultUpsertAdminAlert({
        showId: alertShowId,
        code: code as Parameters<typeof defaultUpsertAdminAlert>[0]["code"],
        context: context ?? {},
      });
    },
  });
}

export async function runAssetRecoveryCron(
  deps: AssetRecoveryCronDeps = {},
): Promise<AssetRecoveryCronResult> {
  const listRecoverableShows = deps.listRecoverableShows ?? defaultListRecoverableShows;
  const recover = deps.recover ?? defaultRecover;
  const processed: AssetRecoveryCronResult["processed"] = [];
  for (const showId of await listRecoverableShows()) {
    processed.push({ showId, result: await recover(showId) });
  }
  return { processed };
}
