import postgres from "postgres";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { canonicalize } from "@/lib/email/canonicalize";
import { SEND_RETRY_CAP } from "@/lib/notify/constants";
import type { RealtimeCandidate } from "@/lib/notify/detect/candidates";
import type { DigestModel } from "@/lib/notify/digest";
import { baseKey, reissueKey } from "@/lib/notify/idempotencyKey";
import { sendEmail, type SendArgs, type SendResult } from "@/lib/notify/send";
import { renderAutoPublishUndo } from "@/lib/notify/templates/autoPublishUndo";
import { renderDigest } from "@/lib/notify/templates/digest";
import { renderRealtimeProblem } from "@/lib/notify/templates/realtimeProblem";

export type DeliverySql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

export type DeliveryResult =
  | { kind: "ok"; sent: number; failed: number; skipped: number; retryLater: number }
  | { kind: "infra_error" };

type DeliveryInput = {
  candidates: RealtimeCandidate[];
  recipients: string[];
  origin: string;
};

type LedgerRow = { status: "sent" | "failed"; attempt_count: number };
type DeliveryKind = "realtime_problem" | "digest" | "auto_publish_undo";
type DeliveryCounts = { sent: number; failed: number; skipped: number; retryLater: number };

type EmailContent = Pick<SendArgs, "subject" | "html" | "text">;
/**
 * Per-recipient rendering seam (M12.13 spec §4.3 R17): `auto_publish_undo`
 * emails carry a recipient-bound capability `r`, so their bodies CANNOT be
 * rendered once per candidate — the union forces callers to choose, and the
 * per-recipient arm renders inside `deliverOneRecipient` AFTER recipient
 * canonicalization + active-recipient validation. Other kinds keep
 * candidate-level rendering via the `static` arm.
 */
type EmailSource =
  | { mode: "static"; content: EmailContent }
  | { mode: "per-recipient"; render: (canonicalRecipient: string) => EmailContent };

