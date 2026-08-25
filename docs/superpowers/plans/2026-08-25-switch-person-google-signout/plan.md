# Switch person signs a Google viewer out — implementation plan

**Spec:** `docs/superpowers/specs/2026-08-25-switch-person-google-signout-design.md` · **Branch:** `feat/switch-person-google-signout` · **Worktree:** `../FX-worktrees/signout` · **Implementer:** Claude Code (UI surface touched, so Opus-class per ROUTING).

Two ledger rows close. `BL-SWITCH-PERSON-GOOGLE-LOOPBACK` is Tasks 1 and 2. `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE` is archive-only (spec §4, bl-orch ruling 2026-08-25) and lands in close-out step C3 with no code.

## Pre-draft code verification (run 2026-08-25, tree at `eee889fef`)

Every name a task uses, checked against the live tree:

| Claim | Where | Verified |
| --- | --- | --- |
| `clearIdentity` gates, parses, then `return clearIdentityCore(input)` with no sign-out | `lib/auth/picker/clearIdentity.ts:79-87` | yes; line 86 is the return |
| `clearIdentityAndSkip` validates, cores, `signOutThisDevice(input.showId)`, redirects | `lib/auth/picker/clearIdentity.ts:105-123` | yes |
| `signOutThisDevice(showId: string)` is module-private, emits `source: "auth.picker.clearIdentityAndSkip"` | `lib/auth/picker/clearIdentity.ts:133` and `lib/auth/picker/clearIdentity.ts:147` | yes |
| The single `const { error } = await supabase.auth.signOut({ scope: "local" })` site | `lib/auth/picker/clearIdentity.ts:175`; regex pin `tests/auth/_metaInfraContract.test.ts:297-308` | yes |
| `clearIdentityCore` catches a throw as `PICKER_RESOLVER_LOOKUP_FAILED` | `lib/auth/picker/clearIdentity.ts:216-217` | yes |
| `isValidClearIdentityInput` import | `lib/auth/picker/clearIdentity.ts:12` | yes |
| Test file mocks: `supabaseMock.signOut`/`createClient`/`throwOnCreate`, `calls` order log, `cookieSet`, `existingCookie`, `fd()`, `logMock` | `tests/auth/picker/clearIdentity.test.ts:42-127` | yes |
| The test pinning the old behavior, "clearIdentity (non-skip) never constructs a Supabase client" | `tests/auth/picker/clearIdentity.test.ts:480-487` | yes |
| The skip-path describe with `seedEntry`, `fdFull`, `runExpectingRedirect` | `tests/auth/picker/clearIdentity.test.ts:264-282` | yes |
| `redirect` mock throws a `NEXT_REDIRECT` digest | `tests/auth/picker/clearIdentity.test.ts:16-26` | yes |
| `AvatarMenu` success-branch comment | `components/auth/AvatarMenu.tsx:120-124` | yes |
| e2e fixture: `signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl })`, `seedShowWithCrew`, `track`, `AFTER_SERVER_ACTION`, `expectResolvedIdentity`, `isSupabaseAuthCookieName` | `tests/e2e/picker-flow.spec.ts:37-45`, `tests/e2e/picker-flow.spec.ts:109-117`, `tests/e2e/picker-flow.spec.ts:130-178` | yes |
| Menu open idiom (`toPass` retry until `getByRole("menu")` visible) | `tests/e2e/theme-toggle.spec.ts:526-531` | yes |
| Test ids `avatar-menu-trigger`, `avatar-menu-switch-person`, `sign-in-or-skip-gate`, `crew-shell` | `components/auth/AvatarMenu.tsx:263`, `components/auth/AvatarMenu.tsx:423`; `tests/e2e/picker-flow.spec.ts:151`, `tests/e2e/picker-flow.spec.ts:171` | yes |
| picker-flow executed-count pin `"picker-flow.spec.ts": 6` | `scripts/check-crew-e2e-executed.mjs:32` | yes |
| picker-flow runs on `desktop-chromium` in `crew-e2e.yml` | `.github/workflows/crew-e2e.yml:188` | yes |
| Invariant-10 walker accepts a per-function `// no-telemetry: <reason>` with reason text | `tests/log/_metaMutationSurfaceObservability.test.ts:180` and `tests/log/_metaMutationSurfaceObservability.test.ts:296` | yes |
| `signOut` with no session is a local no-op returning `{ error: null }` | auth-js 2.105.1 `GoTrueClient._signOut` (built file under `node_modules`) | yes, read at spec time (spec §2.2) |

