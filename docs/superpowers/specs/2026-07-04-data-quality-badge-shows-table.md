# Spec — Data-quality badge on admin watched-folder table rows

**Date:** 2026-07-04
**Slug:** `data-quality-badge-shows-table`
**Status:** Draft (autonomous ship)
**Surfaces:** `components/admin/Dashboard.tsx` (data layer), new `components/admin/DataQualityBadge.tsx` (shared UI), `components/admin/ShowsTable.tsx` (active bucket), `components/admin/ArchivedShowRow.tsx` (archived bucket)

---

## 1. Problem & intent

The admin dashboard's watched-folder table (`ShowsTable`) lists every show but gives no
at-a-glance signal of **parse data quality** per row. When the sync degrades a sheet's data
(an unreadable field, an unknown section header, a section that disappeared), the operator can
only discover it by opening the per-show page. This spec adds a **compact warning-glyph badge**
next to each show's title that appears only when that show has ≥1 data-quality gap, so the
operator can spot problem shows directly from the dashboard.

The data-quality plumbing already exists and is single-sourced:

- `ActiveShowRow.dataGaps?: DataGapsSummary` — `lib/admin/showDisplay.ts:50` (already declared;
  currently **never populated** by the dashboard loader — see the comment at
  `lib/admin/showDisplay.ts:44-49`).
- `summarizeDataGaps(warnings)` — `lib/parser/dataGaps.ts:53` — counts the **three** data-quality
  classes only (`FIELD_UNREADABLE`, `UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED`), skipping
  `severity:"info"` warnings; `null`/`undefined`/`[]` → `{ total: 0, classes:{…:0} }`.
- `dataGapClassDetails(summary)` — `lib/parser/dataGaps.ts:94` — ordered per-class
  `{ key, count, label }` entries (count > 0 only), with plain-language plural labels from
  `DATA_GAP_CLASS_LABELS` (`lib/parser/dataGaps.ts:82`: `"unreadable field"` /
  `"unknown section"` / `"removed section"`).
- `DataGapsSummary` type — `lib/parser/dataGaps.ts:19`.

This feature is **two pieces**: (1) populate `dataGaps` per dashboard row by reading and
summarizing `shows_internal.parse_warnings`; (2) render the badge in `ShowsTable`.

### Non-goals (explicit out-of-scope)

- No change to `summarizeDataGaps` / `dataGapClassDetails` / the three-class definition.
- No new §12.4 error code, no `admin_alerts` code, no catalog change.
- No DB migration, no schema change, no advisory-lock path, no RPC.
- **No** change to the existing Held-shows `DataGapsChip` behavior in the row-action bar
  (`ShowsTable.tsx:240-255`, rendered at `:540`). That chip stays as-is; this badge is a
  **separate, additive** title-adjacent surface. (See §4.4 for why they coexist.)
- No autocorrect / unknown-role / other operator-actionable warnings — those are a **different**
  surface (`OPERATOR_ACTIONABLE_ANCHORED`, `lib/parser/dataGaps.ts:122`) and stay out. The badge
  reflects data **gaps** (the three DQ classes) only.

---

## 2. Data layer — `fetchDashboardData` (`components/admin/Dashboard.tsx`)

### 2.1 New read: `readDataGaps`

Add a wave-2 concurrent read that mirrors the existing `readCrewCounts` /
`loadIgnoredSheets` structure (`Dashboard.tsx:270`, `:353-362`). It returns a typed `InfraResult`
on any fault — the boundary stays invariant-9 compliant exactly like every sibling registered in
`tests/admin/_metaInfraContract.test.ts`; the **caller** (§2.2) decides how to degrade:

```ts
const readDataGaps = async (): Promise<Map<string, DataGapsSummary> | InfraResult> => {
  const byShow = new Map<string, DataGapsSummary>();
  if (activeShowIds.length === 0) return byShow; // short-circuit — no .in([]) (R28 precedent, :245)
  try {
    // invariant 9: destructure { data, error } (NOT bare `data`, AGENTS.md:21). Returned-error
    // and thrown-error are distinct paths; both surface a typed infra_error.
    const { data, error } = await supabase
      .from("shows_internal")
      .select("show_id, parse_warnings")
      .in("show_id", activeShowIds);
    if (error) {
      return { kind: "infra_error", message: `shows_internal data-gaps query failed: ${error.message}` };
    }
    for (const r of (data ?? []) as ReadonlyArray<{ show_id: string; parse_warnings: unknown }>) {
      const summary = summarizeDataGaps(r.parse_warnings as ParseWarning[] | null);
      if (summary.total > 0) byShow.set(r.show_id, summary); // store only non-empty (§2.3)
    }
    return byShow;
  } catch (err) {
    return { kind: "infra_error", message: `shows_internal data-gaps query threw: ${err instanceof Error ? err.message : String(err)}` };
  }
};
```

- **Client:** the existing `createSupabaseServerClient()` admin session (`Dashboard.tsx:122`).
  `shows_internal` has SELECT granted to `authenticated` under the `admin_only` RLS policy
  (`supabase/migrations/20260501002000_rls_policies.sql:59,62`), so this read is authorized for
  the signed-in admin. (The DML lockdown at
  `supabase/migrations/20260619000001_lockdown_shows_internal.sql` REVOKEs only
  INSERT/UPDATE/DELETE — SELECT is explicitly retained.)
- **Boundedness:** `shows_internal.show_id` is the **primary key**
  (`supabase/migrations/20260501001000_internal_and_admin.sql:2`) → one row per show → `.in("show_id",
  activeShowIds)` returns ≤ `activeShowIds.length` rows, and `activeShowIds` is already capped at
  `ACTIVE_SHOWS_CAP` (`Dashboard.tsx:179,233`). `shows_internal` is **not** in the bounded-reads
  meta-test's `UNBOUNDED_TABLES` (`tests/admin/_metaBoundedReads.test.ts:32` — `shows`,
  `crew_members`, `pending_ingestions`, `pending_syncs` only), so no `.limit()` is required and no
  meta-test violation is introduced. (This is a genuine 1:1 parent lookup, not a one-to-many child
  fetch — no pagination needed.)
- **invariant 9 (Supabase call-boundary discipline):** destructures `{ data, error }` (not bare
  `data`, `AGENTS.md:21`); returned-error → typed `infra_error`; thrown-error → typed `infra_error`
  via the `try/catch`. Never a silent `continue`. The `InfraResult` sentinel is the existing
  dashboard pattern (`Dashboard.tsx:238`). The read is **registered** in the admin infra-contract
  meta-test — see §5 "Meta-test inventory" — so the boundary discipline is pinned structurally, not
  just described here.

### 2.2 Wire into wave-2 + degrade in place (fail-soft)

Add `readDataGaps()` to the wave-2 `Promise.all` (`Dashboard.tsx:354-362`) as a **non-fatal**
member, exactly like `loadIgnoredSheets`:

```ts
const [crewTotalResult, crewCountsResult, na, finalizeOwnedIds, ignoredResult, dataGapsResult] =
  await Promise.all([ readCrewTotal(), readCrewCounts(), loadNeedsAttention(…), readFinalizeOwned(), loadIgnoredSheets(…), readDataGaps() ]);
```

At the call site, **degrade in place with a VISIBLE signal** — an `infra_error` from this read must
**NOT** short-circuit the whole dashboard (mirrors `ignoredSheets`/`ignoredDegraded`,
`Dashboard.tsx:373-374`), but it must **NOT** silently vanish either:

```ts
const dataGapsDegraded = isInfra(dataGapsResult);
const dataGapsByShow = dataGapsDegraded ? new Map<string, DataGapsSummary>() : dataGapsResult;
```

Add `dataGapsDegraded: boolean` to the returned `DashboardData` (alongside `ignoredDegraded`,
`Dashboard.tsx:78`), and render a **visible calm notice** in the shows `<section>` of `Dashboard()`
when it is true (§3.5) — plain language, no raw code (invariant 5).

