/**
 * tests/app/admin/set-published-action.test.ts (published-toggle plan Task 3)
 *
 * setShowPublishedAction(slug, next) — the Published toggle's dispatcher:
 *   1. requireAdmin() FIRST (before any resolve or RPC),
 *   2. resolveShowBySlug(slug); infra_error / not_found short-circuit with NO lifecycle call,
 *   3. next=true → publishShow(id); next=false → unpublishShow(id),
 *   4. on ok → revalidateShow(id) + revalidatePath(show page) + revalidatePath('/admin'),
 *   5. on refusal → NO revalidation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn(async () => undefined);
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdmin(),
}));

const publishShow = vi.fn(async (_id: string) => ({ ok: true }) as const);
const unpublishShow = vi.fn(async (_id: string) => ({ ok: true }) as const);
vi.mock("@/lib/showLifecycle/publishShow", () => ({
  publishShow: (...a: unknown[]) => publishShow(...(a as [string])),
}));
vi.mock("@/lib/showLifecycle/unpublishShow", () => ({
  unpublishShow: (...a: unknown[]) => unpublishShow(...(a as [string])),
}));

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

// Supabase server client for resolveShowBySlug's from("shows") chain.
const maybeSingleResult = { value: { data: null as unknown, error: null as unknown } };
const maybeSingle = vi.fn(async () => maybeSingleResult.value);
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from }),
}));

import { setShowPublishedAction } from "@/app/admin/show/[slug]/_actions";
import { showCacheTag } from "@/lib/data/showCacheTag";

const RESOLVED = { id: "show-1", drive_file_id: "drive-1" };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockImplementation(async () => undefined);
  maybeSingleResult.value = { data: RESOLVED, error: null };
});

describe("setShowPublishedAction", () => {
  it("calls requireAdmin FIRST, resolves slug→id, dispatches publishShow for next=true", async () => {
    const order: string[] = [];
    requireAdmin.mockImplementation(async () => {
      order.push("admin");
    });
    publishShow.mockImplementation(async () => {
      order.push("publish");
      return { ok: true } as const;
    });
    const res = await setShowPublishedAction("slug-1", true);
    expect(order).toEqual(["admin", "publish"]);
    expect(publishShow).toHaveBeenCalledWith("show-1");
    expect(unpublishShow).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });

  it("dispatches unpublishShow for next=false", async () => {
    const res = await setShowPublishedAction("slug-1", false);
    expect(unpublishShow).toHaveBeenCalledWith("show-1");
    expect(publishShow).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });

  it("infra_error resolution short-circuits with NO lifecycle call", async () => {
    maybeSingleResult.value = { data: null, error: { message: "boom" } };
    const res = await setShowPublishedAction("slug-1", false);
    expect(res).toEqual({ ok: false, code: "infra_error" });
    expect(publishShow).not.toHaveBeenCalled();
    expect(unpublishShow).not.toHaveBeenCalled();
  });

  it("missing show short-circuits with show_not_found and NO lifecycle call", async () => {
    maybeSingleResult.value = { data: null, error: null };
    const res = await setShowPublishedAction("slug-1", true);
    expect(res).toEqual({ ok: false, code: "show_not_found" });
    expect(publishShow).not.toHaveBeenCalled();
  });

  it("on ok: revalidates the show tag + both paths (POST-COMMIT)", async () => {
    await setShowPublishedAction("slug-1", false);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag("show-1"), { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/show/slug-1");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("on refusal: returns the typed result and does NOT revalidate", async () => {
    unpublishShow.mockResolvedValueOnce({
      ok: false,
      code: "FINALIZE_OWNED_SHOW",
    } as unknown as { ok: true });
    const res = await setShowPublishedAction("slug-1", false);
    expect(res).toEqual({ ok: false, code: "FINALIZE_OWNED_SHOW" });
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a non-admin caller propagates the requireAdmin failure and never resolves or dispatches", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    await expect(setShowPublishedAction("slug-1", true)).rejects.toThrow("forbidden");
    expect(from).not.toHaveBeenCalled();
    expect(publishShow).not.toHaveBeenCalled();
  });
});