## Meta-test inventory

- **Extends** `tests/auth/_metaInfraContract.test.ts`: the existing regex test at `tests/auth/_metaInfraContract.test.ts:297-308` gains a single-site count assertion (`source.match(/supabase\.auth\.signOut\(/g)` has length 1). No new registry row: no new Supabase call site (spec §3.5).
- **Runs unchanged** `tests/log/_metaMutationSurfaceObservability.test.ts` (invariant 10): the corrected exemption on `clearIdentity` must pass it; the walker is filesystem-derived so nothing is registered.
- **Runs unchanged** `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (picker-flow CI wiring) and `scripts/check-crew-e2e-executed.mjs` (count pin, edited in Task 2).
- Advisory locks: none touched. Mutation registry (`tests/mutation/source/registry.ts`): `clearIdentity.ts` is not a guard or detector surface and is not enrolled; none applies.

## e2e harness readiness (Task 2)

- Server boot: the `webServer` in `playwright.config.ts`, project `desktop-chromium`, base URL `http://127.0.0.1:3000` (`tests/e2e/picker-flow.spec.ts:49`); CI runs it from `.github/workflows/crew-e2e.yml:188`. Locally: `pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/picker-flow.spec.ts`.
- Readiness gate before the first assertion: `expect(page.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION)` after `signInAs` + `goto`, then the bounded menu-open retry (`toPass`) copied from `tests/e2e/theme-toggle.spec.ts:526-531`; never `networkidle` alone.
- Detach safety: no `locator.evaluate` on the menu after the tap; the post-tap assertions target the gate test id, which mounts on the re-render, and `ctx.cookies()` reads the context, not a node.

<!-- tasks: depth=2 red-contract -->

## Task 1 — `clearIdentity` signs the device out, then clears the entry

<!-- task: red=`pnpm vitest run tests/auth/picker/clearIdentity.test.ts` red-state=authored red-target=`lib/auth/picker/clearIdentity.ts:86` why=`clearIdentity returns clearIdentityCore(input) and never calls signOutThisDevice, so every new case asserting a signOut call before cookieSet, an AUTH_SIGNOUT_FAILED emit with source auth.picker.clearIdentity, or no revalidatePath on a sign-out fault fails until the sign-out-then-clear body lands` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7 -->

**What is red and why.** New cases in `tests/auth/picker/clearIdentity.test.ts` assert that `clearIdentity` calls `supabase.auth.signOut({ scope: "local" })` BEFORE the cookie write, reports sign-out faults under `source: "auth.picker.clearIdentity"`, and leaves `revalidatePath` uncalled on such a fault. On the live tree `clearIdentity` returns `clearIdentityCore(input)` (`lib/auth/picker/clearIdentity.ts:86`); `signOut` is never called, so those cases fail. The pre-existing case at `tests/auth/picker/clearIdentity.test.ts:480-487` asserts the opposite and is replaced in the same RED step (it cannot coexist with the ratified behavior).

**Acceptance criteria.**

- AC-1: on a valid submission with a seeded entry, `calls.indexOf("signOutResolved") < calls.indexOf("cookieSet")`, and the result is `{ ok: true }` with no `NEXT_REDIRECT` thrown (the mocked `redirect` throws, so a resolved promise is the proof).
- AC-2: `signOut` is called with `{ scope: "local" }` exactly once.
- AC-3: `signOut` returning `{ error }` yields `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }` and `log.error` with `{ code: "AUTH_SIGNOUT_FAILED", source: "auth.picker.clearIdentity", stage: "sign_out_returned_error" }`; a `signOut` throw yields `stage: "sign_out_threw"`; `throwOnCreate` yields `stage: "client_construction"`; a sweep throw yields `stage: "residual_cookie_sweep"`. In all four, `revalidatePath` is not called and the picker cookie (`COOKIE_NAME`) is never written.
- AC-4: invalid input (`isValidClearIdentityInput` false: a non-uuid `showId` on an otherwise complete form) returns `PICKER_INVALID_INPUT` with `createClient`, `signOut`, and `cookieSet` never called.
- AC-5: a `clearIdentityCore` failure after a successful sign-out (signing key removed, so the core throws at its first read) returns `PICKER_RESOLVER_LOOKUP_FAILED`; `signOutResolved` is in the call log and no picker cookie was written.
- AC-6: no picker cookie at all: `{ ok: true }` and `signOut` still called once with `{ scope: "local" }`.
- AC-7: `clearIdentityAndSkip` cases at `tests/auth/picker/clearIdentity.test.ts:264-478` pass unmodified; the cross-site case for `clearIdentity` (`tests/auth/picker/clearIdentity.test.ts:504-518`) additionally asserts `signOut` not called.

