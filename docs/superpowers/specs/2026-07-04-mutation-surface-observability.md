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
| **Surface** | All `route.ts` files exporting a mutating HTTP method (`POST`/`PUT`/`PATCH`/`DELETE`) **plus** every module-level `"use server"` server-action file — repo-wide (`app/`, `lib/`, `components/`), not only `app/`. |
| **Acceptance predicate** | Floor guard — file contains ≥1 code-carrying telemetry emit (see §4). Proves a coded emit *exists in the file*, NOT that the success path specifically is covered. |
| **Seeding** | Instrument all **admin-tier** genuine gaps now via `logAdminOutcome`; exempt true non-mutations/delegators inline; grandfather **crew-facing** `lib/auth/picker/*` actions into a debt-ledger with a backlog ref (their telemetry taxonomy is a separate design). |
| **Governance** | New plan-wide invariant **#10** in `AGENTS.md`, backed structurally by the discovery meta-test (same tier as invariants 2/3/9). |

## 3. Ground-truth surface (measured 2026-07-04, `origin/main` @ `4fddcff1`)

A prototype of the exact predicate (§4), run against the live worktree, classifies
**56 surface files** with **18 currently uninstrumented**. The predicate correctly passes
all 32 already-instrumented routes — including the 7 that use the human-readable-message +
`code:`-field style (`drive/webhook`, `realtime/subscriber-token`, `report`, `sign-out`,
`reap-stale-sessions`, `manifest/ignore`, `observe/client-error`) — and correctly *fails*
`validationReset.ts` (whose only `code:` literals are in return bodies, not `log.*` calls),
proving AST scoping is required and a plain grep is insufficient.

### 3.1 The 18 failures and their dispositions

**A. Instrument now — admin-tier (via `logAdminOutcome`; add rows to `_metaAdminOutcomeContract`):**

| File | Action(s) | New forensic code(s) |
| --- | --- | --- |
| `app/admin/settings/_actions/setAutoPublish.ts` | `setAutoPublish` | `SETTING_AUTOPUBLISH_CHANGED` |
| `app/admin/settings/_actions/setAlertOnAutoPublish.ts` | `setAlertOnAutoPublish` | `SETTING_ALERT_ON_AUTOPUBLISH_CHANGED` |
| `app/admin/settings/_actions/setAlertOnSyncProblems.ts` | `setAlertOnSyncProblems` | `SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED` |
| `app/admin/settings/_actions/setDailyReviewDigest.ts` | `setDailyReviewDigest` | `SETTING_DAILY_REVIEW_DIGEST_CHANGED` |
| `app/admin/settings/_actions/validationReset.ts` | `resetValidationDataAction`, `reseedValidationFixturesAction` | `VALIDATION_RESET_RUN`, `VALIDATION_RESEED_RUN` |
| `app/admin/settings/admins/actions.ts` | `addAdminAction`, `revokeAdminAction` | `ADMIN_GRANTED`, `ADMIN_REVOKED` |
| `app/admin/settings/admins/developerActions.ts` | `setDeveloperAction` | `ADMIN_DEVELOPER_SET` |
| `app/admin/dev/actions.ts` | `parseAndStage`, `resetDevSchema` | `DEV_PARSE_STAGED`, `DEV_SCHEMA_RESET` |
| `app/show/[slug]/unpublish/actions.ts` | `confirmUnpublishAction` | **reuse** `SHOW_UNPUBLISHED_VIA_EMAILED_LINK` |
| `lib/onboarding/serverActions.ts` | `startOverServerAction`, `rerunSetupServerAction` | `ONBOARDING_STARTED_OVER`, `ONBOARDING_SETUP_RERUN` |

**B. Exempt inline (`// no-telemetry: <reason>`) — true non-mutations / delegators:**

| File | Reason |
| --- | --- |
| `app/api/test-auth/set-session/route.ts` | Test-only auth scaffolding; not a product mutation surface. |
| `app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts` | Thin `POST` delegates to the already-instrumented `handleWizardPendingIngestionAction` (see `…/retry/route.ts`); the shim itself emits nothing. |
| `app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts` | Same delegating shim. |

**C. Grandfather — crew-facing picker actions (debt-ledger, `BL-CREW-PICKER-OBSERVABILITY`):**

`lib/auth/picker/cleanupStaleEntry.ts`, `clearIdentity.ts`, `resetCrewMemberSelection.ts`,
`resetPickerEpoch.ts`, `rotateShareToken.ts`. (`selectIdentity.ts` already passes.)
These are crew/system operations, not admin actions; `logAdminOutcome` is semantically
wrong for them and a crew-telemetry taxonomy is out of scope for this change.

## 4. The discovery meta-test

