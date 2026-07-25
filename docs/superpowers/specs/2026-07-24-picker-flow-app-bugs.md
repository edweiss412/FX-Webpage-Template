# Picker-flow app bugs — spec

**Date:** 2026-07-24
**Branch:** `fix/picker-flow-app-bugs`
**Backlog entries closed:** BL-PICKER-BOOTSTRAP-HOST-FLIP, BL-PICKER-GATE-SKIP-MISMATCH, BL-PICKER-CLAIMED-ROW-NEXT-DROP (root BACKLOG.md lines 129-149)
**Routing:** Opus / Claude Code. Per `AGENTS.md` invariant 8, a UI surface is any file under `app/` **except** `app/api/**`, so the impeccable dual-gate covers three files in this diff: `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/auth/callback/route.ts`, and `app/auth/sign-out/route.ts`. The two route handlers under `app/api/**` are outside it. (R1 finding 5 corrected an earlier claim that the non-`api` route handlers were carved out.)

---

## 1. Problem

`tests/e2e/picker-flow.spec.ts` carries four `test.skip` stubs. Three are blocked on app behavior, not on helper or config gaps, and each SKIP comment records a direct repro (`tests/e2e/picker-flow.spec.ts:76-83`, `tests/e2e/picker-flow.spec.ts:171-179`, `tests/e2e/picker-flow.spec.ts:233-240`). PR #60 claimed they were filed as backlog follow-ups; the entries were written later, on 2026-07-24, at root BACKLOG.md lines 129-149. This spec fixes all three app behaviors and un-skips the three paired stubs.

The fourth stub (`tests/e2e/picker-flow.spec.ts:293`, Admin Reset + Rotate) is blocked on a different, unrelated gap and stays skipped — see §1.1.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| "Continue as guest" signs the device's Google session out. Ratified by the user on 2026-07-24 after being shown all four options (sign-out / guest flag in the picker envelope / separate guest cookie / remove the CTA). Do not re-propose a durable guest-mode marker. | This document, §4; user decision recorded in the branch PR body |
| The redirect fix lands at **every** call site of the class via one shared helper, not only the two the backlog names. Ratified by the user on 2026-07-24 as "all four spots"; the class-sweep grep found **six** expressions in four files, two of which build the `new URL` through a local variable rather than inline (`app/auth/callback/route.ts:31`, `app/api/auth/google/start/route.ts:8`). Sweeping all six is the ratified intent (fix the class, not the named instances), not a scope expansion. | This document, §3.1; `AGENTS.md` class-sweep rule ("Class-sweep before patching adversarial findings") |
| The `?gate=skip` atomicity guard at `app/show/[slug]/[shareToken]/page.tsx:324` is **NOT** modified. After sign-out the chain resolves to `first_contact`, which the existing guard already honors. P-R29 Fix-3 stays intact. | `app/show/[slug]/[shareToken]/page.tsx:319-324`; §4.3 below |
| The backlog's proposed fix for BL-PICKER-GATE-SKIP-MISMATCH ("let the gate reach the picker via `?gate=skip` when the session is present-but-cleared") is **rejected as insufficient**, not adopted. It is a one-shot query parameter, and `google_mismatch` is decided before the picker cookie is ever *consulted*, so it reaches the picker once and fails again on the next request. Reasoning in §4.2. | Root BACKLOG.md line 143; `lib/auth/picker/resolveShowPageAccess.ts:199-202` |
| `tests/e2e/picker-flow.spec.ts:293` (Admin Reset + Rotate) stays `test.skip`. Its own SKIP note records the blocker as test-infra, not app behavior: contention on the shared admin fixture user that `signInAs` deletes and recreates, plus two-tap confirm timing. Outside this spec. | `tests/e2e/picker-flow.spec.ts:286-292` |
| Only `app/api/auth/google/start/route.ts:65` keeps `NextResponse.redirect` with an absolute URL: `data.url` is the Supabase-issued Google OAuth endpoint, an external target the host-flip class does not touch. Its sibling at `app/api/auth/google/start/route.ts:11` is **in scope** — R1 finding 1 established that its `url` variable is `new URL("/auth/sign-in", request.url)` (`app/api/auth/google/start/route.ts:8`), a self-redirect, so the earlier exclusion of that line was wrong and is withdrawn. | `app/api/auth/google/start/route.ts:8`; §3.1 site 6 |
| The `clearIdentity` export does **not** gain sign-out behavior. Its one caller is the identity chip's "not me" control (`components/auth/IdentityChip.tsx:23`), where the viewer is re-picking on their own device and no session should be destroyed. Sign-out belongs only to the guest path. (R1 finding 9 corrected an earlier claim of zero callers, which had been grepped over `app/` and `lib/` only.) | `components/auth/IdentityChip.tsx:23`; `lib/auth/picker/clearIdentity.ts:48` |
| No DB work. No migration, no RPC, no advisory lock, no CHECK/enum change, no schema-manifest regeneration, no validation-project apply. The tier × domain, CHECK/enum migration, and flag-lifecycle matrices mandated by `docs/agents/spec-self-review.md` are **N/A — no DB surface and no boolean config field in this diff**. | §9 |
| Dimensional invariants and transition inventory are both N/A, declared explicitly in §5.1 and §5.2 rather than omitted. | §5.1, §5.2 |
| **The bespoke same-origin gate on the guest action is DESCOPED**, not merely deferred. It was added in response to R1 finding 4, then drew R2 finding 3 and R3 findings 1 and 2 — three consecutive rounds on one design-correctness vector, which is the hard stop in `docs/agents/spec-self-review.md` ("Three-round prose cap on design-correctness vectors"): stop patching prose, and descope, spike, or mark UNRATIFIED. Rationale in §4.3a. Do not re-add a hand-rolled origin check to this change. | §4.3a; `docs/agents/spec-self-review.md` |

---

## 2. Empirical grounding

Per `docs/agents/spec-self-review.md` ("Empirical spike before speccing stateful/race/framework surfaces"), the two behavioral breaks were verified against the live chain before drafting, not reasoned from prose:

1. **Host flip.** The SKIP comment at `tests/e2e/picker-flow.spec.ts:76-83` records that `request.url` reports `localhost` even under `pnpm start -H 127.0.0.1`, and that `NEXT_PUBLIC_SITE_ORIGIN` does not influence it, reproduced under both `pnpm dev` and `pnpm build && pnpm start`. That is a measurement, not an inference.
2. **Mismatch ordering.** Read directly from the resolver: `lib/auth/picker/resolveShowPageAccess.ts:199` calls `validateGoogleSession` and `lib/auth/picker/resolveShowPageAccess.ts:202` returns `{ kind: "no_auth", reason: "google_mismatch" }` **before** `resolvePickerSelection({ showId, cookie })` is reached at `lib/auth/picker/resolveShowPageAccess.ts:260`. The picker cookie therefore cannot influence a mismatch outcome. This is what makes the backlog's proposed fix insufficient (§4.2).
3. **GET-form query discard.** The SKIP comment at `tests/e2e/picker-flow.spec.ts:233-240` records the observed final URL (`/auth/sign-in` with no `next`). The HTML behavior is standard: a `method="GET"` submit rebuilds the query string from the form's own fields, discarding the action URL's query.

No further spike is required: none of the three fixes involves component lifecycle, a close/navigation race, optimistic state, or undocumented framework internals.

---

## 3. Fix 1 — host-relative redirects

### 3.1 Current behavior

`NextResponse.redirect(new URL(path, request.url))` resolves `path` against `request.url` and emits an **absolute** `Location`. Because `request.url`'s host is whatever Next reports rather than what the client typed, the response can redirect the browser to a different spelling of the same origin. Cookies are keyed by host, so a browser that saved a Supabase auth cookie under `127.0.0.1` does not send it to `localhost`, and the next request looks unauthenticated.

Six expressions across four files carry this shape (grepped over `app/` and `lib/` on 2026-07-24; the count was corrected from five by R1 finding 1). Sites 1 through 4 construct the `new URL` inline inside the `NextResponse.redirect(...)` argument; sites 5 and 6 assign it to a local variable first and redirect to that variable. Both forms are the same class, which is why the guard in §3.4 must recognise each of them and why §3.4 requires a positive fixture per form.

