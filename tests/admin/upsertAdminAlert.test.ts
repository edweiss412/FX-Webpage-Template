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
        code: "PICKER_BOOTSTRAP_RPC_FAILED",
        context: { source: "picker_bootstrap" },
      }),
    ).rejects.toThrow("admin alert upsert failed");
  });

  test("migration uses the spec §4.6 partial-index conflict target and recurrence update", () => {
    const sql = readFileSync("supabase/migrations/20260505000000_upsert_admin_alert.sql", "utf8");

    expect(sql).toMatch(
      /on\s+conflict\s*\(\s*coalesce\s*\(\s*show_id::text\s*,\s*''\s*\)\s*,\s*code\s*\)\s*where\s+resolved_at\s+is\s+null/i,
    );
    expect(sql).toMatch(/last_seen_at\s*=\s*now\s*\(\s*\)/i);
    expect(sql).toMatch(/occurrence_count\s*=\s*public\.admin_alerts\.occurrence_count\s*\+\s*1/i);
    expect(sql).toMatch(/context\s*=\s*excluded\.context/i);
  });

  test("failedKeys-merge migration adds union-merge + debounce + WHERE-gated no-op (references p_context, not excluded.context)", () => {
    const rawSql = readFileSync(
      "supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql",
      "utf8",
    );
    // Strip `-- ...` line comments so the negative assertion below tests the SQL
    // BODY, not the explanatory header (which names `excluded.context` to document
    // why it is deliberately NOT used).
    const sql = rawSql.replace(/--.*$/gm, "");

    // backward-compatible create-or-replace of the SAME function signature
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.upsert_admin_alert\s*\(\s*p_show_id\s+uuid\s*,\s*p_code\s+text\s*,\s*p_context\s+jsonb/i,
    );
    // failedKeys guard (only failedKeys producers get the merge/debounce path)
    expect(sql).toMatch(/p_context\s*\?\s*'failedKeys'/);
    // union-merge: sorted distinct aggregation of the stored + incoming failedKeys
    expect(sql).toMatch(/jsonb_agg\s*\(\s*elem\s+order\s+by\s+elem\s*\)/i);
    expect(sql).toMatch(/jsonb_array_elements_text/i);
    // 10-minute lastCountedAt debounce window
    expect(sql).toMatch(/lastCountedAt/);
    expect(sql).toMatch(/interval\s+'10 minutes'/i);
    // WHERE-gated true no-op (R39): a mergeable, in-window, no-new-domain sighting
    expect(sql).toMatch(/where\s+not\s*\(/i);
    // R40: the no-op WHERE / merge compares against p_context (the original arg),
    // NEVER excluded.context (which carries the INSERT-appended lastCountedAt and
    // would never compare equal). The new file must not reference excluded.context.
    expect(sql).not.toMatch(/excluded\.context/i);
    // backward-compat lockdown preserved (service_role-only execute)
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.upsert_admin_alert\s*\(\s*uuid\s*,\s*text\s*,\s*jsonb\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.upsert_admin_alert\s*\(\s*uuid\s*,\s*text\s*,\s*jsonb\s*\)\s+to\s+service_role/i,
    );
  });

  test("production admin_alerts producers route through the coalescing helper", () => {
    const files = ["lib/auth/validateGoogleSession.ts", "lib/sync/applyStaged.ts"];

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
