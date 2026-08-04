import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadOpenIdentityHolds, HOLDS_ROW_CAP } from "@/lib/admin/identityHolds";
import { log } from "@/lib/log";

const serverMock = vi.hoisted(() => ({ throwOnConstruct: false }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (serverMock.throwOnConstruct) throw new Error("SIMULATED service-role construction fault");
    throw new Error("tests must inject deps.client unless exercising the construction path");
  },
}));

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  serverMock.throwOnConstruct = false;
  seenLimits.length = 0;
  warnSpy = vi.spyOn(log, "warn").mockResolvedValue(undefined as never);
});

type Row = Record<string, unknown>;
// Deterministic uuid-shaped ids: idOf(7) ends ...000007 (sortable, assertable).
function idOf(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
function holdRow(n: number, showId: string, embed: unknown, createdAt?: string): Row {
  return {
    id: idOf(n),
    show_id: showId,
    entity_key: `Crew ${n}`,
    held_value: { email: "old@x.com" },
    proposed_value: { disposition: "removal" },
    base_modified_time: "2026-08-01T00:00:00+00:00",
    created_at: createdAt ?? `2026-08-03T10:${String(n % 60).padStart(2, "0")}:00+00:00`,
    shows: embed,
  };
}
const seenLimits: number[] = [];
function clientReturning(result: { data: Row[] | null; error: { message: string } | null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: (n: number) => {
      seenLimits.push(n);
      return Promise.resolve(result);
    },
  };
  return { from: () => chain } as never;
}

describe("loadOpenIdentityHolds", () => {
  it("flattens object AND array embeds; skips slug-less rows with one warn", async () => {
    const res = await loadOpenIdentityHolds({
      client: clientReturning({
        data: [
          holdRow(1, "sA", { slug: "a", title: "A" }),
          holdRow(2, "sB", [{ slug: "b", title: null }]),
          holdRow(3, "sC", { title: "no slug" }),
        ],
        error: null,
      }),
    });
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    expect(res.groups.map((g) => g.slug)).toEqual(["a", "b"]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returned error, thrown error, and construction throw each map to infra_error", async () => {
    const returned = await loadOpenIdentityHolds({
      client: clientReturning({ data: null, error: { message: "boom" } }),
    });
    expect(returned.kind).toBe("infra_error");
    const chainThrow = {
      select: () => {
        throw new Error("net");
      },
    };
    const thrown = await loadOpenIdentityHolds({ client: { from: () => chainThrow } as never });
    expect(thrown.kind).toBe("infra_error");
    // REAL construction-fault injection (loadNeedsAttention.test.ts:125-138 idiom):
    serverMock.throwOnConstruct = true;
    const constructed = await loadOpenIdentityHolds(); // no injected client
    expect(constructed).toEqual({
      kind: "infra_error",
      message: expect.stringContaining("construction"),
    });
  });

  it("cap boundary: exact-cap silent; over-cap warns, drops sentinel, keeps the id-asc capped MEMBERSHIP", async () => {
    const exact = Array.from({ length: HOLDS_ROW_CAP }, (_, i) =>
      holdRow(i, `s${i}`, { slug: `s${i}` }),
    );
    const okRes = await loadOpenIdentityHolds({
      client: clientReturning({ data: exact, error: null }),
    });
    expect(okRes.kind).toBe("ok");
    expect(warnSpy).not.toHaveBeenCalled();

    // Over-cap with a TIE at the boundary: the last two rows share one timestamp.
    // The DB returns them id-asc within the tie, so the sentinel-drop must keep
    // idOf(CAP-1)'s show and exclude idOf(CAP)'s (plan-R1 F11: membership, not length).
    const tieTs = "2026-08-01T00:00:00+00:00";
    const over = [
      ...Array.from({ length: HOLDS_ROW_CAP - 1 }, (_, i) =>
        holdRow(i, `s${i}`, { slug: `s${i}` }),
      ),
      holdRow(HOLDS_ROW_CAP - 1, "sTieKept", { slug: "s-tie-kept" }, tieTs),
      holdRow(HOLDS_ROW_CAP, "sTieDropped", { slug: "s-tie-dropped" }, tieTs),
    ];
    const overRes = await loadOpenIdentityHolds({
      client: clientReturning({ data: over, error: null }),
    });
    expect(overRes.kind).toBe("ok");
    if (overRes.kind !== "ok") return;
    expect(overRes.groups).toHaveLength(HOLDS_ROW_CAP);
    const slugs = overRes.groups.map((g) => g.slug);
    expect(slugs).toContain("s-tie-kept");
    expect(slugs).not.toContain("s-tie-dropped");
    expect(warnSpy).toHaveBeenCalledWith(
      "sync_holds row cap exceeded",
      expect.objectContaining({ source: "admin.loadOpenIdentityHolds" }),
    );
    // Exactly once: a per-row warn would emit HOLDS_ROW_CAP times and drown the
    // log, and toHaveBeenCalledWith alone stays green on a duplicate.
    expect(
      warnSpy.mock.calls.filter((c: unknown[]) => c[0] === "sync_holds row cap exceeded"),
    ).toHaveLength(1);
    // Sentinel-limit pin (plan-R5 S3): a .limit(HOLDS_ROW_CAP) mutant would kill
    // the sentinel and the overflow warning while every other assertion stays green.
    expect(seenLimits.every((n) => n === HOLDS_ROW_CAP + 1)).toBe(true);
  });

  it("a malformed row that throws in SHAPING resolves to infra_error, never a rejection", async () => {
    // proposed_value is nullable in the DDL (the kind-shape CHECK constrains it
    // only for kind='mi11_pending'), so a row that bypassed the CHECK reaches
    // shapeHoldEntry, which dereferences it. That throw happens OUTSIDE the
    // query try/catch unless the shaping region is guarded too — and a rejected
    // promise escapes the typed contract entirely (invariant 9).
    const malformed = { ...holdRow(1, "sA", { slug: "a", title: "A" }), proposed_value: null };
    const res = await loadOpenIdentityHolds({
      client: clientReturning({ data: [malformed], error: null }),
    });
    expect(res).toEqual({
      kind: "infra_error",
      message: expect.stringContaining("sync_holds shaping threw"),
    });
  });

  // Source pin (lockstep fence, plan Task 2 Step 3b): mocked clients cannot see
  // query filters, so a dropped archived filter (R6) or a dropped order (G7)
  // would leave every behavioral assertion above green.
  it("source pins the mi11_pending / archived / ordering / sentinel-limit query shape", () => {
    // Scoped to the ACTUAL query chain with comments stripped. A whole-file
    // `toContain` passes when the operations are deleted and their literals
    // survive in a comment, which is exactly the regression this pin exists to
    // catch (archived filter or ordering dropped in a refactor).
    const raw = readFileSync("lib/admin/identityHolds.ts", "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const start = src.indexOf('.from("sync_holds")');
    expect(start, "the sync_holds query chain is gone entirely").toBeGreaterThan(-1);
    const end = src.indexOf(";", start);
    const chain = src.slice(start, end);
    for (const op of [
      '.eq("kind", "mi11_pending")',
      '.eq("shows.archived", false)',
      '.order("created_at", { ascending: false })',
      '.order("id", { ascending: true })',
      ".limit(HOLDS_ROW_CAP + 1)",
    ]) {
      expect(chain, `missing from the sync_holds query chain: ${op}`).toContain(op);
    }
    // The PROJECTION is pinned WHOLE, not by sampled columns. A mocked client
    // returns fixture rows regardless of what was selected, so every column loss
    // is invisible to the behavioral tests — and they are not equivalent losses:
    // dropping `shows!inner(slug, title)` empties the stream (slug-less rows are
    // skipped), while dropping `show_id` collapses every hold into ONE group
    // keyed undefined. Naming columns one at a time is how this pin gets
    // re-litigated; equality ends it.
    const projection = chain.slice(chain.indexOf(".select(") + ".select(".length);
    const literal = projection.slice(projection.indexOf('"') + 1, projection.indexOf('",'));
    expect(literal).toBe(
      "id, show_id, entity_key, held_value, proposed_value, base_modified_time, created_at, shows!inner(slug, title)",
    );
  });

  it("source pins invariant-9 destructuring: the response is read as { data, error }", () => {
    // The meta-test recognizes the try/catch WRAPPER, not the read shape, and a
    // bare response handle (`const res = await supabase...; res.data`) preserves
    // current behavior — so nothing else in the suite would catch the regression
    // that invariant 9 exists to prevent.
    const raw = readFileSync("lib/admin/identityHolds.ts", "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toMatch(/const\s*\{\s*data\s*,\s*error\s*,?\s*\}\s*=\s*await\s+supabase\b/);
  });
});
