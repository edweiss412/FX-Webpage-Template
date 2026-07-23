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
| Surface = published normal view ONLY. Held/staged review surfaces get a pointer guidance line (§2.2), NOT the offer. First-seen staged page (`app/admin/show/staged/[stagedId]/page.tsx:5-8`) is out of scope for the offer. | User decision this brainstorm. |
| Fingerprint source = scan-at-click. The include route re-exports the sheet and computes the archived-tab fingerprint fresh; NO new DB column, NO persisted archived-tab list on `shows`. Deliberate difference from the wizard route (which CAS-checks a reviewed `expectedFingerprint`, `app/api/admin/onboarding/pull-sheet-override/route.ts:27-36`): the published flow has no reviewed fingerprint by design; the scan-to-commit content window is covered by the cron reconcile/auto-clear (§3.3), not by a fingerprint CAS. | User decision this brainstorm. |
| Drift semantics unchanged: cron re-reads the durable override under the per-show lock and refuses/auto-clears on mismatch (`lib/sync/runScheduledCronSync.ts:3327-3338` re-read/refusal, `lib/sync/runScheduledCronSync.ts:3340-3350` auto-clear write; forensic emit `lib/sync/runScheduledCronSync.ts:706-713`). This feature only adds a writer for `shows.pull_sheet_override`. | Spec 2026-07-06 (pull-sheet override) §5.2/§5.3; not re-designed here. |
| Include on a show whose next parse is routed to staging by the cron decision (`outcome: "stage"`, `lib/sync/runScheduledCronSync.ts:3439`): gear lands only when that staged parse is applied. Deliberately NOT special-cased. | This spec §7. |
| No preview of gear contents before include. Warning card `rawSnippet` remains the only pre-commit glimpse. Accepted risk; drift auto-clear is the safety net. | User decision (Option A over Option B). |
| Catalog copy for `PULL_SHEET_ON_ARCHIVED_TAB` is NOT reworded — the feature makes the existing sentence true on the published surface. Copy sweep (§8) only VERIFIES; it edits nothing unless a field is found false post-feature. | This brainstorm's origin finding. |
| `KIND_TO_SECTION` is NOT extended: `pull_sheet_archived_tab` stays unmapped (`lib/admin/step3SectionStatus.ts:22`), so the warning card stays in the Parse warnings bucket. The Gear-section offer is a separate consumer of the same active-warning model (§2.1), not a re-bucketing. | This spec; keeps §2.1 "warning card unchanged" true. |

## 2. UX

### 2.1 Published normal view (mode `published`)

The Pack list section (shared section renderer for both modes; callsite
`components/admin/wizard/step3ReviewSections.tsx:4086-4093`, `PackListBreakdown` at
`components/admin/wizard/step3ReviewSections.tsx:2267`) gains the archived-tab offer in
published mode.

**Warning source of truth:** the offer derives from the modal's existing warning model —
`buildSectionWarningModel` (`lib/admin/sectionWarningModel.ts:79`), which the published modal
already builds (`app/admin/_showReviewModal.tsx:328`) and which partitions active vs ignored.
The offer consumes ONLY the **active** partition's records with code
`PULL_SHEET_ON_ARCHIVED_TAB`. Durable Ignore (existing controls:
`components/admin/DataQualityWarningControls.tsx:28`, rendered via
`components/admin/showpage/sectionWarningExtras.tsx:97`) moves the record out of the active
partition, which hides the offer with zero new plumbing. The raw
`internal.parse_warnings` array (`components/admin/review/publishedAdapter.ts:92`) is NOT used
directly.

States (P-states; full transition inventory in §2.4):

