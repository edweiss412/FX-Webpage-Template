# Picker-flow app bugs — spec

**Date:** 2026-07-24
**Branch:** `fix/picker-flow-app-bugs`
**Backlog entries closed:** BL-PICKER-BOOTSTRAP-HOST-FLIP, BL-PICKER-GATE-SKIP-MISMATCH, BL-PICKER-CLAIMED-ROW-NEXT-DROP (root BACKLOG.md lines 129-149)
**Routing:** Opus / Claude Code. The invariant-8 impeccable dual-gate applies to the `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` diff, the only UI surface in this change.

---

## 1. Problem

`tests/e2e/picker-flow.spec.ts` carries four `test.skip` stubs. Three are blocked on app behavior, not on helper or config gaps, and each SKIP comment records a direct repro (`tests/e2e/picker-flow.spec.ts:76-83`, `tests/e2e/picker-flow.spec.ts:171-179`, `tests/e2e/picker-flow.spec.ts:233-240`). PR #60 claimed they were filed as backlog follow-ups; the entries were written later, on 2026-07-24, at root BACKLOG.md lines 129-149. This spec fixes all three app behaviors and un-skips the three paired stubs.

The fourth stub (`tests/e2e/picker-flow.spec.ts:293`, Admin Reset + Rotate) is blocked on a different, unrelated gap and stays skipped — see §1.1.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| "Continue as guest" signs the device's Google session out. Ratified by the user on 2026-07-24 after being shown all four options (sign-out / guest flag in the picker envelope / separate guest cookie / remove the CTA). Do not re-propose a durable guest-mode marker. | This document, §4; user decision recorded in the branch PR body |
| The redirect fix lands at **every** call site of the class via one shared helper, not only the two the backlog names. Ratified by the user on 2026-07-24 as "all four spots"; the class-sweep grep during drafting found **five** expressions in three files — the fifth (`app/auth/callback/route.ts:31`) builds the same `new URL` against `request.url` through a local variable instead of inline, and sits in a file already in scope. Sweeping it is the ratified intent (fix the class, not the named instances), not a scope expansion. | This document, §3.1; `AGENTS.md` class-sweep rule ("Class-sweep before patching adversarial findings") |
| The `?gate=skip` atomicity guard at `app/show/[slug]/[shareToken]/page.tsx:324` is **NOT** modified. After sign-out the chain resolves to `first_contact`, which the existing guard already honors. P-R29 Fix-3 stays intact. | `app/show/[slug]/[shareToken]/page.tsx:319-324`; §4.3 below |
| The backlog's proposed fix for BL-PICKER-GATE-SKIP-MISMATCH ("let the gate reach the picker via `?gate=skip` when the session is present-but-cleared") is **rejected as insufficient**, not adopted. It is a one-shot query parameter, and `google_mismatch` is decided before the picker cookie is read, so it reaches the picker once and fails again on the next request. Reasoning in §4.2. | Root BACKLOG.md line 143; `lib/auth/picker/resolveShowPageAccess.ts:199-202` |
| `tests/e2e/picker-flow.spec.ts:293` (Admin Reset + Rotate) stays `test.skip`. Its blocker is share-token rotation helpers, outside this spec. | `tests/e2e/picker-flow.spec.ts:286-292` |
| `app/api/auth/google/start/route.ts:11` and `app/api/auth/google/start/route.ts:65` keep `NextResponse.redirect` with absolute URLs. Those targets are Google's OAuth endpoint and a Supabase-issued URL, not self-referential paths, so the host-flip class does not apply. | `app/api/auth/google/start/route.ts:11` |
| The `clearIdentity` export does **not** gain sign-out behavior. It has zero app call sites (verified 2026-07-24: only its own definition, a doc reference at `lib/crew/resolveActiveSection.ts:9`, and `tests/auth/picker/clearIdentity.test.ts`), and sign-out belongs only to the guest path. | `lib/auth/picker/clearIdentity.ts:48`; §4.4 |
| No DB work. No migration, no RPC, no advisory lock, no CHECK/enum change, no schema-manifest regeneration, no validation-project apply. The tier × domain, CHECK/enum migration, and flag-lifecycle matrices mandated by `docs/agents/spec-self-review.md` are **N/A — no DB surface and no boolean config field in this diff**. | §9 |
| Dimensional invariants and transition inventory are both N/A, declared explicitly in §5.1 and §5.2 rather than omitted. | §5.1, §5.2 |

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

