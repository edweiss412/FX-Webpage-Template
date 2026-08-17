# Server Action origin-gate sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the logout/CSRF-class hole on every destructive Next.js Server Action in the repo — not just the crew picker's three, which `fix/auth-picker-hardening` already closed — and make the census a derivation a future action cannot escape.

**Architecture:** The shipped `isSameOriginServerAction()` (`lib/auth/sameOriginServerAction.ts:31`) gains a scoped `headers()` catch-allow and four designated refusal exports, one per return shape in the census. 42 admin actions take `await assertSameOriginServerAction(fn, source)` as their first statement; 8 crew/wrapper actions take `if (!(await isSameOriginServerAction())) return <designated refusal>(fn)`. A new structural meta-test re-derives the census from the invariant-10 AST engine and requires every discovered unit to satisfy one of two AST accept-sets or to be one of three pinned exemptions, with `gated + exempted === discovered`.

**Tech Stack:** Next.js 16 (React 19 Server Actions, `forbidden()` behind `experimental.authInterrupts`), TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest, the repo's TypeScript-AST surface enumerator (`tests/log/mutationSurface/enumerate.ts`).

**Spec:** `docs/superpowers/specs/2026-08-16-server-action-origin-sweep-design.md` (APPROVE at spec review R4; `docs/review-rounds/fix/server-action-origin-sweep/119895a7c756.md`).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → passing test → commit. One task per commit; conventional-commits.
- **No raw error codes in UI** (invariant 5): no new returned code anywhere. Class A refuses via `forbidden()`; the picker shapes return the catalogued `PICKER_INVALID_INPUT`; class C returns its existing `{ status: "neutral" }`. `SERVER_ACTION_ORIGIN_REJECTED` lives only inside `log.warn` spans.
- **Invariant-8 dual gate:** the diff edits `.ts` action files under `app/` outside `app/api/` AND three `.tsx` files (two under `app/show/[slug]/[shareToken]/`, one under `components/`), so the impeccable critique gate AND the impeccable audit gate both run in THIS implementation arc against the real diff and the machine `impeccable-gate:` marker is filled at that closeout. No rendered element, token, or copy changes — each `.tsx` edit is one statement inside a Server Action body, above the component's render — so the expected finding surface is nil, but the gate runs and the marker is never fabricated.
- **Worktree only** (invariant 11); commit per task (invariant 6); ledger marker off in the PR's last commit (invariant 12).
- **The gate is always the FIRST statement** of the action body, ahead of the `require`-gate and ahead of any top-level `try`. Never after.

## Meta-test inventory (declared)

- **CREATES:** tests/auth/\_metaServerActionOriginGate.test.ts (plain text: created by Task 2) — the structural walk plus its fixture self-tests. **No new registry file:** the exemption is a closed three-name constant inside the walk (spec §3.5), and the delegator registry the earlier design carried was deleted by the spec's R3 narrowing.
- **EXTENDS:** `tests/auth/sameOriginServerAction.test.ts` (the no-request-context truth-table row; cases for all four designated refusal exports). `tests/mutation/source/registry.ts` (one `GuardSurface` row, Task 11), plus the two exact-key expectation tables that row turns on: `EXPECTED_LEDGER_KINDS` (`tests/mutation/guardSurfaces.gate.test.ts:34`) and `EXPECTED_ENV_TOUCHING` (`tests/mutation/_metaPremiseContract.test.ts:30`).
- **`tests/log/_metaMutationSurfaceObservability.test.ts` — NO change, verified not assumed.** **probed, not reasoned:** the gate's emit lives inside an imported refusal helper, and `predicateFor` scans only the action's OWN body with `descend: false` for a non-route unit (`tests/log/_metaMutationSurfaceObservability.test.ts:61-64`) while `scanBody` recognizes direct `log.*` property-access calls and not imported callees. So `codedLog` stays **false** for all **nine** units that pass on reason `no-telemetry` today, and each keeps passing exactly as it passes today, through its existing `no-telemetry:` exemption. The nine are derived, not listed from memory — replaying `evaluateUnit`'s own order (`predicateFor` first, `noTelemetryExempt` second, `tests/log/_metaMutationSurfaceObservability.test.ts:178-179`) over the 56 non-route units prints exactly nine: the three inline wrappers `selectIdentityFormAction` (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:82`), `clearIdentityAndSkipFormAction` (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:34`) and `clearIdentityFormAction` (`components/auth/IdentityChip.tsx:31`); both exports of the stale-entry module, `cleanupStaleEntry` (`lib/auth/picker/cleanupStaleEntry.ts:30`) and `cleanupStaleEntryCore` (`lib/auth/picker/cleanupStaleEntry.ts:53`); all three exports of the clear module, `clearIdentity` (`lib/auth/picker/clearIdentity.ts:77`), `clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts:103`) and `clearIdentityCore` (`lib/auth/picker/clearIdentity.ts:209`); and `selectIdentityCore` (`lib/auth/picker/selectIdentity.ts:99`). Two nearby picker units are deliberately NOT in that set and must not be added to it: `selectIdentity` (`lib/auth/picker/selectIdentity.ts:37`) already passes on `codedLog: true` (its own `log.*` emit) and `confirmUnpublishAction` on `adminOutcome: true`, so neither depends on a `no-telemetry:` row and neither is evidence for or against this claim. Nothing about any unit's classification changes, which is why no registry row does. No `AUDITABLE_MUTATIONS`, `ADMIN_SURFACE_EXEMPTIONS`, or `KNOWN_UNINSTRUMENTED` row changes: the gate adds a BRANCH to existing surfaces, not a surface. The origin walk READS `ADMIN_SURFACE_EXEMPTIONS` (Task 2) but never writes it.
- **`tests/cross-cutting/codes.test.ts` (`x1-catalog-parity`) — NO change.** `SERVER_ACTION_ORIGIN_REJECTED` appears only inside `log.warn` spans, which `stripLogEmissionCalls` removes before `PRODUCER_RE` runs — imported at `lib/messages/__internal__/codeProducers.ts:4` and applied to each file's source at `lib/messages/__internal__/codeProducers.ts:28`, with `PRODUCER_RE` itself declared at `lib/messages/__internal__/codeProducers.ts:14`; the shipped `PICKER_ORIGIN_REJECTED` is the precedent on main. No §12.4 row, no catalog row, no `pnpm gen:spec-codes`.
- **`tests/auth/_metaInfraContract.test.ts` — NO change.** Nothing this arc adds constructs or calls a Supabase client; `lib/auth/sameOriginServerAction.ts` reads `next/headers` and calls `resolveSiteOrigin` only.
- **"None applies" declarations:** no advisory-lock surface (below); no new e2e spec; no `admin_alerts` catalog row; no tile sentinel; no DB object, migration, CHECK, RPC, or `schema-manifest` change.

## Advisory-lock holder topology

