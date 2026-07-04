# Data-Quality Badge on Watched-Folder Rows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a compact warning-glyph "data quality" badge next to each show's title on the admin watched-folder table (active + archived), populated from `shows_internal.parse_warnings`, with a visible degraded-read notice when that read faults.

**Architecture:** `fetchDashboardData` gains one bounded, fail-soft `shows_internal` read (wave-2 fan-out) that summarizes per-show parse warnings into `ActiveShowRow.dataGaps`; a typed `infra_error` at the boundary degrades **visibly** via a new `dataGapsDegraded` flag + calm notice. A new shared `DataQualityBadge` renders the icon in both `ShowsTable` (active) and `ArchivedShowRow` (archived).

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase (`@supabase/ssr`), TypeScript (`exactOptionalPropertyTypes`), Tailwind v4, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-04-data-quality-badge-shows-table.md` (Codex-APPROVED, 5 rounds).

## Global Constraints

- **Invariant 9 (Supabase call-boundary):** every Supabase call destructures `{ data, error }` (NOT bare `data`); returned-error and thrown-error are distinct; infra faults surface as typed `{ kind: "infra_error", message }`; never a silent `continue`. New read is registered in `tests/admin/_metaInfraContract.test.ts`.
- **Invariant 5 (no raw error codes in UI):** all user-visible copy is plain language; NO raw §12.4 code literal (`FIELD_UNREADABLE` / `UNKNOWN_SECTION_HEADER` / `BLOCK_DISAPPEARED`) ever rendered.
- **Invariant 8 (UI quality gate):** every `components/` file touched (`DataQualityBadge.tsx`, `ShowsTable.tsx`, `ArchivedShowRow.tsx`, `Dashboard.tsx`) passes `/impeccable critique` + `/impeccable audit`; HIGH/CRITICAL fixed or deferred in `DEFERRED.md` before cross-model review (Task 8).
- **`exactOptionalPropertyTypes`:** `dataGaps` is set via **conditional spread** so the key is ABSENT (not `undefined`) on clean rows — never `dataGaps: x ?? undefined`.
- **Data source = the three data-gap classes only** (`summarizeDataGaps`); no autocorrect / operator-actionable warnings.
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`), `--no-verify` (shared hooks belong to the main checkout); run `pnpm format:check` + `pnpm typecheck` before the final push.
- **No DB migration, no §12.4 code, no advisory locks, no new meta-test files** — this milestone EXTENDS `_metaInfraContract.test.ts` + `dataGapsTransitionAudit.test.tsx` + `dataGapsChipRowLayout.test.tsx` and the `DEFERRED.md` DQ-1 entry.

## File Structure

- **Modify** `components/admin/Dashboard.tsx` — new `readDataGaps` wave-2 read; `dataGapsDegraded` on `DashboardData`; per-row `dataGaps` population; §3.5 degraded notice.
- **Create** `components/admin/DataQualityBadge.tsx` — shared pure presentational badge.
- **Modify** `components/admin/ShowsTable.tsx` — render `DataQualityBadge` in the row title container.
- **Modify** `components/admin/ArchivedShowRow.tsx` — render `DataQualityBadge` in the archived title container.
- **Modify (tests)** `tests/admin/fetchDashboardData.test.ts`, `tests/components/admin/Dashboard.test.tsx`, `tests/admin/_metaInfraContract.test.ts`, `tests/components/admin/ShowsTable.test.tsx`, `tests/components/admin/Dashboard-archived.test.tsx`, `tests/components/admin/dataGapsTransitionAudit.test.tsx`, `tests/components/admin/dataGapsChipRowLayout.test.tsx`.
- **Modify (docs)** `DEFERRED.md` — extend the DQ-1 surface list.

`lib/parser/dataGaps.ts` (`summarizeDataGaps`, `dataGapClassDetails`, `DataGapsSummary`) and `lib/admin/showDisplay.ts` (`ActiveShowRow.dataGaps?`) are UNCHANGED — the plumbing already exists.

---

### Task 1: Data layer — `readDataGaps` + `dataGapsDegraded` flag + row population

**Files:**
- Modify: `components/admin/Dashboard.tsx` (imports ~:19-40; `DashboardData` type :57-79; wave-2 Promise.all :353-364; call-site :366-374; row map :377-400)
- Test: `tests/admin/fetchDashboardData.test.ts` (recording mock `Seed` :9-19 + `resolve()` :94-107; new tests appended)

