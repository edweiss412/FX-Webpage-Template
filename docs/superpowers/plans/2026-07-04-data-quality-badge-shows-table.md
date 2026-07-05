# Data-Quality Badge on Watched-Folder Rows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a compact warning-glyph "data quality" badge next to each show's title on the admin watched-folder table (active + archived), populated from `shows_internal.parse_warnings`, with a visible degraded-read notice when that read faults.

**Architecture:** `fetchDashboardData` gains one bounded, fail-soft `shows_internal` read (wave-2 fan-out) that summarizes per-show parse warnings into `ActiveShowRow.dataGaps`; a typed `infra_error` at the boundary degrades **visibly** via a new `dataGapsDegraded` flag + calm notice. A new shared `DataQualityBadge` renders the icon in both `ShowsTable` (active) and `ArchivedShowRow` (archived).

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase (`@supabase/ssr`), TypeScript (`exactOptionalPropertyTypes`), Tailwind v4, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-04-data-quality-badge-shows-table.md` (Codex-APPROVED).

## Global Constraints

- **Invariant 9 (Supabase call-boundary):** every Supabase call destructures `{ data, error }` (NOT bare `data`); returned-error and thrown-error are distinct; infra faults surface as typed `{ kind: "infra_error", message }`; never a silent `continue`. New read registered in `tests/admin/_metaInfraContract.test.ts` (Task 1).
- **Invariant 5 (no raw error codes in UI):** all user-visible copy is plain language; NO raw §12.4 code literal (`FIELD_UNREADABLE` / `UNKNOWN_SECTION_HEADER` / `BLOCK_DISAPPEARED`) ever rendered.
- **Invariant 8 (UI quality gate):** every `components/` file touched (`DataQualityBadge.tsx`, `ShowsTable.tsx`, `ArchivedShowRow.tsx`, `Dashboard.tsx`) passes `/impeccable critique` + `/impeccable audit`; HIGH/CRITICAL fixed or deferred in `DEFERRED.md` before cross-model review (Task 5).
- **`exactOptionalPropertyTypes`:** `dataGaps` set via **conditional spread** so the key is ABSENT (not `undefined`) on clean rows — never `dataGaps: x ?? undefined`.
- **TDD red-first, every task:** each task writes its failing test(s) BEFORE the code they exercise. The transition-audit and layout assertions are folded into the tasks that introduce each conditional (Tasks 2/3/4) so they are genuinely red before the code lands — NOT standalone passes-immediately guard tasks.
- **Structural meta-test comment/format fragility (repo lesson, PR #285):** a `;` inside a comment breaks `_metaBoundedReads` (splits on `;`); a comment between `supabase` and `.from` breaks `_metaInfraContract`'s window scan. Keep the `readDataGaps` read statement free of interior comments between `supabase` and `.from`; after editing `Dashboard.tsx` re-run BOTH `_metaBoundedReads.test.ts` AND `_metaInfraContract.test.ts` (Task 1 Step 12).
- **Data source = the three data-gap classes only** (`summarizeDataGaps`); no autocorrect / operator-actionable warnings.
- **Commit per task**, conventional-commits, `--no-verify`; run `pnpm format:check` + `pnpm typecheck` before the final push.
- **No DB migration, no §12.4 code, no advisory locks, no new meta-test files** — EXTENDS `_metaInfraContract.test.ts`, `dataGapsTransitionAudit.test.tsx`, `dataGapsChipRowLayout.test.tsx`, `DEFERRED.md` DQ-1.

## File Structure

- **Modify** `components/admin/Dashboard.tsx` — `readDataGaps`; `dataGapsDegraded`; per-row `dataGaps`; §3.5 notice.
- **Create** `components/admin/DataQualityBadge.tsx` — shared pure presentational badge.
- **Modify** `components/admin/ShowsTable.tsx`, `components/admin/ArchivedShowRow.tsx` — render the badge in the title container.
- **Modify (tests)** `tests/admin/fetchDashboardData.test.ts`, `tests/admin/_metaInfraContract.test.ts`, `tests/components/admin/Dashboard.test.tsx`, `tests/components/admin/ShowsTable.test.tsx`, `tests/components/admin/Dashboard-archived.test.tsx`, `tests/components/admin/dataGapsTransitionAudit.test.tsx`, `tests/components/admin/dataGapsChipRowLayout.test.tsx`.
- **Modify (docs)** `DEFERRED.md` — extend DQ-1 surface list.

`lib/parser/dataGaps.ts` and `lib/admin/showDisplay.ts` (`ActiveShowRow.dataGaps?` at `:50`) are UNCHANGED.

**Shared test helper (used in Tasks 3 + 4).** Both `ShowsTable.test.tsx` and `Dashboard-archived.test.tsx` define this locally (derive expected accessible name from the single source of truth `dataGapClassDetails`, NEVER hardcoded — anti-tautology):

```ts
import { dataGapClassDetails, type DataGapsSummary } from "@/lib/parser/dataGaps";
function expectedBadgeName(s: DataGapsSummary): string {
  const breakdown = dataGapClassDetails(s).map((d) => `${d.count} ${d.label}`).join(", ");
  return `${s.total} data ${s.total === 1 ? "gap" : "gaps"}: ${breakdown}`;
}
```

---

### Task 1: Data layer — `readDataGaps` + `dataGapsDegraded` flag + row population + infra-contract registration

TDD-per-task: the loader change, its focused tests, AND its `_metaInfraContract` behavioral test are all written red before implementation (`AGENTS.md:13`).

**Files:**
- Modify: `components/admin/Dashboard.tsx` (imports ~:19-40; `DashboardData` :57-79; wave-2 :353-364; call-site :366-374; row map :377-400; return :406-419)
- Test: `tests/admin/fetchDashboardData.test.ts` (`Seed` :9-19; `resolve()` :94-107)
- Test: `tests/admin/_metaInfraContract.test.ts` (registry :175; `describe("fetchDashboardData")` :537-588)

**Interfaces:**
- Produces: `readDataGaps(): Promise<Map<string, DataGapsSummary> | InfraResult>`; `DashboardData.dataGapsDegraded: boolean`; per-row `dataGaps?: DataGapsSummary` (type at `lib/admin/showDisplay.ts:50`).
- Consumes: `summarizeDataGaps` (`lib/parser/dataGaps.ts:53`), `type DataGapsSummary` (`:19`), `type ParseWarning` (`lib/parser/types.ts`), `InfraResult`/`isInfra` (`Dashboard.tsx:238-240`), `activeShowIds` (`:233`).

- [ ] **Step 1: Extend the recording mock.** In `tests/admin/fetchDashboardData.test.ts`, in `Seed` (after `syncCount?: number;`, ~:18):

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

- [ ] **Step 2: Write failing focused tests (T1/T2/T3/T3c).** Append to the main `describe`. (`published:true, dates:null, venue:null` is safe: `resolveShowTimezone(null)`→default, `deriveStart/End(null)`→null, `isShowLiveOnDate(null)`→false.)

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
    expect(result.rows.find((r) => r.slug === "rpas")!.dataGaps).toEqual({
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
    expect("dataGaps" in result.rows.find((r) => r.slug === "clean")!).toBe(false);
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
    expect(result.dataGapsDegraded).toBe(false);
    expect("dataGaps" in result.rows.find((r) => r.slug === "nonarray")!).toBe(false);
    expect("dataGaps" in result.rows.find((r) => r.slug === "badel")!).toBe(false);
    expect(result.rows.find((r) => r.slug === "valid")!.dataGaps?.total).toBe(1);
  });
```

