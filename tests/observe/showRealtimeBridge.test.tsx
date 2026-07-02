import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Driving the realtime stack needs live Supabase channels (impractical in unit), so this is a
// SOURCE-level structural assertion (same class as the no-console meta-test). It pins that the
// mechanical console.* → clientLog swap (a) left no console behind, (b) routed every site through
// clientLog(client.realtime), and (c) kept the 4 generic `outcome: failed` messages distinct so
// the transport's dedup (keyed on source|level|message) cannot collapse them into one.
const SRC = readFileSync(join(process.cwd(), "components/realtime/ShowRealtimeBridge.tsx"), "utf8");

describe("ShowRealtimeBridge console.* → clientLog migration (structural)", () => {
  test("ZERO console.* call sites remain in the bridge", () => {
    expect(SRC).not.toMatch(/console\.(warn|info|error|log|debug)\(/);
  });

  test("all 15 migrated calls route through clientLog(<level>, 'client.realtime', ...)", () => {
    const clientLogCalls = SRC.match(/clientLog\(/g) ?? [];
    expect(clientLogCalls).toHaveLength(15);
    const realtimeCalls =
      SRC.match(/clientLog\(\s*"(?:warn|info|error|debug)",\s*"client\.realtime"/g) ?? [];
    expect(realtimeCalls).toHaveLength(15);
  });

  test("the 4 reason-folded failure messages are present AND mutually distinct (dedup can't collapse them)", () => {
    const messages = [
      "JWT renew outcome failed (mint_failed)",
      "JWT renew outcome failed (set_auth_threw)",
      "JWT renew outcome failed (subscribe_threw)",
      "JWT renew outcome failed (readiness_failed)",
    ];
    for (const m of messages) {
      expect(SRC).toContain(m);
    }
    expect(new Set(messages).size).toBe(4); // 4 distinct literals → 4 distinct dedup signatures
  });

  test("Task 3 — the unknown-system-event default branch forwards REALTIME_UNKNOWN_SYSTEM_EVENT + the runtime event-name detail", () => {
    // Isolate the default-branch clientLog call by its unique message so the
    // assertion cannot be satisfied by any of the other 14 clientLog sites.
    const defaultBranchCall = SRC.match(
      /clientLog\(\s*"warn",\s*"client\.realtime",\s*"unknown system event",[\s\S]*?\);/,
    )?.[0];
    expect(defaultBranchCall).toBeTruthy();
    // The forensic code rides the clientLog(...) span (components/ is unscanned).
    expect(defaultBranchCall).toContain('"REALTIME_UNKNOWN_SYSTEM_EVENT"');
    // The detail is DERIVED from the runtime event name, not hardcoded — the
    // 6th arg reads unknownEvent.event so dashboards see which event arrived.
    expect(defaultBranchCall).toMatch(/unknownEvent\.event/);
    // The mechanical count is unchanged — this is an in-place enrichment of an
    // existing site, not a new clientLog call.
    expect(SRC.match(/clientLog\(/g) ?? []).toHaveLength(15);
  });
});
