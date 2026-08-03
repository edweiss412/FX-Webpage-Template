# Staged identity-link rename: preserve crew identity on the staged apply path

**Date:** 2026-08-03 · **Backlog:** `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` (BACKLOG.md) · **Class:** sync (staged identity application) · **Status:** draft

## 1. Problem

The staged apply path applies an identity-linked rename (MI-12/13/14 resolved `rename`) as **remove-old + add-new**: `applyStagedCore` (`lib/sync/applyStagedCore.ts`, `runPhase2` call in `applyStagedCore()`) never passes `identityLinkRenames`, so `applyParseResult` falls through to delete+insert. The crew member's `crew_members.id` (the picker cookie key) and `claimed_via_oauth_at` (the OAuth claim) do not survive — a staged rename silently signs the member out and orphans their claim.

The cron/manual path already preserves identity: `computeIdentityLinkRenames` (`lib/sync/identityLinkRenames.ts`, symbol `computeIdentityLinkRenames`) → `Phase2Args.identityLinkRenames` (`lib/sync/phase2.ts`, field doc "BL-CREW-RENAME-SILENT-REPLACEMENT (spec §3.3)") → in-place `renameCrewMember` before the delete (`lib/sync/applyParseResult.ts`, the `identityLinkRenames` loop above `deleteCrewMembersNotIn`). Producer: `lib/sync/runScheduledCronSync.ts` (`computeIdentityLinkRenames(notableItems, acceptedShrinkThisVersion)` and the length-gated spread).

This fix is **proactive** — no live incident, no data repair / backfill in scope.

## 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|----------|--------------|
| 1 | Approach A: choice-aware threading inside `applyStagedCore`, uniform across all staged callers (dashboard `applyStaged`, wizard finalize Phase D, finalize-cas). Not caller-scoped, not the cron helper re-used with `acceptedThisVersion: true`. | Owner pick "a", this session (2026-08-03), after 3-approach comparison. |
| 2 | The capability-audit shape for a staged **rename-choice** FLIPS to the cron shape: unchanged flags → no notice; changed flags → arm (a) single change. The previous loss+grant (arms c+b) shape existed *because* identity churned; preserving identity makes the loss phantom. This supersedes the fence in the role-flags spec (`docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md` §2.5 "no R33-2 override" and do-not-relitigate item 2h) — that fence was a scope deferral for *that* spec, and `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` (filed by the same spec) names this threading as the sanctioned change. Fenced both directions: do not relitigate the flip here, and do not re-fence threading out. | Owner design approval, this session; supersession pointer lands in the role-flags spec per §5. |
| 3 | `independent`-choice semantics are UNCHANGED: no identity link, genuine remove+add, arms (c)+(b) still audit, R33-2 feed assertions (zero `crew_renamed` rows, remove+add rows present — g2, `tests/onboarding/finalizeCasFullApply.db.test.ts` "R33-2 feed assertions") untouched. R33-2's assertion set covers only `independent` choices; choice-aware linking does not intersect it. | R33-2 origin: `docs/superpowers/plans/step3-onboarding/2026-06-11-onboarding-fixups/01-f1-shared-apply-core.md` §"Choice-aware feed inputs" R33-2 pinning. |
| 4 | The `undo_change` RPC is UNTOUCHED. Its Direction-A rename undo deletes the live successor by name and re-inserts the `before_image` row including its `id` — shape-agnostic between delete+insert and in-place apply. Cron in-place renames already flow through it (`tests/db/undo-change-direction-a.test.ts`, fixture with `identityLinkRenames` pair). | `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql` (successor delete + `before_image` re-insert restoring `id` and `claimed_via_oauth_at`). |
| 5 | No data repair for historical staged renames that already churned ids. Proactive fix, forward-only. | Owner answer "proactive", this session. |
| 6 | No new lock surface, no migration, no UI (`impeccable-gate: N/A` in the plan), no new mutation surface (no new route/action; the change is inside an already-instrumented apply core). | §7. |

## 2. Current behavior (verified citations)

