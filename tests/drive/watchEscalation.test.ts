import { describe, expect, test, vi } from "vitest";
import { maybeEscalateWatchOrphaned } from "@/lib/drive/watchEscalation";
import { ESCALATION_AFTER_MS } from "@/lib/drive/watchErrors";

const ALERT = (
  over: Partial<{
    id: string;
    occurrence_count: number;
    raised_at: string;
    context: Record<string, unknown>;
  }> = {},
) => ({
  id: "alert-1",
  occurrence_count: 3,
  // Default: past the escalation window relative to the REAL clock, so the
  // pre-existing suites (which assume "ALERT() is due") keep their premise
  // under the duration trigger.
  raised_at: new Date(Date.now() - ESCALATION_AFTER_MS - 60_000).toISOString(),
  context: { error_class: "drive_api" },
  ...over,
});

function makeDeps(over: Record<string, unknown> = {}) {
  return {
    readUnresolvedWatchAlert: vi.fn().mockResolvedValue(ALERT()),
    hasEscalationFired: vi.fn().mockResolvedValue(false),
    persistAppEventStrict: vi.fn().mockResolvedValue({ ok: true }),
    captureException: vi.fn(),
    configValid: vi.fn().mockReturnValue({ ok: true }),
    getAlertOnSyncProblems: vi.fn().mockResolvedValue({ kind: "value", enabled: true }),
    activeRecipients: vi.fn().mockResolvedValue({ kind: "ok", recipients: ["a@x.com", "b@x.com"] }),
    sendEmail: vi.fn().mockResolvedValue({ ok: true, messageId: "m1" }),
    ...over,
  };
}

describe("maybeEscalateWatchOrphaned", () => {
  test("below threshold, non-config → no escalation, no reads consumed", async () => {
    const deps = makeDeps({
      readUnresolvedWatchAlert: vi
        .fn()
        .mockResolvedValue(ALERT({ raised_at: new Date(Date.now() - 60_000).toISOString() })),
    });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r).toEqual({ escalated: false, faults: [] });
    expect(deps.persistAppEventStrict).not.toHaveBeenCalled();
  });
  test("config class escalates at count 1", async () => {
    const deps = makeDeps({
      readUnresolvedWatchAlert: vi
        .fn()
        .mockResolvedValue(ALERT({ occurrence_count: 1, context: { error_class: "config" } })),
    });
    expect(
      (await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps)).escalated,
    ).toBe(true);
  });
  test("existing guard row → zero sends, zero guard writes (fired-once across restarts)", async () => {
    const deps = makeDeps({ hasEscalationFired: vi.fn().mockResolvedValue(true) });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r.escalated).toBe(false);
    expect(deps.persistAppEventStrict).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  test("still fires above threshold when no guard exists (multi-bump robustness)", async () => {
    const deps = makeDeps({
      readUnresolvedWatchAlert: vi
        .fn()
        .mockResolvedValue(ALERT({ occurrence_count: 7 })),
    });
    expect(
      (await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps)).escalated,
    ).toBe(true);
  });
  test("R6-1: recheck read failure aborts BEFORE the guard write; retryable next cycle", async () => {
    // recheck = second readUnresolvedWatchAlert call
    const read = vi
      .fn()
      .mockResolvedValueOnce(ALERT())
      .mockResolvedValueOnce("infra_error" as const);
    const deps = makeDeps({ readUnresolvedWatchAlert: read });
    const r1 = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r1).toEqual({ escalated: false, faults: ["alert_row_read"] });
    expect(deps.persistAppEventStrict).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    // cycle 2: recheck succeeds → full fire (two-cycle retryability, spec §4.4)
    const deps2 = makeDeps();
    const r2 = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps2);
    expect(r2.escalated).toBe(true);
    expect(deps2.persistAppEventStrict).toHaveBeenCalledTimes(1);
    expect(deps2.sendEmail).toHaveBeenCalledTimes(2);
  });
  test("R5-2: alert resolved at recheck → benign abort, no guard, no sends, no fault", async () => {
    const read = vi.fn().mockResolvedValueOnce(ALERT()).mockResolvedValueOnce(null);
    const deps = makeDeps({ readUnresolvedWatchAlert: read });
    expect(
      await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps),
    ).toEqual({ escalated: false, faults: [] });
    expect(deps.persistAppEventStrict).not.toHaveBeenCalled();
  });
  test("guard write failure → guard_write fault, zero sends", async () => {
    const deps = makeDeps({
      persistAppEventStrict: vi.fn().mockResolvedValue({ ok: false, error: "x" }),
    });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r).toEqual({ escalated: false, faults: ["guard_write"] });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  test("Sentry throwing never breaks the cycle", async () => {
    const deps = makeDeps({
      captureException: vi.fn(() => {
        throw new Error("sentry down");
      }),
    });
    expect(
      (await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps)).escalated,
    ).toBe(true);
  });
  test("configValid false → deliberate email skip, not a fault; Sentry still fired; pref NOT read (gate order)", async () => {
    // R1(plan)-4 failure mode: with Resend unconfigured AND the pref read faulting,
    // a wrong gate order emits a false pref_read infra fault.
    const deps = makeDeps({
      configValid: vi.fn().mockReturnValue({ ok: false, reason: "unconfigured" }),
      getAlertOnSyncProblems: vi.fn().mockResolvedValue({ kind: "infra_error" }),
    });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    expect(r).toEqual({ escalated: true, faults: [] });
    expect(deps.captureException).toHaveBeenCalled();
    expect(deps.getAlertOnSyncProblems).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  test("pref off → skip; pref infra_error → pref_read fault, no fail-open", async () => {
    const off = makeDeps({
      getAlertOnSyncProblems: vi.fn().mockResolvedValue({ kind: "value", enabled: false }),
    });
    expect(
      (await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, off)).faults,
    ).toEqual([]);
    expect(off.sendEmail).not.toHaveBeenCalled();
    const infra = makeDeps({
      getAlertOnSyncProblems: vi.fn().mockResolvedValue({ kind: "infra_error" }),
    });
    const r = await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, infra);
    expect(r.faults).toEqual(["pref_read"]);
    expect(infra.sendEmail).not.toHaveBeenCalled();
  });
  test("R3-3: recipients infra_error → recipients_read fault; zero recipients → benign skip", async () => {
    const infra = makeDeps({
      activeRecipients: vi.fn().mockResolvedValue({ kind: "infra_error" }),
    });
    expect(
      (await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, infra)).faults,
    ).toEqual(["recipients_read"]);
    const empty = makeDeps({
      activeRecipients: vi.fn().mockResolvedValue({ kind: "ok", recipients: [] }),
    });
    expect(
      (await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, empty)).faults,
    ).toEqual([]);
  });
  test("sendEmail mapping: retry_later benign; conflict/infra → email_send fault (once)", async () => {
    const retry = makeDeps({ sendEmail: vi.fn().mockResolvedValue({ ok: "retry_later" }) });
    expect(
      (await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, retry)).faults,
    ).toEqual([]);
    const bad = makeDeps({
      sendEmail: vi.fn().mockResolvedValue({ ok: false, kind: "infra_error", message: "x" }),
    });
    expect(
      (await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, bad)).faults,
    ).toEqual(["email_send"]);
  });
  test("idempotency key derives from alert row id + recipient", async () => {
    const deps = makeDeps();
    await maybeEscalateWatchOrphaned({ folderId: "folder-1", folderName: "F" }, deps);
    const call = (deps.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.idempotencyKey).toMatch(/^fxav:watch_escalation:/);
    expect(call.subject).toBe("FXAV: the live-updates connection needs attention (F)");
    expect((deps.captureException as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toMatchObject({
      extra: { watchedFolderId: "folder-1" },
    });
  });
});

