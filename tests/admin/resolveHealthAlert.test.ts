// tests/admin/resolveHealthAlert.test.ts (alert-audience-split Task 9, spec §6.6)
//
// The dev-gated, attributable, zero-row-safe health-alert resolve Server Action.
import { describe, it, expect, vi, beforeEach } from "vitest";

const ID = "00000000-0000-0000-0000-000000000001";
const DEV_EMAIL = "eric@example.com";

const state = {
  throwOnConstruct: false,
  row: null as { code: string; show_id: string | null } | null,
  fetchError: null as { message: string } | null,
  updateData: null as Array<{ id: string }> | null,
  updateError: null as { message: string } | null,
  updateCalled: false,
  updatePayload: null as Record<string, unknown> | null,
};

function makeBuilder() {
  const b: Record<string, unknown> = {};
  const pass = () => b;
  b.select = pass;
  b.eq = pass;
  b.is = pass;
  b.update = (p: Record<string, unknown>) => {
    state.updateCalled = true;
    state.updatePayload = p;
    return b;
  };
  b.maybeSingle = async () => ({ data: state.row, error: state.fetchError });
  // Only the per-from() builder is thenable (for the .select("id") update
  // terminal) — the CLIENT must NOT be, or the async client factory would await
  // it and hand back the resolved value instead of the client.
  (b as { then: unknown }).then = (
    f: (r: { data: Array<{ id: string }> | null; error: { message: string } | null }) => unknown,
  ) => f({ data: state.updateData, error: state.updateError });
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("construct boom");
    return { from: () => makeBuilder() };
  },
}));

const requireDeveloperIdentity = vi.fn(async () => ({ email: DEV_EMAIL }));
vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloperIdentity: () => requireDeveloperIdentity(),
}));

const logAdminOutcome = vi.fn(async (_o: unknown) => {});
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: (o: unknown) => logAdminOutcome(o),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { resolveHealthAlertFormAction } from "@/app/admin/actions";

function fd(id: string = ID): FormData {
  const f = new FormData();
  f.set("id", id);
  return f;
}

beforeEach(() => {
  state.throwOnConstruct = false;
  state.row = null;
  state.fetchError = null;
  state.updateData = null;
  state.updateError = null;
  state.updateCalled = false;
  state.updatePayload = null;
  requireDeveloperIdentity.mockReset();
  requireDeveloperIdentity.mockResolvedValue({ email: DEV_EMAIL });
  logAdminOutcome.mockClear();
  revalidatePath.mockClear();
});

describe("resolveHealthAlertFormAction", () => {
  it("non-developer → denied before any read/write; no update, no log, no revalidate", async () => {
    const forbidden = Object.assign(new Error("forbidden"), { code: "FORBIDDEN" });
    requireDeveloperIdentity.mockRejectedValue(forbidden);
    state.row = { code: "WEBHOOK_TOKEN_INVALID", show_id: null };
    await expect(resolveHealthAlertFormAction(fd())).rejects.toThrow();
    expect(state.updateCalled).toBe(false);
    expect(logAdminOutcome).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("developer + health row → resolves, sets resolved_by, awaits ONE ADMIN_ALERT_RESOLVED with actor, revalidates BOTH", async () => {
    state.row = { code: "WEBHOOK_TOKEN_INVALID", show_id: null };
    state.updateData = [{ id: ID }];
    await resolveHealthAlertFormAction(fd());
    expect(state.updateCalled).toBe(true);
    expect(state.updatePayload?.resolved_by).toBe(DEV_EMAIL);
    expect(typeof state.updatePayload?.resolved_at).toBe("string");
    expect(logAdminOutcome).toHaveBeenCalledTimes(1);
    expect(logAdminOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ADMIN_ALERT_RESOLVED",
        source: "app.admin.actions.resolveHealthAlert",
        actorEmail: DEV_EMAIL,
        extra: { alertId: ID },
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/dev/telemetry");
  });

  it("AC11/AC12 show-scoped health row → outcome carries showId; BOTH revalidate paths", async () => {
    state.row = { code: "TILE_PROJECTION_FETCH_FAILED", show_id: "show-1" };
    state.updateData = [{ id: ID }];
    await resolveHealthAlertFormAction(fd());
    expect(logAdminOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ADMIN_ALERT_RESOLVED", showId: "show-1" }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/dev/telemetry");
  });

  it("code ∉ HEALTH_CODES → rejected, no write, no log, no revalidate", async () => {
    state.row = { code: "SHEET_UNAVAILABLE", show_id: null }; // doug audience
    await resolveHealthAlertFormAction(fd());
    expect(state.updateCalled).toBe(false);
    expect(logAdminOutcome).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("zero-row UPDATE (already resolved / concurrent) → no log, no revalidate (idempotent no-op)", async () => {
    state.row = { code: "WEBHOOK_TOKEN_INVALID", show_id: null };
    state.updateData = []; // affected zero rows
    await resolveHealthAlertFormAction(fd());
    expect(state.updateCalled).toBe(true);
    expect(logAdminOutcome).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("UPDATE returned-error → throws, no log, no revalidate", async () => {
    state.row = { code: "WEBHOOK_TOKEN_INVALID", show_id: null };
    state.updateError = { message: "rls denied" };
    await expect(resolveHealthAlertFormAction(fd())).rejects.toThrow(/UPDATE failed/);
    expect(logAdminOutcome).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("code-lookup returned-error → throws, no write, no revalidate", async () => {
    state.fetchError = { message: "boom" };
    await expect(resolveHealthAlertFormAction(fd())).rejects.toThrow(/code lookup failed/);
    expect(state.updateCalled).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("missing / malformed id → silent no-op (no read, no log)", async () => {
    await resolveHealthAlertFormAction(fd("not-a-uuid"));
    expect(state.updateCalled).toBe(false);
    expect(logAdminOutcome).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
