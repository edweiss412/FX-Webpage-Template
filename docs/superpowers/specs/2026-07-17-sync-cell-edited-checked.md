# Spec — Two-line Sync cell (Edited · Checked) in admin ShowsTable

**Date:** 2026-07-17
**Slug:** `sync-cell-edited-checked`
**Surface:** admin dashboard Active/Archived shows table (`components/admin/ShowsTable.tsx`)
**Type:** UI + light read-path data plumbing. No schema change, no mutation, no advisory lock.

---

## 1. Goal

The dashboard "Sync status" column today reads only `last_sync_status` + `last_synced_at` and, for the healthy (`ok`) bucket, renders `Synced {relative}` where the relative time is `last_synced_at`. Two problems:

1. `Synced {relative}` reads as "we last checked N ago," but it is really the last **terminal sync outcome** time. Misleading label.
2. There is no per-show signal for "when did the cron last successfully read this sheet." That signal already exists in the DB as `shows.last_checked_at` (migration `20260717000000_shows_last_checked_at.sql:5`) but is surfaced only in the aggregate Drive-connection health panel + stale footer — never per row. A show whose `last_checked_at` lags far behind the last cron tick is stuck/skipped, and the operator cannot see it here.

**Field semantics (verified against live cron):**
- `last_synced_at = now()` is written on: a successful `ok` content apply (`runScheduledCronSync.ts:1497/1525`), the first-seen insert (`:1564`), a `pending_review` staging write (`updateShowPendingReview`, `:1142`), **AND the three sync-error paths** — `parse_error` (`:1098`), `sheet_unavailable` (`:1163`), `drive_error` (`:1189`). It is NOT written on a `shrink_held` hold (`:1115-1120`, explicit) nor on a healthy no-op pass (`:2710`). So for the ok/pending_review/shrink_held buckets it reflects a real content apply or staged change (= a genuine "edit"), but for the three error buckets it is an **error-attempt stamp**, not an edit.
- `last_checked_at = now()` is written whenever the cron **successfully reached Drive and evaluated** the show — on `ok` applies (`:1498/1526`), the first-seen insert (`:1564`), a `pending_review` staging write (`:1143`), a `shrink_held` read (`:1127`), and a healthy no-op/watermark pass (`:2713`). It is NOT written on the three error paths (Drive/sheet/parse failed). So "Checked" is an honest "last clean read" for every bucket, and it correctly goes stale on error rows.

