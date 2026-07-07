# Spec — Flow 4.1: Gate single-crew drops on published shows

**Date:** 2026-07-07
**Slug:** `flow4-gate-single-crew-drop`
**Source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §5 P0-1, §6 Flow 4 item 4.1, §7 item 2.
**Scope:** PR #1 of the Flow-4 arc. Items 4.2 (recently-auto-applied strip + undo) and 4.3 (roster-shift badge input) are **explicitly deferred** to a later PR #2.

---

## 1. Problem (P0-1)

On a **published** (crew-live) show, a re-sync that removes exactly **one** crew member auto-applies **silently**. MI-6 (crew-shrinkage guard) fires only when `crewDrop > 1` (`lib/parser/invariants.ts:251`), so the single-drop case never reaches the material-shrink hold. The removal instead falls to MI-13/MI-14 orphan-remove handling, which is a *notification* class — it auto-applies and writes an undoable `show_change_log` orphan-remove row (`lib/sync/changeLog/writeAutoApplyChanges.ts`) that appears nowhere Doug looks (not in needs-attention, not a data gap). A crew member loses their live page (or their picker identity), and a non-technical Doug has no unaided path to learn why.

The exact real-world trigger: "Doug deleted or moved one crew row in the sheet mid-edit," then a cron/push/manual re-sync lands it on the published page.

## 2. Goal

A single-crew-member removal on a **published** show routes through the **existing** `shrink_held` confirm path — last-good stays live, Doug gets the `RESYNC_SHRINK_HELD` alert + the `ReSyncButton` confirm ("This re-sync would reduce the show: crew 5→4 …"), and nothing changes on the crew page until he explicitly accepts. Draft/unpublished shows keep auto-applying single drops (no setup friction).

## 3. Design (Option A — `runInvariants` stays pure)

Publish state is **not** available to `runInvariants(prior, next)` (a pure function over two `ParseResult`s, no DB). Rather than thread `published` into the pure function and re-baseline its entire test suite, we localize publish-awareness to `lib/sync/phase1.ts`, where the `show` row already lives.

### 3.1 Invariant layer — unchanged

`lib/parser/invariants.ts:251` MI-6 keeps `crewDrop > 1`. No edit. Its existing tests are untouched.

### 3.2 Sync layer — synthesize MI-6 for the published single-drop gap

In `runPhase1` (`lib/sync/phase1.ts`), the `materialShrinkItems` computation (currently `lib/sync/phase1.ts:422-425`, filtering `reviewItems` for `MI-6`/`MI-7`) is augmented: when the show is an existing **published** show and the net crew delta is **exactly 1**, a synthetic MI-6 item `{ id: randomUUID(), invariant: "MI-6" }` is included in `materialShrinkItems`.

Precise predicate (evaluated only where `show` is non-null and `args.mode !== "onboarding_scan"` — the same guard the existing `materialShrinkItems` uses):

```
crewDrop = show.priorParseResult.crewMembers.length - args.parseResult.crewMembers.length
synthesizeSingleDropHold = show.published === true && crewDrop === 1
```

- `crewDrop === 1` is **exactly** the gap MI-6 (`> 1`) misses, so the synthetic item **never** coexists with a real MI-6 item and **never** double-counts in `describeShrink` (`lib/sync/phase1.ts:212-229`, which emits one `crew N→M` part per MI-6 item).
- `crewDrop > 1` on a published show already produces a real MI-6 → unchanged.
- `crewDrop >= 1` on an **unpublished** show: only the real MI-6 (`> 1`) fires; single drop (`=== 1`) is **not** synthesized → auto-applies as today.

Everything downstream of `materialShrinkItems.length > 0` is reused verbatim (`lib/sync/phase1.ts:426-453`): the `updateShowShrinkHeld` tx call, the `shrink_held` outcome, `heldModifiedTime`, `shrinkItems`, `showId`. On accept (`args.acceptShrink === true && args.expectedModifiedTime === args.binding.modifiedTime`), control falls through exactly as today — the single removal applies and writes its `show_change_log` orphan-remove row.

