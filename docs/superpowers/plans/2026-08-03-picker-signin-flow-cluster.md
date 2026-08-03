# Plan — picker sign-in flow cluster

**Spec:** `docs/superpowers/specs/2026-08-03-picker-signin-flow-cluster-design.md` (canonical; its
§1.1 table is the do-not-relitigate set)
**Branch:** `fix/picker-signin-flow-cluster`
**Backlog:** `BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED`, `BL-PICKER-CLAIMED-ROW-PENDING-STATE`

**Descoped 2026-08-03 (owner):** `BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT` — its founding premise
was refuted in spec review R3. Rationale and the correction it must carry back to the ledger are in
spec §1.3. Do not re-add the redirect, the `gate`/`s` threading, or the stale-cleanup e2e.

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
| claimed row is a native GET form with a hidden `next` | `_PickerInterstitial.tsx:197-202` |
| `--spacing-tap-min: 44px` | `app/globals.css:162` |
| `--duration-fast: 120ms` | `app/globals.css:223` |
| 3 `TWO-STEP navigation` workaround sites | `tests/e2e/stage-restricted-crew-schedule.spec.ts:162`, `stage-restricted-crew-schedule.spec.ts:251`, `stage-restricted-crew-schedule.spec.ts:461` |
| component-test harness for the picker | `tests/show/pickerAffordance.test.tsx:1-26` (jsdom + testing-library, renders `PickerInterstitial` with a roster fixture) |
| layout-measurement pattern | `locator.evaluate((el) => el.getBoundingClientRect().height)` per `tests/e2e/collapse-panel-morph.spec.ts:99-101`. NOT hosted in `crew-layout-dimensions.spec.ts` — that file is `PATH_GATED` debt (`tests/ci/_metaE2eWorkflowCoverage.test.ts:130`) and CI runs only its `T-NOPHANTOM-CREW` grep (`.github/workflows/phantom-gap-e2e.yml:175`). Task 4 hosts them in `picker-flow.spec.ts`. |
| e2e workflow already runs picker-flow on desktop-chromium | `.github/workflows/crew-e2e.yml:151` |

**`useFormStatus` probe (spec §3.4).** Run before drafting; result `NATIVE_GET=false`,
`FUNCTION_ACTION=true`. The probe was scratch and is not committed — Task 3 lands the permanent
regression test that encodes the same fact against our own component.

## 0.1 Meta-test inventory

**CREATES:** none.

**EXTENDS:** `tests/components/StaleCleanupAutoSubmit.test.tsx:61-79` — its `SANCTIONED` set is a
hard two-entry allowlist of `"use client"` files under `app/show/[slug]/[shareToken]/`. The new
`_ClaimedRowButton` is a third client island and MUST be added there, in Task 3, or the required
unit workflow goes red. Missing this was plan R1 finding 5.

**Checked and deliberately NOT disturbed:** `scripts/check-crew-e2e-executed.mjs:22-34` pins
`picker-flow.spec.ts` at six executable cases and
`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:456-498` asserts that threshold equals live
Playwright resolution. Task 4 extends the existing claimed-row case rather than adding a seventh
`test()`, which keeps this diff off that registry. Any change to that decision must update the
script, the wiring test, and `.github/workflows/crew-e2e.yml:138` in one commit.

Checked and ruled out, explicitly:

- `tests/components/_metaPickerRoleChipContract.test.ts` — despite the name, it pins
  `components/auth/IdentityChip.tsx` props and the `Header` right-slot wiring, **not** the picker
  roster row's `data-testid="picker-role-chip"`. Read it before assuming otherwise; this diff does
  not touch anything it asserts.
- `tests/auth/_metaInfraContract.test.ts` (invariant 9) — no new Supabase client call site.
- `tests/auth/advisoryLockRpcDeadlock.test.ts` (invariant 2) — no `pg_advisory*` surface.
- `tests/log/_metaMutationSurfaceObservability.test.ts` (invariant 10) — no mutation surface is
  added or modified. `cleanupStaleEntry` is untouched now that spec §1.3 is descoped.

## 0.2 e2e harness readiness

- **Boot:** prod build. `BASE_URL = process.env.PICKER_E2E_BASE_URL ?? "http://127.0.0.1:3000"`
  (`tests/e2e/picker-flow.spec.ts:48`).
