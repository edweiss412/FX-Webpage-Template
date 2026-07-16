# Role-mapping overlay in the wizard staging/rescan pipeline

**Date:** 2026-07-16 · **Backlog:** `BL-ROLE-VOCAB-STAGING-OVERLAY` · **Deferral:** `DEFERRED.md` ROLE-VOCAB-2 (extend-role-scope-vocab whole-diff R1 F1) · **Parent spec:** `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md` (PR #396)

## 1. Problem

The wizard staging pipeline parses without the role-mapping overlay — only `runPhase2` at apply/publish runs `applyRoleTokenMappings` (`lib/sync/phase2.ts:287`). Consequences:

1. **Stale step-3 preview.** A just-recognized role's `UNKNOWN_ROLE_TOKEN` warning persists in the staged parse until publish; the admin sees the warning they just resolved.
2. **`mapRoleTokenStaged`'s `"applied"` branch is unreachable.** The action re-stages via `rescanWizardSheet` and checks whether the refreshed staged parse still carries the token's warning (`app/admin/onboarding/_actions/roleTokenStaged.ts:159-177`) — it always does, so every wizard save resolves `"apply_pending"`. The parent spec ratified this as an implementation amendment (§8.3, 2026-07-16) reserving the `"applied"` branch for this integration.
3. **Wizard-published shows start without grants.** The wizard finalize path does NOT thread `roleTokenMappings` — `finalize-cas` omits the arg and `applyStagedCore` defaults it (`lib/sync/applyStagedCore.ts:598` — `args.roleTokenMappings ?? []`; the loader at `lib/sync/applyStaged.ts:1376-1385` belongs to the LIVE dashboard staged-apply, a different caller). A show published through the wizard therefore carries the unconsumed warning and lacks the mapping's flags until its first post-publish cron sync. (The parent spec's amendment phrase "the staged-apply path threads `roleTokenMappings`, tested" refers to the live dashboard path only; this spec corrects the imprecision.)

Making the STAGED parse post-overlay fixes all three at once: the published output of a wizard finalize is the staged parse, so overlay-at-staging propagates to publish with finalize unchanged.

## 2. Resolved decisions (brainstormed 2026-07-16, user-approved)

