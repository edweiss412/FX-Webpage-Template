# Picker-flow App Bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three app behaviors blocking three `test.skip` stubs in `tests/e2e/picker-flow.spec.ts` — self-referential redirects that flip the host and drop the auth cookie, a "Continue as guest" control that cannot reach the picker, and a claimed-row GET form that discards its return target — then un-skip those stubs and wire them into CI.

**Architecture:** One new host-relative redirect helper replaces six `new URL(..., request.url)` redirect expressions across four route files, pinned by an AST-based structural guard. The guest Server Action validates its input ahead of any mutation, then clears the picker entry, then signs the browser out with `{ scope: "local" }`; a bespoke origin gate was descoped after three review rounds (spec §4.3a) in favour of the framework default. The claimed-row form moves `next` from its action query into a hidden input. No DB, no RPC, no advisory lock, no migration.

**Tech Stack:** Next 16 App Router (route handlers + Server Actions), Supabase Auth (`@supabase/auth-js` 2.105.1), Vitest (node environment), the `typescript` compiler API for the structural guard, Playwright (`mobile-safari` project, baseline server on `E2E_PORT`).

**Spec:** `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` (4 adversarial rounds; §1.1 resolved-scope table binds; §10, §11, §12, and §13 record every finding and disposition).

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
- **CREATES** tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts — structural pin that the picker-flow spec is named in a CI workflow command and that the signing key's value is 64 hex, so the un-skipped cases cannot go dark or crash on setup (R2 finding 4).
- **EXTENDS** `tests/cross-cutting/ci-workflow-speedup.test.ts` — `PICKER_COOKIE_SIGNING_KEY` added to `REQUIRED_ENV` (`tests/cross-cutting/ci-workflow-speedup.test.ts:201-207`), the existing registry for runner-level vars a bare-runner webServer must inherit.
- **EXTENDS** `tests/ci/_metaE2eWorkflowCoverage.test.ts` — the picker-flow row (`tests/ci/_metaE2eWorkflowCoverage.test.ts:82`) moves from `UNSEEN` to `PATH_GATED`, which is what it becomes once a path-filtered workflow names it.
- **EXTENDS** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — generalised from the `DEFERRED` ledger pair to cover `BACKLOG.md` / `BACKLOG-archive.md` as well, carrying the three graduated IDs, the no-overlap invariant for that pair, and the substance assertion for the filed follow-up. This is Task 9's red phase.
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
| A hand-rolled origin gate would need a trusted-proxy policy | `app/auth/sign-out/route.ts:78-87` is the precedent gate, but it reads `request.nextUrl.origin`, which a Server Action has no equivalent of; deriving one from forwarded headers is deployment-dependent. Descoped per spec §4.3a, filed as BL-SERVER-ACTION-ORIGIN-GATE |
| Validation currently sits downstream of the destructive step | regexes at `lib/auth/picker/clearIdentity.ts:74-80`, inside `clearIdentityCoreImpl` |
| `clearIdentity` (non-skip) has exactly one caller | `components/auth/IdentityChip.tsx:23` — the identity chip's "not me" control. Must NOT gain sign-out |
| The `authChain` redirect-ordering audit is dead code | `auditM5AuthFile` (`lib/audit/authChain.ts:177`) has no callers; the live X.3 audit is `auditProjectAuthChains` (`lib/audit/authPrimitives.ts:815`), which has no redirect rule. Wrapper names are kept for minimal diff, not gate compliance |
| The `typescript` compiler API is already an audit dependency | `lib/audit/authChain.ts:1` imports it |
| `PICKER_COOKIE_SIGNING_KEY` is defined in no workflow | grepped `.github/workflows/` — zero matches; `lib/env/pickerCookieSigningKey.ts:6-13` throws when unset or not 64 hex, and `tests/e2e/helpers/seedPickerCookie.ts:54` calls it. Task 8 adds it |
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