- **Readiness gate:** an explicit locator assertion (`expect(page.getByTestId(...)).toBeVisible()`)
  after every `goto`. `networkidle` alone is not a gate — the existing spec pairs `waitUntil:
  "networkidle"` with a visibility assertion, and new tests must do the same.
- **Detach safety:** the layout probe in Task 4 reads `getBoundingClientRect` on a row whose native
  GET would navigate away mid-measure. **Chosen strategy: Playwright route interception** —
  `page.route("**/auth/sign-in*", (route) => route.abort())`, registered BEFORE the click, with an
  attachment check before each measurement. Not `preventDefault`: interception leaves the real
  `onClick` handler and the real submission path intact, so the production code path is what gets
  exercised.

## 0.3 Closeout marker — deferred to close-out, deliberately

This plan touches UI surface, so invariant 8 applies and its marker line is required. **The marker
is written at close-out (Task 7), not here, and the gate half-names are spelled out there too.**

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

**Implementation tasks** (1, 3) are strict TDD cycles: failing test → minimal implementation →
passing test → one commit (AGENTS.md invariants 1 and 6). Never RED-only or GREEN-only — splitting
those would commit a red suite, which the one-commit-per-task rule turns into a broken HEAD (plan
R1 finding 1).

**Proof tasks** (2, 4, 5, 6) add or change tests for behavior an earlier task already
implemented. They cannot have a natural red phase, and pretending otherwise is how a tautological
test ships. Instead each carries a **falsification requirement**: the task is done only when the
implementer has demonstrated a concrete mutation that makes the new assertion FAIL, and recorded
that mutant and its output in the commit message. A proof task whose mutant cannot be produced is
not proving anything and must be strengthened or dropped. The specific mutant is named in each
task body.

**Task 7 is process**, not a test task, and is labelled as such.

This division is the honest form of invariant 1 for a plan that closes two defects with layered
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

### Task 3 — claimed-row client boundary + pending state

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

Also add `whitespace-nowrap` **to the pending chip only**, NOT to the shared `chipBase` at
`_PickerInterstitial.tsx:182`. `chipBase` also styles the unclaimed chip
(`_PickerInterstitial.tsx:253-257`), and changing unclaimed-row overflow behavior for arbitrary
`role` text is out of scope under R5 (spec §5, spec §1.1 R5).

### Task 4 — real-browser proof, in a file CI actually runs

**Do not extend `tests/e2e/crew-layout-dimensions.spec.ts`.** It is registered as `PATH_GATED` debt
(`tests/ci/_metaE2eWorkflowCoverage.test.ts:130`) and its only workflow invocation filters to
`-g "T-NOPHANTOM-CREW"` (`.github/workflows/phantom-gap-e2e.yml:175`), so everything else in it is
CI-dark. Its host describe also signs in an admin and navigates crew-shell sections
(`crew-layout-dimensions.spec.ts:291-335`) and never mounts a claimed picker row. Assertions added
there would be green locally and never execute on a PR. Plan R1 finding 6, and an instance of the
"local passes, CI fails" class in AGENTS.md.

These assertions go in `tests/e2e/picker-flow.spec.ts`, which `crew-e2e.yml:151` runs on
`desktop-chromium` for every PR that touches the paths.

**They EXTEND the existing claimed-row case at `tests/e2e/picker-flow.spec.ts:434`; they do not add
new `test()` blocks.** This is deliberate and load-bearing:
`scripts/check-crew-e2e-executed.mjs:22-34` pins this spec at six executable cases and
`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:456-498` asserts that threshold equals live
Playwright resolution, so a seventh `test()` fails CI unless the registry and the workflow's
case census move in the same commit. Extending the existing case keeps the count at six and keeps
this diff off that registry entirely. If a future revision does need a new case, it must update
`check-crew-e2e-executed.mjs`, the wiring test, and `.github/workflows/crew-e2e.yml:138` together.

**Detach safety — one strategy, chosen.** The row submits a native GET that would navigate away
mid-measure. Use Playwright **route interception** (`page.route("**/auth/sign-in*", route =>
route.abort())`) so the navigation never commits and the element cannot detach. Not
`preventDefault`: intercepting leaves the real `onClick` handler and the real form submission path
intact, so the test still exercises the production code path rather than a neutered one. Register
the interception BEFORE the click, and assert the row is still attached before each measurement.

**Falsification requirement (proof task):** revert the fixed-width lock/spinner slot and show 4a's
name-edge assertion failing; revert the `aria-disabled:` background precedence and show 4b failing;
swap `aria-disabled` for `disabled` and show 4c failing. Record all three in the commit message.