type DeliveryDeps = {
  sql?: DeliverySql;
  sendEmail?: (args: SendArgs) => Promise<SendResult>;
  upsertAdminAlert?: typeof upsertAdminAlert;
  now?: () => Date;
  reissueKey?: (kind: string, dedupKey: string, recipient: string) => string;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("delivery loop requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function epochFromDedupKey(dedupKey: string): string {
  return dedupKey.split(":").at(-1) ?? "";
}

function showIdFor(candidate: RealtimeCandidate): string | null {
  if (candidate.kind === "show" || candidate.kind === "auto_publish_undo") return candidate.showId;
  return null;
}

function triggeredCode(candidate: RealtimeCandidate): string {
  if (candidate.kind === "show") return candidate.code;
  if (candidate.kind === "global") return "SYNC_STALLED";
  if (candidate.kind === "auto_publish_undo") return "SHOW_FIRST_PUBLISHED";
  return candidate.lastErrorCode;
}

function contextFor(candidate: RealtimeCandidate): Record<string, unknown> {
  if (candidate.kind === "show") {
    return {
      alert_id: candidate.alertId,
      show_id: candidate.showId,
      code: candidate.code,
      dedup_key: candidate.dedupKey,
    };
  }
  if (candidate.kind === "global") {
    return { alert_id: candidate.alertId, code: "SYNC_STALLED", dedup_key: candidate.dedupKey };
  }
  if (candidate.kind === "auto_publish_undo") {
    // §4.3 R14 context recipe — EXACTLY these four fields. mintId is the
    // one-way mint identity reconciliation keys on; the raw bearer token never
    // enters the row (it lives only in the rendered per-recipient email link).
    return {
      slug: candidate.slug,
      title: candidate.showTitle,
      expires_at: candidate.expiresAt.toISOString(),
      mintId: candidate.mintId,
    };
  }
  return {
    drive_file_id: candidate.driveFileId,
    drive_file_name: candidate.driveFileName,
    code: candidate.lastErrorCode,
    dedup_key: candidate.dedupKey,
  };
}

async function isCandidateCurrent(
  candidate: RealtimeCandidate,
  sql: DeliverySql,
): Promise<boolean> {
  const epoch = epochFromDedupKey(candidate.dedupKey);
  if (candidate.kind === "show") {
    const rows = await sql`
      select 1
        from public.admin_alerts a
        join public.shows s on s.id = a.show_id
       where a.id = ${candidate.alertId}::uuid
         and a.show_id = ${candidate.showId}::uuid
         and a.code = ${candidate.code}
         and a.resolved_at is null
         and floor(extract(epoch from a.raised_at) * 1e6)::bigint = ${epoch}::bigint
         and s.published is true
         and s.archived is false
       limit 1
    `;
    return rows.length > 0;
  }
  if (candidate.kind === "global") {
    const rows = await sql`
      select 1
        from public.admin_alerts a
       where a.id = ${candidate.alertId}::uuid
         and a.show_id is null
         and a.code = 'SYNC_STALLED'
         and a.resolved_at is null
         and floor(extract(epoch from a.raised_at) * 1e6)::bigint = ${epoch}::bigint
       limit 1
    `;
    return rows.length > 0;
  }
  if (candidate.kind === "auto_publish_undo") {
    // Deliver-time currentness guard (M12.13 spec §4.3): re-read the show and
    // require the SAME token (full equality — the in-memory candidate still
    // carries it), the SAME expires_at (ms precision: the candidate's Date came
    // through the JS boundary, and the mint sites write JS-ms timestamps),
    // unexpired, published, not archived. Otherwise the token was consumed via
    // an in-app undo, expired, or re-minted between detection and this
    // recipient's send → SKIP (no send, no row); a re-mint produces its own
    // candidate next tick.
    const rows = await sql`
      select 1
        from public.shows s
       where s.id = ${candidate.showId}::uuid
         and s.unpublish_token::text = ${candidate.token}
         and floor(extract(epoch from s.unpublish_token_expires_at) * 1000)::bigint = ${candidate.expiresAt.getTime()}::bigint
         and s.unpublish_token_expires_at > now()
         and s.published is true
         and s.archived is false
       limit 1
    `;
    return rows.length > 0;
  }
  const rows = await sql`
    select 1
      from public.pending_ingestions
     where drive_file_id = ${candidate.driveFileId}
       and wizard_session_id is null
       and floor(extract(epoch from first_seen_at) * 1e6)::bigint = ${epoch}::bigint
     limit 1
  `;
  return rows.length > 0;
}

async function existingLedger(
  sql: DeliverySql,
  kind: DeliveryKind,
  dedupKey: string,
  recipient: string,
): Promise<LedgerRow | null> {
  const rows = await sql<LedgerRow>`
    select status, attempt_count
      from public.email_deliveries
     where kind = ${kind}
       and dedup_key = ${dedupKey}
       and recipient = ${recipient}
     limit 1
  `;
  return rows[0] ?? null;
}

async function isRecipientActive(sql: DeliverySql, recipient: string): Promise<boolean> {
  const rows = await sql`
    select 1
      from public.admin_emails
     where email = ${recipient}
       and revoked_at is null
     limit 1
  `;
  return rows.length > 0;
}

async function upsertSent(
  sql: DeliverySql,
  input: {
    kind: DeliveryKind;
    dedupKey: string;
    showId: string | null;
    triggeredCodes: string[];
    context: Record<string, unknown>;
  },
  recipient: string,
  messageId: string,
  now: Date,
): Promise<void> {
  // Raw object, NOT JSON.stringify: postgres.js serializes a `::jsonb` param
  // itself; a pre-stringified value double-encodes into a jsonb string scalar.
  const context = input.context;
  await sql`
    insert into public.email_deliveries (
      kind, channel, dedup_key, show_id, recipient, triggered_codes, context,
      status, provider_message_id, error, attempt_count, sent_at
    )
    values (
      ${input.kind}, 'email', ${input.dedupKey}, ${input.showId}::uuid,
      ${recipient}, ${input.triggeredCodes}::text[], ${context}::jsonb,
      'sent', ${messageId}, null, 0, ${now.toISOString()}::timestamptz
    )
    on conflict (kind, dedup_key, recipient) do update
      set status = 'sent',
          provider_message_id = excluded.provider_message_id,
          error = null,
          sent_at = excluded.sent_at,
          -- Self-repair (Codex adversarial R1): a row written by the old
          -- double-encoding code during the migration→deploy skew window
          -- holds a jsonb string scalar; refresh context from the candidate
          -- so the corruption cannot survive a later status flip.
          context = excluded.context
    returning id
  `;
}

async function upsertFailed(
  sql: DeliverySql,
  input: {
    kind: DeliveryKind;
    dedupKey: string;
    showId: string | null;
    triggeredCodes: string[];
    context: Record<string, unknown>;
  },
  recipient: string,
  error: string,
): Promise<boolean> {
  // Raw object, NOT JSON.stringify — see upsertSent.
  const context = input.context;
  const rows = await sql`
    insert into public.email_deliveries (
      kind, channel, dedup_key, show_id, recipient, triggered_codes, context,
      status, provider_message_id, error, attempt_count
    )
    values (
      ${input.kind}, 'email', ${input.dedupKey}, ${input.showId}::uuid,
      ${recipient}, ${input.triggeredCodes}::text[], ${context}::jsonb,
      'failed', null, ${error}, 1
    )
    on conflict (kind, dedup_key, recipient) do update
      set status = 'failed',
          error = excluded.error,
          attempt_count = public.email_deliveries.attempt_count + 1,
          -- Self-repair on retry — see upsertSent's conflict branch.
          context = excluded.context
      where public.email_deliveries.status <> 'sent'
    returning id
  `;
  return rows.length > 0;
}

function rendered(candidate: RealtimeCandidate, origin: string) {
  if (candidate.kind === "show") {
    return renderRealtimeProblem({
      kind: "show",
      origin,
      slug: candidate.slug,
      showTitle: candidate.showTitle,
      code: candidate.code,
      contextSheetName: candidate.contextSheetName,
    });
  }
  if (candidate.kind === "global") return renderRealtimeProblem({ kind: "global", origin });
  if (candidate.kind === "ingestion") {
    return renderRealtimeProblem({
      kind: "ingestion",
      origin,
      driveFileName: candidate.driveFileName,
      lastErrorCode: candidate.lastErrorCode,
    });
  }
  // auto_publish_undo is NEVER rendered candidate-level: its body carries a
  // recipient-bound r, so the live loop routes it through the per-recipient
  // EmailSource arm instead (spec §4.3 R17). Reaching here is a programmer error.
  throw new Error("auto_publish_undo rendering is per-recipient; not reachable here");
}

async function deliverOneRecipient(input: {
  sql: DeliverySql;
  send: (args: SendArgs) => Promise<SendResult>;
  alert: typeof upsertAdminAlert;
  clock: () => Date;
  makeReissueKey: (kind: string, dedupKey: string, recipient: string) => string;
  kind: DeliveryKind;
  dedupKey: string;
  showId: string | null;
  triggeredCodes: string[];
  context: Record<string, unknown>;
  email: EmailSource;
  rawRecipient: string;
  counts: DeliveryCounts;
}): Promise<void> {
  const recipient = canonicalize(input.rawRecipient);
  if (!recipient) {
    input.counts.skipped += 1;
    return;
  }

  const ledger = await existingLedger(input.sql, input.kind, input.dedupKey, recipient);
  if (
    ledger?.status === "sent" ||
    (ledger?.status === "failed" && ledger.attempt_count >= SEND_RETRY_CAP)
  ) {
    input.counts.skipped += 1;
    return;
  }

  const active = await isRecipientActive(input.sql, recipient);
  if (!active) {
    input.counts.skipped += 1;
    return;
  }

  // Per-recipient rendering happens HERE — after canonicalization and the
  // active-recipient check — so the bound r derives from the canonical email
  // and no token-bearing body is ever rendered for a revoked recipient (R17).
  const email =
    input.email.mode === "per-recipient" ? input.email.render(recipient) : input.email.content;

  const first = await input.send({
    ...email,
    to: recipient,
    idempotencyKey: baseKey(input.kind, input.dedupKey, recipient),
  });
  const outcome =
    first.ok === false && first.kind === "idempotency_conflict"
      ? await input.send({
          ...email,
          to: recipient,
          idempotencyKey: input.makeReissueKey(input.kind, input.dedupKey, recipient),
        })
      : first;

  if (outcome.ok === true) {
    await upsertSent(input.sql, input, recipient, outcome.messageId, input.clock());
    input.counts.sent += 1;
    return;
  }
  if (outcome.ok === "retry_later" || outcome.kind === "idempotency_conflict") {
    input.counts.retryLater += 1;
    return;
  }

  const failedLedgerWritten = await upsertFailed(input.sql, input, recipient, outcome.message);
  if (!failedLedgerWritten) {
    input.counts.skipped += 1;
    return;
  }
  await input.alert({
    showId: input.showId,
    code: "EMAIL_DELIVERY_FAILED",
    context: input.context,
  });
  input.counts.failed += 1;
}

export async function deliverRealtimeCandidates(
  input: DeliveryInput,
  deps: DeliveryDeps = {},
): Promise<DeliveryResult> {
  const sql =
    deps.sql ??
    (postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      prepare: false,
    }) as DeliverySql);
  const ownsConnection = !deps.sql;
  const send = deps.sendEmail ?? sendEmail;
  const alert = deps.upsertAdminAlert ?? upsertAdminAlert;
  const clock = deps.now ?? (() => new Date());
  const makeReissueKey = deps.reissueKey ?? reissueKey;
  const counts = { sent: 0, failed: 0, skipped: 0, retryLater: 0 };

  try {
    for (const candidate of input.candidates) {
      for (const rawRecipient of input.recipients) {
        const current = await isCandidateCurrent(candidate, sql);
        if (!current) {
          counts.skipped += 1;
          continue;
        }

        await deliverOneRecipient({
          sql,
          send,
          alert,
          clock,
          makeReissueKey,
          kind: candidate.kind === "auto_publish_undo" ? "auto_publish_undo" : "realtime_problem",
          dedupKey: candidate.dedupKey,
          showId: showIdFor(candidate),
          triggeredCodes: [triggeredCode(candidate)],
          context: contextFor(candidate),
          email:
            candidate.kind === "auto_publish_undo"
              ? {
                  mode: "per-recipient",
                  render: (canonicalRecipient) =>
                    renderAutoPublishUndo({
                      origin: input.origin,
                      slug: candidate.slug,
                      showTitle: candidate.showTitle,
                      showId: candidate.showId,
                      token: candidate.token,
                      mintId: candidate.mintId,
                      expiresAt: candidate.expiresAt,
                      recipient: canonicalRecipient,
                      now: clock(),
                    }),
                }
              : { mode: "static", content: rendered(candidate, input.origin) },
          rawRecipient,
          counts,
        });
      }
    }

    return { kind: "ok", ...counts };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) {
      await sql.end?.({ timeout: 5 });
    }
  }
}

