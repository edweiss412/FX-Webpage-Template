# Crew-Picker Observability — Design Spec

**Backlog:** `BL-CREW-PICKER-OBSERVABILITY` (`BACKLOG.md:234`, Status OPEN → this spec closes it).
**Date:** 2026-07-05. **Slug:** `crew-picker-observability`.
**Class:** OBSERVABILITY DEBT — additive telemetry only.

## 1. Problem

The six non-admin-gated `lib/auth/picker/*` functions mutate crew-picker state (the
signed picker cookie / per-show selection envelope) but emit **no durable success
trace**, so a "who picked what, when" audit has no server-side signal. They are parked
in the invariant-#10 debt ledger `KNOWN_UNINSTRUMENTED` (`tests/log/mutationSurface/exemptions.ts:83-115`):

| # | file | fn | role |
|---|---|---|---|
| 1 | `lib/auth/picker/cleanupStaleEntry.ts` | `cleanupStaleEntry` | FormData wrapper → core |
| 2 | `lib/auth/picker/cleanupStaleEntry.ts` | `cleanupStaleEntryCore` | try/catch wrapper → `…Impl` |
| 3 | `lib/auth/picker/clearIdentity.ts` | `clearIdentity` | FormData wrapper → core |
| 4 | `lib/auth/picker/clearIdentity.ts` | `clearIdentityAndSkip` | FormData wrapper → core + redirect |
| 5 | `lib/auth/picker/clearIdentity.ts` | `clearIdentityCore` | try/catch wrapper → `…Impl` |
| 6 | `lib/auth/picker/selectIdentity.ts` | `selectIdentityCore` | try/catch wrapper → `…Impl` |

The 3 **admin-gated** picker mutations (`resetPickerEpoch`, `rotateShareToken`,
`resetCrewMemberSelection`) are already instrumented via `logAdminOutcome`
(`tests/log/_auditableMutations.ts`, `PICKER_EPOCH_RESET_BY_ADMIN` /
`SHARE_TOKEN_ROTATED_BY_ADMIN` / `PICKER_SELECTION_RESET_BY_ADMIN`) and are **out of
scope** — the ledger hygiene test structurally rejects an admin-gated entry
(`tests/log/_metaMutationSurfaceObservability.test.ts:539-549`).

**Why `logAdminOutcome` is the wrong tool here.** `logAdminOutcome`
(`lib/log/logAdminOutcome.ts:8-51`) hashes a **canonical admin `actorEmail`** and is a
deliberately admin-forensic namespace. The crew-picker actor is an **anonymous crew
member on an emailed share link** — there is no admin email to attribute, and the
selection is keyed by an opaque `crew_member_id`, not an identity. The fix (per the
backlog entry) is a crew-picker telemetry taxonomy **distinct from `logAdminOutcome`**.

## 2. Solution — crew-telemetry taxonomy via coded `log.info`

Each mutation emits a plain **coded `log.info(message, { code, source, … })`** at its true
mutation boundary. This is durable and catalog-exempt by two existing mechanisms:

- **Durable:** `shouldPersist` persists an `info` record **iff it carries a `code`**
  (`lib/log/logger.ts:23` — `if (level === "info") return code != null || persist === true;`).
  A coded `log.info` therefore writes to `app_events`, exactly like `logAdminOutcome`
  (which is itself a coded `log.info` wrapper).
- **§12.4-scanner-exempt:** the code literal lives **inside a `log.*()` span**, which
  the producer scanner (`lib/messages/__internal__/codeProducers.ts:6-12`, via
  `stripLogEmissionCalls`) removes before the scan — same mechanism the existing forensic
  codes rely on, e.g. `PICKER_IDENTITY_CLAIMED_TAMPER` at
  `lib/auth/picker/selectIdentity.ts:64`. So no `catalog.ts` / §12.4 registration, and no
  x1 catalog-parity collision (`tests/cross-cutting/codes.test.ts:122-126`).

