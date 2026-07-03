# Admin-alert auto-resolution for state-based codes

**Date:** 2026-07-03 · **Status:** Draft (autonomous-ship pipeline; user gates waived 2026-07-03)
**Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §4.6 (alert workflow), §12.4 (codes)

## 1. Problem

`admin_alerts` rows raised for **conditions that later clear** stay open forever unless an admin
manually resolves them. Observed live on validation: East Coast Family Office Wealth Conference was
unpublished (SHOW_UNPUBLISHED alert raised), then republished — the alert stayed in the
`/admin#alerts` banner six hours later with the show visibly Published in the same viewport.

Root cause: `SHOW_UNPUBLISHED` is raised by both unpublish paths — in-RPC
(`supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:16`, `_unpublish_show_core`)
and the emailed-link path (`lib/sync/unpublishShow.ts:240`) — but `publish_show`
(`supabase/migrations/20260601000000_b2_show_lifecycle.sql:115-145`) never touches `admin_alerts`.
The published-toggle spec explicitly deferred this: *"SHOW_UNPUBLISHED alert auto-resolution on
republish — not added"* (`docs/superpowers/specs/2026-07-01-published-toggle.md:208`). This feature
lands that deferral and closes the class.

## 2. Design principle: state vs event

Master spec §4.6 (line 966) frames manual resolve as *"a deliberate acknowledgment, not an undo."*
That contract governs **event notices**. The codebase already carries a ratified second family —
**condition-watched alerts the system resolves itself** — with seven codes in production:
`DRIVE_FETCH_FAILED` / `PARSE_ERROR_LAST_GOOD` / `SHEET_UNAVAILABLE`
(`lib/sync/runScheduledCronSync.ts:190-208` `resolveStaleSyncProblemAlerts_unlocked`;
`lib/notify/detect/recoveryResolution.ts:35-74`), `SYNC_STALLED` (`lib/notify/detect/stall.ts:17`),
`EMAIL_DELIVERY_FAILED` + `EMAIL_NOT_CONFIGURED` (`lib/notify/detect/emailDeliveryFailed.ts:254-309`),
`WATCH_CHANNEL_ORPHANED` (`lib/drive/watch.ts:658,692,720`).

**Principle (this spec makes it durable):** an alert whose condition is a persistent, code-observable
STATE auto-resolves at the point the system observes recovery; an alert that records a one-shot EVENT
stays manual-acknowledge per §4.6. Every code in the registry is classified below; future codes must
declare a class (enforced structurally, §8).

Auto-resolution sets `resolved_at = now()` and leaves `resolved_by` NULL — the existing convention of
all seven precedent resolvers (`lib/adminAlerts/resolveAdminAlert.ts:18` sets only `resolved_at`).
NULL `resolved_by` = system-resolved; non-NULL = admin acknowledgment. Manual resolve paths
(`app/admin/actions.ts:100-108`, `app/api/admin/admin-alerts/[id]/resolve/route.ts:125-126`,
`app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:125-132`) are unchanged.

## 3. Lifecycle table — all 42 registry codes

Registry source of truth: `ADMIN_ALERTS_CODES` in `tests/messages/_metaAdminAlertCatalog.test.ts:57-100`
(42 codes; supersets the 33-code `AdminAlertCode` TS union at `lib/adminAlerts/upsertAdminAlert.ts:3-36`,
which governs only the JS producer path).

Classes: **AUTO** = already auto-resolves (no change) · **NEW** = auto-resolution added by this spec ·
**EVENT** = one-shot notice, manual by design · **DEFER** = state-based but out of scope (BACKLOG).
Counts: 7 AUTO · 14 NEW · 18 EVENT · 3 DEFER = 42.

