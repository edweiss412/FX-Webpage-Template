# Data-Quality Badge on Watched-Folder Rows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a compact warning-glyph "data quality" badge next to each show's title on the admin watched-folder table (active + archived), populated from `shows_internal.parse_warnings`, with a visible degraded-read notice when that read faults.

**Architecture:** `fetchDashboardData` gains one bounded, fail-soft `shows_internal` read (wave-2 fan-out) that summarizes per-show parse warnings into `ActiveShowRow.dataGaps`; a typed `infra_error` at the boundary degrades **visibly** via a new `dataGapsDegraded` flag + calm notice. A new shared `DataQualityBadge` renders the icon in both `ShowsTable` (active) and `ArchivedShowRow` (archived).

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase (`@supabase/ssr`), TypeScript (`exactOptionalPropertyTypes`), Tailwind v4, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-04-data-quality-badge-shows-table.md` (Codex-APPROVED).

## Global Constraints

- **Invariant 9 (Supabase call-boundary):** every Supabase call destructures `{ data, error }` (NOT bare `data`); returned-error and thrown-error are distinct; infra faults surface as typed `{ kind: "infra_error", message }`; never a silent `continue`. New read registered in `tests/admin/_metaInfraContract.test.ts` (Task 1).
- **Invariant 5 (no raw error codes in UI):** all user-visible copy is plain language; NO raw §12.4 code literal (`FIELD_UNREADABLE` / `UNKNOWN_SECTION_HEADER` / `BLOCK_DISAPPEARED`) ever rendered.
- **Invariant 8 (UI quality gate):** every `components/` file touched (`DataQualityBadge.tsx`, `ShowsTable.tsx`, `ArchivedShowRow.tsx`, `Dashboard.tsx`) passes `/impeccable critique` + `/impeccable audit`; HIGH/CRITICAL fixed or deferred in `DEFERRED.md` before cross-model review (Task 7).
- **`exactOptionalPropertyTypes`:** `dataGaps` is set via **conditional spread** so the key is ABSENT (not `undefined`) on clean rows — never `dataGaps: x ?? undefined`.
- **Structural meta-test comment/format fragility (repo lesson, PR #285):** a `;` inside a comment breaks `_metaBoundedReads` (splits on `;`); a comment between `supabase` and `.from` breaks `_metaInfraContract`'s window scan. Keep the new `readDataGaps` read statement free of interior comments between `supabase` and `.from`, and after editing `Dashboard.tsx` **re-run BOTH** `tests/admin/_metaBoundedReads.test.ts` AND `tests/admin/_metaInfraContract.test.ts` (Task 1 Step 12).
- **Data source = the three data-gap classes only** (`summarizeDataGaps`); no autocorrect / operator-actionable warnings.
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`), `--no-verify` (shared hooks belong to the main checkout); run `pnpm format:check` + `pnpm typecheck` before the final push.
- **No DB migration, no §12.4 code, no advisory locks, no new meta-test files** — EXTENDS `_metaInfraContract.test.ts` + `dataGapsTransitionAudit.test.tsx` + `dataGapsChipRowLayout.test.tsx` + `DEFERRED.md` DQ-1.

## File Structure

- **Modify** `components/admin/Dashboard.tsx` — `readDataGaps` wave-2 read; `dataGapsDegraded` on `DashboardData`; per-row `dataGaps`; §3.5 degraded notice.
- **Create** `components/admin/DataQualityBadge.tsx` — shared pure presentational badge.
- **Modify** `components/admin/ShowsTable.tsx`, `components/admin/ArchivedShowRow.tsx` — render the badge in the row title container.
- **Modify (tests)** `tests/admin/fetchDashboardData.test.ts`, `tests/admin/_metaInfraContract.test.ts`, `tests/components/admin/Dashboard.test.tsx`, `tests/components/admin/ShowsTable.test.tsx`, `tests/components/admin/Dashboard-archived.test.tsx`, `tests/components/admin/dataGapsTransitionAudit.test.tsx`, `tests/components/admin/dataGapsChipRowLayout.test.tsx`.
- **Modify (docs)** `DEFERRED.md` — extend DQ-1 surface list.

`lib/parser/dataGaps.ts` and `lib/admin/showDisplay.ts` (`ActiveShowRow.dataGaps?` at `:50`) are UNCHANGED — the plumbing exists.

---

### Task 1: Data layer — `readDataGaps` + `dataGapsDegraded` flag + row population + infra-contract registration

Combines the loader change with BOTH its focused tests AND its `_metaInfraContract` behavioral test, all written **red before** the implementation (TDD-per-task; `AGENTS.md:13`). The boundary and its structural registration ship together.

