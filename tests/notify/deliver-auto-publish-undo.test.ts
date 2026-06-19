import { describe, expect, test, vi } from "vitest";
import { deliverRealtimeCandidates, type DeliverySql } from "@/lib/notify/deliver";
import type { AutoPublishUndoCandidate, RealtimeCandidate } from "@/lib/notify/detect/candidates";
import type { SendArgs, SendResult } from "@/lib/notify/send";
import {
  bindingMatchesActiveAdmin,
  mintIdFor,
  recipientBindingFor,
} from "@/lib/sync/unpublishBinding";

const ORIGIN = "https://crew.fxav.app";
const SHOW_ID = "00000000-0000-4000-8000-000000000071";
const TOKEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MINT_ID = mintIdFor(TOKEN);
const EXPIRES = new Date("2026-06-13T18:00:00.000Z");

function undoCandidate(
  overrides: Partial<AutoPublishUndoCandidate> = {},
): AutoPublishUndoCandidate {
  return {
    kind: "auto_publish_undo",
    dedupKey: `${SHOW_ID}:${MINT_ID}`,
    showId: SHOW_ID,
    slug: "spring-tour",
    showTitle: "Spring Tour",
    token: TOKEN,
    mintId: MINT_ID,
    expiresAt: EXPIRES,
    ...overrides,
  };
}

function showCandidate(): RealtimeCandidate {
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
  };
}

type FakeSqlOptions = { current?: boolean; active?: boolean };

// Mirrors tests/notify/deliver.test.ts's fakeSql, plus the undo currentness
// query against public.shows (the §4.3 deliver-time guard re-read).
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
      const key = ledgerKey(values[0], values[1], values[3]);
      const prior = state.ledger.get(key);
      state.ledger.set(key, { status: "failed", attempt_count: (prior?.attempt_count ?? 0) + 1 });
      return Promise.resolve([{ id: "failed" }]);
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

const rOf = (text: string) => /[?&]r=([0-9a-f]{16})/.exec(text)?.[1] ?? "";

describe("auto_publish_undo per-recipient rendering seam (spec §4.3 R17)", () => {
  test("two active recipients receive two DISTINCT URLs; each r validates only for its own recipient; revoking B kills B's r while A's still validates (helper-level)", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail, sends } = sender([
      { ok: true, messageId: "msg-a" },
      { ok: true, messageId: "msg-b" },
    ]);

    const result = await deliverRealtimeCandidates(
      // Raw-cased recipient pins that rendering happens AFTER canonicalization.
      {
        candidates: [undoCandidate()],
        recipients: [" Doug@FXAV.NET ", "amy@fxav.net"],
        origin: ORIGIN,
      },
      { sql, sendEmail },
    );

    expect(result).toMatchObject({ kind: "ok", sent: 2 });
    expect(sends).toHaveLength(2);
    const rA = rOf(sends[0]!.text);
    const rB = rOf(sends[1]!.text);
    expect(rA).toMatch(/^[0-9a-f]{16}$/);
    expect(rB).toMatch(/^[0-9a-f]{16}$/);
    expect(rA).not.toBe(rB);

    // Each r is the canonical recipient's binding (data-source assertion).
    expect(rA).toBe(recipientBindingFor("doug@fxav.net", SHOW_ID, MINT_ID));
    expect(rB).toBe(recipientBindingFor("amy@fxav.net", SHOW_ID, MINT_ID));

    // Validation: each r passes bindingMatchesActiveAdmin against the active set.
    const rows = [{ email: "doug@fxav.net" }, { email: "amy@fxav.net" }];
    expect(bindingMatchesActiveAdmin(rows, rA, SHOW_ID, MINT_ID)).toBe(true);
    expect(bindingMatchesActiveAdmin(rows, rB, SHOW_ID, MINT_ID)).toBe(true);
    // Revoking B (helper-level: B's row gone from the unrevoked set) kills rB
    // while rA keeps validating.
    const withoutB = [{ email: "doug@fxav.net" }];
    expect(bindingMatchesActiveAdmin(withoutB, rA, SHOW_ID, MINT_ID)).toBe(true);
    expect(bindingMatchesActiveAdmin(withoutB, rB, SHOW_ID, MINT_ID)).toBe(false);

    // Both ledger rows carry the undo kind.
    expect(state.sentRows).toHaveLength(2);
    for (const row of state.sentRows) expect(row.values).toContain("auto_publish_undo");
  });

  test("other kinds keep candidate-level rendering: identical bodies across recipients, no r param", async () => {
    const { sql } = fakeSql();
    const { sendEmail, sends } = sender([
      { ok: true, messageId: "msg-1" },
      { ok: true, messageId: "msg-2" },
    ]);

    await deliverRealtimeCandidates(
      {
        candidates: [showCandidate()],
        recipients: ["doug@fxav.net", "amy@fxav.net"],
        origin: ORIGIN,
      },
      { sql, sendEmail },
    );

    expect(sends).toHaveLength(2);
    expect(sends[0]!.html).toBe(sends[1]!.html);
    expect(sends[0]!.text).toBe(sends[1]!.text);
    expect(rOf(sends[0]!.text)).toBe("");
  });

  test("base idempotency key carries the auto_publish_undo kind", async () => {
    const { sql } = fakeSql();
    const { sendEmail, sends } = sender([{ ok: true, messageId: "msg-1" }]);

    await deliverRealtimeCandidates(
      { candidates: [undoCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail },
    );

    expect(sends[0]!.idempotencyKey).toMatch(/^fxav:auto_publish_undo:/);
  });
});

