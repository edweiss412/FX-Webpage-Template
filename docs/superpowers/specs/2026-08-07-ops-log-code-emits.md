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

3. **`ValidateNextParamOutcome` is NOT widened with a rejection-reason field.** `validateNextParamDetailed` returns the identical opaque `{ ok: false, path: DEFAULT_AUTH_NEXT_PATH, code: "OAUTH_REDIRECT_INVALID" }` from **five** distinct rejection paths (`lib/auth/validateNextParam.ts:45` non-string/blank, `lib/auth/validateNextParam.ts:50` control chars / backslash / encoded dot-dot, `lib/auth/validateNextParam.ts:58` URL parse throw, `lib/auth/validateNextParam.ts:62` cross-origin, `lib/auth/validateNextParam.ts:67` bootstrap-surface or non-allow-listed path). Distinguishing *those* would require changing the return type of a security-sensitive primitive shared by every auth entry point — a blast radius this S-effort observability arc does not carry, and a change that would want its own review of the allow-list semantics. **The `reason` field in item 2 therefore discriminates the CALL SITE (which of the five OAuth branches fired), not the validator's internal cause.** This is a deliberate resolution bound, recorded as documented limit §5.1 with the follow-on filing named there. Do not raise the validator's internal opacity as a finding against this arc.

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
| 1 | `app/auth/callback/route.ts:258` | `signInRedirect(request, "OAUTH_REDIRECT_INVALID", nextOutcome.path)` | `callback_invalid_explicit_next` — post-exchange, the caller supplied a `next` that failed validation (`hasInvalidExplicitNext`, `app/auth/callback/route.ts:181`) |
| 2 | `app/api/auth/google/start/route.ts:40` | `signInRedirect(request, "OAUTH_REDIRECT_INVALID", nextOutcome.path)` | `start_invalid_next` — the OAuth start leg rejected the `next` before any redirect to Google |
| 3 | `app/api/auth/picker-bootstrap/route.ts:162` | `htmlResponse("OAUTH_REDIRECT_INVALID", 403)` | `bootstrap_invalid_next` — `validateNextParamDetailed` refused |
| 4 | `app/api/auth/picker-bootstrap/route.ts:165` | `htmlResponse("OAUTH_REDIRECT_INVALID", 403)` | `bootstrap_unparsable_next` — validation passed but `parseNextPath` could not split slug/token |
| 5 | `app/api/auth/picker-bootstrap/route.ts:176` | `htmlResponse("OAUTH_REDIRECT_INVALID", 403)` | `bootstrap_intent_mismatch` — the signed picker intent is absent, or its `slug`/`shareToken` disagree with the parsed `next` |

Site 5 is worth naming separately: it is the only one of the five that can indicate **tampering** rather than a malformed link, since reaching it requires a `t` param that failed `verifyPickerIntent` or a signed intent pointing at a different show. It stays `warn` (a correctly-refused credential is not an application fault), and `reason` is what lets an operator separate it from the other four. That separation is the entire practical argument for item 2's `reason` field.

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

`source` follows the shipped per-route convention exactly: `"auth.callback"` (already used at ten emit sites on that route, first at `app/auth/callback/route.ts:89`), `"api.auth.pickerBootstrap"` (already at `app/api/auth/picker-bootstrap/route.ts:100`), and `"api.auth.googleStart"` for the third route, which today has **no** `log` import at all and gains one (`import { log } from "@/lib/log";`) — the only import change in the arc.

**No emit carries the raw `next` value.** The rejected `next` is attacker-controlled text of unbounded length that can embed a URL, a token-shaped string, or a control character, and `sanitizeContext` redacts emails but is not a general-purpose sanitizer for adversarial input. `reason` names the branch; nothing derived from the input is persisted. This is a deliberate fidelity/safety trade recorded as documented limit §5.2.