**N/A, and load-bearing that it is N/A.** The gate calls `headers()` and `resolveSiteOrigin()` and nothing else — no `pg_advisory*`, no Supabase client, no transaction. It is the FIRST statement of each action, so it executes strictly before every `withShowLock` / in-RPC lock acquisition on every gated path; it acquires nothing and holds nothing. No hashkey gains a holder, no holder moves layer, `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched. The refusal emits are `log.warn` calls on a branch that returns or interrupts before any lock region is entered, so invariant 10's post-commit-outside-the-lock rule is satisfied vacuously.

## Acceptance criteria

The ids are the spec's (§4).

- **AC-1** — gate-first on every one of the 50 gated actions.
- **AC-2** — every refusal branch emits; none is dark; no secret is logged.
- **AC-3** — each refusal uses its surface's established channel; no new returned code.
- **AC-4** — the walk derives its unit set and reconciles it.
- **AC-5** — the exemption set is closed and cross-checked against two registries.
- **AC-6** — a gate that cannot gate is not accepted.
- **AC-7** — no request scope means allow, with the catch scoped to `headers()`.
- **AC-8** — nothing on a render path is gated.
- **AC-9** — no suite outside the three that gain gate cases changes at all; those three add a `headers` export to a `next/headers` mock with a same-origin default, which is additive and leaves every existing case passing.
- **AC-10** — `pnpm mutation:guards` green with an empty unaccepted-survivor set.

## File structure

- `lib/auth/sameOriginServerAction.ts` (modify) — scoped `headers()` catch; the four designated refusal exports.
- The 23 admin action modules (modify) — one gate line each, 42 in total (spec §3.7).
- `lib/auth/picker/selectIdentity.ts`, `lib/auth/picker/cleanupStaleEntry.ts` (modify) — four picker gate lines.
- `app/show/[slug]/unpublish/actions.ts` (modify) — one gate line.
- `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx`, `components/auth/IdentityChip.tsx` (modify) — one gate line each (Resolved scope #9r).
- `lib/auth/picker/clearIdentity.ts` (modify) — its module-local `rejectCrossOrigin` migrates to the designated `rejectCrossOriginPicker` export, emit preserved exactly.
- tests/auth/\_metaServerActionOriginGate.test.ts (plain text: created by Task 2).
- `tests/auth/sameOriginServerAction.test.ts`, `tests/mutation/source/registry.ts`, `tests/mutation/guardSurfaces.gate.test.ts`, `tests/mutation/_metaPremiseContract.test.ts` (modify).
- `BACKLOG.md` / `BACKLOG-archive.md` (modify at close).

## Source-tag map (probed at plan time, not invented)

Every gated action's `source` is the tag its own file already uses. Probed with `rg -o 'source: "[^"]+"' <file> | sort -u` across all 29 modules. Where a file has one tag, every action in it uses that tag and the `action` argument disambiguates — the same disambiguation the spec fixes for the two `acceptChangeAction`s.

| Module | `source` |
| --- | --- |
| `app/admin/_actions/autoApplied.ts` | `admin.dashboard.autoApplied.accept` / `.acceptAll` / `.undo` (per action) |
| `app/admin/actions.ts` | `admin.actions` (`resolveAdminAlertFormAction`), `app.admin.actions.resolveHealthAlert`, `admin.watchRetry` |
| `app/admin/dev/actions.ts` | `admin.dev.parseAndStage` / `.resetDevSchema` / `.applyAttentionScenario` / `.clearAttentionScenario` (each `…FormAction` wrapper shares its callee's tag) |
| `app/admin/onboarding/_actions/roleTokenStaged.ts` | `admin.onboarding.roleTokenStaged` |
| `app/admin/onboarding/_actions/useRawStaged.ts` | `admin.onboarding.useRawStaged` |
| `app/admin/settings/_actions/roleTokenMappings.ts` | `admin.settings.roleTokenMappings` |
| `app/admin/settings/_actions/setAlertOnAutoPublish.ts` | `admin.settings.alertOnAutoPublish` |
| `app/admin/settings/_actions/setAlertOnSyncProblems.ts` | `admin.settings.alertOnSyncProblems` |
| `app/admin/settings/_actions/setAutoPublish.ts` | `admin.settings.autoPublish` |
| `app/admin/settings/_actions/setDailyReviewDigest.ts` | `admin.settings.dailyReviewDigest` |
| `app/admin/settings/_actions/validationReset.ts` | `admin.settings.validationReset` |
| `app/admin/settings/admins/actions.ts` | `admin.settings.admins.grant` / `.revoke` |
| `app/admin/settings/admins/developerActions.ts` | `admin.settings.admins.developer` |
| `app/admin/show/[slug]/_actions/archive.ts` | `admin.show.archive` |
| `app/admin/show/[slug]/_actions/feed.ts` | `admin.show.feed.mi11Approve` / `.mi11Reject` / `.undoChange` / `.accept` / `.acceptAll` |
| `app/admin/show/[slug]/_actions/roleToken.ts` | `admin.show.roleToken` |
| `app/admin/show/[slug]/_actions/setPublished.ts` | `admin.show.setPublished` |
| `app/admin/show/[slug]/_actions/unarchive.ts` | `admin.show.unarchive` |
| `app/admin/show/[slug]/_actions/useRaw.ts` | `admin.show.useRaw` |
| `lib/auth/picker/resetCrewMemberSelection.ts` | `admin.picker.resetCrewMemberSelection` (`OUTCOME_SOURCE`, `lib/auth/picker/resetCrewMemberSelection.ts:24`) |
| `lib/auth/picker/resetPickerEpoch.ts` | `admin.picker.resetEpoch` |
| `lib/auth/picker/rotateShareToken.ts` | `admin.picker.rotateShareToken` |
| `lib/onboarding/serverActions.ts` | `admin.onboarding.startOver` / `.rerunSetup` |
| `app/show/[slug]/unpublish/actions.ts` | `show.unpublish.confirmAction` |
| picker-family (`selectIdentity.ts`, `cleanupStaleEntry.ts`, `clearIdentity.ts`, the three `.tsx` wrappers) | `auth.picker.sameOriginGate`, carried inside the designated refusal exports rather than passed per site |

## The ratchet — how 50 gate lines get red-then-green on ONE command

The walk cannot land green (50 actions are ungated) and must not land last (invariant 1 forbids implementation before the test that exercises it — spec §5 fixes this). So Task 2 lands it with a `PENDING_GATE` array of module paths whose units the walk skips, and every later gate task removes its own modules from that array in the same commit that adds their gate lines. `pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts` is therefore RED at each gate task's start and GREEN at its end.

Two properties make the ratchet honest rather than a place to hide:

1. **A stale entry FAILS.** The walk asserts that every path still listed in `PENDING_GATE` contains at least one ungated unit, so a module that got gated but was left listed reds the suite.
2. **The array's death is a task.** Task 10 asserts it is empty, deletes it and the branch that reads it, and asserts the walk's own source no longer contains the identifier. The shipped guard has no allowlist in it.

## Plan-time probe record

Run at plan time on this branch's HEAD; output pasted, not described.

- **Census** — `collectSurfaceUnits(["app","lib","components"])` filtered to `kind !== "route"` reports `TOTAL_UNITS=56` and `FILES=31`, matching spec §3.7 row-for-row. Independently re-verified by the reviewer in all four spec rounds.
- **Grep reconciliation** — `rg -l '"use server"' lib app | wc -l` → `38`; the directive filter prints 8 comment-only paths and `30` directive-bearing modules; `30 + 1` (`components/auth/IdentityChip.tsx`) `= 31`.
- **Render-path scan** — across 103 Next entry files there are two render-time invocations, both class E (spec §2.4). Widened scan: 887 `.ts`/`.tsx` files, 856 outside the 31 defining files; every to-be-gated call site is in a client component.
- **Source tags** — the table above.
- **Parameter initializers** — across all 56 units exactly one exists, `parseAndStage`'s `prior: ParseResult | null = null` (`app/admin/dev/actions.ts:141`); no unit destructures a parameter. The accept-sets' parameter precondition therefore costs the live corpus nothing.
- **Invariant-10 non-interference** — `codedLog` computed per unit with `predicateFor`'s own settings (`tests/log/_metaMutationSurfaceObservability.test.ts:61-64`) reports **false** for all **nine** units whose passing reason is `no-telemetry` today (enumerated in the Existing-code review above), because the emit sits in an imported helper and `scanBody` sees only direct `log.*` calls. Each therefore keeps passing through its existing `no-telemetry:` exemption, unchanged. The file also carries no unused-exemption rule (`grep -n "both\|redundant\|conflict\|unused exemption\|unnecessary"` returns nothing).
- **Exemption cross-checks resolve** — the three read-only rows are `getStagedResult` at `tests/log/mutationSurface/exemptions.ts:75`, `captureShowTelemetry` at `tests/log/mutationSurface/exemptions.ts:79`, and `listFixtures` at `tests/log/mutationSurface/exemptions.ts:80`; the four dev `*FormAction` wrappers are excluded from them by that file's own note (`tests/log/mutationSurface/exemptions.ts:59-61`) and are in `AUDITABLE_MUTATIONS`.
- **`spec:lint`** — `summary: 0 hard, 0 advisory` on the spec.
- **`export default` closed upstream** — `moduleDefaultExports` (`tests/log/mutationSurface/enumerate.ts:183`) already fails the invariant-10 walk on a default-exported action, so this walk adds no default-export branch.
- **`importBindingOk` is not reusable** — it hardcodes `log` / `logAdminOutcome` (`tests/log/mutationSurface/enumerate.ts:149-160`), so Task 2 writes its own import check, which must read `el.propertyName ?? el.name` so an aliased import fails.

<!-- tasks: depth=3 red-contract -->

### Task 1: helper — catch-allow plus the four designated refusal exports

<!-- task: red=`pnpm vitest run tests/auth/sameOriginServerAction.test.ts` red-state=authored red-target=`lib/auth/sameOriginServerAction.ts:32` why=`headers() is awaited unguarded so a throw propagates instead of allowing, and the module exports no refusal helpers at all` ac=AC-2,AC-3,AC-7 -->

**What is red and why:** the new cases fail because `lib/auth/sameOriginServerAction.ts:32` awaits `headers()` with no guard (a rejecting `headers` mock rejects the whole call rather than resolving `true`) and because the module exports none of `assertSameOriginServerAction`, `rejectCrossOriginPicker`, `rejectCrossOriginNeutral`, `rejectCrossOriginVoid`.

- [ ] **Step 1 (RED).** Extend `tests/auth/sameOriginServerAction.test.ts`:
  1. `headers()` mock REJECTS → `isSameOriginServerAction()` resolves `true`.
  2. **Negative sibling, so the catch is scoped rather than swallowing:** `headers()` RESOLVES, `resolveSiteOrigin` (mocked from `@/lib/notify/siteOrigin`) throws → the call REJECTS. Without this, widening the `try` to the whole body would still pass case 1.
  3. `assertSameOriginServerAction("x", "y")` cross-site → the `log.warn` spy records `code: "SERVER_ACTION_ORIGIN_REJECTED"` with `action: "x"` and `source: "y"`, AND the mocked `forbidden` from `next/navigation` is called. Two assertions, so a silent-refusal regression and an emit-only regression each fail a distinct one.
  4. Same-origin → resolves, no emit, `forbidden` not called.
  5. One case per remaining refusal export: `rejectCrossOriginPicker("a")` returns `{ ok: false, code: "PICKER_INVALID_INPUT" }` and emits `PICKER_ORIGIN_REJECTED` with `source: "auth.picker.sameOriginGate"` and `action: "a"`; `rejectCrossOriginNeutral("b")` returns `{ status: "neutral" }` and emits `SERVER_ACTION_ORIGIN_REJECTED`; `rejectCrossOriginVoid("c")` resolves `undefined` and emits `PICKER_ORIGIN_REJECTED`. Each asserts the returned value AND the emit, so neither can regress silently.
  Cross-site fixtures derive from the suite's existing reject rows (`sec-fetch-site: cross-site`, and the filed bypass shape `cross-site` + absent `Origin`), never an ad-hoc header set.
- [ ] **Step 2 (GREEN).** In `lib/auth/sameOriginServerAction.ts`: wrap ONLY the `await headers()` call in `try { … } catch { return true; }` with a comment naming spec §7; add the four exports exactly as spec §3.2 and §3.6 write them, importing `forbidden` from `next/navigation` and `log` from `@/lib/log`. The refusal exports take a single `action: string` and carry their own `source`, so no call site passes anything but a string literal.
- [ ] **Step 3.** Suite green; `pnpm typecheck`; commit `feat(auth): scope the same-origin helper's headers() catch and add the four designated refusal exports`.

