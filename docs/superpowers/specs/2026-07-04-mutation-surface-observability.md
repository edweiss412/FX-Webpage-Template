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

**B. Exempt — non-mutations / delegators. Non-admin surfaces use a bare `// no-telemetry:`;
admin-gated surfaces use an `ADMIN_SURFACE_EXEMPTIONS` row (§4.3 item 2), never a bare
comment:**

| Surface unit | Mechanism |
| --- | --- |
| `app/api/test-auth/set-session/route.ts` (file) | `// no-telemetry:` — test-only scaffolding; NOT under `app/api/admin`, not `require*`-gated → non-admin. |
| `_PickerInterstitial.tsx`, `_SignInOrSkipGate.tsx`, `components/auth/IdentityChip.tsx` (inline) | `// no-telemetry:` — non-admin crew form-action wrappers (no `require*` gate); delegate to picker actions (`selectIdentity` instrumented; `clearIdentity*` grandfathered). |
| `…/defer_until_modified/route.ts`, `…/permanent_ignore/route.ts` (admin routes) | `ADMIN_SURFACE_EXEMPTIONS` `delegator` → `…/retry/route.ts` (registered). |
| `admin/dev/actions.ts` :: `parseAndStageFormAction`, `resetDevSchemaFormAction` | `ADMIN_SURFACE_EXEMPTIONS` `delegator` → `parseAndStage` / `resetDevSchema` (registered §3.1 A). |
| `admin/dev/actions.ts` :: `getStagedResult`, `listFixtures` | `ADMIN_SURFACE_EXEMPTIONS` `read-only` — admin-gated (`requireDeveloper` in-body) reads; no write-builder/`logAdminOutcome`. |

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
  (This per-function code-carrying-emit check is the floor for **non-admin** actions; an
  **admin-gated** action is instead governed by §4.2's registry-membership + executable
  behavioral contract — the static emit-scan does not by itself buy it a pass.)
- **Function-scoped inline action** (**per-function** check): a
  `FunctionDeclaration`/`FunctionExpression`/`ArrowFunction` whose **block body** opens with
  a leading `"use server"` directive (the inline form React emits as a Server Action, e.g.
  `selectIdentityFormAction` in `_PickerInterstitial.tsx:72`). The emit must be in that
  function's body, or the function/file is exempted.

**AST stack (Codex R13 F2): the `typescript` compiler API throughout** — matching the sibling
`_metaAdminOutcomeContract.test.ts:4` (`import ts from "typescript"`) and the validated
prototype. Directive detection (module-level leading directive AND function-scoped
body-leading directive) mirrors the *logic* of the auth-audit primitive
`hasDirective(node, "use server")` (`lib/audit/authPrimitives.ts:151`, which distinguishes
`directiveKind: "module" | "function-scoped"` at lines 198/209-216) but is **reimplemented on
`ts.Node`** — that helper is `ts-morph`-based (`authPrimitives.ts:4`) and unexported, so it
cannot be imported into a `typescript`-API test. The reimplementation is ~10 lines
(leading-`ExpressionStatement`-string-literal check on the source file's statements, and on
each function/arrow/method block body); the prototype in this session already implements it.

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

**Admin mutations require a proven success outcome — ONE uniform contract for actions AND
routes (Codex R3 / R6 / R9 / R10).** A bare `log.*` emit satisfies the floor for *non-admin*
surfaces — crew/system actions and infra routes (webhook, realtime-token, sign-out, crew
`report`) legitimately log anomalies/failures. But an admin mutation that logs only
`log.error("X_FAILED")`, or puts `await logAdminOutcome(...)` on a catch/refusal/pre-mutation
branch while the committed success branch stays silent, is "observable in name only." No
*static* scan (file-level or per-function, descending or not) can prove *which branch* an emit
sits on. So admin mutations are governed by a single **three-part contract**, identical for
actions and routes:

