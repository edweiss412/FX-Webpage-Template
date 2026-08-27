# Implementation plan — Cluster E durable `code:` emits

Spec: `docs/superpowers/specs/2026-08-07-ops-log-code-emits.md`
Branch: `feat/ops-log-code-emits`

Six emit-less failure sites gain a `code:`-carrying `log.*` call. **Five** TDD tasks, each red → implementation → green → commit per invariant 1, plus a close-out ledger step that is deliberately NOT a task (it is bookkeeping with no executable RED; see Close-out). No UI, no migration, no advisory lock, no new error code.

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
- **Justification** (an explicit declaration, not an omission): the candidate registries do not reach these surfaces. `tests/log/_metaMutationSurfaceObservability.test.ts` is scoped to mutating methods and admin routes and all six sites are GET/render (spec §1.1 item 1); `tests/auth/_metaInfraContract.test.ts` covers Supabase call boundaries and this arc adds no Supabase call; `tests/auth/advisoryLockRpcDeadlock.test.ts` covers lock topology and this arc takes no lock; `tests/messages/_metaAdminAlertCatalog.test.ts` covers `admin_alerts` upserts, which this arc does not perform. The behavioral tests in Tasks 1-5 are the whole defense, which is why they are written per-branch rather than per-file.
- **Advisory-lock topology:** N/A — no `pg_advisory*` path, no DB write, no `shows`/`crew_members` mutation. No commit boundary exists at any site, so invariant 2's post-commit-emit placement rule is satisfied vacuously.
- **Layout-dimensions task:** N/A — no fixed-dimension parent, no rendered element added or changed.
- **Transition-audit task:** N/A — no `AnimatePresence`, no ternary render change, no visual state added.
- **Mutation-surface observability (invariant 10):** N/A — no mutating route handler and no `"use server"` action is added or modified.

impeccable-gate: N/A — no UI surface

**Why that marker holds despite `components/admin/OnboardingWizard.tsx` being touched** (spec §4): the edit adds a type discriminator to a module-private helper and one `log.error` call in the component body. It renders nothing, changes no class, token, copy, or render condition. The tripwire is executable rather than asserted — the three shipped render assertions at `tests/components/admin/OnboardingWizard.test.tsx:203-238` must pass **unmodified**, which is why Task 3 extends those cases rather than rewriting them. If implementation finds itself changing rendered output, this marker is void and the dual gate applies.

## Acceptance criteria

- **AC-1** — Each of the five OAuth branches emits exactly one record with `level: "warn"`, `code: "OAUTH_REDIRECT_INVALID"`, and its own distinct `reason`. Six values across five sites, because site 5 splits on whether the intent verified: `callback_invalid_explicit_next`, `start_invalid_explicit_next`, `bootstrap_next_rejected`, `bootstrap_unparsable_next`, `bootstrap_intent_unverified`, `bootstrap_intent_target_mismatch`.
- **AC-2** — No emit changes the shipped refusal. Status codes, redirect targets, PKCE cookie clearing, and the cataloged response body are unchanged at every site. **Each element is asserted by the task that could break it** — R3 found the earlier draft mapped AC-2 to tasks that stayed green through a PKCE-clearing removal (Task 1 checked only status and location) and through a swapped 403 body (Task 2 checked only status).
- **AC-3** — The onboarding operator-error path emits exactly one record with `level: "error"`, `code: "ONBOARDING_OPERATOR_ERROR"`, and `reason` ∈ {`env_missing`, `json_malformed`, `json_not_an_object`, `client_email_missing`} matching the actual cause. `json_malformed` is asserted ONLY where `JSON.parse` genuinely threw.
- **AC-4** — No emit carries service-account key material, the `JSON.parse` error, or the raw rejected `next` value. Enforced by a **whole-record accept-set** over exactly the nine fields the sink persists (see the shared shape under Task 1). Narrower guards failed twice: a denylist ("no `error` key, no sentinel") was defeated in R2 by a parse message relocated to `message` and by a partial key fragment; a context-only accept-set was defeated in R3 by a fragment in `source`, which is promoted out of `context` into its own `app_events` column.
- **AC-5** — `OnboardingWizard`'s rendered output is unchanged; the three shipped render assertions pass unmodified.
- **AC-7** — Every emit is wrapped so a telemetry fault cannot escape over the caller: against a sink that throws, all six sites still produce their unchanged refusal (invariant 9, spec limit §5.5).
- **AC-6** — Both ledger entries archive with provenance, and the `IN PROGRESS` markers come off in the PR's last commit. Verified by inspection of the final diff, not by a test — see the close-out step for why no executable gate discriminates it (discharged by closeout)

