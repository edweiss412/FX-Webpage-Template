# Spec review R3b - GATE, INVARIANTS, TESTS (sections 6-13)

## Your role: REVIEWER ONLY

Do not fix issues, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Context

A DEV-ONLY instrument in a Next.js 16 + Supabase admin app. It renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. One catalog, two consumers: a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase so the real modal shows the state for real).

Scenario rows are authored in the DB's own column names. Alerts carry { code, context, raised_at, occurrence_count } plus a gallery-only declared identity. Holds carry sync_holds columns. Warnings are tri-state: absent = do not touch the column, [] = deliberately write zero, non-empty = write it.

Two prior rounds ran; all P0/P1 findings were repaired. This round reviews the repaired document.

## Binding project invariants (abbreviated)

- Inv 2: mutations of shows/crew_members/crew_member_auth/pending_syncs/pending_ingestions run inside a per-show advisory lock held at EXACTLY ONE layer; nested holders deadlock.
- Inv 5: no raw error codes in user-visible UI. A scoped dev-instrument exception is ratified in 1.1 - verify its scope is coherent, do not re-argue that it exists.
- Inv 9: every Supabase call destructures { data, error }; infra faults surface as typed discriminable results.
- Inv 10: every mutating server action needs a registry row plus executable success-branch behavioral proof; emits post-commit, outside any lock.
- Dev routes under app/admin/dev/ are gated BUILD-TIME by a script that renames registered files aside before `next build`.
- Every prop/input needs stated behavior for null, empty, zero, malformed.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <section> - <why it fails, concretely>`.
Enumerate ALL instances of each defect class in THIS round; dripping one instance per round is a review defect.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## SCOPE: sections 6-13 ONLY

Review the build-time gate proof, invariant compliance, dimensional and transition inventories, flag lifecycle, DB matrix, meta-test inventory, and out-of-scope claims. Section 5 (materialize mechanics) is reviewed separately - assume its Apply/Clear semantics are as summarized above. Judge whether the invariant-10 and invariant-9 treatments are complete and correct, whether the gate proof actually proves what it claims, and whether the listed tests would catch the failures they name.

## ARTIFACT

## 6. Build-vs-runtime gate

Build-time, not runtime. `scripts/with-admin-dev-flag.mjs` renames the files in its `FILES` array (`scripts/with-admin-dev-flag.mjs:43-55`) to `.disabled-by-build-gate` before `next build` whenever `ADMIN_DEV_PANEL_ENABLED` is not the literal `"true"`, so the artifact does not contain the route. `requireDeveloper()` remains runtime defense in depth.

**Added to `FILES`:** `app/admin/dev/attention-gallery/page.tsx (new)`. The materialize card lives inside the already-registered `app/admin/dev/page.tsx` and `actions.ts`.

#### 6a What actually protects production, measured

The previous revision cited a `FILES`-membership assertion in `tests/admin/withAdminDevFlagDevPanelPresent.test.ts`. **No such assertion exists** — that file tests only `writeDevPanelPresent` (33 lines, two cases). And the real artifact test, `tests/admin/build-artifact-gate.test.ts`, is gated on `RUN_BUILD_ARTIFACT_GATE_TEST === "1"` (`tests/admin/build-artifact-gate.test.ts:33`), a variable that appears **nowhere** in `.github/workflows/` or `package.json`. It runs a full `pnpm build`, so it is deliberately opt-in and **does not run in CI**.

Net: today, **nothing in CI catches a new `app/admin/dev/**`route that was never added to the`FILES` array.\*\* The rename gate protects only files it knows about, and membership is unchecked. This affects the load-bearing production-safety claim in §1.1 and §5.5, so it is stated rather than assumed.

**Structural defense, created by this change** (cheap, CI-runnable, fails by default): a filesystem-walking meta-test asserting that **every** `app/admin/dev/**/page.tsx` and `app/admin/dev/**/actions.ts` — excluding the deliberately prod-available `telemetry` route, which the artifact test already treats as an exception — appears in `scripts/with-admin-dev-flag.mjs`'s `FILES` array. It reads the filesystem and the script, needs no build, and runs in milliseconds. A future dev route added without registration fails immediately instead of silently shipping to production.

**Artifact-level proof at both flag states** (R1 #20) remains the `RUN_BUILD_ARTIFACT_GATE_TEST=1` path, extended with the enabled-flag case:

| Flag     | Assertion                                                                                              | Why this claim                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unset    | the built `app-paths-manifest` and `routes-manifest` files contain no non-telemetry `/admin/dev` entry | **route-manifest absence** — a source grep is weaker, a 404 probe tests routing rather than the artifact. The existing assertion already filters generically on "non-telemetry `/admin/dev`" (`tests/admin/build-artifact-gate.test.ts:135-152`), so the new route is covered **with no edit** |
| `"true"` | the manifests **do** contain `/admin/dev/attention-gallery`                                            | new; proves the gate is a gate rather than a permanent deletion                                                                                                                                                                                                                                |

This is a **manual close-out check, not a CI gate** — consistent with §1.1's no-CI-gate decision, and now stated honestly instead of implied to be automatic.

## 7. Invariant compliance

### 7.1 Invariant 10 — mutation surface observability

Four exported mutation surfaces, each needing executable success-branch proof (R1 #7 — the previous revision registered four but promised proof for two):

| Surface                            | Code                   | Proof                                                                                                                                                           |
| ---------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyAttentionScenario`           | `DEV_SCENARIO_APPLIED` | registry row + behavioral proof                                                                                                                                 |
| `clearAttentionScenario`           | `DEV_SCENARIO_CLEARED` | registry row + behavioral proof                                                                                                                                 |
| `applyAttentionScenarioFormAction` | `DEV_SCENARIO_APPLIED` | registry row + behavioral proof (transitive, driving the wrapper — the `parseAndStageFormAction` pattern at `tests/log/adminOutcomeBehavior.test.ts:1157-1171`) |
| `clearAttentionScenarioFormAction` | `DEV_SCENARIO_CLEARED` | registry row + behavioral proof, same pattern                                                                                                                   |

