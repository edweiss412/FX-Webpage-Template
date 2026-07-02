/**
 * tests/app/admin/undo-auto-publish-action.test.ts (M12.13 Task 12)
 *
 * The admin-gated in-app "Undo auto-publish" server action
 * (app/admin/show/[slug]/_actions/undoAutoPublish.ts). Contract (spec §6.2):
 *
 *   1. requireAdmin() runs FIRST (defense in depth — the page already gated,
 *      but a direct action dispatch must re-authorize).
 *   2. Service-role / raw read of the stored `unpublish_token` by slug, then
 *      calls the PLAIN session-authed `unpublishShow({slug, token})` — NEVER the
 *      emailed-link wrapper `unpublishShowViaEmailedLink` (which requires the
 *      recipient binding `r`; the in-app caller is session-authed and has no r).
 *   3. Maps the typed UnpublishShowResult to a UI-facing outcome:
 *        success  → { outcome: "success" }
 *        expired  → { outcome: "expired" }   (catalog UNPUBLISH_TOKEN_EXPIRED)
 *        consumed → { outcome: "consumed" }  (catalog UNPUBLISH_TOKEN_CONSUMED;
 *                                             CONSUMED is allowed in-app)
 *        not_found / token-vanished-between-render-and-click → consumed (the
 *          catalog outcome — no crash, no raw code; invariant 5).
 *      A returned OR thrown infra fault (token read OR unpublishShow) →
 *      { outcome: "infra_error" } (the button renders the retry state — invariant 9).
 *   4. On success revalidates the per-show page + dashboard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn(async () => undefined);
const SEEDED_ADMIN = "admin@fxav.test"; // already-canonical (requireAdminIdentity returns canonicalize()'d)
const requireAdminIdentity = vi.fn(async () => ({ email: SEEDED_ADMIN }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdmin(),
  requireAdminIdentity: () => requireAdminIdentity(),
}));

// Task 10 — durable admin-outcome telemetry sink (SHOW_UNPUBLISHED_BY_ADMIN).
const logAdminOutcome = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome }));

type UnpublishResult =
  | { outcome: "success"; status: 200; showId: string }
  | { outcome: "expired"; status: 400; code: string; showId: string }
  | { outcome: "consumed"; status: 400; code: string; showId: string }
  | { outcome: "not_found"; status: 404 };

const readUnpublishTokenForSlug = vi.fn<(slug: string) => Promise<string | null>>(
  async () => "tok-stored",
);
const unpublishShow = vi.fn<(args: { slug: string; token: string }) => Promise<UnpublishResult>>(
  async () => ({ outcome: "success", status: 200, showId: "s1" }),
);
const unpublishShowViaEmailedLink = vi.fn();
vi.mock("@/lib/sync/unpublishShow", () => ({
  readUnpublishTokenForSlug: (slug: string) => readUnpublishTokenForSlug(slug),
  unpublishShow: (a: { slug: string; token: string }) => unpublishShow(a),
  unpublishShowViaEmailedLink: (...a: unknown[]) => unpublishShowViaEmailedLink(...a),
  UNPUBLISH_TOKEN_CONSUMED: "UNPUBLISH_TOKEN_CONSUMED",
  UNPUBLISH_TOKEN_EXPIRED: "UNPUBLISH_TOKEN_EXPIRED",
}));

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

import { undoAutoPublishAction } from "@/app/admin/show/[slug]/_actions/undoAutoPublish";
import { showCacheTag } from "@/lib/data/showCacheTag";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockImplementation(async () => undefined);
  requireAdminIdentity.mockResolvedValue({ email: SEEDED_ADMIN });
  readUnpublishTokenForSlug.mockResolvedValue("tok-stored");
  unpublishShow.mockResolvedValue({ outcome: "success", status: 200, showId: "s1" });
});

describe("undoAutoPublishAction (Task 12, spec §6.2)", () => {
  it("requireAdmin FIRST, reads stored token, calls PLAIN unpublishShow, returns success + revalidates", async () => {
    const order: string[] = [];
    requireAdmin.mockImplementation(async () => {
      order.push("admin");
    });
    readUnpublishTokenForSlug.mockImplementation(async () => {
      order.push("read");
      return "tok-stored";
    });
    unpublishShow.mockImplementation(async () => {
      order.push("unpublish");
      return { outcome: "success", status: 200, showId: "s1" };
    });

    const res = await undoAutoPublishAction("rpas");

    expect(order).toEqual(["admin", "read", "unpublish"]);
    expect(unpublishShow).toHaveBeenCalledWith({ slug: "rpas", token: "tok-stored" });
    // NEVER the emailed-link wrapper (no recipient binding in-app).
    expect(unpublishShowViaEmailedLink).not.toHaveBeenCalled();
    expect(res).toEqual({ outcome: "success" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/show/rpas");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    // nav-perf tag-caching (Task 8/9): success unpublished+archived the show → revalidate its tag.
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag("s1"), { expire: 0 });
  });

  it("non-admin → requireAdmin throws and nothing else runs", async () => {
    requireAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(undoAutoPublishAction("rpas")).rejects.toThrow();
    expect(readUnpublishTokenForSlug).not.toHaveBeenCalled();
    expect(unpublishShow).not.toHaveBeenCalled();
  });

  it("token vanished between render and click (read → null) → consumed catalog outcome, no unpublishShow call", async () => {
    readUnpublishTokenForSlug.mockResolvedValue(null);
    const res = await undoAutoPublishAction("rpas");
    expect(unpublishShow).not.toHaveBeenCalled();
    expect(res).toEqual({ outcome: "consumed" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("unpublishShow expired → expired catalog outcome (no revalidate)", async () => {
    unpublishShow.mockResolvedValue({
      outcome: "expired",
      status: 400,
      code: "UNPUBLISH_TOKEN_EXPIRED",
      showId: "s1",
    });
    const res = await undoAutoPublishAction("rpas");
    expect(res).toEqual({ outcome: "expired" });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("unpublishShow consumed → consumed catalog outcome (allowed in-app)", async () => {
    unpublishShow.mockResolvedValue({
      outcome: "consumed",
      status: 400,
      code: "UNPUBLISH_TOKEN_CONSUMED",
      showId: "s1",
    });
    const res = await undoAutoPublishAction("rpas");
    expect(res).toEqual({ outcome: "consumed" });
  });

  it("unpublishShow not_found → consumed catalog outcome (token vanished mid-flight, no crash/raw code)", async () => {
    unpublishShow.mockResolvedValue({ outcome: "not_found", status: 404 });
    const res = await undoAutoPublishAction("rpas");
    expect(res).toEqual({ outcome: "consumed" });
  });

  it("token read THROWS → infra_error (invariant 9), no unpublishShow call", async () => {
    readUnpublishTokenForSlug.mockRejectedValue(new Error("db reset"));
    const res = await undoAutoPublishAction("rpas");
    expect(unpublishShow).not.toHaveBeenCalled();
    expect(res).toEqual({ outcome: "infra_error" });
  });

  it("unpublishShow THROWS → infra_error (invariant 9)", async () => {
    unpublishShow.mockRejectedValue(new Error("tx failed"));
    const res = await undoAutoPublishAction("rpas");
    expect(res).toEqual({ outcome: "infra_error" });
  });

  it("Task 10: committed success emits SHOW_UNPUBLISHED_BY_ADMIN admin-outcome telemetry once", async () => {
    unpublishShow.mockResolvedValue({ outcome: "success", status: 200, showId: "s1" });
    const res = await undoAutoPublishAction("rpas");
    expect(res).toEqual({ outcome: "success" });
    // actorEmail derives from the seeded admin identity; showId from result.showId.
    expect(logAdminOutcome).toHaveBeenCalledTimes(1);
    expect(logAdminOutcome).toHaveBeenCalledWith({
      code: "SHOW_UNPUBLISHED_BY_ADMIN",
      source: "admin.show.undoAutoPublish",
      actorEmail: SEEDED_ADMIN,
      showId: "s1",
    });
  });

  it.each([
    ["expired", { outcome: "expired", status: 400, code: "UNPUBLISH_TOKEN_EXPIRED", showId: "s1" }],
    [
      "consumed",
      { outcome: "consumed", status: 400, code: "UNPUBLISH_TOKEN_CONSUMED", showId: "s1" },
    ],
    ["not_found", { outcome: "not_found", status: 404 }],
  ] as const)("Task 10: %s outcome does NOT emit admin-outcome telemetry", async (_label, r) => {
    unpublishShow.mockResolvedValue(r as UnpublishResult);
    await undoAutoPublishAction("rpas");
    expect(logAdminOutcome).not.toHaveBeenCalled();
  });

  it("Task 10: token-vanished (read → null) does NOT emit admin-outcome telemetry", async () => {
    readUnpublishTokenForSlug.mockResolvedValue(null);
    await undoAutoPublishAction("rpas");
    expect(logAdminOutcome).not.toHaveBeenCalled();
  });

  it("Task 10: infra faults (token read / unpublishShow throw) do NOT emit admin-outcome telemetry", async () => {
    readUnpublishTokenForSlug.mockRejectedValue(new Error("db reset"));
    await undoAutoPublishAction("rpas");
    unpublishShow.mockRejectedValue(new Error("tx failed"));
    await undoAutoPublishAction("rpas");
    expect(logAdminOutcome).not.toHaveBeenCalled();
  });
});
