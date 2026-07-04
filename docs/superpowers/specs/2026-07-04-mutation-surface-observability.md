# Spec — Invariant #10: Every mutation surface is observable

**Date:** 2026-07-04
**Status:** Draft → self-review → Codex adversarial review → APPROVE
**Author:** Opus / Claude Code (autonomous ship)
**Slug:** `mutation-surface-observability`

---

## 1. Problem

The project mandates observability on specific surfaces via **registry-walk** meta-tests
(`tests/log/_metaAdminOutcomeContract.test.ts` walks a hardcoded `AUDITABLE_MUTATIONS`
list; `tests/*/_metaInfraContract.test.ts` walk hardcoded registries). These are
**opt-in**: a brand-new mutation route or server action is not caught until a human
remembers to add its row. The big logging-coverage remediation (PRs #267–#284) was a
one-time audit-and-fill, not a standing tripwire. There is no plan-wide invariant stating
"new feature code is wired into telemetry," and no discovery-based guard that fails when a
*new* uninstrumented mutation surface appears.

**Goal:** flip the default from opt-in to opt-out. Add a plan-wide invariant and a
**discovery meta-test** that walks the filesystem for every mutation surface and fails any
that emits no code-carrying telemetry, unless the surface is explicitly exempted or
recorded as known observability debt.

## 2. Scope decisions (resolved in brainstorming)

| Decision | Resolution |
| --- | --- |
| **Surface** | All `route.ts` files exporting a mutating HTTP method (`POST`/`PUT`/`PATCH`/`DELETE`) **plus** every server action — both **module-level** `"use server"` files AND **function-scoped** inline `"use server"` actions (a function/arrow whose body opens with the directive) — repo-wide (`app/`, `lib/`, `components/`), not only `app/`. |
| **Acceptance predicate** | Floor guard — file contains ≥1 code-carrying telemetry emit (see §4). Proves a coded emit *exists in the file*, NOT that the success path specifically is covered. |
| **Seeding** | Instrument all **admin-tier** genuine gaps now via `logAdminOutcome`; exempt true non-mutations/delegators inline; grandfather **crew-facing** `lib/auth/picker/*` actions into a debt-ledger with a backlog ref (their telemetry taxonomy is a separate design). |
| **Governance** | New plan-wide invariant **#10** in `AGENTS.md`, backed structurally by the discovery meta-test (same tier as invariants 2/3/9). |

## 3. Ground-truth surface (measured 2026-07-04, `origin/main` @ `4fddcff1`)

A prototype of the exact **per-function** predicate (§4), run against the live worktree,
enumerates **74 surface units** — 35 route handlers (one `POST` each), 36 exported
module-action functions, 3 function-scoped inline actions — of which **33 are currently
unaccounted** (3 route + 27 module-function + 3 inline). The predicate correctly passes all
32 already-instrumented routes — including the 7 human-message + `code:`-field style
(`drive/webhook`, `realtime/subscriber-token`, `report`, `sign-out`, `reap-stale-sessions`,
`manifest/ignore`, `observe/client-error`) — and correctly *fails* each uninstrumented
action, proving AST scoping is required (a plain grep passes `validationReset.ts`, whose only
`code:` literals are in return bodies, not `log.*` calls). The per-function measurement is
the R2 correction: file-level scoping reported only 21 failures because it let uninstrumented
actions ride a sibling's emit in the same file.

### 3.1 The 33 unaccounted surface units and their dispositions

**A. Instrument now — admin-tier (in-body `await logAdminOutcome`; add rows to
`_metaAdminOutcomeContract`). One emit per mutating function:**

| File :: function | New forensic code |
| --- | --- |
| `settings/_actions/setAutoPublish.ts` :: `setAutoPublish` | `SETTING_AUTOPUBLISH_CHANGED` |
| `settings/_actions/setAlertOnAutoPublish.ts` :: `setAlertOnAutoPublish` | `SETTING_ALERT_ON_AUTOPUBLISH_CHANGED` |
| `settings/_actions/setAlertOnSyncProblems.ts` :: `setAlertOnSyncProblems` | `SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED` |
| `settings/_actions/setDailyReviewDigest.ts` :: `setDailyReviewDigest` | `SETTING_DAILY_REVIEW_DIGEST_CHANGED` |
| `settings/_actions/validationReset.ts` :: `resetValidationDataAction` | `VALIDATION_RESET_RUN` |
| `settings/_actions/validationReset.ts` :: `reseedValidationFixturesAction` | `VALIDATION_RESEED_RUN` |
| `settings/admins/actions.ts` :: `addAdminAction` | `ADMIN_GRANTED` |
| `settings/admins/actions.ts` :: `revokeAdminAction` | `ADMIN_REVOKED` |
| `settings/admins/developerActions.ts` :: `setDeveloperAction` | `ADMIN_DEVELOPER_SET` |
| `admin/dev/actions.ts` :: `parseAndStage` | `DEV_PARSE_STAGED` |
| `admin/dev/actions.ts` :: `resetDevSchema` | `DEV_SCHEMA_RESET` |
| `show/[slug]/unpublish/actions.ts` :: `confirmUnpublishAction` | **reuse** `SHOW_UNPUBLISHED_VIA_EMAILED_LINK` |
| `lib/onboarding/serverActions.ts` :: `startOverServerAction` | `ONBOARDING_STARTED_OVER` |
| `lib/onboarding/serverActions.ts` :: `rerunSetupServerAction` | `ONBOARDING_SETUP_RERUN` |

(14 in-body emits.)

**B. Exempt per-function/file (`// no-telemetry: <reason>`) — non-mutations / delegators:**

| Surface unit | Reason |
| --- | --- |
| `app/api/test-auth/set-session/route.ts` (file) | Test-only auth scaffolding; not a product mutation surface. |
| `…/defer_until_modified/route.ts` (file) | Thin `POST` delegates to the already-instrumented `handleWizardPendingIngestionAction` (`…/retry/route.ts`). |
| `…/permanent_ignore/route.ts` (file) | Same delegating shim. |
| `admin/dev/actions.ts` :: `getStagedResult`, `listFixtures` | Read-only accessors (no mutation). |
| `admin/dev/actions.ts` :: `parseAndStageFormAction`, `resetDevSchemaFormAction` | Form-action wrappers; delegate to the instrumented `parseAndStage` / `resetDevSchema`. |
| `_PickerInterstitial.tsx` (inline) | Thin form-action wrapper; delegates to `selectIdentity` (instrumented). |
| `_SignInOrSkipGate.tsx` (inline) | Thin form-action wrapper; delegates to `clearIdentityAndSkip` (grandfathered). |
| `components/auth/IdentityChip.tsx` (inline) | Thin form-action wrapper; delegates to `clearIdentity` (grandfathered). |

**C. Grandfather — crew-facing picker actions (`KNOWN_UNINSTRUMENTED`,
`BL-CREW-PICKER-OBSERVABILITY`), 9 functions across 6 files:**

- **5 file-scoped entries** (each fully uninstrumented, `emit-calls = 0` — verified):
  `lib/auth/picker/{cleanupStaleEntry,clearIdentity,resetCrewMemberSelection,resetPickerEpoch,rotateShareToken}.ts`
  — covers `cleanupStaleEntry`/`cleanupStaleEntryCore`, `clearIdentity`/`clearIdentityAndSkip`/`clearIdentityCore`,
  `resetCrewMemberSelection`, `resetPickerEpoch`, `rotateShareToken`.
- **1 function-scoped entry:** `lib/auth/picker/selectIdentity.ts :: selectIdentityCore` —
  the directly-callable exported core that does not emit. Its sibling `selectIdentity`
  already emits in-body (`log.warn` at `selectIdentity.ts:56`) and is deliberately **not**
  ledgered, so a regression that removes its emit still fails the guard.

These are crew/system operations, not admin actions; `logAdminOutcome` is semantically wrong
for them and a crew-telemetry taxonomy is out of scope for this change.

## 4. The discovery meta-test

**Location:** `tests/log/_metaMutationSurfaceObservability.test.ts` (alongside its sibling
precision guard `_metaAdminOutcomeContract.test.ts` and `_metaAppEventsWriter.test.ts`).
**AST tool:** `import ts from "typescript"` — matching the sibling file (verified
`_metaAdminOutcomeContract.test.ts:4`).

### 4.1 Surface collection — three surface kinds, two check granularities (AST, not grep)

Walk `app/`, `lib/`, `components/` for `.ts`/`.tsx` files (skipping `node_modules`,
`.next`, `.git`), parse each with `ts.createSourceFile(..., /*setParentNodes*/ true, ScriptKind.TSX)`.
The guard checks **per mutation function**, not per file — a code-carrying emit in one
exported action must NOT satisfy a sibling action in the same file (Codex R2 HIGH). Three
kinds:

- **Route handler** (file-level check, justified): basename is `route.ts` AND it exports a
  handler named ∈ `{POST, PUT, PATCH, DELETE}` — a top-level exported `FunctionDeclaration`,
  exported `VariableStatement`, **or** re-export `ExportDeclaration` (`export { POST } from
  "./x"`). The emit may appear anywhere in the route file. **This file-level scope is sound
  because every route file has exactly one mutating handler** (measured 2026-07-04: all 35
  mutating routes export a single `POST`, zero export >1). To keep that assumption from
  silently breaking, the meta-test **asserts** no `route.ts` exports more than one mutating
  method; if that ever fires, the route model must move to per-handler (a deliberate
  tripwire, not a silent gap). Rationale for not forcing per-handler-body now: 29 of 35
  route handlers emit via a delegated helper (measured), so a per-handler-body requirement
  would force ~29 `// no-telemetry:` exemptions on correct code or a call-graph analysis —
  disproportionate, and a *new mutating endpoint is always a new `route.ts` file*, caught by
  the file-level floor.
- **Module-level server action** (**per-exported-function** check): a module with a leading
  `"use server"` directive. **Each exported async function** (`FunctionDeclaration` or
  `VariableStatement` whose initializer is an arrow/function expression) is an individual
  surface; the emit must be reachable **within that function's own body** (or the function
  is exempted/ledgered — §4.3). This is what closes the R2 hole: a new mutating export
  appended to `admins/actions.ts` or `dev/actions.ts` cannot ride a sibling's emit. Modules
  without the directive (barrels `_actions/index.ts`, helpers `_actions/shared.ts`) are not
  surfaces — no exemption needed.
