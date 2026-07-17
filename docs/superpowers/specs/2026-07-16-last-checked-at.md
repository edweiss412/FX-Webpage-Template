# Spec: `last_checked_at` — separate sync-health from content-age

**Date:** 2026-07-16
**Slug:** `last-checked-at`
**Status:** Draft → self-review → adversarial-review (Codex) → APPROVE
**Owner/harness:** Opus / Claude Code (UI touched → Opus-only per ROUTING hard rule)

---

## 1. Problem

The Drive-connection health badge (admin `/admin/settings`) and the crew-page
`StaleFooter` both derive "sync health" from the **age of `shows.last_synced_at`**.
But `last_synced_at` is bumped **only on a real content apply**. A healthy cron
watermark-skip (Drive polled every 5 min, nothing changed) does **not** touch it.

Consequence: on a folder whose sheets simply are not being edited, every active
show's `last_synced_at` ages past the freshness thresholds and both surfaces
report a false "needs attention" / "sync delayed" — while Telemetry (open
`admin_alerts`, cron health) is correctly all-green, because staleness is neither
an alert nor a cron failure. Observed on validation 2026-07-16: 7/7 active shows
`last_sync_status='ok'`, `last_synced_at` = 3.3h old (all idle test shows),
badge = "Syncing, but 7 shows need attention".

**Root cause:** age-of-last-content-change is being used as a proxy for
"is sync working." The two are only equal on a folder that is constantly edited.

## 2. Goal

Introduce a real **"we successfully reached Drive and evaluated this show"**
timestamp, `shows.last_checked_at`, and base the **age tiers** of both health
surfaces on it. `last_synced_at` keeps its apply-only meaning (still drives the
crew cache/version token and the admin content-recency sort).

Idle-but-healthy show (checked 5 min ago, content 3h old) → **positive / subtle,
no warning**. A genuinely stalled sync (cron/watch stopped reaching Drive) still
escalates, because `last_checked_at` then ages.

Non-goals: **no change to `last_synced_at` write behavior** — this spec ADDS no
`last_synced_at` write and REMOVES none. In particular the existing
`last_synced_at = now()` bumps on the error writers (`parse_error` `:1087`,
`sheet_unavailable` `:1150`, `drive_error` `:1176`) stay exactly as they are;
this spec does not touch them. No change to the crew version/high-water-mark
token; no change to status-based tiers (`watch_*`,
`drive_error`, `sheet_unavailable`, `parse_error`, `shrink_held`, `sync_unknown`);
no new alert codes; no CHECK/enum change.

## 3. Data model

New column on `public.shows` (canonical DDL at
`supabase/migrations/20260501000000_initial_public_schema.sql:3`):

```sql
alter table public.shows add column if not exists last_checked_at timestamptz;
-- backfill: best available seed = the last time we know we applied content.
update public.shows set last_checked_at = last_synced_at where last_checked_at is null;
```

- **Type:** `timestamptz`, **nullable** (mirrors `last_synced_at:22`). No CHECK,
  no default, no enum. New forward migration file
  `supabase/migrations/<ts>_shows_last_checked_at.sql` (idempotent:
  `add column if not exists`, `update ... where last_checked_at is null`).
- **CHECK/enum migration matrix:** N/A — new nullable column, no constraint, no
  enum value added. No transitional dual-accept window needed.
- **schema-manifest:** shows columns are enumerated at
  `supabase/__generated__/schema-manifest.json:328-363`; regenerate via
  `pnpm gen:schema-manifest` and commit. `validation-schema-parity` gate then
  requires the column exist on the validation project → apply surgically
  (`supabase db query --linked "alter table ... ; update ... ; notify pgrst,'reload schema';"`).
- **Views:** none enumerate shows columns; `shows_internal`
  (`supabase/migrations/20260501001000_internal_and_admin.sql:1`) is a separate
  FK table, not a `select *` view. No propagation needed.

## 4. Write path — `lib/sync/runScheduledCronSync.ts`