<!-- tasks: depth=2 -->

## Task 1 — sites 1-2: callback and google-start emits

<!-- task: red=`pnpm vitest run tests/auth/oauthRedirectInvalidTelemetry.test.ts` ac=AC-1,AC-2,AC-4 -->

**RED.** Create a new node-environment suite at tests/auth/oauthRedirectInvalidTelemetry.test.ts, structured on the shipped harness at `tests/auth/callback-oauth-telemetry.test.ts:34` — `vi.resetModules()`, `setLogSink` capturing `LogRecord[]`, dynamic `import` of the route, `resetLogSink()` in a `finally`. Two cases:

1. Drive `app/auth/callback/route.ts`'s `GET` with a valid `code` and an **explicitly invalid** `next` (so `hasInvalidExplicitNext` is true at `app/auth/callback/route.ts:181`). Assert exactly one record with `code === "OAUTH_REDIRECT_INVALID"`, `level === "warn"`, `context.reason === "callback_invalid_explicit_next"`, **and** the shared unchanged-refusal surface for its site (see the table below) — for site 1 that includes the PKCE `Set-Cookie` proving `clearPkceVerifierCookies` still ran (`app/auth/callback/route.ts:61`). Asserting AC-2 in the same case as AC-1 means an emit that disturbs the refusal fails here rather than in review.

**Premise for the PKCE assertion (mandatory — it is vacuous without one).** `clearPkceVerifierCookies` iterates the REQUEST's cookies and appends nothing when none match, so a case whose request carries no code-verifier cookie asserts over an empty set and passes even if the call were deleted outright. The case therefore sets at least one `sb-<ref>-auth-token-code-verifier` cookie on the request and states via `premise`/`premiseHolds` that the request carries it, immediately above the `Set-Cookie` assertion. This is the "absent event encoded as a value that satisfies the comparison" shape from the anti-tautology rule, and it is the reason removing the PKCE call went undetected in the R3 draft.
2. Drive `app/api/auth/google/start/route.ts`'s `GET` with an invalid `next`. Same assertions with `reason === "start_invalid_explicit_next"`. Both cases also assert the **whole-record accept-set** (AC-4) — see the shared shape below.

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

`source` is `"auth.callback"` for site 1 and `"api.auth.googleStart"` for site 2. **Site 2 also adds `import { log } from "@/lib/log";`** — one of the arc's two import additions, the other being the same import in `components/admin/OnboardingWizard.tsx` (Task 3). Nothing else at either site moves: the `signInRedirect` call, its arguments, and `clearPkceVerifierCookies` (site 1) stay exactly as they are.

**Do NOT** pass the rejected `next` value, or any value derived from it, in any field (AC-4; spec §2.1 and documented limit §5.2).

### The whole-record accept-set (shared by EVERY emit case in the arc)

Two review rounds each broke a narrower guard, so this is scoped to **exactly the nine fields `persistAppEvent` writes** (`lib/log/persist.ts:16`): `level`, `source`, `message`, `code`, `requestId`, `showId`, `driveFileId`, `actorHash`, `context`. R2 broke a denylist with a parse message moved into `message`; R3 broke a context-only accept-set by placing a fragment in `source`, which `buildRecord` promotes out of `context` onto the record and which persists as its own column. A guard narrower than the persisted row leaves a channel, every time.

Each case makes ONE assertion pair — the cardinality filter, then the exact nine-field object — and this is the only form; there is no second snippet to reconcile:

```ts
const matched = seen.filter((r) => r.code === "OAUTH_REDIRECT_INVALID");
expect(matched).toHaveLength(1);
expect(matched[0]!).toEqual({
  level: "warn",
  source: "auth.callback",
  message: "next param rejected; redirecting with OAUTH_REDIRECT_INVALID",
  code: "OAUTH_REDIRECT_INVALID",
  requestId: null,
  showId: null,
  driveFileId: null,
  actorHash: null,
  context: { reason: "callback_invalid_explicit_next" },
});
```

### The unchanged-refusal assertion (shared by Tasks 1, 2, 3 and 5)

AC-2 and AC-5 say the shipped refusal is untouched. Like the accept-set, that surface gets **one definition**, so no task can assert a weaker version of it — which is exactly what plan-R3 found in Task 5, whose picker cases checked status and `Location` while Task 2's checked the cataloged body too. Per site, "unchanged refusal" means:

| Site | The full refusal surface |
| --- | --- |
| 1 (callback) | `status === 302`; the exact sign-in `Location`; a `Set-Cookie` with `Max-Age=0` for every `sb-*-auth-token-code-verifier` on the request (premise: the request carries one) |
| 2 (google-start) | `status === 302`; the exact sign-in `Location` |
| 3, 4, 5a, 5b (picker-bootstrap) | `status === 403`; **no** `Location` header; the body contains the cataloged `OAUTH_REDIRECT_INVALID` copy (`messageFor(...).crewFacing ?? .dougFacing`) |
| 6 (onboarding wizard) | `wizard-operator-error` renders, **and** the wizard shell around it is intact — the same `queryByTestId` expectations the shipped cases already make, including the Start Over affordance's presence or absence for the settings under test (`tests/components/admin/OnboardingWizard.test.tsx:186` shows shell and block are independent properties) |

The picker body assertion is load-bearing rather than belt-and-braces: `htmlResponse` renders a DIFFERENT cataloged string per code, so a branch that swapped to another 403 interstitial would pass a status-only check while changing what the user reads. Same for the wizard: returning only `OperatorErrorBlock` keeps `wizard-operator-error` present while dropping the shell.

**Cardinality is part of the accept-set, not a separate concern.** A `toEqual` on a SELECTED record constrains that record and says nothing about how many were emitted, so a duplicate emit on any branch would satisfy it — AC-1 and AC-3 both say "exactly one record". The `toHaveLength(1)` line is therefore not optional decoration on the deep-equal; it is half the assertion.

`toEqual` against a complete literal is the rest of the accept-set: any field added, renamed, or populated with derived text fails. Per-site variation is only in `source`, `message`, `context.reason`, and `requestId` — `null` for the two `auth.*` routes (documented limit §5.3) and the derived request id for the three picker-bootstrap sites, which run inside `runWithRequestContext`.

**`requestId` must be pinned to a FIXED literal, never derived from the captured record and never `expect.any(String)`.** `deriveRequestId` returns `headers.get("x-vercel-id") ?? crypto.randomUUID()` (`lib/log/requestContext.ts:25`), so its natural value is nondeterministic — and an oracle read back from the record, or a bare type matcher, would admit a mutant assigning `requestId: rawNext` and leak the rejected input through a promoted column. Every picker-bootstrap case therefore sets a fixed `x-vercel-id` header on the request (e.g. `"test-req-1"`) and asserts that exact string. This is the one field in the nine whose expected value is not already a constant, which is why it is called out rather than left to the implementer. **Every emit case in every task uses this shape — Tasks 1, 2, 3 and 4, with no exception.** The onboarding cases instantiate it with `level: "error"`, `source: "admin.onboardingWizard"`, the onboarding code and message, and `context: { reason: <the case's reason> }`. R7 found the earlier draft applied the accept-set only in Tasks 1, 2 and 4, leaving Task 3's `env_missing` and `json_not_an_object` cases asserting just `code`/`level`/`reason` — so a branch-specific widening that attached the parsed primitive on those paths passed every promised assertion and could persist secret material. The accept-set is universal precisely so no branch can be the one that was forgotten. Content checks (no sentinel, no `private_key`, no raw `next`) are retained as a backstop against a leak arriving through some channel the record shape does not describe.