| Code | Class | Raise site(s) | Condition | Clear detection → resolution |
|---|---|---|---|---|
| DRIVE_FETCH_FAILED | AUTO | cron sync pipeline (status→code map `runScheduledCronSync.ts:181-187`) | show fetch failing | next successful sync (`runScheduledCronSync.ts:190-208`; `recoveryResolution.ts:35-74`) |
| PARSE_ERROR_LAST_GOOD | AUTO | same map | parse failing | same |
| SHEET_UNAVAILABLE | AUTO | same map | source missing | same |
| SYNC_STALLED | AUTO | `lib/notify/detect/stall.ts:15` | global heartbeat stale | heartbeat fresh (`stall.ts:17`) |
| EMAIL_DELIVERY_FAILED | AUTO | `lib/notify/deliver.ts:382`; `emailDeliveryFailed.ts:282` | failed deliveries current | reconciler (`emailDeliveryFailed.ts:296`) |
| EMAIL_NOT_CONFIGURED | AUTO | `emailDeliveryFailed.ts:306` | email config invalid | reconciler (`emailDeliveryFailed.ts:309`) |
| WATCH_CHANNEL_ORPHANED | AUTO | `lib/drive/watch.ts:393` | no live watch channel | watch reconcile (`watch.ts:658,692,720`) |
| SHOW_UNPUBLISHED | **NEW** | RPC `20260701000000...sql:16`; `lib/sync/unpublishShow.ts:240` | show unpublished, crew link paused | **S1**: `publish_show` RPC resolves; migration data-repair for already-republished shows |
| REEL_DRIFTED | **NEW** | `lib/sync/applyStaged.ts:996` via `verifyReelOnApply` | opening reel drifted at last verify | **S2**: next live apply where `verifyReelOnApply` returns `warningCode: null` (`verifyReelOnApply.ts:139`) |
| OPENING_REEL_PERMISSION_DENIED | **NEW** | `verifyReelOnApply.ts:113` | reel 403 at last verify | **S2** |
| OPENING_REEL_NOT_VIDEO | **NEW** | `verifyReelOnApply.ts:129` | reel wrong MIME at last verify | **S2** |
| EMBEDDED_ASSET_DRIFTED | **NEW** | `applyStaged.ts:994`; `lib/sync/snapshotAssets.ts:151,171` | embedded/linked asset drifted | **S2** (live-apply reconcile) |
| ASSET_RECOVERY_BYTES_EXCEEDED | **NEW** | `lib/sync/assetRecovery.ts:476` | recovery over byte budget | **S3**: `snapshot_status` lands `'complete'` |
| ASSET_RECOVERY_REVISION_DRIFT | **NEW** | `assetRecovery.ts:494,535,554` | recovery raced newer revision | **S3** |
| ASSET_RECOVERY_DRIFT_COOLDOWN | **NEW** | `assetRecovery.ts:463` | recovery throttled by backoff | **S3**; also resolved when a run proceeds past the cooldown gate (`assetRecovery.ts:445-450`) |
| EMBEDDED_RECOVERY_REQUIRES_RESTAGE | **NEW** | `assetRecovery.ts:565`; `applyStaged.ts:1069,1072` | restage-only nulls stuck | **S3** |
| PENDING_SNAPSHOT_PROMOTE_STUCK | **NEW** | `lib/sync/diagramGc.ts:298-312` | promote started >15min, not promoted | **S4**: gc-cycle anti-join reconcile (promote succeeds at `promoteSnapshot.ts:286`) |
| PENDING_SNAPSHOT_DELETE_STUCK | **NEW** | `diagramGc.ts:315-328` | delete claim expired, not promoted | **S4** |
| PENDING_SNAPSHOT_ROLLBACK_STUCK | **NEW** | `promoteSnapshot.ts:132-141` | rollback threw | **S4**: rollback completes (`clearRolledBack`, `promoteSnapshot.ts:158`) / gc reconcile |
| WEBHOOK_TOKEN_INVALID | **NEW** | `app/api/drive/webhook/route.ts:277,287` | channel receiving invalid deliveries | **S5**: verified delivery for same `channel_id`; watch-reconcile resolves rows for non-active channels |
| TILE_PROJECTION_FETCH_FAILED | **NEW** | `app/show/[slug]/[shareToken]/_CrewShell.tsx:157` | projection sub-fetch failing on crew page | **S6**: healthy shell render (`failedKeys.length === 0`, `_CrewShell.tsx:153`) |
| TILE_SERVER_RENDER_FAILED | EVENT* | `components/crew/WrappedSection.tsx:95`; `components/shared/TileServerFallback.tsx:88` | a tile's server render threw | *State-shaped but **no aggregation point**: tiles render/stream independently per-request; the open row is deduped per (show, code) with `context.tileId` replaced on re-raise, so tile A's success cannot prove tile B (which may hold the row) is healthy. Auto-resolving on any tile success would mask live failures. Manual; per-tile keyed redesign → BACKLOG. |
| AMBIGUOUS_EMAIL_BINDING | EVENT | `lib/auth/validateGoogleSession.ts:39-46` | duplicate canonical email seen at auth | Defensively-impossible incident alarm (master spec line 2322: MI-5b + unique index make it unreachable); firing at all means schema regression — deliberate acknowledgment required. |
| LIVE_ROW_CONFLICT | EVENT | `lib/sync/runOnboardingScan.ts:831-843` | onboarding scan hit live-row conflict | Wizard-scoped incident; the wizard review/ignore workflow is the disposition (`Step3Review.tsx:487`). |
| ROLE_FLAGS_NOTICE | EVENT | `lib/sync/phase2.ts:422-432` | non-LEAD role_flags auto-applied | Info-severity audit record. |
| SHOW_FIRST_PUBLISHED | EVENT | `applyStaged.ts:1369`; `runScheduledCronSync.ts:1990` | first-seen auto-publish happened | Info-severity confirmation. |
| OAUTH_IDENTITY_CLAIMED | EVENT | `app/auth/callback/route.ts:127`; picker-bootstrap analogue (`app/api/auth/picker-bootstrap/route.ts`) | identity first-claimed a crew row | One-shot claim audit. |
| PICKER_BOOTSTRAP_RPC_FAILED | EVENT | `app/api/auth/picker-bootstrap/route.ts:97` | one bootstrap request failed | Transient request incident; later success has no row-state to reconcile. |
| PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED | EVENT | `picker-bootstrap/route.ts:74` | one resolve-show call failed | Same. |
| CALLBACK_CLAIM_THREW | EVENT | `app/auth/callback/route.ts:155` | claim-stamp block threw once | Same. |
| PICKER_SELECTION_RACE | EVENT | `lib/auth/picker/cleanupStaleEntry.ts:108-116` | stale selection CAS-deleted (already fixed) | Observational. |
| PICKER_EPOCH_RESET | EVENT | `lib/auth/picker/resetPickerEpoch.ts:29-37` | admin reset epoch | Admin-action audit. |
| WIZARD_SESSION_SUPERSEDED_RACE | EVENT | `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts:218`, `.../discard/route.ts:158`, `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:543`, `app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts:255` | wizard action lost a CAS race | Transient race incident. |
| REPORT_ORPHANED_LOST_LEASE | EVENT | `lib/reports/submit.ts:977` | orphaned GH issue was closed | Incident acknowledgment (external GitHub state). |
| REPORT_LOOKUP_INCONCLUSIVE | EVENT | `lib/reports/submit.ts:806-809` (via `lookupAlertCode`, `:205-208`) | report lookup failed closed | Same. |
| REPORT_DUPLICATE_LIVE_MATCHES | EVENT | `lib/reports/submit.ts:206` (mapped by `lookupAlertCode`) | duplicate live markers | Same. |
| REPORT_OPEN_ORPHAN_LABEL | EVENT | `lib/reports/submit.ts:207` (mapped by `lookupAlertCode`) | impossible open-orphan state | Impossible-state alarm. |
| REPORT_LEASE_THRASHING | EVENT | `lib/reports/submit.ts:847-848` | repeated lease races | Same. |
| STALE_ORPHAN_REPORT | EVENT | `app/api/cron/report-reaper/route.ts:74` | stale reservation reaped | Reaper audit record. |
| GITHUB_BOT_LOGIN_MISSING | DEFER | `lib/reports/submit.ts:778` | bot login env unset | Config STATE, but the healthy observation point is inside the M8 report pipeline whose review discipline requires live GitHub integration probes (`feedback_mocked_only_tests_invite_tautological_approve`) — out of scope; BACKLOG. |
| BRANCH_PROTECTION_DRIFT | DEFER | `scripts/verify-branch-protection.ts:326` | branch protection drifted | STATE, but raised by a CI-side ops script outside the app runtime; BACKLOG. |
| BRANCH_PROTECTION_MONITOR_AUTH_FAILED | DEFER | `scripts/verify-branch-protection.ts:266,286,309` | monitor auth failing | Same. |