**Files:**
- Modify: `components/admin/Dashboard.tsx` (imports ~:19-40; `DashboardData` type :57-79; wave-2 Promise.all :353-364; call-site :366-374; row map :377-400; final return :406-419)
- Test: `tests/admin/fetchDashboardData.test.ts` (recording mock `Seed` :9-19 + `resolve()` :94-107)
- Test: `tests/admin/_metaInfraContract.test.ts` (registry entry :175; `describe("fetchDashboardData")` :537-588)

**Interfaces:**
- Produces: `readDataGaps(): Promise<Map<string, DataGapsSummary> | InfraResult>` (closure in `fetchDashboardData`); `DashboardData.dataGapsDegraded: boolean`; each row may carry `dataGaps?: DataGapsSummary` (type already at `lib/admin/showDisplay.ts:50`).
- Consumes: `summarizeDataGaps` (`lib/parser/dataGaps.ts:53`), `type DataGapsSummary` (`:19`), `type ParseWarning` (`lib/parser/types.ts`), existing `InfraResult`/`isInfra` (`Dashboard.tsx:238-240`), `activeShowIds` (`:233`).

- [ ] **Step 1: Extend the fetchDashboardData recording mock for `shows_internal`.** In `tests/admin/fetchDashboardData.test.ts`, in the `Seed` type (after `syncCount?: number;`, ~:18) add:

```ts
  showsInternalRows?: Record<string, unknown>[]; // { show_id, parse_warnings }[]
  showsInternalError?: { message: string }; // returned-{error} injection for the degrade path
```

In `makeClient()`'s `resolve()`, immediately BEFORE the final `return { data: [], error: null };` (~:106):

```ts
        if (table === "shows_internal") {
          if (seed.showsInternalError) return { data: null, error: seed.showsInternalError };
          return { data: seed.showsInternalRows ?? [], error: null };
        }
```

- [ ] **Step 2: Write the failing focused tests (T1/T2/T3/T3c).** Append to the main `describe` in `tests/admin/fetchDashboardData.test.ts`. (`published: true, dates: null, venue: null` is safe: `resolveShowTimezone(null)`→default, `deriveStart/End(null)`→null, `isShowLiveOnDate(null)`→false.)

```ts
  it("T1: populates row.dataGaps from shows_internal.parse_warnings (data-source)", async () => {
    state.seed = {
      showsList: [{ id: "s1", slug: "rpas", title: "RPAS", dates: null, venue: null, published: true }],
      showsActiveCount: 1,
      showsInternalRows: [
        {
          show_id: "s1",
          parse_warnings: [
            { severity: "warn", code: "FIELD_UNREADABLE", message: "x" },
            { severity: "warn", code: "FIELD_UNREADABLE", message: "y" },
            { severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "z" },
          ],
        },
      ],
    };
    const { fetchDashboardData } = await import("@/components/admin/Dashboard");
    const result = await fetchDashboardData();
    if ("kind" in result) throw new Error("unexpected infra_error");
    const rpas = result.rows.find((r) => r.slug === "rpas")!;
    expect(rpas.dataGaps).toEqual({
      total: 3,
      classes: { FIELD_UNREADABLE: 2, UNKNOWN_SECTION_HEADER: 1, BLOCK_DISAPPEARED: 0 },
    });
    expect(result.dataGapsDegraded).toBe(false);
  });

  it("T2: a clean show OMITS the dataGaps key (exactOptional-safe)", async () => {
    state.seed = {
      showsList: [{ id: "s1", slug: "clean", title: "Clean", dates: null, venue: null, published: true }],
      showsActiveCount: 1,
      showsInternalRows: [
        { show_id: "s1", parse_warnings: [{ severity: "info", code: "FIELD_UNREADABLE", message: "i" }] },
      ],
    };
    const { fetchDashboardData } = await import("@/components/admin/Dashboard");
    const result = await fetchDashboardData();
    if ("kind" in result) throw new Error("unexpected infra_error");
    expect("dataGaps" in result.rows.find((r) => r.slug === "clean")!).toBe(false); // ABSENT
  });

  it("T3: a RETURNED { error } on shows_internal degrades VISIBLE (no infra_error, dataGapsDegraded true)", async () => {
    state.seed = {
      showsList: [{ id: "s1", slug: "rpas", title: "RPAS", dates: null, venue: null, published: true }],
      showsActiveCount: 1,
      showsInternalError: { message: "boom" },
    };
    const { fetchDashboardData } = await import("@/components/admin/Dashboard");
    const result = await fetchDashboardData();
    if ("kind" in result) throw new Error("must NOT blank the dashboard");
    expect(result.dataGapsDegraded).toBe(true);
    expect(result.rows.every((r) => !("dataGaps" in r))).toBe(true);
  });

  it("T3c: malformed parse_warnings (non-array + bad element) skips only that row, never throws", async () => {
    state.seed = {
      showsList: [
        { id: "s1", slug: "nonarray", title: "N", dates: null, venue: null, published: true },
        { id: "s2", slug: "badel", title: "B", dates: null, venue: null, published: true },
        { id: "s3", slug: "valid", title: "V", dates: null, venue: null, published: true },
      ],
      showsActiveCount: 3,
      showsInternalRows: [
        { show_id: "s1", parse_warnings: { not: "an array" } },
        { show_id: "s2", parse_warnings: [null] },
        { show_id: "s3", parse_warnings: [{ severity: "warn", code: "BLOCK_DISAPPEARED", message: "d" }] },
      ],
    };
    const { fetchDashboardData } = await import("@/components/admin/Dashboard");
    const result = await fetchDashboardData();
    if ("kind" in result) throw new Error("malformed data must not blank the dashboard");
    expect(result.dataGapsDegraded).toBe(false); // malformed DATA ≠ infra fault
    expect("dataGaps" in result.rows.find((r) => r.slug === "nonarray")!).toBe(false);
    expect("dataGaps" in result.rows.find((r) => r.slug === "badel")!).toBe(false);
    expect(result.rows.find((r) => r.slug === "valid")!.dataGaps?.total).toBe(1);
  });
```

