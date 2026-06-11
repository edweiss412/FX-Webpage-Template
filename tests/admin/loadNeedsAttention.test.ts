// Mobile needs-attention Task 1 (spec §4.1) — loadNeedsAttention loader
// contract. The needs-attention assembly (two bounded pending streams + two
// exact head-counts + existence lookup + buildNeedsAttention) is extracted
// from Dashboard.tsx into lib/admin/loadNeedsAttention.ts with: cap threading
// (.limit(cap+1) + slice cap), exact per-stream totals (ingestionTotal /
// syncTotal — R6-F1), count-integrity guard (null head-count → infra_error,
// NOT a row-length fallback — ratified R2-F3), internal client construction
// when no client is injected, and the full invariant-9 matrix: every query
// surface × both failure modes (returned .error / thrown) → typed infra_error.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { buildNeedsAttention } from "@/lib/admin/needsAttention";

// ── fake-client factory ──────────────────────────────────────────────────
// Per-CALL targeting: a head-count query is distinguished from a row query on
// the SAME table via select options.head === true, so the head-count failure
// cases hit the count query while the row query succeeds, and vice versa.
type Target = { table: string; head: boolean };

type FakeOpts = {
  rowsByTable?: Record<string, Record<string, unknown>[]>;
  // `null` simulates the PostgREST integrity fault: count:null, error:null.
  countByTable?: Record<string, number | null>;
  errorOn?: Target; // returned { error } on the matching call
  rejectOn?: Target; // awaited rejection on the matching call
};

function makeClient(opts: FakeOpts) {
  const calls: Array<{
    table: string;
    head: boolean;
    limit: number | null;
    inCol: string | null;
    inArgs: unknown[] | null;
  }> = [];
  const client = {
    from(table: string) {
      const ctx = {
        head: false,
        limit: null as number | null,
        inCol: null as string | null,
        inArgs: null as unknown[] | null,
      };
      const matches = (t?: Target) => !!t && t.table === table && t.head === ctx.head;
      const resolve = () => {
        calls.push({
          table,
          head: ctx.head,
          limit: ctx.limit,
          inCol: ctx.inCol,
          inArgs: ctx.inArgs,
        });
        if (matches(opts.rejectOn)) {
          throw new Error(`SIMULATED ${table} ${ctx.head ? "head" : "rows"} rejection`);
        }
        if (matches(opts.errorOn)) {
          return {
            data: null,
            error: { message: `SIMULATED ${table} ${ctx.head ? "head" : "rows"} returned error` },
            count: null,
          };
        }
        if (ctx.head) {
          const count =
            opts.countByTable && table in opts.countByTable
              ? opts.countByTable[table]!
              : (opts.rowsByTable?.[table]?.length ?? 0);
          return { data: null, error: null, count };
        }
        let rows = opts.rowsByTable?.[table] ?? [];
        // Honor .limit() so cap threading is OBSERVABLE: a loader that fails
        // to thread opts.cap into .limit(cap+1) returns too few rows at a
        // raised cap and the cap-100 case fails.
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
      builder.limit = (n: number) => {
        ctx.limit = n;
        return builder;
      };
      builder.in = (col: string, args: unknown[]) => {
        ctx.inCol = col;
        ctx.inArgs = args;
        return builder;
      };
      (builder as { then?: unknown }).then = (
        onf?: ((v: unknown) => unknown) | null,
        onr?: ((e: unknown) => unknown) | null,
      ) => {
        try {
          return Promise.resolve(resolve()).then(onf ?? undefined, onr ?? undefined);
        } catch (e) {
          return Promise.reject(e).then(onf ?? undefined, onr ?? undefined);
        }
      };
      return builder;
    },
  };
  return { client, calls };
}

const serverMock = vi.hoisted(() => ({ throwOnConstruct: false }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (serverMock.throwOnConstruct) {
      throw new Error("SIMULATED server-client construction fault");
    }
    return makeClient({}).client;
  },
}));

beforeEach(() => {
  serverMock.throwOnConstruct = false;
});

type LoaderModule = typeof import("@/lib/admin/loadNeedsAttention");
async function loader(): Promise<LoaderModule["loadNeedsAttention"]> {
  const mod = await import("@/lib/admin/loadNeedsAttention");
  return mod.loadNeedsAttention;
}
type InjectedClient = NonNullable<Parameters<LoaderModule["loadNeedsAttention"]>[0]["supabase"]>;

