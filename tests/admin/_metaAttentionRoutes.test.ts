// tests/admin/_metaAttentionRoutes.test.ts
//
// Structural meta-test (spec §4/§12): ATTENTION_ROUTES must cover the FULL
// production admin_alerts registry exactly. lib/ cannot import tests/, so the
// routes module declares its own list and this test pins set-equality — a code
// added to the registry without a route (or a stale route for a retired code)
// fails by default.
import { describe, expect, it } from "vitest";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { ADMIN_ALERTS_CODES } from "@/tests/messages/adminAlertsRegistry";

describe("_metaAttentionRoutes — ATTENTION_ROUTES covers the production registry exactly", () => {
  it("route keys are SET-EQUAL to ADMIN_ALERTS_CODES", () => {
    expect(new Set(Object.keys(ATTENTION_ROUTES))).toEqual(new Set(ADMIN_ALERTS_CODES));
  });

  it("exactly the three crew-domain codes route to crew", () => {
    const crew = Object.entries(ATTENTION_ROUTES)
      .filter(([, r]) => r.sectionId === "crew")
      .map(([c]) => c)
      .sort();
    expect(crew).toEqual([
      "AMBIGUOUS_EMAIL_BINDING",
      "OAUTH_IDENTITY_CLAIMED",
      "ROLE_FLAGS_NOTICE",
    ]);
  });
});