## 4. New resolution surfaces

Six surfaces. Each resolves via the mechanism native to its transaction machinery: postgres.js
in-tx SQL for sync/cron paths (mirroring `resolveStaleSyncProblemAlerts_unlocked`,
`runScheduledCronSync.ts:190-208`), the Supabase service-role helper for JS post-commit paths.
A new bulk variant `resolveAdminAlerts({ showId, codes })` is added beside `resolveAdminAlert`
(`lib/adminAlerts/resolveAdminAlert.ts`) — same filters (`resolved_at IS NULL`, exact `show_id`
match incl. NULL), `.in("code", codes)`, sets only `resolved_at`, throws on error (invariant-9
posture; registered per §8).

### S1 — SHOW_UNPUBLISHED: resolve in `publish_show` (migration)

New migration redefines `_publish_show_core` (`20260601000000_b2_show_lifecycle.sql:115-131`). The
resolve statement is:

```sql
update public.admin_alerts
   set resolved_at = now()
 where show_id = p_show_id and code = 'SHOW_UNPUBLISHED' and resolved_at is null;
```

**Exact control flow (binding on the plan)** — the current core reads state, early-returns on
`v_pub` (`b2_show_lifecycle.sql:121` `if v_pub then return; end if;`), then runs the refusal gates,
then flips `published`. The new core places the resolve statement in exactly two positions and
nowhere else:

1. **Inside the already-published branch, before its `return`** — `if v_pub then <resolve>; return;
   end if;`. The idempotent no-op heals a stale alert without running the refusal gates, exactly as
   already-published calls bypass them today (no behavior change for the gates).
2. **After the `update public.shows set published = true` flip** (and before/alongside
   `publish_show_invalidation`) — the normal republish path.

The resolve statement must NOT run before the refusal gates on the unpublished path: a refused
publish (archived / finalize-owned / pending-review raises) leaves the show unpublished, so the
alert must stay open (§6). The `raise exception` in each gate aborts the transaction, so ordering
inside the function is what guarantees this.

- The already-published branch is what heals a stale alert when the show was republished before this
  ships — but only if a subsequent publish_show call happens; see data repair below for rows that
  would otherwise never see one.
- **One-time data repair in the same migration:** resolve open SHOW_UNPUBLISHED rows whose show is
  currently `published = true` (heals the live validation alert with no admin action).
- **Advisory-lock topology unchanged:** `publish_show` already takes `pg_advisory_xact_lock` in-RPC
  (`b2_show_lifecycle.sql:141`) and is the single holder; the resolve is one more statement inside
  the same locked transaction. No new holder at any layer. (`admin_alerts` is not in the
  invariant-2 lock-gated table set, so the lock is incidental, not required.)
- Covers every republish path: admin toggle (`app/admin/show/[slug]/_actions/setPublished.ts:33`)
  and onboarding publish (`_actions/publish.ts`) both call the `publish_show` RPC via
  `lib/showLifecycle/publishShow.ts:16`. The first-seen auto-publish INSERT
  (`runScheduledCronSync.ts:1226-1233`) creates a brand-new show that cannot carry an open alert.
- Idempotent re-apply: migration uses `create or replace function`; the data-repair UPDATE is
  naturally idempotent.
- `tests/messages/_metaAdminAlertCatalog.test.ts:411-416` pins the unpublish migration's *producer*
  regex; this migration adds no producer and must not alter that match.

### S2 — Live-apply reconcile: reel + embedded-drift family

At the existing post-commit alert-upsert site in `applyStaged` (`lib/sync/applyStaged.ts:1804-1821`,
live scope, `outcome === "applied"`): after upserting the codes raised this apply, resolve
`{REEL_DRIFTED, OPENING_REEL_PERMISSION_DENIED, OPENING_REEL_NOT_VIDEO, EMBEDDED_ASSET_DRIFTED}`
**minus** the codes in `result.adminAlertCodes ?? []` (+ `result.adminAlertCode`) — the
"family minus current" shape of `resolveStaleSyncProblemAlerts_unlocked`. A clean verify
(`verifyReelOnApply.ts:139` returns `warningCode: null`; no `linkedDrift` at `applyStaged.ts:994`)
therefore clears all four. A show with no reel configured verifies clean, which correctly resolves
reel alerts after the reel is removed from the sheet.

Recheck cadence note: this fires when a live apply runs (sheet edit advancing modtime, or manual
re-sync from `/admin/show/<slug>`). The operator workflow "fix the reel → re-sync" clears the alert;
an untouched sheet keeps the alert open, which is honest — the fix is unverified until re-checked.

Error posture: same as the adjacent upserts (awaited; a resolve failure surfaces like an upsert
failure, not a silent continue).

### S3 — Snapshot recovery completion

