# Spec — "Recently auto-applied" strip redesign

**Date:** 2026-07-14
**Slug:** `recent-auto-applied-redesign`
**Milestone class:** UI restyle + read-layer projection (no DB migration, no advisory-lock surface)
**Owner harness:** Opus / Claude Code (UI work — routing hard rule)
**Design mock:** `docs/superpowers/specs/2026-07-14-recent-auto-applied-redesign-mock/Dashboard-auto-applied-final.dc.html` (Claude Design project `5e40dee1-f49c-4828-9cfe-558ff4f1fc83`, "Section rows redesign"). Only the inline **"Recently auto-applied"** `<section>` is in scope.

---

## 1. Goal & scope

Restyle the admin dashboard's **"Recently auto-applied"** strip from flat text rows into the mock's **bordered change-cards** with colored kind pills and a structured From→To diff, without a DB migration or write-path change.

**In scope (4 source files):**

1. `lib/admin/loadRecentAutoApplied.ts` — add a PII-safe, name-only `diff` field to each `AutoAppliedRow`, derived server-side from `before_image`/`after_image`.
2. `components/admin/RecentAutoAppliedStrip.tsx` — render each change as a card (kind pill + entity label + diff block + buttons); group header gains a count badge.
3. `components/admin/AcceptChangeButton.tsx` — add an **optional** `stretch?: boolean` prop (default `false`) that makes the form + button `w-full`. Default path unchanged.
4. `components/admin/UndoChangeButton.tsx` — same optional `stretch?: boolean` prop.

**Out of scope (explicit):**

