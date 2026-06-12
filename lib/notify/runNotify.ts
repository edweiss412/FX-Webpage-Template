import { getAlertOnAutoPublish } from "@/lib/appSettings/getAlertOnAutoPublish";
import { getAlertOnSyncProblems } from "@/lib/appSettings/getAlertOnSyncProblems";
import { getDailyReviewDigest } from "@/lib/appSettings/getDailyReviewDigest";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { configValid } from "@/lib/notify/config";
import { DIGEST_RETRY_WINDOW_HOURS, DIGEST_TIMEZONE } from "@/lib/notify/constants";
import { buildDigestModel } from "@/lib/notify/digest";
import { listRealtimeCandidates } from "@/lib/notify/detect/candidates";
import { reconcileEmailDeliveryState } from "@/lib/notify/detect/emailDeliveryFailed";
import {
  resolveRecoveredSyncProblemAlert,
  type SyncProblemAlertForRecovery,
} from "@/lib/notify/detect/recoveryResolution";
import { detectAndResolveStall, type MaintenanceResult } from "@/lib/notify/detect/stall";
import {
  deliverDigest,
  deliverRealtimeCandidates,
  type DeliveryResult,
} from "@/lib/notify/deliver";
import { activeRecipients } from "@/lib/notify/recipients";

type ToggleResult = { kind: "value"; enabled: boolean } | { kind: "infra_error" };
type ConfigResult = { ok: true; origin: string } | { ok: false };
type RecipientsResult = { kind: "ok"; recipients: string[] } | { kind: "infra_error" };
type RealtimeCandidatesResult = Awaited<ReturnType<typeof listRealtimeCandidates>>;
type DigestModelResult = Awaited<ReturnType<typeof buildDigestModel>>;
type EmailDeliveryStateResult = Awaited<ReturnType<typeof reconcileEmailDeliveryState>>;

export type MaintenanceStep = "stall" | "recovery" | "emailDelivery";

/**
 * M12.13 §4.2 R27/R28 — `toggleFaults` is the typed record of per-kind toggle
 * getter infra faults (entries name the faulted getter, e.g.
 * "getAlertOnAutoPublish"). A non-empty list ANYWHERE (delivery summary OR a
 * maintenance step result) means candidates/reconciliation for that kind were
 * dropped fail-closed, and the cron route's `statusFor` surfaces 5xx so the
 * scheduler sees the degradation. Deliberate toggle-OFF skips never carry it.
 */
export type MaintenanceStepResult = {
  step: MaintenanceStep;
  result: (MaintenanceResult | EmailDeliveryStateResult) & {
    toggleFaults?: string[];
    detail?: unknown;
  };
};

export type DeliverySummary =
  | { kind: "skipped"; reason: string; toggleFaults?: string[] }
  | { kind: "ok"; sent: number; detail?: unknown; toggleFaults?: string[] }
  | { kind: "infra_error"; source: string; toggleFaults?: string[] };

export type NotifyRunResult = {
  kind: "ok";
  maintenance: MaintenanceStepResult[];
  delivery: DeliverySummary;
};

export type NotifyDeps = {
  runMaintenance?: () => Promise<MaintenanceStepResult[]>;
  configValid?: () => ConfigResult;
  getAlertOnSyncProblems?: () => Promise<ToggleResult>;
  getAlertOnAutoPublish?: () => Promise<ToggleResult>;
  getDailyReviewDigest?: () => Promise<ToggleResult>;
  activeRecipients?: () => Promise<RecipientsResult>;
  listRealtimeCandidates?: () => Promise<RealtimeCandidatesResult>;
  deliverRealtimeCandidates?: typeof deliverRealtimeCandidates;
  buildDigestModel?: typeof buildDigestModel;
  deliverDigest?: typeof deliverDigest;
};

