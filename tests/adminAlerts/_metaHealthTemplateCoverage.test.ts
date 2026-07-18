/**
 * tests/adminAlerts/_metaHealthTemplateCoverage.test.ts
 *
 * THE PROBLEM:
 *   HealthAlertsPanel (components/admin/telemetry/HealthAlertsPanel.tsx) renders
 *   catalog `dougFacing` with params from `deriveAlertMessageParams(code, context, null)`
 *   but has NO unresolved-placeholder guard (unlike BellPanel / PerShowAlertSection,
 *   spec §4.3). Invariant 5 (no raw `<token>` in UI) rests entirely on
 *   `lib/adminAlerts/deriveMessageParams.ts` providing an always-resolving param for
 *   EVERY placeholder that can appear in a health-audience template. Today that holds
 *   (Task 9 tests prove it), but a FUTURE catalog template adding a new `<token>` on
 *   any audience:"health" code would silently leak the literal token to the health
 *   panel — deriveAlertMessageParams special-cases placeholders per code (see its
 *   `if (code === "BRANCH_PROTECTION_DRIFT" ...)` blocks), so a new health code isn't
 *   automatically covered just because its neighbors are.
 *
 * THE META-DISCIPLINE:
 *   Walk MESSAGE_CATALOG for every entry with audience === "health" and a non-null
 *   dougFacing (the field HealthAlertsPanel renders — see its
 *   `detailTemplate = raw?.title ? raw.dougFacing : null` / `headingTemplate = raw?.title
 *   ?? raw?.dougFacing` wiring). For each `<placeholder>` token in that template,
 *   interpolate with `deriveAlertMessageParams(code, null, null)` params — the same
 *   entry point + interpolation (`interpolate` from lib/messages/lookup, which
 *   `renderCatalogEmphasis` also calls) the panel uses — and assert nothing remains
 *   unresolved. `context: null` is the worst case (no producer-supplied context),
 *   matching a freshly-raised alert row with an empty/absent context object.
 *
 *   Fails-by-default: the code list is derived by walking the catalog, never
 *   hardcoded, so a new health-audience code with an unresolved placeholder fails
 *   this test the moment it's added — same discipline as the sibling meta-tests
 *   (_metaAlertIdentityMap, _metaInfraContract).
 */
import { describe, expect, it } from "vitest";
import {
  MESSAGE_CATALOG,
  type MessageCatalogEntry,
  type MessageCode,
} from "@/lib/messages/catalog";
import { deriveAlertMessageParams } from "@/lib/adminAlerts/deriveMessageParams";
import { interpolate } from "@/lib/messages/lookup";

const PLACEHOLDER_RE = /<([a-zA-Z][a-zA-Z0-9_-]*)>/g;
const UNRESOLVED_RE = /<[a-zA-Z][a-zA-Z0-9_-]*>/;

// Cast mirrors lib/adminAlerts/audience.ts's `entries` pattern — the `as const
// satisfies` catalog type is a union of per-entry object literals, so a bare
// `entry.audience` access doesn't type-check across the union without this.
const CATALOG_ENTRIES = Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[];

function healthCodesWithDougFacing(): MessageCode[] {
  return CATALOG_ENTRIES.filter((entry) => entry.audience === "health" && entry.dougFacing).map(
    (entry) => entry.code as MessageCode,
  );
}

describe("_metaHealthTemplateCoverage", () => {
  const codes = healthCodesWithDougFacing();

  it("has at least one health-audience code with a non-null dougFacing (sanity)", () => {
    expect(codes.length).toBeGreaterThan(0);
  });

  it.each(codes)(
    "every <placeholder> in %s dougFacing resolves via deriveAlertMessageParams(code, null, null)",
    (code) => {
      const template = MESSAGE_CATALOG[code].dougFacing;
      expect(template, `${code} has no dougFacing template`).not.toBeNull();
      if (!template) return;

      const tokens = [...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
      if (tokens.length === 0) return; // nothing to resolve for this code

      const params = deriveAlertMessageParams(code, null, null);
      const rendered = interpolate(template, params);

      expect(
        rendered && UNRESOLVED_RE.test(rendered),
        `health-audience template ${code} carries placeholder <${tokens.join(
          ">, <",
        )}> that deriveAlertMessageParams does not resolve with null context/identity — add an always-resolving fallback in lib/adminAlerts/deriveMessageParams.ts (invariant 5; HealthAlertsPanel has no render guard)`,
      ).toBe(false);
    },
  );
});
