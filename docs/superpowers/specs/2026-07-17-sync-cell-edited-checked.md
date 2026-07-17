# Spec — Two-line Sync cell (Edited · Checked) in admin ShowsTable

**Date:** 2026-07-17
**Slug:** `sync-cell-edited-checked`
**Surface:** admin dashboard Active/Archived shows table (`components/admin/ShowsTable.tsx`)
**Type:** UI + light read-path data plumbing. No schema change, no mutation, no advisory lock.

---

## 1. Goal

The dashboard "Sync status" column today reads only `last_sync_status` + `last_synced_at` and, for the healthy (`ok`) bucket, renders `Synced {relative}` where the relative time is `last_synced_at` — the last time content actually **changed/applied**, NOT the last time the cron **looked** at the sheet. Two problems:

1. `Synced {relative}` reads as "we last checked N ago," but it is really "content last changed N ago." Misleading label.
2. There is no per-show signal for "when did the cron last successfully read this sheet." That signal already exists in the DB as `shows.last_checked_at` (migration `20260717000000_shows_last_checked_at.sql:5`) but is surfaced only in the aggregate Drive-connection health panel + stale footer — never per row. A show whose `last_checked_at` lags far behind the last cron tick is stuck/skipped, and the operator cannot see it here.

**This spec:** restructure the Sync cell into two lines — line 1 = status (health), line 2 = two muted relative timestamps: `Edited {rel} · Checked {rel}` (from `last_synced_at` + `last_checked_at`). No new grid column (Approach A, chosen over a 3-column layout to avoid disturbing the heavily band-swept grid track math + its real-browser dimension test).

---

## 2. Scope

**In scope**
- `SyncCell` (`ShowsTable.tsx:223-228`) — two-line render. Used by BOTH the desktop Sync column cell (`ShowsTable.tsx:515-520`) and the mobile stacked sub-line (`ShowsTable.tsx:490`) — one component, so both inherit the change (mode boundary, §5).
- `ActiveShowRow` (`lib/admin/showDisplay.ts:21-70`) — add `lastCheckedAt: string | null`.
- `Dashboard.tsx` — add `last_checked_at` to the shows SELECT (`:203`) and to the row map (`:511`).
- Tests: update the existing `ok`-bucket assertion; add coverage for line 2 + suppression + guard cases.

**Out of scope**
- The per-show admin page footer / `StaleFooter` / `driveConnectionHealth` panel — already surface `last_checked_at` ("last read") their own way; not touched.
- Sort behavior — the existing bucket-severity Sync sort (`ShowsTable.tsx:103-110`) is unchanged. No new sort-by-checked (YAGNI; can be a follow-up).
- The Archived table renders the same `ShowsTable`, so it inherits the cell change; no archived-specific work.
- No `syncStatusBucket` label changes (`lib/admin/syncStatus.ts`) — line 1 keeps the exact existing labels.

---

## 3. Current state (cited)

| Fact | Location |
|---|---|
| `SyncCell` renders `Synced {relative}` for ok, else bucket label | `components/admin/ShowsTable.tsx:223-228` |
| Desktop Sync cell wraps `SyncCell`, testid `shows-sync-{slug}` | `components/admin/ShowsTable.tsx:515-520` |
| Mobile sub-line renders `SyncCell` (same component) | `components/admin/ShowsTable.tsx:490` |
| `formatRelative(iso, now)` → "never" for null, else "just now/N min ago/Nh ago/Nd ago" | `lib/admin/showDisplay.ts:92-103` |
| `ActiveShowRow` has `lastSyncedAt`/`lastSyncStatus`, NOT `lastCheckedAt` | `lib/admin/showDisplay.ts:28-29` |
| `syncStatusBucket` → `{bucket,label}`; ok→"Synced", null→"Not synced yet" | `lib/admin/syncStatus.ts:20-46` |
| `StatusIndicator` renders dot + label; root element is a `<span>` (inline-flex) | `components/admin/StatusIndicator.tsx:26-47` |
| Dashboard shows SELECT (no `last_checked_at`) | `components/admin/Dashboard.tsx:203` |
| Dashboard row map (`lastSyncedAt`/`lastSyncStatus`) | `components/admin/Dashboard.tsx:511-512` |
| `last_checked_at timestamptz` column, backfilled from `last_synced_at` | `supabase/migrations/20260717000000_shows_last_checked_at.sql:5-8` |
| Sync sort ranks by bucket severity + label (NOT timestamp) | `components/admin/ShowsTable.tsx:103-110` |
| Existing test asserting `Synced {relative}` (WILL break) | `tests/components/admin/ShowsTable.test.tsx:72-81` |

---

## 4. Design

### 4.1 Cell structure (rendered element, exact)