export async function deliverDigest(
  input: { model: DigestModel; origin: string },
  deps: DeliveryDeps = {},
): Promise<DeliveryResult> {
  const sql =
    deps.sql ??
    (postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      prepare: false,
    }) as DeliverySql);
  const ownsConnection = !deps.sql;
  const send = deps.sendEmail ?? sendEmail;
  const alert = deps.upsertAdminAlert ?? upsertAdminAlert;
  const clock = deps.now ?? (() => new Date());
  const makeReissueKey = deps.reissueKey ?? reissueKey;
  const counts = { sent: 0, failed: 0, skipped: 0, retryLater: 0 };
  const dedupKey = `digest:${input.model.dateET}`;

  try {
    await deliverOneRecipient({
      sql,
      send,
      alert,
      clock,
      makeReissueKey,
      kind: "digest",
      dedupKey,
      showId: null,
      triggeredCodes: [],
      context: {
        date_et: input.model.dateET,
        source_totals: input.model.sourceTotals,
      },
      email: {
        mode: "static",
        content: renderDigest({ origin: input.origin, shows: input.model.shows }),
      },
      rawRecipient: input.model.recipient,
      counts,
    });

    return { kind: "ok", ...counts };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) {
      await sql.end?.({ timeout: 5 });
    }
  }
}