## Task 2 — sites 3-5: the picker-bootstrap branches

<!-- task: red=`pnpm vitest run tests/auth/oauthRedirectInvalidTelemetry.test.ts` ac=AC-1,AC-2,AC-4 -->

**RED.** Five cases in the same suite, each forced down its own branch of `app/api/auth/picker-bootstrap/route.ts`. Site 3 gets **two** — one absent `next`, one present-and-rejected — for the reason given below the table:

| Case | Input that reaches it | Asserted `reason` |
| --- | --- | --- |
| `app/api/auth/picker-bootstrap/route.ts:162` (a) | an absent `next` — reaches this site because it carries no `rawNext !== null` guard, unlike sites 1-2 | `bootstrap_next_rejected` |
| `app/api/auth/picker-bootstrap/route.ts:162` (b) | a **present** `next` that `validateNextParamDetailed` rejects (e.g. a cross-origin URL) | `bootstrap_next_rejected` |
| `app/api/auth/picker-bootstrap/route.ts:165` | a `next` that validates but `parseNextPath` cannot split into slug + share token | `bootstrap_unparsable_next` |
| `app/api/auth/picker-bootstrap/route.ts:176` (a) | a well-formed tokenized `next` whose `t` intent fails `verifyPickerIntent` — absent, malformed, bad signature, or **expired** | `bootstrap_intent_unverified` |
| `app/api/auth/picker-bootstrap/route.ts:176` (b) | a well-formed tokenized `next` with a VERIFIED intent naming a different slug or share token | `bootstrap_intent_target_mismatch` |

Each asserts the whole-record accept-set above (cardinality filter plus the nine-field object) (with `source: "api.auth.pickerBootstrap"` and its own `context.reason`), **and** the shared unchanged-refusal surface for a picker site: `res.status === 403`, no `Location`, and the cataloged `OAUTH_REDIRECT_INVALID` copy in the body (`app/api/auth/picker-bootstrap/route.ts:35`). Status alone does not pin the refusal — swapping any of these branches to a different 403 interstitial would leave a status-only assertion green while changing what the user reads.

**Concrete failure mode caught:** the four branches collapsed onto one emit, or a single emit hoisted above them — which would make `reason` a constant and the whole discrimination in spec §1.1 item 2 a fiction. **Five cases over four distinct `reason` values** (sites 3a and 3b deliberately share `bootstrap_next_rejected`, since they are one branch reached two ways). A hoisted constant matches at most the cases expecting that value — two if it happens to be `bootstrap_next_rejected`, otherwise one — and fails the rest. No single hoist fails every case, but the suite rejects every possible hoist, which is the property that matters. That is why these are separate cases rather than one parameterized case over a shared expectation.

**Site 3 needs both fixtures, and an absent-only fixture is vacuous for AC-4.** Both inputs reach the same branch and emit the same `reason`, so a single case looks sufficient — but only the present-value fixture can catch a conditional leak. A mutant attaching `rejectedNext` **only when the raw param is non-null** emits a clean record for an absent `next` and a leaking one for every real rejected value; against an absent-only fixture the accept-set passes and the leak ships. The present-value case is what makes AC-4 real at this site.

**Case 5b is the one worth getting right.** It needs a VERIFIED intent that names a different target, so it must sign a real intent with the route's signing key rather than passing a bogus `t`. If it instead passes an unverifiable token it silently becomes a duplicate of case 5a and the `bootstrap_intent_target_mismatch` branch ships untested. The implementer asserts, via `premise`, that `verifyPickerIntent` returns non-null for the token the case constructs — that premise is what separates (b) from (a).

**Premise (anti-tautology).** Case `app/api/auth/picker-bootstrap/route.ts:165` is the other fragile one: it needs a `next` that **passes** `validateNextParamDetailed` and **fails** `parseNextPath`. If no such value exists the case silently drifts into re-testing `app/api/auth/picker-bootstrap/route.ts:162`. The implementer states that premise executably with `premise`/`premiseHolds` from `tests/_shared/premise.ts` — assert `validateNextParamDetailed(value).ok === true` immediately above the case's action, so a value that stops satisfying it fails by name instead of passing at the wrong branch. Both this premise and case (b)'s are asserted at case top level, never inside a `.each` callback.