**RED — write the tests.** Add a describe after the existing `clearIdentity telemetry` block (`tests/auth/picker/clearIdentity.test.ts:200-262`):

```ts
describe("clearIdentity signs the device out, then clears the entry (spec §3)", () => {
  const seedEntry = () => {
    existingCookie = encodePickerCookie(
      { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } },
      KEY,
    );
  };
  const submit = () => clearIdentity(fd({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID }));
  const pickerCookieWrites = () =>
    cookieSet.mock.calls.filter(([name]) => name === COOKIE_NAME).length;

  test("signs out BEFORE clearing the picker entry, returns ok, and does not redirect", async () => {
    seedEntry();
    await expect(submit()).resolves.toEqual({ ok: true });
    // Order is the contract (spec §3.2): a sign-out fault must never follow a
    // revalidate, or the re-render bootstraps the same identity back.
    expect(calls.indexOf("signOutResolved")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("cookieSet")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("signOutResolved")).toBeLessThan(calls.indexOf("cookieSet"));
    expect(pickerCookieWrites()).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith(`/show/${SLUG}/${TOKEN}`);
  });

  test("signs out device-locally, exactly once", async () => {
    seedEntry();
    await submit();
    expect(supabaseMock.signOut).toHaveBeenCalledTimes(1);
    expect(supabaseMock.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("with no picker cookie the clear is a no-op and the sign-out still runs", async () => {
    // A Google viewer whose entry was already re-minted elsewhere is exactly the loopback case.
    await expect(submit()).resolves.toEqual({ ok: true });
    expect(supabaseMock.signOut).toHaveBeenCalledTimes(1);
    expect(supabaseMock.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test.each([
    [
      "signOut returns an error",
      () => supabaseMock.signOut.mockResolvedValueOnce({ error: { message: "gateway" } }),
      "sign_out_returned_error",
    ],
    [
      "signOut throws",
      () =>
        supabaseMock.signOut.mockImplementationOnce(async () => {
          calls.push("signOut");
          throw new Error("network");
        }),
      "sign_out_threw",
    ],
    [
      "the client cannot be constructed",
      () => {
        supabaseMock.throwOnCreate = true;
      },
      "client_construction",
    ],
    [
      "the residual-cookie sweep throws after revocation",
      () =>
        cookieSet.mockImplementation((name: string) => {
          calls.push("cookieSet");
          if (name.startsWith("sb-")) throw new Error("sweep");
        }),
      "residual_cookie_sweep",
    ],
  ])(
    "%s: PICKER_RESOLVER_LOOKUP_FAILED, forensic emit names THIS action and the stage, nothing revalidated",
    async (_label, arrange, stage) => {
      seedEntry();
      arrange();
      await expect(submit()).resolves.toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      expect(logMock.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          code: "AUTH_SIGNOUT_FAILED",
          source: "auth.picker.clearIdentity",
          stage,
          showId: SHOW_ID,
        }),
      );
      // The round-1 defect: a revalidate here re-renders with the session live
      // and bootstrap re-mints the identity, hiding the failure.
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(pickerCookieWrites()).toBe(0);
    },
  );

  test("invalid input is refused before any client is built", async () => {
    seedEntry();
    const r = await clearIdentity(fd({ slug: SLUG, shareToken: TOKEN, showId: "not-a-uuid" }));
    expect(r).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
    expect(supabaseMock.createClient).not.toHaveBeenCalled();
    expect(supabaseMock.signOut).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  test("a clearIdentityCore failure after a successful sign-out is reported, not swallowed", async () => {
    seedEntry();
    // The sign-out needs no signing key; the core does (clearIdentity.ts:227), so
    // removing it fails the core AFTER revocation completed.
    delete process.env.PICKER_COOKIE_SIGNING_KEY;
    await expect(submit()).resolves.toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    expect(calls).toContain("signOutResolved");
    expect(pickerCookieWrites()).toBe(0);
  });
});
```

