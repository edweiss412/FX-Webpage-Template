import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

// Audit finding #4 + "missing error serialization" + #20 invariant-9 hardening.
// validateGoogleIdentity's two ADMIN_SESSION_LOOKUP_FAILED emits (getUser
// returned-error arm + top-level catch) dropped the error, collapsing distinct
// faults to one opaque row. Each must now carry a serialized context.error + a
// distinct `stage`, wrapped best-effort (invariant 9).

function makeReturnedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

const state = vi.hoisted(() => ({
  constructThrow: null as Error | null,
  getUserThrow: null as Error | null,
  getUserReturnedError: null as Error | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.constructThrow) throw state.constructThrow;
    return {
      auth: {
        getUser: async () => {
          if (state.getUserThrow) throw state.getUserThrow;
          return { data: { user: null }, error: state.getUserReturnedError };
        },
      },
    };
  },
  createSupabaseServiceRoleClient: () => ({
    from() {
      throw new Error("validateGoogleIdentity must not query");
    },
  }),
}));

async function withCapture(
  fn: (
    sink: LogRecord[],
    validateGoogleIdentity: typeof import("@/lib/auth/validateGoogleIdentity").validateGoogleIdentity,
  ) => Promise<void>,
) {
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  const { validateGoogleIdentity } = await import("@/lib/auth/validateGoogleIdentity");
  try {
    await fn(sink, validateGoogleIdentity);
  } finally {
    log.resetLogSink();
  }
}

function lastFailure(sink: LogRecord[]): LogRecord {
  const rec = [...sink]
    .reverse()
    .find(
      (r) =>
        r.level === "error" &&
        r.source === "auth/validateGoogleIdentity" &&
        r.code === "ADMIN_SESSION_LOOKUP_FAILED",
    );
  expect(rec, "no ADMIN_SESSION_LOOKUP_FAILED error emitted").toBeDefined();
  return rec!;
}

function req() {
  return new Request("https://crew.fxav.show/me");
}

beforeEach(() => {
  state.constructThrow = null;
  state.getUserThrow = null;
  state.getUserReturnedError = null;
});
afterEach(() => vi.clearAllMocks());

describe("validateGoogleIdentity telemetry (finding #4)", () => {
  test("getUser returned-error → stage:get_user_returned_error + serialized error", async () => {
    await withCapture(async (sink, validateGoogleIdentity) => {
      state.getUserReturnedError = makeReturnedError("AuthApiError", "getUser 500");
      const r = await validateGoogleIdentity(req());
      expect(r).toMatchObject({ kind: "terminal_failure", status: 500 });
      const rec = lastFailure(sink);
      expect(rec.context.stage).toBe("get_user_returned_error");
      expect((rec.context.error as { message?: string }).message).toBe("getUser 500");
    });
  });

  test("client construction / getUser threw → stage:lookup_threw + serialized error", async () => {
    await withCapture(async (sink, validateGoogleIdentity) => {
      state.constructThrow = new Error("no SUPABASE_URL");
      const r = await validateGoogleIdentity(req());
      expect(r).toMatchObject({ kind: "terminal_failure", status: 500 });
      const rec = lastFailure(sink);
      expect(rec.context.stage).toBe("lookup_threw");
      expect((rec.context.error as { message?: string }).message).toBe("no SUPABASE_URL");
    });
  });

  // Anti-constant: two distinct faults → two distinct serialized context.error.
  test("two distinct faults → two distinct serialized context.error (not a constant)", async () => {
    let a: unknown;
    let b: unknown;
    await withCapture(async (sink, validateGoogleIdentity) => {
      state.getUserReturnedError = makeReturnedError("AuthApiError", "fault-ALPHA");
      await validateGoogleIdentity(req());
      a = lastFailure(sink).context.error;
    });
    state.getUserReturnedError = null;
    await withCapture(async (sink, validateGoogleIdentity) => {
      state.constructThrow = new Error("fault-BRAVO");
      await validateGoogleIdentity(req());
      b = lastFailure(sink).context.error;
    });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect((a as { message?: string }).message).toBe("fault-ALPHA");
    expect((b as { message?: string }).message).toBe("fault-BRAVO");
  });
});