1. **Identify the admin surface.** An **admin action** = a module-level/inline server action
   whose body calls an admin gate `{requireAdmin, requireAdminIdentity, requireDeveloper,
   requireDeveloperIdentity}` (reliable: actions gate at the top; crew actions like
   `selectIdentity` call no gate). An **admin route** = a mutating `route.ts` under
   **`app/api/admin/**`** (path-based, NOT `require*`-detection — `app/api/report/route.ts`
   calls `requireAdminIdentity()` for *conditional role-detection*, not gating, so a
   `require*` scan would false-positive on it; the path signal correctly excludes it). Infra
   routes (webhook, realtime, report, sign-out) are not under `app/api/admin` and keep the
   broad floor.
2. **Registry membership, not a file/body scan.** An admin surface satisfies the floor ONLY by
   membership in the shared `AUDITABLE_MUTATIONS` registry (extracted to a module both tests
   import — §9), OR an explicit `ADMIN_SURFACE_EXEMPTIONS` row (§4.3 item 2 — a bare
   `// no-telemetry:` is REJECTED on an admin surface). It does **NOT** pass merely because the
   file/body contains an `await logAdminOutcome(...)` — that is defeatable by an unused,
   delegated, or wrong-branch emit (Codex R8/R10). A new admin surface not in the registry
   (and not exempt) FAILS discovery. (This supersedes the earlier per-function-scan rule for
   admin actions — actions and routes are now identical here.)
3. **Executable behavioral proof, not a paper reference (Codex R10 F3), keyed per surface
   (Codex R13 F1).** Registry membership is static; only a behavioral test proves the
   *committed success branch* emits. So every admin surface must be covered by an
   **executable** proof: its sink-spy test drives the success path and, **only after** the spy
   observes the expected code, calls a shared recorder
   `recordAdminOutcomeBehavior({ file, fn, code })` — keyed by **surface identity** (`fn` = the
   exported action name, or `"POST"` for a route), NOT `{ file, code }`, so a new admin action
   in an already-registered multi-action file needs its OWN behavioral proof. The
   `ADMIN_OUTCOME_BEHAVIOR` meta-test (§9/§10.5) asserts every non-grandfathered admin surface
   `{ file, fn }` has a recorder entry — a nominal/paper reference cannot satisfy it; the test
   must actually run and observe the emit.

**Scope bound (frozen grandfather baseline).** The behavioral grandfather is NOT "every admin
surface at HEAD" (the 20 seeded surfaces also exist at HEAD and must NOT be grandfathered —
Codex R15 F3); it is exactly the **admin surfaces that ALREADY emitted a success outcome at
`origin/main` HEAD — 30 `{ file, fn }` units: 24 pre-existing admin route `POST`s + 6
pre-existing admin action functions** (`archiveShowAction`, `unarchiveShowAction`,
`setShowPublishedAction`, `mi11ApproveAction`, `mi11RejectAction`, `undoChangeAction`). Their
executable behavioral backfill is deferred to `BL-ADMIN-OUTCOME-BEHAVIOR`.
The meta-test asserts the baseline set is exactly that frozen list and **never grows**. Every
admin surface NOT in the baseline — the **exactly 20 admin surfaces seeded by this change**
(the §3.1 A canonical list minus the one non-admin `confirmUnpublishAction`: settings ×4,
validation ×2, admin-management ×3, dev ×2, onboarding ×2, the 3 admin picker mutations,
`resolveAdminAlertFormAction`, `retryWatchSubscriptionFormAction`, `manifest/…/ignore`,
`reap-stale-sessions`) and every future one — MUST be in the executable recorder set (a real
sink-spy success-branch test, §10.7), never the grandfather list. That is the structural,
uniform closure of the wrong-branch hole for both surface kinds. Reads are exempt (§4.3).

### 4.3 Escape hatches (three, by intent)