**Disagreement-loop preempt — degrade-VISIBLE, not silent (invariant 9).** The read is fail-soft
(a `shows_internal` fault does not blank the whole dashboard — the badge is a secondary at-a-glance
hint, and the per-show page is the source of truth) **but the fault is surfaced, never hidden**.
This is the **established contract on this exact surface**: the per-show Data-Quality panel's
`shows_internal.parse_warnings` read "degrades VISIBLE on returned-error OR thrown (failed → calm
notice), NEVER a silent empty panel (invariant 9, R10 F1)"
(`tests/admin/_metaInfraContract.test.ts:322`); and the needs-attention badge helper
`loadNeedsAttentionCount` returns a typed `infra_error` at its boundary and the caller collapses it
to a visible degraded badge state (`tests/admin/_metaInfraContract.test.ts:642-668`). A **silent**
degrade "indistinguishable from all clean" would violate invariant 9's "infra faults surface as
discriminable results, never silent" (`AGENTS.md:21`) — the earlier draft's YAGNI argument was
wrong on this surface. `loadIgnoredSheets` is **not** a silent precedent: it sets `ignoredDegraded`
and the disclosure renders a degraded warning chip (`IgnoredSheetsDisclosure.tsx:36-39,76-80`) —
exactly the visible-degrade shape adopted here.

### 2.3 Populate the row

