import postgres from "postgres";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { canonicalize } from "@/lib/email/canonicalize";
import { SEND_RETRY_CAP } from "@/lib/notify/constants";
import type { RealtimeCandidate } from "@/lib/notify/detect/candidates";
import type { DigestModel } from "@/lib/notify/digest";
import type { MonitorDigestModel } from "@/lib/notify/monitorDigest";
import { baseKey, combinedDedupKey, reissueKey } from "@/lib/notify/idempotencyKey";
import { sendEmail, type SendArgs, type SendResult } from "@/lib/notify/send";
import { renderAutoPublishUndoBatch } from "@/lib/notify/templates/autoPublishUndo";
import { renderDigest } from "@/lib/notify/templates/digest";
import {
  renderRealtimeProblemBatch,
  type RealtimeInput,
} from "@/lib/notify/templates/realtimeProblem";

export type DeliverySql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

export type DeliveryResult =
  | {
      kind: "ok";
      sent: number;
      failed: number;
      skipped: number;
      retryLater: number;
      /** Present ONLY when the single-flight guard was contended (spec §2.1b). */
      lockSkipped?: boolean;
    }
  | { kind: "infra_error" };

/** Dedicated single-flight lock client (spec §2.1b) — transaction-scoped so the
 * advisory lock is backend-pinned under every pooling mode. */
