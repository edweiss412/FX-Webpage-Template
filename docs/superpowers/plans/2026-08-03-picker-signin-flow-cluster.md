# Plan — picker sign-in flow cluster

**Spec:** `docs/superpowers/specs/2026-08-03-picker-signin-flow-cluster-design.md` (canonical; its
§1.1 table is the do-not-relitigate set)
**Branch:** `fix/picker-signin-flow-cluster`
**Backlog:** `BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED`,
`BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT`, `BL-PICKER-CLAIMED-ROW-PENDING-STATE`

TDD per task: failing test → minimal implementation → passing test → commit. One commit per task,
conventional-commits style.

---

## 0. Pre-draft verification (RUN, not described)

Every fact below was verified against this worktree at `03f769c01` before the task bodies were
written.

| Claim | Verified |
|---|---|
| `SHOW_NEXT_RE` is `$`-anchored, no query | `app/api/auth/picker-bootstrap/route.ts:21` |
| the handler already redirects to the query-carrying string | `route.ts:189`, `route.ts:211` |
| `hostRelativeRedirect` imposes no query restriction, and blocks `//`, `\`, control chars | `lib/http/hostRelativeRedirect.ts:28-46` |
| `revalidatePath` call with no redirect in the file | `lib/auth/picker/cleanupStaleEntry.ts:107` |
| the sibling's ratified redirect pattern | `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:113-114` |
| claimed row is a native GET form with a hidden `next` | `_PickerInterstitial.tsx:197-202` |
| `--spacing-tap-min: 44px` | `app/globals.css:162` |
| `--duration-fast: 120ms` | `app/globals.css:223` |
| 3 `TWO-STEP navigation` workaround sites | `tests/e2e/stage-restricted-crew-schedule.spec.ts:162`, `stage-restricted-crew-schedule.spec.ts:251`, `stage-restricted-crew-schedule.spec.ts:461` |
| component-test harness for the picker | `tests/show/pickerAffordance.test.tsx:1-26` (jsdom + testing-library, renders `PickerInterstitial` with a roster fixture) |
| stale-entry seeding for e2e | `tests/e2e/helpers/seedPickerCookie.ts:66` — `seedPickerCookie(context, [{ showId, crewMemberId, epoch }])`; an `epoch` mismatching `shows.picker_epoch` yields `epoch_stale` |
| e2e seed helper returns `pickerEpoch` | `tests/e2e/helpers/seedShowWithCrew.ts:85-92` |
| layout-measurement home + pattern | `tests/e2e/crew-layout-dimensions.spec.ts`; `locator.evaluate((el) => el.getBoundingClientRect().height)` per `tests/e2e/collapse-panel-morph.spec.ts:99-101` |
| e2e workflow already runs picker-flow on desktop-chromium | `.github/workflows/crew-e2e.yml:151` |

**`useFormStatus` probe (spec §3.4).** Run before drafting; result `NATIVE_GET=false`,
`FUNCTION_ACTION=true`. The probe was scratch and is not committed — Task 6 lands the permanent
regression test that encodes the same fact against our own component.

## 0.1 Meta-test inventory

**CREATES:** none.
**EXTENDS:** none.

Checked and ruled out, explicitly:

- `tests/components/_metaPickerRoleChipContract.test.ts` — despite the name, it pins
  `components/auth/IdentityChip.tsx` props and the `Header` right-slot wiring, **not** the picker
  roster row's `data-testid="picker-role-chip"`. Read it before assuming otherwise; this diff does
  not touch anything it asserts.
- `tests/auth/_metaInfraContract.test.ts` (invariant 9) — no new Supabase client call site.
- `tests/auth/advisoryLockRpcDeadlock.test.ts` (invariant 2) — no `pg_advisory*` surface.
- `tests/log/_metaMutationSurfaceObservability.test.ts` (invariant 10) — `cleanupStaleEntry` is an
  existing registered surface; no new mutation surface is added. Tasks 4 and 5 must keep its
  `PICKER_STALE_ENTRY_CLEANED` emit reachable above the redirect throw, which is what that
  meta-test protects.

## 0.2 e2e harness readiness

- **Boot:** prod build. `BASE_URL = process.env.PICKER_E2E_BASE_URL ?? "http://127.0.0.1:3000"`
  (`tests/e2e/picker-flow.spec.ts:48`).
- **Readiness gate:** an explicit locator assertion (`expect(page.getByTestId(...)).toBeVisible()`)
  after every `goto`. `networkidle` alone is not a gate — the existing spec pairs `waitUntil:
  "networkidle"` with a visibility assertion, and new tests must do the same.
- **Detach safety:** the layout probe in Task 7 reads `getBoundingClientRect` on a row that a
  navigation can unmount. It runs against a click that is `preventDefault`-ed in the harness (or on
  a page where navigation is blocked by route interception), so the element cannot detach
  mid-measure.

## 0.3 Closeout marker

impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>

UI surface is touched (`_PickerInterstitial.tsx`, new `_ClaimedRowButton`), so the invariant-8 dual
gate runs at close-out and this line is filled in then.

---

## Tasks

### Task 1 — bootstrap accepts a query-bearing `next` (RED)

**Failing test first.** Extend `tests/auth/picker-bootstrap.test.ts` with the four-shape matrix from
spec §2.1. Each case asserts the **exact** `Location` header, not merely a non-403 status.

Failure mode caught: a handler that strips the query would return 302 and pass a status-only
assertion while silently reintroducing the deep-link loss R1 rejects.

Cases:

1. `next=/show/<slug>/<64hex>` → `Location` identical (regression guard on today's behavior).
2. `next=/show/<slug>/<64hex>?s=schedule` → `Location` carries `?s=schedule`.
3. `next=/show/<slug>/<64hex>?gate=skip` → `Location` carries `?gate=skip`.
4. `next=/show/<slug>/<64hex>?s=schedule&gate=skip` → `Location` carries both, in that order
   (`buildShowReturnUrl` emits a stable order — `lib/crew/buildShowReturnUrl.ts:46`).

Cases 2–4 fail before Task 2.

### Task 2 — bootstrap: split the query before matching (GREEN)

`app/api/auth/picker-bootstrap/route.ts`, `parseNextPath` only:

```ts
function parseNextPath(path: string): { slug: string; shareToken: string } | null {
  const match = SHOW_NEXT_RE.exec(path.split("?")[0]!);
  if (!match) return null;
  return { slug: match[1]!, shareToken: match[2]! };
}
```

`SHOW_NEXT_RE` is NOT edited (spec R6). Nothing else in the file changes.

Typecheck note: `path.split("?")[0]` is `string | undefined` under
`noUncheckedIndexedAccess`; the `!` is required and is safe (`split` always yields ≥1 element).

### Task 3 — bootstrap negative cases (RED→GREEN, same surface)

Three guards that pin what Task 2 must NOT have loosened. Each is a distinct failure mode:

1. **Path grammar.** `next=/show/<slug>/<64hex>/extra` still 403s. Catches a future "fix" that
   loosens the `$` anchor instead of splitting — the two are indistinguishable without this test.
2. **Intent binding.** A `t` token signed for a different slug still 403s at `route.ts:161` when
   `next` carries a query. Catches the query leaking into the signed comparison.
3. **Allow-list pass-through.** `next=/show/<slug>/<64hex>?s=schedule&evil=1` → emitted `Location`
   contains `s=schedule` and does **not** contain `evil`. Catches a regression where the handler
   starts trusting the raw query instead of `validateNextParamDetailed` output.

All three should pass immediately after Task 2 — they are the anti-tautology frame around it. If
any fails, Task 2 is wrong.

### Task 4 — stale cleanup redirects (RED)

Three unit assertions, all written against the **public** `cleanupStaleEntry` action, never against
`cleanupStaleEntryCoreImpl`. Spec §3.3 and §8.2 are the contract.

1. **Sentinel escape.** Calling `cleanupStaleEntry(formData)` THROWS a `NEXT_REDIRECT` sentinel
   whose digest carries the expected destination. Failure mode caught: a redirect placed inside
   `cleanupStaleEntryCoreImpl`, which `cleanupStaleEntryCore:56-61`'s bare `catch` converts into
   `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }` — no navigation, and the action reports
   an infra fault. **An assertion scoped to the impl passes in exactly that broken world**, which
   is precisely why this one is at the public boundary. This was the R1 BLOCKING finding.
2. **Emit survival.** `PICKER_STALE_ENTRY_CLEANED` is recorded even though the action throws —
   catch the sentinel, then assert the sink spy. Failure mode: reordering that puts the throw above
   the emit, silently dropping invariant-10 telemetry.
3. **Destination carries `gate`.** The thrown sentinel's path includes `gate=skip` when the form
   supplied it. Failure mode caught: the bare-canonical redirect, which re-resolves as
   `no_auth: first_contact`, fails `allowGateSkip` (`app/show/[slug]/[shareToken]/page.tsx:324`),
   and renders `<SignInOrSkipGate>` instead of the picker.

### Task 5 — stale cleanup: redirect from the public action (GREEN)

The redirect goes in `cleanupStaleEntry` (`lib/auth/picker/cleanupStaleEntry.ts:30-51`), AFTER
`cleanupStaleEntryCore` returns and OUTSIDE its swallowing try/catch:

```ts
const result = await cleanupStaleEntryCore({
  slug,
  shareToken,
  showId,
  expectedEpoch,
  expectedCrewMemberId,
});
if (!result.ok) return result;
if (!isValidShowPathPair({ slug, shareToken })) return result;
redirect(buildShowReturnUrl(slug, shareToken, { s, gate }));
```

`revalidatePath` at `cleanupStaleEntry.ts:107` is KEPT — it invalidates the cache entry; the
redirect moves the browser. Different jobs.

**The destination must carry `gate`.** Verified, not assumed: `page.tsx:190` sets
`gateSkip = gate === "skip"`, `page.tsx:324` computes
`allowGateSkip = gateSkip && result.reason === "first_contact"`, and `page.tsx:325` falls through to
`<SignInOrSkipGate>` when that is false. A bare-canonical redirect therefore lands the user on the
Welcome gate rather than the picker — the opposite of the intended outcome.

Companion edits this requires:

- `CleanupStaleEntryInput` (`cleanupStaleEntry.ts:18-24`) gains optional `gate` and `s`.
- `_StaleCleanupAutoSubmit.tsx` gains two hidden inputs supplying them. **Only the hidden inputs** —
  its `useEffect`, its empty dependency array, and its auto-submit mechanics are untouched, which
  is what spec §1.2 protects.
- Both values are re-validated against the same allow-lists `validateNextParam` uses before
  reaching `buildShowReturnUrl`. An absent or non-allow-listed value is dropped and the redirect
  degrades to the bare canonical URL rather than failing.

The `!result.ok` early return preserves the existing failure contract; the `isValidShowPathPair`
early return returns the successful result rather than redirecting, because the cleanup itself
already succeeded by that point.

### Task 6 — claimed-row client boundary + pending state (RED→GREEN)

New `_ClaimedRowButton` (in the same directory as `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx`), `"use client"`. Props per spec §3.4.
Local `useState` for pending, flipped in `onClick`, reset on `pageshow`.

**Busy signalling is `aria-disabled`, NOT the `disabled` attribute** (spec §3.5, R1 finding 3). A
natively disabled button is removed from the focusable set, so a keyboard user loses their place
the moment the row goes busy. `aria-disabled` keeps it focusable; the `onClick` early-return is
what actually blocks the second activation, and is therefore load-bearing rather than decorative.
Pending background is set via an `aria-disabled:` variant declared after the hover rule —
`disabled:` variants do not apply and hover is NOT suppressed for free.

Tests in `tests/show/pickerAffordance.test.tsx` (existing harness), roster fixture containing BOTH
a claimed and an unclaimed row:

1. Pending renders `picker-row-spinner`, drops `picker-row-lock`, sets `aria-disabled="true"` +
   `aria-busy="true"`, and puts `Signing in…` in the claimed row's `picker-role-chip`. **Scope the
   chip query to the claimed row's subtree** — unclaimed rows render `picker-role-chip` too, and an
   unscoped query passes on the wrong node.
2. **`useFormStatus` regression guard.** This is test 1's real job: a `useFormStatus`
   implementation leaves pending false forever and fails it. Name that failure mode in a comment
   citing spec §3.4 so the next reader does not "simplify" it away.
3. `role={null}` → no chip idle, `Signing in…` chip pending (spec R4).
4. Unclaimed row never renders `picker-row-spinner` (spec R5).
5. `pageshow` with `persisted: true` after pending → back to idle.
6. **Double-activation guard.** Fire two clicks; assert only one submit is issued. Failure mode
   caught: relying on `aria-disabled` to block activation (it does not) and omitting the
   `onClick` early return — the row would look busy and still double-submit, which is the entire
   defect.

Also: add `whitespace-nowrap` to `chipBase` (`_PickerInterstitial.tsx:182`) — `Signing in…` is
wider than most role strings and the chip must not wrap (spec §5).

### Task 7 — layout + disabled-state proof, real browser

Extend `tests/e2e/crew-layout-dimensions.spec.ts`. Three assertions, all requiring a real browser.

**7a — height invariance over TWO fixtures.** Measure the claimed row's
`getBoundingClientRect().height` idle vs pending, equal within 0.5px, for a row WITH a role and a
row with `role={null}`. The null-role case is the one that matters: with a role present pending
merely swaps chip text, but with `role={null}` pending ADDS a chip idle does not have. A
role-bearing fixture alone proves the easy substitution and never exercises R4's addition (R1
finding 4).

Spec §5 invariant list, verbatim, is this task's checklist:

- row → left group: vertically centered, single line (`items-center`)
- row → spinner: 16px box, does not raise row height above the 44px floor (`size-4`)
- row → pending chip: single line, no wrap (`shrink-0` + `whitespace-nowrap`)
- row → name span: truncates rather than wrapping (`truncate` + `min-w-0`)
- row height idle → pending: unchanged

**7b — hover precedence.** With the pointer over the row, assert the computed background while
pending is the pending background, not the hover background. Failure mode caught: assuming the
busy state suppresses hover. It does not — Tailwind emits the hover variant with no not-disabled
guard, and CSS hover matches by pointer position regardless.

**7c — focus retention.** Focus the row, drive it to pending, assert `document.activeElement` is
still the row. Failure mode caught: shipping `disabled`, which drops focus to `<body>`.

jsdom cannot compute layout or resolve computed styles this way; all three run in Playwright.
Detach safety per §0.2.

### Task 8 — transition audit

Enumerate every conditional branch in `_ClaimedRowButton` and assert each is animated as stated or
deliberately instant, against spec §6:

| From → To | Expected |
|---|---|
| idle → pending | instant; spinner rotation is the motion |
| pending → idle | instant, via `pageshow` |

Compounds — note the first three are **asserted in Task 7, not inferred here**, because R1 found
the original prose claims were false:

- pointer-over-row during pending → pending background wins (Task 7b)
- keyboard focus during pending → ring persists, focus retained (Task 7c)
- pending arriving mid-hover-transition → the 120ms `transition-colors` completes into the pending
  background, not the hover background (Task 7b covers the end state)
- two different rows tapped → each owns its own state; two pending rows is accepted, not a bug

### Task 9 — retire the e2e workaround (the proof)

`tests/e2e/stage-restricted-crew-schedule.spec.ts`: collapse all three TWO-STEP sites (`stage-restricted-crew-schedule.spec.ts:162`,
`stage-restricted-crew-schedule.spec.ts:251`, `stage-restricted-crew-schedule.spec.ts:461`) to a single direct navigation to the `?s=schedule` URL, and delete the comment
block at each.

**This is the highest-value task in the plan.** It is the only place the bootstrap fix is proved
end-to-end against a real browser and a real Google session rather than a route unit test. If it
fails, Task 2 did not actually ship.

### Task 10 — stale-cleanup e2e

Extend `tests/e2e/picker-flow.spec.ts`. Seed a show, seed a picker cookie whose `epoch` mismatches
`shows.picker_epoch` (→ `epoch_stale`), drive the picker at `?gate=skip`, and assert the browser
lands **on the picker**: `picker-interstitial-root` visible, plus the stale hint gone.

**Assert the rendered screen, not just the URL.** A URL-and-hint-only assertion passes on
`<SignInOrSkipGate>`, which is exactly the wrong-screen bug R1 finding 2 identified — the redirect
can be correct about the address and wrong about the page. Derive the expected URL from the
fixture's slug/token; never hardcode.

Coverage is 1 of the 4 stale kinds (`epoch_stale`), by the documented-limits rationale in spec §9.

No workflow wiring change: the file is already run by `.github/workflows/crew-e2e.yml:151`.

### Task 11 — close-out

1. Invariant-8 dual gate: `/impeccable critique` AND `/impeccable audit` on the diff. Fill in the
   §0.3 marker; record findings + dispositions.
2. Graduate the three backlog entries to `BACKLOG-archive.md`, and correct the dangling
   "master spec §16.6" citation in `BL-PICKER-CLAIMED-ROW-PENDING-STATE` to
   `docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md:175`. **Last commit before
   the PR** — another session owns the ledger files; rebase onto it if it has not merged (spec §11).
3. Whole-diff cross-model review to APPROVE.
4. Push → real CI green → `gh pr merge --merge` → verify `0  0`.

---

## Checklist

- [ ] Task 1 — bootstrap four-shape matrix (RED)
- [ ] Task 2 — `parseNextPath` splits query (GREEN)
- [ ] Task 3 — bootstrap negative guards
- [ ] Task 4 — stale-cleanup public-boundary sentinel/emit/destination tests (RED)
- [ ] Task 5 — stale-cleanup redirect from the public action (GREEN)
- [ ] Task 6 — `_ClaimedRowButton` + pending tests
- [ ] Task 7 — layout + hover precedence + focus retention (real browser)
- [ ] Task 8 — transition audit
- [ ] Task 9 — retire the e2e workaround
- [ ] Task 10 — stale-cleanup e2e
- [ ] Self-review
- [ ] Adversarial review (cross-model)
- [ ] Task 11 — close-out (impeccable dual gate, backlog graduation, whole-diff review, merge)
