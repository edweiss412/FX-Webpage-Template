# AnchoredPortal: the converged measure count on an open transition

**Row:** `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`
**Branch:** `perf/anchoredportal-measure-convergence`
**Probe evidence:** appendix A of this document.

`components/admin/AnchoredPortal.tsx` runs `measureAndApply` three times for one
closed to open transition. Two of those three are the design working; one is
not. This spec states which, what the count becomes, and what pins it.

## 1. The converged count is 2

### The three measures, named once and used with these names everywhere

| Name | Effect | Commit |
| --- | --- | --- |
| **A** | the gated effect's own call (`components/admin/AnchoredPortal.tsx:199`, the gated effect, whose own call this arc removed) | open commit |
| **B** | the ungated every-commit effect | open commit |
| **C** | the ungated every-commit effect | the settle commit after the placement |

**The repair deletes A**, leaving B as the pre-paint placement and C as the
ungated effect's first evaluation after it. The count goes 3 to 2.

A and B are byte-for-byte the same computation on the same DOM (§2.2), so
exactly one of the two is redundant and which one is deleted is a design choice,
not a derivation. A is chosen because deleting it leaves the unconditional
effect as the only measurer of the open commit, so the pre-paint guarantee rests
on ONE effect being a `useLayoutEffect` rather than on two effects' declaration
order. The absent dependency array is what makes that effect fire on the
POSITION-ONLY re-renders of §2.1; it is not what makes the open commit pre-paint,
and an earlier draft of this section said otherwise while §3 said it correctly.

**The count is scoped, and both qualifiers belong in the claim rather than in a
footnote: it counts the measures REACT COMMITS DRIVE, as observed in the jsdom
harness.** A real browser adds at least one more. `new ResizeObserver(schedule)`
observes the anchor and the panel on open
(`components/admin/AnchoredPortal.tsx:236`, the ResizeObserver subscription),
and an observer delivers an initial callback on `observe`, which schedules a
further measure through the rAF coalescer. jsdom's `ResizeObserver` is a no-op
stub (`tests/setup.ts:70-81`), which is precisely why the harness can count the
commit-driven measures in isolation — and precisely why this figure must never
be read as a browser total. It is a property of the component's commit
behaviour, not of a menu opening in Chrome.

**2 is also the converged count UNDER THE CURRENT NOTIFICATION MECHANISM, and is
not claimed to be a floor over all mechanisms.** An earlier draft of this spec
claimed 2 was FORCED. Review refuted that (§2.1), and the claim is withdrawn
rather than softened, because a guard pinning 2 while the spec claims a floor of
2 would pin a number one above a bound nobody should still believe.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| The ungated every-commit effect is a named invariant of the design, not a redundancy. It is the only shipped subscription that catches a position-only anchor move. | `components/admin/AnchoredPortal.tsx:252-260` (the rationale comment above the ungated effect); INV-2 |
| Of the two open-commit measures A and B, exactly one is redundant, and that is analytic rather than measured. A is the one deleted. | §2.2, §1 |
| `IntersectionObserver` does not replace measuring per commit, in either its plain or self-rearming form. ONE reason survives review; two were struck. | §2.3 |
| `MutationObserver` could plausibly reach a count of 1. It is NOT REFUTED. It is not taken, for scope. | §2.4 |
| INV-1 is pinned in the browser, never in jsdom, and the reason is measured. | §5 |
| The `useFitWithinClip` measure-class work is merged and its count is closed. This arc does not touch `components/admin/useFitWithinClip.ts`. | Row, class-sweep exception (c) |
| The repair removes a MEASURE, not a placement. | §4, INV-4 |

## 2. Why the count is 2

### 2.1 What review refuted, and what survives