- [ ] **Un-skip the paired e2e stub first, as this task's outer red phase.** Drop `.skip` at `tests/e2e/picker-flow.spec.ts:84` and delete its now-stale `// SKIP:` comment block, then run it and watch it fail on the host flip. That stub is the paired failing test for this fix (invariant 1), which is why the un-skip belongs here and not in a later verification task (R4 finding 3).
- [ ] Write the failing guard test with the three layers spec §3.4 requires. The matcher is an exported pure function over a `ts.SourceFile`, so layer 1 exercises it directly:

  1. **Fixtures.** Exactly the canonical ten-case set defined in spec §3.4 — six positives and four negatives. Do not re-enumerate them here or in the test file's comments; the spec is the single source, and the counts drifted twice when they were restated (R3 finding 9, R4 finding 6).
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

- Create: lib/auth/picker/validateClearIdentityInput.ts (the shared predicate — it cannot live in the `"use server"` module; spec §4.3 step 1)
- Modify: `lib/auth/picker/clearIdentity.ts`
- Modify: `tests/auth/picker/clearIdentity.test.ts`
- Modify: `tests/auth/_metaInfraContract.test.ts` (registry row + destructuring assertion)

**No `headers()` mock is needed** — the previous revision required one for the same-origin gate, which is descoped (spec §4.3a). The existing `vi.mock("next/headers", () => ({ cookies: vi.fn() }))` at `tests/auth/picker/clearIdentity.test.ts:23` stays exactly as it is; only a `@/lib/supabase/server` mock is added (R4 finding 1 caught the leftover requirement).

**Steps:**

- [ ] **Un-skip the paired e2e stub first, as this task's outer red phase.** Drop `.skip` at `tests/e2e/picker-flow.spec.ts:180`, delete its `// SKIP:` block, and extend it with the three assertions from spec §6.2: no cookie satisfying `isSupabaseAuthCookieName` remains in the context; tapping the **unclaimed** row (Bob) renders `crew-shell` with his identity chip; and a bare reload with no `?gate=skip` still renders `crew-shell`. Run it and watch it fail on the Mode B loop. The reload step is the durability proof — without it a one-request-only fix passes, which is the design spec §4.2 rejects.
- [ ] Write the failing unit tests:

  | Assertion | Catches |
  | --- | --- |
  | A shared `calls: string[]` records `"cookieSet"` then `"signOut"`, asserted as `calls.indexOf("cookieSet") < calls.indexOf("signOut")` | The reversed order, which on a picker-clear failure strands a live foreign session beside a stale identity and exposes it |
  | `signOut` called with exactly `{ scope: "local" }` | The library default `{ scope: 'global' }`, revoking a colleague's sessions on all their devices |
  | Malformed slug, share-token, or show-id → `PICKER_INVALID_INPUT`, **zero** `createSupabaseServerClient` calls **and zero** cookie writes | Validation left downstream, so a malformed submission mutates state before reporting the error |
  | A `clearIdentityCore` failure returns before any sign-out attempt, **and** the test asserts the observed post-failure cookie state rather than asserting the entry is untouched — the cookie write at `lib/auth/picker/clearIdentity.ts:90-107` precedes `revalidatePath` and the emit, so a later throw leaves the deletion staged (R3 finding 6) | A picker-clear failure that still destroys the session; and a test that documents a partial-mutation state the implementation does not actually produce |
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

- [ ] Implement spec §4.3's four steps: validate (moving the regexes at `lib/auth/picker/clearIdentity.ts:74-80` into the new plain module lib/auth/picker/validateClearIdentityInput.ts, imported by both `clearIdentityAndSkip` and `clearIdentityCoreImpl` so the two cannot drift — a `"use server"` module cannot export a synchronous predicate), picker clear, device-local sign-out, redirect. **No bespoke same-origin gate** — descoped per spec §4.3a after three review rounds; do not add one back. Keep the `// no-telemetry:` comment at `lib/auth/picker/clearIdentity.ts:56` and add the code-carrying `log.error`.
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

