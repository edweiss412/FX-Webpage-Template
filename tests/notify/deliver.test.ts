import { describe, expect, test, vi } from "vitest";
import { auditEmailCanonicalizationSources } from "@/lib/audit/emailCanonicalization";
import { SEND_RETRY_CAP } from "@/lib/notify/constants";
import { deliverDigest, deliverRealtimeCandidates, type DeliverySql } from "@/lib/notify/deliver";
import type { RealtimeCandidate } from "@/lib/notify/detect/candidates";
import type { DigestModel } from "@/lib/notify/digest";
import type { SendArgs, SendResult } from "@/lib/notify/send";

type FakeSqlOptions = {
  current?: boolean;
  active?: boolean;
  existingLedger?: { status: "sent" | "failed"; attempt_count: number } | null;
  existingLedgerKind?: "realtime_problem" | "digest";
  existingLedgerDedupKey?: string;
  existingLedgerRecipient?: string;
  failedUpsertRows?: Array<{ id: string }>;
};

function showCandidate(
  overrides: Partial<Extract<RealtimeCandidate, { kind: "show" }>> = {},
): RealtimeCandidate {
  return {
    kind: "show",
    dedupKey: "show-1:SHEET_UNAVAILABLE:1780000000123000",
    alertId: "alert-1",
    showId: "show-1",
    code: "SHEET_UNAVAILABLE",
    raisedAt: new Date("2026-06-02T12:00:00.123Z"),
    slug: "show-one",
    showTitle: "Show One",
    contextSheetName: "Sheet One",
    ...overrides,
  };
}

function ingestionCandidate(
  overrides: Partial<Extract<RealtimeCandidate, { kind: "ingestion" }>> = {},
): RealtimeCandidate {
  return {
    kind: "ingestion",
    dedupKey: "ingestion:drive-1:1780000000123000",
    driveFileId: "drive-1",
    driveFileName: "Pending Sheet",
    firstSeenAt: new Date("2026-06-02T12:00:00.123Z"),
    lastErrorCode: "SHEET_PROCESS_FAILED",
    ...overrides,
  };
}

function fakeSql(options: FakeSqlOptions = {}) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const existingLedgerKind = options.existingLedgerKind ?? "realtime_problem";
  const existingLedgerDedupKey = options.existingLedgerDedupKey ?? showCandidate().dedupKey;
  const existingLedgerRecipient = options.existingLedgerRecipient ?? "doug@fxav.net";
  const state = {
    current: options.current ?? true,
    active: options.active ?? true,
    ledger: new Map<string, { status: "sent" | "failed"; attempt_count: number }>(
      options.existingLedger
        ? [
            [
              `${existingLedgerKind}:${existingLedgerDedupKey}:${existingLedgerRecipient}`,
              options.existingLedger,
            ],
          ]
        : [],
    ),
    sentRows: [] as Array<{ text: string; values: unknown[] }>,
    failedRows: [] as Array<{ text: string; values: unknown[] }>,
  };

  const ledgerKey = (kind: unknown, dedupKey: unknown, recipient: unknown) =>
    `${String(kind)}:${String(dedupKey)}:${String(recipient)}`;

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = String.raw(strings, ...values.map((_value, index) => `$${index + 1}`));
    calls.push({ text, values });

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
      const key =
        values.length >= 3
          ? ledgerKey(values[0], values[1], values[2])
          : ledgerKey("realtime_problem", values[0], values[1]);
      const row = state.ledger.get(key);
      return Promise.resolve(row ? [row] : []);
    }
    if (/from\s+public\.admin_emails/i.test(text)) {
      return Promise.resolve(state.active ? [{ active: true }] : []);
    }
    if (
      /insert\s+into\s+public\.email_deliveries/i.test(text) &&
      /status\s*=\s*'sent'/i.test(text)
    ) {
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
      const rows = options.failedUpsertRows ?? [{ id: "failed" }];
      if (rows.length === 0) return Promise.resolve([]);
      const key = ledgerKey(values[0], values[1], values[3]);
      const prior = state.ledger.get(key);
      state.ledger.set(key, {
        status: "failed",
        attempt_count: (prior?.attempt_count ?? 0) + 1,
      });
      return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  }) as unknown as DeliverySql;

  return { sql, calls, state };
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

const ORIGIN = "https://crew.fxav.app";

function digestModel(overrides: Partial<DigestModel> = {}): DigestModel {
  return {
    recipient: " Doug@FXAV.NET ",
    dateET: "2026-06-02",
    shows: [{ showTitle: "Show One", slug: "show-one", items: ["Changes staged for review"] }],
    sourceTotals: { ingestions: 1, syncs: 1, shows: 1 },
    ...overrides,
  };
}

