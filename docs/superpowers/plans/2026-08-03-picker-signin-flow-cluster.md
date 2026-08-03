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
| stale-entry staging for e2e | **NOT** `seedPickerCookie` — `tests/e2e/picker-flow.spec.ts:11-16` records that Chromium CDP rejects `__Host-` cookie injection and the suite now stages by DRIVING the picker. Task 8 follows that. |
| e2e seed helper returns `pickerEpoch` | `tests/e2e/helpers/seedShowWithCrew.ts:85-92` |
| layout-measurement pattern | `locator.evaluate((el) => el.getBoundingClientRect().height)` per `tests/e2e/collapse-panel-morph.spec.ts:99-101`. NOT hosted in `crew-layout-dimensions.spec.ts` — that file is `PATH_GATED` debt (`tests/ci/_metaE2eWorkflowCoverage.test.ts:130`) and CI runs only its `T-NOPHANTOM-CREW` grep (`.github/workflows/phantom-gap-e2e.yml:175`). Task 5 hosts them in `picker-flow.spec.ts`. |
| e2e workflow already runs picker-flow on desktop-chromium | `.github/workflows/crew-e2e.yml:151` |

**`useFormStatus` probe (spec §3.4).** Run before drafting; result `NATIVE_GET=false`,
`FUNCTION_ACTION=true`. The probe was scratch and is not committed — Task 6 lands the permanent
regression test that encodes the same fact against our own component.

## 0.1 Meta-test inventory

**CREATES:** none.

**EXTENDS:** `tests/components/StaleCleanupAutoSubmit.test.tsx:61-79` — its `SANCTIONED` set is a
hard two-entry allowlist of `"use client"` files under `app/show/[slug]/[shareToken]/`. The new
`_ClaimedRowButton` is a third client island and MUST be added there, in Task 4, or the required
unit workflow goes red. Missing this was plan R1 finding 5.

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
- **Detach safety:** the layout probe in Task 5 reads `getBoundingClientRect` on a row whose native
  GET would navigate away mid-measure. **Chosen strategy: Playwright route interception** —
  `page.route("**/auth/sign-in*", (route) => route.abort())`, registered BEFORE the click, with an
  attachment check before each measurement. Not `preventDefault`: interception leaves the real
  `onClick` handler and the real submission path intact, so the production code path is what gets
  exercised.

## 0.3 Closeout marker — deferred to close-out, deliberately

This plan touches UI surface, so invariant 8 applies and its marker line is required. **The marker
is written at close-out (Task 9), not here, and the gate half-names are spelled out there too.**

Reason, verified against the guard rather than assumed: `tests/docs/_invariant8Closeout.ts:127-164`
accepts exactly two marker forms outside registered template files — the RAN form with real counts,
and the N/A form. The fill-in TEMPLATE form is classified **malformed** anywhere except
`HANDOFF-TEMPLATE.md` (`tests/docs/invariant8/preGuardDebt.ts:236-238` is the only allowlist).
An earlier revision of this plan carried the template placeholder and turned
`tests/docs/_metaInvariant8Closeout.test.ts` red on the live tree — measured, not hypothetical:

```text
§4.1.1 every declaring unit conforms or carries a PRE_GUARD_DEBT row — FAIL
§4.1.2 no malformed marker line anywhere in the plans tree — FAIL
  2026-08-03-picker-signin-flow-cluster.md: malformed marker line: impeccable-gate: critique=<...>
```

`declaresGate` (`tests/docs/_invariant8Closeout.ts:109-118`) folds a unit as *declaring* when some
file in it names both gate halves, and a declaring unit must then carry a conforming marker. Since
neither honest form exists before the gate has run, the half-names and the marker land together in
the same close-out commit. Precedent: `docs/superpowers/plans/2026-08-02-admin-popover-overlay-cluster.md:307`
carries only its final RAN line.


---

## Tasks

Tasks come in two kinds, and R2 was right that calling all of them "TDD" was false.

**Implementation tasks** (1, 3, 4) are strict TDD cycles: failing test → minimal implementation →
passing test → one commit (AGENTS.md invariants 1 and 6). Never RED-only or GREEN-only — splitting
those would commit a red suite, which the one-commit-per-task rule turns into a broken HEAD (plan
R1 finding 1).

**Proof tasks** (2, 5, 6, 7, 8) add or change tests for behavior an earlier task already
implemented. They cannot have a natural red phase, and pretending otherwise is how a tautological
test ships. Instead each carries a **falsification requirement**: the task is done only when the
implementer has demonstrated a concrete mutation that makes the new assertion FAIL, and recorded
that mutant and its output in the commit message. A proof task whose mutant cannot be produced is
not proving anything and must be strengthened or dropped. The specific mutant is named in each
task body.