**4a — height invariance over two fixtures.** Claimed row `getBoundingClientRect().height` idle vs
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

**Fixture is deterministic, not 'a long name'.** Use a 120-character single-token name (no spaces,
so there is no wrapping opportunity and `truncate` is the only thing that can contain it) at a
360px viewport. An unspecified 'LONG-name' leaves whether `truncate`'s deletion fails the
assertion dependent on content — R5 finding 3.

**Two invariants in the §5 checklist are NOT killed by height/name-edge/containment alone, and
need their own assertions:**

- `items-center` on the ROW: assert the pending **chip's** measured height is strictly less than the
  row's **`clientHeight`**. Both the obvious alternatives are vacuous, measured:
  - spinner-centre-equals-row-centre does NOT discriminate — the extracted subtree keeps its own
    nested `items-center` on the left group (`_PickerInterstitial.tsx:210`), so deleting the row's
    `items-center` lets that group stretch and re-centre the spinner inside itself. Both centres stay
    equal while the right-hand chip stretches vertically (R6).
  - comparing against the row's `getBoundingClientRect().height` does NOT discriminate either — the
    row has a 1px border (`_PickerInterstitial.tsx:174`) under Tailwind preflight's
    `box-sizing: border-box`, so a stretched chip fills the ~42px CONTENT box while the border box
    reads 44px, and `chip < row` stays true (R7).
  `clientHeight` excludes the border, so a stretched chip equals it and the assertion flips.
- `size-4` on the spinner: assert its measured box is 16×16 within 0.5px. Deleting `size-4` lets
  Lucide fall back to 24×24 (lucide-react ships a 24x24 default in its `defaultAttributes` module),
  which is still under the 44px row floor, so a row-height comparison cannot see it.