**Premise (executable).** Case 2's discriminating power depends on `resolveSiteOrigin` actually being reached, which happens only when `sec-fetch-site` is absent AND `origin` is present. Assert that precondition on the case's own inputs immediately above it with `premiseHolds` (`tests/_shared/premise.ts:36`) — not once for the file, and never inside a `.each` callback.

### Task 2: the structural walk, its closed exemption set, and the first gated module

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts` red-state=authored red-target=`lib/onboarding/serverActions.ts:8` why=`startOverServerAction carries no same-origin gate, so the walk's live arm fails on the one module left outside PENDING_GATE` ac=AC-4,AC-5,AC-6 -->

**What is red and why:** the walk covers `lib/onboarding/serverActions.ts` — the only to-be-gated module NOT in `PENDING_GATE` — and `startOverServerAction` at `lib/onboarding/serverActions.ts:8` has no gate, so the live arm fails on production code rather than on a fixture the test controls. The fixture self-tests fail alongside it.

- [ ] **Step 1 (RED).** Create tests/auth/\_metaServerActionOriginGate.test.ts implementing spec §3.5-§3.6. It reuses `collectSurfaceUnits`, `parse`, `scanBody`, and `isLocallyRebound` from `tests/log/mutationSurface/enumerate.ts` so the two walks cannot disagree about what a Server Action is.
  - Discovery: `collectSurfaceUnits(["app", "lib", "components"])`, `kind !== "route"`.
  - `PENDING_GATE: readonly string[]` — every module that does not yet satisfy the walk, except `lib/onboarding/serverActions.ts`, which this task gates. That is twenty-nine paths: the twenty-eight remaining to-be-gated modules **plus `lib/auth/picker/clearIdentity.ts`**. The class-D module is listed even though its three actions are already gated, because accept-set B rejects their module-local `rejectCrossOrigin` until Task 7 migrates them to the designated export; without the row, this task's GREEN would be unreachable.
