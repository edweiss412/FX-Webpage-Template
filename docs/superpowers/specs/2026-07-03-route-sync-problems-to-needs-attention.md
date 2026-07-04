# Spec — Route per-show sync-problem alerts to Needs attention

**Date:** 2026-07-03
**Slug:** `route-sync-problems-to-needs-attention`
**Status:** Draft → self-review → adversarial review
**Author:** Opus (autonomous ship pipeline)

---

## 1. Summary

Two per-show admin-alert codes — `SHEET_UNAVAILABLE` and `PARSE_ERROR_LAST_GOOD` — are today rendered by the dismissible global `AlertBanner`. They are **durable per-show operator to-dos**, not dismiss-or-self-heal notices: a show stays degraded until the operator re-shares the sheet (`SHEET_UNAVAILABLE`) or fixes the sheet so the next edit parses (`PARSE_ERROR_LAST_GOOD`). Letting the operator "Dismiss" them via the product UI hides an unresolved condition.

This change **moves their admin-surface rendering from the banner to the Needs attention inbox** while leaving the `admin_alerts` row — and therefore the entire notify email/digest/recovery pipeline — unchanged. The inbox item is sourced from the same alert row and **auto-clears** when the recovery loop resolves the alert. **No migration, no schema change, no advisory-lock topology change, no §12.4 catalog-row edit.**

### 1.1 Taxonomy rationale (why these two)

- **Alert banner** = a *notice*: an incident/event whose canonical record lives elsewhere and whose lifecycle is dismiss-or-self-heal.
- **Needs attention** = a *durable to-do*: an item that clears only by resolving the underlying condition, never by dismissal.

`SHEET_UNAVAILABLE` and `PARSE_ERROR_LAST_GOOD` fail the test "if the operator clicked Dismiss, would real work be lost?" — yes, the show stays degraded. `DRIVE_FETCH_FAILED` (the third sibling in the same `runNotify` recovery group) **passes** — it is a transient, self-retrying network fault, so it **stays a banner alert** and is deliberately excluded.

### 1.2 Scope of "no manual Dismiss" (RATIFIED 2026-07-04 — do not relitigate)

"No manual Dismiss" is a **UX safety net**: it prevents an operator from *accidentally dismissing and forgetting* a still-degraded show through the product's own surfaces. It is enforced at exactly three layers, all app-level:

1. **UI:** the per-show alert row renders **read-only** for these codes (no "Mark resolved" button) — §4.8.
2. **API routes:** the show-scoped and global alert-resolve routes **reject** these codes — §4.8.
3. **Shared helper:** `resolveAdminAlert(s)` **rejects** these codes — §4.8.

**Explicitly OUT OF SCOPE (ratified):** defending against an *authenticated admin who hand-crafts direct database / PostgREST mutations* (raw `admin_alerts` UPDATE/DELETE/INSERT, backdating `raised_at`, retargeting `code`/`show_id`, or faking `shows.last_sync_status`). The admin is the trusted system owner; a person deliberately issuing raw DB requests to hide their own to-dos is self-sabotage, not a threat this feature guards against. No DB-level REVOKE, trigger, RPC lockdown, or deploy-time backfill is in scope. This decision was made by the product owner after review surfaced the alternative; a reviewer must not re-open it.

---

## 2. Scope

### 2.1 In scope

- `SHEET_UNAVAILABLE`, `PARSE_ERROR_LAST_GOOD` → rendered in the Needs attention inbox instead of the AlertBanner, with the three-layer UX no-Dismiss guard (§1.2).

### 2.2 Out of scope / deferred