- **P1 (nothing):** no active archived-tab warning and no override. Section renders as today.
- **P2 (offer card):** at least one active `PULL_SHEET_ON_ARCHIVED_TAB` record AND
  `pullSheetOverride` is null AND the show is `published && !archived` AND `driveFileId` is
  non-null. Reuses the wizard S2 offer-card visual family (`deriveArchivedOffers`,
  `components/admin/wizard/archivedTabOffer.tsx:23`). Title names the tab from the warning
  `blockRef.name`. Primary action "Include this gear", secondary "Skip" (collapses the card for
  this mount only; the warning card's Ignore remains the durable dismissal).
- **P3 (override-active note):** `pullSheetOverride` is non-null. Copy states intent, not
  completion — "Gear from tab {tab} is included when this show syncs." — with an "Undo" action.
  (The override records desired inclusion; whether the currently published pull sheet was
  produced under it is not knowable from `shows` alone — chained-sync failure and staged-parse
  holds both leave the override set with gear pending. The intent phrasing is truthful in all
  three cases; the pack list rows directly above show what is actually published.)
- **P-busy:** Include or Undo in flight. The originating card's actions disable and a syncing
  line shows; other offer cards stay interactive.
- **P-err:** the originating card shows a typed inline failure line (copy contract §7).

The warning card itself is unchanged on this surface (Report/Ignore stay;
`components/admin/showpage/sectionWarningExtras.tsx:146`).

### 2.2 Held/staged review surfaces (StagedReviewCard)

No offer. `StagedReviewCard` (rendered at `app/admin/show/staged/[stagedId]/page.tsx:280`
first-seen page and `components/admin/ParsePanel.tsx:77`) shows warnings via
`PerShowActionableWarnings` (`components/admin/StagedReviewCard.tsx:521`); that surface has no
Pack list section. Pointer mechanism: `PerShowActionableWarnings` gains an optional
`guidanceOverrides?: Partial<Record<string, string>>` prop (keyed by warning code) that replaces
the catalog `helpfulContext` guidance line for that code on that surface only. `StagedReviewCard`
passes, for `PULL_SHEET_ON_ARCHIVED_TAB`: "We left this tab out of the parse. To include this
gear, finish this review, then use the Gear section on the show page." Plain component copy (not
catalog); catalog untouched. Wizard and published surfaces pass no override and are unchanged
(with the prop absent, behavior is bit-identical — pinned by test). Guard: an override entry
that is empty/whitespace collapses to absent (reuses the `warningCardCopyFields` trim rule,
`components/admin/PerShowActionableWarnings.tsx:40-46`).

### 2.3 Guard conditions

| Input | Case | Renders / behaves |
| --- | --- | --- |
| Active `PULL_SHEET_ON_ARCHIVED_TAB` records | none | No offer (P1 or P3 by override). |
| `blockRef.name` on an active record | null/empty/whitespace | That record produces no offer card (cannot name the tab); others unaffected. |
| `pullSheetOverride` (§4 projection) | null | P2 eligible (subject to remaining P2 conditions). |
| `pullSheetOverride` | non-null | P3, regardless of warning presence. |
| `pullSheetOverride` stored JSON malformed (missing/empty `tabName` or `fingerprint` after projection) | — | Treated as absent (P1/P2 path); legal CAS value (§3.2 projects the same two fields). |
| Show lifecycle | `archived = true` OR `published = false` | No offer, no note actions (P3 note still renders read-only if override set, minus Undo). `archived` and `published` are independent booleans; legacy `archived && published` rows exist (`supabase/migrations/20260602000000_b2_r4_unarchive_held_and_finalize_admin_guard.sql:5-8`). |
| `driveFileId` | null | No offer (route and RPC key on it). |
| Multiple active archived-tab records | >1 | One offer card per distinct trimmed `blockRef.name` (exact string match after trim), deduped, counted AFTER the active-partition filter and the null-name drop; capped at 3; beyond cap, one line: "and N more archived tabs. Resolve these in the sheet." |
| Pull sheet cases | empty + P2 active | Offer replaces the bare empty-state line (mirrors wizard S1-vs-S2 rule at `components/admin/wizard/step3ReviewSections.tsx:2297`). |
| Route body | malformed (missing `driveFileId`, or `tabName` present but not string/null, or malformed `expectedOverrideSnapshot`) | 400 usage error; no write. |
| RPC args | non-null `p_tab_name` with null/empty `p_fingerprint` or `p_accepted_by` | RPC raises (22023-family); route surfaces infra-typed failure. Unreachable via the route (scan supplies fingerprint; identity supplies actor) — belt-and-suspenders. |

