import { describe, expect, it } from "vitest";
import {
  ATTEMPT_OUTCOMES,
  BACKOFF_LADDER_MS,
  BACKOFF_MAX_MS,
  ESCALATION_AFTER_MS,
  RENEWAL_LIFE_FRACTION,
  RENEWAL_MIN_LEAD_MS,
  SAMPLING_PERIOD_MS,
  T_EXEC_BUDGET_MS,
  WATCH_ERROR_CLASSES,
} from "@/lib/drive/watchErrors";

// Independent literal expectation table (spec §6 class 1): human units,
// converted here - NEVER derived from BACKOFF_LADDER_MS itself.
const LADDER_EXPECTATION: ReadonlyArray<readonly [number, string]> = [
  [1, "15m"],
  [2, "30m"],
  [3, "1h"],
  [4, "2h"],
  [5, "2h"],
  [6, "2h"],
];
const toMs = (h: string) =>
  h.endsWith("h") ? Number(h.slice(0, -1)) * 3_600_000 : Number(h.slice(0, -1)) * 60_000;
const waitFor = (n: number) => BACKOFF_LADDER_MS[Math.min(n, BACKOFF_LADDER_MS.length) - 1];

describe("backoff constants (spec §2.1)", () => {
  it("ladder matches the independent literal table", () => {
    for (const [n, human] of LADDER_EXPECTATION) expect(waitFor(n), `rung ${n}`).toBe(toMs(human));
  });
  it("BACKOFF_MAX_MS is definitionally the last rung", () => {
    expect(BACKOFF_MAX_MS).toBe(BACKOFF_LADDER_MS.at(-1));
  });
  it("escalation window is 3h", () => {
    expect(ESCALATION_AFTER_MS).toBe(10_800_000);
  });
  it("runtime arrays carry the exact CHECK value sets", () => {
    expect([...WATCH_ERROR_CLASSES].sort()).toEqual(["config", "db", "drive_api"]);
    expect([...ATTEMPT_OUTCOMES].sort()).toEqual(["failed", "succeeded"]);
  });
  // Class-9 retired-identifier scan lands with the escalation task (plan Task 6),
  // once the constant it scans for is actually deleted.
});

describe("I1 phase sweep (spec §2.1a) - simulated tick series, not the formula", () => {
  // L(G) mirrors the SHIPPED predicate shape (lib/drive/watch.ts:362-365).
  const L = (g: number) => Math.max(RENEWAL_MIN_LEAD_MS, g * (1 - RENEWAL_LIFE_FRACTION));
  const P = SAMPLING_PERIOD_MS;
  const T = T_EXEC_BUDGET_MS;
  const GRANTS = [P - 1, P, P + T, P + T + 1, 3_600_000, 21_600_000, 86_400_000];

  it.each(GRANTS.map((g) => [g] as const))("grant %d ms", (G) => {
    // Ticks at every offset step across one full period; a channel activated at
    // offset o is examined at ticks o', o'+P, ... where o' is the first tick >= o,
    // and "examined-and-due" means remaining life <= L(G) at a tick that lands
    // at most T after its scheduled time.
    const offsets = new Set<number>([0, 1, P - 1, P - T, P - T - 1, P - T + 1]);
    for (let o = 0; o < P; o += 60_000) offsets.add(o);
    for (const offset of offsets) {
      let examinedDueBeforeExpiry = false;
      for (let tick = offset === 0 ? 0 : P - offset; tick <= G + P; tick += P) {
        const at = tick + T; // worst-case execution lag
        if (at >= G) break;
        if (G - at <= L(G)) {
          examinedDueBeforeExpiry = true;
          break;
        }
      }
      if (G > P + T) {
        expect(examinedDueBeforeExpiry, `G=${G} offset=${offset}`).toBe(true);
      }
      // G <= P + T: anomalous band - no assertion; GRANT_TOO_SHORT posture is
      // pinned by the shipped tests/drive/watchExpiration.test.ts suite.
    }
  });
});
