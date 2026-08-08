# Cluster E — durable `code:` emits for the OAuth-redirect and onboarding-operator failures

**Date:** 2026-08-07 · **Branch:** `feat/ops-log-code-emits` · **Status:** spec-DRAFT

## §0 Why this arc exists, and its scope

Two S-tier OBSERVABILITY entries with one shape: a user-visible failure surface that leaves **no durable row**, fixed by adding a `code:`-carrying emit at a sink that already exists. Six call sites across three GET route handlers and one server component. No UI, no migration, no advisory lock, no new error code, no schema change.

Claimed entries (invariant 12, marked on this branch at `BACKLOG.md` §`BL-OPS-LOG-OAUTH-EMITS` / §`BL-OPS-LOG-ONBOARDING-EMIT`, commit `docs(plan): mark the Cluster E telemetry ledger rows in progress`):

1. `BL-OPS-LOG-OAUTH-EMITS` — five `OAUTH_REDIRECT_INVALID` branches across three GET routes emit nothing.
2. `BL-OPS-LOG-ONBOARDING-EMIT` — `ONBOARDING_OPERATOR_ERROR` is render-only; no producer anywhere.

**The operator consequence, stated once.** Both surfaces already tell a *human* what happened — a sign-in redirect carrying an error code, a "Setup is paused" card. Neither tells the *system*. A support conversation about either ("Doug says setup is stuck", "a crew member says the link bounced them") has nothing to look at, and no way to tell one occurrence from a hundred. This arc closes that and nothing else: it changes no status code, no redirect target, no rendered copy, and no control flow.

Every code claim below was grep-verified against the live tree at `61281c23e` on 2026-08-07 (pre-draft citation pass, §6). Anchors are file + symbol; line numbers are drafting-time locators.

## §1.1 Resolved scope — do not relitigate

Ratified by the ledger entry bodies (`BACKLOG.md`, filed 2026-08-06) and the arc kickoff unless another source is cited. Each item cites what settles it so a reviewer verifies rather than re-derives.

1. **Neither surface incurs an invariant-10 registry obligation, and no `AUDITABLE_MUTATIONS` row is created.** All three routes are **GET** handlers — `app/auth/callback/route.ts:178`, `app/api/auth/google/start/route.ts:36`, `app/api/auth/picker-bootstrap/route.ts:158` — and invariant 10's mutation-surface scope is POST/PUT/PATCH/DELETE only (`tests/log/_metaMutationSurfaceObservability.test.ts`; every method fixture in that suite is POST or DELETE — see `tests/log/_metaMutationSurfaceObservability.test.ts:634`). The onboarding producer is a **render path** in a server component, not a route handler and not a `"use server"` action. Both ledger entries state this explicitly and in the same words ("No registry obligation, and this is stated so implementation does not invent one"). **Invariant 10 is the source of the emit *shape* this arc copies — a durable `code:` field on a `log.*` call — not the rule that obligates it.** Do not propose a registry row, an `ADMIN_SURFACE_EXEMPTIONS` entry, a `KNOWN_UNINSTRUMENTED` row, or a `// no-telemetry:` comment for any site in this arc; all four are the wrong instrument for a surface outside the contract's scope.

2. **The persisted code is `OAUTH_REDIRECT_INVALID` itself, with a `reason` context field discriminating the branch — not five new forensic code strings.** The competing precedent is real and is addressed rather than ignored: the adjacent shipped emits at `app/auth/callback/route.ts:227` and `app/auth/callback/route.ts:243` persist `OAUTH_EXCHANGE_THREW` / `OAUTH_EXCHANGE_REJECTED`, codes that deliberately differ from the `OAUTH_STATE_INVALID` the user receives, and neither appears in the §12.4 catalog (grep over `lib/messages/` returns nothing for `OAUTH_EXCHANGE_REJECTED`). That precedent is correct **for its case and does not generalize to this one**: there the internal event is an upstream Auth API failure and the user-facing code is a *translation* of it, so a distinct code names a genuinely distinct proposition. Here the internal event and the user-facing code assert the *same* proposition — the redirect target was invalid — so persisting `OAUTH_REDIRECT_INVALID` is faithful rather than a category error, and it is what makes the ledger's actual complaint ("`OAUTH_REDIRECT_INVALID` is never a persisted `code:` anywhere") false going forward. Per-branch discrimination is preserved by `reason`, not surrendered. `app_events.code` is a bare `text` column with no CHECK and no FK to the catalog (`supabase/migrations/20260629000002_app_events.sql:9`), so neither choice is schema-constrained; this is a readability decision, settled here.