- No change to `show_change_log` schema, `writeAutoApplyChanges.ts`, or any migration. Field-level From→To for `field_changed` (mock's "Show end date 10/22→10/23") is **not backed by stored data** and is deliberately NOT implemented — those rows fall back to the summary sentence.
- No change to the server actions (`app/admin/_actions/autoApplied.ts`), the accept/undo helpers, or the advisory-lock topology.
- No change to `DESIGN.md` or `app/globals.css` `@theme` — the redesign reuses existing status tokens (§4). No new hue, no new token.
- The surrounding dashboard regions (AdminNav / StatStrip / ShowsTableView / NeedsAttentionCol / Ignored sheets / footer) shown in the mock are context only.

---

## 2. Live-code citations (verified 2026-07-14 against the worktree)

| Claim | Location |
| --- | --- |
| `AutoAppliedRow = { id, changeKind, summary, occurredAt, undoable }` | `lib/admin/loadRecentAutoApplied.ts:24` |
| `AutoAppliedGroup = { showId, slug, showName, rows, acceptableIds, undoableIds }` | `lib/admin/loadRecentAutoApplied.ts:32` |
| Select already pulls `individually_undoable`; adds `before_image, after_image` | `lib/admin/loadRecentAutoApplied.ts:104-115` |
| `STRIP_KINDS = crew_added, crew_removed, crew_renamed, field_changed, crew_email_changed` | `lib/admin/loadRecentAutoApplied.ts:57` |
| `UNDOABLE_KINDS = {crew_added, crew_removed, crew_renamed}`; `undoable = UNDOABLE_KINDS.has(kind) && individually_undoable===true` | `lib/admin/loadRecentAutoApplied.ts:64,136` |
| `crew_renamed` writes `before_image = crewImage(prior)` (has `.name`), `after_image = { name: added, email }` | `lib/sync/changeLog/writeAutoApplyChanges.ts:94-100` |
| `crew_removed` writes `before_image = crewImage(member)`, `after_image = null` | `lib/sync/changeLog/writeAutoApplyChanges.ts:108-114` |
| `crew_added` writes `before_image = null`, `after_image = { name, email }` | `lib/sync/changeLog/writeAutoApplyChanges.ts:122-128` |
| `field_changed` writes `before_image = null, after_image = null` (notification-only) | `lib/sync/changeLog/writeAutoApplyChanges.ts:153-159` |
| `crew_email_changed` is NOT written by `writeAutoApplyChanges` (separate path); treated diff:none + summary-only, never surfaces email | (absent in that writer; PII posture §3.4) |
| `crewImage()` includes `email, phone, id, claimed_via_oauth_at` (PII to EXCLUDE) | `lib/sync/changeLog/writeAutoApplyChanges.ts:52-65` |
| Loader registered in bounded-reads + infra-contract meta-tests | `tests/admin/_metaBoundedReads.test.ts:37`, `loadRecentAutoApplied.ts:16-18` header |
| Existing preserved testids | component `RecentAutoAppliedStrip.tsx:73,128,134,144,157,199,212,223`; buttons `change-feed-accept` (`AcceptChangeButton.tsx:47`), `change-feed-undo` (`UndoChangeButton.tsx:37`) |
| Status tokens `--color-status-positive/-review/-warn/-idle` (+ `-text`) | `app/globals.css:90-99,292-299`; `DESIGN.md:42-45` |
| Utilities in use: `min-h-tap-min`, `min-w-tap-min`, `p-tile-pad`, `shadow-tile`, `duration-fast`, `focus-visible:ring-focus-ring` | current component + buttons |

---

## 3. Data-layer change — the `diff` field

Add a discriminated `diff` to `AutoAppliedRow`, computed **in the loader** (server-side, service-role). The raw `before_image`/`after_image` jsonb are read into the loader but **never** placed on the row object — only the extracted `name` string escapes.

```ts
export type AutoAppliedDiff =
  | { kind: "fromTo"; from: string; to: string }            // crew_renamed
  | { kind: "single"; caption: "Added" | "Removed"; value: string } // crew_added / crew_removed
  | { kind: "none" };                                        // everything else → summary text

export type AutoAppliedRow = {
  id: string;
  changeKind: string;
  summary: string;
  occurredAt: string;
  undoable: boolean;
  diff: AutoAppliedDiff; // NEW
};
```

**Derivation (per row, in the group-building loop):**

| changeKind | `diff` | Source | Guard when name missing/blank |
| --- | --- | --- | --- |
| `crew_renamed` | `{ kind:"fromTo", from, to }` | `from = before_image.name`, `to = after_image.name` | if either name is not a non-empty string → `{ kind:"none" }` (falls back to summary) |
| `crew_added` | `{ kind:"single", caption:"Added", value }` | `value = after_image.name` | if not a non-empty string → `{ kind:"none" }` |
| `crew_removed` | `{ kind:"single", caption:"Removed", value }` | `value = before_image.name` | if not a non-empty string → `{ kind:"none" }` |
| `field_changed` | `{ kind:"none" }` | — (no stored images) | — |
| `crew_email_changed` | `{ kind:"none" }` | — (never surface email) | — |

### 3.1 Name extraction (PII-safe)

- `before_image`/`after_image` are typed as `Record<string, unknown> | null` at the loader boundary. A `readName(image)` helper returns `typeof image?.name === "string" && image.name.trim() !== "" ? image.name : null`.
- **ONLY `name` is ever read** from the images. `email`, `phone`, `id`, `claimed_via_oauth_at`, `role`, `role_flags`, etc. are never touched, never projected, never logged. The `diff` object contains only display-safe name strings.
- Names already appear verbatim in the existing `summary` ("Crew member Jon Clark renamed to John Clark") rendered on this same admin surface today, so `diff` introduces **no new PII exposure** beyond the status quo — it only restructures what is already shown.

### 3.2 Select change

Extend the existing `.select(...)` (`loadRecentAutoApplied.ts:106`) to add `before_image, after_image`. The `{ count: "exact" }`, `.eq/.is/.in/.order/.limit` clauses and the `{ data, count, error }` destructure are unchanged — preserving `_metaBoundedReads` (bounded `.limit(STRIP_RENDER_CAP)`) and `_metaInfraContract` (destructured error). `RawRow` gains `before_image?: Record<string, unknown> | null` and `after_image?: Record<string, unknown> | null`.

### 3.3 Guard conditions (data layer)

- `before_image`/`after_image` absent, `null`, non-object, or missing/blank `.name` → `diff:none` (never throws, never a partial diff). A `fromTo` requires BOTH names present; a `single` requires its one name present.
- The `diff` is derived only for the 5 STRIP_KINDS; an unknown `changeKind` that somehow appears → `diff:none` and the existing neutral "Change" pill fallback.

### 3.4 Redaction posture note (disagreement-loop preempt)

The observe/query core (`lib/observe/query/**`, pinned by `tests/observe/_metaReadOnlyQueryCore.test.ts`) is forbidden from selecting `before_image`/`after_image`. **That ban is scoped to the observe read core, not to `lib/admin`.** `loadRecentAutoApplied` is an admin-only, service-role dashboard loader (already reads PII-adjacent crew data); selecting the images here to project name-only is consistent with its existing posture and does not touch the observe core. Do not relitigate as an observe-core violation — cite `tests/observe/_metaReadOnlyQueryCore.test.ts` scope (files under `lib/observe/query/**` only).

---

## 4. Kind → design-token mapping

No new tokens. Each kind pill maps to an existing status token (base = dot, `-text` = pill text); the pill fill is a **token alpha wash** (`bg-status-*/12`) and border a token alpha (`border-status-*/40`) — no inline hex.

| Kind | Pill label | Token family | Dot / text / fill|
| --- | --- | --- | --- |
| `crew_added` | `Added` | `status-positive` (teal, DESIGN.md:42) | `bg-status-positive` / `text-status-positive-text` / `bg-status-positive/12` |
| `crew_renamed` | `Renamed` | `status-review` (amber, DESIGN.md:43) | `bg-status-review` / `text-status-review-text` / `bg-status-review/12` |
| `crew_removed` | `Removed` | `status-warn` (orange, DESIGN.md:44) | `bg-status-warn` / `text-status-warn-text` / `bg-status-warn/12` |
| `field_changed` | `Field` | `status-idle` (neutral, DESIGN.md:45) | `bg-status-idle` / `text-status-idle-text` / `bg-surface-sunken` + `border-border` |
| `crew_email_changed` | `Email` | `status-idle` (neutral) | same as Field |
| unknown fallback | `Change` | `status-idle` (neutral) | same as Field |

The mock's raw hex confirm these are exact matches (e.g. Added `#3f8a83`/`#2c655f` = `status-positive`/`-text`; Renamed `#a87716`/`#6e4e00` = `status-review`/`-text`; Removed `#b26a16`/`#7a3d00` = `status-warn`/`-text`). Reusing status pills for change-kind semantics extends the DESIGN.md §1.3 "status dots/pills" pattern (dot + text label, never color-alone) — it is not a new hue and needs no DESIGN.md edit. Color is always paired with the uppercase text label (color-blind floor §1).

---

## 5. Component structure — card anatomy

`RecentAutoAppliedStrip.tsx` keeps its top-level shape: `infra_error` branch, `ok`+0-groups → `null`, `<section data-testid="recent-auto-applied-strip">` with `<h4>Recently auto-applied</h4>`, a `<ul>` of `GroupSection`s, and the overflow line. What changes is the group header and the per-row render.

### 5.1 Group header (`GroupSection`)

`<div data-testid="auto-applied-group-${showId}">` header row (`border-b`), containing:

- Left: `showName` (`text-sm font-semibold text-text-strong`, `min-w-0 overflow-wrap-break-word`) + a **count badge** `<span>` = `group.rows.length` (`rounded-full border border-border bg-surface-sunken px-[7px] text-xs font-semibold text-text-subtle`). Count is `group.rows.length` (rendered rows), matching the mock's per-group "3" / "1".
- Right: `<span data-testid="auto-applied-accept-all-${showId}">` wrapping `<AcceptChangeButton acceptAction={acceptAllAction} hiddenFields={{ showId, ids }} label="Accept all" />` (compact, NOT `stretch`) — unchanged; and, when `undoableIds.length > 0`, the `<button data-testid="auto-applied-undo-all-${showId}">` opening the confirm gate — **unchanged behavior** (confirm panel, focus-to-Keep-changes, per-id dispatch, all preserved verbatim).

### 5.2 Change card (`StripRow`)

`<li data-testid="auto-applied-row-${row.id}">` becomes a bordered card (`rounded-md border border-border bg-surface p-3 flex flex-col gap-2`), containing:

1. **Label row** (`flex items-center gap-2`): the kind pill (§4) + an entity label. Entity label = `"Crew member"` for the three crew kinds; for `field_changed`/`crew_email_changed`/unknown there is **no** entity label — the summary sentence carries the meaning (5.3 none-branch).
2. **Diff block** (5.3), by `row.diff.kind`.
3. **Button row** (5.4).

### 5.3 Diff block by `diff.kind`

- **`fromTo`**: a 2-column grid (`grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 items-baseline`):
  - caption `From` (`text-[10.5px] font-semibold uppercase tracking-wide text-text-faint`) → value `from` (`text-sm text-text-subtle line-through`)
  - caption `To` → value `to` (`text-sm font-semibold text-text-strong`)
- **`single`**: same grid, one row: caption = `diff.caption` (`Added`/`Removed`), value = `diff.value`. When `caption === "Removed"` the value is `line-through text-text-subtle`; when `"Added"` it is `font-semibold text-text-strong`.
- **`none`**: the verbatim `summary` sentence (`text-sm text-text-strong wrap-break-word`) — no grid, no entity label duplication. This is the field_changed / crew_email_changed / fallback path.

### 5.4 Button row

`<div>` with the Accept (+ optional Undo) controls, `stretch`ed to fill:

- `row.undoable === true` → two buttons side-by-side, each half-width: wrapper `grid grid-cols-2 gap-1.5`; `<AcceptChangeButton ... stretch />` and `<UndoChangeButton ... stretch />`.
- `row.undoable === false` → single full-width Accept: wrapper `grid grid-cols-1`; `<AcceptChangeButton ... stretch />` only.

`AcceptChangeButton`/`UndoChangeButton` keep their `hiddenFields`/`changeLogId` wiring, their `change-feed-accept`/`change-feed-undo` testids, their `useActionState` submit-safety, and their `ErrorExplainer` typed-failure surfacing — the ONLY addition is `stretch` making the inner `<form>` and `<button>` `w-full` (default `false` = current intrinsic width, so the per-show feed page at `app/admin/show/[slug]` and the "Accept all" compact button are byte-identical).

### 5.5 Overflow + errors (unchanged)

- Overflow: `<p data-testid="auto-applied-overflow">` dashed border, `+{overflowCount} older changes not shown`. Rendered only when `overflowCount > 0`. Plain text, no button.
- `infra_error`: `<p data-testid="auto-applied-error">` fixed sentence; raw kind token + internal message never reach DOM (invariant 5). Unchanged.

---

## 6. Dimensional invariants

The strip lives in the 336px right column (mock) but is auto-height, flowing content — no fixed-height parent with flex children needing `items-stretch`. The one width invariant that matters:

- **Stretch buttons fill their grid cell.** The full/half-width button layout (5.4) requires the inner `<button>` to be `w-full`, not intrinsic — a `grid-cols-2` cell does NOT stretch an intrinsic-width child. Guaranteed by: `stretch` sets `w-full` on BOTH the `AcceptChangeButton`/`UndoChangeButton` `<form>` wrapper AND the inner `<button>` (Tailwind v4 does not stretch grid children by default — global CLAUDE.md rule). Verified by a real-browser Playwright assertion: in a `grid-cols-2` two-button card each button's `getBoundingClientRect().width` ≈ half the row (within 1px of `(rowWidth - gap)/2`); in a single-button card the button width ≈ full row width. jsdom is insufficient (no layout).

No other parent→child dimension relationship is introduced.

---

## 7. Transition inventory

The strip has these interactive visual states; enumerate all transitions:

| From → To | Treatment |
| --- | --- |
| Undo-all button idle → confirm panel open | **Existing behavior, unchanged.** Instant conditional render (`confirming` state); focus moves to "Keep changes". No animation was present and none is added. |
| Confirm panel open → closed (Keep changes / after dispatch) | Existing, instant, unchanged. |
| Accept/Undo button idle → pending (`aria-busy`, "Undoing…") | Existing `useActionState` pending; unchanged. |
| Card idle → hover | No card-level hover state in the mock; buttons keep their existing `hover:bg-surface-sunken`. No new hover transitions. |
| Kind pill / diff block | Static — no state, no transition. |

No new animated states are introduced. The redesign is structural/visual only; every pre-existing transition is preserved verbatim.

---

## 8. Guard conditions summary (every render input)

| Input | Null / empty / edge | Render |
| --- | --- | --- |
| `data.kind === "infra_error"` | — | fixed sentence, no raw code (§5.5) |
| `data.kind === "ok"`, `groups.length === 0` | — | `null` (empty DOM) |
| `group.rows.length` | badge shows the integer; `0` cannot occur (a group exists only if it has ≥1 row) | count badge = `rows.length` |
| `row.diff.kind === "fromTo"` with blank `from`/`to` | cannot occur — loader downgrades to `none` when a name is blank (§3.3) | n/a |
| `row.summary` empty string | `none` branch renders an empty sentence (no crash) | acceptable; summary is always populated by the writer |
| `row.undoable` | `true` → Accept+Undo half; `false` → Accept full | §5.4 |
| `overflowCount` | `0` → no line; `>0` → dashed line | §5.5 |

---

## 9. Testing plan (TDD; anti-tautology)

### 9.1 Loader test — `tests/admin/loadRecentAutoApplied.test.ts` (extend existing)

- **Diff derivation:** given injected rows with `before_image`/`after_image`, assert each produced `row.diff` exactly: `crew_renamed` → `{kind:"fromTo", from:"Jon Clark", to:"John Clark"}`; `crew_added` → `{kind:"single", caption:"Added", value:"Maria Chen"}`; `crew_removed` → `{kind:"single", caption:"Removed", value:"Devin Park"}`; `field_changed` & `crew_email_changed` → `{kind:"none"}`.
  - **Anti-tautology / concrete failure mode caught:** a from/to swapped, or reading `summary` instead of the image name, produces a different object — the assertion is on the exact discriminated shape derived from the fixture image, not on "a diff exists".
- **PII exclusion (behavioral):** fixture images carry `email`, `phone`, `id`, `claimed_via_oauth_at`; assert the serialized `diff` (and the whole returned row) contains **none** of those values (`JSON.stringify(row)` excludes each fixture PII string). Failure mode caught: a lazy `diff = { ...after_image }` spread that leaks email.
- **Guard:** image `null` / `{}` / `{ name: "" }` / `{ name: 123 }` → `diff:none` for that row. Failure mode: an unguarded `.name` access surfacing `undefined`/non-string into a `fromTo`.
- Existing loader assertions (grouping, overflow, roster shift) remain green.

### 9.2 Component test — `tests/components/admin/RecentAutoAppliedStrip.test.tsx` (revise)

Fixtures gain a `diff` per row. Revised/added assertions:

- **Card render by diff kind** (scope each query INSIDE `within(row)` — anti-tautology so a sibling card can't satisfy it):
  - `fromTo` row: the `To` value is present and `font-semibold`/not line-through; the `From` value carries `line-through` (assert the class or computed style on the specific element, not the container). Derive expected strings from the fixture `diff`, never hardcode divorced from the fixture.
  - `single` "Removed" row: value has `line-through`; "Added" row: value is emphasized, no line-through.
  - `none` row (field_changed / crew_email_changed): the verbatim `summary` renders (preserves the existing "summary verbatim" contract for these two kinds only).
- **Kind pill:** each crew kind renders its uppercase label (`Added`/`Renamed`/`Removed`) and the pill element carries the mapped token class (e.g. `text-status-review-text`) — assert on the pill element found within the row.
- **Preserved contracts (unchanged assertions):** one section per show; row order; `change-feed-accept` on every row; `change-feed-undo` only on undoable rows; `showId`/`ids` hidden inputs; Accept-all always / Undo-all only when undoable; confirm gate + per-id dispatch; focus-to-Keep-changes; overflow line; null-on-empty; infra_error never leaks the raw token.
- **Count badge:** the FinTech group header shows `3`, the RIA group shows `1` (derive from fixture `rows.length`, scoped within the group header).

### 9.3 Button test — `tests/components/admin/AcceptChangeButton.test.tsx` / `UndoChangeButton.test.tsx` (extend)

- `stretch` default (`false`): inner `<button>` does NOT have `w-full` (byte-compat with the per-show feed page).
- `stretch` set: the `<form>` and inner `<button>` carry `w-full`.

### 9.4 Real-browser layout test (dimensional invariant §6)

A Playwright/real-browser assertion mounting the strip with a two-button (undoable) card and a one-button (field) card: assert two-button widths ≈ half row (±1px), one-button width ≈ full row. jsdom is NOT sufficient. Follows the standalone real-browser harness precedent (`reference_standalone_realbrowser_layout_harness`).

---

## 10. Meta-test inventory

- **`tests/admin/_metaBoundedReads.test.ts`** — `loadRecentAutoApplied.ts` is registered (line 37). The select gains columns but keeps `.limit(STRIP_RENDER_CAP)` + `count:"exact"`; re-run after editing (meta-tests are comment/format fragile — `feedback_structural_metatest_comment_fragility`).
- **`tests/admin/_metaInfraContract.test.ts`** — the loader's Supabase awaits keep the `{ data, count, error }` destructure + typed `infra_error`; re-run after edit.
- **`tests/observe/_metaReadOnlyQueryCore.test.ts`** — NOT extended; the before/after-image select is in `lib/admin`, outside the observe core it guards (§3.4). Declared here so the reviewer does not read the new select as an observe-core violation.
- No new registry, no advisory-lock surface (`pg_advisory*` untouched), no `admin_alerts` code, no §12.4 catalog row, no new mutation surface → invariant-10 observability registry unaffected (no new mutating route/action; server actions unchanged).

---

## 11. Invariant compliance

- **Inv 2 (advisory lock):** untouched — no mutation path changes; the loader is a read.
- **Inv 3 (email canonicalization):** N/A — email is never read from the images.
- **Inv 5 (no raw error codes in UI):** preserved — `infra_error` fixed sentence; typed failures via `ErrorExplainer`/`lib/messages`.
- **Inv 8 (impeccable dual-gate):** `RecentAutoAppliedStrip.tsx` + two button components are UI surfaces → `/impeccable critique` AND `/impeccable audit` on the diff before cross-model review; HIGH/CRITICAL fixed or deferred via `DEFERRED.md`.
- **Inv 9 (Supabase call-boundary):** the extended select keeps `{ data, count, error }` destructure + `infra_error` typing; loader stays registered in `_metaInfraContract`.
- **Inv 10 (mutation observability):** no new mutation surface; server actions unchanged.
- **Routing:** UI work = Opus / Claude Code + impeccable v3.

---

## 12. Numeric sweep

- `STRIP_RENDER_CAP = 50` — unchanged, single source (`loadRecentAutoApplied.ts:51`).
- 5 STRIP_KINDS; 3 undoable kinds — unchanged (§2 citations).
- Count badge = `group.rows.length` (integer, ≥1). Overflow = `max(0, matchedTotal - 50)` — unchanged.
- 4 source files changed; 4 test files touched (loader, component, two button tests) + 1 real-browser layout test.
- Pill grid `grid-cols-[auto_1fr]`; button grids `grid-cols-2` (undoable) / `grid-cols-1` (not). Gap literals: card gap `gap-2`, diff grid `gap-x-2.5 gap-y-0.5`, button gap `gap-1.5` — each stated once here and referenced by §5.
