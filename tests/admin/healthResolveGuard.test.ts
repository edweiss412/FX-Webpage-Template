// tests/admin/healthResolveGuard.test.ts (alert-audience-split Task 10, spec §6.7)
//
// The product offers NO non-developer a way to resolve a health alert: the three
// pre-existing user-facing resolve surfaces categorically REJECT rows whose
// `code ∈ HEALTH_CODES` (health rows resolve ONLY through
// resolveHealthAlertFormAction). This is app-surface defense-in-depth, NOT a DB
// boundary (accepted escape hatch tracked by BL-HEALTH-RESOLVE-DB-LOCKDOWN).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminAlertCode } from "@/lib/adminAlerts/upsertAdminAlert";

const ID = "00000000-0000-0000-0000-000000000001";
const HEALTH_CODE = "WEBHOOK_TOKEN_INVALID"; // audience:health, degraded

// ---- Server Action (resolveAdminAlertFormAction) fixtures -----------------
const saState = {
  guardRow: null as { code: string } | null,
  updateCalled: false,
  updateError: null as { message: string } | null,
};

function makeBuilder() {
  const b: Record<string, unknown> = {};
  const pass = () => b;
  b.select = pass;
  b.eq = pass;
  b.is = pass;
  b.update = () => {
    saState.updateCalled = true;
    return b;
  };
  b.maybeSingle = async () => ({ data: saState.guardRow, error: null });
  // Invariant #10 (Codex whole-diff R1 HIGH): resolveAdminAlertFormAction now
  // `.select("id")`s the UPDATE and requires exactly one returned row to emit +
  // revalidate. A successful resolve returns one row; an error returns none.
  (b as { then: unknown }).then = (
    f: (r: { data: { id: string }[] | null; error: { message: string } | null }) => unknown,
  ) => f({ data: saState.updateError ? null : [{ id: "row-1" }], error: saState.updateError });
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
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: async () => {} }));

import { resolveAdminAlertFormAction } from "@/app/admin/actions";
import { resolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";
import { handleAdminAlertGlobalResolve } from "@/app/api/admin/admin-alerts/[id]/resolve/route";
import { handleAdminAlertShowResolve } from "@/app/api/admin/show/[slug]/alerts/[id]/resolve/route";

function fd(id: string = ID): FormData {
  const f = new FormData();
  f.set("id", id);
  return f;
}

// ---- Route fixtures (dep-injected tx; no real postgres) -------------------
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
  saState.guardRow = null;
  saState.updateCalled = false;
  saState.updateError = null;
  revalidatePath.mockClear();
});

describe("healthResolveGuard — three legacy surfaces reject HEALTH_CODES", () => {
  // --- Surface 1: resolveAdminAlertFormAction (global Server Action) --------
  it("resolveAdminAlertFormAction rejects a health-code row (no update, no revalidate)", async () => {
    saState.guardRow = { code: HEALTH_CODE };
    await resolveAdminAlertFormAction(fd());
    expect(saState.updateCalled).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("resolveAdminAlertFormAction still resolves a doug-code row (update + revalidate)", async () => {
    saState.guardRow = { code: "SHOW_FIRST_PUBLISHED" }; // doug audience, manual (resolvable)
    await resolveAdminAlertFormAction(fd());
    expect(saState.updateCalled).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  // --- Surface 2: global unified route -------------------------------------
  it("global route 403s a health-code row; resolved_at unchanged (no update)", async () => {
    const track = { update: false };
    const res = await handleAdminAlertGlobalResolve(
      new Request("http://x"),
      { params: Promise.resolve({ id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          { id: ID, show_id: null, slug: null, resolved_at: null, code: HEALTH_CODE },
          track,
        ),
      },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, code: "ALERT_HEALTH_RESOLVE_FORBIDDEN" });
    expect(track.update).toBe(false);
  });
  it("global route still resolves a doug-code global row", async () => {
    const track = { update: false };
    const res = await handleAdminAlertGlobalResolve(
      new Request("http://x"),
      { params: Promise.resolve({ id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          { id: ID, show_id: null, slug: null, resolved_at: null, code: "SHOW_FIRST_PUBLISHED" },
          track,
        ),
      },
    );
    expect(res.status).toBe(200);
    expect(track.update).toBe(true);
  });

  // --- Surface 3: show-scoped route ----------------------------------------
  it("show route 403s a health-code row; resolved_at unchanged (no update)", async () => {
    const track = { update: false };
    const res = await handleAdminAlertShowResolve(
      new Request("http://x"),
      { params: Promise.resolve({ slug: "rpas", id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          { id: ID, show_id: "show-1", slug: "rpas", resolved_at: null, code: HEALTH_CODE },
          track,
        ),
      },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, code: "ALERT_HEALTH_RESOLVE_FORBIDDEN" });
    expect(track.update).toBe(false);
  });
  it("show route still resolves a doug-code show row", async () => {
    const track = { update: false };
    const res = await handleAdminAlertShowResolve(
      new Request("http://x"),
      { params: Promise.resolve({ slug: "rpas", id: ID }) },
      {
        requireAdminIdentity,
        withTx: makeWithTx(
          {
            id: ID,
            show_id: "show-1",
            slug: "rpas",
            resolved_at: null,
            code: "SHOW_FIRST_PUBLISHED",
          },
          track,
        ),
      },
    );
    expect(res.status).toBe(200);
    expect(track.update).toBe(true);
  });

  // --- AC11b: the internal auto-resolver is NOT guarded --------------------
  it("resolveAdminAlert() STILL resolves a health-code row programmatically (auto-resolution intact)", async () => {
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
      resolveAdminAlert({ showId: null, code: HEALTH_CODE as AdminAlertCode }, fakeClient),
    ).resolves.toBeUndefined();
    expect(calls.update).toBe(true);
  });

  // --- Structural: each guarded surface references HEALTH_CODES in its reject path
  it("each of the 3 legacy surfaces references HEALTH_CODES; the auto-resolver does NOT", () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
    for (const f of [
      "app/admin/actions.ts",
      "app/api/admin/admin-alerts/[id]/resolve/route.ts",
      "app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts",
    ]) {
      expect(read(f), `${f} must reference HEALTH_CODES in its reject path`).toContain(
        "HEALTH_CODES",
      );
    }
    // The internal auto-resolver must NOT carry the guard (health codes legitimately
    // auto-resolve — over-broadening the guard here would break PR #283).
    expect(read("lib/adminAlerts/resolveAdminAlert.ts")).not.toContain("HEALTH_CODES");
  });

  // --- Documentation: the DB escape hatch is accepted + tracked ------------
  it("documents the accepted direct-PostgREST escape hatch via BL-HEALTH-RESOLVE-DB-LOCKDOWN", () => {
    // Health resolve is developer-gated at the PRODUCT surfaces only; a raw
    // admin_alerts UPDATE via PostgREST is NOT blocked at the DB (no migration /
    // RLS change). That trusted-operator escape hatch is deliberately accepted and
    // tracked in BACKLOG for a future full DML lockdown.
    const backlog = readFileSync(join(process.cwd(), "BACKLOG.md"), "utf8");
    expect(backlog).toContain("BL-HEALTH-RESOLVE-DB-LOCKDOWN");
  });
});