3. **`ValidateNextParamOutcome` is NOT widened with a rejection-reason field.** `validateNextParamDetailed` returns the identical opaque `{ ok: false, path: DEFAULT_AUTH_NEXT_PATH, code: "OAUTH_REDIRECT_INVALID" }` from **five** distinct rejection paths (`lib/auth/validateNextParam.ts:45` non-string/blank, `lib/auth/validateNextParam.ts:50` control chars / backslash / encoded dot-dot, `lib/auth/validateNextParam.ts:58` URL parse throw, `lib/auth/validateNextParam.ts:62` cross-origin, `lib/auth/validateNextParam.ts:67` bootstrap-surface or non-allow-listed path). Distinguishing *those* would require changing the return type of a security-sensitive primitive shared by every auth entry point — a blast radius this S-effort observability arc does not carry, and a change that would want its own review of the allow-list semantics. **The `reason` field in item 2 therefore discriminates the CALL SITE (which of the five OAuth branches fired — six reason values, since site 5 splits on whether the intent verified, §2.1), not the validator's internal cause.** This is a deliberate resolution bound, recorded as documented limit §5.1 with the follow-on filing named there. Do not raise the validator's internal opacity as a finding against this arc.

4. **Level is `warn` for the five OAuth-redirect sites and `error` for the onboarding site.** The asymmetry is intentional and is the point: a rejected `next` param is *client-supplied input being correctly refused* — expected noise on a public auth endpoint, including from scanners — so `error` would pollute error-severity telemetry with routine traffic. An unparseable `GOOGLE_SERVICE_ACCOUNT_JSON` is an *operator misconfiguration that blocks onboarding entirely* and is genuinely actionable. Durability is identical either way: `shouldPersist` returns `true` unconditionally for both `warn` and `error` (`lib/log/logger.ts`, `if (level === "error" || level === "warn") return true;`), so the choice costs no observability. `info` is rejected for both despite also persisting when a code is present — it would misreport a refusal as routine.

5. **No §12.4 catalog edits, no `pnpm gen:spec-codes` regeneration, no three-way lockstep.** Both codes already exist as catalog rows — `OAUTH_REDIRECT_INVALID` at `lib/messages/catalog.ts:2614` and `ONBOARDING_OPERATOR_ERROR` at `lib/messages/catalog.ts:2141`, each with a generated counterpart at `lib/messages/__generated__/spec-codes.ts:677` and `lib/messages/__generated__/spec-codes.ts:725`. This arc introduces **zero** new codes and edits **zero** catalog rows, so the §12.4 lockstep rule (spec prose + `gen:spec-codes` + `catalog.ts` in one commit) has no cell to fill and the `x1-catalog-parity` gate is untouched. If review forces a new forensic code, the lockstep applies in full and the arc grows a task — but item 2 resolves that it does not.

6. **Emits are per-occurrence with no deduplication, suppression, or rate limit.** Each is a real operator-facing failure event and the volume is bounded by human-scale traffic: page loads for the onboarding card, auth attempts for the redirect refusals. A dedup cache in a server component or a route module is per-instance and unreliable under serverless scale-out, so it would produce an *inconsistent* record rather than a smaller one — strictly worse for a support conversation than an honest duplicate. Do not raise "this could flood `app_events`" as a finding without a probe per the admissibility contract; the conservative worst case is duplicate rows in an append-only telemetry table that already accepts every `warn`/`error` unconditionally.

7. **Autonomy: both user review gates (spec, plan) are WAIVED** (user grant 2026-08-07, arc kickoff). Stop only for a genuinely new question.

8. **All AGENTS.md invariants bind.** `impeccable-gate: N/A — no UI surface` — see §4 for why the one `components/` file this arc touches is not a UI change.

## §2 Per-surface contracts

### §2.1 `BL-OPS-LOG-OAUTH-EMITS` — five emit-less `OAUTH_REDIRECT_INVALID` branches

**The five sites, each verified live 2026-08-07.** Every one returns a refusal to the user and writes nothing:

| # | Site | Shipped call | Branch meaning (`reason` value) |
|---|---|---|---|
| 1 | `app/auth/callback/route.ts:258` | `signInRedirect(request, "OAUTH_REDIRECT_INVALID", nextOutcome.path)` | `callback_invalid_explicit_next` — post-exchange, the caller supplied an **explicit** `next` that failed validation (`hasInvalidExplicitNext`, `app/auth/callback/route.ts:181`, which requires `rawNext !== null`) |
| 2 | `app/api/auth/google/start/route.ts:40` | `signInRedirect(request, "OAUTH_REDIRECT_INVALID", nextOutcome.path)` | `start_invalid_explicit_next` — same guard shape, `rawNext !== null` at `app/api/auth/google/start/route.ts:39`; an absent `next` does NOT reach here |
| 3 | `app/api/auth/picker-bootstrap/route.ts:162` | `htmlResponse("OAUTH_REDIRECT_INVALID", 403)` | `bootstrap_next_rejected` — `validateNextParamDetailed` refused. **Carries no `rawNext !== null` guard**, unlike sites 1-2, so an ABSENT `next` also lands here; the reason is worded to stay true of both |
| 4 | `app/api/auth/picker-bootstrap/route.ts:165` | `htmlResponse("OAUTH_REDIRECT_INVALID", 403)` | `bootstrap_unparsable_next` — validation passed but `parseNextPath` could not split slug/token |
| 5a | `app/api/auth/picker-bootstrap/route.ts:176` | `htmlResponse("OAUTH_REDIRECT_INVALID", 403)` | `bootstrap_intent_unverified` — `verifyPickerIntent` returned `null` |
| 5b | `app/api/auth/picker-bootstrap/route.ts:176` | `htmlResponse("OAUTH_REDIRECT_INVALID", 403)` | `bootstrap_intent_target_mismatch` — an intent VERIFIED, but its `slug`/`shareToken` disagree with the parsed `next` |

**Why site 5 carries two reasons — a single label there would be untruthful.** The shipped guard is one condition with three disjuncts, `if (!intent || intent.slug !== parsedNext.slug || intent.shareToken !== parsedNext.shareToken)`, and the first disjunct is not one cause but eight: `verifyPickerIntent` (`lib/auth/picker/intentToken.ts`) returns `null` at `lib/auth/picker/intentToken.ts:46` (absent/empty `t`), `lib/auth/picker/intentToken.ts:48` (not two dot-separated parts), `lib/auth/picker/intentToken.ts:51` and `lib/auth/picker/intentToken.ts:53` (signature length or timing-safe comparison mismatch), `lib/auth/picker/intentToken.ts:55` and `lib/auth/picker/intentToken.ts:62` (decode or `JSON.parse` threw), `lib/auth/picker/intentToken.ts:65` (payload shape invalid), and `lib/auth/picker/intentToken.ts:69` (**expired**). Labelling all of that `bootstrap_intent_mismatch` would be actively misleading in the most common benign case — an operator reading "mismatch" on a crew member who simply sat on the page past `exp` would investigate tampering that never happened. Splitting on `!intent` costs nothing (the disjunct is already evaluated) and makes both labels true: `bootstrap_intent_unverified` says only what is known, and `bootstrap_intent_target_mismatch` is asserted **only** when an intent verified and then disagreed — the one case that genuinely suggests a forged or stale link. The eight causes behind `bootstrap_intent_unverified` stay collapsed, because `verifyPickerIntent` returns a bare `null`; that is documented limit §5.6, not a defect, and "could not verify" is true of all eight.

So the arc has **five call sites and six OAuth reason values** (site 5 emits one of two), plus four onboarding reasons in §2.2 — ten reason values in total across six emit sites.

