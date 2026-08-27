# Switch person signs a Google viewer out — design

**Branch:** `feat/switch-person-google-signout` · **Filed:** 2026-08-25 · **Facing:** product · **Closes:** `BL-SWITCH-PERSON-GOOGLE-LOOPBACK` (code) and `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE` (archive only, §4).

## 1. Summary

"Not you? Switch person" in the crew avatar menu does nothing for a viewer whose access comes from a live Google session. The action deletes the picker cookie entry, the next resolve sees the Google session with no matching entry, and `needs_picker_bootstrap` re-mints the same identity (`lib/auth/picker/resolveShowPageAccess.ts:246-252`). Eric ratified the fix on 2026-08-25: the clear also signs the browser out (Supabase `signOut({ scope: "local" })`), then the person lands where a cookie-only viewer already lands after a switch.

The code that does this exists. `clearIdentityAndSkip` (Mode B "Continue as guest", `lib/auth/picker/clearIdentity.ts:105-123`) already clears the entry and then calls the module-private `signOutThisDevice` (`lib/auth/picker/clearIdentity.ts:133-200`). This spec makes `clearIdentity` call the same helper, signing out first and then clearing (§3.2 says why the order differs from Mode B). No second sign-out is written.

## 1.1 Resolved scope — do not relitigate

| Decision | Ruling | Ratification |
| --- | --- | --- |
| Google-authed switch person signs the viewer out (`scope: "local"`) as part of the clear, then returns to the picker flow. Not hidden, not relabelled. | Settled. "Hide or relabel for Google viewers" was the losing option of the row's own open decision (`BACKLOG.md:656`). | Eric, 2026-08-25 13:50 CDT, recorded in the orchestrator handoff _briefs/2026-08-22-bl-orch-handoff.md (untracked, line 139) |
| Keeping the Google session alive across a switch | It is the defect, not a posture. | `BACKLOG.md:648-656` |
| `scope: "local"`, never `global` | A guest on a shared iPad must not sign a colleague out of their phone. | Comment at `lib/auth/picker/clearIdentity.ts:126-132`; pinned by `tests/auth/_metaInfraContract.test.ts:297-308` |
| The app-wide `/auth/sign-out` route keeps `scope: "global"` | Untouched. | `app/auth/sign-out/route.ts:96` |
| The bootstrap chain in `resolveShowPageAccess.ts` | Untouched. The fix is at the clear site, not the resolve site. | Dispatch brief _briefs/2026-08-25-arc-signout.md (untracked), Scope section |
| Snapshot read retry (`BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`) | No helper-level retry in this arc. The ratified "one bounded retry, then fail loud" is met by the fetch-layer retry PR #882 installs on the server client; stacking a second layer composes loops. The row is archived here with that disposition (§4). | bl-orch ruling 2026-08-25 ~14:40 CDT (message to pane wY:p5); Eric's ratification in the same handoff file, line 140 |
| Where the person lands after the switch | The same place a cookie-only viewer lands today: the route re-renders and resolves to `no_auth` / `first_contact`, the Mode A gate (§3.3). No redirect is added to `clearIdentity`. | Derived from the existing cookie-only path, `lib/auth/picker/resolveShowPageAccess.ts:114` and `app/show/[slug]/[shareToken]/page.tsx:318-332`; see §3.3 for why a redirect is not the fix |
| Sign-out is unconditional on the clear path, not gated on "is this viewer Google-authed" | A live Google session always wins resolve over a cookie entry (`resolveShowPageAccess.ts:237-252` runs before the cookie path), so any session present at switch time is the one causing the loopback. With no session, `signOut` is a local no-op (§2.2). No identity-source discriminator is threaded to the menu. | Probe §2.2 |

## 2. Background — probed, not theorized

### 2.1 The loopback

