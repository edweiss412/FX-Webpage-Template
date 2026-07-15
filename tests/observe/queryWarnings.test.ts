import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  calls: [] as Array<{ method: string; args: unknown[] }>,
  selectArg: "",
  throwOnFrom: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (state.throwOnFrom) {
      return {
        from() {
          throw new Error("boom");
        },
      };
    }
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        state.calls.push({ method, args });
        if (method === "select") state.selectArg = args[0] as string;
        return builder;
      };
    for (const m of ["select", "eq", "not", "order"]) builder[m] = chain(m);
    builder.limit = (...args: unknown[]) => {
      state.calls.push({ method: "limit", args });
      return Promise.resolve({ data: state.rows, error: state.error });
    };
    return { from: chain("from") };
  },
}));

import { queryPublishedWarnings } from "@/lib/observe/query/warnings";

const baseRow = {
  show_id: "22222222-2222-4222-8222-222222222222",
  parse_warnings: [{ severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m" }],
  shows: { title: "East Coast", slug: "east-coast" },
};

beforeEach(() => {
  state.rows = [baseRow];
  state.error = null;
  state.calls = [];
  state.selectArg = "";
  state.throwOnFrom = false;
});

describe("queryPublishedWarnings", () => {
  it("SELECT: embed via FK, never financials/raw_unrecognized", async () => {
    await queryPublishedWarnings({});
    expect(state.selectArg).toBe("show_id, parse_warnings, shows(title, slug)");
  });
  it("non-empty filter is DB-side first-element predicate, pre-cap; ordered by show_id", async () => {
    await queryPublishedWarnings({});
    expect(state.calls.find((c) => c.method === "not")!.args).toEqual([
      "parse_warnings->0",
      "is",
      null,
    ]);
    expect(state.calls.find((c) => c.method === "order")!.args[0]).toBe("show_id");
  });
  it("--show filter eq; warnings serialized; embed array/object both map", async () => {
    state.rows = [
      {
        show_id: "22222222-2222-4222-8222-222222222222",
        parse_warnings: [{ severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m" }],
        shows: [{ title: "East Coast", slug: "east-coast" }],
      },
    ];
    const r = await queryPublishedWarnings({ showId: "22222222-2222-4222-8222-222222222222" });
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.showTitle).toBe("East Coast");
    expect(r.rows[0]!.warnings).toHaveLength(1);
  });
  it("returned error → infra_error; throw → infra_error", async () => {
    state.error = { message: "boom" };
    const r = await queryPublishedWarnings({});
    expect(r.kind).toBe("infra_error");
    expect(r.kind === "infra_error" ? r.message : "").toBe("shows_internal read failed");

    state.error = null;
    state.throwOnFrom = true;
    const thrown = await queryPublishedWarnings({});
    expect(thrown.kind).toBe("infra_error");
    expect(thrown.kind === "infra_error" ? thrown.message : "").toBe("shows_internal read threw");
  });
  it("default limit 100; count:exact", async () => {
    await queryPublishedWarnings({});
    const selectCall = state.calls.find((c) => c.method === "select")!;
    expect(selectCall.args[1]).toEqual({ count: "exact" });
    const limitCall = state.calls.find((c) => c.method === "limit")!;
    expect(limitCall.args).toEqual([100]);
  });
  it("non-array shows jsonb → null title/slug", async () => {
    state.rows = [{ ...baseRow, shows: "scalar" }];
    const r = await queryPublishedWarnings({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.showTitle).toBe(null);
    expect(r.rows[0]!.showSlug).toBe(null);
  });
  it("NULL shows → null title/slug", async () => {
    state.rows = [{ ...baseRow, shows: null }];
    const r = await queryPublishedWarnings({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.showTitle).toBe(null);
    expect(r.rows[0]!.showSlug).toBe(null);
  });
});