**The emit shape**, copied from the shipped pattern at `app/auth/callback/route.ts:226-235` — a `try`/`catch` wrapper so a telemetry fault can never escape over the caller (invariant 9's "logging must never throw over the caller"), placed **immediately before** the return so the refusal path is unchanged:

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

`source` follows the shipped per-route convention exactly: `"auth.callback"` (already used at ten emit sites on that route, first at `app/auth/callback/route.ts:89`), `"api.auth.pickerBootstrap"` (already at `app/api/auth/picker-bootstrap/route.ts:100`), and `"api.auth.googleStart"` for the third route, which today has **no** `log` import at all and gains one (`import { log } from "@/lib/log";`). That is one of the arc's **two** import additions; the other is the same import in `components/admin/OnboardingWizard.tsx` for the §2.2 emit. No other import anywhere changes.

**No emit carries the raw `next` value.** The rejected `next` is attacker-controlled text of unbounded length that can embed a URL, a token-shaped string, or a control character, and `sanitizeContext` redacts emails but is not a general-purpose sanitizer for adversarial input. `reason` names the branch; nothing derived from the input is persisted. This is a deliberate fidelity/safety trade recorded as documented limit §5.2.

**Post-commit placement is satisfied vacuously**, and the plan states so rather than leaving it unstated: none of the five sites opens a transaction, acquires an advisory lock, or writes to any table, so there is no commit boundary to be outside of and invariant 2 has no surface here.

### §2.2 `BL-OPS-LOG-ONBOARDING-EMIT` — the render-only operator error

**Current state, verified.** `readServiceAccountEmail()` (`components/admin/OnboardingWizard.tsx:73`) returns the bare `{ ok: false }` from **four** distinguishable failure conditions, and `ServiceAccountResult` (`components/admin/OnboardingWizard.tsx:71`) carries no discriminator:

| Condition | `reason` |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` unset or empty (`""` included) | `env_missing` |
| `JSON.parse` threw — the value is not valid JSON | `json_malformed` |
| parsed to `null`, to an array, or to a non-object primitive (number, string, boolean) | `json_not_an_object` |
| parsed to an object, but `client_email` is absent, non-string, or empty | `client_email_missing` |

**The shipped `try` block is too wide to key reasons off as written, and the resolver must be restructured — probed, not assumed.** `readServiceAccountEmail` wraps BOTH the `JSON.parse` and the subsequent `parsed.client_email` access in one `try` (`components/admin/OnboardingWizard.tsx:77`), so a value that parses *successfully* to `null` throws a `TypeError` on the property access and lands in the `catch`. Naming that catch `json_malformed` would assert that parsing failed when it demonstrably succeeded:

```text
$ node -e '<replay the shipped parse/property-access sequence>'
{"raw":"null","parseOk":true,"branch":"catch=>json_malformed (TypeError)"}
{"raw":"{not-valid-json","parseOk":false,"branch":"catch=>json_malformed (SyntaxError)"}
{"raw":"{}","parseOk":true,"branch":"client_email_missing"}
{"raw":"123","parseOk":true,"branch":"client_email_missing"}
{"raw":"[]","parseOk":true,"branch":"client_email_missing"}
```

`null` is the only value reaching the catch with `parseOk: true` — numbers, strings and arrays all yield `undefined` on the property read without throwing. So the `try` narrows to the parse alone and the shape check becomes an explicit branch, which is what makes all four labels true. **The shape check must reject arrays explicitly**, since `typeof [] === "object"` and `[] !== null`: a `typeof`/`null` test alone routes `[]` to `client_email_missing`, which would assert that an object was supplied and merely lacked a field. `Array.isArray` is the third disjunct, and the guard therefore has three: `parsed === null`, `Array.isArray(parsed)`, and `typeof parsed !== "object"` (numbers, strings, booleans). **One input per disjunct** — `"null"`, `"[]"`, `"123"` — or a disjunct ships unproven and deleting it leaves every case green. Rounds 3 and 4 each caught one uncovered disjunct here, which is why the plan pins the mapping in a table rather than in prose. **This is a behavior-preserving restructure:** every input that returns `{ ok: false }` today still returns `{ ok: false }`, and every `{ ok: true }` still does; only the label differs. Rendered output is unchanged, so §4's `impeccable-gate` determination is untouched.

The component body calls it once (`components/admin/OnboardingWizard.tsx:576`, `const service = readServiceAccountEmail()`) and renders `<OperatorErrorBlock />` (defined `components/admin/OnboardingWizard.tsx:547`, mounted `components/admin/OnboardingWizard.tsx:665`) whenever `service.ok` is false. **These causes are operationally very different** — a missing deploy secret, a corrupted paste, a wrong-shaped key file — and today they are indistinguishable from both the operator's view (identical copy) and the system's (no row at all). Discriminating them is the substance of this half of the arc.

**The change, in two parts.**

*Part 1 — widen the result type at the source.* `ServiceAccountResult` becomes `{ ok: true; email: string } | { ok: false; reason: ServiceAccountFailureReason }` with `type ServiceAccountFailureReason = "env_missing" | "json_malformed" | "json_not_an_object" | "client_email_missing"`, and each failure branch names its reason. `readServiceAccountEmail` stays **synchronous and pure** — it gains a discriminator, not an emit. Unlike item 3's validator, this is a module-private function with exactly one caller (`components/admin/OnboardingWizard.tsx:576`; grep for `readServiceAccountEmail` returns only the definition and that call), so widening it carries no blast radius.

*Part 2 — emit at the render decision.* In the async component body, guarded by `!service.ok`, one emit before the return:

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

`OnboardingWizard` is already an **async server component** (`export async function OnboardingWizard`, `components/admin/OnboardingWizard.tsx:571`) with no `"use client"` directive and server-only imports including `createSupabaseServerClient` (`components/admin/OnboardingWizard.tsx:36`), so `await log.error(...)` is available in its body — the emit does **not** require a client/server boundary change, a new server action, or a `useEffect`. The resolver stays sync; the single emit site sits where the failure becomes user-visible.

**Secrets contract — the load-bearing constraint on this surface.** `GOOGLE_SERVICE_ACCOUNT_JSON` holds a service-account **private key**. The emit therefore carries the `reason` enum and nothing else derived from the environment variable. Specifically forbidden, each because it is a real leak vector rather than a hypothetical one:

- the raw value, in whole or in part, including any length or prefix/suffix of it;
- the parsed object or any field of it (`private_key` most obviously, but `client_email` is also not needed on a failure path);
- **the `JSON.parse` error**, whose V8 message embeds a snippet of the offending input (`Unexpected token } in JSON at position N`, and position-adjacent content in newer formulations) — this is why Part 1 discards the caught error rather than passing it as `error:`, and why the shipped `catch {}` at `components/admin/OnboardingWizard.tsx:82` stays parameterless.

Note the asymmetry with the OAuth sites deliberately: those pass no `error` because there is none, this one passes no `error` because it **must not**. A test pins the negative directly (§3, Task 4).

## §3 TDD task contract

Five tasks, each with an executable RED before implementation, per invariant 1. Every task states the concrete failure mode it catches, per the anti-tautology rule. Archiving the two ledger entries and clearing their in-progress markers is a **close-out step, not a task** — it is bookkeeping with no executable RED, and the plan does not pretend otherwise (R2 finding 3).

**Test template of record.** `tests/auth/callback-oauth-telemetry.test.ts` is the shipped analog and covers the very route site 1 lives on: it drives the real `GET` through a `withCapture` helper that calls `setLogSink` to collect `LogRecord[]` (`tests/auth/callback-oauth-telemetry.test.ts:34-49`), then filters on `r.code`. New OAuth tests follow that exact structure — a real handler invocation with a captured sink, never a spy on `log.warn` itself, so a test cannot pass against an emit that is built but never reaches the sink.

| Task | RED | Catches |
|---|---|---|
| 1 | A new suite, tests/auth/oauthRedirectInvalidTelemetry.test.ts — drive each of sites 1-2 through its real GET with a captured sink; assert exactly one record with `code === "OAUTH_REDIRECT_INVALID"`, `level === "warn"`, the site's `reason`, the unchanged response status, and — the §2.1 no-raw-input rule, asserted as the same WHOLE-RECORD accept-set Task 4 uses — the record matched against an exact expected object over all nine persisted fields, so the rejected `next` cannot surface in `context`, in `message`, or in any promoted column such as `source`. | An emit added to one branch and forgotten on the sibling — the exact drip this arc exists to end. Fails today with zero records. |
| 2 | Same file, picker-bootstrap sites 3, 4, 5a and 5b — four cases, each forced down its own branch (rejected/absent `next`; valid-but-unparsable `next`; unverifiable intent; verified intent pointing elsewhere). | All four collapsed onto one emit, or a shared emit hoisted above the branches — which would make `reason` a constant and the discrimination in item 2 a fiction. Each case asserts a DIFFERENT `reason`, so a hoisted constant can match at most one case and **fails the other three**; the suite rejects every hoist, though no single hoist fails all four. |
| 3 | `tests/components/admin/OnboardingWizard.test.tsx` (extend), every case asserting the same whole-record accept-set as Tasks 1-2 — the three existing operator-error cases at `tests/components/admin/OnboardingWizard.test.tsx:203`, `tests/components/admin/OnboardingWizard.test.tsx:220` and `tests/components/admin/OnboardingWizard.test.tsx:232` already construct three of the failure environments and each gains a captured-sink assertion over all nine persisted fields with its distinct `reason`; **three more are added** for `json_not_an_object`, one per disjunct of its guard — six cases over four reason values. | The wizard emitting a single undifferentiated code, `reason` wired to a literal, or `json_malformed` claimed for a value that parsed. Three environments are already built and distinct, the cheapest non-vacuous oracle available; the three added ones each turn exactly one guard disjunct red. Applying the accept-set to EVERY case, not just Task 4's two, is deliberate: R7 found that asserting only `code`/`level`/`reason` here left the `env_missing` and `json_not_an_object` branches able to persist secret material through a branch-specific widening. |
| 4 | Same file — a **whole-record accept-set** case (the shared shape, referenced never restated): with `GOOGLE_SERVICE_ACCOUNT_JSON` set to a sentinel-bearing value (once well-formed, once malformed), assert the captured `LogRecord` against an exact expected object covering **every field the sink persists** — `level`, `source`, `message`, `code`, `requestId`, `showId`, `driveFileId`, `actorHash` and `context` — with `Object.keys(record.context)` deep-equal to `["reason"]`. Content checks (no sentinel, no `private_key`) are a backstop only. | The §2.2 secrets contract regressing. **Two successive review rounds broke a narrower guard, and the accept-set is scoped to the persisted row for that reason.** R2 broke a denylist ("no `error` key, no sentinel") with a parse message relocated to `record.message` and with a partial key fragment. R3 then broke a context-only accept-set: `buildRecord` PROMOTES `source`, `requestId`, `showId`, `driveFileId` and `actorHash` out of `context` onto the record (`lib/log/logger.ts`), and `persistAppEvent` writes each as its own `app_events` column (`lib/log/persist.ts:16`) — so a fragment placed in `source` passed every promised check. The accept-set must therefore span exactly the nine persisted columns; anything less leaves a channel. The persisted row has three channel families — context, message, promoted columns — and the mutation protocol crosses them with four mutants, two in context for different reasons; each was chosen because it defeated a previous guard shape or fixture. **Every field in the expected object must be a fixed literal**, `requestId` included: it derives from an `x-vercel-id` header falling back to a random UUID (`lib/log/requestContext.ts:25`), so an oracle read back from the record would admit a mutant assigning it derived text. |
| 5 | Same suites — one case per emit site (six) installing a sink that THROWS, asserting the refusal is completely unchanged: same status, `Location`, PKCE `Set-Cookie`, and for the wizard that `wizard-operator-error` still renders. | The `try`/`catch` wrapper being omitted or later removed. Against a rejecting sink an unwrapped emit turns a cataloged refusal into an unhandled rejection on a public auth endpoint — strictly worse than the missing telemetry this arc set out to fix. Nothing else in the plan tests this: R7 found that deleting all six wrappers left every other assertion green. Needs a CODE-SPECIFIC premise — that the sink saw a record carrying THIS site's `code` and `reason`, not merely that it was entered: `stampOauthClaim` emits before site 1's branch (`app/auth/callback/route.ts:255`), so a generic entered-flag is already true there whether or not the new emit exists. Like Task 4 it starts green (the wrappers land in Tasks 1-3), so its RED is obtained per site by removing that site's wrapper and observing the refusal collapse into an unhandled rejection. |

**Task 4 is a regression guard whose RED is mutation-induced, and this is stated rather than glossed.** Unlike Tasks 1-3 it has no natural failing state: before Task 3 the record array is empty so every negative assertion passes vacuously, and after Task 3 the shipped emit is already safe so they pass legitimately. A "RED" claimed on that basis would be exactly the tautology this project's rules exist to stop. Its RED is therefore **observed by mutation**, on the arc-c protocol: after Task 3 is green, run FOUR mutants in the working tree — observing each FAIL and reverting it: (a) bind and attach the caught error, breaking the `context` key set; (b) interpolate a fragment of the raw env value into the message literal; (c) derive `source` from that fragment; (d) attach the raw `client_email`. The persisted row has THREE channel families — `context`, `message`, promoted columns — and four mutants cross them, (a) and (d) both landing in `context` for different reasons. **Mutants (a) and (d) require a two-line widening of the resolver's failure result**, because neither the caught error nor the parsed object is in scope at the emit site; that widening is exactly the regression being guarded against, so including it is faithful. Each is represented because each defeated a previous guard shape or fixture — (b) the R2 denylist, (c) the R3 context-only accept-set, (d) the R5 fixture that omitted `client_email` entirely and so could not distinguish the mutant from safe code. **The fixture reaching `client_email_missing` must therefore carry a PRESENT, non-string, secret-bearing `client_email`**, not an absent one: the logger drops `undefined`, so an absent field makes mutant (d) invisible. No mutant is committed; the task record states all four observations with their output. That is what makes the guard non-vacuous.

**Premise (writing-plans anti-tautology rule).** Task 4's assertions rest on two conditions, and BOTH are stated executably with `premise`/`premiseHolds` from `tests/_shared/premise.ts`, immediately above the negative assertion: the sentinel is present in the environment the component reads, **and `records.length > 0`**. The second is the one that matters — without it a test whose env setup or capture silently failed passes by finding nothing in an empty array, precisely the "expected value read from the same degenerate source as the actual" shape the rule names. Both execute unconditionally at case top level, never inside a callback whose iteration count could be zero.

**Meta-test inventory (mandatory declaration).** This arc **creates no new structural meta-test and extends none**. Justification, stated so the omission is a decision rather than an oversight: the candidate registries do not reach these surfaces — `tests/log/_metaMutationSurfaceObservability.test.ts` is scoped to mutating methods and admin routes (§1.1 item 1), `tests/auth/_metaInfraContract.test.ts` covers Supabase call boundaries and this arc adds no Supabase call, `tests/auth/advisoryLockRpcDeadlock.test.ts` covers lock topology and this arc takes no lock, and `tests/messages/_metaAdminAlertCatalog.test.ts` covers `admin_alerts` upserts, which this arc does not perform. The behavioral tests in Tasks 1-5 are the whole defense, and they are per-branch rather than per-file precisely because no structural guard is claiming that ground.

## §4 Transition Inventory · Dimensional Invariants · UI-surface determination

**Transition Inventory: none.** No component gains, loses, or changes a visual state. `OperatorErrorBlock` renders identically before and after — same markup, same copy, same `data-testid="wizard-operator-error"`, same conditional at `components/admin/OnboardingWizard.tsx:663-666`. No `AnimatePresence`, no ternary render change, no conditional block added to any rendered tree.

**Dimensional Invariants: none.** No fixed-dimension parent, no flex/grid child relationship, no layout change of any kind.

**UI-surface determination, and why `impeccable-gate: N/A` is correct despite a `components/` path.** Invariant 8 defines a UI surface partly as "any file under `components/`", and this arc edits `components/admin/OnboardingWizard.tsx` — so the exemption is argued rather than assumed. The edit adds a type discriminator to a module-private helper and one `log.error` call in the component body. It renders no element, changes no class, no token, no copy, and no conditional governing what the operator sees; the three existing render assertions at `tests/components/admin/OnboardingWizard.test.tsx:203-238` pass unmodified, which is the executable form of that claim and is why Task 3 *extends* those cases rather than replacing them. A critique/audit pass has no rendered delta to evaluate. **If implementation finds itself changing any rendered output, this determination is void and the dual gate applies** — that is the tripwire, and it is checkable by the unmodified render assertions.

## §5 Documented limits

Recorded from round 0 per the documented-limits budget. Each is a bounded, surfaced consequence, not a silent one.

**§5.1 — `reason` discriminates the call site, not the validator's internal cause.** All five `validateNextParamDetailed` rejection paths (enumerated in §1.1 item 3, `lib/auth/validateNextParam.ts:43`) collapse into whichever site-level `reason` fired. An operator can tell *where* a refusal happened, not *which validation rule* refused. Resolved deliberately in §1.1 item 3. Worst case: an operator investigating a malformed-link report knows the branch but must reproduce the input to learn the rule — conservative and surfaced, never wrong. If that proves insufficient in practice, the follow-on is a `BL-` entry widening `ValidateNextParamOutcome` with its own review of the allow-list semantics; this arc does not file it speculatively, per the ledger filing bar (no probe, and the worst case is a documented limit rather than a defect).

**§5.2 — no emit carries the rejected `next` value.** Per §2.1. An operator cannot see the exact string refused. Deliberate: the value is attacker-controlled and unbounded, and `sanitizeContext` (`lib/log/sanitize.ts`, applied in `buildRecord`) redacts emails rather than generally neutralizing adversarial text. Worst case: less forensic detail on a refusal that was correctly refused anyway.

**§5.3 — the two `auth.*` route emits carry `requestId: null`.** Neither `app/auth/callback/route.ts` nor `app/api/auth/google/start/route.ts` wraps its handler in `runWithRequestContext` (grep for both `runWithRequestContext` and `deriveRequestId` across the two files returns nothing), so `buildRecord`'s ALS fallback yields `null`. **This is pre-existing and unchanged by this arc**: the shipped `OAUTH_EXCHANGE_REJECTED` emit on that same route has exactly the same property today. Only `app/api/auth/picker-bootstrap/route.ts` wraps (`app/api/auth/picker-bootstrap/route.ts:159`), so sites 3-5 *do* get a correlation id. Adding the wrapper to two security-sensitive auth handlers is out of scope for an S observability arc; recorded here so the asymmetry reads as known rather than accidental.

**§5.4 — duplicate rows under repeated failure.** Per §1.1 item 6: a refreshing operator or a scanner produces one row per occurrence. Bounded by human-scale and request-scale traffic into an append-only table that already persists every `warn`/`error`.

**§5.5 — telemetry faults are swallowed.** Every emit is `try`/`catch`-wrapped and `persistAppEvent` itself swallows write faults by contract (`lib/log/persist.ts:11`, whose `// not-subject-to-meta:` note reasons that a typed infra result would defeat invariant 9's never-throw-over-the-caller contract). A persist outage means these events are lost, not that the user's refusal path breaks. That is the correct trade for both surfaces and is the shipped posture for every emit in the repo; `recordPersistFailure` surfaces the outage itself via `/api/health`.