### 2.1 The three codes

| Code | Fires when | `source` | Context fields |
|---|---|---|---|
| `PICKER_IDENTITY_SELECTED` | crew binds their identity to a show (cookie `set` commits) | `auth.picker.selectIdentity` | `showId`, `crewMemberId`, `epoch` |
| `PICKER_IDENTITY_CLEARED` | crew clears their selection (real delete branch) | `auth.picker.clearIdentity` | `showId` |
| `PICKER_STALE_ENTRY_CLEANED` | crew self-service cleans a superseded entry (`action:"cleaned"`) | `auth.picker.cleanupStaleEntry` | `showId`, `epoch`, `crewMemberId` |

`source` values reuse the existing `auth.picker.*` namespace already present on the
tamper warn (`selectIdentity.ts:64` uses `source: "auth.picker.selectIdentity"`).

**No new code for "continue as guest".** `clearIdentityAndSkip`
(`clearIdentity.ts:53-59`) calls `clearIdentityCore` (which emits
`PICKER_IDENTITY_CLEARED`) then redirects with `gate=skip`. The skip is a navigation
choice, not a distinct state mutation — `PICKER_IDENTITY_CLEARED` already covers the
committed change. (YAGNI — no `PICKER_IDENTITY_SKIPPED`.)

### 2.2 Emit placement — at the true mutation boundary, inside each private `*Impl`

The exported `*Core` functions are 3-line `try { return await …Impl(input); } catch { … }`
wrappers with **no result detail** (`{ ok: true }`); the FormData wrappers only parse
input. The mutation, and all the context (`showId`, `crewMemberId`, `epoch`), is in
scope only inside the private `*Impl`. So the emit goes there:

- **`selectIdentityCoreImpl`** (`selectIdentity.ts:83-146`) — after the cookie
  `cookieStore.set(...)` (`:138`) and `revalidatePath` (`:145`), before
  `return { ok: true }` (`:146`). `showId` (`:121`), `input.crewMemberId`,
  `pickerEpoch` (`:122`) all in scope.
- **`clearIdentityCoreImpl`** (`clearIdentity.ts:69-106`) — on the **real-delete branch
  only**, before `return { ok: true }` (`:106`), after the cookie rewrite (`:88`/`:96`)
  + `revalidatePath` (`:105`). `input.showId` in scope. The `!env` no-op branch
  (`:81-83`) stays **silent**. **Existence guard (Codex spec-R1 MED):** the delete at
  `:86` (`delete env.selections[input.showId]`) runs unconditionally even when the cookie
  holds no entry for this `showId`, so the emit MUST be gated on prior existence — capture
  `const existed = env.selections[input.showId] !== undefined;` **before** the delete and
  emit only when `existed` is `true`. An `env` that exists but lacks an entry for this
  show is a no-op → **silent** (mutation-boundary discipline: nothing was actually
  cleared).
- **`cleanupStaleEntryCoreImpl`** (`cleanupStaleEntry.ts:61-121`) — before
  `return { ok: true, action: "cleaned" }` (`:121`), after the best-effort
  `upsertAdminAlert` try/catch (`:106-119`). `input.showId`, `input.expectedEpoch`,
  `input.expectedCrewMemberId` in scope. The three `action: "noop"` returns
  (`:78`, `:81`, `:83`) stay **silent**.

No return-type changes. `clearIdentity.ts` and `cleanupStaleEntry.ts` do **not** import
`log` today — add `import { log } from "@/lib/log";` to each (`selectIdentity.ts:14`
already imports it).

### 2.3 Guard conditions (per input / per branch)

