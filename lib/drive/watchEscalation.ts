// lib/drive/watchEscalation.ts
//
// Fired-once dev escalation for WATCH_CHANNEL_ORPHANED (spec §3.2.5, §3.3).
// Order is load-bearing: trigger read → due? → guard read → RECHECK → GUARD WRITE →
// SENDS (Sentry → email). Faults abort before anything is consumed.
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { ESCALATION_THRESHOLD } from "@/lib/drive/watchErrors";
import { persistAppEventStrict } from "@/lib/log/persist";
import { sendEmail as defaultSendEmail } from "@/lib/notify/send";
import { baseKey } from "@/lib/notify/idempotencyKey";
import { configValid as defaultConfigValid } from "@/lib/notify/config";
import { getAlertOnSyncProblems as defaultGetPref } from "@/lib/appSettings/getAlertOnSyncProblems";
import { activeRecipients as defaultActiveRecipients } from "@/lib/notify/recipients";
import { escapeHtml } from "@/lib/notify/templates/escapeHtml";

export const ESCALATION_EVENT_SOURCE = "drive.watch.escalation";

export type WatchAlertRow = {
  id: string;
  occurrence_count: number;
  context: Record<string, unknown> | null;
};

// Registered Supabase call boundary (tests/sync/_metaInfraContract.test.ts):
// returns the row, null when no unresolved alert, or "infra_error".
export async function readUnresolvedWatchAlert(): Promise<WatchAlertRow | null | "infra_error"> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("admin_alerts")
      .select("id, occurrence_count, context")
      .eq("code", "WATCH_CHANNEL_ORPHANED")
      .is("show_id", null)
      .is("resolved_at", null)
      .maybeSingle();
    if (error) return "infra_error";
    return (data as WatchAlertRow | null) ?? null;
  } catch {
    return "infra_error";
  }
}

// Registered Supabase call boundary: guard-row existence check.
export async function hasEscalationFired(alertId: string): Promise<boolean | "infra_error"> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_events")
      .select("id")
      .eq("source", ESCALATION_EVENT_SOURCE)
      .eq("context->>alertId", alertId)
      .limit(1);
    if (error) return "infra_error";
    return (data ?? []).length > 0;
  } catch {
    return "infra_error";
  }
}

function emailCopy(folderName: string | null, errorClass: string, errorMessage: string) {
  const name = folderName ?? "your Drive folder";
  const subject = `FXAV: the live-updates connection needs attention (${name})`;
  const text = [
    `The connection that makes sheet edits show up instantly is having trouble for "${name}". It couldn't be set up or renewed.`,
    `Your shows still sync on the normal schedule, so nothing is lost — at worst, edits take a few minutes to appear.`,
    `FXAV retries the connection automatically every hour. An admin can also retry immediately: open the dashboard banner or Settings → Drive connection and use "Retry now".`,
    `Technical detail (for support): ${errorClass}: ${errorMessage}`,
  ].join("\n\n");
  const html = [
    `<p>The connection that makes sheet edits show up instantly is having trouble for "<strong>${escapeHtml(name)}</strong>". It couldn't be set up or renewed.</p>`,
    `<p>Your shows still sync on the normal schedule, so nothing is lost — at worst, edits take a few minutes to appear.</p>`,
    `<p>FXAV retries the connection automatically every hour. An admin can also retry immediately: open the dashboard banner or Settings → Drive connection and use "Retry now".</p>`,
    `<p>Technical detail (for support): <code>${escapeHtml(errorClass)}: ${escapeHtml(errorMessage)}</code></p>`,
  ].join("\n");
  return { subject, text, html };
}

export type EscalationDeps = {
  readUnresolvedWatchAlert?: typeof readUnresolvedWatchAlert;
  hasEscalationFired?: typeof hasEscalationFired;
  persistAppEventStrict?: typeof persistAppEventStrict;
  captureException?: (err: unknown, ctx?: Record<string, unknown>) => void;
  configValid?: typeof defaultConfigValid;
  getAlertOnSyncProblems?: typeof defaultGetPref;
  activeRecipients?: typeof defaultActiveRecipients;
  sendEmail?: typeof defaultSendEmail;
};

