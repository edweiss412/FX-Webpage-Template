import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

// Audit finding #4 + "missing error serialization" theme + #20 invariant-9
// hardening. The pre-fix isAdminSession logged ADMIN_SESSION_LOOKUP_FAILED with
// NO `error:` field, so serializeError never ran and every distinct infra fault
// (getUser returned-error / getUser threw / is_admin RPC returned-error /
// client-construction threw) collapsed to one opaque row. These tests force
// each infra branch and assert the emitted record carries:
//   - code === "ADMIN_SESSION_LOOKUP_FAILED"
//   - a NON-UNDEFINED, serialized context.error (name/message present)
//   - the branch-discriminating `stage`
// The load-bearing assertion: two DIFFERENT injected errors produce two
// DIFFERENT serialized context.error values — proving the error is captured,
// not a constant.

// Real Supabase AuthError/PostgrestError are Error subclasses at runtime, so a
// returned `{ error }` is an Error instance — serializeError extracts
// {name,message,stack}. Model that faithfully (a plain object would serialize
// to "[object Object]" and mask the message, which is NOT the production shape).
function makeReturnedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

const state = vi.hoisted(() => ({
  // getUser control
  getUserThrow: null as Error | null,
  getUserReturnedError: null as Error | null,
  userEmail: null as string | null,
  // is_admin RPC control
  rpcReturnedError: null as Error | null,
  rpcData: false as boolean,
  // construction control
  constructThrow: null as Error | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.constructThrow) throw state.constructThrow;
    return {
      auth: {
        getUser: async () => {
          if (state.getUserThrow) throw state.getUserThrow;
          return {
            data: state.userEmail ? { user: { email: state.userEmail } } : { user: null },
            error: state.getUserReturnedError,
          };
        },
      },
      rpc: async (_name: string) => ({
        data: state.rpcData,
        error: state.rpcReturnedError,
      }),
    };
  },
}));

async function withCapture(
  fn: (
    sink: LogRecord[],
    isAdminSession: typeof import("@/lib/auth/isAdminSession").isAdminSession,
  ) => Promise<void>,
) {
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  const { isAdminSession } = await import("@/lib/auth/isAdminSession");
  try {
    await fn(sink, isAdminSession);
  } finally {
    log.resetLogSink();
  }
}

function lastLookupFailure(sink: LogRecord[]): LogRecord {
  const rec = [...sink]
    .reverse()
    .find((r) => r.level === "error" && r.code === "ADMIN_SESSION_LOOKUP_FAILED");
  expect(rec, "no ADMIN_SESSION_LOOKUP_FAILED error emitted").toBeDefined();
  return rec!;
}

beforeEach(() => {
  state.getUserThrow = null;
  state.getUserReturnedError = null;
  state.userEmail = null;
  state.rpcReturnedError = null;
  state.rpcData = false;
  state.constructThrow = null;
});
afterEach(() => vi.clearAllMocks());

describe("isAdminSession telemetry (finding #4)", () => {
  test("getUser returned-error → serialized error + stage:get_user_returned_error", async () => {
    await withCapture(async (sink, isAdminSession) => {
      state.getUserReturnedError = makeReturnedError("AuthApiError", "boom-returned");
      const result = await isAdminSession(new Request("http://meta.test"));
      expect(result).toEqual({ ok: false, reason: "infra_error" });
      const rec = lastLookupFailure(sink);
      expect(rec.context.stage).toBe("get_user_returned_error");
      const err = rec.context.error as { name?: string; message?: string } | undefined;
      expect(err).toBeDefined();
      expect(err?.message).toBe("boom-returned");
    });
  });

  test("is_admin RPC returned-error → serialized error + stage:is_admin_returned_error", async () => {
    await withCapture(async (sink, isAdminSession) => {
      state.userEmail = "alice@fxav.net";
      state.rpcReturnedError = makeReturnedError("PostgrestError", "rpc-down");
      const result = await isAdminSession(new Request("http://meta.test"));
      expect(result).toEqual({ ok: false, reason: "infra_error" });
      const rec = lastLookupFailure(sink);
      expect(rec.context.stage).toBe("is_admin_returned_error");
      const err = rec.context.error as { message?: string } | undefined;
      expect(err?.message).toBe("rpc-down");
    });
  });

  test("client construction threw → serialized error + stage:lookup_threw", async () => {
    await withCapture(async (sink, isAdminSession) => {
      state.constructThrow = new Error("no SUPABASE_URL");
      const result = await isAdminSession(new Request("http://meta.test"));
      expect(result).toEqual({ ok: false, reason: "infra_error" });
      const rec = lastLookupFailure(sink);
      expect(rec.context.stage).toBe("lookup_threw");
      const err = rec.context.error as { message?: string } | undefined;
      expect(err?.message).toBe("no SUPABASE_URL");
    });
  });

  test("getUser threw (mid-flight) → serialized error + stage:lookup_threw", async () => {
    await withCapture(async (sink, isAdminSession) => {
      state.getUserThrow = new Error("getUser network abort");
      const result = await isAdminSession(new Request("http://meta.test"));
      expect(result).toEqual({ ok: false, reason: "infra_error" });
      const rec = lastLookupFailure(sink);
      expect(rec.context.stage).toBe("lookup_threw");
      const err = rec.context.error as { message?: string } | undefined;
      expect(err?.message).toBe("getUser network abort");
    });
  });

  // Load-bearing anti-constant assertion: two DIFFERENT injected errors must
  // produce two DIFFERENT serialized context.error values. A dropped error
  // (the pre-fix bug) would make both undefined/equal.
  test("two distinct faults → two distinct serialized context.error (not a constant)", async () => {
    let firstErr: unknown;
    let secondErr: unknown;
    await withCapture(async (sink, isAdminSession) => {
      state.getUserReturnedError = makeReturnedError("AuthApiError", "fault-ALPHA");
      await isAdminSession(new Request("http://meta.test"));
      firstErr = lastLookupFailure(sink).context.error;
    });
    await withCapture(async (sink, isAdminSession) => {
      state.constructThrow = new Error("fault-BRAVO");
      await isAdminSession(new Request("http://meta.test"));
      secondErr = lastLookupFailure(sink).context.error;
    });
    expect(firstErr).toBeDefined();
    expect(secondErr).toBeDefined();
    expect(JSON.stringify(firstErr)).not.toBe(JSON.stringify(secondErr));
    expect((firstErr as { message?: string }).message).toBe("fault-ALPHA");
    expect((secondErr as { message?: string }).message).toBe("fault-BRAVO");
  });
});