- [ ] **Step 3: Write the failing `_metaInfraContract` behavioral test.** In `describe("fetchDashboardData", …)` (`:537`), after the `crew_members` test (~:587):

```ts
    test("from('shows_internal') throw → degrades VISIBLE (NOT infra_error): dataGapsDegraded, no rows dropped", async () => {
      infraMock.dataByTable = { shows: [{ id: "s1", slug: "rpas", drive_file_id: "df-1" }] };
      infraMock.throwOnFromTable = "shows_internal";
      const { fetchDashboardData } = await import("@/components/admin/Dashboard");
      const result = await fetchDashboardData();
      expect((result as { kind?: string }).kind).toBeUndefined();
      expect((result as { dataGapsDegraded: boolean }).dataGapsDegraded).toBe(true);
      expect((result as { rows: unknown[] }).rows.length).toBe(1);
    });
```

- [ ] **Step 4: Run to verify all new tests FAIL.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/admin/fetchDashboardData.test.ts tests/admin/_metaInfraContract.test.ts -t "T1|T2|T3|shows_internal"`
Expected: FAIL — `dataGaps`/`dataGapsDegraded` absent.

- [ ] **Step 5: Add imports to `Dashboard.tsx`** (after `:21`):

```ts
import { summarizeDataGaps, type DataGapsSummary } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";
```

- [ ] **Step 6: Add `dataGapsDegraded` to `DashboardData`** (after `ignoredDegraded: boolean;`, `:78`):

```ts
  // Data-quality read (shows_internal.parse_warnings) faulted → badges suppressed
  // and a visible calm notice shown. Degrade-VISIBLE, never silent (invariant 9).
  dataGapsDegraded: boolean;