| # | Site | Status | Path source |
| --- | --- | --- | --- |
| 1 | `app/api/auth/picker-bootstrap/route.ts:188` | 302 | `nextOutcome.path` (from `validateNextParamDetailed`) |
| 2 | `app/api/auth/picker-bootstrap/route.ts:210` | 302 | `nextOutcome.path`; the response also carries a `__Host-fxav_picker` cookie |
| 3 | `app/auth/callback/route.ts:16` (`redirectTo`) | caller-supplied, defaults 302 | caller-supplied |
| 4 | `app/auth/sign-out/route.ts:132` | 303 | literal `"/auth/sign-in"` |
| 5 | `app/auth/callback/route.ts:31` (`signInRedirect`) | 302 | literal sign-in path plus `code` and `next` search params set on the URL object |
| 6 | `app/api/auth/google/start/route.ts:11` (`signInRedirect`, a same-named local helper in a different file) | 302 | literal sign-in path plus `code` and `next` params, built at `app/api/auth/google/start/route.ts:8` |

### 3.2 The helper

A new file, lib/http/hostRelativeRedirect.ts, in a new lib/http/ directory (nothing under `lib/` currently owns HTTP-response construction):

```ts
export class InvalidRelativeRedirectPathError extends Error {}

export function hostRelativeRedirect(path: string, status?: number): NextResponse;
```

Behavior:

- Returns `new NextResponse(null, { status, headers: { Location: path } })` with `status` defaulting to 302. The status is validated against the exact set Next itself treats as a redirect — `REDIRECTS = new Set([301, 302, 303, 307, 308])` in the installed Next build (installed Next build, spec-extension/response.js lines 7-13, reading `REDIRECTS = new Set([301, 302, 303, 307, 308])`) — and anything else throws. A 300-399 range would have been wrong for the same reason 200 is wrong: 300, 304, and 399 carry a `Location` that browsers do not follow, so a helper named "redirect" must not mint them (R2 finding 2). A `??` default alone would silently turn `null` into 302 and would let a 200 carrying a `Location` header through, which has no redirect semantics at all (R1 finding 8). A relative `Location` is legal per RFC 7231 section 7.1.2 and is resolved by the browser against the request URL it actually used, so the host can never flip.
- **Guard.** Throws `InvalidRelativeRedirectPathError` unless `path` starts with a single slash — `path[0] === "/" && path[1] !== "/"` — and contains no backslash and no control characters. Rejected examples:

  ```text
  ""                       (empty)
  "foo"                    (no leading slash)
  "//evil.example"         (protocol-relative)
  "https://evil.example"   (absolute, scheme)
  "/x\y"                   (backslash)
  "/x\ny"                  (control character)
  ```

- **Why throw rather than fall back.** Every call site's path is either a string literal or the output of `validateNextParamDetailed`, whose returned `path` is always a `URL.pathname` matched against the allow-list regex at `lib/auth/validateNextParam.ts:18` or the constant fallback `DEFAULT_AUTH_NEXT_PATH = "/admin"` at `lib/auth/validateNextParam.ts:9`, so it always begins with exactly one slash. A reachable guard failure would mean a validation regression upstream; substituting a different destination would hide it. The guard is a tripwire, and the unit test is what exercises it.
- **Query strings pass through unchanged.** `validateNextParamDetailed` may return `path` with a re-attached `s` or `gate` query (`lib/auth/validateNextParam.ts:73-86`); those characters are already URL-safe and are emitted verbatim in `Location`.

Guard conditions per input, as required by `docs/agents/spec-self-review.md`:

| Input | Value | Result |
| --- | --- | --- |
| `path` | `undefined`, `null`, or non-string | throws `InvalidRelativeRedirectPathError` (typeof check first) |
| `path` | empty string | throws |
| `path` | no leading slash | throws |
| `path` | protocol-relative (two leading slashes) | throws |
| `path` | absolute URL with scheme | throws (fails the leading-slash check) |
| `path` | contains a backslash or a control character | throws |
| `status` | `undefined` | 302 |
| `status` | anything other than 301, 302, 303, 307, or 308 — including `null`, `NaN`, `302.5`, `200`, `300`, `304`, and `399` | throws `InvalidRelativeRedirectPathError` |
| `status` | 301, 302, 303, 307, or 308 | used verbatim (303 at site 4, 302 everywhere else) |

### 3.3 Application

- Sites 1, 2, 4: replace the `NextResponse.redirect(new URL(...))` expression with `hostRelativeRedirect(...)`, preserving each site's status (302, 302, 303). Site 2 keeps every subsequent `response.cookies` and `Set-Cookie` mutation unchanged — `NextResponse` supports them identically.
- Sites 3, 5, and 6: `redirectTo` keeps its name, signature, and position in the file; only its body changes to `return hostRelativeRedirect(path, status)`. `signInRedirect` likewise keeps its name and signature, but builds its query with `URLSearchParams` instead of mutating a `URL` object, then returns `hostRelativeRedirect` with a sign-in path carrying that query string, at status 302. Both parameter values (`code`, `next`) stay percent-encoded exactly as `URLSearchParams` emits them. Site 6 is the *same edit in a different file*: `app/api/auth/google/start/route.ts` has its own local helper that also happens to be named `signInRedirect` (`app/api/auth/google/start/route.ts:7`), building at line 8 and redirecting at line 11; it gets the identical treatment. R2 finding 10 caught §3.3 enumerating sites 1, 2, 4, 3, and 5 while never naming site 6.

  **Names are kept, but not because a live gate requires it.** `lib/audit/authChain.ts:130` encodes an expectation that the first call named `redirect`, `redirectTo`, or `signInRedirect` appears after `validateNextParamDetailed` or `validateNextParam` — but `auditM5AuthFile` (`lib/audit/authChain.ts:177`) has **no callers anywhere in the repo** (verified 2026-07-24: the only match is its own definition; the live X.3 audit is `auditProjectAuthChains` from `lib/audit/authPrimitives.ts:815`, which has no redirect-ordering rule). R1 finding 9 surfaced this by noticing that the sign-out POST body no longer contains the literals `lib/audit/authChain.ts:170` greps for, yet CI is green — which is only possible because the function never runs. The names stay anyway: renaming them is churn this change does not need, and keeping them means the dormant audit stays correct if it is ever wired up. Reviving or deleting that dead audit is explicitly out of scope (§8).
- `app/auth/sign-out/route.ts` keeps its local `clearPickerCookie()` and `clearSupabaseAuthCookies(request, response)` calls inside `POST` unchanged — the redirect at line 132 is the only edit. This is minimal-diff discipline, not gate compliance: as established above, the `lib/audit/authChain.ts:170` grep never executes.

### 3.4 Structural guard

A new test, tests/cross-cutting/no-absolute-self-redirect.test.ts, filesystem-walked over `app/**/*.ts` and `app/**/*.tsx` (fails-by-default for new files, matching the walker style of `tests/log/_metaMutationSurfaceObservability.test.ts`). It fails on any `NextResponse.redirect(` whose argument constructs a `new URL` against `request.url` or `req.url`, or which passes a variable assigned from such a construction in the same function. No allow-list rows: after this change, zero sites in `app/` use the shape. The one redirect that keeps an absolute target is `app/api/auth/google/start/route.ts:65`, which passes Supabase's externally-issued `data.url` and so never matches the detector. (R2 finding 10: an earlier revision misidentified line 11 as that external redirect. Line 11 is site 6, a self-redirect, and is fixed by this change.)

Anti-tautology, in three layers, because a walked-file count alone proves only that traversal worked (R1 finding 6):

1. **Detector fixtures.** The matcher is a pure exported function tested against the canonical fixture set defined below. That set is the single source of truth for these counts; no other section restates them.

   That last negative is not hypothetical, though only one live instance is a true peer of the banned shape: `app/api/auth/google/start/route.ts:44` builds `new URL("/auth/callback", request.url)` — the two-argument form — and hands it to Supabase rather than to a redirect. Three further uses are the **one-argument** parse form, `new URL(request.url)` / `new URL(req.url)`, at `app/api/auth/picker-bootstrap/route.ts:145`, `app/api/admin/venue-map/route.ts:21`, and `app/api/cron/notify/route.ts:63`; the detector does not consider them at all, so citing them as calibration was inaccurate (R2 finding 8). They remain in the fixture set as trivial negatives.

