# Admin shows-table "Status" column — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sortable "Status" column (Live / Published / Publishing… / Held) to the admin shows table, surfacing each show's publish state as its own column on wide viewports while keeping the existing inline pill on narrow ones.

**Architecture:** UI-only change to `components/admin/ShowsTable.tsx` (the renderer for both the Active dashboard bucket and the `/admin/unpublished` Held view), plus a coordinated responsive-breakpoint adjustment in `components/admin/Dashboard.tsx` + `app/admin/loading.tsx`. The publish-state data (`published`, `isLive`, `finalizeOwned`) already exists on `ActiveShowRow` — this plan only reads it. No DB / parser / RPC / migration / advisory-lock change.

**Tech Stack:** Next.js 16 (App Router, RSC + client islands), React 19, Tailwind v4 (`@theme` tokens, custom `min-[Npx]` breakpoints), Vitest + Testing Library (jsdom), Playwright (real-browser layout/visibility).

**Spec:** `docs/superpowers/specs/2026-06-30-admin-shows-status-column-design.md` (Codex-APPROVED, 4 rounds). Section refs below (§N) point there.

## Global Constraints

- **TDD per task** — failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task**, conventional-commits: `<type>(admin): <summary>`. One task per commit.
- **No raw §12.4 error codes in UI** — N/A (no codes added).
- **Tailwind v4 has NO default `align-items: stretch`** — every fixed-dimension parent→child relationship is explicit and verified in a REAL browser (Playwright), not jsdom.
- **Status state precedence (§3), single source:** `Live` (`isLive`) → `Published` (`published && !isLive`) → `Publishing…` (`!published && finalizeOwned`) → `Held` (`!published && !finalizeOwned`). Never recomputed from anything but the precomputed row fields.
- **Reuse existing `@theme` tokens** — `status-live` / `status-positive` / `status-warn` / `status-idle` (+ `-text`). No new tokens. No animation (StatePill dot is static; the `animate-ping` belongs to `StatusIndicator`/Sync cell only).
- **Breakpoints (§6.3):** Status column gated `min-[960px]`; the existing 5 columns keep `min-[720px]`; dashboard two-col split `min-[1080px]`→`min-[1240px]`; inbox widen `min-[1280px]:w-[480px]`→`min-[1400px]:w-[480px]` (base `min-[1240px]:w-80`).
- **`StatePill` `place: "inline" | "column"` prop (§3.1/§4.1)** is REQUIRED at every call site; it selects BOTH the `Held` label (`column`→`Held`, `inline`→`Held — not published`) AND the per-state testid namespace (`inline`→`shows-{state}-pill`/`shows-publishing`; `column`→`shows-statuscol-{state}`).

## Meta-test inventory (project writing-plans requirement)

