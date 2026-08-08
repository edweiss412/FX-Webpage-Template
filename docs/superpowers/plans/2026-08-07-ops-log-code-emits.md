# Implementation plan — Cluster E durable `code:` emits

Spec: `docs/superpowers/specs/2026-08-07-ops-log-code-emits.md`
Branch: `feat/ops-log-code-emits`

Six emit-less failure sites gain a `code:`-carrying `log.*` call. Five tasks, each red → implementation → green → commit per invariant 1. No UI, no migration, no advisory lock, no new error code.

## Pre-draft verification (run, not described)

Every claim this plan names was grep-verified against the branch's merge base (`61281c23e`) before drafting.

| Claim | Verification |
| --- | --- |
| Site 1 — callback `OAUTH_REDIRECT_INVALID` return | `app/auth/callback/route.ts:258` |
| Site 1 branch variable | `app/auth/callback/route.ts:181` (`hasInvalidExplicitNext`) |
| Site 2 — google-start return | `app/api/auth/google/start/route.ts:40` |
| Sites 3-5 — three picker-bootstrap 403s | `app/api/auth/picker-bootstrap/route.ts:162`, `app/api/auth/picker-bootstrap/route.ts:165`, `app/api/auth/picker-bootstrap/route.ts:176` |
| All three handlers are GET | `app/auth/callback/route.ts:178`, `app/api/auth/google/start/route.ts:36`, `app/api/auth/picker-bootstrap/route.ts:158` |
| `log` already imported in two of three routes | `app/auth/callback/route.ts:12`, `app/api/auth/picker-bootstrap/route.ts:18` — google-start has NO `log` import and gains one |
| Shipped emit shape to copy | `app/auth/callback/route.ts:226` (try / `await log.error` / `catch {}`) |
| `source` conventions | `app/auth/callback/route.ts:89` (`"auth.callback"`), `app/api/auth/picker-bootstrap/route.ts:100` (`"api.auth.pickerBootstrap"`) |
| `LogFields.code` is `string \| undefined`; `reason` lands in `context` | `lib/log/types.ts` (`RESERVED` set in `lib/log/logger.ts` excludes `reason`) |
| `warn` and `error` both persist unconditionally | `lib/log/logger.ts` (`shouldPersist`) |
| `app_events.code` is unconstrained `text` | `supabase/migrations/20260629000002_app_events.sql:9` |
| Resolver + its three failure paths | `components/admin/OnboardingWizard.tsx:73`, `components/admin/OnboardingWizard.tsx:75`, `components/admin/OnboardingWizard.tsx:80`, `components/admin/OnboardingWizard.tsx:82` |
| `ServiceAccountResult` has no discriminator | `components/admin/OnboardingWizard.tsx:71` |
| Sole caller of the resolver | `components/admin/OnboardingWizard.tsx:576` |
| `OnboardingWizard` is an async **server** component | `components/admin/OnboardingWizard.tsx:571` — no `"use client"`; imports `createSupabaseServerClient` at `components/admin/OnboardingWizard.tsx:36` |
| Operator-error render branch | `components/admin/OnboardingWizard.tsx:665` |
| Test template — `setLogSink` capture harness | `tests/auth/callback-oauth-telemetry.test.ts:34` |
| Three shipped operator-error render cases | `tests/components/admin/OnboardingWizard.test.tsx:203`, `tests/components/admin/OnboardingWizard.test.tsx:220`, `tests/components/admin/OnboardingWizard.test.tsx:232` |
| Both codes already cataloged (no §12.4 work) | `lib/messages/catalog.ts:2614`, `lib/messages/catalog.ts:2141` |
| Premise helper exists | `tests/_shared/premise.ts` |

**CI wiring — verified, no task needed.** `BASE_INCLUDE` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`), so a new file under `tests/auth/` is collected with no config edit. It is absent from `PARALLEL_TEST_GLOBS`, which is an allowlist, so it defaults to the SERIAL project — correct by default and requiring no action. The existing sibling `tests/auth/callback-oauth-telemetry.test.ts` carries no `@vitest-environment` pragma (node is the default, `vitest.config.ts:70`) and the new OAuth suite matches it; `tests/components/admin/OnboardingWizard.test.tsx` already carries `// @vitest-environment jsdom` on line 1 and is only extended, never re-created.

