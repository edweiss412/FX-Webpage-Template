# Role-mapping overlay in the wizard staging/rescan pipeline

**Date:** 2026-07-16 · **Backlog:** `BL-ROLE-VOCAB-STAGING-OVERLAY` · **Deferral:** `DEFERRED.md` ROLE-VOCAB-2 (extend-role-scope-vocab whole-diff R1 F1) · **Parent spec:** `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md` (PR #396)

## 1. Problem

The wizard staging pipeline parses without the role-mapping overlay — only `runPhase2` at apply/publish runs `applyRoleTokenMappings` (`lib/sync/phase2.ts:287`). Consequences:

1. **Stale step-3 preview.** A just-recognized role's `UNKNOWN_ROLE_TOKEN` warning persists in the staged parse until publish; the admin sees the warning they just resolved.
2. **`mapRoleTokenStaged`'s `"applied"` branch is unreachable.** The action re-stages via `rescanWizardSheet` and checks whether the refreshed staged parse still carries the token's warning (`app/admin/onboarding/_actions/roleTokenStaged.ts:159-177`) — it always does, so every wizard save resolves `"apply_pending"`. The parent spec ratified this as an implementation amendment (§8.3, 2026-07-16) reserving the `"applied"` branch for this integration.
3. **Wizard-published shows start without grants.** The wizard finalize path does NOT thread `roleTokenMappings` — `finalize-cas` omits the arg and `applyStagedCore` defaults it (`lib/sync/applyStagedCore.ts:598` — `args.roleTokenMappings ?? []`; the loader at `lib/sync/applyStaged.ts:1376-1385` belongs to the LIVE dashboard staged-apply, a different caller). A show published through the wizard therefore carries the unconsumed warning and lacks the mapping's flags until its next PROCESSED sync — and cron does not process an unmodified sheet (see §3.4 "Convergence reality"), so absent a sheet edit that state persists until a manual sync. (The parent spec's amendment phrase "the staged-apply path threads `roleTokenMappings`, tested" refers to the live dashboard path only; this spec corrects the imprecision.)

Making the STAGED parse post-overlay fixes all three at once: the published output of a wizard finalize is the staged parse, so overlay-at-staging propagates to publish with finalize unchanged.

## 2. Resolved decisions (brainstormed 2026-07-16, user-approved)