- [ ] **Un-skip the paired e2e stub first, as this task's outer red phase.** Drop `.skip` at `tests/e2e/picker-flow.spec.ts:241`, delete its `// SKIP:` block, and run it; it fails because the GET submit discards `next`.
- [ ] Write the failing component test: the claimed row's form has `action="/auth/sign-in"` and `method="GET"`; a hidden input named `next` whose value equals `buildShowReturnUrl(slug, shareToken, { s })` computed in the test from the same fixture inputs; the `action` attribute carries **no** `?`; with `s` supplied the hidden value carries the section; with a bogus `s` it does not. Reading the action and the hidden input **separately** is what stops a "fix" that leaves `next` in both places from passing.
- [ ] Implement per spec §5:

  ```tsx
  <form action="/auth/sign-in" method="GET">
    <input type="hidden" name="next" value={buildShowReturnUrl(slug, shareToken, { s })} />
  ```

  The value is the raw path; the browser percent-encodes it on submit. Everything else on the row is unchanged.

- [ ] Gate: the extended component test; `pnpm vitest run tests/components tests/show`; `pnpm lint`; `pnpm typecheck`.
- [ ] Commit: `fix(crew-page): keep the return target on claimed-row sign-in`

### Task 7: whole-file e2e verification and the stale config comment

**Files:**

- Modify: `playwright.config.ts` (the stale stub-count comment at line 56)

**Why this is not where the un-skips live.** Un-skipping after the fixes are already implemented would be a test that is green the moment it is written, with no implementation step following it — which is not TDD, and R4 finding 3 was right to call that out. Each `.skip` removal therefore sits in the task that fixes the behavior it exercises: `tests/e2e/picker-flow.spec.ts:84` in Task 2, `tests/e2e/picker-flow.spec.ts:180` in Task 4, `tests/e2e/picker-flow.spec.ts:241` in Task 6. This task is the **whole-file verification gate** that the three fixes compose, plus one comment correction.

The comment edit has no test by its nature — it is a prose comment inside a config file. That is declared here rather than smuggled: it ships in this task's commit alongside the verification run, and the run is what this task proves.

**Steps:**

- [ ] Run the whole file: `pnpm exec playwright test --project=mobile-safari tests/e2e/picker-flow.spec.ts` with `TEST_DATABASE_URL` overridden to loopback. Expected: **five passed, one skipped** — the file already carries two active tests at `tests/e2e/picker-flow.spec.ts:70` and `tests/e2e/picker-flow.spec.ts:134`, plus the three un-skipped in Tasks 2, 4, and 6, with `tests/e2e/picker-flow.spec.ts:293` still skipped.
- [ ] Correct the comment at `playwright.config.ts:56` to name the single remaining stub.
- [ ] Commit: `test(auth): verify the picker-flow suite composes and fix the stub-count comment`

### Task 8: run the picker-flow spec in CI, path-gated, with its signing key

**Files:**

- Modify: `.github/workflows/crew-e2e.yml` (the `pull_request.paths` filter at lines 23-33, the job `env:` block, the mobile-safari run step at lines 104-105, and the header comment plus step name that both claim a single spec)
- Modify: `.github/workflows/dev-gate-e2e.yml` (job `env:` block)
- Modify: `tests/cross-cutting/ci-workflow-speedup.test.ts` (`REQUIRED_ENV`, lines 201-207)
- Modify: `tests/ci/_metaE2eWorkflowCoverage.test.ts` (the picker-flow row at line 82)
- Create: tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts

**Why this task exists, and what it can and cannot claim.** Un-skipping is not enough: the only mobile-safari CI step names exactly one spec file, so the three regressions would stay dark and "real CI green" could pass without executing them (R2 finding 4). But R3 finding 3 showed the first version of this task overclaimed. Two facts from the repo's own coverage machinery bound what is achievable:

- `crew-e2e.yml` has a `pull_request.paths` filter, and the scanner at `tests/ci/_workflowCoverageScan.ts:114` deliberately rejects any path-filtered workflow as not PR-blocking-capable. So adding the spec to that job does **not** make it "PR-covered" in the scanner's sense, and pretending otherwise would be false.
- The repo already has the right vocabulary for what it does become: `PATH_GATED` — "path-gated PR workflow (runs when its filter matches, not PR-blocking-capable per the scanner contract)" (`tests/ci/_metaE2eWorkflowCoverage.test.ts:29-30`) — as distinct from `UNSEEN`, "not named in any workflow run command" (`tests/ci/_metaE2eWorkflowCoverage.test.ts:31-32`).

So the honest goal is: move picker-flow from `UNSEEN` to `PATH_GATED`, and make the filter actually cover the files whose behavior these tests exercise. Lifting the whole mobile-safari project to unconditional PR coverage is BL-RESURRECT-MOBILE-SAFARI-E2E (`.github/workflows/crew-e2e.yml:5-8`) and stays out of scope.

**Blocker found while planning this task — the job is missing the picker signing key.** `PICKER_COOKIE_SIGNING_KEY` appears in **no** workflow under `.github/workflows/` (grepped 2026-07-24), and the port-3000 webServer command at `playwright.config.ts:244-248` does not set it either. Two hard failures follow: `seedPickerCookie` calls `pickerCookieSigningKey()` at `tests/e2e/helpers/seedPickerCookie.ts:54`, which throws when the variable is unset (`lib/env/pickerCookieSigningKey.ts:9`) or is not 64 hex (`lib/env/pickerCookieSigningKey.ts:12`); and the server needs the same key to decode and re-sign the envelope, so the guest action itself fails. It works locally only because the key lives in the gitignored `.env.local` that `pnpm worktree:link-env` symlinks. The key is read at **runtime**, so one job-level `env:` entry covers both the Playwright process and the `pnpm start` server it spawns — which is exactly the contract `tests/cross-cutting/ci-workflow-speedup.test.ts:227-232` already spells out for this workflow.

**Steps:**

- [ ] Write the failing pins first. Two of them, in the registries that already own each concern rather than one bespoke file doing everything:
  - Add `PICKER_COOKIE_SIGNING_KEY` to `REQUIRED_ENV` (`tests/cross-cutting/ci-workflow-speedup.test.ts:201-207`). That array is the existing registry for runner-level vars a bare-runner webServer must inherit, and it covers both `crew-e2e.yml` and `dev-gate-e2e.yml` via `BARE_RUNNER_WEBSERVER_WORKFLOWS` (`tests/cross-cutting/ci-workflow-speedup.test.ts:200`); its anti-vacuity case (`tests/cross-cutting/ci-workflow-speedup.test.ts:214-218`) then requires the key in `crew-e2e.yml` by construction. Extending it closes the class instead of pinning one instance.
  - Create tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts for the three things no existing registry covers: `tests/e2e/picker-flow.spec.ts` appears in a `playwright test` command line in `crew-e2e.yml`; the key's **value** there matches `/^[0-9a-f]{64}$/` (presence is covered above, but a malformed value still throws at `lib/env/pickerCookieSigningKey.ts:12`); and the `pull_request.paths` filter contains each path the spec's behavior lives in. Read the workflow as text with a regex, as the existing scanners do — there is **no** yaml dependency in this repo (`devDependencies` has no yaml package, and `pnpm exec js-yaml` exits 254), so the parse-gate idea from the previous revision was not executable (R3 finding 10).