```

- [ ] **Step 7: Add the `readDataGaps` closure** (next to `readCrewCounts`, ~:305; NO comment between `supabase` and `.from`):

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

- [ ] **Step 8: Add to wave-2 `Promise.all` + degrade at call site.** Change the destructuring (`:353-362`):

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

Next to `ignoredSheets`/`ignoredDegraded` (`:373-374`):

```ts
  // Degrade VISIBLE, NOT a dashboard-wide short-circuit (spec §2.2).
  const dataGapsDegraded = isInfra(dataGapsResult);
  const dataGapsByShow: Map<string, DataGapsSummary> = dataGapsDegraded ? new Map() : dataGapsResult;
```

- [ ] **Step 9: Populate `dataGaps` per row.** Before `return {` in the row map (~:385):

```ts
    const gaps = dataGapsByShow.get(s.id as string);
```

Inside the returned object literal, as the LAST property (after `archivedAt: …,`):

```ts
      ...(gaps ? { dataGaps: gaps } : {}),
```

- [ ] **Step 10: Return `dataGapsDegraded`** (final return, after `ignoredDegraded,`):

```ts
    dataGapsDegraded,
```

- [ ] **Step 11: Update the `_metaInfraContract` registry contract string** (`:175`):

```ts
    contract:
      "shows/crew/pending_ingestions/pending_syncs await throws → infra_error; the shows_internal.parse_warnings data-gaps read (readDataGaps) destructures { data, error } and returns a typed infra_error at the boundary, which the caller degrades VISIBLE (dataGapsDegraded → calm notice), NEVER a silent empty — mirrors the per-show panel read at :322 (invariant 9)",
```

- [ ] **Step 12: Run tests + BOTH admin meta-tests (comment-fragility) + typecheck.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
pnpm vitest run tests/admin/fetchDashboardData.test.ts tests/admin/_metaInfraContract.test.ts tests/admin/_metaBoundedReads.test.ts
pnpm typecheck
```
Expected: PASS all.

- [ ] **Step 13: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/Dashboard.tsx tests/admin/fetchDashboardData.test.ts tests/admin/_metaInfraContract.test.ts
git commit --no-verify -m "feat(admin): populate per-show dataGaps + degraded flag; register shows_internal read"
```

---

### Task 2: Visible degraded-read notice (`Dashboard()`) + its transition assertion

**Files:**
- Modify: `components/admin/Dashboard.tsx` (shows `<section>`, ~:497-585)
- Test: `tests/components/admin/Dashboard.test.tsx` (harness `emptyClient` ~:31-47)
- Test: `tests/components/admin/dataGapsTransitionAudit.test.tsx` (`DATA_GAP_SOURCE_FILES` :49-54; inventory :14-20)

**Interfaces:** Consumes `result.dataGapsDegraded` (Task 1). Produces `data-testid="dashboard-data-quality-degraded"`.

- [ ] **Step 1: Write failing behavioral tests (T3b) — the executable instant proof for the notice ternary.** In `tests/components/admin/Dashboard.test.tsx`, add near `state` (`:10`):

```ts
const dgState = vi.hoisted(() => ({ errorShowsInternal: false }));
```

Replace `emptyClient()` (`:31-47`) with the table-aware version:

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

Ensure `beforeEach(() => { dgState.errorShowsInternal = false; });` exists (add if missing). Then:

```ts
  it("T3b: renders the degraded notice when the shows_internal read faults (no raw code)", async () => {
    dgState.errorShowsInternal = true;
    render(await Dashboard());
    const notice = screen.getByTestId("dashboard-data-quality-degraded");
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).not.toMatch(/FIELD_UNREADABLE|UNKNOWN_SECTION_HEADER|BLOCK_DISAPPEARED/);
  });

  it("T3b: no degraded notice on a healthy read (instant unmount, no animation wrapper)", async () => {
    dgState.errorShowsInternal = false;
    render(await Dashboard());
    expect(screen.queryByTestId("dashboard-data-quality-degraded")).toBeNull();
  });