Resolve `{ASSET_RECOVERY_BYTES_EXCEEDED, ASSET_RECOVERY_REVISION_DRIFT, ASSET_RECOVERY_DRIFT_COOLDOWN,
EMBEDDED_RECOVERY_REQUIRES_RESTAGE}` for the show at every writer that lands
`snapshot_status = 'complete'`:

- `assetRecovery` success (`lib/sync/assetRecovery.ts:571-574` region, in the locked tx alongside
  `deleteRecoveryCooldown`), and
- the Phase-2 staging/apply path when a fresh snapshot lands complete (plan enumerates the exact
  `snapshot_status` writers by grep; the invariant is the status transition, not a named line).

Additionally, `ASSET_RECOVERY_DRIFT_COOLDOWN` alone is resolved whenever an assetRecovery run
**proceeds past the cooldown gate** (`assetRecovery.ts:445-450` returns inactive) — the throttling
condition it reports is over even if the run then fails for a different reason (which raises its own
code).

### S4 — Diagram-GC stuck-alert reconcile

In the same gc cycle that raises (`emitStuckAlerts`, `diagramGc.ts:295-330`): resolve each of
`PENDING_SNAPSHOT_PROMOTE_STUCK` / `PENDING_SNAPSHOT_DELETE_STUCK` for shows with an open alert
where **no** `pending_snapshot_uploads` row still matches that code's stuck predicate (the raise
SQL's WHERE, anti-joined). `PENDING_SNAPSHOT_ROLLBACK_STUCK` resolves when the failed rollback
completes (`clearRolledBack`, `promoteSnapshot.ts:158`) and is also swept by the gc anti-join if a
DB-observable rolled-back-pending predicate exists (plan pins the exact columns; the invariant:
resolve when the rollback that failed has since completed and no row remains stuck).

Cadence: the gc cron (`app/api/cron/diagram-gc/route.ts:10`) already runs these queries; the
reconcile adds inverted-predicate UPDATEs in the same pass. No advisory lock (not required for
`admin_alerts`; matches `emitStuckAlerts` which already writes lock-free).

### S5 — WEBHOOK_TOKEN_INVALID: verified-delivery + stale-channel resolve

Two triggers, both global-scoped (`show_id IS NULL`, matching the raise):

1. **Verified delivery:** in the webhook route, once the delivery passes both the token check
   (`route.ts:274`) and resource-id check (`route.ts:284`) for the active channel, resolve open
   `WEBHOOK_TOKEN_INVALID` rows whose `context->>'channel_id'` equals that channel's id.
2. **Stale channel:** in the watch-reconcile healthy paths that already resolve
   `WATCH_CHANNEL_ORPHANED` (`lib/drive/watch.ts:658,692,720`), also resolve open
   `WEBHOOK_TOKEN_INVALID` rows whose `context->>'channel_id'` does **not** match the now-active
   channel id (the misconfigured channel no longer exists; the condition is moot).

Accepted trade-off (do not relitigate): a probing attack that sends bad-token deliveries to a live,
otherwise-healthy channel will see its alert auto-resolved at the next legitimate delivery. The
code's purpose per its catalog copy is webhook *configuration* health, not intrusion detection;
history is preserved in resolved rows (`occurrence_count`, `last_seen_at`) and route logs. The
secret-rotation failure mode this alert exists for produces **no** valid deliveries, so the resolve
can never mask it.

### S6 — TILE_PROJECTION_FETCH_FAILED: healthy crew-shell render

