import type { DriveListedFile } from "@/lib/drive/list";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { ARCHIVED_SKIP_REASON } from "@/lib/sync/lifecycleGuards";

export type SyncMode = "cron" | "push" | "manual" | "onboarding_scan";
export type ResolvedSyncMode = SyncMode | "recovery" | "asset_recovery";

export type PerFileProcessorResult =
  | {
      outcome: "skip";
      reason:
        | "deferred_permanent"
        | "deferred_modtime"
        | "watermark"
        | "partial_failure_restage_required"
        | "WEBHOOK_NOOP_ALREADY_SYNCED"
        | "wizard_owned"
        | typeof ARCHIVED_SKIP_REASON;
    }
  | {
      outcome: "proceed";
      mode: ResolvedSyncMode;
    };

export class SyncInfraError extends Error {
  readonly operation: string;
  readonly source: "returned_error" | "thrown_error";
  override readonly cause: unknown;

  constructor(operation: string, source: "returned_error" | "thrown_error", cause: unknown) {
    super(`Sync Supabase ${source.replace("_", " ")} during ${operation}`);
    this.name = "SyncInfraError";
    this.operation = operation;
    this.source = source;
    this.cause = cause;
  }
}

type SyncSupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type DeferredIngestionRow = {
  deferred_kind: "defer_until_modified" | "permanent_ignore";
  deferred_at_modified_time: string | null;
};

type ShowGateRow = {
  last_sync_status: string | null;
  last_seen_modified_time: string | null;
  diagrams: unknown;
  archived: boolean | null;
};

type PendingSyncGateRow = {
  staged_modified_time: string | null;
};

function isAutomaticMode(mode: SyncMode): mode is "cron" | "push" {
  return mode === "cron" || mode === "push";
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAfter(left: string, right: string | null | undefined): boolean {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  if (leftMs === null) return false;
  if (rightMs === null) return true;
  return leftMs > rightMs;
}

function isAtOrBefore(left: string, rightMs: number | null): boolean {
  const leftMs = timestampMs(left);
  if (leftMs === null || rightMs === null) return false;
  return leftMs <= rightMs;
}

function maxTimestampMs(...values: Array<string | null | undefined>): number | null {
  const parsed = values
    .map((value) => timestampMs(value))
    .filter((value): value is number => value !== null);
  if (parsed.length === 0) return null;
  return Math.max(...parsed);
}

function snapshotStatus(diagrams: unknown): string | null {
  if (!diagrams || typeof diagrams !== "object") return null;
  const root = diagrams as { snapshot_status?: unknown; current?: { snapshot_status?: unknown } };
  const status = root.current?.snapshot_status ?? root.snapshot_status;
  return typeof status === "string" ? status : null;
}

function createSyncSupabaseClient(): SyncSupabaseClient {
  try {
    return createSupabaseServiceRoleClient();
  } catch (cause) {
    throw new SyncInfraError("createSupabaseServiceRoleClient", "thrown_error", cause);
  }
}

async function readLiveDeferral(
  supabase: SyncSupabaseClient,
  driveFileId: string,
): Promise<DeferredIngestionRow | null> {
  try {
    const { data, error } = await supabase
      .from("deferred_ingestions")
      .select("deferred_kind, deferred_at_modified_time")
      .eq("drive_file_id", driveFileId)
      .is("wizard_session_id", null)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readLiveDeferral", "returned_error", error);
    }
    return data as DeferredIngestionRow | null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readLiveDeferral", "thrown_error", cause);
  }
}

async function readShowGateRow(
  supabase: SyncSupabaseClient,
  driveFileId: string,
): Promise<ShowGateRow | null> {
  try {
    const { data, error } = await supabase
      .from("shows")
      .select("last_sync_status, last_seen_modified_time, diagrams, archived")
      .eq("drive_file_id", driveFileId)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readShowGateRow", "returned_error", error);
    }
    return data as ShowGateRow | null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readShowGateRow", "thrown_error", cause);
  }
}

async function readLivePendingSyncGateRow(
  supabase: SyncSupabaseClient,
  driveFileId: string,
): Promise<PendingSyncGateRow | null> {
  try {
    const { data, error } = await supabase
      .from("pending_syncs")
      .select("staged_modified_time")
      .eq("drive_file_id", driveFileId)
      .is("wizard_session_id", null)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readLivePendingSyncGateRow", "returned_error", error);
    }
    return data as PendingSyncGateRow | null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readLivePendingSyncGateRow", "thrown_error", cause);
  }
}

type AppSettingsGateRow = {
  pending_wizard_session_id: string | null;
};