**Implementation.** Same shape as Task 1, `source: "api.auth.pickerBootstrap"`, at all three sites. The route already wraps its handler in `runWithRequestContext` (`app/api/auth/picker-bootstrap/route.ts:159`), so these three records carry a real `requestId` — unlike Task 1's two, per documented limit §5.3. Do not add the wrapper to the other two routes; that is out of scope.

## Task 3 — onboarding: reason discriminator and emit

<!-- task: red=`pnpm vitest run tests/components/admin/OnboardingWizard.test.tsx` ac=AC-3,AC-5 -->

**RED.** Extend `tests/components/admin/OnboardingWizard.test.tsx`. The three shipped cases at `tests/components/admin/OnboardingWizard.test.tsx:203`, `tests/components/admin/OnboardingWizard.test.tsx:220` and `tests/components/admin/OnboardingWizard.test.tsx:232` already construct the three distinct broken environments (unset, malformed JSON, missing `client_email`) — the cheapest non-vacuous oracle available, because the environments exist and are already known-distinct. Each gains a `setLogSink` capture asserting the record with the **whole-record accept-set** (see the shared shape under Task 1), instantiated with `level: "error"`, `source: "admin.onboardingWizard"`, `code: "ONBOARDING_OPERATOR_ERROR"`, `requestId: null` (the wizard runs outside `runWithRequestContext`, so the ALS fallback yields null), and its own `reason`: `env_missing`, `json_malformed`, `client_email_missing` respectively. Asserting only `code`/`level`/`reason` here was the R7 defect — it left two branches able to leak. **Five** further cases are added (see the table in Part 1) — eight operator-error cases in total, one per guard condition in the resolver.

**Their existing render assertions stay byte-identical** — that is the executable form of AC-5 and of the `impeccable-gate: N/A` determination. If a render assertion needs editing, stop: the determination is void.

**Concrete failure mode caught:** the wizard emitting a single undifferentiated code; `reason` wired to a literal instead of the resolver's result; or `json_malformed` claimed for a value that parsed. Four distinct expected `reason` values across eight environments means a hardcoded `reason` matches at most three cases and fails at least five.

**Implementation, two parts.**

*Part 1 — widen the result type AND narrow the `try`.* The shipped `try` at `components/admin/OnboardingWizard.tsx:77` wraps both the `JSON.parse` and the later `parsed.client_email` access, so `GOOGLE_SERVICE_ACCOUNT_JSON=null` parses successfully, throws a `TypeError` on the property read, and lands in the `catch`. Labelling that `json_malformed` would assert a parse failure that did not happen — probed, spec §2.2. The restructure:

```ts
type ServiceAccountFailureReason =
  | "env_missing"
  | "json_malformed"
  | "json_not_an_object"
  | "client_email_missing";
type ServiceAccountResult =
  | { ok: true; email: string }
  | { ok: false; reason: ServiceAccountFailureReason };

function readServiceAccountEmail(): ServiceAccountResult {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { ok: false, reason: "env_missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "json_malformed" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "json_not_an_object" };
  }
  const email = (parsed as { client_email?: unknown }).client_email;
  if (typeof email === "string" && email.length > 0) return { ok: true, email };
  return { ok: false, reason: "client_email_missing" };
}
```

The `catch` stays **parameterless** — binding the error is the first step toward logging it, and §2.2 forbids that. This is behavior-preserving: the ok/not-ok partition over every input is unchanged, only the label is new, so the render assertions in the RED above stay byte-identical. `readServiceAccountEmail` remains synchronous and pure; it is module-private with exactly one caller, so this carries no blast radius (contrast the `next` validator, deliberately untouched per spec §1.1 item 3).

**The resolver's case table — one input per guard condition, not merely per disjunct.** Plan-R4 found the disjunct table too narrow: it covered the shape check's three arms but left the `!raw` guard and the `email.length > 0` guard untested, so two ordinary mistakes survived every fixture. The table below covers **every condition in the function**, and each row names the input that turns exactly that condition red. Eight cases: the three already shipped, plus five added.

