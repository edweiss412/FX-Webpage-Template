import { describe, expect, test, vi } from "vitest";
import { deliverRealtimeCandidates, type DeliverySql } from "@/lib/notify/deliver";
import type { AutoPublishUndoCandidate, RealtimeCandidate } from "@/lib/notify/detect/candidates";
import { SEND_RETRY_CAP } from "@/lib/notify/constants";
import { baseKey, combinedDedupKey } from "@/lib/notify/idempotencyKey";
import type { SendArgs, SendResult } from "@/lib/notify/send";
import { mintIdFor, recipientBindingFor } from "@/lib/sync/unpublishBinding";
import { fakeLockSql } from "./fakeLockSql";

const ORIGIN = "https://crew.fxav.app";
const RECIPIENT = "doug@fxav.net";

function showCandidate(
  i: number,
  overrides: Partial<Extract<RealtimeCandidate, { kind: "show" }>> = {},
): RealtimeCandidate {
  return {
    kind: "show",
    dedupKey: `show-${i}:SHEET_UNAVAILABLE:178000000012300${i}`,
    alertId: `alert-${i}`,
    showId: `show-${i}`,
    code: "SHEET_UNAVAILABLE",
    raisedAt: new Date("2026-06-02T12:00:00.123Z"),
    slug: `show-${i}`,
    showTitle: `Show ${i}`,
    contextSheetName: `Sheet ${i}`,
    ...overrides,
  };
}

function ingestionCandidate(i: number): RealtimeCandidate {
  return {
    kind: "ingestion",
    dedupKey: `ingestion:drive-${i}:178000000012300${i}`,
    driveFileId: `drive-${i}`,
    driveFileName: `Pending Sheet ${i}`,
    firstSeenAt: new Date("2026-06-02T12:00:00.123Z"),
    lastErrorCode: "SHEET_PROCESS_FAILED",
  };
}

function globalCandidate(): RealtimeCandidate {
  return {
    kind: "global",
    dedupKey: "global:SYNC_STALLED:1780000000123000",
    alertId: "alert-global",
    code: "SYNC_STALLED",
    raisedAt: new Date("2026-06-02T12:00:00.123Z"),
  };
}