| Function | Input / branch | Behavior |
|---|---|---|
| `selectIdentityCoreImpl` | invalid slug/token/uuid (`:84-92`), RPC error/`!data` (`:112`), `out_rejection_code` (`:113`), bad epoch/millis (`:116-124`) | early return `{ ok:false, code }` — **no emit** |
| `selectIdentityCoreImpl` | success (cookie written) | emit `PICKER_IDENTITY_SELECTED` |
| `selectIdentityCore` | `…Impl` throws (`:78`) | `catch → { ok:false, code:"PICKER_RESOLVER_LOOKUP_FAILED" }` — **no emit** |
| `clearIdentityCoreImpl` | invalid input (`:75`) | early return — **no emit** |
| `clearIdentityCoreImpl` | `!env` (no picker cookie) (`:81-83`) | `{ ok:true }`, **no emit** (nothing cleared) |
| `clearIdentityCoreImpl` | `env` present but no entry for `input.showId` (`existed===false`) | `{ ok:true }`, **no emit** (no-op) |
| `clearIdentityCoreImpl` | real delete, `existed===true` (`:86-106`) | emit `PICKER_IDENTITY_CLEARED` |
| `cleanupStaleEntryCoreImpl` | invalid input (`:72`), `!env` (`:78`), `!entry` (`:81`), epoch/id mismatch (`:83`) | `{ ok:true, action:"noop" }` or `{ ok:false }`, **no emit** |
| `cleanupStaleEntryCoreImpl` | `action:"cleaned"` (`:121`) | emit `PICKER_STALE_ENTRY_CLEANED` |

The FormData wrappers' `PICKER_INVALID_INPUT` early returns (`selectIdentity.ts:45`,
`clearIdentity.ts:48/55`, `cleanupStaleEntry.ts:41/46`) are validation refusals, not
committed mutations — **no emit**.

### 2.4 PII posture

The emitted context carries only `showId` (a `shows.id` UUID), `crewMemberId` (an opaque
`crew_member_id` UUID), and `epoch` (an integer) — **never** a raw crew name or email.
This mirrors precedent: the existing tamper warn already logs `crewMemberId` and `slug`
inside its `log.warn` payload (`selectIdentity.ts:57-65`), and the logger's
`sanitizeContext` email-redaction net (`lib/log/sanitize.ts`) is a safety net, not a
license — opaque UUIDs are not PII. No email is ever in scope in these functions
(the crew actor is anonymous), so there is nothing to hash or redact.

## 3. Discovery-floor accounting (deleting the ledger without turning the floor red)

The invariant-#10 discovery meta-test
(`tests/log/_metaMutationSurfaceObservability.test.ts:680-696`) enumerates every
mutation surface and requires each **non-admin** surface to pass by one of:
a coded emit **in its own body** (`predicateFor`, `descend:false` for actions →
`_metaMutationSurfaceObservability.test.ts:61-65,177-182`), a per-function
`// no-telemetry: <reason>` comment (`functionSpanHasNoTelemetry`,
`exemptions.ts:35-38`; `NO_TELEMETRY_RE = /^\s*\/\/\s*no-telemetry:\s*\S/` **requires
non-empty reason text**, `exemptions.ts:10`), or a `KNOWN_UNINSTRUMENTED` ledger row.

Because the real emit lives in the **private `*Impl`** (not a surface unit — only
`export`ed functions of a `"use server"` module are surfaces), none of the six exported
wrappers carries a coded emit **in its own body**. So each of the six gets a
per-function `// no-telemetry:` comment naming the `*Impl` emit — the sanctioned
delegation path (fixture precedent: "passes via a per-function `// no-telemetry:`
exemption", `_metaMutationSurfaceObservability.test.ts:261-268`, reason "delegates to
another action"; and the established use on the crew form-action wrappers in commit
`5adfe13b`).