1. **`// no-telemetry: <reason>`** — an inline line comment matched
   `/^\s*\/\/\s*no-telemetry:\s*\S/` per-line (the trailing `\s*\S` **requires non-empty
   reason text** — Codex R13 F3; mirrors the `canonicalize-exempt` precedent in
   `tests/admin/no-inline-email-normalization.test.ts`). For **permanent** non-mutations and
   delegators. **Scope — no
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
   acknowledgment rather than a silent pass. **A bare `// no-telemetry:` is REJECTED on an
   admin surface (Codex R11 F1):** an admin route (`app/api/admin/**`) or an admin-gated
   function (its own body calls a `require*` gate) may not skip via a free-text comment —
   otherwise a future admin mutation could dodge both registry membership and the executable
   behavioral proof by claiming, say, `// no-telemetry: read-only` on a real mutation. The
   ONLY sanctioned skip for an admin surface is an explicit `ADMIN_SURFACE_EXEMPTIONS` row
   (item 2). (Note `getStagedResult`/`listFixtures` DO call `requireDeveloper()` in-body, so
   they are admin-gated reads and must be allowlisted, not `// no-telemetry:`'d — verified.)
2. **`ADMIN_SURFACE_EXEMPTIONS`** — a small, reviewed, frozen
   `ReadonlyArray<{ file: string; fn?: string; kind: "delegator" | "read-only"; delegatesTo?:
   string }>` — the ONLY way an admin surface skips registry+behavioral. Two kinds:
   - **`delegator`** (thin admin surface forwarding to an already-registered admin surface;
     re-emitting would double-log): `delegatesTo` names the target; the meta-test asserts the
     target is in `AUDITABLE_MUTATIONS` and the file actually calls into it. Today: the 2
     wizard route shims (`defer_until_modified`, `permanent_ignore` → `…/retry/route.ts`) and
     the 2 dev form-action wrappers (`parseAndStageFormAction` → `parseAndStage`,
     `resetDevSchemaFormAction` → `resetDevSchema`).
   - **`read-only`** (an admin-gated exported action that performs no mutation): today
     `dev/actions.ts` :: `getStagedResult`, `listFixtures`. The meta-test asserts the function
     contains no Supabase write-builder (`.insert/.update/.delete/.upsert`), **no `.rpc(` call
     (a SECURITY DEFINER RPC can mutate, e.g. `dev_truncate_all` — Codex R15)**, and no
     `logAdminOutcome`. Verified: both current read accessors use `.from().select()` /
     `readdir` only, so the `.rpc(` ban breaks neither. (If a future read-only genuinely needs
     a read-only RPC, add its RPC name to a small cited read-RPC allowlist — not a bare skip.)
   The list is frozen: a NEW admin-gated function cannot dodge by appending a `read-only` row
   without a reviewed change, and a `delegator` row is only valid if its target is registered.
   This replaces the bare `// no-telemetry:` the shims/reads previously carried (§3.1 B).
3. **`KNOWN_UNINSTRUMENTED`** — a centralized
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
`file :: POST` for routes — with its `kind` (route / module-action / inline-action), and
remediation paths **scoped to whether it is an admin surface**: for a **non-admin** surface,
add a code-carrying emit, a `// no-telemetry: <reason>`, or a `KNOWN_UNINSTRUMENTED` ledger
row; for an **admin** surface (admin route / `require*`-gated action), the ONLY paths are a
registered `AUDITABLE_MUTATIONS` row **plus** executable behavioral coverage, or an explicit
`ADMIN_SURFACE_EXEMPTIONS` row — the message must NOT offer bare `// no-telemetry:` /
`KNOWN_UNINSTRUMENTED` for admin surfaces. No hidden truncation — every offender is printed.
The route-multiplicity assertion (no `route.ts` exports >1 mutating method) reports separately.

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
- **`resolveAdminAlertFormAction`** (Codex R15): emit `ADMIN_ALERT_RESOLVED` only after the
  `admin_alerts` UPDATE commits (the `revalidatePath("/admin","layout")` branch, mirroring the
  resolve-route). Emit NOTHING on the invalid/absent-id early return, the `getUser`
  returned-error branch, the null-canonical-email branch, or the UPDATE-error branch (each
  already carries its own failure `log.error`).
- **`retryWatchSubscriptionFormAction`** (Codex R15): emit `WATCH_SUBSCRIPTION_RETRIED` only on
  the successful watch-renewal branch (before its `revalidatePath`). Emit NOTHING on the
  "no folder configured" skip (which keeps its existing forensic `log.info`) or the
  renewal-failure branch.
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
> `"use server"` action — MUST be covered, with the mechanism depending on whether it is an
> admin surface:
>
> - **Non-admin surfaces** (crew/system actions; infra routes NOT under `app/api/admin`) MUST
>   carry at least one code-carrying emit (`await logAdminOutcome(...)`, or
>   `log.<info|warn|error>` with a `SHOUTY_SNAKE` code as the message or a `code:` field), OR
>   an inline `// no-telemetry: <reason>` exemption, OR a `KNOWN_UNINSTRUMENTED` debt-ledger
>   row with a backlog ref. Checked per function for actions, per file for routes.
> - **Admin mutations** — **admin-gated actions** (body calls
>   `require{Admin,Developer}[Identity]`) AND **mutating routes under `app/api/admin/**`**
>   (path-based; `require*`-detection is not used for routes, to avoid a false positive on crew
>   routes that read admin identity for role-detection, e.g. `app/api/report`) — MUST satisfy
>   a stricter contract: membership in the `AUDITABLE_MUTATIONS` registry PLUS executable
>   success-branch behavioral proof (a sink-spy that records only after observing the code on
>   the committed success branch), OR an explicit `ADMIN_SURFACE_EXEMPTIONS` row (delegator to
>   a registered surface, or a verified read-only accessor). A bare `// no-telemetry:` or
>   `KNOWN_UNINSTRUMENTED` row is **invalid** for an admin surface.
>
> Enforced by `tests/log/_metaMutationSurfaceObservability.test.ts` (static discovery) and
> `tests/log/adminOutcomeBehavior.test.ts` (executable admin behavioral coverage). New mutation
> surfaces are uninstrumented-by-default failures, not silent omissions.

Add two `BACKLOG.md` entries: `BL-CREW-PICKER-OBSERVABILITY` (the 6 grandfathered non-admin
`lib/auth/picker/*` functions; the 3 admin-gated picker mutations are instrumented now, not
deferred) and `BL-ADMIN-OUTCOME-BEHAVIOR` (audit/backfill executable sink-spy success-branch
proofs for the 30 frozen-baseline pre-existing admin surface units — 24 route `POST`s + 6
pre-existing admin action functions — the new `ADMIN_OUTCOME_BEHAVIOR` meta-test already
forces any NEW admin surface, route or action, to ship one).

## 7. Relationship to existing guards (disagreement-loop preempt)

- **Complement, not replace.** `_metaAdminOutcomeContract` is the *precision* guard (named
  file → named code, codes kept out of §12.4). This is the *floor* guard (no silent surface).
  Both stay. Do not relitigate merging them.
- **Floor vs success-path, and where the line sits (Codex R2/R3/R6/R8/R9/R10 vector).** The
  static floor cannot verify *which branch* an emit sits on. So for **admin mutations** the
  guarantee is not left to any static scan: admin surfaces — **actions** (`require*` in body)
  AND **routes** (`app/api/admin/**`) — are governed by one uniform contract (§4.2): registry
  membership in `AUDITABLE_MUTATIONS` PLUS an **executable** behavioral proof
  (`ADMIN_OUTCOME_BEHAVIOR`, §9/§10.5) — a sink-spy test that records `{ file, fn, code }`
  (surface-keyed, R13 F1) only after observing the code on the committed-success branch. The
  frozen grandfather baseline (30 units: 24 routes + 6 pre-existing action functions) is the
  only exception, backlogged as
  `BL-ADMIN-OUTCOME-BEHAVIOR`; every non-grandfathered admin surface (seeded + future) must be
  executably proven. **Non-admin** surfaces — crew/system actions and infra routes (webhook,
  realtime, `report`, sign-out) — keep the broad coded-emit floor by design (heterogeneous
  telemetry). Do not relitigate: "failure-only / wrong-branch passes for admin surfaces"
  (closed uniformly for actions and routes), "static discovery must verify the success branch"
  (infeasible — the executable sink-spy recorder is that verifier), or "the behavior registry
  is a paper reference" (it is executable — the helper only records post-observation).
- **Routes are checked file-level, and that is per-handler here (not a weaker check).** Every
  `route.ts` in this repo exports exactly one mutating handler (measured: 35/35 single `POST`),
  and the meta-test asserts this invariant, so file-level scoping is equivalent to
  per-handler. Per-handler-*body* scoping was rejected deliberately: 29/35 handlers emit via a
  delegated helper (the correct, established pattern), so it would demand ~29 exemptions on
  correct code or call-graph analysis — and a *new mutating endpoint is a new file*, always
  caught. Do not relitigate as "routes must be per-function"; the multiplicity assertion is
  the tripwire that keeps the equivalence honest. Module/inline **actions** ARE per-function
  (that is the R2 fix), because multi-action modules are real and appending an export is the
  live vector. For **admin** surfaces (routes AND actions) the static scan is not the
  success-outcome check at all — registry membership + executable behavioral proof is
  (§4.2, previous bullet), so a delegated/unreachable/wrong-branch emit cannot fake compliance.
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
- **REFACTORS (Codex R8/R14):** extract the `AUDITABLE_MUTATIONS` array (and the
  sanctioned-code sets) from `_metaAdminOutcomeContract.test.ts` into a shared non-test module
  (e.g. `tests/log/_auditableMutations.ts`) that BOTH `_metaAdminOutcomeContract.test.ts` and
  the new discovery test import — single source of truth. **During the extraction each row
  gains a surface key `fn` → the registry is `{ file, fn, code }` (Codex R14 F1):** `fn:
  "POST"` for route rows, the exported action name for action rows (a multi-action file thus
  has one row per function, e.g. `admins/actions.ts` → `{fn:"addAdminAction",code:"ADMIN_GRANTED"}`
  and `{fn:"revokeAdminAction",code:"ADMIN_REVOKED"}`). `_metaAdminOutcomeContract` still keys
  its static emit-check on `{ file, code }` (adding `fn` is backward-compatible extra data);
  the discovery + behavioral coverage use the full `{ file, fn, code }` tuple, so a new admin
  action in a registered file has NO registry binding until its own `{ file, fn, code }` row is
  added. The coverage assertion (§10.5) requires the behavioral record's tuple to **exactly
  match** the surface's registry tuple.
- **CREATES (Codex R9/R10): the executable `ADMIN_OUTCOME_BEHAVIOR` proof, in ONE
  self-contained test file** `tests/log/adminOutcomeBehavior.test.ts` (Codex R11 F2 — a
  cross-file in-memory recorder is unreliable under Vitest's per-file isolation / workers /
  sharding). **Keyed by surface identity `{ file, fn, code }` — NOT `{ file, code }` (Codex
  R13 F1)** — so a new admin action added to an already-registered multi-action file
  (`feed.ts`, `admins/actions.ts`, `validationReset.ts`) cannot ride a sibling's row; `fn` is
  the exported action name (or `"POST"` for a route). That single file: (1) declares a
  file-local `recorded` set of `{ file, fn, code }`; (2) contains a sink-spy behavioral case
  for every non-grandfathered admin surface (route OR action) that drives the committed-success
  path and, **only after** the spy observes the expected code, calls
  `recordAdminOutcomeBehavior({ file, fn, code })`; (3) ends with a coverage assertion that
  imports the pure per-function admin-surface enumerator + the shared `{ file, fn, code }`
  registry and asserts every non-grandfathered admin surface `{ file, fn }` has a `recorded`
  entry whose **full `{ file, fn, code }` tuple exactly matches its registry row** (Codex R14
  F1 — a record with the wrong/absent code, or a registry row with no matching record, fails).
  Because population and
  assertion live in the same module scope, order is deterministic and immune to sharding. The
  frozen `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` set (also `{ file, fn }`-keyed) is exactly the
  **30 pre-existing surface units — 24 route `POST`s + 6 pre-existing admin action functions**
  (`archiveShowAction`, `unarchiveShowAction`, `setShowPublishedAction`, `mi11ApproveAction`,
  `mi11RejectAction`, `undoChangeAction`); the assertion fails if that set grows. Executable,
  not referential; covers routes AND actions uniformly (Codex R10 F1).
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
   with no emit MUST fail — Codex R3 F1), **admin surface ⇒ registry, not scan (Codex
   R3/R6/R8/R10 F2, unified)** — an **admin action** (body calls `requireAdmin`) OR an **admin
   route** (`app/api/admin/**`) that is NOT in `AUDITABLE_MUTATIONS` and NOT exempt **FAILS
   even with `await logAdminOutcome` in the file/body** (a wrong-branch/unused emit must not
   buy a pass); the same surface once registered passes the discovery predicate; a **non-admin**
   surface (crew action / `app/api/report` route) with only a coded `log.error` **passes** (broad
   floor). **nested-emitter rejection** (a *non-admin* action with an unused nested
   `async function u(){ await logAdminOutcome(...) }` and a silent return MUST fail — Codex
   R4 F3; a live emit in an `if`/`try` block passes), **file-leading exemption rejection**
   (a file-leading `// no-telemetry:` in a `"use server"` module errors; a per-function one
   works and does NOT cover a sibling — Codex R4 F2), and the negative-regression flip (§4.5).