Notes on the block: the mocked `redirect` (`tests/auth/picker/clearIdentity.test.ts:16-26`) throws a `NEXT_REDIRECT` digest, so `resolves.toEqual({ ok: true })` is the no-redirect proof. The sweep case relies on `cookieSet` being the shared `set` mock (`tests/auth/picker/clearIdentity.test.ts:104-125`); the `sb-` prefix matches the `getAll` fixture at `tests/auth/picker/clearIdentity.test.ts:114-118`, and with sign-out first the sweep's writes are the first `set` calls, so no ordering guard is needed. `COOKIE_NAME` is already imported by the test file (used in the `cookies` mock). The `"not-a-uuid"` value fails `UUID_RE` in `lib/auth/picker/validateClearIdentityInput.ts:19`. The core-failure case removes `PICKER_COOKIE_SIGNING_KEY`: `signOutThisDevice` never reads it, `clearIdentityCoreImpl` does (`lib/auth/picker/clearIdentity.ts:227`, throwing per `lib/env/pickerCookieSigningKey.ts:9`), and `clearIdentityCore` maps the throw to `PICKER_RESOLVER_LOOKUP_FAILED` (`lib/auth/picker/clearIdentity.ts:216-217`). The suite's `beforeEach` restores the key (`tests/auth/picker/clearIdentity.test.ts:82`).

Delete the case at `tests/auth/picker/clearIdentity.test.ts:480-487` ("clearIdentity (non-skip) never constructs a Supabase client"). In the same-origin describe, the `clearIdentity` case (`tests/auth/picker/clearIdentity.test.ts:504-518`) gains `expect(supabaseMock.signOut).not.toHaveBeenCalled();` after the `cookieSet` assertion.

Run `pnpm vitest run tests/auth/picker/clearIdentity.test.ts`; observe the new cases red (AC-1 through AC-6) and the rest green.

**GREEN — implementation.** In `lib/auth/picker/clearIdentity.ts`:

```ts
type ClearAction = "clearIdentity" | "clearIdentityAndSkip";

export async function clearIdentity(formData: FormData): Promise<ClearIdentityResult> {
  // no-telemetry: FormData-parse wrapper; PICKER_IDENTITY_CLEARED emit fires in
  // clearIdentityCoreImpl, and the AUTH_SIGNOUT_FAILED emit in signOutThisDevice covers
  // this function's own sign-out failure branch.
  if (!(await isSameOriginServerAction())) return rejectCrossOriginPicker("clearIdentity");
  const input = parseFormData(formData);
  if (!input) return { ok: false, code: "PICKER_INVALID_INPUT" };
  // Validate before anything destructive, as the guest action does.
  if (!isValidClearIdentityInput(input)) return { ok: false, code: "PICKER_INVALID_INPUT" };
  // Sign out FIRST on this path, the reverse of clearIdentityAndSkip. The core
  // schedules revalidatePath; a re-render with the session still live and the
  // entry gone is needs_picker_bootstrap, which re-mints the same identity and
  // hides the failure. Failing here re-renders nothing: the menu shows the
  // failure copy and the person is still who they were. Safe because a
  // rendered avatar menu belongs to the session's own person or to a
  // cookie-only viewer with no session; the foreign-session case Mode B orders
  // around cannot reach this menu.
  const signedOut = await signOutThisDevice(input.showId, "clearIdentity");
  if (!signedOut.ok) return signedOut;
  return clearIdentityCore(input);
}

export async function clearIdentityAndSkip(formData: FormData): Promise<ClearIdentityResult> {
  // ...unchanged, except:
  const signedOut = await signOutThisDevice(input.showId, "clearIdentityAndSkip");
  // ...
}

async function signOutThisDevice(showId: string, action: ClearAction): Promise<ClearIdentityResult> {
  // ...unchanged body; the emit's source becomes:
  //   source: `auth.picker.${action}`,
}
```

Update the `signOutThisDevice` docblock (`lib/auth/picker/clearIdentity.ts:125-132`) to say both clear actions call it and that each orders it differently for a stated reason. The `clearIdentityAndSkip` docblock (`lib/auth/picker/clearIdentity.ts:89-104`) is unchanged.