**Post-commit placement is satisfied vacuously**, and the plan states so rather than leaving it unstated: none of the five sites opens a transaction, acquires an advisory lock, or writes to any table, so there is no commit boundary to be outside of and invariant 2 has no surface here.

### §2.2 `BL-OPS-LOG-ONBOARDING-EMIT` — the render-only operator error

**Current state, verified.** `readServiceAccountEmail()` (`components/admin/OnboardingWizard.tsx:73`) returns the bare `{ ok: false }` from **three** distinct failure paths, and `ServiceAccountResult` (`components/admin/OnboardingWizard.tsx:71`) carries no discriminator:

| Path | Condition | Proposed `reason` |
|---|---|---|
| `components/admin/OnboardingWizard.tsx:75` | `GOOGLE_SERVICE_ACCOUNT_JSON` unset or empty | `env_missing` |
| `components/admin/OnboardingWizard.tsx:82` (`catch`) | `JSON.parse` threw — the value is not valid JSON | `json_malformed` |
| `components/admin/OnboardingWizard.tsx:80` | parsed fine, but `client_email` is absent, non-string, or empty | `client_email_missing` |

The component body calls it once (`components/admin/OnboardingWizard.tsx:576`, `const service = readServiceAccountEmail()`) and renders `<OperatorErrorBlock />` (defined `components/admin/OnboardingWizard.tsx:547`, mounted `components/admin/OnboardingWizard.tsx:665`) whenever `service.ok` is false. **These three causes are operationally very different** — a missing deploy secret, a corrupted paste, a wrong-shaped key file — and today they are indistinguishable from both the operator's view (identical copy) and the system's (no row at all). Discriminating them is the substance of this half of the arc.

**The change, in two parts.**

*Part 1 — widen the result type at the source.* `ServiceAccountResult` becomes `{ ok: true; email: string } | { ok: false; reason: ServiceAccountFailureReason }` with `type ServiceAccountFailureReason = "env_missing" | "json_malformed" | "client_email_missing"`, and each of the three `return { ok: false }` sites names its reason. `readServiceAccountEmail` stays **synchronous and pure** — it gains a discriminator, not an emit. Unlike item 3's validator, this is a module-private function with exactly one caller (`components/admin/OnboardingWizard.tsx:576`; grep for `readServiceAccountEmail` returns only the definition and that call), so widening it carries no blast radius.

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

Four tasks, each with an executable RED before implementation, per invariant 1. Every task states the concrete failure mode it catches, per the anti-tautology rule.

**Test template of record.** `tests/auth/callback-oauth-telemetry.test.ts` is the shipped analog and covers the very route site 1 lives on: it drives the real `GET` through a `withCapture` helper that calls `setLogSink` to collect `LogRecord[]` (`tests/auth/callback-oauth-telemetry.test.ts:34-49`), then filters on `r.code`. New OAuth tests follow that exact structure — a real handler invocation with a captured sink, never a spy on `log.warn` itself, so a test cannot pass against an emit that is built but never reaches the sink.