**Snippet typecheck obligation.** Every snippet below is written against the strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Array indexing in assertions uses the `!` form the shipped sibling already uses (`tests/auth/callback-oauth-telemetry.test.ts:76`, `rec[0]!.level`); the implementer runs `pnpm typecheck` before each commit, not only at the end.

## Meta-test inventory (mandatory declaration)

- **CREATES:** none.
- **EXTENDS:** none.
- **Justification** (an explicit declaration, not an omission): the candidate registries do not reach these surfaces. `tests/log/_metaMutationSurfaceObservability.test.ts` is scoped to mutating methods and admin routes and all six sites are GET/render (spec §1.1 item 1); `tests/auth/_metaInfraContract.test.ts` covers Supabase call boundaries and this arc adds no Supabase call; `tests/auth/advisoryLockRpcDeadlock.test.ts` covers lock topology and this arc takes no lock; `tests/messages/_metaAdminAlertCatalog.test.ts` covers `admin_alerts` upserts, which this arc does not perform. The behavioral tests in Tasks 1-4 are the whole defense, which is why they are written per-branch rather than per-file.
- **Advisory-lock topology:** N/A — no `pg_advisory*` path, no DB write, no `shows`/`crew_members` mutation. No commit boundary exists at any site, so invariant 2's post-commit-emit placement rule is satisfied vacuously.
- **Layout-dimensions task:** N/A — no fixed-dimension parent, no rendered element added or changed.
- **Transition-audit task:** N/A — no `AnimatePresence`, no ternary render change, no visual state added.
- **Mutation-surface observability (invariant 10):** N/A — no mutating route handler and no `"use server"` action is added or modified.

impeccable-gate: N/A — no UI surface

**Why that marker holds despite `components/admin/OnboardingWizard.tsx` being touched** (spec §4): the edit adds a type discriminator to a module-private helper and one `log.error` call in the component body. It renders nothing, changes no class, token, copy, or render condition. The tripwire is executable rather than asserted — the three shipped render assertions at `tests/components/admin/OnboardingWizard.test.tsx:203-238` must pass **unmodified**, which is why Task 3 extends those cases rather than rewriting them. If implementation finds itself changing rendered output, this marker is void and the dual gate applies.

## Acceptance criteria

- **AC-1** — Each of the five OAuth branches emits exactly one record with `level: "warn"`, `code: "OAUTH_REDIRECT_INVALID"`, and its own distinct `reason`. Six values across five sites, because site 5 splits on whether the intent verified: `callback_invalid_explicit_next`, `start_invalid_explicit_next`, `bootstrap_next_rejected`, `bootstrap_unparsable_next`, `bootstrap_intent_unverified`, `bootstrap_intent_target_mismatch`.
- **AC-2** — No emit changes the shipped refusal. Status codes, redirect targets, PKCE cookie clearing, and control flow are unchanged at every site.
- **AC-3** — The onboarding operator-error path emits exactly one record with `level: "error"`, `code: "ONBOARDING_OPERATOR_ERROR"`, and `reason` ∈ {`env_missing`, `json_malformed`, `client_email_missing`} matching the actual cause.
- **AC-4** — No emit carries service-account key material, the `JSON.parse` error, or the raw rejected `next` value. Enforced **structurally** — no record carries an `error` key at all — because a parse-error message leaks input text while containing neither the sentinel nor `private_key`, so content matching alone does not catch it.
- **AC-5** — `OnboardingWizard`'s rendered output is unchanged; the three shipped render assertions pass unmodified.
- **AC-6** — Both ledger entries archive with provenance, and the `IN PROGRESS` markers come off in the PR's last commit.

<!-- tasks: depth=2 -->

## Task 1 — sites 1-2: callback and google-start emits

<!-- task: red=`pnpm vitest run tests/auth/oauthRedirectInvalidTelemetry.test.ts` ac=AC-1,AC-2,AC-4 -->

**RED.** Create a new node-environment suite at tests/auth/oauthRedirectInvalidTelemetry.test.ts, structured on the shipped harness at `tests/auth/callback-oauth-telemetry.test.ts:34` — `vi.resetModules()`, `setLogSink` capturing `LogRecord[]`, dynamic `import` of the route, `resetLogSink()` in a `finally`. Two cases:

1. Drive `app/auth/callback/route.ts`'s `GET` with a valid `code` and an **explicitly invalid** `next` (so `hasInvalidExplicitNext` is true at `app/auth/callback/route.ts:181`). Assert exactly one record with `code === "OAUTH_REDIRECT_INVALID"`, `level === "warn"`, `context.reason === "callback_invalid_explicit_next"`, **and** that the response is still a 302 to the sign-in path — AC-2 asserted in the same case as AC-1, so an emit that accidentally changes the redirect fails here rather than in review.
2. Drive `app/api/auth/google/start/route.ts`'s `GET` with an invalid `next`. Same assertions with `reason === "start_invalid_explicit_next"`. Both cases also assert **structurally** that the record carries no `error` key and that `JSON.stringify(record)` does not contain the rejected `next` value (AC-4).

**Concrete failure mode caught:** an emit added to one branch and forgotten on its sibling — the exact drip this arc exists to end. Both cases fail today with **zero** captured records, which is the executable RED; the implementer records that observed-failing run.

**Non-vacuity guard.** `next` must be a value `validateNextParamDetailed` actually rejects, and the case asserts `res.status` before asserting on the sink — otherwise a handler that 500s early would produce zero records and a naive "no wrong record" assertion would pass. Assert the positive (one record, right fields), never merely the absence of a wrong one.

**Implementation.** At both sites, immediately before the existing return, insert the shipped shape from `app/auth/callback/route.ts:226`:

```ts
try {
  await log.warn("next param rejected; redirecting with OAUTH_REDIRECT_INVALID", {
    source: "auth.callback",
    code: "OAUTH_REDIRECT_INVALID",
    reason: "callback_invalid_explicit_next",
  });
} catch {
  /* best-effort */
}
```

`source` is `"auth.callback"` for site 1 and `"api.auth.googleStart"` for site 2. **Site 2 also adds `import { log } from "@/lib/log";`** — the only import change in the arc. Nothing else at either site moves: the `signInRedirect` call, its arguments, and `clearPkceVerifierCookies` (site 1) stay exactly as they are.

**Do NOT** pass the rejected `next` value, or any value derived from it, in any field (AC-4; spec §2.1 and documented limit §5.2).

## Task 2 — sites 3-5: the three picker-bootstrap branches

<!-- task: red=`pnpm vitest run tests/auth/oauthRedirectInvalidTelemetry.test.ts` ac=AC-1,AC-2,AC-4 -->

**RED.** Three cases in the same suite, each forced down its own branch of `app/api/auth/picker-bootstrap/route.ts`:

| Case | Input that reaches it | Asserted `reason` |
| --- | --- | --- |
| `app/api/auth/picker-bootstrap/route.ts:162` | a `next` `validateNextParamDetailed` rejects — **or an absent `next`**, since this site carries no `rawNext !== null` guard | `bootstrap_next_rejected` |
| `app/api/auth/picker-bootstrap/route.ts:165` | a `next` that validates but `parseNextPath` cannot split into slug + share token | `bootstrap_unparsable_next` |
| `app/api/auth/picker-bootstrap/route.ts:176` (a) | a well-formed tokenized `next` whose `t` intent fails `verifyPickerIntent` — absent, malformed, bad signature, or **expired** | `bootstrap_intent_unverified` |
| `app/api/auth/picker-bootstrap/route.ts:176` (b) | a well-formed tokenized `next` with a VERIFIED intent naming a different slug or share token | `bootstrap_intent_target_mismatch` |

Each asserts one record, `level === "warn"`, `code === "OAUTH_REDIRECT_INVALID"`, its own `reason`, **and** `res.status === 403`, plus the same structural no-`error`/no-raw-`next` assertions as Task 1.

**Concrete failure mode caught:** all four branches collapsed onto one emit, or a single emit hoisted above the branches — which would make `reason` a constant and the whole discrimination in spec §1.1 item 2 a fiction. Because each case asserts a *different* `reason`, a hoisted constant can match at most one case and **fails the other three**. Stated precisely: no single hoist fails all four, but the suite rejects every possible hoist, which is the property that matters. That is the specific reason these are four separate cases and not one parameterized case over a shared expectation.