### 3.3 Publish threading

Add `published: boolean` as a **REQUIRED** field to `Phase1ShowRow` (`lib/sync/phase1.ts:23-39`), positioned adjacent to the existing `priorParseWarningsRaw` REQUIRED field. REQUIRED (not `?: boolean`) forces every `Phase1ShowRow` producer to supply it explicitly — a producer that omits it fails typecheck rather than silently defaulting to a publish state (the exact fail-loud rationale documented for `priorParseWarningsRaw` at `lib/sync/phase1.ts:34-38`). An optional field defaulting to "published" would be a footgun: a producer forgetting it would silently gate single-drops.

Producers (all must supply `published`):

| Site | file:line | Action |
|---|---|---|
| Real cron/push/manual producer | `lib/sync/runScheduledCronSync.ts:769` (inline row type ~:770-790) + assembly `:862` | Add `published: boolean;` to the `select *` inline type; add `published: show.published` to the returned object. |
| Manual-stage first-seen producer | `lib/sync/runManualStageForFirstSeen.ts` | Only supply `published` if it constructs a non-null `Phase1ShowRow`; its `readShowForPhase1` returns `null` for first-seen, so likely no change (verify at impl). |
| Onboarding-scan producer | `lib/sync/runOnboardingScan.ts:383` | `readShowForPhase1()` returns `null` — no `Phase1ShowRow` constructed, **no change**. |
| Test doubles (~17 files) | every file supplying `priorParseWarningsRaw` (grep) | Add `published: <bool>` to each `Phase1ShowRow` literal, defaulting to `true` unless the test asserts unpublished behavior. |

The real producer already runs `select *` from `public.shows` (`lib/sync/runScheduledCronSync.ts:794-800`), so `show.published` is present at runtime — only the TS type annotation and the mapping line are added. No new query, no migration.

## 4. Behavior matrix

| show state | crewDrop | today | after |
|---|---|---|---|
| `published=true` | 1 | auto-applies (silent — P0-1) | **`shrink_held`** |
| `published=true` | >1 | `shrink_held` | `shrink_held` (unchanged) |
| `published=false` (draft/unpublished) | 1 | auto-applies | auto-applies (no friction) |
| `published=false` | >1 | `shrink_held` | `shrink_held` (unchanged) |
| first-seen (`prior === null`) | n/a | MI-6 skipped | skipped (unchanged) |
| `onboarding_scan` mode | any | excluded (`phase1.ts:423`) | excluded (unchanged) |

## 5. Guard conditions

- **`crewDrop === 0`** (roster unchanged, or a pure rename netting zero via MI-13/14): predicate false → no synthetic item. Unchanged behavior.
- **`crewDrop` negative** (crew *added*): `=== 1` false → no synthetic item.
- **`crewDrop === 1` but it is a rename+removal combo netting 1** (one true removal plus one rename pair): net delta is still 1 → held. Correct: a net roster loss of one on a published show should confirm.
- **`show === null`** (first-seen): the `materialShrinkItems` guard already short-circuits to `[]`; the synthetic branch is inside that guard → never evaluated. `prior === null` also means MI-6 never runs in `runInvariants`.
- **`show.published === undefined`**: cannot occur — `published` is `boolean NOT NULL` in DDL and REQUIRED in the type; the strict `=== true` comparison is defensive regardless.
- **Accept-with-stale-modtime**: if Doug confirms but Drive's `modifiedTime` advanced (he edited again between prompt and confirm), `acceptedThisVersion` is false → re-holds with fresh counts. Unchanged existing behavior; the synthetic item participates identically.

## 6. Flag lifecycle — `shows.published`