**Detector algorithm, and what it deliberately does not cover.** "Assigned in the same function" is not a specification, so the matcher is AST-based, using the `typescript` compiler API already imported by `lib/audit/authChain.ts:1`, not a regex over text. For each `CallExpression` whose callee is exactly the property access `NextResponse.redirect`, take the first argument and resolve it:

- a `NewExpression` of `URL` with two arguments whose second resolves to a property access ending in `.url` on an identifier named `request` or `req` — flag;
- an `Identifier` — resolve to its declaration's initializer within the enclosing function or module scope and re-apply, following at most three hops so an alias chain is caught and a cycle cannot hang the walk;
- a base captured first (`const base = request.url`) — the same resolution applies to the second argument;
- anything else — do not flag.

R3 finding 9 is right that this is a **conservative** detector, so its non-goals are stated rather than implied. It does **not** resolve: a `let` declared empty and assigned later; a variable reassigned between construction and redirect (which could in principle false-positive, and would be a false positive worth taking); an aliased callee (`const r = NextResponse.redirect; r(...)`); or a value returned from a helper function. Each is a shape no current call site uses, and each would be caught by review of a diff that introduced it. The guard's job is to stop the *known* class from silently returning, which the tree walk proves, not to be a sound dataflow analysis.

**Fixture accounting, single-sourced so the three documents cannot disagree.** The layer-1 fixture set is exactly ten cases: **six positives** — inline with `request.url`; inline with `req.url`; variable-assigned with `request.url`; variable-assigned with `req.url`; alias chain; captured base — and **four negatives** — `NextResponse.redirect(data.url)`; a `URL` built on an absolute string literal; a two-argument `new URL(p, request.url)` never passed to a redirect; and the one-argument parse form `new URL(request.url)`. Every other section that mentions these counts refers here rather than restating them (R3 finding 9 caught §3.4, the §6.1 row, and the plan disagreeing at three, three, and four).

Only one live instance is a true peer of the banned shape: `app/api/auth/google/start/route.ts:44` builds the two-argument form and hands it to Supabase rather than to a redirect. The other three live uses — `app/api/auth/picker-bootstrap/route.ts:145`, `app/api/admin/venue-map/route.ts:21`, `app/api/cron/notify/route.ts:63` — are the one-argument parse form, which the detector never considers; citing them as calibration was inaccurate (R2 finding 8), and they remain as trivial negatives.

---

## 4. Fix 2 — "Continue as guest" signs the Google session out

### 4.1 Current behavior

Mode B renders when `resolveShowPageAccess` returns `{ kind: "no_auth", reason: "google_mismatch" }`, which happens when `validateGoogleSession` returns `{ kind: "continue", code: "GOOGLE_NO_CREW_MATCH" }` (`lib/auth/picker/resolveShowPageAccess.ts:201-202`; the outcome type is declared at `lib/auth/validateGoogleSession.ts:22`). The gate's secondary CTA submits `clearIdentityAndSkipFormAction` (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:98`), which delegates to `clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts:55`): it deletes the show's picker-cookie entry, then redirects to `?gate=skip` (`lib/auth/picker/clearIdentity.ts:61`).

### 4.2 Why the cookie clear cannot work, and why the backlog's fix is insufficient

`google_mismatch` is returned at `lib/auth/picker/resolveShowPageAccess.ts:202`, before `resolvePickerSelection` is called at `lib/auth/picker/resolveShowPageAccess.ts:260`. The picker cookie is not an input to that decision, so deleting an entry from it cannot change the outcome. The user lands back on Mode B.

Honoring `?gate=skip` on `google_mismatch` — the fix the backlog proposes — would render the picker for exactly one request. The person then taps a name, `selectIdentity` writes the cookie, the browser navigates to the show page **without** `?gate=skip`, `resolveShowPageAccess` re-runs, the Google session is still not on the roster, and Mode B renders again. It also reopens what the guard at `app/show/[slug]/[shareToken]/page.tsx:319-324` was written to close: a hand-crafted `?gate=skip` would become indistinguishable from the action-issued one, since both are the same URL.

Guest mode therefore has to be durable state, or the session has to go. The user chose the latter (§1.1).

### 4.3 New behavior

`clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts:55`) becomes, in order:

1. **Parse and fully validate the input.** Parse the form data as today (`null` gives `{ ok: false, code: "PICKER_INVALID_INPUT" }`), then run the slug, share-token, and show-id regex checks that today live inside `clearIdentityCoreImpl` (`lib/auth/picker/clearIdentity.ts:74-80`) **before** anything destructive happens. R1 finding 3: with validation left downstream, a malformed direct submission signed the person out and only then reported `PICKER_INVALID_INPUT`. The checks move into a **new non-`"use server"` module**, lib/auth/picker/validateClearIdentityInput.ts, which both `clearIdentityAndSkip` and `clearIdentityCoreImpl` import, so the two cannot drift.

   The separate module is required, not stylistic (R4 finding 2). `lib/auth/picker/clearIdentity.ts:1` is a module-level `"use server"` file, and Next permits such a module to export only async functions (plus types, which are erased — every existing export there is one or the other: `lib/auth/picker/clearIdentity.ts:24` is a type, and the exports at `lib/auth/picker/clearIdentity.ts:48`, `lib/auth/picker/clearIdentity.ts:55`, and `lib/auth/picker/clearIdentity.ts:64` are all async). A synchronous exported predicate would fail the build, and making it `async` merely to satisfy that rule would mint another exported Server Action that the mutation-surface scanner discovers per function, requiring its own telemetry or exemption for no benefit. A plain module sidesteps both.
2. **Clear the picker entry.** `clearIdentityCore(input)` exactly as today (`lib/auth/picker/clearIdentity.ts:64`). On `{ ok: false }`, return it and stop — nothing destructive has happened yet.
3. **Sign out, device-locally.** Two statements, not a chained one-liner, so the client is a named local and the returned error is destructured where the invariant-9 pin can see it:

   ```ts
   const supabase = await createSupabaseServerClient();
   const { error } = await supabase.auth.signOut({ scope: "local" });
   ```

   Then clear any residual Supabase auth cookies. On a returned error or a thrown error: emit `log.error` with `code: "AUTH_SIGNOUT_FAILED"` and return `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }` **without** redirecting.

   **The emitted and returned codes differ on purpose**, discovered during implementation rather than at design time. `AUTH_SIGNOUT_FAILED` is forensic-only with no catalog row, which is what lets it avoid the §12.4 lockstep — but the producer scan (`lib/messages/__internal__/codeProducers.ts:14`) treats any `code:` literal as a user-facing §12.4 producer **except** inside a `log.*` emission span, which it strips first (`lib/messages/__internal__/stripLogEmissionCalls.ts:37`). So the forensic code may ride the telemetry emit but must not be the returned result code, or the forensic-leak assertion in `tests/log/_metaAdminOutcomeContract.test.ts` fails and x1 then demands a catalog row. The returned code is the already-catalogued `PICKER_RESOLVER_LOOKUP_FAILED` (`lib/messages/catalog.ts:3369`), which is also what `clearIdentityCore` returns for its own infra faults, so the caller sees one consistent failure shape.

   `scope: "local"` is load-bearing, not decoration. The installed `@supabase/auth-js` 2.105.1 defaults `signOut` to `{ scope: 'global' }` (installed source: GoTrueClient.js line 3176 under node_modules/.pnpm/@supabase+auth-js@2.105.1, reading `async signOut(options = { scope: 'global' })`), which revokes that user's refresh tokens on **every** device they own. A guest tapping a button on a shared iPad must not sign a colleague out of their phone (R1 finding 2). The app-wide `/auth/sign-out` route keeps its default global scope deliberately — there the person is signing themselves out on purpose — and this spec does not change it.

   Both failure modes are real and distinct, so the step sits inside one `try`/`catch` whose `try` also destructures `{ error }` from the call: `createSupabaseServerClient` **throws** when `SUPABASE_URL` or the publishable key is unset (`lib/supabase/server.ts:41-45`), which happens before `signOut` is ever reached, and `signOut` itself returns `{ error }` on a network or gateway fault. A cookie-sweep throw after a successful `signOut` lands in the same `catch` and is reported the same way.

