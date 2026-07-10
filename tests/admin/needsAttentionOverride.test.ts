// spec 2026-07-07 §6 step 2 + step 4 / Task 10 — the 4th needs-attention stream:
// `admin_overrides where not active`. A paused (deactivated) field override is
// the DURABLE inactive-row signal — it must surface as BOTH a needs-attention
// page row AND a nav-badge count increment. The row's copy derives from the
// durable `deactivation_code` column (NOT the best-effort alert), domain-aware.
//
// Anti-tautology: the copy matrix asserts the EXACT string per
// (deactivationCode, domain) — crew name_conflict ≠ hotel name_conflict ≠
// target_missing — so a builder that emits the wrong reason fails.
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import {
  RENDER_CAP,
  buildNeedsAttention,
  resolveOverridePausedCopy,
  type BuildNeedsAttentionInput,
  type NeedsAttentionOverrideInput,
} from "@/lib/admin/needsAttention";

function overrideInput(
  overrideId: string,
  over: Partial<NeedsAttentionOverrideInput> = {},
): NeedsAttentionOverrideInput {
  return {
    overrideId,
    showId: "show-1",
    slug: "east-coast",
    title: "East Coast",
    domain: "crew",
    field: "name",
    matchKey: "Jon Smith",
    deactivationCode: "target_missing",
    ...over,
  };
}

function withOverrides(
  overrides: NeedsAttentionOverrideInput[],
  overrideTotal = overrides.length,
): BuildNeedsAttentionInput {
  return {
    ingestions: [],
    syncs: [],
    existence: {},
    overrides,
    totalCounts: { ingestions: 0, syncs: 0, overrides: overrideTotal },
  };
}

describe("resolveOverridePausedCopy — domain-aware reason from deactivation_code (§6 step 4)", () => {
  it("target_missing → “sheet no longer has «matchKey»” (crew)", () => {
    expect(
      resolveOverridePausedCopy({
        domain: "crew",
        deactivationCode: "target_missing",
        matchKey: "Jon Smith",
      }),
    ).toBe("sheet no longer has «Jon Smith»");
  });

  it("target_missing interpolates the hotel match_key verbatim (hotel)", () => {
    expect(
      resolveOverridePausedCopy({
        domain: "hotel",
        deactivationCode: "target_missing",
        matchKey: "Hilton Downtown",
      }),
    ).toBe("sheet no longer has «Hilton Downtown»");
  });

  it("name_conflict (crew) → “clashes with a real crew member”", () => {
    expect(
      resolveOverridePausedCopy({
        domain: "crew",
        deactivationCode: "name_conflict",
        matchKey: "Jon Smith",
      }),
    ).toBe("clashes with a real crew member");
  });

  it("name_conflict (hotel) → “clashes with another hotel's name” (distinct from crew)", () => {
    const hotel = resolveOverridePausedCopy({
      domain: "hotel",
      deactivationCode: "name_conflict",
      matchKey: "Hilton",
    });
    const crew = resolveOverridePausedCopy({
      domain: "crew",
      deactivationCode: "name_conflict",
      matchKey: "Hilton",
    });
    expect(hotel).toBe("clashes with another hotel's name");
    expect(hotel).not.toBe(crew); // the two name_conflict reasons must not collapse
  });
});

describe("buildNeedsAttention — override_paused variant (§6 step 2)", () => {
  it("maps an inactive override into an override_paused item carrying the durable domain-aware copy", () => {
    const result = buildNeedsAttention(
      withOverrides([
        overrideInput("ov-1", {
          domain: "hotel",
          field: "hotel_name",
          matchKey: "Hilton Downtown",
          deactivationCode: "name_conflict",
          slug: "rpas",
          title: "RPAS",
        }),
      ]),
    );
    const item = result.items.find((i) => i.variant === "override_paused");
    expect(item).toBeDefined();
    if (item?.variant !== "override_paused") throw new Error("unreachable");
    expect(item.overrideId).toBe("ov-1");
    expect(item.slug).toBe("rpas");
    expect(item.title).toBe("RPAS");
    // Copy is computed in the builder from the durable deactivation_code, NOT
    // passed in — a builder that emitted the crew reason for a hotel row fails.
    expect(item.copy).toBe("clashes with another hotel's name");
    // The row has no activity timestamp (durable pause has no event time).
    expect(item.activityAt).toBeNull();
  });

  it("counts the override stream into totalCount (drives the page row + badge total)", () => {
    const result = buildNeedsAttention(
      withOverrides([overrideInput("ov-1"), overrideInput("ov-2", { matchKey: "Jane Doe" })]),
    );
    expect(result.overrideTotal).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.renderedCount).toBe(2);
    expect(result.overflowCount).toBe(0);
  });

  it("respects RENDER_CAP: > cap override inputs → sliced to cap with an exact overflow count", () => {
    const overrides = Array.from({ length: RENDER_CAP + 5 }, (_, i) =>
      overrideInput(`ov-${String(i).padStart(3, "0")}`, { matchKey: `Person ${i}` }),
    );
    const result = buildNeedsAttention(withOverrides(overrides));
    expect(result.renderedCount).toBe(RENDER_CAP);
    expect(result.items.length).toBe(RENDER_CAP);
    expect(result.totalCount).toBe(overrides.length);
    expect(result.overflowCount).toBe(overrides.length - RENDER_CAP);
    // Every rendered item is an override_paused card (no other stream seeded).
    expect(result.items.every((i) => i.variant === "override_paused")).toBe(true);
  });

  it("honors an explicit cap override (page uses PAGE_RENDER_CAP)", () => {
    const overrides = Array.from({ length: 30 }, (_, i) =>
      overrideInput(`ov-${String(i).padStart(3, "0")}`),
    );
    const result = buildNeedsAttention({ ...withOverrides(overrides), cap: 100 });
    expect(result.renderedCount).toBe(30); // all render under the wider page cap
    expect(result.overflowCount).toBe(0);
  });
});

