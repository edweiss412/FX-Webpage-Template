// Phase 2 (nav-perf) E-lite (spec §7 (b)) — app/admin/layout.tsx must read its two
// independent badge counts (fetchUnresolvedAlertCount + loadNeedsAttentionCount)
// CONCURRENTLY, not sequentially, so first /admin entry blocks on one wall-time.
// Deferred mocks record when each helper is INITIATED; a serial `await a; await b`
// layout initiates loadNeedsAttentionCount only after fetchUnresolvedAlertCount
// resolves, so it fails the "both started before release" gate.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  started: [] as string[],
  gates: {} as Record<string, (v: unknown) => void>,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: class AdminInfraError extends Error {},
  requireAdminIdentity: async () => ({ email: "admin@example.test" }),
}));
vi.mock("@/components/admin/nav/AdminNav", () => ({ AdminNav: () => null }));
vi.mock("@/components/layout/PageTransition", () => ({
  PageTransition: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/messages/lookup", () => ({ getRequiredDougFacing: () => "load failed" }));
vi.mock("@/lib/admin/alertCount", () => ({
  fetchUnresolvedAlertCount: () => {
    state.started.push("alert");
    return new Promise((res) => {
      state.gates.alert = res;
    });
  },
}));
vi.mock("@/lib/admin/needsAttentionCount", () => ({
  loadNeedsAttentionCount: () => {
    state.started.push("needs");
    return new Promise((res) => {
      state.gates.needs = res;
    });
  },
}));

import AdminLayout from "@/app/admin/layout";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  state.started = [];
  state.gates = {};
});
afterEach(() => vi.clearAllMocks());

describe("app/admin/layout.tsx — parallel badge reads (Phase 2 E-lite)", () => {
  it("initiates BOTH badge reads before either resolves (serial layout fails)", async () => {
    const p = AdminLayout({ children: null });
    await flush();
    expect(state.started).toContain("alert");
    expect(state.started).toContain("needs");
    expect(state.started).toHaveLength(2);
    // release so the layout can finish building its element tree
    state.gates.alert!({ kind: "ok", count: 0 });
    state.gates.needs!({ kind: "ok", count: 1 });
    await expect(p).resolves.toBeDefined();
  });
});