- **Function-scoped inline action** (**per-function** check): a
  `FunctionDeclaration`/`FunctionExpression`/`ArrowFunction` whose **block body** opens with
  a leading `"use server"` directive (the inline form React emits as a Server Action, e.g.
  `selectIdentityFormAction` in `_PickerInterstitial.tsx:72`). The emit must be in that
  function's body, or the function/file is exempted.

Directive detection (module-level leading directive AND function-scoped body-leading
directive) mirrors the existing auth-audit primitive `hasDirective(node, "use server")`
(`lib/audit/authPrimitives.ts:151`, which distinguishes `directiveKind: "module" |
"function-scoped"` at lines 198/209-216); the meta-test SHOULD reuse that shared primitive
rather than re-implement directive scanning, so the two audits cannot drift.

### 4.2 Acceptance predicate (the floor)

A **surface unit** (a route file, or an individual exported/inline action function) passes
iff the relevant AST scope (whole route file, or that function's body subtree) contains at
least one **code-carrying emit** — a `CallExpression` matching **any** of:

- **(a)** callee is the identifier `logAdminOutcome` (code-carrying by type contract —
  `AdminOutcome.code` is required) **AND the call is the operand of an `AwaitExpression`**.
  A fire-and-forget `void logAdminOutcome(...)` or bare unawaited call does **NOT** satisfy
  the floor: in a Server Action the instance can freeze/terminate after return before the
  async persist completes, dropping the audit row (the sibling `_metaAdminOutcomeContract`
  already warns of this exact hazard). Requiring `await` matches `logAdminOutcome`'s own
  durability contract ("`await`ed for durability", `lib/log/logAdminOutcome.ts:24`) and
  breaks no current surface — every existing callsite already awaits (verified: no
  `void logAdminOutcome(`/bare call exists in `app/` or `lib/`). This await requirement
  applies to `logAdminOutcome` only; `log.<info|warn|error>` (clauses b/c) may be
  `void`-prefixed, matching the established best-effort convention (`void log.warn(...)` in
  `app/api/drive/webhook/route.ts`). **or**
- **(b)** callee is `log.<info|warn|error>` (property access on identifier `log`) whose
  **first argument** is a string literal matching `/^[A-Z][A-Z0-9_]+$/` (the
  message-is-code convention, e.g. `log.info("OAUTH_SIGN_IN_SUCCEEDED", …)`); **or**
- **(c)** callee is `log.<info|warn|error>` whose **second argument** is an object literal
  containing a property named `code` whose initializer is a string literal matching
  `/^[A-Z][A-Z0-9_]+$/` (the human-message + `code:` style, e.g.
  `log.error("… infra fault", { code: "REALTIME_TOKEN_INFRA_ERROR" })`).

AST scoping is load-bearing for (c): a `code:` literal in an unrelated object (a return
body, a type, a config) does **not** count — it must be the argument to a `log.*` call.
This is what makes `validationReset.ts` (pre-instrumentation) correctly fail.

### 4.3 Escape hatches (two, by intent)

1. **`// no-telemetry: <reason>`** — an inline line comment (matched
   `/^\s*\/\/\s*no-telemetry:/` per-line, mirroring the `canonicalize-exempt` precedent in
   `tests/admin/no-inline-email-normalization.test.ts`). For **permanent** non-mutations and
   delegators. Reason text is required (the regex demands a trailing `:`). **Scope:** a
   `// no-telemetry:` comment appearing **anywhere in a function's body span** exempts that
   function; a comment **before the first surface unit** (file-leading) exempts the whole
   file (used for route delegators / whole-file non-mutation files). The meta-test maps each
   comment to the narrowest enclosing surface unit by line range; a function-body exemption
   does NOT leak to sibling functions. Opt-out is always visible at the source. Read-only
   exported actions in a `"use server"` module (e.g. `getStagedResult`, `listFixtures` in
   `dev/actions.ts`) use this with a `read-only accessor (no mutation)` reason — forcing an
   explicit "this action does not mutate" acknowledgment rather than a silent pass.
2. **`KNOWN_UNINSTRUMENTED`** — a centralized
   `ReadonlyArray<{ file: string; fn?: string; backlog: string }>` in the test. A **debt
   ledger** for surfaces we intend to instrument later, each carrying a backlog ref. An entry
   with only `file` exempts every mutation function in that file (whole-subsystem deferral —
   used for the 5 `lib/auth/picker/*` files under `BL-CREW-PICKER-OBSERVABILITY`); an entry
   with `file` + `fn` exempts one function. Distinct intent from `// no-telemetry:`
   (permanent) — a reviewer reading the ledger sees all deferred observability debt in one
   place. Hygiene: every entry's `file` must exist on disk (stale entries fail); a
   `file`-only entry whose file has become fully instrumented, or a `file`+`fn` entry whose
   function now emits or no longer exists, fails — forcing ledger cleanup.

### 4.4 Failure output

On failure the test lists each offending **surface unit** — `file :: fn` for actions,
`file :: POST` for routes — with its `kind` (route / module-action / inline-action) and the
three resolution paths (add a code-carrying emit in that function/file, add a
`// no-telemetry: <reason>`, or add a `KNOWN_UNINSTRUMENTED` ledger entry with a backlog
ref). No hidden truncation — every offender is printed. The route-multiplicity assertion
(no `route.ts` exports >1 mutating method) reports separately with its own remediation note.

### 4.5 Non-tautology (mandatory negative-regression)

A dedicated test step asserts the predicate can go red — an always-green structural test is
worthless (mirrors `_metaAdminOutcomeContract`'s "Non-tautology proven by the
negative-regression step"). It exercises, against in-memory source strings:

- **emit flip:** a function with an emit passes; the same function with the emit stripped fails.
- **await flip:** `await logAdminOutcome(...)` passes; `void logAdminOutcome(...)` fails.
- **sibling isolation (the R2 fix):** a two-action module where action A emits and action B
  does not — A passes, **B fails**. This is the direct regression guard for the file-level
  hole: proving an emit in one function does NOT satisfy a sibling.

## 5. Seeding details (instrumentation contract)

All new codes ride `logAdminOutcome` (or reuse an existing forensic code), so they are
**stripped by `stripLogEmissionCalls`** (verified `lib/messages/__internal__/codeProducers.ts:10-11`
and `tests/messages/stripLogEmissionCalls.test.ts:97`) and therefore are **NOT** §12.4
catalog producers. **No §12.4 / catalog / `x1-catalog-parity` impact.** No new
`lib/messages/catalog.ts` rows, no `pnpm gen:spec-codes`.

### 5.1 Emit placement — POST-COMMIT, best-effort

Every emit fires **after** the mutating operation succeeds (post-commit), on the success
branch only, mirroring the established pattern
(`app/admin/show/[slug]/_actions/archive.ts:42-45`). `logAdminOutcome` is internally
`try/catch`-wrapped (`lib/log/logAdminOutcome.ts:33-49`) so telemetry can never throw over a
committed mutation (invariant 9). Emits carry:

- `code`: the forensic code.
- `source`: dotted namespace, e.g. `"admin.settings.autoPublish"`, `"admin.settings.admins.grant"`.
- `actorEmail`: for admin-tier surfaces that resolve an identity —
  `requireAdminIdentity()` (`{ email }`, verified `requireAdmin.ts:90`) or
  `requireDeveloperIdentity()` (`{ email }`, verified `requireDeveloper.ts:73,220`). The
  settings toggles currently call `requireAdmin()` (no identity); instrumentation adds a
  `requireAdminIdentity()` call (cached — no extra RPC per `requireAdmin.ts:135` `cache(...)`).
- `result`: a low-cardinality sub-outcome, e.g. `next ? "enabled" : "disabled"` for toggles,
  `"cleared_<n>"` / `"minted_<n>"` for validation, `"granted"`/`"revoked"` for admins.
- The crew `confirmUnpublishAction` emits **without** `actorEmail` (the emailed-link actor
  is not an admin session) — `showId: result.showId` only — reusing
  `SHOW_UNPUBLISHED_VIA_EMAILED_LINK` to match the route variant's telemetry.

### 5.2 Guard conditions (per the spec self-review "guard for every prop" rule)

- **Toggle actions** (`setAutoPublish` et al.) return `{ ok: true } | { ok: false }`. Emit
  **only** on `{ ok: true }`; a `{ ok: false }` (RLS-denied / zero-row / infra) emits
  nothing (no false audit trail). The `next` boolean is always defined (typed param).
- **Validation actions** return `{ ok: true; count } | { ok: false; code }`. Emit only on
  `{ ok: true }`, with `result: "cleared_" + count` / `"minted_" + count`. `count` is
  `?? 0`-guarded at the source already.
- **Admin add/revoke** return a discriminated union; emit only on the `kind: "ok"` branch.
  Idempotent-no-op branches (`already_active`) and refusal branches
  (`last_admin_lockout`, `self_revoke_forbidden`) emit nothing.
- **`setDeveloperAction`** emits only on `outcome.kind === "ok"`, carrying
  `result: outcome.isDeveloper ? "granted" : "revoked"`.
- **`confirmUnpublishAction`** emits only on `result.outcome === "success"`; `expired` /
  `neutral` / `infra` branches emit nothing.
- **`dev/actions`** emit on the success return of `parseAndStage` / `resetDevSchema`.
- **onboarding** actions are `Promise<never>` (they `redirect`); the emit fires **before**
  the `redirect()` throw, after `purgeAndRotateOnboardingSession()` resolves.

### 5.3 Flag-lifecycle note (settings toggles)

The four settings toggles are already fully wired (storage → `app_settings` columns;
write path → these actions; read path → the settings page; effect → sync/publish/alert
behavior). This change adds **only** an audit emit; it does not alter storage, read paths,
or effect. No zombie-flag risk introduced.

## 6. Governance artifact — AGENTS.md invariant #10

Add to the "Plan-wide invariants (non-negotiable)" list:

> **10. Every mutation surface is observable.** Any HTTP route that exports a mutating
> method (`POST`/`PUT`/`PATCH`/`DELETE`) and any server action — module-level `"use server"`
> file OR function-scoped inline `"use server"` action — MUST emit at least one
> code-carrying telemetry event (`await logAdminOutcome(...)`, or `log.<info|warn|error>`
> with a `SHOUTY_SNAKE` code as the message or a `code:` field),
> OR carry an inline `// no-telemetry: <reason>` exemption, OR be recorded in the
> `KNOWN_UNINSTRUMENTED` debt-ledger with a backlog ref. This is a **floor** (a coded emit
> exists on the surface), not a guarantee the success path is covered — that remains the
> registry guard's (`_metaAdminOutcomeContract`) and audits' job. Enforced by
> `tests/log/_metaMutationSurfaceObservability.test.ts`. New mutation surfaces are
> uninstrumented-by-default failures, not silent omissions.

Also add a `BL-CREW-PICKER-OBSERVABILITY` entry to `BACKLOG.md` describing the deferred
crew-picker telemetry taxonomy (the 5 grandfathered `lib/auth/picker/*` actions).

## 7. Relationship to existing guards (disagreement-loop preempt)

- **Complement, not replace.** `_metaAdminOutcomeContract` is the *precision* guard (named
  file → named code, codes kept out of §12.4). This is the *floor* guard (no silent surface).
  Both stay. Do not relitigate merging them.
- **Floor ≠ success-path guarantee is intentional** (§4.2). A function whose only emit is on
  its failure branch passes the floor. Closing "logs failures only" is the registry's job,
  not this test's. This is a deliberate scope boundary, cited in the invariant text; do not
  relitigate. (Per-function scoping does guarantee *each* mutating function carries an emit —
  it does not guarantee *which branch*.)
- **Routes are checked file-level, and that is per-handler here (not a weaker check).** Every
  `route.ts` in this repo exports exactly one mutating handler (measured: 35/35 single `POST`),
  and the meta-test asserts this invariant, so file-level scoping is equivalent to
  per-handler. Per-handler-*body* scoping was rejected deliberately: 29/35 handlers emit via a
  delegated helper (the correct, established pattern), so it would demand ~29 exemptions on
  correct code or call-graph analysis — and a *new mutating endpoint is a new file*, always
  caught. Do not relitigate as "routes must be per-function"; the multiplicity assertion is
  the tripwire that keeps the equivalence honest. Module/inline **actions** ARE per-function
  (that is the R2 fix), because multi-action modules are real and appending an export is the
  live vector.
- **`KNOWN_UNINSTRUMENTED` is a debt ledger, not a bypass.** Grandfathering the crew picker
  actions is a ratified scope decision (crew telemetry taxonomy is separate design work),
  not an oversight. Each entry carries a backlog ref, and hygiene rules fail on stale entries.
- **Repo-wide walk (incl. `lib/`) is intentional.** Server actions live in `lib/auth/picker/*`
  and `lib/onboarding/*`; scoping to `app/` would leave real mutation surfaces invisible.

## 8. Out of scope

- `lib/`-helper-only instrumentation satisfying a surface's floor — the emit scope is the
  route file (for routes) or the function body (for actions), so each surface carries its own
  outcome emit; a delegator uses `// no-telemetry:` pointing at the helper. Cross-file
  call-graph tracing of emits is explicitly NOT attempted.
- Crew-picker telemetry taxonomy (`BL-CREW-PICKER-OBSERVABILITY`).
- Any §12.4 / catalog / message-code change.
- Any DB, migration, RLS, advisory-lock, or UI-layout change (none of those surfaces are touched).

## 9. Meta-test inventory (per writing-plans rule)

- **CREATES:** `tests/log/_metaMutationSurfaceObservability.test.ts` (this spec's deliverable).
- **EXTENDS:** `tests/log/_metaAdminOutcomeContract.test.ts` — new `AUDITABLE_MUTATIONS` rows
  + `SANCTIONED_CODES`/`NEW_FORENSIC_CODES` entries for the newly-instrumented admin surfaces.
- **Advisory-lock topology:** N/A — no `pg_advisory*` surface is touched (declared explicitly).

## 10. Test plan (TDD)

1. **Predicate unit tests** — in-memory source strings exercising each accept-clause (a/b/c),
   each reject case (no emit; `code:` in a non-`log` object; `"use client"` directive;
   GET-only route; **`void logAdminOutcome(...)` and bare unawaited `logAdminOutcome(...)`
   must NOT satisfy clause (a)**, while `await logAdminOutcome(...)` must), both directive
   detections (module-level leading vs function-scoped inline `"use server"` in a `.tsx`
   component, including a mutating inline action that fails without a code-carrying emit),
   **per-function sibling isolation** (two-action module: A emits/passes, B silent/fails),
   and the negative-regression flip (§4.5).
2. **Live-surface test** — the walk runs against the repo and asserts zero unaccounted
   surface units. After seeding, this is green.
3. **Route-multiplicity assertion** — a dedicated assertion that no `route.ts` exports >1
   mutating method (the tripwire that keeps route file-level scoping equivalent to
   per-handler); prove it can fail via an in-memory two-mutating-method route string.
4. **Ledger hygiene** — a `KNOWN_UNINSTRUMENTED` `file`-only entry for a now-fully-instrumented
   or non-existent file fails; a `file`+`fn` entry whose function now emits or no longer
   exists fails (forces cleanup).
4. **Per-surface instrumentation tests** — for each newly-instrumented action, a sink-spy
   test asserting the success path emits the expected `code` (and no emit on the failure
   branch). Derive expectations from the action's own result shape; do not assert against a
   container that also renders the value.
5. **`_metaAdminOutcomeContract` still green** — the new registry rows are consistent
   (file emits the registered code; code stays out of §12.4).

## 11. Verification commands

- `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/log/_metaAdminOutcomeContract.test.ts`
- `pnpm vitest run tests/messages/` (codes-coverage / catalog parity unaffected — proves no §12.4 leak)
- `pnpm vitest run tests/admin tests/log tests/auth` (meta-test comment/format fragility sweep)
- `pnpm typecheck`
- `pnpm format:check`
- Full suite in CI.
