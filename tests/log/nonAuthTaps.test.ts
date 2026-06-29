// tests/log/nonAuthTaps.test.ts
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resetLogSink, setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

function capture(): LogRecord[] {
  const r: LogRecord[] = [];
  setLogSink((x) => {
    r.push(x);
  });
  return r;
}
afterEach(() => {
  resetLogSink();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("geocode cache emits warn on infra fault (behavioral)", () => {
  test("construction throw → {kind:'infra_error'} AND warn/geocoding/cache", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServiceRoleClient: () => {
        throw new Error("down");
      },
    }));
    const recs = capture();
    const { readGeocodeCache } = await import("@/lib/geocoding/cache");
    const result = await readGeocodeCache("anytown");
    expect(result).toEqual({ kind: "infra_error" });
    expect(recs.some((r) => r.level === "warn" && r.source === "geocoding/cache")).toBe(true);
  });
});

describe("cron CONCURRENT_SYNC_SKIPPED tap present (structural — full cron DI is heavy)", () => {
  test("missingShows skip branch logs persisted info/cron/sync/CONCURRENT_SYNC_SKIPPED", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8").replace(/\s+/g, " ");
    // order-locked to the tap object literal (source → code → … → persist:true),
    // [^}]* stays within the object so unrelated statements can't satisfy it.
    expect(src).toMatch(
      /log\.info\([^}]*source:\s*["']cron\/sync["'][^}]*code:\s*["']CONCURRENT_SYNC_SKIPPED["'][^}]*persist:\s*true/,
    );
  });
});

describe("report + scan taps present (structural — fault reachable only via full route)", () => {
  test("report readCrewRoleFlags catch logs api/report + ADMIN_SESSION_LOOKUP_FAILED", () => {
    const src = readFileSync("app/api/report/route.ts", "utf8").replace(/\s+/g, " ");
    expect(src).toMatch(/source:\s*["']api\/report["']/);
    expect(src).toMatch(/log\.(error|warn)\(/);
    expect(src).toMatch(/code:\s*["']ADMIN_SESSION_LOOKUP_FAILED["']/);
  });
  test("onboarding scan catch logs source admin/onboarding/scan", () => {
    const src = readFileSync("app/api/admin/onboarding/scan/route.ts", "utf8").replace(/\s+/g, " ");
    expect(src).toMatch(/log\.error\([^)]*source:\s*["']admin\/onboarding\/scan["']/);
  });
});
