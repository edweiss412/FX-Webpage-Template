/**
 * Unknown-runtime-code resilience for lib/messages/lookup.ts.
 *
 * MessageCode protects compile-time call sites, but codes read back from the
 * DB (pending_ingestions.last_error_code, admin_alerts.code, sync_log) are
 * unconstrained runtime strings. A retired/typo'd code used to make
 * `MESSAGE_CATALOG[code]` undefined, so `messageFor(code, params)`'s
 * `{ ...entry }` spread threw and could take down a persistent layout
 * (see components/admin/AlertBanner.tsx GUARD comment, which works around
 * exactly this).
 *
 * Pinned contract:
 * - messageFor(unknownCode) does NOT throw; it returns a safe fallback entry
 *   whose copy fields (dougFacing/crewFacing/helpfulContext/followUp/title/
 *   longExplanation/helpHref) are ALL null — consumers already degrade on
 *   null (ErrorExplainer renders nothing; resolveIngestionCopy falls back to
 *   generic copy). No invented copy, no raw code in any *Facing field
 *   (invariant 5).
 * - The fallback entry's `code` field carries the runtime string for
 *   identity/logging only — it is not rendered copy.
 * - getRequiredDougFacing(unknownCode) KEEPS THROWING: it is the explicit
 *   "required" variant; an unknown code yields null dougFacing, which is a
 *   programmer error there (pinned, matches getRequiredDougFacing.test.ts).
 *
 * Concrete failure mode caught: an admin_alerts row written by an older
 * deploy with a since-retired code crashes AlertBanner-style call sites that
 * pass `alert.code as MessageCode` straight through.
 */
import { describe, expect, it } from "vitest";

import {
  getCrewFacing,
  getDougFacing,
  getRequiredDougFacing,
  lookupHelpfulContext,
  messageFor,
  type MessageCode,
} from "@/lib/messages/lookup";

// A code shape a retired/typo'd DB row could plausibly contain. Never a
// catalog key (catalog keys are real §12.4 codes; this one is namespaced
// to the test).
const UNKNOWN = "RETIRED_CODE_FROM_OLD_DEPLOY" as MessageCode;

describe("messageFor — unknown runtime code", () => {
  it("does not throw without params", () => {
    expect(() => messageFor(UNKNOWN)).not.toThrow();
  });

  it("does not throw with params (the {...entry} spread path)", () => {
    expect(() => messageFor(UNKNOWN, { sheet_name: "Crew — Test Show" })).not.toThrow();
  });

  it("returns a fallback entry with all copy fields null (no invented copy, no raw code leaking into *Facing fields)", () => {
    const entry = messageFor(UNKNOWN, { time: "5 minutes ago" });
    expect(entry.dougFacing).toBeNull();
    expect(entry.crewFacing).toBeNull();
    expect(entry.helpfulContext).toBeNull();
    expect(entry.followUp).toBeNull();
    expect(entry.title).toBeNull();
    expect(entry.longExplanation).toBeNull();
    expect(entry.helpHref).toBeNull();
  });

  it("carries the runtime code on the entry for identity/logging only", () => {
    expect(messageFor(UNKNOWN).code).toBe("RETIRED_CODE_FROM_OLD_DEPLOY");
  });

  it("nullable getters return null cleanly for an unknown code", () => {
    expect(getDougFacing(UNKNOWN)).toBeNull();
    expect(getCrewFacing(UNKNOWN)).toBeNull();
    expect(lookupHelpfulContext(UNKNOWN)).toBeNull();
  });

  it("getRequiredDougFacing still throws for an unknown code (pinned: explicit 'required' variant)", () => {
    expect(() => getRequiredDougFacing(UNKNOWN)).toThrow(/no Doug-facing copy/);
  });
});

describe("messageFor — null-field hygiene on KNOWN codes (regression context for the guard)", () => {
  it("nullable getters return null cleanly when the catalog field is null (SESSION_IDLE_TIMEOUT has dougFacing/helpfulContext null per catalog.ts)", () => {
    expect(getDougFacing("SESSION_IDLE_TIMEOUT")).toBeNull();
    expect(lookupHelpfulContext("SESSION_IDLE_TIMEOUT")).toBeNull();
    expect(getCrewFacing("SESSION_IDLE_TIMEOUT")).toMatch(/session timed out/i);
  });

  it("interpolation on a known code leaves unmatched placeholders intact even when other params are supplied (unknown-code angle: params must never be required for safety)", () => {
    // DRIVE_FETCH_FAILED crewFacing contains <time>; pass an unrelated param.
    const entry = messageFor("DRIVE_FETCH_FAILED", { unrelated: "x" });
    expect(entry.crewFacing).toContain("<time>");
  });
});