- **Approach: real overlay in the staging core**, not a use-raw-style decision-display state. Chosen over display-only because the backlog title, the reserved `"applied"` contract branch, and honest step-3 counts/flags all want true post-overlay staged data.
- **Chokepoint: `prepareOnboardingFiles`** (`lib/sync/runOnboardingScan.ts:1088`) — the single pre-lock prepare shared by every wizard staging producer: initial onboarding scan (`runOnboardingScan.ts` internal callers), per-sheet rescan (`lib/onboarding/rescanWizardSheet.ts:143`), the finalize-inline rescan heal (same rescan core), and single-file retry (`lib/sync/retrySingleFile.ts:243`).
- **Loader: new injectable dep `readRoleTokenMappings`**, mirroring `readPullSheetOverride` (`runOnboardingScan.ts:1106`, default `defaultReadPullSheetOverride` at `:279`): default implementation opens its own short-lived `postgres()` connection, `jsonb_agg`-reads `role_token_mappings` (same SQL shape as `lib/sync/runManualStageForFirstSeen.ts:104-109`), and validates through `normalizeRoleTokenMappings` (`lib/sync/roleMappingOverlay.ts:27` — the single validation boundary, §6.2 of the parent spec). Loaded **once per `prepareOnboardingFiles` call** (the vocabulary is global, not per-file), before the per-file concurrency loop.
- **Best-effort posture (do not relitigate):** a loader fault degrades to `[]` → overlay no-op → pre-this-feature staging behavior, and the save action truthfully resolves `"apply_pending"`. This mirrors the documented `readPullSheetOverride` posture verbatim ("a fault here must NEVER wedge the pre-lock prepare", `runOnboardingScan.ts:275-277`) — fail-safe direction, converges at the next successful rescan (and the §3.5 gate never fires on a no-overlay parse: nothing consumed, nothing stamped).
- **No telemetry at staging.** Staging is preview, not apply; §10 of the parent spec pins the three emitting apply surfaces and stays unchanged. `applyRoleTokenMappings`' `applied[]` return is discarded at the staging call site.
- **Wizard finalize stays un-threaded (`[]`) for the OVERLAY.** Preview==publish parity: finalize publishes exactly the staged parse the admin reviewed. A mapping created AFTER the last restage (settings page, or another show's control) does not apply at that publish; it converges on the show's next PROCESSED sync (§3.4 — not bounded by the next cron tick). Under-grant is the fail-safe direction; threading fresh mappings into phase2's union-only overlay at finalize could anyway never REMOVE staging-baked grants, so it is not a freshness mechanism (that is §3.5's job).
- **Per-row consumed-token freshness gate at finalize (adversarial R3 F2, accepted).** Publishing is an explicit admin action and must reflect current admin intent: a mapping deleted or narrowed between staging and finalize must NOT be minted into a fresh publish. Mechanism in §3.5: the staging chokepoint stamps the overlay's consumed tokens + grants into the staged parse; finalize refuses a row (new cataloged code `ROLE_MAPPINGS_OUTDATED_AT_FINALIZE`) when a CONSUMED token's mapping has been deleted or narrowed since staging; the existing per-sheet rescan is the heal. Scoped to consumed tokens only — an unrelated mapping created/edited mid-session does NOT trip the gate (no false-positive re-scans in the map-several-roles-then-finalize flow). Broadened or unchanged grants pass (publishing the smaller staged grant set is under-grant, converging later). For ALREADY-published shows, the settings-delete window remains the parent-ratified convergence class (parent spec §7 delete row `:167`, "on each show's next sync"); the whole-feature tightening (mapping `updated_at` in the cron watermark, or targeted re-sync fan-out on settings mutations) is filed as `BL-ROLE-VOCAB-MAPPING-CONVERGENCE` (§5) — a parent-feature gap this spec surfaces but does not own.

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

Application: `const overlaid = applyRoleTokenMappings(parseResult, mappings)` — one site, placed after the discard branch so it covers both parse paths. `applyRoleTokenMappings` (`lib/sync/roleMappingOverlay.ts:62`) is pure and fail-closed: it unions grants onto the crew row via `blockRef.index`, removes the consumed warning, and leaves corrupt/missing anchors untouched (warning stays — `:81-84`). Legacy warnings without `roleToken` are skipped by construction (`:73-76`).

**Consumed-token stamp (feeds the §3.5 gate):** at this call site only — never inside the overlay function, so the live phase2 path is untouched — the prepared parse gets `parseResult.appliedRoleMappings = [{ token, grants }]`, deduplicated per token from `overlaid.applied` (the per-member entries collapse; grants are per-token by construction). The field is declared as an optional overlay-output field on `ParseResult` (`lib/parser/types.ts`); the parser itself never sets it. Because it lives INSIDE `parse_result`, it rides the staging upsert, the Flow-B shadow payload, and the finalize read with zero additional threading — the same free ride `warnings` already gets. When the overlay consumed nothing, the field is omitted (absent, not `[]` — `exactOptionalPropertyTypes` posture), which is also the legacy shape for pre-feature staged rows.

The overlaid parse then flows unchanged into every existing consumer: the staging upsert (`pending_syncs.parse_result`), data-gap summaries, warning anchors, source anchors, the rescan decision core, and — at finalize — the shadow payload and `applyStagedCore`.

### 3.3 What each surface inherits (no further code changes)