- [ ] **Step 3: Write the failing `_metaInfraContract` behavioral test (RED before impl).** In `tests/admin/_metaInfraContract.test.ts`, inside `describe("fetchDashboardData", …)` (`:537`), after the `crew_members` test (~:587), add:

```ts
    test("from('shows_internal') throw → degrades VISIBLE (NOT infra_error): dataGapsDegraded, no rows dropped", async () => {
      // Seed a shows row so wave-2 (readDataGaps) runs past the empty-shows
      // short-circuit (same shape as the crew_members test above).
      infraMock.dataByTable = { shows: [{ id: "s1", slug: "rpas", drive_file_id: "df-1" }] };
      infraMock.throwOnFromTable = "shows_internal";
      const { fetchDashboardData } = await import("@/components/admin/Dashboard");
      const result = await fetchDashboardData();
      expect((result as { kind?: string }).kind).toBeUndefined(); // NOT a dashboard-wide infra_error
      expect((result as { dataGapsDegraded: boolean }).dataGapsDegraded).toBe(true);
      expect((result as { rows: unknown[] }).rows.length).toBe(1);
    });
```

- [ ] **Step 4: Run all new tests to verify they FAIL.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/admin/fetchDashboardData.test.ts tests/admin/_metaInfraContract.test.ts -t "T1|T2|T3|shows_internal"`
Expected: FAIL — `dataGaps`/`dataGapsDegraded` absent (property undefined on the returned shape).

- [ ] **Step 5: Add imports to `Dashboard.tsx`.** After the `@/lib/admin/showDisplay` import (`:21`):

```ts
import { summarizeDataGaps, type DataGapsSummary } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";
```

- [ ] **Step 6: Add `dataGapsDegraded` to `DashboardData`.** After `ignoredDegraded: boolean;` (`:78`):

```ts
  // Data-quality read (shows_internal.parse_warnings) faulted → badges suppressed
  // and a visible calm notice shown. Degrade-VISIBLE, never silent (invariant 9).
  dataGapsDegraded: boolean;
```

- [ ] **Step 7: Add the `readDataGaps` closure** next to `readCrewCounts` (after its definition, before the wave-2 `Promise.all`, ~:305). NOTE: no comment sits between `supabase` and `.from` (meta-test window-scan safety):

```ts
  // parse-data-quality-warnings badge (spec §2.1) — per-show data-gaps summary
  // from shows_internal.parse_warnings. Boundary returns a typed infra_error
  // (invariant 9, registered in _metaInfraContract); the CALLER degrades VISIBLE.
  // shows_internal.show_id is a PK → .in(show_id) is a 1:1 lookup within the
  // already-capped id set (non-UNBOUNDED table → no .limit() needed).
  const readDataGaps = async (): Promise<Map<string, DataGapsSummary> | InfraResult> => {
    const byShow = new Map<string, DataGapsSummary>();
    if (activeShowIds.length === 0) return byShow;
    try {
      const { data, error } = await supabase
        .from("shows_internal")
        .select("show_id, parse_warnings")
        .in("show_id", activeShowIds);
      if (error) {
        return { kind: "infra_error", message: `shows_internal data-gaps query failed: ${error.message}` };
      }
      for (const r of (data ?? []) as ReadonlyArray<{ show_id: string; parse_warnings: unknown }>) {
        // Non-array persisted value skipped; a bad element throws inside
        // summarizeDataGaps and is caught PER-ROW so one corrupt row cannot
        // degrade every badge (spec §2.1). parse_warnings is plain jsonb.
        if (!Array.isArray(r.parse_warnings)) continue;
        try {
          const summary = summarizeDataGaps(r.parse_warnings as ParseWarning[]);
          if (summary.total > 0) byShow.set(r.show_id, summary);
        } catch {
          // malformed element → skip this row only
        }
      }
      return byShow;
    } catch (err) {
      return { kind: "infra_error", message: `shows_internal data-gaps query threw: ${err instanceof Error ? err.message : String(err)}` };
    }
  };