This milestone **creates/extends NO structural meta-test.** Reason: it is a purely presentational UI change (ShowsTable column + responsive breakpoints). It touches no Supabase call boundary (`tests/auth/_metaInfraContract.test.ts`), no §12.4 admin-alert catalog, no advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts` — no `pg_advisory*`), no email normalization, and no sentinel-in-optional-text tile surface. "None applies" is the explicit declaration.

## Advisory-lock holder topology

N/A — this plan touches no `pg_advisory*` code path.

---

## File Structure

- **Modify** `components/admin/ShowsTable.tsx` — `StatePill` (Published variant + `place` prop + `statusState` helper + tone/label/testid maps), inline-pill visibility wrapper, new Status column cell + header sort button, 6-col `ROW_GRID`, `SortKey`/`sortValue`/`STATUS_SORT_RANK`.
- **Modify** `components/admin/Dashboard.tsx` — two-col split `1080`→`1240` (lines 463, 468), inbox width classes (line 554), the stale `1080`/`1280`/`360px` comment block (448–460).
- **Modify** `app/admin/loading.tsx` — mirror the split + inbox breakpoints (lines 31, 36).
- **Modify** `tests/components/admin/ShowsTable.test.tsx` — Status-column + Published-variant + sort + structural-class assertions.
- **Modify** `tests/e2e/admin-layout-dimensions.spec.ts` — extend `TITLE_BANDS`; structural non-regression; deterministic-published-row overflow; inline↔column visibility toggle; fix the 1200px→1280px two-col test.
- **Modify** `tests/components/admin/Dashboard-archived.test.tsx` (+ any other jsdom test surfaced) — only if the new Published pill changes an existing assertion.
- **Create** `tests/components/admin/showsTableTransitionAudit.test.tsx` — transition-audit (project requirement).

---

### Task 1: `StatePill` gains the `place` prop + the `Published` variant

Rewrite the local `StatePill` (`components/admin/ShowsTable.tsx:108-147`) so a row's status is a single `statusState(row)` derivation, rendered with a `place`-keyed testid namespace and label, and add the missing `Published` (`status-positive`) variant. The title-site call (`:381`) becomes `place="inline"`.

**Files:**
- Modify: `components/admin/ShowsTable.tsx:108-147` (StatePill) and `:381` (call site)
- Test: `tests/components/admin/ShowsTable.test.tsx`

**Interfaces:**
- Produces: `statusState(row): "live" | "published" | "publishing" | "held"`; `<StatePill row place />` with `place: "inline" | "column"`; inline testids `shows-live-pill-{slug}` / `shows-published-pill-{slug}` / `shows-publishing-{slug}` / `shows-held-pill-{slug}`; column testids `shows-statuscol-{state}-{slug}`.

- [ ] **Step 1: Write the failing tests** (append to `tests/components/admin/ShowsTable.test.tsx`'s `describe("ShowsTable")`):

```tsx
it("Published pill renders inline for a published, non-live row (status-positive) — §3", () => {
  render(
    <ShowsTable rows={[row({ slug: "pubd", published: true, isLive: false })]} now={now} activeCount={1} overflowCount={0} />,
  );
  const pill = screen.getByTestId("shows-published-pill-pubd");
  expect(pill.textContent).toMatch(/Published/);
  // right VISUAL token, not just the right text (status-positive/teal) — §3
  expect(pill.className).toContain("border-status-positive");
  expect(pill.className).toContain("text-status-positive-text");
  expect(pill.querySelector(".bg-status-positive"), "positive dot").not.toBeNull();
  expect(within(pill).queryByText(/Held|Live|Publishing/)).toBeNull();
  // mutually exclusive: no other inline state pill for this row
  expect(screen.queryByTestId("shows-live-pill-pubd")).toBeNull();
  expect(screen.queryByTestId("shows-held-pill-pubd")).toBeNull();
});

