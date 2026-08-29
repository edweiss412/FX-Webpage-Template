# Tasks P1-P6 — settle the UNRATIFIED claims before building on them

Each task maps to exactly one row of spec §1.4. Each ends with the spec amended: either the
claim is ratified with the probe cited, or it is corrected and the feature tasks are
re-planned. **No feature task starts until all six have run**, because U-1 through U-3 each
change the shape of the control and U-5 changes what the class defense is.

## Acceptance criteria

- AC-P1 The probe establishes, in a real browser, where focus goes when the focused retry
  control gains native `disabled` versus `aria-disabled`. (discharged by Task P1)
- AC-P2 The probe counts asset requests across `retrying → idle` for both the separate-node
  and same-node shapes. (discharged by Task P2)
- AC-P3 The probe establishes whether a retry image under an overlay issues its request at
  the `loading` default. (discharged by Task P3)
- AC-P4 The probe establishes whether the requested URL can leave the ladder when viewport
  and DPR change between failure and retry. (discharged by Task P4)
- AC-P5 The registry meta-test fails on a planted unclassified declaration of each shape the
  old grep missed. (discharged by Task P5)
- AC-P6 No render observes retained session state after an item goes unavailable or leaves
  `items`. (discharged by Task P6)

<!-- tasks: depth=2 red-contract -->

## Task P1 — does a native `disabled` eject focus from this control?

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/diagram-retry-focus-probe.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:416` why=`the placeholder is a non-interactive div, so there is no control to focus and no attribute to toggle` ac=AC-P1 -->

**What is red and why.** The spec's fixture renders a failed cell with a focusable control
and toggles the attribute. It fails because `Gallery.tsx:416` renders a `<div>` with nothing
focusable in it.

**What it must discriminate.** Not "focus is somewhere reasonable" — the probe focuses the
control, applies each attribute in turn, and reads `document.activeElement` after each. Both
arms run: the `disabled` arm is the one expected to eject to `<body>`, and the
`aria-disabled` arm is expected to keep focus. A probe that only ran the second would report
success without establishing that the first is a real hazard, which is the whole claim.

Evidence, not proof, going in: `components/admin/RecentAutoAppliedStrip.tsx:371-380` records
this behaviour for a different control on a different surface.

**Outcome.** Spec §7.1 and U-1 amended with the observed result and this probe cited.

## Task P2 — does a separate in-flight node cost a second GET?

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/diagram-retry-request-count.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:398` why=`there is no retry path, so no transition exists across which requests could be counted` ac=AC-P2 -->

**What is red and why.** The probe drives a failure, taps retry, and counts requests for the
asset across the transition. It fails because no retry path exists.

**What it must discriminate.** The probe builds BOTH shapes behind a fixture flag: the
separate-node shape the spec rejected, and the same-node-with-overlay shape it specifies. It
asserts 2 requests for the first and 1 for the second. Asserting only the second would leave
the rejection unproven, and the rejection is what §4.0.5 rests on.

Request counting is via `page.route`, already used in six specs here (e.g.
`tests/e2e/published-review-modal.prefetch.spec.ts:115`), matching the diagram asset path.

**Outcome.** Spec §4.0.5 and U-2 amended. If the separate-node shape costs one request after
all, §4.0.5's constraint is dropped and Task 3 simplifies.

## Task P3 — does a covered retry image load at the `loading` default?

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/diagram-retry-load-eligibility.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:398` why=`the thumbnail Image sets no loading prop and there is no overlay to cover it, so the covered-lazy case cannot be constructed` ac=AC-P3 -->

**What is red and why.** The probe renders the retry image beneath the overlay at the
`loading` default and asserts whether a request is issued. It fails because neither the
overlay nor the retry path exists.

**What it must discriminate.** Three arms, because two would not separate the causes:
default `loading` with the overlay present, `loading="eager"` with the overlay present, and
default `loading` with no overlay. If the third issues a request and the first does not, the
overlay is the cause and `eager` is the fix. If the first issues a request, U-3 is wrong and
`eager` is unnecessary.

`next/image` leaves `loading` lazy unless `priority` is set (`get-img-props`, line 271), and
neither component sets it.

**Outcome.** Spec §4.0.5 and U-3 amended.

## Task P4 — can the retry escape the ladder?

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/diagram-retry-candidate-stability.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:398` why=`with no retry there is no second request whose selected candidate could be compared against the first` ac=AC-P4 -->

**What is red and why.** The probe records the URL the browser requests on the failing
render, changes viewport and device scale factor, taps retry, and records the URL again. It
fails because there is no retry.

**What it must discriminate.** The fixture MUST carry a real multi-tier ladder — a
`variants: []` fixture cannot express a tier change, so it would report "no difference" and
prove nothing. The assertion is on the requested URLs, not on the `srcSet` attribute: the
attribute is what the app renders, and the claim is about what the browser picks from it.

Both directions are asserted: a tier change is permitted by §3's bound, an original-tier URL
is not.

**Outcome.** Spec §3 and U-4 amended. If an original-tier URL can be selected for a laddered
entry, §3's bound is wrong and §3.1's cost analysis changes with it.

## Task P5 — is the registry actually a cover?

<!-- task: red=`npx vitest run tests/components/diagrams/perItemStateLifetime.probe.test.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:122` why=`no scanner and no registry exist, so nothing enumerates the declarations and nothing can fail on an unclassified one` ac=AC-P5 -->

**What is red and why.** The probe plants declarations in a copy of each component and
asserts the scanner enumerates them. It fails because neither scanner nor registry exists.

**What it must discriminate.** The planted shapes are exactly the ones the rejected grep
missed, one per case, each planted separately so a pass cannot come from another:

1. `const [x, setX] = useState<Record<string, number>>({})` — no `Map`, `Set` or `id`
2. `const yRef = useRef({})` — an object literal
3. `const [z, setZ] = useState<ReadonlySet<string>>(() => new Set())` — a shape the grep DID
   catch, as the positive control that the scanner has not simply stopped working
4. the three real members the grep missed: `activeScale`, `requestedScaleRef`,
   `controlsSlotRef`

The probe asserts the scanner SEES each and the registry check REDS on each while
unclassified. Seeing without redding is the tautology to avoid: a scanner that enumerates
correctly and a gate that never fails is not a cover.

**Outcome.** Spec §4.0.3 and U-5 amended. This task also produces the shipped meta-test, so
it is the one probe whose artifact is load-bearing beyond the claim.

## Task P6 — can any render observe retained state?

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.availabilitySweep.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:122` why=`failedKeys has no remover, so an item going unavailable retains it and there is no sweep whose ordering could be observed` ac=AC-P6 -->

**What is red and why.** The probe puts an item into each session state, flips it
unavailable, flips it back, and asserts the first frame after each flip. It fails because no
sweep exists.

**What it must discriminate.** One case per retained shape, and each asserts the FIRST render
after the flip rather than a settled state — the defect §9.1 repairs is a single frame. The
`retrying` case additionally asserts NO request is issued, since the visible symptom of the
old ordering was an unrequested retry rather than a wrong pixel.

The removal case is separate from the unavailable case: an item dropped from `items`
entirely never flips `available`, so a sweep keyed on that prop would not run for it. Both
are asserted, and the removal case uses a stable id that returns, since a returning id is the
only way the retained state becomes visible.

<!-- tasks: end -->

## After the probes

The six results land in one commit that amends spec §1.4 in place, marking each row RATIFIED
with its probe cited, or CORRECTED with what actually happens. Feature tasks are re-read
against the amended spec before Task 1 starts.