export async function maybeEscalateWatchOrphaned(
  input: { folderId: string; folderName: string | null },
  deps: EscalationDeps = {},
): Promise<{ escalated: boolean; faults: string[] }> {
  const faults: string[] = [];
  const readAlert = deps.readUnresolvedWatchAlert ?? readUnresolvedWatchAlert;

  // (i) trigger read
  const alert = await readAlert();
  if (alert === "infra_error") return { escalated: false, faults: ["alert_row_read"] };
  if (alert === null) return { escalated: false, faults: [] };
  const errorClass = String(alert.context?.error_class ?? "drive_api");
  const due = alert.occurrence_count >= ESCALATION_THRESHOLD || errorClass === "config";
  if (!due) return { escalated: false, faults: [] };

  // guard read — fired once per alert-row lifetime (60-day retention window)
  const fired = await (deps.hasEscalationFired ?? hasEscalationFired)(alert.id);
  if (fired === "infra_error") return { escalated: false, faults: ["guard_read"] };
  if (fired) return { escalated: false, faults: [] };

  // (ii) recheck — R5-2/R6-1: abort BEFORE the guard if resolved meanwhile
  const recheck = await readAlert();
  if (recheck === "infra_error") return { escalated: false, faults: ["alert_row_read"] };
  if (recheck === null || recheck.id !== alert.id) return { escalated: false, faults: [] };

  // (iii) guard write — fail-closed for duplication
  const guard = await (deps.persistAppEventStrict ?? persistAppEventStrict)({
    level: "info",
    source: ESCALATION_EVENT_SOURCE,
    message: "watch escalation fired",
    context: {
      alertId: alert.id,
      errorClass,
      occurrenceCount: alert.occurrence_count,
      watchedFolderId: input.folderId,
    },
  });
  if (!guard.ok) return { escalated: false, faults: ["guard_write"] };

  // (iv) sends — Sentry first (never faults), then gated email
  try {
    (deps.captureException ?? Sentry.captureException)(
      new Error("WATCH_CHANNEL_ORPHANED escalated"),
      {
        tags: { errorClass },
        extra: { occurrenceCount: alert.occurrence_count, watchedFolderId: input.folderId },
      },
    );
  } catch {
    // Sentry is a notification channel, not the durable record (spec §3.3).
  }

  // Gate 1 FIRST — configValid (spec §3.3.2): unconfigured email is a deliberate
  // skip, and it must short-circuit BEFORE the pref read so "Resend unset +
  // transient pref fault" never surfaces as a scheduler-visible infra failure.
  if (!(deps.configValid ?? defaultConfigValid)().ok) return { escalated: true, faults };

  // Gate 2 — the alert_on_sync_problems pref; infra_error → fault, never fail-open.
  const pref = await (deps.getAlertOnSyncProblems ?? defaultGetPref)();
  if (pref.kind === "infra_error") return { escalated: true, faults: ["pref_read"] };
  if (!pref.enabled) return { escalated: true, faults };

  const recipients = await (deps.activeRecipients ?? defaultActiveRecipients)();
  if (recipients.kind === "infra_error") return { escalated: true, faults: ["recipients_read"] };

  const errorMessage = String(alert.context?.error_message ?? "(no detail captured)");
  const copy = emailCopy(input.folderName, errorClass, errorMessage);
  let emailFault = false;
  for (const recipient of recipients.recipients) {
    const result = await (deps.sendEmail ?? defaultSendEmail)({
      to: recipient,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
      idempotencyKey: baseKey("watch_escalation", alert.id, recipient),
    });
    if (result.ok === false) emailFault = true; // "retry_later" is benign
  }
  if (emailFault) faults.push("email_send");
  return { escalated: true, faults };
}