**Task 9 is process**, not a test task, and is labelled as such.

This division is the honest form of invariant 1 for a plan that closes three defects with layered
unit, component, and browser evidence. R2 finding 3.

### Task 1 — bootstrap accepts a query-bearing `next`

**RED.** Extend `tests/auth/picker-bootstrap.test.ts` with the four-shape matrix from spec §2.1.
Each case asserts the **exact** `Location` header, not merely a non-403 status.

Failure mode caught: a handler that strips the query returns 302 and passes a status-only
assertion while silently reintroducing the deep-link loss R1 rejects.

1. `next=/show/<slug>/<64hex>` → `Location` identical (regression guard on today's behavior).
2. `next=/show/<slug>/<64hex>?s=schedule` → `Location` carries `?s=schedule`.
3. `next=/show/<slug>/<64hex>?gate=skip` → `Location` carries `?gate=skip`.
4. `next=/show/<slug>/<64hex>?s=schedule&gate=skip` → both, in that order
   (`lib/crew/buildShowReturnUrl.ts:46` emits a stable order).

Cases 2–4 are red.

**GREEN.** `app/api/auth/picker-bootstrap/route.ts`, `parseNextPath` only:

```ts
export function parseNextPath(path: string): { slug: string; shareToken: string } | null {
  const match = SHOW_NEXT_RE.exec(path.split("?")[0]!);
  if (!match) return null;
  return { slug: match[1]!, shareToken: match[2]! };
}
```

`SHOW_NEXT_RE` is NOT edited (spec R6). The `export` is added deliberately — Task 2 needs to reach
this function directly, and the reason is recorded there.

Typecheck: `path.split("?")[0]` is `string | undefined` under `noUncheckedIndexedAccess`; the `!`
is required and safe (`split` always yields ≥1 element).

### Task 2 — pin the path grammar where it is actually observable

**The obvious version of this test is tautological, and R1 proved it with a mutant.** Sending
`next=/show/<slug>/<64hex>/extra` through the route does NOT pin `SHOW_NEXT_RE`: the route
validates `next` first (`app/api/auth/picker-bootstrap/route.ts:147-151`), and the upstream
`ALLOWED_NEXT_RE` (`lib/auth/validateNextParam.ts:18`) is independently `$`-anchored, so it
rejects `/extra` before `parseNextPath` ever runs. Settling mutant from the review: delete the `$`
from `SHOW_NEXT_RE` only, send `/show/<slug>/<token>/extra`, and the route still answers 403 — the
route-level test passes against a broken parser.

**RED.** Unit-test the exported `parseNextPath` directly:

- `/show/<slug>/<64hex>/extra` → `null` (this is the assertion the mutant kills; verify by
  temporarily deleting the `$` and watching THIS test fail while the route test stays green).
- `/show/<slug>/<64hex>?s=schedule` → `{ slug, shareToken }` with the token free of query text.
- `/show/<slug>/<64hex>` → same pair.
- `/show/<SLUG-with-caps>/<64hex>` → `null` (case grammar unchanged).

**Falsification requirement (proof task).** No implementation change — Task 1 already wrote it. The
deliverable is the test PLUS the recorded mutant: delete the `$` from `SHOW_NEXT_RE`, run both, and
paste the result in the commit message. Expected, and already confirmed by review probe:
the new unit test FAILS while the route-level test stays green — which is exactly why the unit test
has to exist.

Two route-level guards stay, because they pin different seams:

- **Intent binding.** A `t` token signed for a different slug still 403s at `route.ts:161` when
  `next` carries a query. Pins that the query did not leak into the signed comparison.
- **Allow-list pass-through.** `?s=schedule&evil=1` → emitted `Location` contains `s=schedule` and
  not `evil`. Pins that the handler still trusts `validateNextParamDetailed` output rather than the
  raw query.

### Task 3 — stale cleanup redirects from the public action

**RED.** Three assertions, all against the **public** `cleanupStaleEntry`, never against
`cleanupStaleEntryCoreImpl` (spec §3.3, §8.2):

1. **Sentinel escape.** `cleanupStaleEntry(formData)` THROWS a `NEXT_REDIRECT` sentinel whose
   digest carries the expected destination. Failure mode: a redirect inside
   `cleanupStaleEntryCoreImpl`, which `cleanupStaleEntry.ts:56-61`'s bare `catch` turns into
   `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }` — no navigation at all. **An
   impl-scoped assertion passes in exactly that broken world**, which is why this one sits at the
   public boundary.
2. **Emit survival.** `PICKER_STALE_ENTRY_CLEANED` is recorded even though the action throws —
   catch the sentinel, then assert the sink spy. Failure mode: reordering that puts the throw above
   the emit, dropping invariant-10 telemetry.
3. **Destination carries `gate`.** The sentinel's path includes `gate=skip` when the form supplied
   it. Failure mode: the bare-canonical redirect, which re-resolves as `no_auth: first_contact`,
   fails `allowGateSkip` (`app/show/[slug]/[shareToken]/page.tsx:324`), and renders
   `<SignInOrSkipGate>` instead of the picker.

**GREEN.** The redirect goes in `cleanupStaleEntry` (`lib/auth/picker/cleanupStaleEntry.ts:30-51`),
after `cleanupStaleEntryCore` returns and OUTSIDE its swallowing try/catch:

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
redirect moves the browser.

Companion edits:

- `CleanupStaleEntryInput` (`cleanupStaleEntry.ts:18-24`) gains optional `gate` and `s`.
- `_StaleCleanupAutoSubmit.tsx` gains two hidden inputs supplying them. **Only the hidden inputs** —
  its `useEffect`, empty dependency array, and auto-submit mechanics are untouched, which is what
  spec §1.2 protects.
- Both values are re-validated against the same allow-lists `validateNextParam` uses before
  reaching `buildShowReturnUrl`; absent or non-allow-listed values are dropped and the redirect
  degrades to the bare canonical URL rather than failing.

### Task 4 — claimed-row client boundary + pending state

**RED first, and one of the red tests is a static one that does not involve the component at all.**

`tests/components/StaleCleanupAutoSubmit.test.tsx:61-79` walks
`app/show/[slug]/[shareToken]/` and fails on any `"use client"` file outside a two-entry
`SANCTIONED` set (`_StaleCleanupAutoSubmit.tsx`, `error.tsx`). It is included by
`vitest.projects.ts` and run by the required unit workflow, so **creating `_ClaimedRowButton`
turns that suite red before any of this task's own tests run.** Adding
`_ClaimedRowButton` to `SANCTIONED`, with a comment naming why a third client island exists, is
part of this task — not an afterthought at close-out. Plan R1 finding 5; see the corrected §0.1
inventory.

New `_ClaimedRowButton` (same directory as `_PickerInterstitial.tsx`), `"use client"`, props per
spec §3.4. Local `useState` for pending, flipped in `onClick`, reset on `pageshow`.

**Busy signalling is `aria-disabled`, NOT the `disabled` attribute** (spec §3.5). A natively
disabled button leaves the focusable set, so a keyboard user loses their place the moment the row
goes busy. `aria-disabled` keeps it focusable. **The `onClick` handler MUST call
`e.preventDefault()` on the pending path** — measured: an early return alone leaves `submits=2`,
with `preventDefault` it is 1, and `aria-disabled` alone does not block activation (spec §3.6
P1/P2). Without it the row looks busy and still double-submits, i.e. the defect is untouched. Pending background is set via an
`aria-disabled:` variant declared after the hover rule — `disabled:` variants do not apply and
hover is NOT suppressed for free.

Tests in `tests/show/pickerAffordance.test.tsx` (existing jsdom harness), roster fixture with BOTH
a claimed and an unclaimed row:

1. Pending renders `picker-row-spinner`, drops `picker-row-lock`, sets `aria-disabled="true"` +
   `aria-busy="true"`, and puts `Signing in…` in the claimed row's `picker-role-chip`. **Scope the
   chip query to the claimed row's subtree** — unclaimed rows render `picker-role-chip` too, so an
   unscoped query passes on the wrong node.
2. **`useFormStatus` regression guard** — test 1's real job. A `useFormStatus` implementation leaves
   pending false forever and fails it. Name that failure mode in a comment citing spec §3.4.
3. `role=""` → no chip idle, `Signing in…` chip pending (spec R4). **Not `role={null}`** — the prop
   is `string` (`_PickerInterstitial.tsx:50`), the seed helper types it `string`
   (`tests/e2e/helpers/seedShowWithCrew.ts:33-42`), and the column is `role text not null`. A null
   fixture does not typecheck and cannot be seeded.
4. Unclaimed row never renders `picker-row-spinner` (spec R5).
5. `pageshow` with `persisted: true` after pending → back to idle.
6. **Double-activation guard.** Two clicks issue one submit. Failure mode: relying on
   `aria-disabled` to block activation (it does not) and omitting the early return — the row would
   look busy and still double-submit, which is the whole defect.

Also add `whitespace-nowrap` to `chipBase` (`_PickerInterstitial.tsx:182`) — `Signing in…` is wider
than most role strings and the chip must not wrap (spec §5).

### Task 5 — real-browser proof, in a file CI actually runs

**Do not extend `tests/e2e/crew-layout-dimensions.spec.ts`.** It is registered as `PATH_GATED` debt
(`tests/ci/_metaE2eWorkflowCoverage.test.ts:130`) and its only workflow invocation filters to
`-g "T-NOPHANTOM-CREW"` (`.github/workflows/phantom-gap-e2e.yml:175`), so everything else in it is
CI-dark. Its host describe also signs in an admin and navigates crew-shell sections
(`crew-layout-dimensions.spec.ts:291-335`) and never mounts a claimed picker row. Assertions added
there would be green locally and never execute on a PR. Plan R1 finding 6, and an instance of the
"local passes, CI fails" class in AGENTS.md.

These assertions go in `tests/e2e/picker-flow.spec.ts`, which `crew-e2e.yml:151` runs on
`desktop-chromium` for every PR that touches the paths.

**Detach safety — one strategy, chosen.** The row submits a native GET that would navigate away
mid-measure. Use Playwright **route interception** (`page.route("**/auth/sign-in*", route =>
route.abort())`) so the navigation never commits and the element cannot detach. Not
`preventDefault`: intercepting leaves the real `onClick` handler and the real form submission path
intact, so the test still exercises the production code path rather than a neutered one. Register
the interception BEFORE the click, and assert the row is still attached before each measurement.

**Falsification requirement (proof task):** revert the fixed-width lock/spinner slot and show 5a's
name-edge assertion failing; revert the `aria-disabled:` background precedence and show 5b failing;
swap `aria-disabled` for `disabled` and show 5c failing. Record all three in the commit message.

**5a — height invariance over two fixtures.** Claimed row `getBoundingClientRect().height` idle vs
pending, equal within 0.5px, PLUS the name span's left edge unchanged within 0.5px (the
lock-vs-spinner width invariant, spec §5), for a row WITH a role and a row with `role=""`. The
roleless case is the one that matters: with a role present pending swaps chip text, but with
`role=""` pending ADDS a chip idle does not have. A role-bearing fixture alone proves the easy substitution
and never exercises R4's addition (spec R1 finding 4).

