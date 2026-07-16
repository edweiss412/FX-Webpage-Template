/**
 * tests/admin/roleTokenMappingsSettingsActions.test.ts
 * Settings-page role-mapping edit/delete actions (spec 2026-07-15 §8.3).
 *
 * Pinned settings-mutation contract:
 *  - token validation is LOOKUP-ONLY (`canonicalRoleToken` + non-empty/≤64) — NO
 *    `isBuiltInRoleToken` (Codex R14 F3): a dormant row whose token later became
 *    built-in stays editable + removable;
 *  - `update` affects an EXISTING row only — absent row → `stale`, NEVER recreates
 *    (settings has no create affordance); sets grants + decided_by + fresh timestamps;
 *  - `delete` on an absent row → idempotent `{ ok: true }`;
 *  - outcomes emitted post-write only on success; `revalidatePath("/admin/settings/roles")`.
 * All deps injected via module mocks (no DB, no lock — the writes are lockless).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const requireAdminMock = vi.fn(async () => undefined);
const requireAdminIdentityMock = vi.fn(async () => ({ email: "admin@example.com" }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdminMock(),
  requireAdminIdentity: () => requireAdminIdentityMock(),
  AdminInfraError: class AdminInfraError extends Error {},
}));

const revalidatePathMock = vi.fn((_p: string) => undefined);
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

const logAdminOutcomeMock = vi.fn(async (_o: unknown) => undefined);
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: (o: unknown) => logAdminOutcomeMock(o),
}));

type Script = {
  updateRows: Array<{ token: string }>;
  updateError?: boolean;
  deleteError?: boolean;
};
let script: Script;
let capturedUpdate: Record<string, unknown> | null;
let deleteCalled: boolean;
let svcThrows: boolean;

function makeSvc() {
  return {
    from(_table: string) {
      const b: Record<string, unknown> = {};
      const self = () => b;
      b.eq = self;
      b.update = (payload: Record<string, unknown>) => {
        capturedUpdate = payload;
        return b;
      };
      b.delete = () => {
        deleteCalled = true;
        return b;
      };
      // `update(...).eq(...).select("token")` terminal.
      b.select = () => ({
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(
            script.updateError
              ? { data: null, error: { message: "update boom" } }
              : { data: script.updateRows, error: null },
          ).then(res, rej),
      });
      // `delete(...).eq(...)` awaited directly (b is thenable).
      b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(
          script.deleteError
            ? { data: null, error: { message: "delete boom" } }
            : { data: null, error: null },
        ).then(res, rej);
      return b;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (svcThrows) throw new Error("svc construction failed");
    return makeSvc();
  },
}));

import {
  updateRoleTokenMapping,
  deleteRoleTokenMapping,
} from "@/app/admin/settings/_actions/roleTokenMappings";

beforeEach(() => {
  script = { updateRows: [{ token: "DRONE OP" }] };
  capturedUpdate = null;
  deleteCalled = false;
  svcThrows = false;
  requireAdminIdentityMock.mockResolvedValue({ email: "admin@example.com" });
});
afterEach(() => vi.clearAllMocks());

describe("updateRoleTokenMapping (spec §8.3)", () => {
  test("existing row updated → ok; sets grants + decided_by(canonical) + fresh timestamps; emit + revalidate", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "  Admin@FX.TEST " });
    const before = Date.now();
    const r = await updateRoleTokenMapping("DRONE OP", ["V1", "A1"]);
    expect(r).toEqual({ ok: true });
    expect(capturedUpdate).toMatchObject({ grants: ["A1", "V1"], decided_by: "admin@fx.test" });
    // fresh server-clock timestamps.
    expect(new Date(capturedUpdate!.decided_at as string).toISOString()).toBe(
      capturedUpdate!.decided_at,
    );
    expect(Date.parse(capturedUpdate!.updated_at as string)).toBeGreaterThanOrEqual(before);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/settings/roles");
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ROLE_TOKEN_MAPPING_SET",
        source: "admin.settings.roleTokenMappings",
        actorEmail: "admin@fx.test",
      }),
    );
  });

  test("absent row → stale, NEVER recreates, no emit", async () => {
    script.updateRows = [];
    const r = await updateRoleTokenMapping("DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "stale" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test("blank / oversized token → validation_error", async () => {
    expect(await updateRoleTokenMapping("   ", ["A1"])).toEqual({
      ok: false,
      code: "validation_error",
    });
    expect(await updateRoleTokenMapping("X".repeat(65), ["A1"])).toEqual({
      ok: false,
      code: "validation_error",
    });
    expect(capturedUpdate).toBeNull();
  });

  test("bad grant → validation_error (fail-closed)", async () => {
    const r = await updateRoleTokenMapping("DRONE OP", ["A1", "NOPE"]);
    expect(r).toEqual({ ok: false, code: "validation_error" });
    expect(capturedUpdate).toBeNull();
  });

  test("grants deduped + stable-ordered before write", async () => {
    await updateRoleTokenMapping("DRONE OP", ["FINANCIALS", "A1", "A1"]);
    expect(capturedUpdate?.grants).toEqual(["A1", "FINANCIALS"]);
  });

  test("LOOKUP-ONLY: a now-built-in token (CAM OP) is still editable (no isBuiltInRoleToken guard)", async () => {
    script.updateRows = [{ token: "CAM OP" }];
    const r = await updateRoleTokenMapping("cam op", ["A1"]); // canonicalizes to CAM OP (built-in)
    expect(r).toEqual({ ok: true });
    expect(capturedUpdate).not.toBeNull();
  });

  test("admin B edit over admin A's row → decided_by = B, fresh timestamps", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "adminB@fx.test" });
    await updateRoleTokenMapping("DRONE OP", ["A1"]);
    expect(capturedUpdate?.decided_by).toBe("adminb@fx.test");
    expect(capturedUpdate?.decided_at).toBeTruthy();
    expect(capturedUpdate?.updated_at).toBeTruthy();
  });

  test("update returns error → infra_error, no emit", async () => {
    script.updateError = true;
    const r = await updateRoleTokenMapping("DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("malformed identity → infra_error, nothing written", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "   " });
    const r = await updateRoleTokenMapping("DRONE OP", ["A1"]);
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(capturedUpdate).toBeNull();
  });

  test("service-role construction throws → infra_error", async () => {
    svcThrows = true;
    expect(await updateRoleTokenMapping("DRONE OP", ["A1"])).toEqual({
      ok: false,
      code: "infra_error",
    });
  });
});

describe("deleteRoleTokenMapping (spec §8.3)", () => {
  test("existing row deleted → ok; emit ROLE_TOKEN_MAPPING_DELETED + revalidate", async () => {
    const r = await deleteRoleTokenMapping("DRONE OP");
    expect(r).toEqual({ ok: true });
    expect(deleteCalled).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/settings/roles");
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ROLE_TOKEN_MAPPING_DELETED",
        source: "admin.settings.roleTokenMappings",
      }),
    );
  });

  test("absent row → idempotent { ok: true }", async () => {
    // A delete that matches no row still resolves without error → the desired end
    // state already holds. No error → idempotent success.
    const r = await deleteRoleTokenMapping("NEVER EXISTED");
    expect(r).toEqual({ ok: true });
  });

  test("LOOKUP-ONLY: a now-built-in token is removable (no isBuiltInRoleToken guard)", async () => {
    const r = await deleteRoleTokenMapping("cam op");
    expect(r).toEqual({ ok: true });
  });

  test("delete returns error → infra_error, no emit", async () => {
    script.deleteError = true;
    const r = await deleteRoleTokenMapping("DRONE OP");
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("malformed identity → infra_error, nothing deleted", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "   " });
    const r = await deleteRoleTokenMapping("DRONE OP");
    expect(r).toEqual({ ok: false, code: "infra_error" });
    expect(deleteCalled).toBe(false);
  });
});