**Location:** `tests/log/_metaMutationSurfaceObservability.test.ts` (alongside its sibling
precision guard `_metaAdminOutcomeContract.test.ts` and `_metaAppEventsWriter.test.ts`).
**AST tool:** `import ts from "typescript"` — matching the sibling file (verified
`_metaAdminOutcomeContract.test.ts:4`).

### 4.1 Surface collection (AST, not grep)

Walk `app/`, `lib/`, `components/` for `.ts`/`.tsx` files (skipping `node_modules`,
`.next`, `.git`), parse each with `ts.createSourceFile(..., /*setParentNodes*/ true, ScriptKind.TSX)`, and include a file in the surface iff **either**:

- **Route mutation:** basename is `route.ts` AND it exports a handler named
  ∈ `{POST, PUT, PATCH, DELETE}` — detected as a top-level exported `FunctionDeclaration`,
  an exported `VariableStatement` declaration, **or** a re-export `ExportDeclaration`
  (`export { POST } from "./x"` / `export { handler as POST } from …`). All three forms are
  handled so a route cannot escape the surface by aliasing or re-exporting its handler
  (no current file uses the re-export form, but the guard must not have that hole); **or**
- **Server action:** the module has a **leading** `"use server"` directive — an
  `ExpressionStatement` whose expression is the string literal `"use server"`, appearing
  among the leading directive prologue (before the first non-directive statement). This
  auto-excludes barrels/shared helpers without the directive (`_actions/index.ts`,
  `_actions/shared.ts`) — no exemption needed.

### 4.2 Acceptance predicate (the floor)

A surface file passes iff its AST contains at least one **code-carrying emit** — a
`CallExpression` matching **any** of:

- **(a)** callee is the identifier `logAdminOutcome` (code-carrying by type contract —
  `AdminOutcome.code` is required); **or**
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
   `tests/admin/no-inline-email-normalization.test.ts`). For **permanent** non-mutations
   and delegators. Opt-out is visible at the source. Reason text is required (the regex
   demands a trailing `:`); an empty reason is itself a lint smell surfaced in review.
2. **`KNOWN_UNINSTRUMENTED`** — a centralized `ReadonlyArray<{ file: string; backlog: string }>`
   in the test. A **debt ledger** for surfaces we intend to instrument later, each carrying
   a backlog ref. Distinct intent from `// no-telemetry:` (permanent) — a reviewer reading
   the ledger sees all deferred observability debt in one place. Every entry's `file` must
   still exist on disk (stale entries fail the test) and must still be a real surface (an
   entry for a now-passing file fails, forcing ledger cleanup).

### 4.4 Failure output

On failure the test lists each offending file with its `kind` (route/action) and the two
resolution paths (add a code-carrying emit, or add `// no-telemetry:`/a ledger entry with a
backlog ref). No hidden truncation — every offender is printed.

### 4.5 Non-tautology (mandatory negative-regression)

A dedicated test step temporarily strips a known-good emit from a fixture string (or asserts
against an in-memory source string with and without an emit) and asserts the predicate flips
`false`. The test must prove it can go red — an always-green structural test is worthless
(mirrors `_metaAdminOutcomeContract`'s "Non-tautology proven by the negative-regression step").

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
> method (`POST`/`PUT`/`PATCH`/`DELETE`) and any module-level `"use server"` server action
> MUST emit at least one code-carrying telemetry event (`logAdminOutcome(...)`, or
> `log.<info|warn|error>` with a `SHOUTY_SNAKE` code as the message or a `code:` field),
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
- **Floor ≠ success-path guarantee is intentional** (§4.2). A file that logs only on failure
  passes the floor. Closing "logs failures only" is the registry's job, not this test's.
  This is a deliberate scope boundary, cited in the invariant text; do not relitigate.
- **`KNOWN_UNINSTRUMENTED` is a debt ledger, not a bypass.** Grandfathering the crew picker
  actions is a ratified scope decision (crew telemetry taxonomy is separate design work),
  not an oversight. Each entry carries a backlog ref.
- **Repo-wide walk (incl. `lib/`) is intentional.** Server actions live in `lib/auth/picker/*`
  and `lib/onboarding/*`; scoping to `app/` would leave real mutation surfaces invisible.

## 8. Out of scope

- Inline function-level `"use server"` (non-module-level) actions — the repo convention is
  module-level action files; function-level is rare and detection is materially harder.
- `lib/`-helper-only instrumentation satisfying a route's floor — the floor is deliberately
  file-local so each surface carries its own outcome emit (a delegator uses `// no-telemetry:`
  pointing at the helper).
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
   GET-only route), the `"use server"` directive detection (leading vs after-import), and the
   negative-regression flip (§4.5).
2. **Live-surface test** — the walk runs against the repo and asserts zero unresolved
   failures. After seeding, this is green.
3. **Ledger hygiene** — a `KNOWN_UNINSTRUMENTED` entry for a now-passing or non-existent file
   fails (forces cleanup).
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
