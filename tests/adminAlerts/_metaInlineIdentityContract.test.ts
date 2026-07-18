/**
 * Structural contract (spec 2026-07-17 §5): a code suppresses its identity
 * chip iff its dougFacing template carries the identity inline. Bidirectional:
 * (a) every INLINE_IDENTITY_CODES member's dougFacing contains an
 * identity-bearing placeholder; (b) every segment-bearing code whose
 * dougFacing contains one is a member. Catches: adding a template without
 * suppressing the (now-duplicate) chip, and suppressing a chip while the
 * message no longer names the entity.
 */
import { describe, expect, it } from "vitest";
import { ALERT_IDENTITY_MAP, INLINE_IDENTITY_CODES } from "@/lib/adminAlerts/alertIdentityMap";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

const IDENTITY_TOKENS = ["<sheet-name>", "<show-name>", "<repo>", "<file-name>", "<role-changes>"];

const hasIdentityToken = (s: string | null): boolean =>
  s !== null && IDENTITY_TOKENS.some((t) => s.includes(t));

describe("inline-identity contract", () => {
  it("every member's dougFacing carries an identity placeholder", () => {
    for (const code of INLINE_IDENTITY_CODES) {
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
        | MessageCatalogEntry
        | undefined;
      expect(entry, `${code} not in catalog`).toBeDefined();
      expect(hasIdentityToken(entry!.dougFacing), `${code} dougFacing has no identity token`).toBe(
        true,
      );
    }
  });

  it("every segment-bearing code with an identity token is a member", () => {
    const violations: string[] = [];
    for (const [code, decl] of Object.entries(ALERT_IDENTITY_MAP)) {
      if (!("segments" in decl)) continue;
      const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
        | MessageCatalogEntry
        | undefined;
      if (entry && hasIdentityToken(entry.dougFacing) && !INLINE_IDENTITY_CODES.has(code)) {
        violations.push(code);
      }
    }
    expect(violations, violations.join(", ")).toEqual([]);
  });

  it("membership is exactly the 13 converted codes", () => {
    expect([...INLINE_IDENTITY_CODES].sort()).toEqual([
      "BRANCH_PROTECTION_DRIFT",
      "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
      "EMAIL_DELIVERY_FAILED",
      "PENDING_SNAPSHOT_PROMOTE_STUCK",
      "PENDING_SNAPSHOT_ROLLBACK_STUCK",
      "REPORT_DUPLICATE_LIVE_MATCHES",
      "REPORT_LEASE_THRASHING",
      "REPORT_LOOKUP_INCONCLUSIVE",
      "REPORT_OPEN_ORPHAN_LABEL",
      "REPORT_ORPHANED_LOST_LEASE",
      "ROLE_FLAGS_NOTICE",
      "STALE_ORPHAN_REPORT",
      "WIZARD_SESSION_SUPERSEDED_RACE",
    ]);
  });
});