Five expressions across three files carry this shape (verified by grep over `app/` and `lib/`, 2026-07-24). Sites 1 through 4 construct the `new URL` inline inside the `NextResponse.redirect(...)` argument; site 5 assigns it to a local variable first and redirects to that variable, which is the same class and is why the guard in §3.4 must match both forms.

| # | Site | Status | Path source |
| --- | --- | --- | --- |
| 1 | `app/api/auth/picker-bootstrap/route.ts:188` | 302 | `nextOutcome.path` (from `validateNextParamDetailed`) |
| 2 | `app/api/auth/picker-bootstrap/route.ts:210` | 302 | `nextOutcome.path`; the response also carries a `__Host-fxav_picker` cookie |
| 3 | `app/auth/callback/route.ts:16` (`redirectTo`) | caller-supplied, defaults 302 | caller-supplied |
| 4 | `app/auth/sign-out/route.ts:132` | 303 | literal `"/auth/sign-in"` |
| 5 | `app/auth/callback/route.ts:31` (`signInRedirect`) | 302 | literal sign-in path plus `code` and `next` search params set on the URL object |

### 3.2 The helper

A new file, lib/http/hostRelativeRedirect.ts, in a new lib/http/ directory (nothing under `lib/` currently owns HTTP-response construction):

```ts
export class InvalidRelativeRedirectPathError extends Error {}

export function hostRelativeRedirect(path: string, status?: number): NextResponse;
```

Behavior:

- Returns `new NextResponse(null, { status: status ?? 302, headers: { Location: path } })`. A relative `Location` is legal per RFC 7231 section 7.1.2 and is resolved by the browser against the request URL it actually used, so the host can never flip.
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
| `status` | supplied | used verbatim (303 at site 4) |

### 3.3 Application

- Sites 1, 2, 4: replace the `NextResponse.redirect(new URL(...))` expression with `hostRelativeRedirect(...)`, preserving each site's status (302, 302, 303). Site 2 keeps every subsequent `response.cookies` and `Set-Cookie` mutation unchanged — `NextResponse` supports them identically.
- Sites 3 and 5: `redirectTo` keeps its name, signature, and position in the file; only its body changes to `return hostRelativeRedirect(path, status)`. `signInRedirect` likewise keeps its name and signature, but builds its query with `URLSearchParams` instead of mutating a `URL` object, then returns `hostRelativeRedirect` with a sign-in path carrying that query string, at status 302. Both parameter values (`code`, `next`) stay percent-encoded exactly as `URLSearchParams` emits them.

  **Names are load-bearing.** `lib/audit/authChain.ts:130` looks up the first call named `redirect`, `redirectTo`, or `signInRedirect` and asserts it appears after `validateNextParamDetailed` or `validateNextParam`. Renaming either wrapper would make that lookup return `undefined`, and `lib/audit/authChain.ts:131` only reports when the redirect is truthy and earlier — so the audit would silently stop asserting anything. Both names therefore stay, and the ordering they encode stays.
- `app/auth/sign-out/route.ts` keeps its local `clearPickerCookie()` and `clearSupabaseAuthCookies(request, response)` calls inside `POST`, because `lib/audit/authChain.ts:170` greps the POST body text for `PICKER_COOKIE_NAME` and a `Max-Age=0` literal. Only line 132 changes.

### 3.4 Structural guard

A new test, tests/cross-cutting/no-absolute-self-redirect.test.ts, filesystem-walked over `app/**/*.ts` and `app/**/*.tsx` (fails-by-default for new files, matching the walker style of `tests/log/_metaMutationSurfaceObservability.test.ts`). It fails on any `NextResponse.redirect(` whose argument constructs a `new URL` against `request.url` or `req.url`, or which passes a variable assigned from such a construction in the same function. No allow-list rows: after this change, zero sites in `app/` use the shape, and `app/api/auth/google/start/route.ts:11` does not match because it redirects to externally-supplied absolute URLs, never to `request.url`.

Anti-tautology: the test's file list is derived by walking the tree, so reverting any one of the five fixes makes it fail. It additionally asserts it inspected a non-zero number of files, so a broken glob cannot pass vacuously.

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