**§5.6 — the eight `verifyPickerIntent` null causes stay collapsed under one reason.** `bootstrap_intent_unverified` covers absent `t`, malformed structure, signature mismatch, decode/parse throw, invalid payload shape, and expiry alike, because the function returns a bare `null` (`lib/auth/picker/intentToken.ts:46` through `lib/auth/picker/intentToken.ts:69`). Widening its return type is the same class of change §1.1 item 3 declines for the `next` validator, and for the same reason: it is a signature-verification primitive whose contract deserves its own review. Worst case is conservative and truthful — the label claims only that verification failed, never why, and never asserts tampering. Expiry is the likeliest cause and is the one an operator would most want separated; if that proves to matter in practice the follow-on is a `BL-` entry, not filed speculatively here per the ledger filing bar.

## §6 Pre-draft verification transcript

Citation-grep pass run 2026-08-07 against the live tree at `61281c23e` before drafting, per the mandatory live-code citation rule. Every claim below was confirmed, and the two that did **not** match the brief as received are recorded rather than quietly corrected:

- Five `OAUTH_REDIRECT_INVALID` call sites — confirmed at all five cited locators.
- `ONBOARDING_OPERATOR_ERROR` producer absence — confirmed: outside `lib/messages/**` and tests, the only hits are the render site (`components/admin/OnboardingWizard.tsx:548`) and the file's header comment (`components/admin/OnboardingWizard.tsx:15-16`). No `log.*` emit exists.
- Catalog rows for both codes — confirmed at `lib/messages/catalog.ts:2614` and `lib/messages/catalog.ts:2141`.
- **Correction to the brief's framing:** the brief characterized the arc as an invariant-10 obligation. Both ledger entries explicitly disclaim exactly that, and the meta-test's method scope confirms it. §1.1 item 1 records the corrected relationship (invariant 10 supplies the shape, not the obligation).
- **Fact the brief did not carry:** the adjacent shipped emits persist *forensic* codes distinct from the user-facing one, making the persisted-code choice a genuine fork rather than an obvious copy. Resolved in §1.1 item 2.
- `app_events.code` is unconstrained `text` (`supabase/migrations/20260629000002_app_events.sql:9`) with a partial index at `supabase/migrations/20260629000002_app_events.sql:21`.
- `shouldPersist` semantics, `LogFields.code` typing (`string | undefined`, `lib/log/types.ts`), and the `withCapture`/`setLogSink` test idiom — all confirmed as cited.
