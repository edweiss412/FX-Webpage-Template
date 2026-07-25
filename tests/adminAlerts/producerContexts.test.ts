/**
 * tests/adminAlerts/producerContexts.test.ts
 * (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §3)
 *
 * The promoted per-code producer-context fixtures are now a shared module
 * rather than a private array inside the identity-matrix test, so the gallery
 * scenario catalog and the identity matrix read ONE description of what each
 * producer writes. This file pins the module's totality and shape.
 *
 * Anti-tautology: totality is compared against the LIVE `ADMIN_ALERTS_CODES`
 * import, never a hardcoded count — a stale number would pass while the module
 * silently lost a code.
 */
import { describe, expect, it } from "vitest";
import { ADMIN_ALERTS_CODES } from "./adminAlertCodes.fixture";
import {
  PRODUCER_CONTEXT_LIST,
  PRODUCER_CONTEXT_BY_CODE,
  type ProducerContextEntry,
} from "./producerContexts";

describe("PRODUCER_CONTEXT_LIST (spec §3)", () => {
  it("covers exactly the registered codes, compared against the live registry", () => {
    expect(PRODUCER_CONTEXT_LIST.map((e) => e.code).sort()).toEqual([...ADMIN_ALERTS_CODES].sort());
  });

  it("declares one entry per code — no duplicates", () => {
    const codes = PRODUCER_CONTEXT_LIST.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("indexes every entry by code", () => {
    for (const entry of PRODUCER_CONTEXT_LIST) {
      expect(PRODUCER_CONTEXT_BY_CODE.get(entry.code), entry.code).toBe(entry);
    }
    expect(PRODUCER_CONTEXT_BY_CODE.size).toBe(PRODUCER_CONTEXT_LIST.length);
  });

  it("carries a plain-object context on every entry, never null or an array", () => {
    for (const entry of PRODUCER_CONTEXT_LIST) {
      expect(
        entry.context !== null &&
          typeof entry.context === "object" &&
          !Array.isArray(entry.context),
        entry.code,
      ).toBe(true);
    }
  });

  it("keeps showId as string-or-null on every entry (the column, not a context key)", () => {
    for (const entry of PRODUCER_CONTEXT_LIST) {
      const ok = entry.showId === null || typeof entry.showId === "string";
      expect(ok, `${entry.code}: showId must be string | null`).toBe(true);
      expect(Object.keys(entry.context), `${entry.code}`).not.toContain("showId");
    }
  });

  it("exposes the entry type with exactly the fields the identity matrix relied on", () => {
    // Compile-time guard: this assignment fails to typecheck if a field is
    // dropped or renamed during the promotion (spec §3 field-preservation rule).
    const probe: ProducerContextEntry = {
      code: "SYNC_STALLED",
      showId: null,
      context: {},
    };
    expect(probe.code).toBe("SYNC_STALLED");
  });
});