export type MaintenanceDeps = {
  readHeartbeat?: () => Promise<{ kind: "ok"; heartbeat: Date | null } | { kind: "infra_error" }>;
  detectAndResolveStall?: typeof detectAndResolveStall;
  resolveRecoveredSyncProblems?: () => Promise<MaintenanceResult>;
  reconcileEmailDeliveryState?: typeof reconcileEmailDeliveryState;
  getAlertOnSyncProblems?: () => Promise<ToggleResult>;
  getDailyReviewDigest?: () => Promise<ToggleResult>;
  configValid?: () => ConfigResult;
  now?: Date;
};

async function readHeartbeat(): Promise<
  { kind: "ok"; heartbeat: Date | null } | { kind: "infra_error" }
> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("sync_cron_heartbeat_at")
      .eq("id", "default")
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    const raw = (data as { sync_cron_heartbeat_at?: string | null } | null)?.sync_cron_heartbeat_at;
    return { kind: "ok", heartbeat: raw ? new Date(raw) : null };
  } catch {
    return { kind: "infra_error" };
  }
}

async function resolveRecoveredSyncProblems(): Promise<MaintenanceResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("admin_alerts")
      .select("id, show_id, code")
      .is("resolved_at", null)
      .not("show_id", "is", null)
      .in("code", ["DRIVE_FETCH_FAILED", "PARSE_ERROR_LAST_GOOD", "SHEET_UNAVAILABLE"]);
    if (error) return { kind: "infra_error" };
    for (const row of data ?? []) {
      const alert = row as {
        id: string;
        show_id: string;
        code: SyncProblemAlertForRecovery["code"];
      };
      const result = await resolveRecoveredSyncProblemAlert({
        alertId: alert.id,
        showId: alert.show_id,
        code: alert.code,
      });
      if (result.kind === "infra_error") return { kind: "infra_error" };
    }
    return { kind: "ok" };
  } catch {
    return { kind: "infra_error" };
  }
}

function localHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: DIGEST_TIMEZONE,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? "0");
}

async function safeMaintenance(deps?: NotifyDeps): Promise<MaintenanceStepResult[]> {
  try {
    return await (deps?.runMaintenance ?? (() => runMaintenance()))();
  } catch {
    return [{ step: "stall", result: { kind: "infra_error" } }];
  }
}

export async function runMaintenance(deps: MaintenanceDeps = {}): Promise<MaintenanceStepResult[]> {
  const out: MaintenanceStepResult[] = [];
  const now = deps.now ?? new Date();
  let heartbeat: Awaited<ReturnType<NonNullable<MaintenanceDeps["readHeartbeat"]>>>;
  try {
    heartbeat = await (deps.readHeartbeat ?? readHeartbeat)();
  } catch {
    heartbeat = { kind: "infra_error" };
  }
  if (heartbeat.kind === "infra_error") {
    out.push({ step: "stall", result: { kind: "infra_error" } });
  } else {
    let stall: MaintenanceResult;
    try {
      stall = await (deps.detectAndResolveStall ?? detectAndResolveStall)(heartbeat.heartbeat, now);
    } catch {
      stall = { kind: "infra_error" };
    }
    out.push({ step: "stall", result: stall });
  }

  let recovery: MaintenanceResult;
  try {
    recovery = await (deps.resolveRecoveredSyncProblems ?? resolveRecoveredSyncProblems)();
  } catch {
    recovery = { kind: "infra_error" };
  }
  out.push({ step: "recovery", result: recovery });

  const [alertToggle, digestToggle] = await Promise.all([
    (deps.getAlertOnSyncProblems ?? getAlertOnSyncProblems)().catch(() => ({
      kind: "infra_error" as const,
    })),
    (deps.getDailyReviewDigest ?? getDailyReviewDigest)().catch(() => ({
      kind: "infra_error" as const,
    })),
  ]);
  const email =
    alertToggle.kind === "infra_error" || digestToggle.kind === "infra_error"
      ? { kind: "infra_error" as const }
      : await (deps.reconcileEmailDeliveryState ?? reconcileEmailDeliveryState)({
          alertOnSyncProblems: alertToggle.enabled,
          dailyReviewDigest: digestToggle.enabled,
          configValid: (deps.configValid ?? configValid)().ok,
          now,
        }).catch(() => ({ kind: "infra_error" as const }));
  out.push({ step: "emailDelivery", result: email });
  return out;
}