### 2.4 Transition inventory

States: P1, P2, P3, P-busy, P-err (5 states, 10 unordered pairs).

| Pair | Treatment |
| --- | --- |
| P1↔P2 | Instant — data-driven mount/unmount (warning becomes active/ignored). |
| P1↔P3 | Instant — override appears/clears via external refresh (another session, auto-clear). |
| P1↔P-busy | Unreachable (busy only originates from P2/P3 actions). |
| P1↔P-err | Unreachable directly; P-err collapses to P1/P2/P3 on refresh. |
| P2↔P3 | Unreachable directly (always via P-busy). |
| P2→P-busy | Include click: instant disable + syncing line. |
| P-busy→P3 | Include success: instant swap on `router.refresh()` landing. |
| P3→P-busy | Undo click: instant disable. |
| P-busy→P2 | Undo success: instant swap on refresh. |
| P-busy→P-err | Failure: instant; error line appears, labeled by origin ("Include failed…" vs "Undo failed…"). |
| P-err→P-busy | Retry click: instant. |
| P-err→P1/P2/P3 | External refresh reconciles to data-derived state; transient error line does not survive refresh (accepted — §7). |
| P2→P1 (Skip) | Instant collapse of that card only. Focus moves to the section wrapper `tabIndex={-1}` fallback (existing pattern, `components/admin/wizard/step3ReviewSections.tsx:2298-2301` comment) so the focus-trapped modal never strands focus on `<body>`. |

Compound transitions:

| Compound | Treatment |
| --- | --- |
| Modal closes mid P-busy | No special handling; request completes server-side; next open reflects DB state. |
| One of several offer cards busy, another clicked | Cards are independent; second click allowed. Server serializes via CAS — the loser gets 409 → its card shows P-err (stale) and refresh reconciles. |
| One card busy, another Skipped | Skip is local collapse; unaffected. |
| Durable Ignore lands (other admin) while Include busy | Include response still applies (server-side); refresh reconciles to P3. |
| Lifecycle change (archive/unpublish) while busy | RPC guard rejects (§3.2) → P-err with typed copy; refresh hides actions per §2.3. |
| Realtime/modal refresh while busy | Busy card keeps local state until its request resolves (existing form-action pattern; same as Re-sync button behavior, `components/admin/ReSyncButton.tsx:269`). |

No `AnimatePresence` usage; all transitions instant.

### 2.5 Dimensional Invariants

N/A: no fixed-dimension parent is introduced. Offer card, override-active note, and guidance
line flow in their sections' normal vertical stacks with intrinsic heights.

## 3. Mutation path

### 3.1 Route

New admin route (new file) at path app/api/admin/show/pull-sheet-override/route.ts, POST only.
Auth: `requireAdminIdentity()` (`lib/auth/requireAdmin.ts:279`, returns `{ email }` canonicalized
at `lib/auth/requireAdmin.ts:208`) — the identity is the actor source for both the RPC
`p_accepted_by` and the audit emit (invariant 3 satisfied at the boundary; no second
canonicalization site).

Body (accept): `{ driveFileId, tabName, expectedOverrideSnapshot }` — no `expectedFingerprint`
(scan-at-click) and no `wizardSessionId` (published scope).
Body (revoke): `{ driveFileId, tabName: null, expectedOverrideSnapshot }`.
`expectedOverrideSnapshot` is `null | { tabName, fingerprint }` (§4 projection — two fields
exactly).

Flow (accept):
1. Fetch current sheet bytes (`fetchCurrentSheetXlsxBytes`, `lib/drive/fetch.ts:536`) and
   re-export via `synthesizeMarkdownFromXlsx` (`lib/drive/exportSheetToMarkdown.ts:301-304`),
   which yields `archivedPullSheetTabs` with per-tab `fingerprint`
   (`lib/drive/exportSheetToMarkdown.ts:332`).