export type LockClient = {
  begin: <T>(fn: (sql: DeliverySql) => Promise<T>) => Promise<T>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

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
  lockSql?: LockClient;
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

type BatchGroup = "published" | "sync_problems" | "stuck_files";
const GROUP_ORDER: readonly BatchGroup[] = ["published", "sync_problems", "stuck_files"];

function groupFor(candidate: RealtimeCandidate): BatchGroup {
  if (candidate.kind === "auto_publish_undo") return "published";
  if (candidate.kind === "ingestion") return "stuck_files";
  return "sync_problems";
}

function kindFor(candidate: RealtimeCandidate): DeliveryKind {
  return candidate.kind === "auto_publish_undo" ? "auto_publish_undo" : "realtime_problem";
}

function toRealtimeInput(candidate: RealtimeCandidate, origin: string): RealtimeInput {
  if (candidate.kind === "show") {
    return {
      kind: "show",
      origin,
      slug: candidate.slug,
      showTitle: candidate.showTitle,
      code: candidate.code,
      contextSheetName: candidate.contextSheetName,
    };
  }
  if (candidate.kind === "ingestion") {
    return {
      kind: "ingestion",
      origin,
      driveFileName: candidate.driveFileName,
      lastErrorCode: candidate.lastErrorCode,
    };
  }
  if (candidate.kind === "global") return { kind: "global", origin };
  // auto_publish_undo is NEVER rendered through the problem templates: its body
  // carries a recipient-bound r, so the loop routes it through the per-recipient
  // EmailSource arm instead (spec §4.3 R17). Reaching here is a programmer error.
  throw new Error("auto_publish_undo rendering is per-recipient; not reachable here");
}

type BatchMember = {
  dedupKey: string;
  showId: string | null;
  triggeredCodes: string[];
  context: Record<string, unknown>;
};

/** One provider send for ALL members of a same-kind batch (spec §2.2-§2.3); the
 * caller has already canonicalized + active-verified the recipient and filtered
 * members through currentness + ledger eligibility. Ledger writes stay per member. */
async function deliverBatch(input: {
  sql: DeliverySql;
  send: (args: SendArgs) => Promise<SendResult>;
  alert: typeof upsertAdminAlert;
  clock: () => Date;
  makeReissueKey: (kind: string, dedupKey: string, recipient: string) => string;
  kind: DeliveryKind;
  members: BatchMember[];
  email: EmailSource;
  recipient: string;
  counts: DeliveryCounts;
  /** Lock-liveness heartbeat (spec §2.1b) — awaited immediately before the send;
   * a throw means the lock connection died and MUST abort the whole pass. */
  heartbeat?: () => Promise<void>;
}): Promise<void> {
  const combined = combinedDedupKey(input.members.map((member) => member.dedupKey));
  // Per-recipient rendering happens HERE — after canonicalization and the
  // active-recipient check — so the bound r derives from the canonical email
  // and no token-bearing body is ever rendered for a revoked recipient (R17).
  const email =
    input.email.mode === "per-recipient"
      ? input.email.render(input.recipient)
      : input.email.content;

  await input.heartbeat?.();
  const first = await input.send({
    ...email,
    to: input.recipient,
    idempotencyKey: baseKey(input.kind, combined, input.recipient),
  });
  const outcome =
    first.ok === false && first.kind === "idempotency_conflict"
      ? await input.send({
          ...email,
          to: input.recipient,
          idempotencyKey: input.makeReissueKey(input.kind, combined, input.recipient),
        })
      : first;

  if (outcome.ok === true) {
    for (const member of input.members) {
      await upsertSent(
        input.sql,
        {
          kind: input.kind,
          dedupKey: member.dedupKey,
          showId: member.showId,
          triggeredCodes: member.triggeredCodes,
          context: member.context,
        },
        input.recipient,
        outcome.messageId,
        input.clock(),
      );
      input.counts.sent += 1;
    }
    return;
  }
  if (outcome.ok === "retry_later" || outcome.kind === "idempotency_conflict") {
    input.counts.retryLater += input.members.length;
    return;
  }

  for (const member of input.members) {
    const landed = await upsertFailed(
      input.sql,
      {
        kind: input.kind,
        dedupKey: member.dedupKey,
        showId: member.showId,
        triggeredCodes: member.triggeredCodes,
        context: member.context,
      },
      input.recipient,
      outcome.message,
    );
    if (!landed) {
      input.counts.skipped += 1;
      continue;
    }
    await input.alert({
      showId: member.showId,
      code: "EMAIL_DELIVERY_FAILED",
      context: member.context,
    });
    input.counts.failed += 1;
  }
}

/** Recipient-first batch pass (spec §2.1): per recipient, per group, per-candidate
 * eligibility collects members; each non-empty group gets exactly one send. */
async function runDeliveryPass(input: {
  candidates: RealtimeCandidate[];
  recipients: string[];
  origin: string;
  sql: DeliverySql;
  send: (args: SendArgs) => Promise<SendResult>;
  alert: typeof upsertAdminAlert;
  clock: () => Date;
  makeReissueKey: (kind: string, dedupKey: string, recipient: string) => string;
  counts: DeliveryCounts;
  heartbeat?: () => Promise<void>;
}): Promise<void> {
  for (const rawRecipient of input.recipients) {
    const recipient = canonicalize(rawRecipient);
    if (!recipient) {
      input.counts.skipped += input.candidates.length;
      continue;
    }
    const active = await isRecipientActive(input.sql, recipient);
    if (!active) {
      input.counts.skipped += input.candidates.length;
      continue;
    }
    for (const group of GROUP_ORDER) {
      const members: RealtimeCandidate[] = [];
      for (const candidate of input.candidates) {
        if (groupFor(candidate) !== group) continue;
        // Lock-liveness (spec §2.1b): heartbeat before EACH candidate's eligibility
        // queries as well as before each send, so the lock transaction never idles
        // longer than one eligibility check or one send — including sends-free
        // passes where every candidate skips.
        await input.heartbeat?.();
        const current = await isCandidateCurrent(candidate, input.sql);
        if (!current) {
          input.counts.skipped += 1;
          continue;
        }
        const ledger = await existingLedger(
          input.sql,
          kindFor(candidate),
          candidate.dedupKey,
          recipient,
        );
        if (
          ledger?.status === "sent" ||
          (ledger?.status === "failed" && ledger.attempt_count >= SEND_RETRY_CAP)
        ) {
          input.counts.skipped += 1;
          continue;
        }
        members.push(candidate);
      }
      if (members.length === 0) continue;

      const email: EmailSource =
        group === "published"
          ? {
              mode: "per-recipient",
              render: (canonicalRecipient) =>
                renderAutoPublishUndoBatch({
                  origin: input.origin,
                  recipient: canonicalRecipient,
                  now: input.clock(),
                  shows: members.map((member) => {
                    const undo = member as Extract<
                      RealtimeCandidate,
                      { kind: "auto_publish_undo" }
                    >;
                    return {
                      slug: undo.slug,
                      showTitle: undo.showTitle,
                      showId: undo.showId,
                      token: undo.token,
                      mintId: undo.mintId,
                      expiresAt: undo.expiresAt,
                    };
                  }),
                }),
            }
          : {
              mode: "static",
              content: renderRealtimeProblemBatch(
                group,
                input.origin,
                members.map((member) => toRealtimeInput(member, input.origin)),
              ),
            };

      await deliverBatch({
        sql: input.sql,
        send: input.send,
        alert: input.alert,
        clock: input.clock,
        makeReissueKey: input.makeReissueKey,
        kind: kindFor(members[0]!),
        members: members.map((member) => ({
          dedupKey: member.dedupKey,
          showId: showIdFor(member),
          triggeredCodes: [triggeredCode(member)],
          context: contextFor(member),
        })),
        email,
        recipient,
        counts: input.counts,
        ...(input.heartbeat ? { heartbeat: input.heartbeat } : {}),
      });
    }
  }
}

export async function deliverRealtimeCandidates(
  input: DeliveryInput,
  deps: DeliveryDeps = {},
): Promise<DeliveryResult> {
  // Empty-input fast path (spec §2.1): no clients constructed, exact zero shape
  // (no lockSkipped key) — pinned by the existing exact-toEqual contract test.
  if (input.candidates.length === 0 || input.recipients.length === 0) {
    return { kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 0 };
  }
  const sql =
    deps.sql ??
    (postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      prepare: false,
    }) as DeliverySql);
  const ownsConnection = !deps.sql;
  // Dedicated lock client (spec §2.1b): the single-flight advisory lock is
  // transaction-scoped on its OWN connection so it is backend-pinned under every
  // pooling mode and auto-releases on commit/rollback/connection-drop. Work SQL
  // stays on `sql` with per-statement autocommit.
  const lockSql: LockClient =
    deps.lockSql ??
    (postgres(databaseUrl(), {
      max: 1,
      idle_timeout: 1,
      prepare: false,
    }) as unknown as LockClient);
  const ownsLock = !deps.lockSql;
  const send = deps.sendEmail ?? sendEmail;
  const alert = deps.upsertAdminAlert ?? upsertAdminAlert;
  const clock = deps.now ?? (() => new Date());
  const makeReissueKey = deps.reissueKey ?? reissueKey;
  const counts = { sent: 0, failed: 0, skipped: 0, retryLater: 0 };

  try {
    const passResult = await lockSql.begin(async (ltx) => {
      const rows = await ltx<{ locked: boolean }>`
        select pg_try_advisory_xact_lock(hashtext('notify:realtime-delivery')) as locked
      `;
      if (!rows[0]?.locked) return { lockSkipped: true as const };
      // Lock-liveness heartbeat (spec §2.1b): one statement on the LOCK
      // transaction immediately before each batch send bounds its idle interval
      // to a single send + one batch's ledger writes; a failed heartbeat means
      // the lock connection (and thus the xact lock) is gone — abort by rethrowing.
      const heartbeat = async () => {
        await ltx`select 1`;
      };
      await runDeliveryPass({
        candidates: input.candidates,
        recipients: input.recipients,
        origin: input.origin,
        sql,
        send,
        alert,
        clock,
        makeReissueKey,
        counts,
        heartbeat,
      });
      return { lockSkipped: false as const };
    });
    if (passResult.lockSkipped) {
      return { kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 0, lockSkipped: true };
    }
    return { kind: "ok", ...counts };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) {
      await sql.end?.({ timeout: 5 });
    }
    if (ownsLock) {
      await lockSql.end?.({ timeout: 5 });
    }
  }
}