- **`DRIVE_FETCH_FAILED`** — stays a banner alert (transient/self-retrying).
- **`LIVE_ROW_CONFLICT`** — onboarding/wizard-scan-scoped, global (`show_id IS NULL`), already in the Step-3 wizard review; different lifecycle. Handled separately (in-flight `feat/developer-tier` worktree).
- **Developer-incident codes** (`PENDING_SNAPSHOT_*_STUCK`, `REPORT_*`, `BRANCH_PROTECTION_*`, `WEBHOOK_TOKEN_INVALID`, `GITHUB_BOT_LOGIN_MISSING`) — a separate future "mis-audience" discussion.
- **DB-level tamper resistance + deploy backfill** — out of scope per §1.2.
- **Pre-existing dismissed-but-degraded shows** — a show whose alert was manually dismissed *before* this ships (while dismissal was still allowed) will not appear until its next sync re-raises the alert. Accepted (no backfill, per §1.2). For `SHEET_UNAVAILABLE` the folder-missing sweep re-raises on the next cron; for `PARSE_ERROR_LAST_GOOD` on the next sheet edit.

---

## 3. Data model (no schema change)

| Concern | Source of truth | Citation |
| --- | --- | --- |
| Alert row (inbox source + email backbone) | `public.admin_alerts` — unchanged | `lib/adminAlerts/upsertAdminAlert.ts` |
| Durable condition | `shows.last_sync_status ∈ {'parse_error','sheet_unavailable'}` | `supabase/migrations/20260501000000_initial_public_schema.sql:23` |
| Auto-resolution (canonical) | `resolveStaleSyncProblemAlerts_unlocked` clears the alert on the next successful sync when `last_sync_status` no longer maps to the code | `lib/sync/runScheduledCronSync.ts:190` (called :2237/:2316/:2796/:2943) |
| Auto-resolution (notify-path) | `resolveRecoveredSyncProblemAlert` clears it during the notify maintenance pass | `lib/notify/detect/recoveryResolution.ts:35-74` |
| Email/digest/recovery consumers (unchanged) | `admin_alerts` rows keyed by `alertId/showId/code` | `lib/notify/runNotify.ts:107-113`, `lib/notify/detect/candidates.ts` (`ShowRealtimeCandidate`) |

The inbox item is **sourced from the `admin_alerts` row itself**: when either resolve path sets `resolved_at`, the row leaves the `resolved_at IS NULL` query and disappears from the inbox automatically. No new derivation, no dedup, no dismiss affordance.

### 3.1 Alignment with PR #283 (`feat/admin-alert-auto-resolution`, merged 2026-07-04)

Rebased on #283, which formalized a **state-vs-event lifecycle taxonomy** for all 42 codes in `tests/messages/_metaAdminAlertCatalog.test.ts` (`ADMIN_ALERTS_LIFECYCLE`, line 312). Both codes here are `class: "auto"` (7-precedent-AUTO; resolve-site `resolveStaleSyncProblemAlerts_unlocked`) — which is *why* inbox auto-clear is sound: an auto-resolving alert cannot become a stuck no-Dismiss item. `adminSurface` (WHERE it renders) is orthogonal to lifecycle `class` (HOW it resolves): not all `auto` codes are inbox (`WATCH_CHANNEL_ORPHANED`, `EMAIL_DELIVERY_FAILED` stay banner). This spec touches no lifecycle `class` or the pinned counts (21 auto / 17 event-manual / 1 state-manual-justified / 3 deferred).

---

## 4. Design

### 4.1 Catalog: `adminSurface` field

Add an **optional** field to `MessageCatalogEntry` (`lib/messages/catalog.ts:1`), mirroring the existing optional `severity?` (`catalog.ts:3`):

```ts
adminSurface?: "banner" | "inbox"; // default (absent) = "banner"
```

Set `adminSurface: "inbox"` on `SHEET_UNAVAILABLE` (`catalog.ts:89`) and `PARSE_ERROR_LAST_GOOD` (`catalog.ts:102`). Catalog-internal (like `severity`), NOT §12.4 prose — verified `severity` is not emitted into `spec-codes.ts`/`internal-code-enums.ts`, so `adminSurface` won't be either; regeneration produces no diff.