The refuted claim, stated so it is not re-derived: an earlier draft argued that
C could not be removed because "nothing distinguishes" the commit after the
open placement from a refresh that reordered the rows without a measurement.
**That is false.** A `MutationObserver` distinguishes them without measuring: a
row reorder emits a `childList` record, while the placement follow-up mutates
only the portal's own `style` attribute and is filterable on its target. Its
callbacks are microtasks, so unlike `IntersectionObserver` they run before the
rendering update and CAN carry a pre-paint correction.

So the honest statement is narrower. `ResizeObserver` reports SIZE — its
`contentRect` origin is relative to the element's own padding box, so a pure
translation of the anchor changes nothing it observes — and among the
subscriptions this component actually has, the ungated effect
(`components/admin/AnchoredPortal.tsx:261`, the ungated every-commit effect) is
the only one that catches a position-only move. It catches one by running on
every commit and measuring, and the commit after the open placement is an
ordinary commit that it cannot classify without measuring.

**The floor is 2 because it has two independent halves, and neither can be
dropped without losing a guarantee this component already makes.**

1. **At least one measure must land IN the open commit**, forced by the pre-paint
   guarantee. The panel's first painted frame has to be at its final placement;
   any mechanism that measures after that frame reintroduces the visible jump
   this component exists to avoid, which is the same objection that kills
   `IntersectionObserver` in §2.3.
2. **At least one measure must land AFTER the settle commit**, forced by the
   position-only case argued above. `ResizeObserver` cannot see a translation, so
   the every-commit subscription is the only one that catches it, and it cannot
   tell the settle commit apart from a real anchor move without measuring.

The two are in different commits, so they are different measures, and 1 + 1 = 2.
Under THAT mechanism the count cannot go below it.

### 2.2 One of A and B is redundant, by construction

A and B both land in the open commit: the gated effect
(`components/admin/AnchoredPortal.tsx:199`, the gated effect) and the ungated one.

Nothing mutates the DOM between them. No re-render intervenes, nothing paints,
and the only style writes either makes are `withNaturalSize`'s cap clear
(`lib/popover/naturalSize.ts:39-40`) and its restore
(`lib/popover/naturalSize.ts:68-69`), which cancel inside each call. B's inputs
are therefore identical to A's BY CONSTRUCTION, the two compute the same
placement, and `commit` (`components/admin/AnchoredPortal.tsx:115`) drops the
second of them.

This is analytic rather than measured, and this arc's own probe is consistent
with it: `measureRunsOnOpenCommit=3` (appendix A.1) is what two same-commit
measures plus one post-settle measure produce, and no other decomposition of
three fits the effect structure. Review confirmed the mechanism independently —
React walks both layout hooks contiguously from the component's effect list, and
the layout-effect state update flushes after the current commit phase, so no
in-scope DOM mutation or render can interleave — and that confirmation is
recorded as corroboration rather than as the claim's only support.

### 2.2.1 Yes, the count test freezes 2 as a contract, deliberately

The design critique asked it directly: if two measures per open is still one more
than strictly needed, what makes the second load-bearing, and does INV-3 now
freeze that number as a contract?

**It does, and that is the intent.** C is not a spare measure kept for safety. It
is the ungated effect's first evaluation after the placement, and that effect is
the position-only guarantee (§2.1) — the same code path, not a second copy of it.
Freezing the count at 2 therefore pins that the guarantee still evaluates exactly
once per open, which is precisely what a future optimization would break by
gating the effect.

The number is not permanent, and the route to changing it is named rather than
left to be rediscovered: reaching 1 requires the `MutationObserver` redesign in
§2.4, which is conceded as plausible and declined for scope. An arc that takes it
updates INV-3's expected count in the same commit that changes the mechanism, and
the count test failing is how that arc learns it has changed the mechanism.

### 2.3 IntersectionObserver, killed on one reason

Two forms were considered. Of the three reasons an earlier draft gave against
the stronger form, **two were struck and one survives.** The survivor is
sufficient, and the struck pair is recorded in this arc's review-round filing
rather than deleted, so neither is re-derived.

