# Needs-Attention Holds Rollup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface open MI-11 identity holds (`sync_holds`, `kind='mi11_pending'`) as a fourth needs-attention stream across the page, dashboard inbox, AdminNav badge, mobile summary card, and digest email.

**Architecture:** One pure grouping core + one service-role PostgREST reader (new file lib/admin/identityHolds.ts) feed both admin helpers; the digest reuses the pure core over its own `sql` transport with `asIso` normalization. The builder gains an `identity_hold` variant; the inbox gains a card with a client-island disclosure. No DB changes, no new routes, no mutation surfaces.

**Tech Stack:** Next.js 16 server components, supabase-js (service-role), postgres.js (digest), vitest, Playwright.

**Spec (canonical):** `docs/superpowers/specs/2026-08-03-needs-attention-holds-rollup-design.md` — §1.1 R1–R8 are owner-ratified; §1.2 records NINE completed adversarial rounds ending in a round-10 APPROVE (2026-08-03). The spec wins on any conflict (AGENTS.md invariant 7).

## Global Constraints

- Worktree: `/Users/ericweiss/FX-worktrees/needs-attention-holds-rollup`, branch `feat/needs-attention-holds-rollup`. All commands run there.
- TDD per task (invariant 1): failing test → minimal implementation → passing test → commit (`--no-verify` per ship pipeline).
- Runner is **vitest** (`pnpm vitest run <file>`); new test files under `tests/**` auto-match `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) — no vitest config edits. Playwright DOES need a config edit (Task 10 registers the new spec filename in the `desktop-chromium` allowlist at `playwright.config.ts:77-80` — both projects use explicit filename allowlists, so an unregistered spec collects ZERO tests).
- Invariant 9: every Supabase await destructures `{ data, error }`; faults → typed `{ kind: "infra_error" }`.
- Invariants 2/10: N/A — reads only, no advisory-locked writes, no new mutation surfaces (spec D7).
- Copy rules: no em-dashes in user-visible strings; no raw codes (invariant 5); per-hold copy ONLY via `shapeHoldEntry` (spec R8); `tabular-nums` on the two new numeric lines (spec R5-J2).
- `HOLDS_ROW_CAP = 200` and `HOLD_SUMMARIES_RENDER_CAP = 10` are BOTH defined once in lib/admin/identityHolds.ts — a SERVER-side module (Task 2 appends the service-role reader, whose factory transitively imports `next/headers` via `lib/supabase/server.ts:12-14`, so the module is NOT client-importable; plan-R6 T3). That is fine by construction: ONLY server code consumes the caps — the inbox slices `summaries` and renders the `and N more` line server-side, and the island receives pre-sliced children without ever importing the module. Never define either cap in the island (plan-R1 F1) and never import the module from client code.
- Strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); run `pnpm exec tsc --noEmit` before each commit. Every task whose type changes touch existing typed literals lists those companion test files in its **Files** block — missing companions are one-round findings (plan-R1 F6).
- UI files touched → invariant-8 impeccable dual gate at closeout (Task 11).

## File Structure

- Create: lib/admin/identityHolds.ts, components/admin/IdentityHoldDisclosure.tsx, tests/admin/identityHolds.test.ts, tests/admin/loadOpenIdentityHolds.test.ts, tests/components/needsAttentionInboxIdentityHold.test.tsx, tests/components/identityHoldTransitionAudit.test.tsx, tests/help/heldChangesCopy.test.ts, tests/e2e/needs-attention-holds.spec.ts.
- Modify: `lib/admin/needsAttention.ts`, `lib/admin/loadNeedsAttention.ts`, `lib/admin/needsAttentionCount.ts`, `components/admin/NeedsAttentionInbox.tsx`, `components/admin/NeedsAttentionSummaryCard.tsx`, `components/admin/Dashboard.tsx`, `app/admin/needs-attention/page.tsx`, `lib/notify/digest.ts`, `lib/notify/runNotify.ts`, `playwright.config.ts`, FIVE help mdx files (dashboard, review-queues, daily-rhythm, settings, tour), `tests/admin/_metaInfraContract.test.ts`, `tests/admin/_metaBoundedReads.test.ts`, and the companion typed-literal test files: `tests/components/needsAttentionSummaryCardSyncProblem.test.tsx`, `tests/app/admin/needsAttentionPage.test.tsx`, `tests/components/admin/Dashboard.test.tsx`, plus digest fixtures pinning `sourceTotals`. CI: `.github/workflows/admin-layout-e2e.yml` (Task 10). Closeout: `BACKLOG.md` + `BACKLOG-archive.md` (graduation MOVES the entry per `BACKLOG.md:5`; `tests/docs/_metaDeferralLedgerGraduation.test.ts:425-448` rejects terminal entries left in the open queue).

---

### Task 1: `groupHoldRows` pure core + shared caps

**Files:**

- Create: lib/admin/identityHolds.ts (pure part), tests/admin/identityHolds.test.ts

**Interfaces:**

- Consumes: `shapeHoldEntry`, `HoldRow` from `lib/sync/feed/shapeHoldEntry.ts:11-18` and `shapeHoldEntry.ts:90`.
- Produces (later tasks rely on these EXACT names): `IdentityHoldRow`, `IdentityHoldGroup { showId: string; slug: string; title: string | null; summaries: string[]; newestCreatedAt: string }`, `groupHoldRows(rows: IdentityHoldRow[]): IdentityHoldGroup[]`, `HOLDS_ROW_CAP = 200`, `HOLD_SUMMARIES_RENDER_CAP = 10` (BOTH caps live here — server-safe module, plan-R1 F1).

- [ ] **Step 1: Write the failing test** — tests/admin/identityHolds.test.ts:

```ts
import { describe, expect, it } from "vitest";
import {
  groupHoldRows,
  HOLD_SUMMARIES_RENDER_CAP,
  HOLDS_ROW_CAP,
  type IdentityHoldRow,
} from "@/lib/admin/identityHolds";
import { shapeHoldEntry } from "@/lib/sync/feed/shapeHoldEntry";

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
    // R8 pin (plan-R2 P7): summaries EQUAL the shared generator's output for the
    // same row (hand-authored copy cannot match shapeHoldEntry byte-for-byte),
    // and the email_change copy carries the old AND new addresses.
    const firstRow = rows[0];
    if (!firstRow) throw new Error("fixture");
    expect(b.summaries[0]).toBe(shapeHoldEntry(firstRow).summary);
    expect(b.summaries[0]).toContain("jane@old.com");
    expect(b.summaries[0]).toContain("jane@new.com");
    expect(b.summaries[1]).toContain("Ann Poe");
  });

  it("single-row group; empty input; caps exported here (server-safe module)", () => {
    expect(groupHoldRows([])).toEqual([]);
    const g = groupHoldRows([row({ id: "h9", show_id: "sC" })]);
    expect(g).toHaveLength(1);
    expect(g[0]?.summaries).toHaveLength(1);
    expect(HOLDS_ROW_CAP).toBe(200);
    expect(HOLD_SUMMARIES_RENDER_CAP).toBe(10);
  });
});
```

_Failure modes: grouping that re-sorts (losing newest-first); summaries authored instead of generated (entity name absent); newestCreatedAt from the wrong row; a cap constant defined in the client island (unreadable from the server inbox, plan-R1 F1 — the caps live in this server module and the island never imports it, plan-R6 T3)._

- [ ] **Step 2: Run** `pnpm vitest run tests/admin/identityHolds.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement** the pure part of lib/admin/identityHolds.ts:

```ts
// lib/admin/identityHolds.ts: cross-show open-holds read for the needs-attention
// rollup (spec 2026-08-03 section 4). Pure grouping core shared by the PostgREST
// reader below and the digest's raw-SQL transport (lib/notify/digest.ts), so page,
// inbox, badge, and email share one grouping semantics. Both render caps live here
// (NOT in the client island): the server inbox needs them too, and server code
// cannot read values from a "use client" module.
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
export const HOLD_SUMMARIES_RENDER_CAP = 10;

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

- [ ] **Step 4: Run** the test + `pnpm exec tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(admin): groupHoldRows pure core + shared caps for identity-holds rollup`

---

### Task 2: `loadOpenIdentityHolds` reader + registries

**Files:**

- Modify: lib/admin/identityHolds.ts (append reader), `tests/admin/_metaInfraContract.test.ts`, `tests/admin/_metaBoundedReads.test.ts`
- Create: tests/admin/loadOpenIdentityHolds.test.ts

**Interfaces:**

- Consumes: `createSupabaseServiceRoleClient` (`lib/supabase/server.ts:79`), `log` (`@/lib/log`), Task 1 exports.
- Produces: `loadOpenIdentityHolds(deps?: { client?: HoldsClient }): Promise<{ kind: "ok"; groups: IdentityHoldGroup[] } | { kind: "infra_error"; message: string }>`.

- [ ] **Step 1: Write the failing test** — tests/admin/loadOpenIdentityHolds.test.ts. Construction-fault injection follows the loadNeedsAttention idiom EXACTLY (`tests/admin/loadNeedsAttention.test.ts:125-138`): a `vi.hoisted` flag + `vi.mock("@/lib/supabase/server", ...)` whose `createSupabaseServiceRoleClient` throws when toggled (plan-R1 F8). Spy hygiene: `beforeEach` clears mocks and re-creates the `log.warn` spy, never per-test (plan-R1 F9).

```ts
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
    select: () => chain, eq: () => chain, order: () => chain,
    limit: (n: number) => { seenLimits.push(n); return Promise.resolve(result); },
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
    const chainThrow = { select: () => { throw new Error("net"); } };
    const thrown = await loadOpenIdentityHolds({ client: { from: () => chainThrow } as never });
    expect(thrown.kind).toBe("infra_error");
    // REAL construction-fault injection (loadNeedsAttention.test.ts:125-138 idiom):
    serverMock.throwOnConstruct = true;
    const constructed = await loadOpenIdentityHolds(); // no injected client
    expect(constructed).toEqual({ kind: "infra_error", message: expect.stringContaining("construction") });
  });

  it("cap boundary: exact-cap silent; over-cap warns, drops sentinel, keeps the id-asc capped MEMBERSHIP", async () => {
    const exact = Array.from({ length: HOLDS_ROW_CAP }, (_, i) => holdRow(i, `s${i}`, { slug: `s${i}` }));
    const okRes = await loadOpenIdentityHolds({ client: clientReturning({ data: exact, error: null }) });
    expect(okRes.kind).toBe("ok");
    expect(warnSpy).not.toHaveBeenCalled();

    // Over-cap with a TIE at the boundary: the last two rows share one timestamp.
    // The DB returns them id-asc within the tie, so the sentinel-drop must keep
    // idOf(CAP-1)'s show and exclude idOf(CAP)'s (plan-R1 F11: membership, not length).
    const tieTs = "2026-08-01T00:00:00+00:00";
    const over = [
      ...Array.from({ length: HOLDS_ROW_CAP - 1 }, (_, i) => holdRow(i, `s${i}`, { slug: `s${i}` })),
      holdRow(HOLDS_ROW_CAP - 1, "sTieKept", { slug: "s-tie-kept" }, tieTs),
      holdRow(HOLDS_ROW_CAP, "sTieDropped", { slug: "s-tie-dropped" }, tieTs),
    ];
    const overRes = await loadOpenIdentityHolds({ client: clientReturning({ data: over, error: null }) });
    expect(overRes.kind).toBe("ok");
    if (overRes.kind !== "ok") return;
    expect(overRes.groups).toHaveLength(HOLDS_ROW_CAP);
    const slugs = overRes.groups.map((g) => g.slug);
    expect(slugs).toContain("s-tie-kept");
    expect(slugs).not.toContain("s-tie-dropped");
    expect(warnSpy).toHaveBeenCalledWith("sync_holds row cap exceeded", expect.objectContaining({ source: "admin.loadOpenIdentityHolds" }));
    // Sentinel-limit pin (plan-R5 S3): a .limit(HOLDS_ROW_CAP) mutant would kill
    // the sentinel and the overflow warning while every other assertion stays green.
    expect(seenLimits.every((n) => n === HOLDS_ROW_CAP + 1)).toBe(true);
  });
});
```

_Failure modes: embed shape drift; silent slug-less rows; construction throw escaping the typed contract (genuinely injected); the cap drop excluding the WRONG tied row; spy bleed between tests._

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** (append to lib/admin/identityHolds.ts): injectable service-role client; query `from("sync_holds").select("id, show_id, entity_key, held_value, proposed_value, base_modified_time, created_at, shows!inner(slug, title)").eq("kind", "mi11_pending").eq("shows.archived", false).order("created_at", { ascending: false }).order("id", { ascending: true }).limit(HOLDS_ROW_CAP + 1)`; construction throw / returned error / thrown error each → `{ kind: "infra_error", message }`; over-cap → warn + `rows.slice(0, HOLDS_ROW_CAP)`; embed flatten (object/array; slug-less skip + warn); `groupHoldRows(flat)`.
- [ ] **Step 3b: Source pin (lockstep fence).** Source-regex test in the same file (idiom: the invariant-9 regex test in `tests/admin/loadNeedsAttention.test.ts`): module source contains `.eq("kind", "mi11_pending")`, `.eq("shows.archived", false)`, `.order("created_at", { ascending: false })`, `.order("id", { ascending: true })`, AND `.limit(HOLDS_ROW_CAP + 1)` (the bounded-reads guard accepts any limit expression, `tests/admin/_metaBoundedReads.test.ts:94-98`; plan-R5 S3). _Catches: R6 archived filter or G7 order dropped in a refactor — mocked clients cannot see query filters._
- [ ] **Step 4: Registries.** `tests/admin/_metaInfraContract.test.ts` — add next to the `loadNeedsAttentionCount` row (`_metaInfraContract.test.ts:263-267`):

```ts
{
  helper: "loadOpenIdentityHolds",
  path: "lib/admin/identityHolds.ts",
  contract:
    "sync_holds service-role read (kind='mi11_pending', shows!inner archived=false); construction throw + query throw + returned {error} map to { kind: 'infra_error' }",
},
```

`tests/admin/_metaBoundedReads.test.ts`: add the module path lib/admin/identityHolds.ts to `READ_MODULES` (`_metaBoundedReads.test.ts:30`) and the table name sync_holds to `UNBOUNDED_TABLES` (`_metaBoundedReads.test.ts:58`).

- [ ] **Step 5: Run** new tests + both meta tests + `tsc --noEmit` — PASS.
- [ ] **Step 6: Commit** `feat(admin): loadOpenIdentityHolds service-role reader + registry rows`

---

### Task 3: builder `identity_hold` variant

**Files:**

- Modify: `lib/admin/needsAttention.ts`, `tests/admin/needsAttention.test.ts` (append cases)
- Companion typed-literal updates (REQUIRED same commit, plan-R1 F6): `tests/app/admin/needsAttentionPage.test.tsx:71-98`, `tests/components/admin/Dashboard.test.tsx:21-23` + `Dashboard.test.tsx:258-285` — `NeedsAttention` literals gain `identityHoldTotal: 0`.

**Interfaces:**

- Consumes: `IdentityHoldGroup` (Task 1).
- Produces: `NeedsAttentionIdentityHoldInput = IdentityHoldGroup` re-export; item variant `{ variant: "identity_hold"; key: \`hold-show:${showId}\`; showId; slug; title; summaries; copy; activityAt }`; `BuildNeedsAttentionInput.identityHolds?`; `totalCounts.identityHolds?`; output `identityHoldTotal: number`. Multi-hold copy: `` `${summaries.length} held changes waiting` ``.

- [ ] **Step 1: Failing tests** (append to `tests/admin/needsAttention.test.ts`):

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

  it("sorts by newestCreatedAt among other streams, asserted BY KEY (fixture-timestamp-derived)", () => {
    // hold T3 > sync st1 T2 > sync st2 T1. Keys distinguish the two first_seen
    // items, so a T2/T1 swap FAILS (plan-R1 F10; variant-only assertions cannot).
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
    expect(out.items.map((i) => i.key)).toEqual(["hold-show:sX", "sync:st1", "sync:st2"]);
    expect(out.totalCount).toBe(3);
    expect(out.identityHoldTotal).toBe(1);
  });

  it("over-cap arithmetic: stream total above rendered cards keeps totals honest (spec §9.2)", () => {
    const out = buildNeedsAttention({
      ingestions: [], syncs: [], existence: {},
      identityHolds: [
        holdGroup({ showId: "s1", slug: "s1", newestCreatedAt: "2026-08-03T05:00:00+00:00" }),
        holdGroup({ showId: "s2", slug: "s2", newestCreatedAt: "2026-08-03T04:00:00+00:00" }),
      ],
      totalCounts: { ingestions: 0, syncs: 0, identityHolds: 2 },
      cap: 1,
    });
    expect(out.items).toHaveLength(1);
    expect(out.renderedCount).toBe(1);
    expect(out.identityHoldTotal).toBe(2);
    expect(out.totalCount).toBe(2);
    expect(out.overflowCount).toBe(1);
  });

  it("omitted new keys: additive identityHoldTotal 0, everything else the pre-change shape (digest regression fence)", () => {
    const args = { ingestions: [], syncs: [], existence: {}, totalCounts: { ingestions: 0, syncs: 0 } };
    // Expected shape built by hand, NEVER a second call to the same function
    // (self-comparison is tautological).
    expect(buildNeedsAttention(args)).toEqual({
      items: [], renderedCount: 0, totalCount: 0, overflowCount: 0,
      ingestionTotal: 0, syncTotal: 0, syncProblemTotal: 0, identityHoldTotal: 0,
    });
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
- [ ] **Step 3: Implement** per spec §5: type re-export; optional inputs defaulting `[]`/`0`; merged arm `{ kind: "identity_hold", sortKey: g.newestCreatedAt ?? "", id: g.showId, group: g }` filtered on `summaries.length > 0`; item mapping with the copy fork (`const first = g.summaries[0]; ... summaries.length === 1 && first !== undefined ? first : \`${g.summaries.length} held changes waiting\``); `identityHoldTotal` in output + `totalCount` sum.
- [ ] **Step 4:** Update the companion typed literals; run `tests/admin/needsAttention.test.ts`, both companion files, the digest suite, `tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(admin): identity_hold stream in buildNeedsAttention`

---

### Task 4: `loadNeedsAttention` holds leg

**Files:**

- Modify: `lib/admin/loadNeedsAttention.ts`, `tests/admin/loadNeedsAttention.test.ts` (append)

- [ ] **Step 1: Failing tests** (append; use the file's REAL `makeClient` helper, `tests/admin/loadNeedsAttention.test.ts:29-123` — there is no `happyStub`; `makeClient({})` yields empty/zero streams, all these cases need):

```ts
it("threads hold groups and total; holds-leg infra_error fails the whole call", async () => {
  const groups = [{ showId: "sH", slug: "sh", title: "H", summaries: ["x", "y"], newestCreatedAt: "2026-08-03T09:00:00+00:00" }];
  const ok = await loadNeedsAttention({ cap: 20, supabase: makeClient({}).client, loadHolds: async () => ({ kind: "ok" as const, groups }) });
  if ("kind" in ok) throw new Error("expected NeedsAttention");
  expect(ok.identityHoldTotal).toBe(1);
  expect(ok.items.some((i) => i.variant === "identity_hold")).toBe(true);

  const bad = await loadNeedsAttention({ cap: 20, supabase: makeClient({}).client, loadHolds: async () => ({ kind: "infra_error" as const, message: "holds down" }) });
  expect(bad).toEqual({ kind: "infra_error", message: expect.stringContaining("holds") });
});
```

_Failure mode: a holds fault silently degrading to an empty stream (violates the loader's all-or-nothing posture, spec §8)._

- [ ] **Step 2: Run — FAIL.** **Step 3: Implement:** `loadHolds?: typeof loadOpenIdentityHolds` opt; call after the sync-problem block; `infra_error` → `{ kind: "infra_error", message: \`identity holds read failed: ${...}\` }`; thread groups + `totalCounts.identityHolds`.
- [ ] **Step 4: Fix the default-path companions (plan-R2 P3).** The holds reader now runs by default inside `loadNeedsAttention`; every existing success-path suite stubbing `createSupabaseServiceRoleClient` as a bare `vi.fn()` (returns undefined) collapses to `infra_error`. Update those server mocks to return an empty-holds chainable client (`data: [], error: null`) in ALL EIGHT affected suites (plan-R4 sweep — grep-driven per the reconciliation-sweep rule; command and 2026-08-03 output below): `tests/admin/loadNeedsAttention.test.ts:127`, `tests/components/admin/Dashboard.test.tsx:25-31` + `Dashboard.test.tsx:102`, `tests/admin/fetchDashboardData.test.ts:238`, `tests/admin/fetchDashboardData-archived.test.ts:132-149`, `tests/components/admin/Dashboard-archived.test.tsx:84-104` (all five Dashboard-path files reach the real loader call at `components/admin/Dashboard.tsx:439-446`), AND `tests/admin/_metaInfraContract.test.ts:140-145` (its shared harness mock — the suite executes both default loader paths at `_metaInfraContract.test.ts:713-778`; plan-R6 T1), plus the two count suites handled in Task 5. Completeness proof, rerun before committing:

```bash
grep -rln "createSupabaseServiceRoleClient" tests/ | xargs grep -l "loadNeedsAttention\|fetchDashboardData\|Dashboard\|needsAttentionCount"
# 2026-08-03 output: 11 files. EIGHT affected: the five Dashboard-path files above,
# the two Task 5 count suites, and tests/admin/_metaInfraContract.test.ts — it
# EXECUTES loadNeedsAttention({cap: 20}) and loadNeedsAttentionCount directly
# (_metaInfraContract.test.ts:709-780; plan-R5 S2), so its harness mock also needs
# the empty-holds service-role client. THREE exonerated: bellFeed.test.ts
# (comment-only mention), show-lifecycle-actions.test.ts and
# adminOutcomeBehavior.test.ts (never reach the loaders). AT TASK-4 EXECUTION TIME
# the command returns a 12th hit: tests/admin/loadOpenIdentityHolds.test.ts,
# created by Task 2 — exonerated by construction (this feature's own suite:
# injected client everywhere except the deliberate construction-fault case;
# plan-R7 U3). Expected count when rerun here: 12.
```

Run those suites + this file's invariant-9 source-regex test + tsc — PASS.
- [ ] **Step 5: Commit** `feat(admin): thread identity holds through loadNeedsAttention`

---

### Task 5: badge count holds leg

**Files:**

- Modify: `lib/admin/needsAttentionCount.ts`, `tests/admin/needsAttentionCount.test.ts` (append), `tests/admin/_metaInfraContract.test.ts` (EXPAND the existing `loadNeedsAttentionCount` row's contract text to name the holds leg)

- [ ] **Step 1: Failing tests** (append to `tests/admin/needsAttentionCount.test.ts`, which drives its mocked client through module-level `state` — `needsAttentionCount.test.ts:9-62` — NOT a stub factory; follow that idiom). Configure `state` for pending counts 2/1 and sync-problem 0, then:

```ts
it("adds shows-with-holds via loadOpenIdentityHolds; a holds fault is not maskable by healthy counts", async () => {
  const g = (id: string) => ({ showId: id, slug: id, title: null, summaries: ["s"], newestCreatedAt: "2026-08-03T00:00:00+00:00" });
  const ok = await loadNeedsAttentionCount({ loadHolds: async () => ({ kind: "ok" as const, groups: [g("sA"), g("sB")] }) });
  expect(ok).toEqual({ kind: "ok", count: 5 }); // 2+1+0 pending + 2 hold shows
  const bad = await loadNeedsAttentionCount({ loadHolds: async () => ({ kind: "infra_error" as const, message: "x" }) });
  expect(bad).toEqual({ kind: "infra_error" });
});
```

- [ ] **Step 2: Run — FAIL.** **Step 3: Implement:** optional `opts: { loadHolds?: typeof loadOpenIdentityHolds } = {}` (zero-arg call sites stay valid); after `syncProblemCount`: `infra_error` → `{ kind: "infra_error" }`, else `count: pendingTotal + syncProblemCount + holds.groups.length`.
- [ ] **Step 4:** Expand the registry row contract text. Fix the default-path companions (plan-R2 P3): `tests/admin/needsAttentionCount.test.ts:26` and `tests/admin/needsAttentionCount.parallel.test.ts:18` — their service-role stubs must return an empty-holds client so healthy-count and concurrency assertions survive the new default leg. Run all three files + `tsc` — PASS.
- [ ] **Step 5: Commit** `feat(admin): badge count includes shows with open identity holds`

---

### Task 6: inbox card + `IdentityHoldDisclosure` island + transition audit (test-first)

**Files:**

- Create: components/admin/IdentityHoldDisclosure.tsx, tests/components/needsAttentionInboxIdentityHold.test.tsx, tests/components/identityHoldTransitionAudit.test.tsx
- Modify: `components/admin/NeedsAttentionInbox.tsx` (new branch before the `existing_staged` return)

NOTE (verified): `NeedsAttentionInbox` props are `{ items, totalCount, renderedCount, overflowCount, now }` (`components/admin/NeedsAttentionInbox.tsx:18-25`) — every render below passes ALL of them (plan-R1 F6); `now` is a `Date`.

**Interfaces:**

- Consumes: item variant (Task 3); `HOLD_SUMMARIES_RENDER_CAP` from `@/lib/admin/identityHolds` (server-safe, Task 1); `CollapsePanel` (`components/admin/CollapsePanel.tsx:27-50` — required `label`; `region={false}` for repeated panels per `CollapsePanel.tsx:40-47`); precedent classes `IgnoredSheetsDisclosure.tsx:60`; spacing contract `CollapsePanel.tsx:22-25` + `IgnoredSheetsDisclosure.tsx:100-104`.
- Produces: island props `{ showId: string; title: string | null; slug: string; count: number; children: ReactNode }`; testids `needs-attention-item-identity-hold-{showId}`, `needs-attention-link-identity-hold-{showId}`, `identity-hold-toggle-{showId}`, panel id `identity-hold-panel-{showId}`.

- [ ] **Step 1: Write BOTH failing test files** (the transition audit is authored HERE, before implementation — real red, plan-R1 F4). tests/components/needsAttentionInboxIdentityHold.test.tsx (`/** @vitest-environment jsdom */` first line):

```tsx
/** @vitest-environment jsdom */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

const NOW = new Date("2026-08-03T13:00:00Z");
type HoldItem = Extract<NeedsAttentionItem, { variant: "identity_hold" }>;
function holdItem(over: Partial<HoldItem> = {}): HoldItem {
  return {
    variant: "identity_hold", key: "hold-show:sX", showId: "sX", slug: "spring-gala",
    title: "Spring Gala", summaries: ["Jane Doe's email is changing"],
    copy: "Jane Doe's email is changing", activityAt: "2026-08-03T12:00:00+00:00", ...over,
  };
}
function renderInbox(items: NeedsAttentionItem[]) {
  return render(
    <NeedsAttentionInbox items={items} totalCount={items.length} renderedCount={items.length} overflowCount={0} now={NOW} />,
  );
}

describe("identity_hold card", () => {
  it("single hold: summary + link with truthy-title aria, NO toggle", () => {
    renderInbox([holdItem()]);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(card).getByText("Jane Doe's email is changing")).toBeTruthy();
    const link = within(card).getByTestId("needs-attention-link-identity-hold-sX");
    expect(link.getAttribute("href")).toBe("/admin?show=spring-gala");
    expect(link.getAttribute("aria-label")).toBe("Review held change for Spring Gala (spring-gala)");
    expect(link.textContent).toContain("Review"); // visible text (plan-R8 V2)
    expect(link.className).toContain("min-h-tap-min"); // shared reviewLinkClass (NeedsAttentionInbox.tsx:27-28)
    expect(within(card).queryByTestId("identity-hold-toggle-sX")).toBeNull();
  });

  it("null title: slug renders on the visible line; slug-only aria fork", () => {
    renderInbox([holdItem({ title: null })]);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(card).getByText("spring-gala")).toBeTruthy();
    expect(within(card).getByTestId("needs-attention-link-identity-hold-sX").getAttribute("aria-label"))
      .toBe("Review held change for spring-gala");
  });

  it("multi hold: tabular count copy, aria toggle, no-region panel, footer link in BOTH states", () => {
    const summaries = ["s one", "s two", "s three"];
    renderInbox([holdItem({ summaries, copy: "3 held changes waiting" })]);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    const countLine = within(card).getByText("3 held changes waiting");
    expect(countLine.className).toContain("tabular-nums"); // spec R5-J2
    const linkCollapsed = within(card).getByTestId("needs-attention-link-identity-hold-sX"); // BEFORE expansion
    expect(linkCollapsed.getAttribute("aria-label")).toBe("Review held changes for Spring Gala (spring-gala)");
    expect(linkCollapsed.textContent).toContain("Review"); // visible text, not aria-only (plan-R8 V2)
    expect(linkCollapsed.className).toContain("min-h-tap-min"); // shared reviewLinkClass tap floor (NeedsAttentionInbox.tsx:27-28)
    // OUTSIDE the always-mounted panel subtree: a link nested in the collapsed
    // inert CollapsePanel region would still "exist" (CollapsePanel.tsx:53-64).
    const panelPre = document.getElementById("identity-hold-panel-sX");
    if (panelPre) expect(panelPre.contains(linkCollapsed)).toBe(false);
    const toggle = within(card).getByTestId("identity-hold-toggle-sX");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("identity-hold-panel-sX");
    expect(toggle.getAttribute("aria-label")).toBe("Show details for 3 held changes for Spring Gala (spring-gala)");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById("identity-hold-panel-sX");
    if (!panel) throw new Error("panel missing");
    expect(panel.getAttribute("role")).not.toBe("region"); // repeated-landmark opt-out (spec H3)
    for (const s of summaries) expect(within(panel as HTMLElement).getByText(s)).toBeTruthy();
    expect(within(card).getByTestId("needs-attention-link-identity-hold-sX")).toBeTruthy(); // AFTER expansion
  });

  it("caps panel at 10 lines: first ten ALL present, tail derived, eleventh absent", () => {
    const summaries = Array.from({ length: 13 }, (_, i) => `summary ${i}`);
    renderInbox([holdItem({ summaries, copy: "13 held changes waiting" })]);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    const panel = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    for (let i = 0; i < 10; i++) expect(within(panel).getByText(`summary ${i}`)).toBeTruthy(); // plan-R1 F12
    expect(within(panel).queryByText("summary 10")).toBeNull();
    const more = within(panel).getByText(`and ${summaries.length - 10} more`);
    expect(more.className).toContain("tabular-nums"); // spec R5-J2
  });

  it("empty-string title: accessible names still carry slug via the truthy fork", () => {
    renderInbox([holdItem({ title: "", summaries: ["a", "b"], copy: "2 held changes waiting" })]);
    expect(screen.getByTestId("identity-hold-toggle-sX").getAttribute("aria-label"))
      .toBe("Show details for 2 held changes for spring-gala");
  });
});
```

tests/components/identityHoldTransitionAudit.test.tsx — the spec Transition Inventory pinned test-first. SOURCE tier (`readFileSync` on the island + inbox sources): NO `AnimatePresence`, NO `motion.` import, exactly one `CollapsePanel` usage, `region={false}` present, `label={` present (the label is DOM-invisible under `region={false}`, so source is the only pinnable tier — plan-R1 F12), and the island root has NO gap utility (the spacing contract, spec R6-K3). BEHAVIORAL tier (jsdom, same render helper): rerender single→multi and multi→single (mode elements mount/unmount, no throw); toggle open then rerender with a DIFFERENT same-length summaries array (compound a, count above 1: panel children update); rerender with `summaries: ["only"]` while open (count-drops-to-1 arm: island unmounts, summary line renders — mode boundary wins, spec R7-L2). _Genuine red: the island file does not exist and the inbox has no identity_hold branch until Step 3._

- [ ] **Step 2: Run both — FAIL.**
- [ ] **Step 3: Implement** the island:

```tsx
"use client";
// Multi-hold disclosure for the needs-attention identity_hold card (spec §7).
// Owns ONLY open/closed state; summaries arrive as server-rendered children
// (IgnoredSheetsDisclosure composition). Caps live in lib/admin/identityHolds
// (server-safe; a client-module export would be unreadable from the server inbox).
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsePanel } from "@/components/admin/CollapsePanel";

export function IdentityHoldDisclosure({ showId, title, slug, count, children }: {
  showId: string; title: string | null; slug: string; count: number; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `identity-hold-panel-${showId}`;
  const verb = open ? "Hide" : "Show";
  const forShow = title ? `${title} (${slug})` : slug;
  return (
    // No gap utility here: CollapsePanel's zero-height closed track would keep a
    // parent gap visible (CollapsePanel.tsx:22-25); open-state spacing is the pt-3
    // wrapper below (IgnoredSheetsDisclosure.tsx:100-104 precedent).
    <div className="flex flex-col">
      <button
        type="button"
        data-testid={`identity-hold-toggle-${showId}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${verb} details for ${count} held changes for ${forShow}`}
        onClick={() => setOpen((v) => !v)}
        className="group flex min-h-tap-min items-center gap-2 rounded-sm text-left text-sm text-text-subtle transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <ChevronRight aria-hidden="true" className={`size-4 shrink-0 transition-transform duration-fast ${open ? "rotate-90" : ""}`} />
        <span>{verb} details</span>
      </button>
      {/* region={false}: this card repeats per show (20 dashboard / 100 page cap);
          CollapsePanel mandates the landmark opt-out for many-panel callers
          (CollapsePanel.tsx:40-47; RecentAutoAppliedStrip precedent). */}
      <CollapsePanel open={open} id={panelId} region={false} label={title ? `Held changes for ${title} (${slug})` : `Held changes for ${slug}`}>
        <div className="flex flex-col gap-1 pt-3">{children}</div>
      </CollapsePanel>
    </div>
  );
}
```

Inbox branch (server side, before the `existing_staged` fallthrough): fork on `item.summaries.length === 1`; tile + `CardHeader status="warn"` label `Held change`/`Held changes`; visible title line `item.title ?? item.slug`; single mode = summary copy line + footer link (aria `Review held change for …` truthy fork); multi mode = count line (`text-sm text-text-subtle tabular-nums`) + island whose children are `item.summaries.slice(0, HOLD_SUMMARIES_RENDER_CAP)` lines (`text-sm text-text-subtle`) plus, when longer, the `and N more` line (`tabular-nums`); footer `Link` OUTSIDE the island (aria `Review held changes for …` truthy fork), rendered with the SHARED `reviewLinkClass` (`NeedsAttentionInbox.tsx:27-28`) and visible `Review →` text in both modes (plan-R8 V2); `HOLD_SUMMARIES_RENDER_CAP` imported from `@/lib/admin/identityHolds`.

- [ ] **Step 4: Run both test files + tsc — PASS.**
- [ ] **Step 5: Commit** `feat(admin): identity-hold inbox card with disclosure island + transition audit`

---

### Task 7: summary card chip + Dashboard/page threading

**Files:**

- Modify: `components/admin/NeedsAttentionSummaryCard.tsx` (required `identityHoldTotal: number` prop + chip after the sync-problems chip, `NeedsAttentionSummaryCard.tsx:54-69` pattern — chips render only when > 0), `components/admin/Dashboard.tsx:738-744` (thread `identityHoldTotal={result.needsAttention.identityHoldTotal}`). BOTH tooltip edits live in Task 9 (plan-R2 P5 / plan-R3 Q3) — no tooltip file here.
- Test: `tests/components/admin/NeedsAttentionSummaryCard.test.tsx` PLUS companion `tests/components/needsAttentionSummaryCardSyncProblem.test.tsx:12-41` (three renders gain the new required prop — plan-R1 F6).

- [ ] **Step 1: Failing tests (BOTH surfaces get task-local red, plan-R2 P5):** (a) summary card: chip `summary-chip-identity-holds` renders `2 held` (fixture total 2) with `aria-label` `2 held identity changes`; absent at 0; holds-only state (`identityHoldTotal: 3`, other totals 0) yields a non-empty breakdown. (b) Dashboard threading: in `tests/components/admin/Dashboard.test.tsx`, a fixture with nonzero `needsAttention.identityHoldTotal` renders the chip through the REAL threading at `components/admin/Dashboard.tsx:738-745` (red until Step 3). _Failure modes: G2 holds-only empty breakdown; threading omitted while the direct-prop card test passes._
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** chip:

```tsx
{identityHoldTotal > 0 && (
  <span data-testid="summary-chip-identity-holds" className="tabular-nums" aria-label={`${identityHoldTotal} held identity changes`}>
    {identityHoldTotal} held
  </span>
)}
```

TOOLTIP COPY MOVED TO TASK 9 (plan-R2 P5): the two tooltip edits get their task-local red test there (the copy-contract source-walk); landing them here would put production copy ahead of any failing test.

- [ ] **Step 4:** Update the three companion renders; run BOTH summary-card test files AND `tests/components/admin/Dashboard.test.tsx` (the Step 1b threading test must go green here — plan-R3 Q1) + `tsc` — PASS. **Step 5: Commit** `feat(admin): summary-card held-changes chip + dashboard threading`

---

### Task 8: digest transport, cap, sourceTotals

**Files:**

- Modify: `lib/notify/digest.ts` (holds query + adapter + `identityHolds` + `cap` + `holdShows` + helper arms + `no_send` literal at `digest.ts:127`), `lib/notify/runNotify.ts:457` (literal), `tests/notify/digest.test.ts`, and the NINE `sourceTotals` companion sites (plan-R2 P4 + plan-R8 V1): the six typed constructors — `tests/notify/deliver.test.ts:149`, `tests/notify/run-notify.test.ts:47` + `run-notify.test.ts:69`, `tests/notify/runDigestNotify.monitor.test.ts:21` + `runDigestNotify.monitor.test.ts:34`, `tests/notify/email-delivery-failed-reconcile.test.ts:570` — PLUS the three exact-value expectations the new field breaks: `tests/notify/digest.test.ts:69` (successful-model totals), `digest.test.ts:111-114` (empty-source no_send result), `tests/notify/deliver.test.ts:585` (persisted source_totals context). Each gains `holdShows: 0` (or the fixture-appropriate value).

**Interfaces:** consumes `groupHoldRows`/`IdentityHoldRow` (Task 1), builder inputs (Task 3), `asIso` (`lib/notify/digest.ts:76-79` — returns `string | null`, plan-R1 F5). Produces `DigestModel.sourceTotals.holdShows: number`.

- [ ] **Step 1: Failing tests.** The digest suite's `fakeSql` dispatches BY SQL TEXT (`tests/notify/digest.test.ts:6-50`) — NOT call order, which is unstable (the shows query is skipped when `driveIds` is empty, `lib/notify/digest.ts:178-186`; plan-R1 F14). Extend `fakeSql` with a `/from\s+sync_holds/i` branch returning configurable rows (default `[]`, so every existing case is untouched). Cases:
  1. **Representation compatibility (spec §9.12):** one hold row with `created_at` as a `Date` (postgres.js shape) timestamped BETWEEN two pending items → merged model order places the hold between them. Type-level pin: `const _pin: string = ({} as IdentityHoldRow)["created_at"];`.
  2. **Uncapped + totals (spec §9.13, D8/D9):** 21 pending syncs + 1 older hold → hold present; `sourceTotals.holdShows === 1`; holds-only case (pending branches `[]`, one hold row; the shows query never fires — text dispatch is order-immune) is NOT `no_send`; the invalid-recipient `no_send` literal AND the `runNotify` synthesized model both carry `holdShows: 0`.
  3. **Selective fault (spec §9.14):** pending branches succeed, the `sync_holds` branch REJECTS → `buildDigestModel` RESOLVES to its typed infra result (`lib/notify/digest.ts:238-239`; it never throws — existing tests pin that).
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** in `buildDigestModel` after the syncs query (inside the existing try):

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
    // created_at is NOT NULL in DDL; asIso(null) is unreachable here, so ?? ""
    // satisfies the required-string contract without a non-null assertion (plan-R1 F5).
    created_at: asIso(r.created_at) ?? "",
  })),
);
```

Thread `identityHolds`, `totalCounts.identityHolds`, `cap: ingestions.length + syncs.length + identityHolds.length` (D8), `sourceTotals.holdShows` (D9); helper arms in `groupTitleFor`/`itemCopy`/`slugFor`; `holdShows: 0` in both zero literals (`digest.ts:127`, `runNotify.ts:457`).

- [ ] **Step 3b: SQL source pin.** Source-regex assertion: `lib/notify/digest.ts` contains `kind = 'mi11_pending'`, `s.archived = false`, and `order by sh.created_at desc, sh.id asc`.
- [ ] **Step 4: Run** the digest suite PLUS every companion suite this task touches (plan-R3 Q2): `tests/notify/deliver.test.ts`, `tests/notify/run-notify.test.ts`, `tests/notify/runDigestNotify.monitor.test.ts`, `tests/notify/email-delivery-failed-reconcile.test.ts` — the monitor-only constructor's `holdShows: 0` gets a RUNTIME assertion in `runDigestNotify.monitor.test.ts`, not just compile compatibility (spec §9.13) — + `tsc` — PASS. **Step 5: Commit** `feat: digest includes open identity holds (uncapped model, holdShows total)`

---

### Task 9: help copy surfaces (TDD)

**Files:**

- Create: tests/help/heldChangesCopy.test.ts
- Modify: `app/help/admin/dashboard/page.mdx`, `app/help/admin/review-queues/page.mdx`, `app/help/daily-rhythm/page.mdx`, `app/help/admin/settings/page.mdx`, `app/help/tour/page.mdx`, `components/admin/Dashboard.tsx` (tooltip), `app/admin/needs-attention/page.tsx` (tooltip) — the tooltips are edited HERE, under this task's red copy test (plan-R2 P5 / plan-R3 Q3)

- [ ] **Step 0: Write the failing copy-contract test** — the new file tests/help/heldChangesCopy.test.ts (idiom: `tests/help/sheetChangesCopy.test.ts:11-29` source-walk), implementing spec §9.14a's TWO-TIER contract (spec R9-N1, phrase tier amended by plan-R2 P1). PHRASE tier (normalized: `replaceAll("**", "")` then `replace(/\s+/g, " ")` — the tour sentence wraps a newline, `app/help/tour/page.mdx:32-34`, spec R8-M1) carries NINE per-passage LITERAL anchors (exact Step 1 insertions; one regex provably cannot match all nine word orders):
  1. `components/admin/Dashboard.tsx` tooltip: `held crew identity changes`
  2. `app/admin/needs-attention/page.tsx` tooltip: `held crew identity changes`
  3. dashboard mdx inventory slice (above "Changes and review"): `Held identity change.`
  4. dashboard mdx live-change slice (below it): `That held change also appears as a card in the Needs attention inbox`
  5. review-queues mdx table slice (above "Live-show changes"): `held for your Approve or Reject`
  6. review-queues mdx bullet slice (below it): `It also appears in the Needs attention inbox until you decide.`
  7. `app/help/daily-rhythm/page.mdx`: `Held crew identity changes appear here too`
  8. `app/help/admin/settings/page.mdx`: `crew identity changes that are held for your review`
  9. `app/help/tour/page.mdx`: `crew identity changes held for your approval`
  plus the TWO negatives (tour: "Each queue is scoped to one show" ABSENT; dashboard inventory: "Nothing here clears itself." ABSENT), and the replacement-behavior positive (`/sync problem cards clear on their own/i` in the dashboard inventory slice). STRUCTURE tier (RAW source, spec R9-N1): dashboard inventory slice has exactly five `/^- \*\*/m` bullet lines and one bullet beginning `- **Sync problem.**`. Run: FAIL across all files.
- [ ] **Step 1: Exact edits** (existing voice; no em-dashes):
  1. `app/help/admin/dashboard/page.mdx:37-43` — FULL inventory repair (spec R5-J1): "Three kinds" becomes "Five kinds of cards show up here:"; add `- **Sync problem.** A live show's sheet went missing or its latest edit didn't parse. The card explains the problem and links to the show; it clears on its own once the underlying problem is fixed.`; add `- **Held identity change.** A crew member's identity change (usually an email) is waiting for your Approve or Reject. The card names the person for a single change, or shows a count you can expand when several are waiting; tap **Review** to open the show's Sheet changes feed and decide there.`; replace the closing "A card stays in the inbox until you act on it. Nothing here clears itself." with "Sheets and held changes stay in the inbox until you act on them; sync problem cards clear on their own when the problem is fixed."
  2. `app/help/admin/dashboard/page.mdx:51-53` — after "waits for **Approve** or **Reject** in the show's Sheet changes feed", insert: `That held change also appears as a card in the **Needs attention** inbox, so you can find it without opening the show first.`
  3. `app/help/admin/review-queues/page.mdx:7-10` — third table row, label EXACTLY the shipped card-header label `Held changes` so the bold string passes the UI-label crosswalk's exact `includes` match (`tests/help/_metaUiLabelCrosswalk.test.ts:306-345`; plan-R2 P2): `| **Held changes** | A crew member's identity change (usually an email) held for your Approve or Reject. It waits in the show's **Sheet changes** feed and also appears as a card in the **Needs attention** inbox. |`
  4. `app/help/admin/review-queues/page.mdx:57-59` (identity-change bullet) — append: `It also appears in the **Needs attention** inbox until you decide.`
  5. `app/help/daily-rhythm/page.mdx:13` — append: `Held crew identity changes appear here too, until you approve or reject them.`
  6. `app/help/admin/settings/page.mdx:35` — append: `It also lists crew identity changes that are held for your review.`
  7. `components/admin/Dashboard.tsx:769-772` (tooltip; moved from Task 7 per plan-R2 P5): `Sheets and changes waiting on you: new shows to review, staged edits to approve, held crew identity changes, or sheets that couldn't be processed.`
  8. `app/admin/needs-attention/page.tsx:64-67` (tooltip; moved likewise): `Everything waiting on a decision from you: sheets we could not auto-apply, staged changes to review, and held crew identity changes. Items leave this list as soon as you resolve them.`
  9. `app/help/tour/page.mdx:31-34` — replace the enumeration + one-show sentence: "first-seen sheets the app held for your sign-off, and staged edits to a sheet that's already live. Each queue is scoped to one show, so working through one feels like triaging a short list rather than scanning the full sheet." becomes "first-seen sheets the app held for your sign-off, staged edits to a sheet that's already live, and crew identity changes held for your approval. The Needs attention list collects all of them across shows, so working through it feels like triaging a short list rather than scanning every sheet."
- [ ] **Step 2: Run** the new test — PASS; run the rest of `tests/help` INCLUDING `tests/help/_metaUiLabelCrosswalk.test.ts` (every new bold help string must exactly match a shipped production label or be registered; plan-R2 P2).
- [ ] **Step 3: Commit** `docs(admin): held-changes copy across tooltips + help, with source-walk contract test`

---

### Task 10: e2e — seeded holds across page, badge, chip, clear-through

**Files:**

- Create: tests/e2e/needs-attention-holds.spec.ts
- Modify: `playwright.config.ts` — add `"needs-attention-holds"` to the `desktop-chromium` filename allowlist (`playwright.config.ts:77-80`); WITHOUT this the spec collects ZERO tests (plan-R1 F2). ALSO modify `.github/workflows/admin-layout-e2e.yml` (plan-R5 S1, sharpened plan-R6 T2): add the new spec path tests/e2e/needs-attention-holds.spec.ts to BOTH the path-filter list (`admin-layout-e2e.yml:30-43` — the earlier 7-14 line citation was the header commentary) and the run command (`admin-layout-e2e.yml:112-113`), AND add every production surface this feature touches to the path filter so later regressions cannot leave the spec dark: `lib/admin/needsAttention.ts`, `lib/admin/loadNeedsAttention.ts`, `lib/admin/needsAttentionCount.ts`, the new module path lib/admin/identityHolds.ts, `components/admin/NeedsAttentionInbox.tsx`, `components/admin/NeedsAttentionSummaryCard.tsx`, the new island path components/admin/IdentityHoldDisclosure.tsx, `components/admin/Dashboard.tsx`, `app/admin/needs-attention/page.tsx`, `lib/notify/digest.ts`, `lib/notify/runNotify.ts`, and the five help mdx files from Task 9 (plan-R7 U2 — the coverage claim is now literally true: every production surface Tasks 1-9 touch) — project collection alone does not imply CI execution, and a spec no workflow runs silently rots (that file's own header comment). The 390px chip step uses `page.setViewportSize({ width: 390, height: 844 })` inside desktop-chromium; no mobile-safari registration.

**e2e harness readiness:** server boot = the suite's existing `webServer` (`playwright.config.ts:217`) on `E2E_PORT` — `pnpm dev` locally, `pnpm build && pnpm start` under CI (`playwright.config.ts:245-249`; plan-R5 S4), so CI exercises the production bundle. Readiness gate = HYDRATION-proof, not visibility: replicate the interaction-based `waitForRowHydration` idiom (`tests/e2e/published-review-modal.interactions.spec.ts:129-143`) before ANY client interaction — the disclosure toggle and `mi11-reject` are client handlers and a visible control can be pre-hydration (plan-R1 F15). Detach safety = re-query every locator after `page.reload()` and after the reject action.

- [ ] **Step 1: Write the spec.** Prefix `e2e-needs-attention-holds-`; pre-clean by prefix; cleanup in `finally`. **Executable seed helper** (plan-R1 F16) — full required columns: `shows` rows carry `drive_file_id` (prefixed), `slug` (prefixed), `title`, `client_label`, `template_version`, `archived` (`supabase/migrations/20260501000000_initial_public_schema.sql:3-10`); every `sync_holds` row carries `show_id`, `drive_file_id` (its show's), `domain` (`'crew_email'`/`'crew_identity'`, distinct per row under the `(show_id, domain, entity_key)` uniq), `entity_key`, `held_value` (`{"email":"old@x.com"}`), `proposed_value` (`mi11_pending`: the CANONICAL email_change shape `{"disposition":"email_change","name":"<the row's entity_key>","email":"new@x.com"}` — `Disposition` requires `name` and the gate UI reads `disposition.name` for its accessible control names (`lib/sync/holds/types.ts:7-10`, `components/admin/Mi11GateActions.tsx:38-40`; plan-R7 U1) — with NON-NULL `base_modified_time`; `undo_override`: NULL per the kind-shape CHECK `20260608000000_sync_holds.sql:30-37`), `kind`, `created_by` (`'e2e'`). Seeds: show 1 = one `mi11_pending`; show 2 = three `mi11_pending` (distinct entity keys, domains alternating); show 3 = active with ONLY an `undo_override` row (spec §9.8 — a reader wrongly including overrides adds a VISIBLE new card here, plan-R1 F13); show 4 = `archived=true` with one `mi11_pending` (R6). Assertions:
  1. Cards for shows 1+2 ONLY (shows 3/4 produce NO card — scoped testid queries); copy fork correct (`within(card)`; multi = `3 held changes waiting`).
  2. Badge equals 2 (fixture-derived).
  3. `/admin` at 390px viewport: `summary-chip-identity-holds` shows `2 held` (the summary card exists ONLY on the dashboard, `components/admin/Dashboard.tsx:738-745`).
  4. Hydration-gate, expand show 2's card: all three seeded summaries inside the panel. `page.reload()` → re-query → panel COLLAPSED (full document remount mounts the island at its default; this PINS the reload case. Soft-refresh persistence stays UNRATIFIED per spec G3 and is exercised by the Task 6 jsdom rerenders — no vacuous both-values assertion, plan-R1 F15).
  5. Show 1's card link lands on `/admin?show={slug}` with `mi11-approve`/`mi11-reject` visible (`components/admin/Mi11GateActions.tsx:70`).
  6. Clear-through: hydration-gate, click `mi11-reject` (NOT approve — approve needs a live Drive `modifiedTime` match + a `crew_members` row, `lib/sync/holds/mi11GateActions.ts:89-102`, unseedable here; reject needs only the hold row and the round-tripped `base_modified_time`), the reject is a single direct server-action submit with NO confirmation phase (`components/admin/Mi11GateActions.tsx:153-163`; plan-R2 P6) — await the feed row update, return, reload → show 1's card GONE, badge reads 1.
- [ ] **Step 2: Run** `pnpm exec playwright test tests/e2e/needs-attention-holds.spec.ts --project=desktop-chromium` — iterate to green (config registration first, or the run collects nothing).
- [ ] **Step 3: Commit** `test(admin): e2e seeded identity-holds rollup (cards, badge, chip, reject clear-through)`

---

### Task 11: closeout

- [ ] **Step 1: Impeccable dual gate FIRST** (invariant 8): `/impeccable critique` AND `/impeccable audit` on the affected diff with the v3 setup gates; fix or defer P0/P1 via DEFERRED.md; REPLACE the template marker line below with the real RAN form (`impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=recorded`). Fill BEFORE the full-suite run — `tests/docs/_metaInvariant8Closeout.test.ts` accepts only the RAN/N-A/template forms (plan-R1 F3).
- [ ] **Step 2: BACKLOG graduation** (invariant 12): MOVE the entire `BL-NEEDS-ATTENTION-HOLDS-ROLLUP` entry from `BACKLOG.md` to `BACKLOG-archive.md` (per `BACKLOG.md:5`; `tests/docs/_metaDeferralLedgerGraduation.test.ts:425-448` rejects terminal entries left in the open queue) and add the reconciliation-line segment at `BACKLOG.md:7` naming this branch/spec (plan-R1 F17).
- [ ] **Step 2b: Commit the closeout mutations** (plan-R3 Q4): the filled marker line, the BACKLOG move + reconciliation segment, and any impeccable-fix / DEFERRED.md edits — `docs(plan): closeout — impeccable marker, BACKLOG graduation` (further review-fix commits in Step 4 as needed; nothing reaches `git push` uncommitted).
- [ ] **Step 3: Full local suite** — `pnpm vitest run`, `pnpm exec tsc --noEmit`, `pnpm exec playwright test tests/e2e/needs-attention-holds.spec.ts tests/e2e/needs-attention-page.spec.ts --project=desktop-chromium` — all green.
- [ ] **Step 4: Whole-diff cross-model review** to APPROVE (fresh-eyes; REVIEWER ONLY; split tight-scope briefs per the AGENTS.md default for large diffs).
- [ ] **Step 5:** Sync with origin/main (`git fetch origin && git merge origin/main`, resolve, re-run the suite if anything merged), push, PR, REAL CI green — confirm the `admin-layout-e2e` workflow ran the NEW spec (plan-R5 S1), not just collected it — `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` → `0  0`, then CronDelete the session nudge and clear both herdr labels.

## 12. Closeout marker

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=1 dispositions=recorded

**Run provenance (both halves DEGRADED, honestly labelled).** Assessment A (design review) and Assessment B (detector evidence) were dispatched as isolated sub-agents per the critique contract, and the audit as a third; none returned a report. The substantive work was therefore completed in-context, and the evidence tiers were re-run directly rather than asserted: `detect.mjs --json` over `components/admin/NeedsAttentionInbox.tsx`, `components/admin/IdentityHoldDisclosure.tsx`, and `components/admin/NeedsAttentionSummaryCard.tsx` returned `[]` (exit 0, zero findings), and the repo's mechanical gates (em-dash ban over user-visible copy, hex-color ban, 44px tap floor) came back clean. Browser visualization was NOT attempted and is NOT claimed: the surface is auth-gated admin UI with no unauthenticated URL. Critique snapshot: `.impeccable/critique/2026-08-04T04-52-50Z__components-admin-needsattentioninbox-tsx.md` (Design Health 35/40).

**Findings and dispositions.**

| Sev | Finding | Disposition |
| --- | --- | --- |
| P1 | `IdentityHoldDisclosure`'s toggle used `focus-visible:ring-offset-bg`, copied from the `IgnoredSheetsDisclosure` precedent. That disclosure sits on the page background; this one sits inside a `bg-surface` card, so a focused toggle drew a 2px page-coloured gap on top of the card (visibly wrong in dark mode, where `bg` and `surface` diverge). DESIGN.md §15 requires the offset to match the surrounding container, and the same card's footer link (`reviewLinkClass`) already offsets to `surface`. | FIXED — `focus-visible:ring-offset-surface`, plus a source-tier regression pin in `tests/components/identityHoldTransitionAudit.test.tsx` asserting the correct token is present and the wrong one absent. No deterministic scanner can see this class of finding; it is the invariant-8 gate earning its keep. |
| P2 | `identity_hold` labels its footer link `Review →` while the sibling `existing_staged` card says `Open show →` for the SAME `/admin?show={slug}` destination. | NOT A DEFECT, no change. The shipped convention is verb-by-INTENT, not verb-by-destination: `sync_problem` routes to the same place and says `Check it →`, while `first_seen` says `Review →` for a different destination. A hold requires an Approve/Reject decision, so `Review` is intent-correct and matches `first_seen`. DESIGN.md §16 sets the same intent-driven precedent for resolve labels. Recorded here so a later reviewer does not re-derive it. |
| P3 | Summary lines inside the disclosure use index-based React keys (`NeedsAttentionInbox.tsx`). | ACCEPTED as-is. The children are static `<p>` elements with no state or focus to preserve, so a positional reconcile is indistinguishable from a keyed one; the summaries carry no stable id at this layer. |

No P0 findings. No `DEFERRED.md` entry is required: the single P1 was fixed in-branch.

## 13. Cross-model review record (Task 11 Step 4)

Split into three tight-scope passes per the AGENTS.md default for large diffs (47 files): **1** read path / grouping core / builder / badge count, **2** UI surfaces and copy, **3** digest transport / e2e / CI wiring / ledgers. Verdicts by round:

| Round | Scope 1 | Scope 2 | Scope 3 |
| --- | --- | --- | --- |
| 1 | NEEDS-ATTENTION (5) | NEEDS-ATTENTION (6) | NEEDS-ATTENTION (1) |
| 2 | NEEDS-ATTENTION (3) | NEEDS-ATTENTION (3) | NEEDS-ATTENTION (2) |
| 3 | NEEDS-ATTENTION (1) | NEEDS-ATTENTION (3) | **APPROVE** |
| 4 | **APPROVE** | see below | — |

**The three defects that were real code bugs**, as opposed to test-strength findings:

1. **Rejection containment (round 1, 2 HIGH).** The two holds awaits were unguarded, and the root cause sat one layer deeper: `groupHoldRows` ran OUTSIDE the reader's try, and it calls `shapeHoldEntry` → `getRequiredDougFacing`, which throws. A row with `proposed_value: null` (nullable in the DDL; the kind-shape CHECK constrains it only for `mi11_pending`) rejected the promise and escaped the typed contract. Fixed at all three sites; the digest's call was verified already inside its try rather than assumed.
2. **Copy that was factually false (rounds 1 and 3, 2 MEDIUM).** "Held changes stay in the inbox until you act" is wrong — `mi11Reconciled` → `deleteHold` releases an open hold when the sheet is edited back (`lib/sync/holds/holdAwareApply.ts:121-171`). Separately the page tooltip claimed everything awaits a decision, which is wrong for sync-problem cards. Both rewritten; both halves pinned.
3. **Mobile overflow (round 2, 1 HIGH).** Hold summaries embed raw email addresses; a 64-character local-part is one unbreakable token measuring ~512px against a ~316px card interior at 390px. Both render paths now carry `wrap-break-word`.

**Refuted, with its probe, so no later reviewer re-derives it** (AGENTS.md: log refuted diff-only claims): the round-2 em-dash finding on `app/help/admin/dashboard/page.mdx` lines 37 and 45. Whole-line diffs make pre-existing clause text look added; `git show main:app/help/admin/dashboard/page.mdx | grep -c "—"` returns 10 on that file. Every clause authored on this branch is em-dash free.

**Round-economy note for future plans.** Rounds 2-4 produced almost no behavior findings — they were dominated by ONE recurring shape: *source pins asserted by substring rather than by structure*. A whole-file `toContain` stays green when the operation is deleted and its literal survives in a comment; a partial projection pin stays green when a different column is dropped; three independent predicate checks stay green when `and` becomes `or`. Each round named one more instance. What ended it was switching instrument rather than naming another instance: **assert the query projection and the SQL statement by EQUALITY, and strip comments via the shared `tests/_shared/stripComments` before matching.** A plan that writes source pins should reach for equality first.

## Meta-test inventory (declared)

- EXTENDS: `tests/admin/_metaInfraContract.test.ts` (new `loadOpenIdentityHolds` row; expanded `loadNeedsAttentionCount` contract), `tests/admin/_metaBoundedReads.test.ts` (module in `READ_MODULES`; `sync_holds` in `UNBOUNDED_TABLES`).
- CREATES: none.
- Declared N/A: advisory-lock topology (no `pg_advisory*` touched), sentinel-hiding, admin-alert catalog, `AUDITABLE_MUTATIONS` (no mutation surfaces), DML lockdown, schema manifest/validation parity (no migrations). Layout-dimensions task N/A (spec §7 Dimensional Invariants: none introduced; the one spacing-topology contract is pinned by the Task 6 source assertions).