```

- [ ] **Step 2: Write the failing transition-audit assertion for the notice ternary (RED — the string is not in `Dashboard.tsx` yet).** In `tests/components/admin/dataGapsTransitionAudit.test.tsx`, add `"components/admin/Dashboard.tsx"` to `DATA_GAP_SOURCE_FILES` (`:49-54`), add the inventory comment row (`:14-20`):

```
//   | Degraded-read notice (Dashboard)| `dataGapsDegraded ? … : null`        | INSTANT   |
```

and add an explicit assertion (near the file's other `it` blocks) that pins the ternary shape + no motion:

```ts
  it("Dashboard degraded-read notice is an instant ternary, not an animated wrapper", () => {
    const s = src("components/admin/Dashboard.tsx");
    expect(s).toMatch(/dataGapsDegraded\s*\?/); // the notice is a plain ternary
    // the notice testid is NOT wrapped in AnimatePresence / motion
    expect(s).not.toMatch(/AnimatePresence[\s\S]*dashboard-data-quality-degraded/);
  });
```

- [ ] **Step 3: Run to verify FAIL.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx -t "T3b|instant ternary"`
Expected: FAIL — testid absent; `/dataGapsDegraded ?/` not found in `Dashboard.tsx`.

- [ ] **Step 4: Render the notice.** In `Dashboard()`, inside the shows `<section>` (opened ~:498), immediately BEFORE the `{result.bucket === "archived" ? (` ternary (~:507):

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