Comment text (each **inside** the named function's own body span; reason non-empty):
- `selectIdentityCore` → `// no-telemetry: try/catch wrapper; PICKER_IDENTITY_SELECTED emit fires at the mutation boundary in selectIdentityCoreImpl`
- `clearIdentityCore` → `// no-telemetry: try/catch wrapper; PICKER_IDENTITY_CLEARED emit fires at the mutation boundary in clearIdentityCoreImpl`
- `cleanupStaleEntryCore` → `// no-telemetry: try/catch wrapper; PICKER_STALE_ENTRY_CLEANED emit fires at the mutation boundary in cleanupStaleEntryCoreImpl`
- `clearIdentity` → `// no-telemetry: FormData-parse wrapper; PICKER_IDENTITY_CLEARED emit fires in clearIdentityCoreImpl`
- `clearIdentityAndSkip` → `// no-telemetry: FormData-parse + skip redirect; PICKER_IDENTITY_CLEARED emit fires in clearIdentityCoreImpl`
- `cleanupStaleEntry` → `// no-telemetry: FormData-parse wrapper; PICKER_STALE_ENTRY_CLEANED emit fires in cleanupStaleEntryCoreImpl`

`selectIdentity` (the FormData wrapper) is **untouched** — it already passes the floor
via its `PICKER_IDENTITY_CLAIMED_TAMPER` coded `log.warn` in its own body
(`selectIdentity.ts:56-65`), and is not in the ledger.

**Ledger delete:** `KNOWN_UNINSTRUMENTED` becomes `[]` (`exemptions.ts`), doc comment
refreshed to state the ledger is empty (crew picker fns now instrumented).

Two tests reference the ledger's contents and MUST be updated in the same change:

- **`tests/log/mutationSurface/exemptions.test.ts:18-40` (Codex spec-R1 HIGH)** — the
  `describe("KNOWN_UNINSTRUMENTED — exactly the 6 crew/system picker fns …")` block **hard-
  pins** `KNOWN_UNINSTRUMENTED.length === 6` (`:19-21`), a per-row backlog ref (`:22-25`),
  and the exact 6-row set (`:26-39`). Replace this block with a debt-closed assertion:
  `expect(KNOWN_UNINSTRUMENTED).toHaveLength(0)` (the ledger is empty now that
  `BL-CREW-PICKER-OBSERVABILITY` shipped). Keep the sibling `NO_TELEMETRY_RE` and
  `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` blocks untouched.
- **`_metaMutationSurfaceObservability.test.ts:551-572`** — the hygiene test "the live
  KNOWN_UNINSTRUMENTED ledger's 6 rows are all non-admin-gated" loops `for (const row of
  KNOWN_UNINSTRUMENTED)` and passes **vacuously** when empty; rename its title to drop the
  stale "6 rows" (`…ledger's rows are all non-admin-gated`).

## 4. Registry / bookkeeping

- **`NEW_FORENSIC_CODES`** (`tests/log/_auditableMutations.ts`): add the 3 new codes
  (leak-check hygiene — `_metaAdminOutcomeContract.test.ts` Assertion 4 verifies every
  code in this set stays **out** of the §12.4 producer scan). **Not** added to
  `SANCTIONED_CODES` (that set is `logAdminOutcome`/admin-outcome codes registered in
  `AUDITABLE_MUTATIONS` only — these crew codes are neither).
- **`BACKLOG.md:234`**: mark `BL-CREW-PICKER-OBSERVABILITY` **CLOSED** (this spec/PR),
  with a one-line pointer to the shipped taxonomy.
- **No** `AUDITABLE_MUTATIONS` row (these are not admin outcomes). **No** §12.4 catalog
  edit. **No** `gen:internal-code-enums` change (log-span literals are stripped —
  verify the generator stays a no-op).

## 5. Tests (TDD)

Extend the three existing picker suites with `log` spies. `selectIdentity.test.ts`
already hoists a `logMock` (`{ warn, error, info, debug }`, `:22-28`); `clearIdentity.test.ts`
and `cleanupStaleEntry.test.ts` need a `vi.mock("@/lib/log", …)` added (their targets
gain a `log` import).