**This spec:** restructure the Sync cell into two lines — line 1 = status (health), line 2 = muted relative timestamps. Because "Edited" (`last_synced_at`) is only truthful when it reflects a content apply, line 2 is **bucket-aware** (§4.2): the two-clause `Edited {rel} · Checked {rel}` for the non-error buckets, and a single `Checked {rel}` for the three error buckets (`drive_error`/`sheet_unavailable`/`parse_error`) where `last_synced_at` is an error stamp. No new grid column (Approach A, chosen over a 3-column layout to avoid disturbing the heavily band-swept grid track math + its real-browser dimension test).

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
- **The Archived bucket renders `ArchivedShowRow` (`components/admin/Dashboard.tsx:686`), NOT `ShowsTable`.** `ArchivedShowRow` renders no sync cell at all (verified — no `SyncCell`/sync render). So the two-line cell is **Active-bucket only**; there is NO archived-specific visual work. The shared `ActiveShowRow` type still gains the required `lastCheckedAt` field (Dashboard maps every row, active + archived, through it), and `ArchivedShowRow` simply ignores it. `tests/components/admin/Dashboard-archived.test.tsx` still needs the field for typecheck (§8).
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
- **Line 2** — a muted meta line, rendered **only when `row.lastCheckedAt` is truthy** (see §4.3), and **bucket-aware** in its content:
  - **Two-clause form** (non-error buckets — see §4.2 for the exact set):
    ```
    <span class="mt-0.5 block text-xs text-text-faint tabular-nums" data-testid="shows-sync-times-{slug}">
      Edited {formatRelative(row.lastSyncedAt, now)}
      <span aria-hidden="true"> · </span>
      Checked {formatRelative(row.lastCheckedAt, now)}
    </span>
    ```
  - **Checked-only form** (the three error buckets `drive_error`/`sheet_unavailable`/`parse_error`, where `last_synced_at` is an error stamp): the same `<span>` wrapper + testid, but only `Checked {formatRelative(row.lastCheckedAt, now)}` — **no "Edited" clause and no middot separator**.

  Which form renders is decided by a single pure predicate, co-located with the bucket mapper for one source of truth:
  ```ts
  // lib/admin/syncStatus.ts — the three statuses whose last_synced_at is an
  // error-attempt stamp (markShowParseError/markShowSheetUnavailable/markShowDriveError
  // in runScheduledCronSync.ts), NOT a content apply. If a future status stamps
  // last_synced_at on error, add it here (keep in lockstep with the cron error paths).
  export const EDIT_STAMP_EXCLUDED_STATUSES = new Set(["drive_error", "sheet_unavailable", "parse_error"]);
  export function showsEditedClause(status: string | null | undefined): boolean {
    return !EDIT_STAMP_EXCLUDED_STATUSES.has(status ?? "");
  }
  ```
  Unknown/future statuses default to showing the Edited clause (`true`) — a new *error* status must be added to the deny-set explicitly (documented above).

  The middot separator lives in its own `<span aria-hidden="true">` element so a screen reader announces `Edited 3h ago Checked 2m ago` (two clauses, no stray "middot"). Word choice: **"Checked"** (matches the column's own migration comment "we successfully reached Drive and evaluated this show"); "Edited" for a genuine `last_synced_at` content apply.

`data-testid` on line 2 (`shows-sync-times-{slug}`) lets tests scope assertions to line 2 without matching line 1 (anti-tautology, §8). **This testid renders once per mode (mobile + desktop), so it appears TWICE in the DOM per row (CSS hides one).** Tests MUST scope every line-2 query through the mode wrapper — desktop `within(getByTestId("shows-sync-{slug}"))` (`ShowsTable.tsx:516`), mobile `within(getByTestId("shows-meta-mobile-{slug}"))` (`ShowsTable.tsx:485`) — never a bare `screen.getByTestId("shows-sync-times-{slug}")` (would throw on the duplicate). The existing `shows-sync-{slug}` desktop wrapper testid is preserved.

### 4.2 Per-bucket behavior (complete matrix)

Line 2 renders only when `lastCheckedAt` is truthy (§4.3). Its **form** is chosen by `showsEditedClause(lastSyncStatus)` (§4.1): two-clause for non-error statuses, Checked-only for the three error statuses.

| `last_sync_status` | Line 1 (bucket label) | Line 2 form (when `lastCheckedAt` truthy) |
|---|---|---|
| `ok` | Synced | Edited {rel} · Checked {rel} |
| `pending_review` | Changes to review | Edited {rel} · Checked {rel} |
| `pending` | Sync in progress | Edited {rel} · Checked {rel} |
| `shrink_held` | Re-sync held (data loss) | Edited {rel} · Checked {rel} *(hold doesn't stamp `last_synced_at`, so it stays a true last-apply)* |
| `drive_error` | Couldn't reach Drive | **Checked {rel}** *(no Edited — error stamp)* |
| `sheet_unavailable` | Sheet not in folder | **Checked {rel}** *(no Edited — error stamp)* |
| `parse_error` | Couldn't read the sheet | **Checked {rel}** *(no Edited — error stamp)* |
| `null`/`""`/`undefined` | Not synced yet | Edited never · Checked {rel} *(or fully suppressed if `lastCheckedAt` falsy — the common new-row case; §4.3)* |
| unrecognized | Unknown sync state | Edited {rel} · Checked {rel} *(default; a future error status must be added to the deny-set)* |

Line 1 mapping is 100% delegated to `syncStatusBucket` — no bucket labels are defined in this spec, only referenced. If a future enum value is added to `syncStatusBucket`, line 1 inherits it with no change; line 2 shows the two-clause form unless the value is also added to `EDIT_STAMP_EXCLUDED_STATUSES`.

### 4.3 Guard conditions (every input, explicit)

Suppression uses a **falsy check `!row.lastCheckedAt`** (not `== null`), so `null`, `undefined`, AND `""` all suppress line 2 — matching `formatRelative`'s own `if (!iso)` guard (`showDisplay.ts:93`). This keeps the two in lockstep: there is no input for which line 2 renders `Checked never`.

- **`row.lastCheckedAt` falsy (`null` / `undefined` / `""`)** → line 2 is **not rendered** at all. Rationale: a row exists in `shows` only because the cron first-saw it, which sets `last_checked_at` (first-seen insert at `runScheduledCronSync.ts:1563-1568`) and the migration backfilled all pre-existing rows (`20260717000000...:8`). The DB column is `timestamptz` so the loaded value is an ISO string or `null`, never `""`; the `""` arm is defensive only. In the suppressed state line 1 already reads "Not synced yet," which fully carries the meaning — a `Checked never` line would be redundant noise. This is the ONLY suppression condition.
- **`row.lastCheckedAt` truthy but `row.lastSyncedAt` falsy** → line 2 renders `Edited never · Checked {rel}`. `formatRelative(null, now)` returns `"never"` (`showDisplay.ts:93`). This is a real state: cron checked the sheet but never applied content (e.g. held for review before first apply).
- **`row.lastSyncStatus == null` AND `lastCheckedAt` truthy** → line 1 "Not synced yet", line 2 `Edited never · Checked {rel}` renders. (Suppression is keyed on `lastCheckedAt`, not `lastSyncStatus`.)
- **Malformed ISO** in either timestamp → `formatRelative` returns the raw string (`showDisplay.ts:95`); pre-existing behavior, unchanged.
- Both timestamps are `string | null`; no NaN/number inputs reach this cell.
- **`now` prop** (`SyncCell({ now }: { now: Date })`, `ShowsTable.tsx:223`) is a valid `Date` supplied by the caller — `Dashboard` constructs it once server-side and threads it through. `formatRelative` reads `now.getTime()` with no invalid-Date guard (`showDisplay.ts:96`); an invalid `now` is **out of scope** (pre-existing `formatRelative` behavior, unchanged by this spec — this feature adds no new `now` source). SyncCell does not construct `now` itself.

### 4.4 Word / copy

Plain-language only (invariant 5 — no raw codes): "Edited", "Checked", "never". No error codes surface here; line 1 already routes health through `syncStatusBucket` plain labels.

---

## 5. Mode boundaries (desktop vs mobile)

`SyncCell` is a single component rendered in two places:

- **Desktop** (`≥768px`): inside the `shows-sync-{slug}` grid cell (`ShowsTable.tsx:515-520`), 5th track, `12rem` wide (grid track unchanged — Approach A adds NO track). Two lines stack within the 12rem cell.
- **Mobile** (`<768px`): inside the stacked meta sub-line (`ShowsTable.tsx:483-491`), below dates + crew. Same two lines.

Both modes get identical line-1 + optional line-2 content because it is one component. No mode-specific branches. (Line 2 presence/form follows §4.2/§4.3 identically in both modes.)

---

## 6. Dimensional / layout invariants

- The Sync cell is NOT a fixed-height parent with stretch-dependent children; it is auto-height text content in a `12rem`-**width** grid track. Adding line 2 increases the cell's intrinsic height, which increases each row's height (`items-center` keeps content vertically centered). This is expected and uniform across rows.
- The `12rem` Sync **width** track is unchanged. `formatRelative` emits `"min ago"` (not `"m ago"`) / `"h ago"` / `"d ago"` / `"just now"` / `"never"` (`showDisplay.ts:96-102`), so line 2's worst case is `Edited 59 min ago · Checked 59 min ago` ≈ 38 chars. At `text-xs` this exceeds one line in a `12rem` (~192px) track, so **line 2 may wrap to a second visual line at wide relative values — that is acceptable and intended** (no `whitespace-nowrap` on line 2; the track already permits wrapping per `ShowsTable.tsx:71-72`). Short values (`Edited 3h ago · Checked 2m ago` ≈ 30 chars) fit on one line.
- No `align-items: stretch` dependency introduced (Tailwind v4 no-default-stretch rule N/A here — line 2 is a plain block, not a flex child needing stretch).
- **Row-height change → help-screenshot risk:** the taller rows change the rendered dashboard height, which MAY drift committed help-screenshot WebPs (`public/help/screenshots/**`). Plan must include: after implementation, run the screenshot manifest check; if dashboard shots drift, regenerate from the pinned Docker image (`--platform linux/amd64`) per the byte-comparison discipline, and commit the regenerated WebPs. Treat as expected drift, not a regression.

---

## 7. Transition inventory

The Sync cell has no interactive/animated state of its own. Its visual states are:

1. **Line 2 absent** (`lastCheckedAt` falsy)
2. **Line 2 two-clause** (`Edited … · Checked …`)
3. **Line 2 Checked-only** (error buckets)

plus the line-1 bucket label (delegated to `StatusIndicator`). Every transition among these three states, and every line-1 bucket→bucket change, occurs only on a server data refresh (re-render), never via client interaction. The full pairwise set — (absent↔two-clause), (absent↔checked-only), (two-clause↔checked-only) — is **instant — no animation** by design: the cell renders fresh markup per server payload; there is NO `AnimatePresence`, no ternary-with-`exit`, no `initial`/`animate` props, no mid-transition compound state. The only animation anywhere near this cell is the `StatusIndicator` `live` dot ping (owned by `StatusIndicator`, unchanged, `motion-reduce:hidden`).

**Transition-audit task (required per project rule):** a test asserting `SyncCell`'s rendered subtree contains no `AnimatePresence` / framer-motion / `data-motion` / `exit`/`initial`/`animate` props and no CSS transition/animation classes on line 2 or its root — i.e. the three states are provably instant. This satisfies the project "transition-audit task (mandatory for components with a Transition Inventory)" rule rather than waiving it (§8 item 9). Also confirm the existing `showsTableTransitionAudit.test.tsx` still passes.

---

## 8. Testing plan (TDD, anti-tautology)

Each test states the concrete failure mode it catches.

All line-2 queries scope through the mode wrapper (desktop `within(getByTestId("shows-sync-{slug}"))`; mobile `within(getByTestId("shows-meta-mobile-{slug}"))`) — never a bare `getByTestId("shows-sync-times-{slug}")` (renders twice, one per mode; would throw). "Line 2" below = the `shows-sync-times-{slug}` node within the desktop wrapper unless a test says mobile.

1. **ok line 1 is bare "Synced" (no timestamp on line 1).** Scope to line 1 only: within the desktop wrapper, clone the subtree and remove the `shows-sync-times-{slug}` child (or read line 1 via the `StatusIndicator` label node), assert the remaining text is `Synced` and does NOT match `/ago|Edited|Checked/`. *Catches:* the timestamp staying fused to line 1. (Replaces the current `:72-81` assertion.)
2. **ok line 2 renders `Edited {rel} · Checked {rel}` from the two DISTINCT fields.** Fixture: `lastSyncedAt` and `lastCheckedAt` at offsets producing **different** relative strings (e.g. Edited 2h vs Checked 3 min). Assert line 2 contains both clauses in order AND that the Edited value ≠ the Checked value. *Catches:* wiring both clauses to one field (identical times); deriving from a container that also renders line 1.
3. **Error bucket → Checked-only (NO Edited, NO middot).** For each of `drive_error`, `sheet_unavailable`, `parse_error`: line 2 is present, contains `Checked {rel}`, and does NOT match `/Edited|·/`. *Catches:* the whole point of the bucket-aware split — showing a misleading "Edited" (error-stamp) on error rows. Derive from a fixture whose `lastSyncedAt` ≠ `lastCheckedAt` so a regression that printed both would be visible.
4. **`shrink_held` → two-clause (Edited present).** `shrink_held` is a warn bucket but NOT in the deny-set. Assert line 2 shows `Edited … · Checked …`. *Catches:* keying the clause on bucket severity (`warn`) instead of the explicit error-status deny-set — which would wrongly drop Edited for shrink_held.
5. **Predicate unit test — `showsEditedClause`.** Table-drive: `ok`/`pending`/`pending_review`/`shrink_held`/`null`/`"weird_future"` → true; `drive_error`/`sheet_unavailable`/`parse_error` → false. *Catches:* deny-set drift; the source-of-truth for the split, tested independent of render.
6. **Line 2 suppressed when `lastCheckedAt` falsy — null, undefined, and `""`.** Three cases: assert `within(desktopWrapper).queryByTestId("shows-sync-times-{slug}")` is null and line 1 still reads "Not synced yet" (for the null-status case). *Catches:* `Checked never` noise on brand-new rows; the `""` defensive arm (a `== null` check would leak `""` through).
7. **`lastSyncedAt` falsy but `lastCheckedAt` truthy (non-error status) → `Edited never · Checked {rel}`.** *Catches:* crashing/blanking on a checked-but-never-applied row; proves the `never` guard.
8. **Middot separator is aria-hidden (DOM contract, not textContent).** In the two-clause form, the `·` lives in its own element carrying `aria-hidden="true"`: `const sep = within(line2).getByText("·"); expect(sep).toHaveAttribute("aria-hidden", "true")`, and assert exactly one such separator. *Catches:* a bare-text-node middot (SR reads "middot"); missing aria-hidden.
9. **Transition audit — SyncCell is provably instant (§7).** Assert `SyncCell`'s rendered markup has no `AnimatePresence`/framer-motion usage and no `exit`/`initial`/`animate` props or transition/animation utility classes on line 2 or the root. *Catches:* an animated suppression toggle sneaking in. Also assert existing `showsTableTransitionAudit.test.tsx` passes (regression).
10. **Mobile parity.** Within `shows-meta-mobile-{slug}`, an ok row shows the same two-clause line 2. *Catches:* a desktop-only wiring that leaves mobile blank.
11. **Sort unchanged (regression).** Existing sync-sort test (`:572-603`) still passes — sort ranks by bucket; line-2 timestamps do not reorder. No new assertion.
12. **Loader field.** Assert `last_checked_at` is in the Dashboard shows SELECT column list (`Dashboard.tsx:203`) and maps to `lastCheckedAt` on the produced row. *Catches:* the field never being fetched (line 2 would always suppress in prod). Prefer a targeted assertion on the produced `ActiveShowRow` if a loader harness exists; otherwise assert against the SELECT string constant.

Fixtures derive relative strings from `now`-relative offsets, never hardcoded wall-clock (self-deriving). The `row()` factory in `ShowsTable.test.tsx:30-44` gains a default `lastCheckedAt` so existing tests keep line 2 rendering unless a case overrides it.

**Compile-break coverage (P1):** `lastCheckedAt` is a **required** field on `ActiveShowRow` (consistent with the required `lastSyncedAt`/`lastSyncStatus`), so adding it makes every `ActiveShowRow` object literal fail `tsc` until updated — a fails-by-default guard, not a hazard. The plan MUST update every test factory that constructs an `ActiveShowRow`; the known set (grep `lastSyncedAt` in `tests/`, scoped to `ActiveShowRow` consumers) is at least: `tests/components/admin/ShowsTable.test.tsx`, `tests/components/admin/showsTableTransitionAudit.test.tsx`, `tests/components/admin/dataGapsTransitionAudit.test.tsx`, `tests/components/admin/Dashboard-archived.test.tsx`. A `pnpm typecheck` pass is the acceptance gate for this item (`vitest` strips types and would NOT catch an unupdated factory). The plan re-greps the live tree at implementation time — do not treat this list as exhaustive.

## 9. Meta-test inventory

- **No new meta-test created or extended.** This change adds no mutation surface (read-only display), no admin alert code, no advisory-lock surface, no Supabase call boundary (the Dashboard SELECT already destructures `{ data, error }` at its existing call site — adding one column to the select string does not add a call site), no new §12.4 code. The mutation-surface observability meta-test (`tests/log/_metaMutationSurfaceObservability.test.ts`) is not implicated. Declared explicitly per the writing-plans "Meta-test inventory (mandatory)" rule: **none applies** because the diff is a read-path display change with no new instrumented/gated/locked surface.
- **`EDIT_STAMP_EXCLUDED_STATUSES` ↔ cron error-path coupling:** the deny-set must stay in lockstep with the `last_synced_at`-stamping error paths in `runScheduledCronSync.ts` (`markShowParseError`/`markShowSheetUnavailable`/`markShowDriveError`). This is covered by the `showsEditedClause` predicate unit test (§8 item 5) + the do-not-relitigate note (§12); a structural meta-test tying the set to the cron paths is judged not worth the complexity for a 3-element display-only deny-set (declared, not silently omitted).

## 10. Advisory-lock topology

N/A — no `pg_advisory*` touched (read-only display + one SELECT column).

## 11. Numeric sweep

Literals in this spec: `12rem` (existing Sync track width, cited `ShowsTable.tsx` — not changed by this spec), `768px` (existing mobile breakpoint, cited), `~30 chars` short / `~38 chars` worst-case line-2 length / `~192px` track (fit estimates, illustrative, cross-checked against `formatRelative`'s `"min ago"` output at `showDisplay.ts:96-102`). No new numeric constant is introduced into code. Row-count caps, durations, env-var counts: none touched.

## 12. Do-not-relitigate (reviewer preempts)

- **Approach A (no new grid column) is ratified** by the user over the 3-column Approach B — the reason is the band-swept grid + its real-browser dimension test (`ShowsTable.tsx:59-82`); do not propose splitting into separate Status/Edit/Checked columns.
- **Bucket-aware line 2 is ratified by the user** (2026-07-17): the three error buckets (`drive_error`/`sheet_unavailable`/`parse_error`) show **Checked-only**, all other buckets show **Edited · Checked**. This is deliberate because `last_synced_at` is an error-attempt stamp on those three paths (verified `runScheduledCronSync.ts:1098/1163/1189`), so "Edited" would be misleading there — the exact bug this feature fixes. Do not propose making line 2 uniform across buckets. `shrink_held` intentionally shows Edited (it does NOT stamp `last_synced_at`).
- **Line-2 suppression is keyed ONLY on `lastCheckedAt` being falsy** (`!lastCheckedAt` — null/undefined/`""`), deliberately (not on `lastSyncedAt`, not `== null`) — §4.3. A checked-but-never-edited (non-error) row SHOULD show `Edited never · Checked {rel}`.
- **Sort stays bucket-severity** — timestamps intentionally do not drive sort (matches the existing `:103-110` rationale that hidden-ish data must not reorder rows).
- **"Checked" (not "Read")** is the chosen word for `last_checked_at` in this cell, even though the aggregate health panel says "last read" — ratified with the user; the two surfaces need not share the word.
- Row-height growth + any help-screenshot WebP drift is **expected**, handled by regen, not a bug.