- **Anti-stall assertion:** every listed path still contains at least one unit that does NOT currently satisfy the walk. Phrased over walk-conformance rather than over "ungated" so it covers `clearIdentity.ts`, whose units are gated but non-conforming.
  - **Parameter precondition, both accept-sets:** every parameter is a plain `Identifier` and any initializer is a side-effect-free literal (`null`, `undefined`, string/number/boolean, empty object/array). Parameter defaults run before the first body statement, so an unpinned one sits upstream of the gate.
  - **Accept-set A:** first non-directive statement is `ExpressionStatement` → `AwaitExpression` → `CallExpression`; callee `Identifier` `assertSameOriginServerAction`, imported from `@/lib/auth/sameOriginServerAction` under that exact export name and not locally rebound; exactly two arguments, **both `StringLiteral`**, the first equal to the unit's `fn`.
  - **Accept-set B:** first non-directive statement is an `IfStatement` with no `else`; condition (unwrapping parens) is `!` over `AwaitExpression` over a zero-argument call to the imported, unaliased, unrebound `isSameOriginServerAction`; `thenStatement` is a `ReturnStatement` or a `Block` of exactly one `ReturnStatement`, whose expression is a `CallExpression` with all-`StringLiteral` arguments whose callee is imported from `@/lib/auth/sameOriginServerAction` under one of the three designated refusal export names. **No body analysis of the callee** — resolution is by name against a closed set, which is the spec's R3 narrowing and must not be re-widened.
  - **The exemption is the closed constant** `READ_ONLY_EXEMPT` (three rows, spec §3.5) with its three assertions: each resolves to exactly one discovered unit with `unit.admin === true`; the set equals the `kind: "read-only"` rows of `ADMIN_SURFACE_EXEMPTIONS` (`tests/log/mutationSurface/exemptions.ts:62`) that resolve to a discovered non-route admin unit; and no exempt unit appears in `AUDITABLE_MUTATIONS`.
  - **A fourth assertion: the `scanBody` regression tripwire over the three exempt bodies.** Spec §3.5 keeps it ("a cheap `scanBody` tripwire still runs over the three bodies as belt-and-braces") and AC-5 states its contract — a read-only unit that grows a Supabase write, an `.rpc(` call, or a `logAdminOutcome` emit **at any depth** fails. It was omitted from the three assertions above, which are all set-membership and would pass unchanged while an exempt body started writing. Implement it exactly as the sibling guard's read-only branch does (`tests/log/_metaMutationSurfaceObservability.test.ts:166-167`): `scanBody(unit.node, { descend: true })` and reject on `writeBuilder` or `rpc`, plus a locally written recursive any-call check for `logAdminOutcome` — `scanBody`'s own `adminOutcome` models the durable awaited form only, which is why the sibling carries `containsAnyLogAdminOutcomeCall` (`tests/log/_metaMutationSurfaceObservability.test.ts:70`) beside it, and that helper is not exported. **This is a tripwire, NOT the classifier.** It never decides WHICH units are exempt — the closed set and its two registry cross-checks do that — and its reach is exactly what `scanBody` models, which spec §7 states plainly. Do not widen it when a round names a mutation verb it misses; that is the ratchet the R3 narrowing exists to prevent, and the residual limit is documented rather than chased. Fixtures: one per signal, on a copy of an exempt unit's body — a `.update(` write, an `.rpc(` call, and a bare unawaited `logAdminOutcome(...)` — each asserted to FAIL, plus the three real bodies asserted to pass.
  - Import check: written locally (`importBindingOk` hardcodes `log` / `logAdminOutcome`), reading `el.propertyName ?? el.name` so an aliased import fails.
  - Reconciliation: no orphan or duplicate rows, and `gated + exempted + pending === discovered`.
  - **CI wiring, confirmed not assumed:** the new file needs no config edit. `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) discovers it; `tests/auth/**` is absent from `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:94`), so it runs in the **serial** project; and it is not on `ENV_BOUND_EXCLUDES` (`vitest.projects.ts:36`), so `unit-suite` runs it. No `testMatch` entry and no workflow path-filter edit is required.
  - **Fixture self-tests** via `makeFixture` (`tests/log/_metaMutationSurfaceObservability.test.ts:37`) — the table is spec §3.6's, one failing fixture per clause, including second-argument-is-a-call, parameter-default-is-a-call, destructured-parameter, arbitrary-return-expression, refusal-via-module-local-helper, aliased refusal import, and each of the three exemption assertions.
- [ ] **Step 2 (GREEN).** Gate both actions in `lib/onboarding/serverActions.ts` (`startOverServerAction`, `rerunSetupServerAction`; sources `admin.onboarding.startOver` / `.rerunSetup`).
- [ ] **Step 3.** Suite green; `pnpm typecheck`; commit `test(auth): structural same-origin gate walk over every Server Action surface unit`.

### Task 3: the settings actions (eleven, across eight modules) plus the class-A behavioral test

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts tests/admin/notify-toggle-actions.test.ts` red-state=authored red-target=`app/admin/settings/_actions/setAlertOnAutoPublish.ts:32` why=`the settings modules leave PENDING_GATE with no gate line, and setAlertOnAutoPublish reaches its app_settings UPDATE on a cross-site request` ac=AC-1,AC-2,AC-3 -->

- [ ] **Step 1 (RED).** Remove the eight settings modules from `PENDING_GATE`. Add the class-A representative cases to `tests/admin/notify-toggle-actions.test.ts` as a **standalone `describe` block, NOT inside the existing `describe.each(CASES)`** at `tests/admin/notify-toggle-actions.test.ts:75` — a premise inside an `.each` callback is unreachable in exactly the degenerate case it guards against, which the project rule forbids. The block adds `vi.mock("next/headers", …)` exporting `headers` (the suite currently mocks it not at all), defaulting to a same-origin header set so nothing else changes, and contains two cases on the SAME spies:
  - **cross-site:** `setAlertOnAutoPublish(true)` throws the mocked `forbidden()` interrupt, the `update` spy has **0** calls, and the emit fired with `action: "setAlertOnAutoPublish"`.
  - **same-origin baseline, in the same block, on the same spies:** the call resolves `{ ok: true }` AND `update` was called with `{ alert_on_auto_publish: true }` — asserting the spy is live is the whole point of the baseline, so it asserts the mutation, not merely the return value.
- [ ] **Step 2 (GREEN).** Insert `await assertSameOriginServerAction("<fn>", "<source>")` as the FIRST statement of each, per the source-tag map. For `resetValidationDataAction` and `reseedValidationFixturesAction` the gate goes **before the top-level `try`** — inside it, the `catch` would convert the `forbidden()` interrupt into a benign typed result. The walk's first-statement rule makes this structural rather than a matter of care: a gate inside the `try` is not the first statement and fails.
- [ ] **Step 3.** Both suites green; `pnpm typecheck`; commit `feat(admin): same-origin gate on the settings Server Actions`.

### Task 4: the show-page actions (ten, across six modules)

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts` red-state=authored red-target=`app/admin/show/[slug]/_actions/archive.ts:24` why=`archiveShowAction leaves PENDING_GATE with no gate line, so the walk's live arm fails on it` ac=AC-1,AC-2,AC-3 -->

- [ ] **Step 1 (RED).** Remove the six show-action modules from `PENDING_GATE`.
- [ ] **Step 2 (GREEN).** Gate each of them (spec §3.7 rows 28-37). The five `feed.ts` actions keep their own `admin.show.feed.*` tags, and `acceptChangeAction` here is disambiguated from its `autoApplied.ts` namesake by `source`.
- [ ] **Step 3.** Suite green; `pnpm typecheck`; commit `feat(admin): same-origin gate on the show-page Server Actions`.

### Task 5: the dev-panel and dashboard actions (fourteen, across three modules)

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts` red-state=authored red-target=`app/admin/dev/actions.ts:423` why=`resetDevSchema leaves PENDING_GATE with no gate line; it truncates the dev schema and is the highest-blast-radius unit in the census` ac=AC-1,AC-2,AC-3,AC-5 -->

- [ ] **Step 1 (RED).** Remove the three modules from `PENDING_GATE`. This is also the first task whose scope contains exempt units — `getStagedResult` and `listFixtures` must pass via `READ_ONLY_EXEMPT`, not via a gate — so it exercises the closed exemption set against real code.
- [ ] **Step 2 (GREEN).** Gate the destructive ones (spec §3.7 rows 1-14 minus the two read-only units). The four `…FormAction` wrappers share their callee's `source` and are disambiguated by `action`.
- [ ] **Step 3.** Suite green; `pnpm typecheck`; commit `feat(admin): same-origin gate on the dev-panel and dashboard Server Actions`.

### Task 6: the onboarding and picker admin actions (five, across five modules)

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts` red-state=authored red-target=`lib/auth/picker/rotateShareToken.ts:26` why=`rotateShareToken leaves PENDING_GATE with no gate line` ac=AC-1,AC-2,AC-3 -->

- [ ] **Step 1 (RED).** Remove the last five admin modules from `PENDING_GATE`.
- [ ] **Step 2 (GREEN).** Gate `mapRoleTokenStaged`, `setStagedUseRawDecisionAction`, `resetCrewMemberSelection`, `resetPickerEpoch`, `rotateShareToken`. **No secret is logged:** `rotateShareToken` emits `epoch_<n>` and never the share token (AGENTS.md invariant 10), and the gate's emit carries only `action` and `source`, so it cannot regress that.
- [ ] **Step 3.** Suite green; `pnpm typecheck`; commit `feat(auth): same-origin gate on the onboarding and picker admin Server Actions`.

### Task 7: the picker actions, and the shipped local helper's migration

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts tests/auth/picker/selectIdentity.test.ts tests/auth/picker/cleanupStaleEntry.test.ts tests/auth/picker/clearIdentity.test.ts` red-state=authored red-target=`lib/auth/picker/selectIdentity.ts:37` why=`selectIdentity leaves PENDING_GATE with no gate line and writes the picker identity cookie on a cross-site request` ac=AC-1,AC-2,AC-3,AC-9 -->

- [ ] **Step 1 (RED).** Remove the two picker modules AND `lib/auth/picker/clearIdentity.ts` from `PENDING_GATE`. Add `headers` to the module mock at `tests/auth/picker/selectIdentity.test.ts:20` — it currently mocks `next/headers` as `{ cookies: vi.fn() }`, so `headers()` throws into the catch-allow and a "cross-site" case would be ALLOWED rather than refused. The mock gains a `headers` export defaulting to a same-origin set, exactly the shipped shape at `tests/auth/picker/clearIdentity.test.ts:27`, so every existing case keeps passing (same-origin is allowed either way). Then two cases on the SAME spies:
  - **cross-site:** returns `{ ok: false, code: "PICKER_INVALID_INPUT" }`, the cookie-store `set` and the RPC spy each have **0** calls, and the `PICKER_ORIGIN_REJECTED` emit fired with `action: "selectIdentity"`.
  - **same-origin baseline, same spies:** the RPC spy was called AND the cookie was written. The suite's existing wrapper case (`tests/auth/picker/selectIdentity.test.ts:213-220`) asserts only `{ ok: true }`, which would be satisfied by a wrapper that reached neither mutation, so it is NOT a sufficient baseline and this task adds its own.
- [ ] **Step 2 (GREEN).** Gate `selectIdentity`, `selectIdentityCore`, `cleanupStaleEntry`, `cleanupStaleEntryCore` with `if (!(await isSameOriginServerAction())) return rejectCrossOriginPicker("<fn>");`. Both wrappers AND both cores, matching the shipped class-D posture: the per-endpoint `action` string is what makes each guard independently load-bearing (`lib/auth/picker/clearIdentity.ts:50-56`). Then migrate `clearIdentity.ts`'s module-local `rejectCrossOrigin` to the designated `rejectCrossOriginPicker` — delete the local function, import the export, leave all three call sites' `action` strings unchanged. The emit is byte-identical (`code`, `source`, `action`), so `tests/auth/picker/clearIdentity.test.ts` must pass **unmodified**; if it needs an edit, the migration changed behavior and is wrong.
- [ ] **Step 3.** All four suites green; `pnpm typecheck`; commit `feat(auth): same-origin gate on the picker select and cleanup actions`.

**AC-9 check, here rather than at the end.** The distinction the AC draws is between suites that TEST the gate and suites that merely call a gated action. The former need a `headers` export — a cross-site case is untestable without one, since a missing `headers` lands in the catch-allow and is allowed. The latter need nothing: `tests/auth/picker/cleanupStaleEntry.test.ts:13` keeps its `{ cookies: vi.fn() }` mock untouched and its cases keep passing through the catch-allow, and the other 72 suites in the denominator mock `next/headers` not at all and are likewise unchanged. If a suite in that second group appears to need a mock, stop and re-read Resolved scope #6 rather than adding one — that would mean the catch-allow is not doing its job.

### Task 8: class C — `confirmUnpublishAction`

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts tests/show/unpublishConfirmAction.test.ts` red-state=authored red-target=`app/show/[slug]/unpublish/actions.ts:36` why=`confirmUnpublishAction leaves PENDING_GATE with no gate line and reaches prevalidateUnpublishBinding on a cross-site request` ac=AC-1,AC-2,AC-3 -->

- [ ] **Step 1 (RED).** Remove the module from `PENDING_GATE`. Add to `tests/show/unpublishConfirmAction.test.ts` a `next/headers` mock exporting `headers` with a same-origin default (the suite mocks it not at all today, so without this a "cross-site" case lands in the catch-allow and is allowed), then two cases on the SAME spy:
  - **cross-site:** returns `{ status: "neutral" }`, the `prevalidateUnpublishBinding` spy has **0** calls (no token touched), and the emit fired.
  - **same-origin baseline, same spy:** `prevalidateUnpublishBinding` was called with the submitted slug/token/r — proving the spy records, which "reaches the pre-check" alone does not.
- [ ] **Step 2 (GREEN).** Gate with `if (!(await isSameOriginServerAction())) return rejectCrossOriginNeutral("confirmUnpublishAction");`. Neutral is the value the action already returns for a missing field (`app/show/[slug]/unpublish/actions.ts:43`), so no new state and no new copy.
- [ ] **Step 3.** Both suites green; `pnpm typecheck`; commit `feat(show): same-origin gate on the unpublish confirm action`.

### Task 9: the three inline `.tsx` wrappers (Resolved scope #9r)

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts` red-state=authored red-target=`components/auth/IdentityChip.tsx:31` why=`clearIdentityFormAction leaves PENDING_GATE with no gate line; the delegate returns a typed refusal rather than throwing, so the wrapper keeps executing` ac=AC-1,AC-2,AC-3 -->

- [ ] **Step 1 (RED).** Remove the last three modules from `PENDING_GATE`, leaving it empty (Task 10 retires it).
- [ ] **Step 2 (GREEN).** Add one gate line as the first statement of each wrapper body, after the inline `"use server"` directive. `selectIdentityFormAction` (`Promise<void>`) and `clearIdentityAndSkipFormAction` (`Promise<void>`) return `rejectCrossOriginVoid("<fn>")`; `clearIdentityFormAction` (`Promise<ClearIdentityResult>`) returns `rejectCrossOriginPicker("clearIdentityFormAction")`. These are Server Components, so the import is a plain module import; no `"use client"` file is touched and no rendered element changes.
- [ ] **Step 3.** Suite green; `pnpm typecheck`; commit `feat(auth): same-origin gate on the inline form-action wrappers`.

### Task 10: retire `PENDING_GATE` — full-discovery reconciliation

<!-- task: red=`pnpm vitest run tests/auth/_metaServerActionOriginGate.test.ts` red-state=authored red-target=`tests/auth/_metaServerActionOriginGate.test.ts` why=`the newly authored no-PENDING_GATE-identifier assertion fails while the array and its branch are still in the file; the anti-stall assertion is NOT a red cause here, since it passes vacuously over an empty array` ac=AC-4,AC-5 -->

- [ ] **Step 1 (RED).** Add the terminal assertions: `gated + exempted === discovered` over FULL discovery with no pending term, and a source-level assertion that the walk's own file contains no `PENDING_GATE` identifier, so the ratchet cannot be quietly re-introduced. **Only the second is a red cause** — Task 9 already leaves the array empty and the suite green, so the anti-stall assertion passes vacuously over it and the reconciliation with a zero pending term is arithmetically identical to the one already passing.
- [ ] **Step 2 (GREEN).** Delete the array, the skip branch that reads it, and the anti-stall assertion.
- [ ] **Step 3.** Suite green; then `pnpm heavy pnpm test` — the whole suite, not a scoped gate, because retiring the ratchet is the moment a regression anywhere else would first show. **Its acceptance is not "green"**, and stating it as green would have made this step unreachable: the invariant-8 closeout marker cannot honestly be filled until the impeccable dual gate has actually run at closeout step 1 and the marker is written at step 2, so `tests/docs/_metaInvariant8Closeout.test.ts` is RED on this branch by design from the moment this plan declared both gate halves (§4.1.1, `tests/docs/_metaInvariant8Closeout.test.ts:157`). The acceptance is therefore **exactly one failing file** — that one — with its violation naming `2026-08-16-server-action-origin-sweep.md` and both remedies (`marker`, `PRE_GUARD_DEBT`, per the message at `tests/docs/_metaInvariant8Closeout.test.ts:74`). **Any second failing file, or a different message on that one, is a stop, not a carve-out**; the exception is named this narrowly so it cannot mask a real regression. Closeout step 3 re-runs the same command with no exception at all, because step 2 has filled the marker by then.

  **The "exactly one" claim has a precondition, and it is the spec+plan arc's to satisfy, not this task's.** `tests/docs/_metaReviewRoundEconomy.test.ts` reds whenever a stage passes `ROUND_THRESHOLD` counted rounds with no filing section, and the spec+plan arc burned enough plan rounds to owe one. That arc commits both the `## spec` and `## plan` sections of `docs/review-rounds/fix/server-action-origin-sweep/119895a7c756.md` before handing this plan over, so the guard is green from the first implementation commit onward — verify it with `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` at Task 1 rather than discovering it here. The diff stage has no rounds yet at this point in the plan (its review is closeout step 4), so it owes nothing. Then `pnpm typecheck`; `pnpm exec eslint .`; `pnpm format:check`; commit `test(auth): retire the origin-gate ratchet; the walk now covers every discovered unit`.

### Task 11: enrol the helper, and satisfy the premise contract that enrolment turns on

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm vitest run tests/mutation/guardSurfaces.gate.test.ts tests/mutation/_metaPremiseContract.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/guardSurfaces.gate.test.ts:34` why=`EXPECTED_LEDGER_KINDS and EXPECTED_ENV_TOUCHING each assert exact key equality against the enrolled surfaces, and neither has a sameOriginServerAction key, so step 1's registry row reds both` ac=AC-10 -->

**What is red and why:** enrolment is not a free registry row — it turns on TWO exact-key expectation tables, and the class sweep over every consumer of `GUARD_SURFACES` found three:

1. `EXPECTED_LEDGER_KINDS` (`tests/mutation/guardSurfaces.gate.test.ts:34`) — `tests/mutation/guardSurfaces.gate.test.ts:152` asserts its keys equal the enrolled surface ids exactly. Live count is 16 keys against 16 surfaces, so step 1's seventeenth surface reds it immediately.
2. `EXPECTED_ENV_TOUCHING` (`tests/mutation/_metaPremiseContract.test.ts:30`) — `tests/mutation/_metaPremiseContract.test.ts:141` asserts its keys equal the enrolled suite paths exactly, and `tests/mutation/_metaPremiseContract.test.ts:154` then requires the declared number to match what `classifyTests` finds.
3. `tests/mutation/_metaGuardSurfaceRegistry.test.ts` — needs no data row, but it is in the command so the enrolment's static validation is exercised rather than assumed.

All three land in this one command, which also runs the harness for the new surface (`describe.each(GUARD_SURFACES)` at `tests/mutation/guardSurfaces.gate.test.ts:157`), so it is a heavy phase and takes a slot.

**`VITEST_INCLUDE_MUTATION_HARNESS=1` is load-bearing on that command, not decoration.** `tests/mutation/guardSurfaces.gate.test.ts` is in `MUTATION_TEST_GLOBS` (`vitest.projects.ts:83-86`) and in `NIGHTLY_ONLY_EXCLUDES` (`vitest.projects.ts:88-91`), so both default projects exclude it, and the `mutation` project that includes it is spread into the config ONLY under `process.env.VITEST_INCLUDE_MUTATION_HARNESS === "1"` (`vitest.config.ts:137-148`). Without the variable, naming the file on the command line collects **nothing** for it — the red-target line would never execute and the command would report a false green off the other two files. That is why the shipped `mutation:guards` script sets the variable ahead of its own `vitest run`. The other two files are ordinary unit tests in the default serial project and need no opt-in, which is why one command covers all three. The variable is set OUTSIDE `pnpm heavy` because that wrapper `execvp`s the command directly and would read a leading `VAR=value` as a program name, not an assignment.

Note the shape of this cycle: the RED is created by step 1's registry row and closed by step 2, on the identical command. It is NOT "`pnpm mutation:guards` fails because no row exists" — enrolment is opt-in and an absent surface simply generates no mutants (`tests/mutation/source/registry.ts:8-9`), so that command PASSES unenrolled and would have been an invalid red.

- [ ] **Step 1 (RED).** Add the `GuardSurface` row to `tests/mutation/source/registry.ts`: `id: "sameOriginServerAction"`, `sourcePath: "lib/auth/sameOriginServerAction.ts"`, `suitePaths: ["tests/auth/sameOriginServerAction.test.ts"]`, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.95` (the modal value among the sixteen shipped rows — seven use 0.95, six use 0.9, three use 1.0), `control: { from: 'secFetchSite === "same-origin"', to: 'secFetchSite !== "same-origin"' }`, `accepted: []`.

  **Registry reconciliation, run at plan time and pasted rather than described** (`docs/agents/writing-plans.md:27`). Three arrays move, and all three counts are live-tree readings:

  | array | live | after this task | delta |
  | --- | --- | --- | --- |
  | `GUARD_SURFACES` rows (`grep -c '^    id: "' tests/mutation/source/registry.ts`) | **16** | **17** | +1, none removed or renamed |
  | `EXPECTED_LEDGER_KINDS` keys (`tests/mutation/guardSurfaces.gate.test.ts:34`) | **16** | **17** | +1, `sameOriginServerAction: {}` while `accepted` is empty |
  | `EXPECTED_ENV_TOUCHING` keys (`tests/mutation/_metaPremiseContract.test.ts:30`) | **24** | **25** | +1, `tests/auth/sameOriginServerAction.test.ts` |

  The key counts differ because a surface may declare more than one suite path; the target suite is absent from both tables today (probed). **The three do not move together, and that separation IS the cycle**: step 1 adds only the `GUARD_SURFACES` row, so immediately after it the readings are **17 / 16 / 24** — and it is precisely that mismatch, against two tables asserting exact key equality, that makes the RED. Step 2 adds the two keys, taking the readings to **17 / 17 / 25**. Anyone who sees 17 / 17 / 25 after step 1 has done the GREEN edits early and destroyed the cycle.

  **The new `EXPECTED_ENV_TOUCHING` VALUE is a derivation, and the plan states the derivation rather than a number it cannot yet know**, because the value is a property of the cases Task 1 authors. The live baseline, probed: `classifyTests(ROOT, "tests/auth/sameOriginServerAction.test.ts")` classifies **three** test declarations and **two** as `environment-touching` — the `it.each` at `tests/auth/sameOriginServerAction.test.ts:90` (one classification for the whole `.each`, not one per row) and the unresolvable-site-origin case at `tests/auth/sameOriginServerAction.test.ts:95` — and neither carries a premise today. Task 1 adds five case groups (its step 1, items 1-5); the value of this row is **2 plus however many of those the scanner classifies `environment-touching`**, and the ceiling is therefore 7. The order is fixed and is not negotiable: decide per case, from what the case does, whether it reaches environment state and therefore needs a `premise` / `premiseHolds` line or an explicit `no-premise` justification; count those decisions; THEN run the scanner and require it to agree. A disagreement is a stop — reconcile the case, never edit the number to match the tool. Reading the count off the scanner first is the degenerate-source shape the premise contract exists to stop (`tests/mutation/source/premiseScan.ts:24`), and it is why this row cannot be a literal in the plan.

- [ ] **Step 2 (GREEN).** Add the `EXPECTED_LEDGER_KINDS` entry for `sameOriginServerAction` — `{}` while `accepted` is empty, and matching kind counts if any survivor is later blessed. Add the `EXPECTED_ENV_TOUCHING` key for the suite, its value produced by the derivation pasted under step 1 (baseline two, ceiling seven, decided per case and only then checked against the scanner), and give each environment-touching case in `tests/auth/sameOriginServerAction.test.ts` — the two that already classify as one, and every new one the derivation counts — either a `premise` / `premiseHolds` line proven on that case's OWN inputs, or an explicit `no-premise` justification where the environment IS the fixture.
- [ ] **Step 3.** The full RED command green; `pnpm typecheck`; commit `test(auth): enrol the same-origin helper in the source-mutation guard gate`.

<!-- tasks: end -->

## Mutation-guard acceptance (not a TDD task)

Running the harness is a measurement, not a behavior change, so it carries no `red=` — the same reason backlog reconciliation below carries none. It runs at closeout step 3, with the other full local gates, and its acceptance is stated here:

- `pnpm heavy pnpm mutation:guards` reports a score at or above the row's `scoreFloor` for `sameOriginServerAction`, with an **empty unaccepted-survivor set**.
- Every survivor is repaid by a test unless it is genuinely equivalent; an `accepted` row is admissible only with its argument written out and a `BL-`/`DEF-` ref where one applies. Each such repair is an ordinary red-then-green cycle against the surviving mutant, committed on its own.
- **Mutation-operator families close here.** The six declared operators (`tests/mutation/source/operators.ts:17`) are the closure set the whole-diff review converges against; a reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard, and that is a registry change carrying its own before/after numbers rather than a round on this arc.
- The score and the unaccepted-survivor set are stated in the whole-diff review brief (closeout step 4).

## Backlog reconciliation (not a TDD task)

It has no production RED, so forcing it into the enrolled region manufactures a fake cycle and an empty commit.

- **Already filed (this spec+plan arc):** `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` carries `**Status:** IN PROGRESS · **Branch:** fix/server-action-origin-sweep`, committed and pushed at Stage 0 so the claim is visible to every other session (invariant 12). It stays that way for the whole implementation.
- **Archived at CLOSEOUT step 5, the PR's last commit:** the entry moves to `BACKLOG-archive.md` with a resolution note, its IN PROGRESS marker removed in the SAME commit — archives reject in-progress entries, and a marker that reaches `main` names a branch the merge just deleted, which reds `tests/docs/_metaLedgerInProgress.test.ts` on `main` until somebody clears it. It rides in the one commit that must follow the review anyway — the commit holding the approving round's own corpus row — and nothing else may ride with it. The closeout preamble states why that residual is a fixed point rather than an exception, and fences the three orderings already tried.
- **Nothing new is filed unless a peer is deferred.** The class-sweep disposition rule binds: every destructive action is gated here, so there is no peer to defer. If implementation turns up a destructive unit this plan does not gate, it is gated in-branch, or a `BL-` entry names which of exceptions (a)/(b)/(c) applies and why — "same defect, different file" is never sufficient.

## 12. Closeout

Ordered; each item gates the next. Two project rules bear on the tail of this list and appear to pull opposite ways, so the ordering below is the one that satisfies both as far as they CAN be satisfied, with the residual stated as a documented limit rather than argued as an exception. It is fenced in every direction that has been tried, because three consecutive review rounds pushed it three different ways (plan R7 #2, R8 #2, R9 #1).

- `docs/agents/writing-plans.md:28` shape (i): **the diff the final review round examined must be the diff that merges.** Its wording is about the diff, not about executable lines, so "the post-review commit carries no code" does NOT exempt anything.
- Invariant 12 (`AGENTS.md`): the ledger marker **comes off in the PR's last commit, before the merge, so it never reaches `main`**, and the origin-visible claim lives as long as the work does.

**The residual is a fixed point, not an ordering choice.** Every codex-guard dispatch appends a row to this arc's `docs/review-rounds/fix/server-action-origin-sweep/119895a7c756.jsonl` at dispatch time, committed with the arc (`AGENTS.md`, codex-guard bullet 5; `scripts/reviewRoundEmit.mjs`). The APPROVING round's own row therefore cannot exist inside the diff that round reviewed — no ordering can put a record of an event before the event. The same holds for a `## diff — <n> rounds` filing that round triggers, which summarizes the review that just happened. So a last commit after the final review is not avoidable; what IS controllable is exactly what may ride in it.

**The ordering:** review last (step 4), then ONE final bookkeeping commit (step 5) whose contents are closed to three things — the approving round's corpus row, any round-economy filing that round triggered, and the invariant-12-mandated archive plus marker removal, which invariant 12 requires be in the last commit anyway. Every substantive change is inside the reviewed diff; the delta between reviewed and merged is exactly the artifacts the act of reviewing produced, plus the one removal a different invariant demands there. **Nothing else may ride in step 5** — a source file, a test, a doc edit, or a repair in that commit is a violation, and a repair the review demands goes back through step 4 instead.

**Do not re-propose** the archive-before-gates ordering (R7's repair — it gives up invariant 12 and leaves the row unclaimed through gates, review, and CI), the archive-as-last-authored-commit ordering (R8's repair — R9 showed it has no terminal path, because the final round's own corpus row must be committed after it), or a claim that the post-review commit is exempt because it carries no code (the original draft — refuted at R7). Each was tried; this is where they land.

1. **Impeccable dual-gate.** The diff edits `.ts` action files under `app/` outside `app/api/` and three `.tsx` files including one under `components/`, so the impeccable critique gate AND the impeccable audit gate both run on the diff (v3 setup gates: the skill's context load of PRODUCT.md + DESIGN.md, then the register-reference read). No rendered element, token, or copy changes — the expected finding surface is nil — but the gate runs and the result is recorded here honestly, including a zero. P0/P1 fixed or `DEFERRED.md`'d; findings and dispositions recorded in this section.

   **RESULT — both halves RAN, both DEGRADED (single-context).** Setup gates completed: `context.mjs` loaded PRODUCT.md + DESIGN.md (run from the skill's own base directory — this repo gitignores `.claude/`, so the documented `.claude/skills/impeccable/scripts/context.mjs` path does not resolve in a fresh worktree), then the **product** register reference (design SERVES the product: admin + crew app UI, not a marketing surface).

   ⚠️ **DEGRADED: single-context (assessment sub-agents dispatched and never returned).** Assessment A and Assessment B were dispatched as two isolated sub-agents per the critique contract's hard invariant. Neither returned within ~20 minutes and neither appeared in the live agent listing — the recorded `#809` failure mode on this project (`feedback_critique_subagents_idle_without_returning`). They were treated as unobtainable and both assessments re-run inline, which the contract permits only with this banner. The banner is the point: a silent degraded critique is a failed critique.

   **Assessment B — deterministic evidence (this ran fully; nothing about it is degraded).**

   | Probe | Result |
   | --- | --- |
   | `detect.mjs --json` over all three `.tsx` files | `[]`, exit 0 — clean |
   | `.tsx` diff | 3 files, **22 insertions, 0 deletions** |
   | Changed-line classification | 6 import / 11 comment / 5 guard statement / **0 anything-else** |
   | `app/globals.css`, `tailwind.config.ts`, `DESIGN.md`, `postcss.config.mjs` | **empty diff** |
   | Added lines containing `className` | **0** |
   | Em dashes / apostrophe literals in added user-visible copy | **0** (every added non-code line is a comment) |
   | Browser visualization | **SKIPPED**, with reason: these are Server Components behind an authenticated/tokened route, no dev server may be started (machine-wide heavy-phase semaphore, AGENTS.md), and the diff adds no rendered element. Recorded rather than silently omitted. |

   **Assessment A — design review (inline).** The one question worth asking of this diff is not how it looks, it is **what a crew member sees when the new refusal branch fires**, and that was traced rather than assumed:

   - `selectIdentityFormAction` and `clearIdentityAndSkipFormAction` are `Promise<void>`. The refusal returns void, so no `redirect(...)` runs and the surface re-renders unchanged. The person who *did not* make the request sees nothing — correct, since the request was never theirs.
   - `clearIdentityFormAction` returns `rejectCrossOriginPicker(...)` → `{ ok: false, code: "PICKER_INVALID_INPUT" }`. `AvatarMenu` maps **any** `!result.ok` to `setSwitchStatus("error")` (`components/auth/AvatarMenu.tsx:124`) and renders `messageFor("PICKER_SWITCH_FAILED").crewFacing` (`components/auth/AvatarMenu.tsx:461`). Catalogued human copy; the returned `code` is never rendered. **Invariant 5 upheld, and no new state is introduced** — the refusal lands in a failure state the menu already owned.

   Nielsen heuristics were scored against the three surfaces as they now stand; the diff moves **none** of them, because it adds no element, state, affordance, or copy. Recording per-heuristic numbers here would assert a measurement of surfaces this arc did not change, so what is recorded instead is the honest delta: **no heuristic moved**. Cognitive load: unchanged, no decision point gains an option. Emotional journey: unchanged on every legitimate path; the only new path is unreachable by a legitimate user.

   **Audit dimensions (inline).** Accessibility — unchanged (no new interactive target, so no new tap-target or ARIA surface; the `min-h-tap-min` floor is untouched). Performance — unchanged; the guard adds one `headers()` read ahead of work that already awaited I/O, and it *shortens* the cross-origin path. Theming — unchanged, zero token references added. Responsive — unchanged, zero layout or `className` lines. Anti-patterns — none: no gradient text, no glass, no side-stripe, no eyebrow, no card grid; nothing was added that could carry a tell.

   **Findings: P0 = 0, P1 = 0, P2 = 0, P3 = 0.** No dispositions to record, and none invented to look thorough. Two things the gate did surface as *worth doing* were folded into the branch as executable guards rather than filed as design findings, because both are correctness rather than presentation: the gate's proxy-independence and the no-dark-refusal contract now have guards with mutants proving each discriminates (commit `03e5a8c2c`).

   **One process finding, recorded rather than dispositioned:** the critique contract's mandatory dual-sub-agent orchestration is unreliable on this project, and this is the second recorded instance. It is not a finding against this diff and needs no `DEFERRED.md` row here — `feedback_critique_subagents_idle_without_returning` already carries it.
2. **Fill the machine closeout marker, BEFORE review.** After step 1 has actually run, add the bare-anchored marker line to this section: a line reading `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>` with the REAL counts (`RAN-DEGRADED` if a half degraded; `dispositions=recorded` iff `p0+p1>0`). **Never fabricated** — the gate has not run in the spec+plan arc, so no `RAN` claim is honest yet, and `tests/docs/_metaInvariant8Closeout.test.ts` reds on this unmerged branch by design until the implementation arc fills it.

   impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=0 dispositions=none

   **Then commit, here.** Steps 1 and 2 both write tracked text into this document — the findings-and-dispositions record and the marker line — and without a commit site of their own they would either sit uncommitted and risk never reaching the pushed branch, or ride into a later commit whose contents are supposed to be something else. Commit them as `docs(plan): record the invariant-8 dual-gate result and fill the closeout marker`.
3. **Full local gates:** `pnpm heavy pnpm test` (no exception now — step 2 filled the invariant-8 marker, so `tests/docs/_metaInvariant8Closeout.test.ts` is green here, unlike at Task 10), `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, `pnpm heavy pnpm mutation:guards`.
4. **Whole-diff cross-model review to APPROVE — the last thing that examines the code.** The brief states the mutation score and the unaccepted-survivor set (AGENTS.md convergence bullet 4), the consequence bound, the `PROBE DOMAIN:`, and the threat fence, and carries the spec's §1.1 do-not-relitigate list — in particular Resolved scope #9r and 12c-12g, which cost four spec rounds to settle. Any repair this review demands lands as its own commit and this step runs AGAIN; the arc leaves step 4 only on an APPROVE with no repair outstanding.
5. **One final bookkeeping commit — the PR's LAST commit, closed to exactly three things.** (a) The approving round's corpus row in `docs/review-rounds/fix/server-action-origin-sweep/`, which could not have existed before the round. (b) A `## diff — <n> rounds` section in `docs/review-rounds/fix/server-action-origin-sweep/119895a7c756.md` if the diff stage reached `ROUND_THRESHOLD` counted rounds (`4`, `lib/reviewRounds/constants.ts:11`) — likewise a summary of the review that just happened. (c) `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` archived to `BACKLOG-archive.md` with a resolution note and its IN PROGRESS marker removed in this SAME commit, which is where invariant 12 requires the removal to be. Then `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts tests/docs/_metaReviewRoundEconomy.test.ts` and `pnpm format:check`. **Anything beyond those three is a violation**, not a judgment call: a source file, a test, or a repair here means the merged diff differs from the reviewed diff by something a review could have found, and the fix is to go back to step 4.
6. **Real CI green** on the complete tree — the cover for step 5's contents, which the local full suite at step 3 predates — then `gh pr merge --merge`, then fast-forward local `main` to `0  0`.

## Self-review checklist (author, pre-adversarial)

- [ ] **Spec coverage:** §3.2 → Task 1; §3.5-§3.6 → Tasks 2 and 10; §3.3 → Tasks 2-6; §3.4 → Tasks 7-8; §3.5's #9r reversal → Task 9; §6E → Task 11 plus the Mutation-guard acceptance section. §7 needs no task; §2.4 is evidence, not work.
- [ ] **Every AC has a task:** AC-1/2/3 → Tasks 2-9; AC-4/5/6 → Tasks 2, 5, 10; AC-7 → Task 1; AC-8 → no task (a spec-time derivation, re-exercised by Task 5 hitting the exemption path against real code); AC-9 → Task 7's explicit check plus Task 10's full-suite run; AC-10 → Task 11 and the Mutation-guard acceptance section.
- [ ] **Every cross-site case can actually be cross-site.** A suite whose `next/headers` mock has no `headers` export lands in the catch-allow, so its "cross-site" case is ALLOWED. Each of the three behavioral tasks therefore adds a `headers` export with a same-origin default before asserting a refusal, and each says so explicitly.
- [ ] **Every baseline asserts the same spy the cross-site case asserts zero on**, and asserts a mutation rather than a return value — a baseline that only checks `{ ok: true }` is satisfied by an implementation that reached no mutation at all.
- [ ] **Enrolment's downstream contracts are ALL in the plan, not discovered at closeout.** The class sweep over every consumer of `GUARD_SURFACES` found three: `EXPECTED_LEDGER_KINDS` and `EXPECTED_ENV_TOUCHING` each assert exact key equality and each needs a row, and `_metaGuardSurfaceRegistry` needs none but is in the command. A sweep over references to the symbol is NOT the whole obligation, which is how the collection precondition on the guard file escaped two rounds of it: the fourth thing enrolment turns on is that the RED command must actually collect `tests/mutation/guardSurfaces.gate.test.ts`, which no reference to `GUARD_SURFACES` points at. Task 11 is that cycle, and all three array reconciliations (16 → 17, 16 → 17, 24 → 25) plus the new row's value-derivation are run at plan time and pasted.
- [ ] **The mutation RUN is not a TDD task.** `pnpm mutation:guards` passes on an unenrolled surface (enrolment is opt-in, `tests/mutation/source/registry.ts:8-9`), so "no row exists" is not a valid RED. It lives in the Mutation-guard acceptance section with its acceptance stated.
- [ ] **New-test CI wiring is confirmed, not assumed:** `BASE_INCLUDE` discovery, serial-project assignment, and absence from `ENV_BOUND_EXCLUDES`, each cited.
- [ ] **All 50 gated actions are allocated:** 2 (Task 2) + 11 + 10 + 14 + 5 + 4 + 1 + 3 = 50, over 29 modules.
- [ ] **Placeholder scan:** no TBD/TODO; every step has real content.
- [ ] **Identifier consistency:** `isSameOriginServerAction`, `assertSameOriginServerAction`, `rejectCrossOriginPicker`, `rejectCrossOriginNeutral`, `rejectCrossOriginVoid`, `SERVER_ACTION_ORIGIN_REJECTED`, `PICKER_ORIGIN_REJECTED`, `PICKER_INVALID_INPUT`, `PENDING_GATE`, `READ_ONLY_EXEMPT` spelled identically in every task.
- [ ] **RED validity + same-command cycle:** every `red=` names a PRODUCTION line, not a fixture the test controls — the ratchet exists so each gate task's red comes from ungated production code. RED and GREEN run the identical command in every task.
- [ ] **Anti-tautology:** each representative behavioral test asserts refusal value AND no-mutation AND the emit, so a silent-refusal regression, a mutation-still-runs regression, and a dark-refusal regression each fail a distinct assertion; each carries a same-origin baseline proving its spy would have recorded, asserted on that case's own inputs. Task 7's migration is proven by `clearIdentity.test.ts` passing UNMODIFIED.
- [ ] **Premise reachability:** every premise executes unconditionally relative to what it guards, never inside a `.each` callback, and proves its condition on its own case's inputs.
- [ ] **Ratchet cannot stall or hide:** the anti-stall assertion reds on a stale entry, and Task 10 asserts the identifier is gone from the walk's own source.
- [ ] **No re-widening:** no task re-introduces body analysis for refusal helpers or exemptions. That was refuted across spec rounds 2 and 3 and is fenced by Resolved scope #12d.
- [ ] **No registry churn claimed without a probe:** the invariant-10, `x1-catalog-parity`, and `_metaInfraContract` "no change" declarations are each backed by a read of the deciding code, cited in the probe record.
- [ ] **Snippets typecheck** under the strict tsconfig before dispatch.
- [ ] **Invariant 12 + review-covers-what-merges:** the impeccable marker is filled and committed at closeout step 2; the whole-diff review is step 4 and is the last thing that examines code; step 5 is one bookkeeping commit closed to the approving round's corpus row, any diff-stage filing it triggered, and the archive + ledger-marker removal invariant 12 requires there. The residual is stated as a documented limit with its impossibility argument (a round's own record cannot precede the round), not as an argued exception, and the three orderings already tried are fenced.

## Adversarial review (cross-model)

Between self-review and execution handoff: dispatch a Codex adversarial review of this plan (`--stage plan`) to APPROVE. The brief carries the consequence bound, `PROBE DOMAIN:`, threat fence, REVIEWER-ONLY framing, and the do-not-relitigate list; findings are class-swept before any resubmission.

## Execution handoff

This arc STOPS at plan-APPROVE. Implementation is a separate Opus + Claude Code session (the diff touches `app/` and `components/` → invariant-8 dual gate). Recommended: `superpowers:subagent-driven-development`, a fresh subagent per task, in this worktree on this branch.