- `truncate` on the name span: assert its computed `textOverflow` is `ellipsis` **and** its
  computed `overflow` is `hidden`. Geometry alone does not discriminate: Tailwind compiles
  `truncate` to `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, and with it deleted
  the retained parent `min-w-0` still shrinks while the `shrink-0` chip stays inside the row, so
  row height, name-edge, chip containment, chip `white-space` and spinner geometry all stay green
  while the name paints past its allocation (R6). Additionally assert the name span's right edge
  does not exceed its parent's content-box right edge.

**A short-name fixture cannot prove the layout classes.** Height plus name-edge both survive
deleting `truncate`, `min-w-0`, `shrink-0`, or `whitespace-nowrap` when the content is short, so
4a additionally runs a LONG-name fixture at a narrow viewport and asserts: (i) the pending chip's
right edge stays inside the row's content box, and (ii) the pending chip's computed `white-space`
is `nowrap`. Without these, spec §3.6 P12 would be labelled settled while proving nothing
(R4 finding 4).

**4b — hover precedence.** Pointer over the row, pending active: computed background is the pending
background, not the hover background. Failure mode: assuming busy suppresses hover. It does not —
Tailwind emits the hover variant with no not-disabled guard, and CSS hover matches by pointer
position regardless.

**4c — focus retention AND the ring.** Focus the row, drive it to pending, then assert BOTH:

1. `document.activeElement` is still the row — failure mode: shipping `disabled`, which drops
   focus to `<body>`.
2. the focused row's computed **`boxShadow`** is not `none` — failure mode: the ring classes being
   deleted or overridden. `document.activeElement` alone cannot see that, and neither can an
   `outline` check: `focus-visible:ring-2` paints a box-shadow while Chromium draws its own
   default outline on any focused element, so an outline assertion stays green with every ring
   class removed. Copy the oracle and its rationale from
   `tests/e2e/agendaScheduleLayout.spec.ts:542-555` (R4 finding 3).

**4e — keyboard double-activation.** Focus the row, press Enter, then press Enter again while
pending; assert exactly ONE navigation request to `/auth/sign-in` (count via the route
interception already registered for detach safety). **Then reload and repeat on a FRESH, idle row
for Space** — Space must not be tested on the row Enter already left pending. R5 finding 4: a
sequential implementation would observe one request from Enter, then two Space presses on an
already-pending row, and still total one even if Space produces ZERO first activations. Each key
needs its own idle baseline: assert the first press of each key produces exactly one request and
the second produces none. This is the keyboard half of
Task 3's double-activation guard and it MUST live here, not in jsdom: jsdom does not synthesize
activation from Enter/Space (spec §3.6 P8, `keyboardClicks=0`) and this repo does not install
`@testing-library/user-event`, so a jsdom keyboard assertion is vacuously green. Without 4e the
pointer path is guarded and keyboard users still double-submit (R4 finding 2).

**4d — reduced motion.** Assert the spinner's computed `animationName` is `none` under
`emulateMedia({ reducedMotion: "reduce" })`. Failure mode caught: deleting
`motion-reduce:animate-none` — the spinner/text/ARIA assertions all still pass without it, so a
computed-animation oracle is the only thing that kills that mutant (R5 finding 7).

Under `emulateMedia({ reducedMotion: "reduce" })` the spinner renders and
`motion-reduce:animate-none` suppresses its animation, while the chip text swap and
`aria-disabled` still convey pending. Spec §4.3 requires motion never be the sole signal.

### Task 5 — transition audit

`docs/agents/writing-plans.md:9` requires listing EVERY ternary and conditional block, not just
the state pairs. `_ClaimedRowButton` has five, and each needs a declared treatment:

| # | Conditional | Treatment |
|---|---|---|
| C1 | `onClick` pending guard (early return + `preventDefault`) | not a render branch — no animation; asserted by Task 3 test 6 and Task 4e |
| C2 | lock rendered vs spinner rendered | instant swap in a shared fixed-width slot |
| C3 | chip present vs absent (empty `role`, idle only) | instant |
| C4 | chip text: `role` vs `Signing in…` | instant |
| C5 | `pageshow` listener resetting pending | instant, no exit animation |

**Falsification requirement (proof task):** add a SIXTH conditional to `_ClaimedRowButton` with no
row in the table above and show the audit failing on it. The earlier wording said "a fourth",
which was undefined — the component already has five (R4 finding 5). If the audit passes with an
undeclared branch present, it is enumerating nothing.

Enumerate every conditional branch in `_ClaimedRowButton` and assert each is animated as stated or
deliberately instant, against spec §6:

| From → To | Expected |
|---|---|
| idle → pending | instant; spinner rotation is the motion |
| pending → idle | instant, via `pageshow` |

The compound rows are **asserted in Task 4, not enumerated here** — R1 showed the original prose
claims about them were false, and a static conditional scan proves no browser behavior:

- pointer-over-row during pending → Task 4b
- keyboard focus during pending → Task 4c
- pending arriving mid-hover-transition → Task 4b covers the end state
- two different rows tapped → each owns its own state; two pending rows is accepted, not a bug

### Task 6 — retire the e2e workaround (the proof)

`tests/e2e/stage-restricted-crew-schedule.spec.ts`: collapse all three TWO-STEP sites
(`stage-restricted-crew-schedule.spec.ts:162`, `stage-restricted-crew-schedule.spec.ts:251`,
`stage-restricted-crew-schedule.spec.ts:461`) to a single direct navigation to the `?s=schedule`
URL, deleting the comment block at each.

**This is the highest-value task in the plan.** It is the only place the bootstrap fix is proved
end-to-end against a real browser and a real Google session rather than a route unit test.

**Falsification requirement (proof task):** it is self-falsifying — revert Task 1's `parseNextPath`
change and the direct navigation 403s. Record that run. If it does NOT fail with Task 1 reverted,
the two-step workaround was never load-bearing and this task proves nothing.

### Task 7 — close-out

1. **Invariant-8 dual gate.** Run BOTH halves named in `AGENTS.md` invariant 8, with their
   canonical setup gates first: the skill's context-load step (PRODUCT.md + DESIGN.md), then its
   register reference read (the brand or product register named in AGENTS.md invariant 8). Then add a `## 12` section to this plan
   containing the real marker line in the RAN form with actual counts, and record findings +
   dispositions there. The half-names and the marker land in this same commit (§0.3).
2. **Whole-diff cross-model review to APPROVE, INCLUDING any repair commits it forces.** This runs
   BEFORE the ledger graduation, not after. R2 finding 6: an earlier ordering made the graduation
   "the last commit before the PR" and then put review after it, so any ordinary review repair
   would land later and break that rule. Review first; repair until APPROVE; only then graduate.
