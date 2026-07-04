import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";
import { hashForLog } from "@/lib/email/hashForLog";

// Audit finding #4 + "missing error serialization" + #20 invariant-9 hardening.
// validateGoogleSession has SIX ADMIN_SESSION_LOOKUP_FAILED emits; pre-fix all
// six dropped the caught/returned error, so a missing-env / getUser-threw /
// getUser-returned-error / crew-lookup-returned-error / crew-lookup-threw /
// ambiguous-alert-threw fault were indistinguishable in app_events. Each must
// now carry a serialized context.error + a distinct `stage`, and each awaited
// emit must be wrapped (invariant 9).

function makeReturnedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

const state = vi.hoisted(() => ({
  constructThrow: null as Error | null,
  getUserThrow: null as Error | null,
  getUserReturnedError: null as Error | null,
  userEmail: null as string | null,
  crewReturnedError: null as Error | null,
  crewThrow: null as Error | null,
  crewRows: [] as Array<{ id: string; show_id: string; email: string }>,
  alertThrow: null as Error | null,
}));

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: async () => {
    if (state.alertThrow) throw state.alertThrow;
    return "alert-id";
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.constructThrow) throw state.constructThrow;
    return {
      auth: {
        getUser: async () => {
          if (state.getUserThrow) throw state.getUserThrow;
          return {
            data: state.userEmail
              ? { user: { id: "auth-user-1", email: state.userEmail } }
              : { user: null },
            error: state.getUserReturnedError,
          };
        },
      },
    };
  },
  createSupabaseServiceRoleClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        eq() {
          return this;
        },
        then(resolve: (v: { data: unknown; error: Error | null }) => void) {
          if (state.crewThrow) throw state.crewThrow;
          resolve({ data: state.crewRows, error: state.crewReturnedError });
        },
      }),
    }),
  }),
}));

async function withCapture(
  fn: (
    sink: LogRecord[],
    validateGoogleSession: typeof import("@/lib/auth/validateGoogleSession").validateGoogleSession,
  ) => Promise<void>,
) {
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  const { validateGoogleSession } = await import("@/lib/auth/validateGoogleSession");
  try {
    await fn(sink, validateGoogleSession);
  } finally {
    log.resetLogSink();
  }
}

const showId = "22222222-2222-4222-8222-222222222222";
function req() {
  return new Request("https://crew.fxav.show");
}

function lastFailure(sink: LogRecord[]): LogRecord {
  const rec = [...sink]
    .reverse()
    .find(
      (r) =>
        r.level === "error" &&
        r.source === "auth/validateGoogleSession" &&
        r.code === "ADMIN_SESSION_LOOKUP_FAILED",
    );
  expect(rec, "no ADMIN_SESSION_LOOKUP_FAILED error emitted").toBeDefined();
  return rec!;
}

beforeEach(() => {
  state.constructThrow = null;
  state.getUserThrow = null;
  state.getUserReturnedError = null;
  state.userEmail = null;
  state.crewReturnedError = null;
  state.crewThrow = null;
  state.crewRows = [];
  state.alertThrow = null;
});
afterEach(() => vi.clearAllMocks());

