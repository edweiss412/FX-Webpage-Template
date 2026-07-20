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
import {
  deriveAlertMessageParams,
  IDENTITY_PARAM_TOKENS,
} from "@/lib/adminAlerts/deriveMessageParams";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

// Single source: every template placeholder an identity-resolved param can
// fill (lib/adminAlerts/deriveMessageParams.ts §3) — NOT a second hand-list.
const IDENTITY_TOKENS = [...IDENTITY_PARAM_TOKENS].map((token) => `<${token}>`);

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

  it("membership is exactly the 30-code set derived from catalog templates (spec §6 inline_member: yes rows)", () => {
    // Derived from live data (ALERT_IDENTITY_MAP + MESSAGE_CATALOG), not a
    // second hand-list — same predicate as the two tests above, plus an
    // explicit size pin so a silent shrink/grow is caught even if both
    // sides drift together.
    const derived = Object.entries(ALERT_IDENTITY_MAP)
      .filter(([, decl]) => "segments" in decl)
      .map(([code]) => code)
      .filter((code) => {
        const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as
          | MessageCatalogEntry
          | undefined;
        return entry !== undefined && hasIdentityToken(entry.dougFacing);
      })
      .sort();

    expect(derived).toHaveLength(30);
    expect([...INLINE_IDENTITY_CODES].sort()).toEqual(derived);
  });
});

describe("deriveAlertMessageParams — cursor advances past a pii-skipped match", () => {
  // Flagged coverage (spec §3 identity-segment mapping extension): the
  // walkIdentitySegments cursor must advance past a matched-but-not-recorded
  // segment (email is always pii, so its value never lands in `result`, but
  // the cursor still consumes the slot — deriveMessageParams.ts:126-136) so
  // a LATER spec still aligns with its intended segment instead of being
  // shifted out of position. AMBIGUOUS_EMAIL_BINDING's real segment shape
  // (alertIdentityMap.ts:60-66) is exactly this: Show, email(pii), count —
  // reproduced here directly (no showName segment) to isolate the
  // email->count adjacency.
  it("maps the count segment correctly when it immediately follows a pii-tagged email segment", () => {
    const identity: AlertIdentity = {
      global: false,
      segments: [
        { label: "Show", value: "II - East Coast 2026" },
        { label: null, value: "doug@example.com", pii: true },
        { label: null, value: "3 crew rows" },
      ],
    };
    const params = deriveAlertMessageParams("AMBIGUOUS_EMAIL_BINDING", null, identity, "global");
    expect(params["show-name"]).toBe("'II - East Coast 2026'");
    expect(params.email).toBe("an email address"); // pii value never surfaces here
    expect(params["crew-row-count"]).toBe("3 crew rows"); // cursor advanced past the skip
  });
});
