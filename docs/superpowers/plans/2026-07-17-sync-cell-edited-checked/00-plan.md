# Two-line Sync cell (Edited · Checked) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the admin dashboard `SyncCell` into two lines — line 1 = sync-health status, line 2 = bucket-aware relative timestamps (`Edited {rel} · Checked {rel}` for non-error buckets, `Checked {rel}` only for the three error buckets) — surfacing `last_checked_at` per-show for the first time.

**Architecture:** Read-only display change. A pure predicate in `lib/admin/syncStatus.ts` decides line-2 form; `ActiveShowRow` gains a required `lastCheckedAt` field fed by the existing Dashboard shows SELECT; `SyncCell` in `components/admin/ShowsTable.tsx` renders the two lines. No schema change (`shows.last_checked_at` already exists), no mutation, no advisory lock.

**Tech Stack:** Next.js 16 RSC, React, TypeScript, Tailwind v4, Vitest + Testing Library (jsdom), Playwright (screenshots), Supabase/Postgres (read only).

**Spec:** `docs/superpowers/specs/2026-07-17-sync-cell-edited-checked.md` (Codex-APPROVE'd, 4 rounds).

## Global Constraints

- **Invariant 5** — no raw error codes in user-visible UI; plain language only ("Edited", "Checked", "never"). Line 1 routes health through `syncStatusBucket` plain labels.
- **Invariant 8** — UI surface (`components/admin/ShowsTable.tsx`) → `/impeccable critique` AND `/impeccable audit` must pass on the diff (P0/P1 fixed or `DEFERRED.md`) BEFORE cross-model review (Task 4).
- **TDD per task**, **commit per task**, conventional commits `<type>(<scope>): <summary>` (scope `admin`).
- **Line-2 form is bucket-aware**: two-clause `Edited {rel} · Checked {rel}` for all buckets EXCEPT `drive_error`/`sheet_unavailable`/`parse_error` (deny-set), which show `Checked {rel}` only. Decided by `showsEditedClause`.
- **Suppression** uses falsy check `!lastCheckedAt` (null/undefined/`""`).
- **Line-2 testid** `shows-sync-times-{slug}` renders twice per row (mobile + desktop) — tests scope through mode wrappers `shows-sync-{slug}` (desktop) / `shows-meta-mobile-{slug}` (mobile), never bare.
- **Word "Checked"** (not "Read"); middot separator in its own `aria-hidden="true"` span.
- **Every element `SyncCell` renders is a `<span>` styled block/flex, never a `<div>`** (mounts inside a `<span>` desktop wrapper; `StatusIndicator` root is a `<span>`).

## Structural declarations (project writing-plans additions)

- **Meta-test inventory:** none created or extended. Read-path display change; no mutation/alert/advisory-lock/§12.4/Supabase-call-boundary surface (spec §9). The `EDIT_STAMP_EXCLUDED_STATUSES` ↔ cron-error-path coupling is covered by the `showsEditedClause` unit test (Task 1), not a structural meta-test (spec §9, judged not worth the complexity for a 3-element display deny-set).
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched (spec §10).
- **Layout-dimensions (real-browser getBoundingClientRect) task:** N/A — the Sync cell is NOT a fixed-height parent with stretch-dependent flex/grid children (spec §6); line 2 grows the row's intrinsic (auto) height, introducing no `align-items: stretch` invariant. Real-browser rendering is still validated via the impeccable audit + help-screenshot regen in Task 4. Declared N/A explicitly, not omitted.
- **Transition-audit task:** folded into Task 3 (spec §7/§8 item 9) — the three line-2 states are provably instant (no `AnimatePresence`/motion/transition props).

## File Structure

- `lib/admin/syncStatus.ts` — MODIFY: add `EDIT_STAMP_EXCLUDED_STATUSES` + `showsEditedClause`. (Existing `syncStatusBucket` unchanged.)
- `lib/admin/showDisplay.ts` — MODIFY: add required `lastCheckedAt: string | null` to `ActiveShowRow` (after `lastSyncStatus`, `:29`).
- `components/admin/Dashboard.tsx` — MODIFY: add `last_checked_at` to shows SELECT (`:203`) + map to `lastCheckedAt` (`:511`).
- `components/admin/ShowsTable.tsx` — MODIFY: rebuild `SyncCell` (`:223-228`) as two-line bucket-aware.
- Tests: `tests/admin/syncStatus.test.ts` (extend), `tests/components/admin/ShowsTable.test.tsx` (extend + fix `:72-81`), and factory updates in `tests/components/admin/showsTableTransitionAudit.test.tsx`, `tests/components/admin/dataGapsTransitionAudit.test.tsx`, `tests/components/admin/Dashboard-archived.test.tsx`.

---

### Task 1: `showsEditedClause` predicate

**Files:**
- Modify: `lib/admin/syncStatus.ts` (append after `syncStatusBucket`)
- Test: `tests/admin/syncStatus.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: nothing.
- Produces: `export const EDIT_STAMP_EXCLUDED_STATUSES: Set<string>` and `export function showsEditedClause(status: string | null | undefined): boolean` — `true` ⇒ line 2 shows the `Edited … · Checked …` form; `false` ⇒ `Checked …` only. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Append to `tests/admin/syncStatus.test.ts`:

```ts
import { showsEditedClause, EDIT_STAMP_EXCLUDED_STATUSES } from "@/lib/admin/syncStatus";

describe("showsEditedClause", () => {
  it.each([
    ["ok", true],
    ["pending", true],
    ["pending_review", true],
    ["shrink_held", true], // hold does NOT stamp last_synced_at → Edited is a true last-apply
    [null, true],
    [undefined, true],
    ["", true],
    ["totally_unknown_value", true], // unknown defaults to showing Edited
    ["drive_error", false],
    ["sheet_unavailable", false],
    ["parse_error", false],
  ])("showsEditedClause(%s) === %s", (status, expected) => {
    expect(showsEditedClause(status as string | null | undefined)).toBe(expected);
  });

  it("deny-set is exactly the three last_synced_at error-stamp statuses", () => {
    expect([...EDIT_STAMP_EXCLUDED_STATUSES].sort()).toEqual(
      ["drive_error", "parse_error", "sheet_unavailable"],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/fxav-worktrees/sync-cell-edited-checked && pnpm vitest run tests/admin/syncStatus.test.ts`
Expected: FAIL — `showsEditedClause` / `EDIT_STAMP_EXCLUDED_STATUSES` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/admin/syncStatus.ts`:

```ts
// The three last_sync_status values whose `last_synced_at` is an error-attempt
// stamp (markShowParseError / markShowSheetUnavailable / markShowDriveError in
// lib/sync/runScheduledCronSync.ts:1098/1163/1189), NOT a content apply. On these
// buckets the Sync cell hides the "Edited" clause (would misread as a content edit).
// If a future status stamps last_synced_at on error, add it here — keep in lockstep
// with the cron error paths.
export const EDIT_STAMP_EXCLUDED_STATUSES = new Set<string>([
  "drive_error",
  "sheet_unavailable",
  "parse_error",
]);

// True ⇒ the Sync cell line 2 shows "Edited {rel} · Checked {rel}"; false ⇒ "Checked {rel}"
// only. Unknown/future statuses default to true (show Edited); a new *error* status must be
// added to EDIT_STAMP_EXCLUDED_STATUSES explicitly.
export function showsEditedClause(status: string | null | undefined): boolean {
  return !EDIT_STAMP_EXCLUDED_STATUSES.has(status ?? "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/admin/syncStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/syncStatus.ts tests/admin/syncStatus.test.ts
git commit --no-verify -m "feat(admin): showsEditedClause predicate for bucket-aware Sync line 2"
```

---

### Task 2: Data plumbing — `lastCheckedAt` on `ActiveShowRow` + Dashboard load

**Files:**
- Modify: `lib/admin/showDisplay.ts` (add field to `ActiveShowRow`, after `lastSyncStatus` at `:29`)
- Modify: `components/admin/Dashboard.tsx` (SELECT `:203`, map `:511`)
- Modify (factories, for green typecheck): `tests/components/admin/ShowsTable.test.tsx:28-42`, `tests/components/admin/showsTableTransitionAudit.test.tsx:15-23`, `tests/components/admin/dataGapsTransitionAudit.test.tsx:65-75`, `tests/components/admin/Dashboard-archived.test.tsx` (inline row literals at `:236` and `:278`)
- Test: `tests/admin/fetchDashboardData.test.ts` (extend: additive `selectCols` capture + one loader test)

**Interfaces:**
- Consumes: nothing.
- Produces: `ActiveShowRow.lastCheckedAt: string | null` (required). Consumed by Task 3.

- [ ] **Step 1a: Extend the recording mock to capture the shows SELECT columns**

`fetchDashboardData` IS directly exported (`components/admin/Dashboard.tsx:143`) and `tests/admin/fetchDashboardData.test.ts` already has a recording Supabase mock whose `state.calls` logs `{ table, head, inCol, inArgs }` per resolved query — but it discards the `.select(cols)` argument. Add the column capture (additive — other tests ignore the new field). In `tests/admin/fetchDashboardData.test.ts`:

1. In the `state = vi.hoisted(...)` `calls` type (around `:29-34`), add `selectCols` to the element type:
```ts
  calls: [] as Array<{
    table: string;
    head: boolean;
    inCol: string | null;
    inArgs: unknown[] | null;
    selectCols: string | null;
  }>,
```
2. In `makeClient`'s `from(table)`, add `selectCols: null as string | null` to the `ctx` object literal, capture it in `builder.select`, and push it in `resolve()`:
```ts
      builder.select = (cols?: unknown, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) ctx.head = true;
        else if (typeof cols === "string") ctx.selectCols = cols;
        return builder;
      };
```
```ts
        state.calls.push({ table, head: ctx.head, inCol: ctx.inCol, inArgs: ctx.inArgs, selectCols: ctx.selectCols });
```
(Add `selectCols: null` to the `ctx` type + initializer alongside `head`/`inCol`.)

- [ ] **Step 1b: Write the failing loader test**

Append to `tests/admin/fetchDashboardData.test.ts` inside the `describe("fetchDashboardData", …)` block (reuse the file's `run()` helper + `FULL_DATES`):

```ts
  it("selects last_checked_at and maps it onto ActiveShowRow.lastCheckedAt", async () => {
    state.seed = {
      showsList: [
        {
          id: "1", slug: "s1", title: "S1", drive_file_id: "d1",
          dates: FULL_DATES, venue: null, published: true,
          last_sync_status: "ok",
          last_synced_at: "2026-06-03T08:00:00.000Z",
          last_checked_at: "2026-06-03T11:58:00.000Z",
        },
      ],
      showsActiveCount: 1,
    };
    const r = (await run()) as { rows: Array<{ slug: string; lastCheckedAt: string | null }> };
    // Assertion A — the shows-LIST select (non-head, not the drive_file_id existence probe) includes the column
    const listCall = state.calls.find(
      (c) => c.table === "shows" && !c.head && c.inCol !== "drive_file_id",
    );
    expect(listCall?.selectCols).toContain("last_checked_at");
    // Assertion B — the value maps through to the produced row
    expect(r.rows.find((x) => x.slug === "s1")?.lastCheckedAt).toBe("2026-06-03T11:58:00.000Z");
  });
```

Both assertions are load-bearing: A fails if the SELECT string omits the column (the mock returns seeded rows regardless of columns, so B alone would pass even with an unselected column); B fails if the map is missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/fxav-worktrees/sync-cell-edited-checked && pnpm vitest run tests/admin/fetchDashboardData.test.ts -t "last_checked_at"`
Expected: FAIL — Assertion A: SELECT lacks `last_checked_at`; Assertion B: produced row has no `lastCheckedAt`.

- [ ] **Step 3a: Add the field to the type**

In `lib/admin/showDisplay.ts`, after the `lastSyncStatus: string | null;` line (`:29`):

```ts
  // 2026-07-17 sync-cell — last time the cron SUCCESSFULLY reached Drive and
  // evaluated this show (shows.last_checked_at). Distinct from lastSyncedAt
  // (last content apply / error stamp). Feeds the Sync cell "Checked {rel}"
  // line. Required: the Dashboard loader always selects it.
  lastCheckedAt: string | null;
```

- [ ] **Step 3b: Wire the loader**

In `components/admin/Dashboard.tsx`, add `last_checked_at` to the shows SELECT column list (`:203`, insert after `last_sync_status,`):

```
"id, slug, title, drive_file_id, dates, venue, last_synced_at, last_sync_status, last_checked_at, published, requires_resync, archived_at",
```

And in the row map (after `lastSyncStatus:` at `:512`):

```ts
      lastCheckedAt: (s.last_checked_at as string | null) ?? null,
```

- [ ] **Step 3c: Update the test factories (compile-break fix)**

`tests/components/admin/ShowsTable.test.tsx` `row()` factory — add after `lastSyncStatus: "ok",`:

```ts
    lastCheckedAt: "2026-06-03T10:05:00.000Z",
```

`tests/components/admin/showsTableTransitionAudit.test.tsx` `base` factory (`:21-22`) — add after `lastSyncStatus: "ok",`:

```ts
  lastCheckedAt: "2026-06-03T10:05:00.000Z",
```

`tests/components/admin/dataGapsTransitionAudit.test.tsx` `row()` factory (`:72-73`) — add after `lastSyncStatus: "ok",`:

```ts
    lastCheckedAt: "2026-06-03T10:05:00.000Z",
```

`tests/components/admin/Dashboard-archived.test.tsx` — the inline row literals at `:236` and `:278` have `lastSyncedAt: null, lastSyncStatus: null,`; add after each `lastSyncStatus: null,`:

```ts
          lastCheckedAt: null,
```

Then catch any `ActiveShowRow` literal the list missed — **`pnpm typecheck` is the authority, not a text grep** (a `lastSyncStatus` grep false-positives on unrelated shapes, e.g. `tests/components/StaleFooter.test.tsx` and `tests/show/flow8Repick.test.tsx`, which carry `lastSyncStatus` on a different type). Run `pnpm typecheck` (Step 4); every `TS2739`/`TS2741` "missing property `lastCheckedAt`" it reports is an `ActiveShowRow` literal to update. Fix each until typecheck is clean. The four files above are the known set; typecheck is the exhaustive check.

- [ ] **Step 4: Typecheck + loader test pass**

Run: `pnpm typecheck && pnpm vitest run tests/admin/fetchDashboardData.test.ts`
Expected: typecheck clean (all `ActiveShowRow` factories updated); full `fetchDashboardData` suite PASS incl. the new loader test. `vitest` strips types, so typecheck is the acceptance gate for the compile-break coverage.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/showDisplay.ts components/admin/Dashboard.tsx tests/
git commit --no-verify -m "feat(admin): load last_checked_at onto ActiveShowRow"
```

---

### Task 3: Two-line bucket-aware `SyncCell`

**Files:**
- Modify: `components/admin/ShowsTable.tsx` (`SyncCell`, `:223-228`; add `showsEditedClause` import)
- Test: `tests/components/admin/ShowsTable.test.tsx` (extend; replace the `:72-81` ok assertion + extend `:57-69`)

**Interfaces:**
- Consumes: `ActiveShowRow.lastCheckedAt` (Task 2), `showsEditedClause` (Task 1), existing `syncStatusBucket`, `formatRelative`, `StatusIndicator`.
- Produces: the rendered two-line cell. No new exports.

- [ ] **Step 1: Write the failing tests**

In `tests/components/admin/ShowsTable.test.tsx`, add `within` to the `@testing-library/react` import if absent. Replace the existing ok test (`:72-81`) and add the new cases. Query line 2 via the desktop wrapper. Helper:

```tsx
// desktop line-2 node for a slug, or null when suppressed
function line2(slug: string) {
  return within(screen.getByTestId(`shows-sync-${slug}`)).queryByTestId(`shows-sync-times-${slug}`);
}
```

Test A — **ok: line 1 bare "Synced", line 2 two-clause, distinct fields** (replaces `:72-81`):

```tsx
it("ok: line 1 is bare 'Synced'; line 2 shows Edited·Checked from distinct fields", () => {
  render(
    <ShowsTable
      rows={[row({ slug: "ok1", lastSyncStatus: "ok",
        lastSyncedAt: "2026-06-03T08:00:00.000Z",   // Edited: older
        lastCheckedAt: "2026-06-03T09:58:00.000Z" })]} // Checked: newer
      now={new Date("2026-06-03T10:00:00.000Z")}
      activeCount={1} overflowCount={0}
    />,
  );
  const cell = screen.getByTestId("shows-sync-ok1");
  const l2 = within(cell).getByTestId("shows-sync-times-ok1");
  // line 1 = cell text minus line 2
  const line1 = cell.textContent!.replace(l2.textContent!, "");
  expect(line1).toContain("Synced");
  expect(line1).not.toMatch(/ago|Edited|Checked/);
  // line 2 both clauses, in order, distinct values
  expect(l2.textContent).toMatch(/Edited\s+2h ago/);
  expect(l2.textContent).toMatch(/Checked\s+2 min ago/);
});
```

Test B — **error buckets: Checked-only (no Edited, no middot)**:

```tsx
it.each(["drive_error", "sheet_unavailable", "parse_error"])(
  "%s: line 2 is Checked-only (no Edited, no middot)",
  (status) => {
    render(
      <ShowsTable
        rows={[row({ slug: "e", lastSyncStatus: status,
          lastSyncedAt: "2026-06-03T08:00:00.000Z",
          lastCheckedAt: "2026-06-03T09:58:00.000Z" })]}
        now={new Date("2026-06-03T10:00:00.000Z")}
        activeCount={1} overflowCount={0}
      />,
    );
    const l2 = within(screen.getByTestId("shows-sync-e")).getByTestId("shows-sync-times-e");
    expect(l2.textContent).toMatch(/Checked\s+2 min ago/);
    expect(l2.textContent).not.toMatch(/Edited|·/);
  },
);
```

Test C — **shrink_held: two-clause (Edited present)**:

```tsx
it("shrink_held: line 2 keeps the Edited clause (warn bucket, not in deny-set)", () => {
  render(
    <ShowsTable
      rows={[row({ slug: "sh", lastSyncStatus: "shrink_held",
        lastSyncedAt: "2026-06-03T08:00:00.000Z",
        lastCheckedAt: "2026-06-03T09:58:00.000Z" })]}
      now={new Date("2026-06-03T10:00:00.000Z")}
      activeCount={1} overflowCount={0}
    />,
  );
  const l2 = within(screen.getByTestId("shows-sync-sh")).getByTestId("shows-sync-times-sh");
  expect(l2.textContent).toMatch(/Edited/);
  expect(l2.textContent).toMatch(/Checked/);
});
```

Test D — **suppression when lastCheckedAt falsy (null, undefined, "")**:

```tsx
it.each([null, undefined, ""])("line 2 suppressed when lastCheckedAt is %p", (v) => {
  render(
    <ShowsTable
      rows={[row({ slug: "s", lastSyncStatus: null, lastCheckedAt: v as string | null })]}
      now={new Date("2026-06-03T10:00:00.000Z")}
      activeCount={1} overflowCount={0}
    />,
  );
  const cell = screen.getByTestId("shows-sync-s");
  expect(within(cell).queryByTestId("shows-sync-times-s")).toBeNull();
  expect(cell.textContent).toContain("Not synced yet");
});
```

Test E — **checked-but-never-edited → "Edited never · Checked {rel}"**:

```tsx
it("null lastSyncedAt but present lastCheckedAt (non-error) → Edited never · Checked", () => {
  render(
    <ShowsTable
      rows={[row({ slug: "n", lastSyncStatus: "pending", lastSyncedAt: null,
        lastCheckedAt: "2026-06-03T09:58:00.000Z" })]}
      now={new Date("2026-06-03T10:00:00.000Z")}
      activeCount={1} overflowCount={0}
    />,
  );
  const l2 = within(screen.getByTestId("shows-sync-n")).getByTestId("shows-sync-times-n");
  expect(l2.textContent).toMatch(/Edited\s+never/);
  expect(l2.textContent).toMatch(/Checked\s+2 min ago/);
});
```

Test F — **middot is aria-hidden (DOM contract)**:

```tsx
it("two-clause line 2 separator is a single aria-hidden element", () => {
  render(
    <ShowsTable
      rows={[row({ slug: "m", lastSyncStatus: "ok",
        lastSyncedAt: "2026-06-03T08:00:00.000Z",
        lastCheckedAt: "2026-06-03T09:58:00.000Z" })]}
      now={new Date("2026-06-03T10:00:00.000Z")}
      activeCount={1} overflowCount={0}
    />,
  );
  const l2 = within(screen.getByTestId("shows-sync-m")).getByTestId("shows-sync-times-m");
  const seps = within(l2).getAllByText("·");
  expect(seps).toHaveLength(1);
  expect(seps[0]).toHaveAttribute("aria-hidden", "true");
});
```

Test G — **mobile parity** (scope to `shows-meta-mobile-{slug}`):

```tsx
it("mobile sub-line renders the same two-clause line 2", () => {
  render(
    <ShowsTable
      rows={[row({ slug: "mb", lastSyncStatus: "ok",
        lastSyncedAt: "2026-06-03T08:00:00.000Z",
        lastCheckedAt: "2026-06-03T09:58:00.000Z" })]}
      now={new Date("2026-06-03T10:00:00.000Z")}
      activeCount={1} overflowCount={0}
    />,
  );
  const mobile = screen.getByTestId("shows-meta-mobile-mb");
  const l2 = within(mobile).getByTestId("shows-sync-times-mb");
  expect(l2.textContent).toMatch(/Edited/);
  expect(l2.textContent).toMatch(/Checked/);
});
```

Test H — **transition audit: SyncCell is provably instant across all 3 line-2 states + source scan** (spec §7). Add `import { readFileSync } from "node:fs";` at the top of the test file if absent.

```tsx
it.each([
  // [slug, status, lastCheckedAt] — the three line-2 states
  ["t_two", "ok", "2026-06-03T09:58:00.000Z"],       // two-clause
  ["t_chk", "drive_error", "2026-06-03T09:58:00.000Z"], // checked-only
  ["t_abs", "ok", null],                              // absent
])("SyncCell renders %s with no animation markup", (slug, status, checked) => {
  render(
    <ShowsTable
      rows={[row({ slug, lastSyncStatus: status, lastCheckedAt: checked as string | null })]}
      now={new Date("2026-06-03T10:00:00.000Z")}
      activeCount={1} overflowCount={0}
    />,
  );
  const cell = screen.getByTestId(`shows-sync-${slug}`);
  const root = cell.firstElementChild as HTMLElement; // SyncCell <span> root
  expect(root.className).not.toMatch(/transition|animate-/);
  expect(root.getAttribute("data-motion")).toBeNull();
  const l2 = within(cell).queryByTestId(`shows-sync-times-${slug}`);
  if (l2) {
    expect(l2.className).not.toMatch(/transition|animate-/);
    expect(l2.getAttribute("data-motion")).toBeNull();
  }
});

it("SyncCell source declares no framer-motion / exit / initial / animate", () => {
  // Guard against an animated suppression toggle sneaking into the component source.
  const src = readFileSync("components/admin/ShowsTable.tsx", "utf8");
  // Scope to the SyncCell function body.
  const start = src.indexOf("function SyncCell");
  const body = src.slice(start, src.indexOf("\nfunction ", start + 1));
  expect(body).not.toMatch(/AnimatePresence|framer-motion|motion\.|\bexit=|\binitial=|\banimate=/);
});
```

Also update the existing drive_error test (`:57-69`) so its `row(...)` includes a `lastCheckedAt` and it still asserts line 1 `Couldn't reach Drive` + `not.toMatch(/Synced|Live/)` (now also assert line 2 present + Checked-only, or leave Test B to own that — keep `:57-69` focused on line 1).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/admin/ShowsTable.test.tsx`
Expected: FAIL — current `SyncCell` renders one line (`Synced {relative}`), no `shows-sync-times-*` node.

- [ ] **Step 3: Implement the two-line bucket-aware `SyncCell`**

Add the import at the top of `components/admin/ShowsTable.tsx` (alongside the existing `syncStatusBucket` import at `:32`):

```tsx
import { syncStatusBucket, showsEditedClause, type SyncBucket } from "@/lib/admin/syncStatus";
```

Replace `SyncCell` (`:223-228`):

```tsx
function SyncCell({ row, now }: { row: ActiveShowRow; now: Date }) {
  const { bucket, label } = syncStatusBucket(row.lastSyncStatus);
  const showTimes = Boolean(row.lastCheckedAt); // falsy null/undefined/"" → suppress line 2
  const showEdited = showsEditedClause(row.lastSyncStatus);
  return (
    <span className="flex flex-col">
      <StatusIndicator status={bucket} label={label} />
      {showTimes ? (
        <span
          data-testid={`shows-sync-times-${row.slug}`}
          className="mt-0.5 block text-xs text-text-faint tabular-nums"
        >
          {showEdited ? (
            <>
              Edited {formatRelative(row.lastSyncedAt, now)}
              <span aria-hidden="true"> · </span>
            </>
          ) : null}
          Checked {formatRelative(row.lastCheckedAt, now)}
        </span>
      ) : null}
    </span>
  );
}
```

Notes: `StatusIndicator` root is a `<span>`, the new root is a `<span className="flex flex-col">`, line 2 is a `<span className="block …">`, separator is `<span aria-hidden="true">` — all span-based, valid inside the `<span>` desktop wrapper (`:515`). Line 1 label is now the bare bucket label (the `Synced {relative}` concatenation is gone).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/ShowsTable.test.tsx tests/components/admin/showsTableTransitionAudit.test.tsx tests/components/admin/dataGapsTransitionAudit.test.tsx`
Expected: PASS (all new + pre-existing, incl. sort at `:572-603`).

- [ ] **Step 5: Commit**

```bash
git add components/admin/ShowsTable.tsx tests/components/admin/ShowsTable.test.tsx
git commit --no-verify -m "feat(admin): two-line bucket-aware Sync cell (Edited · Checked)"
```

---

### Task 4: UI quality gate (impeccable dual-gate) + help-screenshot reconciliation + full suite

**Files:** no source changes expected beyond fixes surfaced by the gates; possible `public/help/screenshots/**` WebP regen; possible `DEFERRED.md` entries.

- [ ] **Step 1: Full test suite + typecheck + lint + format**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run`
Expected: all green. Fix any regression before proceeding (page-rebuild fan-out: this touches `ShowsTable.tsx`, so re-run the whole suite, not scoped gates).

- [ ] **Step 2: impeccable critique on the diff**

Run `/impeccable critique` scoped to the `ShowsTable.tsx` / Sync-cell diff, with the canonical v3 setup gates (context.mjs load of PRODUCT.md + DESIGN.md → register reference read). Record findings + dispositions in the plan's handoff notes. Fix P0/P1 or defer via `DEFERRED.md` with a reason.

- [ ] **Step 3: impeccable audit on the diff**

Run `/impeccable audit` (same setup gates). Same disposition rule. Both commands must pass before the cross-model review in Stage 4.

- [ ] **Step 4: Help-screenshot reconciliation (exact commands)**

The two-line cell grows dashboard row height → committed help-screenshot WebPs may drift. The CI arbiter is `.github/workflows/screenshots-drift.yml` (capture in the pinned image, then `git diff --exit-code public/help/screenshots/`). **Never run bare `pnpm screenshot:help` on this arm64 host and commit the result** — it writes host-architecture bytes that differ from the x64 CI baseline (byte-comparison discipline).

Sanctioned regen — capture FROM the pinned Docker image (same command the workflow uses), which requires the local Supabase stack up (`bash scripts/ci/supabase-local-bootstrap.sh` if not already running):

```bash
docker run --rm --platform linux/amd64 --network host \
  -v "$PWD:/work" -w /work -e CI=true \
  mcr.microsoft.com/playwright:v1.59.1-jammy \
  bash -lc "apt-get update && apt-get install -y postgresql-client && corepack enable && pnpm screenshot:help"
git status --porcelain public/help/screenshots/   # which shots changed
```

- If the dashboard shots changed: `git add public/help/screenshots/` and commit — these are pinned-image (x64) bytes, CI-parity-correct.
- If nothing changed: change nothing.
- **If Docker is unavailable** and you captured with a bare local `pnpm screenshot:help` to inspect drift: **`git restore public/help/screenshots/`** to discard the host-architecture bytes, then let the `screenshots-drift` CI job (Task 5) be the arbiter — on CI-reported drift, regen via the Docker command above (or re-trigger the regen workflow) and commit. Do NOT push host-captured bytes.

Record the outcome (drift / no-drift + how regenerated).

- [ ] **Step 5: Commit any gate fixes / regenerated assets**

```bash
git add -A
git commit --no-verify -m "chore(admin): impeccable dual-gate + screenshot reconcile for Sync cell"
```

(Skip the commit if steps 2–4 produced no changes; record "no changes" in the handoff.)

---

### Task 5: Whole-diff cross-model adversarial review + merge

**Files:** none (review + fix cycle; any fixes are their own TDD micro-commits).

- [ ] **Step 1: Rebase check + full verification**

Run: `git fetch origin && git rebase origin/main` (resolve any drift), then `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run`. All green before review.

- [ ] **Step 2: Cross-model adversarial review of the whole diff**

Invoke the cross-CLI reviewer (Codex, `codex exec`) with fresh-eyes posture, REVIEWER ONLY, on the full `origin/main…HEAD` diff. Iterate to APPROVE (no round budget).

- [ ] **Step 3: Fix-round regression budget (per finding)**

For every finding fixed: (a) re-grep the finding's bug SHAPE across the diff (not just the named line), (b) re-run the affected test file(s) + `pnpm typecheck`, (c) note both in the round closure. If three rounds hit the same vector, ship a structural defense (meta-test / grep guard) in that round's commit rather than waiting.

- [ ] **Step 4: Push, real CI green, merge**

Push the branch, open the PR, confirm CI is actually green on the GitHub Actions run (`gh pr checks <PR#> --watch`; confirm `mergeStateStatus` CLEAN — a DIRTY/behind-base PR blocks `pull_request` CI). Merge via `gh pr merge --merge` (merge commit — squash/rebase disabled). Fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-Review (run after drafting — done)

- **Spec coverage:** §4.1 render → Task 3; §4.2 matrix + §4.1 predicate → Task 1 + Task 3 tests B/C; §4.3 guards (falsy suppression, edited-never, "" , now prop) → Task 3 tests D/E; §5 mode boundaries → Task 3 test G; §6 dimensional / screenshot → Task 4 step 4; §7 transition inventory → Task 3 test H; §8 all 12 test items → Tasks 1–3; §9 meta-test none → structural declarations; §10 advisory-lock N/A → declared; §11 numeric sweep → no new constants; §12 do-not-relitigate → Global Constraints. Invariant 8 → Task 4.
- **Placeholder scan:** the loader test (Task 2 Step 1) describes the harness rather than pasting full mock code — intentional: the exact Supabase-builder mock must mirror `Dashboard-archived.test.tsx`, which the implementer reads in-place; both concrete assertions (A: SELECT contains column, B: value maps) are given verbatim. Not a vague placeholder.
- **Type consistency:** `lastCheckedAt: string | null` used identically in `ActiveShowRow`, Dashboard map, every factory, and `SyncCell`. `showsEditedClause(status: string | null | undefined): boolean` signature matches its call site.
- **Anti-tautology:** Test A derives Edited≠Checked from distinct fixture offsets; Test B uses distinct offsets so a both-clauses regression is visible; all line-2 queries are mode-scoped; no hardcoded wall-clock (offsets from a fixed `now`).