| Surface | Effect |
| --- | --- |
| Step-3 review (`components/admin/wizard/step3ReviewSections.tsx`) | Warning line + section counts reflect post-overlay state; recognized roles show no warning; staged crew `role_flags` include grants. No component change — data-driven. |
| `mapRoleTokenStaged` (`roleTokenStaged.ts:159-177`) | The re-stage now parses post-overlay → refreshed staged parse lacks the token's warning → `state: "applied"` becomes reachable. The component's `"applied"` branch already exists and is tested (`components/admin/RoleRecognizeControl.tsx:45`). Provenance check (`:94-108`) stays consistent: an already-mapped token's warning is consumed at staging, so no control renders and no create is attempted; re-saves route through the existing-row set-equal branch. |
| Rescan clean/dirty (`lib/onboarding/rescanDecision.ts:30`) | Safe by construction: dirty fires only on a NON-ambiguity gap-class count **increase** (`:46-48`); the overlay only removes warnings. MI invariants compare lead-flag transitions only (`lib/parser/invariants.ts:535` `hasLeadFlag`); grantable flags are `A1/V1/L1/FINANCIALS` (`roleMappingOverlay.ts:4`), never a lead flag, so a role_flags union cannot trip MI-9/MI-10. |
| Wizard finalize (`finalize-cas`/`finalize` routes) | Publishes the post-overlay staged parse as-is — AFTER passing the §3.5 freshness gate (the one net-new finalize behavior). `runPhase2`'s second overlay pass (with `[]` on this path) is a no-op; even where mappings ARE threaded (live staged-apply, cron), the overlay is idempotent — the consumed warning is absent, so `applied[]` is empty and flags are already unioned. |
| Next processed post-publish sync | Loads fresh mappings (existing); converges anything created/changed after the last restage. "Processed" matters: cron/push skip a sheet whose Drive `modifiedTime` is at or before the show watermark (`lib/sync/perFileProcessor.ts:214-218`), and mapping edits never advance a sheet's `modifiedTime` — but MANUAL sync bypasses the watermark entirely (`perFileProcessor.ts:170-172`, `!isAutomaticMode(mode)` → unconditional proceed), so the admin's per-show manual sync affordance is the deterministic convergence lever. Steady-state silent once processed: the delta gate compares against prior-persisted state (`roleMappingOverlay.ts:109`), and post-publish persisted flags already include the staged grants. |

Out of scope (unchanged surfaces): the LIVE staging path (`lib/sync/phase1.ts` `stage` outcome for published shows, and `runManualStageForFirstSeen.ts` — its parse is pre-fetched by cron-style export, not `prepareOnboardingFiles`); the live dashboard staged-apply; the use-raw decision-display mechanism; all UI files.

### 3.4 Convergence windows (accepted, documented)

**Convergence reality (precise window):** a published show's `role_flags`/warnings converge to the current vocabulary on its next PROCESSED sync. Cron and push process a file only when Drive `modifiedTime` advances past the show watermark (`lib/sync/perFileProcessor.ts:214-218`); editing `role_token_mappings` does not touch any sheet's `modifiedTime`, so an unmodified sheet is watermark-skipped indefinitely. Manual sync bypasses the watermark (`perFileProcessor.ts:170-172`) and always converges. So the honest window is "until the next sheet edit or manual sync", not "next cron tick". This is the parent feature's shipped semantics for every live show (parent spec §7 delete row, `:167` — "on each show's next sync"); it is not introduced or widened by this spec.

- **Mapping deleted/narrowed between staging and finalize:** the staged parse has grants baked and the warning consumed; finalize publishes them. They persist until the show's next processed sync (above), where the fresh parse re-emits the warning and the overlay grants only what the current vocabulary says — `role_flags` are rebuilt from the parse each processed sync, not accumulated, so convergence is downward-capable. Same class, same window as the live-show settings-delete path (parent spec §7). Whole-feature tightening (mapping `updated_at` in the cron watermark, or targeted re-sync fan-out on settings mutations) → `BL-ROLE-VOCAB-MAPPING-CONVERGENCE` (§5).
- **Mappings-read TOCTOU:** the vocabulary is read pre-lock; a row created/changed between the read and the staging write leaves the staged parse one step behind. Benign — the next rescan (wizard sheets are actively re-scanned during review) or the next processed post-publish sync converges, and the §3.5 gate refuses publication if a CONSUMED token was revoked/narrowed in the window. No snapshot protocol (unlike `pull_sheet_override`, staleness here cannot resurrect unauthorized content; it only delays recognition or is caught by the gate).

### 3.5 Finalize freshness gate (consumed tokens only)

New pure helper in `lib/sync/roleMappingOverlay.ts`:

```ts
evaluateRoleMappingsFreshnessGate(
  staged: ParseResult,
  current: RoleTokenMapping[],
): { ok: true } | { ok: false; code: "ROLE_MAPPINGS_OUTDATED_AT_FINALIZE" }
```