**Plain `IntersectionObserver` on the anchor, rooted at the viewport, with any
threshold list.** IO fires on threshold CROSSINGS, not on geometry change. A row
reorder that moves a fully-visible anchor 40px down holds `intersectionRatio` at
exactly 1.0 before and after, so no threshold is crossed and no callback fires.
That is the guarantee's own case, so this form is dead on the first move it
would need to catch.

**The self-rearming position observer** (the sticky-header technique): compute
`rootMargin` from the anchor's current rect so the element sits exactly at the
root boundary, so any movement crosses it; on each fire, re-measure and re-arm.
This defeats the ratio-stays-1.0 objection by construction, and it still fails,
for one reason:

- **It cannot deliver a pre-paint guarantee.** IO queues its callback to run
after paint, by construction. The ungated layout effect re-places in the same
commit, before paint. An after-paint mechanism reintroduces exactly the defect
`components/admin/AnchoredPortal.tsx:252-260` (the rationale comment above the
ungated effect) describes, for one frame: the panel visibly belonging to a
different row. This is a correctness argument, not a performance one.

Two further reasons were drafted and withdrawn; the review-round filing records
them and why. A soft reason is a liability rather than a margin of safety.

### 2.4 MutationObserver: not refuted, not taken

Review identified `MutationObserver` as a mechanism that could plausibly reach a
count of 1, by the argument in §2.1. **It is recorded as NOT TAKEN FOR SCOPE, and
explicitly NOT as refuted.**

The row this spec closes is about three measures per open on a shipped admin
surface, and 3 to 2 delivers that. Going 2 to 1 is a redesign of the
NOTIFICATION MECHANISM rather than a removal of a redundant call: a
document-wide subtree observer, a filter deciding which records are
anchor-moving, and microtask timing interleaved with React's own scheduling.
None of those costs is established, and the filter in particular is a recognizer
over an open input space — the shape that grows one corner per review round.

**Re-file trigger:** someone willing to redesign the notification path, with the
document-wide observer's cost measured on the shows dashboard first.

## 3. The repair

Delete the gated effect's own `measureAndApply()` call
(`components/admin/AnchoredPortal.tsx:199`, the gated effect, whose own call
this arc removed). The ungated effect becomes the sole measurer OF THE OPEN
COMMIT — not the only caller of `measureAndApply` in general, since the
coalescer the gated effect creates invokes it on every scroll, resize and
`ResizeObserver` frame. The gated effect keeps its subscription wiring and
teardown unchanged.

**Rejected alternative: a ref flag** set by the gated effect and cleared by the
ungated one. It reaches the same count of 2, but only while the gated effect is
declared FIRST, which is the silent declaration-order coupling the row warns
against, and it adds state in order to remove a call.

**The pre-paint guarantee after the repair** rests on the ungated effect being a
`useLayoutEffect`. A passive effect would place after paint and return the
one-frame wrong-row defect. That property is pinned by INV-1, in the browser,
for the reason §5 gives — NOT by the dependency-array claim an earlier draft made
here, which was false: a complete dependency array still runs on the open commit,
so it does not defeat pre-paint at all.

## 4. Invariants

| Id | Invariant | Deciding case | Mutant that reds it |
| --- | --- | --- | --- |
| INV-1 | The placement is applied before paint | `PROBE:` in `tests/e2e/rowactions-geometry.spec.ts`, frame-ordering | make the sole measurer a `useEffect` |
| INV-2 | An anchor that moves without changing size re-places the panel | `tests/components/admin/rowActions/anchoredPortal.test.tsx:266` | delete the ungated effect |
| INV-3 | One closed to open transition runs `measureAndApply` exactly twice | jsdom measure counter | restore the gated effect's `measureAndApply()` call |
| INV-4 | The repair removes a measure, not a placement | `PROBE:` placement sequence | any change to the applied placement tuple |