Spec §5 invariant list, verbatim, is this task's checklist:

- row → left group: vertically centered, single line (`items-center`)
- row → spinner: 16px box, does not raise row height above the 44px floor (`size-4`)
- row → pending chip: single line, no wrap (`shrink-0` + `whitespace-nowrap`)
- row → name span: truncates rather than wrapping (`truncate` + `min-w-0`)
- row height idle → pending: unchanged

**5b — hover precedence.** Pointer over the row, pending active: computed background is the pending
background, not the hover background. Failure mode: assuming busy suppresses hover. It does not —
Tailwind emits the hover variant with no not-disabled guard, and CSS hover matches by pointer
position regardless.

**5c — focus retention.** Focus the row, drive to pending, assert `document.activeElement` is still
the row. Failure mode: shipping `disabled`, which drops focus to `<body>`.

**5d — reduced motion.** Under `emulateMedia({ reducedMotion: "reduce" })` the spinner renders and
`motion-reduce:animate-none` suppresses its animation, while the chip text swap and
`aria-disabled` still convey pending. Spec §4.3 requires motion never be the sole signal.

### Task 6 — transition audit

**Falsification requirement (proof task):** add a fourth conditional branch to `_ClaimedRowButton`
with no declared treatment and show the audit failing on it. If the audit passes with an
undeclared branch present, it is enumerating nothing.

