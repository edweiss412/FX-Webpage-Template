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
module-action functions, 3 function-scoped inline actions — of which **37 are currently
unaccounted** (5 route + 29 module-function + 3 inline). The predicate correctly passes the
already-instrumented admin routes (incl. non-admin infra routes that use the human-message +
`code:`-field style — `drive/webhook`, `realtime/subscriber-token`, `report`, `sign-out`,
`observe/client-error`) and correctly *fails* each uninstrumented mutation, proving AST
scoping is required (a plain grep passes `validationReset.ts`, whose only `code:` literals
are in return bodies, not `log.*` calls). Three measurement corrections from the adversarial
rounds: **R2** per-function scoping (file-level under-counted by letting actions ride a
sibling's emit); **R3** the admin-gate action rule (§4.2) reclassified `app/admin/actions.ts`'s
two `requireAdmin()`-gated actions from "passing on a failure code" to unaccounted (27 → 29
module-function); **R6** the admin-*route* rule (§4.2, path `app/api/admin/**`) reclassified
`manifest/…/ignore` + `reap-stale-sessions` likewise (3 → 5 route). An admin mutation —
action or route — must carry a success outcome.

### 3.1 The 37 unaccounted surface units and their dispositions

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
| `app/admin/actions.ts` :: `resolveAdminAlertFormAction` | **reuse** `ADMIN_ALERT_RESOLVED` (matches the resolve-route code) |
| `app/admin/actions.ts` :: `retryWatchSubscriptionFormAction` | `WATCH_SUBSCRIPTION_RETRIED` |
| `lib/auth/picker/resetPickerEpoch.ts` :: `resetPickerEpoch` | `PICKER_EPOCH_RESET_BY_ADMIN` |
| `lib/auth/picker/rotateShareToken.ts` :: `rotateShareToken` | `SHARE_TOKEN_ROTATED_BY_ADMIN` |
| `lib/auth/picker/resetCrewMemberSelection.ts` :: `resetCrewMemberSelection` | `CREW_SELECTION_RESET_BY_ADMIN` |
| `app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts` (route, file-level emit) | `MANIFEST_SHEET_IGNORED` |
| `app/api/admin/onboarding/reap-stale-sessions/route.ts` (route, file-level emit) | `STALE_SESSIONS_REAPED` |

(21 success emits — 19 new codes + 2 reuses: `SHOW_UNPUBLISHED_VIA_EMAILED_LINK`,
`ADMIN_ALERT_RESOLVED`. The last two are **admin routes** under `app/api/admin/**` that
today log only failure codes; per §4.2 they must carry an `await logAdminOutcome` success
outcome in the route file — Codex R6. `reap-stale-sessions` emits `result: "reaped_" + count`.) The last three are **admin-gated** picker mutations
(`requireAdmin`/`requireAdminIdentity`) that mutate security state (`shows.picker_epoch`,
`shows.share_token`, `crew_members.selections_reset_at`) — they are NOT crew debt and per
§4.2 MUST carry an `await logAdminOutcome` success outcome (Codex R5). **`rotateShareToken`
must never log the new `share_token`** (a secret) — emit `result: "epoch_" + new_epoch` only.

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

**C. Grandfather — crew/system picker actions only (`KNOWN_UNINSTRUMENTED`, 6 per-function
rows, `BL-CREW-PICKER-OBSERVABILITY`):**

Six explicit `{ file, fn, backlog }` rows — **only non-admin-gated crew/system functions**
(no file-only form — §4.3; admin-gated picker functions were moved to §3.1 A per Codex R5):

| File :: function | Gate |
| --- | --- |
| `lib/auth/picker/cleanupStaleEntry.ts` :: `cleanupStaleEntry`, `cleanupStaleEntryCore` | none (system) |
| `lib/auth/picker/clearIdentity.ts` :: `clearIdentity`, `clearIdentityAndSkip`, `clearIdentityCore` | none (crew self-clear) |
| `lib/auth/picker/selectIdentity.ts` :: `selectIdentityCore` | none (crew self-select) |

Verified: none of these call a `require{Admin,Developer}[Identity]` gate (they are crew
cookie/identity + system-cleanup operations). `selectIdentity` itself already emits in-body
(`log.warn` at `selectIdentity.ts:56`) and is deliberately **not** ledgered, so a regression
removing its emit still fails. A *new* exported action added to any of these files is not in
the ledger → it fails as a new dark surface. `logAdminOutcome` is semantically wrong for
these crew/system operations; a crew-telemetry taxonomy is out of scope. **The ledger
structurally cannot hold an admin-gated function** — §4.3 hygiene fails the test if one is
listed, so a future admin picker mutation can never be grandfathered here.

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
  `"use server"` directive. **Each exported async function is an individual surface**,
  collected from **all** export forms so none can hide (Codex R3 HIGH): (i) an
  `export`-modified `FunctionDeclaration`; (ii) an `export`-modified `VariableStatement`
  whose initializer is an arrow/function expression; **and (iii) an `ExportDeclaration`
  export-list** (`export { mutate }` / `export { local as mutate }`) whose specifier
  resolves to a locally-declared function or arrow/function `const` in the same module —
  the specifier is resolved to its declaration and that declaration's body is the checked
  scope. (Re-exports `export { x } from "./y"` name another module's symbol; that symbol is
  checked where it is declared.) The emit must be reachable **within that function's own
  body** (or the function is exempted/ledgered — §4.3). This is what closes the R2 hole: a
  new mutating export appended to `admins/actions.ts` or `dev/actions.ts` — in any export
  form — cannot ride a sibling's emit. Modules without the directive (barrels
  `_actions/index.ts`, helpers `_actions/shared.ts`) are not surfaces — no exemption needed.
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
iff the relevant AST scope contains at least one **code-carrying emit** — a `CallExpression`
matching **any** of the clauses (a)/(b)/(c) below. The **scope** differs by kind:

- **Route file:** the whole file is scanned (the emit may live in a file-level helper the
  handler delegates to — the established pattern). Nested descent is fine here.
- **Action function (module or inline):** only the function's **own body** counts, and the
  scan **does NOT descend into nested function / arrow / method / class bodies** defined
  inside it (Codex R4 F3). It DOES descend through control-flow blocks (`if`/`try`/`for`/
  `while`/`switch`). This prevents a false pass from an *unused* nested emitter — e.g. an
  action that declares `async function unused() { await logAdminOutcome(...) }` but never
  calls it, then returns silently, must FAIL. (Consequence: an action whose only emit is
  genuinely inside a live callback must hoist it or add an exemption; verified zero current
  actions rely on a nested-closure emit, so this breaks nothing.)

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

**Admin mutations require a success outcome, not merely a failure log (Codex R3 + R6 HIGH).**
A bare `log.*` emit satisfies the floor for *non-admin* surfaces — crew/system actions and
infra routes (webhook, realtime-token, sign-out, crew `report`) legitimately log
anomalies/failures. But an admin mutation that logs only `log.error("X_FAILED")` while its
successful mutation is silent is "observable in name only." So the floor is **tightened for
every admin mutation surface — action OR route — to satisfy only via clause (a)**
(`await logAdminOutcome(...)`, a post-commit success outcome), never (b)/(c). Two admin
signals, each chosen to avoid false positives:

- **Admin action** = a module-level or inline server action whose **body calls an admin
  gate** — an identifier in `{requireAdmin, requireAdminIdentity, requireDeveloper,
  requireDeveloperIdentity}`. Reliable for actions (they gate at the top; crew actions like
  `selectIdentity` call no gate). Flips `app/admin/actions.ts` (both actions `requireAdmin()`
  but emit only failure codes) — a genuine gap (§3.1 A).