| Input (`GOOGLE_SERVICE_ACCOUNT_JSON`) | Expected `reason` | Guard condition it pins | If that condition is broken |
| --- | --- | --- | --- |
| unset | `env_missing` | `!raw` (nullish arm) | — (shipped case) |
| `""` | `env_missing` | `!raw` (**empty-string** arm) | a `raw == null` guard sends `""` to `JSON.parse`, which throws → mislabelled `json_malformed` |
| `{not-valid-json` | `json_malformed` | the `try` around `JSON.parse` | — (shipped case) |
| `null` | `json_not_an_object` | `parsed === null` | uncaught `TypeError` on the property read — the narrowed `try` no longer covers it, so the component throws rather than rendering. Still red, but by exception |
| `[]` | `json_not_an_object` | `Array.isArray(parsed)` | `client_email_missing` — `typeof [] === "object"` and `[] !== null`, so an array escapes a `typeof`/`null` test |
| `123` | `json_not_an_object` | `typeof parsed !== "object"` | `client_email_missing` |
| `{"private_key":"x"}` | `client_email_missing` | `typeof email === "string"` | — (shipped case) |
| `{"client_email":""}` | `client_email_missing` | `email.length > 0` | **`ok`** — the wizard renders normally with an empty service-account email, suppressing BOTH the operator-error render and its telemetry. Violates AC-3 and AC-5, and is the worst outcome in this table |

The last row is worth its own note: every other broken condition produces a wrong *label*, but that one produces no operator error at all — a silent success on a misconfigured deploy. It is exactly the case a "we already test client_email_missing" reading would skip.

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

**Assertions — the shared whole-record accept-set, with nothing added or subtracted here.** Task 4 asserts the record with the SAME nine-field `toEqual` defined under Task 1 (`level`, `source`, `message`, `code`, `requestId`, `showId`, `driveFileId`, `actorHash`, `context`), instantiated with `level: "error"`, `source: "admin.onboardingWizard"`, `code: "ONBOARDING_OPERATOR_ERROR"`, `context: { reason: <the case's reason> }`, and the exact onboarding message literal. **This task deliberately does not restate the assertion list.** An earlier draft enumerated a shorter one here, and that copy silently contradicted the shared contract and reintroduced the very R3 defect — a fragment in `source` passed every locally-listed guard. One definition, referenced; never a second copy to drift.

`JSON.stringify(records)` containing neither the sentinel nor `private_key` is retained as a backstop for a leak arriving through a channel the record shape does not describe.

**Two cases**, both with `GOOGLE_SERVICE_ACCOUNT_JSON` carrying a sentinel that could only have come from the env var (e.g. `"SENTINEL-PRIVATE-KEY-DO-NOT-LOG"`):

1. **Well-formed, reaching `client_email_missing` via a NON-STRING `client_email` that carries the sentinel** — e.g. `{"client_email": {"secret": "<sentinel>"}, "private_key": "x"}`. The obvious fixture (omit `client_email` entirely) is **vacuous for the parsed-field channel** and was the R5 defect: a mutant like `clientEmail: parsed.client_email` sets `undefined`, the logger drops undefined keys, the context key set stays `["reason"]`, and the accept-set passes while the mutant is indistinguishable from safe code. The field must be PRESENT and secret-bearing for the guard to have any power over it, and a non-string value is what routes it to `client_email_missing` while keeping it present.
2. **Malformed**, so the parse-error path is exercised: a syntactically invalid value embedding the same sentinel.

