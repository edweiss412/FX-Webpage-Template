// Tier-1 scenarios: one per alert code, one per warning code (spec §3.1, §3.2).
//
// Alert totality is STRUCTURAL. Scenarios are derived at runtime from
// ATTENTION_ROUTES keys, so a new alert code appears in the gallery the moment
// its routing row lands - no catalog edit, no drift, and no completeness
// meta-test needed (which is why §1.1 can decline that gate without accepting
// drift).
import {
  withDefaultContext,
  DEFAULT_SHARED_EMAIL,
} from "@/lib/dev/attentionScenarios/defaultContext";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import type { ParseWarning } from "@/lib/parser/types";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";
import type { AttentionScenario, ScenarioAlertRow } from "./types";

/** Fixed so the gallery renders deterministically across reloads. */
const FIXED_RAISED_AT = "2026-07-01T12:00:00.000Z";

/**
 * `alert-` / `warn-` namespaced, lowercase, hyphenated (spec §3.2b). Source codes
 * are `^[A-Z][A-Z0-9_]*$`, so the transform is total and injective within a
 * namespace, and the prefix stops an alert and a warning of the same code from
 * colliding. The result is the DOM anchor, the `scenario` query value, the
 * synthetic row-id prefix, and the DB tag - one rule governs all four.
 */
export function scenarioIdForCode(namespace: "alert" | "warn", code: string): string {
  return `${namespace}-${code.toLowerCase().replaceAll("_", "-")}`;
}

/**
 * Storable-field overrides only. `code` is NOT overridable: the key IS the code,
 * and allowing an override to emit a different one would break the structural
 * totality above.
 *
 * Every code whose rendered card depends on context needs a row here, or
 * `validateScenario` rejects it - that coupling is deliberate, and it is what
 * stops a context-dependent code from silently shipping its degenerate form.
 */
export const ALERT_ROW_OVERRIDES: Partial<Record<string, Partial<Omit<ScenarioAlertRow, "code">>>> =
  {
    // readFailedKeys returns null for any other code or a non-array.
    TILE_PROJECTION_FETCH_FAILED: {
      context: { failedKeys: ["tile:agenda", "tile:rooms"] },
    },
    // readDataGapsDigest requires an object data_gaps with a positive total; the
    // per-class counts are keyed by GAP_CLASSES codes and missing ones coerce to 0.
    SHOW_FIRST_PUBLISHED: {
      context: { data_gaps: { total: 3, classes: { missing_dims: 2, missing_hotel: 1 } } },
    },
    // readErrorCode drops anything outside PARSE_FAILURE_ALLOWLIST.
    PARSE_ERROR_LAST_GOOD: {
      context: { error_code: "MI-5_NO_ROOMS" },
    },
    // crewNameFor reads the PROJECTED context, which derives both the names and the
    // count from ctx.changes[].crew_name - not from top-level role_change_* keys.
    ROLE_FLAGS_NOTICE: {
      context: { changes: [{ crew_name: "Dana Reed" }] },
    },
    // The two identity-dependent codes: the resolver needs a UUID target, and the
    // gallery needs a declared identity because it cannot resolve one for a
    // synthetic row (§3.3). Materialize resolves the real thing instead.
    // Production renders this code as Show · email · "N crew rows"
    // (lib/adminAlerts/alertIdentityMap.ts:60-66) — it has NO crewName segment,
    // so the previous Crew-only declaration demoed a card the resolver cannot
    // produce. The email must equal the context's (the validator enforces the
    // agreement), and the count text mirrors formatCount
    // (lib/adminAlerts/resolveAlertIdentities.ts:124) over the two default ids.
    AMBIGUOUS_EMAIL_BINDING: {
      galleryIdentity: {
        segments: [
          { label: "Show", value: "Gallery Preview Show" },
          { label: null, value: DEFAULT_SHARED_EMAIL },
          { label: null, value: "2 crew rows" },
        ],
      } as unknown as AlertIdentity,
    },
    OAUTH_IDENTITY_CLAIMED: {
      galleryIdentity: {
        segments: [{ label: "Crew", value: "Sam Ito" }],
      } as unknown as AlertIdentity,
    },
  };

export function tier1AlertScenarios(): AttentionScenario[] {
  return Object.keys(ATTENTION_ROUTES).map((code) => {
    const override = ALERT_ROW_OVERRIDES[code] ?? {};
    return {
      id: scenarioIdForCode("alert", code),
      tier: 1,
      label: code,
      // Built field-by-field rather than spread: under
      // exactOptionalPropertyTypes, spreading an override whose optional
      // galleryIdentity is `undefined` is not assignable to `AlertIdentity | null`.
      alerts: [
        {
          code,
          context: withDefaultContext(code, override.context),
          raised_at: override.raised_at ?? FIXED_RAISED_AT,
          occurrence_count: override.occurrence_count ?? 1,
          ...(override.galleryIdentity !== undefined
            ? { galleryIdentity: override.galleryIdentity }
            : {}),
        },
      ],
      holds: [],
      // `warnings` deliberately ABSENT, not []: absent means materialize does not
      // touch shows_internal.parse_warnings at all (§3.4).
    };
  });
}

// ── Warning half (spec §3.2, §3.2a) ─────────────────────────────────────────
//
// INTERNAL_CODE_ENUMS is the sole source. Its producer recognizes a warning by
// TYPE (lib/messages/__internal__/parseWarningSites.ts), so there is no residue
// list to maintain and nothing to de-duplicate against. The hand-maintained
// EXTRA_WARNING_CODES this replaced had already rotted: one of its four entries
// was long since absorbed, and eleven REAL codes were dark that it never listed.
//
// `source` is a comma-joined provenance list, so membership is the test, not
// equality: a code that is both a parse warning and an admin alert is still a
// parse warning. Equality silently dropped three such codes.
export function warningCodes(): string[] {
  return Object.entries(INTERNAL_CODE_ENUMS)
    .filter(([, v]) => v.source.split(",").includes("parse_warnings.code"))
    .map(([k]) => k)
    .sort();
}

/**
 * Build a renderable ParseWarning for a code. The message is deliberately
 * generic and NEVER contains the code: warnings materialize verbatim, so a code
 * embedded here would reach the real modal and escape the §1.1 exception scope.
 * Telling synthetic from authentic is the routing readout's job (§4.1), not the
 * card's.
 */
export function buildWarning(code: string): ParseWarning {
  const base: ParseWarning = {
    severity: "warn",
    code,
    message: "Synthetic warning for gallery review.",
  };
  // roleToken is ALWAYS set on UNKNOWN_ROLE_TOKEN and ABSENT on every other
  // code - absence is what discriminates (lib/parser/types.ts).
  if (code === "UNKNOWN_ROLE_TOKEN") {
    return { ...base, roleToken: "GAFFR" };
  }
  return base;
}

export function tier1WarningScenarios(): AttentionScenario[] {
  return warningCodes().map((code) => ({
    id: scenarioIdForCode("warn", code),
    tier: 1,
    label: code,
    alerts: [],
    holds: [],
    warnings: [buildWarning(code)],
  }));
}