`resolveShowPageAccess` validates the Google session before it consults the picker cookie. A `success` with a missing or mismatched entry returns `needs_picker_bootstrap` (`lib/auth/picker/resolveShowPageAccess.ts:246-252`), and the page follows it to `/api/auth/picker-bootstrap` (`app/show/[slug]/[shareToken]/page.tsx:225-236`), which writes the same crew member back into the cookie. `clearIdentity` (`lib/auth/picker/clearIdentity.ts:79-87`) deletes the entry and never touches the session, so the tap is a round trip to the same identity. The prior arc documented this as a limit and filed the row (`docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §4.7).

### 2.2 `signOut({ scope: "local" })` with no session is a local no-op

auth-js 2.105.1 (the installed `@supabase/auth-js`), `GoTrueClient._signOut` in that package's built GoTrueClient.js, read from `node_modules` at draft time: it reads the stored session; a missing-session error is tolerated; the network call to `admin.signOut` runs only when an access token exists; then `_removeSession()` clears local storage and returns `{ error: null }`. So calling it for a cookie-only viewer costs one client construction and a cookie read, makes no network request, and returns no error. The residual-cookie sweep in `signOutThisDevice` (`clearIdentity.ts:185-199`) iterates existing Supabase auth cookies, of which there are none.

### 2.3 What `clearIdentityAndSkip` already does

`lib/auth/picker/clearIdentity.ts:105-123`: same-origin gate, parse, validate before anything destructive, `clearIdentityCore`, then `signOutThisDevice(input.showId)`, then `redirect(... gate: "skip")`. The ordering comment at `lib/auth/picker/clearIdentity.ts:97-104` is the contract this spec inherits: picker entry first, sign-out second, so a sign-out failure leaves no stale identity reachable and the next render is a retryable gate.

`signOutThisDevice` (`lib/auth/picker/clearIdentity.ts:133-200`) carries the three-stage fault model (`client_construction`, `sign_out_threw`, `sign_out_returned_error`, plus `residual_cookie_sweep`), the `AUTH_SIGNOUT_FAILED` forensic emit, and returns the catalogued `PICKER_RESOLVER_LOOKUP_FAILED` on every failure (`lib/auth/picker/clearIdentity.ts:146-158`). One thing in it is caller-specific: the emit's `source` is the literal `auth.picker.clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts:147`). Nothing outside the module pins that string (grep of `tests/` and `lib/` for `auth.picker.clearIdentityAndSkip` finds only `clearIdentity.ts` itself).

### 2.4 Where a cookie-only switch lands today

After `clearIdentityCoreImpl` deletes the entry it calls `revalidatePath` (`clearIdentity.ts:255`), the route re-renders in the same request with the mutated cookies, `resolvePickerSelection` reports `no_selection`, and `toPageResult` maps that to `{ kind: "no_auth", reason: "first_contact" }` (`resolveShowPageAccess.ts:114`). The page renders `SignInOrSkipGate` in Mode A (`page.tsx:318-332`; modes at `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:9-15`), whose "Continue as guest" leads to the picker. `AvatarMenu` relies on exactly this: its success-branch comment says a cookie-only viewer unmounts the whole control via revalidatePath, so success needs no branch (`components/auth/AvatarMenu.tsx:185-186`).

## 3. Design — `clearIdentity` signs out, then clears; Mode B keeps its order

### 3.1 Shape

`lib/auth/picker/clearIdentity.ts`:

```ts
export async function clearIdentity(formData: FormData): Promise<ClearIdentityResult> {
  if (!(await isSameOriginServerAction())) return rejectCrossOriginPicker("clearIdentity");
  const input = parseFormData(formData);
  if (!input) return { ok: false, code: "PICKER_INVALID_INPUT" };
  // Validate before anything destructive, as the guest action does.
  if (!isValidClearIdentityInput(input)) return { ok: false, code: "PICKER_INVALID_INPUT" };
  // Sign-out FIRST on this path (§3.2): the core schedules revalidatePath, and a
  // re-render with the session still live re-mints the identity via bootstrap.
  const signedOut = await signOutThisDevice(input.showId, "clearIdentity");
  if (!signedOut.ok) return signedOut;
  return clearIdentityCore(input);
}
```

`clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts:105-123`) is unchanged except that its `signOutThisDevice` call passes its own action name. `signOutThisDevice(showId, action)` takes the caller's action name and emits `source: \`auth.picker.${action}\``. Everything else in it is unchanged: the three stages, the `AUTH_SIGNOUT_FAILED` code, the residual sweep, the returned `PICKER_RESOLVER_LOOKUP_FAILED`. The `const { error } = await supabase.auth.signOut({ scope: "local" })` line stays byte-identical because `tests/auth/_metaInfraContract.test.ts:297-308` pins it by regex and it remains the module's only sign-out call site.

Nothing is exported that was not exported before. `clearIdentityCore` keeps its own same-origin gate and its own `action` string (`lib/auth/picker/clearIdentity.ts:211-213`); the render-path enumeration in the module header (`lib/auth/picker/clearIdentity.ts:39-66`) still holds: three exported endpoints, each gated by name.

### 3.2 Why the order is reversed on this path, and the fault table

Spec review round 1 (BLOCKING) probed the entry-first order this spec first proposed: `clearIdentityCoreImpl` calls `revalidatePath` before returning (`lib/auth/picker/clearIdentity.ts:231` and `lib/auth/picker/clearIdentity.ts:255`), so a sign-out fault after the core would re-render the route with the Google session still live and the entry gone, which is exactly the loopback (`lib/auth/picker/resolveShowPageAccess.ts:246-252`): bootstrap re-mints the identity, the page navigates, and the menu's failure copy is never seen. The reviewer's probe holds for every core-success shape (entry present, no envelope, envelope without this show).

Signing out first closes it. A sign-out fault returns before the core runs, so nothing is revalidated, nothing re-renders, the menu shows `PICKER_SWITCH_FAILED` (`components/auth/AvatarMenu.tsx:208`), and the person is still the identity they were: an honest "the switch did not happen". This is safe because on this path the entry's person is never a stranger to the session: a live Google session always wins resolve (`lib/auth/picker/resolveShowPageAccess.ts:237-252`), so a rendered menu belongs either to the session's own person (bootstrap minted the entry from it) or to a cookie-only viewer with no session at all. The Mode B ordering rationale (`lib/auth/picker/clearIdentity.ts:97-104`) is about a foreign session that does NOT match the entry, which cannot be the state a rendered avatar menu is in. Mode B keeps its order; this path gets its own, and the comment above each says why.

| Step fails | Returned | Cookie state | Session state | `revalidatePath` | Next render |
| --- | --- | --- | --- | --- | --- |
| Same-origin gate | `rejectCrossOriginPicker("clearIdentity")` (unchanged) | untouched | untouched | not called | unchanged |
| Parse / validate | `PICKER_INVALID_INPUT` | untouched | untouched, `signOut` never called | not called | unchanged |
| `client_construction` | `PICKER_RESOLVER_LOOKUP_FAILED` | untouched | live | not called | no re-render; menu shows the failure copy; retry re-runs the sign-out |
| `sign_out_threw` / `sign_out_returned_error` | `PICKER_RESOLVER_LOOKUP_FAILED` | untouched | live | not called | same as above |
| `residual_cookie_sweep` | `PICKER_RESOLVER_LOOKUP_FAILED` | untouched | revoked; a residual auth cookie may remain | not called | no re-render; menu shows the failure copy; retry: `signOut` is a no-op (§2.2), the sweep runs again |
| `clearIdentityCore` (thrown fault, `lib/auth/picker/clearIdentity.ts:216-217`) | `PICKER_RESOLVER_LOOKUP_FAILED` | whatever the core left (entry intact if it threw before the write) | revoked (or no-op for a cookie-only viewer) | called only if the throw came after it | menu shows the failure copy; if a re-render happens it resolves the still-valid entry via the cookie path, the same person; retry: `signOut` no-op, clear again |
| none | `{ ok: true }` | entry deleted | revoked (or no-op, §2.2) | called | Mode A gate (§3.3) |

The failure copy is the existing `PICKER_SWITCH_FAILED` row ("Couldn't switch. Please try again.", `lib/messages/catalog.ts:3806-3821`). `AvatarMenu` already maps every `ok: false` to it (`components/auth/AvatarMenu.tsx:180-208`), so no new catalog row and no §12.4 edit.

**Class sweep on the round-1 shape** ("a returned failure leaves the route re-rendered into a state that hides the failure"). The other exported endpoint, `clearIdentityAndSkip`, has the shape in form: on a sign-out fault its entry is already gone and `revalidatePath` has fired. It is not the same defect: the re-render there resolves to the Mode B mismatch state (the session matches no roster row, which is Mode B's premise) and re-renders the Mode B gate, which that arc ratified as the retry affordance (`lib/auth/picker/clearIdentity.ts:138-141`, `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §4.3). No bootstrap re-mint is possible from a mismatched session. Left as ratified (class-sweep exception (b)).

### 3.3 Where the Google viewer lands, and why there is no redirect

On success, the entry is deleted and the session revoked in one action, and `revalidatePath` (§2.4) re-renders the route: `validateGoogleSession` returns `{ kind: "continue" }` with no session (`lib/auth/validateGoogleSession.ts:121`, `lib/auth/validateGoogleSession.ts:146`, `lib/auth/validateGoogleSession.ts:151`), the cookie path finds no entry, and the result is `no_auth` / `first_contact`: the Mode A gate, the same screen a cookie-only viewer gets after the same tap. That is what "returns to the picker" means here: the person is out of the identity and one tap ("Continue as guest") from the picker, exactly like everyone else who switches.

A `redirect(... gate: "skip")` would land directly on the picker interstitial, but it would also change the cookie-only path and it is what Mode B needs for a different reason: for the Mode B mismatch reason the gate would re-render without `?gate=skip` (`app/show/[slug]/[shareToken]/page.tsx:318-323`). That reason does not apply after a sign-out. Adding it is a UX change to the cookie-only path outside the ratification, so it is not made; §7 records it as a limit with a re-file trigger.

All cookie mutations (the auth cookies in `signOut` and the sweep, then the picker entry in `clearIdentityCoreImpl`) are written through `cookies()` in one server action, so the same-request re-render sees them together, the mechanism the cookie-only path already depends on.

### 3.4 Invariant 10 — the exemption on `clearIdentity` is re-derived

`clearIdentity` carries `// no-telemetry: FormData-parse wrapper; PICKER_IDENTITY_CLEARED emit fires in clearIdentityCoreImpl` (`clearIdentity.ts:80`). It stops being only a parse wrapper. The replacement mirrors the skip action's line (`lib/auth/picker/clearIdentity.ts:106-108`): the `PICKER_IDENTITY_CLEARED` emit fires in `clearIdentityCoreImpl`, and the `AUTH_SIGNOUT_FAILED` emit in `signOutThisDevice` covers this function's own sign-out failure branch. Non-admin surface; a corrected per-function exemption satisfies `tests/log/_metaMutationSurfaceObservability.test.ts` (the exemption must carry reason text, `tests/log/_metaMutationSurfaceObservability.test.ts:296`).

### 3.5 Invariant 9

No new Supabase call site. `signOutThisDevice` is reused, and its contract (client construction inside `try`, `{ error }` destructured, returned and thrown faults reported under distinct stages) is already registered (`tests/auth/_metaInfraContract.test.ts:227` and `tests/auth/_metaInfraContract.test.ts:297-308`).

### 3.6 `AvatarMenu.tsx`

One comment changes (`components/auth/AvatarMenu.tsx:185-186`): the success branch note reads "a viewer unmounts this whole control via revalidatePath" for both identity sources, and the reason is stated (the clear now also signs the browser out). No markup, class, prop, or behavior change in the component. It is still a UI surface under invariant 8, so the impeccable critique + audit pair runs on the diff at close-out.

### 3.7 Guard conditions

Inputs are the three hidden fields plus optional `s` (`AvatarMenu.tsx:499-506`, `ClearIdentityInput` at `clearIdentity.ts:29-37`). Missing or non-string field: `PICKER_INVALID_INPUT` before any mutation (parse, `lib/auth/picker/clearIdentity.ts:68-76`). Present but invalid per `isValidClearIdentityInput`: `PICKER_INVALID_INPUT` before any mutation (§3.1, validated ahead of the core; the core validates again, `lib/auth/picker/clearIdentity.ts:222-224`). No picker cookie, or a cookie with no entry for this show: the core returns `{ ok: true }` without an emit (`lib/auth/picker/clearIdentity.ts:229-232` and `lib/auth/picker/clearIdentity.ts:257-262`), and the sign-out still runs, because a Google viewer whose entry was already re-minted elsewhere is exactly the loopback case. `s` is not consumed on the `clearIdentity` path (no redirect); it stays in the type for the skip path.

### 3.8 Dimensional Invariants

None. No markup, class, or layout changes in `components/auth/AvatarMenu.tsx`; the diff there is one comment. No fixed-dimension parent gains or loses a child.

### 3.9 Transition inventory

Unchanged BY THIS SPEC (`docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §4.6): this spec adds no state. **A LATER arc did** — `fix/avatar-menu-switch-pending-watchdog` (2026-08-27) added `timedout` and replaced §4.6's single-axis model with two independent axes and seven observable configurations, so read §4.6 rather than the three states this sentence used to enumerate.

## 4. `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE` — archived, no code

bl-orch's ruling (2026-08-25, to pane wY:p5), verified on PR #882 head `96824f6d3` (merged 2026-08-25 as `15e0b2d95`): `fix/admin-loader-ci-transient` wires `makeRetryingFetch` into `lib/supabase/server.ts` and its `RETRYABLE_RPCS` (lib/supabase/retryEligibility.ts on that branch, untracked on main, line 30 at that head) lists `get_admin_show_review_snapshot`. The fetch layer retries the transient 502 with a bounded attempt budget (three transport attempts, exclusive by construction on that branch), then surfaces the fault, which `readShowReviewSnapshot` maps to `infra_error` (`lib/admin/readShowReviewSnapshot.ts:67` and `lib/admin/readShowReviewSnapshot.ts:78`) and the modal throws to the boundary (`app/admin/_showReviewModal.tsx:281-283`). That is "bounded, then fail loud". A second, helper-level retry would compose loops on the same read, the exact finding #882's own round 3 raised. The fail-hard posture (`_showReviewModal.tsx:25-30`) is untouched.

Disposition for the archive entry: names #882 and its merge sha `15e0b2d95`, records that the ratified one-retry is met by the fetch-layer budget with no second layer, and cites that branch's lib/supabase/retryEligibility.ts membership. `readShowReviewSnapshot.ts`, its tests, and the modal are not edited. The IN PROGRESS marker on the row stays until the PR's last commit, when the entry moves to `BACKLOG-archive.md`.

## 5. Plan-wide invariants touched

- Invariant 1 (TDD): every behavior in §3.2 lands as a failing test first (§6).
- Invariant 5: the only user-visible failure copy is the existing `PICKER_SWITCH_FAILED` row via `messageFor` (`AvatarMenu.tsx:545-553`). No raw code reaches UI.
- Invariant 8: `AvatarMenu.tsx` is in the diff; critique + audit run at close-out; `impeccable-gate:` marker line in the closeout.
- Invariant 9: §3.5.
- Invariant 10: §3.4.
- Invariants 11, 12: worktree `../FX-worktrees/signout`; both rows marked and pushed at Stage 0; markers come off in the last commit.
- Invariant 2: not applicable, no show mutation, no advisory lock surface.
- Class sweep: both exported endpoints now sign out; `clearIdentityCore` is the core, not an endpoint the UI wires, and deliberately does not sign out (both callers wrap it). The round-1 shape is swept in §3.2.

## 6. Testing strategy

Each test names the failure it catches.

`tests/auth/picker/clearIdentity.test.ts` (mocks already in place: `supabaseMock.signOut`, the `calls` order log, `cookies`, `revalidatePath`, `redirect` digest):

1. `clearIdentity` signs out BEFORE clearing the entry (order: `signOutResolved` index < `cookieSet` index). Catches entry-first ordering, the round-1 loopback.
2. `clearIdentity` signs out with `{ scope: "local" }` exactly once. Catches the library default (`global`) sneaking in.
3. `clearIdentity` returns `{ ok: true }` and does NOT redirect (the mocked `redirect` throws a `NEXT_REDIRECT` digest, so a resolved promise is the proof). Catches accidentally sharing the redirect with the skip path.
4. Sign-out returned error, thrown error, client-construction throw, and sweep throw each return `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }`, emit `AUTH_SIGNOUT_FAILED` with `source: "auth.picker.clearIdentity"` and the matching `stage`, and leave `revalidatePath` uncalled and the picker cookie unwritten. Catches a hardcoded skip-path source, a collapsed stage, and the round-1 defect directly (a revalidate on a sign-out fault is the re-mint).
5. Invalid input: `signOut` and `createClient` never called. Catches sign-out-before-validate.
6. `clearIdentityCore` failure after a successful sign-out. Spec review round 3 showed the signing-key injector is dead: `pickerCookieSigningKey()` caches at module level (`lib/env/pickerCookieSigningKey.ts:3-6`), so removing the env var after any earlier test has populated the cache changes nothing. The injector is instead a two-step `cookies()` chain: `mockResolvedValueOnce(store)` feeds the sweep's single `cookies()` call (`lib/auth/picker/clearIdentity.ts:188`), `mockRejectedValueOnce(...)` faults the core's call (`lib/auth/picker/clearIdentity.ts:228`), and the test pins WHICH stage faulted by asserting a positive count of `sb-`-prefixed `set` writes (the sweep ran to completion) alongside the failure code, `signOutResolved` in the call log, zero picker-cookie writes, and no `revalidatePath`. A chain that faulted the sweep instead would show zero `sb-` writes and fail that assertion (round-2's concern, now discriminated rather than avoided). Catches an implementation that calls the core and ignores its `{ ok: false }`. Rule for every fault injection in this describe: the assertion set must identify the stage that faulted (`throwOnCreate` for construction; the `signOut` mock for the two sign-out stages; a `set` that throws only for `sb-` names for the sweep; the chain plus the `sb-` write count for the core), so no other stage can satisfy it.

**Probe (2026-08-25, tree `833d83654`, scratch implementation applied and reverted).** The §6 unit block was appended to `tests/auth/picker/clearIdentity.test.ts` and run against a scratch implementation of §3.1: 38 passed, the one failure was the case §6 item 8 deletes. Four mutants, each run against the same block: ignore the core's result (2 red, item 6 among them); entry-first order (7 red, item 1 and every item-4 stage); hardcoded `auth.picker.clearIdentityAndSkip` source (5 red, every item-4 stage); sign-out gated on an existing entry (3 red, item 7 among them). Every named failure mode is discriminated by the assertion the item claims.

7. No picker cookie: `signOut` still called once with `scope: "local"`, result `{ ok: true }`. Catches gating the sign-out on "entry existed", which would reopen the loopback for a re-minted viewer.
8. Existing test at `tests/auth/picker/clearIdentity.test.ts:480-487` ("clearIdentity (non-skip) never constructs a Supabase client") pins the reversed behavior and is replaced by tests 1-2; its comment rationale ("must not destroy a session") is superseded by the ratification in §1.1.
9. The same-origin describe's `clearIdentity` case (`tests/auth/picker/clearIdentity.test.ts:504-518`) additionally asserts `signOut` not called, matching the skip case at `tests/auth/picker/clearIdentity.test.ts:523`.
10. Skip-path tests (`tests/auth/picker/clearIdentity.test.ts:264-478`) stay green unmodified; if any needs an edit, the skip path changed behavior and the change is wrong.

`tests/auth/_metaInfraContract.test.ts`: the regex at `tests/auth/_metaInfraContract.test.ts:297-308` must still match, and a count assertion pins exactly one `supabase.auth.signOut(` site in the module.

`tests/log/_metaMutationSurfaceObservability.test.ts`: runs unchanged; the corrected exemption line on `clearIdentity` must pass it.

`tests/e2e/picker-flow.spec.ts`: one new test, on the fixture the bootstrap test already uses (`tests/e2e/picker-flow.spec.ts:130-178`, a test-auth session whose email matches a crew row): sign in as the matching identity, load the show, open the avatar menu, tap `avatar-menu-switch-person`, expect the Mode A gate (`sign-in-or-skip-gate`) and not the show body; reload and expect the gate again with no Supabase auth cookie left in the context (proves the session is gone, not just the entry). Catches the loopback itself, which no unit test can, because it lives in the resolve chain. `scripts/check-crew-e2e-executed.mjs:25-32` pins this spec's test count and is updated in the same commit. Sign-out faults are not injectable in e2e; unit test 4 covers them at the mechanism (no revalidate, no cookie write).

Not tested: `AvatarMenu.tsx` behavior (unchanged; `tests/components/auth/avatarMenu.test.tsx` runs as-is).

## 7. Documented limits

- **Landing screen is the Mode A gate, not the picker interstitial.** The person is one tap from the picker, matching the cookie-only path. Re-file trigger: a product call that switch person should land directly on the picker for everyone, at which point the redirect goes into `clearIdentity` and the cookie-only e2e expectations change with it.
- **After a `residual_cookie_sweep` fault the session is revoked server-side but an auth cookie may linger** until the SSR adapter's own deletion or token expiry lands; the menu shows the failure copy and a retry runs the sweep again. Same shape the skip path documents (`lib/auth/picker/clearIdentity.ts:191-197`).
- **Sign-out is device-local by design.** A Google viewer signed in on two devices stays signed in on the other one. This is the ratified `scope: "local"` (§1.1).
- **A cookie-only switch now constructs a Supabase server client.** One extra client construction and cookie read per tap, no network (§2.2). If `createSupabaseServerClient` throws in that case (misconfigured env), the tap reports `PICKER_SWITCH_FAILED` and nothing is cleared; the person stays in the picked identity and can retry. Accepted: an env that cannot build the server client fails the whole show page anyway.
- **Admin sessions.** The admin resolve branch (`resolveShowPageAccess.ts:224-226`) returns before the picker chain, and the admin case renders `identityChip={null}` (`app/show/[slug]/[shareToken]/page.tsx:258`), so an admin cannot reach this action from the show page. Not a behavior this spec changes.
- **#882 composition.** #882 merged as `15e0b2d95`; the snapshot read's retry lives entirely in the fetch layer. This arc adds nothing there (§4).

## 8. Files touched

| File | Change |
| --- | --- |
| `lib/auth/picker/clearIdentity.ts` | `clearIdentity` validates, signs out, then clears; `clearIdentityAndSkip` passes its action name; `signOutThisDevice(showId, action)`; exemption line on `clearIdentity` re-derived |
| `components/auth/AvatarMenu.tsx` | comment at the success branch |
| `tests/auth/picker/clearIdentity.test.ts` | §6 items 1-9 |
| `tests/auth/_metaInfraContract.test.ts` | single-site count assertion if absent |
| `tests/e2e/picker-flow.spec.ts` | §6 e2e |
| `scripts/check-crew-e2e-executed.mjs` | test-count pin |
| `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` | none; its §4.7 limit is superseded by this spec, noted in the archive entry rather than edited in place |
| `BACKLOG.md` / `BACKLOG-archive.md` | archive both rows in the PR's last commit, markers removed in that commit |