- [ ] **Step 5: Run to verify PASS.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/Dashboard.tsx tests/components/admin/Dashboard.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx
git commit --no-verify -m "feat(admin): visible degraded-read notice + instant-ternary transition assertion"
```

---

### Task 3: `DataQualityBadge` component + `ShowsTable` wiring (+ transition + layout assertions, red-first)

**Files:**
- Create: `components/admin/DataQualityBadge.tsx`
- Modify: `components/admin/ShowsTable.tsx` (imports :23/:33; title container :460-472)
- Test: `tests/components/admin/ShowsTable.test.tsx`, `tests/components/admin/dataGapsTransitionAudit.test.tsx`, `tests/components/admin/dataGapsChipRowLayout.test.tsx`
- Docs: `DEFERRED.md` (DQ-1)

**Interfaces:**
- Produces: `export function DataQualityBadge({ slug, dataGaps }: { slug: string; dataGaps: DataGapsSummary | undefined }): JSX.Element | null` — `null` when `!dataGaps || total===0`; else a `role="img"` span (`data-testid={`shows-data-quality-${slug}`}`) with `aria-label`/`title` = plain breakdown, wrapping `TriangleAlert`.
- Consumes: `dataGapClassDetails` (`lib/parser/dataGaps.ts:94`), `type DataGapsSummary` (`:19`), `TriangleAlert` (`lucide-react`).

- [ ] **Step 1: Write failing badge tests (T4/T5/T6) — role + derived name (add the `expectedBadgeName` helper + import to the file).** Append to `describe("ShowsTable")`:

```ts
  it("T4: badge is queryable by role=img with the derived accessible name; no raw code literal", () => {
    const summary: DataGapsSummary = { total: 3, classes: { FIELD_UNREADABLE: 2, UNKNOWN_SECTION_HEADER: 1, BLOCK_DISAPPEARED: 0 } };
    render(<ShowsTable rows={[row({ slug: "gaps", dataGaps: summary })]} now={now} activeCount={1} overflowCount={0} />);
    const badge = screen.getByRole("img", { name: expectedBadgeName(summary) }); // fails if role="img" dropped
    expect(badge).toHaveAttribute("data-testid", "shows-data-quality-gaps");
    expect(badge).toHaveAccessibleName(expectedBadgeName(summary));
    expect(badge.getAttribute("aria-label")).not.toMatch(/FIELD_UNREADABLE|UNKNOWN_SECTION_HEADER|BLOCK_DISAPPEARED/);
  });

  it("T5: renders NO badge when dataGaps is absent or total 0 (instant unmount)", () => {
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

  it("T6: singular derived accessible name for total 1", () => {
    const summary: DataGapsSummary = { total: 1, classes: { FIELD_UNREADABLE: 1, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 0 } };
    render(<ShowsTable rows={[row({ slug: "one", dataGaps: summary })]} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.getByRole("img", { name: expectedBadgeName(summary) })).toHaveAccessibleName(expectedBadgeName(summary));
  });
```

Add at the top of the file (imports + helper):

```ts
import { dataGapClassDetails, type DataGapsSummary } from "@/lib/parser/dataGaps";
function expectedBadgeName(s: DataGapsSummary): string {
  const breakdown = dataGapClassDetails(s).map((d) => `${d.count} ${d.label}`).join(", ");
  return `${s.total} data ${s.total === 1 ? "gap" : "gaps"}: ${breakdown}`;
}
```

- [ ] **Step 2: Write the failing transition + layout assertions (RED — the badge file/DOM doesn't exist yet).**

In `tests/components/admin/dataGapsTransitionAudit.test.tsx`: add `"components/admin/DataQualityBadge.tsx"` to `DATA_GAP_SOURCE_FILES` (`:49-54`), add the inventory comment row `//   | Data-quality badge (ShowsTable) | early-return null when total===0 | INSTANT |`, and add:

```ts
  it("DataQualityBadge is an instant early-return null, not an animated presence", () => {
    const s = src("components/admin/DataQualityBadge.tsx"); // RED: file doesn't exist yet
    expect(s).toMatch(/return null/); // instant unmount branch
    expect(s).not.toMatch(/AnimatePresence|framer-motion|motion\./);
  });
```

In `tests/components/admin/dataGapsChipRowLayout.test.tsx` (its `gaps(n)`/`row()` factories exist at top), append:

```ts
  it("badge sits in the ShowsTable title container with items-center + shrink-0, before the inline pill", () => {
    render(<ShowsTable rows={[row({ slug: "gaps", isLive: true, dataGaps: gaps(2) })]} now={now} activeCount={1} overflowCount={0} />);
    const badge = screen.getByTestId("shows-data-quality-gaps"); // RED: badge not wired yet
    expect(badge.className).toContain("shrink-0");
    const titleContainer = badge.parentElement!;
    expect(titleContainer.className).toContain("items-center");
    const kids = Array.from(titleContainer.children);
    const titleIdx = kids.findIndex((k) => k.textContent?.includes("Title gaps"));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(badge)).toBeGreaterThan(titleIdx);
  });
```

- [ ] **Step 3: Run to verify all FAIL.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/ShowsTable.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx tests/components/admin/dataGapsChipRowLayout.test.tsx -t "T4|T5|T6|early-return|title container"`
Expected: FAIL (component missing → role/testid absent; `DataQualityBadge.tsx` readFileSync throws).

- [ ] **Step 4: Create `components/admin/DataQualityBadge.tsx`.**

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

- [ ] **Step 5: Wire into `ShowsTable`.** Add after `:33`:

```ts
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
```

In the title container (`:460-472`):

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

- [ ] **Step 6: Extend `DEFERRED.md` DQ-1 (ShowsTable surface).** In the DQ-1 entry's enumerated surface list (~:106), add:

```md
  - **badge (ShowsTable title row)** — `flex items-center gap-2` content-height title container (`components/admin/ShowsTable.tsx`); intrinsic `size-3.5` glyph, `shrink-0`. Real-browser height-equality stays N/A (same rationale).
```

- [ ] **Step 7: Run to verify PASS + typecheck.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/ShowsTable.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx tests/components/admin/dataGapsChipRowLayout.test.tsx && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/DataQualityBadge.tsx components/admin/ShowsTable.tsx tests/components/admin/ShowsTable.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx tests/components/admin/dataGapsChipRowLayout.test.tsx DEFERRED.md
git commit --no-verify -m "feat(admin): data-quality badge component + ShowsTable wiring (transition + layout guards)"
```

---

### Task 4: Wire the badge into `ArchivedShowRow` (+ archived transition + layout assertions, red-first)

**Files:**
- Modify: `components/admin/ArchivedShowRow.tsx` (import :29-31; title container :51-63)
- Test: `tests/components/admin/Dashboard-archived.test.tsx` (imports `ArchivedShowRow` :9)
- Test: `tests/components/admin/dataGapsTransitionAudit.test.tsx`, `tests/components/admin/dataGapsChipRowLayout.test.tsx`
- Docs: `DEFERRED.md` (DQ-1)

**Interfaces:** Consumes `DataQualityBadge` (Task 3); `row.dataGaps`.

- [ ] **Step 1: Write failing T7 (role + derived name).** In `tests/components/admin/Dashboard-archived.test.tsx`, add the import + helper (`import { dataGapClassDetails, type DataGapsSummary } from "@/lib/parser/dataGaps";` and the `expectedBadgeName` helper from the File Structure section; ensure `const now = new Date("2026-06-03T12:00:00.000Z");` exists):

```ts
  it("T7: archived row shows the data-quality badge (role=img, derived name)", () => {
    const summary: DataGapsSummary = { total: 2, classes: { FIELD_UNREADABLE: 0, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 2 } };
    render(
      <ArchivedShowRow
        row={{
          id: "arch1", slug: "arch1", title: "Archived One",
          showDateStart: null, showDateEnd: null, crewCount: 0,
          lastSyncedAt: null, lastSyncStatus: null, published: false,
          isLive: false, finalizeOwned: false, archivedAt: "2026-06-01T00:00:00.000Z",
          dataGaps: summary,
        }}
        now={now}
        unarchiveAction={async () => {}}
      />,
    );
    expect(screen.getByRole("img", { name: expectedBadgeName(summary) })).toHaveAttribute(
      "data-testid",
      "shows-data-quality-arch1",
    );
  });
```

- [ ] **Step 2: Write the failing archived transition + layout assertions (RED — badge not wired into ArchivedShowRow yet).**

In `tests/components/admin/dataGapsTransitionAudit.test.tsx`: add `"components/admin/ArchivedShowRow.tsx"` to `DATA_GAP_SOURCE_FILES`, add the inventory comment row `//   | Data-quality badge (Archived) | early-return null when total===0 | INSTANT |` (the conditional lives in `DataQualityBadge`, so the ArchivedShowRow entry is the motion-import backstop for the insertion site). No new `it` needed beyond the badge assertion in Task 3 (same component); the source-list add keeps the archived insertion under the blanket motion grep.

In `tests/components/admin/dataGapsChipRowLayout.test.tsx`, append (import `ArchivedShowRow` at the top of the file):

```ts
  it("badge sits in the ArchivedShowRow title container with items-center + shrink-0, before the Archived pill", () => {
    render(
      <ArchivedShowRow
        row={{
          id: "a1", slug: "a1", title: "Archived", showDateStart: null, showDateEnd: null,
          crewCount: 0, lastSyncedAt: null, lastSyncStatus: null, published: false,
          isLive: false, finalizeOwned: false, archivedAt: "2026-06-01T00:00:00.000Z", dataGaps: gaps(2),
        }}
        now={now}
        unarchiveAction={async () => {}}
      />,
    );
    const badge = screen.getByTestId("shows-data-quality-a1"); // RED: not wired yet
    expect(badge.className).toContain("shrink-0");
    const titleContainer = badge.parentElement!;
    expect(titleContainer.className).toContain("items-center");
    const kids = Array.from(titleContainer.children);
    const titleIdx = kids.findIndex((k) => k.textContent?.includes("Archived"));
    const pillIdx = kids.findIndex((k) => k.getAttribute("data-testid") === "archived-pill-a1");
    expect(kids.indexOf(badge)).toBeGreaterThan(titleIdx); // after the title span
    expect(kids.indexOf(badge)).toBeLessThan(pillIdx); // before the Archived pill
  });
```

(Add `import { ArchivedShowRow } from "@/components/admin/ArchivedShowRow";` to `dataGapsChipRowLayout.test.tsx` if absent. Note the title span text is "Archived" — the `titleIdx` findIndex matches the title span; the pill also contains "Archived", so use the `archived-pill-a1` testid for `pillIdx` to disambiguate, as above.)

- [ ] **Step 3: Run to verify FAIL.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard-archived.test.tsx tests/components/admin/dataGapsChipRowLayout.test.tsx -t "T7|ArchivedShowRow title container"`
Expected: FAIL — badge testid absent in the archived row.

- [ ] **Step 4: Wire the badge in.** Add after `:31` in `ArchivedShowRow.tsx`:

```ts
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
```

In the title container (`:52-63`):

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

- [ ] **Step 5: Extend `DEFERRED.md` DQ-1 (archived surface).** Add to the DQ-1 surface list:

```md
  - **badge (ArchivedShowRow title row)** — same `flex items-center gap-2` container (`components/admin/ArchivedShowRow.tsx`). Real-browser height-equality stays N/A (same rationale).
```

- [ ] **Step 6: Run to verify PASS.**

Run: `cd /Users/ericweiss/fxav-worktrees/data-quality-badge && pnpm vitest run tests/components/admin/Dashboard-archived.test.tsx tests/components/admin/dataGapsChipRowLayout.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
git add components/admin/ArchivedShowRow.tsx tests/components/admin/Dashboard-archived.test.tsx tests/components/admin/dataGapsChipRowLayout.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx DEFERRED.md
git commit --no-verify -m "feat(admin): data-quality badge on archived rows (transition + layout guards)"
```

---

### Task 5: Invariant-8 impeccable dual-gate (UI)

**Files (evaluated):** `components/admin/DataQualityBadge.tsx`, `components/admin/ShowsTable.tsx`, `components/admin/ArchivedShowRow.tsx`, `components/admin/Dashboard.tsx`.

- [ ] **Step 1: Full pre-gate baseline.**

```bash
cd /Users/ericweiss/fxav-worktrees/data-quality-badge
pnpm vitest run tests/admin tests/components/admin && pnpm typecheck && pnpm format:check
```
Expected: green. Fix prettier drift with `pnpm prettier --write <files>` (NEVER the master spec).

- [ ] **Step 2: `/impeccable critique`** on the four UI files (canonical v3 preflight). Capture findings.

- [ ] **Step 3: `/impeccable audit`** on the same diff. Capture findings.

- [ ] **Step 4: Disposition.** Every HIGH/CRITICAL: FIX (new failing test first if behavioral) OR add a `DEFERRED.md` entry with rationale. MEDIUM/LOW: fix if cheap. Record findings + dispositions for the PR body.

- [ ] **Step 5: Commit any fixes** (conventional-commits, one commit per coherent fix).

---

## Self-Review (author checklist)

1. **Spec coverage:** §2.1 readDataGaps → Task 1; §2.2 flag → Task 1, notice → Task 2; §2.3 rows → Task 1; §3.1 component → Task 3; §3.2 two sites → Task 3 + Task 4; §3.5 notice → Task 2; §4.2 transitions → folded into Tasks 2/3/4 (per-conditional executable assertions, red-first); §5 tests T1/T2/T3/T3b/T3c/T4/T5/T6/T7 → Tasks 1/2/3/4; §5 meta-test → Task 1 (red-first); §5 T-L layout (jsdom + DQ-1, both surfaces) → Tasks 3 + 4; invariant-8 → Task 5. No gap.
2. **Placeholder scan:** every code step has complete code; no TBD/TODO.
3. **Type consistency:** `DataQualityBadge` signature identical Task 3 (def) / Task 4 (use); `dataGapsDegraded` boolean identical Task 1 / Task 2; `expectedBadgeName` derived-name helper identical in Tasks 3 + 4 (defined per test file, same body); `readDataGaps` return type identical across Task 1.
4. **TDD red-first:** EVERY task writes failing test(s) before the code that satisfies them — including the transition-audit + layout assertions (folded into Tasks 2/3/4 so the target file/DOM is genuinely absent when the assertion first runs). No standalone passes-immediately guard task remains.
5. **Anti-tautology:** all four badge assertions (T4/T6/T7 + the layout tests) derive the expected accessible name from `dataGapClassDetails` via `expectedBadgeName`; none hardcodes the plural/total string; role=img query fails if the role attr is dropped.

## Meta-test inventory (declared)

- **EXTEND** `tests/admin/_metaInfraContract.test.ts` (Task 1) — `shows_internal` degrade-visible boundary (red-first behavioral + registry string).
- **EXTEND** `tests/components/admin/dataGapsTransitionAudit.test.tsx` (Tasks 2/3/4) — 3 new source files + per-conditional executable assertions (Dashboard ternary, DataQualityBadge return-null), red-first.
- **EXTEND** `tests/components/admin/dataGapsChipRowLayout.test.tsx` (Tasks 3/4) — active + archived badge structural assertions; **EXTEND** `DEFERRED.md` DQ-1 (both surfaces).
- **RE-RUN (no change)** `tests/admin/_metaBoundedReads.test.ts` (Task 1 Step 12) — `shows_internal` non-`UNBOUNDED_TABLES`; comment-fragility guard.
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched.

## Execution note

Tasks 1→5 are sequential (Task 2 needs Task 1's flag; Task 3 creates the component Task 4 reuses; Task 4 needs Task 3's badge; Task 5 gates the whole UI diff). One commit per task. After Task 5, the ship pipeline resumes at Stage 4 (whole-diff Codex review → CI → merge).
