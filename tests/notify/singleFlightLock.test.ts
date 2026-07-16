import fs from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { deliverRealtimeCandidates, type DeliverySql } from "@/lib/notify/deliver";
import type { AutoPublishUndoCandidate, RealtimeCandidate } from "@/lib/notify/detect/candidates";
import type { SendArgs, SendResult } from "@/lib/notify/send";
import { mintIdFor } from "@/lib/sync/unpublishBinding";
import { fakeLockSql } from "./fakeLockSql";

const ORIGIN = "https://crew.fxav.app";
const RECIPIENT = "doug@fxav.net";

function showCandidate(i: number): RealtimeCandidate {
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

function fakeSql(options: { current?: boolean } = {}) {
  const state = {
    sentRows: [] as Array<{ values: unknown[] }>,
    failedRows: [] as Array<{ values: unknown[] }>,
  };
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = String.raw(strings, ...values.map((_v, i) => `$${i + 1}`));
    if (
      /select\s+1\s+from\s+public\.shows/i.test(text) ||
      /select\s+1\s+from\s+public\.admin_alerts/i.test(text) ||
      /select\s+1\s+from\s+public\.pending_ingestions/i.test(text)
    ) {
      return Promise.resolve((options.current ?? true) ? [{ current: true }] : []);
    }
    if (/from\s+public\.admin_emails/i.test(text)) {
      return Promise.resolve([{ active: true }]);
    }
    if (
      /insert\s+into\s+public\.email_deliveries/i.test(text) &&
      /status\s*=\s*'sent'/i.test(text)
    ) {
      state.sentRows.push({ values });
      return Promise.resolve([{ id: "sent" }]);
    }
    if (
      /insert\s+into\s+public\.email_deliveries/i.test(text) &&
      /status\s*=\s*'failed'/i.test(text)
    ) {
      state.failedRows.push({ values });
      return Promise.resolve([{ id: "failed" }]);
    }
    return Promise.resolve([]);
  }) as unknown as DeliverySql;
  return { sql, state };
}

function sender() {
  const sends: SendArgs[] = [];
  const sendEmail = vi.fn(async (args: SendArgs): Promise<SendResult> => {
    sends.push(args);
    return { ok: true, messageId: `msg-${sends.length}` };
  });
  return { sendEmail, sends };
}

describe("single-flight guard (batching spec §2.1b)", () => {
  test("contended lock skips everything: lockSkipped result, zero sends, zero ledger writes", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate(1)], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql({ locked: false }) },
    );

    expect(result).toEqual({
      kind: "ok",
      sent: 0,
      failed: 0,
      skipped: 0,
      retryLater: 0,
      lockSkipped: true,
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
  });

  test("heartbeat cadence: one per candidate eligibility check plus one per batch send", async () => {
    const { sql } = fakeSql();
    const { sendEmail } = sender();
    const lock = fakeLockSql();

    await deliverRealtimeCandidates(
      {
        candidates: [undoCandidate(1), undoCandidate(2), showCandidate(1)],
        recipients: [RECIPIENT],
        origin: ORIGIN,
      },
      { sql, sendEmail, lockSql: lock },
    );

    expect(sendEmail).toHaveBeenCalledTimes(2); // published batch + sync_problems batch
    expect(lock.heartbeatCount()).toBe(6); // 1 active check + 3 eligibility checks + 2 sends
  });

  test("sends-free pass still heartbeats per candidate (lock never idles unbounded)", async () => {
    const { sql } = fakeSql({ current: false });
    const { sendEmail } = sender();
    const lock = fakeLockSql();

    const result = await deliverRealtimeCandidates(
      {
        candidates: [showCandidate(1), showCandidate(2), showCandidate(3)],
        recipients: [RECIPIENT],
        origin: ORIGIN,
      },
      { sql, sendEmail, lockSql: lock },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 0, skipped: 3 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(lock.heartbeatCount()).toBe(4); // 1 active check + one per skipped candidate, zero sends
  });

  test("heartbeat failure during ELIGIBILITY aborts cleanly before any send", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender();
    const lock = fakeLockSql({ heartbeatFailsAt: 1 });

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate(1)], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: lock },
    );

    expect(result).toEqual({ kind: "infra_error" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.sentRows).toHaveLength(0);
  });

  test("heartbeat failure aborts the pass: infra_error, one send, later batches untouched", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender();
    // Sequence: active check, elig undo1, elig undo2, SEND published, elig show1, SEND sync.
    // Failing at heartbeat 5 aborts after the first batch's send, before the second's.
    const lock = fakeLockSql({ heartbeatFailsAt: 5 });

    const result = await deliverRealtimeCandidates(
      {
        candidates: [undoCandidate(1), undoCandidate(2), showCandidate(1)],
        recipients: [RECIPIENT],
        origin: ORIGIN,
      },
      { sql, sendEmail, lockSql: lock },
    );

    expect(result).toEqual({ kind: "infra_error" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // first batch (published, 2 members) persisted; sync_problems batch never sent
    expect(state.sentRows).toHaveLength(2);
  });

  test("non-contended result carries no lockSkipped key", async () => {
    const { sql } = fakeSql();
    const { sendEmail } = sender();

    const result = await deliverRealtimeCandidates(
      { candidates: [showCandidate(1)], recipients: [RECIPIENT], origin: ORIGIN },
      { sql, sendEmail, lockSql: fakeLockSql() },
    );

    expect(result).toEqual({ kind: "ok", sent: 1, failed: 0, skipped: 0, retryLater: 0 });
    expect("lockSkipped" in result).toBe(false);
  });
});

describe("single-holder topology pin (batching spec §2.1b, AGENTS.md invariant-2 discipline)", () => {
  const KEY = "notify:realtime-delivery";

  function walk(dir: string, ext: string): string[] {
    return fs
      .readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(ext))
      .map((entry) => path.join(dir, entry));
  }

  test(`exactly one holder of ${KEY}, xact-scoped, no session-level variant anywhere`, () => {
    const root = path.resolve(__dirname, "../..");
    const files = [
      ...walk(path.join(root, "lib"), ".ts"),
      ...walk(path.join(root, "supabase"), ".sql"),
    ];
    const holders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      if (!content.includes(KEY)) continue;
      holders.push(path.relative(root, file));
      const tryLockCount = content.split(`pg_try_advisory_xact_lock(hashtext('${KEY}'`).length - 1;
      expect({ file: path.relative(root, file), tryLockCount }).toEqual({
        file: "lib/notify/deliver.ts",
        tryLockCount: 1,
      });
      expect(content).not.toContain(`pg_advisory_lock(hashtext('${KEY}'`);
      expect(content).not.toContain(`pg_advisory_unlock(hashtext('${KEY}'`);
    }
    expect(holders).toEqual(["lib/notify/deliver.ts"]);
  });
});