export async function deliverDigest(
  input: { model: DigestModel; origin: string; monitor?: MonitorDigestModel | null },
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
    const recipient = canonicalize(input.model.recipient);
    if (!recipient) {
      counts.skipped += 1;
      return { kind: "ok", ...counts };
    }
    const ledger = await existingLedger(sql, "digest", dedupKey, recipient);
    if (
      ledger?.status === "sent" ||
      (ledger?.status === "failed" && ledger.attempt_count >= SEND_RETRY_CAP)
    ) {
      counts.skipped += 1;
      return { kind: "ok", ...counts };
    }
    const active = await isRecipientActive(sql, recipient);
    if (!active) {
      counts.skipped += 1;
      return { kind: "ok", ...counts };
    }
    await deliverBatch({
      sql,
      send,
      alert,
      clock,
      makeReissueKey,
      kind: "digest",
      members: [
        {
          dedupKey,
          showId: null,
          triggeredCodes: [],
          context: digestContextFor(input),
        },
      ],
      email: {
        mode: "static",
        content: renderDigest({
          origin: input.origin,
          shows: input.model.shows,
          ...(input.monitor ? { monitor: input.monitor } : {}),
        }),
      },
      recipient,
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

function digestContextFor(input: {
  model: DigestModel;
  monitor?: MonitorDigestModel | null;
}): Record<string, unknown> {
  return {
    date_et: input.model.dateET,
    source_totals: input.model.sourceTotals,
    // Flow 6.2 §8: counts only (no crew PII). Omitted entirely when there is no
    // monitor section so the null-monitor context stays byte-identical to pre-6.2.
    ...(input.monitor
      ? {
          monitor_totals: {
            autoAppliedShows: input.monitor.autoApplied.length,
            autoAppliedRows: input.monitor.autoApplied.reduce((n, g) => n + g.items.length, 0),
            autofixTotal: input.monitor.autofix.total,
            driftShows: input.monitor.drift.length,
            newShowGapsShows: input.monitor.newShowGaps.length,
          },
        }
      : {}),
  };
}
