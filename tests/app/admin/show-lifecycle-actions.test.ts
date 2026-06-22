/**
 * tests/app/admin/show-lifecycle-actions.test.ts (M12.2 Phase B2 Task 7.1)
 *
 * The three admin-gated per-show lifecycle server actions:
 *   - archiveShowAction(slug)   → archive_show caller
 *   - publishShowAction(slug)   → publish_show caller
 *   - unarchiveShowAction(showId) → unarchive_show caller (catch-up sync)
 *
 * Each action MUST:
 *   1. call requireAdmin() FIRST (before any slug→id resolve or RPC),
 *   2. resolve the show (slug→id for archive/publish; id→drive_file_id for
 *      unarchive),
 *   3. invoke the matching `lib/showLifecycle` caller and return its typed
 *      result (unarchive returns void to match the Dashboard prop contract),
 *   4. map a MISSING slug/show → the generic not-found result
 *      (ADMIN_LINK_SHOW_NOT_FOUND is RETIRED — the UI handles it as a generic
 *      refresh prompt; the action surfaces { ok:false, code:"show_not_found" }
 *      for archive/publish so the UI never calls messageFor on a retired code),
 *   5. a non-admin caller → the requireAdmin gate failure propagates (the
 *      caller never runs).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks for the action dependencies. ---
const requireAdmin = vi.fn(async () => undefined);
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdmin(),
}));

const archiveShow = vi.fn(async (_id: string) => ({ ok: true }) as const);
const publishShow = vi.fn(async (_id: string) => ({ ok: true }) as const);
const unarchiveShow = vi.fn(async (_id: string, _drive: string) => ({ ok: true }) as const);
vi.mock("@/lib/showLifecycle/archiveShow", () => ({
  archiveShow: (...a: unknown[]) => archiveShow(...(a as [string])),
}));
vi.mock("@/lib/showLifecycle/publishShow", () => ({
  publishShow: (...a: unknown[]) => publishShow(...(a as [string])),
}));
vi.mock("@/lib/showLifecycle/unarchiveShow", () => ({
  unarchiveShow: (...a: unknown[]) => unarchiveShow(...(a as [string, string])),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

// Supabase server client: a `from("shows").select(...).eq(...).maybeSingle()`
// chain whose terminal value the test controls per-case.
const maybeSingleResult = { value: { data: null as unknown, error: null as unknown } };
const maybeSingle = vi.fn(async () => maybeSingleResult.value);
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from }),
}));

import {
  archiveShowAction,
  publishShowAction,
  unarchiveShowAction,
} from "@/app/admin/show/[slug]/_actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockImplementation(async () => undefined);
  maybeSingleResult.value = { data: null, error: null };
});

describe("per-show lifecycle server actions (Task 7.1)", () => {
  it("archiveShowAction calls requireAdmin FIRST, resolves slug→id, invokes archiveShow, returns its result", async () => {
    const order: string[] = [];
    requireAdmin.mockImplementation(async () => {
      order.push("admin");
    });
    archiveShow.mockImplementation(async () => {
      order.push("archive");
      return { ok: true } as const;
    });
    maybeSingleResult.value = { data: { id: "show-1", drive_file_id: "drive-1" }, error: null };

    const res = await archiveShowAction("my-slug");

    expect(order).toEqual(["admin", "archive"]);
    expect(from).toHaveBeenCalledWith("shows");
    expect(eq).toHaveBeenCalledWith("slug", "my-slug");
    expect(archiveShow).toHaveBeenCalledWith("show-1");
    expect(res).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("publishShowAction resolves slug→id, invokes publishShow, returns its typed refusal", async () => {
    publishShow.mockResolvedValue({ ok: false, code: "PUBLISH_BLOCKED_PENDING_REVIEW" } as never);
    maybeSingleResult.value = { data: { id: "show-2", drive_file_id: "drive-2" }, error: null };

    const res = await publishShowAction("slug-2");

    expect(publishShow).toHaveBeenCalledWith("show-2");
    expect(res).toEqual({ ok: false, code: "PUBLISH_BLOCKED_PENDING_REVIEW" });
  });

  it("unarchiveShowAction resolves id→drive_file_id, invokes unarchiveShow(showId, driveFileId), returns void", async () => {
    maybeSingleResult.value = { data: { id: "show-3", drive_file_id: "drive-3" }, error: null };

    const res = await unarchiveShowAction("show-3");

    expect(requireAdmin).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "show-3");
    expect(unarchiveShow).toHaveBeenCalledWith("show-3", "drive-3");
    expect(res).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("archiveShowAction on a missing slug → generic not-found result (NOT a retired-code messageFor path)", async () => {
    maybeSingleResult.value = { data: null, error: null };
    const res = await archiveShowAction("ghost");
    expect(archiveShow).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: false, code: "show_not_found" });
  });

  it("non-admin caller → requireAdmin throws and the caller never runs", async () => {
    requireAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(archiveShowAction("slug")).rejects.toThrow();
    expect(archiveShow).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  // R7 (invariant 9): a Supabase outage during resolution must surface as infra_error (retry copy), NOT
  // be masked as show_not_found (a deleted/stale show). Distinct codes → distinct UI treatment.
  it("archiveShowAction: a RETURNED Supabase error during resolve → infra_error, NOT show_not_found", async () => {
    maybeSingleResult.value = { data: null, error: { message: "connection reset" } };
    const res = await archiveShowAction("slug");
    expect(archiveShow).not.toHaveBeenCalled(); // fail closed — no mutation
    expect(res).toEqual({ ok: false, code: "infra_error" });
  });

  it("publishShowAction: a THROWN Supabase fault during resolve → infra_error, NOT show_not_found", async () => {
    maybeSingle.mockRejectedValueOnce(new Error("query threw mid-await"));
    const res = await publishShowAction("slug");
    expect(publishShow).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: false, code: "infra_error" });
  });

  it("unarchiveShowAction (void): a resolve infra_error → no-op, does NOT invoke unarchiveShow", async () => {
    maybeSingleResult.value = { data: null, error: { message: "outage" } };
    const res = await unarchiveShowAction("show-x");
    expect(unarchiveShow).not.toHaveBeenCalled();
    expect(res).toBeUndefined();
  });
});
