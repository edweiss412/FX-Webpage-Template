# Staged identity-link rename: preserve crew identity on the staged apply path

**Date:** 2026-08-03 · **Backlog:** `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` (BACKLOG.md) · **Class:** sync (staged identity application) · **Status:** draft

## 1. Problem

The staged apply path applies an identity-linked rename (MI-12/13/14 resolved `rename`) as **remove-old + add-new**: `applyStagedCore` (`lib/sync/applyStagedCore.ts`, `runPhase2` call in `applyStagedCore()`) never passes `identityLinkRenames`, so `applyParseResult` falls through to delete+insert. The crew member's `crew_members.id` (the picker cookie key) and `claimed_via_oauth_at` (the OAuth claim) do not survive — a staged rename silently signs the member out and orphans their claim.

The cron/manual path already preserves identity: `computeIdentityLinkRenames` (`lib/sync/identityLinkRenames.ts`, symbol `computeIdentityLinkRenames`) → `Phase2Args.identityLinkRenames` (`lib/sync/phase2.ts`, field doc "BL-CREW-RENAME-SILENT-REPLACEMENT (spec §3.3)") → in-place `renameCrewMember` before the delete (`lib/sync/applyParseResult.ts`, the `identityLinkRenames` loop above `deleteCrewMembersNotIn`). Producer: `lib/sync/runScheduledCronSync.ts` (`computeIdentityLinkRenames(notableItems, acceptedShrinkThisVersion)` and the length-gated spread).

This fix is **proactive** — no live incident, no data repair / backfill in scope.