Per suite:
- **Positive:** the committed-mutation path emits `log.info` with
  `expect.objectContaining({ code: <CODE>, source: <SOURCE>, showId: <fixtureShowId> })`
  — and, where applicable, `crewMemberId` / `epoch` **derived from the fixture** (never
  hardcoded). `selectIdentity`: the RPC fixture's `out_show_id` is the expected `showId`.
- **Negative (concrete failure modes):**
  - invalid input (bad slug/token/uuid) → **no** `log.info` with the code;
  - `selectIdentity`: RPC error / `out_rejection_code` set / bad epoch → no emit;
  - `clearIdentity`: `!env` (no picker cookie) success → no emit (no-op silent);
  - `clearIdentity`: `env` present but **no entry for this `showId`** → no emit (the
    existence-guard no-op, Codex spec-R1 MED);
  - `cleanupStaleEntry`: each `noop` branch (`!env`, `!entry`, epoch/id mismatch) → no emit;
  - the `*Core` throw path → `{ ok:false }` and no emit.
- **Wrapper transitivity:** driving the FormData wrapper (`selectIdentity` /
  `clearIdentity` / `cleanupStaleEntry`) on the success path also observes the emit
  (it flows through `*Core → *Impl`).

Update in lockstep with the ledger delete: `tests/log/mutationSurface/exemptions.test.ts`
(the `KNOWN_UNINSTRUMENTED` describe block → debt-closed empty assertion, §3) and the
`…6 rows…` hygiene-test title in `_metaMutationSurfaceObservability.test.ts`.

Keep green: `tests/log/_metaMutationSurfaceObservability.test.ts` (discovery floor +
hygiene) and `tests/log/_metaAdminOutcomeContract.test.ts` (Assertion 4 leak-check).

## 6. Watchpoints (disagreement-loop preempts for adversarial review)

- **`log.info` vs `logAdminOutcome`** — deliberate: the actor is not an admin, has no
  email to hash; the backlog entry (`BACKLOG.md:238`) explicitly asks for "a code
  namespace **distinct from** `logAdminOutcome`'s admin-forensic codes." `logAdminOutcome`
  is itself a coded-`log.info` wrapper (`logAdminOutcome.ts:35`); we use the same durable
  primitive without the admin `actorEmail` hashing. **Do not relitigate.**
- **Emit in private `*Impl` + `// no-telemetry:` on exported wrappers** — the `*Impl`
  holds the mutation and all context; the exported wrappers are pure delegators. The
  floor's `descend:false` action scan (`_metaMutationSurfaceObservability.test.ts:61-65`)
  means the wrapper bodies do not "see" the `*Impl` emit, so the delegation comment is
  the correct, sanctioned accounting (precedent: `:261-268`; commit `5adfe13b`). This is
  not a loophole — the telemetry is real and unit-tested at the boundary.
- **`crewMemberId` in context is not PII** — opaque `crew_member_id` UUID; precedent is
  the existing tamper warn logging `crewMemberId` (`selectIdentity.ts:57-65`). See §2.4.
- **`clear` no-op and `cleanup` noop stay silent** — intentional mutation-boundary
  discipline (telemetry fires only on a committed change), consistent with the admin
  carve-out rule ("never on discard/no-op").
- **No `PICKER_IDENTITY_SKIPPED`** — skip is navigation, the clear is the mutation (§2.1).
- **No catalog / no `SANCTIONED_CODES` / no `AUDITABLE_MUTATIONS`** — these are forensic
  app_events codes, not §12.4 user-facing copy and not admin outcomes (§4).

## 7. Numeric sweep

3 new codes · 6 ledger rows deleted · 6 `// no-telemetry:` comments added · 3 `*Impl`
emit sites (one existence-guarded) · 3 picker test suites extended · 2 meta-test files
updated in lockstep (`exemptions.test.ts` length-pin → empty; `_metaMutationSurfaceObservability`
title) · 1 backlog entry closed · 0 DB migrations · 0 UI files · 0 new Supabase call
sites · 0 advisory-lock changes.
