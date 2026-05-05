import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

const mockState = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; params: Record<string, unknown> }>,
  rpcError: null as null | { message: string },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      mockState.rpcCalls.push({ name, params });
      return { data: "alert-id", error: mockState.rpcError };
    },
  }),
}));

describe("upsertAdminAlert", () => {
  beforeEach(() => {
    mockState.rpcCalls = [];
    mockState.rpcError = null;
  });

  test("calls the SQL helper that implements §4.6 recurrence coalescing", async () => {
    const { upsertAdminAlert } = await import("@/lib/adminAlerts/upsertAdminAlert");

    await upsertAdminAlert({
      showId: "11111111-1111-4111-8111-111111111111",
      code: "AMBIGUOUS_EMAIL_BINDING",
      context: { email: "alice@fxav.test" },
    });

    expect(mockState.rpcCalls).toEqual([
      {
        name: "upsert_admin_alert",
        params: {
          p_show_id: "11111111-1111-4111-8111-111111111111",
          p_code: "AMBIGUOUS_EMAIL_BINDING",
          p_context: { email: "alice@fxav.test" },
        },
      },
    ]);
  });

  test("throws when the SQL helper returns an error", async () => {
    const { upsertAdminAlert } = await import("@/lib/adminAlerts/upsertAdminAlert");
    mockState.rpcError = { message: "rls denied" };

    await expect(
      upsertAdminAlert({
        showId: null,
        code: "LEAKED_LINK_REVOCATION_FAILED",
        context: { source: "leaked_link_revocation" },
      }),
    ).rejects.toThrow("admin alert upsert failed");
  });

  test("migration uses the spec §4.6 partial-index conflict target and recurrence update", () => {
    const sql = readFileSync(
      "supabase/migrations/20260505000000_upsert_admin_alert.sql",
      "utf8",
    );

    expect(sql).toMatch(
      /on\s+conflict\s*\(\s*coalesce\s*\(\s*show_id::text\s*,\s*''\s*\)\s*,\s*code\s*\)\s*where\s+resolved_at\s+is\s+null/i,
    );
    expect(sql).toMatch(/last_seen_at\s*=\s*now\s*\(\s*\)/i);
    expect(sql).toMatch(
      /occurrence_count\s*=\s*public\.admin_alerts\.occurrence_count\s*\+\s*1/i,
    );
    expect(sql).toMatch(/context\s*=\s*excluded\.context/i);
  });

  test("production admin_alerts producers route through the coalescing helper", () => {
    const files = [
      "lib/auth/validateGoogleSession.ts",
      "middleware.ts",
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      expect(
        source,
        `${file} must not bypass upsertAdminAlert(); raw Supabase upsert cannot express the admin_alerts partial-index recurrence contract`,
      ).not.toMatch(/\.from\(\s*["']admin_alerts["']\s*\)[\s\S]*?\.upsert\s*\(/);
      expect(source).toMatch(/upsertAdminAlert/);
    }
  });
});