2. Find the archived tab whose `tabName` matches (exact trimmed string). Missing → 422
   `no_pull_sheet_region` (vocabulary + status precedent:
   `app/api/admin/onboarding/pull-sheet-override/route.ts:190`); no write.
3. Call the new RPC (§3.2) with `{tabName, fingerprint}`, actor email, and the CAS snapshot.
4. Emit audit (§6) — after RPC commit, BEFORE the chained sync (ordering precedent: the
   onboarding route emits at `app/api/admin/onboarding/pull-sheet-override/route.ts:242-249`
   after its RPC call at `app/api/admin/onboarding/pull-sheet-override/route.ts:221-234`).
5. Chain the sync: call `runManualSyncForShow(driveFileId, "manual")`
   (`lib/sync/runManualSyncForShow.ts:297`) server-side — sequential, AFTER the RPC transaction
   committed; never nested inside it (single-holder invariant preserved: the RPC holds the lock
   inside its own tx; the sync path acquires it afterwards via its own entry,
   `withPostgresSyncPipelineLock`).
6. Respond (§3.4).

Revoke: skip steps 1-2; RPC with `p_tab_name = null`; then steps 4-6 (audit code
`PULL_SHEET_OVERRIDE_CLEARED`; chained sync so removed gear leaves published rows promptly).

### 3.2 RPC + lock topology

New SECURITY DEFINER function `set_published_pull_sheet_override(p_drive_file_id text,
p_tab_name text, p_fingerprint text, p_accepted_by text, p_expected_override_snapshot jsonb)`
in a new function-only migration. Mirrors `set_pull_sheet_override`
(`supabase/migrations/20260706000000_pull_sheet_override.sql:21-93`) with these differences:

- Targets `public.shows.pull_sheet_override` located by `drive_file_id`. Row guard: row exists
  AND `published = true` AND `archived = false`; else raise typed error (route maps → 409-family
  `lifecycle_conflict`, §3.4).
- No wizard-session guard.
- Same in-RPC `pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id))` — **single holder is
  the RPC**; the JS route never locks (invariant 2). New topology entry registered in
  `tests/auth/advisoryLockRpcDeadlock.test.ts` (pattern at
  `tests/auth/advisoryLockRpcDeadlock.test.ts:69-72`).
- Same two-field CAS projection as the wizard RPC (`v_current_snapshot` built from
  `tabName`/`fingerprint` only, `supabase/migrations/20260706000000_pull_sheet_override.sql:66-67`);
  mismatch → `40001`; route maps to 409 `stale_review` (mapping precedent:
  `app/api/admin/onboarding/pull-sheet-override/route.ts:16-18` and `app/api/admin/onboarding/pull-sheet-override/route.ts:71`).
- Belt-and-suspenders arg guard: accept path (`p_tab_name` non-null) requires non-empty
  `p_fingerprint` and `p_accepted_by`, else raise 22023.
- Grants: `revoke all ... from public, anon, authenticated, service_role;` then
  `grant execute ... to service_role;` (explicit-revoke-then-grant pattern:
  `supabase/migrations/20260716120000_admin_show_review_snapshot_rpc.sql:35-36`).

Override JSON shape identical to the wizard's: `{tabName, fingerprint, acceptedBy, acceptedAt}`
(column contract at `supabase/migrations/20260706000000_pull_sheet_override.sql:12-16`), so the
cron reader and reconcile/auto-clear consume it with zero changes.

### 3.3 Race posture (existing mechanisms, correctly attributed)

- The advisory lock serializes the override WRITE against cron's locked apply window. It does
  NOT serialize the route's pre-lock scan, and is not claimed to.
- Concurrent cron apply vs a just-committed override is handled by cron's existing under-lock
  snapshot re-read/refusal (`lib/sync/runScheduledCronSync.ts:3327-3338`) and the auto-clear
  write (`lib/sync/runScheduledCronSync.ts:3340-3350`).