**Case (b) is the one worth getting right.** It needs a VERIFIED intent that names a different target, so it must sign a real intent with the route's signing key rather than passing a bogus `t`. If it instead passes an unverifiable token it silently becomes a duplicate of case (a) and the `bootstrap_intent_target_mismatch` branch ships untested. The implementer asserts, via `premise`, that `verifyPickerIntent` returns non-null for the token the case constructs — that premise is what separates (b) from (a).

**Premise (anti-tautology).** Case `app/api/auth/picker-bootstrap/route.ts:165` is the other fragile one: it needs a `next` that **passes** `validateNextParamDetailed` and **fails** `parseNextPath`. If no such value exists the case silently drifts into re-testing `app/api/auth/picker-bootstrap/route.ts:162`. The implementer states that premise executably with `premise`/`premiseHolds` from `tests/_shared/premise.ts` — assert `validateNextParamDetailed(value).ok === true` immediately above the case's action, so a value that stops satisfying it fails by name instead of passing at the wrong branch. Both this premise and case (b)'s are asserted at case top level, never inside a `.each` callback.

**Implementation.** Same shape as Task 1, `source: "api.auth.pickerBootstrap"`, at all three sites. The route already wraps its handler in `runWithRequestContext` (`app/api/auth/picker-bootstrap/route.ts:159`), so these three records carry a real `requestId` — unlike Task 1's two, per documented limit §5.3. Do not add the wrapper to the other two routes; that is out of scope.

## Task 3 — onboarding: reason discriminator and emit

<!-- task: red=`pnpm vitest run tests/components/admin/OnboardingWizard.test.tsx` ac=AC-3,AC-5 -->

**RED.** Extend `tests/components/admin/OnboardingWizard.test.tsx`. The three shipped cases at `tests/components/admin/OnboardingWizard.test.tsx:203`, `tests/components/admin/OnboardingWizard.test.tsx:220` and `tests/components/admin/OnboardingWizard.test.tsx:232` already construct the three distinct broken environments (unset, malformed JSON, missing `client_email`) — the cheapest non-vacuous oracle available, because the environments exist and are already known-distinct. Each gains a `setLogSink` capture asserting one record with `code === "ONBOARDING_OPERATOR_ERROR"`, `level === "error"`, and its own `reason`: `env_missing`, `json_malformed`, `client_email_missing` respectively.

**Their existing render assertions stay byte-identical** — that is the executable form of AC-5 and of the `impeccable-gate: N/A` determination. If a render assertion needs editing, stop: the determination is void.

**Concrete failure mode caught:** the wizard emitting a single undifferentiated code, or `reason` wired to a literal instead of the resolver's result. Three distinct expected values across three environments means a hardcoded `reason` fails twice.

**Implementation, two parts.**

*Part 1 — widen the result type* in `components/admin/OnboardingWizard.tsx`:

```ts
type ServiceAccountFailureReason = "env_missing" | "json_malformed" | "client_email_missing";
type ServiceAccountResult = { ok: true; email: string } | { ok: false; reason: ServiceAccountFailureReason };
```

and name the reason at each of the three `return { ok: false }` sites (`components/admin/OnboardingWizard.tsx:75` → `env_missing`, `components/admin/OnboardingWizard.tsx:80` → `client_email_missing`, `components/admin/OnboardingWizard.tsx:82` catch → `json_malformed`). `readServiceAccountEmail` stays **synchronous and pure** — it gains a discriminator, not an emit. It is module-private with exactly one caller, so this widening carries no blast radius (contrast the validator, deliberately untouched per spec §1.1 item 3).

*Part 2 — one emit* in the async component body, guarded by `!service.ok`, before the return:

```ts
if (!service.ok) {
  try {
    await log.error("service-account credentials unusable; onboarding wizard blocked", {
      source: "admin.onboardingWizard",
      code: "ONBOARDING_OPERATOR_ERROR",
      reason: service.reason,
    });
  } catch {
    /* best-effort */
  }
}
```

`reason` is read from `service.reason` — never re-derived, so the emit cannot disagree with the branch that produced it. `components/admin/OnboardingWizard.tsx` gains `import { log } from "@/lib/log";`.

## Task 4 — the secrets guard, proven by mutation

<!-- task: red=`pnpm vitest run tests/components/admin/OnboardingWizard.test.tsx` ac=AC-4 -->