// ── fixtures ─────────────────────────────────────────────────────────────
function ingRow(i: number, driveFileId: string, lastAttemptAt: string | null) {
  return {
    id: `ing-${String(i).padStart(3, "0")}`,
    drive_file_id: driveFileId,
    drive_file_name: `Sheet ${i}`,
    last_attempt_at: lastAttemptAt,
    last_error_code: null,
  };
}
function syncRow(i: number, driveFileId: string, stagedModifiedTime: string | null) {
  return {
    staged_id: `stg-${String(i).padStart(3, "0")}`,
    drive_file_id: driveFileId,
    staged_modified_time: stagedModifiedTime,
    parse_result: { show: { title: `Show ${i}` } },
    triggered_review_items: [],
  };
}
function iso(minute: number): string {
  return `2026-06-09T10:${String(minute).padStart(2, "0")}:00.000Z`;
}

describe("loadNeedsAttention", () => {
  test("parity: cap 20 produces the same items/renderedCount/totalCount/overflowCount buildNeedsAttention produced pre-extraction", async () => {
    // 3 ingestion rows (count 3), 2 sync rows (count 2); existence marks ONE
    // staged sync as an existing show. Expectations are derived FROM the
    // fixture arrays via the pure assembler — never hardcoded item counts
    // disconnected from them.
    const ingestions = [
      ingRow(1, "df-i1", iso(50)),
      ingRow(2, "df-i2", iso(30)),
      ingRow(3, "df-i3", iso(10)),
    ];
    const syncs = [syncRow(1, "df-s1", iso(40)), syncRow(2, "df-s2", iso(20))];
    const showsRows = [
      {
        drive_file_id: "df-s1",
        slug: "existing-show",
        title: "Existing",
        archived: false,
        published: true,
      },
    ];
    const { client, calls } = makeClient({
      rowsByTable: { pending_ingestions: ingestions, pending_syncs: syncs, shows: showsRows },
    });
    const loadNeedsAttention = await loader();
    const result = await loadNeedsAttention({
      cap: 20,
      supabase: client as unknown as InjectedClient,
    });
    expect("kind" in result).toBe(false);
    if ("kind" in result) throw new Error("unreachable");

    const expected = buildNeedsAttention({
      ingestions: ingestions.map((r) => ({
        id: r.id,
        driveFileId: r.drive_file_id,
        driveFileName: r.drive_file_name,
        lastErrorCode: r.last_error_code,
        lastAttemptAt: r.last_attempt_at,
      })),
      syncs: syncs.map((r) => ({
        stagedId: r.staged_id,
        driveFileId: r.drive_file_id,
        candidateTitle: r.parse_result.show.title,
        stagedModifiedTime: r.staged_modified_time,
      })),
      existence: {
        "df-s1": { slug: "existing-show", title: "Existing", published: true, archived: false },
      },
      totalCounts: { ingestions: ingestions.length, syncs: syncs.length },
      cap: 20,
    });
    expect(result.items).toEqual(expected.items);
    expect(result.renderedCount).toBe(expected.renderedCount);
    expect(result.totalCount).toBe(expected.totalCount);
    expect(result.overflowCount).toBe(expected.overflowCount);
    // New additive fields hold in the basic (counts == row lengths) case too:
    expect(result.ingestionTotal).toBe(ingestions.length);
    expect(result.syncTotal).toBe(syncs.length);

    // Independent classification + ordering assertions (not via the assembler):
    const variants = new Map(result.items.map((i) => [i.key, i.variant]));
    expect(variants.get("sync:stg-001")).toBe("existing_staged"); // df-s1 exists
    expect(variants.get("sync:stg-002")).toBe("first_seen"); // df-s2 unknown
    for (const r of ingestions) expect(variants.get(`ingestion:${r.id}`)).toBe("pending_ingestion");
    const activity = result.items.map((i) => i.activityAt ?? "");
    expect(activity).toEqual([...activity].sort().reverse()); // newest-first
    // Existence lookup is keyed .in('drive_file_id', <pending ids>).
    const existenceCall = calls.find((c) => c.table === "shows");
    expect(existenceCall?.inCol).toBe("drive_file_id");
    expect(new Set(existenceCall?.inArgs as string[])).toEqual(
      new Set(["df-i1", "df-i2", "df-i3", "df-s1", "df-s2"]),
    );
  });

  test("cap threading: 25 sync rows, cap 20 → renderedCount 20, overflow > 0; cap 100 → renders all 25", async () => {
    const syncs = Array.from({ length: 25 }, (_, i) => syncRow(i + 1, `df-s${i + 1}`, iso(i + 1)));
    const make = () =>
      makeClient({
        rowsByTable: { pending_ingestions: [], pending_syncs: syncs, shows: [] },
        countByTable: { pending_ingestions: 0, pending_syncs: syncs.length },
      });
    const loadNeedsAttention = await loader();

    const capped = await loadNeedsAttention({
      cap: 20,
      supabase: make().client as unknown as InjectedClient,
    });
    expect("kind" in capped).toBe(false);
    if ("kind" in capped) throw new Error("unreachable");
    expect(capped.renderedCount).toBe(20);
    expect(capped.overflowCount).toBe(syncs.length - 20);
    expect(capped.overflowCount).toBeGreaterThan(0);

    const { client, calls } = make();
    const wide = await loadNeedsAttention({
      cap: 100,
      supabase: client as unknown as InjectedClient,
    });
    expect("kind" in wide).toBe(false);
    if ("kind" in wide) throw new Error("unreachable");
    expect(wide.renderedCount).toBe(syncs.length); // all 25 — requires .limit(cap+1) threading
    expect(wide.overflowCount).toBe(0);
    // The bounded row reads carry .limit(cap + 1).
    const rowReads = calls.filter((c) => !c.head && c.table !== "shows");
    expect(rowReads.length).toBeGreaterThan(0);
    for (const c of rowReads) expect(c.limit).toBe(101);
  });

  test("exact stream totals beyond the cap (R6-F1): head-counts 31/47 → ingestionTotal 31, syncTotal 47, totalCount 78", async () => {
    // 31 / 47 / 78 are NOT derivable from any row-array length here (7 + 20 rows).
    const ingestions = Array.from({ length: 7 }, (_, i) =>
      ingRow(i + 1, `df-i${i + 1}`, iso(i + 30)),
    );
    const syncs = Array.from({ length: 20 }, (_, i) => syncRow(i + 1, `df-s${i + 1}`, iso(i + 1)));
    const { client } = makeClient({
      rowsByTable: { pending_ingestions: ingestions, pending_syncs: syncs, shows: [] },
      countByTable: { pending_ingestions: 31, pending_syncs: 47 },
    });
    const loadNeedsAttention = await loader();
    const result = await loadNeedsAttention({
      cap: 20,
      supabase: client as unknown as InjectedClient,
    });
    expect("kind" in result).toBe(false);
    if ("kind" in result) throw new Error("unreachable");
    expect(result.ingestionTotal).toBe(31);
    expect(result.syncTotal).toBe(47);
    expect(result.totalCount).toBe(78);
    expect(result.renderedCount).toBe(20);
    expect(result.overflowCount).toBe(78 - 20);
  });

  test.each([["pending_ingestions"], ["pending_syncs"]])(
    "null head-count integrity (R2-F3): %s count:null, error:null with rows present → infra_error, no row-length fallback",
    async (table) => {
      const { client } = makeClient({
        rowsByTable: {
          pending_ingestions: [ingRow(1, "df-i1", iso(5))],
          pending_syncs: [syncRow(1, "df-s1", iso(6))],
          shows: [],
        },
        countByTable: { [table]: null },
      });
      const loadNeedsAttention = await loader();
      const result = await loadNeedsAttention({
        cap: 20,
        supabase: client as unknown as InjectedClient,
      });
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { message: string }).message).toMatch(
        new RegExp(`${table} head-count returned non-number`),
      );
    },
  );

  test("construction throw containment (R1): createSupabaseServerClient throws, no injected client → resolves infra_error, never rejects", async () => {
    serverMock.throwOnConstruct = true;
    const loadNeedsAttention = await loader();
    await expect(loadNeedsAttention({ cap: 20 })).resolves.toMatchObject({
      kind: "infra_error",
    });
  });

  // ── Invariant-9 matrix (R2-P2-F1): EVERY query surface × BOTH failure modes.
  // Fixtures seed pending rows with drive_file_ids so the shows existence
  // lookup branch is REACHED (it only runs when there are candidate ids).
  const MATRIX_ROWS = {
    pending_ingestions: [ingRow(1, "df-a", iso(9))],
    pending_syncs: [syncRow(1, "df-b", iso(8))],
    shows: [] as Record<string, unknown>[],
  };
  describe.each([
    [
      "pending_ingestions rows",
      { table: "pending_ingestions", head: false },
      /pending_ingestions query failed/,
      /pending_ingestions query threw/,
    ],
    [
      "pending_ingestions head-count",
      { table: "pending_ingestions", head: true },
      /pending_ingestions count query failed/,
      /pending_ingestions count query threw/,
    ],
    [
      "pending_syncs rows",
      { table: "pending_syncs", head: false },
      /pending_syncs query failed/,
      /pending_syncs query threw/,
    ],
    [
      "pending_syncs head-count",
      { table: "pending_syncs", head: true },
      /pending_syncs count query failed/,
      /pending_syncs count query threw/,
    ],
    [
      "shows existence lookup",
      { table: "shows", head: false },
      /existence query failed/,
      /existence query threw/,
    ],
  ] as const)("%s failure paths", (_surface, target, failedRe, threwRe) => {
    test("returned .error → infra_error with a message naming the query", async () => {
      const { client } = makeClient({ rowsByTable: MATRIX_ROWS, errorOn: { ...target } });
      const loadNeedsAttention = await loader();
      const result = await loadNeedsAttention({
        cap: 20,
        supabase: client as unknown as InjectedClient,
      });
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { message: string }).message).toMatch(failedRe);
    });

    test("awaited rejection → infra_error, never rejects", async () => {
      const { client } = makeClient({ rowsByTable: MATRIX_ROWS, rejectOn: { ...target } });
      const loadNeedsAttention = await loader();
      await expect(
        loadNeedsAttention({ cap: 20, supabase: client as unknown as InjectedClient }),
      ).resolves.toMatchObject({ kind: "infra_error" });
      const again = await loadNeedsAttention({
        cap: 20,
        supabase: makeClient({ rowsByTable: MATRIX_ROWS, rejectOn: { ...target } })
          .client as unknown as InjectedClient,
      });
      expect((again as { message: string }).message).toMatch(threwRe);
    });
  });

  // ── Invariant-9 source pin (WM-R1): all FIVE reads destructure the Supabase
  // response (`const { data, error } = await ...`, + `count` with a voided
  // `data: _x` for the head-counts) instead of keeping a whole-response handle
  // (`const q = await ...; q.error / q.data / q.count`). Mirrors the source-
  // regex pin in tests/admin/needsAttentionCount.test.ts; `,?` tolerates
  // prettier trailing-comma wrapping. Fails if ANY read regresses to bare-
  // result handling: the per-query positive pin stops matching, and the
  // negative sweep catches any whole-response alias regardless of its name.
  test("invariant 9: every Supabase read destructures { data, error } (+ count for head-counts) — no whole-response handles", () => {
    const src = readFileSync("lib/admin/loadNeedsAttention.ts", "utf8");
    // 1. pending_ingestions rows
    expect(src).toMatch(
      /const\s*\{\s*data:\s*ingestionData\s*,\s*error:\s*ingestionRowsError\s*,?\s*\}\s*=\s*await\s+supabase\s*\.from\("pending_ingestions"\)/,
    );
    // 2. pending_ingestions head-count (canonical alertCount.ts:26 shape: voided data alias)
    expect(src).toMatch(
      /const\s*\{\s*data:\s*_ingestionCountData\s*,\s*count:\s*ingestionHeadCount\s*,\s*error:\s*ingestionCountError\s*,?\s*\}\s*=\s*await\s+supabase\s*\.from\("pending_ingestions"\)/,
    );
    expect(src).toMatch(/void\s+_ingestionCountData;/);
    // 3. pending_syncs rows
    expect(src).toMatch(
      /const\s*\{\s*data:\s*syncData\s*,\s*error:\s*syncRowsError\s*,?\s*\}\s*=\s*await\s+supabase\s*\.from\("pending_syncs"\)/,
    );
    // 4. pending_syncs head-count
    expect(src).toMatch(
      /const\s*\{\s*data:\s*_syncCountData\s*,\s*count:\s*syncHeadCount\s*,\s*error:\s*syncCountError\s*,?\s*\}\s*=\s*await\s+supabase\s*\.from\("pending_syncs"\)/,
    );
    expect(src).toMatch(/void\s+_syncCountData;/);
    // 5. shows existence lookup
    expect(src).toMatch(
      /const\s*\{\s*data:\s*existenceData\s*,\s*error:\s*existenceError\s*,?\s*\}\s*=\s*await\s+supabase\s*\.from\("shows"\)/,
    );
    // Negative sweep: NO read keeps a whole-response handle under any name —
    // `const <ident> = await supabase` (a non-destructured binding) must not
    // appear anywhere in the helper except the client construction itself.
    const bareHandles = src.match(/const\s+[A-Za-z_$][\w$]*\s*=\s*await\s+supabase\b/g) ?? [];
    expect(bareHandles).toEqual([]);
    // Exactly five destructured awaits — one per query surface.
    const destructured = src.match(/=\s*await\s+supabase\s*\.from\(/g) ?? [];
    expect(destructured).toHaveLength(5);
  });
});
