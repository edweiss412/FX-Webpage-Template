# Picker-flow App Bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three app behaviors blocking three `test.skip` stubs in `tests/e2e/picker-flow.spec.ts` — self-referential redirects that flip the host and drop the auth cookie, a "Continue as guest" control that cannot reach the picker, and a claimed-row GET form that discards its return target — then un-skip those stubs and wire them into CI.

**Architecture:** One new host-relative redirect helper replaces six `new URL(..., request.url)` redirect expressions across four route files, pinned by an AST-based structural guard. The guest Server Action validates its input ahead of any mutation, then clears the picker entry, then signs the browser out with `{ scope: "local" }`; a bespoke origin gate was descoped after three review rounds (spec §4.3a) in favour of the framework default. The claimed-row form moves `next` from its action query into a hidden input. No DB, no RPC, no advisory lock, no migration.

**Tech Stack:** Next 16 App Router (route handlers + Server Actions), Supabase Auth (`@supabase/auth-js` 2.105.1), Vitest (node environment), the `typescript` compiler API for the structural guard, Playwright (`mobile-safari` project, baseline server on `E2E_PORT`).

**Spec:** `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` (5 adversarial rounds; §1.1 resolved-scope table binds; §10 through §14 record every finding and disposition).

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
| All four new Vitest files need no config wiring | `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`); `tests/lib/**` is in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:77`), `tests/cross-cutting/**` is not, so the walkers run serial |
| `picker-flow.spec.ts` already has two active tests | `tests/e2e/picker-flow.spec.ts:70` and `tests/e2e/picker-flow.spec.ts:134`. After un-skipping three, the file is **five passing and one skipped**, not three and one (R2 finding 10) |
| Baseline audit state | `pnpm test:audit:x3-trust-domain` → 5 files, 26 tests, green, before any edit |

## e2e harness-readiness checklist

- **Server boot:** the `mobile-safari` project (`playwright.config.ts:54`) runs against the baseline `webServer` at `playwright.config.ts:216`, bound explicitly to `127.0.0.1` on `E2E_PORT` (default `3000`, `playwright.config.ts:8`), carrying `ENABLE_TEST_AUTH` and `TEST_AUTH_SECRET`.
- **Readiness gate:** each stub awaits a testid-visibility assertion after `page.goto(..., { waitUntil: "networkidle" })` — `sign-in-or-skip-gate`, `picker-interstitial-root`, or `crew-shell`. The visibility assertion, never `networkidle` alone, gates the first interaction. `signInAs` (`tests/e2e/helpers/signInAs.ts:43`) posts through `page.request` so `Set-Cookie` lands on the same context before the first `goto`.
- **Detach safety:** no stub samples geometry or calls `locator.evaluate` on a node that can unmount. The only navigation-crossing wait is `page.waitForURL`, detach-safe by construction.
- **Local run:** `TEST_DATABASE_URL` in the shared `.env.local` is non-loopback (preflight warns), so every mutating picker-flow run — the three outer-red steps in Tasks 2, 4, and 6 and the whole-file run in Task 11 — overrides it inline with the canonical local value (`scripts/preflight-env.mjs:125`, `scripts/db-reset-pool.mjs:49`):

  ```bash
  TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm exec playwright test --project=mobile-safari tests/e2e/picker-flow.spec.ts
  ```

  R6 finding 3: the previous revision warned about the trap but never supplied the assignment, so a worker holding only these documents could have run the mutating suite against the remote target. Port 3000 is checked for an existing listener and never blanket-killed.

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
- Modify: `tests/e2e/picker-flow.spec.ts` (un-skip the paired stub at line 84, this task's outer red phase)

**Steps:**

- [ ] **Un-skip the paired e2e stub first, as this task's outer red phase.** Drop `.skip` at `tests/e2e/picker-flow.spec.ts:84` and delete its now-stale `// SKIP:` comment block, then run it with the loopback `TEST_DATABASE_URL` override from the harness checklist and watch it fail on the host flip. That stub is the paired failing test for this fix (invariant 1), which is why the un-skip belongs here and not in a later verification task (R4 finding 3).
- [ ] Write the failing guard test with the three layers spec §3.4 requires. The matcher is an exported pure function over a `ts.SourceFile`, so layer 1 exercises it directly:

  1. **Fixtures.** Exactly the canonical set defined in spec §3.4. Do not restate the counts here or in the test file's comments — cite the section instead. They drifted twice when restated (R3 finding 9, R4 finding 6), and R7 finding 3 found them restated in three more places even while agreeing.
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
- Modify: `tests/e2e/picker-flow.spec.ts` (un-skip the paired stub at line 180 and add its three durability assertions, this task's outer red phase)

**No `headers()` mock is needed** — the previous revision required one for the same-origin gate, which is descoped (spec §4.3a). The existing `vi.mock("next/headers", () => ({ cookies: vi.fn() }))` at `tests/auth/picker/clearIdentity.test.ts:23` stays exactly as it is; only a `@/lib/supabase/server` mock is added (R4 finding 1 caught the leftover requirement).

**Steps:**

- [ ] **Un-skip the paired e2e stub first, as this task's outer red phase.** Drop `.skip` at `tests/e2e/picker-flow.spec.ts:180`, delete its `// SKIP:` block, and extend it with the three assertions from spec §6.2: no cookie satisfying `isSupabaseAuthCookieName` remains in the context; tapping the **unclaimed** row (Bob) renders `crew-shell` with his identity chip; and a bare reload with no `?gate=skip` still renders `crew-shell`. Run it with the loopback `TEST_DATABASE_URL` override from the harness checklist and watch it fail on the Mode B loop. The reload step is the durability proof — without it a one-request-only fix passes, which is the design spec §4.2 rejects.
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
- Modify: `tests/e2e/picker-flow.spec.ts` (un-skip the paired stub at line 241, this task's outer red phase)

**Steps:**

- [ ] **Un-skip the paired e2e stub first, as this task's outer red phase.** Drop `.skip` at `tests/e2e/picker-flow.spec.ts:241`, delete its `// SKIP:` block, and run it with the loopback `TEST_DATABASE_URL` override from the harness checklist; it fails because the GET submit discards `next`.
- [ ] Write the failing component test: the claimed row's form has `action="/auth/sign-in"` and `method="GET"`; a hidden input named `next` whose value equals `buildShowReturnUrl(slug, shareToken, { s })` computed in the test from the same fixture inputs; the `action` attribute carries **no** `?`; with `s` supplied the hidden value carries the section; with a bogus `s` it does not. Reading the action and the hidden input **separately** is what stops a "fix" that leaves `next` in both places from passing.
- [ ] Implement per spec §5:

  ```tsx
  <form action="/auth/sign-in" method="GET">
    <input type="hidden" name="next" value={buildShowReturnUrl(slug, shareToken, { s })} />
  ```

  The value is the raw path; the browser percent-encodes it on submit. Everything else on the row is unchanged.

- [ ] Gate: the extended component test; `pnpm vitest run tests/components tests/show`; `pnpm lint`; `pnpm typecheck`.
- [ ] Commit: `fix(crew-page): keep the return target on claimed-row sign-in`

### Task 7: (removed — folded into Tasks 8 and 11)

R4 finding 3 moved the three `.skip` removals into the tasks that fix each behavior. What was left here — one comment edit plus a verification run — could not satisfy invariant 1, because a comment has no test and a post-fix verification run is green on arrival. R5 finding 1 was right that keeping it as a task with its own commit was a nominal repair, so the task is dissolved rather than defended:

- the `playwright.config.ts:56` comment correction moves into **Task 8**, which already edits CI and config files behind failing structural pins;
- the whole-file picker-flow run moves into **Task 11**, the pre-push gate task, which is verification by definition and produces no commit.

Numbering is preserved so every cross-reference in these documents stays valid.

### Task 8: run the picker-flow spec in CI, path-gated, with its signing key

**Files:**

- Modify: `.github/workflows/crew-e2e.yml` (the `pull_request.paths` filter at lines 23-33, the job `env:` block, the mobile-safari run step at lines 104-105, and the header comment plus step name that both claim a single spec)
- Modify: `.github/workflows/dev-gate-e2e.yml` (the Playwright run step's `env:` block at line 65 — not a job-level block; job level would also work, but the run step is where that workflow keeps its secrets)
- Modify: `tests/cross-cutting/ci-workflow-speedup.test.ts` (`REQUIRED_ENV`, lines 201-207)
- Modify: `tests/ci/_metaE2eWorkflowCoverage.test.ts` (the picker-flow row at line 82)
- Modify: `playwright.config.ts` (the stale comment block at lines 55-61, absorbed from the dissolved Task 7)
- Create: tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts

**Why this task exists, and what it can and cannot claim.** Un-skipping is not enough: the only mobile-safari CI step names exactly one spec file, so the three regressions would stay dark and "real CI green" could pass without executing them (R2 finding 4). But R3 finding 3 showed the first version of this task overclaimed. Two facts from the repo's own coverage machinery bound what is achievable:

- `crew-e2e.yml` has a `pull_request.paths` filter, and the scanner at `tests/ci/_workflowCoverageScan.ts:114` deliberately rejects any path-filtered workflow as not PR-blocking-capable. So adding the spec to that job does **not** make it "PR-covered" in the scanner's sense, and pretending otherwise would be false.
- The repo already has the right vocabulary for what it does become: `PATH_GATED` — "path-gated PR workflow (runs when its filter matches, not PR-blocking-capable per the scanner contract)" (`tests/ci/_metaE2eWorkflowCoverage.test.ts:29-30`) — as distinct from `UNSEEN`, "not named in any workflow run command" (`tests/ci/_metaE2eWorkflowCoverage.test.ts:31-32`).

So the honest goal is: move picker-flow from `UNSEEN` to `PATH_GATED`, and make the filter actually cover the files whose behavior these tests exercise. Lifting the whole mobile-safari project to unconditional PR coverage is BL-RESURRECT-MOBILE-SAFARI-E2E (`.github/workflows/crew-e2e.yml:5-8`) and stays out of scope.

**Blocker found while planning this task — the job is missing the picker signing key.** `PICKER_COOKIE_SIGNING_KEY` appears in **no** workflow under `.github/workflows/` (grepped 2026-07-24), and the port-3000 webServer command at `playwright.config.ts:244-248` does not set it either. Two hard failures follow: `seedPickerCookie` calls `pickerCookieSigningKey()` at `tests/e2e/helpers/seedPickerCookie.ts:54`, which throws when the variable is unset (`lib/env/pickerCookieSigningKey.ts:9`) or is not 64 hex (`lib/env/pickerCookieSigningKey.ts:12`); and the server needs the same key to decode and re-sign the envelope, so the guest action itself fails. It works locally only because the key lives in the gitignored `.env.local` that `pnpm worktree:link-env` symlinks. The key is read at **runtime**, so for `crew-e2e.yml` one job-level `env:` entry covers both the Playwright process and the `pnpm start` server it spawns — exactly the contract `tests/cross-cutting/ci-workflow-speedup.test.ts:227-232` spells out for that workflow. `dev-gate-e2e.yml` is different and must not be described the same way: it carries its secrets in the Playwright **run step's** `env:` block (`.github/workflows/dev-gate-e2e.yml:65`), and `REQUIRED_ENV` only greps for an indented key anywhere in the file (`tests/cross-cutting/ci-workflow-speedup.test.ts:210`), so nothing in these gates establishes placement there (R6 finding 4).

**Steps:**

- [ ] Write the failing pins first. Two of them, in the registries that already own each concern rather than one bespoke file doing everything:
  - Add `PICKER_COOKIE_SIGNING_KEY` to `REQUIRED_ENV` (`tests/cross-cutting/ci-workflow-speedup.test.ts:201-207`). That array is the existing registry for runner-level vars a bare-runner webServer must inherit, and it covers both `crew-e2e.yml` and `dev-gate-e2e.yml` via `BARE_RUNNER_WEBSERVER_WORKFLOWS` (`tests/cross-cutting/ci-workflow-speedup.test.ts:200`); its anti-vacuity case (`tests/cross-cutting/ci-workflow-speedup.test.ts:214-218`) then requires the key in `crew-e2e.yml` by construction. Extending it closes the class instead of pinning one instance.
  - Create tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts for the three things no existing registry covers: `tests/e2e/picker-flow.spec.ts` appears in a `playwright test` command line in `crew-e2e.yml`; the key's **value** matches `/^[0-9a-f]{64}$/` in **both** `crew-e2e.yml` and `dev-gate-e2e.yml` (presence is covered above, but a malformed value still throws at `lib/env/pickerCookieSigningKey.ts:12`, and R5 finding 3 caught the shape assertion being specified for only one of the two workflows); and the `pull_request.paths` filter contains each path the spec's behavior lives in. Read the workflow as text with a regex, as the existing scanners do — there is **no** yaml dependency in this repo (`devDependencies` has no yaml package, and `pnpm exec js-yaml` exits 254), so the parse-gate idea from the previous revision was not executable (R3 finding 10).
- [ ] Flip the picker-flow row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:82` from `UNSEEN` to `PATH_GATED`. This is the reconciliation R3 finding 3 asked for: after this task the spec **is** named in a workflow command, so leaving it as `UNSEEN` would be a false annotation in the other direction. Two mechanics matter here and are easy to get backwards:
  - **The row must stay.** `scanWorkflowCoverage` excludes path-filtered workflows, so picker-flow will still not be in `covered` after this task; deleting the row would make the spec "dark" and fail the first assertion at `tests/ci/_metaE2eWorkflowCoverage.test.ts:141-144`. The complementary assertion at `tests/ci/_metaE2eWorkflowCoverage.test.ts:147-151` only fails for a row whose spec *is* covered, which will not be the case.
  - **The flip is not gate-enforced.** Both category constants are prose reason strings, so no assertion distinguishes them. It is an accuracy edit that keeps the allowlist honest, and it is called out here precisely because nothing will fail if a future edit lets it drift.
- [ ] Extend `crew-e2e.yml`'s `pull_request.paths` (lines 23-33) with the paths this spec actually exercises, so a future change to the behavior under test triggers the job: `tests/e2e/picker-flow.spec.ts`, `app/auth/**`, `app/api/auth/**`, `lib/auth/**`, `lib/http/**`, `lib/env/pickerCookieSigningKey.ts`, `lib/supabase/server.ts`, `app/api/test-auth/**`, `components/auth/**`, and `lib/email/canonicalize.ts`. The last five are the ones an enumeration keeps missing: the signing-key module because this task itself identifies that file's validation as a runtime prerequisite, so a change to its contract must trigger the job (R4 finding 7); `lib/supabase/server.ts` because the new guest sign-out path constructs its client there; and `app/api/test-auth/**` because the authed cases go through that endpoint via `signInAs` (`tests/e2e/helpers/signInAs.ts:58`) — not every case, since the claimed-row stub and the slug-only test are deliberately anonymous (R7 finding 6), so a change to it breaks the authed cases; `components/auth/**` because the first-contact case asserts the rendered identity chip (`tests/e2e/picker-flow.spec.ts:126-128`), which is `components/auth/IdentityChip.tsx`; and `lib/email/canonicalize.ts` because both `lib/auth/validateGoogleSession.ts` and `app/api/test-auth/set-session/route.ts` canonicalize through it to establish the authenticated and mismatch premises these tests depend on (R6 finding 2, R7 finding 1).

  **Three rounds have each found another missing path**, so treat the list as a discovered set rather than a derived one: before implementing, re-walk the suite's imports and assertions and add anything they reach that is not already covered by a listed glob. Without these paths the filter would fire for this PR (it touches `app/show/**` and the workflow itself) and then never again for the code under test. The structural pin asserts this exact list, so the list is what must be complete.
- [ ] Add `PICKER_COOKIE_SIGNING_KEY` to both workflows' `env:` blocks (alongside `TEST_AUTH_SECRET` at `.github/workflows/crew-e2e.yml:67` and `.github/workflows/dev-gate-e2e.yml:77`), a fixed 64-hex test constant in the same spirit as the other inline test secrets there. `dev-gate-e2e.yml` gets it for the same structural reason `HASH_FOR_LOG_PEPPER` is there: its webServer serves the whole app, so any request reaching the picker chain throws without it.
- [ ] Add the spec to the existing mobile-safari step's file list (same `--project=mobile-safari` invocation, so no new job and no second server boot), and update the workflow's header comment (lines 1-8) and the step name at line 104, both of which currently say this job runs exactly one spec.
- [ ] Rewrite the stale comment block at `playwright.config.ts:55-61`, which carries **three** false claims, not one (R6 finding 5 — the previous revision cited line 56 and fixed only the count):
  1. line 57 says "the 1 currently-active test"; after this change five are active;
  2. line 58 says "The 5 `.skip` stubs"; the file held four before this change and holds one after;
  3. lines 59-61 say the stubs are "pending a dedicated dispatch that writes the missing helper layer (seedShowWithCrew, seedPickerCookie, claimStamp)" — that helper layer exists, and the one remaining stub is blocked on shared-admin-fixture contention instead.

  Absorbed from the dissolved Task 7: it is a prose comment in a config file, so it has no test of its own and ships inside this task's commit rather than as a commit with nothing tested.
- [ ] Gate: both pins; `pnpm vitest run tests/ci tests/cross-cutting`.
- [ ] Commit: `ci(auth): run the picker-flow e2e spec and supply its signing key`

### Task 9: close the backlog entries and file the descoped follow-up

**Files:**

- Modify: `tests/docs/_metaDeferralLedgerGraduation.test.ts`
- Modify: root `BACKLOG.md` (the three entries and their section header, lines 129-149; plus the new BL-SERVER-ACTION-ORIGIN-GATE entry)
- Modify: `BACKLOG-archive.md`

**Extend the existing ledger guard, do not add a bespoke file.** `tests/docs/_metaDeferralLedgerGraduation.test.ts` already exists for precisely this failure class — its own header records that it was written because "a ledger/docs task with no genuine red state, only post-hoc checks that were already green" recurred across two review rounds, "so the graduation itself became a test" (`tests/docs/_metaDeferralLedgerGraduation.test.ts:1-7`). It covers the `DEFERRED.md` / `DEFERRED-archive.md` pair with a `GRADUATED` registry (`tests/docs/_metaDeferralLedgerGraduation.test.ts:33-41`) plus a no-overlap invariant (`tests/docs/_metaDeferralLedgerGraduation.test.ts:54-62`). The `BACKLOG.md` / `BACKLOG-archive.md` pair is the same shape and is currently uncovered, so this task generalises that guard to both pairs rather than writing a parallel one-off.

One mechanical difference to handle, and a trap inside it. The existing `DEFERRAL_ID` regex matches `### ID` only (`tests/docs/_metaDeferralLedgerGraduation.test.ts:27`), while backlog entries use both levels — the root backlog heads its entries with `##` (for example line 11), this spec's three sit at `###` under a `##` section header, and `BACKLOG-archive.md` holds 28 `##` and 9 `###` entry headings.

**Do not simply widen the shared regex to `##|###`.** That misclassifies prose section headings as IDs, and R5 finding 4 enumerated every live false match: `## CREWWARN instance discriminator …` (`DEFERRED-archive.md:181`), `## CI speedup — …` (`DEFERRED-archive.md:606`), `## CI unit-suite sharding …` (`DEFERRED-archive.md:702`), `## BLOCKRES — BlockedRowResolver …` (`DEFERRED-archive.md:1236`), and `## INFO-tab data-fidelity audit …` (`BACKLOG-archive.md:161`). Note that requiring a following em-dash does not filter them, since `## BLOCKRES — …` has that shape too.

Give each ledger pair its **own** matcher instead of one widened regex:

- the `DEFERRED` pair keeps `^### ([A-Z0-9][A-Z0-9-]+)` exactly as it is, so none of its false matches (all at `##`) can appear;
- the `BACKLOG` pair uses `^#{2,3} (BL-[A-Z0-9-]+)`, which is ledger-specific because every real backlog entry is `BL-`-prefixed and none of the five false matches is.

**Steps:**

- [ ] Write the failing test first — this task is not exempt from invariant 1, and the previous revision's `tests/docs` gate proved nothing because it covers `DEFERRED.md` graduation, not these entries (R3 finding 5). Generalise the guard so it runs over both ledger pairs, then add:
  - the three IDs to the backlog pair's graduated registry: `BL-PICKER-BOOTSTRAP-HOST-FLIP`, `BL-PICKER-GATE-SKIP-MISMATCH`, `BL-PICKER-CLAIMED-ROW-NEXT-DROP`. Each must be archive-only, which fails right now because all three are still active — that is the red phase.
  - the no-overlap invariant for the backlog pair, which catches the actual risk in a two-file move: an entry copied into the archive but never deleted from the active queue, or the reverse.
  - an assertion that the archived section carries the **resolution note naming this branch** (`fix/picker-flow-app-bugs`). Both documents require that provenance, but the previous revision left it as an unchecked implementation instruction, so an archive entry with no note would have passed every planned test (R5 finding 5).
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

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (full suite — a scoped subset misses registry suites), `pnpm test:audit:x1-catalog-parity`, `pnpm test:audit:x3-trust-domain`.
- [ ] Whole-file e2e run (absorbed from the dissolved Task 7): the whole-file command from the harness checklist, with the loopback `TEST_DATABASE_URL` assignment inline. Expected **five passed, one skipped** — two pre-existing active tests at `tests/e2e/picker-flow.spec.ts:70` and `tests/e2e/picker-flow.spec.ts:134`, the three un-skipped in Tasks 2, 4, and 6, and `tests/e2e/picker-flow.spec.ts:293` still skipped. This task is verification only and produces no commit, which is why the run belongs here. Trust the shell exit status rather than the summary line — that holds for Playwright here and for the Vitest runs above, where an uncaught error exits 1 with every test reported passing.

### Task 12: whole-diff adversarial review (cross-model)

- [ ] Dispatch a fresh-eyes Codex review of the whole diff through `scripts/codex-guard.mjs`, split by surface if the diff risks the brief-size cliff. The brief carries: REVIEWER ONLY, fresh-eyes posture, the do-not-relitigate list from spec §1.1, the verification transcript, and the `VERDICT:` instruction. Iterate to APPROVE.
- [ ] Commit each round's repairs as their own conventional commit, and the round record in §12 with them (R3 finding 12): `fix(auth): apply round-N whole-diff review findings`.

### Task 13: ship

- [ ] Push and open the PR with the spec summary and the impeccable dispositions.
- [ ] Wait for **real CI green** on the PR — not just local.
- [ ] **Dispatch every edited workflow PR CI will not run, and watch each to completion.** Reporting "real CI green" while a modified CI surface has never executed is the local-passes-CI-fails class this project treats as its own gate (R4 finding 5). Two dispatches, both **blocking** — a `workflow_dispatch` run is asynchronous and not merge-blocking, so firing and moving on would let the branch ship before its only picker-flow run finishes (R5 finding 2):
  - `dev-gate-e2e.yml`, always: it is `workflow_dispatch`-only (`.github/workflows/dev-gate-e2e.yml:25-30`), so Task 8's env edit there is invisible to PR CI.
  - `crew-e2e.yml`, if the PR's path filter did not already trigger it.

  Run capture, tightened after R6 finding 1 showed the first version was not actually race-safe: selecting "the latest run for this workflow and branch" can pick up a concurrent manual run or a delayed PR run, testing only ID **inequality** does not prove the ID is newer, and an unbounded wait hangs if no run ever appears. Restrict by event **and** commit SHA, require a strictly greater ID, and bound the wait:

  ```bash
  wf=dev-gate-e2e.yml; ref=fix/picker-flow-app-bugs; sha=$(git rev-parse HEAD)
  latest() {
    gh run list --workflow="$wf" --branch="$ref" --limit=20 \
      --json databaseId,event,headSha \
      --jq "[.[] | select(.event==\"workflow_dispatch\" and .headSha==\"$sha\") | .databaseId] | max // 0"
  }
  before=$(latest)
  gh workflow run "$wf" --ref "$ref"
  id=0
  for _ in $(seq 1 60); do
    id=$(latest); [ "$id" -gt "$before" ] && break
    id=0; sleep 5
  done
  [ "$id" -gt 0 ] || { echo "no workflow_dispatch run for $sha appeared within 5 minutes" >&2; exit 1; }
  gh run watch "$id" --exit-status
  ```

  `event=="workflow_dispatch"` excludes a PR-triggered run of the same workflow, `headSha` ties the run to the commit under test, `max` with `-gt` proves the run is newer rather than merely different, and the bounded loop fails loudly instead of hanging. For the conditional `crew-e2e.yml` dispatch, run the same block with the `wf` variable set to the crew-e2e workflow file instead.

  `gh run watch --exit-status` is what makes it blocking: it exits non-zero on failure, so a red dispatched run stops the merge instead of being reported as green.
- [ ] `gh pr merge --merge`, fast-forward local `main`, and verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## Task order and dependencies

1 → 2 (the helper must exist before its call sites). 3 → 4 (the matcher before the sweep that uses it). 5 and 6 are independent of each other and of 1 through 4. Task 7 no longer exists (dissolved above). 8 depends on 2, 4, and 6 — the spec must be green locally before CI is pointed at it. 9 also depends on 2, 4, and 6 so the archive note can name the un-skipped tests. **10 depends on 2, 3, 5, and 6.** Tasks 2, 3, and 6 edit the three UI-surface files, and Task 5 changes the rendered mismatch sentence that Task 10's own copy checklist inspects — so the gate must run after all four or it evaluates an incomplete diff. (R2 finding 7 caught the first omission, R3 finding 4 caught Task 3, R4 finding 4 caught Task 5.) 11 through 13 are the close-out sequence, in order.

## Risks

| Risk | Mitigation |
| --- | --- |
| The un-skipped e2e cases stay dark in CI | Task 8 names the spec in the job, extends the trigger to the paths under test, and pins both in structural tests. Scope limit stated openly: the job stays path-filtered, so the spec becomes `PATH_GATED`, not PR-blocking-capable — unconditional coverage is BL-RESURRECT-MOBILE-SAFARI-E2E |
| The e2e cases run in CI but crash on setup for want of `PICKER_COOKIE_SIGNING_KEY` | Task 8 adds the key where each workflow already keeps its secrets — job level in `crew-e2e.yml`, the Playwright run step's `env:` block in `dev-gate-e2e.yml` — registers the var in `REQUIRED_ENV`, and pins the 64-hex value shape in both |
| A task mutates tracked files without a commit, breaking the one-commit-per-task rule | Tasks 10 and 12 now carry explicit commit steps (R3 finding 12) |
| A docs-only task ships with no red phase | Task 9 now has its own structural test asserting the three IDs left `BACKLOG.md`, landed in the archive, and that the descoped follow-up was actually filed (R3 finding 5) |
| The invariant-9 registry row passes without pinning the call boundary | Task 4 adds the exact-pattern destructuring assertion alongside the row |
| An assertion migration silently weakens coverage | All thirteen are enumerated with per-site migrations; `relativeLocationOf` adds the leading-slash assertion without touching the shared helper the external case uses |
| Renaming a redirect wrapper disarms a dormant audit | Names are pinned in spec §3.3; the audit is dead code, so Task 2's diff review is the enforcement |
| Copy edit drifts from the catalog | Task 5 is one commit with all three updates plus the x1 gate, and its test compares the rendered sentence against a literal, not against the catalog alone |
| Local green, CI red | Task 13 treats real CI green as its own gate; the `E2E_PORT` and non-loopback `TEST_DATABASE_URL` traps are named in the harness checklist |
| A guest sign-out failure loops the person | Task 4 asserts the no-redirect-on-failure branch in all three failure shapes |

## 12. Findings and dispositions

### Impeccable dual-gate (Task 10) — complete

Both commands ran as isolated subagents (the standing project requirement; inline is a degraded run). Scope was the three UI-surface files' diff: `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/auth/callback/route.ts`, `app/auth/sign-out/route.ts`.

**Result: P0 = 0, P1 = 0 from both gates.** The audit scored the diff 20/20 (a11y, perf, responsive, theming, anti-patterns) with real-browser verification in Chromium at 390px and 320px.

| Tier | Finding | Disposition |
| --- | --- | --- |
| P3 | `_PickerInterstitial.tsx:16` docblock still described the claimed row as "a GET form to /auth/sign-in?next=" — the exact action-query-vs-field ambiguity that caused this bug | **Fixed in this task.** The docblock now states that `next` rides a hidden input and says why, naming the `/admin` fallback the old shape produced |
| P2 | The claimed-row control has no pending affordance; a tap is three or more hops with the row visually inert, inviting a re-tap on venue wifi | **Deferred** as BL-PICKER-CLAIMED-ROW-PENDING-STATE. Not a regression, and a pending state needs a new client boundary — a change to the picker's component topology rather than a class tweak |
| Pre-existing | `_PickerInterstitial.tsx:138` uses a bare `focus-visible:ring-offset-2` with no `ring-offset-<backdrop>`, so the offset resolves to `#fff` — which `DESIGN.md` §1.1 names as a dark-mode defect. Introduced in `4536d6b5a`, both gates flagged it as outside this diff | **Deferred** as BL-PICKER-ROW-RING-OFFSET-BACKDROP, with the sweep for other bare-offset rings |
| Pre-existing | Lock glyph is a unicode emoji rather than lucide (`DESIGN.md` §8); claimed-hovered and active-resting row treatments converge; the lock's rationale is `aria-label`-only | Noted, not filed: all three are deliberate choices recorded in the component's own comments from the M11.5 picker work, and none is touched by this diff |

No `DEFERRED.md` entry was required, since invariant 8 mandates those only for P0 and P1 findings, and there were none.

**One substantive discovery from the critique**, worth recording because it makes the shipped fix more valuable than the backlog entry claimed: `validateNextParam(undefined)` returns `DEFAULT_AUTH_NEXT_PATH`, which is `/admin`. So a crew member who tapped a claimed row did not merely land on a bare sign-in page — after signing in they were sent to the **admin** page. The backlog entry described only the lost `next`.

### Cross-model review rounds (Task 12)

Populated during that task: each round's findings, the verification that confirmed or refuted them, and the repair. Refuted claims are recorded with their refutation so a later round does not re-derive them.

Spec-round dispositions live in §10 through §14 of the spec document.

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

## 16. Round 5 adversarial review — plan-side dispositions

Codex returned `VERDICT: BLOCKING` with seven findings, all verified against the live tree, none refuted. Finding 7's spec-side residue is dispositioned in spec §14.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | BLOCKING | Task 7 still violated invariant 1: a comment edit has no test, and a post-fix verification run is green on arrival, yet the task produced its own commit | Accepted, and the fix is to **dissolve the task** rather than defend it. The comment edit moves into Task 8, which already edits config behind failing pins; the whole-file e2e run moves into Task 11, which is verification by definition and produces no commit. Numbering is preserved so cross-references stay valid |
| 2 | HIGH | The conditional `crew-e2e.yml` dispatch was fire-and-forget, and `workflow_dispatch` runs are asynchronous and not merge-blocking, so the branch could ship before its only picker-flow run finished; no race-safe way to capture the run ID was given | Accepted. Both dispatches are now blocking, with an explicit before/after run-ID capture (dispatch prints no ID, and `--limit=1` can return a previous run) and `gh run watch --exit-status` so a red run stops the merge |
| 3 | HIGH | Task 8 overstated what its gates prove for `dev-gate-e2e.yml`: `REQUIRED_ENV` only greps the name anywhere in the file, the 64-hex assertion was specified for one workflow, and that workflow's projects never call `pickerCookieSigningKey()` | Accepted. The shape assertion now covers both workflows, and the task states plainly that the `dev-gate-e2e.yml` entry is defensive only — no gate proves step scope and no run exercises the key there. Claiming otherwise was the nominal-gate mistake |
| 4 | MEDIUM | Widening the shared `DEFERRAL_ID` regex to `##\|###` misclassifies prose section headings as IDs; five live false matches were enumerated, and requiring an em-dash does not filter them | Accepted, all five verified. Each ledger pair now gets its own matcher: `DEFERRED` keeps `^### …` unchanged, and `BACKLOG` uses `^#{2,3} (BL-…)`, which is ledger-specific because every real backlog entry is `BL-`-prefixed and none of the false matches is |
| 5 | MEDIUM | Task 9's revised test dropped the resolution-note assertion, so an archive entry with no branch provenance would pass every planned test while violating both documents | Accepted; that assertion is back in the red set |
| 6 | MEDIUM | All three tasks touched by the R4 un-skip restructure omitted `tests/e2e/picker-flow.spec.ts` from their `Files` inventories | Accepted for all three instances; Tasks 2, 4, and 6 now list it with the line each un-skips |

## 17. Round 6 adversarial review — dispositions

Codex returned `VERDICT: BLOCKING` with six findings and stated plainly that "the app design itself remains converged; this round found CI/plan-execution defects and accounting drift, not a new app-design error" — while noting that findings 1 and 2 could still produce a false-green merge, which is why they are HIGH rather than cosmetic. All six verified, none refuted.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | HIGH | The run capture was not race-safe: it took the latest run for a workflow and branch without restricting event or commit, tested only ID inequality rather than "newer", and had no bounded failure path — so the worker could watch an unrelated green run while the intended one queued or failed | Accepted. The snippet now filters on `event=="workflow_dispatch"` **and** `headSha` equal to the commit under test, takes `max` and requires `-gt` the pre-dispatch value, and bounds the wait at five minutes with a loud failure. Both dispatches use it |
| 2 | HIGH | The path filter — and therefore the pin asserting it — omitted `lib/supabase/server.ts` (where the new guest sign-out constructs its client) and `app/api/test-auth/**` (how every case in the suite authenticates), so meaningful changes stayed dark | Accepted, both verified. Added, with the note that the pin asserts this exact list, so the list is the thing that must be complete |
| 3 | MEDIUM | The `TEST_DATABASE_URL` trap was described but never made executable: no assignment and no URL, in a plan a worker is meant to follow from these documents alone | Accepted. The harness checklist now carries the canonical loopback assignment (`scripts/preflight-env.mjs:125`), and all four mutating runs reference it |
| 4 | LOW | The `dev-gate-e2e.yml` env placement was still called job-level in two places, and `REQUIRED_ENV` does not establish placement anywhere | Accepted; both places now name the Playwright run step's block and say what the gates do not prove |
| 5 | LOW | The folded config-comment repair cited the wrong line and would have left two further false claims behind | Accepted, and worse than reported in one respect: the block carries **three** false claims — the active-test count, the stub count, and a "missing helper layer" that now exists. All three are enumerated |
| 6 | LOW | Round accounting drift: four rounds claimed where five had run, and spec §14 missing from both pointers | Accepted; corrected |

## 18. Round 7 dispositions, and the decision to proceed to implementation

Codex returned `VERDICT: BLOCKING` with six findings and stated that findings 2 through 6 "are accounting or citation residue and would not independently block approval," while finding 1 "can still produce the false-green merge this CI work is intended to prevent."

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | HIGH | The path filter and its pin still omitted `components/auth/**` (the first-contact case asserts the rendered identity chip at `tests/e2e/picker-flow.spec.ts:126-128`) and `lib/email/canonicalize.ts` (both the test-auth boundary and `validateGoogleSession` canonicalize through it) | Accepted, both verified. Added. Since three consecutive rounds each found another missing path, Task 8 now instructs a pre-implementation re-walk of the suite's imports and assertions rather than trusting the enumeration |
| 2 | LOW | The `dev-gate-e2e.yml` placement was still called job-level in the file inventory and risk table, despite §17 claiming both were fixed | Accepted; both now name the run step's block, and note that job level would also function |
| 3 | LOW | The fixture counts were restated in three noncanonical places even while agreeing | Accepted; the restatements are gone and cite §3.4 instead |
| 4 | LOW | The quoted "5 `.skip` stubs" text is at `playwright.config.ts:58` | Accepted |
| 5 | LOW | The whole-file run is Playwright but the exit-status note named Vitest | Accepted; the note now covers both runners |
| 6 | LOW | The documents claimed every picker-flow case authenticates via `signInAs`; the claimed-row stub and the slug-only test are anonymous | Accepted; the claim is now scoped to the authed cases |

### Why this is the last documents-only round

Seven rounds have run with no implementation code. Rounds 4 through 7 produced **no app-design findings** — the reviewer said so explicitly in rounds 6 and 7 — and their yield has been plan mechanics, CI wiring, and accounting drift. Two things follow.

First, the substantive residue is closed: every finding across seven rounds that could produce wrong behavior, an unsafe action, or a false-green merge has been repaired, and the one design-correctness vector that resisted repair (the same-origin gate) was descoped under the three-round prose cap rather than patched a fourth time.

Second, `docs/agents/spec-self-review.md` is explicit that prose rounds past convergence have negative marginal value, and `AGENTS.md` treats idle wall clock on an autonomous run as a first-order failure. Continuing to round 8 to chase citation residue would trade shipped behavior for document polish.

**Decision:** the documents are declared execution-ready and implementation begins at Task 1. The accepted residual is accounting-only — the kind of drift rounds 5, 6, and 7 each turned up in new places while the underlying instructions stayed correct. It carries no behavioral risk, and the whole-diff review in Task 12 reviews the real code, which is the artifact that matters from here. Any further citation drift found during implementation is fixed in the commit that touches that text.