1. Parse the form data (unchanged; `null` gives `{ ok: false, code: "PICKER_INVALID_INPUT" }`).
2. **Sign out.** `await (await createSupabaseServerClient()).auth.signOut()`, then clear any residual Supabase auth cookies. On a returned error or a thrown error: emit `log.error` with `code: "AUTH_SIGNOUT_FAILED"` and return `{ ok: false, code: "AUTH_SIGNOUT_FAILED" }` **without** redirecting and **without** clearing the picker entry.

   Both failure modes are real and distinct, so the whole step sits inside one `try`/`catch` whose `try` also destructures `{ error }` from the call: `createSupabaseServerClient` **throws** when `SUPABASE_URL` or the publishable key is unset (`lib/supabase/server.ts:41-45`), which happens before `auth.signOut()` is ever reached, and `auth.signOut()` itself returns `{ error }` on a network or gateway fault. Treating only one of the two would let a misconfigured environment redirect the user into a loop.
3. Clear the picker entry via the existing `clearIdentityCore(input)` (unchanged, `lib/auth/picker/clearIdentity.ts:64`). On `{ ok: false }`, return it as today.
4. Redirect to `buildShowReturnUrl(input.slug, input.shareToken, { s: input.s, gate: "skip" })` (unchanged, `lib/auth/picker/clearIdentity.ts:61`).

**Ordering rationale.** Sign-out runs *before* the picker clear so a sign-out failure leaves both pieces of state untouched — the user sees Mode B again and the tap is retryable, with no half-applied state. The reverse order would strand a cleared picker entry next to a live foreign session.

**Why this reaches the picker durably.** With the Google session gone, `validateGoogleSession` no longer returns `GOOGLE_NO_CREW_MATCH`, so `resolveShowPageAccess` falls through to `resolvePickerSelection`, which returns `no_selection` for a show with no entry, mapped to `{ kind: "no_auth", reason: "first_contact" }` at `lib/auth/picker/resolveShowPageAccess.ts:90`. The guard at `app/show/[slug]/[shareToken]/page.tsx:324` already honors `?gate=skip` for `first_contact`, so the picker renders. After the person taps a name, the next request has no Google session and a valid cookie entry, so the chain resolves to `resolved` and the show body renders — and keeps rendering across refreshes. **No change to `app/show/[slug]/[shareToken]/page.tsx`.**

**Cookie sweep.** `app/auth/sign-out/route.ts:49-59` already clears Supabase auth cookies belt-and-braces, matching the regex at `app/auth/sign-out/route.ts:51`. That regex and its matcher move to a new file, lib/auth/supabaseAuthCookieNames.ts, exporting `isSupabaseAuthCookieName(name: string): boolean`. Both consumers use it: the route's local `clearSupabaseAuthCookies(request, response)` keeps its name, signature, and body position (so the grep at `lib/audit/authChain.ts:170` and its `Max-Age=0` literal are untouched), and the Server Action gets a `cookies()`-store equivalent that sets `maxAge` to zero on each matching cookie with the same attributes the route uses (path `/`, `Secure`, `HttpOnly`, `SameSite=Lax`).

