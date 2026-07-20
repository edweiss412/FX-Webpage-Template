/**
 * tests/adminAlerts/_metaAdminTemplateCoverage.test.ts
 *
 * THE PROBLEM:
 *   Every admin_alerts code's dougFacing template (full-sweep copy plan,
 *   spec docs/superpowers/specs/2026-07-18-alert-copy-full-sweep-design.md)
 *   is a self-contained inline-context string resolved at read time by
 *   `deriveAlertMessageParams` (lib/adminAlerts/deriveMessageParams.ts). If a
 *   template names a `<token>` deriveAlertMessageParams doesn't always
 *   resolve, the literal placeholder leaks to whichever admin surface
 *   renders that code (AlertBanner, BellPanel, PerShowAlertSection,
 *   HealthAlertsPanel, NeedsAttentionInbox) — invariant 5 (no raw `<token>`
 *   in UI). Not every surface has an unresolved-placeholder render guard
 *   (HealthAlertsPanel notably doesn't — see the sibling meta-test this file
 *   folds in below), so the guarantee has to live in
 *   deriveAlertMessageParams itself: EVERY token any admin template can
 *   carry must always resolve, even with the worst-case
 *   `context: null, identity: null` inputs (a freshly-raised alert row with
 *   no producer context and no resolvable identity).
 *
 * THE META-DISCIPLINE:
 *   Walk the FULL `ADMIN_ALERTS_CODES` registry (tests/messages/adminAlertsRegistry.ts
 *   — the canonical list of every code used in a production admin_alerts.upsert
 *   call), not a hand-picked or audience-filtered subset. For each code's
 *   catalog dougFacing template, extract every `<placeholder>` token and
 *   interpolate with `deriveAlertMessageParams(code, null, null, "global")` params —
 *   the same entry point + `interpolate()` (lib/messages/lookup.ts) every
 *   admin render surface uses — and assert nothing remains unresolved.
 *
 *   Fails-by-default: the code list is derived from the registry, never
 *   hardcoded, so a new admin_alerts code with an unresolved placeholder
 *   fails this test the moment it's registered — same discipline as the
 *   sibling meta-tests (_metaAlertIdentityMap, _metaInfraContract).
 *
 *   Folds in the former tests/adminAlerts/_metaHealthTemplateCoverage.test.ts
 *   (deleted in this commit): every health-audience code is a subset of
 *   ADMIN_ALERTS_CODES (verified — health-audience codes are always raised
 *   via admin_alerts.upsert), so walking the full admin registry strictly
 *   supersedes the health-only walk.
 */
import { describe, expect, it } from "vitest";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { ADMIN_ALERTS_CODES } from "@/tests/messages/adminAlertsRegistry";
import { deriveAlertMessageParams } from "@/lib/adminAlerts/deriveMessageParams";
import { interpolate } from "@/lib/messages/lookup";

const PLACEHOLDER_RE = /<([a-zA-Z][a-zA-Z0-9_-]*)>/g;
const UNRESOLVED_RE = /<[a-zA-Z][a-zA-Z0-9_-]*>/;

const CATALOG_ENTRIES = MESSAGE_CATALOG as Record<string, MessageCatalogEntry>;

describe("_metaAdminTemplateCoverage", () => {
  it("has at least one ADMIN_ALERTS_CODES entry (sanity)", () => {
    expect(ADMIN_ALERTS_CODES.length).toBeGreaterThan(0);
  });

  it.each(ADMIN_ALERTS_CODES)(
    "every <placeholder> in %s dougFacing resolves via deriveAlertMessageParams(code, null, null)",
    (code) => {
      const entry = CATALOG_ENTRIES[code];
      expect(
        entry,
        `${code} is registered in ADMIN_ALERTS_CODES but missing from MESSAGE_CATALOG`,
      ).toBeDefined();

      const template = entry!.dougFacing;
      expect(template, `${code} has no dougFacing template`).not.toBeNull();
      if (!template) return;

      const tokens = [...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
      if (tokens.length === 0) return; // nothing to resolve for this code

      const params = deriveAlertMessageParams(code, null, null, "global");
      const rendered = interpolate(template, params);

      expect(
        rendered && UNRESOLVED_RE.test(rendered),
        `admin_alerts template ${code} carries placeholder <${tokens.join(
          ">, <",
        )}> that deriveAlertMessageParams does not resolve with null context/identity — add an always-resolving fallback in lib/adminAlerts/deriveMessageParams.ts (invariant 5; not every admin render surface guards unresolved placeholders)`,
      ).toBe(false);
    },
  );
});