`components/auth/AvatarMenu.tsx:120-124`: reword the success-branch comment to "Success needs no branch: the clear also signs this device out, so a cookie-only and a Google-resolved viewer both unmount this whole control via revalidatePath."

`tests/auth/_metaInfraContract.test.ts:297-308`: add, after the existing `toMatch`, `expect(source.match(/supabase\.auth\.signOut\(/g)).toHaveLength(1);` with a one-line comment: both clear actions route through one site; a second site would need its own registry row.

Run `pnpm vitest run tests/auth/picker/clearIdentity.test.ts tests/auth/_metaInfraContract.test.ts tests/log/_metaMutationSurfaceObservability.test.ts tests/components/auth/avatarMenu.test.tsx`; all green. Then `pnpm typecheck && pnpm exec eslint lib/auth/picker/clearIdentity.ts tests/auth/picker/clearIdentity.test.ts components/auth/AvatarMenu.tsx tests/auth/_metaInfraContract.test.ts`.

**Anti-tautology check.** AC-1's order assertion reads the shared `calls` log, not the mocks' call counts, so a "both called, wrong order" implementation fails. AC-3's `revalidatePath` assertion is the direct guard on the round-1 defect; it fails on the entry-first body because the core's revalidate fires before the sign-out is attempted. AC-3's `source` assertion is the discriminator against a hardcoded `auth.picker.clearIdentityAndSkip`. AC-6 fails if the sign-out is gated on `existed`. AC-4 fails if the sign-out runs before validation. The deleted case at `tests/auth/picker/clearIdentity.test.ts:480-487` is the only pre-existing assertion of the reversed behavior (grep `never constructs a Supabase client` in `tests/`).

**Commit.** `feat(auth): switch person signs the device out before clearing the picker entry`

