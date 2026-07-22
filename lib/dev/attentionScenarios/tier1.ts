// Tier-1 scenarios: one per alert code, one per warning code (spec §3.1, §3.2).
//
// Alert totality is STRUCTURAL. Scenarios are derived at runtime from
// ATTENTION_ROUTES keys, so a new alert code appears in the gallery the moment
// its routing row lands - no catalog edit, no drift, and no completeness
// meta-test needed (which is why §1.1 can decline that gate without accepting
// drift).
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
    AMBIGUOUS_EMAIL_BINDING: {
      context: { crew_member_id: "3f8c1e2a-5b6d-4c7e-8f90-1a2b3c4d5e6f" },
      galleryIdentity: {
        segments: [{ label: "Crew", value: "Dana Reed" }],
      } as unknown as AlertIdentity,
    },
    OAUTH_IDENTITY_CLAIMED: {
      context: { crew_member_id: "7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d" },
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
          context: override.context ?? {},
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
// No single runtime module enumerates the parse-warning universe:
//   - INTERNAL_CODE_ENUMS is generated and lib-importable, but its producer
//     (scripts/extract-internal-code-enums.ts:71-72) only scans files matching
//     /\bParseWarning\b|\bwarnings\b|hardErrors/, so emitters elsewhere are missed.
//   - tests/messages/warningCardCopyRegistry.ts has more codes but lives under
//     tests/, which lib/ must not import, and is not a superset either.
//   - MESSAGE_CATALOG holds all of them but carries no field to partition on.
// So: the generated enum PLUS an enumerated residue, de-duplicated.

/**
 * Parse-warning codes the generator's scan heuristic misses, each with the file
 * that emits it. Backlog BL-INTERNAL-CODE-ENUM-SCAN-WIDEN widens the heuristic,
 * after which this list becomes a no-op rather than a double-render, because
 * warningCodes() de-duplicates.
 */
export const EXTRA_WARNING_CODES: readonly string[] = [
  "AGENDA_SCHEDULE_LOW_CONFIDENCE", // lib/agenda/extractAgendaSchedule.ts
  "AGENDA_SCHEDULE_TIME_ADJUSTED", // lib/sync/enrichAgenda.ts
  "PULL_SHEET_ON_ARCHIVED_TAB", // lib/sync/pullSheetOverride.ts
  "PULL_SHEET_OVERRIDE_CONTENT_CHANGED", // lib/sync/pullSheetOverride.ts
];

export function warningCodes(): string[] {
  const generated = Object.entries(INTERNAL_CODE_ENUMS)
    .filter(([, v]) => v.source === "parse_warnings.code")
    .map(([k]) => k);
  return [...new Set([...generated, ...EXTRA_WARNING_CODES])].sort();
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