In the row map (`Dashboard.tsx:377-400`), set `dataGaps` from the map. The map holds **only**
`total > 0` summaries (§2.1), so `.get()` returns `undefined` for clean shows — matching the
existing optional-field contract (`showDisplay.ts:44-50`: "Producers omit it → undefined →
ShowsTable renders no chip"):

```ts
return {
  …, // existing fields unchanged
  ...(dataGapsByShow.get(s.id as string) ? { dataGaps: dataGapsByShow.get(s.id as string) } : {}),
};
```

Use conditional spread (not `dataGaps: … ?? undefined`) so the field is **absent** when clean —
consistent with `exactOptionalPropertyTypes` and the existing `?: DataGapsSummary` optional shape
(prevents `toEqual` breakage on clean-row fixtures; see the optional-field lesson in the plan).

**Applies to BOTH buckets.** `fetchDashboardData` runs the same row map for `active` and `archived`
(`bucket`/`isArchived`, `Dashboard.tsx:118-119`, `:377-400`) — the map is bucket-agnostic, so the
returned rows carry `dataGaps` regardless of which bucket is selected. The **render** side differs:
the active bucket renders `<ShowsTable>` (`Dashboard.tsx:568`), the archived bucket renders a
per-row `<ArchivedShowRow>` list (`Dashboard.tsx:547`) — a **different** component. Both get the
badge via §3 (two insertion sites sharing one component).

### 2.4 Imports

`Dashboard.tsx` gains: `summarizeDataGaps` + `type DataGapsSummary` from `@/lib/parser/dataGaps`,
and `type ParseWarning` from `@/lib/parser/types` (already imported by sibling admin modules;
verify at plan time it is not already present).

---

## 3. UI — shared `DataQualityBadge` component

### 3.1 Component (new file `components/admin/DataQualityBadge.tsx`)

Because the badge renders in **two** components (`ShowsTable` active + `ArchivedShowRow` archived),
it lives in its own small, well-bounded module and is imported by both — rather than being defined
inline in one and duplicated in the other. It is a `"use client"`-agnostic pure presentational
component (no hooks, no state); it works in both the client-island `ShowsTable` and the RSC-rendered
`ArchivedShowRow`.

```tsx
export function DataQualityBadge({ slug, dataGaps }: { slug: string; dataGaps: DataGapsSummary | undefined }) {
  if (!dataGaps || dataGaps.total === 0) return null; // guard: absent/empty → nothing (instant, no animation)
  const breakdown = dataGapClassDetails(dataGaps).map((d) => `${d.count} ${d.label}`).join(", ");
  const label = `${dataGaps.total} data ${dataGaps.total === 1 ? "gap" : "gaps"}: ${breakdown}`;
  return (
    <span
      data-testid={`shows-data-quality-${slug}`}
      title={label}
      aria-label={label}
      role="img"
      className="inline-flex shrink-0 items-center text-status-warn-text"
    >
      <TriangleAlert aria-hidden="true" className="size-3.5" />
    </span>
  );
}
```

- **Icon:** lucide-react `TriangleAlert` (verified export, `node_modules/lucide-react`), `size-3.5`
  (≈14px), `text-status-warn-text` (verified token, `app/globals.css:83`). The glyph is a **shape**
  (satisfies the DESIGN color-blind floor — color is never the sole carrier).
- **Accessible name:** `aria-label` **and** `title` carry the full plain-language breakdown built
  from `dataGapClassDetails` — e.g. `"3 data gaps: 2 unreadable fields, 1 unknown section"`. The
  glyph itself is `aria-hidden`; `role="img"` on the wrapper gives the `aria-label` a host. **No raw
  §12.4 code literal** ever appears (invariant 5) — labels come from `DATA_GAP_CLASS_LABELS`.
- **Singular/plural:** `total === 1` → `"1 data gap"`, else `"N data gaps"`. Per-class plurals are
  already handled inside `dataGapClassDetails` (`dataGaps.ts:107`).

### 3.2 Placement — two insertion sites, one component

**Site A — `ShowsTable.tsx` (active bucket).** Right after the show title, before the inline
Live/Held pill, in the title row's flex container (`ShowsTable.tsx:460-472`):

```tsx
<div className="flex items-center gap-2">
  <span className="min-w-0 wrap-break-word …">{rowTitle(row)}</span>
  <DataQualityBadge slug={row.slug} dataGaps={row.dataGaps} />   {/* NEW */}
  <span className="min-[960px]:hidden"><StatePill row={row} place="inline" /></span>
</div>
```

This title row is the always-visible Show cell — **not** gated by the `min-[768px]`/`min-[960px]`
desktop columns — so on the active bucket the badge appears in **both** the desktop grid rows **and**
the mobile stacked layout from this single insertion. Ordering is title → badge → state pill.

**Site B — `ArchivedShowRow.tsx` (archived bucket).** Right after the title span, before the
"Archived" idle pill, in that component's title flex container (`ArchivedShowRow.tsx:52-62`):

```tsx
<div className="flex items-center gap-2">
  <span className="truncate text-base font-semibold text-text-strong">{row.title ?? row.slug}</span>
  <DataQualityBadge slug={row.slug} dataGaps={row.dataGaps} />   {/* NEW */}
  <span className="… border-status-idle …">…Archived…</span>
</div>
```

The title span there uses `truncate`; the badge's `shrink-0` (§3.1) keeps it visible when the title
is long. `ArchivedShowRow` receives the same `ActiveShowRow` (`Dashboard.tsx:547`, `row={row}`), so
`row.dataGaps` is available. `ArchivedShowRow` has a single (non-breakpoint-split) layout, so one
insertion covers it.

### 3.3 Imports

- New file `components/admin/DataQualityBadge.tsx` imports `TriangleAlert` from `lucide-react`,
  `dataGapClassDetails` + `type DataGapsSummary` from `@/lib/parser/dataGaps`.
- `ShowsTable.tsx` gains a single named import of `DataQualityBadge` from
  `@/components/admin/DataQualityBadge`. It no longer needs to add `TriangleAlert` to its own lucide
  import; its existing `dataGapClassDetails`/`DataGapsSummary` import (`ShowsTable.tsx:33`) is
  unaffected (still used by the Held-shows `DataGapsChip`).
- `ArchivedShowRow.tsx` gains the same named import of `DataQualityBadge`.

### 3.4 Guard conditions (every prop / input)

| Input | null / undefined | empty (`total === 0`) | populated (`total > 0`) |
| --- | --- | --- | --- |
| `dataGaps` | render nothing (early `return null`) | render nothing | render badge |
| `slug` | (always present on `ActiveShowRow`) — used only for `data-testid` | — | — |

`dataGaps.total` and `dataGaps.classes` are always defined when `dataGaps` is present
(`summarizeDataGaps` always returns the full shape). No NaN path — counts are integers from a
`for` loop.

### 3.5 Degraded-read notice (`Dashboard.tsx`)

When `result.dataGapsDegraded` is true (§2.2 — the `shows_internal` read faulted), render a single
**calm inline notice** in the shows `<section>` (the one at `Dashboard.tsx:497-568` that wraps both
the active `<ShowsTable>` and the archived `<ArchivedShowRow>` list), placed just above the
table/list so it covers **both** buckets from one site:

```tsx
{result.dataGapsDegraded ? (
  <p
    data-testid="dashboard-data-quality-degraded"
    className="rounded-md border border-border bg-surface-sunken p-3 text-sm text-text-subtle"
  >
    Data-quality checks are temporarily unavailable — some shows may not show their data-quality badge.
  </p>
) : null}
```

- **Plain language, no raw code** (invariant 5) — bespoke copy, **not** a §12.4 catalog code (like
  the ignored-degraded chip and the per-show panel's calm notice; no catalog/`spec-codes` change).
- Honest: it tells the operator badges may be **missing** due to a read fault, so an absent badge is
  not silently misread as "clean." This is the visible-degrade half of the invariant-9 contract
  (§2.2).
- Guard: renders **only** when `dataGapsDegraded === true`; instant mount/unmount, no animation
  (§4.2).

---

## 4. Dimensional invariants, transitions, mode boundaries

### 4.1 Dimensional invariants

The badge lives in the **title row flex container** (`ShowsTable.tsx:460`,
`className="flex items-center gap-2"`). It is **not** a fixed-height grid cell of its own — it is an
inline-flex child sized by its icon (`size-3.5`). The parent row uses `items-center` (grid) /
the title container uses `items-center` (flex), so the badge is vertically centered with the title
and the state pill. `shrink-0` prevents the badge from being compressed when a long title wraps
(Tailwind v4 has **no** default `align-items: stretch` and no default `flex-shrink` surprise here —
`shrink-0` is explicit). There is **no** fixed-height parent → child-fills-parent relationship
introduced by this feature (the badge is intrinsically sized), so **no** new Playwright
`getBoundingClientRect` height-equality assertion is required. A layout test **is** still warranted
to confirm the badge does not force the title row taller than a badge-less row and does not overflow
its cell (see §6, Task L).

### 4.2 Transition inventory

The badge has **two** visual states: **present** (`total > 0`) and **absent** (`undefined` /
`total === 0`).

| From → To | Treatment |
| --- | --- |
| absent → present | **Instant — no animation.** The badge renders via an early `return null`/JSX branch; there is no `AnimatePresence`, no `exit`/`initial`/`animate`. |
| present → absent | **Instant — no animation.** Same branch. |
| present → present (count changes across a re-fetch) | **Instant** — text in `aria-label`/`title` updates; no animated count. |

The **degraded notice** (§3.5) is a third instant conditional: `dataGapsDegraded ? … : null`, no
animation.

Compound transition: a row's badge state is independent of the Live/Held pill, the sync cell, and
the Find/sort state. Toggling bucket (active↔archived), typing in Find, or sorting re-renders the
list; the badge simply renders per its row's `dataGaps` each time — **instant**, no wrapper. This
matches the surrounding table's no-animation posture (`ShowsTable.tsx:236-239` DataGapsChip is also
instant).

**Guard (correct test target).** The purpose-built guard for data-gap surfaces is
`tests/components/admin/dataGapsTransitionAudit.test.tsx` (NOT
`showsTableTransitionAudit.test.tsx`, which audits the **status pills** and is a `.tsx`, not `.ts`).
That audit greps a `DATA_GAP_SOURCE_FILES` list (`dataGapsTransitionAudit.test.tsx:43-52`) for any
framer-motion / `AnimatePresence` import and carries a transition-inventory comment table. This
feature must **extend** it: add `components/admin/DataQualityBadge.tsx`,
`components/admin/ArchivedShowRow.tsx`, and `components/admin/Dashboard.tsx` (degraded notice) to
`DATA_GAP_SOURCE_FILES`, and add inventory rows for (a) the badge early-return-null, (b) the archived
insertion, (c) the `dataGapsDegraded` notice — each declared INSTANT.

### 4.3 Mode boundaries

**Active bucket (`ShowsTable`)** renders two layouts per row: the **desktop grid** (`min-[768px]`,
columns Show / Start / End / Crew / Sync / [Status ≥960] / chevron) and the **mobile stacked**
sub-line (`<768px`). The badge belongs to the **Show cell**, shared by both layouts (the
always-visible title container, `ShowsTable.tsx:458-472`) → appears in **both** modes from one
insertion. It does **not** belong to any desktop-only column, the mobile sub-line meta block
(`:474-481`), or the Held row-action bar (`:535-543`).

**Archived bucket (`ArchivedShowRow`)** has a single layout (no breakpoint split); the badge sits in
its title flex container (`ArchivedShowRow.tsx:52`) → one insertion covers it at all widths.

### 4.4 Coexistence with the existing `DataGapsChip`

Both surfaces can render for the **same** Held show simultaneously: the new title-adjacent
`DataQualityBadge` (icon-only, always when `total>0`) and the existing action-bar `DataGapsChip`
(text pill "N data gaps", only when `rowAction` is supplied and `total>0`). This is intentional and
**not** a duplicate: the badge is the persistent at-a-glance signal on every bucket; the chip is the
verbose reminder adjacent to the Publish action. The dashboard does **not** pass `rowAction`
(`Dashboard.tsx` renders `<ShowsTable … />` without it — verify at plan time), so on the live
dashboard only the badge shows; the chip remains reachable only where a `rowAction` is wired. No
change to either the chip or `rowAction`.

---

## 5. Testing

All tests are **data-source-anchored** (anti-tautology): assertions read the badge's presence/label
against the `dataGaps` **data source** (the row's summary / the warnings fixture), never against a
container that also renders the count elsewhere. Expected label strings are **derived** from
`dataGapClassDetails` output, not hardcoded prose.

- **T1 — loader populates `dataGaps` (data-source).** `tests/admin/fetchDashboardData.test.ts` (or a
  focused sibling): given a `shows_internal` row whose `parse_warnings` contains N warn-severity DQ
  warnings, `fetchDashboardData` returns the matching row with `dataGaps.total === N` and the
  correct per-class counts. Assert against the returned `ActiveShowRow.dataGaps`, not rendered DOM.
  Failure mode caught: loader silently not wiring the read (the current state).
- **T2 — clean show omits the field.** A `shows_internal` row with only `severity:"info"` warnings
  (or `[]`) → the returned row has **no** `dataGaps` key (absent, not `undefined`) → `toEqual`-safe.
  Failure mode: a clean row rendering a badge.
- **T3 — degrade-VISIBLE (both fault paths).** When the `shows_internal` read returns `{ error }`
  **and** (separate case) when it **throws**, `fetchDashboardData` still returns `kind`-less
  `DashboardData` with all rows and **no** `dataGaps` on any row, **and** `dataGapsDegraded === true`
  — it does **not** return `infra_error` (no dashboard blank). This is the caller-side behavioral
  half; the boundary half (the read returns a typed `infra_error`) is pinned by the meta-test below.
  Failure mode: a warnings read fault blanking the whole dashboard, **or** silently hiding with no
  degraded signal (invariant 9).
- **T3b — degraded notice renders.** A `Dashboard` render with `dataGapsDegraded:true` shows
  `dashboard-data-quality-degraded` (plain copy, no raw code literal); with `false`, it is absent.
- **T4 — badge renders + accessible name (component).** `tests/components/admin/ShowsTable.test.tsx`:
  a row with `dataGaps:{ total:3, classes:{FIELD_UNREADABLE:2, UNKNOWN_SECTION_HEADER:1,
  BLOCK_DISAPPEARED:0} }` renders `shows-data-quality-<slug>` whose accessible name (queried via
  `getByRole("img", { name })` / `toHaveAccessibleName`) **contains** the total and the
  `dataGapClassDetails`-derived breakdown, and contains **no** raw code literal (assert the rendered
  name does not match `/FIELD_UNREADABLE|UNKNOWN_SECTION_HEADER|BLOCK_DISAPPEARED/`). Expected text
  derived from `dataGapClassDetails`, not hardcoded.
- **T5 — clean/absent row renders no badge (component).** A row with no `dataGaps` (and one with
  `total:0`) → `queryByTestId('shows-data-quality-<slug>')` is null. Failure mode: badge leaking onto
  clean rows.
- **T6 — singular label.** `total:1` → accessible name uses `"1 data gap"` (singular). Failure mode:
  "1 data gaps".
- **T7 — both buckets.** Two assertions, one per render path: (a) a `ShowsTable` (active) render with
  a gappy row shows `shows-data-quality-<slug>`; (b) an `ArchivedShowRow` (archived) render with a
  gappy row shows `shows-data-quality-<slug>`. Proves the active/archived parity is real (the two
  buckets use **different** components — §4.3 — so both need direct coverage; an active-only test
  would silently miss the archived path).
- **T-transition — extend the data-gaps transition audit.** Extend
  `tests/components/admin/dataGapsTransitionAudit.test.tsx` (§4.2): add `DataQualityBadge.tsx`,
  `ArchivedShowRow.tsx`, and `Dashboard.tsx` to its `DATA_GAP_SOURCE_FILES` and add the three
  inventory rows (badge, archived insertion, degraded notice), each INSTANT. The audit's blanket grep
  then fails if any of these grows a framer-motion/`AnimatePresence` wrapper. (Do **not** use
  `showsTableTransitionAudit.test.tsx` — that guards status pills, a different surface.)
- **T-L — layout (real browser).** See §6 Task L: assert (a) `shows-data-quality-<slug>` is inside the
  Show-cell title container and vertically centered with the title, and (b) a badge-bearing row's
  height equals a badge-less row's height within 0.5px (the badge must not inflate row height). Real
  browser (Playwright), not jsdom.

**Meta-test inventory:** this milestone **EXTENDS** two existing structural meta-tests and creates
none.

1. **`tests/admin/_metaInfraContract.test.ts` (admin Supabase call-boundary contract) — EXTEND.**
   `fetchDashboardData` is already registered here (`:170-178`) with a per-table throw matrix
   (`:562-587`). The new `shows_internal` read is a boundary this contract governs, so:
   - **Update the `fetchDashboardData` registry contract string** (`:175`) to name the
     `shows_internal.parse_warnings` read and its **degrade-VISIBLE** behavior, mirroring the
     wording already used for the per-show panel read (`:322`, "degrades VISIBLE … NEVER a silent
     empty panel (invariant 9, R10 F1)").
   - **Add a behavioral test** in the `describe("fetchDashboardData")` block (`:537`): seed one
     `shows` row (so the helper proceeds past the empty-shows short-circuit into wave-2, per the
     `crew_members` test at `:577-587`), set `infraMock.throwOnFromTable = "shows_internal"` (and a
     second case with a **returned** `{ error }` if the mock supports it — it does, per the ignored
     read at `:234`), and assert the result is **NOT** `infra_error`, that `dataGapsDegraded === true`,
     and that rows are present with no `dataGaps`. This pins BOTH the boundary discipline (the read
     itself returns a typed `infra_error`) AND the caller's degrade-visible posture. **Note:** do
     **not** add `"shows_internal"` to the existing `test.each` throw-matrix at `:562` (those assert
     → `infra_error`; `shows_internal` degrades, so it needs its own assertion).
   This EXTEND is the direct fix for the round-1 finding that the inventory wrongly claimed
   `_metaInfraContract` was auth-only.
2. **`tests/components/admin/dataGapsTransitionAudit.test.tsx` — EXTEND.** Add the three new source
   files to `DATA_GAP_SOURCE_FILES` + three inventory rows (see T-transition / §4.2).
3. **`tests/admin/_metaBoundedReads.test.ts` — no change required.** It auto-scans `Dashboard.tsx`;
   the new `shows_internal` read is a non-`UNBOUNDED_TABLES` table (`:32`) so it is
   scanned-and-skipped, not a violation (confirmed §2.1).

No new §12.4 code → no catalog / `spec-codes` / `codes-coverage` touchpoints.

---

## 6. Task shape (for the plan — not the plan itself)

1. **Task D (data layer, TDD):** T1/T2/T3/T3b red + the `_metaInfraContract` extension (§5.1) red →
   add `readDataGaps` (typed `infra_error` boundary) + wave-2 wiring + `dataGapsDegraded` flag + row
   population + the §3.5 degraded notice in `Dashboard()` → green. Commit
   `feat(admin): populate per-show dataGaps + degraded signal in dashboard loader`.
2. **Task U (UI badge, TDD, Opus + impeccable):** T4/T5/T6/T7 red → add the shared
   `components/admin/DataQualityBadge.tsx` + wire it into **both** `ShowsTable` (Site A) and
   `ArchivedShowRow` (Site B) → green. Commit `feat(admin): data-quality badge on shows-table + archived rows`.
3. **Task T (transition audit):** extend `tests/components/admin/dataGapsTransitionAudit.test.tsx`
   (§4.2 / §5.2) — the three new source files + inventory rows.
4. **Task L (layout, real browser):** the badge does not inflate row height / stays in the title
   cell; Playwright `getBoundingClientRect`, not jsdom.
5. **Invariant-8 impeccable dual-gate** (`/impeccable critique` + `/impeccable audit`) on the UI diff
   — `DataQualityBadge.tsx` + `ShowsTable.tsx` + `ArchivedShowRow.tsx` — before cross-model review;
   HIGH/CRITICAL fixed or `DEFERRED.md`.

---

## 7. Self-review sweep (numeric + consistency)

- **Numeric literals:** `size-3.5` (badge icon), `0.5px` (layout tolerance), `total===1` (singular
  boundary), three DQ classes. Each used consistently; no contradicting restatement.
- **"Out of scope" claims:** §1 non-goals (no migration, no §12.4 code, no chip change, no
  autocorrect warnings) are not contradicted anywhere in §2–§6.
- **`file:line` citations:** every named symbol/column/token/policy cited to the live worktree at
  draft time; the plan's pre-draft pass re-verifies before any task names them.
- **Guard conditions:** §3.4 covers null/undefined/empty/populated for both props.
- **Fail-open posture:** §2.2 resolves to **degrade-VISIBLE** (typed `infra_error` at the boundary →
  `dataGapsDegraded` flag → calm notice), citing the per-show panel + `loadNeedsAttentionCount`
  precedents (`_metaInfraContract.test.ts:322`, `:642-668`) — NOT a silent degrade. Disagreement-loop
  preempt for the reviewer.
- **Flag lifecycle (`dataGapsDegraded`):** storage = in-memory `DashboardData` field (not persisted);
  write path = `fetchDashboardData` sets it `true` iff `readDataGaps` returns `infra_error` (§2.2);
  read path = `Dashboard()` renders the §3.5 notice when true; effect on output = the visible
  degraded notice. Not a persisted config toggle — no DB column, no CHECK.
- **Tier×domain matrix:** N/A — no DB-touching (write) change; a single read of an existing column.