export async function runRealtimeNotify(
  input: { deps?: NotifyDeps } = {},
): Promise<NotifyRunResult> {
  try {
    const deps = input.deps ?? {};
    const maintenance = await safeMaintenance(deps);
    const config = (deps.configValid ?? configValid)();
    if (!config.ok)
      return { kind: "ok", maintenance, delivery: { kind: "skipped", reason: "config_invalid" } };

    // M12.13 §4.2 — fetch BOTH realtime toggles; each getter's infra fault is
    // handled independently (never failing the OTHER kind open or closed).
    // kind→gate: show/global/ingestion ← alert_on_sync_problems;
    // auto_publish_undo ← alert_on_auto_publish (bearer emails fail CLOSED on
    // an unreadable governing preference).
    const [syncToggle, undoToggle] = await Promise.all([
      (deps.getAlertOnSyncProblems ?? getAlertOnSyncProblems)().catch(
        () => ({ kind: "infra_error" }) as const,
      ),
      (deps.getAlertOnAutoPublish ?? getAlertOnAutoPublish)().catch(
        () => ({ kind: "infra_error" }) as const,
      ),
    ]);
    const toggleFaults: string[] = [];
    if (syncToggle.kind === "infra_error") toggleFaults.push("getAlertOnSyncProblems");
    if (undoToggle.kind === "infra_error") toggleFaults.push("getAlertOnAutoPublish");
    const withFaults = (delivery: DeliverySummary): DeliverySummary =>
      toggleFaults.length > 0 ? { ...delivery, toggleFaults } : delivery;

    const syncEnabled = syncToggle.kind === "value" && syncToggle.enabled;
    const undoEnabled = undoToggle.kind === "value" && undoToggle.enabled;

    if (!syncEnabled && !undoEnabled) {
      // No kind can deliver. Faults stay 5xx-visible (R27); a pure both-OFF
      // is a deliberate combined skip (200).
      if (toggleFaults.length > 0) {
        return {
          kind: "ok",
          maintenance,
          delivery: { kind: "infra_error", source: toggleFaults.join("+"), toggleFaults },
        };
      }
      return {
        kind: "ok",
        maintenance,
        delivery: {
          kind: "skipped",
          reason: "alert_on_sync_problems_off+alert_on_auto_publish_off",
        },
      };
    }

    const recipients = await (deps.activeRecipients ?? activeRecipients)();
    if (recipients.kind === "infra_error") {
      return {
        kind: "ok",
        maintenance,
        delivery: withFaults({ kind: "infra_error", source: "activeRecipients" }),
      };
    }
    const candidates = await (deps.listRealtimeCandidates ?? listRealtimeCandidates)();
    if (candidates.kind === "infra_error") {
      return {
        kind: "ok",
        maintenance,
        delivery: withFaults({ kind: "infra_error", source: "listRealtimeCandidates" }),
      };
    }

    const isUndoKind = (candidate: { kind: string }) => candidate.kind === "auto_publish_undo";
    const kept = candidates.candidates.filter((candidate) =>
      isUndoKind(candidate) ? undoEnabled : syncEnabled,
    );
    if (recipients.recipients.length === 0 || kept.length === 0) {
      // The existing sync skip reason fires ONLY when sync candidates were
      // the ones deliberately dropped and nothing remained (§4.2); the undo
      // mirror likewise. Fault-only drops are NOT skips — they surface as an
      // ok-with-toggleFaults result (5xx via statusFor).
      const syncDroppedByOff =
        syncToggle.kind === "value" &&
        !syncToggle.enabled &&
        candidates.candidates.some((candidate) => !isUndoKind(candidate));
      const undoDroppedByOff =
        undoToggle.kind === "value" &&
        !undoToggle.enabled &&
        candidates.candidates.some(isUndoKind);
      if (kept.length === 0 && syncDroppedByOff) {
        return {
          kind: "ok",
          maintenance,
          delivery: withFaults({ kind: "skipped", reason: "alert_on_sync_problems_off" }),
        };
      }
      if (kept.length === 0 && undoDroppedByOff) {
        return {
          kind: "ok",
          maintenance,
          delivery: withFaults({ kind: "skipped", reason: "alert_on_auto_publish_off" }),
        };
      }
      return { kind: "ok", maintenance, delivery: withFaults({ kind: "ok", sent: 0 }) };
    }
    const delivery: DeliveryResult = await (
      deps.deliverRealtimeCandidates ?? deliverRealtimeCandidates
    )({
      candidates: kept,
      recipients: recipients.recipients,
      origin: config.origin,
    });
    if (delivery.kind === "infra_error") {
      return {
        kind: "ok",
        maintenance,
        delivery: withFaults({ kind: "infra_error", source: "deliverRealtimeCandidates" }),
      };
    }
    return {
      kind: "ok",
      maintenance,
      delivery: withFaults({ kind: "ok", sent: delivery.sent, detail: delivery }),
    };
  } catch {
    return {
      kind: "ok",
      maintenance: [],
      delivery: { kind: "infra_error", source: "runRealtimeNotify" },
    };
  }
}

