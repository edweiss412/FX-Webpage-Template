/**
 * tests/admin/notify-toggle-actions.test.ts (M12.2 Phase B3 Task 6.1 — spec §7.1, AC-B3.10)
 *
 * The two notification-toggle setter actions mirror setAutoPublish: requireAdmin()
 * FIRST, then a session-client UPDATE of the app_settings singleton with
 * `.select("id")` so a zero-row (RLS-denied) result is detectable. Invariant 9:
 *   - a returned `error` → { ok: false } (never a silent false "saved").
 *   - a ZERO-ROW result (RLS denied / row missing) → { ok: false }.
 *   - success → revalidatePath("/admin/settings") + { ok: true }.
 *   - requireAdmin() throwing propagates (not swallowed into a benign result).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted so these are initialized BEFORE the hoisted vi.mock factories run.
const { requireAdmin, revalidatePath, select, eq, update, from, createSupabaseServerClient } =
  vi.hoisted(() => {
    const select = vi.fn();
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    return {
      requireAdmin: vi.fn(async () => undefined),
      revalidatePath: vi.fn(),
      select,
      eq,
      update,
      from,
      createSupabaseServerClient: vi.fn(async () => ({ from })),
    };
  });

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { setAlertOnSyncProblems } from "@/app/admin/settings/_actions/setAlertOnSyncProblems";
import { setDailyReviewDigest } from "@/app/admin/settings/_actions/setDailyReviewDigest";
import { setAlertOnAutoPublish } from "@/app/admin/settings/_actions/setAlertOnAutoPublish";

const CASES = [
  { name: "setAlertOnSyncProblems", action: setAlertOnSyncProblems, column: "alert_on_sync_problems" },
  { name: "setDailyReviewDigest", action: setDailyReviewDigest, column: "daily_review_digest" },
  { name: "setAlertOnAutoPublish", action: setAlertOnAutoPublish, column: "alert_on_auto_publish" },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe.each(CASES)("$name (invariant-9 setter)", ({ action, column }) => {
  it("requires admin FIRST, updates the singleton column, revalidates, returns ok on a one-row result", async () => {
    select.mockResolvedValue({ data: [{ id: "default" }], error: null });
    const result = await action(true);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("app_settings");
    expect(update).toHaveBeenCalledWith({ [column]: true });
    expect(eq).toHaveBeenCalledWith("id", "default");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: false } on a returned DB error (never a silent false save)", async () => {
    select.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await action(false)).toEqual({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns { ok: false } on a zero-row (RLS-denied) result", async () => {
    select.mockResolvedValue({ data: [], error: null });
    expect(await action(true)).toEqual({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("propagates a requireAdmin throw (infra fault not swallowed)", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("AdminInfraError"));
    await expect(action(true)).rejects.toThrow(/AdminInfraError/);
    expect(from).not.toHaveBeenCalled();
  });
});