- `applyStagedCore` step-7 `runPhase2` call spreads many optional Phase2Args but never `identityLinkRenames` (`lib/sync/applyStagedCore.ts`, `applyStagedCore()` step 7).
- Its step-3 comment ("the staged parse applies WHOLESALE for all three", continuing that the per-action difference is only floors + the audit record) documents the remove+add posture (`lib/sync/applyStagedCore.ts`, comment above the reject dispatch).
- `Phase2Args.identityLinkRenames` exists and is forwarded to BOTH consumers already: `applyParseResult` (spread `args.identityLinkRenames !== undefined ? { identityLinkRenames: ... }` in `runPhase2`) and `capabilityRoleChangesForNotice` (last positional arg). No phase2 code change is needed.
- `applyParseResult` runs the in-place rename loop BEFORE `deleteCrewMembersNotIn`, with guards: pair names must exist on their respective sides (`previousNamesSet` / `nextNamesSet`), held names skipped, delete-protected names skipped, each name consumed at most once. A skipped pair degrades to delete+insert (fail-safe re-pick). (`lib/sync/applyParseResult.ts`, loop over `args.identityLinkRenames`.)
- `renameCrewMember` tx contract: guarded in-place UPDATE of `crew_members.name`, idempotent, at-most-one row; target-name collision or missing source is a silent no-op (`lib/sync/applyParseResult.ts`, `ApplyParseResultTx.renameCrewMember` doc).
- Reviewer-choice validation guarantees: every item has exactly one choice (`MISSING_REVIEWER_CHOICE`), `rename` is only accepted for MI-12/13/14 (`allowedActions`), and `rename_value` must equal the item's `added_name` (`expectedRenameValue`). (`lib/sync/applyStagedCore.ts`, `validateReviewerChoices`.)
- Staged feed already labels a rename-choice a rename: `choiceAwareFeedItems` keeps rename-resolved items, and the feed writer derives a `crew_renamed` row from every kept MI-12/13/14 item (`lib/sync/changeLog/writeAutoApplyChanges.ts`, `renamePairs`). So today the feed says "renamed" while the identity churns underneath — this spec closes that inconsistency (the `crew_renamed` row's `before_image.id` will now equal the live successor's id, as on cron).
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
- the choice with matching `item_id` has `action === "rename"`.

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

Uniform for every core caller (dashboard staged apply, wizard finalize Phase D, finalize-cas); `sourceScope` plays no role. Phase B first-seen passes zero MI-12/13/14 items, so the helper returns `[]` and the spread is absent — behavior identical.

The step-3 "applies WHOLESALE" comment is rewritten to name the carve-out: rename-resolved MI-12/13/14 items now ALSO thread `identityLinkRenames` (identity-preserving in-place apply); the per-action difference is no longer floors+audit only.

### 3.3 Downstream: zero code change

`phase2.ts` and `applyParseResult.ts` are code-untouched. One comment edit: the arm-(c) comment asserting "the staged remove+add of an identity-link rename, where args.identityLinkRenames is empty" (`lib/sync/phase2.ts`, inside `capabilityRoleChangesForNotice` arm (c) block) is rewritten — after this spec a staged rename-choice pair is present in `identityLinkRenames` and arm (c) excludes it, same as cron; only a staged `independent` (or a genuine removal) reaches arm (c).

### 3.4 Behavior matrix

| Path × resolution | Identity | Capability audit (holder, unchanged flags) | Capability audit (flag delta) | Feed |
|---|---|---|---|---|
| Cron auto (MI-12; MI-13/14 version-bound accept) | in-place, preserved (unchanged) | none (unchanged) | arm (a) single (unchanged) | `crew_renamed` (unchanged) |
| Staged `rename` (MI-12/13/14) | **in-place, preserved (NEW)** | **none (was: arm (c) loss + arm (b) grant)** | **arm (a) single (was: loss+grant)** | `crew_renamed` (unchanged; `before_image.id` now matches live row) |
| Staged `independent` (MI-13/14) | delete+insert, fresh id (unchanged) | arms (c)+(b) loss+grant (unchanged) | arms (c)+(b) (unchanged) | remove+add rows via diff (unchanged, R33-2) |
| Staged `reject` (MI-12) | discard, no mutation (unchanged) | n/a | n/a | none |
| Wizard Phase B first-seen | no prior crew, helper no-ops (unchanged) | arm (b) grants only (unchanged) | n/a | `feedPolicy: none` (unchanged) |

Explicitly unchanged surfaces: `sync_audit` row (items + choices + derived side effects), `deriveAuthSideEffects` (revoke floors still list both names for a rename; the default bump is a no-op — auth table retired M9.5), `choiceAwareFeedItems`, `writeAutoApplyChanges`, the `undo_change` RPC, all MI-11 hold machinery.

### 3.5 Docs amendments (same branch)