**INV-1 and INV-4 are demonstrably not redundant, and the artifact exists rather
than the argument.** Under the passive-measurer plant, INV-1 red — mount at frame
2, placement at frame 3 — while the placement sequence stayed
`["0px|0px||", "695px|1251.47px||"]` and INV-4 stayed GREEN. A mutant that
defeats one pin while leaving the other passing settles the question of whether
either subsumes the other, which is why INV-1 needs its own case.

**Execution status, GENERATED from sweep output rather than authored.** An
earlier draft of this section asserted that every mutant here had been executed
when only one had — twice, in two consecutive rounds. Remembering the rule did
not work, so the table below is emitted by a script reading the sweep's result
files, which makes the claim unwriteable ahead of the run that produces it.

**Generated against `tests/e2e/rowactions-geometry.spec.ts` as of `852771a8e`.**
The stamp tracks the FILE, so a comment-only commit bumps it too — conservative
by choice, since over-invalidating is the safe direction. Re-derive it with `git
log -1 --format=%h -- tests/e2e/rowactions-geometry.spec.ts` and compare. A
generated table is a SNAPSHOT OF A CODE STATE, not a self-maintaining record:
once the code moves it lies with the authority of having been generated. This
one already did — an earlier version recorded the `with.args` and `echo` inputs
as RED against a role-aware implementation that was then deliberately narrowed
away, which asserted the OPPOSITE of shipped behaviour. The sha makes staleness
visible instead of silent: compare it to the head before trusting a row.

Rows are marked by what the shipped code SHOULD do. A documented limit that
passes looks identical to a guard that failed, so the two are distinguished here
rather than left to the reader.

| Assertion | Mutant | Expected | Observed |
| --- | --- | --- | --- |
| a list-item line bearing the component path is present | delete the line | RED | **RED** |
| the invocation token is present | delete the spec from the run line | RED | **RED** |
| workflow guard, list item under a NON-paths key | the path as a list item under `sparse-checkout` | PASS by design | **GREEN** |
| workflow guard, invocation replaced by `echo` | `run: echo playwright test …` | PASS by design | **GREEN** |
| B2/B3 origin premises | never place | RED | **RED** |
| B5 right-edge alignment | `left + 1` | RED | **RED** |
| B7 adjacency on the REPORTED side | invert the reported side | RED | **RED** |
| B9 a fitting panel carries no cap | non-binding `maxHeight` | RED | **RED** |
| B13 placement lands at the mount's frame | passive measurer, repair applied | RED | **RED** |
| INV-3 the commit-driven measure count | first measure commits a wrong placement, BOTH commit branches | RED | **RED** |
| **B4 exactly one settled placement** | **none found** | — | see below |

The two PASS-by-design rows are the narrowing working, not a gap: they are the
documented limits of §9.1, and a guard that reded them would be the recognizer
this arc declined to grow.

**B4 has no discriminating mutant, and the reason is worth more than a clean
number.** Three were attempted and each is recorded rather than dropped: an extra
placement committed on a `requestAnimationFrame`, one on `setTimeout(50)`, and one
on `setTimeout(0)`. None reded B4. The `setTimeout(50)` attempt was INVALID —
its effect landed after the probe's two-frame observation window closed — but the
other two were in-window and still produced no extra entry, because the ungated
effect measures on the resulting commit and corrects the wrong placement inside
the SAME observer batch. The sequence never gains an entry.

So the guard set has two coverage regions and each has an owner:

1. **B4 owns settled placements separated by a microtask checkpoint.** It is
   batch-blind to an extra placement inside one task, by construction of the
   batch grain chosen in §5.1 — and no mutant of that kind was constructible
   here, because the design self-corrects within the task.
2. **INV-3 owns the COST of exactly that invisible case.** An extra placement
   commits state, which re-renders, which fires the ungated effect, which
   measures again — so the anchor-read count goes 2 to 3 even where the
   placement sequence does not move. Proven, not predicted: the mutant above
   reds with `expected 3 to be 2`.