export async function runDigestNotify(
  input: { now?: Date; deps?: NotifyDeps } = {},
): Promise<NotifyRunResult> {
  try {
    const deps = input.deps ?? {};
    const now = input.now ?? new Date();
    const maintenance = await safeMaintenance(deps);
    const hour = localHour(now);
    if (hour < 7 || hour >= 7 + DIGEST_RETRY_WINDOW_HOURS) {
      return {
        kind: "ok",
        maintenance,
        delivery: { kind: "skipped", reason: "outside_digest_window" },
      };
    }

    const config = (deps.configValid ?? configValid)();
    if (!config.ok)
      return { kind: "ok", maintenance, delivery: { kind: "skipped", reason: "config_invalid" } };

    const toggle = await (deps.getDailyReviewDigest ?? getDailyReviewDigest)();
    if (toggle.kind === "infra_error") {
      return {
        kind: "ok",
        maintenance,
        delivery: { kind: "infra_error", source: "getDailyReviewDigest" },
      };
    }
    if (!toggle.enabled) {
      return {
        kind: "ok",
        maintenance,
        delivery: { kind: "skipped", reason: "daily_review_digest_off" },
      };
    }

    const recipients = await (deps.activeRecipients ?? activeRecipients)();
    if (recipients.kind === "infra_error") {
      return {
        kind: "ok",
        maintenance,
        delivery: { kind: "infra_error", source: "activeRecipients" },
      };
    }
    let sent = 0;
    for (const recipient of recipients.recipients) {
      const model: DigestModelResult = await (deps.buildDigestModel ?? buildDigestModel)(
        recipient,
        now,
      );
      if (model.kind === "infra_error") {
        return {
          kind: "ok",
          maintenance,
          delivery: { kind: "infra_error", source: "buildDigestModel" },
        };
      }
      if (model.kind === "no_send") continue;
      const delivered = await (deps.deliverDigest ?? deliverDigest)({
        model: model.model,
        origin: config.origin,
      });
      if (delivered.kind === "infra_error") {
        return {
          kind: "ok",
          maintenance,
          delivery: { kind: "infra_error", source: "deliverDigest" },
        };
      }
      sent += delivered.sent;
    }
    return { kind: "ok", maintenance, delivery: { kind: "ok", sent } };
  } catch {
    return {
      kind: "ok",
      maintenance: [],
      delivery: { kind: "infra_error", source: "runDigestNotify" },
    };
  }
}
