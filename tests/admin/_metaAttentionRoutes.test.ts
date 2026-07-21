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

  // attention-alert-routing §3.2/§3.3: anchors are section-scoped. The discriminated
  // route union makes an invalid pairing a compile error; this is the runtime backstop
  // for the route table, and pins the invariant before PR3 adds the anchor routes.
  it("every anchor names a slot its own section declares", () => {
    const LEGAL: Record<string, string> = { diagrams: "rooms", opening_reel: "event" };
    for (const [code, r] of Object.entries(ATTENTION_ROUTES)) {
      if ("anchor" in r && r.anchor) {
        expect(LEGAL[r.anchor], `${code}: anchor ${r.anchor}`).toBe(r.sectionId);
      }
    }
  });

  // Codex PR3 R2: rooms/event have NO section-top consumer, so a card routed there
  // MUST carry an anchor or it lands in a consumerless section-top (silent drop).
  // The route union makes the anchor REQUIRED there (an anchorless `{sectionId:
  // "rooms"}` is a compile error); this is the runtime backstop for that class.
  it("every rooms/event route carries an anchor (no consumerless section-top route)", () => {
    for (const [code, r] of Object.entries(ATTENTION_ROUTES)) {
      if (r.sectionId === "rooms" || r.sectionId === "event") {
        expect(
          "anchor" in r && Boolean(r.anchor),
          `${code} routes to ${r.sectionId} sans anchor`,
        ).toBe(true);
      }
    }
  });
});