**Blast radius, stated plainly.** Sign-out is global to the device: that browser loses its Google session for every show and for `/admin`. Picker cookie entries for *other* shows survive (only this show's entry is deleted), so those shows still resolve from the cookie. An admin can never reach Mode B — `isAdminSession` short-circuits at `lib/auth/picker/resolveShowPageAccess.ts:192`, before the Google-mismatch branch at `lib/auth/picker/resolveShowPageAccess.ts:201` — so no admin session is destroyed by this path.

**Telemetry (invariant 10).** `clearIdentityAndSkip` is a non-admin exported action in a module-level `"use server"` file, so it is checked per function by `tests/log/_metaMutationSurfaceObservability.test.ts`. Its current `// no-telemetry:` exemption comment at `lib/auth/picker/clearIdentity.ts:56` is **replaced** by the code-carrying `log.error` emit from step 2, which satisfies the contract directly. `AUTH_SIGNOUT_FAILED` is an existing log-only code (`app/auth/sign-out/route.ts:106`, `app/auth/sign-out/route.ts:115`); it is deliberately **not** in `lib/messages/catalog.ts` and **not** in master-spec section 12.4 (verified by grep, 2026-07-24), so reusing it adds no catalog-parity lockstep. The success path keeps emitting `PICKER_IDENTITY_CLEARED` from `clearIdentityCoreImpl` (`lib/auth/picker/clearIdentity.ts:114`).

### 4.4 Copy

The mismatch prompt must now tell the person what the button does. `SIGN_IN_OR_SKIP_PROMPT_MISMATCH` changes from

> You're signed in with a Google account that isn't on this show's roster. Sign in with the account for this show, or continue as guest to pick from the roster.

to

> You're signed in with a Google account that isn't on this show's roster. Sign in with the account for this show, or continue as guest, which signs this device out of Google so you can pick your name from the roster.

No em-dash, straight apostrophes matching the existing rows, no jargon. The `followUp` value stays "Crew, sign out or continue as guest" exactly as it is today, which already described this semantic.

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
- `/auth/sign-in` reads `next` from its search params (`app/auth/sign-in/page.tsx:52`) and pre-validates it with `validateNextParam` (`app/auth/sign-in/page.tsx:72`), so the arriving value is validated exactly as it is today.

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
| tests/lib/hostRelativeRedirect.test.ts (new) | 302 default; supplied status honored; `Location` is exactly the input path with no origin; query strings survive; each rejected input in the §3.2 table throws `InvalidRelativeRedirectPathError` | A helper that re-absolutizes, drops the query, or accepts a protocol-relative path (open redirect) |
| tests/cross-cutting/no-absolute-self-redirect.test.ts (new) | No file under `app/` redirects to a `new URL` built from `request.url`; the walk visited a non-zero file count | Reintroduction of the shape in a new route; a broken glob passing vacuously |
| `tests/auth/picker/clearIdentity.test.ts` (extend) | `clearIdentityAndSkip` calls `auth.signOut()` **before** the picker-cookie write, clears each Supabase auth cookie, then redirects to `?gate=skip`; on a returned signOut error and on a thrown signOut error it returns `{ ok: false, code: "AUTH_SIGNOUT_FAILED" }`, emits that code, does **not** redirect, and leaves the picker cookie untouched; `clearIdentity` (non-skip) never signs out | Sign-out silently skipped; wrong order stranding a cleared entry beside a live session; a failure that still redirects and loops the user back to Mode B |
| tests/auth/supabaseAuthCookieNames.test.ts (new) | `isSupabaseAuthCookieName` matches `sb-abc-auth-token`, the numeric-shard and code-verifier variants; rejects `sb-abc-other`, `__Host-fxav_picker`, and a missing project segment | An over-broad matcher clearing unrelated cookies, or a narrowed one leaving a session shard behind |
| `tests/components/PickerInterstitial.test.tsx` (extend) | The claimed row's form has `action="/auth/sign-in"`, `method="GET"`, and a hidden `next` input whose value equals `buildShowReturnUrl(...)`; the action attribute carries **no** query string; with `s` supplied the hidden value carries the section; with a bogus `s` it does not | The regression itself, and a "fix" that leaves `next` in the action as well, which would look right in the DOM and still be discarded |
| `tests/components/SignInOrSkipGate.test.tsx` (extend) | Mode B renders the amended `SIGN_IN_OR_SKIP_PROMPT_MISMATCH` copy via `messageFor`, with the label still "Continue as guest" | Copy edited in the catalog but not surfaced, or surfaced from a hardcoded string |

Anti-tautology notes: the `PickerInterstitial` assertion reads the form's `action` attribute and the hidden input **separately**, so a form that keeps the query in its action cannot pass. The expected `next` value is derived by calling `buildShowReturnUrl` with the same fixture inputs rather than hardcoding a path, so a change to that builder cannot leave a stale literal passing. The `clearIdentity` order assertion records call order into one shared array rather than asserting each mock was merely called, so a correct-calls, wrong-order implementation fails.

### 6.2 End-to-end

Un-skip three stubs in `tests/e2e/picker-flow.spec.ts` (they run under the `mobile-safari` project, `playwright.config.ts:54`, whose `testMatch` at `playwright.config.ts:62` already includes `picker-flow`):

- `tests/e2e/picker-flow.spec.ts:84` first-contact, then Google, then the show body renders (Fix 1)
- `tests/e2e/picker-flow.spec.ts:180` Mode B "Continue as guest", then the picker (Fix 2). Its existing assertions still hold: the `?gate=skip` URL, `picker-interstitial-root` visible, and Alice's entry gone from the picker cookie. One assertion is **added**: the Supabase auth cookies are gone from the browser context, which is the new contract.
- `tests/e2e/picker-flow.spec.ts:241` claimed row, then `/auth/sign-in` carrying `next` (Fix 3)

`tests/e2e/picker-flow.spec.ts:293` stays skipped. The stale comment at `playwright.config.ts:56` ("The 5 `.skip` stubs") is corrected to name the one remaining stub; the file currently holds four (verified 2026-07-24: `grep -c "test.skip"` returns 4), so the comment was already wrong by one before this change.

Local run note: `TEST_DATABASE_URL` in the shared `.env.local` is non-loopback (preflight warns), so the mutating picker-flow e2e is run with it overridden to the loopback URL.

### 6.3 Gates before push

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (full suite, not a scoped subset), `pnpm test:audit:x1-catalog-parity`, `pnpm test:audit:x3-trust-domain` (baseline captured green at 26 tests on 2026-07-24 before any edit), the three un-skipped e2e stubs, and the invariant-8 impeccable critique and audit pair on the `_PickerInterstitial.tsx` diff.

---

## 7. Files touched

| File | Change |
| --- | --- |
| lib/http/hostRelativeRedirect.ts | new — helper, guard, error class |
| lib/auth/supabaseAuthCookieNames.ts | new — `isSupabaseAuthCookieName` |
| `app/api/auth/picker-bootstrap/route.ts` | two redirect expressions (lines 188 and 210) |
| `app/auth/callback/route.ts` | bodies of `redirectTo` (line 16) and `signInRedirect` (line 31); names kept |
| `app/auth/sign-out/route.ts` | redirect at line 132; local cookie matcher delegates to the new helper |
| `lib/auth/picker/clearIdentity.ts` | sign-out step and failure emit in `clearIdentityAndSkip` |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` | claimed-row form; `signInRecoveryUrl` removed |
| `lib/messages/catalog.ts` | `SIGN_IN_OR_SKIP_PROMPT_MISMATCH.crewFacing` |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | the section-12.4 row at line 3082 |
| `lib/messages/__generated__/spec-codes.ts` | regenerated by `pnpm gen:spec-codes` |
| tests | per §6 |
| `playwright.config.ts` | stub-count comment |
| root BACKLOG.md and BACKLOG-archive.md | the three entries and their section header (lines 129-149) move to the archive with a resolution note |

## 8. Out of scope

- Durable guest mode in any form (§1.1).
- The Admin Reset and Rotate e2e stub (`tests/e2e/picker-flow.spec.ts:293`).
- Any change to `app/show/[slug]/[shareToken]/page.tsx`, `lib/auth/picker/resolveShowPageAccess.ts`, or `lib/auth/validateGoogleSession.ts`.
- Telemetry for the crew picker beyond the one failure emit — BL-CREW-PICKER-OBSERVABILITY still owns that surface (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:37`).
- `app/api/auth/google/start/route.ts`.

