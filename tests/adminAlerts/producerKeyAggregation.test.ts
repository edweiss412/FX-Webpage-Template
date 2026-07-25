/**
 * tests/adminAlerts/producerKeyAggregation.test.ts
 * (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §5, §6)
 *
 * A code can have SEVERAL producer sites writing different key sets, so a
 * single representative context is a sample, not the key universe. These pins
 * cover the two aggregations every consumer reads:
 *
 *   allowedKeys(code)    = union over the code's rows of contextKeys+optional
 *   guaranteedKeys(code) = intersection over the code's rows of contextKeys
 *
 * and the NO-REGISTRY-ROW bypass: an empty allowed-set does not mean
 * "anything goes" — under a naive subset check it rejects every non-empty
 * context — so codes with no discovered producer are exempt from the subset
 * rule entirely rather than being silently constrained to nothing.
 */
import { describe, expect, it } from "vitest";
import { ADMIN_ALERTS_CODES } from "./adminAlertCodes.fixture";
import { PRODUCER_CONTEXT_LIST } from "./producerContexts";
import {
  PRODUCER_SCOPE,
  allowedKeys,
  guaranteedKeys,
  hasProducerRow,
} from "./alertProducerScope.registry";

describe("allowedKeys / guaranteedKeys (spec §5)", () => {
  it("SHEET_UNAVAILABLE: union differs from intersection across its three sites", () => {
    // The live multi-site proof. failure_code is written by two of the three
    // sites (and optionally at a third), drive_file_id by all of them.
    const sites = PRODUCER_SCOPE.filter((r) => r.code === "SHEET_UNAVAILABLE");
    expect(sites.length, "SHEET_UNAVAILABLE should have several producer sites").toBeGreaterThan(1);

    expect(allowedKeys("SHEET_UNAVAILABLE")).toContain("failure_code");
    expect(guaranteedKeys("SHEET_UNAVAILABLE")).not.toContain("failure_code");

    expect(allowedKeys("SHEET_UNAVAILABLE")).toContain("drive_file_id");
    expect(guaranteedKeys("SHEET_UNAVAILABLE")).toContain("drive_file_id");
  });

  it("guaranteedKeys is a subset of allowedKeys for every code", () => {
    for (const code of ADMIN_ALERTS_CODES) {
      const allowed = new Set(allowedKeys(code));
      for (const key of guaranteedKeys(code)) {
        expect(allowed.has(key), `${code}: ${key} guaranteed but not allowed`).toBe(true);
      }
    }
  });

  it("every representative context's keys are inside allowedKeys — for codes that HAVE a row", () => {
    const offenders: string[] = [];
    for (const entry of PRODUCER_CONTEXT_LIST) {
      if (!hasProducerRow(entry.code)) continue;
      const allowed = new Set(allowedKeys(entry.code));
      for (const key of Object.keys(entry.context)) {
        if (!allowed.has(key)) offenders.push(`${entry.code}.${key}`);
      }
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("allowedKeys is empty for exactly the codes with no producer row", () => {
    for (const code of ADMIN_ALERTS_CODES) {
      const empty = allowedKeys(code).length === 0;
      // A code WITH rows can still legitimately have an empty key set
      // (SYNC_STALLED writes {}), so only the no-row direction is total.
      if (!hasProducerRow(code)) {
        expect(empty, `${code}: no producer row, so allowedKeys must be empty`).toBe(true);
      }
    }
  });

  it("the no-row bypass is REQUIRED, not cosmetic: a no-row code has a non-empty context", () => {
    // If every no-row code had an empty context, skipping the subset rule
    // would be a no-op and could be quietly dropped. This proves otherwise —
    // without the bypass, this code's own representative context is rejected.
    // Data-driven, not pinned to one code: count the no-row codes that DO
    // carry context. If that count were zero the bypass would be a no-op and
    // could be dropped; it is 11 of 13 today.
    const noRowWithContext = PRODUCER_CONTEXT_LIST.filter(
      (e) => !hasProducerRow(e.code) && Object.keys(e.context).length > 0,
    );
    expect(noRowWithContext.length).toBeGreaterThan(0);

    // Named instance for legibility — its context is non-empty while its
    // allowed-set is empty, which is exactly the shape a naive subset rule
    // would reject.
    const named = PRODUCER_CONTEXT_LIST.find((e) => e.code === "WIZARD_SESSION_SUPERSEDED_RACE");
    expect(named).toBeDefined();
    expect(hasProducerRow("WIZARD_SESSION_SUPERSEDED_RACE")).toBe(false);
    expect(Object.keys(named!.context).length).toBeGreaterThan(0);
    expect(allowedKeys("WIZARD_SESSION_SUPERSEDED_RACE")).toEqual([]);
  });

  it("hasProducerRow agrees with the registry for every code", () => {
    const covered = new Set(PRODUCER_SCOPE.map((r) => r.code));
    for (const code of ADMIN_ALERTS_CODES) {
      expect(hasProducerRow(code), code).toBe(covered.has(code));
    }
  });
});