1. Role-flags spec `docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md`: append a dated supersession note to §2.5, the §2.1 arm-(c) exclusion paragraph, and do-not-relitigate item 2h — "superseded 2026-08-03 by this spec: the staged rename-choice path now threads `identityLinkRenames`; the loss+grant audit shape for that path is retired; `independent` remains remove+add with arms (c)/(b)." Existing text stays (history), the note redirects.
2. `lib/sync/applyStagedCore.ts` step-3 comment + `lib/sync/phase2.ts` arm-(c) comment per §3.2/§3.3.
3. BACKLOG.md: graduate `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` to `BACKLOG-archive.md` at close-out.

## 4. Tests

All new tests derive expectations from fixture state (pre-apply row ids captured, then compared) — never hardcoded ids. Failure mode named per test.

1. **Helper unit** (`tests/sync/identityLinkRenames.test.ts`, extend): `computeStagedIdentityLinkRenames` — (a) MI-12/MI-13/MI-14 each with `rename` choice → linked pair from `removed_name`/`added_name`; (b) MI-13 + MI-14 with `independent` → `[]`; (c) mixed rename+independent set → only the rename pairs; (d) non-rename invariants (MI-11, orphan variants, asset invariants) with `apply` → never linked; (e) empty items → `[]`. Catches: a link emitted for an unvouched pair (identity merge of two people), or a rename choice dropped (silent identity churn).
2. **Core unit** (`tests/sync/applyStaged.test.ts` or sibling, via `deps.runPhase2` spy): (a) MI-12 rename choice → spy receives `identityLinkRenames: [{removedName, addedName}]`; (b) MI-13 independent → spy args carry NO `identityLinkRenames` key (spread absent, mirroring the cron length-gate); (c) mixed → only rename pairs present. Catches: threading regression (the bug this spec fixes) and spread-when-empty drift.
3. **DB identity preservation** (new, `tests/sync/` db test, FakePhase2Tx-free — real `runPhase2` against the db harness used by `tests/sync/applyParseResult.identityLink.db.test.ts`): staged-core apply with an MI-12 rename choice on a member with non-null `claimed_via_oauth_at` → same `crew_members.id`, `claimed_via_oauth_at` preserved, new name live. Contrast case: MI-13 `independent` → old row gone, successor has a DIFFERENT id and `claimed_via_oauth_at IS NULL`. Catches: the oauth-orphan bug end-to-end; and the reverse regression (independent accidentally linking).
4. **Capability-notice flip** (extend the phase2-level or core-level notice tests): staged rename choice, holder with unchanged `["LEAD","A1"]` → NO `ROLE_FLAGS_NOTICE`, NO `LEAD_ROLE_APPLIED`; staged rename choice with a capability delta → exactly one arm (a) change entry (correct `prior_flags` via the rename map); staged `independent` on a holder → arms (c)+(b) loss+grant still fire. Catches: phantom-loss audit surviving the flip, or the flip over-reaching into `independent`.
5. **Undo round-trip** (db, mirroring `tests/db/undo-change-direction-a.test.ts` in-place fixture): staged in-place rename → `crew_renamed` row → `undo_change` → prior name restored with the ORIGINAL id. Catches: an undo interaction regression from the apply-shape change.
6. **Existing suites green untouched**: g2 R33-2 assertions (`tests/onboarding/finalizeCasFullApply.db.test.ts`), `tests/sync/phase2.test.ts` arm tests, `tests/sync/applyParseResult.identityLink*.test.ts`.

## 5. Documented limits

- A rename pair touching a held (MI-11) or delete-protected name degrades to delete+insert (existing `applyParseResult` guard; fail-safe re-pick, never a wrong identity). Unchanged.
- `renameCrewMember` no-ops on target-name collision / missing source (existing contract). The pair then lands as delete+insert. Unchanged.
- Historical staged renames that already churned ids stay churned (Resolved #5).
- A staged `rename` choice on an MI-13/14 pair that the admin confirms *incorrectly* (two genuinely different people) merges their identity — identical to the cron accepted-apply exposure; the vouch is the admin's, by design (`lib/sync/identityLinkRenames.ts` header doc).

## 6. Invariant compliance

- **Locks (invariant 2):** no change — the core adopts the caller's held lock (`assertShowLockHeld`); no new holder, topology untouched.
- **Mutation surfaces (invariant 10):** no new route/action; the change is internal to an already-instrumented apply core.
- **Supabase call-boundary (invariant 9):** no new Supabase client call sites.
- **UI (invariant 8):** none. The plan carries `impeccable-gate: N/A — no UI surface`.
- **DB:** no migration, no CHECK/enum change (tier×domain matrix: N/A — no DDL, no RPC, no trigger, no cleanup change; the only DB-adjacent surface is the existing `renameCrewMember` UPDATE already shipped for cron).
- **TDD (invariant 1):** every task in the plan is failing-test-first.