## 9. Invariant checklist

| Invariant | Application |
| --- | --- |
| 1 — TDD per task | Every task in §6 is test-first |
| 2 — advisory lock | N/A — no mutation of `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions` |
| 3 — email canonicalization | N/A — no raw email crosses a boundary in this diff |
| 4 — no global cursor | N/A |
| 5 — no raw error codes in UI | The one new user-visible string is a catalog row read through `messageFor`; the failure code is log-only and never rendered |
| 6 — commit per task | Conventional commits, one per task, scopes `auth`, `crew-page`, `infra` |
| 7 — spec is canonical | This spec adds a section-12.4 row edit through the mandated lockstep; no other spec text is superseded |
| 8 — UI quality gate | `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` is a UI surface: impeccable critique and audit pair, findings and dispositions recorded in the PR body. `app/auth/sign-out/route.ts` and `app/api/**` routes are not UI surfaces per the invariant's own carve-out |
| 9 — Supabase call-boundary discipline | The new `auth.signOut()` call destructures `{ error }`, distinguishes returned from thrown errors, and surfaces the fault as the typed `{ ok: false, code: "AUTH_SIGNOUT_FAILED" }` result rather than continuing silently — mirroring `app/auth/sign-out/route.ts:102` |
| 10 — mutation-surface observability | `clearIdentityAndSkip` swaps its `// no-telemetry:` exemption for a code-carrying emit (§4.3). Non-admin surface, so no `AUDITABLE_MUTATIONS` row is required |
| 11 — isolated worktree | Work is in `../FX-worktrees/picker-flow-app-bugs` off `origin/main`; `pnpm install`, `pnpm worktree:link-env`, and `pnpm preflight` all ran green before drafting |