- **Approach: real overlay in the staging core**, not a use-raw-style decision-display state. Chosen over display-only because the backlog title, the reserved `"applied"` contract branch, and honest step-3 counts/flags all want true post-overlay staged data.
- **Chokepoint: `prepareOnboardingFiles`** (`lib/sync/runOnboardingScan.ts:1088`) — the single pre-lock prepare shared by every wizard staging producer: initial onboarding scan (`runOnboardingScan.ts` internal callers), per-sheet rescan (`lib/onboarding/rescanWizardSheet.ts:143`), the finalize-inline rescan heal (same rescan core), and single-file retry (`lib/sync/retrySingleFile.ts:243`).
- **Loader: new injectable dep `readRoleTokenMappings`**, mirroring `readPullSheetOverride` (`runOnboardingScan.ts:1106`, default `defaultReadPullSheetOverride` at `:279`): default implementation opens its own short-lived `postgres()` connection, `jsonb_agg`-reads `role_token_mappings` (same SQL shape as `lib/sync/runManualStageForFirstSeen.ts:104-109`), and validates through `normalizeRoleTokenMappings` (`lib/sync/roleMappingOverlay.ts:27` — the single validation boundary, §6.2 of the parent spec). Loaded **once per `prepareOnboardingFiles` call** (the vocabulary is global, not per-file), before the per-file concurrency loop.
- **Best-effort posture (do not relitigate):** a loader fault degrades to `[]` → overlay no-op → pre-this-feature staging behavior, and the save action truthfully resolves `"apply_pending"`. This mirrors the documented `readPullSheetOverride` posture verbatim ("a fault here must NEVER wedge the pre-lock prepare", `runOnboardingScan.ts:275-277`) — fail-safe direction, converges at the next rescan/cron sync.
- **No telemetry at staging.** Staging is preview, not apply; §10 of the parent spec pins the three emitting apply surfaces and stays unchanged. `applyRoleTokenMappings`' `applied[]` return is discarded at the staging call site.
- **Wizard finalize stays un-threaded (`[]`).** Preview==publish parity: finalize publishes exactly the staged parse the admin reviewed. A mapping created AFTER the last restage (settings page, or another show's control) does not apply at that publish; it converges on the show's first post-publish cron sync — the same convergence class every live show already has for settings-page edits (parent spec §7). Threading fresh mappings at finalize would make publish diverge from the reviewed preview and is explicitly out of scope.
- **No finalize freshness gate for revoked/narrowed mappings (considered and rejected — do not relitigate).** A mapping deleted or narrowed between staging and finalize means the staged parse publishes with the staging-time grants baked in, converging on the first post-publish cron sync. This is NOT a new posture: the parent spec ratified exactly this convergence semantics for the settings mutation paths — "Settings-page `update`/`delete` return plain ok/error — no attached re-sync, convergence is cron-driven (§7)" (parent spec §8.3, held through 14 adversarial rounds) — and every already-published live show has the identical window today (delete a mapping → live shows carry its grants until their next sheet check; `role_flags` are rebuilt from the fresh parse + current vocabulary on every sync, never accumulated, so convergence is structural and downward-capable). Grantable flags gate crew-page tile visibility (parent spec §1: capability checkboxes gating scope tiles), a class the project treats as admin-correctable display scope, not a security boundary (M11.5 pivot: role filtering is UX, not security). The fail-closed alternative (persist a staging-time applied-mappings snapshot in `parse_result`, thread it through the Flow-B shadow payload like `useRawDecisions`, add a finalize refuse branch + cataloged code + rescan-heal path) buys a shorter window for a revoke-then-publish-without-rescan sequence that the settings paths already leave open everywhere else, at the cost of a new finalize refusal surface. If the project later tightens revocation semantics, it must tighten the settings/cron class first (that window exists on every show, not just wizard publishes); a wizard-only gate would be security theater. Escalation trigger for that future work: an actual mis-scoped-tile report from Doug.

## 3. Design

### 3.1 Loader

In `lib/sync/runOnboardingScan.ts`:

```ts
readRoleTokenMappings?: () => Promise<RoleTokenMapping[]>;
```

added to `RunOnboardingScanDeps` beside `readPullSheetOverride` (`:207`). Default `defaultReadRoleTokenMappings`: own short-lived `postgres(databaseUrl(), { max: 1, prepare: false })` connection (exact `defaultReadPullSheetOverride` mechanics, `:279-301` — including `sql.end({ timeout: 5 }).catch(() => {})`), query:

```sql
select coalesce(jsonb_agg(jsonb_build_object(
    'token', token, 'grants', grants, 'decided_by', decided_by, 'decided_at', decided_at)), '[]'::jsonb) as rows
  from role_token_mappings
```

result through `normalizeRoleTokenMappings`; any thrown fault → `[]`. Tests inject a stub to bypass the DB (existing dep pattern).

The `.trim()`/`.toLowerCase()` email-guard sweep: this loader adds no inline normalization calls; `normalizeRoleTokenMappings` already carries its `// canonicalize-exempt:` markers (`roleMappingOverlay.ts:36,40`).

### 3.2 Overlay application point

Inside `prepareOnboardingFiles`' per-file `prepareOne` (`runOnboardingScan.ts:1116`), after BOTH parse-producing branches have settled and before anchor attachment:

1. after `finalizeArchivedTabs(parseResult, archivedPullSheetTabs)` (`:1139`) for the normal branch, and
2. after the `discardAndRerun` reassignment `parseResult = discard.parseResult` (`:1171`) for the I5b content-drift branch,
3. **before `attachWarningAnchors(parseResult.warnings, …)`** (`:1209`) — consumed warnings never exist to receive anchors, so no dead anchor work and no anchored-then-removed inconsistency.

Application: `parseResult = applyRoleTokenMappings(parseResult, mappings).result` — one site, placed after the discard branch so it covers both parse paths. `applyRoleTokenMappings` (`lib/sync/roleMappingOverlay.ts:62`) is pure and fail-closed: it unions grants onto the crew row via `blockRef.index`, removes the consumed warning, and leaves corrupt/missing anchors untouched (warning stays — `:81-84`). Legacy warnings without `roleToken` are skipped by construction (`:73-76`).

The overlaid parse then flows unchanged into every existing consumer: the staging upsert (`pending_syncs.parse_result`), data-gap summaries, warning anchors, source anchors, the rescan decision core, and — at finalize — the shadow payload and `applyStagedCore`.

### 3.3 What each surface inherits (no further code changes)

| Surface | Effect |
| --- | --- |
| Step-3 review (`components/admin/wizard/step3ReviewSections.tsx`) | Warning line + section counts reflect post-overlay state; recognized roles show no warning; staged crew `role_flags` include grants. No component change — data-driven. |
| `mapRoleTokenStaged` (`roleTokenStaged.ts:159-177`) | The re-stage now parses post-overlay → refreshed staged parse lacks the token's warning → `state: "applied"` becomes reachable. The component's `"applied"` branch already exists and is tested (`components/admin/RoleRecognizeControl.tsx:45`). Provenance check (`:94-108`) stays consistent: an already-mapped token's warning is consumed at staging, so no control renders and no create is attempted; re-saves route through the existing-row set-equal branch. |
| Rescan clean/dirty (`lib/onboarding/rescanDecision.ts:30`) | Safe by construction: dirty fires only on a NON-ambiguity gap-class count **increase** (`:46-48`); the overlay only removes warnings. MI invariants compare lead-flag transitions only (`lib/parser/invariants.ts:535` `hasLeadFlag`); grantable flags are `A1/V1/L1/FINANCIALS` (`roleMappingOverlay.ts:4`), never a lead flag, so a role_flags union cannot trip MI-9/MI-10. |
| Wizard finalize (`finalize-cas`/`finalize` routes) | Publishes the post-overlay staged parse as-is. `runPhase2`'s second overlay pass (with `[]` on this path) is a no-op; even where mappings ARE threaded (live staged-apply, cron), the overlay is idempotent — the consumed warning is absent, so `applied[]` is empty and flags are already unioned. |
| First post-publish cron sync | Loads fresh mappings (existing); converges anything created after the last restage. Steady-state silent: the delta gate compares against prior-persisted state (`roleMappingOverlay.ts:109`), and post-publish persisted flags already include the staged grants. |

Out of scope (unchanged surfaces): the LIVE staging path (`lib/sync/phase1.ts` `stage` outcome for published shows, and `runManualStageForFirstSeen.ts` — its parse is pre-fetched by cron-style export, not `prepareOnboardingFiles`); the live dashboard staged-apply; the use-raw decision-display mechanism; all UI files.

### 3.4 Convergence windows (accepted, documented)

- **Mapping deleted/narrowed between staging and finalize:** the staged parse has grants baked and the warning consumed; finalize publishes them. The next cron sync re-parses fresh, re-emits the warning, and the overlay (with the current vocabulary) grants only what the current row says — flags converge downward because `role_flags` are rebuilt from the parse each sync, not accumulated. Same class as the live-show window between a settings edit and the next sync (parent spec §7).
- **Mappings-read TOCTOU:** the vocabulary is read pre-lock; a row created/changed between the read and the staging write leaves the staged parse one step behind. Benign — next rescan or the post-publish cron sync converges. No snapshot protocol (unlike `pull_sheet_override`, staleness here cannot resurrect unauthorized content; it only delays recognition).

## 4. Guard conditions (per input)

| Input | Shape | Behavior |
| --- | --- | --- |
| `readRoleTokenMappings` result | `[]` (empty vocabulary) | `applyRoleTokenMappings` early-returns clone, zero behavior change (`roleMappingOverlay.ts:68`). |
| | loader throws / DB unreachable | caught → `[]` → overlay no-op; scan proceeds (best-effort posture §2). |
| | corrupt rows | dropped by `normalizeRoleTokenMappings` (never throws). |
| Parse warnings | no `UNKNOWN_ROLE_TOKEN` entries | overlay iterates and keeps everything — no-op. |
| | legacy warning without `roleToken` | skipped (`:73-76`), warning stays — existing fail-closed contract. |
| | warning with corrupt/missing `blockRef` | warning kept, no flag change (`:81-84`) — existing fail-closed contract. |
| Crew members | empty `crewMembers` with a mapped warning | index guard fails (`idx >= result.crewMembers.length`) → warning kept, fail-closed. |
| Mapping grants | `[]` (recognize-only) | warning consumed, flags unchanged — parity with phase2 semantics. |

No nulls/NaN surfaces beyond these: the dep returns a validated array; `prepareOnboardingFiles` inputs are otherwise untouched.

Not applicable (declared per checklist): dimensional invariants / transition inventory (no UI change); tier×domain matrix (no DDL/CHECK/RPC/trigger change — one read-only SQL SELECT added); flag lifecycle table (no new config flag); CHECK/enum migration matrix (no schema change).

## 5. Parent-spec amendment reversal

`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md` §8.3 (`:209`) — the **RATIFIED IMPLEMENTATION AMENDMENT (2026-07-16, whole-diff R1 F1)** block is superseded: replace its body with a pointer stating the staging-overlay integration shipped (this spec), the staged `"applied"` branch is reachable (re-stage completes AND the refreshed staged parse no longer carries the token's warning — the pre-existing Codex R14 F1 rule, unchanged), and correct "the staged-apply path threads `roleTokenMappings`, tested" to name the live dashboard staged-apply (`applyStaged.ts:1376`) explicitly. The amendment's other content (Settings update/delete return plain ok/error; built-in guard scope) is untouched. This file is NOT the master spec (`2026-04-30-fxav-crew-pages-v1.md`) — no §12.4 lockstep obligations; no error-code catalog rows change.

Doc closures land as explicit implementation-plan tasks on this branch (the spec commit precedes them by design — at spec-review time the branch deliberately contains only this file): the parent-spec §8.3 amendment edit above, a resolution line on `DEFERRED.md` ROLE-VOCAB-2, and a ✅ SHIPPED status line on `BACKLOG.md` `BL-ROLE-VOCAB-STAGING-OVERLAY`. All three ship in the same PR as the code; the implementation plan carries them as a numbered task so they cannot be dropped.

## 6. Telemetry & observability

- No new events. `ROLE_TOKEN_MAPPED` surfaces and gates are untouched (parent spec §10 stays the single source).
- Invariant 10: this change adds no new mutation surface — `prepareOnboardingFiles` is a pre-lock read/parse phase; the staging writes it feeds are existing instrumented surfaces. The new loader is a read (no emit obligation).
- Invariant 9: the loader uses postgres.js (`tx`-free short connection), not a Supabase client builder — the Supabase call-boundary meta-test does not apply; the catch-all fault handling is the documented best-effort posture.

## 7. Test plan

Unit (`tests/sync/` — vitest, DB-free via injected deps):

1. **Overlay applied at prepare:** `prepareOnboardingFiles` with a stubbed `readRoleTokenMappings` returning a mapping and a fixture sheet producing that token's `UNKNOWN_ROLE_TOKEN` → prepared `parseResult` has the warning consumed and the crew row's `role_flags` unioned. Assert against the parse data (`parseResult.warnings` / `crewMembers[i].role_flags`), not any renderer (anti-tautology).
2. **Once-per-scan load:** loader stub called exactly once for a multi-sheet folder listing.
3. **Best-effort fault:** loader stub throws → prepared parse identical to the no-mapping case (warning present, flags without grants); scan does not throw. Failure mode caught: a DB blip wedging every onboarding scan.
4. **Discard-rerun branch coverage:** an override content-drift fixture (I5b path) → the RE-parsed result is also post-overlay. Failure mode: overlay applied only on the normal branch, silently skipped after `discardAndRerun`.
5. **Anchor ordering:** consumed warning receives no anchor work; remaining warnings still get anchors (assert `attachWarningAnchors` input excludes the consumed warning via a spy on the warnings array it receives).

Integration:

6. **Staged `"applied"` reachable:** `mapRoleTokenStaged` end-to-end with the re-stage running a prepare whose loader sees the just-written row → `{ ok: true, state: "applied" }`. Failure mode: the deferred bug itself.
7. **Rescan stays clean on consumption:** prior staged parse pre-overlay (warning present), refreshed post-overlay → `computeRescanDecision` not dirty; rescan outcome is an `updated` non-demoted shape. Failure mode: recognizing a role demotes an approved sheet.
8. **Existing-suite sweep:** any test asserting a staged parse retains `UNKNOWN_ROLE_TOKEN` post-mapping, or asserting `mapRoleTokenStaged` always resolves `apply_pending`, is updated to the new contract (the parent-spec test pinning "re-stage failure after durable upsert → `apply_pending`" stays — that branch is unchanged).

Meta-test inventory (declared per AGENTS.md writing-plans rule, decided at spec time):

- `tests/sync/roleMappingThreading.test.ts` (Phase2Args threading walker): **no change needed** — the new overlay site is not a `Phase2Args` assembly; the walker's scope is untouched and stays green.
- `tests/observe/_metaReadOnlyQueryCore.test.ts`, `_metaInfraContract`, advisory-lock topology test: **none applies** — no observe-core file, no Supabase-builder call in auth domain, no new lock holder (the loader is pre-lock and lock-free; staging writes keep their existing single holders).
- No new meta-test: the chokepoint is structural (all wizard staging producers import `prepareOnboardingFiles`); test 1 pins the behavior at the chokepoint itself.

## 8. Out of scope

- Threading `roleTokenMappings` into `finalize-cas`/`finalize` (§2 parity rationale).
- The live phase1 staging path and its dashboard review surface.
- `BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID` (separate backlog item).
- Any UI file change (invariant-8 dual-gate not triggered; confirmed no `app/` non-api, `components/`, or token/CSS file in the expected diff).
