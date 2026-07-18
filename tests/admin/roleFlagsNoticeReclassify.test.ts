import { describe, expect, test } from "vitest";
import { HEALTH_CODES, DOUG_EXCLUDED_CODES } from "@/lib/adminAlerts/audience";
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";
import { messageFor } from "@/lib/messages/lookup";

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
    // conditional phrasing survives (truthful for both scope-tile legacy rows and capability rows)
    expect(dougFacing).toMatch(/if the change included lead/i);
  });
});