**The failed attempts are themselves a positive result, and this is the statement
to keep.** They are not a third coverage region — they are the reason the first
one is hard to attack. They did not merely fail to be built: TWO of them
   committed a genuinely wrong placement and the ungated effect MEASURED on the
   resulting commit and corrected it, inside the same task. So the reason B4 is
   hard to defeat is that the code prevents the defect B4 guards — the
   every-commit effect that exists for position-only moves also repairs a stale
   placement from any source, before it can settle.

   Scoped to what was observed: two injections, both synthetic, both corrected
   within the task. The third attempt (`setTimeout(50)`) landed outside the
   probe's window and is evidence of nothing. This is not a proof that no stale
   placement can ever survive; it is why no mutant of this shape was
   constructible here.

A reader who sees "B4: no mutant" would conclude it is untested. It is
scope-limited with a named compensator that has a red to show for it, and the
missing mutant is partly a property of the design rather than a gap in the
suite.

**The two pins also exercise different code paths, which is characterisation
rather than defect.** jsdom's stubbed rects make `placeWithinVisibleViewport`
return `kind: "hidden"`, so the jsdom count case runs the degenerate FALLBACK
commit branch (`components/admin/AnchoredPortal.tsx:157-178`) while the live
`PROBE:` case runs the placed branch. The count is a property of the effect
structure rather than of which branch computes the placement, so both are valid
counts — but a mutant on only one branch is inert against the other, which is how
two earlier attempts at the INV-3 mutant came back green.

**Design-alternative rejections in §2.3 and §3 are ARGUMENTS, not executions.**
There is no mutant for "IntersectionObserver instead of a layout effect" or "a
ref flag instead of a deletion"; those rest on cited engine and framework
behaviour, which a reviewer checks by reading the citation.

## 5. Why INV-1 cannot live in jsdom

Measured, not argued. With the repair applied AND the sole measurer changed from
`useLayoutEffect` to `useEffect`, a jsdom assertion that the panel is placed
immediately after `render()` STILL PASSES (`top=250px`, expected `250px`).
Testing Library's `act` flushes passive effects synchronously before `render()`
returns, so jsdom cannot discriminate `useEffect` from `useLayoutEffect`.

The consequence generalizes beyond this arc: **any jsdom pin on pre-paint
behaviour is a tautology by construction.** It is not that one mutant was chosen
badly; every mutant is orphaned in that environment. Such a pin is green for the
wrong reason forever, which is worse than a missing pin because it reads as
covered.

INV-1 therefore lives in the browser, where the discriminator is frame ordering:
microtasks run before the rendering update, so a placement applied in the commit
that mounts the panel is observed at the same animation-frame count as the mount,
and one applied after paint cannot be. The case states that as an executable
premise on the instrument itself — a counter that never advanced would make the
comparison true for every implementation — before asserting anything with it.

## 5.1 What counts as one placement, and what counts as one measure

Both counted units are defined here, because a count whose unit is ambiguous
reds on a refactor that changes nothing observable.

**One placement is one CALLBACK BATCH's settled state.** React assigns each
changed style property separately, so a single placement emits one
`MutationRecord` for `left` and another for `top`, and the intermediate
`left: 695px; top: 0px` is a half-applied write rather than a state the panel was
ever laid out at. The ratio of records to placements is not even fixed: a
placement changing only `top` emits one record. A batch ends at a microtask
checkpoint, so its end state is a settled commit, and the half-applied value
correctly counts as neither a placement nor an extra one. Coalescing records
within a task would be the wrong grain in the other direction, since one task can
contain several checkpoints.

**One measure is one anchor-rect read**, because `measureAndApply` reads the
anchor exactly once (`components/admin/AnchoredPortal.tsx:141`). INV-3's case
establishes that 1:1 relation on its own inputs before counting with it, rather
than assuming it.

### Documented limits of the counting instrument