- **Admin route** = a mutating `route.ts` under **`app/api/admin/**`** (path-based, NOT
  `require*`-detection). Path is the correct signal here because `app/api/report/route.ts`
  calls `requireAdminIdentity()` for *conditional role-detection* (a crew bug-report route
  reading whether the submitter is an admin), not as a gate — a `require*` scan would
  false-positive on it, but the path signal correctly excludes it. Infra routes (webhook,
  realtime, report, sign-out) are NOT under `app/api/admin` and keep the broad floor.
  **A mutating `app/api/admin/**` route satisfies the floor NOT by a file-scan for
  `logAdminOutcome` (which — because route files legitimately delegate to helpers and the
  scan descends — could be fooled by an unused or wrong-branch nested emit, Codex R8) but by
  membership in the shared `AUDITABLE_MUTATIONS` registry** (the `_metaAdminOutcomeContract`
  success-outcome registry, extracted to a module both tests import — §9), OR a
  `// no-telemetry:` exemption. This makes admin-route coverage **discovery-enforced**: a new
  `app/api/admin/**/route.ts` not in `AUDITABLE_MUTATIONS` (and not exempt) FAILS. Current
  state: 24 of 28 admin routes are already registered; the 2 gaps `manifest/…/ignore` +
  `reap-stale-sessions` are added with `MANIFEST_SHEET_IGNORED` / `STALE_SESSIONS_REAPED`
  (§3.1 A); the 2 delegating shims are exempt (§3.1 B).

  **Registry membership is a static emit-check — it does NOT prove the *success branch* fires
  (Codex R9).** Only a behavioral sink-spy test does. So membership is paired with a
  **mandatory behavioral-coverage guard** (`ADMIN_ROUTE_OUTCOME_BEHAVIOR` registry +
  meta-test, §9/§10.4a): every admin-route `AUDITABLE_MUTATIONS` row must map to a sink-spy
  test that drives the route and asserts the code fires on the committed-success branch. To
  bound this change's scope, the **24 pre-existing admin routes are a FROZEN grandfather
  baseline** (`BL-ADMIN-ROUTE-OUTCOME-BEHAVIOR` audits/backfills their behavioral coverage in
  a follow-up); the meta-test asserts that baseline is exactly those 24 and never grows.
  **Any admin route NOT in the frozen baseline — the 2 seeded now, and every future one — MUST
  carry a real sink-spy success-branch test** (it cannot use the grandfather list). That is
  the structural closure of R9's "future admin route + wrong-branch emit passes" hole: a new
  admin route needs both a registry row AND behavioral proof its success path emits.

Reads are exempt (§4.3). (The admin-**action** rule stays a per-function non-descending body
scan for `await logAdminOutcome` — §4.1/F3 already blocks an unused nested emitter there; the
registry-linkage is needed only for routes, whose file-level descent cannot approximate
reachability. Seeded admin actions are additionally registered + sink-spy-tested.)

### 4.3 Escape hatches (two, by intent)