### 4.2 Banner + bell-count exclusion (lockstep)

`AlertBanner` (`components/admin/AlertBanner.tsx:70-72`) and `fetchUnresolvedAlertCount` (`lib/admin/alertCount.ts:6-9`) already compute `INFO_SEVERITY_CODES` from the catalog and exclude via `.not("code","in","(...)")`. Add a parallel computed set in a **shared module** `lib/messages/adminSurface.ts`:

```ts
export const INBOX_ROUTED_CODES: string[] = (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[])
  .filter((e) => e.adminSurface === "inbox").map((e) => e.code);
export function isInboxRouted(code: string): boolean { return INBOX_ROUTED_CODES.includes(code); }
```

Both files exclude the union of `INFO_SEVERITY_CODES` + `INBOX_ROUTED_CODES` in one `.not(...)` clause (append only when the combined list is non-empty — an empty `in ()` throws). Banner and bell stay in lockstep from one source, so these codes render only in the inbox.

### 4.3 Needs-attention third stream

**Type** (`lib/admin/needsAttention.ts`): add a fourth item variant

```ts
| { variant: "sync_problem"; key: string; alertId: string; showId: string;
    slug: string; title: string | null; code: string; copy: string; activityAt: string | null }
```

and input + optional totals on `BuildNeedsAttentionInput`:

```ts
export type NeedsAttentionSyncProblemInput = {
  alertId: string; showId: string; slug: string | null; title: string | null;
  code: string; sheetName: string | null; raisedAt: string | null;
};
// BuildNeedsAttentionInput gains:  syncProblems?: NeedsAttentionSyncProblemInput[]   (OPTIONAL, default [])
// totalCounts gains:               syncProblems?: number                             (OPTIONAL, default 0)
```

**Both optional (digest compat, §4.9):** `buildNeedsAttention` has a second caller — `lib/notify/digest.ts:194` — that passes neither. Defaulting to `[]`/`0` keeps the digest producing exactly its current items (no `sync_problem` rows; those have their own realtime-email path).

`buildNeedsAttention` merges `syncProblems` into the existing newest-first sort keyed by `raisedAt` (tie-break by id), one slice at `cap`, and returns `syncProblemTotal` with `totalCount = ingestions + syncs + syncProblems`.

**Copy** — `resolveSyncProblemCopy({ code, sheetName, title })`: catalog `dougFacing` with `sheet_name` interpolated (interpolation normalizes `<sheet-name>` ← `sheet_name`, `lib/messages/lookup.ts:32`) + emphasis stripped via `plainCatalogText` (`lookup.ts:51`). Fallback order: `sheetName` → `title` → the per-code catalog `title` string ("Sheet no longer in folder" / "Latest edit didn't parse"). If an unresolved `<…>` placeholder remains (`UNRESOLVED_PLACEHOLDER_RE`, `needsAttention.ts:27`) → generic fallback. Mirrors `resolveIngestionCopy` (`needsAttention.ts:120-143`); no raw code reaches the DOM (invariant 5).

### 4.4 Loader third stream (`lib/admin/loadNeedsAttention.ts`)

Alongside the two pending streams (each await wrapped per invariant 9, registered in `tests/admin/_metaInfraContract.test.ts`), add:

- **Empty-set short-circuit:** if `INBOX_ROUTED_CODES.length === 0`, set `syncProblems = []` / `totalCounts.syncProblems = 0` without querying — dropping the `.in()` on an inclusion query would select *every* unresolved per-show alert. Mirrors the existing `if (pendingDriveFileIds.length > 0)` guard (`loadNeedsAttention.ts:164`).
- **Rows:** `admin_alerts` select `id, code, raised_at, show_id, context, shows!inner(slug, title)` where `resolved_at IS NULL`, `code IN INBOX_ROUTED_CODES`, `show_id NOT NULL`, **`shows.archived = false`**, ordered `raised_at desc`, `limit(cap + 1)`. The `!inner` embed + `.eq("shows.archived", false)` enforces the archived exclusion (a show archived while degraded is skipped by the recovery loop, `runScheduledCronSync.ts:1811,2205`, so its alert can't auto-clear — a no-Dismiss stuck item; consistent with the realtime contract `candidates.ts:150`).
- **Head-count:** `admin_alerts` `select("id, shows!inner(id)", {count:'exact', head:true})` with the same filters + short-circuit.
- Map rows → `NeedsAttentionSyncProblemInput` (extract `context.sheet_name`), pass `syncProblems` + `totalCounts.syncProblems` into `buildNeedsAttention`.

### 4.5 Badge count third stream (`lib/admin/needsAttentionCount.ts`)

Add a third head-count: `admin_alerts` unresolved + `code IN INBOX_ROUTED_CODES` + `show_id NOT NULL` + `shows.archived = false` via `shows!inner(id)`, with the **same empty-set short-circuit** (never drop the `.in()`). MUST match the loader filter exactly (§6 lockstep).

### 4.6 Inbox rendering (`components/admin/NeedsAttentionInbox.tsx`)

Add a `sync_problem` branch to `ItemCard`, modeled on `existing_staged` (`NeedsAttentionInbox.tsx:113-135`): heading `title ?? slug`; body `<p>{copy}</p>`; a single `<Link>` to **`/admin/show/{slug}?alert_id={alertId}`** (deep-links the specific alert, matching the existing AlertBanner behavior `AlertBanner.tsx:460` and the per-show page's `?alert_id` highlight support) with visible text "Check it" but a **row-specific `aria-label`** (`Check sync problem for {title ?? slug}`) so repeated cards have unique accessible names (R11-F1 a11y); **no** retry/discard/resolve button (auto-clear only); reuse the relative-time `<time>` block (`activityAt`). `data-testid="needs-attention-item-sync-problem-{alertId}"`.

### 4.7 Summary card (`components/admin/NeedsAttentionSummaryCard.tsx`)

Add `syncProblemTotal` prop + a third breakdown line ("N sync problem[s]") alongside "N couldn't process" / "N to review" (`:35-42`). `totalCount` already includes it (from `buildNeedsAttention`), so the headline number stays honest. The **sole render site** — `components/admin/Dashboard.tsx:589-593` — must pass `syncProblemTotal={result.needsAttention.syncProblemTotal}` (R13-F1); otherwise the headline would count sync problems while the breakdown omits them. Make the prop **required** so the wiring omission is a typecheck failure, not a silent gap.

### 4.8 No-Dismiss UX guards (three app-level layers)

The inbox "Check it" CTA lands the operator on `/admin/show/{slug}`, where `PerShowAlertSection` (`components/admin/PerShowAlertSection.tsx:210`) renders a `PerShowAlertResolveButton` for every unresolved per-show alert. Left as-is, that button (or the routes/helper it rides) lets the operator dismiss a degraded show without fixing it. All three enforce via the shared `isInboxRouted(code)` predicate (§4.2):

| Surface | Change |
| --- | --- |
| `components/admin/PerShowAlertSection.tsx:210` | For inbox-routed codes, render the row **read-only** — keep copy/context/parse-panel pointer (do-not-relitigate "per-show page still shows these codes" preserved), **omit** `PerShowAlertResolveButton`; add a muted "Clears automatically once the sheet is back / re-parses" note. |
| `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:125` | Look up the target row's `code` before its `resolved_at = now()` UPDATE; **reject** inbox-routed with `errorResponse(409, "ALERT_AUTO_RESOLVE_ONLY")`. This is a **plain structural API error code, NOT a §12.4 catalog row** — consistent with the route's existing uncataloged structural codes (e.g. `BAD_REQUEST`). It never reaches user-visible UI: `PerShowAlertResolveButton` (the only client that renders this route's errors through the catalog) is **omitted for inbox-routed codes** (layer 1 above), so the rejection is a pure server backstop; and even if defensively surfaced, that island's catalog-fallback (`PerShowAlertResolveButton.tsx:35`) renders generic copy for an uncataloged code, so invariant 5 (no raw code in the UI) holds without a catalog row. |
| `app/api/admin/admin-alerts/[id]/resolve/route.ts:125` | Same code-lookup rejection → `errorResponse(409, "ALERT_AUTO_RESOLVE_ONLY")` (global resolve route). Same "plain API code, no §12.4 row, never UI-surfaced" rationale. |
| `lib/adminAlerts/resolveAdminAlert.ts:11,35` | `resolveAdminAlert`/`resolveAdminAlerts` **throw** if any `code ∈ INBOX_ROUTED_CODES`. **Verified safe:** no production caller passes these codes (callers pass `SYNC_STALLED`/`EMAIL_*`/`ASSET_RECOVERY_*`/`WATCH_CHANNEL_ORPHANED`/`TILE_PROJECTION_FETCH_FAILED` — `stall.ts:17`, `emailDeliveryFailed.ts:267`, `assetRecovery.ts:602`, `watch.ts:679`, `actions.ts:191`, `_CrewShell.tsx:184`), and both codes' auto-resolution uses direct SQL (`resolveStaleSyncProblemAlerts_unlocked`, `recoveryResolution.ts:51`) — NOT this helper. Retarget the existing generic test `tests/adminAlerts/resolveAdminAlert.test.ts:51` (which resolves `SHEET_UNAVAILABLE`) to a non-inbox per-show code. |

Surface A — the **global** banner form action `resolveAdminAlertFormAction` (`app/admin/actions.ts`) — needs **no change**: its UPDATE is scoped `.is("show_id", null)` (global-only) and inbox-routed codes are always per-show (`show_id NOT NULL`), so it can never target one; its `resolved_by`/scope/error-handling are preserved. (Per §1.2, raw-DB tamper is out of scope, so no DB-level guard.)

### 4.9 Digest caller compatibility

`lib/notify/digest.ts` calls `buildNeedsAttention` (:194) with if-chain variant helpers `itemDisplayName`/`itemCopy`/`slugFor` (:82-96) + `groupNeedsAttention` (:99) over `pending_ingestion`/`first_seen`/`existing_staged`, passing no `syncProblems`. With the field optional-default-`[]` (§4.3) the digest produces zero `sync_problem` items (byte-identical behavior). Give the digest's variant helpers an explicit `sync_problem` arm (defensive: `slugFor`→`slug`, `itemCopy`→`copy`, `itemDisplayName`→`title ?? slug`) so a future change feeding sync-problems through the digest can't mislabel one. Regression test: `buildDigestModel` still builds with the field absent and yields no `sync_problem` grouping.

---

## 5. Guard conditions (every new field / prop)

| Field / input | null / empty / missing behavior |
| --- | --- |
| `admin_alerts.show_id` | Query filters `show_id NOT NULL`; a null slipping via race → loader **skips** the row + `log.warn("sync-problem alert missing show_id", {alertId})`. |
| `shows(slug)` embed | `!inner` makes null impossible; a defensive skip + `log.warn` remains (mirrors `AlertBanner.tsx:213-218`). |
| `context.sheet_name` | Null/absent → copy falls back to `shows.title`, then per-code generic (§4.3). Never a literal `<sheet-name>`. |
| `shows.title` | Null → card heading falls back to `slug`. |
| `shows.archived = true` | Excluded everywhere (loader rows + count via `shows!inner` + `.eq("shows.archived", false)`) — R5-F1. Unarchive + still-degraded → next sync re-raises → re-enters. |
| `raised_at` | Null → `activityAt = null`; `<time>` omitted (`NeedsAttentionInbox.tsx:47`); sorts last. |
| `code` unknown / not in catalog | `resolveSyncProblemCopy` → generic fallback; no raw code in DOM (invariant 5). |
| Empty `INBOX_ROUTED_CODES` | Inclusion sites (§4.4/§4.5) **short-circuit to empty** (never drop the `.in()`); exclusion sites (§4.2) skip the `.not()`. |

---

## 6. Count-consistency invariant (lockstep)

Three totals paths MUST include the sync-problem stream with an **identical** filter (`resolved_at IS NULL AND code IN INBOX_ROUTED_CODES AND show_id IS NOT NULL AND shows.archived = false`): (1) `loadNeedsAttention` → `totalCounts.syncProblems`; (2) `needsAttentionCount` → nav badge; (3) `buildNeedsAttention` → `totalCount`/`syncProblemTotal`/`overflowCount`. Conversely `AlertBanner` + `fetchUnresolvedAlertCount` both **exclude** `INBOX_ROUTED_CODES`. The shared `lib/messages/adminSurface.ts` constant is the single source; §8 pins every consumer references it.

---

## 7. Explicitly NOT touched (do-not-relitigate contracts)

| Contract | Citation | Why |
| --- | --- | --- |
| `admin_alerts` row still written & resolved | `runNotify.ts:107-113`, `recoveryResolution.ts` | Email/digest/recovery keyed on it. Move-the-rendering, not delete-the-alert. |
| Auto-clear only, no manual Dismiss (UX scope) | §1.2, ratified 2026-07-04 | You can't dismiss a still-degraded show through the product UI/routes/helper. Raw-DB tamper is OUT OF SCOPE. |
| **Raw DB / PostgREST tamper is OUT OF SCOPE** | §1.2, ratified 2026-07-04 | Admin is the trusted owner; no DB REVOKE/trigger/RPC/backfill. Do not re-open. |
| `DRIVE_FETCH_FAILED` stays a banner alert | not marked `adminSurface:"inbox"` | Transient self-retrying network fault. |
| Per-show page still **shows** these codes (read-only) | `PerShowAlertSection.tsx:119` (reads `admin_alerts`, no `code` filter) | Inbox is the pointer; the show page is where the fix happens. §4.8 only removes the button. |
| No §12.4 catalog-row edit | `adminSurface` is catalog-internal like `severity` | x1 gate compares §12.4 prose ↔ `catalog.ts`; a new internal field doesn't touch prose. |
| Surface A (global form action) unchanged | `actions.ts` `.is("show_id", null)` | Global-only scope inherently excludes per-show inbox codes; preserves `resolved_by`. |

---

## 8. Meta-test inventory

- **EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts`:** assert every `adminSurface:"inbox"` code (a) has non-null `dougFacing`, (b) is a per-show producer, (c) is in `INTERPOLATED_DOUG_FACING_CODES` (line 555; both already are), (d) `ADMIN_ALERTS_LIFECYCLE[code].class === "auto"` (a no-Dismiss item that never auto-resolves would be permanently stuck; forbids that). No lifecycle-class or pinned-count change.
- **NEW manual-resolve registry meta-test:** the app-level resolve surfaces B (global route) and C (show route) reject inbox-routed codes; D (helper) throws; A is scope-excluded (`.is("show_id", null)` asserted present); AUTO surfaces (`recoveryResolution.ts`, `resolveStaleSyncProblemAlerts_unlocked`) are NOT guarded. Fails if a new manual `resolved_at`-write surface appears without a registry row. Belt-and-braces grep: no `resolveAdminAlert(s)` production caller passes an inbox-routed code literal.
- **`tests/admin/_metaInfraContract.test.ts`:** register the loader's new `admin_alerts` await (invariant 9 typed infra_error).

---

## 9. Dimensional invariants & transition inventory (UI)

- **Dimensional invariants:** N/A — the inbox is flow layout (stacked cards in `flex-col gap`); no fixed-height/width parent. The `sync_problem` card matches the `existing_staged` box model. (No Playwright `getBoundingClientRect` task; stated per the writing-plans gate.)
- **Transition inventory:** no mode toggles or animated item state. Items appear/disappear across server re-renders — **instant, no animation** by design, matching the other three variants. No `AnimatePresence`/ternary transition to audit.

---

## 10. Test plan (concrete failure mode per test)

1. **buildNeedsAttention merges sync_problem** — a `syncProblems` input newer than an ingestion sorts first. *Catches:* stream ignored / mis-sorted.
2. **totalCount includes syncProblems** — 2 ingestions + 1 sync + 3 sync-problems, cap 20 → `totalCount===6`, `syncProblemTotal===3`. *Catches:* headline/badge undercount.
3. **Cap slice spans all three streams** — 21 sync-problems, cap 20 → `renderedCount===20`, `overflowCount===1`, `syncProblemTotal===21`. *Catches:* overflow from capped array (R6-F1 regression), per-stream cap.
4. **Copy resolution** — `SHEET_UNAVAILABLE` `sheetName:"East Coast"` → contains "East Coast", no `<sheet-name>`, no `*`/`_`; `sheetName:null, title:"RPAS"` → "RPAS"; both null → generic; unknown code → generic. *Catches:* placeholder/raw-code/emphasis leak.
5. **Guard: missing slug** — a row whose `shows` embed is null is skipped + `log.warn`. *Catches:* dead `/admin/show/undefined` link.
6. **AlertBanner excludes inbox-routed** — only a `SHEET_UNAVAILABLE` unresolved alert present → banner renders null. *Catches:* double-surfacing.
7. **fetchUnresolvedAlertCount excludes inbox-routed** — same fixture → bell count 0. *Catches:* bell/banner divergence.
8. **needsAttentionCount includes inbox-routed** — same fixture → badge count 1. *Catches:* badge undercount / count-path drift.
9. **loadNeedsAttention third stream (db-backed)** — insert an unresolved `SHEET_UNAVAILABLE` alert for a non-archived show → result has a `sync_problem` item with the right slug/copy. *Catches:* wrong filter/embed.
10. **Inbox renders sync_problem card** — link href is `/admin/show/{slug}?alert_id={alertId}` (deep-link preserved), no retry/discard/resolve button, and two cards for different shows have **distinct** accessible names (row-specific `aria-label`). *Catches:* accidental action affordance + dropped deep-link + duplicate a11y names (R11-F1).
11. **Per-show read-only (UI)** — `PerShowAlertSection` given a `SHEET_UNAVAILABLE` alert renders copy but NO `PerShowAlertResolveButton`; a non-inbox code still renders the button. *Catches:* the UI dismiss affordance surviving.
12. **Resolve routes + helper reject inbox-routed** — the show-scoped route and the global route each return **`409 ALERT_AUTO_RESOLVE_ONLY`** with no `resolved_at` write for a `SHEET_UNAVAILABLE`/`PARSE_ERROR_LAST_GOOD` target; `resolveAdminAlert({code:"SHEET_UNAVAILABLE"})` and `resolveAdminAlerts({codes:[...,"PARSE_ERROR_LAST_GOOD"]})` throw with no write; the same surfaces resolve a non-inbox code (`SYNC_STALLED`) successfully. Retarget `resolveAdminAlert.test.ts:51`. *Catches:* an API/helper dismiss path surviving. (No Doug-facing copy assertion — the code is a structural API error the UI never renders for these codes, §4.8.)
13. **Empty INBOX_ROUTED_CODES short-circuit** — routed set stubbed empty → `loadNeedsAttention`/`needsAttentionCount` emit zero sync-problem items / add 0, NOT every per-show alert. *Catches:* dropped-`.in()` over-selection.
14. **Archived show excluded (db-backed)** — an archived show with an unresolved `SHEET_UNAVAILABLE` alert: no `sync_problem` item, not counted; a non-archived degraded show IS included. *Catches:* permanent stuck item on a sync-skipped show.
15. **Digest caller compat** — `buildNeedsAttention` with no `syncProblems` compiles, returns `syncProblemTotal:0`, no `sync_problem` items; `buildDigestModel` over a fixture yields no `sync_problem` grouping. *Catches:* required-field compile break + digest mislabeling.
16. **Dashboard summary breakdown (R13-F1)** — `NeedsAttentionSummaryCard` given `syncProblemTotal>0` (sync problems the only items) renders the "N sync problem[s]" breakdown line and a headline `totalCount` that matches; a fixture with only ingestions shows no sync-problem line. *Catches:* headline counting sync problems while the breakdown omits them / Dashboard not wiring the prop.

Derive expected values from fixture dimensions (anti-tautology). DB-backed tests use the local Supabase; alerts inserted via the same `upsert_admin_alert` RPC producers use.

---

## 11. Files touched

| File | Change |
| --- | --- |
| `lib/messages/catalog.ts` | `adminSurface?` field + set `"inbox"` on two entries |
| `lib/messages/adminSurface.ts` (new) | `INBOX_ROUTED_CODES` + `isInboxRouted(code)` (+ shared `INFO_SEVERITY_CODES`/`BANNER_EXCLUDED_CODES`) |
| `components/admin/AlertBanner.tsx` | exclude `BANNER_EXCLUDED_CODES` (was `INFO_SEVERITY_CODES`) |
| `lib/admin/alertCount.ts` | same exclusion, shared constant |
| `lib/admin/needsAttention.ts` | `sync_problem` variant, input type, merge, `syncProblemTotal`, `resolveSyncProblemCopy` |
| `lib/admin/loadNeedsAttention.ts` | third stream rows + head-count (archived-excluded, empty-set short-circuit) |
| `lib/admin/needsAttentionCount.ts` | third head-count (same filter) |
| `components/admin/NeedsAttentionInbox.tsx` | `sync_problem` card branch |
| `components/admin/NeedsAttentionSummaryCard.tsx` | `syncProblemTotal` prop + breakdown line |
| `components/admin/Dashboard.tsx` | pass `syncProblemTotal={result.needsAttention.syncProblemTotal}` to `<NeedsAttentionSummaryCard>` (`:589-593`) — the only render site of the card (R13-F1) |
| `components/admin/PerShowAlertSection.tsx` | omit `PerShowAlertResolveButton` for inbox-routed (read-only + note) |
| `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts` | reject inbox-routed |
| `app/api/admin/admin-alerts/[id]/resolve/route.ts` | reject inbox-routed |
| `lib/adminAlerts/resolveAdminAlert.ts` | `resolveAdminAlert`/`resolveAdminAlerts` throw on inbox-routed |
| `lib/notify/digest.ts` | defensive `sync_problem` arm in variant helpers (no behavior change) |
| `tests/adminAlerts/resolveAdminAlert.test.ts` | retarget the `SHEET_UNAVAILABLE` case; add inbox-routed rejection test |
| `tests/**` | per §8 + §10 |

`app/admin/actions.ts` is **unchanged** (surface A, global-only scope). No migration.

---

## 12. UI quality gate

Invariant 8: `/impeccable critique` + `/impeccable audit` on the UI diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`-deferred. **Scope = every touched `components/` surface:** `NeedsAttentionInbox.tsx` (new `sync_problem` card + deep-link/a11y), `NeedsAttentionSummaryCard.tsx` (+ breakdown line), `AlertBanner.tsx` (exclusion), `PerShowAlertSection.tsx` (§4.8 read-only row state + auto-clear note), and `Dashboard.tsx` (the `syncProblemTotal` wiring + rendered mobile summary state). The milestone handoff records a HIGH/CRITICAL disposition for each.