2. **Live-surface test** — the walk runs against the repo and asserts zero unaccounted
   surface units. After seeding, this is green.
3. **Route-multiplicity assertion** — a dedicated assertion that no `route.ts` exports >1
   mutating method (the tripwire that keeps route file-level scoping equivalent to
   per-handler); prove it can fail via an in-memory two-mutating-method route string.
4. **Admin registry-linkage — routes AND actions, per surface key (Codex R8/R10/R14)** — every
   discovered admin surface `{ file, fn }` (route under `app/api/admin/**`, `fn:"POST"`; OR
   action whose body calls a `require*` gate) must have a matching `{ file, fn, code }` row in
   the shared registry or be exempt (assert against the live tree). Negative fixtures: a
   synthetic admin route whose only `await logAdminOutcome(...)` sits in an **unused nested
   helper** and which has no registry row MUST fail; a synthetic admin action with the emit on
   a catch branch and no registry row MUST fail; **a new admin action added to an
   already-registered multi-action file (a fixture with a 3rd export) MUST fail because its
   `{ file, fn }` has no registry row, even though the file already has sibling rows** (Codex
   R14 F1). **Admin-exemption hygiene (Codex R11
   F1):** an admin surface carrying a bare `// no-telemetry:` (no `ADMIN_SURFACE_EXEMPTIONS`
   row) MUST fail; an `ADMIN_SURFACE_EXEMPTIONS` `delegator` row whose `delegatesTo` is NOT in
   `AUDITABLE_MUTATIONS` MUST fail; a `read-only` row on a function that contains a
   write-builder, **a `.rpc(` call** (negative fixture: a `read-only`-exempted action calling
   a mutating RPC like `dev_truncate_all` MUST fail — Codex R15), or `logAdminOutcome` MUST fail. Assert the seeded gaps (settings, validation,
   admins, developer, dev, onboarding, 3 picker, `manifest/ignore`, `reap-stale-sessions`) are
   all present in `AUDITABLE_MUTATIONS` after seeding.