- **One batch is assumed to be one settled commit.** Two React commits flushed
  synchronously with no intervening microtask checkpoint would land in a single
  batch and count as one. This is REACHABLE here rather than theoretical: a
  layout-effect `setState` triggers a synchronous re-render inside the same task.
  The consequence is bounded and stated: INV-4 detects a change in the FINAL
  applied placement, and extra placements separated by a checkpoint. It does not
  distinguish a converged pair of commits from a single commit within one task.
  The convergence claim does not rest on it — that is analytic (§2.2).
  **Status: INFERRED FROM REACT'S SYNCHRONOUS FLUSH, NOT PROBED.** The probe that
  would settle it: force C to compute a different placement and observe whether
  its write shares a batch with B's.
- **The half-applied write is never painted, and this IS probed.** On the clean
  tree the held sequence has exactly two entries, so exactly one callback batch
  carried both the `left` and the `top` write, and the mount and the placement
  were observed at the same animation-frame count. The intermediate therefore
  exists only between two synchronous property assignments inside one task, with
  no rendering opportunity between them. There is no visible half-placed frame.

## 6. Guard conditions

The repair adds no prop and changes no signature. The guards it touches:

- `open === false` or `mounted === false`: the ungated effect returns before
measuring (`components/admin/AnchoredPortal.tsx:262`, the ungated effect's
open/mounted guard). Unchanged.
- `anchorRef.current === null` or `panelRef.current === null`:
  `measureAndApply` returns early (`components/admin/AnchoredPortal.tsx:131`).
  Unchanged, and now reached from one caller instead of two.
- A placement that cannot be computed still commits a fallback rather than
  hiding (`components/admin/AnchoredPortal.tsx:157-178`). Unchanged.

## 7. Dimensional invariants

N/A. The repair introduces no fixed-dimension parent with flex or grid children,
and changes no class.

## 8. Transition inventory

States: closed (renders nothing), open-unplaced (the origin, one commit long),
open-placed. The repair changes none, adds none, and applies no animation.

| Pair | Treatment |
| --- | --- |
| closed → open-unplaced | instant; the panel mounts at the origin for one commit and is placed before paint (INV-1) |
| open-unplaced → open-placed | instant; a style write, no transition |
| open-placed → closed | instant; the panel unmounts and `setApplied(null)` clears the placement (`components/admin/AnchoredPortal.tsx:267-270`, the close-reset effect) |

Compound: a position-only move arriving while the panel is open-placed re-places
it instantly (INV-2). No transition has a duration, so there is no mid-transition
state to interrupt.

## 9. Documented limits

- **A count of 1 may be reachable via `MutationObserver`.** §2.4. Not refuted,
  not taken, re-file trigger recorded there.
- **Pre-paint behaviour is not pinnable in jsdom at all.** §5.
- **The mutation harness cannot run this surface.**
  `tests/mutation/source/mutantOverlay.config.ts` declares `setupFiles` zero
  times, while the repo-root vitest config declares `setupFiles: ["tests/setup.ts"]`
  and `tests/setup.ts:70-81` polyfills `ResizeObserver` because jsdom lacks it.
  UNMUTATED source therefore fails its clean baseline with
  `ReferenceError: ResizeObserver is not defined`, and a surface that cannot pass
  a clean baseline cannot be enrolled. There is no per-run escape: `vitest` has
  no `--setupFiles` flag, so the fix could only be a shared-config edit changing
  the harness for all 56 enrolled surfaces at once. Not taken by this arc.
  **Re-file trigger:** a product arc actually BLOCKED from shipping by this, not
  merely re-shaped by it.
- The live probe does NOT establish that C agreed with B; the batch grain cannot
  separate two commits flushed in one task (§5.1, §A.2). It establishes that one
  settled placement appears on the shipped right-aligned dashboard menu at
  1280x720 and that it is geometrically correct against its anchor. The repair
  does not rest on more than that: the A-and-B redundancy is analytic (§2.2), and
  C — the measure that would catch a disagreement — is the one that stays.