4. **Redirect.** `buildShowReturnUrl(input.slug, input.shareToken, { s: input.s, gate: "skip" })` (unchanged, `lib/auth/picker/clearIdentity.ts:61`).

### 4.3a Why there is no bespoke same-origin gate

An explicit `sec-fetch-site` / `Origin` check was specified in the previous two revisions and is now removed. The reason is not that the concern was imaginary but that the fix could not be specified correctly at this scope, and three rounds of review said so:

- R1 finding 4 asked for the gate, on the correct observation that UI reachability is not authorization.
- R2 finding 3 showed the table let a contradictory `sec-fetch-site: cross-site` plus a matching `Origin` through, and that "the request origin" was undefined for a Server Action.
- R3 findings 1 and 2 showed the repaired table was still internally contradictory, and — the decisive part — that deriving the origin from `x-forwarded-host` and `x-forwarded-proto` is only sound behind a trusted proxy whose overwrite behavior this repo has never established. A correct gate needs a trusted-proxy policy, not another table.

`docs/agents/spec-self-review.md` names this exact situation and prescribes descoping rather than a fourth prose attempt. So the action relies on the framework default: Next validates a Server Action POST's `Origin` against the host when `Origin` is present, and rejects a mismatch.

**The residual gap, stated rather than hidden.** A cross-site POST that arrives with no `Origin` header is not refused by anything this change adds. Its blast radius is bounded: an attacker who forces it signs the victim's browser out of this app on that device and deletes one picker entry for one show. There is no read of data, no privilege escalation, no cross-account effect — it is logout CSRF, in an app whose logout is a visible button. The pre-existing `/auth/sign-out` route has a stronger hand-rolled gate (`app/auth/sign-out/route.ts:78-87`) precisely because it is the app's logout endpoint; matching that gate here requires the same trusted-proxy question answered, which is why it is filed rather than guessed at.

**Filed as** BL-SERVER-ACTION-ORIGIN-GATE in the root backlog by Task 9, carrying this reasoning and the trusted-proxy question as its open decision.

**Ordering rationale — picker entry first, then sign-out.** The reverse order (sign-out first) is *less* safe, which R1 finding 3 established: if the picker clear then failed, the foreign session would be gone while the stale picker identity survived, and the very next request would resolve that stale identity to `resolved` and render the show body as that person — exposing exactly the identity the `google_mismatch` gate had been masking. Clearing the entry first makes every **server-side** failure state non-exposing.

**The lost-response interleaving, stated rather than claimed away** (R2 finding 1). Cookie mutations are staged into the action's response; sign-out revocation is an external side effect that has already happened by then. If that response never lands, the browser keeps both the stale picker entry and its auth cookies, and because the access token stays valid until expiry (auth-js revokes the refresh token, not the issued JWT), the mismatch gate keeps rendering until expiry — after which the stale picker entry resolves. Three things make this an accepted limitation rather than a defect to design around:

1. **It is not a new exposure, though it does shorten the window.** That same end state — a device holding a stale picker entry with no usable Google session — is reachable today with no guest tap at all: the foreign session simply stops refreshing. Traced through the resolver, a session-missing `getUser` outcome returns `{ kind: "continue" }` (`lib/auth/validateGoogleSession.ts:120-121` for the explicit session-missing error, `lib/auth/validateGoogleSession.ts:145-146` for an absent user), which falls through to `resolvePickerSelection` and resolves the stale entry. The picker cookie *is* the crew auth mechanism on the share-link path, so a surviving entry resolving after a session lapses is existing behavior, not an escalation this change introduces. What the tap does change is **timing, not reachability**: revoking the refresh token means the session dies at access-token expiry rather than whenever the browser stops refreshing, so in the lost-response case the state arrives sooner than it otherwise would. Stated plainly rather than elided, because "no new exposure" would otherwise be doing more work than the evidence supports.

   One adjacent outcome is worth naming since it is the opposite of exposure: if the post-revocation token call returns a non-session-missing error shape, `validateGoogleSession` surfaces `terminal_failure` (`lib/auth/validateGoogleSession.ts:128-141`), which `resolveShowPageAccess` maps to `infra_error` and the page renders as `TerminalFailure`. That path is a hard error page, not a resolved identity.
2. **No ordering fixes it.** Both mutations ride the same response, so a lost response loses the picker deletion whichever order the server used. The only cure is durable server-side guest state, which is the design the user ratified against (§1.1).
3. **The precedent is identical.** `app/auth/sign-out/route.ts` revokes and clears cookies in one response and has exactly this property; nothing in this change makes the guest path weaker than the app's own sign-out button.

The claim this spec makes is therefore the narrow one: every failure the *server* can observe leaves a non-exposing state, and the unobservable case degrades to a state already reachable without this feature.

**Failure-state matrix.** Every reachable outcome, its residual state, and what the person sees:

| Failure point | Picker entry | Google session | Next render | Person sees |
| --- | --- | --- | --- | --- |
| Form fields missing or malformed (step 1) | untouched | untouched | Mode B | the same gate; tap is retryable |
| `clearIdentityCore` infra failure (step 2) | **possibly already staged as deleted** — the cookie write at `lib/auth/picker/clearIdentity.ts:90-107` precedes `revalidatePath` and the emit, so a throw after it is caught and returned as `{ ok: false }` with the deletion still in the response | untouched | Mode B | the same gate; tap is retryable. Safer than an untouched entry, but it is a real partial mutation, so the ordering proof and Task 4 both cover it rather than claiming the entry is intact |
| `signOut` returns an error, the client constructor throws, or the cookie sweep throws (step 3) | **cleared** | live | Mode B (mismatch still decided first) | the same gate; tap is retryable; no stale identity is reachable |
| Cookie sweep throws after `signOut` succeeded (step 3) | **cleared** | refresh revoked; the auth cookie may or may not already be deleted | **both branches are reachable** (R4 finding 8): `signOut` runs through the SSR adapter, which attempts its own auth-cookie deletion and swallows any write failure (`lib/supabase/server.ts:60-64`). If that deletion landed, the next request is first-contact and the picker renders behind the welcome gate's CTA. If it did not, the already-issued access token keeps `validateGoogleSession` returning the mismatch result until it expires, and only then does first-contact follow | either the welcome gate immediately, or the mismatch gate until token expiry and then the welcome gate. Neither branch exposes an identity, because the picker entry is already cleared |
| All steps succeed | cleared | signed out | picker (`first_contact` plus `?gate=skip`) | the roster |
| Every step succeeds server-side but the response never reaches the browser (process death, dropped connection) | **not** cleared — the deletion was only staged into that response | revoked server-side; the browser keeps the cookie until the access token expires | mismatch gate until the access token expires, then the stale picker entry resolves | the mismatch gate, then eventually the previously-picked identity |

