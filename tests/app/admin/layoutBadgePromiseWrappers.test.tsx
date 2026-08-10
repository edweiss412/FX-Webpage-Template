// @vitest-environment jsdom
/**
 * admin-nav-badge-streaming Task 3 (spec §3.2, §5 limit 2, AC-2/AC-6).
 *
 * The layout no longer awaits the badge loaders, so nothing in the server
 * render is left holding their failure. Both loaders return discriminated
 * results by contract (invariant 9), but a THROWN infra fault would otherwise
 * become a rejected promise crossing the RSC boundary — an unhandled rejection
 * with no owner, and a nav that loses its chrome for a failed count.
 *
 * Concrete failure mode caught: deleting either `.catch(...)` wrapper. The
 * promise then rejects instead of resolving to `{kind:"infra_error"}`, so the
 * hooks never see the ratified degradation (attention chip hidden, bell
 * degraded) and the rejection escapes.
 */
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  bellRejects: false,
  needsRejects: false,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: class AdminInfraError extends Error {},
  requireAdminIdentity: async () => ({ email: "admin@example.test" }),
}));
vi.mock("@/lib/auth/requireDeveloper", () => ({ isCurrentUserDeveloper: async () => false }));
vi.mock("@/lib/admin/healthRollup", () => ({
  fetchHealthRollup: async () => ({ kind: "ok", severity: "none" }),
}));
vi.mock("@/lib/appSettings/readAppSettingsRow", () => ({
  readAppSettingsRow: async () => ({
    kind: "value",
    settings: { pending_wizard_session_id: null, watched_folder_id: "folder-1" },
  }),
}));
vi.mock("@/lib/messages/lookup", () => ({ getRequiredDougFacing: () => "load failed" }));
vi.mock("@/components/layout/PageTransition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => children,
}));

// Stubbed so the element tree carries an identifiable node whose props are the
// seam under test. Marked with a property rather than compared by identity, so
// the walk does not depend on module-instance equality.
vi.mock("@/components/admin/nav/AdminNav", () => ({
  AdminNav: Object.assign(() => null, { __isAdminNavStub: true }),
}));

vi.mock("@/lib/admin/bellFeed", () => ({
  loadBellUnseenCount: async () => {
    if (state.bellRejects) throw new Error("bell infra fault");
    return { kind: "ok", count: 2 };
  },
}));
vi.mock("@/lib/admin/needsAttentionCount", () => ({
  loadNeedsAttentionCount: async () => {
    if (state.needsRejects) throw new Error("needs infra fault");
    return { kind: "ok", count: 5 };
  },
}));

import AdminLayout from "@/app/admin/layout";

type NavProps = {
  bellCountPromise?: Promise<unknown>;
  attentionCountPromise?: Promise<unknown>;
};

function isElement(node: unknown): node is ReactElement<Record<string, unknown>> {
  return typeof node === "object" && node !== null && "props" in node && "type" in node;
}

/** Depth-first search for the stubbed AdminNav element in a returned tree. */
function findNavProps(node: unknown): NavProps | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNavProps(child);
      if (found) return found;
    }
    return null;
  }
  if (!isElement(node)) return null;
  const type = node.type as unknown as { __isAdminNavStub?: boolean };
  if (type && type.__isAdminNavStub === true) return node.props as NavProps;
  return findNavProps((node.props as { children?: unknown }).children);
}

beforeEach(() => {
  state.bellRejects = false;
  state.needsRejects = false;
});
afterEach(() => vi.clearAllMocks());

describe("app/admin/layout.tsx — badge promises can never reject (AC-2, AC-6)", () => {
  it("passes both loader promises to AdminNav on the settled branch", async () => {
    const tree = await AdminLayout({ children: null });
    const props = findNavProps(tree);
    expect(props).not.toBeNull();
    await expect(props!.bellCountPromise).resolves.toEqual({ kind: "ok", count: 2 });
    await expect(props!.attentionCountPromise).resolves.toEqual({ kind: "ok", count: 5 });
  });

  it("a THROWING bell loader resolves to {kind:'infra_error'} instead of rejecting", async () => {
    state.bellRejects = true;
    const tree = await AdminLayout({ children: null });
    const props = findNavProps(tree);
    await expect(props!.bellCountPromise).resolves.toEqual({ kind: "infra_error" });
    // The other read is unaffected — one failing loader must not degrade both.
    await expect(props!.attentionCountPromise).resolves.toEqual({ kind: "ok", count: 5 });
  });

  it("a THROWING needs-attention loader resolves to {kind:'infra_error'} instead of rejecting", async () => {
    state.needsRejects = true;
    const tree = await AdminLayout({ children: null });
    const props = findNavProps(tree);
    await expect(props!.attentionCountPromise).resolves.toEqual({ kind: "infra_error" });
    await expect(props!.bellCountPromise).resolves.toEqual({ kind: "ok", count: 2 });
  });

  it("neither rejection reaches the process as an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      state.bellRejects = true;
      state.needsRejects = true;
      const tree = await AdminLayout({ children: null });
      const props = findNavProps(tree);
      // Deliberately do NOT attach a handler before the microtask drain: an
      // unwrapped rejected promise would be reported in this window.
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).toEqual([]);
      await expect(props!.bellCountPromise).resolves.toEqual({ kind: "infra_error" });
      await expect(props!.attentionCountPromise).resolves.toEqual({ kind: "infra_error" });
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