describe("deliverRealtimeCandidates", () => {
  test("canonicalizes recipient, sends once, upserts sent, then skips the sent ledger row on the next tick", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([{ ok: true, messageId: "msg-1" }]);

    const result1 = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: [" Doug@FXAV.NET "], origin: ORIGIN },
      { sql, sendEmail, now: () => new Date("2026-06-02T14:00:00.000Z") },
    );
    const result2 = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: [" Doug@FXAV.NET "], origin: ORIGIN },
      { sql, sendEmail },
    );

    expect(result1).toMatchObject({ kind: "ok", sent: 1 });
    expect(result2).toMatchObject({ kind: "ok", skipped: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sends[0]?.to).toBe("doug@fxav.net");
    expect(state.sentRows[0]?.values).toContain("doug@fxav.net");
  });

  test.each([
    ["alert resolved", showCandidate(), { current: false }],
    ["show archived or unpublished", showCandidate(), { current: false }],
    ["pending row deleted", ingestionCandidate(), { current: false }],
    ["pending row becomes wizard-scoped", ingestionCandidate(), { current: false }],
  ])(
    "stale candidate race skips with no send and no ledger write: %s",
    async (_name, candidate, options) => {
      const { sql, state } = fakeSql(options);
      const { sendEmail } = sender([{ ok: true, messageId: "msg-1" }]);

      const result = await deliverRealtimeCandidates(
        { candidates: [candidate], recipients: ["doug@fxav.net"], origin: ORIGIN },
        { sql, sendEmail },
      );

      expect(result).toMatchObject({ kind: "ok", skipped: 1 });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(state.sentRows).toHaveLength(0);
      expect(state.failedRows).toHaveLength(0);
    },
  );

  test("two recipients receive distinct base idempotency keys and two sent rows", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([
      { ok: true, messageId: "msg-1" },
      { ok: true, messageId: "msg-2" },
    ]);

    await deliverRealtimeCandidates(
      {
        candidates: [showCandidate()],
        recipients: ["a@example.com", "b@example.com"],
        origin: ORIGIN,
      },
      { sql, sendEmail },
    );

    expect(state.sentRows).toHaveLength(2);
    expect(new Set(sends.map((s) => s.idempotencyKey)).size).toBe(2);
  });

  test("retry_later on the base key writes no ledger row and raises no delivery-failed alert", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([{ ok: "retry_later" }]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(result).toMatchObject({ kind: "ok", retryLater: 1 });
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("invalid idempotency on the base key reissues with a fresh nonce and records sent only after a 200", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([
      { ok: false, kind: "idempotency_conflict" },
      { ok: true, messageId: "msg-reissued" },
    ]);

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, reissueKey: () => "fresh-nonce-1" },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 1 });
    expect(sends.map((s) => s.idempotencyKey)).toEqual([
      expect.stringMatching(/^fxav:realtime_problem:/),
      "fresh-nonce-1",
    ]);
    expect(state.sentRows).toHaveLength(1);
    expect(state.failedRows).toHaveLength(0);
  });

  test("reissue retry_later writes no failed row and raises no delivery-failed alert", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([
      { ok: false, kind: "idempotency_conflict" },
      { ok: "retry_later" },
    ]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(result).toMatchObject({ kind: "ok", retryLater: 1 });
    expect(state.failedRows).toHaveLength(0);
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("reissue that ALSO conflicts stops after exactly two sends: retryLater, no ledger write, no alert", async () => {
    const { sql, state } = fakeSql();
    // [conflict, conflict]: the sender fallback after these two results is ok:true,
    // so a third (looping) send attempt would record a sent row and fail this test.
    const { sendEmail } = sender([
      { ok: false, kind: "idempotency_conflict" },
      { ok: false, kind: "idempotency_conflict" },
    ]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert, reissueKey: () => "fresh-nonce-1" },
    );

    expect(result).toEqual({ kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(2); // base + one reissue, never a third
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("infra_error records conditional failure, increments attempts, and raises EMAIL_DELIVERY_FAILED", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([
      { ok: false, kind: "infra_error", message: "provider down" },
      { ok: false, kind: "infra_error", message: "provider down again" },
    ]);
    const upsertAdminAlert = vi.fn();

    await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );
    await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(state.failedRows).toHaveLength(2);
    expect(
      state.ledger.get(`realtime_problem:${showCandidate().dedupKey}:doug@fxav.net`)?.attempt_count,
    ).toBe(2);
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "EMAIL_DELIVERY_FAILED",
      context: expect.objectContaining({ dedup_key: "show-1:SHEET_UNAVAILABLE:1780000000123000" }),
    });
  });

  test("infra_error that loses a sent-ledger race skips without raising EMAIL_DELIVERY_FAILED", async () => {
    const { sql, state } = fakeSql({ failedUpsertRows: [] });
    const { sendEmail } = sender([{ ok: false, kind: "infra_error", message: "provider down" }]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(result).toEqual({ kind: "ok", sent: 0, failed: 0, skipped: 1, retryLater: 0 });
    expect(state.failedRows).toHaveLength(1);
    expect(state.ledger.has(`realtime_problem:${showCandidate().dedupKey}:doug@fxav.net`)).toBe(
      false,
    );
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("infra_error raises EMAIL_DELIVERY_FAILED when the failed-ledger write lands", async () => {
    const { sql, state } = fakeSql({ failedUpsertRows: [{ id: "failed-1" }] });
    const { sendEmail } = sender([{ ok: false, kind: "infra_error", message: "provider down" }]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(result).toEqual({ kind: "ok", sent: 0, failed: 1, skipped: 0, retryLater: 0 });
    expect(state.failedRows).toHaveLength(1);
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "EMAIL_DELIVERY_FAILED",
      context: expect.objectContaining({ dedup_key: "show-1:SHEET_UNAVAILABLE:1780000000123000" }),
    });
  });

  test("failed rows are retried only while attempt_count is below the cap", async () => {
    const { sql, state } = fakeSql({
      existingLedger: { status: "failed", attempt_count: SEND_RETRY_CAP },
    });
    const { sendEmail } = sender([{ ok: true, messageId: "msg-1" }]);

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail },
    );

    expect(result).toMatchObject({ kind: "ok", skipped: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.sentRows).toHaveLength(0);
  });

  test("revoked recipient re-check skips without sending", async () => {
    const { sql, state } = fakeSql({ active: false });
    const { sendEmail } = sender([{ ok: true, messageId: "msg-1" }]);

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail },
    );

    expect(result).toMatchObject({ kind: "ok", skipped: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.sentRows).toHaveLength(0);
  });

  test("empty candidates or empty recipients return the zero-counts ok result without touching SQL or the provider", async () => {
    const { sql, calls } = fakeSql();
    const { sendEmail } = sender([]);
    const zero = { kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 0 };

    await expect(
      deliverRealtimeCandidates(
        { candidates: [], recipients: ["doug@fxav.net"], origin: ORIGIN },
        { sql, sendEmail },
      ),
    ).resolves.toEqual(zero);
    await expect(
      deliverRealtimeCandidates(
        { candidates: [showCandidate()], recipients: [], origin: ORIGIN },
        { sql, sendEmail },
      ),
    ).resolves.toEqual(zero);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  test("show and pending currentness checks use SQL-computed microsecond epochs and wizard exclusion", async () => {
    const { sql, calls } = fakeSql();
    const { sendEmail } = sender([{ ok: "retry_later" }, { ok: "retry_later" }]);

    await deliverRealtimeCandidates(
      {
        candidates: [showCandidate(), ingestionCandidate()],
        recipients: ["doug@fxav.net"],
        origin: ORIGIN,
      },
      { sql, sendEmail },
    );

    const currentQueries = calls.filter((c) => /floor\(extract\(epoch\s+from/i.test(c.text));
    expect(currentQueries[0]?.text).toMatch(/a\.resolved_at\s+is\s+null/i);
    expect(currentQueries[0]?.text).toMatch(/s\.published\s+is\s+true/i);
    expect(currentQueries[0]?.text).toMatch(/s\.archived\s+is\s+false/i);
    expect(currentQueries[1]?.text).toMatch(/from\s+public\.pending_ingestions/i);
    expect(currentQueries[1]?.text).toMatch(/wizard_session_id\s+is\s+null/i);
    expect(currentQueries.map((c) => c.text).join("\n")).not.toMatch(/Date\.parse/i);
  });
});

describe("deliverDigest", () => {
  test("records a sent digest ledger row with canonical recipient and digest dedup key", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([{ ok: true, messageId: "digest-msg-1" }]);

    const result = await deliverDigest(
      { model: digestModel(), origin: ORIGIN },
      { sql, sendEmail, now: () => new Date("2026-06-02T13:00:00.000Z") },
    );

    expect(result).toEqual({ kind: "ok", sent: 1, failed: 0, skipped: 0, retryLater: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sends[0]?.to).toBe("doug@fxav.net");
    expect(sends[0]?.idempotencyKey).toEqual(expect.stringMatching(/^fxav:digest:/));
    expect(state.sentRows).toHaveLength(1);
    expect(state.sentRows[0]?.values).toEqual(
      expect.arrayContaining([
        "digest",
        "digest:2026-06-02",
        null,
        "doug@fxav.net",
        "digest-msg-1",
      ]),
    );
    // The context param is the RAW object — postgres.js serializes ::jsonb
    // params itself; a pre-stringified value double-encodes (2026-06-11 audit).
    const contextParam = state.sentRows[0]?.values.find(
      (value): value is Record<string, unknown> =>
        typeof value === "object" && value !== null && "source_totals" in value,
    );
    expect(contextParam).toMatchObject({ date_et: "2026-06-02" });
  });

  test("reissues changed-payload idempotency conflicts with a distinct key and records sent after a 200", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([
      { ok: false, kind: "idempotency_conflict" },
      { ok: true, messageId: "digest-reissued" },
    ]);

    const result = await deliverDigest(
      { model: digestModel(), origin: ORIGIN },
      { sql, sendEmail, reissueKey: () => "digest-fresh-nonce" },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 1 });
    expect(sends.map((send) => send.idempotencyKey)).toEqual([
      expect.stringMatching(/^fxav:digest:/),
      "digest-fresh-nonce",
    ]);
    expect(sends[0]?.idempotencyKey).not.toBe(sends[1]?.idempotencyKey);
    expect(state.sentRows).toHaveLength(1);
    expect(state.failedRows).toHaveLength(0);
  });

  test("retry_later on the reissue writes no ledger row and raises no delivery-failed alert", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([
      { ok: false, kind: "idempotency_conflict" },
      { ok: "retry_later" },
    ]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverDigest(
      { model: digestModel(), origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(result).toMatchObject({ kind: "ok", retryLater: 1 });
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("reissue that ALSO conflicts stops after exactly two sends: retryLater, no ledger write, no alert", async () => {
    const { sql, state } = fakeSql();
    // Sender fallback after these two results is ok:true — a third send would
    // record a sent row, so sentRows 0 + calledTimes 2 prove there is no loop.
    const { sendEmail } = sender([
      { ok: false, kind: "idempotency_conflict" },
      { ok: false, kind: "idempotency_conflict" },
    ]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverDigest(
      { model: digestModel(), origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert, reissueKey: () => "digest-fresh-nonce" },
    );

    expect(result).toEqual({ kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("retry_later on the base key writes no ledger row and raises no delivery-failed alert", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([{ ok: "retry_later" }]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverDigest(
      { model: digestModel(), origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(result).toMatchObject({ kind: "ok", retryLater: 1 });
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("infra_error records a failed digest row and raises NULL-scope EMAIL_DELIVERY_FAILED", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([{ ok: false, kind: "infra_error", message: "provider down" }]);
    const upsertAdminAlert = vi.fn();

    const result = await deliverDigest(
      { model: digestModel(), origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(result).toMatchObject({ kind: "ok", failed: 1 });
    expect(state.failedRows).toHaveLength(1);
    expect(state.failedRows[0]?.values).toEqual(
      expect.arrayContaining([
        "digest",
        "digest:2026-06-02",
        null,
        "doug@fxav.net",
        "provider down",
      ]),
    );
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "EMAIL_DELIVERY_FAILED",
      context: {
        date_et: "2026-06-02",
        source_totals: { ingestions: 1, syncs: 1, shows: 1 },
      },
    });
  });

  test("existing sent digest row skips without a second provider send", async () => {
    const { sql, state } = fakeSql({
      existingLedger: { status: "sent", attempt_count: 0 },
      existingLedgerKind: "digest",
      existingLedgerDedupKey: "digest:2026-06-02",
    });
    const { sendEmail } = sender([{ ok: true, messageId: "digest-msg-1" }]);

    const result = await deliverDigest(
      { model: digestModel(), origin: ORIGIN },
      { sql, sendEmail },
    );

    expect(result).toMatchObject({ kind: "ok", skipped: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.sentRows).toHaveLength(0);
  });

  test("failed digest row at the retry cap skips without a provider send", async () => {
    const { sql, state } = fakeSql({
      existingLedger: { status: "failed", attempt_count: SEND_RETRY_CAP },
      existingLedgerKind: "digest",
      existingLedgerDedupKey: "digest:2026-06-02",
    });
    const { sendEmail } = sender([{ ok: true, messageId: "digest-msg-1" }]);

    const result = await deliverDigest(
      { model: digestModel(), origin: ORIGIN },
      { sql, sendEmail },
    );

    expect(result).toMatchObject({ kind: "ok", skipped: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.sentRows).toHaveLength(0);
  });
});

describe("email_deliveries recipient canonicalization audit coverage", () => {
  test("a raw recipient write in lib/notify/deliver.ts fails the live audit layer", () => {
    const findings = auditEmailCanonicalizationSources([
      {
        path: "lib/notify/deliver.ts",
        source: [
          "export async function bad(db: { from(table: string): { insert(row: unknown): Promise<void> } }, rawRecipient: string) {",
          '  await db.from("email_deliveries").insert({',
          '    kind: "realtime_problem",',
          '    dedup_key: "k",',
          "    recipient: rawRecipient,",
          "  });",
          "}",
        ].join("\n"),
      },
    ]);

    expect(findings.join("\n")).toMatch(/raw_email_db_write:email_deliveries\.recipient/);
  });
});