// Spec 2026-07-16-cron-wizard-owned-skip §2.1: the gate reads ONLY the session
// pointer. It must never read the session staleness timestamp — staleness
// belongs to the lifecycle (finalize-cas / setup takeover /
// cleanupAbandonedFinalize / reap), never here.
async function readPendingWizardSessionId(supabase: SyncSupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("pending_wizard_session_id")
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readPendingWizardSessionId", "returned_error", error);
    }
    if (!data) {
      // A missing singleton is a corrupted install, not "no session" — failing
      // open here would reopen the wizard-hijack path (spec §2.2).
      throw new SyncInfraError(
        "readPendingWizardSessionId",
        "returned_error",
        new Error("app_settings 'default' row is missing"),
      );
    }
    return (data as AppSettingsGateRow).pending_wizard_session_id ?? null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readPendingWizardSessionId", "thrown_error", cause);
  }
}

async function readWizardPendingSyncOwnership(
  supabase: SyncSupabaseClient,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("pending_syncs")
      .select("drive_file_id")
      .eq("drive_file_id", driveFileId)
      .eq("wizard_session_id", wizardSessionId)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readWizardPendingSyncOwnership", "returned_error", error);
    }
    return data !== null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readWizardPendingSyncOwnership", "thrown_error", cause);
  }
}

async function readWizardPendingIngestionOwnership(
  supabase: SyncSupabaseClient,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("pending_ingestions")
      .select("drive_file_id")
      .eq("drive_file_id", driveFileId)
      .eq("wizard_session_id", wizardSessionId)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readWizardPendingIngestionOwnership", "returned_error", error);
    }
    return data !== null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readWizardPendingIngestionOwnership", "thrown_error", cause);
  }
}

async function readWizardDeferralOwnership(
  supabase: SyncSupabaseClient,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("deferred_ingestions")
      .select("drive_file_id")
      .eq("drive_file_id", driveFileId)
      .eq("wizard_session_id", wizardSessionId)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readWizardDeferralOwnership", "returned_error", error);
    }
    return data !== null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readWizardDeferralOwnership", "thrown_error", cause);
  }
}

export async function perFileProcessor(
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
): Promise<PerFileProcessorResult> {
  if (!isAutomaticMode(mode)) {
    return { outcome: "proceed", mode };
  }

  const supabase = createSyncSupabaseClient();
  const liveDeferral = await readLiveDeferral(supabase, driveFileId);
  if (liveDeferral?.deferred_kind === "permanent_ignore") {
    return { outcome: "skip", reason: "deferred_permanent" };
  }
  if (liveDeferral?.deferred_kind === "defer_until_modified") {
    if (!isAfter(fileMeta.modifiedTime, liveDeferral.deferred_at_modified_time)) {
      return { outcome: "skip", reason: "deferred_modtime" };
    }
  }

  // Wizard-ownership skip (spec 2026-07-16-cron-wizard-owned-skip §2): a file
  // the ACTIVE pending wizard session has in flight (staged preview, wizard
  // hard-fail, or session-scoped deferral) belongs to the wizard until the
  // session releases it. Ordering contract (§2.3): live-deferral skips above
  // keep priority; this returns before the watermark reads so wizard_owned
  // wins over watermark. Probes short-circuit on the first owning arm.
  const pendingWizardSessionId = await readPendingWizardSessionId(supabase);
  if (pendingWizardSessionId !== null) {
    const owned =
      (await readWizardPendingSyncOwnership(supabase, driveFileId, pendingWizardSessionId)) ||
      (await readWizardPendingIngestionOwnership(supabase, driveFileId, pendingWizardSessionId)) ||
      (await readWizardDeferralOwnership(supabase, driveFileId, pendingWizardSessionId));
    if (owned) {
      return { outcome: "skip", reason: "wizard_owned" };
    }
  }

  const [show, pendingSync] = await Promise.all([
    readShowGateRow(supabase, driveFileId),
    readLivePendingSyncGateRow(supabase, driveFileId),
  ]);

  // DEF-4: an archived show is immutable — silent-skip (the caller must NOT write a sync_log row).
  if (show?.archived) {
    return { outcome: "skip", reason: ARCHIVED_SKIP_REASON };
  }
  const effectiveWatermark = maxTimestampMs(
    show?.last_seen_modified_time,
    pendingSync?.staged_modified_time,
  );

  if (show?.last_sync_status === "sheet_unavailable") {
    return { outcome: "proceed", mode: "recovery" };
  }

  const status = snapshotStatus(show?.diagrams);
  if (status === "partial_failure" && isAtOrBefore(fileMeta.modifiedTime, effectiveWatermark)) {
    return { outcome: "proceed", mode: "asset_recovery" };
  }
  if (
    status === "partial_failure_restage_required" &&
    isAtOrBefore(fileMeta.modifiedTime, effectiveWatermark)
  ) {
    return { outcome: "skip", reason: "partial_failure_restage_required" };
  }

  if (isAtOrBefore(fileMeta.modifiedTime, effectiveWatermark)) {
    return {
      outcome: "skip",
      reason: mode === "push" ? "WEBHOOK_NOOP_ALREADY_SYNCED" : "watermark",
    };
  }

  return { outcome: "proceed", mode };
}