1. **`// no-telemetry: <reason>`** — an inline line comment (matched
   `/^\s*\/\/\s*no-telemetry:/` per-line, mirroring the `canonicalize-exempt` precedent in
   `tests/admin/no-inline-email-normalization.test.ts`). For **permanent** non-mutations and
   delegators. Reason text is required (the regex demands a trailing `:`). **Scope — no
   whole-file exemption for action-bearing files (Codex R4 F2):**
   - For a **route file** or a file with **no server-action surfaces** (e.g.
     `test-auth/set-session/route.ts`), a **file-leading** `// no-telemetry:` (before the
     first surface unit) exempts the file — safe, because such a file has at most one
     surface unit and adding a second mutating surface to a `route.ts` trips the
     route-multiplicity assertion.
   - For any **module-level `"use server"` file or a file containing function-scoped inline
     actions**, a file-leading comment is **rejected** (the test errors: "use a per-function
     exemption"). Each exemption MUST sit **inside the body span of the specific action
     function** it exempts; it never leaks to a sibling or to a later-added action. This is
     what keeps the per-function default-fail intact when an action is appended to an
     already-partially-exempt module.
   The meta-test maps each comment to the narrowest enclosing surface unit by line range.
   Read-only exported actions in a `"use server"` module (e.g. `getStagedResult`,
   `listFixtures` in `dev/actions.ts`) use a per-function exemption with a `read-only
   accessor (no mutation)` reason — forcing an explicit "this action does not mutate"
   acknowledgment rather than a silent pass.
2. **`KNOWN_UNINSTRUMENTED`** — a centralized
   `ReadonlyArray<{ file: string; fn: string; backlog: string }>` in the test. A **debt
   ledger** for surfaces we intend to instrument later, each carrying a backlog ref.
   **Entries are always per-function `{ file, fn, backlog }` — there is no file-only /
   whole-file form (Codex R4 F1):** a file-only entry would silently exempt a *future*
   action added to that file, recreating the default-fail hole. So the crew-picker debt is
   ledgered as **6 explicit per-function rows** — the non-admin crew/system functions
   enumerated in §3.1 C (the canonical list; the 3 admin-gated picker mutations are
   instrumented in §3.1 A, not ledgered). A newly-added exported action in a ledgered file is
   not in the ledger → it FAILS as a new dark surface, exactly as intended. Distinct intent from `// no-telemetry:`
   (permanent) — a reviewer reading the ledger sees all deferred observability debt in one
   place. Hygiene: every entry's `file` must exist and `fn` must still be a discovered
   surface in it; a ledgered function that now emits, or no longer exists, fails — forcing
   cleanup. **A ledger entry naming an admin-gated function (its body calls a
   `require{Admin,Developer}[Identity]` gate) FAILS the test (Codex R5):** admin mutations
   must be instrumented with `await logAdminOutcome`, never deferred as crew debt — this
   structurally prevents a security-state admin mutation (share-token rotation, epoch reset,
   crew-selection reset) from being hidden behind the ledger.

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
- **Admin routes** (`manifest/…/ignore`, `reap-stale-sessions`) emit the success outcome in
  the route file after the delegated helper reports success, before the JSON response.
  `manifest/…/ignore` → `MANIFEST_SHEET_IGNORED` on the committed-transition branch (NOT on a
  CAS-miss rollback); `reap-stale-sessions` → `STALE_SESSIONS_REAPED`, `result: "reaped_" +
  count`. Both already resolve an admin/developer identity (`requireAdminIdentity` /
  `requireDeveloperIdentity`) → use it for `actorEmail`.
- **Admin picker actions** emit only on `{ ok: true }`. `resetPickerEpoch` →
  `result: "epoch_" + new_epoch`; `resetCrewMemberSelection` → `result: "reset"` (the
  returned `reset_at` timestamp may go in `extra`, not the crew member's PII);
  `rotateShareToken` → `result: "epoch_" + new_epoch` and **MUST NOT** put `new_share_token`
  (a secret) in `code`/`result`/`extra`. `actorEmail` from `requireAdminIdentity()` where
  available (`resetPickerEpoch` already resolves `adminCtx`); `resetCrewMemberSelection` /
  `rotateShareToken` call `requireAdmin()` — add a cached `requireAdminIdentity()` for the
  actor (same pattern as the settings toggles). `showId: input.showId` on all three.

### 5.3 Flag-lifecycle note (settings toggles)

The four settings toggles are already fully wired (storage → `app_settings` columns;
write path → these actions; read path → the settings page; effect → sync/publish/alert
behavior). This change adds **only** an audit emit; it does not alter storage, read paths,
or effect. No zombie-flag risk introduced.

## 6. Governance artifact — AGENTS.md invariant #10

Add to the "Plan-wide invariants (non-negotiable)" list:

> **10. Every mutation surface is instrumented — no surface is silently dark.** Every
> mutation surface unit — each mutating HTTP route handler (`POST`/`PUT`/`PATCH`/`DELETE`),
> each exported action in a module-level `"use server"` file, and each function-scoped inline
> `"use server"` action — MUST carry at least one code-carrying telemetry emit
> (`await logAdminOutcome(...)`, or `log.<info|warn|error>` with a `SHOUTY_SNAKE` code as the
> message or a `code:` field), OR an inline `// no-telemetry: <reason>` exemption, OR a
> `KNOWN_UNINSTRUMENTED` debt-ledger row with a backlog ref. Checked **per function** for
> actions (an emit in one exported action does not satisfy a sibling) and per file for routes
> (each route file has exactly one mutating handler, asserted). **Admin mutations must
> satisfy this via `await logAdminOutcome` specifically** — a success outcome, not a
> failure-only log — for both **admin-gated actions** (body calls
> `require{Admin,Developer}[Identity]`) AND **mutating routes under `app/api/admin/**`**
> (path-based; `require*`-detection is not used for routes, to avoid a false positive on
> crew routes that read admin identity for role-detection, e.g. `app/api/report`). Beyond
> this floor, success-path
> outcome *precision* for named admin mutations (which code, which branch) remains the
> registry guard's (`_metaAdminOutcomeContract`) and audits' job — the two are complementary.
> Enforced by `tests/log/_metaMutationSurfaceObservability.test.ts`. New mutation surfaces are
> uninstrumented-by-default failures, not silent omissions.

Add two `BACKLOG.md` entries: `BL-CREW-PICKER-OBSERVABILITY` (the 6 grandfathered non-admin
`lib/auth/picker/*` functions; the 3 admin-gated picker mutations are instrumented now, not
deferred) and `BL-ADMIN-ROUTE-OUTCOME-BEHAVIOR` (audit/backfill sink-spy success-branch tests
for the 24 frozen-baseline pre-existing admin routes — the new behavioral-coverage meta-test
already forces any NEW admin route to ship one).

## 7. Relationship to existing guards (disagreement-loop preempt)

- **Complement, not replace.** `_metaAdminOutcomeContract` is the *precision* guard (named
  file → named code, codes kept out of §12.4). This is the *floor* guard (no silent surface).
  Both stay. Do not relitigate merging them.
- **Floor vs success-path, and where the line sits (Codex R2/R3/R6 vector).** The floor is a
  static check; it cannot verify *which branch* an emit sits on across arbitrary control
  flow. So the guarantee is stated precisely (§6): "instrumented / no dark surface," not
  "every success is logged." The gap Codex named — an admin mutation logging only a failure
  code — is closed **structurally for every admin mutation surface**: admin-gated **actions**
  (require\* in body) AND admin **routes** (under `app/api/admin/**`) satisfy the floor only
  via `await logAdminOutcome` (a post-commit success outcome), enforced by §4.2. Only
  **non-admin** surfaces — crew/system actions and infra routes (webhook, realtime, `report`,
  sign-out) — accept any coded emit, by design (heterogeneous telemetry: they legitimately
  log anomalies). *Which branch* the emit sits on is verified per-surface by the sink-spy
  tests (§10.7), not statically — and for admin **routes** that behavioral coverage is
  enforced **structurally** by the `ADMIN_ROUTE_OUTCOME_BEHAVIOR` meta-test (§10.5): every
  admin route outside the frozen 24-route grandfather baseline (i.e. every new one) must ship
  a success-branch sink-spy test. This boundary is the product of R2/R3/R6/R8/R9; do not
  relitigate "failure-only passes for admin surfaces" (closed) or "static discovery must
  verify the success branch" (statically infeasible — the behavioral sink-spy meta-test is
  that verifier, structural not per-instance). The 24 pre-existing admin routes' behavioral
  backfill is `BL-ADMIN-ROUTE-OUTCOME-BEHAVIOR` — a scoped follow-up, not a hole this change
  widens.
- **Routes are checked file-level, and that is per-handler here (not a weaker check).** Every
  `route.ts` in this repo exports exactly one mutating handler (measured: 35/35 single `POST`),
  and the meta-test asserts this invariant, so file-level scoping is equivalent to
  per-handler. Per-handler-*body* scoping was rejected deliberately: 29/35 handlers emit via a
  delegated helper (the correct, established pattern), so it would demand ~29 exemptions on
  correct code or call-graph analysis — and a *new mutating endpoint is a new file*, always
  caught. Do not relitigate as "routes must be per-function"; the multiplicity assertion is
  the tripwire that keeps the equivalence honest. Module/inline **actions** ARE per-function
  (that is the R2 fix), because multi-action modules are real and appending an export is the
  live vector. For **admin** routes the file-scan is not even the success-outcome check —
  registry membership is (previous bullet + §4.2), so a delegated/unreachable emit cannot
  fake compliance.
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
  (incl. `MANIFEST_SHEET_IGNORED`, `STALE_SESSIONS_REAPED`, the settings/admin/dev/onboarding
  action codes, and the 3 admin picker codes) + `SANCTIONED_CODES`/`NEW_FORENSIC_CODES`.
- **REFACTORS (Codex R8):** extract the `AUDITABLE_MUTATIONS` array (and the sanctioned-code
  sets) from `_metaAdminOutcomeContract.test.ts` into a shared non-test module (e.g.
  `tests/log/_auditableMutations.ts`) that BOTH `_metaAdminOutcomeContract.test.ts` and the
  new discovery test import — so the discovery test's admin-route registry-membership check
  reads the single source of truth, not a duplicated list. Pure move; the existing contract
  test's behavior is unchanged.
- **CREATES (Codex R9): `ADMIN_ROUTE_OUTCOME_BEHAVIOR`** — a registry mapping each admin-route
  `AUDITABLE_MUTATIONS` row to either (a) a sink-spy success-branch test reference, or (b) the
  frozen `BL-ADMIN-ROUTE-OUTCOME-BEHAVIOR` grandfather marker (only the 24 pre-existing
  routes). A meta-test asserts: every admin-route registry row is covered by (a) or (b); the
  grandfather set is exactly the frozen 24 (fails if it grows or drifts); the 2 seeded routes
  and any future admin route are covered by (a) — a real behavioral test, not the marker.
- **Advisory-lock topology:** N/A — no `pg_advisory*` surface is touched (declared explicitly).

## 10. Test plan (TDD)

1. **Predicate unit tests** — in-memory source strings exercising each accept-clause (a/b/c),
   each reject case (no emit; `code:` in a non-`log` object; `"use client"` directive;
   GET-only route; **`void logAdminOutcome(...)` and bare unawaited `logAdminOutcome(...)`
   must NOT satisfy clause (a)**, while `await logAdminOutcome(...)` must), both directive
   detections (module-level leading vs function-scoped inline `"use server"` in a `.tsx`
   component, including a mutating inline action that fails without a code-carrying emit),
   **per-function sibling isolation** (two-action module: A emits/passes, B silent/fails),
   **export-list collection** (`"use server"; async function mutate(){…} export { mutate }`
   with no emit MUST fail — Codex R3 F1), **admin-gate tightening** (an action whose body
   calls `requireAdmin` passes with `await logAdminOutcome` but FAILS with only
   `log.error("X_FAILED", { code })` — Codex R3 F2; a non-admin action with the same
   `log.error` passes), **admin-route tightening** (a mutating `route.ts` under
   `app/api/admin/**` with only a failure `log.error("X_FAILED", { code })` FAILS; the same
   route with `await logAdminOutcome` passes; a route with the same failure log OUTSIDE
   `app/api/admin/**` — e.g. `app/api/report/route.ts` — passes — Codex R6), **nested-emitter rejection** (an action with an unused nested
   `async function u(){ await logAdminOutcome(...) }` and a silent return MUST fail — Codex
   R4 F3; a live emit in an `if`/`try` block passes), **file-leading exemption rejection**
   (a file-leading `// no-telemetry:` in a `"use server"` module errors; a per-function one
   works and does NOT cover a sibling — Codex R4 F2), and the negative-regression flip (§4.5).
2. **Live-surface test** — the walk runs against the repo and asserts zero unaccounted
   surface units. After seeding, this is green.
3. **Route-multiplicity assertion** — a dedicated assertion that no `route.ts` exports >1
   mutating method (the tripwire that keeps route file-level scoping equivalent to
   per-handler); prove it can fail via an in-memory two-mutating-method route string.
4. **Admin-route registry-linkage (Codex R8)** — every discovered mutating
   `app/api/admin/**` route must be in `AUDITABLE_MUTATIONS` or exempt (assert against the
   live tree). Negative fixture: a synthetic `app/api/admin/.../route.ts` whose only
   `await logAdminOutcome(...)` sits in an **unused nested helper** and which is NOT in
   `AUDITABLE_MUTATIONS` MUST fail — proving a file-scan emit cannot substitute for a
   registry row. Also assert the two seeded gaps (`manifest/ignore`, `reap-stale-sessions`)
   are present in `AUDITABLE_MUTATIONS` after seeding.
5. **Admin-route behavioral-coverage meta-test (Codex R9)** — assert every admin-route
   `AUDITABLE_MUTATIONS` row is covered by `ADMIN_ROUTE_OUTCOME_BEHAVIOR` (a real sink-spy
   test reference OR the frozen grandfather marker); the grandfather set equals exactly the 24
   pre-existing routes and FAILS if it grows; a non-grandfathered admin route (the 2 seeded +
   any future) that lacks a real behavioral-test reference FAILS. This is the structural proof
   that a future admin route cannot pass with a registry row + wrong-branch emit — it must
   ship a success-branch sink-spy test.
6. **Ledger default-fail + hygiene** — a `"use server"` module with a ledgered function plus a
   NEW un-ledgered silent action fails on the new action (Codex R4 F1); a `{ file, fn }` row
   whose function now emits, or no longer exists, or whose `file` is gone, fails (forces
   cleanup). **Admin-gated-cannot-be-ledgered (Codex R5):** a `KNOWN_UNINSTRUMENTED` row whose
   `fn` body calls a `require{Admin,Developer}[Identity]` gate fails the test — prove it with
   an in-memory admin-gated fixture and by asserting the live ledger's 6 functions are all
   non-admin-gated.
7. **Per-surface instrumentation tests (actions AND routes) — Codex R7.** For **every**
   newly-instrumented surface — all 19 success emits, including the two admin **routes** — a
   behavioral sink-spy test asserting the **committed-success branch** emits the expected
   `code` and that non-success branches emit nothing. Static floor checks cannot tell which
   branch an emit sits on, so these branch-level tests are the guarantee. Explicitly cover:
   `MANIFEST_SHEET_IGNORED` fires on the committed manifest-transition branch and **not** on
   a CAS-miss rollback; `STALE_SESSIONS_REAPED` fires on the successful-reap branch (with the
   count) and not on the infra-fault branch; each admin toggle emits on `{ ok: true }` only;
   `rotateShareToken` never includes the `share_token` secret. Derive expectations from the
   surface's own result shape; do not assert against a container that also renders the value.
8. **`_metaAdminOutcomeContract` still green** — the new registry rows are consistent
   (file emits the registered code; code stays out of §12.4); the shared-module extraction
   (§9) does not change its behavior.

## 11. Verification commands

- `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/log/_metaAdminOutcomeContract.test.ts`
- `pnpm vitest run tests/messages/` (codes-coverage / catalog parity unaffected — proves no §12.4 leak)
- `pnpm vitest run tests/admin tests/log tests/auth` (meta-test comment/format fragility sweep)
- `pnpm typecheck`
- `pnpm format:check`
- Full suite in CI.