```

- [ ] **Step 8: Add `readDataGaps()` to the wave-2 `Promise.all` and degrade at the call site.** Change the destructuring array (`:353-362`) to append `dataGapsResult` / `readDataGaps()`:

```ts
  const [crewTotalResult, crewCountsResult, na, finalizeOwnedIds, ignoredResult, dataGapsResult] =
    await Promise.all([
      readCrewTotal(),
      readCrewCounts(),
      loadNeedsAttention({ cap: RENDER_CAP, supabase }),
      readFinalizeOwned(),
      loadIgnoredSheets({ supabase }),
      readDataGaps(),
    ]);
```

Next to the `ignoredSheets`/`ignoredDegraded` handling (`:373-374`), add:

```ts
  // Degrade VISIBLE, NOT a dashboard-wide short-circuit (spec §2.2).
  const dataGapsDegraded = isInfra(dataGapsResult);
  const dataGapsByShow: Map<string, DataGapsSummary> = dataGapsDegraded ? new Map() : dataGapsResult;
```

- [ ] **Step 9: Populate `dataGaps` per row (conditional spread).** In the row map, just before `return {` (after the `finalizeOwned` line, ~:385):

```ts
    const gaps = dataGapsByShow.get(s.id as string);
```

Inside the returned object literal, as the LAST property (after `archivedAt: …,`):

```ts
      ...(gaps ? { dataGaps: gaps } : {}),
```

- [ ] **Step 10: Return `dataGapsDegraded`.** In the final `return { rows, bucket, … }` (`:406-419`), after `ignoredDegraded,`:

```ts
    dataGapsDegraded,
```

- [ ] **Step 11: Update the `_metaInfraContract` registry contract string (documentation).** In the `fetchDashboardData` registry entry (`:175`), change `contract:` to:

```ts
    contract:
      "shows/crew/pending_ingestions/pending_syncs await throws → infra_error; the shows_internal.parse_warnings data-gaps read (readDataGaps) destructures { data, error } and returns a typed infra_error at the boundary, which the caller degrades VISIBLE (dataGapsDegraded → calm notice), NEVER a silent empty — mirrors the per-show panel read at :322 (invariant 9)",
```

- [ ] **Step 12: Run the tests + BOTH admin meta-tests (comment-fragility guard) + typecheck.**

Run:
```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
pnpm vitest run tests/admin/fetchDashboardData.test.ts tests/admin/_metaInfraContract.test.ts tests/admin/_metaBoundedReads.test.ts
pnpm typecheck
```
Expected: PASS (all). `_metaBoundedReads` must still pass — `shows_internal` is non-`UNBOUNDED_TABLES`, and the read statement has no interior `;`-in-comment.

- [ ] **Step 13: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/Dashboard.tsx tests/admin/fetchDashboardData.test.ts tests/admin/_metaInfraContract.test.ts
git commit --no-verify -m "feat(admin): populate per-show dataGaps + degraded flag; register shows_internal read"
```

---

### Task 2: Visible degraded-read notice (`Dashboard()` render)

**Files:**
- Modify: `components/admin/Dashboard.tsx` (shows `<section>` render, ~:497-585)
- Test: `tests/components/admin/Dashboard.test.tsx` (harness `emptyClient` ~:31-47)

**Interfaces:** Consumes `result.dataGapsDegraded` (Task 1). Produces a `data-testid="dashboard-data-quality-degraded"` `<p>` shown once for both buckets.

- [ ] **Step 1: Write the failing test (T3b).** In `tests/components/admin/Dashboard.test.tsx`, add a hoisted flag near `state` (`:10`):

```ts
const dgState = vi.hoisted(() => ({ errorShowsInternal: false }));
```

Replace `emptyClient()` (`:31-47`) with a table-aware version that errors on `shows_internal` and seeds one show when the flag is set:

```ts
function emptyClient() {
  return {
    async rpc() {
      return { data: false, error: null };
    },
    from(table: string) {
      const ctx = { head: false };
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = (_c?: unknown, opts?: { head?: boolean }) => {
        if (opts?.head) ctx.head = true;
        return builder;
      };
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      builder.limit = pass;
      builder.in = pass;
      builder.range = pass;
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) => {
        if (table === "shows_internal") {
          if (dgState.errorShowsInternal) return onf({ data: null, count: null, error: { message: "boom" } });
          return onf({ data: [], count: null, error: null });
        }
        if (table === "shows" && !ctx.head && dgState.errorShowsInternal) {
          return onf({
            data: [{ id: "s1", slug: "s1", title: "S1", dates: null, venue: null, published: true, archived_at: null }],
            count: null,
            error: null,
          });
        }
        return onf({ data: ctx.head ? null : [], count: 0, error: null });
      };
      return builder;
    },
  };
}
```

Ensure a `beforeEach(() => { dgState.errorShowsInternal = false; });` exists (add if missing). Then the tests:

```ts
  it("T3b: renders the degraded notice when the shows_internal read faults (no raw code)", async () => {
    dgState.errorShowsInternal = true;
    render(await Dashboard());
    const notice = screen.getByTestId("dashboard-data-quality-degraded");
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).not.toMatch(/FIELD_UNREADABLE|UNKNOWN_SECTION_HEADER|BLOCK_DISAPPEARED/);
  });

  it("T3b: no degraded notice on a healthy read", async () => {
    dgState.errorShowsInternal = false;
    render(await Dashboard());
    expect(screen.queryByTestId("dashboard-data-quality-degraded")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard.test.tsx -t "T3b"`
Expected: FAIL — testid not found.

- [ ] **Step 3: Render the notice.** In `Dashboard()`, inside the shows `<section>` (opened ~:498), immediately BEFORE the `{result.bucket === "archived" ? (` ternary (~:507):

```tsx
          {result.dataGapsDegraded ? (
            <p
              data-testid="dashboard-data-quality-degraded"
              className="rounded-md border border-border bg-surface-sunken p-3 text-sm text-text-subtle"
            >
              Data-quality checks are temporarily unavailable — some shows may not show their
              data-quality badge.
            </p>
          ) : null}
```

- [ ] **Step 4: Run to verify pass.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/Dashboard.tsx tests/components/admin/Dashboard.test.tsx
git commit --no-verify -m "feat(admin): visible degraded-read notice for data-quality reads"
```

---

### Task 3: `DataQualityBadge` component + `ShowsTable` wiring

**Files:**
- Create: `components/admin/DataQualityBadge.tsx`
- Modify: `components/admin/ShowsTable.tsx` (imports :23/:33; title container :460-472)
- Test: `tests/components/admin/ShowsTable.test.tsx` (row factory :19-34)

**Interfaces:**
- Produces: `export function DataQualityBadge({ slug, dataGaps }: { slug: string; dataGaps: DataGapsSummary | undefined }): JSX.Element | null` — `null` when `!dataGaps || total === 0`; else a `role="img"` span (`data-testid={`shows-data-quality-${slug}`}`) with `aria-label`/`title` = plain breakdown, wrapping a `TriangleAlert`.
- Consumes: `dataGapClassDetails` (`lib/parser/dataGaps.ts:94`), `type DataGapsSummary` (`:19`), `TriangleAlert` (`lucide-react`).

- [ ] **Step 1: Write the failing tests (T4/T5/T6) — query by ROLE + accessible name, derive expected from `dataGapClassDetails` (anti-tautology).** Add the import `import { dataGapClassDetails, type DataGapsSummary } from "@/lib/parser/dataGaps";` to the test file, then append to `describe("ShowsTable")`:

```ts
  function expectedBadgeName(s: DataGapsSummary): string {
    const breakdown = dataGapClassDetails(s).map((d) => `${d.count} ${d.label}`).join(", ");
    return `${s.total} data ${s.total === 1 ? "gap" : "gaps"}: ${breakdown}`;
  }

  it("T4: badge is queryable by role=img with the derived accessible name; no raw code literal", () => {
    const summary: DataGapsSummary = {
      total: 3,
      classes: { FIELD_UNREADABLE: 2, UNKNOWN_SECTION_HEADER: 1, BLOCK_DISAPPEARED: 0 },
    };
    render(
      <ShowsTable rows={[row({ slug: "gaps", dataGaps: summary })]} now={now} activeCount={1} overflowCount={0} />,
    );
    // role=img + accessible name → fails if role="img" is dropped (Codex plan R1 MEDIUM)
    const badge = screen.getByRole("img", { name: expectedBadgeName(summary) });
    expect(badge).toHaveAttribute("data-testid", "shows-data-quality-gaps");
    expect(badge).toHaveAccessibleName(/3 data gaps/);
    expect(badge.getAttribute("aria-label")).not.toMatch(/FIELD_UNREADABLE|UNKNOWN_SECTION_HEADER|BLOCK_DISAPPEARED/);
  });

  it("T5: renders NO badge when dataGaps is absent or total 0", () => {
    render(
      <ShowsTable
        rows={[
          row({ slug: "clean" }),
          row({ slug: "zero", dataGaps: { total: 0, classes: { FIELD_UNREADABLE: 0, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 0 } } }),
        ]}
        now={now}
        activeCount={2}
        overflowCount={0}
      />,
    );
    expect(screen.queryByTestId("shows-data-quality-clean")).toBeNull();
    expect(screen.queryByTestId("shows-data-quality-zero")).toBeNull();
  });

  it("T6: singular accessible name for total 1", () => {
    const summary: DataGapsSummary = {
      total: 1,
      classes: { FIELD_UNREADABLE: 1, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 0 },
    };
    render(<ShowsTable rows={[row({ slug: "one", dataGaps: summary })]} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.getByRole("img", { name: expectedBadgeName(summary) })).toHaveAccessibleName(
      "1 data gap: 1 unreadable field",
    );
  });
```

- [ ] **Step 2: Run to verify they fail.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/ShowsTable.test.tsx -t "T4|T5|T6"`
Expected: FAIL — no `role="img"` / testid found.

- [ ] **Step 3: Create `components/admin/DataQualityBadge.tsx`.**

```tsx
// parse-data-quality-warnings badge (spec §3) — a compact warning glyph next to a
// show's title on the admin watched-folder rows, shown iff the show has ≥1
// data-quality gap. Shared by ShowsTable (active) + ArchivedShowRow (archived).
// Pure presentational (no hooks/state) → safe in a client island OR an RSC.
// PLAIN-LANGUAGE accessible name only — never the raw §12.4 code (invariant 5).
import { TriangleAlert } from "lucide-react";
import { dataGapClassDetails, type DataGapsSummary } from "@/lib/parser/dataGaps";

export function DataQualityBadge({
  slug,
  dataGaps,
}: {
  slug: string;
  dataGaps: DataGapsSummary | undefined;
}) {
  if (!dataGaps || dataGaps.total === 0) return null; // instant, no animation (§4.2)
  const breakdown = dataGapClassDetails(dataGaps)
    .map((d) => `${d.count} ${d.label}`)
    .join(", ");
  const label = `${dataGaps.total} data ${dataGaps.total === 1 ? "gap" : "gaps"}: ${breakdown}`;
  return (
    <span
      data-testid={`shows-data-quality-${slug}`}
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center text-status-warn-text"
    >
      <TriangleAlert aria-hidden="true" className="size-3.5" />
    </span>
  );
}
```

- [ ] **Step 4: Wire into `ShowsTable`.** Add after `:33`:

```ts
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
```

In the title container (`:460-472`), insert the badge between the title span and the inline pill:

```tsx
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 wrap-break-word text-sm font-semibold text-text-strong">
                          {rowTitle(row)}
                        </span>
                        <DataQualityBadge slug={row.slug} dataGaps={row.dataGaps} />
                        <span className="min-[960px]:hidden">
                          <StatePill row={row} place="inline" />
                        </span>
                      </div>
```

- [ ] **Step 5: Run to verify pass + typecheck.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/ShowsTable.test.tsx && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/DataQualityBadge.tsx components/admin/ShowsTable.tsx tests/components/admin/ShowsTable.test.tsx
git commit --no-verify -m "feat(admin): data-quality badge component + ShowsTable wiring"
```

---

### Task 4: Wire the badge into `ArchivedShowRow`

**Files:**
- Modify: `components/admin/ArchivedShowRow.tsx` (import :29-31; title container :51-63)
- Test: `tests/components/admin/Dashboard-archived.test.tsx` (imports `ArchivedShowRow` at :9)

**Interfaces:** Consumes `DataQualityBadge` (Task 3); `row.dataGaps`.

- [ ] **Step 1: Write the failing test (T7-archived) — role + derived name.** In `tests/components/admin/Dashboard-archived.test.tsx`, add (import `dataGapClassDetails`, `type DataGapsSummary` from `@/lib/parser/dataGaps`; ensure `const now = new Date("2026-06-03T12:00:00.000Z");` exists):

```ts
  it("T7: archived row shows the data-quality badge (role=img, derived name)", () => {
    const summary: DataGapsSummary = {
      total: 2,
      classes: { FIELD_UNREADABLE: 0, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 2 },
    };
    const breakdown = dataGapClassDetails(summary).map((d) => `${d.count} ${d.label}`).join(", ");
    render(
      <ArchivedShowRow
        row={{
          id: "arch1",
          slug: "arch1",
          title: "Archived One",
          showDateStart: null,
          showDateEnd: null,
          crewCount: 0,
          lastSyncedAt: null,
          lastSyncStatus: null,
          published: false,
          isLive: false,
          finalizeOwned: false,
          archivedAt: "2026-06-01T00:00:00.000Z",
          dataGaps: summary,
        }}
        now={now}
        unarchiveAction={async () => {}}
      />,
    );
    expect(screen.getByRole("img", { name: `2 data gaps: ${breakdown}` })).toHaveAttribute(
      "data-testid",
      "shows-data-quality-arch1",
    );
  });
```

- [ ] **Step 2: Run to verify it fails.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard-archived.test.tsx -t "T7"`
Expected: FAIL — testid/role not found.

- [ ] **Step 3: Wire the badge in.** Add after `:31` in `ArchivedShowRow.tsx`:

```ts
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
```

In the title container (`:52-63`), insert the badge between the title span and the Archived pill:

```tsx
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-text-strong">
            {row.title ?? row.slug}
          </span>
          <DataQualityBadge slug={row.slug} dataGaps={row.dataGaps} />
          <span
            data-testid={`archived-pill-${row.slug}`}
            className="inline-flex items-center gap-1 self-center rounded-pill border border-status-idle px-2 py-0.5 text-xs font-semibold text-status-idle-text"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-status-idle" />
            Archived
          </span>
        </div>
```

- [ ] **Step 4: Run to verify pass.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard-archived.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/ArchivedShowRow.tsx tests/components/admin/Dashboard-archived.test.tsx
git commit --no-verify -m "feat(admin): data-quality badge on archived rows"
```

---

### Task 5: Extend the data-gaps transition audit

**Files:**
- Modify: `tests/components/admin/dataGapsTransitionAudit.test.tsx` (`DATA_GAP_SOURCE_FILES` :49-54; inventory comment :14-20)

- [ ] **Step 1: Add the new source files.** Extend `DATA_GAP_SOURCE_FILES` (`:49-54`) to:

```ts
const DATA_GAP_SOURCE_FILES = [
  "components/admin/ShowsTable.tsx",
  "components/admin/wizard/Step3SheetCard.tsx",
  "components/admin/PerShowAlertSection.tsx",
  "app/admin/show/[slug]/page.tsx",
  "components/admin/DataQualityBadge.tsx",
  "components/admin/ArchivedShowRow.tsx",
  "components/admin/Dashboard.tsx",
] as const;
```

- [ ] **Step 2: Add three inventory rows to the comment table** (`:14-20`, after the existing four):

```
//   | Data-quality badge (ShowsTable) | early-return null when total===0     | INSTANT   |
//   | Data-quality badge (Archived)   | early-return null when total===0     | INSTANT   |
//   | Degraded-read notice (Dashboard)| `dataGapsDegraded ? … : null`        | INSTANT   |
```

- [ ] **Step 3: Run the audit.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/dataGapsTransitionAudit.test.tsx`
Expected: PASS — none of the new files import framer-motion/`AnimatePresence`.

- [ ] **Step 4: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add tests/components/admin/dataGapsTransitionAudit.test.tsx
git commit --no-verify -m "test(admin): extend data-gap transition audit for badge + degraded notice"
```

---

### Task 6: Structural layout assertion + DQ-1 DEFERRED extension

**Files:**
- Modify: `tests/components/admin/dataGapsChipRowLayout.test.tsx` (append badge structural test)
- Modify: `DEFERRED.md` (DQ-1 entry ~:104-114 — extend the N/A surface list)

**Rationale (spec §4.1 / §5 T-L / DQ-1):** the AGENTS.md real-browser `getBoundingClientRect` height-equality mandate is **N/A** for data-gap surfaces — the badge sits in a CONTENT-height `flex items-center` container (`ShowsTable`/`ArchivedShowRow` title rows), NOT a fixed-height/width parent with stretch-dependent children. Same determination the repo already made (this test file's header + DQ-1). So this is a **jsdom structural** test + a DQ-1 surface-list extension. NOT a new Playwright spec.

- [ ] **Step 1: Write the structural test.** Append to `tests/components/admin/dataGapsChipRowLayout.test.tsx` (its `gaps(n)` + `row()` factories already exist at the top of the file):

```ts
  it("badge sits in the title container with items-center + shrink-0, before the inline pill (ShowsTable)", () => {
    render(
      <ShowsTable rows={[row({ slug: "gaps", isLive: true, dataGaps: gaps(2) })]} now={now} activeCount={1} overflowCount={0} />,
    );
    const badge = screen.getByTestId("shows-data-quality-gaps");
    expect(badge.className).toContain("shrink-0"); // long title cannot compress it away
    const titleContainer = badge.parentElement!;
    expect(titleContainer.className).toContain("items-center"); // Tailwind v4 has no default stretch
    const kids = Array.from(titleContainer.children);
    const titleIdx = kids.findIndex((k) => k.textContent?.includes("Title gaps"));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(badge)).toBeGreaterThan(titleIdx); // title precedes badge
  });
