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
| Surface = published normal view ONLY. Held/staged review surfaces get NO change (the warning never renders there, §2.2). First-seen staged page (`app/admin/show/staged/[stagedId]/page.tsx:5-8`) is out of scope. | User decision this brainstorm; §2.2 filter fact. |
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
partition, which hides the offer without touching the warning card itself. Concrete plumbing
(new, named): `_showReviewModal` computes `activeArchivedTabNames: string[]` from the model's
active records for this code (raw `blockRef.name` values, blanks dropped, exact-string deduped)
— WITHOUT reordering the existing derivation. Live order is adapter-then-model
(`publishedData` built at `app/admin/_showReviewModal.tsx:286`; `renderedSectionIds(publishedData)`
feeds `buildSectionWarningModel` at `app/admin/_showReviewModal.tsx:327-333`), and the offer
names come from the model — a cycle if forced into one pass. Resolution: POST-AUGMENTATION.
The adapter itself computes only the snapshot-derived field
`PublishedSectionData.pullSheetOverrideWire` (§4). After the model exists, the modal computes
`activeArchivedTabNames` and attaches the offer by shallow spread:
`const dataForSurface = { ...publishedData, archivedTabOffer }` — the type declares
`archivedTabOffer: { tabNames: string[]; slug: string } | null` (adapter always emits `null`;
the modal is the sole attach site, documented on the field). Guards for the attach: null
unless `published && !archived && driveFileId != null && tabNames.length > 0`. The shared
strict `SectionCore.pullSheetOverride: OverrideSnapshot`
(`components/admin/review/sectionData.ts:25`) stays null and untouched — wizard machinery
keeps its exact type. The Pack-list render
callsite (`components/admin/wizard/step3ReviewSections.tsx:4086-4093`) forwards both to
`PackListBreakdown` via one new optional prop:
`publishedGear?: { offer: { tabNames: string[]; slug: string } | null; wire: PullSheetOverrideWire; slug: string; driveFileId: string | null }`
— present only in published mode; its presence (not `wizardSessionId` absence) gates the
published card rendering, and the P3 note + Undo read `wire` exclusively. The raw `internal.parse_warnings` array
(`components/admin/review/publishedAdapter.ts:92`) is NOT used directly.

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

### 2.2 Held/staged review surfaces (StagedReviewCard) — no change

`StagedReviewCard` surfaces (first-seen page `app/admin/show/staged/[stagedId]/page.tsx:280`,
`components/admin/ParsePanel.tsx:77`) never display this warning: their items are prefiltered
through `selectActionableForDisplay` / `OPERATOR_ACTIONABLE_ANCHORED`
(`lib/parser/dataGaps.ts:370`), which does not include `PULL_SHEET_ON_ARCHIVED_TAB` (first-seen
mapper at `app/admin/show/staged/[stagedId]/page.tsx:204`; `ParsePanel` forwards the prefiltered
`StagedRow.operatorActionable`). A surface that never renders the warning cannot render its
copy, so no pointer, no new prop, and no component change is needed there. A test pins the
filter fact (the code is absent from `OPERATOR_ACTIONABLE_ANCHORED`) so a future filter change
resurfaces this decision.

### 2.3 Guard conditions