- [ ] Flip the picker-flow row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:82` from `UNSEEN` to `PATH_GATED`. This is the reconciliation R3 finding 3 asked for: after this task the spec **is** named in a workflow command, so leaving it as `UNSEEN` would be a false annotation in the other direction. Two mechanics matter here and are easy to get backwards:
  - **The row must stay.** `scanWorkflowCoverage` excludes path-filtered workflows, so picker-flow will still not be in `covered` after this task; deleting the row would make the spec "dark" and fail the first assertion at `tests/ci/_metaE2eWorkflowCoverage.test.ts:141-144`. The complementary assertion at `tests/ci/_metaE2eWorkflowCoverage.test.ts:147-151` only fails for a row whose spec *is* covered, which will not be the case.
  - **The flip is not gate-enforced.** Both category constants are prose reason strings, so no assertion distinguishes them. It is an accuracy edit that keeps the allowlist honest, and it is called out here precisely because nothing will fail if a future edit lets it drift.
- [ ] Extend `crew-e2e.yml`'s `pull_request.paths` (lines 23-33) with the paths this spec actually exercises, so a future change to the behavior under test triggers the job: `tests/e2e/picker-flow.spec.ts`, `app/auth/**`, `app/api/auth/**`, `lib/auth/**`, `lib/http/**`, and `lib/env/pickerCookieSigningKey.ts` — that last one because this task itself identifies that file's validation as a runtime prerequisite, so a change to its contract must trigger the job (R4 finding 7). Without these paths the filter would fire for this PR (it touches `app/show/**` and the workflow itself) and then never again for the code under test.
- [ ] Add `PICKER_COOKIE_SIGNING_KEY` to both workflows' `env:` blocks (alongside `TEST_AUTH_SECRET` at `.github/workflows/crew-e2e.yml:67` and `.github/workflows/dev-gate-e2e.yml:77`), a fixed 64-hex test constant in the same spirit as the other inline test secrets there. `dev-gate-e2e.yml` gets it for the same structural reason `HASH_FOR_LOG_PEPPER` is there: its webServer serves the whole app, so any request reaching the picker chain throws without it.
- [ ] Add the spec to the existing mobile-safari step's file list (same `--project=mobile-safari` invocation, so no new job and no second server boot), and update the workflow's header comment (lines 1-8) and the step name at line 104, both of which currently say this job runs exactly one spec.
- [ ] Gate: both pins; `pnpm vitest run tests/ci tests/cross-cutting`.
- [ ] Commit: `ci(auth): run the picker-flow e2e spec and supply its signing key`

### Task 9: close the backlog entries and file the descoped follow-up

**Files:**

- Modify: `tests/docs/_metaDeferralLedgerGraduation.test.ts`
- Modify: root `BACKLOG.md` (the three entries and their section header, lines 129-149; plus the new BL-SERVER-ACTION-ORIGIN-GATE entry)
- Modify: `BACKLOG-archive.md`

**Extend the existing ledger guard, do not add a bespoke file.** `tests/docs/_metaDeferralLedgerGraduation.test.ts` already exists for precisely this failure class — its own header records that it was written because "a ledger/docs task with no genuine red state, only post-hoc checks that were already green" recurred across two review rounds, "so the graduation itself became a test" (`tests/docs/_metaDeferralLedgerGraduation.test.ts:1-7`). It covers the `DEFERRED.md` / `DEFERRED-archive.md` pair with a `GRADUATED` registry plus a no-overlap invariant (`tests/docs/_metaDeferralLedgerGraduation.test.ts:33-52`). The `BACKLOG.md` / `BACKLOG-archive.md` pair is the same shape and is currently uncovered, so this task generalises that guard to both pairs rather than writing a parallel one-off.

One mechanical difference to handle: the existing `DEFERRAL_ID` regex matches `### ID` only (`tests/docs/_metaDeferralLedgerGraduation.test.ts:26`), while backlog entries use both levels — the root backlog heads its entries with `##` (for example line 11) and this spec's three sit at `###` under a `##` section header, and `BACKLOG-archive.md` currently holds 28 `##` and 9 `###` entry headings. The generalised matcher must accept `##` or `###`.

**Steps:**

- [ ] Write the failing test first — this task is not exempt from invariant 1, and the previous revision's `tests/docs` gate proved nothing because it covers `DEFERRED.md` graduation, not these entries (R3 finding 5). Generalise the guard so it runs over both ledger pairs, then add:
  - the three IDs to the backlog pair's graduated registry: `BL-PICKER-BOOTSTRAP-HOST-FLIP`, `BL-PICKER-GATE-SKIP-MISMATCH`, `BL-PICKER-CLAIMED-ROW-NEXT-DROP`. Each must be archive-only, which fails right now because all three are still active — that is the red phase.
  - the no-overlap invariant for the backlog pair, which catches the actual risk in a two-file move: an entry copied into the archive but never deleted from the active queue, or the reverse.
  - a substance assertion for `BL-SERVER-ACTION-ORIGIN-GATE`: present in `BACKLOG.md` exactly once, **and** its section body carries real content, so a heading-only entry fails (R4 finding 10). Assert a body-length floor plus distinctive substrings for the three things spec §4.3a promises are preserved — the residual (a cross-site POST with no `Origin`), the blast radius (device-local sign-out plus one picker-entry deletion, no read and no escalation), and the open decision (a trusted-proxy policy). Match on substrings loose enough to survive rewording but not an empty entry.
- [ ] Move the three entries and their section header into the archive with a one-line resolution note naming this branch, keeping the surrounding `---` separators well-formed. Use a file edit, never `echo >>`; verify with `git diff`.
- [ ] Add the BL-SERVER-ACTION-ORIGIN-GATE entry to root `BACKLOG.md` carrying spec §4.3a's reasoning in full.
- [ ] Gate: the extended guard; `pnpm format:check`; `pnpm vitest run tests/docs`.
- [ ] Commit: `docs: archive the shipped picker-flow entries and file the origin-gate follow-up`

### Task 10: invariant-8 impeccable dual-gate

**Steps:**

- [ ] Pre-code mechanical checklist first, so the gate verifies rather than discovers: no em-dash in user-visible copy (Task 5's sentence), straight apostrophes, `min-h-tap-min` still on the claimed row, canonical type and token classes unchanged, no new color token.
- [ ] Run `/impeccable critique` **and** `/impeccable audit` over all three UI-surface files — `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts` — with the canonical v3 setup gates (the context.mjs context load of PRODUCT.md and DESIGN.md, then the register reference read). Both commands run with subagents, never inline.
- [ ] Fix or explicitly defer every P0 and P1 with a `DEFERRED.md` entry; record all findings and dispositions in §12 below and in the PR body.
- [ ] Commit whatever this task changed — repairs, `DEFERRED.md` rows, and the §12 record all touch tracked files, so the one-commit-per-task rule applies here too (R3 finding 12): `fix(crew-page): apply impeccable dual-gate findings`. If the gate produced no P0/P1 and nothing but the §12 record changed, commit that: `docs(auth): record the impeccable dual-gate dispositions`.

### Task 11: full pre-push gates

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (full suite — a scoped subset misses registry suites), `pnpm test:audit:x1-catalog-parity`, `pnpm test:audit:x3-trust-domain`, and the Task 7 e2e run. Check the shell exit status, not the "Tests" line: Vitest exits 1 on uncaught errors even when every test passes.

### Task 12: whole-diff adversarial review (cross-model)

- [ ] Dispatch a fresh-eyes Codex review of the whole diff through `scripts/codex-guard.mjs`, split by surface if the diff risks the brief-size cliff. The brief carries: REVIEWER ONLY, fresh-eyes posture, the do-not-relitigate list from spec §1.1, the verification transcript, and the `VERDICT:` instruction. Iterate to APPROVE.
- [ ] Commit each round's repairs as their own conventional commit, and the round record in §12 with them (R3 finding 12): `fix(auth): apply round-N whole-diff review findings`.

### Task 13: ship

- [ ] Push and open the PR with the spec summary and the impeccable dispositions.
- [ ] Wait for **real CI green** on the PR — not just local.
- [ ] **Dispatch the one edited workflow PR CI will never run.** `dev-gate-e2e.yml` is `workflow_dispatch`-only (`.github/workflows/dev-gate-e2e.yml:25-30`), so Task 8's env edit there is invisible to PR CI: run `gh workflow run dev-gate-e2e.yml --ref fix/picker-flow-app-bugs`, then watch it to completion. Reporting "real CI green" while a modified CI surface has never executed is exactly the local-passes-CI-fails class this project treats as its own gate (R4 finding 5). Also fire `gh workflow run crew-e2e.yml --ref fix/picker-flow-app-bugs` if the PR's path filter did not trigger it.
- [ ] `gh pr merge --merge`, fast-forward local `main`, and verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## Task order and dependencies

1 → 2 (the helper must exist before its call sites). 3 → 4 (the matcher before the sweep that uses it). 5 and 6 are independent of each other and of 1 through 4. 7 depends on 2, 4, and 6 — each of those un-skips its own stub, and Task 7 verifies the whole file composes. 8 depends on 7 (the spec must be green locally before CI runs it). 9 depends on 7 so the archive note can name the un-skipped tests. **10 depends on 2, 3, 5, and 6.** Tasks 2, 3, and 6 edit the three UI-surface files, and Task 5 changes the rendered mismatch sentence that Task 10's own copy checklist inspects — so the gate must run after all four or it evaluates an incomplete diff. (R2 finding 7 caught the first omission, R3 finding 4 caught Task 3, R4 finding 4 caught Task 5.) 11 through 13 are the close-out sequence, in order.

## Risks

| Risk | Mitigation |
| --- | --- |
| The un-skipped e2e cases stay dark in CI | Task 8 names the spec in the job, extends the trigger to the paths under test, and pins both in structural tests. Scope limit stated openly: the job stays path-filtered, so the spec becomes `PATH_GATED`, not PR-blocking-capable — unconditional coverage is BL-RESURRECT-MOBILE-SAFARI-E2E |
| The e2e cases run in CI but crash on setup for want of `PICKER_COOKIE_SIGNING_KEY` | Task 8 adds the job-level env entry to both bare-runner workflows, registers the var in `REQUIRED_ENV`, and pins the 64-hex value shape |
| A task mutates tracked files without a commit, breaking the one-commit-per-task rule | Tasks 10 and 12 now carry explicit commit steps (R3 finding 12) |
| A docs-only task ships with no red phase | Task 9 now has its own structural test asserting the three IDs left `BACKLOG.md`, landed in the archive, and that the descoped follow-up was actually filed (R3 finding 5) |
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

Spec-round dispositions live in §10, §11, §12, and §13 of the spec document.

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

## 14. Round 3 adversarial review — plan-side dispositions

Codex returned `VERDICT: BLOCKING` with fourteen findings on the second spec revision plus the restructured plan. Findings 1, 2, 6, 7, 8, 9, 11, 13, and 14 are dispositioned in spec §12. The plan-side ones:

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 3 | HIGH | Task 8 did not make the spec PR-covered under the repo's own definition: `crew-e2e.yml` is path-filtered, which `tests/ci/_workflowCoverageScan.ts:114` rejects as dark; the spec stayed allowlisted as `UNSEEN`; and the trigger omitted every path the behavior under test lives in | Accepted in full, verified against the scanner and the allowlist. Task 8 was rewritten to state what it can and cannot achieve: the row moves `UNSEEN` to `PATH_GATED` (the repo's own term for path-filtered coverage, `tests/ci/_metaE2eWorkflowCoverage.test.ts:29-30`), the trigger gains `tests/e2e/picker-flow.spec.ts`, `app/auth/**`, `app/api/auth/**`, `lib/auth/**`, `lib/http/**`, and the "durable CI defense" overclaim is gone — unconditional coverage stays BL-RESURRECT-MOBILE-SAFARI-E2E |
| 4 | HIGH | Task 10's dependency repair was still incomplete: Task 3 edits `app/auth/sign-out/route.ts`, itself a UI surface, so the impeccable pair could run before the final diff existed | Accepted. Task 10 now depends on Tasks 2, 3, and 6 |
| 5 | HIGH | Task 9 violated invariant 1 — no failing test, and its `tests/docs` gate covers `DEFERRED.md` graduation, so it was green before and after the archive move | Accepted. Task 9 now opens with a purpose-built structural test asserting each of the three IDs is absent from `BACKLOG.md` and present in the archive, that the resolution line names this branch, and that the descoped follow-up was filed — which also keeps spec §4.3a's "filed as" claim honest |
| 10 | MEDIUM | The proposed `pnpm exec js-yaml` parse gate is not executable here (exit 254, no yaml dependency), and it would not have inspected the second workflow the task edits | Accepted. Dropped; the pins read workflow text with regexes, as every existing workflow scanner in this repo does |
| 12 | MEDIUM | Tasks 10 and 12 authorize tracked-file changes but carry no commit step | Accepted. Both now have explicit commit steps, including the no-findings case |

Two findings landed on the same-origin gate (1 and 2) and, with R2 finding 3 before them, made it the third consecutive round on one design-correctness vector. Per the three-round prose cap the gate is **descoped**, not patched again — spec §1.1 and §4.3a carry the decision and its residual, and Task 4 no longer implements or tests it.

## 15. Round 4 adversarial review — plan-side dispositions

Codex returned `VERDICT: BLOCKING` with eleven findings, while confirming the descope's security characterisation holds. Findings 1, 2, 6, 8, 9, and the spec-side citation drift are dispositioned in spec §13. The plan-side ones:

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | BLOCKING | Task 4 still required a `headers` mock for the descoped gate | Accepted. The mock-shape paragraph is gone; the existing `next/headers` factory stays untouched and only a Supabase-server mock is added |
| 2 | BLOCKING | The shared predicate cannot be exported from `lib/auth/picker/clearIdentity.ts` — a module-level `"use server"` file admits only async exports, and an async predicate would mint another discoverable Server Action | Accepted. Task 4 now creates lib/auth/picker/validateClearIdentityInput.ts as a plain module and imports it from both call sites |
| 3 | HIGH | Task 7 had no red phase: un-skipping after the fixes are implemented is green on arrival with no implementation step following | Accepted, and the fix is structural rather than cosmetic. Each `.skip` removal moved into the task that fixes the behavior it exercises — `tests/e2e/picker-flow.spec.ts:84` into Task 2, `tests/e2e/picker-flow.spec.ts:180` into Task 4 (with its three durability assertions), and `tests/e2e/picker-flow.spec.ts:241` into Task 6 — so each app fix has its paired failing e2e as its outer red phase. Task 7 is now explicitly the whole-file verification gate plus one comment edit, and says so instead of implying a red phase it does not have |
| 4 | HIGH | Task 10's own copy checklist inspects Task 5's sentence, but the dependency graph omitted Task 5 | Accepted. Task 10 now depends on Tasks 2, 3, 5, and 6 — the third correction to this graph across three rounds, so it is now stated with the reason for each edge |
| 5 | HIGH | Task 8 edits `dev-gate-e2e.yml`, which is `workflow_dispatch`-only, so PR CI never runs it — "real CI green" could be reported with a modified CI surface unexecuted | Accepted, verified at `.github/workflows/dev-gate-e2e.yml:25-30`. Task 13 now dispatches it explicitly with `gh workflow run` and watches it to completion, and also covers the case where the PR's path filter does not trigger `crew-e2e.yml` |
| 7 | MEDIUM | Task 8's title still promised PR coverage its body correctly disclaims, and the expanded path filter omitted `lib/env/pickerCookieSigningKey.ts` despite the task naming that file a runtime prerequisite | Accepted. The title now says "path-gated", and the filter includes that file |
| 10 | MEDIUM | Task 9's red phase only checked that the follow-up ID appears once, so a heading-only entry would pass while spec §4.3a promises the residual, blast radius, and open decision are preserved | Accepted. The test now asserts a body-length floor plus distinctive substrings for all three, matched loosely enough to survive rewording |
| 11 | LOW | The plan header said two completed rounds and named only spec §§10-11; there are four rounds and four disposition sections | Accepted; both references corrected |
