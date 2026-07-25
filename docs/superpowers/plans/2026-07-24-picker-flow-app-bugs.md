# Picker-flow App Bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three app behaviors blocking three `test.skip` stubs in `tests/e2e/picker-flow.spec.ts` — self-referential redirects that flip the host and drop the auth cookie, a "Continue as guest" control that cannot reach the picker, and a claimed-row GET form that discards its return target — then un-skip those stubs and wire them into CI.

**Architecture:** One new host-relative redirect helper replaces six `new URL(..., request.url)` redirect expressions across four route files, pinned by an AST-based structural guard. The guest Server Action gains input validation and a same-origin gate ahead of any mutation, then clears the picker entry, then signs the browser out with `{ scope: "local" }`. The claimed-row form moves `next` from its action query into a hidden input. No DB, no RPC, no advisory lock, no migration.

**Tech Stack:** Next 16 App Router (route handlers + Server Actions), Supabase Auth (`@supabase/auth-js` 2.105.1), Vitest (node environment), the `typescript` compiler API for the structural guard, Playwright (`mobile-safari` project, baseline server on `E2E_PORT`).

**Spec:** `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` (2 adversarial rounds; §1.1 resolved-scope table binds, §10 and §11 record every finding and disposition).

## Global Constraints

- Invariant 1: TDD per task — failing test, then implementation. Invariant 6: one conventional commit per task.
- Invariant 5: no raw error codes in UI. The one new user-visible string is a catalog row read through `messageFor`; `AUTH_SIGNOUT_FAILED` is log-only and never rendered.
- Invariant 9: the new `auth.signOut` call destructures `{ error }`, distinguishes returned from thrown faults, and returns a typed discriminable result. The registry row **and** an exact-pattern destructuring assertion both land in Task 4 (R2 finding 5 — the row alone only proves the constructor sits inside a `try`).
- Invariant 8: three files in this diff are UI surfaces (any `app/` file outside `app/api/**`) — `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts`. All three go through the impeccable pair in Task 10.
- Invariant 11: all work in this worktree (`/Users/ericweiss/FX-worktrees/picker-flow-app-bugs`), branch `fix/picker-flow-app-bugs`. Stage 0 is already complete: worktree off `origin/main`, `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight` all green before any task. No task re-runs setup.
- `app/show/[slug]/[shareToken]/page.tsx` is NOT edited. The `?gate=skip` atomicity guard at line 324 stays exactly as it is.
- The master spec is never run through Prettier.
- `tests/e2e/picker-flow.spec.ts:293` stays `test.skip` (test-infra fixture contention, not app behavior).

## Meta-test inventory (declared)

- **CREATES** tests/cross-cutting/no-absolute-self-redirect.test.ts — AST-based structural guard banning self-referential redirects under `app/`, filesystem-walked so a new route fails by default.
- **CREATES** tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts — structural pin that the picker-flow spec is named in a CI workflow, so the un-skipped cases cannot go dark again (R2 finding 4).
- **EXTENDS** `tests/auth/_metaInfraContract.test.ts` — a `lib/auth/picker/clearIdentity.ts` row in `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (rows at `tests/auth/_metaInfraContract.test.ts:219-232`) **plus** a per-file destructuring assertion in the same describe, mirroring the sign-out precedent at `tests/auth/_metaInfraContract.test.ts:290-293`.
- **Not applicable, with reasons:** advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` anywhere in the diff; sentinel-hiding and admin-alert-catalog meta-tests — no tile rendering, no `admin_alerts.upsert`; no-inline-email-normalization — no email handling. `tests/log/_metaMutationSurfaceObservability.test.ts` is not edited, but Task 4 changes how `clearIdentityAndSkip` satisfies it, so it is re-run in that task's gate.
- **Layout-dimensions task:** not applicable — spec §5.1 declares no dimensional invariants (a hidden input is `display: none` and contributes no box).
- **Transition-audit task:** not applicable — spec §5.2 declares no visual-state change in either touched component.

## Pre-draft verification transcript

Every claim below was grepped in this worktree on 2026-07-24. Findings that changed the task list:

| Claim | Verified |
| --- | --- |
| Six `request.url`-derived redirect expressions | `app/api/auth/picker-bootstrap/route.ts:188`, `app/api/auth/picker-bootstrap/route.ts:210`, `app/auth/callback/route.ts:16`, `app/auth/callback/route.ts:31`, `app/auth/sign-out/route.ts:132`, and `app/api/auth/google/start/route.ts:11` (built at `app/api/auth/google/start/route.ts:8`). Only `app/api/auth/google/start/route.ts:65` is external |
| Next treats exactly five statuses as redirects | installed Next build, spec-extension/response.js lines 7-13: `REDIRECTS = new Set([301, 302, 303, 307, 308])` |
| `signOut` defaults to global scope | installed `@supabase/auth-js` 2.105.1, GoTrueClient.js line 3176: `async signOut(options = { scope: 'global' })` |
| Same-origin gate precedent | `app/auth/sign-out/route.ts:78-87` — a present `sec-fetch-site` other than `same-origin` or `none` is a decisive reject |
| Validation currently sits downstream of the destructive step | regexes at `lib/auth/picker/clearIdentity.ts:74-80`, inside `clearIdentityCoreImpl` |
| `clearIdentity` (non-skip) has exactly one caller | `components/auth/IdentityChip.tsx:23` — the identity chip's "not me" control. Must NOT gain sign-out |
| The `authChain` redirect-ordering audit is dead code | `auditM5AuthFile` (`lib/audit/authChain.ts:177`) has no callers; the live X.3 audit is `auditProjectAuthChains` (`lib/audit/authPrimitives.ts:815`), which has no redirect rule. Wrapper names are kept for minimal diff, not gate compliance |
| The `typescript` compiler API is already an audit dependency | `lib/audit/authChain.ts:1` imports it |
| CI does not run picker-flow | `.github/workflows/crew-e2e.yml:104-105` runs exactly `pnpm exec playwright test --project=mobile-safari tests/e2e/crew-section-toggle.spec.ts`. `testMatch` membership (`playwright.config.ts:62`) is not workflow wiring |
| The shared `locationOf` helper is used by the external assertion | helper at `tests/auth/oauth-flow.test.ts:25-29`, used by the deliberately-absolute `tests/auth/oauth-flow.test.ts:66` — so it must NOT gain a leading-slash assertion |
| Both new unit test files need no config wiring | `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`); `tests/lib/**` is in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:77`), `tests/cross-cutting/**` is not, so the walkers run serial |
| `picker-flow.spec.ts` already has two active tests | `tests/e2e/picker-flow.spec.ts:70` and `tests/e2e/picker-flow.spec.ts:134`. After un-skipping three, the file is **five passing and one skipped**, not three and one (R2 finding 10) |
| Baseline audit state | `pnpm test:audit:x3-trust-domain` → 5 files, 26 tests, green, before any edit |

## e2e harness-readiness checklist

- **Server boot:** the `mobile-safari` project (`playwright.config.ts:54`) runs against the baseline `webServer` at `playwright.config.ts:216`, bound explicitly to `127.0.0.1` on `E2E_PORT` (default `3000`, `playwright.config.ts:8`), carrying `ENABLE_TEST_AUTH` and `TEST_AUTH_SECRET`.
- **Readiness gate:** each stub awaits a testid-visibility assertion after `page.goto(..., { waitUntil: "networkidle" })` — `sign-in-or-skip-gate`, `picker-interstitial-root`, or `crew-shell`. The visibility assertion, never `networkidle` alone, gates the first interaction. `signInAs` (`tests/e2e/helpers/signInAs.ts:43`) posts through `page.request` so `Set-Cookie` lands on the same context before the first `goto`.
- **Detach safety:** no stub samples geometry or calls `locator.evaluate` on a node that can unmount. The only navigation-crossing wait is `page.waitForURL`, detach-safe by construction.
- **Local run:** `TEST_DATABASE_URL` in the shared `.env.local` is non-loopback (preflight warns), so these mutating specs run with it overridden to loopback. Port 3000 is checked for an existing listener and never blanket-killed.

---

### Task 1: `hostRelativeRedirect` helper

**Files:**

- Create: lib/http/hostRelativeRedirect.ts
- Create: tests/lib/hostRelativeRedirect.test.ts

**Steps:**

- [ ] Write the failing test. Assertions and the failure mode each catches:

  | Assertion | Catches |
  | --- | --- |
  | `hostRelativeRedirect("/admin")` → status 302, `Location` exactly `/admin` | A helper that re-absolutizes the path — the whole bug |
  | `hostRelativeRedirect("/auth/sign-in", 303)` → status 303 | A hardcoded status, breaking the sign-out contract |
  | `Location` for `/show/a/b?s=budget&gate=skip` is byte-identical | Query loss, dropping the section deep-link |
  | Body is `null` and `Location` is present | A redirect that leaks a body |
  | Each of 301, 302, 303, 307, 308 is accepted | An over-tight allow-list breaking a legitimate caller |
  | Each of `null`, `NaN`, `302.5`, 200, 300, 304, 399 throws | A `??` default turning `null` into 302; a `Location` on a status browsers do not follow |
  | Each of `undefined`, `null`, the empty string, a bare `foo`, a protocol-relative path, an absolute `https` URL, a backslash-bearing path, and a control-character-bearing path throws | Open redirect via protocol-relative or absolute path; a guard checking only the first character |

- [ ] Implement:

  ```ts
  import { NextResponse } from "next/server";

  export class InvalidRelativeRedirectPathError extends Error {}

  // Exactly the set Next itself treats as a redirect (spec-extension/response.js).
  const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

  export function hostRelativeRedirect(path: string, status = 302): NextResponse {
    if (typeof path !== "string" || path.length === 0) {
      throw new InvalidRelativeRedirectPathError("path must be a non-empty string");
    }
    if (path[0] !== "/" || path[1] === "/") {
      throw new InvalidRelativeRedirectPathError("path must start with exactly one slash");
    }
    if (path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) {
      throw new InvalidRelativeRedirectPathError("path carries an illegal character");
    }
    if (!REDIRECT_STATUSES.has(status)) {
      throw new InvalidRelativeRedirectPathError(`status is not a redirect: ${String(status)}`);
    }
    return new NextResponse(null, { status, headers: { Location: path } });
  }
  ```

  Strict-tsconfig note: under `noUncheckedIndexedAccess`, `path[0]` and `path[1]` are `string | undefined`; comparing them to string literals is well-typed with no non-null assertion.

- [ ] Gate: `pnpm vitest run tests/lib/hostRelativeRedirect.test.ts`; `pnpm typecheck`.
- [ ] Commit: `feat(infra): add a host-relative redirect helper`

### Task 2: apply the helper to all six sites, plus the structural guard

**Files:**

- Create: tests/cross-cutting/no-absolute-self-redirect.test.ts
- Modify: `app/api/auth/picker-bootstrap/route.ts` (lines 188, 210)
- Modify: `app/auth/callback/route.ts` (`redirectTo` at line 16, `signInRedirect` at line 31)
- Modify: `app/auth/sign-out/route.ts` (line 132 only)
- Modify: `app/api/auth/google/start/route.ts` (`signInRedirect` at lines 7-12; line 65 untouched)
- Modify: `tests/auth/oauth-flow.test.ts`, `tests/auth/callback-claim-stamp.test.ts`, `tests/auth/picker-bootstrap.test.ts`

**Steps:**

- [ ] Write the failing guard test with the three layers spec §3.4 requires. The matcher is an exported pure function over a `ts.SourceFile`, so layer 1 exercises it directly:

  1. **Fixtures.** Positives: inline `NextResponse.redirect(new URL(p, request.url))`; variable-assigned `const url = new URL(p, request.url); return NextResponse.redirect(url)`; the `req.url` spelling of each; an alias chain (`const a = new URL(p, request.url); const b = a; return NextResponse.redirect(b)`); a captured base (`const base = request.url; return NextResponse.redirect(new URL(p, base))`). Negatives that must NOT flag: `NextResponse.redirect(data.url)`; `new URL(p, "https://fixed.example")`; a two-argument `new URL(p, request.url)` never passed to a redirect; the one-argument parse form `new URL(request.url)`.
  2. **Tree walk.** The same matcher over every `.ts` and `.tsx` under `app/`; flagged list must be empty. This fails before the fix and after any revert, and it is also what proves the matcher is not over-broad: the tree holds four legitimate constructions that never reach a redirect (`app/api/auth/picker-bootstrap/route.ts:145`, `app/api/admin/venue-map/route.ts:21`, `app/api/cron/notify/route.ts:63` — one-argument parses — and `app/api/auth/google/start/route.ts:44`, the two-argument OAuth `redirectTo`).
  3. **Coverage floor.** The walk visited more than 50 files.

- [ ] Migrate the thirteen absolute-`Location` assertions. Each is a deliberate edit, not a loosening — the contract is what changed:

  | Site | Current | Migration |
  | --- | --- | --- |
  | `tests/auth/picker-bootstrap.test.ts:194` | `new URL(res.headers.get("location") ?? "").pathname` | **Hard failure, not a mismatch:** `new URL` on a relative string with no base throws. Compare the header to the expected path directly |
  | `tests/auth/oauth-flow.test.ts:124` and its siblings at lines 135, 146, 157 | `toBe("https://crew.fxav.test/me")` | `toBe("/me")` |
  | `tests/auth/oauth-flow.test.ts:175` | `toBe("https://crew.fxav.test/admin")` | `toBe("/admin")` |
  | `tests/auth/oauth-flow.test.ts:191` | `toBe("https://crew.fxav.test/admin/dev")` | `toBe("/admin/dev")` |
  | `tests/auth/oauth-flow.test.ts:205` | `toBe("https://crew.fxav.test/me/profile")` | `toBe("/me/profile")` |
  | `tests/auth/oauth-flow.test.ts:308` | `toBe("https://crew.fxav.test/auth/sign-in")` (the sign-out 303) | `toBe("/auth/sign-in")` |
  | `tests/auth/oauth-flow.test.ts:78-80` | absolute sign-in URL with `code=OAUTH_REDIRECT_INVALID&next=%2Fadmin` | drop the origin, keep the query byte-for-byte |
  | `tests/auth/oauth-flow.test.ts:245-247` | same shape with `OAUTH_STATE_INVALID` and the tokenized show path | drop the origin, keep the query |
  | `tests/auth/oauth-flow.test.ts:259-261` | same shape with `OAUTH_REDIRECT_INVALID` | drop the origin, keep the query |
  | `tests/auth/callback-claim-stamp.test.ts:84` | `toBe("https://crew.fxav.test/me")` | `toBe("/me")` |

  `tests/auth/oauth-flow.test.ts:66` (`https://accounts.google.test/oauth`) stays absolute — the external Google endpoint at `app/api/auth/google/start/route.ts:65`. `tests/auth/callback-oauth-telemetry.test.ts:111` uses `toContain("OAUTH_STATE_INVALID")` and survives unchanged.

  **Do NOT add a leading-slash assertion to the shared `locationOf` helper** (`tests/auth/oauth-flow.test.ts:25-29`) — line 66 uses that same helper and would break (R2 finding 6). Add a separate `relativeLocationOf` for the migrated cases, asserting the value starts with exactly one `/` before returning it, so a future re-absolutization fails on every migrated case rather than only where a literal is compared.

- [ ] Implement: replace the six expressions per spec §3.3. `redirectTo` and both `signInRedirect` helpers keep their names, signatures, and positions; each `signInRedirect` builds its query with `URLSearchParams`. `app/auth/sign-out/route.ts` changes line 132 only, leaving `clearPickerCookie()` and `clearSupabaseAuthCookies(request, response)` in place.
- [ ] Gate: the new guard test; `pnpm vitest run tests/auth tests/api`; `pnpm test:audit:x3-trust-domain`; `pnpm typecheck`. The x3 gate does **not** cover the redirect-ordering expectation in `lib/audit/authChain.ts` — that function is unreferenced, so the wrapper names are preserved by review, not by a gate.
- [ ] Commit: `fix(auth): emit host-relative redirects so the auth cookie survives`

### Task 3: shared Supabase auth-cookie matcher

**Files:**

- Create: lib/auth/supabaseAuthCookieNames.ts
- Create: tests/auth/supabaseAuthCookieNames.test.ts
- Modify: `app/auth/sign-out/route.ts` (the name test inside `clearSupabaseAuthCookies`, line 51)

**Steps:**

- [ ] Write the failing test: matches `sb-abc-auth-token`, `sb-abc-auth-token.0`, `sb-abc-auth-token.1`, `sb-abc-auth-token-code-verifier`, `sb-abc-auth-token-code-verifier.0`; rejects `sb-abc-other`, `__Host-fxav_picker`, `sb--auth-token`, `sb-abc-auth-token-extra`, and the empty string. Catches an over-broad matcher clearing unrelated cookies and a narrowed one leaving a session shard behind.
- [ ] Implement `isSupabaseAuthCookieName`, moving the regex verbatim from `app/auth/sign-out/route.ts:51`. The route's helper keeps its name, signature, and position and delegates only the name test; its `Max-Age=0` literal stays inline.
- [ ] Gate: the new test; `pnpm vitest run tests/auth`; `pnpm test:audit:x3-trust-domain`.
- [ ] Commit: `refactor(auth): share the Supabase auth-cookie name matcher`

### Task 4: "Continue as guest" signs out

**Files:**

- Modify: `lib/auth/picker/clearIdentity.ts`
- Modify: `tests/auth/picker/clearIdentity.test.ts`
- Modify: `tests/auth/_metaInfraContract.test.ts` (registry row + destructuring assertion)

**Mock-shape trap:** the test file's current factory is `vi.mock("next/headers", () => ({ cookies: vi.fn() }))` (`tests/auth/picker/clearIdentity.test.ts:23`). A `vi.mock` factory **replaces** the module, so the new factory must export `headers` **and** `cookies` together or every existing cookie assertion breaks. Copy the shape at `tests/auth/isCurrentUserDeveloper.test.ts:39`, which exports both from one factory with the source hoisted via `vi.hoisted`.

**Steps:**

- [ ] Write the failing tests:

  | Assertion | Catches |
  | --- | --- |
  | A shared `calls: string[]` records `"cookieSet"` then `"signOut"`, asserted as `calls.indexOf("cookieSet") < calls.indexOf("signOut")` | The reversed order, which on a picker-clear failure strands a live foreign session beside a stale identity and exposes it |
  | `signOut` called with exactly `{ scope: "local" }` | The library default `{ scope: 'global' }`, revoking a colleague's sessions on all their devices |
  | Malformed slug, share-token, or show-id → `PICKER_INVALID_INPUT`, **zero** `createSupabaseServerClient` calls **and zero** cookie writes | Validation left downstream, so a malformed submission mutates state before reporting the error |
  | Each accepted origin shape (`sec-fetch-site: same-origin`; `none`; absent with no `origin`; absent with matching `origin`) proceeds | An over-tight gate breaking the real form post |
  | Each rejected shape (`cross-site`; `same-site`; absent `sec-fetch-site` with mismatched `origin`; absent `host`) → `PICKER_INVALID_INPUT` with **zero** cookie writes and zero client constructions | The fall-through hole R2 finding 3 found — `cross-site` plus a matching `origin` being accepted — and a gate that clears the picker before checking |
  | `clearIdentityCore` infra failure returns before any sign-out attempt | A picker-clear failure that still destroys the session |
  | Every cookie satisfying `isSupabaseAuthCookieName` set with `maxAge: 0`; `__Host-fxav_picker` not cleared by that sweep | A sweep that misses a shard, or one that eats the picker cookie |
  | Happy path throws the `NEXT_REDIRECT` digest carrying `?gate=skip` | Losing the redirect, leaving a blank action response |
  | Each of `signOut` returning `{ error }`, the constructor throwing, and the cookie sweep throwing → `{ ok: false, code: "AUTH_SIGNOUT_FAILED" }`, emits that code, throws **no** `NEXT_REDIRECT` | A failure that still redirects and loops the person back to Mode B; handling only one of three real failure shapes |
  | `clearIdentity` (non-skip) never constructs a Supabase client | Scope creep into the identity-chip "not me" path |

- [ ] Add the invariant-9 pins in the same commit: a `lib/auth/picker/clearIdentity.ts` row in `SUPABASE_CONSTRUCTOR_CONTRACT_FILES`, **plus** a destructuring assertion in the same describe, mirroring `tests/auth/_metaInfraContract.test.ts:290-293`:

  ```ts
  test("clearIdentityAndSkip destructures signOut returned-error", () => {
    const source = readFileSync("lib/auth/picker/clearIdentity.ts", "utf8");
    expect(source).toMatch(
      /const\s+\{\s*error\s*\}\s*=\s*await\s+supabase\.auth\.signOut\(\{\s*scope:\s*"local"\s*\}\)/,
    );
  });
  ```

  Without it the registry only proves the constructor sits inside a `try`, so `const result = await signOut(...); result.error` would pass while violating invariant 9 (R2 finding 5).

- [ ] Implement spec §4.3's five steps: validate (hoisting the regexes at `lib/auth/picker/clearIdentity.ts:74-80` into a shared exported predicate used by both `clearIdentityAndSkip` and `clearIdentityCoreImpl`, so the two cannot drift), same-origin gate per spec §4.3's five-row table with the derived origin from `x-forwarded-proto` / `x-forwarded-host` / `host`, picker clear, device-local sign-out, redirect. Keep the `// no-telemetry:` comment at `lib/auth/picker/clearIdentity.ts:56` and add the code-carrying `log.error`.
- [ ] Gate: the extended tests; `pnpm vitest run tests/auth tests/log`; `pnpm test:audit:x3-trust-domain`; `pnpm typecheck`.
- [ ] Commit: `fix(auth): sign the device out when crew continue as guest`

### Task 5: mismatch prompt copy, three-way lockstep

**Files:**

- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (the section-12.4 row at line 3082)
- Modify: `lib/messages/catalog.ts` (`crewFacing` at line 3496)
- Regenerate: `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes`
- Modify: `tests/components/SignInOrSkipGate.test.tsx`

**Steps:**

- [ ] Write the failing test. It must **not** derive its expectation from `messageFor` or the catalog — an expectation read from the production lookup passes before the catalog edit, giving no red phase, and cannot distinguish a hardcoded component string (R2 finding 9). Instead:

  ```ts
  // Duplicated on purpose: this literal IS the red phase, and it is what proves the
  // rendered sentence is not merely "whatever the catalog happens to say".
  const EXPECTED_MISMATCH_PROMPT =
    "You're signed in with a Google account that isn't on this show's roster. " +
    "Sign in with the account for this show, or continue as guest, which signs " +
    "this device out so you can pick your name from the roster.";
  ```

  Three assertions: the rendered Mode B gate contains `EXPECTED_MISMATCH_PROMPT`; `messageFor("SIGN_IN_OR_SKIP_PROMPT_MISMATCH").crewFacing` equals `EXPECTED_MISMATCH_PROMPT` (so a component hardcoding a drifted string fails); and the CTA label is still exactly `Continue as guest`.

- [ ] Implement all three lockstep updates **in one commit**: the section-12.4 prose row, the regenerated file, and the catalog field. Wording is fixed in spec §4.4 — it says "signs this device out", never "out of Google", and `followUp` stays byte-identical, arrow included.
- [ ] Gate: `pnpm test:audit:x1-catalog-parity`; the extended component test; `pnpm vitest run tests/messages tests/components`.
- [ ] Commit: `fix(auth): say that continuing as guest signs the device out`

### Task 6: claimed-row form keeps `next`

**Files:**

- Modify: `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` (remove the const at line 88, rewrite the form at line 156)
- Modify: `tests/components/PickerInterstitial.test.tsx`

**Steps:**

- [ ] Write the failing test: the claimed row's form has `action="/auth/sign-in"` and `method="GET"`; a hidden input named `next` whose value equals `buildShowReturnUrl(slug, shareToken, { s })` computed in the test from the same fixture inputs; the `action` attribute carries **no** `?`; with `s` supplied the hidden value carries the section; with a bogus `s` it does not. Reading the action and the hidden input **separately** is what stops a "fix" that leaves `next` in both places from passing.
- [ ] Implement per spec §5:

  ```tsx
  <form action="/auth/sign-in" method="GET">
    <input type="hidden" name="next" value={buildShowReturnUrl(slug, shareToken, { s })} />
  ```

  The value is the raw path; the browser percent-encodes it on submit. Everything else on the row is unchanged.

- [ ] Gate: the extended component test; `pnpm vitest run tests/components tests/show`; `pnpm lint`; `pnpm typecheck`.
- [ ] Commit: `fix(crew-page): keep the return target on claimed-row sign-in`

### Task 7: un-skip the three e2e stubs

**Files:**

- Modify: `tests/e2e/picker-flow.spec.ts` (lines 84, 180, 241)
- Modify: `playwright.config.ts` (the stale stub-count comment at line 56)

**Steps:**

- [ ] Drop `.skip` at the three sites and delete each stub's now-stale `// SKIP:` comment block.
- [ ] Extend the guest case (`tests/e2e/picker-flow.spec.ts:180`) with the three added assertions from spec §6.2: no cookie satisfying `isSupabaseAuthCookieName` remains in the context; tapping the **unclaimed** row (Bob) renders `crew-shell` with his identity chip; a bare reload with no `?gate=skip` still renders `crew-shell`. That last step is the durability proof — without it a one-request-only fix passes, which is the design spec §4.2 rejects.
- [ ] Correct the comment at `playwright.config.ts:56` to name the single remaining stub.
- [ ] Gate: `pnpm exec playwright test --project=mobile-safari tests/e2e/picker-flow.spec.ts` with `TEST_DATABASE_URL` overridden to loopback. Expected result: **five passed, one skipped** — the file already carries two active tests at `tests/e2e/picker-flow.spec.ts:70` and `tests/e2e/picker-flow.spec.ts:134`.
- [ ] Commit: `test(auth): un-skip the three picker-flow stubs their fixes unblocked`

### Task 8: wire the picker-flow spec into CI

**Files:**

- Modify: `.github/workflows/crew-e2e.yml` (the mobile-safari run step at lines 104-105)
- Create: tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts

**Rationale:** un-skipping is not enough. The only mobile-safari CI step names exactly one spec file, so the three regressions would stay dark and "real CI green" could pass without ever executing them (R2 finding 4).

**Steps:**

- [ ] Write the failing structural pin: read `.github/workflows/crew-e2e.yml` and assert `tests/e2e/picker-flow.spec.ts` appears in a `playwright test` command line. Failure mode it catches: a future edit that drops the spec from the run and silently un-covers all four cases.
- [ ] Add the spec to the existing mobile-safari step's file list (same `--project=mobile-safari` invocation, so no new job and no second server boot).
- [ ] Gate: the new pin; `pnpm vitest run tests/cross-cutting`; confirm the workflow still parses with `pnpm exec js-yaml .github/workflows/crew-e2e.yml > /dev/null` (or the repo's existing workflow-lint gate if one covers it).
- [ ] Commit: `ci(auth): run the picker-flow e2e spec in the mobile-safari job`

### Task 9: close the backlog entries

**Files:**

- Modify: root `BACKLOG.md` (the three entries and their section header, lines 129-149)
- Modify: `BACKLOG-archive.md`

**Steps:**

- [ ] Move the three entries and their header into the archive with a one-line resolution note naming this branch, keeping the surrounding `---` separators well-formed. Use a file edit, never `echo >>`; verify with `git diff`.
- [ ] Gate: `pnpm format:check`; `pnpm vitest run tests/docs`.
- [ ] Commit: `docs: archive the three shipped picker-flow backlog entries`

### Task 10: invariant-8 impeccable dual-gate

**Steps:**

- [ ] Pre-code mechanical checklist first, so the gate verifies rather than discovers: no em-dash in user-visible copy (Task 5's sentence), straight apostrophes, `min-h-tap-min` still on the claimed row, canonical type and token classes unchanged, no new color token.
- [ ] Run `/impeccable critique` **and** `/impeccable audit` over all three UI-surface files — `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts` — with the canonical v3 setup gates (the context.mjs context load of PRODUCT.md and DESIGN.md, then the register reference read). Both commands run with subagents, never inline.
- [ ] Fix or explicitly defer every P0 and P1 with a `DEFERRED.md` entry; record all findings and dispositions in §12 below and in the PR body.

### Task 11: full pre-push gates

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (full suite — a scoped subset misses registry suites), `pnpm test:audit:x1-catalog-parity`, `pnpm test:audit:x3-trust-domain`, and the Task 7 e2e run. Check the shell exit status, not the "Tests" line: Vitest exits 1 on uncaught errors even when every test passes.

### Task 12: whole-diff adversarial review (cross-model)

- [ ] Dispatch a fresh-eyes Codex review of the whole diff through `scripts/codex-guard.mjs`, split by surface if the diff risks the brief-size cliff. The brief carries: REVIEWER ONLY, fresh-eyes posture, the do-not-relitigate list from spec §1.1, the verification transcript, and the `VERDICT:` instruction. Iterate to APPROVE.

### Task 13: ship

- [ ] Push, open the PR with the spec summary and the impeccable dispositions, wait for **real CI green** (not just local), `gh pr merge --merge`, fast-forward local `main`, and verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## Task order and dependencies

1 → 2 (the helper must exist before its call sites). 3 → 4 (the matcher before the sweep that uses it). 5 and 6 are independent of each other and of 1 through 4. 7 depends on 2, 4, and 6 — all three app fixes must land before the stubs can pass. 8 depends on 7 (the spec must be green locally before CI runs it). 9 depends on 7 so the archive note can name the un-skipped tests. **10 depends on 2 and 6**, since Task 2 edits two of the three UI-surface files (R2 finding 7 — an earlier revision made Task 10 depend on Task 6 alone). 11 through 13 are the close-out sequence, in order.

## Risks

| Risk | Mitigation |
| --- | --- |
| The un-skipped e2e cases stay dark in CI | Task 8 wires them into the existing job and pins the wiring with a structural test |
| The invariant-9 registry row passes without pinning the call boundary | Task 4 adds the exact-pattern destructuring assertion alongside the row |
| An assertion migration silently weakens coverage | All thirteen are enumerated with per-site migrations; `relativeLocationOf` adds the leading-slash assertion without touching the shared helper the external case uses |
| Renaming a redirect wrapper disarms a dormant audit | Names are pinned in spec §3.3; the audit is dead code, so Task 2's diff review is the enforcement |
| Copy edit drifts from the catalog | Task 5 is one commit with all three updates plus the x1 gate, and its test compares the rendered sentence against a literal, not against the catalog alone |
| Local green, CI red | Task 13 treats real CI green as its own gate; the `E2E_PORT` and non-loopback `TEST_DATABASE_URL` traps are named in the harness checklist |
| A guest sign-out failure loops the person | Task 4 asserts the no-redirect-on-failure branch in all three failure shapes |

## 12. Findings and dispositions

Populated during execution:

- **Impeccable dual-gate (Task 10):** every P0 through P3 finding across the three UI-surface files, each marked fixed or deferred with its `DEFERRED.md` entry. This section stands in for the milestone-handoff §12 record, which this standalone branch does not have.
- **Cross-model review rounds (Task 12):** each round's findings, the verification that confirmed or refuted them, and the repair. Refuted claims are recorded with their refutation so a later round does not re-derive them.

Spec-round dispositions live in §10 and §11 of the spec document.

## 13. Round 2 adversarial review — plan-side dispositions

Codex returned `VERDICT: BLOCKING` on the spec plus the first plan revision, with eleven findings. Findings 1, 2, 3, 7, 8, and 10 are dispositioned in spec §11. The plan-side ones:

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 4 | HIGH | The newly active e2e cases stay dark in CI: `testMatch` membership is not workflow wiring, and the only mobile-safari step names one spec file | Accepted, verified at `.github/workflows/crew-e2e.yml:104-105`. New Task 8 adds the spec to that step and pins the wiring with a structural test |
| 5 | HIGH | The invariant-9 registry row only proves the constructor sits inside a `try`; existing boundaries carry explicit destructuring assertions | Accepted, verified against the sign-out precedent at `tests/auth/_metaInfraContract.test.ts:290-293`. Task 4 now adds the analogous exact-pattern assertion, with the snippet inline |
| 6 | HIGH | Thirteen in-scope absolute-`Location` assertions, not ten, and changing the shared `locationOf` helper would break the deliberately-absolute case at `tests/auth/oauth-flow.test.ts:66` | Accepted, all three omissions verified. Task 2's table now lists all thirteen and introduces a separate `relativeLocationOf` rather than touching the shared helper |
| 9 | MEDIUM | Task 5's copy test was tautological: an expectation read from `messageFor` passes before the catalog edit and cannot detect a hardcoded string | Accepted. Task 5 now pins a literal as the red phase and separately asserts catalog equality |
| 10 | MEDIUM | Residual count defects, including "three passes and one skip" when the file already carries two active tests, and two wrong meta-test line citations | Accepted. Task 7 states five passed and one skipped; the verification transcript carries the corrected citations |
| 11 | MEDIUM | The plan did not follow the governing writing-plans format — no agentic-worker header, Goal/Architecture/Tech Stack fields, checkbox steps, or code snippets, while claiming snippets had been typechecked | Accepted. The document was restructured to the house format used by `docs/superpowers/plans/2026-07-19-admin-modal-realtime-refresh.md`, and the load-bearing snippets (helper, destructuring pin, copy literal, form markup) are now actually present rather than asserted |
