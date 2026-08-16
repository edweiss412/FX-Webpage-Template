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
const {
  requireAdmin,
  requireAdminIdentity,
  revalidatePath,
  select,
  eq,
  update,
  from,
  createSupabaseServerClient,
} = vi.hoisted(() => {
  const select = vi.fn();
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return {
    requireAdmin: vi.fn(async () => undefined),
    // invariant #10: the toggles now resolve actor identity before the mutation.
    requireAdminIdentity: vi.fn(async () => ({ email: "admin@example.com" })),
    revalidatePath: vi.fn(),
    select,
    eq,
    update,
    from,
    createSupabaseServerClient: vi.fn(async () => ({ from })),
  };
});

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin, requireAdminIdentity }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
  createSupabaseServerClient,
}));
// invariant #10: the toggles emit via logAdminOutcome post-commit; stub it so this
// pre-existing test doesn't drive the real logger (behavioral proof lives in
// tests/log/adminOutcomeBehavior.test.ts).
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: vi.fn(async () => undefined) }));

// ── same-origin gate plumbing (origin-sweep spec §6B, class-A representative) ──
// This suite mocked `next/headers` not at all, which matters more than it looks:
// a missing `headers` export lands the gate in its no-request-scope catch-allow,
// so a "cross-site" case would be ALLOWED rather than refused and would prove
// nothing. The default below is same-origin, so every pre-existing case above
// still passes the gate and keeps exercising the real body.
const originHeaders = vi.hoisted(() => new Map<string, string>([["sec-fetch-site", "same-origin"]]));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => originHeaders.get(k.toLowerCase()) ?? null }),
}));
const forbiddenSpy = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
  }),
);
vi.mock("next/navigation", () => ({ forbidden: forbiddenSpy }));
const logMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));

import { setAlertOnSyncProblems } from "@/app/admin/settings/_actions/setAlertOnSyncProblems";
import { setDailyReviewDigest } from "@/app/admin/settings/_actions/setDailyReviewDigest";
import { setAlertOnAutoPublish } from "@/app/admin/settings/_actions/setAlertOnAutoPublish";

const CASES = [
  {
    name: "setAlertOnSyncProblems",
    action: setAlertOnSyncProblems,
    column: "alert_on_sync_problems",
  },
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

/**
 * The class-A representative behavioral proof (origin-sweep spec §6B.1).
 *
 * A STANDALONE describe, deliberately NOT a row inside `describe.each(CASES)`
 * above: a premise or baseline written inside an `.each` callback is unreachable
 * in exactly the degenerate case it guards against, which the project rule
 * forbids. Both cases below run on the SAME spies, so the baseline is what
 * proves the zero-call assertion means "never reached" rather than "spy never
 * records".
 */
describe("setAlertOnAutoPublish — the same-origin gate (class-A representative)", () => {
  const setOrigin = (value: string): void => {
    originHeaders.clear();
    originHeaders.set("sec-fetch-site", value);
  };

  beforeEach(() => {
    select.mockResolvedValue({ data: [{ id: "default" }], error: null });
  });
  afterEach(() => {
    setOrigin("same-origin");
  });

  it("refuses a cross-site request BEFORE the app_settings UPDATE, and emits", async () => {
    // `cross-site` is the truth table's own reject row, not an ad-hoc header set.
    setOrigin("cross-site");
    await expect(setAlertOnAutoPublish(true)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;403");
    expect(update).toHaveBeenCalledTimes(0);
    expect(requireAdmin).toHaveBeenCalledTimes(0);
    expect(forbiddenSpy).toHaveBeenCalledTimes(1);
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        code: "SERVER_ACTION_ORIGIN_REJECTED",
        action: "setAlertOnAutoPublish",
        source: "admin.settings.alertOnAutoPublish",
      }),
    );
  });

  it("same-origin baseline, same spies: the UPDATE is reached and performed", async () => {
    // Asserts the MUTATION, not merely `{ ok: true }` — a return-value-only
    // baseline is satisfied by an implementation that reached no mutation at
    // all, and would leave the zero-call assertion above unfalsifiable.
    setOrigin("same-origin");
    await expect(setAlertOnAutoPublish(true)).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ alert_on_auto_publish: true });
    expect(logMock.warn).not.toHaveBeenCalled();
    expect(forbiddenSpy).not.toHaveBeenCalled();
  });
});
