import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveBotLoginAlertFailOpen } from "@/lib/reports/submit";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import type { ReportLeaseDb } from "@/lib/reports/leaseProtocol";

// alert-resolve-truthing §6.2 — the submit-side fail-open resolve of GITHUB_BOT_LOGIN_MISSING.
// Contracts pinned here:
//   (a) env set → the resolving UPDATE is issued;
//   (b) env unset → no query is issued (no false-close, R1 F2);
//   (c) a resolve query that THROWS is caught (fail-open) + logged — it never propagates, so a
//       durable 201 submit can never be turned into a failure (R2 F4);
//   (d) BOTH 201 return paths (normal-create + expiredLeaseRetry) invoke the resolve (H2) —
//       proven structurally so it cannot silently regress if a path is refactored.

afterEach(() => {
  vi.unstubAllEnvs();
  resetLogSink();
});

function fakeDb(query: ReportLeaseDb["query"]): ReportLeaseDb {
  return { query } as ReportLeaseDb;
}

describe("resolveBotLoginAlertFailOpen", () => {
  test("env set → issues the GITHUB_BOT_LOGIN_MISSING resolving UPDATE", async () => {
    vi.stubEnv("GITHUB_BOT_LOGIN", "fxav-bot");
    const query = vi.fn(async (_sql: string) => ({ rows: [] as unknown[] }));
    await resolveBotLoginAlertFailOpen(fakeDb(query), "show-1");
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]![0])).toMatch(
      /UPDATE admin_alerts[\s\S]*GITHUB_BOT_LOGIN_MISSING[\s\S]*show_id IS NULL[\s\S]*resolved_at IS NULL/,
    );
  });

  test("env unset → no query issued (no false-close)", async () => {
    vi.stubEnv("GITHUB_BOT_LOGIN", "");
    const query = vi.fn(async (_sql: string) => ({ rows: [] as unknown[] }));
    await resolveBotLoginAlertFailOpen(fakeDb(query), "show-1");
    expect(query).not.toHaveBeenCalled();
  });

  test("a throwing resolve is caught (fail-open) and logged — never propagates", async () => {
    vi.stubEnv("GITHUB_BOT_LOGIN", "fxav-bot");
    const sink: LogRecord[] = [];
    setLogSink((r) => {
      sink.push(r);
    });
    const query = vi.fn(async (_sql: string): Promise<{ rows: unknown[] }> => {
      throw new Error("db down");
    });
    // Must resolve (not reject) — a resolve fault cannot fail a durable submit.
    await expect(resolveBotLoginAlertFailOpen(fakeDb(query), "show-1")).resolves.toBeUndefined();
    const warn = sink.filter((r) => r.level === "warn" && r.source === "reports.submit");
    expect(warn.length).toBe(1);
    expect(warn[0]!.context.detail).toContain("db down");
  });
});

describe("both 201 paths invoke the resolve (H2 — structural)", () => {
  test("resolveBotLoginAlertFailOpen precedes BOTH `return { status: 201` returns", () => {
    const source = readFileSync(join(process.cwd(), "lib/reports/submit.ts"), "utf8");
    const returns = [
      ...source.matchAll(/return \{ status: 201, body: successBody\(auth, "created"/g),
    ];
    expect(returns.length, "expected exactly two created-201 returns").toBe(2);
    // Every created-201 return is immediately preceded (within the prior ~3 lines) by a
    // resolveBotLoginAlertFailOpen(...) call.
    for (const m of returns) {
      const before = source.slice(Math.max(0, m.index! - 200), m.index!);
      expect(before, "a created-201 return not preceded by the fail-open resolve").toMatch(
        /resolveBotLoginAlertFailOpen\(/,
      );
    }
  });
});
