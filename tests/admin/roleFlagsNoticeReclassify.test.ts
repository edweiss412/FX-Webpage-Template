import { describe, expect, test } from "vitest";
import { HEALTH_CODES, DOUG_EXCLUDED_CODES } from "@/lib/adminAlerts/audience";
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";
import { messageFor } from "@/lib/messages/lookup";
import { deriveAttentionItems } from "@/lib/admin/attentionItems";

/**
 * Capability-narrow / audience-reclassify (spec 2026-07-17-role-flags-notice-lead-only-doug §2.2).
 * ROLE_FLAGS_NOTICE moved `audience: health → doug`. The user-visible bell behaviors (dismissible,
 * info/accent tone not red, sheet deep-link) are all CATALOG-DERIVED from these facts — the resolve
 * routes' 403 gate + BellPanel's `isHealth` both key on HEALTH_CODES membership. Pinning the facts
 * pins the cascade.
 */
describe("ROLE_FLAGS_NOTICE reclassify (audience health → doug)", () => {
  test("is NOT a health code (→ resolve routes do not 403 it; BellPanel isHealth false → Dismiss + non-red tone + sheet action)", () => {
    expect(HEALTH_CODES).not.toContain("ROLE_FLAGS_NOTICE");
  });

  test("stays out of Doug's amber banner via the info-severity arm of DOUG_EXCLUDED_CODES", () => {
    expect(messageFor("ROLE_FLAGS_NOTICE").severity).toBe("info");
    expect(DOUG_EXCLUDED_CODES).toContain("ROLE_FLAGS_NOTICE");
  });

  test("BEHAVIORALLY absent from the show modal's attention items, not merely set-listed", () => {
    // Set membership was a proxy for behavior, and the proxy went stale: the
    // amber banner this assertion described (PerShowAlertSection) was replaced
    // by the attention surface, DOUG_EXCLUDED_CODES lost every production
    // consumer, and the code kept rendering. warning-surface-trim §5 rewired it,
    // so this now proves the exclusion instead of proving a set contains a
    // string.
    const items = deriveAttentionItems({
      alerts: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          code: "ROLE_FLAGS_NOTICE",
          context: null,
          raised_at: "2026-07-20T12:00:00.000Z",
          occurrence_count: 1,
          identityText: null,
          messageParams: {},
          crewName: null,
        },
      ],
      feed: null,
      slug: "role-flags-fixture-show",
    });
    expect(items).toEqual([]);
  });

  test("carries the openSheet action (sheet deep-link) when context has a drive_file_id", () => {
    const action = resolveAlertAction(
      "ROLE_FLAGS_NOTICE",
      { drive_file_id: "sheet-abc" },
      {
        slug: null,
      },
    );
    expect(action).not.toBeNull();
    expect(action!.external).toBe(true);
  });

  test("copy is truthful for a scope-tile (non-LEAD) legacy row — no unconditional 'gained or lost LEAD'", () => {
    const dougFacing = messageFor("ROLE_FLAGS_NOTICE").dougFacing ?? "";
    expect(dougFacing.toLowerCase()).not.toMatch(/gained or lost lead/);
    // condensed-alert-copy (spec 2026-07-17 §3.1): the lead-hint sentence is no
    // longer baked unconditionally into the static template — the catalog
    // carries the <lead-hint> placeholder, and deriveAlertMessageParams
    // (lib/adminAlerts/deriveMessageParams.ts) resolves it to "" for a
    // scope-tile-only change or to the confirm-in-show-page sentence for an
    // actual LEAD delta, so truthfulness is enforced at read time.
    expect(dougFacing).toContain("<lead-hint>");
  });
});