describe("auto_publish_undo ledger row (spec §4.3 R14 — token hygiene both directions)", () => {
  test("sent row: kind/show_id/triggered_codes and context EXACTLY {slug,title,expires_at,mintId}; raw token absent from the whole serialized row AND the dedup key; mintId present", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([{ ok: true, messageId: "msg-1" }]);
    const candidate = undoCandidate();

    await deliverRealtimeCandidates(
      { candidates: [candidate], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail },
    );

    expect(state.sentRows).toHaveLength(1);
    const values = state.sentRows[0]!.values;
    expect(values).toEqual(
      expect.arrayContaining(["auto_publish_undo", candidate.dedupKey, SHOW_ID, "doug@fxav.net"]),
    );
    const codes = values.find((v): v is string[] => Array.isArray(v));
    expect(codes).toEqual(["SHOW_FIRST_PUBLISHED"]);

    const context = values.find(
      (v): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v),
    );
    expect(context).toBeDefined();
    // EXACT shape (R14): these four keys and nothing else.
    expect(Object.keys(context!).sort()).toEqual(["expires_at", "mintId", "slug", "title"]);
    expect(context).toEqual({
      slug: "spring-tour",
      title: "Spring Tour",
      expires_at: EXPIRES.toISOString(),
      mintId: MINT_ID,
    });

    // Token hygiene BOTH directions over the ENTIRE row write.
    const serialized = JSON.stringify(values);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).toContain(MINT_ID);
    expect(candidate.dedupKey).not.toContain(TOKEN);
  });

  test("failed row + EMAIL_DELIVERY_FAILED alert carry the same exact context, never the raw token", async () => {
    const { sql, state } = fakeSql();
    const { sendEmail } = sender([{ ok: false, kind: "infra_error", message: "provider down" }]);
    const upsertAdminAlert = vi.fn(async () => null);

    const result = await deliverRealtimeCandidates(
      { candidates: [undoCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail, upsertAdminAlert },
    );

    expect(result).toMatchObject({ kind: "ok", failed: 1 });
    expect(state.failedRows).toHaveLength(1);
    const serialized = JSON.stringify(state.failedRows[0]!.values);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).toContain(MINT_ID);
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: SHOW_ID,
      code: "EMAIL_DELIVERY_FAILED",
      context: {
        slug: "spring-tour",
        title: "Spring Tour",
        expires_at: EXPIRES.toISOString(),
        mintId: MINT_ID,
      },
    });
    expect(JSON.stringify(upsertAdminAlert.mock.calls)).not.toContain(TOKEN);
  });
});

describe("auto_publish_undo deliver-time currentness guard (spec §4.3)", () => {
  test("non-current show (consumed/expired/re-minted/unpublished/archived re-read) skips: no send, no ledger row, no render", async () => {
    const { sql, state } = fakeSql({ current: false });
    const { sendEmail } = sender([{ ok: true, messageId: "msg-1" }]);

    const result = await deliverRealtimeCandidates(
      { candidates: [undoCandidate()], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail },
    );

    expect(result).toMatchObject({ kind: "ok", skipped: 1, sent: 0, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(state.sentRows).toHaveLength(0);
    expect(state.failedRows).toHaveLength(0);
  });

  test("guard re-reads the show with FULL token equality, same expires_at (ms), unexpired, published, !archived", async () => {
    const { sql, calls } = fakeSql();
    const { sendEmail } = sender([{ ok: true, messageId: "msg-1" }]);
    const candidate = undoCandidate();

    await deliverRealtimeCandidates(
      { candidates: [candidate], recipients: ["doug@fxav.net"], origin: ORIGIN },
      { sql, sendEmail },
    );

    const guard = calls.find((c) => /select\s+1\s+from\s+public\.shows/i.test(c.text));
    expect(guard).toBeDefined();
    expect(guard!.text).toMatch(/unpublish_token/);
    expect(guard!.text).toMatch(/unpublish_token_expires_at\s*>\s*now\(\)/i);
    expect(guard!.text).toMatch(/published\s+is\s+true/i);
    expect(guard!.text).toMatch(/archived\s+is\s+false/i);
    // Full token equality + exact expiry: the in-memory candidate's values are
    // the comparison operands (parameterized, never interpolated).
    expect(guard!.values).toContain(candidate.token);
    expect(guard!.values).toContain(candidate.expiresAt.getTime());
    expect(guard!.values).toContain(candidate.showId);
  });
});