Enumerate every conditional branch in `_ClaimedRowButton` and assert each is animated as stated or
deliberately instant, against spec §6:

| From → To | Expected |
|---|---|
| idle → pending | instant; spinner rotation is the motion |
| pending → idle | instant, via `pageshow` |

The compound rows are **asserted in Task 5, not enumerated here** — R1 showed the original prose
claims about them were false, and a static conditional scan proves no browser behavior:

- pointer-over-row during pending → Task 5b
- keyboard focus during pending → Task 5c
- pending arriving mid-hover-transition → Task 5b covers the end state
- two different rows tapped → each owns its own state; two pending rows is accepted, not a bug

### Task 7 — retire the e2e workaround (the proof)

`tests/e2e/stage-restricted-crew-schedule.spec.ts`: collapse all three TWO-STEP sites
(`stage-restricted-crew-schedule.spec.ts:162`, `stage-restricted-crew-schedule.spec.ts:251`,
`stage-restricted-crew-schedule.spec.ts:461`) to a single direct navigation to the `?s=schedule`
URL, deleting the comment block at each.

**This is the highest-value task in the plan.** It is the only place the bootstrap fix is proved
end-to-end against a real browser and a real Google session rather than a route unit test.

**Falsification requirement (proof task):** it is self-falsifying — revert Task 1's `parseNextPath`
change and the direct navigation 403s. Record that run. If it does NOT fail with Task 1 reverted,
the two-step workaround was never load-bearing and this task proves nothing.

