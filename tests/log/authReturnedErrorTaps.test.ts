// Behavioral coverage for the RETURNED-error infra arms (not just thrown paths) —
// whole-diff review HIGH finding: a Supabase call that returns { error } (the
// common failure mode) must also emit a structured log.
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

// Dynamic setLogSink import: after vi.resetModules() the producer-under-test gets
// a fresh @/lib/log instance, so the sink must be set on that same post-reset
// instance (call AFTER vi.doMock, BEFORE importing the producer).
async function capture(): Promise<LogRecord[]> {
  const r: LogRecord[] = [];
  const { setLogSink } = await import("@/lib/log");
  setLogSink((x) => {
    r.push(x);
  });
  return r;
}
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("validateGoogleSession returned-error arm", () => {
  test("crew_members query returns { error } → terminal_failure 500 AND emits error/auth/validateGoogleSession", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { email: "crew@example.com" } },
            error: null,
          }),
        },
      }),
      createSupabaseServiceRoleClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: null, error: { message: "boom" } }),
            }),
          }),
        }),
      }),
    }));
    const recs = await capture();
    const { validateGoogleSession } = await import("@/lib/auth/validateGoogleSession");
    const result = await validateGoogleSession(new Request("http://x"), { showId: "show-1" });
    expect(result).toMatchObject({
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    expect(
      recs.some(
        (r) =>
          r.level === "error" &&
          r.source === "auth/validateGoogleSession" &&
          r.code === "ADMIN_SESSION_LOOKUP_FAILED",
      ),
    ).toBe(true);
  });
});
