// tests/admin/resolveAutoCodeGuard.test.ts (alert-resolve-truthing Task 6, spec §4.3)
//
// The four USER-FACING manual-resolve doors reject an auto-resolving code — a manual
// "resolve" of a self-clearing alert is a misleading no-op, so the doors fail CLOSED:
//   - resolveAdminAlertFormAction (global Server Action)  → void early-return, NO update
//   - resolveHealthAlertFormAction (dev-gated Server Action) → void early-return, NO update
//   - global JSON route      → HTTP 409 { code: "ALERT_AUTO_RESOLVE_ONLY" }, NO update
//   - per-show JSON route     → HTTP 409 { code: "ALERT_AUTO_RESOLVE_ONLY" }, NO update
// The INTERNAL resolveAdminAlert() helper stays PERMISSIVE (the email/watch detectors
// call it to auto-resolve EMAIL_NOT_CONFIGURED / WATCH_CHANNEL_ORPHANED) — the guard is
// at the UI door only. Each door pins the EXACT contract (R5 M2): a vague "no write" is
// not enough; an impl could skip the write yet change HTTP/action semantics.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminAlertCode } from "@/lib/adminAlerts/upsertAdminAlert";

const ID = "00000000-0000-0000-0000-000000000001";

// Fixture codes (resolution class verified against MESSAGE_CATALOG):
const AUTO_DOUG = "SYNC_STALLED"; // auto · doug   → reaches the doug-door auto guard
const MANUAL_DOUG = "SHOW_FIRST_PUBLISHED"; // manual · doug → still resolves at the doug doors
const AUTO_HEALTH = "WEBHOOK_TOKEN_INVALID"; // auto · health → reaches the health-door auto guard
const MANUAL_HEALTH = "TILE_SERVER_RENDER_FAILED"; // manual · health → still resolves at the health door
const INBOX_AUTO = "SHEET_UNAVAILABLE"; // auto · doug · inbox-routed (⊂ auto) → per-show 409 (no regression)

// ---- Server-Action fixtures (shared unified builder serves BOTH actions) ----
const state = {
  row: null as { code: string; show_id?: string | null } | null,
  fetchError: null as { message: string } | null,
  updateData: null as Array<{ id: string }> | null,
  updateError: null as { message: string } | null,
  updateCalled: false,
};

function makeBuilder() {
  const b: Record<string, unknown> = {};
  const pass = () => b;
  b.select = pass;
  b.eq = pass;
  b.is = pass;
  b.update = () => {
    state.updateCalled = true;
    return b;
  };
  b.maybeSingle = async () => ({ data: state.row, error: state.fetchError });
  // Thenable so resolveAdminAlertFormAction's `await …update().is().is()` AND
  // resolveHealthAlertFormAction's `await …update().select("id")` both resolve.
  (b as { then: unknown }).then = (
    f: (r: { data: Array<{ id: string }> | null; error: { message: string } | null }) => unknown,
  ) => f({ data: state.updateData, error: state.updateError });
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { email: "admin@example.com" } }, error: null }),
    },
    from: () => makeBuilder(),
  }),
}));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {},
  requireAdminIdentity: async () => ({ email: "admin@example.com" }),
}));
const requireDeveloperIdentity = vi.fn(async () => ({ email: "dev@example.com" }));
vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloperIdentity: () => requireDeveloperIdentity(),
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: async () => {} }));