Predicate: for every `{ token, grants }` entry in `staged.appliedRoleMappings` (absent/empty field → `{ ok: true }` — legacy rows and no-consumption rows pass vacuously), the current vocabulary must contain that token with `grants` a SUBSET of the current grants. Deleted token or narrowed grants → refuse. Broadened/equal → pass (staged publishes the smaller set; under-grant converges on the next processed sync).

Wiring: called at each wizard-finalize `applyStagedCore` call site (`sourceScope: "wizard"` — both onboarding finalize routes), immediately beside the existing `evaluateFinalizeOverrideGate` refuse-shape precedent (`app/api/admin/onboarding/finalize-cas/route.ts:441-448` — same per-row `{ drive_file_id, code }` return, declarative, no compensation write). The current vocabulary is read **PER ROW, on that row's own locked transaction, immediately before its apply** (adversarial R4 F1 — a request-level snapshot would be stale for later rows of a multi-row finalize while settings mutations are lockless; the per-row read makes the gate evaluate against the vocabulary current as of the row's own locked apply). Skip the read entirely when the row's `appliedRoleMappings` is absent (the common case pays zero queries); otherwise one `jsonb_agg` + `normalizeRoleTokenMappings` SELECT (same shape as §3.1) on the held-lock tx — wizard batches are dozens of rows at most, negligible. The LIVE staged-apply path (`applyStaged.ts`) is untouched: its rows are staged by phase1 without the overlay, so the field is never present and the gate is not wired there.

Refusal code: **new §12.4 code `ROLE_MAPPINGS_OUTDATED_AT_FINALIZE`** (reuse of `STAGED_PARSE_OUTDATED_AT_PHASE_D` was evaluated and rejected — its Doug-facing copy asserts "This sheet changed after setup reviewed it… looks like it was edited", a false cause for a vocabulary change; truthful-copy discipline wins over catalog thrift). Copy direction (final wording at implementation, vocabulary-ban sweep applies): Doug-facing "The roles you've added changed after setup reviewed this sheet, so its update is on hold."; followUp "Doug → re-scan this sheet in setup, then re-review and publish". Full lockstep obligations in §5. The name deliberately avoids the `REPORT_*` namespace (M8 scanner rule).

Heal path: the refused row renders through the existing needs-attention machinery (`lookupDougFacing`, invariant 5); the existing per-sheet rescan re-prepares under the CURRENT vocabulary (§3.1-§3.2), after which the gate passes. If the mapping was deleted, the rescan re-emits the warning and re-runs the §3.4 clean/dirty decision on the refreshed parse — whichever way that decision lands, the re-staged state is truthful and the recognize control is available again.

Residual TOCTOU (irreducible, accepted with reasoning): with the per-row read, the only remaining race is a settings mutation committing between THAT row's vocabulary read and the same row's phase2 commit — a genuinely under-lock, milliseconds-scale window on the row's own transaction. This residue is inherent to ANY design short of making settings mutations take the finalize/show locks: a revoke can always land one instant after a publish commits, and no gate ordering distinguishes "1ms before commit, missed" from "1ms after commit, inherently unpreventable". The parent spec deliberately keeps settings actions lockless (§8.4); coupling them to finalize locking would invert that ratified decision for a window that cannot reach zero anyway. The meaningful guarantee — the gate evaluates against the vocabulary current as of the row's own locked apply — is exactly what the per-row read provides; anything that slips through is equivalent to a revoke issued just after publish, whose persistence characteristics are the `BL-ROLE-VOCAB-MAPPING-CONVERGENCE` class (§3.4).

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
| Mapping grants | `[]` (recognize-only) | warning consumed, flags unchanged — parity with phase2 semantics. Stamped as `{ token, grants: [] }`; the gate's subset check passes vacuously unless the token is deleted (deletion still refuses — the consumed warning must come back). |
| `staged.appliedRoleMappings` (gate input) | absent (legacy row / nothing consumed) | gate returns `{ ok: true }` vacuously. |
| | present, malformed entries (hand-edited JSON) | gate validates shape per entry; a malformed entry is treated as NOT satisfiable → refuse (fail-closed — a corrupt stamp must not publish unverifiable grants). |
| | token present, current grants ⊋ staged grants (broadened) | pass — publishes staged (smaller) set; under-grant converges later. |