**Interfaces:**
- Produces: `readDataGaps(): Promise<Map<string, DataGapsSummary> | InfraResult>` (module-local closure inside `fetchDashboardData`); `DashboardData.dataGapsDegraded: boolean`; each `ActiveShowRow` may carry `dataGaps?: DataGapsSummary` (already in the type at `lib/admin/showDisplay.ts:50`).
- Consumes: `summarizeDataGaps` (`lib/parser/dataGaps.ts:53`), `type DataGapsSummary` (`:19`), `type ParseWarning` (`lib/parser/types.ts`), the existing `InfraResult` sentinel + `isInfra` (`Dashboard.tsx:238-240`), `activeShowIds` (`Dashboard.tsx:233`).

- [ ] **Step 1: Extend the test recording mock for `shows_internal`.** In `tests/admin/fetchDashboardData.test.ts`, add two `Seed` fields and a `resolve()` branch.

In the `Seed` type (after `syncCount?: number;`, ~:18):

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

- [ ] **Step 2: Write the failing tests (T1/T2/T3-returned-error/T3c).** Append to the main `describe` in `tests/admin/fetchDashboardData.test.ts`. `summarizeDataGaps` counts warn-severity DQ warnings; build fixtures with `severity: "warn"` + the real codes.

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
    const clean = result.rows.find((r) => r.slug === "clean")!;
    expect("dataGaps" in clean).toBe(false); // ABSENT, not undefined
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

- [ ] **Step 3: Run to verify they fail.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/admin/fetchDashboardData.test.ts -t "T1|T2|T3"`
Expected: FAIL — `dataGaps`/`dataGapsDegraded` undefined (property absent on the returned shape).

- [ ] **Step 4: Add imports to `Dashboard.tsx`.** After the existing `@/lib/admin/showDisplay` import (`:21`):

```ts
import { summarizeDataGaps, type DataGapsSummary } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";
```

- [ ] **Step 5: Add `dataGapsDegraded` to `DashboardData`.** Inside the `DashboardData` type, after `ignoredDegraded: boolean;` (`:78`):

```ts
  // Data-quality read (shows_internal.parse_warnings) faulted → badges suppressed
  // and a visible calm notice shown (§3.5). Degrade-VISIBLE, never silent
  // (invariant 9; mirrors ignoredDegraded + the per-show panel's failed:true).
  dataGapsDegraded: boolean;
