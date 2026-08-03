# Needs-Attention Holds Rollup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface open MI-11 identity holds (`sync_holds`, `kind='mi11_pending'`) as a fourth needs-attention stream across the page, dashboard inbox, AdminNav badge, mobile summary card, and digest email.

**Architecture:** One pure grouping core + one service-role PostgREST reader (new lib/admin/identityHolds.ts) feed both admin helpers; the digest reuses the pure core over its own `sql` transport with `asIso` normalization. The builder gains an `identity_hold` variant; the inbox gains a card with a client-island disclosure. No DB changes, no new routes, no mutation surfaces.

**Tech Stack:** Next.js 16 server components, supabase-js (service-role), postgres.js (digest), vitest, Playwright.

**Spec (canonical):** `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md` — §1.1 R1–R8 are owner-ratified; §1.2 records two adversarial rounds already repaired. The spec wins on any conflict (AGENTS.md invariant 7).

## Global Constraints

- Worktree: `/Users/ericweiss/FX-worktrees/needs-attention-holds-rollup`, branch `feat/needs-attention-holds-rollup`. All commands run there.
- TDD per task (invariant 1): failing test → minimal implementation → passing test → commit (`--no-verify` per ship pipeline).
- Runner is **vitest** (`pnpm vitest run <file>`); new test files under `tests/**` auto-match `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) — no config edits.
- Invariant 9: every Supabase await destructures `{ data, error }`; faults → typed `{ kind: "infra_error" }`.
- Invariants 2/10: N/A — reads only, no advisory-locked writes, no new mutation surfaces (spec D7).
- Copy rules: no em-dashes in user-visible strings; no raw codes (invariant 5); per-hold copy ONLY via `shapeHoldEntry` (spec R8).
- `HOLDS_ROW_CAP = 200`, `HOLD_SUMMARIES_RENDER_CAP = 10` — single definitions in lib/admin/identityHolds.ts / the island; never a second literal.
- Strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — all snippets below written against it; run `pnpm exec tsc --noEmit` before each commit.
- UI files touched → invariant-8 impeccable dual gate at closeout (Task 12).

## File Structure

- Create: lib/admin/identityHolds.ts (pure `groupHoldRows` + reader `loadOpenIdentityHolds`), components/admin/IdentityHoldDisclosure.tsx (client island), tests/admin/identityHolds.test.ts, tests/admin/loadOpenIdentityHolds.test.ts, tests/components/needsAttentionInboxIdentityHold.test.tsx, tests/components/identityHoldTransitionAudit.test.tsx, tests/e2e/needs-attention-holds.spec.ts.
- Modify: `lib/admin/needsAttention.ts` (variant), `lib/admin/loadNeedsAttention.ts` (holds leg), `lib/admin/needsAttentionCount.ts` (holds leg), `components/admin/NeedsAttentionInbox.tsx` (card branch), `components/admin/NeedsAttentionSummaryCard.tsx` (chip), `components/admin/Dashboard.tsx` (threading + tooltip), `app/admin/needs-attention/page.tsx` (tooltip), `lib/notify/digest.ts` (holds transport + cap + totals), `lib/notify/runNotify.ts` (literal), 4 help mdx files, `tests/admin/_metaInfraContract.test.ts`, `tests/admin/_metaBoundedReads.test.ts`, existing digest tests' fixtures where `sourceTotals` shape is pinned, `BACKLOG.md` (graduation at closeout).

---

### Task 1: `groupHoldRows` pure core

**Files:**

- Create: lib/admin/identityHolds.ts (pure part only), tests/admin/identityHolds.test.ts

**Interfaces:**

- Consumes: `shapeHoldEntry`, `HoldRow` from `lib/sync/feed/shapeHoldEntry.ts:11-18` and `shapeHoldEntry.ts:90`; `Disposition` from `lib/sync/holds/types`.
- Produces (later tasks rely on these EXACT names): `IdentityHoldRow`, `IdentityHoldGroup { showId: string; slug: string; title: string | null; summaries: string[]; newestCreatedAt: string }`, `groupHoldRows(rows: IdentityHoldRow[]): IdentityHoldGroup[]`, `HOLDS_ROW_CAP = 200`.

- [ ] **Step 1: Write the failing test** — tests/admin/identityHolds.test.ts:

```ts
import { describe, expect, it } from "vitest";
import { groupHoldRows, type IdentityHoldRow } from "@/lib/admin/identityHolds";

// Rows arrive newest-first (reader orders created_at desc, id asc). Fixture
// timestamps drive every expectation; nothing hardcoded independently.
function row(over: Partial<IdentityHoldRow> & { id: string; show_id: string }): IdentityHoldRow {
  return {
    slug: `slug-${over.show_id}`,
    title: `Title ${over.show_id}`,
    entity_key: "Jane Doe",
    held_value: { email: "jane@old.com" },
    proposed_value: { disposition: "email_change", email: "jane@new.com" },
    base_modified_time: "2026-08-01T00:00:00+00:00",
    created_at: "2026-08-02T10:00:00+00:00",
    ...over,
  } as IdentityHoldRow;
}

describe("groupHoldRows", () => {
  it("groups by show preserving newest-first order; summaries via shapeHoldEntry", () => {
    const rows = [
      row({ id: "h3", show_id: "sB", created_at: "2026-08-03T12:00:00+00:00" }),
      row({ id: "h2", show_id: "sA", created_at: "2026-08-03T11:00:00+00:00", entity_key: "Bob Roe", proposed_value: { disposition: "removal" } }),
      row({ id: "h1", show_id: "sB", created_at: "2026-08-03T10:00:00+00:00", entity_key: "Ann Poe", proposed_value: { disposition: "removal" } }),
    ];
    const groups = groupHoldRows(rows);
    expect(groups.map((g) => g.showId)).toEqual(["sB", "sA"]); // first-seen order = newest-first
    const b = groups[0];
    if (!b) throw new Error("missing group");
    expect(b.newestCreatedAt).toBe("2026-08-03T12:00:00+00:00"); // first row of group
    expect(b.summaries).toHaveLength(2);
    // Summary text is GENERATED (spec R8): catalog copy carries the entity name.
    expect(b.summaries[0]).toContain("Jane Doe");
    expect(b.summaries[1]).toContain("Ann Poe");
  });

  it("single-row group; empty input", () => {
    expect(groupHoldRows([])).toEqual([]);
    const g = groupHoldRows([row({ id: "h9", show_id: "sC" })]);
    expect(g).toHaveLength(1);
    expect(g[0]?.summaries).toHaveLength(1);
  });
});
```

_Failure mode caught: grouping that re-sorts (losing newest-first), summaries authored instead of generated (name would be absent), newestCreatedAt taken from the wrong row._

- [ ] **Step 2: Run** `pnpm vitest run tests/admin/identityHolds.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement** the pure part of lib/admin/identityHolds.ts:

```ts
// lib/admin/identityHolds.ts: cross-show open-holds read for the needs-attention
// rollup (spec 2026-08-03 section 4). Pure grouping core shared by the PostgREST
// reader below and the digest's raw-SQL transport (lib/notify/digest.ts), so page,
// inbox, badge, and email share one grouping semantics.
import { shapeHoldEntry, type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";

// Flat, READER-normalized row: no nested embed, no Date, no null slug (spec §4).
export type IdentityHoldRow = HoldRow & {
  show_id: string;
  slug: string;
  title: string | null;
};

export type IdentityHoldGroup = {
  showId: string;
  slug: string;
  title: string | null;
  // newest-first; length >= 1; each from shapeHoldEntry(row).summary (spec R8)
  summaries: string[];
  newestCreatedAt: string;
};

export const HOLDS_ROW_CAP = 200;

export function groupHoldRows(rows: IdentityHoldRow[]): IdentityHoldGroup[] {
  const groups = new Map<string, IdentityHoldGroup>();
  for (const row of rows) {
    const summary = shapeHoldEntry(row).summary;
    const existing = groups.get(row.show_id);
    if (existing) {
      existing.summaries.push(summary);
    } else {
      groups.set(row.show_id, {
        showId: row.show_id,
        slug: row.slug,
        title: row.title,
        summaries: [summary],
        newestCreatedAt: row.created_at,
      });
    }
  }
  return [...groups.values()];
}
```

- [ ] **Step 4: Run** the test — expect PASS. Also `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(admin): groupHoldRows pure core for identity-holds rollup`

---

### Task 2: `loadOpenIdentityHolds` reader + registries

**Files:**

- Modify: lib/admin/identityHolds.ts (append reader), `tests/admin/_metaInfraContract.test.ts` (new row), `tests/admin/_metaBoundedReads.test.ts` (two rows)
- Create: tests/admin/loadOpenIdentityHolds.test.ts

**Interfaces:**

- Consumes: `createSupabaseServiceRoleClient` (`lib/supabase/server.ts:79`), `log` (`@/lib/log`), Task 1 exports.
- Produces: `loadOpenIdentityHolds(deps?: { client?: SupabaseClient }): Promise<{ kind: "ok"; groups: IdentityHoldGroup[] } | { kind: "infra_error"; message: string }>` — dep-injectable client for tests, mirroring `loadNeedsAttention`'s `opts.supabase` pattern (`lib/admin/loadNeedsAttention.ts:30-46`).

- [ ] **Step 1: Write the failing test** — tests/admin/loadOpenIdentityHolds.test.ts. Mock client builder pattern: an object whose `from()` returns a chain ending in a thenable resolving `{ data, error }` (copy the chain-stub idiom from `tests/admin/loadNeedsAttention.test.ts`). Cases:

```ts
import { describe, expect, it, vi } from "vitest";
import { loadOpenIdentityHolds, HOLDS_ROW_CAP } from "@/lib/admin/identityHolds";
import { log } from "@/lib/log";

type Row = Record<string, unknown>;
function holdRow(n: number, showId: string, embed: unknown): Row {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    show_id: showId,
    entity_key: `Crew ${n}`,
    held_value: { email: "old@x.com" },
    proposed_value: { disposition: "removal" },
    base_modified_time: "2026-08-01T00:00:00+00:00",
    created_at: `2026-08-03T10:${String(n % 60).padStart(2, "0")}:00+00:00`,
    shows: embed,
  };
}
function clientReturning(result: { data: Row[] | null; error: { message: string } | null }) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: () => Promise.resolve(result),
  };
  return { from: () => chain } as never;
}

describe("loadOpenIdentityHolds", () => {
  it("flattens object AND array embeds; skips slug-less rows with a warn", async () => {
    const warn = vi.spyOn(log, "warn").mockResolvedValue(undefined as never);
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
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returned error, thrown error, and construction throw each map to infra_error", async () => {
    const returned = await loadOpenIdentityHolds({
      client: clientReturning({ data: null, error: { message: "boom" } }),
    });
    expect(returned.kind).toBe("infra_error");
    const chainThrow = { select: () => { throw new Error("net"); } };
    const thrown = await loadOpenIdentityHolds({ client: { from: () => chainThrow } as never });
    expect(thrown.kind).toBe("infra_error");
    // No injected client + no env in the vitest node environment → construction
    // path itself must map to infra_error, never throw out.
    const constructed = await loadOpenIdentityHolds();
    expect(["ok", "infra_error"]).toContain(constructed.kind); // must not reject
  });

  it("cap boundary: exactly CAP rows no warn; CAP+1 warns, drops sentinel, groups the capped set", async () => {
    const warn = vi.spyOn(log, "warn").mockResolvedValue(undefined as never);
    const exact = Array.from({ length: HOLDS_ROW_CAP }, (_, i) => holdRow(i, `s${i}`, { slug: `s${i}` }));
    const okRes = await loadOpenIdentityHolds({ client: clientReturning({ data: exact, error: null }) });
    expect(okRes.kind).toBe("ok");
    expect(warn).not.toHaveBeenCalled();
    const over = Array.from({ length: HOLDS_ROW_CAP + 1 }, (_, i) => holdRow(i, `s${i}`, { slug: `s${i}` }));
    const overRes = await loadOpenIdentityHolds({ client: clientReturning({ data: over, error: null }) });
    expect(overRes.kind).toBe("ok");
    if (overRes.kind !== "ok") return;
    expect(overRes.groups).toHaveLength(HOLDS_ROW_CAP); // sentinel dropped
    expect(warn).toHaveBeenCalledWith("sync_holds row cap exceeded", expect.objectContaining({ source: "admin.loadOpenIdentityHolds" }));
  });
});
```