No nulls/NaN surfaces beyond these: the dep returns a validated array; `prepareOnboardingFiles` inputs are otherwise untouched.

Not applicable (declared per checklist): dimensional invariants / transition inventory (no UI change); tier×domain matrix (no DDL/CHECK/RPC/trigger change — one read-only SQL SELECT added); flag lifecycle table (no new config flag); CHECK/enum migration matrix (no schema change).

## 5. Parent-spec amendment reversal

`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md` §8.3 (`:209`) — the **RATIFIED IMPLEMENTATION AMENDMENT (2026-07-16, whole-diff R1 F1)** block is superseded: replace its body with a pointer stating the staging-overlay integration shipped (this spec), the staged `"applied"` branch is reachable (re-stage completes AND the refreshed staged parse no longer carries the token's warning — the pre-existing Codex R14 F1 rule, unchanged), and correct "the staged-apply path threads `roleTokenMappings`, tested" to name the live dashboard staged-apply (`applyStaged.ts:1376`) explicitly. The amendment's other content (Settings update/delete return plain ok/error; built-in guard scope) is untouched. This file is NOT the master spec (`2026-04-30-fxav-crew-pages-v1.md`) — no §12.4 lockstep obligations; no error-code catalog rows change.

Doc closures land as explicit implementation-plan tasks on this branch (the spec commit precedes them by design — at spec-review time the branch deliberately contains only this file): the parent-spec §8.3 amendment edit above, a parent-spec §10 telemetry-exemption line (§6), a resolution line on `DEFERRED.md` ROLE-VOCAB-2, a ✅ SHIPPED status line on `BACKLOG.md` `BL-ROLE-VOCAB-STAGING-OVERLAY`, and a NEW backlog entry `BL-ROLE-VOCAB-MAPPING-CONVERGENCE` (whole-feature convergence gap surfaced by this spec's review: mapping-only changes never advance any sheet's Drive `modifiedTime`, so cron watermark-skips unmodified sheets and settings edits converge only via sheet edits or manual syncs; candidate designs — `role_token_mappings.updated_at` participating in the cron watermark, or targeted re-sync fan-out on settings mutations). All ship in the same PR as the code; the implementation plan carries them as a numbered task so they cannot be dropped.

**New §12.4 code lockstep (`ROLE_MAPPINGS_OUTDATED_AT_FINALIZE`, §3.5):** the master spec (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) §12.4 gains the row; `pnpm gen:spec-codes` regenerates `lib/messages/__generated__/spec-codes.ts`; `lib/messages/catalog.ts` gains the matching entry — all three in ONE commit (x1 `catalog-parity` gate). Additional touchpoints per the M12.1+ checklist: `pnpm gen:internal-code-enums` (x2), the help `_families` coverage, and the copy vocabulary-ban sweep over the new strings. No new admin route → no `TRUST_DOMAINS` change. The master spec file is NEVER run through prettier.

## 6. Telemetry & observability

- No new events. `ROLE_TOKEN_MAPPED` surfaces and gates are untouched (parent spec §10 stays the single source), with ONE explicit contract amendment (adversarial R3 F1): grants applied via the wizard STAGING overlay reach publication without a `ROLE_TOKEN_MAPPED` event — the wizard finalize path was never a §10 point-5 emit surface (the `runManualStageForFirstSeen.ts:101-103` comment pins the same exemption for first-seen auto-publish, and today `finalize-cas` threads no mappings at all), and the post-publish sync that WOULD have emitted under the old timing now finds nothing new (delta gate vs prior persisted state, steady-state silent by design). This is an accepted informational under-emit in the same ratified family as the first-seen, legacy-window, and duplicate-name carve-outs (parent §10 point 2) — justified because the wizard application is not a behind-Doug's-back auto-apply: Doug drives it from the staged preview, and the create action's `logAdminOutcome` (`ROLE_TOKEN_MAPPING_SET`, with `wizardSessionId` + `driveFileId`) is the durable forensic record. The doc-closure task adds this exemption line to parent §10.
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
9. **Convergence-window pin (unchanged Drive modtime):** after a publish with staging-baked grants and a subsequent mapping narrow/delete, with `fileMeta.modifiedTime` NOT advanced past the watermark: (a) the cron prepare returns `{ outcome: "skip", reason: "watermark" }` (`perFileProcessor.ts:214-218`) — pinning the documented window, so a future watermark change consciously revisits it; (b) a manual-mode prepare proceeds (`:170-172`) and a manual sync converges `role_flags` downward (warning re-emitted, revoked grants gone). Failure mode caught: someone "fixes" convergence claims in docs without the code backing them, or breaks the manual bypass that makes convergence reachable at all.
10. **Freshness gate unit matrix** (`evaluateRoleMappingsFreshnessGate`): absent field → ok; consumed token deleted → refuse; grants narrowed (`[A1,V1]` staged, `[A1]` current) → refuse; equal → ok; broadened → ok; recognize-only entry with token deleted → refuse; malformed entry → refuse. Expected values derived from constructed mapping fixtures, never hardcoded row dumps.
11. **Gate wiring (both finalize routes):** a staged row whose `parse_result.appliedRoleMappings` names a since-narrowed token is refused by the wizard finalize row-processing with `{ drive_file_id, code: "ROLE_MAPPINGS_OUTDATED_AT_FINALIZE" }` and NOTHING is written for that row (declarative refuse, override-gate precedent); a legacy row (no field) publishes normally. Covered at both `applyStagedCore(sourceScope: "wizard")` call sites (`app/api/admin/onboarding/finalize-cas/route.ts:455`, `app/api/admin/onboarding/finalize/route.ts:1236`).
12. **Stamp round-trip:** staging a sheet with a consumed mapping persists `appliedRoleMappings: [{ token, grants }]` in `pending_syncs.parse_result` (deduped per token); a sheet with no consumption persists NO such key (absent, not `[]`).
13. **Heal:** after a refuse, a rescan under the current vocabulary re-stages (warning back if deleted; grants re-derived if narrowed) and the same finalize row then passes the gate.
14. **Mid-batch concurrency:** a multi-row finalize where a consumed token's mapping is deleted AFTER the first row applies but BEFORE a later row is processed (test seam between rows, override-gate TOCTOU-test precedent) → the later row is refused with `ROLE_MAPPINGS_OUTDATED_AT_FINALIZE`; the earlier row's publish stands. Failure mode caught: a request-level vocabulary snapshot regression (the R4 F1 bug shape).

Meta-test inventory (declared per AGENTS.md writing-plans rule, decided at spec time):

- `tests/sync/roleMappingThreading.test.ts` (Phase2Args threading walker): **no change needed** — the new overlay site is not a `Phase2Args` assembly; the walker's scope is untouched and stays green.
- `tests/observe/_metaReadOnlyQueryCore.test.ts`, `_metaInfraContract`, advisory-lock topology test: **none applies** — no observe-core file, no Supabase-builder call in auth domain, no new lock holder (the loader is pre-lock and lock-free; staging writes keep their existing single holders).
- x1 `catalog-parity` + x2 internal-code-enums gates: exercised by the new §12.4 code (existing gates, no new meta-test authored — they fail-by-default on a missed lockstep step).
- No new meta-test for the chokepoint: it is structural (all wizard staging producers import `prepareOnboardingFiles`); test 1 pins the behavior at the chokepoint itself. Candidate declared-and-deferred: a walker asserting every `sourceScope: "wizard"` `applyStagedCore` call site is preceded by the freshness gate — test 11 covers both existing sites behaviorally; mint the walker only if a third wizard finalize site ever appears.

## 8. Out of scope

- Threading `roleTokenMappings` into the finalize routes' phase2 OVERLAY (§2 parity rationale — the §3.5 freshness gate reads the current vocabulary but never applies it to the parse).
- The live phase1 staging path and its dashboard review surface.
- `BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID` (separate backlog item).
- Any UI file change (invariant-8 dual-gate not triggered; confirmed no `app/` non-api, `components/`, or token/CSS file in the expected diff).