**This task has no natural RED, and that is stated rather than glossed.** Before Task 3 the captured record array is empty, so every negative assertion passes vacuously; after Task 3 the shipped emit is already safe, so they pass legitimately. Claiming a RED on either basis would be exactly the tautology this project's rules exist to stop. Task 4 is a **regression guard**, and its RED is obtained by mutation.

**Assertions — structural first, content second.** For each case, every captured record must satisfy:

1. `record.context.error === undefined` — **the load-bearing assertion.** The §2.2 prohibition is specifically on attaching the `JSON.parse` error, and a V8 parse message such as `Expected double-quoted property name in JSON at position 38` contains neither a sentinel nor `private_key`. Content matching alone would let the exact forbidden regression ship green. `serializeError` persists `name`, `message` and `stack`, so the only safe rule is that no `error` key exists at all.
2. `JSON.stringify(records)` contains neither the sentinel nor the substring `private_key` — the backstop for a leak arriving by some other field.

**Two cases**, both with `GOOGLE_SERVICE_ACCOUNT_JSON` carrying a sentinel that could only have come from the env var (e.g. `"SENTINEL-PRIVATE-KEY-DO-NOT-LOG"`): one well-formed but missing `client_email`, one malformed so the parse-error path is exercised.

**Observed-RED protocol (this is the task's actual red step).** After Task 3 is green: temporarily add `error` — the caught `JSON.parse` error — to the wizard emit in the working tree; run this suite; **observe it FAIL** on assertion 1; revert the mutant; observe it pass. The mutant is never committed. The commit message and PR body record both observations with their output. A green claimed without that observation is not evidence the guard works.

**Premise (mandatory).** The assertions rest on two conditions, both stated via `premise`/`premiseHolds` from `tests/_shared/premise.ts` immediately above the negative assertion:

- `process.env.GOOGLE_SERVICE_ACCOUNT_JSON` contains the sentinel, **and**
- `records.length > 0`.

The second is the one that matters: without it, a case whose env setup or sink capture silently failed passes by finding nothing in an empty array — the exact "expected value read from the same degenerate source as the actual" shape the anti-tautology rule names. Both execute unconditionally at case top level, never inside a callback whose iteration count could be zero.

## Task 5 — archive the ledger entries and clear the markers

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-6 -->

**This is the PR's last commit.** Move both `BL-OPS-LOG-OAUTH-EMITS` and `BL-OPS-LOG-ONBOARDING-EMIT` from `BACKLOG.md` to `BACKLOG-archive.md` with full provenance, preserving the L-wave decomposition record each entry carries and adding what shipped. The `**Status:** IN PROGRESS · **Branch:** feat/ops-log-code-emits` field comes off **in this same commit** — archives categorically reject in-progress entries, so the marker cannot ride along, and a marker that reaches `main` names a branch the merge just deleted and fails the origin-existence rule there (invariant 12).

**RED.** `tests/docs/_metaLedgerInProgress.test.ts` is the executable gate and it has already demonstrated it discriminates on this branch: it failed before the markers were pushed (branch absent from origin) and passed after. Task 5's green is that suite plus `pnpm vitest run tests/docs` for the archive-shape guards.

**Archive body records**, so a later reader does not re-derive them: the persisted-code fork and why the forensic-code precedent did not generalize (spec §1.1 item 2), and that the validator's internal opacity was deliberately left in place (documented limit §5.1).

<!-- tasks: end -->

## Close-out

1. `pnpm typecheck` and `pnpm lint` clean.
2. Full local suite green; at minimum the four touched/created suites plus `tests/docs`.
3. `pnpm spec:lint` clean on both the spec and this plan.
4. Whole-diff cross-model review to APPROVE.
5. Real CI green — not just local — then `gh pr merge --merge`, then verify `git rev-list --left-right --count main...origin/main` is `0  0`.

**Deliberately NOT in this arc**, each with its resolution: widening `ValidateNextParamOutcome` (spec §1.1 item 3, limit §5.1); adding `runWithRequestContext` to the two `auth.*` routes (limit §5.3); any dedup or rate limit (spec §1.1 item 6); any §12.4 catalog edit (spec §1.1 item 5); `BL-OPS-LOG-DASHBOARD-BANNER`, the third L-wave sibling, which is design-gated Opus/UI work and is not claimed by this branch.