```

- [ ] **Step 6: Add the `readDataGaps` closure.** Place it next to `readCrewCounts` (after its definition, ~:305, before the wave-2 `Promise.all`). Copy verbatim:

```ts
  // parse-data-quality-warnings badge (spec §2.1) — per-show data-gaps summary
  // from shows_internal.parse_warnings. Boundary returns a typed infra_error
  // (invariant 9, registered in _metaInfraContract); the CALLER degrades VISIBLE
  // (§2.2). shows_internal.show_id is a PK → .in(show_id) is a 1:1 lookup, ≤ the
  // already-capped id set (non-UNBOUNDED table → no .limit() needed).
  const readDataGaps = async (): Promise<Map<string, DataGapsSummary> | InfraResult> => {
    const byShow = new Map<string, DataGapsSummary>();
    if (activeShowIds.length === 0) return byShow; // no .in([]) (R28)
    try {
      const { data, error } = await supabase
        .from("shows_internal")
        .select("show_id, parse_warnings")
        .in("show_id", activeShowIds);
      if (error) {
        return { kind: "infra_error", message: `shows_internal data-gaps query failed: ${error.message}` };
      }
      for (const r of (data ?? []) as ReadonlyArray<{ show_id: string; parse_warnings: unknown }>) {
        // Defensive per-row: parse_warnings is plain jsonb (no array/element CHECK).
        // Non-array → skip; a bad element (e.g. [null]) → summarizeDataGaps throws,
        // caught per-row so one corrupt row can't degrade every badge (spec §2.1).
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

- [ ] **Step 7: Add `readDataGaps()` to the wave-2 `Promise.all` and degrade at the call site.** Change the destructuring array (`:353-362`) to include `dataGapsResult` as a NON-fatal member (add after `loadIgnoredSheets({ supabase })`):

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

Then, next to the `ignoredSheets`/`ignoredDegraded` handling (`:373-374`), add:

```ts
  // Degrade VISIBLE, NOT dashboard-wide short-circuit (spec §2.2).
  const dataGapsDegraded = isInfra(dataGapsResult);
  const dataGapsByShow: Map<string, DataGapsSummary> = dataGapsDegraded
    ? new Map()
    : dataGapsResult;
```

- [ ] **Step 8: Populate `dataGaps` on each row (conditional spread).** In the row map (`:386-399`), add a `const` before the `return` and spread the key. Insert just before `return {` (after the `finalizeOwned` line, ~:385):

```ts
    const gaps = dataGapsByShow.get(s.id as string);
```

Then inside the returned object literal, add as the LAST property (after `archivedAt: …,`):

```ts
      ...(gaps ? { dataGaps: gaps } : {}),
```

- [ ] **Step 9: Return `dataGapsDegraded`.** In the final `return { rows, bucket, … }` object of `fetchDashboardData` (`:406-419`), add after `ignoredDegraded,`:

```ts
    dataGapsDegraded,
```

- [ ] **Step 10: Run the tests to verify they pass.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/admin/fetchDashboardData.test.ts`
Expected: PASS (all new + existing tests).

- [ ] **Step 11: Typecheck (vitest strips types).**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm typecheck`
Expected: no errors. (Watch: `dataGapsByShow` typed `Map<string, DataGapsSummary>`; `gaps` narrowed for the spread.)

- [ ] **Step 12: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/Dashboard.tsx tests/admin/fetchDashboardData.test.ts
git commit --no-verify -m "feat(admin): populate per-show dataGaps + degraded flag in dashboard loader"
```

---

### Task 2: Visible degraded-read notice (`Dashboard()` render)

**Files:**
- Modify: `components/admin/Dashboard.tsx` (the shows `<section>` render, ~:497-585)
- Test: `tests/components/admin/Dashboard.test.tsx` (harness `emptyClient` ~:31-47 + a new degraded-render test)

**Interfaces:**
- Consumes: `result.dataGapsDegraded` (Task 1).
- Produces: a `data-testid="dashboard-data-quality-degraded"` `<p>` rendered once for both buckets.

- [ ] **Step 1: Write the failing test (T3b).** In `tests/components/admin/Dashboard.test.tsx`, first extend the mock client to error on `shows_internal` and seed one show. Add a hoisted flag near `state` (`:10`):

```ts
const dgState = vi.hoisted(() => ({ errorShowsInternal: false }));
```

Replace `emptyClient()` (`:31-47`) so it (a) returns one `shows` row when asked and (b) errors on `shows_internal` when the flag is set. Use this exact body:

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
          // seed one show so wave-2 (readDataGaps) actually runs
          return onf({ data: [{ id: "s1", slug: "s1", title: "S1", dates: null, venue: null, published: true, archived_at: null }], count: null, error: null });
        }
        return onf({ data: ctx.head ? null : [], count: 0, error: null });
      };
      return builder;
    },
  };
}
```

Add `beforeEach(() => { dgState.errorShowsInternal = false; });` if not already resetting, and the test:

```ts
  it("T3b: renders the degraded notice when the shows_internal read faults", async () => {
    dgState.errorShowsInternal = true;
    render(await Dashboard());
    expect(screen.getByTestId("dashboard-data-quality-degraded")).toBeInTheDocument();
    // invariant 5 — no raw code literal in the notice
    expect(screen.getByTestId("dashboard-data-quality-degraded").textContent).not.toMatch(
      /FIELD_UNREADABLE|UNKNOWN_SECTION_HEADER|BLOCK_DISAPPEARED/,
    );
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

- [ ] **Step 3: Render the notice.** In `Dashboard()`, inside the shows `<section>` (the one opened ~:498 with `aria-label={result.bucket === "archived" ? …}`), immediately BEFORE the `{result.bucket === "archived" ? (` ternary (~:507), insert:

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

### Task 3: Register the `shows_internal` read in the admin infra contract

**Files:**
- Modify: `tests/admin/_metaInfraContract.test.ts` (registry entry `:175`; `describe("fetchDashboardData")` block `:537-588`)

**Interfaces:**
- Consumes: `infraMock.throwOnFromTable` + `infraMock.dataByTable` (`:46-107`); `fetchDashboardData` degrade contract (Task 1/2).

- [ ] **Step 1: Write the failing behavioral test.** In the `describe("fetchDashboardData", …)` block (`:537`), after the `crew_members` test (~:587), add:

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

- [ ] **Step 2: Run to verify it fails, then passes against Task 1/2 code.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/admin/_metaInfraContract.test.ts -t "shows_internal"`
Expected: PASS (Task 1's `readDataGaps` throw → caught → `infra_error` → call-site degrade). If it FAILS, the degrade wiring (Task 1 Step 7) is wrong — fix there, not here.

- [ ] **Step 3: Update the registry contract string.** In the `infraRegistry` `fetchDashboardData` entry (`:175`), change the `contract` string to name the new read + its degrade posture:

```ts
    contract:
      "shows/crew/pending_ingestions/pending_syncs await throws → infra_error; the shows_internal.parse_warnings data-gaps read (readDataGaps) destructures { data, error } and returns a typed infra_error at the boundary, which the caller degrades VISIBLE (dataGapsDegraded → calm notice, §3.5), NEVER a silent empty — mirrors the per-show panel read at :322 (invariant 9)",
```

- [ ] **Step 4: Run the whole meta-test file.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/admin/_metaInfraContract.test.ts`
Expected: PASS (registry grep assertion + new behavioral test).

- [ ] **Step 5: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add tests/admin/_metaInfraContract.test.ts
git commit --no-verify -m "test(admin): register shows_internal data-gaps read (degrade-visible) in infra contract"
```

---

### Task 4: `DataQualityBadge` component + `ShowsTable` wiring

**Files:**
- Create: `components/admin/DataQualityBadge.tsx`
- Modify: `components/admin/ShowsTable.tsx` (imports :23/:33; title container :460-472)
- Test: `tests/components/admin/ShowsTable.test.tsx` (row factory :19-34; new tests)

**Interfaces:**
- Produces: `export function DataQualityBadge({ slug, dataGaps }: { slug: string; dataGaps: DataGapsSummary | undefined }): JSX.Element | null` — renders `null` when `!dataGaps || dataGaps.total === 0`; else a `role="img"` span with `data-testid={`shows-data-quality-${slug}`}`, `aria-label`/`title` = plain-language breakdown, containing a lucide `TriangleAlert` glyph.
- Consumes: `dataGapClassDetails` (`lib/parser/dataGaps.ts:94`), `type DataGapsSummary` (`:19`), `TriangleAlert` (`lucide-react`).

- [ ] **Step 1: Write the failing tests (T4/T5/T6).** Append to `describe("ShowsTable")` in `tests/components/admin/ShowsTable.test.tsx`:

```ts
  it("T4: renders a data-quality badge with an accessible breakdown, no raw code literal", () => {
    render(
      <ShowsTable
        rows={[
          row({
            slug: "gaps",
            dataGaps: { total: 3, classes: { FIELD_UNREADABLE: 2, UNKNOWN_SECTION_HEADER: 1, BLOCK_DISAPPEARED: 0 } },
          }),
        ]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const badge = screen.getByTestId("shows-data-quality-gaps");
    const name = badge.getAttribute("aria-label")!;
    expect(name).toContain("3 data gaps");
    expect(name).toContain("2 unreadable fields");
    expect(name).toContain("1 unknown section");
    expect(name).not.toMatch(/FIELD_UNREADABLE|UNKNOWN_SECTION_HEADER|BLOCK_DISAPPEARED/);
  });

  it("T5: renders NO badge when dataGaps is absent or total 0", () => {
    render(
      <ShowsTable
        rows={[
          row({ slug: "clean" }), // no dataGaps
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

  it("T6: singular label for total 1", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "one", dataGaps: { total: 1, classes: { FIELD_UNREADABLE: 1, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 0 } } })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const name = screen.getByTestId("shows-data-quality-one").getAttribute("aria-label")!;
    expect(name).toContain("1 data gap");
    expect(name).not.toContain("1 data gaps");
  });
```

- [ ] **Step 2: Run to verify they fail.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/ShowsTable.test.tsx -t "T4|T5|T6"`
Expected: FAIL — testid not found.

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

- [ ] **Step 4: Wire into `ShowsTable`.** Add the import after `:33`:

```ts
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
```

In the title container (`:460-472`), insert the badge between the title span and the inline pill span. The block becomes:

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

- [ ] **Step 5: Run to verify pass.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/ShowsTable.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/DataQualityBadge.tsx components/admin/ShowsTable.tsx tests/components/admin/ShowsTable.test.tsx
git commit --no-verify -m "feat(admin): data-quality badge component + ShowsTable wiring"
```

---

### Task 5: Wire the badge into `ArchivedShowRow`

**Files:**
- Modify: `components/admin/ArchivedShowRow.tsx` (import :29-31; title container :51-63)
- Test: `tests/components/admin/Dashboard-archived.test.tsx` (imports `ArchivedShowRow` at :9)

**Interfaces:**
- Consumes: `DataQualityBadge` (Task 4); `row.dataGaps` on the passed `ActiveShowRow`.

- [ ] **Step 1: Write the failing test (T7-archived).** In `tests/components/admin/Dashboard-archived.test.tsx`, add a focused `ArchivedShowRow` render test (mirroring the existing `:215` direct-render test):

```ts
  it("T7: archived row shows the data-quality badge when the row has gaps", () => {
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
          dataGaps: { total: 2, classes: { FIELD_UNREADABLE: 0, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 2 } },
        }}
        now={now}
        unarchiveAction={async () => {}}
      />,
    );
    const badge = screen.getByTestId("shows-data-quality-arch1");
    expect(badge.getAttribute("aria-label")).toContain("2 data gaps");
    expect(badge.getAttribute("aria-label")).toContain("2 removed sections");
  });
```

(If `now` is not already defined in this file, add `const now = new Date("2026-06-03T12:00:00.000Z");` near the top.)

- [ ] **Step 2: Run to verify it fails.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard-archived.test.tsx -t "T7"`
Expected: FAIL — testid not found.

- [ ] **Step 3: Wire the badge in.** Add the import after `:31` in `ArchivedShowRow.tsx`:

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

### Task 6: Extend the data-gaps transition audit

**Files:**
- Modify: `tests/components/admin/dataGapsTransitionAudit.test.tsx` (`DATA_GAP_SOURCE_FILES` :49-54; inventory comment :14-20)

**Interfaces:**
- Consumes: the new source files from Tasks 2/4/5.

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

- [ ] **Step 2: Add the three inventory rows to the comment table** (`:14-20`, after the existing four rows) — documentation, keeps the audit's inventory honest:

```
//   | Data-quality badge (ShowsTable) | early-return null when total===0     | INSTANT   |
//   | Data-quality badge (Archived)   | early-return null when total===0     | INSTANT   |
//   | Degraded-read notice (Dashboard)| `dataGapsDegraded ? … : null`        | INSTANT   |
```

- [ ] **Step 3: Run the audit.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/dataGapsTransitionAudit.test.tsx`
Expected: PASS — none of the new files import framer-motion/`AnimatePresence`, so the blanket grep is clean.

- [ ] **Step 4: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add tests/components/admin/dataGapsTransitionAudit.test.tsx
git commit --no-verify -m "test(admin): extend data-gap transition audit for badge + degraded notice"
```

---

### Task 7: Structural layout assertions + DQ-1 DEFERRED extension

**Files:**
- Modify: `tests/components/admin/dataGapsChipRowLayout.test.tsx` (append badge structural tests)
- Modify: `DEFERRED.md` (DQ-1 entry `:104-114` — extend the surface list)

**Interfaces:** none new — pins the DOM structure of the Task 4/5 insertions.

**Rationale (do not skip):** per the existing `dataGapsChipRowLayout.test.tsx` header + `DEFERRED.md` DQ-1, the AGENTS.md real-browser `getBoundingClientRect` height-equality mandate is **N/A** for data-gap surfaces — the badge sits in a CONTENT-height `flex items-center` container (`ShowsTable.tsx` title row / `ArchivedShowRow.tsx` title row), NOT a fixed-height/width parent with stretch-dependent children. So this is a **jsdom structural** test (placement + `items-center` + `shrink-0`), and the badge is added to the DQ-1 N/A surface list. The spec §4.1 concurs.

- [ ] **Step 1: Write the structural tests.** Append to `tests/components/admin/dataGapsChipRowLayout.test.tsx`:

```ts
  it("badge is a child of the title container, positioned before the inline status pill (ShowsTable)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "gaps", isLive: true, dataGaps: gaps(2) })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const badge = screen.getByTestId("shows-data-quality-gaps");
    // shrink-0 so a long title cannot compress the badge away
    expect(badge.className).toContain("shrink-0");
    // parent title container carries items-center (Tailwind v4 has no default stretch)
    const titleContainer = badge.parentElement!;
    expect(titleContainer.className).toContain("items-center");
    // ordering: the title text precedes the badge within the container
    const kids = Array.from(titleContainer.children);
    const titleIdx = kids.findIndex((k) => k.textContent?.includes("Title gaps"));
    const badgeIdx = kids.indexOf(badge);
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(badgeIdx).toBeGreaterThan(titleIdx);
  });
```

- [ ] **Step 2: Run to verify it passes** (Task 4 already shipped the structure).

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/dataGapsChipRowLayout.test.tsx`
Expected: PASS.

- [ ] **Step 3: Extend the DQ-1 DEFERRED entry.** In `DEFERRED.md`, in the DQ-1 entry's "What" bullet (~:106), add the badge surfaces to the enumerated N/A list so the deferral explicitly covers them:

```md
  - **badge (ShowsTable title row)** — `flex items-center gap-2` content-height title container (`components/admin/ShowsTable.tsx`); intrinsically-sized `size-3.5` glyph, `shrink-0`.
  - **badge (ArchivedShowRow title row)** — same `flex items-center gap-2` container (`components/admin/ArchivedShowRow.tsx`).
```

(Keep the existing N/A rationale + trigger; the badge is the same content-height `items-center` shape, so the real-browser height-equality assertion stays N/A.)

- [ ] **Step 4: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add tests/components/admin/dataGapsChipRowLayout.test.tsx DEFERRED.md
git commit --no-verify -m "test(admin): structural layout assertions for data-quality badge; extend DQ-1 deferral"
```

---

### Task 8: Invariant-8 impeccable dual-gate (UI)

**Files (evaluated, not necessarily changed):** `components/admin/DataQualityBadge.tsx`, `components/admin/ShowsTable.tsx`, `components/admin/ArchivedShowRow.tsx`, `components/admin/Dashboard.tsx`.

- [ ] **Step 1: Run the full test suite + typecheck + format once, as the pre-gate baseline.**

Run:
```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
pnpm vitest run tests/admin tests/components/admin && pnpm typecheck && pnpm format:check
```
Expected: all green. Fix any prettier drift with `pnpm prettier --write <files>` (NOT the master spec).

- [ ] **Step 2: `/impeccable critique`** on the UI diff (the four files above), with the canonical v3 preflight (PRODUCT.md / DESIGN.md / register / preflight signal). Capture findings.

- [ ] **Step 3: `/impeccable audit`** on the same diff. Capture findings.

- [ ] **Step 4: Disposition.** Every HIGH/CRITICAL: FIX in the relevant file (new failing test first if behavioral) OR add a `DEFERRED.md` entry with rationale. MEDIUM/LOW: fix if cheap, else note. Record findings + dispositions for the milestone handoff / PR body.

- [ ] **Step 5: Commit any fixes** (one commit per coherent fix, conventional-commits).

---

## Self-Review (author checklist — run after drafting, before Codex)

1. **Spec coverage:** §2.1 readDataGaps → Task 1; §2.2 degrade-visible → Task 1 (flag) + Task 2 (notice); §2.3 row population → Task 1; §3.1 component → Task 4; §3.2 two insertion sites → Task 4 + Task 5; §3.5 notice → Task 2; §4.2 transitions → Task 6; §5 tests T1/T2/T3/T3b/T3c/T4/T5/T6/T7 → Tasks 1/2/4/5; §5 meta-test extension → Task 3; layout → Task 7; invariant-8 → Task 8. No gap.
2. **Placeholder scan:** every code step contains complete code; no TBD/TODO.
3. **Type consistency:** `DataQualityBadge` signature identical in Task 4 (def), Task 5 (use); `dataGapsDegraded` boolean identical in Task 1 (type/return), Task 2 (read); `readDataGaps` return type identical across Task 1 steps.

## Meta-test inventory (declared)

- **EXTEND** `tests/admin/_metaInfraContract.test.ts` (Task 3) — new `shows_internal` degrade-visible boundary.
- **EXTEND** `tests/components/admin/dataGapsTransitionAudit.test.tsx` (Task 6) — 3 new source files.
- **EXTEND** `tests/components/admin/dataGapsChipRowLayout.test.tsx` + `DEFERRED.md` DQ-1 (Task 7).
- **No change** to `tests/admin/_metaBoundedReads.test.ts` (shows_internal is non-`UNBOUNDED_TABLES`).
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched.

## Execution note

Tasks 1→8 are sequential (Task 2 depends on Task 1's flag; Task 3 on Task 1's degrade; Tasks 4/5 share the component; Task 6/7 need the shipped files; Task 8 gates the whole UI diff). Execute in order, one commit per task. After Task 8, the ship pipeline resumes at Stage 4 (whole-diff Codex review → CI → merge).