- Sheet content changing between the route's scan and the RPC commit is NOT bounded by the CAS
  (the CAS guards the override row, not the sheet); it is caught by the next sync's fingerprint
  reconcile → auto-clear + warn. Fail-safe direction: never force-include changed gear.
- Two admins / double-click: second CAS fails `40001` → 409 `stale_review` → UI refreshes.
- No new race machinery is introduced; all four mechanisms above are shipped code.

### 3.4 Response contract

| Case | HTTP | Body |
| --- | --- | --- |
| Accept success, chained sync applied | 200 | `{ ok: true, status: "override_set", sync: { ok: true, outcome } }` |
| Accept success, chained sync failed/held/busy | 200 | `{ ok: true, status: "override_set", sync: { ok: false, code } }` — override IS committed; UI copy §7. |
| Revoke success (both sync sub-cases as above) | 200 | `{ ok: true, status: "override_cleared", sync: {...} }` |
| CAS conflict | 409 | `{ ok: false, status: "stale_review" }` |
| Tab not found in scan | 422 | `{ ok: false, status: "no_pull_sheet_region" }` |
| Lifecycle guard (unpublished/archived/row missing) | 409 | `{ ok: false, status: "lifecycle_conflict" }` |
| Scan/Drive failure, RPC transport/unknown error, null RPC payload | 502 | `{ ok: false, status: "sync_infra" }` |
| Malformed body | 400 | `{ ok: false, status: "bad_request" }` |