| Task | RED | Catches |
|---|---|---|
| 1 | A new suite, tests/auth/oauthRedirectInvalidTelemetry.test.ts — drive each of sites 1-2 through its real GET with a captured sink; assert exactly one record with `code === "OAUTH_REDIRECT_INVALID"`, `level === "warn"`, and the site's `reason`. | An emit added to one branch and forgotten on the sibling — the exact drip this arc exists to end. Fails today with zero records. |
| 2 | Same file, picker-bootstrap sites 3-5 — three cases, each forced down its own branch (bad `next`; valid-but-unparsable `next`; well-formed `next` with a mismatched/absent signed intent). | All three collapsed onto one emit, or a single shared emit hoisted above the branches — which would make `reason` a constant and the discrimination in item 2 a fiction. Each case asserts its own `reason` value, so a hoist fails three ways. |
| 3 | `tests/components/admin/OnboardingWizard.test.tsx` (extend) — the three existing operator-error cases at `tests/components/admin/OnboardingWizard.test.tsx:203`, `tests/components/admin/OnboardingWizard.test.tsx:220` and `tests/components/admin/OnboardingWizard.test.tsx:232` already construct all three failure environments; each gains a captured-sink assertion for `code === "ONBOARDING_OPERATOR_ERROR"`, `level === "error"`, and its distinct `reason`. | The wizard emitting a single undifferentiated code, or `reason` wired to a literal. The three environments are already built and already distinct, so this is the cheapest non-vacuous oracle available. |
| 4 | Same file — a **negative** case: set `GOOGLE_SERVICE_ACCOUNT_JSON` to a JSON string embedding a sentinel private key, render, and assert `JSON.stringify(records)` contains neither the sentinel nor the substring `private_key`; repeat with a malformed value carrying a sentinel so the `JSON.parse`-message path is covered. | The §2.2 secrets contract regressing — someone "improving" the emit by attaching `error` or the raw value. The sentinel must be a value that could only have come from the env var, so the assertion cannot pass by coincidence. |

**Premise note (writing-plans anti-tautology rule).** Task 4's discriminating power rests on the sentinel actually being present in the environment the component reads. The plan states that premise executably with `premise`/`premiseHolds` from `tests/_shared/premise.ts`, asserted immediately above the negative assertion — otherwise a test whose env setup silently failed would pass by finding nothing in an empty record set, which is precisely the "expected value read from the same degenerate source as the actual" shape the rule names.

**Meta-test inventory (mandatory declaration).** This arc **creates no new structural meta-test and extends none**. Justification, stated so the omission is a decision rather than an oversight: the candidate registries do not reach these surfaces — `tests/log/_metaMutationSurfaceObservability.test.ts` is scoped to mutating methods and admin routes (§1.1 item 1), `tests/auth/_metaInfraContract.test.ts` covers Supabase call boundaries and this arc adds no Supabase call, `tests/auth/advisoryLockRpcDeadlock.test.ts` covers lock topology and this arc takes no lock, and `tests/messages/_metaAdminAlertCatalog.test.ts` covers `admin_alerts` upserts, which this arc does not perform. The behavioral tests in Tasks 1-4 are the whole defense, and they are per-branch rather than per-file precisely because no structural guard is claiming that ground.

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

## §6 Pre-draft verification transcript

Citation-grep pass run 2026-08-07 against the live tree at `61281c23e` before drafting, per the mandatory live-code citation rule. Every claim below was confirmed, and the two that did **not** match the brief as received are recorded rather than quietly corrected:

- Five `OAUTH_REDIRECT_INVALID` call sites — confirmed at all five cited locators.
- `ONBOARDING_OPERATOR_ERROR` producer absence — confirmed: outside `lib/messages/**` and tests, the only hits are the render site (`components/admin/OnboardingWizard.tsx:548`) and the file's header comment (`components/admin/OnboardingWizard.tsx:15-16`). No `log.*` emit exists.
- Catalog rows for both codes — confirmed at `lib/messages/catalog.ts:2614` and `lib/messages/catalog.ts:2141`.
- **Correction to the brief's framing:** the brief characterized the arc as an invariant-10 obligation. Both ledger entries explicitly disclaim exactly that, and the meta-test's method scope confirms it. §1.1 item 1 records the corrected relationship (invariant 10 supplies the shape, not the obligation).
- **Fact the brief did not carry:** the adjacent shipped emits persist *forensic* codes distinct from the user-facing one, making the persisted-code choice a genuine fork rather than an obvious copy. Resolved in §1.1 item 2.
- `app_events.code` is unconstrained `text` (`supabase/migrations/20260629000002_app_events.sql:9`) with a partial index at `supabase/migrations/20260629000002_app_events.sql:21`.
- `shouldPersist` semantics, `LogFields.code` typing (`string | undefined`, `lib/log/types.ts`), and the `withCapture`/`setLogSink` test idiom — all confirmed as cited.