### Task 8 — stale-cleanup e2e

Extend `tests/e2e/picker-flow.spec.ts`.

**Staging: drive the picker; do NOT call `seedPickerCookie`.** That helper injects a signed
`__Host-fxav_picker` envelope via `context.addCookies`, and `picker-flow.spec.ts:11-16` records the
measured result — Chromium's CDP rejects it outright ("Invalid cookie fields"), and WebKit accepts
it but then will not let the server overwrite. The suite stages selections by driving the picker so
the server mints the envelope itself, and there are no live `seedPickerCookie` call sites left in
the tree. The §0 pre-draft table's citation of it was wrong; plan R1 finding 4.

Sequence:

1. Seed a show with crew, drive the picker at `?gate=skip`, tap a row → server mints the envelope.
2. Bump `shows.picker_epoch` via the admin client so the minted entry is now stale (`epoch_stale`).
3. Reload at `?gate=skip`; the stale-cleanup auto-submit fires.
4. Assert the browser lands **on the picker**: `picker-interstitial-root` visible, stale hint gone.

**Assert the rendered screen, not just the URL.** A URL-and-hint-only assertion passes on
`<SignInOrSkipGate>` — the wrong-screen bug from spec R1 finding 2 — because that gate has no stale
hint either. Derive the expected URL from the fixture's slug/token; never hardcode.

**Falsification requirement (proof task):** drop `gate` from the redirect in Task 3 and show this
e2e failing on `picker-interstitial-root` (it should land on the sign-in gate). That is the
assertion's whole reason for existing — a URL-only assertion would stay green.

Coverage is 1 of the 4 stale kinds (`epoch_stale`), per the documented-limits rationale in spec §9.

### Task 9 — close-out

1. **Invariant-8 dual gate.** Run BOTH halves named in `AGENTS.md` invariant 8, with their
   canonical setup gates first: the skill's context-load step (PRODUCT.md + DESIGN.md), then its
   register reference read (the brand or product register named in AGENTS.md invariant 8). Then add a `## 12` section to this plan
   containing the real marker line in the RAN form with actual counts, and record findings +
   dispositions there. The half-names and the marker land in this same commit (§0.3).
2. **Whole-diff cross-model review to APPROVE, INCLUDING any repair commits it forces.** This runs
   BEFORE the ledger graduation, not after. R2 finding 6: an earlier ordering made the graduation
   "the last commit before the PR" and then put review after it, so any ordinary review repair
   would land later and break that rule. Review first; repair until APPROVE; only then graduate.
3. **Graduate the three backlog entries** to `BACKLOG-archive.md`, and correct the dangling
   "master spec §16.6" citation in `BL-PICKER-CLAIMED-ROW-PENDING-STATE` to
   `docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md:175`. This is now genuinely
   the last commit before the PR. Another session owns the ledger files — check `git worktree list`
   and rebase onto that branch if it has not merged (spec §11).
4. Push → real CI green → `gh pr merge --merge` → verify `0  0`. If CI forces a fix, the ledger
   commit is re-applied on top rather than amended, and step 3's last-commit rule is restated as
   "last commit authored before the PR opens" — CI repairs are exempt by construction.

---

## Checklist

- [ ] Task 1 — bootstrap accepts a query-bearing `next` (test + impl)
- [ ] Task 2 — `parseNextPath` unit grammar pin, with the recorded mutant
- [ ] Task 3 — stale cleanup redirects from the public action (test + impl)
- [ ] Task 4 — `_ClaimedRowButton` + pending state + `SANCTIONED` allowlist entry
- [ ] Task 5 — real-browser proof in `picker-flow.spec.ts` (5a–5d)
- [ ] Task 6 — transition audit
- [ ] Task 7 — retire the e2e workaround
- [ ] Task 8 — stale-cleanup e2e (driven staging, not `seedPickerCookie`)
- [ ] Self-review
- [ ] Adversarial review (cross-model)
- [ ] Task 9 — close-out (impeccable dual gate, backlog graduation, whole-diff review, merge)