// Backoff spec §3.5 / §6 class 8: escalation triggers on raised_at AGE, decoupled
// from occurrence_count. Real harness identifiers: makeDeps(over) + ALERT(over);
// each case injects `now` and a raised_at derived from ESCALATION_AFTER_MS.
describe("duration-based escalation trigger (backoff spec §3.5, class 8)", () => {
  const NOW = new Date("2026-07-27T12:00:00.000Z");
  const at = (ageMs: number) => new Date(NOW.getTime() - ageMs).toISOString();
  const INPUT = { folderId: "folder-1", folderName: "F" };
  const clocked = (alertOver: Record<string, unknown>) =>
    makeDeps({
      now: () => NOW,
      readUnresolvedWatchAlert: vi.fn().mockResolvedValue(ALERT(alertOver)),
    });

  test("fires at raised_at age >= window even at occurrence_count 1", async () => {
    const r = await maybeEscalateWatchOrphaned(
      INPUT,
      clocked({ raised_at: at(ESCALATION_AFTER_MS + 60_000), occurrence_count: 1 }),
    );
    expect(r.escalated).toBe(true);
  });

  test("fires at EXACTLY the window boundary (>= is normative; > would stay green without this pin)", async () => {
    const r = await maybeEscalateWatchOrphaned(
      INPUT,
      clocked({ raised_at: at(ESCALATION_AFTER_MS), occurrence_count: 1 }),
    );
    expect(r.escalated).toBe(true);
  });

  test("does NOT fire below the window even at occurrence_count 99 - the decoupling", async () => {
    const r = await maybeEscalateWatchOrphaned(
      INPUT,
      clocked({ raised_at: at(ESCALATION_AFTER_MS - 60_000), occurrence_count: 99 }),
    );
    expect(r.escalated).toBe(false);
  });

  test("config class fires at age 0", async () => {
    const r = await maybeEscalateWatchOrphaned(
      INPUT,
      clocked({ raised_at: at(0), occurrence_count: 1, context: { error_class: "config" } }),
    );
    expect(r.escalated).toBe(true);
  });

  test("email bodies carry the canonical backoff sentence in text AND html (spec §3.7)", async () => {
    const deps = clocked({ raised_at: at(ESCALATION_AFTER_MS + 60_000) });
    const r = await maybeEscalateWatchOrphaned(INPUT, deps);
    expect(r.escalated).toBe(true);
    const sendEmail = deps.sendEmail as ReturnType<typeof vi.fn>;
    const call = (sendEmail.mock.calls[0] as unknown[])[0] as { text: string; html: string };
    const SENTENCE =
      "FXAV keeps retrying the connection on its own, waiting longer between attempts the longer it fails.";
    expect(call.text).toContain(SENTENCE);
    expect(call.html).toContain(SENTENCE);
    expect(call.text).not.toContain("every hour");
    expect(call.html).not.toContain("every hour");
  });

  test("future raised_at (skew) does not fire", async () => {
    const r = await maybeEscalateWatchOrphaned(
      INPUT,
      clocked({ raised_at: at(-3_600_000), occurrence_count: 99 }),
    );
    expect(r.escalated).toBe(false);
  });
});
