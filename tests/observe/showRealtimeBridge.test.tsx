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

  test("all 16 calls route through clientLog(<level>, 'client.realtime', ...)", () => {
    // 15 migrated console.* sites + the auth-churn info discrimination added
    // to the default branch (fix/realtime-auth-churn-log).
    const clientLogCalls = SRC.match(/clientLog\(/g) ?? [];
    expect(clientLogCalls).toHaveLength(16);
    const realtimeCalls =
      SRC.match(/clientLog\(\s*"(?:warn|info|error|debug)",\s*"client\.realtime"/g) ?? [];
    expect(realtimeCalls).toHaveLength(16);
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
    // Total site count pinned above (16); this test only pins the warn site's
    // shape.
    expect(SRC.match(/clientLog\(/g) ?? []).toHaveLength(16);
  });

  test("auth-churn discrimination — server system errors log console-only info BEFORE the unknown-event warn", () => {
    // The server pushes `{ message, status: "error", extension: "system" }`
    // on token expiry / join-denied. The default branch must discriminate
    // that shape (extension + status check) and route it to an info-level
    // clientLog (console-only; no transport POST) so expected churn does
    // not emit warn-level REALTIME_UNKNOWN_SYSTEM_EVENT every cycle.
    expect(SRC).toMatch(/extension\s*===\s*"system"[\s\S]{0,120}status\s*===\s*"error"/);
    const infoCall = SRC.match(
      /clientLog\(\s*"info",\s*"client\.realtime",\s*"channel auth churn[\s\S]*?\);/,
    )?.[0];
    expect(infoCall).toBeTruthy();
    // Discrimination happens INSIDE the default branch, before the warn
    // fence: the info site must precede the "unknown system event" site.
    expect(SRC.indexOf('"channel auth churn')).toBeGreaterThan(-1);
    expect(SRC.indexOf('"channel auth churn')).toBeLessThan(SRC.indexOf('"unknown system event"'));
  });
});