| Dimension | Value |
|---|---|
| **Storage** | `public.shows.published` — `boolean NOT NULL DEFAULT true` (`supabase/migrations/20260501000000_initial_public_schema.sql:21`) |
| **Write paths** | Published toggle on the show page + emailed auto-publish undo link → `lib/showLifecycle/unpublishShow.ts`; interim onboarding shows inserted `published=false` (`lib/onboarding/sessionLifecycle.ts:583`) |
| **Read paths (existing)** | crew-page access gate `lib/auth/picker/resolveShowPageAccess.ts:196` (`if (!showRow.published) return {kind:'unpublished'}`); `lib/admin/step3DisplayState.ts:55` crew-visibility |
| **Read path (new)** | `Phase1ShowRow.published` ← `readShowForPhase1` → consumed in `runPhase1` single-drop-hold predicate |
| **Effect on output** | Gates whether `crewDrop === 1` on an existing show routes to `shrink_held` (published) vs auto-applies (unpublished) |

`published` is a real, exercised toggle (not a zombie flag) — the new read path adds one consumer to an existing lifecycle.

## 7. Tier × domain / migration matrix

**N/A — no DB change.** The `published` column already exists (`20260501000000_initial_public_schema.sql:21`). No DDL, no CHECK, no enum, no RPC, no trigger, no cleanup, no new frontend surface, no `admin_alerts` catalog row (`RESYNC_SHRINK_HELD` already exists — see §8). No `pnpm gen:schema-manifest` regeneration, no validation-project apply. The `validation-schema-parity` gate is unaffected.

## 8. No new error code

`RESYNC_SHRINK_HELD` already exists in `lib/messages/catalog.ts` (`resolution:'auto'`, `audience:'doug'`, `adminSurface:'inbox'`) with its `__generated__/spec-codes.ts` + `__generated__/internal-code-enums.ts` rows and producer/action tests (`tests/sync/resync-shrink-held-producer.test.ts`, `tests/adminAlerts/alertActions.test.ts`). The single-drop hold raises the **same** code at the **same** caller raise-site as a multi-drop hold — the alert `detail` differs only in the humanized count string (`crew 5→4`). No §12.4 three-way-lockstep is triggered.

## 9. Mutation-surface observability (invariant 10)

No new mutation surface. The change is internal to the existing `runPhase1` decision logic and the existing `updateShowShrinkHeld` tx call, both already inside the sync path. `RESYNC_SHRINK_HELD` is already emitted post-commit by the caller's existing raise-site. No `AUDITABLE_MUTATIONS` / `KNOWN_UNINSTRUMENTED` / `// no-telemetry:` change.

## 10. Advisory-lock topology (invariant 2)

Unchanged. No `pg_advisory*` edit. `runPhase1` runs inside the caller's existing per-show advisory lock; the synthetic-item computation and the reused `updateShowShrinkHeld` call add no new lock acquisition. `tests/auth/advisoryLockRpcDeadlock.test.ts` is not extended.

## 11. Testing (TDD)

New/extended tests in `tests/sync/` (co-located with the existing `phase1.test.ts` / `resync-shrink-held-producer.test.ts` suites). Each states the concrete failure mode it catches; expected values derived from fixture roster sizes, never hardcoded to a magic constant a wrong fixture could still satisfy.

| Test | Setup | Assertion | Failure mode caught |
|---|---|---|---|
| **published single-drop holds** | existing `show` `published=true`, prior 5 crew, next 4 crew (one removed), mode `cron`, no `acceptShrink` | `outcome === "shrink_held"`; `shrinkItems` contains an MI-6 item; `message` includes `crew 5→4` (derived from fixture lengths) | the P0-1 regression — single drop silently applying |
| **unpublished single-drop applies** | same but `published=false` | `outcome !== "shrink_held"` (applies: `pass`/`auto_apply_*`); `updateShowShrinkHeld` **not** called | over-gating — holding drafts and adding setup friction |
| **published multi-drop still holds** (regression pin) | `published=true`, prior 5 crew, next 2 crew | `outcome === "shrink_held"`; exactly **one** MI-6 item (no synthetic duplicate); `message` includes `crew 5→2` | synthetic item double-firing / double-counting `describeShrink` |
| **accept path applies + feeds change log** | `published=true`, single drop, `acceptShrink=true`, `expectedModifiedTime === binding.modifiedTime` | falls through (not held); the removal applies and a `show_change_log` orphan-remove row is written | accept path broken by the new branch; confirm the reused fall-through is intact |
| **producer supplies `published`** (typecheck-level) | — | `Phase1ShowRow` REQUIRED `published` — a producer omitting it fails `tsc` | a future producer silently defaulting publish state |

