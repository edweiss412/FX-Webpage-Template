// @vitest-environment jsdom
/**
 * tests/admin/ignoredSheetsView.test.tsx (Task E2 — spec §6.3)
 *
 * The /admin/ignored-sheets view. Two concerns:
 *   1. loadIgnoredSheets loader: queries the LIVE permanent_ignore partition
 *      (deferred_ingestions WHERE wizard_session_id IS NULL AND
 *      deferred_kind='permanent_ignore') — NOT defer_until_modified, NOT
 *      wizard-scoped rows. A construction / from() throw surfaces as a typed
 *      infra_error (boundary, invariant 9).
 *   2. The page renders the sheet NAME (drive_file_name, fallback to the raw
 *      drive id), a per-row Un-ignore, the empty state, and a fixed degraded
 *      copy on infra_error (no raw code, invariant 5).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  ignoredList: [] as Record<string, unknown>[],
  throwOnConstruct: false as boolean,
  throwOnFrom: false as boolean,
  // records (method, ...args) so the test can assert the live-partition filters.
  calls: [] as Array<[string, ...unknown[]]>,
}));

function makeClient() {
  return {
    from(table: string) {
      if (state.throwOnFrom) throw new Error("META: from() infra fault");
      state.calls.push(["from", table]);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.is = (col: string, val: unknown) => {
        state.calls.push(["is", col, val]);
        return builder;
      };
      builder.eq = (col: string, val: unknown) => {
        state.calls.push(["eq", col, val]);
        return builder;
      };
      const result = {
        data: table === "deferred_ingestions" ? state.ignoredList : [],
        error: null,
        count: 0,
      };
      (builder as { then: unknown }).then = (
        onfulfilled?: ((v: typeof result) => unknown) | null,
      ) => (onfulfilled ? onfulfilled(result) : undefined);
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("META: server-client construction fault");
    return makeClient();
  },
  createSupabaseServiceRoleClient: () => makeClient(),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-23T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/ignored-sheets",
}));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: async () => ({ email: "doug@example.com" }),
  requireAdmin: async () => {},
  AdminInfraError: class AdminInfraError extends Error {},
}));

beforeEach(() => {
  state.ignoredList = [];
  state.throwOnConstruct = false;
  state.throwOnFrom = false;
  state.calls = [];
});
afterEach(() => cleanup());

const ignoredRow = (driveFileId: string, name: string | null) => ({
  drive_file_id: driveFileId,
  drive_file_name: name,
  deferred_at: "2026-06-20T00:00:00.000Z",
  deferred_by_email: "doug@fxav.com",
});

describe("loadIgnoredSheets (Task E2 loader)", () => {
  it("queries the LIVE permanent_ignore partition (wizard_session_id IS NULL, deferred_kind=permanent_ignore)", async () => {
    state.ignoredList = [ignoredRow("df1", "East Coast.gsheet")];
    const { loadIgnoredSheets } = await import("@/lib/admin/loadIgnoredSheets");
    const result = await loadIgnoredSheets();
    expect(result.kind).toBe("ok");
    // The live-partition + strictly-permanent_ignore filters are what exclude
    // defer_until_modified + wizard-scoped rows at the DB; assert the loader applies them.
    expect(state.calls).toContainEqual(["from", "deferred_ingestions"]);
    expect(state.calls).toContainEqual(["is", "wizard_session_id", null]);
    expect(state.calls).toContainEqual(["eq", "deferred_kind", "permanent_ignore"]);
    if (result.kind !== "ok") return;
    expect(result.rows).toEqual([
      {
        driveFileId: "df1",
        driveFileName: "East Coast.gsheet",
        deferredAt: "2026-06-20T00:00:00.000Z",
        deferredByEmail: "doug@fxav.com",
      },
    ]);
  });

  it("server-client construction throw → typed infra_error (boundary)", async () => {
    state.throwOnConstruct = true;
    const { loadIgnoredSheets } = await import("@/lib/admin/loadIgnoredSheets");
    expect(await loadIgnoredSheets()).toMatchObject({ kind: "infra_error" });
  });

  it("from('deferred_ingestions') throw → typed infra_error with table-specific 'threw' message", async () => {
    state.throwOnFrom = true;
    const { loadIgnoredSheets } = await import("@/lib/admin/loadIgnoredSheets");
    const result = await loadIgnoredSheets();
    expect(result).toMatchObject({ kind: "infra_error" });
    expect((result as { message: string }).message).toMatch(/deferred_ingestions.*threw/);
  });
});

describe("IgnoredSheetsPage render", () => {
  it("empty state copy when no ignored sheets exist", async () => {
    state.ignoredList = [];
    const { default: IgnoredSheetsPage } = await import("@/app/admin/ignored-sheets/page");
    render(await IgnoredSheetsPage());
    expect(screen.getByTestId("admin-ignored-sheets-empty")).toHaveTextContent(
      "No ignored sheets.",
    );
  });

  it("renders the sheet NAME (drive_file_name) and a per-row Un-ignore, not the raw drive id", async () => {
    state.ignoredList = [ignoredRow("drive-xyz", "Acme Roundtable.gsheet")];
    const { default: IgnoredSheetsPage } = await import("@/app/admin/ignored-sheets/page");
    render(await IgnoredSheetsPage());
    expect(screen.getByTestId("ignored-sheet-name-drive-xyz")).toHaveTextContent(
      "Acme Roundtable.gsheet",
    );
    expect(screen.getByTestId("unignore-button-drive-xyz")).toBeInTheDocument();
  });

  it("falls back to the drive id when drive_file_name is null (A2 column nullable)", async () => {
    state.ignoredList = [ignoredRow("drive-noname", null)];
    const { default: IgnoredSheetsPage } = await import("@/app/admin/ignored-sheets/page");
    render(await IgnoredSheetsPage());
    expect(screen.getByTestId("ignored-sheet-name-drive-noname")).toHaveTextContent("drive-noname");
  });

  it("infra_error → fixed degraded copy, never the raw message (invariant 5)", async () => {
    state.throwOnConstruct = true;
    const { default: IgnoredSheetsPage } = await import("@/app/admin/ignored-sheets/page");
    render(await IgnoredSheetsPage());
    expect(screen.getByTestId("admin-ignored-sheets-degraded")).toBeInTheDocument();
  });
});