In `_CrewShell` where `failedKeys` is computed (`_CrewShell.tsx:153`): when `failedKeys.length === 0`,
resolve `TILE_PROJECTION_FETCH_FAILED` for the show, using the same non-fatal error posture as the
raise at `:157` (a resolve failure must never break the crew render) and scheduled so it does not
add response latency (Next 16 `after()` is available in this repo's render paths — precedent:
PR #228 C8). Cost: one UPDATE against the `resolved_at IS NULL` partial index per healthy render —
the raise path already pays an equivalent per-render write when unhealthy.

**Invariant-8 routing:** `_CrewShell.tsx` is under `app/` (non-API), so this edit is a UI-surface
change by definition — even though it alters no rendered output. The work is Opus-owned and the
milestone close-out MUST run `/impeccable critique` AND `/impeccable audit` on the affected diff,
with HIGH/CRITICAL findings fixed or deferred via `DEFERRED.md`, before cross-model review (AC11).
The resolve stays beside the raise (same file, same fail-quiet posture) rather than moving into
`lib/data/getShowForViewer.ts`, because the raise's producer contract is deliberately
crew-shell-scoped ("Producer contract 1", `_CrewShell.tsx:151-153` comment) and `getShowForViewer`
also serves non-crew render paths where "empty `tileErrors`" is not the same observation.

## 5. What does NOT change

- No rendered-output changes anywhere. One UI-surface **file** is edited — `_CrewShell.tsx` (S6),
  which triggers the invariant-8 impeccable dual-gate (see S6 routing note + AC11) — but its JSX
  output is untouched. The banner (`components/admin/AlertBanner.tsx`) and both manual resolve
  routes are untouched; manual resolve still stamps `resolved_by = canonicalize(email)`.
- No new §12.4 codes, no catalog rows, no copy edits → x1/x2/spec-codes/help-families gates do not
  move.
- No new tables/columns. The only DDL-adjacent change is the `_publish_show_core` redefinition +
  data-repair UPDATE (migration → local apply → `pnpm gen:schema-manifest` → validation surgical
  apply, per AGENTS.md; note the manifest is function-body-insensitive but the parity job's Layer 2
  still requires the validation apply).
- Dedup/occurrence semantics unchanged: resolving then re-raising creates a fresh row (partial
  unique index `admin_alerts_one_unresolved_idx`, `20260501001000_internal_and_admin.sql:279`),
  preserving history.
- `GITHUB_BOT_LOGIN_MISSING`, `BRANCH_PROTECTION_*`, report-family auto-resolution, and per-tile
  keying for `TILE_SERVER_RENDER_FAILED` → BACKLOG.md entries in this PR.

## 6. Guard conditions & edge cases

| Surface | Edge | Behavior |
|---|---|---|
| S1 | publish refused (archived / finalize-owned / pending-review) | refusal raises before the resolve statement — alert stays open (show is still unpublished) |
| S1 | republish of never-alerted show | UPDATE matches 0 rows; no-op |
| S1 | concurrent unpublish/publish | both RPCs serialize on the same in-RPC advisory lock; last committed state wins and its alert state is consistent with `published` |
| S2 | apply raises one family code, others open | only non-raised codes resolve (family-minus-current) |
| S2 | `result.showId` null / outcome ≠ applied / scope ≠ live | no resolve (same guards as the existing upsert block) |
| S3 | recovery succeeds for revision N while alert context names revision N-1 | resolve is keyed (show_id, code) — context revision is informational; correct because the *show-level* condition (recovery incomplete) has cleared |
| S4 | stuck row still matches predicate | anti-join excludes the show; alert stays open |
| S5 | invalid + valid deliveries interleaved on one channel | see accepted trade-off in S5 |
| S6 | render with tileErrors non-empty | raise path runs (unchanged); no resolve |
| S6 | resolve throws (Supabase outage) | caught + logged like the raise path; crew render unaffected |
| all | alert already resolved manually | every resolve filters `resolved_at IS NULL`; no double-write |
| all | `showId` NULL codes (SYNC_STALLED-style) | new NEW-class codes are show-scoped except WEBHOOK_TOKEN_INVALID (global, `show_id IS NULL` filter, matching its raise) |

## 7. Acceptance criteria

- **AC1** `publish_show` on an unpublished show with an open SHOW_UNPUBLISHED alert → published AND
  alert resolved (`resolved_at` set, `resolved_by` NULL), in one transaction. Idempotent re-call on
  an already-published show with a (synthetically stale) open alert also resolves it.
- **AC2** Migration data repair: open SHOW_UNPUBLISHED + `published = true` → resolved by applying
  the migration; open alert + `published = false` → untouched. Applying the migration twice is safe.
- **AC3** Live apply with clean reel + no drift resolves all open codes in the S2 family; an apply
  that raises exactly one family code resolves the other three and leaves the raised one open.
- **AC4** assetRecovery completing (`snapshot_status → 'complete'`) resolves all four S3 codes; a
  run proceeding past an expired cooldown resolves ASSET_RECOVERY_DRIFT_COOLDOWN even when the run
  then fails with BYTES_EXCEEDED (which stays open).
- **AC5** GC reconcile resolves a stuck alert whose pending row has since promoted, and does NOT
  resolve one whose row still matches the stuck predicate (expectations derived from fixture rows,
  not hardcoded).
- **AC6** A verified webhook delivery resolves an open token-invalid alert with matching
  `channel_id`; watch reconcile resolves one with a non-active `channel_id`; an alert for the active
  channel with no intervening valid delivery stays open.
- **AC7** Healthy `_CrewShell` render resolves an open projection alert; a render with `tileErrors`
  does not, and still raises.
- **AC8** Structural: the lifecycle registry (§8) classifies every `ADMIN_ALERTS_CODES` entry and
  pins a resolve site for every AUTO/NEW code; an unclassified new code fails the meta-test.
- **AC9** Manual-resolve regression: admin resolve routes still stamp `resolved_by`; auto-resolution
  paths never do.
- **AC10** `pnpm test` full suite + typecheck + format green; validation-schema-parity green after
  the surgical apply.
- **AC11** Invariant-8 UI gate: `/impeccable critique` AND `/impeccable audit` run on the affected
  diff (S6 touches `app/show/[slug]/[shareToken]/_CrewShell.tsx`), with every HIGH/CRITICAL finding
  fixed or explicitly deferred via a `DEFERRED.md` entry, BEFORE the whole-diff cross-model review.

Anti-tautology notes for the test plan (binding on the plan): S2/S3/S4 assertions read
`admin_alerts` rows directly (not UI or log output); AC3's "raises one, resolves three" derives the
raised code from the fixture's actual drift condition; AC5 derives stuck/unstuck from fixture
timestamps relative to the gc `now`, never hardcoded intervals.

## 8. Structural defense (meta-test)

Extend `tests/messages/_metaAdminAlertCatalog.test.ts` with an `ADMIN_ALERTS_LIFECYCLE` registry:
every code in `ADMIN_ALERTS_CODES` maps to `'auto' | 'event-manual' | 'state-manual-justified' |
'deferred'`, and every `auto` entry carries a resolve-site `{ file, pattern }` the test asserts
exists (mirroring the existing `ADMIN_ALERTS_WRITE_SITES` shape). This closes the class at CI time:
a future code cannot land without declaring its lifecycle, and an auto code cannot lose its resolve
site silently. The new `resolveAdminAlerts` bulk helper lands in
`lib/adminAlerts/resolveAdminAlert.ts`, which is already registered in the notify infra-contract
registry (`tests/notify/_metaInfraContract.test.ts:6-17`, `REGISTERED` row
`lib/adminAlerts/resolveAdminAlert.ts`) — the registry is file-scoped, so the existing row covers
the new export; the plan's meta-test task must confirm that registry still passes against the
extended file (invariant 9). The auth registry (`tests/auth/_metaInfraContract.test.ts`) is not the
right home — this is not an auth helper.

## 9. Alternatives considered

- **Central reconciler cron** (one detector sweeping all conditions, like `runNotify`): rejected —
  several conditions are only observable at request/apply time (tile projection, webhook validity,
  live reel verify), so a cron cannot see them without duplicating the observation logic; adds a
  cron surface for no coverage gain.
- **TTL auto-expiry**: rejected — hides live conditions; an alert that expires while the condition
  persists is worse than a stale one.
- **Point-of-recovery resolution** (chosen): each healthy path resolves its own family — symmetric
  with the raise sites, matches all seven existing precedents, no new infrastructure.

## 10. Watchpoints (review preempts — do not relitigate)

- **§4.6 "deliberate acknowledgment" vs auto-resolution:** §4.6:966 governs event notices; seven
  ratified precedents already auto-resolve state codes (citations in §2). This spec formalizes the
  boundary rather than introducing it.
- **Published-toggle deferral:** `2026-07-01-published-toggle.md:208` deliberately deferred S1; this
  spec is that deferral landing, not a contradiction.
- **WEBHOOK_TOKEN_INVALID event-vs-state:** classification and the probing trade-off are resolved in
  S5; the secret-rotation failure mode cannot be masked.
- **TILE_SERVER_RENDER_FAILED stays manual:** per-tile dedup makes auto-resolution unsound (§3 row);
  redesign deferred to BACKLOG.
- **resolved_by NULL for auto-resolution:** existing convention of all seven precedents, not a new
  decision.
- **Report/branch-protection DEFER rows:** scoping decision recorded in §3/§5; BACKLOG entries ship
  in this PR.