it("inline Held pill keeps the verbose 'Held — not published' copy (place=inline) — §3.1", () => {
  render(
    <ShowsTable rows={[row({ slug: "h", published: false, isLive: false, finalizeOwned: false })]} now={now} activeCount={1} overflowCount={0} />,
  );
  expect(screen.getByTestId("shows-held-pill-h").textContent).toMatch(/Held — not published/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run tests/components/admin/ShowsTable.test.tsx -t "Published pill renders inline"`
Expected: FAIL — `Unable to find an element by: [data-testid="shows-published-pill-pubd"]` (today StatePill returns `null` for published rows).

- [ ] **Step 3: Implement — replace `StatePill` (`:108-147`) with the `place`-keyed version**

```tsx
type PillPlace = "inline" | "column";
type StatusState = "live" | "published" | "publishing" | "held";

// Single source of the status precedence (§3). Used by StatePill AND the sort.
function statusState(row: ActiveShowRow): StatusState {
  if (row.isLive) return "live";
  if (row.published) return "published";
  if (row.finalizeOwned) return "publishing";
  return "held";
}

// Literal class strings (NOT template-built) so Tailwind v4's content scan emits
// them. `held` deliberately uses the neutral `status-idle` tone (§3).
const PILL_TONE: Record<StatusState, { border: string; text: string; dot: string }> = {
  live: { border: "border-status-live", text: "text-status-live-text", dot: "bg-status-live" },
  published: { border: "border-status-positive", text: "text-status-positive-text", dot: "bg-status-positive" },
  publishing: { border: "border-status-warn", text: "text-status-warn-text", dot: "bg-status-warn" },
  held: { border: "border-status-idle", text: "text-status-idle-text", dot: "bg-status-idle" },
};

const INLINE_TESTID: Record<StatusState, string> = {
  live: "shows-live-pill",
  published: "shows-published-pill",
  publishing: "shows-publishing",
  held: "shows-held-pill",
};
const COLUMN_TESTID: Record<StatusState, string> = {
  live: "shows-statuscol-live",
  published: "shows-statuscol-published",
  publishing: "shows-statuscol-publishing",
  held: "shows-statuscol-held",
};
const STATE_LABEL: Record<StatusState, string> = {
  live: "Live",
  published: "Published",
  publishing: "Publishing…",
  held: "Held", // overridden to the verbose copy for place="inline"
};

function StatePill({ row, place }: { row: ActiveShowRow; place: PillPlace }) {
  const state = statusState(row);
  const tone = PILL_TONE[state];
  const testId = `${(place === "column" ? COLUMN_TESTID : INLINE_TESTID)[state]}-${row.slug}`;
  const label = state === "held" && place === "inline" ? "Held — not published" : STATE_LABEL[state];
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-semibold ${tone.border} ${tone.text}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}
```

Then update the title-site call (`:381`) to pass `place`:

```tsx
<StatePill row={row} place="inline" />
```

- [ ] **Step 4: Run to verify they pass + the existing pill tests still pass**

Run: `pnpm exec vitest run tests/components/admin/ShowsTable.test.tsx`
Expected: PASS (incl. the existing `Live pill` / `Publishing badge` / `Held pill` / `liveCount parity` tests — `place="inline"` preserves their testids and the verbose Held copy).

- [ ] **Step 5: Commit**

```bash
git add components/admin/ShowsTable.tsx tests/components/admin/ShowsTable.test.tsx
git commit --no-verify -m "feat(admin): StatePill place prop + Published status variant"
```

---

### Task 2: 6-column grid + Status column cell + inline-pill visibility wrapper

Add the `min-[960px]` 6-track grid template, the new Status column cell (`<StatePill place="column" />`, `hidden min-[960px]:block`, before the chevron), and wrap the inline title pill so it hides at `≥960px`.

**Files:**
- Modify: `components/admin/ShowsTable.tsx` — `ROW_GRID` (`:58-59`), inline pill site (`:381`), desktop cells (`:398-419`)
- Test: `tests/components/admin/ShowsTable.test.tsx`

**Interfaces:**
- Consumes: `StatePill` + `place` (Task 1).
- Produces: row Status cell `data-testid="shows-status-{slug}"` wrapping the column pill; the 6-track `ROW_GRID`.

- [ ] **Step 1: Write the failing tests**

```tsx
it("renders a Status COLUMN pill (place=column) with the compact 'Held' label — §4.1", () => {
  render(
    <ShowsTable rows={[row({ slug: "h2", published: false, isLive: false, finalizeOwned: false })]} now={now} activeCount={1} overflowCount={0} />,
  );
  const colPill = screen.getByTestId("shows-statuscol-held-h2");
  expect(colPill.textContent).toBe("Held"); // compact, no "— not published"
  // the inline pill still exists in the DOM (CSS-toggled), with verbose copy
  expect(screen.getByTestId("shows-held-pill-h2").textContent).toMatch(/Held — not published/);
});

it("inline pill is wrapped to hide ≥960px and the Status cell hides <960px — §4.1", () => {
  render(
    <ShowsTable rows={[row({ slug: "p3", published: true, isLive: false })]} now={now} activeCount={1} overflowCount={0} />,
  );
  // inline wrapper carries the hide-at-960 class. Check the parent's className string
  // directly — a bracket-heavy attribute selector (`[class*='min-[960px]:hidden']`) is
  // fragile in jsdom's selector engine.
  const inline = screen.getByTestId("shows-published-pill-p3");
  expect(inline.parentElement?.className ?? "").toContain("min-[960px]:hidden");
  // column cell carries hidden + show-at-960
  const cell = screen.getByTestId("shows-status-p3");
  expect(cell.className).toContain("hidden");
  expect(cell.className).toContain("min-[960px]:block");
});

it("ROW_GRID defines a 6-track template at min-[960px] (Status before chevron)", () => {
  render(<ShowsTable rows={[row({ slug: "g" })]} now={now} activeCount={1} overflowCount={0} />);
  const header = screen.getByTestId("shows-table-header");
  expect(header.className).toContain("min-[960px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_6rem_1.25rem]");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run tests/components/admin/ShowsTable.test.tsx -t "Status COLUMN pill"`
Expected: FAIL — no `shows-statuscol-held-h2` element.

- [ ] **Step 3: Implement**

Update `ROW_GRID` (`:58-59`) to add the 6-track template at `min-[960px]`:

```tsx
const ROW_GRID =
  "min-[720px]:grid min-[720px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_1.25rem] min-[960px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_6rem_1.25rem] min-[720px]:items-center min-[720px]:gap-4";
```

Wrap the inline title pill (`:381`) so it hides at ≥960px:

```tsx
<span className="min-[960px]:hidden">
  <StatePill row={row} place="inline" />
</span>
```

Insert the new Status column cell **between** the Sync cell (`:407-412`) and the chevron cell (`:413-419`):

```tsx
<span
  data-testid={`shows-status-${row.slug}`}
  className="hidden min-[960px]:block"
>
  <StatePill row={row} place="column" />
</span>
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run tests/components/admin/ShowsTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/ShowsTable.tsx tests/components/admin/ShowsTable.test.tsx
git commit --no-verify -m "feat(admin): Status column cell + 6-col grid + inline-pill visibility wrapper"
```

---

### Task 3: Sortable Status column header

Add the `"status"` sort key (rank-only `sortValue`, `STATUS_SORT_RANK`) and the `Status` sort-header button as the 5th header cell, gated to the 6-column grid (`hidden min-[960px]:block` wrapper).

**Files:**
- Modify: `components/admin/ShowsTable.tsx` — `SortKey` (`:64`), `sortValue` (`:67-87`), add `STATUS_SORT_RANK`, header (`:354-358`)
- Test: `tests/components/admin/ShowsTable.test.tsx`

**Interfaces:**
- Consumes: `statusState` (Task 1), `sortHeader` (`:217-250`).
- Produces: header button `data-testid="shows-sort-status"`; sort by `STATUS_SORT_RANK[statusState(row)]`.

- [ ] **Step 1: Write the failing test**

```tsx
it("clicking the Status header sorts by state severity (asc: publishing < held < live < published) — §5", () => {
  render(
    <ShowsTable
      rows={[
        row({ slug: "pubd", published: true, isLive: false }),               // published → rank 3
        row({ slug: "pubg", published: false, isLive: false, finalizeOwned: true }),  // publishing → 0
        row({ slug: "held", published: false, isLive: false, finalizeOwned: false }), // held → 1
        row({ slug: "live", published: true, isLive: true }),                // live → 2
      ]}
      now={now}
      activeCount={4}
      overflowCount={0}
    />,
  );
  fireEvent.click(screen.getByTestId("shows-sort-status")); // asc
  expect(
    screen.getAllByTestId(/^shows-table-row-/).map((el) => (el.getAttribute("data-testid") ?? "").replace("shows-table-row-", "")),
  ).toEqual(["pubg", "held", "live", "pubd"]);
  fireEvent.click(screen.getByTestId("shows-sort-status")); // desc reverses
  expect(
    screen.getAllByTestId(/^shows-table-row-/).map((el) => (el.getAttribute("data-testid") ?? "").replace("shows-table-row-", "")),
  ).toEqual(["pubd", "live", "held", "pubg"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/components/admin/ShowsTable.test.tsx -t "Status header sorts"`
Expected: FAIL — no `shows-sort-status` element.

- [ ] **Step 3: Implement**

Extend `SortKey` (`:64`):

```tsx
type SortKey = "title" | "dates" | "crew" | "sync" | "status";
```

Add the rank constant near `SYNC_SORT_RANK` (`:91`):

```tsx
// Status sort severity (attention-first). Each state has exactly ONE label, so
// the rank fully determines order — no |label suffix needed (§5); equal ranks
// fall through to the existing title tiebreak.
const STATUS_SORT_RANK: Record<StatusState, number> = { publishing: 0, held: 1, live: 2, published: 3 };
```

Add the `sortValue` case (`:67-87`, inside the `switch`):

```tsx
case "status":
  return STATUS_SORT_RANK[statusState(row)];
```

Add the Status sort header as the 5th header cell — insert between the `sync` header (`:357`) and the chevron `<span aria-hidden="true" />` (`:358`), wrapped so it occupies a grid cell only at ≥960px:

```tsx
<span className="hidden min-[960px]:block">{sortHeader("status", "Status")}</span>
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/components/admin/ShowsTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/ShowsTable.tsx tests/components/admin/ShowsTable.test.tsx
git commit --no-verify -m "feat(admin): sortable Status column header (rank by state severity)"
```

---

### Task 4: Dashboard two-col split + inbox breakpoints (and skeleton)

Move the dashboard two-col split `min-[1080px]`→`min-[1240px]` and delay the inbox widen `min-[1280px]`→`min-[1400px]` (§6.3), in `Dashboard.tsx` and the `loading.tsx` skeleton; rewrite the stale comment.

**Files:**
- Modify: `components/admin/Dashboard.tsx:463,468,554` + comment block `:448-460`
- Modify: `app/admin/loading.tsx:31,36`
- Test: `tests/components/admin/Dashboard.test.tsx`

- [ ] **Step 1: Write the failing test** (append to `tests/components/admin/Dashboard.test.tsx`):

```tsx
it("two-col split + inbox use the bumped breakpoints (1240 split, 1400 inbox-widen) — §6.3", async () => {
  await renderDashboard();
  const split = screen.getByTestId("dashboard-split");
  expect(split.className).toContain("min-[1240px]:flex-row");
  expect(split.className).toContain("min-[1240px]:items-stretch");
  const inbox = screen.getByTestId("dashboard-inbox-col");
  expect(inbox.className).toContain("min-[1240px]:w-80");
  expect(inbox.className).toContain("min-[1400px]:w-[480px]");
  expect(inbox.className).not.toContain("min-[1080px]");
  expect(inbox.className).not.toContain("min-[1280px]");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/components/admin/Dashboard.test.tsx -t "bumped breakpoints"`
Expected: FAIL — split still has `min-[1080px]:flex-row`.

- [ ] **Step 3: Implement**

`Dashboard.tsx` line 463: `min-[1080px]:flex-row min-[1080px]:items-stretch` → `min-[1240px]:flex-row min-[1240px]:items-stretch`.
Line 468: `min-[1080px]:flex-1` → `min-[1240px]:flex-1`.
Line 554: `min-[1080px]:w-80 min-[1080px]:shrink-0 min-[1280px]:w-[480px]` → `min-[1240px]:w-80 min-[1240px]:shrink-0 min-[1400px]:w-[480px]`.
Rewrite the comment block `:448-460` to describe: split now at `min-[1240px]` (the 6-col ShowsTable grid is active at ≥960, so the two-col band must start where `showsCol` still affords the title track); inbox base `w-80` (320px), widening to `w-[480px]` only at `min-[1400px]` (a 480px inbox at 1280 would starve the title); the band-sweep pins this.

`app/admin/loading.tsx` line 31: `min-[1080px]:flex-row` → `min-[1240px]:flex-row`.
Line 36: `min-[1080px]:w-80 min-[1280px]:w-[480px]` → `min-[1240px]:w-80 min-[1400px]:w-[480px]`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/components/admin/Dashboard.test.tsx`
Expected: PASS (the existing `items-stretch` substring test at `:85-88` still matches `min-[1240px]:items-stretch`).

- [ ] **Step 5: Commit**

```bash
git add components/admin/Dashboard.tsx app/admin/loading.tsx tests/components/admin/Dashboard.test.tsx
git commit --no-verify -m "feat(admin): bump dashboard two-col split to 1240 + delay inbox widen to 1400"
```

---

### Task 5: Real-browser layout gate — bands, structural non-regression, published-row overflow, visibility toggle (LAYOUT-DIMENSIONS task)

This is the project-mandated **layout-dimensions** task (real browser, not jsdom). It extends the band-sweep to the new ≥960 bands, adds a structural non-regression check, exercises the new inline `Published` pill's overflow via a deterministic published row, proves the inline↔column visibility toggle, and fixes the existing two-col test for the moved split.

**Dimensional Invariants under test (§6):**
- 6-col tracks `minmax(0,1fr) 10rem 5rem 12rem 6rem 1.25rem`; title `minmax(0,1fr)` track ≥ 120px at every band ≥960 (incl. new 1240/1400/1520); no row overflow; no header Show/Dates overlap.
- The 6-col grid must NOT activate below 960px (structural non-regression).
- Exactly one of {inline pill, column pill} visible per band; the Status sort header hidden <960 / visible ≥960.

**Files:**
- Modify: `tests/e2e/admin-layout-dimensions.spec.ts`

- [ ] **Step 1: Write the new/changed assertions**

(a) Extend `TITLE_BANDS` (`:160`) — append the new ≥960 boundary bands the change owns:

```tsx
const TITLE_BANDS = [720, 810, 960, 1024, 1080, 1100, 1152, 1240, 1280, 1400, 1520];
```

(b) Fix the existing "dashboard desktop" two-col test (`:66`) — `1200` is single-col after the split moved to 1240; use a width inside the new two-col band:

```tsx
await page.setViewportSize({ width: 1280, height: 900 }); // was 1200 — now two-col starts at 1240
```

(c) Add a new test — structural non-regression + Published-row overflow + visibility toggle. It pins the **known** seeded published row via `lookupSeededSlug()` (the Waldorf show, `published=true` by schema default `20260501000000:26`; its April-2026 dates are in the past so `isLive=false` → state `Published`), NOT "the first matching row" (spec §10). It uses the existing `lookupSeededSlug`/`gridTemplate`/`rect` helpers and `signInAs(ADMIN_FIXTURE)` from `beforeEach`:

```tsx
test("Status column: 6-col grid only ≥960, known published row no-overflow <960, inline↔column toggle", async ({ page }) => {
  const slug = await lookupSeededSlug(); // KNOWN seeded row (Waldorf), published=true, isLive=false → Published

  // ≥960: 6-track grid; the KNOWN row IS Published (fixture guard — fails loudly if
  // its state ever changes); its column pill visible, inline pill hidden; sort header visible.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/admin");
  await expect(page.getByTestId("stat-strip")).toBeVisible();
  await expect(page.getByTestId(`shows-table-row-${slug}`)).toBeVisible();
  await expect(page.getByTestId(`shows-statuscol-published-${slug}`)).toBeVisible();
  await expect(page.getByTestId(`shows-published-pill-${slug}`)).toBeHidden();
  await expect(page.getByTestId("shows-sort-status")).toBeVisible();
  const wideTracks = (await gridTemplate(page, "shows-table-header")).trim().split(/\s+/).length;
  expect(wideTracks, "6-col grid has 6 tracks at ≥960").toBe(6);

  // <960 (structural non-regression): 5-track grid — the 6-col grid must NOT leak below 960.
  await page.setViewportSize({ width: 810, height: 1000 });
  const narrowTracks = (await gridTemplate(page, "shows-table-header")).trim().split(/\s+/).length;
  expect(narrowTracks, "6-col grid must NOT activate below 960px").toBe(5);
  // inline visible, column hidden, sort header hidden.
  await expect(page.getByTestId(`shows-published-pill-${slug}`)).toBeVisible();
  await expect(page.getByTestId(`shows-statuscol-published-${slug}`)).toBeHidden();
  await expect(page.getByTestId("shows-sort-status")).toBeHidden();
  // Header MAPS to the 5-track grid: exactly 5 VISIBLE header cells (Status wrapper is
  // display:none), and the last cell (chevron) shares the first cell's row — i.e. the
  // hidden Status wrapper did NOT leave 6 items wrapping onto an implicit 6th-item row.
  const header = await page.getByTestId("shows-table-header").evaluate((el) => {
    const kids = Array.from(el.children) as HTMLElement[];
    const visible = kids.filter((k) => getComputedStyle(k).display !== "none");
    return {
      visibleCount: visible.length,
      firstTop: visible[0]!.getBoundingClientRect().top,
      lastTop: visible[visible.length - 1]!.getBoundingClientRect().top,
    };
  });
  expect(header.visibleCount, "exactly 5 visible header cells at 810px").toBe(5);
  expect(Math.abs(header.firstTop - header.lastTop), "chevron header on the Show header's row (no wrap)").toBeLessThanOrEqual(TOL);
  // The known published row + its new inline Published pill must not overflow at <960.
  const overflow = await page.getByTestId(`shows-table-row-${slug}`).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, "published row + inline Published pill must not overflow at 810px").toBeLessThanOrEqual(TOL);
});
```

- [ ] **Step 2: Run to verify the new bands + assertions** (requires the e2e env: dev server on :3000 + `pnpm db:seed`; see file header `:18`)

Run: `pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts`
Expected: the new `1240/1400/1520` band cases + the new Status test PASS; the `1280` two-col band passes (title ~220px). If a `<960` band (720/810) is RED, verify it is ALSO red at the merge-base (`git stash` / check `origin/main`) before treating it as this change's regression (§6.2; `feedback_verify_pre_existing_failures_at_merge_base`) — it is NOT introduced here (the 5-col grid is byte-identical).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-layout-dimensions.spec.ts
git commit --no-verify -m "test(admin): band-sweep ≥960 + structural non-regression + published-row overflow + visibility toggle"
```

---

### Task 6: Transition audit (TRANSITION-AUDIT task)

Project-mandated transition-audit. The Status column introduces NO animation (§7). Prove it: assert the table has no `AnimatePresence`/`motion`/`transition`-mount wrapper around the pills, the inline↔column swap is a pure CSS visibility toggle (two static nodes), and a compound change (state flip while another row is in a different state) is instant.

**Transition Inventory (§7) under test:**
- Any state ↔ any state: instant (pure render of precomputed fields).
- `Live` pill: static dot, **no ping** (ping is `StatusIndicator`, not this column).
- Inline (`<960`) ↔ column (`≥960`): CSS media-query visibility toggle of two static DOM nodes.
- 5-col ↔ 6-col grid at 960; split at 1240 / inbox widen at 1400: instant CSS.

**Files:**
- Create: `tests/components/admin/showsTableTransitionAudit.test.tsx`

- [ ] **Step 1: Write the audit test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { ShowsTable } from "@/components/admin/ShowsTable";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";

afterEach(cleanup);
const now = new Date("2026-06-03T12:00:00.000Z");
const base = (over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow => ({
  id: over.slug, title: `T ${over.slug}`, showDateStart: "2026-06-01", showDateEnd: "2026-06-05",
  crewCount: 3, lastSyncedAt: "2026-06-03T10:00:00.000Z", lastSyncStatus: "ok",
  published: true, isLive: false, finalizeOwned: false, archivedAt: null, ...over,
});

describe("ShowsTable status pills — transition audit (§7: no animation introduced)", () => {
  // DOM-SCOPED animation ban: assert every status pill AND its inner dot carries no
  // animate-*/transition-*/motion-* class. Scoped to the pills (NOT the whole file) so it
  // does NOT false-fail on the pre-existing sort-header `transition-colors` (:236), while
  // still catching a `transition-opacity`/`animate-*` accidentally added to a pill.
  it("every status pill + dot has no animation/transition class (all 4 states × both places)", () => {
    render(
      <ShowsTable
        rows={[
          base({ slug: "pu", published: true, isLive: false }),
          base({ slug: "lv", published: true, isLive: true }),
          base({ slug: "pg", published: false, finalizeOwned: true }),
          base({ slug: "hl", published: false, finalizeOwned: false }),
        ]}
        now={now} activeCount={4} overflowCount={0}
      />,
    );
    const testids = [
      "shows-published-pill-pu", "shows-statuscol-published-pu",
      "shows-live-pill-lv", "shows-statuscol-live-lv",
      "shows-publishing-pg", "shows-statuscol-publishing-pg",
      "shows-held-pill-hl", "shows-statuscol-held-hl",
    ];
    for (const id of testids) {
      const pill = screen.getByTestId(id);
      for (const el of [pill, ...Array.from(pill.querySelectorAll("*"))] as HTMLElement[]) {
        expect(el.className, `${id}: pill/dot carries an animation class`).not.toMatch(/\banimate-|\btransition-|\bmotion-/);
      }
    }
  });

  it("source has no heavyweight animation primitive for the pills (no AnimatePresence/framer-motion/animate-ping)", () => {
    const src = readFileSync("components/admin/ShowsTable.tsx", "utf8");
    expect(src).not.toMatch(/AnimatePresence|framer-motion/);
    // the Live pill is a static dot (§3/§7); the pulsing animate-ping belongs ONLY to
    // StatusIndicator (the Sync cell), never to this file.
    expect(src).not.toMatch(/animate-ping/);
  });

  it("inline↔column is a pure CSS toggle: both pills exist as static nodes, no JS conditional mount", () => {
    render(<ShowsTable rows={[base({ slug: "p", published: true })]} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.getByTestId("shows-published-pill-p")).toBeInTheDocument();
    expect(screen.getByTestId("shows-statuscol-published-p")).toBeInTheDocument();
  });

  it("compound: a published row and a held row each render their own instant state (no shared animation state)", () => {
    render(
      <ShowsTable
        rows={[base({ slug: "a", published: true }), base({ slug: "b", published: false, finalizeOwned: false })]}
        now={now} activeCount={2} overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-statuscol-published-a")).toBeInTheDocument();
    expect(screen.getByTestId("shows-statuscol-held-b").textContent).toBe("Held");
  });
});
```

- [ ] **Step 2: Run to verify it passes** (it asserts the already-implemented Tasks 1–2 are animation-free)

Run: `pnpm exec vitest run tests/components/admin/showsTableTransitionAudit.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/components/admin/showsTableTransitionAudit.test.tsx
git commit --no-verify -m "test(admin): transition audit — Status pills introduce no animation"
```

---

### Task 7: Reconcile the rest of the suite (affected jsdom tests)

The new inline `Published` pill renders for published rows that previously showed no pill, which can break an existing assertion that expected a clean title area. Run the full unit suite + the admin e2e layout specs and fix any genuine break, scoped to the relocation (do NOT change behavior).

**Files:**
- Modify: whichever tests the run surfaces (candidates: `tests/components/admin/Dashboard-archived.test.tsx`, `tests/e2e/admin-lifecycle-layout.spec.ts`)
- Test: the suite itself

**Anti-tautology / failure-mode notes:** the negative-regression check — flipping a fixture `published: true → false` must move a row Published → Held in BOTH render sites — is already covered by Task 1/2/3 tests reading distinct testids; do not weaken any of them to make a stale assertion pass.

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm exec vitest run tests/components/admin tests/admin`
Expected: identify any failures caused by a published-row fixture now showing `shows-published-pill-*` / `shows-statuscol-published-*`.

- [ ] **Step 2: Fix each genuine break minimally**

For each failure, update the assertion to the new reality (a published row now carries a Published pill) — e.g., if a test asserted "no pill for a published row", change it to assert the Published pill is present (inline testid). Do not relax a mutual-exclusivity or sort assertion. If a test breaks because of the split-breakpoint move (e.g., an archived-bucket layout test asserting side-by-side at <1240), update its viewport to ≥1240 (mirror Task 5b).

- [ ] **Step 3: Run the admin e2e layout specs that touch the dashboard split**

Run: `pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-lifecycle-layout.spec.ts`
Expected: PASS, or fix any side-by-side-at-<1240 assertion to ≥1240. Verify any pre-existing `<960`/`<1240` band failure at the merge-base before attributing it here.

- [ ] **Step 4: Run prettier + the full unit suite + BOTH admin layout e2e specs once more**

Run: `pnpm exec prettier --check . && pnpm exec vitest run`
Then re-run the real-browser layout gates (a late CSS/class tweak in this task could break the Task 5 gate): `pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts tests/e2e/admin-lifecycle-layout.spec.ts`
Expected: PASS / formatted; both e2e specs green (re-confirm the Task 5 Status-column test + the moved-split assertions still hold).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --no-verify -m "test(admin): reconcile suite with the new Published pill + moved split breakpoint"
```

---

### Task 8: Invariant-8 — impeccable v3 dual-gate (UI)

This diff is UI (`components/`, `app/admin/`). Per invariant 8, run BOTH `/impeccable critique` AND `/impeccable audit` on the affected diff with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight). HIGH/CRITICAL findings fixed or deferred via `DEFERRED.md`.

- [ ] **Step 1:** Run `/impeccable critique` on the diff (ShowsTable + Dashboard + loading). Record findings.
- [ ] **Step 2:** Run `/impeccable audit` on the same diff. Record findings.
- [ ] **Step 3:** Fix every HIGH/CRITICAL, or add a `DEFERRED.md` entry with the reason. Re-run the relevant gate to confirm.
- [ ] **Step 4:** Commit any fixes:

```bash
git add -A
git commit --no-verify -m "fix(admin): impeccable critique+audit findings on the Status column"
```

(If no fixes are needed, record the clean pass in the PR body — no empty commit.)

---

### Task 9: Plan self-review + cross-model adversarial review of the plan

Project writing-plans requirement: between self-review and execution handoff, run the cross-model (Codex) adversarial review of THIS plan, iterate to APPROVE.

- [ ] **Step 1:** Self-review this plan against the spec (coverage, placeholders, type consistency) — fix inline.
- [ ] **Step 2:** Invoke the `adversarial-review` skill (Codex) on the plan; iterate to APPROVE (no round budget). Reviewer is REVIEWER-ONLY.
- [ ] **Step 3:** Proceed to execution only after APPROVE.

---

## Self-Review (run after drafting — see writing-plans skill)

- **Spec coverage:** §1 goal → all tasks; §3 vocabulary + precedence → T1 `statusState`; §3.1/§4.1 `place` prop → T1/T2; §4 desktop/mobile placement → T2; §5 sort → T3; §6.3 breakpoints → T4; §6.2/§6.4 band-sweep + structural non-regression + published-row overflow → T5; §4.1 visibility toggle → T5; §7 transition inventory → T6; §8 guard conditions → covered by `statusState` total function (T1) + empty-state untouched; §10 test plan → T1–T7; §11 impeccable → T8. No gap.
- **Placeholder scan:** none — every code step is concrete; `PILL_TONE` has exactly the four `StatusState` keys.
- **Type consistency:** `statusState`/`StatusState`/`PillPlace`/`STATUS_SORT_RANK`/`INLINE_TESTID`/`COLUMN_TESTID` names match across T1/T2/T3; `place="inline"|"column"` consistent at all call sites.