## 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|----------|--------------|
| 1 | Approach A: choice-aware threading inside `applyStagedCore`, uniform across all staged callers (the three enumerated in #7). Not caller-scoped, not the cron helper re-used with `acceptedThisVersion: true`. | Owner pick "a", this session (2026-08-03), after 3-approach comparison. |
| 2 | The capability-audit shape for a staged **rename-choice** FLIPS to the cron shape: unchanged flags → no notice; changed flags → arm (a) single change. The previous loss+grant (arms c+b) shape existed *because* identity churned; preserving identity makes the loss phantom. This supersedes the fence in the role-flags spec (`docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md` §2.5 "no R33-2 override" and do-not-relitigate item 2h) — that fence was a scope deferral for *that* spec, and `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` (filed by the same spec) names this threading as the sanctioned change. Fenced both directions: do not relitigate the flip here, and do not re-fence threading out. | Owner design approval, this session; supersession pointer lands in the role-flags spec per §5. |
| 3 | `independent`-choice semantics are UNCHANGED: no identity link, genuine remove+add, arms (c)+(b) still audit, R33-2 feed assertions (zero `crew_renamed` rows, remove+add rows present — g2, `tests/onboarding/finalizeCasFullApply.db.test.ts` "R33-2 feed assertions") untouched. R33-2's assertion set covers only `independent` choices; choice-aware linking does not intersect it. | R33-2 origin: `docs/superpowers/plans/step3-onboarding/2026-06-11-onboarding-fixups/01-f1-shared-apply-core.md` §"Choice-aware feed inputs" R33-2 pinning. |
| 4 | The `undo_change` RPC is UNTOUCHED. Its Direction-A rename undo deletes the live successor by name and re-inserts the `before_image` row including its `id` — agnostic between delete+insert and in-place apply FOR `id` + `claimed_via_oauth_at` (the scope of this claim; see #9 for the pre-existing `selections_reset_at` caveat). Cron in-place renames already flow through it (`tests/db/undo-change-direction-a.test.ts`, fixture with `identityLinkRenames` pair). | `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql` (successor delete + `before_image` re-insert restoring `id` and `claimed_via_oauth_at`). |
| 5 | No data repair for historical staged renames that already churned ids. Proactive fix, forward-only. | Owner answer "proactive", this session. |
| 6 | No new lock surface, no migration, no UI (`impeccable-gate: N/A` in the plan), no new mutation surface (no new route/action; the change is inside an already-instrumented apply core). | §7. |
| 7 | **Caller topology (review R1 finding 1):** the core's staged callers are dashboard `applyStaged` (live; `feedPolicy: none`, `lib/sync/applyStaged.ts` core call), `finalize` (wizard Phase B FIRST-SEEN ONLY; `feedPolicy: none`, `app/api/admin/onboarding/finalize/route.ts` core call), and `finalize-cas` (wizard Phase D existing-show; `feedPolicy: choice_aware`, `app/api/admin/onboarding/finalize-cas/route.ts` core call). finalize-cas DISCARDS `coreResult.roleFlagsNotice` (its per-row return carries only `drive_file_id`/`code`/`showId`) — a PRE-EXISTING capability-audit emission gap on the Phase D path, independent of this change, OUT of scope; filed as `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP` (Task 5). This spec's notice-flip claims are stated at the CORE-RESULT level plus the dashboard sink (`applyStaged` post-commit emit); they do not claim finalize-cas emits anything today. | Verified live 2026-08-03; R1 triage below. |
| 8 | **Landed-vs-requested link divergence (review R1 finding 2):** hold-aware reconciliation can suppress a rename TARGET (P2-F4 added-row suppression, `lib/sync/holds/holdAwareApply.ts`), the pair then no-ops in `applyParseResult`, yet `capabilityRoleChangesForNotice` and the feed writer consume the REQUESTED pairs. This class is PRE-EXISTING and shared verbatim with the cron path (same producer/consumer wiring); this spec neither introduces nor widens it beyond adding the staged producer, and does not fix it. Filed as `BL-IDENTITYLINK-LANDED-VS-REQUESTED` (Task 5); documented limit §5. | Verified live 2026-08-03. |
| 9 | **Undo `selections_reset_at` reset (review R1 finding 3):** `crewImage` omits `selections_reset_at` from `before_image` and the Direction A re-insert omits the column, so ANY crew undo (removed or renamed, either apply shape, either path) resets it to null — a previously invalidated picker cookie can validate again post-undo. PRE-EXISTING, not widened by this change (the cron in-place shape already round-trips through the same RPC); OUT of scope; filed as `BL-UNDO-SELECTIONS-RESET-AT-DROP` (Task 5). The §1.1 #4 shape-agnostic claim is scoped to `id` + `claimed_via_oauth_at`. | Verified live 2026-08-03. |

## 2. Current behavior (verified citations)

- `applyStagedCore` step-7 `runPhase2` call spreads many optional Phase2Args but never `identityLinkRenames` (`lib/sync/applyStagedCore.ts`, `applyStagedCore()` step 7).
- Its step-3 comment ("the staged parse applies WHOLESALE for all three", continuing that the per-action difference is only floors + the audit record) documents the remove+add posture (`lib/sync/applyStagedCore.ts`, comment above the reject dispatch).
- `Phase2Args.identityLinkRenames` exists and is forwarded to BOTH consumers already: `applyParseResult` (spread `args.identityLinkRenames !== undefined ? { identityLinkRenames: ... }` in `runPhase2`) and `capabilityRoleChangesForNotice` (last positional arg). No phase2 code change is needed.
- `applyParseResult` runs the in-place rename loop BEFORE `deleteCrewMembersNotIn`, with guards: pair names must exist on their respective sides (`previousNamesSet` / `nextNamesSet`), held names skipped, delete-protected names skipped, each name consumed at most once. A skipped pair falls through to the ordinary delete+upsert flow — for a hold-protected old name that means the old row is RETAINED (delete-suppressed), not replaced (§5). (`lib/sync/applyParseResult.ts`, loop over `args.identityLinkRenames`.)
- `renameCrewMember` tx contract: guarded in-place UPDATE of `crew_members.name`, idempotent, at-most-one row; target-name collision or missing source is a silent no-op (`lib/sync/applyParseResult.ts`, `ApplyParseResultTx.renameCrewMember` doc).
- Reviewer-choice validation guarantees: every item has exactly one choice (`MISSING_REVIEWER_CHOICE`), `rename` is only accepted for MI-12/13/14 (`allowedActions`), and `rename_value` must equal the item's `added_name` (`expectedRenameValue`). (`lib/sync/applyStagedCore.ts`, `validateReviewerChoices`.)
- On the `choice_aware` caller (finalize-cas, Phase D) the feed already labels a rename-choice a rename: `choiceAwareFeedItems` keeps rename-resolved items, and the feed writer derives a `crew_renamed` row from every kept MI-12/13/14 item (`lib/sync/changeLog/writeAutoApplyChanges.ts`, `renamePairs`). So today THAT path's feed says "renamed" while the identity churns underneath — this spec closes the inconsistency (the `crew_renamed` row's `before_image.id` will now equal the live successor's id, as on cron). The dashboard staged path writes NO feed rows at all (`feedPolicy: none` — pre-existing ratified behavior, role-flags spec "the staged path's feed silence for roster rows is the pre-existing feedPolicy:none behavior"); identity preservation there has no feed dimension.
- MI-12/13/14 `TriggeredReviewItem` variants carry `removed_name` + `added_name` (`lib/parser/types.ts`, the MI-12/MI-13/MI-14 union arms).
- Wizard Phase B first-seen has no prior crew; `runManualStageForFirstSeen` already passes `identityLinkRenames: []` explicitly with a parity comment (`lib/sync/runManualStageForFirstSeen.ts`, "no rename pairs to identity-link").
- The vouch rule: MI-12 pairs always identity-link; MI-13/14 heuristic pairs link ONLY on a confirmed apply, because "the admin confirm is the vouch" and an unconfirmed heuristic pair must never silently merge two identities (`lib/sync/identityLinkRenames.ts`, header doc). On the staged path the per-item `rename` choice IS that confirm — a stronger, per-pair signal than cron's version-bound-accept proxy.

## 3. Design

### 3.1 New helper: `computeStagedIdentityLinkRenames`

In `lib/sync/identityLinkRenames.ts`, beside the cron helper:

```ts
export function computeStagedIdentityLinkRenames(
  items: TriggeredReviewItem[],
  choices: ReadonlyArray<{ item_id: string; action: string }>,
): IdentityLinkRename[]
```

Links `{ removedName, addedName }` for every item where:

- `item.invariant` is `"MI-12"`, `"MI-13"`, or `"MI-14"`, AND
- the choice with matching `item_id` has `action === "rename"`, AND
- that `item_id` has not already been consumed by an earlier item (consume-once belt — review R1 finding 4: `validateReviewerChoices` rejects duplicate CHOICES but never duplicate item ids in `items`, so a malformed staged payload with two pair-items sharing an id must not turn one vouch into two links; one vouch links at most one pair).

`independent` never links. `reject` is moot — the core discards before Phase 2 when any reject is present. The invariant check is defensive belt (validation already restricts `rename` to MI-12/13/14); the choice lookup is the vouch.

The choices parameter is structurally typed (not `ReviewerChoice`) because `applyStagedCore.ts` imports from this file — importing `ReviewerChoice` back would create a cycle. The structural type is the minimal shape the vouch needs.

Doc comment states: the staged `rename` choice is the admin confirm — the per-item form of the vouch the cron helper's `acceptedThisVersion` parameter proxies version-wide.

### 3.2 Core threading

In `applyStagedCore()`, post-validation (alongside the step-7 `feedItems` derivation):

```ts
const identityLinkRenames = computeStagedIdentityLinkRenames(
  args.triggeredReviewItems,
  validation.choices,
);
```

and in the `runPhase2` args, mirroring the cron producer's length-gated spread:

```ts
...(identityLinkRenames.length > 0 ? { identityLinkRenames } : {}),
```

Uniform for every core caller (§1.1 #7: dashboard `applyStaged`, `finalize` Phase B first-seen, `finalize-cas` Phase D existing-show); `sourceScope` and `feedPolicy` play no role in the link computation. Phase B first-seen passes zero MI-12/13/14 items (no prior roster), so the helper returns `[]` and the spread is absent — behavior identical.

The step-3 "applies WHOLESALE" comment is rewritten to name the carve-out: rename-resolved MI-12/13/14 items now ALSO thread `identityLinkRenames` (identity-preserving in-place apply); the per-action difference is no longer floors+audit only.

### 3.3 Downstream: zero code change, complete comment/doc reconciliation

`phase2.ts` and `applyParseResult.ts` are code-untouched. The behavior flip makes a set of shipped comments stale; this is the COMPLETE reconciliation inventory (review R2 finding — the sweep was grep-driven: `rg -n "remove\+add|version-bound" lib/sync/ tests/sync/phase2.test.ts`, all hits enumerated):

1. `lib/sync/applyStagedCore.ts` step-3 "applies WHOLESALE" comment — rewritten per §3.2.
2. `lib/sync/phase2.ts` arm-(c) comment inside `capabilityRoleChangesForNotice` ("esp. the staged remove+add of an identity-link rename, where args.identityLinkRenames is empty") — rewritten: a staged rename-choice pair is now present and excluded same as cron; only a staged `independent` (or genuine removal) reaches arm (c).
3. `lib/sync/phase2.ts` `Phase2Args.identityLinkRenames` field doc ("Computed by the orchestrator via computeIdentityLinkRenames (MI-12 always; MI-13/14 only on the version-bound accept)") — add the staged producer: `computeStagedIdentityLinkRenames` (per-item rename choice).
4. `lib/sync/applyParseResult.ts` `identityLinkRenames` arg doc ("MI-13/MI-14 pairs only on the version-bound accepted apply. A skipped/absent pair degrades to today's delete+insert") — add the staged per-item-choice producer; correct the degrade sentence (a hold-protected old name is retained, not replaced).
5. `lib/sync/applyParseResult.ts` rename-loop inline comment ("a skipped pair degrades to today's delete+insert, which is fail-safe") — same degrade nuance.
6. `lib/sync/identityLinkRenames.ts` header doc (vouch rule states the version-bound accept only) — name both confirm forms: cron version-bound accept, staged per-item rename choice.
7. `tests/sync/phase2.test.ts` arm-(c) test comment ("Path-independent (covers the staged remove+add of an identity-link rename)") — reword to "covers a staged `independent` resolution (remove+add)"; the test body (generic removal fixture) stays valid unchanged.

Verified by grep 2026-08-03: NO shipped test builds a staged-path fixture asserting the loss+grant shape (`rg -ln "ROLE_FLAGS_NOTICE|LEAD_ROLE_APPLIED" tests/ | xargs rg -ln "staged|applyStaged"` → empty), so the flip breaks no existing test; the arm tests at `tests/sync/phase2.test.ts` use generic-removal and cron-rename fixtures and remain valid.

### 3.4 Behavior matrix

Capability-audit columns describe the CORE RESULT (`roleFlagsNotice` on `ApplyStagedCoreResult`); whether it is EMITTED is per caller: dashboard `applyStaged` emits post-commit (`emitLeadRoleApplied` + `upsertAdminAlert` in its tail); finalize-cas discards the notice today (§1.1 #7, pre-existing gap, out of scope).

| Path × resolution | Identity | Notice in core result (holder, unchanged flags) | Notice in core result (flag delta) | Feed |
|---|---|---|---|---|
| Cron auto (MI-12; MI-13/14 version-bound accept) | in-place, preserved (unchanged) | none (unchanged) | arm (a) single (unchanged) | `crew_renamed` (unchanged) |
| Staged `rename` (MI-12/13/14), any core caller | **in-place, preserved (NEW)** | **none (was: arm (c) loss + arm (b) grant)** | **arm (a) single (was: loss+grant)** | choice_aware caller (finalize-cas): `crew_renamed`, `before_image.id` now matches live row; dashboard: no rows (`feedPolicy: none`, unchanged) |
| Staged `independent` (MI-13/14) | delete+insert, fresh id (unchanged) | arms (c)+(b) loss+grant (unchanged) | arms (c)+(b) (unchanged) | choice_aware: remove+add rows via diff (unchanged, R33-2); dashboard: no rows (unchanged) |
| Staged `reject` (MI-12) | discard, no mutation (unchanged) | n/a | n/a | none |
| Wizard Phase B first-seen (`finalize`) | no prior crew, helper no-ops (unchanged) | arm (b) grants only (unchanged) | n/a | `feedPolicy: none` (unchanged) |

Explicitly unchanged surfaces: `sync_audit` row (items + choices + derived side effects), `deriveAuthSideEffects` (revoke floors still list both names for a rename; the default bump is a no-op — auth table retired M9.5), `choiceAwareFeedItems`, `writeAutoApplyChanges`, the `undo_change` RPC, all MI-11 hold machinery.

### 3.5 Docs amendments (same branch)

1. Role-flags spec `docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md`: ONE dated supersession banner immediately after the document header ("Superseded in part, 2026-08-03: the staged RENAME-CHOICE path now threads `identityLinkRenames` and is identity-preserving; its loss+grant audit shape is retired; staged `independent` remains remove+add with arms (c)/(b); R33-2 feed assertions untouched; fenced both directions" plus a pointer to this spec), PLUS a short "(superseded 2026-08-03, see banner)" tag at EVERY staged-remove+add-normative site. Complete site list (grep-driven, `rg -n "remove\+add" <doc>` returns 10 lines, plus the arm-(c)-exclusion test item's staged-contrast clause): the §2.1 arm-(c) intro clause "(or, on the staged path, whose rename is applied as remove+add per the ratified R33-2 contract)"; the §2.1 exclusion paragraph's staged-path sentences; the §2.4 parenthetical "incl. a staged identity-link rename applied as remove+add"; the summary line "Staged identity-linked renames (remove+add per R33-2) are handled by arms (b)/(c)"; both §2.5 paragraphs; the test-requirements "Staged rename + capability" item (its loss+grant assertions are superseded by this spec's §4 item 4); the arm-(c)-exclusion test item's "Contrast: the STAGED remove+add" clause; do-not-relitigate items 2h AND 2e (2e's roster-changes parenthetical); PLUS two semantic sites a literal remove+add grep misses (review R3): the §2.4 coverage-parity paragraph's parenthetical "(cron threads `identityLinkRenames`; staged/manual pass empty)" (staged rename-choice applies no longer pass empty) and the coverage-parity structural-pin test item's "empty-`identityLinkRenames` (staged-shaped)" fixture label (now denotes only the independent/non-rename staged shape). Semantic closure: `rg -n "identityLinkRenames" <doc>` swept in full; the remaining mentions (arm-table row, shared-writer signature paragraph, code snippet, roleFlagsEqual note, already-listed sites) are path-parametric and stay valid. Existing text stays (history); tags redirect to the banner.
2. Code-comment reconciliation per the COMPLETE §3.3 inventory (7 sites: applyStagedCore step-3, phase2 arm-(c), Phase2Args field doc, applyParseResult arg doc + loop comment, identityLinkRenames header vouch doc, phase2.test.ts arm-(c) test comment).
3. BACKLOG.md: graduate `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` to `BACKLOG-archive.md` at close-out.
4. BACKLOG.md: file the three pre-existing classes surfaced by review R1, each with its verification citations from §1.1 #7-#9: `BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP` (Phase D discards `roleFlagsNotice`; no `ROLE_FLAGS_NOTICE`/`LEAD_ROLE_APPLIED` sink post-commit), `BL-IDENTITYLINK-LANDED-VS-REQUESTED` (notice/feed consume requested pairs, cron-shared), `BL-UNDO-SELECTIONS-RESET-AT-DROP` (`crewImage` + Direction A re-insert omit `selections_reset_at`).

## 4. Tests

All new tests derive expectations from fixture state (pre-apply row ids captured, then compared) — never hardcoded ids. Failure mode named per test.

1. **Helper unit** (`tests/sync/identityLinkRenames.test.ts`, extend): `computeStagedIdentityLinkRenames` — (a) MI-12/MI-13/MI-14 each with `rename` choice → linked pair from `removed_name`/`added_name`; (b) MI-13 + MI-14 with `independent` → `[]`; (c) mixed rename+independent set → only the rename pairs; (d) non-rename invariants (MI-11, orphan variants, asset invariants) with `apply` → never linked; (e) empty items → `[]`; (f) consume-once belt — two pair-items sharing one `item_id` with a single rename choice → exactly ONE pair (review R1 finding 4). Catches: a link emitted for an unvouched pair (identity merge of two people), a rename choice dropped (silent identity churn), and one vouch fanning out to multiple links on a malformed payload.
2. **Core unit** (`tests/sync/applyStaged.test.ts` or sibling, via `deps.runPhase2` spy): (a) MI-12 rename choice → spy receives `identityLinkRenames: [{removedName, addedName}]`; (b) MI-13 independent → spy args carry NO `identityLinkRenames` key (spread absent, mirroring the cron length-gate); (c) mixed → only rename pairs present. Catches: threading regression (the bug this spec fixes) and spread-when-empty drift.
3. **DB identity preservation** (new db test driving the REAL `applyStagedCore` under a test-held advisory lock, `feedPolicy: choice_aware` — the finalize-cas configuration; real `runPhase2`, same family of harness as `tests/sync/applyParseResult.identityLink.db.test.ts` / `tests/db/_holdsHelpers.ts`): staged-core apply with an MI-12 rename choice on a member with non-null `claimed_via_oauth_at` → same `crew_members.id`, `claimed_via_oauth_at` preserved, new name live, and the `crew_renamed` feed row's `before_image.id` equals the live id. Contrast case: MI-13 `independent` → old row gone, successor has a DIFFERENT id and `claimed_via_oauth_at IS NULL`. Held-boundary case: an MI-12 rename choice whose OLD name has an open MI-11 hold → rename loop skips, old row retained under old name/id (the §5 limit, pinned via the staged producer). Catches: the oauth-orphan bug end-to-end; the reverse regression (independent accidentally linking); a staged hold interaction diverging from the cron-pinned guard behavior.
4. **Capability-notice flip, CORE-RESULT level** (`ApplyStagedCoreResult.roleFlagsNotice` — the dashboard sink emits from exactly this value; finalize-cas discards it today, §1.1 #7): staged rename choice, holder with unchanged `["LEAD","A1"]` → NO `roleFlagsNotice` on the applied result; staged rename choice with a capability delta → exactly one arm (a) change entry (correct `prior_flags` via the rename map); staged `independent` on a holder → arms (c)+(b) loss+grant entries still present. Catches: phantom-loss audit surviving the flip, or the flip over-reaching into `independent`.
5. **Undo round-trip** (db, mirroring `tests/db/undo-change-direction-a.test.ts` in-place fixture): staged in-place rename → `crew_renamed` row → `undo_change` → prior name restored with the ORIGINAL id. Catches: an undo interaction regression from the apply-shape change.
6. **Existing suites green untouched**: g2 R33-2 assertions (`tests/onboarding/finalizeCasFullApply.db.test.ts`), `tests/sync/phase2.test.ts` arm tests, `tests/sync/applyParseResult.identityLink*.test.ts`.

## 5. Documented limits

- A rename pair whose OLD name is hold-protected is skipped by the rename loop and the old row is RETAINED under its old name/id (delete-suppression keeps it; pinned by `tests/sync/applyParseResult.identityLink.db.test.ts` held-name case). Not delete+insert. Unchanged by this spec.
- A rename pair whose TARGET (added name) was suppressed by hold-aware reconciliation (P2-F4 added-row reservation collision) is skipped — no successor row lands, the old row's fate follows the delete-suppression rules; meanwhile `capabilityRoleChangesForNotice` and the feed writer consume the REQUESTED pairs, not the landed ones. Pre-existing cron-shared class (§1.1 #8), unchanged by this spec, filed `BL-IDENTITYLINK-LANDED-VS-REQUESTED`.
- `renameCrewMember` no-ops on target-name collision / missing source (existing contract; returns void, unobservable to callers — part of the same landed-vs-requested class). The pair then lands via the ordinary delete+upsert flow (fail-safe re-pick, never a wrong identity). Unchanged.
- Any crew undo (either shape, either path) resets `selections_reset_at` to null on the restored row (§1.1 #9, pre-existing, filed `BL-UNDO-SELECTIONS-RESET-AT-DROP`).
- Historical staged renames that already churned ids stay churned (Resolved #5).
- A staged `rename` choice on an MI-13/14 pair that the admin confirms *incorrectly* (two genuinely different people) merges their identity — identical to the cron accepted-apply exposure; the vouch is the admin's, by design (`lib/sync/identityLinkRenames.ts` header doc).

## 6. Invariant compliance

- **Locks (invariant 2):** no change — the core adopts the caller's held lock (`assertShowLockHeld`); no new holder, topology untouched.
- **Mutation surfaces (invariant 10):** no new route/action; the change is internal to an already-instrumented apply core.
- **Supabase call-boundary (invariant 9):** no new Supabase client call sites.
- **UI (invariant 8):** none. The plan carries `impeccable-gate: N/A — no UI surface`.
- **DB:** no migration, no CHECK/enum change (tier×domain matrix: N/A — no DDL, no RPC, no trigger, no cleanup change; the only DB-adjacent surface is the existing `renameCrewMember` UPDATE already shipped for cron).
- **TDD (invariant 1):** every task in the plan is failing-test-first.