## 9.1 Limits of the live pins

**What is lost if that coverage stops is larger than a second opinion.** The
jsdom count case runs the DEGENERATE fallback branch, because jsdom's stubbed
rects make the placement core return `kind: "hidden"` (§4). So the live `PROBE:`
case is not belt-and-braces for it — it is the ONLY pin in this arc that
exercises the real placed branch at all. If `admin-layout-e2e.yml` stops firing
on this component, the loss is every assertion about actual placement, not a
duplicate of something jsdom already covers.

**The pins' CI coverage rests on one unguarded line.** `admin-layout-e2e.yml:64`
lists `components/admin/AnchoredPortal.tsx` under the workflow's
`pull_request.paths`, which is what makes INV-1 and INV-4 run on a PR touching
this component. (What this arc's check verifies is narrower than that fact — see
below.) That
fact is true and was verified directly. **Nothing in the repo pinned it. This arc
pins it NARROWLY** — presence of the entry and of the invocation token, with the
limits below — see the presence-not-invocation paragraph later in this section.
`tests/ci/_metaE2eWorkflowCoverage.test.ts:260` asserts that every e2e SPEC is
PR-covered or allowlisted; it makes no claim about which SOURCE paths a
workflow's filter names, and the `AnchoredPortal` text at
`tests/ci/_metaE2eWorkflowCoverage.test.ts:138` is a comment rather than an
assertion. So deleting that one line would leave this gate dark against the exact
file it guards — the class that workflow's own header was written about.

Recorded rather than pinned: the guard would be a one-line walker over one file
whose done condition is a property of the walker, which is the shape the
2026-08-25 process mint freeze declines. **Re-file trigger:** the line is
actually deleted, or a second arc finds its own gate dark the same way.

**The workflow check proves PRESENCE, not that GitHub will run the spec.** Two
successive whole-diff rounds defeated attempts to approximate the stronger claim,
each with one more grammar feature, so the claim is narrowed to what the check
actually decides: `components/admin/AnchoredPortal.tsx` still appears as a paths
entry, and `tests/e2e/rowactions-geometry.spec.ts` still appears in a `run:` line
next to `playwright test`. That catches the realistic failure — somebody deletes
one of them — which is the failure this arc's threat fence declares.

Inputs that defeat it exist, and they are DOCUMENTED LIMITS rather than gaps to
close: each is an adversarial construction rather than an ordinary authoring
mistake, which places it outside the declared threat fence, and deciding any of
them correctly would need a YAML parser, GitHub's path-matching semantics and a
shell parser. That is a recognizer over an open grammar, which the
repair-direction rule declines by design. The specific constructions are named in
the review-round filing rather than here, deliberately: a list of four ways past
a guard is an attack menu, and the spec's job is to state what the check decides,
which the paragraph above does.

**Cap VALUE is now asserted, and this paragraph records what changed.**
Membership in the placement key only ever caught a cap that CHANGED
mid-sequence; a wrong-but-constant cap preserved the geometry and passed.
Whole-diff review named that, and the `PROBE:` case now asserts that a panel
which FITS carries no cap at all, with the fit stated as an executable premise.
The reasoning below is why the oracle is a contract property rather than a
re-derivation of the placement algebra. Checking the value would need the
placement algebra as its oracle, and re-deriving that in the test would pass
whenever the test and the code share a mistake — the tautology this arc has been
removing rather than adding. The fixture also applies no cap at all (`maxH=none`
in every recorded run), so asserting emptiness is exactly the right expectation
here, and it discriminates: the non-binding wrong cap mutant reds it (B9 above).
Cap behaviour is exercised by the containment and flip cases in the same spec.

## 9.2 Documented coverage boundary: one of the two render sites