| Input | Case | Renders / behaves |
| --- | --- | --- |
| Active `PULL_SHEET_ON_ARCHIVED_TAB` records | none | No offer (P1 or P3 by override). |
| `blockRef.name` on an active record | null/empty/whitespace | That record produces no offer card (cannot name the tab); others unaffected. |
| `pullSheetOverride` (§4 projection) | null | P2 eligible (subject to remaining P2 conditions). |
| `pullSheetOverride` | non-null | P3, regardless of warning presence. |
| `pullSheetOverride` stored non-null JSON with missing/null/empty/non-string fields | — | P3-degraded: note renders (generic label "an archived tab" when `tabName` unusable) with a working Undo. Well-formed rows CAS structurally; malformed rows revoke via the §3.2 carve-out. Never collapsed to absent. |
| Show lifecycle | `archived = true` OR `published = false` | No offer, no note actions (P3 note still renders read-only if override set, minus Undo). `archived` and `published` are independent booleans; legacy `archived && published` rows exist (`supabase/migrations/20260602000000_b2_r4_unarchive_held_and_finalize_admin_guard.sql:5-8`). |
| `driveFileId` | null | No offer AND the P3 note renders read-only (no Undo — the route body requires `driveFileId`, so the action is removed exactly like the lifecycle-disabled rows). |
| Multiple active archived-tab records | >1 | One offer card per distinct RAW `blockRef.name` (exact string identity; NO trimming anywhere on the wire — the name originated from the exporter's exact sheet name, `lib/drive/exportSheetToMarkdown.ts:331`, and reconcile also matches exactly), deduped, counted AFTER the active-partition filter and the blank-name drop; capped at 3; beyond cap, one line: "and N more archived tabs. Resolve these in the sheet." Display may trim for layout; the posted value is always raw. |
| Pull sheet cases | empty + P2 active | Offer replaces the bare empty-state line (mirrors wizard S1-vs-S2 rule at `components/admin/wizard/step3ReviewSections.tsx:2297`). |
| Route body: `driveFileId` | absent, non-string, empty, or whitespace-only | 400 `bad_request`; no write. |
| Route body: `tabName` | absent (key missing), non-string-non-null, empty, or whitespace-only string | 400 `bad_request`. Revoke is the EXPLICIT `tabName: null`. |
| Route body: `expectedOverrideSnapshot` | absent, scalar, array, extra keys, missing keys, or keys with non-string-non-null values | 400 `bad_request`. Legal shapes: `null`, or exactly `{ tabName: string|null, fingerprint: string|null }` (nulls legal — §4 projection round-trip). |
| RPC direct: `p_drive_file_id` | null or empty | raises 22023. |
| RPC direct: `p_tab_name` | whitespace-only or edge-whitespace string | stored VERBATIM (identity is exact; no trim). |
| RPC direct: `p_expected_override_snapshot` | any jsonb | structural `IS DISTINCT FROM` against the single-arrow projection (well-formed rows); malformed stored rows: revoke skips CAS, accept raises 40001 (§3.2). |
| RPC direct: accept with null/empty `p_fingerprint` or `p_accepted_by` | — | raises 22023. Unreachable via the route — belt-and-suspenders. |

### 2.4 Transition inventory

States: P1, P2, P3, P-busy, P-err (5 states, 10 unordered pairs — one row each; direction
noted per cell). All transitions instant; no `AnimatePresence`.

| Pair | Reachable directions + treatment |
| --- | --- |
| P1↔P2 | Both ways, data-driven: warning becomes active/ignored on refresh. Instant mount/unmount. Skip is a local P2→P1 collapse of that card only; focus moves to the section wrapper `tabIndex={-1}` fallback (`components/admin/wizard/step3ReviewSections.tsx:2298-2301` comment). |
| P1↔P3 | Both ways, data-driven via external refresh (another session's include, cron auto-clear). Instant swap. |
| P1↔P-busy | P-busy→P1 only (Undo resolves and the refreshed data carries no active warning, §7). P1→P-busy unreachable (no action exists in P1). Instant swap on refresh landing. |
| P1↔P-err | Neither direction as a direct action edge; P-err clears to the data-derived state (which may be P1) via the §7 refresh semantics. Instant. |
| P2↔P3 | Unreachable directly — always via P-busy. |
| P2↔P-busy | P2→P-busy on Include click (own card disables, syncing line). P-busy→P2 on: Undo success (offer re-derives), OR Include-then-drift (chained sync auto-cleared; warning re-raised). Instant. |
| P2↔P-err | P-busy is always interposed on the way in (P2→P-busy→P-err); P-err→P2 via §7 refresh semantics when the refreshed data still derives P2. Instant. |
| P3↔P-busy | P3→P-busy on Undo click. P-busy→P3 on Include success. Instant. |
| P3↔P-err | Via P-busy on the way in (P3→P-busy→P-err on failed Undo); P-err→P3 via refresh when override still set (e.g. failed revoke). Instant. |
| P-busy↔P-err | P-busy→P-err on any non-200 or classifier-generic failure, line labeled by origin ("Include failed…" vs "Undo failed…"). P-err→P-busy on retry click. Instant. |

P-err lifetime (single rule, referenced above): every P-err render also triggers exactly one
automatic `router.refresh()` when the response was 409 `stale_review` (mirroring the wizard's
refresh-on-409, `components/admin/wizard/archivedTabOffer.tsx:67`); all other P-err variants
wait for user retry or external refresh. When refreshed data re-renders the section, the
resulting state is purely data-derived (P1/P2/P3); an error line lives in the card instance's
client state and does not outlive its unmount.

Compound transitions:

| Compound | Treatment |
| --- | --- |
| Modal closes mid P-busy | No client handling. Server-side fact (not a lifecycle claim): the route handler runs to completion independent of the client connection, so the RPC/audit/sync all finish; next open reflects DB state. |
| One of several offer cards busy, another clicked | Cards are independent; second click allowed. Server serializes via CAS — the loser gets 409 → its card shows P-err (stale) and refresh reconciles. |
| One card busy, another Skipped | Skip is local collapse; unaffected. |
| Durable Ignore lands (other admin) while Include busy | Include response still applies (server-side); refresh reconciles to P3. |
| Lifecycle change (archive/unpublish) while busy, pre-RPC-commit | RPC guard rejects (§3.2) → P-err with typed copy; refresh hides actions per §2.3. Post-commit window: see row below. |
| Realtime/modal refresh while busy | NO survival guarantee is claimed or needed: if the card instance survives, it resolves normally; if the refresh remounts it, the in-flight request still completes server-side and the remounted card renders the data-derived state (busy/error lines are instance-local and disposable). No behavior in this spec depends on client state surviving a refresh, so no lifecycle probe is required (empirical-spike rule satisfied by descope). |
| Include succeeds but sheet drifted; chained sync auto-clears the override | Refresh lands in P2 (offer again) with the drift warning re-raised by cron — data-derived, no special client handling. |
| Undo succeeds; current published parse carried no archived-tab warning | Refresh lands in P1 (no active warning) or P2 (warning re-raised by the chained sync) — both legal data-derived endpoints. |
| Archive/unpublish AFTER RPC commit, before/during chained sync | Override is committed; sync path applies its own gates. Card resolves per §3.4 `sync` sub-object; refresh then hides actions per §2.3 lifecycle row. (§2.3's RPC rejection covers only the pre-commit window.) |

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
2. Find the archived tab whose `tabName` EXACTLY equals the requested raw string (no trim;
   identity per §2.3). Missing → 422
   `no_pull_sheet_region` (vocabulary + status precedent:
   `app/api/admin/onboarding/pull-sheet-override/route.ts:190`); no write.
3. Call the new RPC (§3.2) with the SCAN RESULT's exact `tab.tabName` + `tab.fingerprint`,
   actor email, and the CAS snapshot (stored value = scan value, byte-identical to what the
   exporter and reconcile compare against).
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

- Targets `public.shows.pull_sheet_override` located by `drive_file_id`. Row guard: missing row
  raises `P0002`; a row with `published <> true OR archived <> false` raises SQLSTATE `55000`
  (object_not_in_prerequisite_state). The route maps BOTH `P0002` and `55000` → 409
  `lifecycle_conflict` (§3.4); `40001` → 409 `stale_review`; `22023` and every other RPC error →
  502 `sync_infra`. These four SQLSTATEs are the complete, executable discriminant set.
- No wizard-session guard.
- Same in-RPC `pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id))` — **single holder is
  the RPC**; the JS route never locks (invariant 2). New topology entry registered in
  `tests/auth/advisoryLockRpcDeadlock.test.ts` (pattern at
  `tests/auth/advisoryLockRpcDeadlock.test.ts:69-72`).
- CAS is STRUCTURAL and database-owned (supersedes the wizard's `->>` text projection to close
  the malformed-value class): `v_current_snapshot := jsonb_build_object('tabName',
  v_current->'tabName', 'fingerprint', v_current->'fingerprint')` — single-arrow `->` keeps
  jsonb values as jsonb, so comparison via `IS DISTINCT FROM` is structural (no text
  canonicalization, no numeric-scale loss). Well-formedness: a stored row is well-formed when
  each of the two fields is absent, JSON null, or a JSON string. For well-formed rows the CAS
  compares against `p_expected_override_snapshot` (client sends `{tabName: string|null,
  fingerprint: string|null}`; absent stored key and JSON null both project to JSON null, so the
  round trip matches). For a MALFORMED stored row (either field a number/boolean/object/array),
  the client cannot faithfully represent the value; the RPC therefore SKIPS the CAS for the
  REVOKE path only (`p_tab_name IS NULL`) — the sole possible transition for such a row is to
  null, the advisory lock still serializes writers, and a concurrent double-revoke is
  idempotent. An ACCEPT over a malformed row is impossible by construction (P2 requires
  override null) and the RPC rejects it with `40001` as a belt-and-suspenders. Mismatch →
  `40001`; route maps to 409 `stale_review` (mapping precedent:
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
- Two admins / double-click: second CAS fails `40001` → 409 `stale_review` → the losing card shows the §7 stale line and auto-triggers one `router.refresh()` (§2.4 P-err lifetime rule).
- No new race machinery is introduced; all four mechanisms above are shipped code.

### 3.4 Response contract

The `sync` sub-object is a TOTAL classifier over `runManualSyncForShow`'s result space
(`ManualSyncResult` = `ProcessOneFileResult` | finalize-owned | archived-immutable,
`lib/sync/runManualSyncForShow.ts:42-45`, plus `ConcurrentSyncSkipped`, plus thrown):

- `outcome === "applied"` → `{ ok: true, kind: "applied" }`.
- Any other `ProcessOneFileResult` → `{ ok: false, kind: result.outcome }` (`stage`,
  `shrink_held`, `skipped`, `asset_recovery`, `hard_fail`, `stale`, `revision_race`,
  `revision_race_cooldown`, `source_gone`, `parse_error` — the full `outcome` union at
  `lib/sync/runScheduledCronSync.ts:383-435`).
- Finalize-owned result → `{ ok: false, kind: "finalize_owned" }`; archived-immutable →
  `{ ok: false, kind: "archived_immutable" }`; `ConcurrentSyncSkipped` →
  `{ ok: false, kind: "concurrent_skip" }`; thrown → `{ ok: false, kind: "threw" }`.
- `kind` is a machine token for tests/telemetry only; it NEVER reaches the DOM (§7 maps kinds
  to copy). Wire note: "held for review" (`kind: "stage"`) is `ok: false` on the wire — §7's
  held copy is a presentation of that same `ok: false` value (no contradiction).

| Case | HTTP | Body |
| --- | --- | --- |
| Accept success, sync applied | 200 | `{ ok: true, status: "override_set", sync: { ok: true, kind: "applied" } }` |
| Accept success, sync anything else | 200 | `{ ok: true, status: "override_set", sync: { ok: false, kind } }` — override IS committed; UI copy §7. |
| Revoke success (same two sync sub-cases) | 200 | `{ ok: true, status: "override_cleared", sync: {...} }` |
| CAS conflict | 409 | `{ ok: false, status: "stale_review" }` |
| Tab not found in scan | 422 | `{ ok: false, status: "no_pull_sheet_region" }` |
| Lifecycle guard (`55000` or `P0002`: unpublished/archived/row missing) | 409 | `{ ok: false, status: "lifecycle_conflict" }` |
| Scan/Drive failure, RPC transport/unknown/`22023` error, null RPC payload | 502 | `{ ok: false, status: "sync_infra" }` |
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
- **Projection contract:** `publishedAdapter` maps the stored value to
  `pullSheetOverrideWire: null | { tabName: string | null, fingerprint: string | null }`:
  stored null → null; stored non-null → per field: absent or JSON null → null; JSON string →
  verbatim (no trim, no empty-collapse); any NON-STRING value (number/boolean/object/array) →
  null (the client never attempts to reproduce jsonb text — representation stays
  database-owned, and the RPC's malformed-row revoke carve-out (§3.2) makes the null-bearing
  round trip safe). `acceptedBy`/`acceptedAt` dropped
  (`components/admin/review/publishedAdapter.ts:82` replaces its hard-coded null). This matches
  the RPC's structural CAS (§3.2) for every well-formed value, and malformed rows
  (`{tabName:123,fingerprint:false}` and kin) are covered by the §3.2 revoke carve-out — so
  every stored value has a working Undo, with zero client-side jsonb-text emulation (the
  adapter's generic `str()` helper at `components/admin/review/publishedAdapter.ts:241` is NOT
  used for these fields). Malformed rows therefore render P3-degraded with a
  working Undo (§2.3), never a stuck 40001. The strict two-string `OverrideSnapshot` type
  (`lib/sync/pullSheetOverride.ts:22`) is not reused for this wire field; the published variant
  carries the null-tolerant shape.
- `archivedPullSheetTabs` stays `[]` in the published payload (the offer is warning-driven, not
  tab-list-driven — §2.1); `components/admin/review/publishedAdapter.ts:81` unchanged.

## 5. Explicitly unchanged

- Wizard Step-3 offer flow, onboarding route + its RPC, `pending_syncs.*` columns/comments
  (`supabase/migrations/20260706000000_pull_sheet_override.sql:4-7`).
- Cron read + reconcile/auto-clear (`lib/sync/runScheduledCronSync.ts:3327-3350`).
- Warning production (`lib/sync/pullSheetOverride.ts:126` blockRef kind; `lib/sync/pullSheetOverride.ts:229-232` attach+warn).
- `KIND_TO_SECTION` (`lib/admin/step3SectionStatus.ts:22`) — §1.1.
- `PerShowActionableWarnings` — fully unchanged (§2.2: no pointer feature).
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
  `setLogSink`, per-tuple completeness at `tests/log/adminOutcomeBehavior.test.ts:4462`) for
  BOTH codes × BOTH sync sub-branches: `PULL_SHEET_OVERRIDE_SET` (sync-ok, sync-failed) AND
  `PULL_SHEET_OVERRIDE_CLEARED` (sync-ok, sync-failed) — four cases, each asserting the sink
  recorded the code before the chained sync ran (ordering guarantee is executable for both
  mutations).
- Payload: `tabName` and a fingerprint prefix only — never sheet contents, never the full
  fingerprint (token-redaction discipline).

## 7. Failure surfacing (UI copy contract)

Copy precedent: the wizard offer card surfaces route failures as inline component copy
(`components/admin/wizard/archivedTabOffer.tsx:74-75`, `ARCHIVED_TAB_ERROR`), NOT via §12.4
catalog codes — statuses are not error codes and no raw status token reaches the DOM (invariant
5 rendering contract). The published card follows the same pattern:

| Status | Inline copy (component-level, exact) |
| --- | --- |
| `stale_review` | "This changed elsewhere. Refreshing to the latest state." (The card ALSO auto-triggers exactly one `router.refresh()` — §2.4 P-err lifetime rule; no user action required.) |
| `no_pull_sheet_region` | "That tab is no longer in the sheet. Re-check the sheet, then try again." |
| `lifecycle_conflict` | "This show is no longer editable here. Refresh to see its current state." |
| `sync_infra` / `bad_request` / 401 / 403 / non-JSON body / unrecognized status / network / thrown | "Something went wrong on our side. Try again in a moment." (TOTAL generic bucket: any response not matching another row lands here; no status token, HTTP code, or raw error ever reaches the DOM.) |
| `override_set`, `sync.kind: "stage"` | "Saved. This change is held for review, so gear appears after that review is applied." |
| `override_cleared`, `sync.kind: "stage"` | "Undone. This change is held for review, so it shows after that review is applied." |
| `override_set`, any other `sync.ok: false` kind | "Saved. The sync did not finish, so gear appears after the next sync, or use Re-sync." |
| `override_cleared`, any other `sync.ok: false` kind | "Undone. The sync did not finish, so the change shows after the next sync, or use Re-sync." |

Behavior notes:

- Partial-success line lifetime: the line lives in the originating card's client state. The
  card also calls `router.refresh()`; the refreshed server data re-derives P1/P2/P3 underneath.
  If the card instance survives the refresh it keeps showing the line until unmount; if the
  data change unmounts/remounts it, the line is gone. Both are accepted — the durable state is
  what the section then shows. (Undo may land in P1 OR P2 — §2.4 compound rows.)
- Show unpublished/archived between render and click → `lifecycle_conflict` row above.

## 8. Copy verification sweep (no planned edits)

Fields: `lib/messages/catalog.ts:1454-1455` (`dougFacing` "include it in review"),
`lib/messages/catalog.ts:1459` (`helpfulContext` "the Gear section on this page offers to
include it"), `lib/messages/catalog.ts:1463-1464` (`longExplanation` "include it from the
review panel"). Truth after this feature, per surface/sub-state:

| Surface / sub-state | Sentence true? | Disposition |
| --- | --- | --- |
| Wizard Step 3 | Yes (offer exists today) | — |
| Published P2 | Yes (this feature) | — |
| StagedReviewCard surfaces | N/A — warning never renders (§2.2) | — |
| Published, warning in the Ignored disclosure (`components/admin/showpage/sectionWarningExtras.tsx:241`) | No — offer hidden while the ignored card still shows guidance | Accepted residual: operator explicitly ignored it; un-ignoring restores P2. |
| Published P3 with a still-active warning (failed/staged sync) | Degraded — offer replaced by the P3 note + Undo | Accepted residual: the Gear section still carries the actionable control. |
| Archived / unpublished / null `driveFileId` with active warning | No — no offer by guard | Accepted residual: low-traffic degraded states; catalog reword is ratified out (§1.1). |

The catalog stays untouched (§1.1); the residual rows above are RECORDED as accepted
known-imperfect renders, not claimed true. Any future decision to reword goes through §12.4
lockstep (spec prose + `pnpm gen:spec-codes` + catalog row in one commit).

## 9. Completeness matrix (role/lifecycle × layer)

Roles: `anon`/`authenticated` (non-admin), admin session, `service_role`.
Lifecycles: published-normal, archived, unpublished, held-live-staged, wizard, first-seen, cron.

| Domain/tier | UI render | Route | RPC | Chained sync | Adapter read | Audit | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Published-normal + admin | §2.1 offer/note | Accept+revoke flows | Guard passes | `runManualSyncForShow` | §4 projection | §6 | Route+RPC+component+behavioral |
| Archived show | No offer; P3 read-only (§2.3) | N/A (UI hides) | Guard rejects → `lifecycle_conflict` | Not reached | Projection still mapped | No emit (no commit) | RPC guard test (archived && published legacy row) |
| Unpublished show | Modal is published-mode only; N/A | Reachable by hand → guard rejects | Guard rejects | Not reached | N/A | No emit | RPC guard test |
| Held-live-staged | No change — warning filtered out (§2.2) | N/A | N/A | N/A | N/A | N/A | Filter-fact pin test (§2.2) |
| Wizard | Unchanged (§5) | Onboarding route untouched | Wizard RPC untouched | N/A | N/A | Existing rows | Existing suites must stay green |
| First-seen page | No change — warning filtered out (§2.2) | N/A | N/A | N/A | N/A | N/A | Covered by the same filter-fact pin |
| Cron | N/A | N/A | Reconcile/auto-clear unchanged | Unchanged | N/A | Existing forensic emit | Existing cron suites stay green |
| `anon`/`authenticated` direct | N/A | 401/403 via `requireAdminIdentity` | EXECUTE revoked (§3.2 grants) | N/A | Snapshot RPC already `is_admin()`-gated | N/A | Grant posture test (mirrors wizard RPC's) |
| `service_role` direct RPC | N/A | N/A | In-RPC lock + guards still apply | N/A | N/A | N/A | RPC tests run as service role |

## 10. Meta-test / structural-defense inventory

- EXTENDS `tests/auth/advisoryLockRpcDeadlock.test.ts` — new RPC lock-holder entry (§3.2).
- EXTENDS `tests/sync/_advisoryLockSingleHolderContract.test.ts` — BOTH the new RPC holder row
  in its hard-coded holder registry (`tests/sync/_advisoryLockSingleHolderContract.test.ts:127`)
  AND a route-specific negative check that the new JS route never locks (pattern at
  `tests/sync/_advisoryLockSingleHolderContract.test.ts:611`).
- EXTENDS `tests/log/_auditableMutations.ts` + `tests/log/adminOutcomeBehavior.test.ts` — new
  admin surface rows + behavioral proof incl. partial-success branch (§6).
- `tests/log/_metaMutationSurfaceObservability.test.ts` discovers the new route by filesystem
  walk automatically (fails-by-default until registered) — closed by the §6 rows.
- Invariant-9 registration: the new route's RPC callsite carries the inline annotation
  `// not-subject-to-meta: auth-helper registry scope does not cover API routes
  (tests/auth/_metaInfraContract.test.ts:69-78); this route's typed-result tests assert every
  §3.4 row (precedent: app/api/admin/onboarding/pull-sheet-override/route.ts, which carries no
  registry row)`. The calls destructure `{ data, error }` and every §3.4 non-200 path is a
  discriminable typed result — the route's tests assert each table row including:
  service-client construction failure, RPC thrown transport error, RPC returned non-40001
  error, null/unexpected RPC payload, chained-sync thrown vs each typed non-applied kind,
  audit-sink failure (response unaffected).
- PostgREST DML lockdown: no new table; `shows` write flows through the new RPC. Plan includes a
  verification step that direct `shows` DML remains revoked for `authenticated`/`anon`
  (class rule `BL-ADMIN-POSTGREST-DML-LOCKDOWN` posture unchanged by this feature).

## 11. Out of scope

- Gear preview before include (Option B) — rejected this brainstorm.
- Any change on StagedReviewCard surfaces or the first-seen page (the warning never renders
  there, §2.2; the earlier pointer/guidance-override idea is DELETED) — rejected ("both
  views" option).
- Persisted archived-tab metadata on `shows` — rejected (scan-at-click chosen).
- An "applied vs pending" indicator beyond the §2.1 P3 intent phrasing (would require a durable
  applied-snapshot column — new schema, rejected with the previous line).
- `KIND_TO_SECTION` remap (§1.1).
- Any wizard-side refactor of `archivedTabOffer.tsx` beyond exporting reusable pieces.
- Crew-page changes; help-page (`/help/errors`) content changes; dev-capture schema changes.