_Failure modes: embed shape drift (array vs object), silent slug-less rows, sentinel leaking into groups, throws escaping the typed contract._

- [ ] **Step 2: Run — FAIL** (`loadOpenIdentityHolds` not exported).
- [ ] **Step 3: Implement** (append to lib/admin/identityHolds.ts):

```ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

type HoldsClient = Pick<ReturnType<typeof createSupabaseServiceRoleClient>, "from">;

export type LoadOpenIdentityHoldsResult =
  | { kind: "ok"; groups: IdentityHoldGroup[] }
  | { kind: "infra_error"; message: string };

export async function loadOpenIdentityHolds(
  deps: { client?: HoldsClient } = {},
): Promise<LoadOpenIdentityHoldsResult> {
  let client: HoldsClient;
  try {
    client = deps.client ?? createSupabaseServiceRoleClient();
  } catch (err) {
    return { kind: "infra_error", message: `service-role client construction failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  let rows: ReadonlyArray<Record<string, unknown>>;
  try {
    const { data, error } = await client
      .from("sync_holds")
      .select("id, show_id, entity_key, held_value, proposed_value, base_modified_time, created_at, shows!inner(slug, title)")
      .eq("kind", "mi11_pending")
      .eq("shows.archived", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(HOLDS_ROW_CAP + 1);
    if (error) return { kind: "infra_error", message: `sync_holds query failed: ${error.message}` };
    rows = (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  } catch (err) {
    return { kind: "infra_error", message: `sync_holds query threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (rows.length > HOLDS_ROW_CAP) {
    void log.warn("sync_holds row cap exceeded", { source: "admin.loadOpenIdentityHolds" });
    rows = rows.slice(0, HOLDS_ROW_CAP);
  }
  const flat: IdentityHoldRow[] = [];
  for (const r of rows) {
    const embed = r.shows as { slug?: string; title?: string | null } | Array<{ slug?: string; title?: string | null }> | null;
    const show = Array.isArray(embed) ? embed[0] : embed;
    if (!show?.slug) {
      void log.warn("identity hold missing show slug", { source: "admin.loadOpenIdentityHolds", holdId: String(r.id) });
      continue;
    }
    flat.push({
      id: r.id as string,
      show_id: r.show_id as string,
      slug: show.slug,
      title: (show.title as string | null) ?? null,
      entity_key: r.entity_key as string,
      held_value: r.held_value,
      proposed_value: r.proposed_value as IdentityHoldRow["proposed_value"],
      base_modified_time: (r.base_modified_time as string | null) ?? null,
      created_at: r.created_at as string,
    });
  }
  return { kind: "ok", groups: groupHoldRows(flat) };
}
```

- [ ] **Step 3b: Source pin (lockstep fence).** In tests/admin/loadOpenIdentityHolds.test.ts, add a source-regex test (same idiom as the invariant-9 regex test in `tests/admin/loadNeedsAttention.test.ts`): read lib/admin/identityHolds.ts with `fs.readFileSync` and assert it contains `.eq("kind", "mi11_pending")`, `.eq("shows.archived", false)`, `.order("created_at", { ascending: false })`, and `.order("id", { ascending: true })`. _Failure mode: R6 archived filter or the G7 deterministic secondary order silently dropped in a refactor — the mocked-client tests cannot see query filters._
- [ ] **Step 4: Registries.** `tests/admin/_metaInfraContract.test.ts`: add this row next to the existing `loadNeedsAttentionCount` row (`_metaInfraContract.test.ts:263-267`):

```ts
{
  helper: "loadOpenIdentityHolds",
  path: "lib/admin/identityHolds.ts",
  contract:
    "sync_holds service-role read (kind='mi11_pending', shows!inner archived=false); construction throw + query throw + returned {error} map to { kind: 'infra_error' }",
},
```
 `tests/admin/_metaBoundedReads.test.ts`: add the new module path lib/admin/identityHolds.ts to `READ_MODULES` (`_metaBoundedReads.test.ts:30`) and the table name sync_holds to `UNBOUNDED_TABLES` (`_metaBoundedReads.test.ts:58`).
- [ ] **Step 5: Run** the new test file + both meta tests + `tsc --noEmit` — PASS.
- [ ] **Step 6: Commit** `feat(admin): loadOpenIdentityHolds service-role reader + registry rows`

---

### Task 3: builder `identity_hold` variant

**Files:**

- Modify: `lib/admin/needsAttention.ts`, `tests/admin/needsAttention.test.ts` (append cases)

**Interfaces:**

- Consumes: `IdentityHoldGroup` (Task 1).
- Produces: `NeedsAttentionIdentityHoldInput = IdentityHoldGroup` re-export; item variant `{ variant: "identity_hold"; key: \`hold-show:${showId}\`; showId; slug; title; summaries; copy; activityAt }`; `BuildNeedsAttentionInput.identityHolds?`; `totalCounts.identityHolds?`; output `identityHoldTotal: number`. Multi-hold copy literal: `` `${summaries.length} held changes waiting` ``.

- [ ] **Step 1: Failing tests** (append to `tests/admin/needsAttention.test.ts`; reuse its existing input-builder helpers):

```ts
import type { NeedsAttentionIdentityHoldInput } from "@/lib/admin/needsAttention";

const holdGroup = (over: Partial<NeedsAttentionIdentityHoldInput> = {}): NeedsAttentionIdentityHoldInput => ({
  showId: "sX", slug: "sx", title: "Show X",
  summaries: ["Jane Doe's email is changing"],
  newestCreatedAt: "2026-08-03T12:00:00+00:00",
  ...over,
});

describe("identity_hold stream", () => {
  it("single-hold copy is summaries[0]; multi-hold copy is the count line", () => {
    const single = buildNeedsAttention({ ingestions: [], syncs: [], existence: {}, totalCounts: { ingestions: 0, syncs: 0, identityHolds: 1 }, identityHolds: [holdGroup()] });
    const item = single.items[0];
    if (item?.variant !== "identity_hold") throw new Error("wrong variant");
    expect(item.copy).toBe("Jane Doe's email is changing");
    const multi = buildNeedsAttention({ ingestions: [], syncs: [], existence: {}, totalCounts: { ingestions: 0, syncs: 0, identityHolds: 1 }, identityHolds: [holdGroup({ summaries: ["a", "b", "c"] })] });
    const m = multi.items[0];
    if (m?.variant !== "identity_hold") throw new Error("wrong variant");
    expect(m.copy).toBe("3 held changes waiting");
  });

  it("sorts by newestCreatedAt among other streams (order derived from fixture timestamps)", () => {
    // one sync at T2, one hold at T3, one sync at T1 → expected order T3,T2,T1
    const out = buildNeedsAttention({
      ingestions: [],
      syncs: [
        { stagedId: "st1", driveFileId: "d1", candidateTitle: "A", stagedModifiedTime: "2026-08-03T02:00:00+00:00" },
        { stagedId: "st2", driveFileId: "d2", candidateTitle: "B", stagedModifiedTime: "2026-08-03T01:00:00+00:00" },
      ],
      existence: {},
      identityHolds: [holdGroup({ newestCreatedAt: "2026-08-03T03:00:00+00:00" })],
      totalCounts: { ingestions: 0, syncs: 2, identityHolds: 1 },
    });
    expect(out.items.map((i) => i.variant)).toEqual(["identity_hold", "first_seen", "first_seen"]);
    expect(out.totalCount).toBe(3);
    expect(out.identityHoldTotal).toBe(1);
  });

  it("defaults are byte-identical when the new keys are omitted (digest regression fence)", () => {
    const args = { ingestions: [], syncs: [], existence: {}, totalCounts: { ingestions: 0, syncs: 0 } };
    expect(buildNeedsAttention(args)).toEqual({ ...buildNeedsAttention(args), identityHoldTotal: 0 });
    expect(buildNeedsAttention(args).items).toEqual([]);
  });

  it("skips a defensive empty-summaries group", () => {
    const out = buildNeedsAttention({ ingestions: [], syncs: [], existence: {}, totalCounts: { ingestions: 0, syncs: 0, identityHolds: 1 }, identityHolds: [holdGroup({ summaries: [] })] });
    expect(out.items).toEqual([]);
  });

  it("equal newestCreatedAt tie-breaks by showId ascending", () => {
    const t = "2026-08-03T05:00:00+00:00";
    const out = buildNeedsAttention({ ingestions: [], syncs: [], existence: {}, totalCounts: { ingestions: 0, syncs: 0, identityHolds: 2 }, identityHolds: [holdGroup({ showId: "zz", slug: "zz", newestCreatedAt: t }), holdGroup({ showId: "aa", slug: "aa", newestCreatedAt: t })] });
    const ids = out.items.map((i) => (i.variant === "identity_hold" ? i.showId : ""));
    expect(ids).toEqual(["aa", "zz"]);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** in `lib/admin/needsAttention.ts`: import type `IdentityHoldGroup` from `@/lib/admin/identityHolds`; `export type NeedsAttentionIdentityHoldInput = IdentityHoldGroup;` add to `BuildNeedsAttentionInput`: `identityHolds?: NeedsAttentionIdentityHoldInput[];` and `totalCounts: { ...; identityHolds?: number }`. New `MergedEntry` arm `{ kind: "identity_hold"; sortKey: string; id: string; group: NeedsAttentionIdentityHoldInput }` pushed as:

```ts
...(input.identityHolds ?? [])
  .filter((g) => g.summaries.length > 0)
  .map((g): MergedEntry => ({ kind: "identity_hold", sortKey: g.newestCreatedAt ?? "", id: g.showId, group: g })),
```

Item mapping (inside the sliced `.map`, before the existence branch):

```ts
if (entry.kind === "identity_hold") {
  const g = entry.group;
  const first = g.summaries[0];
  return {
    variant: "identity_hold",
    key: `hold-show:${g.showId}`,
    showId: g.showId,
    slug: g.slug,
    title: g.title,
    summaries: g.summaries,
    copy: g.summaries.length === 1 && first !== undefined ? first : `${g.summaries.length} held changes waiting`,
    activityAt,
  };
}
```

Totals: `const identityHoldTotal = input.totalCounts.identityHolds ?? 0;` add into `totalCount` sum and return `identityHoldTotal`.

- [ ] **Step 4: Run** full `tests/admin/needsAttention.test.ts` + `tests/notify` digest suite (default-fence) + `tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(admin): identity_hold stream in buildNeedsAttention`

---

### Task 4: `loadNeedsAttention` holds leg

**Files:**

- Modify: `lib/admin/loadNeedsAttention.ts`, `tests/admin/loadNeedsAttention.test.ts` (append)

**Interfaces:**

- Consumes: `loadOpenIdentityHolds` (Task 2), builder inputs (Task 3).
- Produces: `loadNeedsAttention` threads `identityHolds: groups` + `totalCounts.identityHolds: groups.length`; test seam `opts.loadHolds?: typeof loadOpenIdentityHolds`.

- [ ] **Step 1: Failing tests** (append; reuse the file's existing supabase stub):

```ts
it("threads hold groups and total; holds-leg infra_error fails the whole call", async () => {
  const groups = [{ showId: "sH", slug: "sh", title: "H", summaries: ["x", "y"], newestCreatedAt: "2026-08-03T09:00:00+00:00" }];
  const ok = await loadNeedsAttention({ cap: 20, supabase: happyStub(), loadHolds: async () => ({ kind: "ok", groups }) });
  if ("kind" in ok) throw new Error("expected NeedsAttention");
  expect(ok.identityHoldTotal).toBe(1);
  expect(ok.items.some((i) => i.variant === "identity_hold")).toBe(true);

  const bad = await loadNeedsAttention({ cap: 20, supabase: happyStub(), loadHolds: async () => ({ kind: "infra_error", message: "holds down" }) });
  expect(bad).toEqual({ kind: "infra_error", message: expect.stringContaining("holds") });
});
```

_Failure mode: holds fault silently degrading to an empty stream (would violate the loader's all-or-nothing posture, spec §8)._

- [ ] **Step 2: Run — FAIL.** **Step 3: Implement**: add `loadHolds?: typeof loadOpenIdentityHolds` to opts; after the sync-problem block:

```ts
const holdsResult = await (opts.loadHolds ?? loadOpenIdentityHolds)();
if (holdsResult.kind === "infra_error") {
  return { kind: "infra_error", message: `identity holds read failed: ${holdsResult.message}` };
}
```

Thread `identityHolds: holdsResult.groups` and `totalCounts.identityHolds: holdsResult.groups.length` into `buildNeedsAttention`.

- [ ] **Step 4: Run + tsc — PASS.** Confirm the file's invariant-9 source-regex test still passes.
- [ ] **Step 5: Commit** `feat(admin): thread identity holds through loadNeedsAttention`

---

### Task 5: badge count holds leg

**Files:**

- Modify: `lib/admin/needsAttentionCount.ts`, `tests/admin/needsAttentionCount.test.ts` (append), `tests/admin/_metaInfraContract.test.ts` (expand existing row's contract text)

**Interfaces:**

- Consumes: `loadOpenIdentityHolds` (Task 2). Produces: badge count includes `groups.length`; seam `deps.loadHolds`.

- [ ] **Step 1: Failing tests:**

```ts
it("adds shows-with-holds via loadOpenIdentityHolds; holds fault → infra_error even when pending counts succeed", async () => {
  const okCount = await loadNeedsAttentionCount({ supabase: countsStub(2, 1, 0), loadHolds: async () => ({ kind: "ok", groups: [g("sA"), g("sB")] }) });
  expect(okCount).toEqual({ kind: "ok", count: 5 }); // 2+1+0 pending + 2 hold shows
  const bad = await loadNeedsAttentionCount({ supabase: countsStub(2, 1, 0), loadHolds: async () => ({ kind: "infra_error", message: "x" }) });
  expect(bad).toEqual({ kind: "infra_error" });
});
```

(`countsStub`/`g` per the file's existing stub helpers; extend `loadNeedsAttentionCount` opts the same way Task 4 did. NOTE: the helper currently takes no opts object for deps beyond none — mirror `loadNeedsAttention`'s injection shape.) _Failure mode: healthy pending counts masking a holds fault (spec §8)._

- [ ] **Step 2: Run — FAIL.** **Step 3: Implement**: add optional `opts: { supabase?; loadHolds? }` param (keeping the zero-arg call sites valid); after `syncProblemCount`:

```ts
const holds = await (opts.loadHolds ?? loadOpenIdentityHolds)();
if (holds.kind === "infra_error") return { kind: "infra_error" };
return { kind: "ok", count: pendingTotal + syncProblemCount + holds.groups.length };
```

- [ ] **Step 4:** Expand the `loadNeedsAttentionCount` registry row contract text (`tests/admin/_metaInfraContract.test.ts:263-267`) to `"pending_ingestions/pending_syncs head-count throws + construction throw + sync_holds leg (via loadOpenIdentityHolds) infra_error → infra_error"`. Run tests + `tsc` — PASS.
- [ ] **Step 5: Commit** `feat(admin): badge count includes shows with open identity holds`

---

### Task 6: inbox card + `IdentityHoldDisclosure` island

**Files:**

- Create: components/admin/IdentityHoldDisclosure.tsx, tests/components/needsAttentionInboxIdentityHold.test.tsx
- Modify: `components/admin/NeedsAttentionInbox.tsx` (new branch before the final `existing_staged` return)

NOTE (verified): `NeedsAttentionInbox` props are `{ items, overflowCount, now }` (`components/admin/NeedsAttentionInbox.tsx:168`) — `now` is the relative-time anchor; check its exact type at the signature and match it in tests.

**Interfaces:**

- Consumes: item variant (Task 3); `CollapsePanel` (`components/admin/CollapsePanel.tsx:27-39` — REQUIRED `label`); precedent classes from `IgnoredSheetsDisclosure.tsx:60`.
- Produces: island props `{ showId: string; title: string | null; slug: string; count: number; children: ReactNode }`; testids `needs-attention-item-identity-hold-{showId}`, `needs-attention-link-identity-hold-{showId}`, `identity-hold-toggle-{showId}`, panel id `identity-hold-panel-{showId}`; `HOLD_SUMMARIES_RENDER_CAP = 10` exported from the island file.

- [ ] **Step 1: Failing tests** (jsdom; `/** @vitest-environment jsdom */` pragma first line, matching `tests/components/needsAttentionInboxSyncProblem.test.tsx`):

```tsx
/** @vitest-environment jsdom */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

const NOW = new Date("2026-08-03T13:00:00Z");
function holdItem(over: Partial<Extract<NeedsAttentionItem, { variant: "identity_hold" }>> = {}) {
  return {
    variant: "identity_hold" as const, key: "hold-show:sX", showId: "sX", slug: "spring-gala",
    title: "Spring Gala", summaries: ["Jane Doe's email is changing"],
    copy: "Jane Doe's email is changing", activityAt: "2026-08-03T12:00:00+00:00", ...over,
  };
}

describe("identity_hold card", () => {
  it("single hold: summary + link, NO toggle", () => {
    render(<NeedsAttentionInbox items={[holdItem()]} overflowCount={0} now={NOW} />);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(card).getByText("Jane Doe's email is changing")).toBeTruthy();
    expect(within(card).getByTestId("needs-attention-link-identity-hold-sX").getAttribute("href")).toBe("/admin?show=spring-gala");
    expect(within(card).queryByTestId("identity-hold-toggle-sX")).toBeNull();
  });

  it("multi hold: count copy, aria-correct toggle, summaries + link revealed", () => {
    const summaries = ["s one", "s two", "s three"];
    render(<NeedsAttentionInbox items={[holdItem({ summaries, copy: "3 held changes waiting" })]} overflowCount={0} now={NOW} />);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(card).getByText("3 held changes waiting")).toBeTruthy();
    const toggle = within(card).getByTestId("identity-hold-toggle-sX");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("identity-hold-panel-sX");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById("identity-hold-panel-sX");
    if (!panel) throw new Error("panel missing");
    for (const s of summaries) expect(within(panel as HTMLElement).getByText(s)).toBeTruthy();
    // Footer link visible in BOTH states (it sits outside the panel)
    expect(within(card).getByTestId("needs-attention-link-identity-hold-sX")).toBeTruthy();
  });

  it("caps panel lines at 10 with a derived 'and N more' line", () => {
    const summaries = Array.from({ length: 13 }, (_, i) => `summary ${i}`);
    render(<NeedsAttentionInbox items={[holdItem({ summaries, copy: "13 held changes waiting" })]} overflowCount={0} now={NOW} />);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    const panel = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    expect(within(panel).getByText(`and ${summaries.length - 10} more`)).toBeTruthy();
    expect(within(panel).queryByText("summary 10")).toBeNull();
  });

  it("title fallbacks: null → slug visible; EMPTY STRING → accessible names still carry slug", () => {
    render(<NeedsAttentionInbox items={[holdItem({ title: "", summaries: ["a", "b"], copy: "2 held changes waiting" })]} overflowCount={0} now={NOW} />);
    const toggle = screen.getByTestId("identity-hold-toggle-sX");
    expect(toggle.getAttribute("aria-label")).toContain("spring-gala"); // truthy fork: "" is falsy → slug form
  });
});
```

_Failure modes: island rendered for single holds; aria wiring drift; unbounded panel; empty-string title yielding a slug-less accessible name._

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement island** components/admin/IdentityHoldDisclosure.tsx (mirror `IgnoredSheetsDisclosure` — `"use client"`, `useState(false)`, `ChevronRight` rotate, `CollapsePanel`):

```tsx
"use client";
// Multi-hold disclosure for the needs-attention identity_hold card (spec §7).
// Owns ONLY open/closed state; summaries arrive as server-rendered children
// (IgnoredSheetsDisclosure composition, AddAdminDisclosure lineage).
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsePanel } from "@/components/admin/CollapsePanel";

export const HOLD_SUMMARIES_RENDER_CAP = 10;

export function IdentityHoldDisclosure({ showId, title, slug, count, children }: {
  showId: string; title: string | null; slug: string; count: number; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `identity-hold-panel-${showId}`;
  const verb = open ? "Hide" : "Show";
  const ariaLabel = title
    ? `${verb} details for ${count} held changes for ${title} (${slug})`
    : `${verb} details for ${count} held changes for ${slug}`;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        data-testid={`identity-hold-toggle-${showId}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="group flex min-h-tap-min items-center gap-2 rounded-sm text-left text-sm text-text-subtle transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <ChevronRight aria-hidden="true" className={`size-4 shrink-0 transition-transform duration-fast ${open ? "rotate-90" : ""}`} />
        <span>{verb} details</span>
      </button>
      <CollapsePanel open={open} id={panelId} label={title ? `Held changes for ${title} (${slug})` : `Held changes for ${slug}`}>
        {children}
      </CollapsePanel>
    </div>
  );
}
```

Inbox branch (in `ItemCard`, before the `existing_staged` fallthrough; single/multi fork on `item.summaries.length === 1`; reuse the sync-problem card's tile classes and `CardHeader status="warn"`; label `Held change`/`Held changes`; footer `Link` `Review →` with truthy-title aria fork; multi mode renders the island whose children are `item.summaries.slice(0, HOLD_SUMMARIES_RENDER_CAP)` lines plus the `and N more` line when `item.summaries.length > HOLD_SUMMARIES_RENDER_CAP`).

- [ ] **Step 4: Run tests + tsc — PASS.**
- [ ] **Step 5: Commit** `feat(admin): identity-hold inbox card with disclosure island`

---

### Task 7: summary card chip + Dashboard/page threading

**Files:**

- Modify: `components/admin/NeedsAttentionSummaryCard.tsx` (prop + chip after the sync-problems chip, `NeedsAttentionSummaryCard.tsx:54-69` pattern — chips render only when > 0), `components/admin/Dashboard.tsx:738-744` (thread `identityHoldTotal={result.needsAttention.identityHoldTotal}`), Dashboard tooltip (`Dashboard.tsx:769-772`) and page tooltip (`app/admin/needs-attention/page.tsx:64-67`) copy.
- Test: extend `tests/components/admin/NeedsAttentionSummaryCard.test.tsx` (companion: `tests/components/needsAttentionSummaryCardSyncProblem.test.tsx` is the chip-test pattern to mirror).

- [ ] **Step 1: Failing test:** chip `summary-chip-identity-holds` renders `2 held` (fixture total 2) with `aria-label` `2 held identity changes`; absent at 0; holds-only state (`identityHoldTotal: 3`, others 0) yields a non-empty breakdown. _Failure mode: G2 — holds-only mobile state showing a bare total with empty breakdown._
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** chip:

```tsx
{identityHoldTotal > 0 && (
  <span data-testid="summary-chip-identity-holds" className="tabular-nums" aria-label={`${identityHoldTotal} held identity changes`}>
    {identityHoldTotal} held
  </span>
)}
```

Tooltip copy — dashboard (replace the sentence at `Dashboard.tsx:769-772`): `Sheets and changes waiting on you: new shows to review, staged edits to approve, held crew identity changes, or sheets that couldn't be processed.` Page tooltip (`page.tsx:64-67`): `Everything waiting on a decision from you: sheets we could not auto-apply, staged changes to review, and held crew identity changes. Items leave this list as soon as you resolve them.`

- [ ] **Step 4: Run + tsc — PASS.** **Step 5: Commit** `feat(admin): summary-card held-changes chip + tooltip copy`

---

### Task 8: digest transport, cap, sourceTotals

**Files:**

- Modify: `lib/notify/digest.ts` (holds query + adapter + `identityHolds` + `cap` + `holdShows` + `itemCopy`/`slugFor`/`groupTitleFor` arms + `no_send` literal at `digest.ts:127`), `lib/notify/runNotify.ts:457` (literal), digest tests (`tests/notify/` — extend the digest-model suite; fixtures pinning `sourceTotals` gain `holdShows`).

**Interfaces:**

- Consumes: `groupHoldRows`, `IdentityHoldRow` (Task 1); builder inputs (Task 3); the digest's `asIso` (`lib/notify/digest.ts:76-78`).
- Produces: `DigestModel.sourceTotals` gains `holdShows: number`.

- [ ] **Step 1: Failing tests** (extend the digest suite using its existing sql-stub dep idiom — the stub returns rows per-query in call order; add a fourth stubbed result for the holds query):
  1. **Representation compatibility (spec §9.12):** holds row with `created_at` as a `Date` (postgres.js shape) between two pending items' timestamps → merged model order places the hold between them (fails if the adapter passed a non-ISO string or the raw Date).
  2. **Uncapped (spec §9.13):** 21 pending syncs + 1 hold older than all → hold present in `shows` groups; `sourceTotals.holdShows === 1`; holds-only digest (`ingestions=syncs=[]`, one hold) is NOT `no_send`.
  3. **Literals:** invalid-recipient `no_send` returns `sourceTotals.holdShows === 0`; `runNotify` synthesized model carries `holdShows: 0` (assert via its existing monitor-only test).
  4. **Selective fault (spec §9.14):** ingestion/sync/shows stubs succeed, holds stub rejects → `buildDigestModel` rejects.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** in `buildDigestModel` after the syncs query:

```ts
const holdRows = await sql<{
  id: string; show_id: string; entity_key: string; held_value: unknown;
  proposed_value: IdentityHoldRow["proposed_value"]; base_modified_time: Date | string | null;
  created_at: Date | string; slug: string; title: string | null;
}>`
  select sh.id, sh.show_id, sh.entity_key, sh.held_value, sh.proposed_value,
         sh.base_modified_time, sh.created_at, s.slug, s.title
  from sync_holds sh join shows s on s.id = sh.show_id
  where sh.kind = 'mi11_pending' and s.archived = false
  order by sh.created_at desc, sh.id asc`;
const identityHolds = groupHoldRows(
  holdRows.map((r) => ({
    id: r.id, show_id: r.show_id, slug: r.slug, title: r.title ?? null,
    entity_key: r.entity_key, held_value: r.held_value, proposed_value: r.proposed_value,
    base_modified_time: r.base_modified_time == null ? null : asIso(r.base_modified_time),
    created_at: asIso(r.created_at),
  })),
);
```

Thread `identityHolds`, `totalCounts: { ..., identityHolds: identityHolds.length }`, `cap: ingestions.length + syncs.length + identityHolds.length`, `sourceTotals: { ..., holdShows: identityHolds.length }`. Helper arms: `groupTitleFor` — before the final `return item.title;` add `if (item.variant === "identity_hold") return item.title;` (explicit, mirroring the defensive sync_problem arm); `itemCopy` — `if (item.variant === "identity_hold") return item.copy;`; `slugFor` — `if (item.variant === "identity_hold") return item.slug;`. Update the two zero literals (`digest.ts:127`, `runNotify.ts:457`) with `holdShows: 0`.

- [ ] **Step 3b: SQL source pin.** Add to the digest test file a source-regex assertion that `lib/notify/digest.ts` contains `kind = 'mi11_pending'`, `s.archived = false`, and `order by sh.created_at desc, sh.id asc` — the digest-side halves of the R6/G7 fences.
- [ ] **Step 4: Run digest suite + tsc — PASS.** **Step 5: Commit** `feat: digest includes open identity holds (uncapped model, holdShows total)`

---

### Task 9: help copy surfaces

**Files:**

- Modify: `app/help/admin/dashboard/page.mdx:35-43` (inventory list gains a held-changes bullet) and `page.mdx:51-53` (live-change description mentions holds clearing on approve/reject), `app/help/admin/review-queues/page.mdx:5-12` + `page.mdx:50-60` (overview + live-change guidance), `app/help/daily-rhythm/page.mdx:12-14` (inbox description), `app/help/admin/settings/page.mdx:33-38` (digest description mentions held identity changes).

- [ ] **Step 1:** Exact edits (each in the file's existing voice; no em-dashes):
  1. `app/help/admin/dashboard/page.mdx:37` — change "Three kinds of cards show up here:" to "Four kinds of cards show up here:" and append a fourth bullet: `- **Held identity change.** A crew member's identity change (usually an email) is waiting for your Approve or Reject. The card names the person for a single change, or shows a count you can expand when several are waiting; tap **Review** to open the show's Sheet changes feed and decide there.`
  2. `app/help/admin/dashboard/page.mdx:51-53` ("Changes and review" paragraph) — after "waits for **Approve** or **Reject** in the show's Sheet changes feed", insert: `That held change also appears as a card in the **Needs attention** inbox, so you can find it without opening the show first.`
  3. `app/help/admin/review-queues/page.mdx:7-10` — add a third table row: `| **Held identity changes** | A crew member's identity change (usually an email) held for your Approve or Reject. It waits in the show's **Sheet changes** feed and also appears as a card in the **Needs attention** inbox. |`
  4. `app/help/admin/review-queues/page.mdx:57-59` (the identity-change bullet) — append: `It also appears in the **Needs attention** inbox until you decide.`
  5. `app/help/daily-rhythm/page.mdx:13` (the Needs attention inbox bullet) — append: `Held crew identity changes appear here too, until you approve or reject them.`
  6. `app/help/admin/settings/page.mdx:35` (Daily review digest bullet) — append: `It also lists crew identity changes that are held for your review.`
- [ ] **Step 2:** `grep -n "held" <each file>` to confirm each landed; run any help-content suite that matches (`ls tests | grep -i help`), else note the skip in the commit body.
- [ ] **Step 3: Commit** `docs(admin): help + tooltip copy mentions held identity changes`

---

### Task 10: transition-audit task

**Files:**

- Create: tests/components/identityHoldTransitionAudit.test.tsx

Spec Transition Inventory (verbatim contract under test): states **single / multi-collapsed / multi-expanded**; ONLY animated pair = CollapsePanel height-morph (collapsed↔expanded); every other pair instant; expansion persistence across `router.refresh()` UNRATIFIED (both outcomes in-contract); compound (a) summaries change while expanded; (b) group clears while expanded → card unmounts, no exit animation; (c) toggle mid-refresh.

- [ ] **Step 1: Write the audit test:** (1) source-level assertions — IdentityHoldDisclosure.tsx and the inbox branch contain NO `AnimatePresence`, NO `motion.` import, and exactly one `CollapsePanel` usage (read the file with `fs.readFileSync`, assert on content — this pins "instant everywhere else" structurally); (2) behavioral — rerender single→multi and multi→single (props change, same key): no throw, correct mode elements mount/unmount; toggle open, then rerender with a DIFFERENT summaries array (compound a): panel children update; rerender with `summaries: ["only"]` while open (multi-expanded→single): island gone, summary line rendered. _Failure modes: an exit animation sneaking in; mode fork crashing on live data changes; compound (a) rendering stale summaries._
- [ ] **Step 2: Run — FAIL** (file assertions first run against not-yet-final source are fine; behavioral parts fail until Task 6 branch handles rerenders — order this task AFTER Task 6; if all passes immediately, verify each assertion can fail by temporarily inverting one locally, then restore).
- [ ] **Step 3: Commit** `test(admin): identity-hold transition audit (inventory pins)`

---

### Task 11: e2e — seeded holds across page, badge, chip, clear-through

**Files:**

- Create: tests/e2e/needs-attention-holds.spec.ts (model on `tests/e2e/needs-attention-page.spec.ts` — same server, seeding, and cleanup idioms)

**e2e harness readiness (mandatory checklist):** server boot = the suite's existing Playwright `webServer` on `E2E_PORT` (`playwright.config.ts:34-44`), no new server; readiness gate = seeded-card visibility assertion (`getByTestId("needs-attention-item-identity-hold-…")` auto-wait), never `networkidle`; detach safety = re-query locators after `page.reload()` and after the approve action (both re-render the list), no cached `locator.evaluate` handles across navigation.

- [ ] **Step 1: Write the spec:** prefix-namespace `e2e-needs-attention-holds-`; seed two shows (`shows` insert, archived=false) + `sync_holds` rows: show 1 one `mi11_pending` email_change (proposed_value `{"disposition":"email_change","email":"new@x.com"}`, held_value `{"email":"old@x.com"}`, `base_modified_time` set — the kind-shape CHECK at `supabase/migrations/20260608000000_sync_holds.sql:30-37` requires both), show 2 three holds (distinct `entity_key`, distinct domains/keys under the uniq constraint). Pre-clean by prefix; cleanup in `finally`. Assert:
  1. `/admin/needs-attention` renders both cards; single-hold card copy contains the seeded entity name (scoped `within` the card testid — the per-show feed is NOT mounted here, but scope anyway per anti-tautology); multi card shows `3 held changes waiting`.
  2. Badge (`admin-nav` attention badge testid, per `needs-attention-page.spec.ts` badge assertion) equals seeded expectation: 2 hold-shows + 0 pending.
  3. At 390px width the summary card chip `summary-chip-identity-holds` shows `2 held`.
  4. Expand multi card: three seeded summaries visible inside `identity-hold-panel-…`; **probe (spec G3):** trigger a data refresh (insert a pending row server-side, `router.refresh` via the page's existing refresh affordance or `page.reload()`), record whether the panel stayed open in a comment-visible assertion accepting EITHER (`expect([true, false]).toContain(panelOpen)`) plus a console annotation of the observed value — the pinning assertion is mode correctness, not persistence.
  5. Single-hold card link navigates to `/admin?show={slug}` and `mi11-approve` / `mi11-reject` (`components/admin/Mi11GateActions.tsx:70`) are visible.
  6. Exclusions (spec §9.7/§9.8): seed a THIRD show with `archived=true` plus one `mi11_pending` hold, and (on show 1) one `undo_override` row. Assert neither adds a card and the badge still reads the value from step 2 (2 hold-shows).
  7. Clear-through: click `mi11-approve` (confirm per that surface's existing flow in `admin-changes-feed` specs), return to `/admin/needs-attention`, reload → single-hold card GONE, badge decremented to 1.
- [ ] **Step 2: Run** `pnpm exec playwright test tests/e2e/needs-attention-holds.spec.ts --project=desktop-chromium` — iterate to green.
- [ ] **Step 3: Commit** `test(admin): e2e seeded identity-holds rollup (cards, badge, chip, clear-through)`

---

### Task 12: closeout

- [ ] **Step 1: Full local suite** `pnpm vitest run` + `pnpm exec tsc --noEmit` + `pnpm exec playwright test tests/e2e/needs-attention-holds.spec.ts tests/e2e/needs-attention-page.spec.ts --project=desktop-chromium` — all green.
- [ ] **Step 2: BACKLOG graduation** (invariant 12): rewrite the `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` entry per the reconciliation-line idiom (BACKLOG.md line 7): shipped by this branch, spec path, one-line outcome; no in-flight marker survives the merge.
- [ ] **Step 3: Impeccable dual gate** (invariant 8 — UI surface): run `/impeccable critique` AND `/impeccable audit` on the affected diff with the v3 setup gates (context.mjs PRODUCT.md + DESIGN.md, register read); fix or defer P0/P1 via DEFERRED.md; then fill the marker line below with real values.
- [ ] **Step 4: Whole-diff cross-model review** to APPROVE (fresh-eyes brief; REVIEWER ONLY; scoped file lists per the split-tight-scope default).
- [ ] **Step 5: Push, PR, real CI green, `gh pr merge --merge`,** fast-forward main, verify `git rev-list --left-right --count main...origin/main` → `0  0`.

## 12. Closeout marker

impeccable-gate: PENDING — filled at Task 12 Step 3 (grammar: `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=recorded`)

## Meta-test inventory (declared)

- EXTENDS: `tests/admin/_metaInfraContract.test.ts` (new `loadOpenIdentityHolds` row; expanded `loadNeedsAttentionCount` contract), `tests/admin/_metaBoundedReads.test.ts` (lib/admin/identityHolds.ts in `READ_MODULES`; `sync_holds` in `UNBOUNDED_TABLES`).
- CREATES: none.
- Declared N/A: advisory-lock topology (no `pg_advisory*` touched), sentinel-hiding, admin-alert catalog, `AUDITABLE_MUTATIONS` (no mutation surfaces), DML lockdown, schema manifest/validation parity (no migrations). Layout-dimensions task N/A (spec §7 Dimensional Invariants: none introduced).