Anti-tautology: the "holds" assertions check `outcome` + `shrinkItems` shape + the count string derived from `prior.crewMembers.length`→`next.crewMembers.length`, **not** merely "the function was called." The multi-drop pin asserts item *count* (exactly one MI-6) to catch the double-fire failure mode a naive "held?" assertion would miss.

## 12. Non-goals

- No in-app value editing (Flow 3).
- No new alert code, catalog row, or §12.4 edit.
- No "recently auto-applied" strip or per-row undo surface (Flow 4.2 — PR #2).
- No roster-shift `DataQualityBadge` input (Flow 4.3 — PR #2).
- No change to `runInvariants` or MI-6's threshold.
- No migration, no manifest regen, no validation-project apply.

## 13. Meta-test inventory

**None created or extended.** Producer discipline for the new `Phase1ShowRow.published` field is enforced structurally by the TypeScript REQUIRED-field type (fails `tsc` on omission), not by a runtime meta-test — identical to the `priorParseWarningsRaw` precedent. No Supabase call-boundary, admin-alert-catalog, sentinel-hiding, advisory-lock, or email-normalization meta-test surface is touched.

## 14. Disagreement-loop preempts (do NOT relitigate)

- **`runInvariants` stays pure / MI-6 keeps `> 1`.** Ratified design choice (Option A). Publish state is unavailable to a pure `(prior, next)` function; threading it there would re-baseline the entire invariants suite for zero behavioral gain over synthesizing in `phase1`. The synthetic MI-6 is the deliberate, minimal seam.
- **REQUIRED `published`, not optional.** Deliberate — mirrors `priorParseWarningsRaw` (`lib/sync/phase1.ts:34-38`). Optional-with-default is the rejected footgun (silent publish-state default).
- **Unpublished single-drop auto-applies (not held).** Intentional per audit §6 Flow 4 ("published" scoping) — draft/paused shows must stay friction-free; `published=false` is the escape hatch.
- **No new §12.4 code.** `RESYNC_SHRINK_HELD` already covers material-shrink holds; single-drop is the same class with a different count string.
- **~17 test-double edits are expected, not scope-creep.** The REQUIRED field's blast radius is every `Phase1ShowRow` producer; touching each is the fail-loud contract working as designed.

## 15. Citations

All verified against worktree HEAD `c0c157b` (origin/main) this session:

- `lib/parser/invariants.ts:250-253` — MI-6 `crewDrop > 1`.
- `lib/sync/phase1.ts:23-39` — `Phase1ShowRow` type + `priorParseWarningsRaw` REQUIRED precedent.
- `lib/sync/phase1.ts:212-229` — `describeShrink` (one `crew N→M` per MI-6 item).
- `lib/sync/phase1.ts:411-453` — `materialShrinkItems` filter, guard, `shrink_held` outcome, accept bypass.
- `lib/sync/runScheduledCronSync.ts:769-800` — real producer `select *`; `:862` assembly.
- `lib/sync/runOnboardingScan.ts:383` — onboarding `readShowForPhase1` → `null`.
- `lib/sync/runManualStageForFirstSeen.ts:147` — first-seen `priorParseWarningsRaw: null`.
- `supabase/migrations/20260501000000_initial_public_schema.sql:21` — `shows.published boolean NOT NULL DEFAULT true`.
- `lib/showLifecycle/unpublishShow.ts` — unpublish write path.
- `lib/auth/picker/resolveShowPageAccess.ts:196` — crew-page publish gate.
- `lib/onboarding/sessionLifecycle.ts:583` — interim shows `published=false`.
- `lib/sync/changeLog/writeAutoApplyChanges.ts` — orphan-remove `show_change_log` row.
- `components/admin/ReSyncButton.tsx:155-190` — shrink confirm UX.