No new user-visible copy is introduced for the failure branches: in every case the person is returned to a gate whose own CTA is the retry, and the typed result the form wrapper discards (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:34-38`) carries no information the gate does not already convey. That is a deliberate scope decision, recorded here so it is not mistaken for an oversight; the failure is observable through the `AUTH_SIGNOUT_FAILED` emit.

**Why this reaches the picker durably.** With the session gone, `validateGoogleSession` no longer returns `GOOGLE_NO_CREW_MATCH`, so `resolveShowPageAccess` falls through to `resolvePickerSelection`, which returns `no_selection` for a show with no entry, mapped to `{ kind: "no_auth", reason: "first_contact" }` at `lib/auth/picker/resolveShowPageAccess.ts:90`. The guard at `app/show/[slug]/[shareToken]/page.tsx:324` already honors `?gate=skip` for `first_contact`, so the picker renders. After the person taps a name, the next request has no Google session and a valid cookie entry, so the chain resolves to `resolved` and the show body renders — and keeps rendering across refreshes. **No change to `app/show/[slug]/[shareToken]/page.tsx`.** This durable property is not self-evident from reaching the picker once, so §6.2 proves it end-to-end rather than stopping at the roster (R1 finding 7).

**Cookie sweep.** `app/auth/sign-out/route.ts:49-59` already clears Supabase auth cookies belt-and-braces, matching the regex at `app/auth/sign-out/route.ts:51`. That regex and its matcher move to a new file, lib/auth/supabaseAuthCookieNames.ts, exporting `isSupabaseAuthCookieName(name: string): boolean`. Both consumers use it: the route's local `clearSupabaseAuthCookies(request, response)` keeps its name, signature, and body position, and the Server Action gets a `cookies()`-store equivalent that sets `maxAge` to zero on each matching cookie with the same attributes the route uses (path `/`, `Secure`, `HttpOnly`, `SameSite=Lax`).

**Invariant-9 registry row (pre-emptive).** `lib/auth/picker/clearIdentity.ts` gains its first Supabase client construction, which puts it inside the auth domain walked by the auth-domain orphan check in `tests/auth/_metaInfraContract.test.ts:335`. That walker covers `lib/auth`, `app/auth`, `app/api/auth`, and `app/api/show` (`tests/auth/_metaInfraContract.test.ts:336`) and reports any file matching the constructor regex that is neither registered, behaviorally covered, nor waivered — so without action this change lands as an orphan and fails CI. The file is therefore added to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (`tests/auth/_metaInfraContract.test.ts:219-232`) in the same commit as the implementation, **not** waivered: the call is a real infra boundary with a discriminable typed failure result, which is exactly what the registry exists to track. The registry also asserts every constructor call sits inside a `try` block, which the §4.3 step-3 sign-out structure satisfies.

**Blast radius, stated plainly.** With `scope: "local"`, sign-out ends the session on **this browser only**: the person's other devices keep theirs. On this device the session is gone for every show and for `/admin`. Picker cookie entries for *other* shows survive (only this show's entry is deleted), so those shows still resolve from the cookie. An admin does not reach Mode B through normal rendering — `isAdminSession` short-circuits at `lib/auth/picker/resolveShowPageAccess.ts:192`, before the Google-mismatch branch at `lib/auth/picker/resolveShowPageAccess.ts:201` — and nothing in this change adds a gate beyond the framework default, so the claim is bounded: an admin does not reach Mode B through normal rendering, and this spec does not assert that no admin session can ever be ended by a forced invocation of the action.

**Telemetry (invariant 10).** `clearIdentityAndSkip` is a non-admin exported action in a module-level `"use server"` file, so it is checked per function by `tests/log/_metaMutationSurfaceObservability.test.ts`. The step-3 `log.error` is a directly imported, code-carrying emit, which satisfies the contract on its own; the existing `// no-telemetry:` delegation comment at `lib/auth/picker/clearIdentity.ts:56` is kept because it still documents where the success-path emit lives. `AUTH_SIGNOUT_FAILED` is an existing log-only code (`app/auth/sign-out/route.ts:106`, `app/auth/sign-out/route.ts:115`); it is deliberately **not** in `lib/messages/catalog.ts` and **not** in master-spec section 12.4 (verified by grep, 2026-07-24), so reusing it adds no catalog-parity lockstep. The success path keeps emitting `PICKER_IDENTITY_CLEARED` from `clearIdentityCoreImpl` (`lib/auth/picker/clearIdentity.ts:114`).

### 4.4 Copy

The mismatch prompt must now tell the person what the button does. `SIGN_IN_OR_SKIP_PROMPT_MISMATCH` changes from

> You're signed in with a Google account that isn't on this show's roster. Sign in with the account for this show, or continue as guest to pick from the roster.

to

> You're signed in with a Google account that isn't on this show's roster. Sign in with the account for this show, or continue as guest, which signs this device out so you can pick your name from the roster.

No em-dash, straight apostrophes matching the existing rows, no jargon. The sentence says "signs this device out", **not** "signs this device out of Google": the action ends the app's own Supabase session on this browser and does not touch the person's Google account, and with `scope: "local"` it does not touch their other devices either. R1 finding 2 rejected the earlier "out of Google" phrasing as inaccurate. The `followUp` field is unchanged, keeping its live text verbatim, arrow included; it is admin-facing, so the crew-copy em-dash and arrow rules do not reach it.

The button label stays **"Continue as guest"** (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:108`) and its `data-testid` at `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:105` is unchanged — the prompt above carries the explanation, and the label is the crew-facing outcome.

**Three-way lockstep, one commit** (per `AGENTS.md`, "section 12.4 catalog row edits require three lockstep updates"): (a) the section-12.4 prose row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3082`, (b) `pnpm gen:spec-codes` regenerating `lib/messages/__generated__/spec-codes.ts`, (c) the `crewFacing` field at `lib/messages/catalog.ts:3496`. The `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts`) compares the two directly. The master spec is never run through Prettier.

---

## 5. Fix 3 — the claimed-row form keeps its return target

`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:88` builds a `signInRecoveryUrl` of the form `/auth/sign-in?next=<encoded>`, and `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:156` uses it as the action of a `method="GET"` form with no fields. A GET submit rebuilds the query from the form's fields, so the `next` is discarded and the browser lands on bare `/auth/sign-in`.

New markup, mirroring the working precedent at `app/auth/sign-in/SignInButton.tsx:35` and `app/auth/sign-in/SignInButton.tsx:36`:

```tsx
<form action="/auth/sign-in" method="GET">
  <input type="hidden" name="next" value={buildShowReturnUrl(slug, shareToken, { s })} />
  <button type="submit" data-testid="picker-roster-row" ...>
```

- The hidden input's value is the **raw** path; the browser percent-encodes it on submit. `encodeURIComponent` is dropped, and with it the `signInRecoveryUrl` const at `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:88` — line 156 is its only reference (verified by grep, 2026-07-24).
- `buildShowReturnUrl(slug, shareToken, { s })` (`lib/crew/buildShowReturnUrl.ts:33`) already drops an `s` outside its allow-list (`lib/crew/buildShowReturnUrl.ts:39`) and omits the parameter entirely when `s` is `undefined`, so a bogus or absent section produces a bare `/show/<slug>/<token>`. No new guard is needed.
- Everything else on the row is unchanged: the button, `data-claimed`, `data-crew-member-id`, the `picker-roster-row` and `picker-row-lock` testids, and the classes.
- `/auth/sign-in` awaits its search params at `app/auth/sign-in/page.tsx:71` and pre-validates `next` with `validateNextParam` at `app/auth/sign-in/page.tsx:72`, so the arriving value is validated exactly as it is today. (`app/auth/sign-in/page.tsx:52` only declares the `next` type member; R1 finding 9 corrected an earlier citation of that line as the read site.)

The other GET form in the repo (`app/auth/sign-in/SignInButton.tsx:35`) already uses a hidden input. Those are the only two `method="GET"` forms under `app/` and `components/` (verified by grep, 2026-07-24), so this one edit closes the class.

### 5.1 Dimensional Invariants

**N/A for this change.** No fixed-height or fixed-width parent containing flex or grid children is added, removed, or altered. The only markup change is on the claimed-row form (§5): its `action` attribute value changes and one `<input type="hidden">` is added inside it. A hidden input is not laid out (`display: none` per the HTML spec's default UA stylesheet), so it contributes no box and changes no parent-to-child dimension relationship. Every class on the form, the button, and the row's spans is byte-identical before and after. There is consequently no parent-to-child dimension relationship to pin and no real-browser `getBoundingClientRect` assertion to add; the existing layout coverage for the picker is untouched and unaffected.

### 5.2 Transition Inventory

**N/A for this change.** No component in this diff gains, loses, or alters a visual state, so there are no state pairs to enumerate. Specifically: `_PickerInterstitial.tsx` keeps exactly its current render branches (empty roster, claimed row, unclaimed row, banner present or absent) with no change to any of them beyond the form attributes in §5; `_SignInOrSkipGate.tsx` keeps both modes (`first_contact`, `google_mismatch`) and changes only the text inside the Mode B prompt paragraph, which is a static string swap with no animation, no `AnimatePresence`, and no conditional mount. Both are Server Components with no client-side state machine. Copy replacement inside an already-mounted static paragraph is instant by construction — no animation needed, and none exists to audit.

---

## 6. Test plan

Every task is TDD: failing test, then implementation (invariant 1).

### 6.1 Unit and component

| Test | Asserts | Failure mode it catches |
| --- | --- | --- |
| tests/lib/hostRelativeRedirect.test.ts (new) | 302 default; each of 301, 302, 303, 307, 308 honored; `Location` is exactly the input path with no origin; query strings survive; every rejected path **and** every rejected status in the §3.2 tables throws `InvalidRelativeRedirectPathError`, including `null`, `NaN`, `302.5`, and 200 | A helper that re-absolutizes, drops the query, accepts a protocol-relative path (open redirect), or emits a non-redirect status carrying a `Location` header |
| tests/cross-cutting/no-absolute-self-redirect.test.ts (new) | The three §3.4 layers: the detector flags every positive and no negative in the canonical fixture set defined in §3.4; no file under `app/` is flagged; the walk visited more than 50 files | A detector that recognises neither form or only the inline one; reintroduction of the shape in a new route; a broken glob passing vacuously |
| tests/auth/supabaseAuthCookieNames.test.ts (new) | `isSupabaseAuthCookieName` matches `sb-abc-auth-token`, the numeric-shard and code-verifier variants; rejects `sb-abc-other`, `__Host-fxav_picker`, and a missing project segment | An over-broad matcher clearing unrelated cookies, or a narrowed one leaving a session shard behind |
| `tests/components/PickerInterstitial.test.tsx` (extend) | The claimed row's form has `action="/auth/sign-in"`, `method="GET"`, and a hidden `next` input whose value equals `buildShowReturnUrl(...)`; the action attribute carries **no** query string; with `s` supplied the hidden value carries the section; with a bogus `s` it does not | The regression itself, and a "fix" that leaves `next` in the action as well, which would look right in the DOM and still be discarded |
| `tests/components/SignInOrSkipGate.test.tsx` (extend) | Mode B renders the amended `SIGN_IN_OR_SKIP_PROMPT_MISMATCH` copy via `messageFor`, with the label still "Continue as guest" | Copy edited in the catalog but not surfaced, or surfaced from a hardcoded string |

Anti-tautology notes: the `PickerInterstitial` assertion reads the form's `action` attribute and the hidden input **separately**, so a form that keeps the query in its action cannot pass. The expected `next` value is derived by calling `buildShowReturnUrl` with the same fixture inputs rather than hardcoding a path, so a change to that builder cannot leave a stale literal passing. The `clearIdentity` order assertion records call order into one shared array and asserts the index of the cookie write is lower than the index of `signOut`, rather than asserting each mock was merely called, so a correct-calls, wrong-order implementation fails. The "no client constructed" assertions are made against the `createSupabaseServerClient` mock's call count, not against the absence of an error, so an implementation that constructs the client and then bails still fails.

### 6.2 End-to-end

Un-skip three stubs in `tests/e2e/picker-flow.spec.ts` (they run under the `mobile-safari` project, `playwright.config.ts:54`, whose `testMatch` at `playwright.config.ts:62` already includes `picker-flow`):

- `tests/e2e/picker-flow.spec.ts:84` first-contact, then Google, then the show body renders (Fix 1)
- `tests/e2e/picker-flow.spec.ts:180` Mode B "Continue as guest", then the picker (Fix 2). Its existing assertions still hold: the `?gate=skip` URL, `picker-interstitial-root` visible, and Alice's entry gone from the picker cookie. Three assertions are **added**, because reaching the picker once is exactly what the rejected backlog design also achieved and is therefore not the property under test (R1 finding 7):
  1. no cookie satisfying `isSupabaseAuthCookieName` remains in the browser context, which is the sign-out contract;
  2. the person then taps the **unclaimed** roster row (Bob) and the show body renders — `crew-shell` visible with an identity chip naming Bob;
  3. the page is reloaded with a bare `page.goto(urlA)` carrying no `?gate=skip`, and `crew-shell` is still visible. A one-request-only fix fails at this step, which is the whole point of §4.2.
- `tests/e2e/picker-flow.spec.ts:241` claimed row, then `/auth/sign-in` carrying `next` (Fix 3)

`tests/e2e/picker-flow.spec.ts:293` stays skipped. The stale comment block at `playwright.config.ts:55-61` (whose "The 5 `.skip` stubs" text is at `playwright.config.ts:58`) is corrected to name the one remaining stub; the file currently holds four (verified 2026-07-24: `grep -c "test.skip"` returns 4), so the comment was already wrong by one before this change.

Local run note: `TEST_DATABASE_URL` in the shared `.env.local` is non-loopback (preflight warns), so the mutating picker-flow e2e is run with it overridden to the loopback URL.

### 6.3 Gates before push

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (full suite, not a scoped subset), `pnpm test:audit:x1-catalog-parity`, `pnpm test:audit:x3-trust-domain` (baseline captured green at 26 tests on 2026-07-24 before any edit), `pnpm vitest run tests/ci tests/cross-cutting` (the workflow-coverage and required-env registries this change edits), the three un-skipped e2e stubs, and the invariant-8 impeccable critique and audit pair on **all three** UI-surface files named in §9 — `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/auth/callback/route.ts`, and `app/auth/sign-out/route.ts`. (R2 finding 7: this section previously named only the picker component, contradicting §9.)

---

## 7. Files touched

| File | Change |
| --- | --- |
| lib/http/hostRelativeRedirect.ts | new — helper, guard, error class |
| lib/auth/supabaseAuthCookieNames.ts | new — `isSupabaseAuthCookieName` |
| lib/auth/picker/validateClearIdentityInput.ts | new — the shared slug/token/uuid predicate, outside the `"use server"` module |
| `app/api/auth/picker-bootstrap/route.ts` | two redirect expressions (lines 188 and 210) |
| `app/auth/callback/route.ts` | bodies of `redirectTo` (line 16) and `signInRedirect` (line 31); names kept |
| `app/api/auth/google/start/route.ts` | body of its own local `signInRedirect` (line 8 builds, line 11 redirects); the external `data.url` redirect at line 65 is untouched |
| `app/auth/sign-out/route.ts` | redirect at line 132; local cookie matcher delegates to the new helper |
| `lib/auth/picker/clearIdentity.ts` | sign-out step and failure emit in `clearIdentityAndSkip` |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` | claimed-row form; `signInRecoveryUrl` removed |
| `lib/messages/catalog.ts` | `SIGN_IN_OR_SKIP_PROMPT_MISMATCH.crewFacing` |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | the section-12.4 row at line 3082 |
| `lib/messages/__generated__/spec-codes.ts` | regenerated by `pnpm gen:spec-codes` |
| `tests/auth/_metaInfraContract.test.ts` | registry row for `lib/auth/picker/clearIdentity.ts` (invariant 9) |
| tests | per §6, plus two process pins §6 does not cover: the new tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts (CI wiring, spec reference, key shape, path filter) and an extension of `tests/docs/_metaDeferralLedgerGraduation.test.ts` generalising its ledger guard to the backlog pair (the graduation of the three entries, a no-overlap invariant, and the filed follow-up's substance) |
| `playwright.config.ts` | stub-count comment |
| `.github/workflows/crew-e2e.yml` | job `env:` gains `PICKER_COOKIE_SIGNING_KEY`; `pull_request.paths` gains the paths this spec's behavior lives in; the mobile-safari step runs the picker-flow spec too; the header comment and step name stop claiming a single spec |
| `.github/workflows/dev-gate-e2e.yml` | the Playwright run step's `env:` block (`.github/workflows/dev-gate-e2e.yml:65`) gains `PICKER_COOKIE_SIGNING_KEY`. Defensive only: that workflow's projects never call `pickerCookieSigningKey()`, so no gate and no run proves this entry — see the plan's Task 8 |
| `tests/cross-cutting/ci-workflow-speedup.test.ts` | `PICKER_COOKIE_SIGNING_KEY` added to `REQUIRED_ENV` |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | the picker-flow row moves from `UNSEEN` to `PATH_GATED` |
| root BACKLOG.md and BACKLOG-archive.md | the three entries and their section header (lines 129-149) move to the archive with a resolution note, **and** a new BL-SERVER-ACTION-ORIGIN-GATE entry is filed in `BACKLOG.md` carrying §4.3a's residual, blast radius, and open trusted-proxy decision |

## 8. Out of scope

- Durable guest mode in any form (§1.1).
- A bespoke same-origin gate on the guest Server Action, descoped per §4.3a and filed as BL-SERVER-ACTION-ORIGIN-GATE. Framework-default `Origin` validation stands; the no-`Origin` case is the documented residual.
- The Admin Reset and Rotate e2e stub (`tests/e2e/picker-flow.spec.ts:293`).
- Any change to `app/show/[slug]/[shareToken]/page.tsx`, `lib/auth/picker/resolveShowPageAccess.ts`, or `lib/auth/validateGoogleSession.ts`.
- Broadening crew-picker telemetry beyond the one failure emit. The `// no-telemetry:` comments still name BL-CREW-PICKER-OBSERVABILITY, but that entry was **closed** on 2026-07-05 (BACKLOG-archive.md lines 244-246) after shipping the `auth.picker.*` taxonomy; R1 finding 9 corrected an earlier claim that it was still open. Re-wording those stale comment references is not in scope.
- The `data.url` redirect at `app/api/auth/google/start/route.ts:65`, which targets Supabase's externally-issued OAuth URL.
- The absolute OAuth `redirectTo` at `app/api/auth/google/start/route.ts:44`. It is derived from `request.url` and so is *susceptible to the same host flip*, but it cannot be made relative: it is handed to Supabase as the OAuth callback target, and the provider requires an absolute URL. Making it host-stable means deriving it from a configured site origin instead of the request, which is a separate decision with its own registered-redirect-URI implications. Recorded here explicitly so the class sweep is not mistaken for incomplete: this is a known adjacent instance, deliberately deferred, not an oversight. It is not exercised by the three e2e stubs, whose authed cases go through the test-auth endpoint rather than a real Google round trip.
- Reviving or deleting `auditM5AuthFile` (`lib/audit/authChain.ts:177`), which R1 finding 9 showed has no callers. It is dead code with a stale expectation baked in; this change neither depends on it nor fixes it.
- The global sign-out scope of the `/auth/sign-out` route (`app/auth/sign-out/route.ts:102`), which is correct for a deliberate self-sign-out and is left alone.

## 9. Invariant checklist

| Invariant | Application |
| --- | --- |
| 1 — TDD per task | Every task in the plan document is test-first; §6 here is the test plan those tasks implement |
| 2 — advisory lock | N/A — no mutation of `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions` |
| 3 — email canonicalization | N/A — no raw email crosses a boundary in this diff |
| 4 — no global cursor | N/A |
| 5 — no raw error codes in UI | The one new user-visible string is a catalog row read through `messageFor`; the failure code is log-only and never rendered |
| 6 — commit per task | Conventional commits, one per task, scopes `auth`, `crew-page`, `infra` |
| 7 — spec is canonical | This spec adds a section-12.4 row edit through the mandated lockstep; no other spec text is superseded |
| 8 — UI quality gate | Three files in this diff are UI surfaces under the invariant's definition (any file under `app/` except `app/api/**`): `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/auth/callback/route.ts`, and `app/auth/sign-out/route.ts`. All three go through the impeccable critique and audit pair. The two `app/api/**` route handlers are outside it. This branch has no milestone handoff doc, so the findings-and-dispositions record that would live in a handoff §12 goes in the PR body and in §12 of the plan document, named there explicitly |
| 9 — Supabase call-boundary discipline | The new `auth.signOut()` call destructures `{ error }`, distinguishes returned from thrown errors, and surfaces the fault as a typed discriminable result (a catalogued `PICKER_RESOLVER_LOOKUP_FAILED`, with the forensic `AUTH_SIGNOUT_FAILED` on the emit — see §4.3) rather than continuing silently — mirroring `app/auth/sign-out/route.ts:102` |
| 10 — mutation-surface observability | `clearIdentityAndSkip` gains a code-carrying `log.error` emit on its failure branch, which satisfies the contract directly; the existing `// no-telemetry:` delegation comment is **kept**, since it still documents where the success-path `PICKER_IDENTITY_CLEARED` emit lives (§4.3). Non-admin surface, so no `AUDITABLE_MUTATIONS` row is required |
| 11 — isolated worktree | Work is in `../FX-worktrees/picker-flow-app-bugs` off `origin/main`; `pnpm install`, `pnpm worktree:link-env`, and `pnpm preflight` all ran green before drafting |

---

## 10. Round 1 adversarial review — findings and dispositions

Codex reviewed the first revision on 2026-07-24 and returned `VERDICT: BLOCKING` with nine findings. All nine were verified against live code before repair; none was refuted. Recorded here so a later round does not re-derive them.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | BLOCKING | `app/api/auth/google/start/route.ts:8` is a sixth expression of the redirect class, not an external target | Accepted. §1.1 exclusion withdrawn, §3.1 table now lists six sites in four files, §7 adds the file |
| 2 | HIGH | Bare `signOut()` defaults to `{ scope: 'global' }` and would revoke a colleague's sessions on every device; the copy's "out of Google" was also inaccurate | Accepted, verified in the installed `@supabase/auth-js` 2.105.1 source. §4.3 step 4 pins `scope: "local"`; §4.4 drops the Google claim |
| 3 | HIGH | Validation ran after sign-out, and the sign-out-first order could strand a live session beside a stale picker identity | Accepted; this was the most consequential finding. Validation hoisted ahead of every destructive step, order flipped to picker-clear-then-sign-out, and §4.3 now carries an explicit failure-state matrix |
| 4 | MEDIUM | UI reachability was treated as authorization for a destructive exported action | Accepted. §4.3 step 2 adds a same-origin gate mirroring `app/auth/sign-out/route.ts:78-87`, and the admin claim is no longer absolute |
| 5 | BLOCKING | Invariant 8 was applied to one file; the definition covers every `app/` file outside `app/api/**` | Accepted. The impeccable pair now covers three files; the dispositions record is named explicitly |
| 6 | MEDIUM | A non-zero walked-file count does not prove the detector recognises either syntax form | Accepted. §3.4 now specifies a canonical fixture set per form plus negatives, with the tree walk and coverage floor as separate layers. R3 finding 9 later tightened this into a single-sourced set (corrected to ten cases by R4 finding 6) and added the detector non-goals |
| 7 | HIGH | The Fix-2 e2e stopped at the picker, so a one-request-only fix would still pass | Accepted. §6.2 continues through picking an unclaimed name, the show body, and a reload with no `?gate=skip` |
| 8 | MEDIUM | The status contract omitted `null`, `NaN`, non-integers, and non-3xx codes | Accepted. §3.2 validates the status rather than defaulting it |
| 9 | LOW | Seven citation or current-code inaccuracies | All seven accepted and corrected: the cookie is extracted before the mismatch return but not consulted; the retained e2e skip is fixture contention, not rotation helpers; `clearIdentity` has one caller at `components/auth/IdentityChip.tsx:23`; `auditM5AuthFile` has no callers at all, so neither it nor its POST-body grep is a live gate; the `followUp` text is unchanged and quoted verbatim; the `next` read is at `app/auth/sign-in/page.tsx:71-72`; BL-CREW-PICKER-OBSERVABILITY is closed |

Claims the reviewer attacked and could not break, recorded so they are not re-argued: a manually emitted host-relative `Location` does prevent the host flip; the single-leading-slash plus backslash and control-character guard is a sufficient open-redirect boundary for these path sources; the picker cookie cannot influence `google_mismatch`; moving `next` into a hidden GET-form control fixes the query loss; the invariant-9 registry row is correctly placed; and a directly imported `log.error` carrying a `code` field satisfies the mutation-observability meta-test as that test is actually written.

## 11. Round 2 adversarial review — findings and dispositions

Codex reviewed the repaired spec together with the first plan revision and returned `VERDICT: BLOCKING` with eleven findings. Every empirical claim was checked against the installed dependencies and the live tree; none was refuted. Findings 4, 5, 6, 9, and 11 land on the plan document and are dispositioned there.

| # | Severity | Finding | Disposition (spec-side) |
| --- | --- | --- | --- |
| 1 | BLOCKING | Picker-clear-first is not browser-durable: cookie writes are staged into the response, while sign-out revocation has already happened, so a lost response leaves the stale entry with a revoked session and exposes the identity after token expiry | Accepted as a real interleaving the matrix omitted. §4.3 now carries the row and replaces the "every failure state non-exposing" overclaim with the narrow, defensible claim, plus the three reasons it is an accepted limitation: the end state is reachable today by session expiry alone, no ordering can fix it because both mutations ride one response, and `/auth/sign-out` has the identical property |
| 2 | HIGH | The 300-399 status range admits 300, 304, and 399, which browsers do not follow | Accepted, verified against the installed Next build's own `REDIRECTS` set. §3.2 now accepts exactly 301, 302, 303, 307, 308 |
| 3 | HIGH | The same-origin table fell through to an `origin` comparison after a decisive `sec-fetch-site` rejection, and never defined how a Server Action derives its origin | Accepted. §4.3 step 2 now mirrors the route's decisiveness exactly, as an explicit five-row table, and defines the derived origin from `x-forwarded-proto`, `x-forwarded-host`, and `host`, with a missing `host` treated as reject |
| 7 | HIGH | §6.3 still limited the impeccable pair to one file, contradicting §9 | Accepted; §6.3 now names all three UI surfaces |
| 8 | MEDIUM | "Assigned in the same function" is not a data-flow algorithm, and three of the four cited negatives are the one-argument parse form, not peers of the banned shape | Accepted. §3.4 now specifies an AST-based algorithm with bounded alias resolution, adds the alias-chain and captured-base variants as fixtures, and corrects the calibration claim |
| 10 | MEDIUM | Five residual count and citation defects | Accepted. §3.3 now enumerates site 6; §3.4 no longer misidentifies line 11 as the external redirect; the plan-side count defects are fixed in the plan |

Claims the reviewer confirmed sound, recorded so they are not re-argued: `{ scope: "local" }` is the correct auth-js spelling and limits revocation to the current session; the e2e fixture seeds Bob unclaimed, so the added selection step is valid; the Bob selection plus bare reload does prove normal-success durability; both new Vitest files match the default project configuration; and the intended invariant-8 scope is exactly three files.

## 12. Round 3 adversarial review — findings and dispositions

Codex reviewed the second spec revision with the restructured plan and returned `VERDICT: BLOCKING` with fourteen findings. Every empirical claim was verified; none was refuted. Findings 3, 4, 5, 10, and 12 land on the plan and are dispositioned in the plan's §14.

| # | Severity | Finding | Disposition (spec-side) |
| --- | --- | --- | --- |
| 1 | BLOCKING | The same-origin table was internally contradictory: the rationale named the no-`Origin` request as the hole while the table accepted it, and `same-origin`/`none` was accepted without consulting `host` although the prose said a missing `host` must reject | Accepted — and this is the **third consecutive round** on this one vector (R1 finding 4 asked for the gate, R2 finding 3 found the fall-through, R3 findings 1 and 2 found the contradiction and the proxy-trust problem). Per the three-round prose cap in `docs/agents/spec-self-review.md`, the gate is **descoped**, not patched a fourth time. §4.3a records the reasoning, the residual gap, and its blast radius; the follow-up is filed as BL-SERVER-ACTION-ORIGIN-GATE |
| 2 | HIGH | Deriving the origin from `x-forwarded-host` / `x-forwarded-proto` is only sound behind a trusted proxy whose overwrite behavior this repo never established | Accepted, and decisive for the descope above: a correct gate needs a trusted-proxy policy, which is a separate decision, not a table |
| 6 | MEDIUM | The matrix claimed a `clearIdentityCore` failure leaves the entry untouched, but the cookie write precedes `revalidatePath` and the emit, so a later throw returns `{ ok: false }` with the deletion already staged | Accepted, verified at `lib/auth/picker/clearIdentity.ts:90-107`. The matrix row now states the partial mutation instead of claiming it away, and notes it is the safer direction |
| 7 | MEDIUM | The cookie-sweep row claimed an immediate first-contact render, contradicting this document's own point that revocation kills refresh capability, not the issued access token | Accepted. That row now says mismatch until the access token expires, then first-contact |
| 8 | MEDIUM | The §6.1 test row still said "an integer 300-399 honored" after §3.2 was narrowed to the five real redirect statuses | Accepted; the row now names 301, 302, 303, 307, 308 |
| 9 | MEDIUM | The AST walk does not cover the class it claims (later assignments, reassignment, callee aliases), and the fixture counts disagreed across three places | Accepted. §3.4 now states the detector's non-goals explicitly as a conservative matcher, and defines one canonical nine-case fixture set that every other section refers to instead of restating |
| 11 | MEDIUM | The scope inventories diverged after Task 8 grew: §7 and §6.3 omitted both workflows, the required-env registry, and the coverage allowlist | Accepted; §7 gains four rows and §6.3 gains the registry suites |
| 13 | LOW | §4.3 said the `// no-telemetry:` comment is kept while §9 said it is swapped for the emit | Accepted; §9 now matches §4.3 — the comment is kept and the emit is added |
| 14 | LOW | Residual citation defects, including a §9 row pointing at §6 for the task list | Accepted; the row now says the plan document holds the tasks and §6 is the test plan they implement |

Claims the reviewer confirmed or left standing: the AST walk terminates as specified; `{ scope: "local" }` is correct; the two-statement `signOut` form matches the invariant-9 pin; and the descoped-gate residual is logout CSRF rather than a data-exposure vector.

## 13. Round 4 adversarial review — findings and dispositions

Codex reviewed the descoped spec with the repaired plan and returned `VERDICT: BLOCKING` with eleven findings. The reviewer confirmed the descope's security characterisation holds ("for one forced invocation, the action exposes no response data and grants no privilege"), and attacked its execution instead. Findings 3, 4, 5, 7, 10, and the plan-side parts of 11 are dispositioned in the plan's §15.

| # | Severity | Finding | Disposition (spec-side) |
| --- | --- | --- | --- |
| 1 | BLOCKING | The removed origin gate survived as a canonical test requirement: §6.1 still demanded a "cross-site header shape" assertion, which can only pass if the gate is reintroduced | Accepted. That row is deleted. A unit invocation bypasses the framework's origin validation entirely, so the assertion was unsatisfiable under the descope — a half-removed feature, exactly what the reviewer was asked to look for |
| 2 | BLOCKING | The shared **exported** predicate cannot live in `lib/auth/picker/clearIdentity.ts`: it is a module-level `"use server"` file, where Next permits only async function exports, and making the predicate async would mint another discoverable Server Action needing its own telemetry | Accepted, verified against the module's existing exports (a type plus three async functions). §4.3 step 1 now puts the predicate in a new plain module, lib/auth/picker/validateClearIdentityInput.ts, imported by both callers |
| 6 | MEDIUM | The "canonical" fixture set drifted again: the spec said five positives, the plan enumerated six | Accepted. The canonical set is now ten cases — six positives, four negatives — and the plan refers to it instead of restating |
| 8 | MEDIUM | The cookie-sweep row claimed one outcome, but `signOut` runs through the SSR adapter, which attempts its own auth-cookie deletion and swallows write failures, so both the already-deleted and the still-present branches are reachable | Accepted, verified at `lib/supabase/server.ts:60-64`. The row now records both branches and notes neither exposes an identity, since the picker entry is already cleared |
| 9 | MEDIUM | §7 omitted both new test files and the new backlog entry | Accepted; §7 now lists them, including why the two process-pinning tests are not covered by §6 |
| 11 | LOW | Citation drift, including a registry paragraph still citing "step-4" after the renumbering | Accepted; that paragraph now cites the step-3 sign-out structure |

## 14. Round 5 adversarial review — findings and dispositions

Codex returned `VERDICT: BLOCKING` with seven findings, all verified, none refuted. Findings 1 through 6 land on the plan and are dispositioned in the plan's §16; the spec-side residue was citation drift:

| # | Severity | Finding | Disposition (spec-side) |
| --- | --- | --- | --- |
| 7 | LOW | Residual citation drift: §4.3 still said the "step-4 structure" satisfies the constructor-in-`try` registry after sign-out became step 3, contradicting the R4 correction recorded in §13; the auth-domain roots array was cited one line off; and §7 described the `dev-gate-e2e.yml` secret location as a job-level `env:` block when that workflow carries its secrets in the Playwright run step's block | All accepted and corrected. The step reference now reads step-3, the roots array cites `tests/auth/_metaInfraContract.test.ts:336` with the enclosing check one line above it, and the §7 row names the run-step block and states plainly that the entry there is defensive — no gate and no run proves it |

The plan-side findings were structural and are worth recording here too, because two of them changed what this spec's §6.3 and §7 describe: Task 7 was **dissolved** rather than defended (its comment edit folded into Task 8, its verification run into Task 11), and every dispatched workflow run is now blocking rather than fire-and-forget.
