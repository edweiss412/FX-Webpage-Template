/**
 * tests/adminAlerts/_metaAlertIdentityMap.test.ts (spec §8.3 completeness gate)
 *
 * THE PROBLEM:
 *   `ALERT_IDENTITY_MAP` (spec §3.1/§4) is a hand-authored, per-code data
 *   table. A code missing from the map — or one with an empty `segments`
 *   array that isn't `global` — silently degrades to "no identity line" for
 *   that alert, indistinguishable from an intentional `global` declaration.
 *
 * THE META-DISCIPLINE:
 *   Every code in `ADMIN_ALERTS_CODES` (the production admin_alerts write-
 *   site registry, shared via the `adminAlertCodes.fixture` — single source
 *   of truth with `tests/messages/_metaAdminAlertCatalog.test.ts`) MUST have
 *   an `ALERT_IDENTITY_MAP` entry that is either `{ kind: "global" }`
 *   (an explicit, first-class "no per-entity identity" declaration) or has
 *   at least one segment producer. A new admin_alerts code added to the
 *   write-site registry without a corresponding identity-map row fails this
 *   test — the same "extend the registry" discipline as the sibling meta-
 *   tests (`_metaInfraContract`, `_metaAdminAlertCatalog`).
 */
import { describe, expect, it } from "vitest";
import { ALERT_IDENTITY_MAP } from "@/lib/adminAlerts/alertIdentityMap";
import { ADMIN_ALERTS_CODES } from "./adminAlertCodes.fixture";

describe("_metaAlertIdentityMap", () => {
  it("has an entry for every admin alert code, each global or with >=1 segment", () => {
    for (const code of ADMIN_ALERTS_CODES) {
      const entry = ALERT_IDENTITY_MAP[code];
      expect(entry, `missing identity map entry for ${code}`).toBeDefined();
      if (!entry) continue;
      const isValid =
        "kind" in entry && entry.kind === "global"
          ? true
          : "segments" in entry && entry.segments.length > 0;
      expect(isValid, `entry for ${code} is neither global nor has >=1 segment`).toBe(true);
    }
  });

  it("has exactly 43 codes in the registry (numeric-sweep anchor, spec §4)", () => {
    expect(ADMIN_ALERTS_CODES.length).toBe(43);
  });

  it("has no stray map entries for codes outside the registry", () => {
    const registrySet = new Set<string>(ADMIN_ALERTS_CODES);
    for (const code of Object.keys(ALERT_IDENTITY_MAP)) {
      expect(registrySet.has(code), `stray identity map entry for unregistered code ${code}`).toBe(
        true,
      );
    }
  });
});
