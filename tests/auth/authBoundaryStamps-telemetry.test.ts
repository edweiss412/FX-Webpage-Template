import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

// S7 — eight auth-boundary null-code stamps. These are pure code-stamps on EXISTING emissions
// (plus one NEW silent-500 emission in subscriber-token), so the registry (Assertion 4) + producer
// scan cover the whole set structurally; here we behaviorally spot-check ≥3 representatives that the
// stamped/new code actually rides its emission at runtime: subscriber-token (new), sign-out,
// callback getUser. setLogSink capture — no @/lib/log mock.

const state = vi.hoisted(() => ({
  showRow: { id: "show-1" } as { id: string } | null,
  showError: null as unknown,
  signOutError: null as unknown,
  getUserError: null as unknown,
  userEmail: "crew@fxav.test" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ data: {}, error: null }),
      getUser: async () => ({
        data: { user: state.userEmail ? { email: state.userEmail } : null },
        error: state.getUserError,
      }),
      signOut: async () => ({ error: state.signOutError }),
    },
  }),
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.showRow, error: state.showError }) }),
      }),
    }),
    rpc: async () => ({ data: { claimed_rows: [] }, error: null }),
  }),
}));
vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => ({ ok: true, email: "a@x" }),
}));
vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({
  resolvePickerSelection: async () => ({ kind: "no_selection" }),
}));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: async () => "alert-id" }));

async function withCapture(fn: (sink: LogRecord[]) => Promise<void>) {
  vi.resetModules();
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  try {
    await fn(sink);
  } finally {
    log.resetLogSink();
  }
}

beforeEach(() => {
  state.showRow = { id: "show-1" };
  state.showError = null;
  state.signOutError = null;
  state.getUserError = null;
  state.userEmail = "crew@fxav.test";
});
afterEach(() => vi.clearAllMocks());

describe("S7 auth-boundary forensic stamps", () => {
  test("subscriber-token show-lookup infra fault → REALTIME_TOKEN_SHOW_LOOKUP_FAILED (silent 500)", async () => {
    await withCapture(async (sink) => {
      state.showError = { message: "db down" };
      const { POST } = await import("@/app/api/realtime/subscriber-token/route");
      const res = await POST(
        new Request("http://x/api/realtime/subscriber-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug: "rpas" }),
        }) as unknown as NextRequest,
      );
      expect(res.status).toBe(500); // status/body unchanged
      const rec = sink.filter((r) => r.code === "REALTIME_TOKEN_SHOW_LOOKUP_FAILED");
      expect(rec).toHaveLength(1);
      expect(rec[0]!.level).toBe("error");
    });
  });

  test("sign-out Supabase error → AUTH_SIGNOUT_FAILED", async () => {
    await withCapture(async (sink) => {
      state.signOutError = { message: "signout down" };
      const { POST } = await import("@/app/auth/sign-out/route");
      // Same-origin (no sec-fetch-site, no origin header) passes the CSRF gate.
      const res = await POST(new NextRequest("http://localhost/auth/sign-out", { method: "POST" }));
      expect(res.status).toBe(500);
      const rec = sink.filter((r) => r.code === "AUTH_SIGNOUT_FAILED");
      expect(rec.length).toBeGreaterThanOrEqual(1);
      expect(rec[0]!.level).toBe("error");
    });
  });

  test("callback getUser error → OAUTH_GETUSER_FAILED", async () => {
    await withCapture(async (sink) => {
      state.getUserError = { message: "getUser down" };
      const { GET } = await import("@/app/auth/callback/route");
      const res = await GET(
        new NextRequest("https://crew.fxav.test/auth/callback?code=abc&next=/me"),
      );
      expect(res.status).toBe(302); // callback still redirects — claim stamp is best-effort
      const rec = sink.filter((r) => r.code === "OAUTH_GETUSER_FAILED");
      expect(rec).toHaveLength(1);
      expect(rec[0]!.level).toBe("error");
    });
  });
});
