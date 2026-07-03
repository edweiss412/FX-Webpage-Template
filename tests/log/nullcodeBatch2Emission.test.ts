/**
 * BL-NULLCODE-STAMP-BATCH-2 — runtime emission tests.
 *
 * The structural AST guard in `_metaAdminOutcomeContract.test.ts` pins each of the
 * 35 forensic codes to its intended log.error/log.warn call. These runtime tests
 * are the belt-and-suspenders sink-delivery proof for the surfaces where the
 * structural placement is ambiguous or the response contract must stay intact:
 *  - selectIdentity: the ONE site whose message arg is itself an object literal
 *    (JSON.stringify(...)), so the guard can't prove the code lives in the FIELDS
 *    arg vs the message arg. This test proves it reaches the 2nd (fields) arg.
 *  - loadAppEvents / loadCronHealth: prove each registry entry has a real emission.
 *  - reap-stale-sessions: prove the forensic-log rename (REAP_STALE_SESSIONS_INFRA_FAILED)
 *    did NOT alter the returned response contract (still REAP_STALE_SESSIONS_FAILED).
 */
import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// loadAppEvents / loadCronHealth — force returned-error + thrown paths.
// ---------------------------------------------------------------------------

function appEventsErrorClient(error: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "gte", "ilike", "order", "or"]) b[m] = () => b;
  b.limit = () => Promise.resolve({ data: null, error });
  return { from: () => b };
}
const throwingClient = {
  from: () => {
    throw new Error("net reset");
  },
};

async function importLoadAppEvents(client: unknown, logError: (...a: unknown[]) => void) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: () => client }));
  vi.doMock("@/lib/log", () => ({
    log: { error: logError, warn: () => {}, info: () => {}, debug: () => {} },
  }));
  return (await import("@/lib/admin/loadAppEvents")).loadAppEvents;
}

async function importLoadCronHealth(client: unknown, logError: (...a: unknown[]) => void) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: () => client }));
  vi.doMock("@/lib/log", () => ({
    log: { error: logError, warn: () => {}, info: () => {}, debug: () => {} },
  }));
  return (await import("@/lib/admin/loadCronHealth")).loadCronHealth;
}

describe("loadAppEvents forensic codes", () => {
  test("returned {error} → log.error fields carry APP_EVENTS_READ_RETURNED_ERROR", async () => {
    const logError = vi.fn();
    const loadAppEvents = await importLoadAppEvents(
      appEventsErrorClient({ message: "boom" }),
      logError,
    );
    const r = await loadAppEvents({});
    expect(r).toMatchObject({ kind: "infra_error" });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]![1]).toMatchObject({ code: "APP_EVENTS_READ_RETURNED_ERROR" });
  });

  test("thrown → log.error fields carry APP_EVENTS_READ_THREW", async () => {
    const logError = vi.fn();
    const loadAppEvents = await importLoadAppEvents(throwingClient, logError);
    const r = await loadAppEvents({});
    expect(r).toMatchObject({ kind: "infra_error" });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]![1]).toMatchObject({ code: "APP_EVENTS_READ_THREW" });
  });
});

describe("loadCronHealth forensic codes", () => {
  test("returned {error} → log.error fields carry CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR", async () => {
    const logError = vi.fn();
    const loadCronHealth = await importLoadCronHealth(
      appEventsErrorClient({ message: "boom" }),
      logError,
    );
    const r = await loadCronHealth();
    expect(r).toMatchObject({ kind: "infra_error" });
    expect(logError).toHaveBeenCalled();
    expect(logError.mock.calls[0]![1]).toMatchObject({
      code: "CRON_HEALTH_APP_EVENTS_READ_RETURNED_ERROR",
    });
  });

  test("thrown → log.error fields carry CRON_HEALTH_APP_EVENTS_READ_THREW", async () => {
    const logError = vi.fn();
    const loadCronHealth = await importLoadCronHealth(throwingClient, logError);
    const r = await loadCronHealth();
    expect(r).toMatchObject({ kind: "infra_error" });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]![1]).toMatchObject({ code: "CRON_HEALTH_APP_EVENTS_READ_THREW" });
  });
});