5. **Executable admin behavioral-coverage — single file (Codex R9/R10/R11 F2), keyed
   `{ file, fn, code }` (Codex R13 F1)** — all of it in `tests/log/adminOutcomeBehavior.test.ts`:
   the per-surface sink-spy cases populate a file-local `recorded` set of `{ file, fn, code }`
   (only after observing the code on the committed-success branch), and a final coverage
   `test()` in the same file asserts every non-grandfathered admin surface `{ file, fn }`
   (from the pure per-function enumerator) has a `recorded` entry; the grandfather set equals
   exactly the frozen 30 pre-existing surface units (24 route `POST`s + 6 admin action
   functions) and FAILS if it grows. No cross-file in-memory state; deterministic under Vitest
   isolation/sharding. Negative checks: a non-grandfathered surface whose behavioral case is
   missing (or whose spy never observed the emit) FAILS the coverage `test()`; **and a new
   admin action added to an already-registered multi-action file (e.g. a 4th export in
   `admins/actions.ts`) FAILS until its OWN `{ file, fn }` behavioral entry exists** (Codex R13
   F1 — the per-function key is what prevents riding a sibling). The whole file is one Vitest
   unit so `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` both populates and asserts.
6. **Ledger default-fail + hygiene** — a `"use server"` module with a ledgered function plus a
   NEW un-ledgered silent action fails on the new action (Codex R4 F1); a `{ file, fn }` row
   whose function now emits, or no longer exists, or whose `file` is gone, fails (forces
   cleanup). **Admin-gated-cannot-be-ledgered (Codex R5):** a `KNOWN_UNINSTRUMENTED` row whose
   `fn` body calls a `require{Admin,Developer}[Identity]` gate fails the test — prove it with
   an in-memory admin-gated fixture and by asserting the live ledger's 6 functions are all
   non-admin-gated.
