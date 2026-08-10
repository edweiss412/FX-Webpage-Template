// admin-nav-badge-streaming Task 1 (spec §3.1, AC-1) — on the onboarding
// early-return branch, app/admin/layout.tsx must issue ZERO badge reads.
//
// Concrete failure mode caught: the layout awaits loadBellUnseenCount +
// loadNeedsAttentionCount BEFORE deciding `inOnboarding`, so a first-run admin
// pays two Supabase round-trips whose results the onboarding chrome never
// consumes (OnboardingTopBar takes email/healthRollup/isDeveloper only). The
// assertion is on CALL COUNT, not on render output, so a layout that "uses"
// the values conditionally still fails: the read must not be ISSUED.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  bellCalls: 0,
  needsCalls: 0,
  settings: {
    pending_wizard_session_id: null as string | null,
    watched_folder_id: null as string | null,
  },
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: class AdminInfraError extends Error {},
  requireAdminIdentity: async () => ({ email: "admin@example.test" }),
}));
vi.mock("@/lib/auth/requireDeveloper", () => ({ isCurrentUserDeveloper: async () => false }));
vi.mock("@/lib/admin/healthRollup", () => ({
  fetchHealthRollup: async () => ({ kind: "ok", severity: "none" }),
}));
vi.mock("@/components/admin/nav/AdminNav", () => ({ AdminNav: () => null }));
vi.mock("@/components/admin/nav/OnboardingTopBar", () => ({ OnboardingTopBar: () => null }));
vi.mock("@/components/layout/PageTransition", () => ({
  PageTransition: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/messages/lookup", () => ({ getRequiredDougFacing: () => "load failed" }));
vi.mock("@/lib/appSettings/readAppSettingsRow", () => ({
  readAppSettingsRow: async () => ({ kind: "value", settings: state.settings }),
}));
vi.mock("@/lib/admin/bellFeed", () => ({
  loadBellUnseenCount: async () => {
    state.bellCalls += 1;
    return { kind: "ok", count: 3 };
  },
}));
vi.mock("@/lib/admin/needsAttentionCount", () => ({
  loadNeedsAttentionCount: async () => {
    state.needsCalls += 1;
    return { kind: "ok", count: 4 };
  },
}));

import AdminLayout from "@/app/admin/layout";

beforeEach(() => {
  state.bellCalls = 0;
  state.needsCalls = 0;
  state.settings = { pending_wizard_session_id: null, watched_folder_id: null };
});
afterEach(() => vi.clearAllMocks());

describe("app/admin/layout.tsx — onboarding branch issues no badge reads (AC-1)", () => {
  it("calls NEITHER badge loader when the folder is unwatched (first-run onboarding)", async () => {
    await AdminLayout({ children: null });
    expect({ bell: state.bellCalls, needs: state.needsCalls }).toEqual({ bell: 0, needs: 0 });
  });

  // Premise: the same layout on the SETTLED branch must still issue both reads.
  // Without this row, "delete both call sites" would satisfy the case above —
  // the guard would pass while the badge went permanently dark.
  it("still issues both badge reads on the settled (full nav) branch", async () => {
    state.settings = { pending_wizard_session_id: null, watched_folder_id: "folder-1" };
    await AdminLayout({ children: null });
    expect({ bell: state.bellCalls, needs: state.needsCalls }).toEqual({ bell: 1, needs: 1 });
  });
});