## Task 2 — e2e: a Google-resolved viewer taps Switch person and lands on the first-contact gate

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/picker-flow.spec.ts` red-state=authored red-target=`lib/auth/picker/clearIdentity.ts:86` why=`on the live tree the tap clears the entry but the session survives, the re-render returns needs_picker_bootstrap and re-mints the same identity, so the gate never mounts and the new case times out on sign-in-or-skip-gate; Task 1 landing makes it pass, which is why this task is sequenced after Task 1 and its RED is observed on a checkout of the pre-Task-1 tree` ac=AC-8,AC-9 -->

**What is red and why.** The new case asserts the first-contact gate after the tap. Before Task 1 the resolve chain re-mints the identity (`lib/auth/picker/resolveShowPageAccess.ts:246-252`), so `crew-shell` renders again and `sign-in-or-skip-gate` never appears. Observe RED by running the case with Task 1's `lib/auth/picker/clearIdentity.ts` temporarily restored from `origin/main` (`git stash push lib/auth/picker/clearIdentity.ts`, run, `git stash pop`), then GREEN on the branch tree. Record both runs' summary lines in the commit body.

**Acceptance criteria.**

- AC-8: after sign-in as `NON_ADMIN_CREW_FIXTURE` on a show whose roster contains that email, the resolved shell renders, the menu opens, the tap on `avatar-menu-switch-person` lands on `sign-in-or-skip-gate`, and `crew-shell` is gone.
- AC-9: a reload still shows the gate and `crew-shell` has count 0 (proves the session ended, not merely the entry: a live session would bootstrap the identity back). The browser jar is not used as the oracle for cleared cookies, per the Mode B case's note at `tests/e2e/picker-flow.spec.ts:279-291`.

**RED — the test.** Append to `tests/e2e/picker-flow.spec.ts` after the bootstrap case (`tests/e2e/picker-flow.spec.ts:178`):

```ts
// BL-SWITCH-PERSON-GOOGLE-LOOPBACK: for a viewer resolved via a live Google
// session, "Not you? Switch person" used to clear the picker entry only; the
// next resolve re-minted the same identity through picker-bootstrap. The clear
// now also signs THIS device out, so the tap lands on the first-contact gate.
test("Switch person signs a Google-resolved viewer out and lands on the first-contact gate", async ({
  browser,
}) => {
  const show = track(
    await seedShowWithCrew({
      crew: [{ name: "Alice Cooper", role: "A1", email: NON_ADMIN_CREW_FIXTURE.email }],
    }),
  );
  const url = `/show/${show.slug}/${show.shareToken}`;
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  try {
    const page = await ctx.newPage();
    await signInAs(page, NON_ADMIN_CREW_FIXTURE, { baseUrl: BASE_URL });
    await page.goto(url, { waitUntil: "networkidle" });
    await expect(page.getByTestId("crew-shell")).toBeVisible(AFTER_SERVER_ACTION);
    await expectResolvedIdentity(page, "Alice Cooper");
    // Premise: this identity was minted by the bootstrap leg (Google session +
    // no prior entry), so a switch that only cleared the entry would re-mint it.
    expect((await ctx.cookies()).some((c) => isSupabaseAuthCookieName(c.name))).toBe(true);

    const trigger = page.getByTestId("avatar-menu-trigger");
    await expect(async () => {
      await trigger.click();
      await expect(page.getByRole("menu")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByTestId("avatar-menu-switch-person").click();

    await expect(page.getByTestId("sign-in-or-skip-gate")).toBeVisible(AFTER_SERVER_ACTION);
    await expect(page.getByTestId("crew-shell")).toHaveCount(0);

    // The reload is the proof that the SESSION ended: with a live session the
    // resolve would bootstrap Alice again and the shell would be back.
    // The jar is deliberately NOT the oracle for what was cleared (see the Mode B
    // case's note above): the reload landing on the gate is the durable proof.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("sign-in-or-skip-gate")).toBeVisible(AFTER_SERVER_ACTION);
    await expect(page.getByTestId("crew-shell")).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
```

`scripts/check-crew-e2e-executed.mjs:32`: `"picker-flow.spec.ts": 6` becomes `7`, and the comment above it (`scripts/check-crew-e2e-executed.mjs:28-29`) changes "one of its 7 collected cases" to "one of its 8 collected cases". Run `pnpm vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` to confirm the wiring pin still holds.

**GREEN.** Task 1 is the implementation. Run the spec on the branch tree: `pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/picker-flow.spec.ts`; the new case passes and the existing six still pass.

**Anti-tautology check.** The premise assertion (an auth cookie exists before the tap) is on this case's own inputs. AC-9's reload check fails against a Task-1 mutant that clears the entry and skips the sign-out (the shell returns via bootstrap) and against one that signs out but skips the clear (the cookie path then resolves the still-valid entry and renders the shell, so the `crew-shell` count-0 assertion fails).

**Commit.** `test(e2e): switch person signs a Google-resolved viewer out`

<!-- tasks: end -->

## Close-out (after Task 2, in this order)

- C1. `pnpm typecheck && pnpm exec eslint . && pnpm format:check`; `pnpm heavy pnpm test:fast`; the scoped list from the dispatch brief: `pnpm vitest run tests/auth/picker/clearIdentity.test.ts tests/admin/readShowReviewSnapshot.test.ts tests/auth/_metaInfraContract.test.ts tests/log/_metaMutationSurfaceObservability.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`.
- C2. Invariant 8: `/impeccable critique` and `/impeccable audit` on the diff touching `components/auth/AvatarMenu.tsx` (both with the canonical setup gates). Findings and dispositions go in `closeout.md` beside this plan with the marker line `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>`.
- C3. Whole-diff Codex review to APPROVE (brief carries REVIEWER ONLY, the spec's §1.1 list, consequence bound, threat fence).
- C4. Merge `origin/main`; verify BACKLOG set arithmetic across the merge; move both rows to `BACKLOG-archive.md` with SHIPPED entries. The `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE` entry carries the spec §4 disposition: names PR #882 (merge sha if merged by then, else the PR), records that the ratified single bounded retry is met by that PR's fetch-layer budget with no second layer, and cites that branch's lib/supabase/retryEligibility.ts membership. Remove both IN PROGRESS markers in that same last commit. `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`.
- C5. Push; twelve required contexts green by GraphQL `statusCheckRollup` on the head sha; `git merge-base origin/main HEAD == git rev-parse origin/main`; READINESS report to bl-orch (wY:p8). No merge from this arc.

## Files touched

`lib/auth/picker/clearIdentity.ts`, `components/auth/AvatarMenu.tsx`, `tests/auth/picker/clearIdentity.test.ts`, `tests/auth/_metaInfraContract.test.ts`, `tests/e2e/picker-flow.spec.ts`, `scripts/check-crew-e2e-executed.mjs`, `BACKLOG.md`, `BACKLOG-archive.md`, this plan and its `closeout.md`.
