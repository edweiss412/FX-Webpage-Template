# Published-show archived-tab gear include (2026-07-23)

Ship an "include this gear" affordance on the **published** show review modal for the
`PULL_SHEET_ON_ARCHIVED_TAB` warning, so an admin can fold an archived-tab pull sheet into a
published show without re-running onboarding. Today the affordance exists only in wizard Step 3;
the warning copy ("the Gear section on this page offers to include it",
`lib/messages/catalog.ts:1459`) is false on the published surface — the published adapter
hard-codes `archivedPullSheetTabs: []` / `pullSheetOverride: null`
(`components/admin/review/publishedAdapter.ts:78-82`).

Triggering artifact: dev-capture `2025-05-rfi-pc-chicago-20260723-084331` (validation, commit
`12735199a`) — warning active, Pack list empty, no offer.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Flow = one-click include, no preview step ("Option A"): click records override then triggers re-sync; gear lands when sync applies. | User decision this brainstorm (2026-07-23); mock artifact (session scratchpad, not tracked). |
| Surface = published normal view ONLY. Held-changes review (live staged parse over a published show) gets a pointer line, NOT the offer. First-seen staged page (`app/admin/show/staged/[stagedId]/page.tsx:5-8`) is out of scope. | User decision this brainstorm. |
| Fingerprint source = scan-at-click. The include route re-exports the sheet and computes the archived-tab fingerprint fresh; NO new DB column, NO persisted archived-tab list on `shows`. | User decision this brainstorm. |
| Wizard flow untouched. `set_pull_sheet_override` RPC, onboarding route, and Step-3 UI keep their exact behavior. | This spec §5; wizard machinery cited at `supabase/migrations/20260706000000_pull_sheet_override.sql:21-93`, `app/api/admin/onboarding/pull-sheet-override/route.ts`. |
| Drift semantics unchanged: cron reads durable `shows.pull_sheet_override` (`lib/sync/runScheduledCronSync.ts:684-694`) and auto-clears on content drift with `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (`lib/sync/runScheduledCronSync.ts:706-713`). This feature only adds a writer for that column. | Spec 2026-07-06 (pull-sheet override) §5.2/§5.3; not re-designed here. |
| Include on a show whose subsequent parse trips an MI hold: gear waits in held review — existing cron semantics (`runScheduledCronSync.ts:3439`), deliberately NOT special-cased. | This spec §7. |
| No preview of gear contents before include. Warning card `rawSnippet` remains the only pre-commit glimpse. Accepted risk; drift auto-clear is the safety net. | User decision (Option A over Option B). |
| Catalog copy for `PULL_SHEET_ON_ARCHIVED_TAB` is NOT reworded — the feature makes the existing sentence true on the published surface. Copy sweep (§8) only VERIFIES; it edits nothing unless a field is found false post-feature. | This brainstorm's origin finding. |

## 2. UX

### 2.1 Published normal view (mode `published`)

The Pack list section (shared section renderer; staged callsite at
`components/admin/wizard/step3ReviewSections.tsx:4082-4090`, `PackListBreakdown` at `components/admin/wizard/step3ReviewSections.tsx:2267`)
gains the archived-tab offer in published mode:

- **Offer card (state P2):** rendered when the show's active warnings contain
  `PULL_SHEET_ON_ARCHIVED_TAB` AND `shows.pull_sheet_override` is null. Reuses the wizard S2
  offer-card visual family (`deriveArchivedOffers`,
  `components/admin/wizard/archivedTabOffer.tsx:23`). Title names the tab from the warning
  `blockRef.name`. Primary action "Include this gear", secondary "Skip" (dismisses card for the
  session; the warning card's own Ignore remains the durable dismissal).
- **Included note (state P3):** when `shows.pull_sheet_override` is non-null, render the S3-style
  note "Included from tab {tab}", with an "Undo" action. Undo = revoke (clear override) + re-sync.
- **In-flight (state P-busy):** clicking Include/Undo disables the card's actions and shows a
  syncing line; resolves when the modal's data refresh lands (same refresh path the Re-sync flow
  uses).
- **Error (state P-err):** typed failure line inside the card via the shared error surfacing used
  by admin mutations (invariant 5 — copy through `lib/messages/lookup.ts`; never a raw code).

The warning card itself is unchanged (Report/Ignore stay;
`components/admin/PerShowActionableWarnings.tsx`).

### 2.2 Held-changes review (mode `staged`, live parse, no wizard session)

No offer. When the staged surface renders this warning without a wizard session, the Pack list
section shows one pointer sentence: "Finish this review first, then include it from the show
page." Plain component copy (not catalog). Wizard surfaces (wizard session present) are
unchanged.

### 2.3 Guard conditions

| Input | null/empty/absent | Renders |
| --- | --- | --- |
| Active `PULL_SHEET_ON_ARCHIVED_TAB` warning | absent | No offer, no note change; section as today |
| `blockRef.name` on the warning | null/empty | No offer (cannot name the tab or build override); warning card alone |
| `shows.pull_sheet_override` | null | Offer (P2) if warning active |
| `shows.pull_sheet_override` | non-null | Included note (P3), regardless of warning presence |
| Multiple archived-tab warnings | >1 | One offer card per distinct `blockRef.name`, capped at 3; beyond cap, a single line "and N more archived tabs. Resolve these in the sheet." |
| Pull sheet cases | empty + offer active | Offer replaces the bare empty-state line (mirrors wizard S1-vs-S2 rule at `step3ReviewSections.tsx:2297`) |

### 2.4 Transition inventory

States: P1 (no offer/no override), P2 (offer), P3 (included note), P-busy, P-err.

| Pair | Treatment |
| --- | --- |
| P1↔P2 | Instant — no animation (data-driven mount, same as sibling cards). |
| P2→P-busy | Instant disable + syncing line. |
| P-busy→P3 | Instant swap on refresh. |
| P-busy→P-err | Instant; error line appears (no shake/anim). |
| P-err→P-busy | Retry click; instant. |
| P3→P-busy (undo) | Instant disable. |
| P-busy→P2 (after undo refresh) | Instant swap. |
| P2↔P3 direct | Unreachable (always via P-busy). |
| P-err→P1/P2 on external refresh | Instant swap. |
| Compound: modal closes mid P-busy | No special handling; request completes server-side; next open reflects DB state. |

No AnimatePresence usage; all transitions instant.

### 2.5 Dimensional Invariants

N/A: no fixed-dimension parent is introduced. Offer card, included note, and pointer line flow
in the Pack list section's normal vertical stack with intrinsic heights.

## 3. Mutation path

### 3.1 Route

New admin route (new file) at path app/api/admin/show/pull-sheet-override/route.ts, POST only, gated by
`requireAdmin` (same gate family as the sync route `app/api/admin/sync/[slug]/route.ts`).

Body (accept): `{ driveFileId, tabName, expectedOverrideSnapshot }` — note NO
`expectedFingerprint` (scan-at-click computes it) and NO `wizardSessionId` (published scope).
Body (revoke): `{ driveFileId, tabName: null, expectedOverrideSnapshot }`.

Flow (accept):
1. Re-export the sheet via the existing export path that produces `archivedPullSheetTabs`
   (`lib/drive/exportSheetToMarkdown.ts:12` type; fingerprint = sha256 over the tab's regions,
   `exportSheetToMarkdown.ts:332`).
2. Find the archived tab whose `tabName` matches. Missing → typed failure `no_pull_sheet_region`
   family (tab gone / renamed since the warning) — no write.
3. Call the new RPC (§3.2) with `{tabName, fingerprint}` + CAS snapshot.
4. On success, trigger the same single-file sync the Re-sync button uses
   (`components/admin/ReSyncButton.tsx:243` → `POST /api/admin/sync/[slug]`; the route reuses that
   handler's underlying sync entry server-side — plan pins the exact shared function).
5. Respond `{ ok, status }` in the same status vocabulary as the onboarding route
   (`override_set | override_cleared | stale_review | no_pull_sheet_region`,
   `app/api/admin/onboarding/pull-sheet-override/route.ts:82-96`), extended only if the plan
   proves a new state is unavoidable.

Revoke: skip steps 1-2; RPC with `tabName: null`; then trigger sync (so the gear leaves the
published rows promptly rather than at next cron pass).

### 3.2 RPC + lock topology

New SECURITY DEFINER function `set_published_pull_sheet_override(p_drive_file_id text,
p_tab_name text, p_fingerprint text, p_accepted_by text, p_expected_override_snapshot jsonb)`
in a new migration. Mirrors `set_pull_sheet_override`
(`supabase/migrations/20260706000000_pull_sheet_override.sql:21-93`) with these differences:

- Writes `public.shows.pull_sheet_override` (row located by `drive_file_id`; row must exist and
  be `published = true`, else typed error).
- No wizard-session guard (replaced by the published-row guard).
- Same in-RPC `pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id))` — **single holder is
  the RPC**, the JS route never locks (invariant 2). New topology entry registered in
  `tests/auth/advisoryLockRpcDeadlock.test.ts` (pattern at `tests/auth/advisoryLockRpcDeadlock.test.ts:69-72`).
- Same row-state CAS on the current `shows.pull_sheet_override` `{tabName,fingerprint}` snapshot;
  mismatch → `40001` → route maps to 409 `stale_review` (mirror of `app/api/admin/onboarding/pull-sheet-override/route.ts:64-66`).
- `revoke execute` from `public, anon, authenticated`; grant to `service_role` only.

Override JSON shape identical to the wizard's: `{tabName, fingerprint, acceptedBy, acceptedAt}`
(comment contract at `20260706000000_pull_sheet_override.sql:12`), so the cron reader
(`runScheduledCronSync.ts:684-694`) and drift auto-clear consume it with zero changes.

### 3.3 Race notes (no new race machinery — cite, don't invent)

- Include click vs concurrent cron sync: serialized by the per-show advisory lock (RPC holder) +
  the sync path's own lock; no compound state machine is added. The scan in step 1 happens
  OUTSIDE the lock; staleness between scan and commit is bounded by the CAS (override row) and by
  drift auto-clear on the next sync (fingerprint mismatch → clear + warn). This is the existing
  wizard-era posture (scan → CAS write), not a new design; empirical spike not required.
- Double-click / two admins: second CAS fails 40001 → 409 `stale_review` → UI refreshes.

## 4. Data plumbing (read side)

Published modal needs the real `shows.pull_sheet_override`:

- NO read-side migration: the snapshot RPC already returns the WHOLE shows row via `to_jsonb(s)`
  (`supabase/migrations/20260716120000_admin_show_review_snapshot_rpc.sql:16`), so
  `pull_sheet_override` is already in `snapshot.show`
  (`lib/admin/readShowReviewSnapshot.ts:40`).
- `publishedAdapter` maps it through instead of hard-coding null
  (`components/admin/review/publishedAdapter.ts:82`); `archivedPullSheetTabs` stays `[]` in the
  published payload (the offer is warning-driven, not tab-list-driven — mode boundary §2.1).
- Dev-capture payload picks the field up automatically via the adapter (no capture-schema work).

## 5. Explicitly unchanged

- Wizard Step-3 offer flow, onboarding route, `set_pull_sheet_override` RPC, `pending_syncs.*`
  columns and their comments.
- Cron read + drift auto-clear (`runScheduledCronSync.ts:684-713`).
- Warning production (`lib/sync/pullSheetOverride.ts:229-232`).
- Crew-facing pages: none of this renders outside `/admin`.

## 6. Telemetry & audit (invariant 10)

The new route is an admin mutation surface (admin API tree + `requireAdmin`):

- `AUDITABLE_MUTATIONS` rows for the new file/fn with codes `PULL_SHEET_OVERRIDE_SET` and
  `PULL_SHEET_OVERRIDE_CLEARED` (existing registry pattern for the onboarding route at
  `tests/log/_auditableMutations.ts:324-333`).
- Success-branch behavioral proof in `tests/log/adminOutcomeBehavior.test.ts` (sink-spy on the
  committed-success branch).
- Emits are post-commit, outside the RPC transaction; payload carries `tabName` and
  `fingerprint` prefix only — never sheet contents.

## 7. Failure modes (all user-visible copy via `lib/messages/lookup.ts` — invariant 5)

| Failure | Behavior |
| --- | --- |
| Drive scan fails (network/perm) | 502-family typed result; card shows P-err with existing sync-infra copy; no write. |
| Tab renamed/gone since warning | `no_pull_sheet_region` status; P-err copy "that tab is no longer in the sheet"; no write. Next sync retires the stale warning. |
| CAS conflict | 409 `stale_review`; card refreshes modal data. |
| Override commits, chained sync fails | Override persisted; card shows the sync failure surface already used by Re-sync; next cron pass applies (cron reads the durable override, `runScheduledCronSync.ts:684-694`). Fail-safe direction preserved. |
| Next parse trips MI hold | Held review opens as usual; gear appears once approved (§1.1). |
| Show unpublished/archived between render and click | RPC published-row guard fails → typed error; no write. |

## 8. Copy verification sweep (no planned edits)

Post-implementation, verify against rendered surfaces that these remain/become true:
`lib/messages/catalog.ts:1455` (`userFacing` "include it in review"), `lib/messages/catalog.ts:1459`
(`helpfulContext` "the Gear section on this page offers to include it"), and
`lib/messages/catalog.ts:1463-1464` (`longExplanation` "include it from the review panel"). All three become true on published; wizard already true; held-review
surface carries the §2.2 pointer so no field lies there. Any field found false → §12.4 lockstep
(spec prose + `pnpm gen:spec-codes` + catalog row in one commit). Expected outcome: zero edits.

## 9. Tier × domain matrix (DB-touching completeness)

| Layer | Action |
| --- | --- |
| Table DDL | N/A — no new columns/tables (`shows.pull_sheet_override` exists, `20260706000000_pull_sheet_override.sql:8-9`). |
| CHECKs | N/A — none touched. |
| RPC write | NEW `set_published_pull_sheet_override` (§3.2), new migration (function-only); validation project surgical apply + `pnpm gen:schema-manifest` regen per post-migration checklist. |
| RPC read | N/A — `get_admin_show_review_snapshot` already returns the whole shows row (`to_jsonb(s)`, `supabase/migrations/20260716120000_admin_show_review_snapshot_rpc.sql:16`); adapter-only change (§4). |
| Triggers/cleanup | N/A — none. |
| Frontend | §2 (published Pack list offer; held pointer). |
| Audit/telemetry | §6. |
| Tests | Plan enumerates: RPC lock/CAS/guard tests (db), route tests (scan-at-click, statuses, chained sync), component states P1-P3/busy/err, meta-test registry rows (§10), impeccable dual-gate (UI). |

## 10. Meta-test inventory (declared per writing-plans rule)

- EXTENDS `tests/auth/advisoryLockRpcDeadlock.test.ts` — new RPC lock holder entry.
- EXTENDS `tests/log/_auditableMutations.ts` + `tests/log/adminOutcomeBehavior.test.ts` — new
  admin surface rows + behavioral proof.
- EXTENDS `tests/auth/_metaInfraContract.test.ts` (or the applicable registry) — new Supabase
  call sites in route/read path destructure `{data,error}` and register, or carry
  `// not-subject-to-meta:` with reason.
- `tests/log/_metaMutationSurfaceObservability.test.ts` discovers the new route by filesystem
  walk automatically (fails-by-default until registered) — no action beyond §6 rows.
- PostgREST DML lockdown: `shows` mutation flows through the new RPC; plan verifies existing
  REVOKE posture on `shows` covers direct-table writes (class rule; no new table).

## 11. Out of scope

- Gear preview before include (Option B) — rejected this brainstorm.
- Offer in held-changes review or first-seen staged page (Option C / both-views) — rejected.
- Persisted archived-tab metadata on `shows` — rejected (scan-at-click chosen).
- Any wizard-side refactor of `archivedTabOffer.tsx` beyond exporting reusable pieces.
- Crew-page changes; help-page (`/help/errors`) content changes.