// ── Loader: the inactive-override row surfaces as a page row ──────────────────
function makeClient(opts: {
  rowsByTable?: Record<string, ReadonlyArray<Record<string, unknown>>>;
  countByTable?: Record<string, number | null>;
}) {
  const client = {
    from(table: string) {
      const ctx = { head: false, limit: null as number | null };
      const resolve = () => {
        if (ctx.head) {
          const count =
            opts.countByTable && table in opts.countByTable
              ? opts.countByTable[table]!
              : (opts.rowsByTable?.[table]?.length ?? 0);
          return { data: null, error: null, count };
        }
        let rows = opts.rowsByTable?.[table] ?? [];
        if (ctx.limit !== null) rows = rows.slice(0, ctx.limit);
        return { data: rows, error: null, count: null };
      };
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = (_cols?: unknown, o?: { count?: string; head?: boolean }) => {
        if (o?.head) ctx.head = true;
        return builder;
      };
      builder.is = pass;
      builder.order = pass;
      builder.not = pass;
      builder.eq = pass;
      builder.in = pass;
      builder.limit = (n: number) => {
        ctx.limit = n;
        return builder;
      };
      (builder as { then?: unknown }).then = (
        onf?: ((v: unknown) => unknown) | null,
        onr?: ((e: unknown) => unknown) | null,
      ) => Promise.resolve(resolve()).then(onf ?? undefined, onr ?? undefined);
      return builder;
    },
  };
  return client;
}

type LoaderModule = typeof import("@/lib/admin/loadNeedsAttention");
type InjectedClient = NonNullable<Parameters<LoaderModule["loadNeedsAttention"]>[0]["supabase"]>;

describe("loadNeedsAttention — 4th stream page row (§6 step 2)", () => {
  test("an inactive admin_overrides row (joined to shows) surfaces as an override_paused page row + total", async () => {
    const overrideRow = {
      id: "ov-1",
      show_id: "show-1",
      domain: "hotel",
      field: "hotel_name",
      match_key: "Hilton Downtown",
      deactivation_code: "name_conflict",
      shows: { slug: "rpas", title: "RPAS" },
    };
    const client = makeClient({
      rowsByTable: { admin_overrides: [overrideRow] },
      countByTable: { admin_overrides: 1 },
    });
    const { loadNeedsAttention } = await import("@/lib/admin/loadNeedsAttention");
    const result = await loadNeedsAttention({
      cap: 20,
      supabase: client as unknown as InjectedClient,
    });
    expect("kind" in result).toBe(false);
    if ("kind" in result) throw new Error("unreachable");

    const item = result.items.find((i) => i.variant === "override_paused");
    expect(item).toBeDefined();
    if (item?.variant !== "override_paused") throw new Error("unreachable");
    expect(item.overrideId).toBe("ov-1");
    expect(item.slug).toBe("rpas"); // deep-link target: /admin/show/rpas
    expect(item.copy).toBe("clashes with another hotel's name");
    expect(result.overrideTotal).toBe(1);
    expect(result.totalCount).toBe(1);
  });

  test("a null-slug embed override row is skipped (no dead /admin/show/undefined link)", async () => {
    const overrideRow = {
      id: "ov-2",
      show_id: "show-2",
      domain: "crew",
      field: "name",
      match_key: "Ghost",
      deactivation_code: "target_missing",
      shows: null,
    };
    const client = makeClient({
      rowsByTable: { admin_overrides: [overrideRow] },
      countByTable: { admin_overrides: 1 },
    });
    const { loadNeedsAttention } = await import("@/lib/admin/loadNeedsAttention");
    const result = await loadNeedsAttention({
      cap: 20,
      supabase: client as unknown as InjectedClient,
    });
    if ("kind" in result) throw new Error("unreachable");
    expect(result.items.find((i) => i.variant === "override_paused")).toBeUndefined();
  });
});

// ── Nav badge: the count helper folds the 4th stream in ───────────────────────
const countState = vi.hoisted(() => ({
  tables: {} as Record<string, { count: number | null; error: { message: string } | null }>,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const t = countState.tables[table] ?? { count: 0, error: null };
      const b: Record<string, unknown> = {};
      const pass = () => b;
      b.select = pass;
      b.is = pass;
      b.in = pass;
      b.not = pass;
      b.eq = pass;
      b.order = pass;
      (b as { then?: unknown }).then = (f: (r: unknown) => unknown) =>
        Promise.resolve(f({ data: null, count: t.count, error: t.error }));
      return b;
    },
  }),
}));

beforeEach(() => {
  countState.tables = {
    pending_ingestions: { count: 2, error: null },
    pending_syncs: { count: 3, error: null },
    admin_alerts: { count: 0, error: null },
    admin_overrides: { count: 4, error: null },
  };
});
afterEach(() => vi.clearAllMocks());

describe("loadNeedsAttentionCount — 4th stream badge increment (§6 step 2)", () => {
  it("adds the inactive-override head-count into the badge total (2+3+0+4 → 9)", async () => {
    const { loadNeedsAttentionCount } = await import("@/lib/admin/needsAttentionCount");
    expect(await loadNeedsAttentionCount()).toEqual({ kind: "ok", count: 9 });
  });

  it("a returned error on the override count → infra_error (never a silent under-count)", async () => {
    countState.tables.admin_overrides = { count: null, error: { message: "rls" } };
    const { loadNeedsAttentionCount } = await import("@/lib/admin/needsAttentionCount");
    expect(await loadNeedsAttentionCount()).toEqual({ kind: "infra_error" });
  });
});