**Observed-RED protocol (this is the task's actual red step).** The persisted row has **three** leak-channel families — `context`, `message`, and the promoted columns — and the protocol runs **four** mutants across them, two in `context` because they fail for different reasons. Each is written so it is actually executable at the emit site, which the R6 review found the earlier draft's were not: neither the caught error nor `parsed` is in scope in the component body, since both are local to `readServiceAccountEmail`. Mutants (a) and (d) therefore carry the two-line resolver widening a real contributor would write to get at those values — that widening IS the regression being guarded against, so smuggling it into the mutant is faithful, not a cheat.

After Task 3 is green, run each in the working tree, observing it FAIL and reverting before the next:

- **(a) context / reserved-error path:** change the resolver's `catch` to `catch (e)`, return `e` on the failure result, and pass it as `error:` at the emit. `buildRecord` folds `fields.error` into the context via `serializeError` (`lib/log/logger.ts:38`), so the context key set gains `error` and no longer matches.
- **(b) message channel:** interpolate a fragment of `process.env.GOOGLE_SERVICE_ACCOUNT_JSON` — readable directly in the component body, no widening needed — into the emit's message string. The message literal no longer matches. This is the mutant the R2 denylist draft would have passed.
- **(c) promoted-column channel:** derive `source` from that same env fragment. This is the mutant that defeated the R3 context-only accept-set, and it is durable: `buildRecord` promotes `source` onto the record and `persistAppEvent` writes it as its own column.
- **(d) context / parsed-field path:** return the raw `client_email` on the failure result and pass it as `clientEmail:` at the emit. It is not in `RESERVED` (`lib/log/logger.ts:9`) so it lands in context, and against case 1's present, secret-bearing fixture the key set gains a key and the accept-set fails. **Run this one against the OLD omit-`client_email` fixture too and observe it PASS** — that contrast is what proves the R5 fixture change was load-bearing rather than cosmetic.

(a) and (d) share the `context` family but prove different things: (a) that `serializeError`'s expansion of a reserved field cannot slip through, (d) that the fixture can see a present parsed field at all. No mutant is committed. The commit message and PR body record all four observations with their output, including (d)'s old-fixture contrast run. A green claimed without them is not evidence the guard works.

**Premise (mandatory).** The assertions rest on two conditions, both stated via `premise`/`premiseHolds` from `tests/_shared/premise.ts` immediately above the negative assertion:

- `process.env.GOOGLE_SERVICE_ACCOUNT_JSON` contains the sentinel, **and**
- the captured records filtered to `ONBOARDING_OPERATOR_ERROR` number **exactly one** (not merely "more than zero" — the shared accept-set's cardinality rule applies here too).

The second is the one that matters: without it, a case whose env setup or sink capture silently failed passes by finding nothing in an empty array — the exact "expected value read from the same degenerate source as the actual" shape the anti-tautology rule names. Both execute unconditionally at case top level, never inside a callback whose iteration count could be zero.

## Task 5 — the fail-open contract at every emit site

<!-- task: red=`pnpm vitest run tests/auth/oauthRedirectInvalidTelemetry.test.ts tests/components/admin/OnboardingWizard.test.tsx` ac=AC-7 -->

**RED.** Every emit in this arc is `try`/`catch`-wrapped so a telemetry fault can never escape over the caller (invariant 9; spec limit §5.5) — and R7 found **nothing tested that**. Removing the wrapper from all six sites left every other assertion in this plan green, while a rejecting sink would replace the refusal with an unhandled rejection: the 302 never happens, the 403 never happens, the wizard never renders. The wrappers are load-bearing, not decorative, so they get a test.

One case per emit site (six), each installing a sink that **throws**:

```ts
log.setLogSink(() => {
  throw new Error("sink-down");
});
```

and then asserting **the shared unchanged-refusal surface for that site, in full** — the table above, not a subset of it. Plan-R3 found this task asserting a weaker version than Tasks 1-3 (status and `Location` but not the cataloged body at the picker sites; the error block but not the wizard shell), which let a `catch` that returned a different 403 interstitial, or only `OperatorErrorBlock`, pass while changing what the user sees. Referencing the one definition is what prevents that recurring.

**Premise (mandatory, and it must be CODE-SPECIFIC — a generic "sink was entered" flag is vacuous at site 1).** With no emit at all, a throwing sink is never invoked and the route works fine, so an unguarded case would pass against a tree carrying no telemetry whatsoever. But a generic entered-flag does not fix that at every site: `app/auth/callback/route.ts:255` calls `stampOauthClaim` — which emits `OAUTH_SIGN_IN_SUCCEEDED` (`app/auth/callback/route.ts:112`) — **before** the redirect-invalid branch at `app/auth/callback/route.ts:257`, so the flag is already true whether or not the new emit exists. A class sweep found site 1 is the only one with a preceding emit, but the premise is written code-specifically at all six sites regardless, since a generic form is one refactor away from being vacuous anywhere.

The sink therefore records each record BEFORE throwing:

```ts
const seen: LogRecord[] = [];
log.setLogSink((record) => {
  seen.push(record);
  throw new Error("sink-down");
});
```

and each case states via `premise`/`premiseHolds`, immediately above the refusal assertion, that `seen` contains a record with **this site's** `code` AND `context.reason` — not merely that `seen` is non-empty.

**Observed-RED protocol (Task 5's actual red step).** By the time this task runs, Tasks 1-3 have already installed all six wrappers, so these cases start green — the same honest problem Task 4 has, and it is declared rather than glossed. The RED is obtained per site: remove that site's `try`/`catch` (leaving the bare `await log.warn(...)` / `await log.error(...)`), run the case, **observe it FAIL** with the refusal replaced by an unhandled rejection, restore the wrapper, observe it pass. Six sites, six observations, none committed; the commit message and PR body record them.

**Concrete failure mode caught:** an emit written without its `try`/`catch`, or a later refactor that removes one. Against a rejecting sink that turns a user's refusal into a 500 — converting a handled, cataloged failure into an unhandled one on a public auth endpoint, which is strictly worse than the missing telemetry this arc set out to fix.

<!-- tasks: end -->

## Close-out step — archive the ledger entries and clear the markers

**Deliberately not a task, because it has no executable RED — and the R2 review was right to reject the one previously claimed.** `tests/docs/_metaLedgerInProgress.test.ts` passes today and would keep passing if this step were skipped entirely: it checks that an in-progress marker names a live origin branch, and that branch exists throughout. A no-op therefore satisfies any red/green sequence built on it, which is a tautology, not a gate. Calling this a TDD task would have made the plan's own invariant-1 claim false.

What it does, in the **PR's last commit**: move both `BL-OPS-LOG-OAUTH-EMITS` and `BL-OPS-LOG-ONBOARDING-EMIT` from `BACKLOG.md` to `BACKLOG-archive.md` with full provenance, preserving each entry's L-wave decomposition record and adding what shipped. The `**Status:** IN PROGRESS · **Branch:** feat/ops-log-code-emits` field comes off in that same commit — archives categorically reject in-progress entries, so the marker cannot ride along, and a marker reaching `main` names a branch the merge just deleted and fails the origin-existence rule there (invariant 12).

**Verification is by inspection plus the docs suite staying green** (`pnpm vitest run tests/docs`), which is a regression check, not a RED. The reviewer of the final diff confirms AC-6 by reading it.

**Archive body records**, so a later reader does not re-derive them: the persisted-code fork and why the forensic-code precedent did not generalize (spec §1.1 item 2); the deliberate opacity left in the `next` validator (limit §5.1) and in `verifyPickerIntent` (limit §5.6); and that the resolver's `try` was narrowed so `json_malformed` never labels a value that parsed.

## Close-out

1. `pnpm typecheck` and `pnpm lint` clean.
2. Full local suite green; at minimum the TWO test files this arc touches or creates (the new OAuth suite and `tests/components/admin/OnboardingWizard.test.tsx`) plus `tests/docs`.
3. `pnpm spec:lint` clean on both the spec and this plan.
4. Whole-diff cross-model review to APPROVE.
5. Real CI green — not just local — then `gh pr merge --merge`, then verify `git rev-list --left-right --count main...origin/main` is `0  0`.

**Deliberately NOT in this arc**, each with its resolution: widening `ValidateNextParamOutcome` (spec §1.1 item 3, limit §5.1); adding `runWithRequestContext` to the two `auth.*` routes (limit §5.3); any dedup or rate limit (spec §1.1 item 6); any §12.4 catalog edit (spec §1.1 item 5); `BL-OPS-LOG-DASHBOARD-BANNER`, the third L-wave sibling, which is design-gated Opus/UI work and is not claimed by this branch.