```

- [ ] **Step 2: Run to verify it passes** (Task 3 already shipped the structure).

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/dataGapsChipRowLayout.test.tsx`
Expected: PASS.

- [ ] **Step 3: Extend the DQ-1 DEFERRED entry.** In `DEFERRED.md`, in the DQ-1 entry's enumerated surface list (the bullet list under "What", ~:106), add:

```md
  - **badge (ShowsTable title row)** — `flex items-center gap-2` content-height title container (`components/admin/ShowsTable.tsx`); intrinsically-sized `size-3.5` glyph, `shrink-0`. Same N/A rationale.
  - **badge (ArchivedShowRow title row)** — same `flex items-center gap-2` container (`components/admin/ArchivedShowRow.tsx`). Same N/A rationale.
```

(Keep the existing N/A rationale + trigger; the badge is the same content-height `items-center` shape, so the real-browser height-equality assertion stays N/A.)

- [ ] **Step 4: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add tests/components/admin/dataGapsChipRowLayout.test.tsx DEFERRED.md
git commit --no-verify -m "test(admin): structural layout assertion for data-quality badge; extend DQ-1 deferral"
```

---

### Task 7: Invariant-8 impeccable dual-gate (UI)

**Files (evaluated):** `components/admin/DataQualityBadge.tsx`, `components/admin/ShowsTable.tsx`, `components/admin/ArchivedShowRow.tsx`, `components/admin/Dashboard.tsx`.

- [ ] **Step 1: Full pre-gate baseline.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
pnpm vitest run tests/admin tests/components/admin && pnpm typecheck && pnpm format:check
```
Expected: green. Fix prettier drift with `pnpm prettier --write <files>` (NEVER the master spec).