describe("validateGoogleSession telemetry (finding #4)", () => {
  test("client construction threw → stage:client_construction_threw + serialized error", async () => {
    await withCapture(async (sink, validateGoogleSession) => {
      state.constructThrow = new Error("no SUPABASE_URL");
      const r = await validateGoogleSession(req(), { showId });
      expect(r).toMatchObject({ kind: "terminal_failure", status: 500 });
      const rec = lastFailure(sink);
      expect(rec.context.stage).toBe("client_construction_threw");
      expect((rec.context.error as { message?: string }).message).toBe("no SUPABASE_URL");
    });
  });

  test("getUser threw → stage:get_user_threw + serialized error", async () => {
    await withCapture(async (sink, validateGoogleSession) => {
      state.getUserThrow = new Error("getUser abort");
      const r = await validateGoogleSession(req(), { showId });
      expect(r).toMatchObject({ kind: "terminal_failure", status: 500 });
      const rec = lastFailure(sink);
      expect(rec.context.stage).toBe("get_user_threw");
      expect((rec.context.error as { message?: string }).message).toBe("getUser abort");
    });
  });

  test("getUser returned-error → stage:get_user_returned_error + serialized error", async () => {
    await withCapture(async (sink, validateGoogleSession) => {
      state.getUserReturnedError = makeReturnedError("AuthApiError", "getUser 500");
      const r = await validateGoogleSession(req(), { showId });
      expect(r).toMatchObject({ kind: "terminal_failure", status: 500 });
      const rec = lastFailure(sink);
      expect(rec.context.stage).toBe("get_user_returned_error");
      expect((rec.context.error as { message?: string }).message).toBe("getUser 500");
    });
  });

  test("crew lookup returned-error → stage:crew_lookup_returned_error + serialized error", async () => {
    await withCapture(async (sink, validateGoogleSession) => {
      state.userEmail = "alice@fxav.net";
      state.crewReturnedError = makeReturnedError("PostgrestError", "crew select failed");
      const r = await validateGoogleSession(req(), { showId });
      expect(r).toMatchObject({ kind: "terminal_failure", status: 500 });
      const rec = lastFailure(sink);
      expect(rec.context.stage).toBe("crew_lookup_returned_error");
      expect((rec.context.error as { message?: string }).message).toBe("crew select failed");
    });
  });

  test("crew lookup threw → stage:crew_lookup_threw + serialized error", async () => {
    await withCapture(async (sink, validateGoogleSession) => {
      state.userEmail = "alice@fxav.net";
      state.crewThrow = new Error("crew query threw");
      const r = await validateGoogleSession(req(), { showId });
      expect(r).toMatchObject({ kind: "terminal_failure", status: 500 });
      const rec = lastFailure(sink);
      expect(rec.context.stage).toBe("crew_lookup_threw");
      expect((rec.context.error as { message?: string }).message).toBe("crew query threw");
    });
  });

  test("ambiguous-email alert threw → stage:ambiguous_alert_threw + serialized error", async () => {
    await withCapture(async (sink, validateGoogleSession) => {
      state.userEmail = "alice@fxav.net";
      state.crewRows = [
        { id: "crew-a", show_id: showId, email: "alice@fxav.net" },
        { id: "crew-b", show_id: showId, email: "alice@fxav.net" },
      ];
      state.alertThrow = new Error("alert upsert threw");
      const r = await validateGoogleSession(req(), { showId });
      expect(r).toMatchObject({ kind: "terminal_failure", status: 500 });
      const rec = lastFailure(sink);
      expect(rec.context.stage).toBe("ambiguous_alert_threw");
      expect((rec.context.error as { message?: string }).message).toBe("alert upsert threw");
    });
  });

  // S4: the ambiguous-email terminal previously left a durable app_events row ONLY when
  // the alert THREW (the catch above logs stage:ambiguous_alert_threw). When the alert
  // SUCCEEDS, only the admin_alert (a separate channel) recorded it — no app_events trace.
  // A fail-open forensic warn (AMBIGUOUS_EMAIL_BINDING_DETECTED — DISTINCT from the §12.4
  // user-facing AMBIGUOUS_EMAIL_BINDING return code) now correlates the collision durably.
  const ambiguousRows = [
    { id: "crew-a", show_id: showId, email: "alice@fxav.net" },
    { id: "crew-b", show_id: showId, email: "alice@fxav.net" },
  ];

  test("ambiguous email (alert SUCCEEDS) → AMBIGUOUS_EMAIL_BINDING_DETECTED warn + unchanged terminal", async () => {
    await withCapture(async (sink, validateGoogleSession) => {
      state.userEmail = "alice@fxav.net";
      state.crewRows = ambiguousRows;
      // state.alertThrow stays null → the alert upsert SUCCEEDS.
      const r = await validateGoogleSession(req(), { showId });
      // Terminal return is byte-preserved: still the §12.4 catalog code.
      expect(r).toEqual({
        kind: "terminal_failure",
        status: 500,
        code: "AMBIGUOUS_EMAIL_BINDING",
      });
      const warns = sink.filter((x) => x.code === "AMBIGUOUS_EMAIL_BINDING_DETECTED");
      expect(warns).toHaveLength(1);
      expect(warns[0]!.level).toBe("warn");
      expect(warns[0]!.source).toBe("auth/validateGoogleSession");
      expect(warns[0]!.showId).toBe(showId);
      expect(warns[0]!.actorHash).toBe(hashForLog("alice@fxav.net"));
      expect(warns[0]!.actorHash).not.toBe("alice@fxav.net"); // hashed, never raw
      expect(warns[0]!.context.crewMemberCount).toBe(2);
    });
  });

  test("ambiguous email (alert THROWS) → stage logged, but NO AMBIGUOUS_EMAIL_BINDING_DETECTED", async () => {
    await withCapture(async (sink, validateGoogleSession) => {
      state.userEmail = "alice@fxav.net";
      state.crewRows = ambiguousRows;
      state.alertThrow = new Error("alert upsert threw");
      const r = await validateGoogleSession(req(), { showId });
      // The throws path returns ADMIN_SESSION_LOOKUP_FAILED BEFORE the detected-warn.
      expect(r).toMatchObject({ kind: "terminal_failure", code: "ADMIN_SESSION_LOOKUP_FAILED" });
      expect(sink.some((x) => x.code === "AMBIGUOUS_EMAIL_BINDING_DETECTED")).toBe(false);
      // Its own stage IS logged (the pre-existing durable trace for the throws path).
      expect(sink.some((x) => x.context.stage === "ambiguous_alert_threw")).toBe(true);
    });
  });

  // Anti-constant: two distinct faults → two distinct serialized context.error.
  test("two distinct faults → two distinct serialized context.error (not a constant)", async () => {
    let a: unknown;
    let b: unknown;
    await withCapture(async (sink, validateGoogleSession) => {
      state.constructThrow = new Error("fault-ALPHA");
      await validateGoogleSession(req(), { showId });
      a = lastFailure(sink).context.error;
    });
    state.constructThrow = null; // clear the first fault so the second branch is reached
    await withCapture(async (sink, validateGoogleSession) => {
      state.getUserThrow = new Error("fault-BRAVO");
      await validateGoogleSession(req(), { showId });
      b = lastFailure(sink).context.error;
    });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect((a as { message?: string }).message).toBe("fault-ALPHA");
    expect((b as { message?: string }).message).toBe("fault-BRAVO");
  });
});