7. **Per-surface instrumentation tests (actions AND routes) — Codex R7/R10.** The **20 admin**
   surfaces' sink-spy cases live in the single `tests/log/adminOutcomeBehavior.test.ts` (§10.5)
   — each asserts the committed-success branch emits the expected `code`, that non-success
   branches emit nothing, then calls `recordAdminOutcomeBehavior({ file, fn, code })`. Explicitly
   cover: `MANIFEST_SHEET_IGNORED` on the committed manifest-transition branch and **not** on a
   CAS-miss rollback; `STALE_SESSIONS_REAPED` on the successful-reap branch (with count) not the
   infra-fault branch; each admin toggle on `{ ok: true }` only; admin-management
   (`ADMIN_GRANTED`/`ADMIN_REVOKED`/`ADMIN_DEVELOPER_SET`) on the `kind: "ok"` branch only;
   `rotateShareToken` never logging the `share_token` secret. The non-admin
   `confirmUnpublishAction` gets its own sink-spy test (co-located with the unpublish tests) but
   does not record (broad floor). Derive expectations from each surface's own result shape; do
   not assert against a container that also renders the value.
8. **`_metaAdminOutcomeContract` still green** — the new registry rows are consistent
   (file emits the registered code; code stays out of §12.4); the shared-module extraction
   (§9) does not change its behavior.

## 11. Verification commands

- `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts tests/log/_metaAdminOutcomeContract.test.ts tests/log/adminOutcomeBehavior.test.ts` (the behavioral file runs as one self-contained unit — populate + assert in the same module scope)
- `pnpm vitest run tests/messages/` (codes-coverage / catalog parity unaffected — proves no §12.4 leak)
- `pnpm vitest run tests/admin tests/log tests/auth` (meta-test comment/format fragility sweep)
- `pnpm typecheck`
- `pnpm format:check`
- Full suite in CI.