No wrapper exemptions are claimed.

**Partial-success emission** (R1 #7): Apply has no transaction, so "post-commit" needs defining. The emitted `result` is `applied` when every intended write succeeded, `partial` when at least one succeeded and at least one failed, and **nothing is emitted** when the first write failed and no state changed. The emit carries the per-step counts, so a `partial` is diagnosable from telemetry alone. It fires after the last write attempt, outside any lock.

**These codes do not take the §12.4 lockstep.** `logAdminOutcome`'s `code` is a free SHOUTY_SNAKE_CASE string (`lib/log/logAdminOutcome.ts:9`), not a `MessageCode`. `DEV_PARSE_STAGED` and `DEV_SCHEMA_RESET` appear only in `app/admin/dev/actions.ts` and the two test registries — no master-spec §12.4 row, no `lib/messages/catalog.ts` entry. Adding one would put a non-message code in the message catalog and risk `x1-catalog-parity` rather than satisfy it.

### 7.2 Invariant 2 — advisory locks

Materialize writes `admin_alerts`, `sync_holds`, and `shows_internal.parse_warnings`. None is in the guarded set (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`).

The local Clear's re-sync acquires the per-show lock **inside existing code**: `runManualSyncForShow` (`lib/sync/runManualSyncForShow.ts:297`) is the sole acquirer, and `runManualSyncForShow_unlocked` calls `assertShowLockHeld` (`lib/sync/runManualSyncForShow.ts:286`) so a second acquisition surfaces as an assertion failure rather than a deadlock. Materialize adds **no acquisition of its own at any layer** — it calls the locked entry point and lets it own the lock, which is the single-holder rule.

Enumerated holders for the `show:<drive_file_id>` hashkey touched by this design: (1) `runManualSyncForShow`, JS-side, pre-existing, unchanged. That is the complete list.

### 7.3 Invariant 5

Scoped exception ratified in §1.1, enumerated there. All rendered card copy still resolves through the catalog. The materialize card's own outcomes are `lib/messages/lookup.ts`-resolved for operator-facing text; the raw result codes of §5.3 appear only in the developer readout.

### 7.4 Invariant 8 — UI quality gate

Gallery route, `ScenarioBlock`, and the dev-panel card are UI. `/impeccable critique` and `/impeccable audit` both run before close-out; P0/P1 fixed or deferred via `DEFERRED.md`.

### 7.5 Invariant 9 — Supabase call boundary

Every materialize call destructures `{ data, error }`, distinguishes returned from thrown errors, and returns a typed discriminated result:

```ts
type MaterializeResult =
  | {
      kind: "ok";
      alerts: number;
      holds: number;
      warnings: "written" | "untouched";
      skipped: Skip[];
    }
  | { kind: "partial"; committed: StepCounts; failedStep: Step; message: string }
  | { kind: "refused"; reason: RefusalCode }
  | { kind: "infra_error"; message: string };
```

**Registry treatment, decided here** (R1 #19 asked for a decision; the first answer was wrong and is corrected):

There is **no invariant-9 registry whose scope covers this file.** The only such registry walks `AUTH_DOMAIN_ROOTS = ["lib/auth", "app/auth", "app/api/auth", "app/api/show"]` (`tests/auth/_metaInfraContract.test.ts:336`); `tests/reports/_metaInfraContract.test.ts` is scoped to the M8 report surfaces. `app/admin/dev/actions.ts` is covered instead by a **file-level annotation** at `app/admin/dev/actions.ts:3-11`.

That annotation's stated rationale is that every helper in the file throws on both the returned-`.error` and thrown-await paths, and that **"None of these helpers return a typed `{ kind: 'infra_error' }` union, so no §1.9 caller contract exists to silently violate."**

The two new actions **break that premise deliberately**: they return `MaterializeResult` above, because the card must render skip lists, partial outcomes, and refusals as ordinary UI. Throwing would surface a recoverable, expected condition — a collision skip, an unconfirmed environment — through the dev error boundary, which is the wrong behavior.

Therefore the new actions are **not exempt; they comply directly** — they destructure `{ data, error }`, distinguish returned from thrown, and map infra faults onto `{ kind: "infra_error" }`. The implementation task **amends the file-level annotation** so it no longer claims file-wide that nothing returns a typed union: the legacy helpers keep their throwing contract and their exemption, the two materialize actions are called out as honoring the invariant directly. Leaving the annotation as-is would make it a false statement about its own file.

## 8. Dimensional invariants

`w` sets `max-width` (§4.5), which constrains width only and imposes no parent→child height relationship, so the mandatory fixed-dimension analysis does not apply to the wrapper.

One real-browser assertion **is** required, for a claim §4.2 makes rather than a stretch invariant: that a `MENU_CAP`-item menu actually crosses its scroll threshold, and that simultaneously-open menus stack without overlapping (R1 #6, #28). The plan carries a Playwright task reading `getBoundingClientRect()` on adjacent open menus at the narrowest and widest `w`, asserting no intersection.

## 9. Transition inventory

The gallery adds no animated component; transitions inside `AttentionMenu`, `AttentionBanner`, and `CompactAlertCard` are pre-existing and covered (`tests/components/admin/compactAlertCompoundTransitions.test.tsx`, `transitionAudit.test.tsx`). The gallery's own filter changes are server navigations — instant, no animation.

**`ScenarioBlock`** is a new multi-state client component and carries its own inventory (R2a):

| From                     | To                               | Treatment                                                                                                                                                                                           |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| menu closed              | menu open                        | the component's existing `transition-[opacity,transform] duration-fast` on the menu root (`components/admin/showpage/AttentionMenu.tsx:99`), inherited unchanged                                    |
| menu open                | menu closed                      | same transition, reversed; `motion-reduce:transition-none` already honored                                                                                                                          |
| navigation readout unset | set (an item was activated)      | instant — a text node appears; animating it would obscure what it records                                                                                                                           |
| readout set              | set to a different item          | instant                                                                                                                                                                                             |
| help popover closed      | open, **while the menu is open** | independent; the popover is inside a menu row, so the compound case is "menu open + popover open" and both are already covered by `tests/components/admin/compactAlertCompoundTransitions.test.tsx` |
| warning card collapsed   | expanded, while the menu is open | independent; no shared animation state                                                                                                                                                              |

No new `AnimatePresence` and no new animated branch is introduced: every transition above is either an existing component's own, or deliberately instant.

The **materialize card** has a state model of its own, omitted from the R1 revision (R1 #22):

| From                    | To                                                    | Treatment                                                                                                 |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| idle                    | submitting (Apply or Clear)                           | instant — controls disable, in-flight text appears                                                        |
| submitting              | result (`ok` / `partial` / `refused` / `infra_error`) | instant                                                                                                   |
| result                  | idle                                                  | instant, on any control change                                                                            |
| target local            | target validation                                     | instant; reveals the confirmation control                                                                 |
| validation, unconfirmed | validation, confirmed                                 | instant                                                                                                   |
| any result              | submitting again                                      | instant; the prior result clears before the request fires, so a stale result never sits beside a live one |

Compound: changing scenario, show, or environment **while a request is in flight** is prevented — the controls are disabled for the duration, which is also the double-submit guard of §5.3. Changing them while a _result_ is displayed clears the result, per the row above.

## 10. Flag lifecycle

| Flag / field                 | Storage                 | Write path     | Read path                         | Effect                                    |
| ---------------------------- | ----------------------- | -------------- | --------------------------------- | ----------------------------------------- |
| `ADMIN_DEV_PANEL_ENABLED`    | env at build invocation | operator / CI  | `scripts/with-admin-dev-flag.mjs` | not `"true"` → route absent from artifact |
| `tier`, `scenario`, `w`      | URL query               | user           | gallery page                      | §4.5                                      |
| `scenario.degraded`          | catalog literal         | catalog author | `ScenarioBlock`                   | degraded pill + Overview notice           |
| `scenario.warnings` presence | catalog literal         | catalog author | both consumers                    | tri-state, §3.4                           |
| `context.__devScenario`      | `admin_alerts.context`  | Apply          | Apply + Clear                     | scopes deletion                           |
| `sync_holds.created_by`      | column                  | Apply          | Apply + Clear                     | scopes deletion                           |
| target environment           | form field              | user           | materialize action                | local vs validation client (§5.5)         |

No empty column; no zombie flag.

## 11. DB completeness matrix

| Layer                   | `admin_alerts`                   | `sync_holds`                                                                   | `shows_internal.parse_warnings` |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| DDL / CHECK / migration | none — no schema change          | none                                                                           | none                            |
| Constraints honored     | partial unique index (§5.1a)     | `unique (show_id, domain, entity_key)` + domain/kind/kind_shape CHECKs (§3.0a) | none                            |
| RPC read path           | unchanged (`fetchPerShowAlerts`) | unchanged (`readShowChangeFeed`)                                               | unchanged (snapshot RPC)        |
| Write path              | service-role insert/delete       | service-role insert/delete                                                     | service-role update             |
| Cleanup                 | tag-scoped                       | tag-scoped                                                                     | local re-sync only (§5.2)       |
| Frontend                | gallery + card                   | gallery hold group + card                                                      | `PerShowActionableWarnings`     |
| Tests                   | §12                              | §12                                                                            | §12                             |

## 12. Meta-test inventory

**Extends:** `tests/log/_auditableMutations.ts` (four rows), `tests/log/adminOutcomeBehavior.test.ts` (four behavioral proofs), `tests/admin/withAdminDevFlagDevPanelPresent.test.ts` and `tests/admin/build-artifact-gate.test.ts` (§6).

**Not extended:** any invariant-9 registry — none has `app/admin/dev` in scope (§7.5). The obligation there is an amended file-level annotation plus the typed-result behavior, both covered by the guard tests below rather than by a registry row.

**Creates:** one — the `FILES`-membership meta-test of §6a. It is the CI-enforced half of the build gate, and the only new structural defense this design adds.

**Declined:** a catalog-completeness meta-test (§1.1). The alert axis needs none; the warning axis has an enumerated residue whose closure is a backlog item.

**Known harness gap:** the shared Supabase mock `chainResult` (`tests/log/adminOutcomeBehavior.test.ts:77-86`) stubs only `eq/is/not/select/update/insert/delete/single/limit`. Any builder method materialize uses beyond that set must be added in the same task, or the behavioral test throws on an undefined method.

**Behavioral tests.** Each states the failure mode it catches; none passes merely by the function being called.

| Test                                                                                                                                                                                                                                            | Catches                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| No scenario carries duplicate alert codes or duplicate hold `(domain, entity_key)`, asserted across the whole catalog                                                                                                                           | a catalog addition that renders fine and fails the unique constraint the first time it is materialized                                   |
| Apply skips a colliding code: seed a real unresolved alert of code C, apply a scenario with C and D; assert D inserted, C in `skipped`, and the pre-existing C row **byte-identical** (same id, `raised_at`, `occurrence_count`, `resolved_at`) | an Apply that "handles" the collision by resolving or overwriting a real alert                                                           |
| Apply A then Apply B leaves exactly B's synthetic rows and none of A's                                                                                                                                                                          | the union/first-wins/last-wins mixture of R1 #2                                                                                          |
| Apply with `warnings` absent leaves `parse_warnings` byte-identical; with `[]` writes `[]`                                                                                                                                                      | the destructive-erase of R1 #3                                                                                                           |
| Apply → Clear leaves **zero** tagged rows, counted directly against the DB, not from the action's own report                                                                                                                                    | a Clear that strands rows while reporting success                                                                                        |
| Apply twice yields the same row count as once                                                                                                                                                                                                   | non-idempotent accumulation                                                                                                              |
| Guards: unknown/empty/whitespace slug, archived show, unknown scenario id, T1/T2 id, unknown environment, unconfirmed validation, wrong project ref, empty scenario — each commits **no writes**, asserted by before/after row counts           | a guard that returns an error after having already written                                                                               |
| Reserved-key test: no catalog `context` contains `__devScenario`; no production emitter writes it                                                                                                                                               | Clear deleting authentic rows (R1 #12)                                                                                                   |
| Fidelity: derived fields the gallery computes equal those `fetchPerShowAlerts` returns for the same row and identity, compared across the two call paths rather than to a hand-written expectation                                              | the gallery and the real modal rendering different copy — the failure that makes the instrument misleading rather than merely incomplete |
| Hold shaping: a scenario hold inserted and read back through `readShowChangeFeed` yields the same `FeedEntry` the gallery shaped                                                                                                                | drift between the two shaping call sites                                                                                                 |
| `PICKER_EPOCH_RESET` produces no derived item, and is refused by materialize                                                                                                                                                                    | the cut silently becoming a rendered card                                                                                                |
| T2: each §4.2 row asserts its stated outcome                                                                                                                                                                                                    | a fallback predicate that no longer routes as documented                                                                                 |
| Build gate at both flag states (§6)                                                                                                                                                                                                             | a gate that permanently deletes, or one that leaks                                                                                       |
| Query-param guards and `scenario`-over-`tier` precedence (§4.5)                                                                                                                                                                                 | the self-contradictory clamp of R1 #24                                                                                                   |
| Layout: adjacent open menus do not intersect at min and max `w` (§8)                                                                                                                                                                            | overlapping portals invalidating the sweep                                                                                               |

**Not covered, deliberately:** live `resolveAlertIdentities` behavior against real crew rows (the inherent divergence of §3.3, labelled in the UI), and validation-target writes (exercised by hand, not in CI, since CI has no validation credentials).

## 13. Out of scope

- Screenshot regression gate and the Docker/arch pinning it requires (§1.1).
- Rendering T3 composites in the gallery (§4.3).
- Materializing T1/T2 scenarios (§5.0).
- Widening the internal-code-enum generator's scan heuristic (§3.2, backlog).
- Making gallery server actions functional (§4.4).
- Env-aware re-sync for validation Clear (§5.5).

**Explicitly in scope, contrary to the previous revision** (R1 #23): this design **does** modify production code. §3.3 extracts a pure function out of `fetchPerShowAlerts` and another out of `readShowChangeFeed`, both of which feed the production show modal. The extractions are behavior-preserving and the existing tests for both paths must pass unchanged, but claiming "no production render path is touched" was false and the regression risk is real.