3. **Graduate TWO backlog entries** (`BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED`,
   `BL-PICKER-CLAIMED-ROW-PENDING-STATE`) to `BACKLOG-archive.md`. **Do NOT graduate
   `BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT`** — it stays OPEN and is AMENDED in place with the
   refuted-premise correction from spec §1.3, so a known-false cause is not re-filed as fact.
   Also correct the dangling
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
- [ ] Task 3 — `_ClaimedRowButton` + pending state + `SANCTIONED` allowlist entry
- [ ] Task 4 — real-browser proof in `picker-flow.spec.ts` (4a–4e, including the 4e keyboard case)
- [ ] Task 5 — transition audit
- [ ] Task 6 — retire the e2e workaround
- [ ] Self-review
- [ ] Adversarial review (cross-model)
- [ ] Task 7 — close-out (invariant-8 dual gate, whole-diff review, ledger commit, merge)

---

## 12. Close-out — invariant-8 dual gate

impeccable-gate: critique=RAN audit=RAN p0=1 p1=3 dispositions=recorded

Both halves run against the UI diff (`_ClaimedRowButton.tsx`, `_PickerInterstitial.tsx`) with the
canonical setup: context load (PRODUCT.md + DESIGN.md), then the `product` register reference — this
surface is app UI serving the product, not a brand surface.

**Critique 20/40 · Audit 14/20** (a11y 2 · perf 3 · responsive 3 · theming 3 · anti-patterns 3).

### Findings and dispositions

| Sev | Finding | Disposition |
|---|---|---|
| P0 | Pending never exited. Re-tapping was the recovery for a sign-in that never lands, and the double-submit guard removed it, so a hung hop left the row permanently inert. | **Fixed** — pending self-clears after `PENDING_TIMEOUT_MS` (8s), covered by a fake-timer test. A real navigation replaces the document long before 8s, so this cannot re-open the double-submit window. |
| P1 | No live region; the flip was silent to assistive tech. `aria-busy` is weakly supported (WCAG 2.2 SC 4.1.3 Status Messages). | **Fixed** — `sr-only role="status" aria-live="polite"` announcing the transition, with a test. |
| P1 | Pending chip had no container: `bg-surface-sunken` chip on a `bg-surface-sunken` row is **1.00:1**, and it is the load-bearing signal. | **Fixed** — own fill plus a boundary. Text 4.91:1 (light) / 8.03:1 (dark); border 5.02:1 / 8.21:1 against the row. Computed, not estimated. |
| P1 | `aria-label` on a span with an implicit `generic` role is dropped by AT (ARIA 1.2), so the lock hint reached nobody. | **Fixed** — glyph is `aria-hidden`, hint moved to an `sr-only` sibling. |
| P2 | Right column reflowed on tap — the name lost 94px (roleless) at 360px. | **Fixed** — `min-w-24` reserves the column. |
| P2 | `motion-reduce` froze `Loader2` mid-arc, which reads as stuck. | **Won't fix, with reason.** `motion-reduce:hidden` was tried and reverted: the crew-e2e context runs entirely under `reducedMotion: "reduce"`, so hiding the spinner both blinds every geometry oracle in CI and leaves the chip text as the ONLY signal for reduced-motion users. Stopping the animation keeps a second, static signal alongside the words. Whole-diff R3 caught the CI break. |
| P3 | Emoji lock vs vector spinner is an unmatched icon idiom; platform emoji is theme-invariant. | **Deferred** — the plain-glyph choice is pre-existing and ratified in `_PickerInterstitial`'s own comment (DESIGN.md §8 restraint call). Changing it is a design decision beyond this diff's scope. |
| P3 | Both chip states share one `data-testid`. | **Won't fix** — deliberate. They are one slot in two states, and the tests assert on its text, which is what distinguishes them. |
| P3 | ~421B of static class strings serialized per claimed row (~12.3KB at 30 rows). | **Deferred** — `rowClassName`/`chipClassName` are computed server-side precisely so the island holds no role-flag logic. Hoisting them inverts that. Real but small; not worth the coupling here. |
| P3 | One `window` `pageshow` listener per row. | **Deferred** — bounded by roster size, and lifting it needs shared state across rows, which buys nothing at this scale. |

**Refuted during the gate, recorded so a later reviewer does not re-derive them:** the
hover-vs-pending cascade concern (the compiled `aria-disabled` rule emits after `hover:`, and
`@media (hover: hover)` gates it further — e2e 4b confirms in a real browser); and
`text-subtle`/`surface-sunken` at 6.09 / 6.94, which is a ratified pinned AA pair. The 44px tap
floor passes.