// ---------------------------------------------------------------------------
// selectIdentity — the tamper branch: code must land in the FIELDS (2nd) arg,
// NOT inside the JSON.stringify(...) message (1st) arg.
// ---------------------------------------------------------------------------

const SLUG = "show-one";
const TOKEN = "a".repeat(64);
const CREW_ID = "22222222-2222-2222-2222-222222222222";

async function importSelectIdentity(logWarn: (...a: unknown[]) => void) {
  vi.resetModules();
  process.env.PICKER_COOKIE_SIGNING_KEY = "0".repeat(64);
  vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
  vi.doMock("next/navigation", () => ({
    redirect: (path: string) => {
      const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
      error.digest = `NEXT_REDIRECT;replace;${path};false`;
      throw error;
    },
  }));
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ get: () => undefined, set: () => {} }),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServiceRoleClient: () => ({
      rpc: () => ({
        single: async () => ({
          data: {
            out_show_id: null,
            out_picker_epoch: null,
            out_observed_at_millis: null,
            out_rejection_code: "PICKER_IDENTITY_CLAIMED",
          },
          error: null,
        }),
      }),
    }),
  }));
  vi.doMock("@/lib/log", () => ({
    log: { warn: logWarn, error: () => {}, info: () => {}, debug: () => {} },
  }));
  return (await import("@/lib/auth/picker/selectIdentity")).selectIdentity;
}

describe("selectIdentity tamper forensic code", () => {
  test("PICKER_IDENTITY_CLAIMED_TAMPER lives in the fields (2nd) arg, not the JSON message", async () => {
    const logWarn = vi.fn();
    const selectIdentity = await importSelectIdentity(logWarn);
    const fd = new FormData();
    fd.set("slug", SLUG);
    fd.set("shareToken", TOKEN);
    fd.set("crewMemberId", CREW_ID);
    await expect(selectIdentity(fd)).rejects.toMatchObject({
      digest: expect.stringContaining("/auth/sign-in"),
    });
    expect(logWarn).toHaveBeenCalledTimes(1);
    const [message, fields] = logWarn.mock.calls[0]! as [string, Record<string, unknown>];
    // The code rides the fields object, alongside the reserved source.
    expect(fields).toMatchObject({
      code: "PICKER_IDENTITY_CLAIMED_TAMPER",
      source: "auth.picker.selectIdentity",
    });
    // Decisive: it must NOT be buried in the stringified message envelope.
    expect(message).not.toContain("PICKER_IDENTITY_CLAIMED_TAMPER");
    const parsed = JSON.parse(message) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("code");
  });
});

// ---------------------------------------------------------------------------
// reap-stale-sessions — forensic-log rename must not touch the response contract.
// ---------------------------------------------------------------------------

async function importReap(logError: (...a: unknown[]) => void) {
  vi.resetModules();
  vi.doMock("@/lib/log", () => ({
    log: { error: logError, warn: () => {}, info: () => {}, debug: () => {} },
  }));
  return (await import("@/app/api/admin/onboarding/reap-stale-sessions/route"))
    .handleReapStaleSessions;
}

describe("reap-stale-sessions forensic code + unchanged response contract", () => {
  test("catch logs REAP_STALE_SESSIONS_INFRA_FAILED but the 500 body still returns REAP_STALE_SESSIONS_FAILED", async () => {
    const logError = vi.fn();
    const handleReapStaleSessions = await importReap(logError);
    const cause = new Error("connection reset");
    const response = await handleReapStaleSessions(new Request("http://test"), {
      requireAdminIdentity: async () => ({ email: "admin@example.com" }),
      reapStaleOnboardingSessions: async () => {
        throw cause;
      },
    });
    expect(response.status).toBe(500);
    // Response contract unchanged — the returned producer code is NOT the forensic rename.
    expect(await response.json()).toEqual({ ok: false, code: "REAP_STALE_SESSIONS_FAILED" });
    // Forensic log gains the discriminable infra code.
    expect(logError).toHaveBeenCalledTimes(1);
    const [message, fields] = logError.mock.calls[0]! as [string, Record<string, unknown>];
    expect(message).toBe("reap-stale-sessions failed");
    expect(fields).toMatchObject({ code: "REAP_STALE_SESSIONS_INFRA_FAILED" });
  });
});