`AnchoredPortal` is rendered from exactly one file, at two sites, both in
`components/admin/ShowRowActions.tsx`: the row menu
(`components/admin/ShowRowActions.tsx:661`) and the preview submenu
(`components/admin/ShowRowActions.tsx:961`). `ReSyncButton.tsx` and
`PublishedToggle.tsx` name the component in comments only; both compose
`placeWithinVisibleViewport` directly, so neither is a consumer.

**The browser pins (INV-1, INV-4) select `[data-testid^="row-actions-portal-"]`,
which matches the row menu and NOT the submenu.** The submenu's id begins
`row-action-preview-portal-`, a different prefix rather than a longer one, so the
selector cannot match it. This is a decision, recorded here so it is verified
rather than discovered.

**It is safe because the sites do not differ anywhere the property lives.** Both
pass `align="right"` and `preferredSide="bottom"` — identical, not merely
similar — so `measureAndApply`'s dependency list
(`components/admin/AnchoredPortal.tsx:186`) differs only in the ref. Both
placement effects branch on nothing but `open` and `mounted`, and
`measureAndApply`'s branches are on a missing anchor or panel ref
(`components/admin/AnchoredPortal.tsx:131`) and on `placement.kind`
(`components/admin/AnchoredPortal.tsx:157`), with `align` selecting the fallback's
horizontal edge inside the second. None of the three is a per-SITE branch: both
sites pass the same `align`, and the ref and placement branches are computed at
run time from geometry rather than from which site rendered.
There is no site-dependent branch anywhere in the timing path, so the pre-paint
property is a property of the component and one site establishes it. INV-2 and
INV-3 are asserted against the component in jsdom, which is the level the repair
lives at.

One difference does exist, and it argues for the ungated effect rather than
against this boundary: the submenu's anchor is a button INSIDE the row menu's
portal panel, so the submenu is a portal whose anchor sits inside another portal,
and any re-place of the row menu moves that anchor without resizing it. That is
a second, nested instance of the position-only move INV-2 covers.

## 10. Out of scope

- `components/admin/useFitWithinClip.ts` (a sibling arc's file; merged work).
- Synthetic DOM mutation outside React.

## Appendix A — probe transcripts

Task 1's evidence, kept in this document rather than a sibling so the two cannot
drift. Run on branch `perf/anchoredportal-measure-convergence` at base
`66c9857f5`.

### A.1 The count, in jsdom

The portal rendered closed, then re-rendered open, counting anchor-rect reads.

```
PROBE closedReads=0 measureRunsOnOpenCommit=3 panelReads=3 settled=(884px,250px) maxH=none
```

`closedReads=0` is the closed-renders-nothing contract holding.
`measureRunsOnOpenCommit=3` reproduces the filed claim at the head this arc
repairs, rather than inheriting it from the filing. `panelReads=3` is the cost
the row names: three `withNaturalSize` passes, so three forced synchronous
reflows per menu open.

### A.2 Whether the three agree, on the live surface

jsdom cannot answer this: it computes no layout, so the three runs are fed
identical stubbed inputs by construction.

```
PROBE-LIVE styleWrites=2 placements=2 sequence=["0px|0px||","695px|1251.47px||"]
```

One settled placement is applied, and it is the placement the panel keeps.

**This does NOT establish that C agreed with B**, and an earlier draft said it
did. The batch grain cannot separate two React commits flushed in one task
(§5.1), so a disagreeing C would have been absorbed into the same batch and
reported as one settled state. What the probe establishes is narrower and is
what INV-4 actually needs: exactly one settled placement appears, the panel keeps
it, and it is geometrically correct against its anchor.

### A.3 The browser instrument, proved before it was trusted

Clean tree: mount frame 2, placement frame 2, green. Planted with the passive
measurer: `mount was at frame 2 and the placement at 3, so a rendering update ran
in between`, red. Plant reverted and `AnchoredPortal.tsx` verified byte-identical
to `HEAD`.