Status vocabulary extends the onboarding route's (`override_set | override_cleared |
stale_review | no_pull_sheet_region` at
`app/api/admin/onboarding/pull-sheet-override/route.ts:71`, `app/api/admin/onboarding/pull-sheet-override/route.ts:79`, `app/api/admin/onboarding/pull-sheet-override/route.ts:190`, `app/api/admin/onboarding/pull-sheet-override/route.ts:259`) with
`lifecycle_conflict`, `sync_infra`, `bad_request`; `stale_review_refresh_failed` (`app/api/admin/onboarding/pull-sheet-override/route.ts:79`) is not
used (no server-side refresh step in this route).

## 4. Data plumbing (read side)

- NO read-side migration: the snapshot RPC already returns the whole shows row via `to_jsonb(s)`
  (`supabase/migrations/20260716120000_admin_show_review_snapshot_rpc.sql:16`), so
  `pull_sheet_override` is already in `snapshot.show` consumed by
  `readShowReviewSnapshot` (`lib/admin/readShowReviewSnapshot.ts:40`).
- **Projection contract:** `publishedAdapter` maps the stored object to the two-field
  `OverrideSnapshot` (`{ tabName, fingerprint } | null`, type at
  `lib/sync/pullSheetOverride.ts:22`) — `acceptedBy`/`acceptedAt` are DROPPED at the adapter
  (`components/admin/review/publishedAdapter.ts:82` replaces its hard-coded null). The UI sends
  this projection back verbatim as `expectedOverrideSnapshot`, and the RPC projects the stored
  row with the same two fields (§3.2) — so CAS equality is two-field-to-two-field by
  construction. Missing/empty projected fields → treated as absent (§2.3).
- `archivedPullSheetTabs` stays `[]` in the published payload (the offer is warning-driven, not
  tab-list-driven — §2.1); `components/admin/review/publishedAdapter.ts:81` unchanged.

## 5. Explicitly unchanged

- Wizard Step-3 offer flow, onboarding route + its RPC, `pending_syncs.*` columns/comments
  (`supabase/migrations/20260706000000_pull_sheet_override.sql:4-7`).
- Cron read + reconcile/auto-clear (`lib/sync/runScheduledCronSync.ts:3327-3350`).
- Warning production (`lib/sync/pullSheetOverride.ts:126` blockRef kind; `lib/sync/pullSheetOverride.ts:229-232` attach+warn).
- `KIND_TO_SECTION` (`lib/admin/step3SectionStatus.ts:22`) — §1.1.
- `PerShowActionableWarnings` with `guidanceOverrides` absent — bit-identical, pinned by test.
- Crew-facing pages: none of this renders outside `/admin`.

## 6. Telemetry & audit (invariant 10)

The new route is an admin mutation surface (admin API tree):

- `AUDITABLE_MUTATIONS` rows for the new file/`POST` with codes `PULL_SHEET_OVERRIDE_SET` and
  `PULL_SHEET_OVERRIDE_CLEARED` (registry precedent for the onboarding route:
  `tests/log/_auditableMutations.ts:324-333`).
- Emit ordering: after RPC commit, before the chained sync (§3.1 step 4). A failing chained
  sync therefore cannot suppress the audit record.
- Audit-sink failure is best-effort: it never blocks or changes the HTTP response (mirrors the
  onboarding route posture at `app/api/admin/onboarding/pull-sheet-override/route.ts:242-249`).
- Success-branch behavioral proof in `tests/log/adminOutcomeBehavior.test.ts` (sink-spy via
  `setLogSink`, existing mechanism) covering BOTH the sync-ok and sync-failed sub-branches of
  `override_set` (the partial-success branch is explicitly in the test inventory).
- Payload: `tabName` and a fingerprint prefix only — never sheet contents, never the full
  fingerprint (token-redaction discipline).

## 7. Failure surfacing (UI copy contract)

Copy precedent: the wizard offer card surfaces route failures as inline component copy
(`components/admin/wizard/archivedTabOffer.tsx:74-75`, `ARCHIVED_TAB_ERROR`), NOT via §12.4
catalog codes — statuses are not error codes and no raw status token reaches the DOM (invariant
5 rendering contract). The published card follows the same pattern:

| Status | Inline copy (component-level, exact) |
| --- | --- |
| `stale_review` | "This changed elsewhere. Refreshing the page picks up the latest state." |
| `no_pull_sheet_region` | "That tab is no longer in the sheet. Re-check the sheet, then try again." |
| `lifecycle_conflict` | "This show is no longer editable here. Refresh to see its current state." |
| `sync_infra` / network / thrown | "Something went wrong on our side. Try again in a moment." |
| `override_set` with `sync.ok: false` | "Saved. The sync did not finish, so gear appears after the next sync, or use Re-sync." |
| `override_cleared` with `sync.ok: false` | "Undone. The sync did not finish, so the change shows after the next sync, or use Re-sync." |

Behavior notes:

- Partial success (`override_set`/`override_cleared` with `sync.ok` false) resolves P-busy into the
  data-derived state (P3 or P2 after refresh) with the transient line above; the line does not
  survive a refresh (accepted; the durable state is visible in the card itself).
- MI-hold routing (`sync.ok` true with outcome "stage"): same partial-success line variant: "Saved.
  This change is held for review, so gear appears after that review is applied."
- Show unpublished/archived between render and click → `lifecycle_conflict` row above.

## 8. Copy verification sweep (no planned edits)

Post-implementation, verify against rendered surfaces that these remain/become true:
`lib/messages/catalog.ts:1454-1455` (`dougFacing` "include it in review"),
`lib/messages/catalog.ts:1459` (`helpfulContext` "the Gear section on this page offers to
include it"), and `lib/messages/catalog.ts:1463-1464` (`longExplanation` "include it from the
review panel"). All three become true on published; wizard already true; StagedReviewCard
surfaces carry the §2.2 guidance override so no field lies there. Any field found false →
§12.4 lockstep (spec prose + `pnpm gen:spec-codes` + catalog row in one commit). Expected
outcome: zero edits.

## 9. Completeness matrix (role/lifecycle × layer)

Roles: `anon`/`authenticated` (non-admin), admin session, `service_role`.
Lifecycles: published-normal, archived, unpublished, held-live-staged, wizard, first-seen, cron.

| Domain/tier | UI render | Route | RPC | Chained sync | Adapter read | Audit | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Published-normal + admin | §2.1 offer/note | Accept+revoke flows | Guard passes | `runManualSyncForShow` | §4 projection | §6 | Route+RPC+component+behavioral |
| Archived show | No offer; P3 read-only (§2.3) | N/A (UI hides) | Guard rejects → `lifecycle_conflict` | Not reached | Projection still mapped | No emit (no commit) | RPC guard test (archived && published legacy row) |
| Unpublished show | Modal is published-mode only; N/A | Reachable by hand → guard rejects | Guard rejects | Not reached | N/A | No emit | RPC guard test |
| Held-live-staged | §2.2 pointer only | N/A | N/A | N/A | N/A | N/A | `guidanceOverrides` render test |
| Wizard | Unchanged (§5) | Onboarding route untouched | Wizard RPC untouched | N/A | N/A | Existing rows | Existing suites must stay green |
| First-seen page | §2.2 pointer only | N/A | N/A | N/A | N/A | N/A | Covered by `guidanceOverrides` test |
| Cron | N/A | N/A | Reconcile/auto-clear unchanged | Unchanged | N/A | Existing forensic emit | Existing cron suites stay green |
| `anon`/`authenticated` direct | N/A | 401/403 via `requireAdminIdentity` | EXECUTE revoked (§3.2 grants) | N/A | Snapshot RPC already `is_admin()`-gated | N/A | Grant posture test (mirrors wizard RPC's) |
| `service_role` direct RPC | N/A | N/A | In-RPC lock + guards still apply | N/A | N/A | N/A | RPC tests run as service role |

## 10. Meta-test / structural-defense inventory

- EXTENDS `tests/auth/advisoryLockRpcDeadlock.test.ts` — new RPC lock-holder entry (§3.2).
- EXTENDS `tests/log/_auditableMutations.ts` + `tests/log/adminOutcomeBehavior.test.ts` — new
  admin surface rows + behavioral proof incl. partial-success branch (§6).
- `tests/log/_metaMutationSurfaceObservability.test.ts` discovers the new route by filesystem
  walk automatically (fails-by-default until registered) — closed by the §6 rows.
- `tests/auth/_metaInfraContract.test.ts` — N/A for the route: that registry's scope is the
  auth helpers (`tests/auth/_metaInfraContract.test.ts:69-78`), and the onboarding
  pull-sheet-override route carries no registry row either (verified: zero
  `not-subject-to-meta`/registry references in that file). The route's Supabase calls follow
  invariant-9 destructuring (`{ data, error }`, precedent
  `app/api/admin/onboarding/pull-sheet-override/route.ts:221-234`) and every §3.4 non-200 path
  is a discriminable typed result — enforced by the route's own tests, which assert each row of
  the §3.4 table including: service-client construction failure, RPC thrown transport error,
  RPC returned non-40001 error, null/unexpected RPC payload, chained-sync thrown vs typed
  failure, audit-sink failure (response unaffected).
- PostgREST DML lockdown: no new table; `shows` write flows through the new RPC. Plan includes a
  verification step that direct `shows` DML remains revoked for `authenticated`/`anon`
  (class rule `BL-ADMIN-POSTGREST-DML-LOCKDOWN` posture unchanged by this feature).

## 11. Out of scope

- Gear preview before include (Option B) — rejected this brainstorm.
- Offer on StagedReviewCard surfaces or the first-seen page (they get the §2.2 guidance
  override only) — rejected ("both views" option).
- Persisted archived-tab metadata on `shows` — rejected (scan-at-click chosen).
- An "applied vs pending" indicator beyond the §2.1 P3 intent phrasing (would require a durable
  applied-snapshot column — new schema, rejected with the previous line).
- `KIND_TO_SECTION` remap (§1.1).
- Any wizard-side refactor of `archivedTabOffer.tsx` beyond exporting reusable pieces.
- Crew-page changes; help-page (`/help/errors`) content changes; dev-capture schema changes.