import { resolveAdminAlertFormAction, resolveHealthAlertFormAction } from "@/app/admin/actions";
import { resolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";
import { handleAdminAlertGlobalResolve } from "@/app/api/admin/admin-alerts/[id]/resolve/route";
import { handleAdminAlertShowResolve } from "@/app/api/admin/show/[slug]/alerts/[id]/resolve/route";

function fd(id: string = ID): FormData {
  const f = new FormData();
  f.set("id", id);
  return f;
}

// ---- Route fixtures (dep-injected tx; no real postgres) ---------------------
type AlertRow = {
  id: string;
  show_id: string | null;
  slug: string | null;
  resolved_at: string | null;
  code: string;
};
function makeWithTx(alertRow: AlertRow, track: { update: boolean }) {
  return async <R>(
    fn: (tx: { queryOne<T>(sql: string, params: unknown[]): Promise<T | null> }) => Promise<R>,
  ) =>
    fn({
      async queryOne<T>(sql: string): Promise<T | null> {
        if (/update\s+public\.admin_alerts/i.test(sql)) {
          track.update = true;
          return { id: ID, show_id: alertRow.show_id, resolved_at: "2026-01-01T00:00:00Z" } as T;
        }
        if (/from\s+public\.shows\b/i.test(sql) && !/admin_alerts/i.test(sql)) {
          return { id: "show-1", slug: "rpas" } as T;
        }
        return alertRow as T;
      },
    });
}
const requireAdminIdentity = async () => ({ email: "admin@example.com" });

beforeEach(() => {
  state.row = null;
  state.fetchError = null;
  state.updateData = null;
  state.updateError = null;
  state.updateCalled = false;
  requireDeveloperIdentity.mockReset();
  requireDeveloperIdentity.mockResolvedValue({ email: "dev@example.com" });
  revalidatePath.mockClear();
});

describe("resolveAutoCodeGuard — auto codes fail CLOSED at the four manual-resolve doors", () => {
  // --- Door 1: resolveAdminAlertFormAction (global Server Action) -----------
  it("resolveAdminAlertFormAction: auto code → void return, NO update, NO revalidate", async () => {
    state.row = { code: AUTO_DOUG };
    await resolveAdminAlertFormAction(fd());
    expect(state.updateCalled).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("resolveAdminAlertFormAction: manual code → still resolves (update + revalidate)", async () => {
    state.row = { code: MANUAL_DOUG };
    await resolveAdminAlertFormAction(fd());
    expect(state.updateCalled).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  // --- Door 2: resolveHealthAlertFormAction (dev-gated Server Action) --------
  it("resolveHealthAlertFormAction: auto health code → void return, NO update", async () => {
    state.row = { code: AUTO_HEALTH, show_id: null };
    await resolveHealthAlertFormAction(fd());
    expect(state.updateCalled).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("resolveHealthAlertFormAction: manual health code → still resolves (update)", async () => {
    state.row = { code: MANUAL_HEALTH, show_id: null };
    state.updateData = [{ id: ID }];
    await resolveHealthAlertFormAction(fd());
    expect(state.updateCalled).toBe(true);
  });

  // --- Door 3: global JSON route -------------------------------------------
  it("global route: auto code → 409 ALERT_AUTO_RESOLVE_ONLY, NO update", async () => {
    const track = { update: false };
    const res = await handleAdminAlertGlobalResolve(
      new Request("http://x"),
      { params: Promise.resolve({ id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          { id: ID, show_id: null, slug: null, resolved_at: null, code: AUTO_DOUG },
          track,
        ),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, code: "ALERT_AUTO_RESOLVE_ONLY" });
    expect(track.update).toBe(false);
  });
  it("global route: manual code → 200, resolves", async () => {
    const track = { update: false };
    const res = await handleAdminAlertGlobalResolve(
      new Request("http://x"),
      { params: Promise.resolve({ id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          { id: ID, show_id: null, slug: null, resolved_at: null, code: MANUAL_DOUG },
          track,
        ),
      },
    );
    expect(res.status).toBe(200);
    expect(track.update).toBe(true);
  });

  // --- Door 4: per-show JSON route -----------------------------------------
  it("per-show route: auto code → 409 ALERT_AUTO_RESOLVE_ONLY, NO update", async () => {
    const track = { update: false };
    const res = await handleAdminAlertShowResolve(
      new Request("http://x"),
      { params: Promise.resolve({ slug: "rpas", id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          { id: ID, show_id: "show-1", slug: "rpas", resolved_at: null, code: AUTO_DOUG },
          track,
        ),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, code: "ALERT_AUTO_RESOLVE_ONLY" });
    expect(track.update).toBe(false);
  });
  it("per-show route: inbox-routed code (⊂ auto) still 409 — no behavior regression", async () => {
    const track = { update: false };
    const res = await handleAdminAlertShowResolve(
      new Request("http://x"),
      { params: Promise.resolve({ slug: "rpas", id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          { id: ID, show_id: "show-1", slug: "rpas", resolved_at: null, code: INBOX_AUTO },
          track,
        ),
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, code: "ALERT_AUTO_RESOLVE_ONLY" });
    expect(track.update).toBe(false);
  });
  it("per-show route: manual code → 200, resolves", async () => {
    const track = { update: false };
    const res = await handleAdminAlertShowResolve(
      new Request("http://x"),
      { params: Promise.resolve({ slug: "rpas", id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          { id: ID, show_id: "show-1", slug: "rpas", resolved_at: null, code: MANUAL_DOUG },
          track,
        ),
      },
    );
    expect(res.status).toBe(200);
    expect(track.update).toBe(true);
  });

  // --- Regression: the INTERNAL auto-resolver stays permissive --------------
  it("resolveAdminAlert() STILL resolves an auto code programmatically (auto-resolution intact)", async () => {
    const calls = { update: false };
    const cb: Record<string, unknown> = {};
    const pass = () => cb;
    cb.update = () => {
      calls.update = true;
      return cb;
    };
    cb.eq = pass;
    cb.is = pass;
    cb.select = async () => ({ data: [{ id: "1" }], error: null });
    const fakeClient = { from: () => cb } as unknown as Parameters<typeof resolveAdminAlert>[1];
    await expect(
      resolveAdminAlert(
        { showId: null, code: "EMAIL_NOT_CONFIGURED" as AdminAlertCode },
        fakeClient,
      ),
    ).resolves.toBeUndefined();
    expect(calls.update).toBe(true);
  });
});