**Definition of "checked":** `last_checked_at = now()` is written on every
per-file cron outcome where FXAV **successfully reached Drive and evaluated the
file without a fetch/parse error** — `applied`, `watermark`-skip,
`deferred_modtime`, `shrink_held`, `pending_review` (stage). It is **NOT**
written on `drive_error` / `sheet_unavailable` / `parse_error` (those did not
reach/parse Drive and retain their own hard-failure status tiers, red regardless
of age). Archived shows are never written (excluded from every health surface).

**Advisory-lock compliance (invariant 2, single-holder).** Every
`last_checked_at` write rides an **already-held** `show:<drive_file_id>` lock
tx. No new lock is acquired anywhere; topology is unchanged.

| Outcome | Existing write site (already in-lock) | Action |
|---|---|---|
| applied (skipDiagrams) | `applyShowSnapshot` `:1484` | append `last_checked_at = now()` to the same UPDATE |
| applied (full) | `applyShowSnapshot` `:1511` | append `last_checked_at = now()` |
| pending_review (stage) | `updateShowPendingReview` `:1130` | append `last_checked_at = now()` |
| shrink_held | `updateShowShrinkHeld` `~:1100` | append `last_checked_at = now()` (note: `last_synced_at` stays UNchanged here per audit #3, `:1104-1110`; only `last_checked_at` advances) |
| watermark-skip / deferred_modtime | non-archived skip already runs inside `lock(driveFileId, async (lockedTx) => {…})` (`:2688`, `deps.withShowLock ?? withPostgresSyncPipelineLock` — the SAME single-holder wrapper as the apply path at `:2698`) | inside that callback, **after** the `readShowArchived_unlocked` guard (`:2689`) and alongside `logSync` (`:2692`), add `update shows set last_checked_at = now() where drive_file_id = $1` using `lockedTx`. Archived-in-the-gap shows return at `:2690` before the write (correct — archived get no write); a contended lock (`ConcurrentSyncSkipped`, `:2695`) returns without writing (another holder writes). Single holder; no second acquisition. |
| parse_error `:1087` / sheet_unavailable `:1150` / drive_error `:1176` | these UPDATEs already set `last_synced_at = now()` | **add NO `last_checked_at` write**; leave the existing `last_synced_at` bump untouched (§2 non-goal). These outcomes retain their own hard-failure status tiers (red regardless of age), so a checked-but-errored show still flags via status, never via a fresh `last_checked_at`. |

The outside-lock skip early-return at `:2810-2811` is **not** a write site (no tx
active there). `deferred_permanent` targets non-show files (no active `shows`
row) → the write matches zero rows, harmless.

## 5. Read path — consumers

### 5.1 `lib/admin/driveConnectionHealth.ts` (admin badge)
- Age tiers `stale_moderate` / `stale_severe` compute off `last_checked_at`
  instead of `last_synced_at`. Threshold values unchanged: `< 1h` fresh,
  `1h–6h` moderate, `> 6h` or **null** severe.
- **DROP** the `pending_review` > 6h sub-clause from `stale_severe`
  (`:248-256`). Rationale (ratified): review-backlog ≠ sync-stall; staged content
  is already counted by `lib/admin/needsAttentionCount.ts` + routed to the inbox.
  A `pending_review` pass now also bumps `last_checked_at`, so the age clause
  would be permanently fresh anyway.
- Status-based tiers (`watch_*`, `drive_error`, `sheet_unavailable`,
  `parse_error`, `shrink_held`, `sync_unknown`) **unchanged**.
- `lastReadAt` display value (`readMaxLastSyncedAt` `:343`) → `max(last_checked_at)`
  over active shows ("last read" = last folder read = last check). Rename the
  helper to `readMaxLastCheckedAt`; the panel line becomes "…last read <t>".
- `syncingCount` (active-show count) unchanged.

### 5.2 `components/shared/StaleFooter.tsx` (crew footer)
- Prop `lastSyncedAt` → `lastCheckedAt` (crew "as-of" is now check-based). Fed by
  `Footer.tsx:123` (see the §5.3 chain). The prop JSDoc (`:29-37`, the "required
  `now`" contract) stays; only the timestamp source changes.
- Both the **displayed relative time** and the **yellow/red tier** derive from
  `lastCheckedAt`. Threshold ladder unchanged: `<10m` subtle, `10m–1h` subtle-dot,
  `1h–6h` yellow (`SYNC_DELAYED_MODERATE`), `>6h` red (`SYNC_DELAYED_SEVERE`).
- **DROP** the `pending_review`/`shrink_held` > 6h escalation clause
  (`:70-72`) for the same reason as 5.1 (a checked-recently held/pending show is
  not a crew-facing sync stall; crew still see valid last-good content). `shrink_held`
  and `pending_review` fall through to the age ladder like `ok`/`pending`.
- Guard: `if (!lastCheckedAt) return null` (unchanged shape from `:83`).
- Status-based red branches (`drive_error`, `sheet_unavailable`, `parse_error`
  `:59-61`) unchanged.

### 5.3 Crew viewer wiring — full 4-hop chain (all change in lockstep)
The crew footer timestamp flows through an intermediate `Footer` component; the
rename touches every hop. Call sites verified sole (no other consumers):
1. `lib/data/getShowForViewer.ts`: add `lastCheckedAt: string | null` to the
   return type (`:200`, beside `lastSyncedAt`) and project it at `:846`
   (`(showRowDb.last_checked_at as string | null | undefined) ?? null`).
   `select("*")` at `:376` already returns the column — no select change.
   **Keep `lastSyncedAt` in the return** — it still feeds the version token and
   the content-recency consumers.
2. `app/show/[slug]/[shareToken]/_CrewShell.tsx:481`: change
   `lastSyncedAt={data.lastSyncedAt}` → `lastCheckedAt={data.lastCheckedAt}` on
   the `<Footer>` element (`:453`, the **sole** `<Footer>` call site).
3. `components/layout/Footer.tsx`: rename prop `lastSyncedAt` → `lastCheckedAt`
   (type `:65`, JSDoc `:60-67`, destructure `:101`), the render guard
   `{lastSyncedAt ? (` → `{lastCheckedAt ? (` (`:121`), and the pass-through
   `lastSyncedAt={lastSyncedAt}` → `lastCheckedAt={lastCheckedAt}` (`:123`, the
   **sole** `<StaleFooter>` call site). `lastSyncStatus` prop unchanged.
4. `components/shared/StaleFooter.tsx`: prop rename (§5.2).
- **Do NOT** touch the version high-water-mark. The token is computed by the
  RPC `public.viewer_version_token(uuid)` using `extract(epoch from last_synced_at)`
  (`supabase/migrations/20260501001000_internal_and_admin.sql:26`) — `last_checked_at`
  must never enter it, or every 5-min check would bust every crew cache. The JSDoc
  at `:276-293` stays accurate.

### 5.4 `components/admin/Dashboard.tsx`
- No change. It sorts active shows by `last_synced_at DESC` (`:178`) — content
  recency, not health. Leave as-is.

### 5.5 `app/admin/show/[slug]/page.tsx` — admin per-show detail footer (LEAVE)
- The admin per-show detail page renders its OWN `syncFooterLabel` (`:556-560`)
  from `show.last_synced_at` ("Last synced {rel}" / "<status-label> · Last synced
  {rel}") — this is NOT `StaleFooter` and NOT a health-tier surface. It is a
  **factual content-recency label** on a single-show admin view (answers "when did
  THIS show's content last change"), carries no yellow/red alarm, and reads
  correctly for an idle-healthy show ("Last synced 3h ago" is true, not a false
  attention signal). **Leave unchanged** — deliberately keeping `last_synced_at`
  and the word "synced" here. It is a different question from the connection
  badge (health) and the crew footer (check-freshness), on a different page; no
  double-render (crew route and admin-detail route are distinct). Documented to
  preempt a "you missed this surface" relitigation.

## 6. Copy — §12.4 catalog (3-file lockstep)

Every edit lands in the SAME commit across all three, or `x1-catalog-parity`
(`tests/cross-cutting/codes.test.ts`) fails:
(a) master spec §12.4 prose
`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`,
(b) `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts`,
(c) `lib/messages/catalog.ts`.

| Surface | Old | New |
|---|---|---|
| `SYNC_DELAYED_MODERATE.crewFacing` (`catalog.ts:2253`, spec `:2977`) | "Last synced *<time>* ago. Text Doug if anything looks off." | "Last checked *<time>* ago. Text Doug if anything looks off." |
| `SYNC_DELAYED_MODERATE` trigger prose (spec `:2977`) | "`last_synced_at` is between 1h and 6h old…" | "`last_checked_at` is between 1h and 6h old…" |
| `SYNC_DELAYED_SEVERE` trigger prose (spec `:2978`) | "`last_synced_at` is more than 6h old…" | "`last_checked_at` is more than 6h old…" |
| `StaleFooter` hardcoded no-code branch (`StaleFooter.tsx:98`) | "Last synced {relative} ago" | "Last checked {relative} ago" |

`SYNC_DELAYED_SEVERE.crewFacing` ("This page hasn't updated recently…") and
`dougFacing`/`helpfulContext` ("hasn't synced from Drive in over 6 hours…
something is stalled") are **kept as-is** — they read correctly under the new
meaning (a >6h check gap genuinely IS a stall), and leaving them out of the edit
shrinks the §12.4 lockstep surface. No other catalog rows change.

## 7. Guard conditions & boundaries

- `last_checked_at` null (never checked, e.g. freshly onboarded before first cron
  pass) → treated as **severe** in `driveConnectionHealth` (parity with the old
  null-`last_synced_at` handling) and → `StaleFooter` renders `null` (no footer),
  unchanged.
- Backfill guarantees no existing active row is null post-migration.
- `last_synced_at` remains the ONLY input to: the version token RPC, the Dashboard
  content sort, and the SyncStatus content-recency semantics elsewhere. Grep guard:
  after implementation, `last_synced_at` must NOT appear in any age-tier comparison
  in `driveConnectionHealth.ts` or `StaleFooter.tsx`.

## 8. Tier × domain × layer matrix

| Layer | Action |
|---|---|
| DDL | add `shows.last_checked_at timestamptz` + backfill (new migration) |
| CHECK | N/A (no constraint) |
| Write (cron) | `last_checked_at = now()` on applied / watermark-skip / deferred_modtime / shrink_held / pending_review; ride existing lock tx |
| Write (errors) | add NO `last_checked_at` (drive_error / sheet_unavailable / parse_error); their existing `last_synced_at = now()` bump is UNCHANGED |
| RPC read (version token) | **unchanged** — stays on `last_synced_at` |
| Read (admin health) | `driveConnectionHealth` age tiers + `lastReadAt` → `last_checked_at`; drop pending_review>6h clause |
| Read (crew footer) | `StaleFooter` tier + display → `last_checked_at`; drop pending_review/shrink_held>6h clause; copy synced→checked |
| Crew wiring | `getShowForViewer` return gains `lastCheckedAt` (:200/:846); `_CrewShell.tsx:481` passes it to `StaleFooter` |
| Frontend (admin) | `DriveConnectionPanel` — no structural change; copy is data-driven from health result |
| Frontend (admin per-show detail) | `app/admin/show/[slug]/page.tsx:556` — LEAVE (content-recency label, not health) |
| Frontend (dashboard) | unchanged |
| x4 gate | `last_checked_at` per-show = invariant-4-compliant; regen watermark-symbols; run x4 green |
| Copy §12.4 | `SYNC_DELAYED_MODERATE` crew + both trigger-prose rows (3-file lockstep) |
| schema-manifest | regen + commit |
| validation | surgical apply + parity gate |
| Tests | see §9 |

## 9. Testing

- **Cron write (DB test):** watermark-skip on a non-archived show bumps
  `last_checked_at` and leaves `last_synced_at` unchanged; an applied outcome bumps
  both; `shrink_held` bumps `last_checked_at` only (not `last_synced_at`, per audit
  #3); `drive_error`/`sheet_unavailable`/`parse_error` do **NOT** bump
  `last_checked_at` but **DO** still bump `last_synced_at` exactly as today (assert
  the pre-existing `last_synced_at` behavior is preserved — this spec must not
  regress it). Assert the writes happen under the held lock (topology unchanged).
- **`driveConnectionHealth` unit:** the **core regression** — active show,
  `last_checked_at` = 5 min ago, `last_synced_at` = 3h ago, status `ok` →
  `health: "positive"` (NOT `stale_moderate`). Plus: `last_checked_at` 2h ago →
  `stale_moderate`; 7h ago (or null) → `stale_severe`; `pending_review` +
  fresh `last_checked_at` → positive (dropped clause proof); status tiers still
  fire regardless of `last_checked_at`.
- **`StaleFooter` unit:** `lastCheckedAt` 5 min ago → subtle "Last checked 5
  minutes ago", no code; 2h → yellow `SYNC_DELAYED_MODERATE`; 7h → red
  `SYNC_DELAYED_SEVERE`; `shrink_held` + fresh check → subtle (dropped clause);
  `drive_error` → red regardless. **Anti-tautology:** derive the expected tier
  from the fixture age, assert against `data-code`/`data-tier`, not container text.
- **Crew wiring:** `getShowForViewer` projects `lastCheckedAt` from the row (test
  in `tests/data/getShowForViewer.*`); the version token stays derived from
  `last_synced_at` (existing version-token contract test must still pass unchanged
  — proves `last_checked_at` did NOT leak into the token).
- **Catalog parity:** `x1-catalog-parity` green after the 3-file lockstep edit.
- **schema parity:** `validation-schema-parity` green after surgical apply +
  manifest regen.
- **Meta-tests:** `driveConnectionHealth` stays registered in
  `tests/admin/_metaInfraContract.test.ts` (invariant 9). No new RPC-gated table
  → no PostgREST-DML-lockdown meta-test. Advisory-lock topology unchanged (no new
  acquisition) → no new `advisoryLockRpcDeadlock` pin required, but the plan
  documents the enumerated holders.
- **x4-no-global-cursor gate** (`tests/cross-cutting/no-global-cursor.test.ts`,
  fed by `pnpm gen:watermark-symbols` → `lib/audit/watermark-symbols.generated.ts`):
  `last_checked_at` is a **per-show** column (invariant 4 — no global cursor),
  so it is compliant by construction. The generator runs in `pretest`/`prelint`/
  `pretypecheck` pre-hooks and re-derives symbols from the master spec, not this
  spec — adding a per-show DB column introduces no `lastPollAt`-style global
  cursor. Verification step: run `pnpm test:audit:x4-no-global-cursor` green after
  the migration. No master-spec watermark-symbols edit required.

## 10. UI quality gate (invariant 8)

`StaleFooter.tsx` and `DriveConnectionPanel.tsx` copy are UI surfaces. Run
`/impeccable critique` AND `/impeccable audit` on the diff before the whole-diff
Codex review; P0/P1 fixed or `DEFERRED.md`. No new layout / no new visual state /
no fixed-dimension parent introduced (copy + data-source change only) → no new
Dimensional-Invariants or Transition-Inventory obligations, but the audit confirms
the amber/red tiers still render correctly under the re-based thresholds.

## 11. Disagreement-loop preempts (do-not-relitigate)

- **Version token stays on `last_synced_at`** — deliberate (§5.3); `last_checked_at`
  in the token would bust crew caches every 5 min. Cite
  `20260501001000_internal_and_admin.sql:26`.
- **`pending_review`/`shrink_held` age clauses dropped** — owner-ratified
  (§5.1/§5.2); backlog tracked via `needsAttentionCount` + inbox, and the clause
  is self-defeating once `last_checked_at` bumps on those passes.
- **No new advisory lock** — every write rides an existing held tx; single-holder
  rule intact (invariant 2). Cite `lockedShowTx.ts:57-94`, cron wrapper `:1851`.
- **`SYNC_DELAYED_SEVERE` copy unchanged** — reads correctly under the new
  meaning; not an oversight.
- **Admin per-show detail footer (`page.tsx:556`) left on `last_synced_at`** —
  deliberate (§5.5): it is a factual content-recency label with no alarm, a
  different question on a different page from the two health surfaces. Not a
  missed surface.
- **Version route `app/api/show/[slug]/version/route.ts`** — reads
  `last_synced_at` for the version token; unchanged by design (mirrors §5.3).