- [ ] **Step 2: `/impeccable critique`** on the four UI files (canonical v3 preflight: PRODUCT.md / DESIGN.md / register / preflight signal). Capture findings.

- [ ] **Step 3: `/impeccable audit`** on the same diff. Capture findings.

- [ ] **Step 4: Disposition.** Every HIGH/CRITICAL: FIX (new failing test first if behavioral) OR add a `DEFERRED.md` entry with rationale. MEDIUM/LOW: fix if cheap. Record findings + dispositions for the PR body.

- [ ] **Step 5: Commit any fixes** (conventional-commits, one commit per coherent fix).

---

## Self-Review (author checklist)

1. **Spec coverage:** §2.1 readDataGaps → Task 1; §2.2 degrade-visible flag → Task 1, notice → Task 2; §2.3 row population → Task 1; §3.1 component → Task 3; §3.2 two sites → Task 3 + Task 4; §3.5 notice → Task 2; §4.2 transitions → Task 5; §5 tests T1/T2/T3/T3b/T3c/T4/T5/T6/T7 → Tasks 1/2/3/4; §5 meta-test extension → Task 1 (folded, red-first — TDD compliant); §5 T-L layout (jsdom + DQ-1) → Task 6; invariant-8 → Task 7. No gap.
2. **Placeholder scan:** every code step has complete code; no TBD/TODO.
3. **Type consistency:** `DataQualityBadge` signature identical Task 3 (def) / Task 4 (use); `dataGapsDegraded` boolean identical Task 1 (type/return) / Task 2 (read); `readDataGaps` return type identical across Task 1 steps; `expectedBadgeName`/derived-name pattern identical across Tasks 3/4/6.
4. **TDD-per-task:** every task writes its failing test(s) before implementation, including Task 1's `_metaInfraContract` behavioral test (red at Step 4, green at Step 12).

## Meta-test inventory (declared)

- **EXTEND** `tests/admin/_metaInfraContract.test.ts` (Task 1) — new `shows_internal` degrade-visible boundary (behavioral test red-first + registry string).
- **EXTEND** `tests/components/admin/dataGapsTransitionAudit.test.tsx` (Task 5) — 3 new source files.
- **EXTEND** `tests/components/admin/dataGapsChipRowLayout.test.tsx` + `DEFERRED.md` DQ-1 (Task 6).
- **RE-RUN (no change)** `tests/admin/_metaBoundedReads.test.ts` (Task 1 Step 12) — `shows_internal` is non-`UNBOUNDED_TABLES`; guards comment-fragility.
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched.

## Execution note

Tasks 1→7 are sequential (Task 2 needs Task 1's flag; Task 3/4 share the component; Task 5/6 need the shipped files; Task 7 gates the whole UI diff). One commit per task. After Task 7, the ship pipeline resumes at Stage 4 (whole-diff Codex review → CI → merge).
