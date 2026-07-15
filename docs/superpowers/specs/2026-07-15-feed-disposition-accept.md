# Per-show Changes feed: disposition state (Accept / Accepted) + "Sheet changes" rename

**Date:** 2026-07-15
**Status:** Draft (autonomous-ship pipeline; user design approval given interactively 2026-07-15)
**Depends on:** Flow-4 auto-applied strip (PR #363 line — `acknowledge_changes` RPC, `AcceptChangeButton`, dashboard actions), Phase 5/6 changes feed.

## 1. Motivation

The dashboard's "Recently auto-applied" strip is the cross-show **inbox** (un-dispositioned auto-applied changes, Accept/Undo). The per-show Changes feed is the per-show **history**. Today the feed carries no disposition state: on the show page Doug cannot tell which auto-applied rows he already accepted, and cannot accept from there — he must return to the dashboard. This feature adds the inbox affordance to the feed without changing the feed's history semantics, and renames the section heading to name its true scope.

Explicitly NOT a semantics merge: the feed keeps showing accepted rows, undone rows, MI-11 holds, and all sources forever (history). Only the *affordance* and a *tag* are added. (Ratified in interactive design 2026-07-15; do not relitigate history-vs-inbox.)

## 2. Data layer — `readShowChangeFeed`

Current log query selects `id, occurred_at, status, summary, entity_ref, change_kind, individually_undoable` (`lib/sync/feed/readShowChangeFeed.ts:222`).

Changes:

- Select adds `source, acknowledged_at`.
- `FeedEntry` (`lib/sync/holds/types.ts:60`) gains two **required** fields:
  - `acceptable: boolean` — true iff `source === 'auto_apply' && status === 'applied' && acknowledged_at IS NULL`. This predicate mirrors the `acknowledge_changes` RPC WHERE clause exactly (`supabase/migrations/20260706130000_show_change_log_acknowledged.sql:23-24`), so the UI never offers an Accept the RPC would no-op. No change-kind filter: the RPC has none, and `writeAutoApplyChanges` is the only `auto_apply` writer.
  - `acknowledgedAt: string | null` — ISO-normalized via the existing `toIso` helper (`readShowChangeFeed.ts:92-95`), `null` when unacknowledged.
- Hold-derived entries (MI-11 pending): `acceptable: false`, `acknowledgedAt: null`.
- `action` enum (`"undo" | "approve_reject" | "none"`) is **untouched** — a crew row can be simultaneously undoable and acceptable (the dashboard strip already renders both buttons on one row), so disposition rides in parallel fields, never in the enum.

**Required-field sweep:** adding required fields to `FeedEntry` breaks every literal constructor and every exact `toEqual` fixture. The plan must grep all `FeedEntry` construction sites (production: `readShowChangeFeed.ts` log-row + hold-row builders; tests: all fixtures under `tests/`) and update each. No `?:` optionality — optional fields hide missed sites (`exactOptionalPropertyTypes` lesson).

### Guard conditions

| Input state | `acceptable` | `acknowledgedAt` |
| --- | --- | --- |
| `source='auto_apply'`, `status='applied'`, `acknowledged_at` NULL | `true` | `null` |
| same, `acknowledged_at` set | `false` | ISO string |
| `status='undone'` (any source) | `false` | pass through (`toIso` or `null`) |
| `source` ∈ `mi11_approve`, `mi11_reject`, `undo` | `false` | pass through |
| hold-derived entry (no log row) | `false` | `null` |

**Null-ness contract:** `acceptable` keys on the RAW selected `acknowledged_at` being SQL NULL (`row.acknowledged_at == null` in JS) — ANY non-null value, even an unexpected shape, makes the row non-acceptable, exactly matching the RPC's `acknowledged_at IS NULL`. The display field `acknowledgedAt` is `toIso(raw)` passthrough — `acknowledged_at` is a Postgres `timestamptz` and gets the same shape-trust as the existing `occurred_at` handling (`readShowChangeFeed.ts:92-95`); no malformed-timestamp special case exists at this layer.

## 3. Server actions — `app/admin/show/[slug]/_actions/feed.ts`

Two new `"use server"` actions beside the existing `undoChangeAction` / `mi11ApproveAction` / `mi11RejectAction`, near-copies of the dashboard pair (`app/admin/_actions/autoApplied.ts:42` `acceptChangeAction`, `:73` `acceptAllAction`):

- `acceptChangeAction(prev, formData)` — reads `showId` + `changeLogId`; `acceptAllAction(prev, formData)` — reads `showId` + comma-joined `ids`.
- `requireAdminIdentity()` FIRST (defense in depth; mirrors every action in this file).
- **Input guards (complete contract; helper is never called on a refusal, and refusals never emit telemetry):**
  - Both actions: empty/absent `showId` → typed `{ ok:false, code:"SYNC_INFRA_ERROR" }` (mirrors `autoApplied.ts:51`).
  - `acceptChangeAction`: empty/absent `changeLogId` → same typed refusal. (Tightens the dashboard near-copy — `autoApplied.ts` lets an empty id reach the RPC where the `uuid[]` cast rejects it; guarding client-side is a deliberate, documented delta, not drift. Dashboard behavior unchanged.)
  - `acceptAllAction`: `ids` parsed as `split(",").map(trim).filter(Boolean)` then de-duplicated via `Set`. Empty resulting array → typed refusal (the Accept-all button only renders with N ≥ 1, so an empty payload is a malformed submission, not a valid no-op).
  - No client-side UUID-shape validation: a non-UUID token reaches the RPC, PostgREST rejects the `uuid[]` cast as a returned error, and `acknowledgeChanges` maps it to `{ ok:false, code:"SYNC_INFRA_ERROR" }` (invariant 9 path — already tested in the helper).
  - Stale/foreign/already-acknowledged ids inside an otherwise-valid array are NOT errors: the RPC's WHERE filters them and returns `{ ok:true, count }` with the count of rows actually acknowledged (0 is a valid success — e.g. a double-submit race with the dashboard strip).
- All `{ ok:false }` codes surface via `ErrorExplainer` catalog copy (invariant 5); success telemetry only, on the committed branch (below).
- Delegate to `acknowledgeChanges(showId, ids)` (`lib/sync/holds/acknowledgeChanges.ts:23`) — cookie-bound authenticated client → admin-only SECURITY DEFINER RPC. **Lock-free: NO `withShowAdvisoryLock` wrap** (acknowledgement sets `acknowledged_at`/`acknowledged_by` only, mutates no roster state; single-holder invariant 2 — the file's PF15 comment already pins "no wrapping" for this file's actions).
- On success: `revalidatePath("/admin/show/[slug]", "page")` AND `revalidatePath("/admin", "page")` — the dashboard strip must drop the accepted rows. NO `revalidateShow` — acknowledgement changes no crew-facing data (contrast `undoChangeAction`, which reverts crew data and does bust the tag).
- Post-commit, fail-open `logAdminOutcome` with code `CHANGES_ACKNOWLEDGED` (existing code, already sanctioned in `tests/log/_auditableMutations.ts:405` `ADMIN_OUTCOME_CODES`), sources `admin.show.feed.accept` / `admin.show.feed.acceptAll`, `extra` mirroring the dashboard actions (`{ changeLogId, count }` / `{ count, requested }`).

**PF23 note (preempt — do not relitigate):** PF23's "never bind showId client-side" applies to undo/approve/reject because their helpers re-resolve `drive_file_id` for re-check. `acknowledge_changes` does no drive re-check; its WHERE requires `show_id = p_show_id AND id = any(p_ids)`, so a mismatched pair no-ops (count 0). The dashboard strip has form-carried `showId` since Flow-4 (`autoApplied.ts:47`); these actions mirror that sanctioned precedent.

**Invariant 10 (admin mutations):** both actions get `AUDITABLE_MUTATIONS` rows (`tests/log/_auditableMutations.ts` — pattern at `:314-323`) plus executable success-branch behavioral proof in `tests/log/adminOutcomeBehavior.test.ts` (sink-spy records only after committed success). The static walker (`tests/log/_metaMutationSurfaceObservability.test.ts`) fails-by-default on the new exports until the rows land.

## 4. UI

### 4.1 `ChangeFeedEntry`

- When `entry.acceptable`: render the existing `AcceptChangeButton` (`components/admin/AcceptChangeButton.tsx` — already generic: `hiddenFields` record, `data-testid="change-feed-accept"`, useActionState pending-flag disable, `ErrorExplainer` on typed failure) with `hiddenFields={{ showId, changeLogId: entry.id }}` beside the existing Undo button. `changeLogId` for accept is `entry.id` (the log row id — same id the strip submits); the `entry.changeLogId` field remains the undo-only payload (set ⟺ `action==='undo'`).
- When `entry.acknowledgedAt !== null`: render a quiet "Accepted" tag adjacent to `ChangeFeedBadge`, using the muted badge tokens (`bg-surface-sunken text-text-subtle` — the `undone`/`superseded` shape at `components/admin/ChangeFeedBadge.tsx:33-43`), `data-testid="change-feed-accepted-tag"`, `title="You accepted this change."`. Rendered as a sibling span, NOT a new `ChangeStatus` (status stays the sync-outcome axis; acknowledgement is an orthogonal disposition axis).
- Mode boundaries — the two axes are independent and their render rules are total:
  - **Accept button:** renders iff `entry.acceptable` (which by predicate implies `source='auto_apply'`, `status='applied'`, unacknowledged). Never on gate rows, pending/rejected/undone/superseded rows, or non-`auto_apply` sources.
  - **"Accepted" tag:** renders iff `entry.acknowledgedAt !== null`, REGARDLESS of status. An accepted-then-undone row shows the `Undone` badge AND the "Accepted" tag — acknowledgement is a historical fact (`undo_change` does not clear `acknowledged_at`); the tag records "you saw and accepted this," the badge records what later happened. This is the single rendering rule; §4.3's undo-of-accepted transition follows from it.
  - `acceptable` and `acknowledgedAt !== null` are mutually exclusive by predicate, so Accept button and Accepted tag never co-render. Accept + Undo DO co-render on acceptable crew rows.
- New prop threading: `ChangeFeedEntry` gains `showId: string` and `acceptAction` (typed like the strip's `AcceptServerAction`); both flow from `ChangesFeed`.

### 4.2 `ChangesFeed`

- Header (`components/admin/ChangesFeed.tsx:46-47`): `<h2>` text `Changes` → **`Sheet changes`**. `id="admin-changes-feed-heading"`, `aria-labelledby` wiring, and all testids unchanged.
- When ≥1 entry is `acceptable`: render "Accept all (N)" in the header row — `AcceptChangeButton` with `label={`Accept all (${n})`}`, `hiddenFields={{ showId, ids: acceptableIds.join(",") }}`. N = count of acceptable entries **among rendered entries** (feed is capped at 50 by `readShowChangeFeed`; Accept-all acts on what Doug can see — same cap semantics as the strip's per-show group). No confirm gate: accept is non-destructive and reversible-in-effect (rows remain in history; strip Accept-all ships without confirm — parity).
- Zero acceptable entries → no Accept-all (not a disabled button).
- New props: `showId: string`, `acceptAction`, `acceptAllAction`, threaded from the show page (`app/show` admin page renders `ChangesFeed` at `app/admin/show/[slug]/page.tsx:832-837`; server actions passed as DIRECT references, never inline closures — RSC boundary rule).

### 4.3 Transition inventory

Component states: (A) row acceptable, (B) row accepted-tagged, (C) row neither, plus per-button pending.

| Transition | Treatment |
| --- | --- |
| A → B (accept succeeds, revalidate re-render) | instant — no animation (matches existing feed row status flips; feed has no AnimatePresence) |
| A → A′ (accept pending) | `AcceptChangeButton` built-in: disabled + `aria-busy` on `useActionState` pending flag only |
| A → A (accept fails) | `ErrorExplainer` renders below button (built into `AcceptChangeButton`) |
| Accept-all pending while row-Accept pending (compound) | independent `useActionState` instances; both disable on own pending flag; server serializes (RPC row-level `acknowledged_at IS NULL` guard makes double-accept a 0-count no-op) |
| Undo of an accepted row (B, crew kind still undoable) | allowed — undo flips status to `undone`; "Accepted" tag remains per the §4.1 total rule (tag ⟺ `acknowledgedAt !== null`; `undo_change` never clears `acknowledged_at` — `supabase/migrations/20260608000003_undo_change_rpc.sql:78,289` set `status` only). No animation. |
| Header Accept-all disappears when N→0 | instant re-render |

No fixed-dimension parent is introduced (rows are intrinsic-height list items) → **no Dimensional Invariants section / no real-browser layout task required beyond the existing e2e**, which asserts affordance layout via `tests/e2e/admin-changes-feed-layout.spec.ts` (its `getByRole("list", { name: /changes/i })` selector still matches "Sheet changes").

## 5. Rename ripple ("Changes" → "Sheet changes")

- `components/admin/ChangesFeed.tsx:47` heading text (display only).
- Component test pins old text: `tests/components/admin/ChangesFeed.a11y.test.tsx:42` `toHaveTextContent("Changes")` → `"Sheet changes"`.
- Help copy: `app/help/admin/dashboard/page.mdx` (3 refs to "Changes feed", lines 41/53) and `app/help/admin/per-show-panel/page.mdx` (h2 "The changes feed" at line 14 + body refs). Anchor `id="changes-feed"` and the `learnMore` href `/help/admin/review-queues#...` targets stay stable.
- **No screenshot regen:** the help-screenshot manifest (`scripts/help-screenshots.manifest.ts`) captures dashboard, needs-attention, review-queues, preview-as-crew, and crew-preview routes only — no `/admin/show/[slug]` panel route — and the dashboard's own headings are untouched. (Verified against the 14 baselines in `public/help/screenshots/`.)
- e2e `getByRole("list", { name: /changes/i })` (`admin-changes-feed-layout.spec.ts:121`) — case-insensitive substring; "Sheet changes" matches. Repo-wide grep for `"Changes"` string assertions is a plan task (class-sweep, not just the two named files).

## 6. Testing

TDD per task. New/updated tests:

1. **Feed read unit** (`tests/` existing readShowChangeFeed suite): acceptable predicate truth table from §2 guard grid — acceptable row, acknowledged row, undone row, `mi11_approve` row, hold entry. Assert `acknowledgedAt` ISO normalization. Anti-tautology: fixtures set `acknowledged_at` to a raw pg timestamptz string and assert the normalized ISO output, not echo of input.
2. **Action units**: both new actions — every §3 input-guard row (empty showId, empty changeLogId, empty/whitespace-only/comma-noise `ids`, duplicate ids de-duplicated in the delegated payload; helper never called and no telemetry on each refusal), delegation payload (showId + ids array), success → both `revalidatePath` targets, `count: 0` success passthrough (stale-id race), typed failure passthrough, `logAdminOutcome` on success branch only. Mirror existing `undoChangeAction` test shape.
3. **Invariant-10 behavioral proof**: `tests/log/adminOutcomeBehavior.test.ts` rows for both actions (sink-spy observes `CHANGES_ACKNOWLEDGED` only on committed success). Registry rows in `_auditableMutations.ts`.
4. **`ChangeFeedEntry` render states**: acceptable (Accept present), acceptable+undoable (both buttons), accepted (tag present, no Accept), neither (no Accept, no tag), gate row (unchanged). Anti-tautology: query buttons by testid within the row under test.
5. **`ChangesFeed`**: Accept-all visible iff N≥1 with correct count + ids payload; heading text "Sheet changes"; a11y test update.
6. **Meta-tests re-run** (registry inventory): `tests/log/_metaMutationSurfaceObservability.test.ts` (new mutation surfaces — fails-by-default until registered), `tests/auth/advisoryLockRpcDeadlock.test.ts` (topology unchanged — acknowledge takes no advisory lock; assert still green), `tests/sync/_metaInfraContract.test.ts` (readShowChangeFeed registered at `:346-349`; select-list edit is comment/format-fragile, re-run after edit). No new meta-test needed: no new registry class is introduced (declared per writing-plans meta-test inventory rule).
7. **e2e**: existing `admin-changes-feed-layout.spec.ts` still green (selector regex tolerant). Extend the picker-flow/e2e surface ONLY if an existing spec asserts absence of an Accept control (plan verifies by grep; none known).

## 7. Out of scope

- Logging admin ops (share-link rotate, archive, re-sync) into `show_change_log` — rejected during naming discussion; feed remains sheet-driven changes only, which is exactly what "Sheet changes" names.
- Any change to dashboard strip behavior, `acknowledge_changes` RPC, or DB schema (no migration in this feature).
- Feed pagination / cap changes (stays 50).
- Observe CLI `changes` command output (reads `show_change_log` directly; unaffected).

## 8. Numeric sweep anchors

- Feed cap: **50** (`DEFAULT_LIMIT`, `readShowChangeFeed.ts:22`) — Accept-all N is bounded by it.
- Help refs: dashboard mdx 3, per-show-panel mdx (h2 + body) — plan re-counts at edit time.
- Screenshot baselines: 14 files, none affected.
- New required `FeedEntry` fields: 2 (`acceptable`, `acknowledgedAt`).
- New server actions: 2. New registry rows: 2. New testids: 1 (`change-feed-accepted-tag`); `change-feed-accept` is reused from the strip component.