**HTML-validity constraint (P1):** `SyncCell` is mounted inside a `<span>` desktop wrapper (`ShowsTable.tsx:515`) and today returns `<StatusIndicator/>` whose root is itself a `<span>` (`StatusIndicator.tsx:26-47`). A `<div>` inside that `<span>` is invalid HTML. Therefore **every element `SyncCell` renders — its new root and line 2 — MUST be a `<span>` styled block/flex, never a `<div>`.** (The mobile mount at `ShowsTable.tsx:490` is inside a `<div>`, which accepts either; the desktop `<span>` mount is the binding constraint.)

`SyncCell` returns a **`<span>` root** with `class="flex flex-col"` (an inline element promoted to a flex column via `display:flex`) containing:

- **Line 1** — the existing `<StatusIndicator status={bucket} label={label} />`, where `{bucket,label}` come straight from `syncStatusBucket(row.lastSyncStatus)`. The label is now the **bare bucket label** for every bucket — including ok, which becomes just `Synced` (the `Synced {relative}` concatenation is removed).
- **Line 2** — a muted meta line, rendered **only when `row.lastCheckedAt` is truthy** (see §4.3):
  ```
  <span class="mt-0.5 block text-xs text-text-faint tabular-nums" data-testid="shows-sync-times-{slug}">
    Edited {formatRelative(row.lastSyncedAt, now)}
    <span aria-hidden="true"> · </span>
    Checked {formatRelative(row.lastCheckedAt, now)}
  </span>
  ```
  The middot separator lives in its own `<span aria-hidden="true">` element so a screen reader announces `Edited 3h ago Checked 2m ago` (two clauses, no stray "middot"). Word choice: **"Checked"** (matches the column's own migration comment "we successfully reached Drive and evaluated this show"). "Edited" for `last_synced_at` (last content change).

`data-testid` on line 2 (`shows-sync-times-{slug}`) lets tests scope assertions to line 2 without matching line 1 (anti-tautology, §8). The existing `shows-sync-{slug}` testid on the wrapping cell (`ShowsTable.tsx:516`) is preserved.

### 4.2 Per-bucket behavior (complete matrix)

| `last_sync_status` | Line 1 (bucket label) | Line 2 (when `lastCheckedAt != null`) |
|---|---|---|
| `ok` | Synced | Edited {rel} · Checked {rel} |
| `pending_review` | Changes to review | Edited {rel} · Checked {rel} |
| `pending` | Sync in progress | Edited {rel} · Checked {rel} |
| `drive_error` | Couldn't reach Drive | Edited {rel} · Checked {rel} |
| `sheet_unavailable` | Sheet not in folder | Edited {rel} · Checked {rel} |
| `parse_error` | Couldn't read the sheet | Edited {rel} · Checked {rel} |
| `shrink_held` | Re-sync held (data loss) | Edited {rel} · Checked {rel} |
| `null`/`""`/`undefined` | Not synced yet | *(suppressed iff `lastCheckedAt == null`; see §4.3)* |
| unrecognized | Unknown sync state | Edited {rel} · Checked {rel} |

Line 1 mapping is 100% delegated to `syncStatusBucket` — no bucket labels are defined in this spec, only referenced. If a future enum value is added to `syncStatusBucket`, this cell inherits it with no change.

### 4.3 Guard conditions (every input, explicit)

Suppression uses a **falsy check `!row.lastCheckedAt`** (not `== null`), so `null`, `undefined`, AND `""` all suppress line 2 — matching `formatRelative`'s own `if (!iso)` guard (`showDisplay.ts:93`). This keeps the two in lockstep: there is no input for which line 2 renders `Checked never`.

- **`row.lastCheckedAt` falsy (`null` / `undefined` / `""`)** → line 2 is **not rendered** at all. Rationale: a row exists in `shows` only because the cron first-saw it, which sets `last_checked_at` (first-seen insert at `runScheduledCronSync.ts:1563-1568`) and the migration backfilled all pre-existing rows (`20260717000000...:8`). The DB column is `timestamptz` so the loaded value is an ISO string or `null`, never `""`; the `""` arm is defensive only. In the suppressed state line 1 already reads "Not synced yet," which fully carries the meaning — a `Checked never` line would be redundant noise. This is the ONLY suppression condition.
- **`row.lastCheckedAt` truthy but `row.lastSyncedAt` falsy** → line 2 renders `Edited never · Checked {rel}`. `formatRelative(null, now)` returns `"never"` (`showDisplay.ts:93`). This is a real state: cron checked the sheet but never applied content (e.g. held for review before first apply).
- **`row.lastSyncStatus == null` AND `lastCheckedAt` truthy** → line 1 "Not synced yet", line 2 `Edited never · Checked {rel}` renders. (Suppression is keyed on `lastCheckedAt`, not `lastSyncStatus`.)
- **Malformed ISO** in either timestamp → `formatRelative` returns the raw string (`showDisplay.ts:95`); pre-existing behavior, unchanged.
- Both timestamps are `string | null`; no NaN/number inputs reach this cell.

### 4.4 Word / copy

Plain-language only (invariant 5 — no raw codes): "Edited", "Checked", "never". No error codes surface here; line 1 already routes health through `syncStatusBucket` plain labels.

---

## 5. Mode boundaries (desktop vs mobile)

`SyncCell` is a single component rendered in two places:

- **Desktop** (`≥768px`): inside the `shows-sync-{slug}` grid cell (`ShowsTable.tsx:515-520`), 5th track, `12rem` wide (grid track unchanged — Approach A adds NO track). Two lines stack within the 12rem cell.
- **Mobile** (`<768px`): inside the stacked meta sub-line (`ShowsTable.tsx:483-491`), below dates + crew. Same two lines.

Both modes get identical two-line content because it is one component. No mode-specific branches.

---

## 6. Dimensional / layout invariants

- The Sync cell is NOT a fixed-height parent with stretch-dependent children; it is auto-height text content in a `12rem`-**width** grid track. Adding line 2 increases the cell's intrinsic height, which increases each row's height (`items-center` keeps content vertically centered). This is expected and uniform across rows.
- The `12rem` Sync **width** track is unchanged. `formatRelative` emits `"min ago"` (not `"m ago"`) / `"h ago"` / `"d ago"` / `"just now"` / `"never"` (`showDisplay.ts:96-102`), so line 2's worst case is `Edited 59 min ago · Checked 59 min ago` ≈ 38 chars. At `text-xs` this exceeds one line in a `12rem` (~192px) track, so **line 2 may wrap to a second visual line at wide relative values — that is acceptable and intended** (no `whitespace-nowrap` on line 2; the track already permits wrapping per `ShowsTable.tsx:71-72`). Short values (`Edited 3h ago · Checked 2m ago` ≈ 30 chars) fit on one line.
- No `align-items: stretch` dependency introduced (Tailwind v4 no-default-stretch rule N/A here — line 2 is a plain block, not a flex child needing stretch).
- **Row-height change → help-screenshot risk:** the taller rows change the rendered dashboard height, which MAY drift committed help-screenshot WebPs (`public/help/screenshots/**`). Plan must include: after implementation, run the screenshot manifest check; if dashboard shots drift, regenerate from the pinned Docker image (`--platform linux/amd64`) per the byte-comparison discipline, and commit the regenerated WebPs. Treat as expected drift, not a regression.

---

## 7. Transition inventory

The Sync cell has no interactive/animated state of its own. Enumerated states = the sync buckets (§4.2), which change only on a data refresh (server re-render), not via client interaction. All bucket→bucket changes are **instant — no animation** (the cell renders fresh markup per server payload; there is no `AnimatePresence`, ternary-with-exit, or mid-transition compound state). Line 2 appears/disappears (suppression toggle) **instant — no animation**. The only animation anywhere near this cell is the `StatusIndicator` dot's existing ping (owned by `StatusIndicator`, unchanged). No new transitions introduced → no transition-audit test task required beyond confirming the existing `showsTableTransitionAudit.test.tsx` still passes.

---

## 8. Testing plan (TDD, anti-tautology)

Each test states the concrete failure mode it catches.

1. **ok line 1 is bare "Synced" (no timestamp on line 1).** Scope to line 1 only: clone the `shows-sync-{slug}` cell, remove the `shows-sync-times-{slug}` child, assert the remaining text is `Synced` and does NOT match `/ago|Edited|Checked/`. *Catches:* regression where the timestamp stays fused to line 1. (Replaces the current `:72-81` assertion.)
2. **Line 2 renders `Edited {rel} · Checked {rel}` from the two distinct fields.** Fixture: `lastSyncedAt` and `lastCheckedAt` set to times that produce **different** relative strings (e.g. `Edited 2h ago`, `Checked 3 min ago`). Assert line 2 (`shows-sync-times-{slug}`) text contains both, in order, and that "Edited"'s value ≠ "Checked"'s value. *Catches:* wiring both clauses to the same field (would show identical times); deriving from a container that also renders line 1.
3. **Line 2 suppressed when `lastCheckedAt == null`.** Assert `queryByTestId("shows-sync-times-{slug}")` is null and line 1 still reads "Not synced yet". *Catches:* rendering `Checked never` noise on brand-new rows.
4. **`lastSyncedAt == null` but `lastCheckedAt != null` → `Edited never · Checked {rel}`.** *Catches:* crashing/blanking on a checked-but-never-applied row; proves the `never` guard.
5. **Middot separator is aria-hidden (DOM contract, not textContent).** `textContent` includes `aria-hidden` text, so it cannot prove the accessible name. Instead assert the DOM contract: the `·` lives in its own element carrying `aria-hidden="true"` — e.g. `const sep = within(line2).getByText("·"); expect(sep).toHaveAttribute("aria-hidden", "true")`. Additionally assert line 2 contains exactly one such aria-hidden separator. *Catches:* the middot being a bare text node (SR reads "middot"), or missing the aria-hidden attribute.
6. **Non-ok bucket still shows its bucket label on line 1 AND now shows line 2.** e.g. `drive_error` → line 1 "Couldn't reach Drive", line 2 present. *Catches:* the old `not.toMatch(/Synced/)` staying valid while line 2 is added. (Extends existing `:57-69`.)
7. **Sort unchanged.** The existing sync-sort test (`:572-603`) must still pass — sort ranks by bucket, timestamps in line 2 do not reorder. Run as regression, no new assertion.
8. **Loader field.** A Dashboard/loader test asserting `last_checked_at` is in the SELECT column list and maps to `lastCheckedAt`. *Catches:* the field never being fetched (line 2 would always suppress in prod). Prefer a targeted unit test over a full DB round-trip if a loader test harness exists; otherwise assert against the SELECT string.

Fixtures derive relative strings from `now`-relative offsets, never hardcoded wall-clock (self-deriving). The `row()` factory in `ShowsTable.test.tsx:30-44` gains a default `lastCheckedAt` so existing tests keep line 2 rendering unless a case overrides it.

**Compile-break coverage (P1):** `lastCheckedAt` is a **required** field on `ActiveShowRow` (consistent with the required `lastSyncedAt`/`lastSyncStatus`), so adding it makes every `ActiveShowRow` object literal fail `tsc` until updated — a fails-by-default guard, not a hazard. The plan MUST update every test factory that constructs an `ActiveShowRow`; the known set (grep `lastSyncedAt` in `tests/`, scoped to `ActiveShowRow` consumers) is at least: `tests/components/admin/ShowsTable.test.tsx`, `tests/components/admin/showsTableTransitionAudit.test.tsx`, `tests/components/admin/dataGapsTransitionAudit.test.tsx`, `tests/components/admin/Dashboard-archived.test.tsx`. A `pnpm typecheck` pass is the acceptance gate for this item (`vitest` strips types and would NOT catch an unupdated factory). The plan re-greps the live tree at implementation time — do not treat this list as exhaustive.

## 9. Meta-test inventory

- **No new meta-test created or extended.** This change adds no mutation surface (read-only display), no admin alert code, no advisory-lock surface, no Supabase call boundary (the Dashboard SELECT already destructures `{ data, error }` at its existing call site — adding one column to the select string does not add a call site), no new §12.4 code. The mutation-surface observability meta-test (`tests/log/_metaMutationSurfaceObservability.test.ts`) is not implicated. Declared explicitly per the writing-plans "Meta-test inventory (mandatory)" rule: **none applies** because the diff is a read-path display change with no new instrumented/gated/locked surface.

## 10. Advisory-lock topology

N/A — no `pg_advisory*` touched (read-only display + one SELECT column).

## 11. Numeric sweep

Literals in this spec: `12rem` (existing Sync track width, cited `ShowsTable.tsx` — not changed by this spec), `768px` (existing mobile breakpoint, cited), `~30 chars` short / `~38 chars` worst-case line-2 length / `~192px` track (fit estimates, illustrative, cross-checked against `formatRelative`'s `"min ago"` output at `showDisplay.ts:96-102`). No new numeric constant is introduced into code. Row-count caps, durations, env-var counts: none touched.

## 12. Do-not-relitigate (reviewer preempts)

- **Approach A (no new grid column) is ratified** by the user over the 3-column Approach B — the reason is the band-swept grid + its real-browser dimension test (`ShowsTable.tsx:59-82`); do not propose splitting into separate Status/Edit/Checked columns.
- **Line-2 suppression is keyed ONLY on `lastCheckedAt == null`**, deliberately (not on `lastSyncedAt`) — §4.3. A checked-but-never-edited row SHOULD show `Edited never · Checked {rel}`.
- **Sort stays bucket-severity** — timestamps intentionally do not drive sort (matches the existing `:103-110` rationale that hidden-ish data must not reorder rows).
- **"Checked" (not "Read")** is the chosen word for `last_checked_at` in this cell, even though the aggregate health panel says "last read" — ratified with the user; the two surfaces need not share the word.
- Row-height growth + any help-screenshot WebP drift is **expected**, handled by regen, not a bug.
