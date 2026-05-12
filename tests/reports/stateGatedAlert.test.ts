import { describe, expect, test } from "vitest";

import { resolveStateGatedAlert } from "@/lib/reports/submit";

const showId = "018f2f4c-7777-4777-9777-000000000001";
const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d901";
const recoveredUrl = "https://github.com/edweiss412/FX-Webpage-Template/issues/recovered";

type Step = {
  pattern: RegExp;
  rows: unknown[];
};

function scriptedDb(steps: Step[]) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  return {
    calls,
    db: {
      async query(sql: string, params: readonly unknown[] = []) {
        calls.push({ sql, params });
        const step = steps.shift();
        expect(step, `unexpected query: ${sql}`).toBeDefined();
        expect(sql).toMatch(step?.pattern ?? /$./);
        return { rows: step?.rows ?? [], rowCount: step?.rows.length ?? 0 };
      },
    },
  };
}

describe("state-gated report alert reconciliation", () => {
  test("redispatches and returns recovered when the row resolves before the gated alert write", async () => {
    const { db, calls } = scriptedDb([
      { pattern: /INSERT INTO admin_alerts[\s\S]*SELECT r\.show_id/, rows: [] },
      { pattern: /SELECT show_id,\s*github_issue_url/, rows: [{ show_id: showId, github_issue_url: recoveredUrl, lease_live: false, within_horizon: true }] },
    ]);

    const result = await resolveStateGatedAlert(db, { kind: "admin" }, key, {
      alertCode: "REPORT_LOOKUP_INCONCLUSIVE",
      responseCode: "REPORT_LOOKUP_INCONCLUSIVE",
      responseStatus: 502,
      context: { idempotency_key: key, reason: "pagination failed" },
    });

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "recovered", github_issue_url: recoveredUrl },
    });
    expect(calls).toHaveLength(2);
  });

  test("writes one unconditional raced_back_twice alert after two gated misses and two stuck redispatches", async () => {
    const { db, calls } = scriptedDb([
      { pattern: /INSERT INTO admin_alerts[\s\S]*SELECT r\.show_id/, rows: [] },
      { pattern: /SELECT show_id,\s*github_issue_url/, rows: [{ show_id: showId, github_issue_url: null, lease_live: false, within_horizon: true }] },
      { pattern: /INSERT INTO admin_alerts[\s\S]*SELECT r\.show_id/, rows: [] },
      { pattern: /SELECT show_id,\s*github_issue_url/, rows: [{ show_id: showId, github_issue_url: null, lease_live: false, within_horizon: true }] },
      { pattern: /INSERT INTO admin_alerts[\s\S]*VALUES \(\$1::uuid, \$2, \$3::jsonb\)/, rows: [] },
    ]);

    const result = await resolveStateGatedAlert(db, { kind: "admin" }, key, {
      alertCode: "REPORT_LEASE_THRASHING",
      responseCode: "REPORT_LEASE_THRASHING",
      responseStatus: 503,
      context: { idempotency_key: key, depth: 3 },
    });

    expect(result).toEqual({
      status: 503,
      body: { ok: false, code: "REPORT_LEASE_THRASHING" },
    });
    expect(calls).toHaveLength(5);
    expect(calls.at(-1)?.params).toEqual([
      showId,
      "REPORT_LEASE_THRASHING",
      { idempotency_key: key, depth: 3, raced_back_twice: true },
    ]);
  });
});
