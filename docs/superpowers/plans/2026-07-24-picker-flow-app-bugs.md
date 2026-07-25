# Picker-flow app bugs — implementation plan

**Spec:** `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` (canonical; this plan never supersedes it)
**Branch:** `fix/picker-flow-app-bugs`, worktree `../FX-worktrees/picker-flow-app-bugs` off `origin/main`
**Implementer:** Opus / Claude Code (UI file in scope, so invariant-8 routing applies)

---

## 0. Pre-draft verification transcript

Per `docs/agents/writing-plans.md` ("Pre-draft code-verification pass"), every file, function, and line this plan names was grepped in this worktree on 2026-07-24 before drafting. Results that shaped the task list:

| Claim | Verified |
| --- | --- |
| Six `request.url`-derived redirect expressions | `app/api/auth/picker-bootstrap/route.ts:188`, `app/api/auth/picker-bootstrap/route.ts:210`, `app/auth/callback/route.ts:16`, `app/auth/callback/route.ts:31`, `app/auth/sign-out/route.ts:132`, `app/api/auth/google/start/route.ts:8` (built) with `app/api/auth/google/start/route.ts:11` (redirected). Only `app/api/auth/google/start/route.ts:65` is external |
| The `authChain` redirect-ordering audit is **dead code** | `auditM5AuthFile` (`lib/audit/authChain.ts:177`) has no callers; the live X.3 audit is `auditProjectAuthChains` (`lib/audit/authPrimitives.ts:815`), which carries no redirect-ordering or cookie-literal rule. Wrapper names are kept for minimal diff, not for gate compliance |
| `clearIdentityAndSkip` shape | `lib/auth/picker/clearIdentity.ts:55`, redirect at `lib/auth/picker/clearIdentity.ts:61`, `clearIdentityCore` at `lib/auth/picker/clearIdentity.ts:64`, the `PICKER_IDENTITY_CLEARED` emit at `lib/auth/picker/clearIdentity.ts:114`, and the `// no-telemetry:` comment at `lib/auth/picker/clearIdentity.ts:56` |
| `clearIdentity` (non-skip) has exactly one caller | `components/auth/IdentityChip.tsx:23` — the identity chip's "not me" control. It must **not** gain sign-out |
| `createSupabaseServerClient` throws on missing env | `lib/supabase/server.ts:41-45` |
| `signOut` defaults to global scope | installed `@supabase/auth-js` 2.105.1, GoTrueClient.js line 3176: `async signOut(options = { scope: 'global' })`. The guest path must pass `{ scope: "local" }` |
| Same-origin gate precedent for a destructive handler | `app/auth/sign-out/route.ts:78-87` |
| Input validation currently sits downstream of the destructive step | regexes at `lib/auth/picker/clearIdentity.ts:74-80`, inside `clearIdentityCoreImpl` |
| `/auth/sign-in` reads and validates `next` | `app/auth/sign-in/page.tsx:71-72` (line 52 is only the type member) |
| Invariant-9 walker covers `lib/auth` | `tests/auth/_metaInfraContract.test.ts:337`; registry array at `tests/auth/_metaInfraContract.test.ts:219-232`; constructor-inside-`try` scan at `tests/auth/_metaInfraContract.test.ts:242` |
| Existing test harness for `clearIdentity` | `tests/auth/picker/clearIdentity.test.ts:15-31` mocks `next/cache`, `next/navigation` (redirect throws a `NEXT_REDIRECT` digest), `next/headers`, and `@/lib/log` via `vi.hoisted` |
| Claimed-row form | `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:88` builds the URL, and `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:156` is its only consumer |
| Hidden-input precedent | `app/auth/sign-in/SignInButton.tsx:35-36` |
| Catalog row and its prose twin | `lib/messages/catalog.ts:3496`; `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3082` |
| `AUTH_SIGNOUT_FAILED` is log-only | absent from `lib/messages/catalog.ts` and from master-spec section 12.4; used at `app/auth/sign-out/route.ts:106` and `app/auth/sign-out/route.ts:115` |
| e2e stubs and the one that stays skipped | `tests/e2e/picker-flow.spec.ts:84`, `tests/e2e/picker-flow.spec.ts:180`, and `tests/e2e/picker-flow.spec.ts:241` un-skip; `tests/e2e/picker-flow.spec.ts:293` stays (test-infra flake, reason at `tests/e2e/picker-flow.spec.ts:286-292`) |
| Both new unit test files need no config wiring | `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) already matches them. `tests/lib/**` is listed in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:77`) so tests/lib/hostRelativeRedirect.test.ts runs in the parallel phase; `tests/cross-cutting/**` is not in that list, so the new guard runs in the serial phase, which is correct for a filesystem walker |
| Baseline audit state | `pnpm test:audit:x3-trust-domain` → 5 files, 26 tests, green, before any edit |

Snippet typecheck note: the snippets embedded below are written against the repo's strict `tsconfig` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Task 1 and Task 4 both run `pnpm typecheck` as part of their own gate, so a paste-time type error fails that task rather than surfacing at push.

## 0.1 Meta-test inventory (mandatory declaration)

- **CREATES:** tests/cross-cutting/no-absolute-self-redirect.test.ts — filesystem-walked structural guard banning the `new URL(..., request.url)` redirect shape under `app/`.
- **EXTENDS:** `tests/auth/_metaInfraContract.test.ts` — one registry row for `lib/auth/picker/clearIdentity.ts` (invariant 9), added in the same commit as the Supabase call that requires it (Task 4).
- **Not applicable, with reasons:** advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` in this diff; sentinel-hiding and admin-alert-catalog meta-tests — no tile rendering and no `admin_alerts.upsert`; no-inline-email-normalization — no email handling; `tests/log/_metaMutationSurfaceObservability.test.ts` — the file is **not** edited, but Task 4 changes how `clearIdentityAndSkip` satisfies it (exemption comment becomes a code-carrying emit), so that test is re-run as part of Task 4's gate.
- **Layout-dimensions task:** not applicable — spec §5.1 declares no dimensional invariants (the only markup change adds a `display: none` hidden input, which contributes no box).
- **Transition-audit task:** not applicable — spec §5.2 declares no visual-state change in either touched component.

## 0.2 e2e harness-readiness checklist (mandatory)

- **Server boot:** the `mobile-safari` Playwright project (`playwright.config.ts:54`) runs against the baseline `webServer` entry at `playwright.config.ts:216`, bound explicitly to `127.0.0.1` on `E2E_PORT` (default `3000`, `playwright.config.ts:8`) with `ENABLE_TEST_AUTH` and `TEST_AUTH_SECRET` set. `picker-flow` is already in that project's `testMatch` (`playwright.config.ts:62`), so no config wiring is added — only the stale stub-count comment at `playwright.config.ts:56` changes.
- **Readiness gate:** every un-skipped stub already awaits a testid-visibility assertion after `page.goto(..., { waitUntil: "networkidle" })` — `sign-in-or-skip-gate`, `picker-interstitial-root`, or `crew-shell`. The visibility assertion, not `networkidle`, is the gate each first interaction depends on; the three stubs are left with that structure intact. `signInAs` (`tests/e2e/helpers/signInAs.ts:43`) posts through `page.request` so `Set-Cookie` lands on the same context before the first `goto`.
- **Detach safety:** none of the three stubs samples geometry or calls `locator.evaluate` on a node that can unmount mid-call. The only navigation-crossing wait is `page.waitForURL`, which is detach-safe by construction. No sampler is added.
- **Local run:** `TEST_DATABASE_URL` in the shared `.env.local` is non-loopback (preflight warns), so these mutating specs run with it overridden to the loopback URL for the local pass. Port `3000` is checked for an existing listener before boot and never blanket-killed.

---

## 1. Task list

Every task: failing test first, minimal implementation, passing test, one commit (invariants 1 and 6).

### Task 1 — `hostRelativeRedirect` helper

**Test first:** a new test file, tests/lib/hostRelativeRedirect.test.ts.

Assertions, each with the failure mode it catches:

| Assertion | Catches |
| --- | --- |
| `hostRelativeRedirect("/admin").status === 302` and `headers.get("Location") === "/admin"` | A helper that re-absolutizes the path (the whole bug) |
| `hostRelativeRedirect("/auth/sign-in", 303).status === 303` | A hardcoded status, which would break the sign-out 303 contract |
| `Location` for `"/show/a/b?s=budget&gate=skip"` is byte-identical | Query loss, which would silently drop the section deep-link |
| Response body is empty and `Location` is the only header asserted | A helper that leaks a body into a redirect |
| Each of `undefined`, `null`, the empty string, a bare `foo`, a protocol-relative path, an absolute `https` URL, a backslash-bearing path, and a control-character-bearing path throws `InvalidRelativeRedirectPathError` | Open redirect via protocol-relative or absolute path; a guard that only checks the first character |
| Status `null`, `NaN`, `302.5`, `200`, and `404` each throw; `300` and `399` are accepted | A `??` default that turns `null` into 302, and a non-redirect status emitted with a `Location` header, which has no redirect semantics |

**Implementation:** the new file lib/http/hostRelativeRedirect.ts per spec §3.2. The guard runs before any response is constructed.

**Gate:** `pnpm vitest run tests/lib/hostRelativeRedirect.test.ts`, `pnpm typecheck`.
**Commit:** `feat(infra): add a host-relative redirect helper`

### Task 2 — apply the helper to all six sites, plus the structural guard

**Test first:** the new file tests/cross-cutting/no-absolute-self-redirect.test.ts, written to fail against the current tree (it will report all five sites before the fix).

The detector is an exported pure function so it can be tested directly, and the test has the three layers spec §3.4 requires:

1. **Fixtures per form.** Synthetic sources: inline `NextResponse.redirect(new URL(p, request.url))`; variable-assigned `const url = new URL(p, request.url); return NextResponse.redirect(url)`; the `req.url` spelling of each. Three negatives that must NOT flag: `NextResponse.redirect(data.url)`, a `new URL` with an absolute base, and a `new URL(..., request.url)` never passed to a redirect.
2. **Tree walk.** The same detector over every `.ts` and `.tsx` under `app/`; flagged list must be empty. This is what fails before the fix and after any revert.
3. **Coverage floor.** The walk visited more than 50 files.

**Implementation:** rewrite the six expressions per spec §3.3. `redirectTo` and both `signInRedirect` helpers keep their names, signatures, and positions; each `signInRedirect` switches to `URLSearchParams`. `app/auth/sign-out/route.ts` changes line 132 only.

**Gate:** the new guard test; `pnpm test:audit:x3-trust-domain`; `pnpm vitest run tests/api tests/auth`; `pnpm typecheck`. Note the x3 gate does **not** cover the redirect-ordering expectation in `lib/audit/authChain.ts` — that function is unreferenced (spec §3.3), so the wrapper names are preserved by discipline, and this task's own diff review is what enforces it.
**Commit:** `fix(auth): emit host-relative redirects so the auth cookie survives`

### Task 3 — shared Supabase auth-cookie matcher

**Test first:** the new file tests/auth/supabaseAuthCookieNames.test.ts. Matches `sb-abc-auth-token`, `sb-abc-auth-token.0`, `sb-abc-auth-token.1`, `sb-abc-auth-token-code-verifier`. Rejects `sb-abc-other`, `__Host-fxav_picker`, `sb--auth-token`, `sb-abc-auth-token-extra`, and the empty string. Catches an over-broad matcher that would clear unrelated cookies, and a narrowed one that would leave a session shard behind.

**Implementation:** the new file lib/auth/supabaseAuthCookieNames.ts exporting `isSupabaseAuthCookieName`, with the regex moved verbatim from `app/auth/sign-out/route.ts:51`. The route's local `clearSupabaseAuthCookies(request, response)` keeps its name, signature, and position and delegates the name test to the helper; its `Max-Age=0` literal stays inline for `lib/audit/authChain.ts:170`.

**Gate:** the new test; `pnpm test:audit:x3-trust-domain`; `pnpm vitest run tests/auth`.
**Commit:** `refactor(auth): share the Supabase auth-cookie name matcher`

### Task 4 — "Continue as guest" signs out

**Test first:** extend `tests/auth/picker/clearIdentity.test.ts`, adding mocks for `@/lib/supabase/server` and `next/headers`'s `headers()` alongside the existing four (`tests/auth/picker/clearIdentity.test.ts:15-31`).

| Assertion | Catches |
| --- | --- |
| A shared `calls: string[]` records `"cookieSet"` and `"signOut"`, asserted as `calls.indexOf("cookieSet") < calls.indexOf("signOut")` | The reversed order, which on a picker-clear failure strands a live foreign session beside a stale picker identity and exposes it on the next render |
| `signOut` is called with exactly `{ scope: "local" }` | The library default `{ scope: 'global' }`, which revokes a colleague's sessions on all their devices |
| A malformed slug, share-token, or show-id returns `PICKER_INVALID_INPUT` and the `createSupabaseServerClient` mock has **zero** calls | Validation left downstream, so a malformed direct submission signs the person out and only then reports the error |
| A cross-site header shape (`sec-fetch-site: cross-site`, and separately a mismatched `origin` with no `sec-fetch-site`) returns `PICKER_INVALID_INPUT` with zero client constructions | UI reachability treated as authorization for a destructive exported action |
| A `clearIdentityCore` infra failure returns before any sign-out attempt | A picker-clear failure that still destroys the session |
| Every cookie satisfying `isSupabaseAuthCookieName` is set with `maxAge: 0`; `__Host-fxav_picker` is not cleared by that sweep | A sweep that misses a shard, or one that eats the picker cookie |
| Happy path throws the `NEXT_REDIRECT` digest carrying `?gate=skip` | Losing the redirect, leaving the person on a blank action response |
| Each of: `signOut` returning `{ error }`, `createSupabaseServerClient` throwing, and the cookie sweep throwing returns `{ ok: false, code: "AUTH_SIGNOUT_FAILED" }`, emits that code, and throws **no** `NEXT_REDIRECT` | A failure that still redirects and loops the person back to Mode B; handling only one of three real failure shapes |
| `clearIdentity` (non-skip) never constructs a Supabase client | Scope creep into the identity-chip "not me" path (`components/auth/IdentityChip.tsx:23`) |

**Implementation:** spec §4.3, in its five numbered steps — validate, same-origin gate, picker clear, device-local sign-out, redirect. Hoist the slug/token/uuid regexes at `lib/auth/picker/clearIdentity.ts:74-80` into a shared exported predicate used by both `clearIdentityAndSkip` and `clearIdentityCoreImpl` so the two cannot drift. Keep the `// no-telemetry:` comment at `lib/auth/picker/clearIdentity.ts:56` and add the code-carrying `log.error`. Add a `lib/auth/picker/clearIdentity.ts` row to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (`tests/auth/_metaInfraContract.test.ts:219-232`) **in this commit**.

**Gate:** the extended test; `pnpm vitest run tests/auth tests/log`; `pnpm test:audit:x3-trust-domain`; `pnpm typecheck`.
**Commit:** `fix(auth): sign the device out when crew continue as guest`

### Task 5 — mismatch prompt copy, three-way lockstep

**Test first:** extend `tests/components/SignInOrSkipGate.test.tsx` to assert Mode B renders the amended sentence through `messageFor`, and that the CTA label is still exactly "Continue as guest". Catches a catalog edit that never reaches the surface, and a surface that hardcodes copy instead of reading the catalog.

**Implementation, all in one commit** (per `AGENTS.md`): the section-12.4 prose row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3082`; `pnpm gen:spec-codes`; the `crewFacing` field at `lib/messages/catalog.ts:3496`. New wording is fixed in spec §4.4 — it says "signs this device out", never "out of Google", and the `followUp` field is left byte-identical. No em-dash, straight apostrophes. The master spec is **not** run through Prettier.

**Gate:** `pnpm test:audit:x1-catalog-parity`; the extended component test; `pnpm vitest run tests/messages`.
**Commit:** `fix(auth): say that continuing as guest signs the device out`

### Task 6 — claimed-row form keeps `next`

**Test first:** extend `tests/components/PickerInterstitial.test.tsx` per spec §6.1, reading the form's `action` attribute and the hidden input **separately** so a form that keeps the query in its action cannot pass, and deriving the expected value by calling `buildShowReturnUrl` with the same fixture inputs rather than hardcoding a path.

**Implementation:** spec §5. Remove `signInRecoveryUrl` (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:88`); `action="/auth/sign-in"` plus a hidden `next` input carrying the raw path. No other attribute or class changes.

**Gate:** the extended component test; `pnpm vitest run tests/components tests/show`; `pnpm lint` (canonical Tailwind); `pnpm typecheck`.
**Commit:** `fix(crew-page): keep the return target on claimed-row sign-in`

### Task 7 — un-skip the three e2e stubs

**Implementation:** drop `.skip` at `tests/e2e/picker-flow.spec.ts:84`, `tests/e2e/picker-flow.spec.ts:180`, and `tests/e2e/picker-flow.spec.ts:241`, and delete each stub's now-stale `// SKIP:` comment block. Extend the `tests/e2e/picker-flow.spec.ts:180` case per spec §6.2 with the three added assertions: no cookie satisfying `isSupabaseAuthCookieName` remains; tapping the unclaimed row (Bob) renders `crew-shell` with his identity chip; and a bare reload with no `?gate=skip` still renders `crew-shell`. That last step is the durability proof — without it a one-request-only fix passes, which is the exact design spec §4.2 rejects. Correct the stub-count comment at `playwright.config.ts:56` to name the single remaining stub. `tests/e2e/picker-flow.spec.ts:293` stays skipped.

**Gate:** `pnpm playwright test tests/e2e/picker-flow.spec.ts --project=mobile-safari` with the loopback `TEST_DATABASE_URL` override, all four cases accounted for (three pass, one skipped).
**Commit:** `test(auth): un-skip the three picker-flow stubs their fixes unblocked`

### Task 8 — close the backlog entries

**Implementation:** move the three entries and their section header (root `BACKLOG.md` lines 129-149) into `BACKLOG-archive.md` with a one-line resolution note naming this branch, keeping the surrounding `---` separators well-formed. No `echo >>` — the edit is made with a file edit, and the result is checked with `git diff`.

**Gate:** `pnpm format:check`; `pnpm vitest run tests/docs`.
**Commit:** `docs: archive the three shipped picker-flow backlog entries`

### Task 9 — invariant-8 impeccable dual-gate

Run `/impeccable critique` **and** `/impeccable audit` on all three UI-surface files in this diff — `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`, `app/auth/callback/route.ts`, and `app/auth/sign-out/route.ts` (any `app/` file outside `app/api/**` is a UI surface under invariant 8) — both with the canonical v3 setup gates (the context.mjs context load of PRODUCT.md and DESIGN.md, then the register reference read). Both run with subagents, never inline. P0 and P1 findings are fixed or explicitly deferred with a `DEFERRED.md` entry; findings and dispositions go in §12 of this plan and in the PR body, since this branch has no milestone handoff doc to carry the usual §12 record.

Pre-code mechanical checklist, applied before the gate rather than discovered by it: no em-dash in user-visible copy (Task 5's sentence), straight apostrophes, 44px tap targets untouched (`min-h-tap-min` stays on the row), canonical type and token classes unchanged, no new color token.

### Task 10 — full pre-push gates

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (full suite — a scoped subset misses registry suites), `pnpm test:audit:x1-catalog-parity`, `pnpm test:audit:x3-trust-domain`, and the picker-flow e2e run from Task 7. Check the shell exit status, not the "Tests" line, since Vitest exits 1 on uncaught errors even when every test passes.

### Task 11 — whole-diff adversarial review (cross-model)

Dispatch a fresh-eyes Codex review of the whole diff through `scripts/codex-guard.mjs`, scoped by surface if the diff is large enough to risk the brief-size cliff. Brief carries: REVIEWER ONLY, fresh-eyes posture, the do-not-relitigate list from spec §1.1, the verification transcript, and the `VERDICT:` instruction. Iterate to APPROVE.

### Task 12 — ship

Push, open the PR with the spec summary and the impeccable dispositions, wait for **real CI green** (not just local), `gh pr merge --merge`, then fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## 2. Task order and dependencies

1 → 2 (the helper must exist before the call sites use it). 3 → 4 (the matcher before the sweep that uses it). 5 and 6 are independent of each other and of 1 through 4. 7 depends on 2, 4, and 6 — all three app fixes must be in before the stubs can pass. 8 depends on nothing but is committed after 7 so the archive note can name the un-skipped tests. 9 depends on 6. 10 through 12 are the close-out sequence, in order.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Renaming a redirect wrapper silently disarms `lib/audit/authChain.ts:130` | Names are pinned in spec §3.3 and Task 2's gate runs the x3 audit explicitly |
| The invariant-9 walker fails the build on the new Supabase call | Registry row lands in the same commit (Task 4), pre-emptively, per `AGENTS.md` invariant 9 |
| Section-12.4 copy edit drifts from the catalog | Task 5 is one commit with all three updates and the x1 gate |
| e2e passes locally, fails in CI | Task 12 treats real CI green as its own gate; the two host-binding traps (`E2E_PORT`, non-loopback `TEST_DATABASE_URL`) are named in §0.2 |
| A guest sign-out failure loops the user | Task 4 asserts the no-redirect-on-failure branch explicitly, in both the returned-error and thrown-error shapes |

---

## 12. Findings and dispositions

Populated during execution. Two records live here:

- **Impeccable dual-gate (Task 9):** every P0 through P3 finding from `/impeccable critique` and `/impeccable audit` across the three UI-surface files, each marked fixed or deferred with its `DEFERRED.md` entry. This section stands in for the milestone-handoff §12 record, which this standalone branch does not have.
- **Cross-model review rounds (Task 11):** each round's findings, the verification that confirmed or refuted them, and the repair. Refuted claims are recorded with their refutation so a later round does not re-derive them.

Spec-round dispositions are already recorded in §10 of the spec document.
