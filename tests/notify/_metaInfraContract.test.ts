import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

// Each new notify Supabase/postgres boundary helper adds its row here IN THE SAME COMMIT.
export const REGISTERED: { path: string }[] = [
  // lib/notify/recipients.ts — service-role read of admin_emails; returns
  // { kind: "infra_error" } on returned/thrown DB fault (Task 2.5, invariant 9).
  { path: "lib/notify/recipients.ts" },
  { path: "lib/appSettings/getAlertOnSyncProblems.ts" },
  { path: "lib/appSettings/getDailyReviewDigest.ts" },
  { path: "lib/notify/detect/stall.ts" },
  { path: "lib/notify/detect/recoveryResolution.ts" },
  { path: "lib/notify/detect/candidates.ts" },
  { path: "lib/adminAlerts/resolveAdminAlert.ts" },
  { path: "lib/notify/deliver.ts" },
  { path: "lib/notify/detect/emailDeliveryFailed.ts" },
  { path: "lib/notify/digest.ts" },
  { path: "lib/notify/runNotify.ts" },
];

// Inline recursive .ts walker (R9/R10 fix — no shared walkTs exists in the repo).
function walkTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTs(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

// SCANNED SET: lib/notify recursively PLUS the two app-settings getters this contract also
// guards — else a getter could add a Supabase read with no row while green.
const APP_SETTINGS_GETTERS = [
  "lib/appSettings/getAlertOnSyncProblems.ts",
  "lib/appSettings/getDailyReviewDigest.ts",
];

function scannedFiles(): string[] {
  return [...walkTs("lib/notify"), ...APP_SETTINGS_GETTERS.filter((p) => existsSync(p))];
}

// DB boundary = DIRECT Supabase/postgres syntax OR a DB-BOUND WRAPPER call (R11 fix —
// notify maintenance writes through wrappers like upsertAdminAlert/resolveAdminAlert that
// THROW on a returned RPC error; a wrapper-only file has no direct DB syntax and would
// otherwise slip the guard). Extend this alternation as new DB-bound wrappers are added.
const DB_SIGNATURE =
  /createSupabaseServiceRoleClient|\.from\(|\bsql`|postgres\(|upsertAdminAlert\(|resolveAdminAlert\(/;

// R14 fix: the exemption is a POSITIVE marker `// not-subject-to-meta: <reason>` (colon + a
// non-empty reason) on its own comment line — NOT a bare substring (which a discussion comment
// like `// not-subject-to-meta? NO` would falsely satisfy, exempting a real boundary).
const EXEMPT_MARKER = /^\s*\/\/\s*not-subject-to-meta:\s+\S/m;

describe("notify + app-settings infra-contract (structural)", () => {
  test("every lib/notify AND notify app-settings-getter DB boundary is REGISTERED or // not-subject-to-meta: <reason>", () => {
    const offenders: string[] = [];
    for (const file of scannedFiles()) {
      const src = readFileSync(file, "utf8");
      const touchesDb = DB_SIGNATURE.test(src);
      const registered = REGISTERED.some((r) => file.endsWith(r.path));
      const exempt = EXEMPT_MARKER.test(src);
      if (touchesDb && !registered && !exempt) offenders.push(file);
    }
    expect(
      offenders,
      `unregistered notify/app-settings DB boundaries: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  test("every REGISTERED path exists (a renamed/deleted boundary is caught)", () => {
    const missing = REGISTERED.filter((r) => !existsSync(r.path));
    expect(missing.map((r) => r.path), "REGISTERED paths that no longer exist").toEqual([]);
  });

  test("notify app-settings toggle getters return infra_error for returned DB errors", async () => {
    const maybeSingle = async () => ({ data: null, error: { message: "boom" } });
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      }),
    };
    const { getAlertOnSyncProblems } = await import("@/lib/appSettings/getAlertOnSyncProblems");
    const { getDailyReviewDigest } = await import("@/lib/appSettings/getDailyReviewDigest");

    await expect(getAlertOnSyncProblems(client as never)).resolves.toEqual({
      kind: "infra_error",
    });
    await expect(getDailyReviewDigest(client as never)).resolves.toEqual({ kind: "infra_error" });
  });

  test("notify app-settings toggle getters return infra_error for thrown query faults", async () => {
    const client = {
      from: () => {
        throw new Error("query fault");
      },
    };
    const { getAlertOnSyncProblems } = await import("@/lib/appSettings/getAlertOnSyncProblems");
    const { getDailyReviewDigest } = await import("@/lib/appSettings/getDailyReviewDigest");

    await expect(getAlertOnSyncProblems(client as never)).resolves.toEqual({
      kind: "infra_error",
    });
    await expect(getDailyReviewDigest(client as never)).resolves.toEqual({ kind: "infra_error" });
  });

  test("activeRecipients returns infra_error for returned DB errors and thrown query faults", async () => {
    const { activeRecipients } = await import("@/lib/notify/recipients");
    const returnedErrorClient = {
      from: () => ({
        select: () => ({
          is: async () => ({ data: null, error: { message: "boom" } }),
        }),
      }),
    };
    const thrownClient = {
      from: () => {
        throw new Error("query fault");
      },
    };

    await expect(activeRecipients(returnedErrorClient as never)).resolves.toEqual({ kind: "infra_error" });
    await expect(activeRecipients(thrownClient as never)).resolves.toEqual({ kind: "infra_error" });
  });

  test("listRealtimeCandidates returns infra_error for postgres query faults", async () => {
    const { listRealtimeCandidates } = await import("@/lib/notify/detect/candidates");
    const rejectedSql = vi.fn(() => Promise.reject(new Error("db down")));
    const thrownSql = vi.fn(() => {
      throw new Error("query construction fault");
    });

    await expect(listRealtimeCandidates(rejectedSql as never)).resolves.toEqual({ kind: "infra_error" });
    await expect(listRealtimeCandidates(thrownSql as never)).resolves.toEqual({ kind: "infra_error" });
  });

  test("resolveRecoveredSyncProblemAlert returns infra_error for postgres query faults", async () => {
    const { resolveRecoveredSyncProblemAlert } = await import("@/lib/notify/detect/recoveryResolution");
    const alert = {
      alertId: "alert-1",
      showId: "show-1",
      code: "DRIVE_FETCH_FAILED" as const,
    };
    const rejectedSql = vi.fn(() => Promise.reject(new Error("db down")));
    const thrownSql = vi.fn(() => {
      throw new Error("query construction fault");
    });

    await expect(resolveRecoveredSyncProblemAlert(alert, rejectedSql as never)).resolves.toEqual({
      kind: "infra_error",
    });
    await expect(resolveRecoveredSyncProblemAlert(alert, thrownSql as never)).resolves.toEqual({
      kind: "infra_error",
    });
  });

  test("resolveAdminAlert throws for returned DB errors and thrown query faults", async () => {
    const { resolveAdminAlert } = await import("@/lib/adminAlerts/resolveAdminAlert");
    const returnedErrorClient = {
      from: () => ({
        update: () => ({
          eq: () => ({
            is: () => ({
              is: () => ({
                select: async () => ({ error: { message: "boom" } }),
              }),
            }),
          }),
        }),
      }),
    };
    const thrownClient = {
      from: () => {
        throw new Error("query fault");
      },
    };

    await expect(
      resolveAdminAlert({ showId: null, code: "SYNC_STALLED" }, returnedErrorClient as never),
    ).rejects.toThrow(/admin alert resolve failed/);
    await expect(
      resolveAdminAlert({ showId: null, code: "SYNC_STALLED" }, thrownClient as never),
    ).rejects.toThrow(/query fault/);
  });

  test("deliverRealtimeCandidates returns infra_error for thrown query faults", async () => {
    const { deliverRealtimeCandidates } = await import("@/lib/notify/deliver");
    const sql = vi.fn(() => Promise.reject(new Error("db down")));

    await expect(
      deliverRealtimeCandidates(
        {
          candidates: [
            {
              kind: "show",
              dedupKey: "show-1:SHEET_UNAVAILABLE:1780000000123000",
              alertId: "00000000-0000-0000-0000-000000000001",
              showId: "00000000-0000-0000-0000-000000000002",
              code: "SHEET_UNAVAILABLE",
              raisedAt: new Date("2026-06-02T12:00:00.123Z"),
              slug: "show-one",
              showTitle: "Show One",
              contextSheetName: null,
            },
          ],
          recipients: ["doug@fxav.net"],
          origin: "https://crew.fxav.app",
        },
        { sql: sql as never },
      ),
    ).resolves.toEqual({ kind: "infra_error" });
  });

  test("deliverRealtimeCandidates returns infra_error when the alert wrapper surfaces a returned DB error", async () => {
    const { deliverRealtimeCandidates } = await import("@/lib/notify/deliver");
    const sql = vi.fn((strings: TemplateStringsArray) => {
      const text = strings.join("$");
      if (text.includes("select 1")) return Promise.resolve([{ ok: true }]);
      if (text.includes("select status, attempt_count")) return Promise.resolve([]);
      if (text.includes("insert into public.email_deliveries")) return Promise.resolve([{ id: "failed" }]);
      return Promise.resolve([]);
    });

    await expect(
      deliverRealtimeCandidates(
        {
          candidates: [
            {
              kind: "ingestion",
              dedupKey: "ingestion:drive-1:1780000000123000",
              driveFileId: "drive-1",
              driveFileName: "Pending Sheet",
              firstSeenAt: new Date("2026-06-02T12:00:00.123Z"),
              lastErrorCode: "SHEET_PROCESS_FAILED",
            },
          ],
          recipients: ["doug@fxav.net"],
          origin: "https://crew.fxav.app",
        },
        {
          sql: sql as never,
          sendEmail: async () => ({ ok: false, kind: "infra_error", message: "provider down" }),
          upsertAdminAlert: async () => {
            throw new Error("admin alert upsert failed: returned error");
          },
        },
      ),
    ).resolves.toEqual({ kind: "infra_error" });
  });

  test("reconcileEmailDeliveryState returns infra_error for thrown query faults", async () => {
    const { reconcileEmailDeliveryState } = await import("@/lib/notify/detect/emailDeliveryFailed");
    const sql = vi.fn(() => Promise.reject(new Error("db down")));

    await expect(
      reconcileEmailDeliveryState(
        {
          alertOnSyncProblems: true,
          dailyReviewDigest: true,
          configValid: true,
          todayET: "2026-06-02",
        },
        { sql: sql as never },
      ),
    ).resolves.toEqual({ kind: "infra_error" });
  });

  test("reconcileEmailDeliveryState returns infra_error when alert wrappers surface returned DB errors", async () => {
    const { reconcileEmailDeliveryState } = await import("@/lib/notify/detect/emailDeliveryFailed");
    const sql = vi.fn((strings: TemplateStringsArray) => {
      const text = strings.join("$");
      if (text.includes("failed_scopes")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await expect(
      reconcileEmailDeliveryState(
        {
          alertOnSyncProblems: true,
          dailyReviewDigest: false,
          configValid: false,
          todayET: "2026-06-02",
        },
        {
          sql: sql as never,
          upsertAdminAlert: async () => {
            throw new Error("admin alert upsert failed: returned error");
          },
        },
      ),
    ).resolves.toEqual({ kind: "infra_error" });
  });

  test("buildDigestModel returns infra_error for thrown query faults", async () => {
    const { buildDigestModel } = await import("@/lib/notify/digest");
    const sql = vi.fn(() => Promise.reject(new Error("db down")));

    await expect(buildDigestModel("doug@fxav.net", "2026-06-02", { sql: sql as never })).resolves.toEqual({
      kind: "infra_error",
    });
  });

  test("buildDigestModel returns infra_error for returned postgres-style query faults", async () => {
    const { buildDigestModel } = await import("@/lib/notify/digest");
    const sql = vi.fn(() => Promise.reject({ message: "returned error" }));

    await expect(buildDigestModel("doug@fxav.net", "2026-06-02", { sql: sql as never })).resolves.toEqual({
      kind: "infra_error",
    });
  });

  test("runMaintenance returns infra_error for returned DB errors from heartbeat reads", async () => {
    const { runMaintenance } = await import("@/lib/notify/runNotify");

    await expect(
      runMaintenance({
        readHeartbeat: async () => ({ kind: "infra_error" }),
        resolveRecoveredSyncProblems: async () => ({ kind: "ok" }),
        getAlertOnSyncProblems: async () => ({ kind: "value", enabled: true }),
        getDailyReviewDigest: async () => ({ kind: "value", enabled: true }),
        reconcileEmailDeliveryState: async () => ({ kind: "ok", opened: 0, resolved: 0 }),
      }),
    ).resolves.toEqual([
      { step: "stall", result: { kind: "infra_error" } },
      { step: "recovery", result: { kind: "ok" } },
      { step: "emailDelivery", result: { kind: "ok", opened: 0, resolved: 0 } },
    ]);
  });

  test("runRealtimeNotify returns infra_error for thrown delivery-prerequisite faults", async () => {
    const { runRealtimeNotify } = await import("@/lib/notify/runNotify");

    await expect(
      runRealtimeNotify({
        deps: {
          runMaintenance: async () => [],
          configValid: () => ({ ok: true, origin: "https://crew.fxav.app" }),
          getAlertOnSyncProblems: async () => ({ kind: "value", enabled: true }),
          activeRecipients: async () => {
            throw new Error("admin_emails query fault");
          },
        },
      }),
    ).resolves.toMatchObject({
      kind: "ok",
      delivery: { kind: "infra_error" },
    });
  });
});