function undoCandidate(i: number): AutoPublishUndoCandidate {
  const token = `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee${String(i).padStart(2, "0")}`;
  const mintId = mintIdFor(token);
  const showId = `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
  return {
    kind: "auto_publish_undo",
    dedupKey: `${showId}:${mintId}`,
    showId,
    slug: `tour-${i}`,
    showTitle: `Tour ${i}`,
    token,
    mintId,
    expiresAt: new Date("2026-06-13T18:00:00.000Z"),
  };
}

type FakeSqlOptions = {
  current?: boolean;
  active?: boolean;
  /** failed-row upsert returns zero rows (sent-race guard) for these dedup keys */
  failedUpsertEmptyFor?: string[];
  /** the Nth sent-row insert (1-based) throws */
  sentThrowAt?: number;
};

function fakeSql(options: FakeSqlOptions = {}) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = {
    current: options.current ?? true,
    active: options.active ?? true,
    ledger: new Map<string, { status: "sent" | "failed"; attempt_count: number }>(),
    sentRows: [] as Array<{ text: string; values: unknown[] }>,
    failedRows: [] as Array<{ text: string; values: unknown[] }>,
  };
  const ledgerKey = (kind: unknown, dedupKey: unknown, recipient: unknown) =>
    `${String(kind)}:${String(dedupKey)}:${String(recipient)}`;
  const seedLedger = (
    kind: string,
    dedupKey: string,
    recipient: string,
    row: { status: "sent" | "failed"; attempt_count: number },
  ) => state.ledger.set(ledgerKey(kind, dedupKey, recipient), row);

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = String.raw(strings, ...values.map((_value, index) => `$${index + 1}`));
    calls.push({ text, values });

    if (/select\s+1\s+from\s+public\.shows/i.test(text)) {
      return Promise.resolve(state.current ? [{ current: true }] : []);
    }
    if (
      /select\s+1\s+from\s+public\.admin_alerts/i.test(text) ||
      /select\s+1\s+from\s+public\.pending_ingestions/i.test(text)
    ) {
      return Promise.resolve(state.current ? [{ current: true }] : []);
    }
    if (
      /from\s+public\.email_deliveries/i.test(text) &&
      /select\s+status,\s*attempt_count/i.test(text)
    ) {
      const row = state.ledger.get(ledgerKey(values[0], values[1], values[2]));
      return Promise.resolve(row ? [row] : []);
    }
    if (/from\s+public\.admin_emails/i.test(text)) {
      return Promise.resolve(state.active ? [{ active: true }] : []);
    }
    if (
      /insert\s+into\s+public\.email_deliveries/i.test(text) &&
      /status\s*=\s*'sent'/i.test(text)
    ) {
      if (options.sentThrowAt !== undefined && state.sentRows.length + 1 >= options.sentThrowAt) {
        return Promise.reject(new Error("sent upsert failed"));
      }
      state.sentRows.push({ text, values });
      state.ledger.set(ledgerKey(values[0], values[1], values[3]), {
        status: "sent",
        attempt_count: 0,
      });
      return Promise.resolve([{ id: "sent" }]);
    }
    if (
      /insert\s+into\s+public\.email_deliveries/i.test(text) &&
      /status\s*=\s*'failed'/i.test(text)
    ) {
      state.failedRows.push({ text, values });
      if (options.failedUpsertEmptyFor?.includes(String(values[1]))) {
        return Promise.resolve([]);
      }
      const key = ledgerKey(values[0], values[1], values[3]);
      const prior = state.ledger.get(key);
      state.ledger.set(key, { status: "failed", attempt_count: (prior?.attempt_count ?? 0) + 1 });
      return Promise.resolve([{ id: "failed" }]);
    }
    return Promise.resolve([]);
  }) as unknown as DeliverySql;

  return { sql, calls, state, seedLedger };
}

function sender(results: SendResult[]) {
  const sends: SendArgs[] = [];
  const sendEmail = vi.fn(async (args: SendArgs): Promise<SendResult> => {
    sends.push(args);
    const fallback: SendResult = { ok: true, messageId: `msg-${sends.length}` };
    return results.shift() ?? fallback;
  });
  return { sendEmail, sends };
}

function alertSpy() {
  return vi.fn(
    async (_input: {
      showId: string | null;
      code: string;
      context: Record<string, unknown>;
    }): Promise<string | null> => null,
  );
}

describe("deliverRealtimeCandidates batching (spec §2.1-§2.3)", () => {
  test("one send per group per recipient, batch subjects, combined idempotency keys", async () => {
    const { sql } = fakeSql();
    const { sendEmail, sends } = sender([]);
    const undos = [undoCandidate(1), undoCandidate(2), undoCandidate(3)];
    const shows = [showCandidate(1), showCandidate(2)];
    const ingestion = [ingestionCandidate(1)];

    const result = await deliverRealtimeCandidates(
      { candidates: [...undos, ...shows, ...ingestion], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 6 });
    expect(sendEmail).toHaveBeenCalledTimes(3);
    const subjects = sends.map((send) => send.subject);
    expect(subjects).toContain("FXAV: 3 shows published themselves");
    expect(subjects).toContain("FXAV: sync problems on 2 shows");
    expect(subjects).toContain("FXAV · Pending Sheet 1: sync problem");

    const undoSend = sends.find((send) => send.subject.includes("published themselves"));
    expect(undoSend?.idempotencyKey).toBe(
      baseKey("auto_publish_undo", combinedDedupKey(undos.map((u) => u.dedupKey)), RECIPIENT),
    );
    const syncSend = sends.find((send) => send.subject.includes("sync problems on"));
    expect(syncSend?.idempotencyKey).toBe(
      baseKey("realtime_problem", combinedDedupKey(shows.map((s) => s.dedupKey)), RECIPIENT),
    );
    const ingestionSend = sends.find((send) => send.subject.includes("Pending Sheet 1"));
    expect(ingestionSend?.idempotencyKey).toBe(
      baseKey("realtime_problem", ingestion[0]!.dedupKey, RECIPIENT),
    );
  });

  test("per-member ledger rows share the provider message id", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([{ ok: true, messageId: "msg-shared" }]);
    const undos = [undoCandidate(1), undoCandidate(2)];

    await deliverRealtimeCandidates(
      { candidates: undos, recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(state.sentRows).toHaveLength(2);
    for (const [index, row] of state.sentRows.entries()) {
      expect(row.values).toContain("msg-shared");
      expect(row.values).toContain(undos[index]!.dedupKey);
    }
  });

  test("mixed eligibility: sent member excluded, fresh member ships as N=1 (key identity)", async () => {
    const { sql, seedLedger } = fakeSql();
    const { sendEmail, sends } = sender([]);
    const [a, b] = [showCandidate(1), showCandidate(2)];
    seedLedger("realtime_problem", a.dedupKey, RECIPIENT, { status: "sent", attempt_count: 0 });

    const result = await deliverRealtimeCandidates(
      { candidates: [a, b], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 1, skipped: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sends[0]?.idempotencyKey).toBe(baseKey("realtime_problem", b.dedupKey, RECIPIENT));
  });

  test("capped member drops out of the batch", async () => {
    const { sql, seedLedger } = fakeSql();
    const { sendEmail } = sender([]);
    const [a, b] = [showCandidate(1), showCandidate(2)];
    seedLedger("realtime_problem", a.dedupKey, RECIPIENT, {
      status: "failed",
      attempt_count: SEND_RETRY_CAP,
    });

    const result = await deliverRealtimeCandidates(
      { candidates: [a, b], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 1, skipped: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test("batch failure writes per-member failed rows + alerts with the EXACT undo context recipe", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([{ ok: false, kind: "infra_error", message: "boom" }]);
    const alert = alertSpy();
    const undos = [undoCandidate(1), undoCandidate(2)];

    const result = await deliverRealtimeCandidates(
      { candidates: undos, recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql(), upsertAdminAlert: alert },
    );

    expect(result).toMatchObject({ kind: "ok", failed: 2 });
    expect(state.failedRows).toHaveLength(2);
    expect(alert).toHaveBeenCalledTimes(2);
    for (const [index, undo] of undos.entries()) {
      const context = alert.mock.calls[index]?.[0]?.context;
      expect(context).toEqual({
        slug: undo.slug,
        title: undo.showTitle,
        expires_at: undo.expiresAt.toISOString(),
        mintId: undo.mintId,
      });
      // R14 token hygiene: raw bearer token never reaches rows or alerts
      expect(JSON.stringify(context)).not.toContain(undo.token);
      expect(JSON.stringify(state.failedRows[index]?.values)).not.toContain(undo.token);
    }
  });

  test("guard-suppressed failed write counts skipped, not failed", async () => {
    const { sql, state } = fakeSql({ failedUpsertEmptyFor: [showCandidate(1).dedupKey] });
    const { sendEmail } = sender([{ ok: false, kind: "infra_error", message: "boom" }]);
    const alert = alertSpy();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate(1), showCandidate(2)], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql(), upsertAdminAlert: alert },
    );

    expect(result).toMatchObject({ kind: "ok", failed: 1, skipped: 1 });
    expect(state.failedRows).toHaveLength(2);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  test("retry_later bumps retryLater per member with zero ledger writes", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([{ ok: "retry_later" }]);

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate(1), showCandidate(2)], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toMatchObject({ kind: "ok", retryLater: 2 });
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
  });

  test("inactive recipient skips all candidates with ONE active check", async () => {
    const { sql, calls } = fakeSql({ active: false });
    const { sendEmail } = sender([]);

    const result = await deliverRealtimeCandidates(
      {
        candidates: [showCandidate(1), showCandidate(2), undoCandidate(1)],
        recipients: [RECIPIENT],
        origin: ORIGIN,
      },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toMatchObject({ kind: "ok", skipped: 3 });
    expect(sendEmail).not.toHaveBeenCalled();
    const activeChecks = calls.filter((call) => /from\s+public\.admin_emails/i.test(call.text));
    expect(activeChecks).toHaveLength(1);
  });

  test("undo batch renders per-recipient AFTER canonicalization", async () => {
    const { sql } = fakeSql();
    const { sendEmail, sends } = sender([]);
    const undos = [undoCandidate(1), undoCandidate(2)];

    await deliverRealtimeCandidates(
      { candidates: undos, recipients: [" Doug@FXAV.net "], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(sends[0]?.to).toBe("doug@fxav.net");
    for (const undo of undos) {
      const r = recipientBindingFor("doug@fxav.net", undo.showId, undo.mintId);
      expect(sends[0]?.text).toContain(`r=${r}`);
    }
  });

  test("post-accept persistence failure: infra_error, earlier member's row persists, one send", async () => {
    const { sql, state } = fakeSql({ sentThrowAt: 2 });
    const { sendEmail } = sender([{ ok: true, messageId: "msg-1" }]);

    const result = await deliverRealtimeCandidates(
      {
        candidates: [showCandidate(1), showCandidate(2), showCandidate(3)],
        recipients: [RECIPIENT],
        origin: ORIGIN,
      },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toEqual({ kind: "infra_error" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(state.sentRows).toHaveLength(1);
  });

  test("global co-batches with show in sync_problems", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([]);
    const show = showCandidate(1);
    const globalC = globalCandidate();

    const result = await deliverRealtimeCandidates(
      { candidates: [show, globalC], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 2 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sends[0]?.idempotencyKey).toBe(
      baseKey("realtime_problem", combinedDedupKey([show.dedupKey, globalC.dedupKey]), RECIPIENT),
    );
    expect(state.sentRows).toHaveLength(2);
    const globalRow = state.sentRows.find((row) => row.values.includes(globalC.dedupKey));
    expect(globalRow?.values).toContain(null); // global member's show_id is null
  });

  test("N=2 reissue uses the COMBINED dedup key", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([
      { ok: false, kind: "idempotency_conflict" },
      { ok: true, messageId: "msg-2" },
    ]);
    const members = [showCandidate(1), showCandidate(2)];
    const reissue = vi.fn(
      (kind: string, dedupKey: string, recipient: string) =>
        `reissued:${kind}:${dedupKey}:${recipient}`,
    );

    const result = await deliverRealtimeCandidates(
      { candidates: members, recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql(), reissueKey: reissue },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 2 });
    expect(reissue).toHaveBeenCalledWith(
      "realtime_problem",
      combinedDedupKey(members.map((m) => m.dedupKey)),
      RECIPIENT,
    );
    expect(sends[1]?.idempotencyKey).toBe(
      `reissued:realtime_problem:${combinedDedupKey(members.map((m) => m.dedupKey))}:${RECIPIENT}`,
    );
    expect(state.sentRows).toHaveLength(2);
  });

  test("truncation is display-only at the delivery layer (21 members)", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([]);
    const members = Array.from({ length: 21 }, (_, i) => showCandidate(i + 1));

    const result = await deliverRealtimeCandidates(
      { candidates: members, recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 21 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sends[0]?.idempotencyKey).toBe(
      baseKey("realtime_problem", combinedDedupKey(members.map((m) => m.dedupKey)), RECIPIENT),
    );
    expect(state.sentRows).toHaveLength(21);
    // member 21 absent from the body (display cap) but present in the ledger
    expect(sends[0]?.text).not.toContain("Show 21:");
    expect(sends[0]?.text).toContain("…and 1 more");
    expect(state.sentRows.some((row) => row.values.includes(members[20]!.dedupKey))).toBe(true);
  });

  test("post-reissue conflict → retryLater per member, zero writes, zero alerts", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([
      { ok: false, kind: "idempotency_conflict" },
      { ok: false, kind: "idempotency_conflict" },
    ]);
    const alert = alertSpy();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate(1), showCandidate(2)], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql(), upsertAdminAlert: alert },
    );

    expect(result).toMatchObject({ kind: "ok", retryLater: 2 });
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
  });

  test("empty recipient after canonicalization skips all candidates", async () => {
    const { sql } = fakeSql();
    const { sendEmail } = sender([]);

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate(1), showCandidate(2)], recipients: ["   "], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toMatchObject({ kind: "ok", skipped: 2 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
