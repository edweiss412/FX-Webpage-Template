# Tasks P1-P5 — settle the UNRATIFIED mechanism claims before building on them

Each task settles one row of spec §1.4. **They run before any feature task**, and round 1 of
plan review is why they are shaped the way they are.

## The correction round 1 forced: a probe tests the MECHANISM, not the feature

An earlier draft ran these probes against the shipped retry control. That is circular — P1
needed the control, P2 needed two retry render paths, P3 needed the overlay, P4 needed a
second retry request — while the same file forbade feature work until the probes were green.
Only P5 could have completed. The reviewer was right that the phase could not finish.

**Every probe now runs against a standalone fixture that reproduces the mechanism in
isolation**, and needs nothing from `components/diagrams/**`:

- U-1 is a claim about a focused `<button>` gaining an attribute. Any button demonstrates it.
- U-2 is a claim about React unmount-remount and HTTP revalidation. Any two-shape image swap
  demonstrates it.
- U-3 is a claim about `next/image`'s `loading` default under a covering element. Any covered
  image demonstrates it.
- U-4 is a claim about browser `srcSet` candidate selection. Any `srcSet` with a ladder
  demonstrates it.

That is what makes the phase completable, and it is also the honest scope: these are facts
about React, the browser and `next/image`, not about this feature. The feature then gets
built on proven mechanics instead of on prose.

**U-6 is no longer a probe.** It is a claim about the availability sweep, which IS feature
behaviour, so it moved to **Task 7**, where its implementation lives. Spec §1.4's U-6 row names
Task 7. (An earlier draft said Task 8 here and Task P6 in the spec; plan review R2 found the
three-way drift.)

## Where they run, which is a real fan-out and not a detail

`tests/e2e/standalone.config.ts` hosts self-contained specs that boot their own server or use
`page.setContent`, needing no dev server and no Supabase. Its `standalone-chromium` project
carries an EXPLICIT `testMatch` allowlist, and so do every project in `playwright.config.ts`
— whose own comment says a spec absent from the regex "runs NOWHERE and silently proves
nothing".

**So each probe task's first step is adding its basename to
`tests/e2e/standalone.config.ts`'s `standalone-chromium` `testMatch`, and the task is not
done until a run reports the spec collected.** A probe that runs in zero projects is the
exact tautology this phase exists to avoid.

**And the allowlist is only half the fan-out.** `tests/e2e/standalone-baseline.json` pins the
config's resolved membership, and `tests/ci/_metaSpecRegistration.test.ts` fails when the two
disagree — which it did, naming all four new probes, the moment they were added. The second
step is therefore `node scripts/check-standalone-baseline.mjs --write`, committed with the
config change. Found by running the gate rather than by reading, which is why this paragraph
exists: the plan named the allowlist and would have left the baseline to be discovered by CI.

## Acceptance criteria

- AC-P1 The probe establishes, in a real browser, where focus goes when a focused button
  gains native `disabled` versus `aria-disabled`. (discharged by Task P1)
- AC-P2 The probe counts asset requests across an unmount-remount versus a same-node
  transition, with everything else held constant. (discharged by Task P2)
- AC-P3 The probe establishes whether a covered image at the `loading` default issues its
  request. (discharged by Task P3)
- AC-P4 The probe establishes whether a browser re-selects from `srcSet` after a device-scale
  change, and whether the candidate set itself is stable. (discharged by Task P4)
- AC-P5 The registry meta-test fails on a planted unclassified declaration of each shape the
  rejected grep missed, and every `per-item` row carries a clear path or the exact words
  `deliberately none`. (discharged by Task P5)

<!-- tasks: depth=2 red-contract -->

## Task P1 — does a native `disabled` eject focus?

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/focus-disabled-eject.probe.spec.ts` red-state=authored red-target=`tests/e2e/standalone.config.ts:86` why=`the spec basename is absent from the standalone-chromium testMatch allowlist, so the run collects zero tests; the task adds the entry in its first step and the SAME command then collects and fails on the unwritten assertion before passing` ac=AC-P1 -->

**What is red and why.** Two reds in sequence, and the task is not done until both have been
observed: first the command collects nothing, because the basename is not in the allowlist;
after the allowlist step it collects and fails on the assertion.

**Fixture.** `page.setContent` with two buttons. No app server, no `next/image`, no diagram.

**What it must discriminate.** Both arms run. Focus a button, apply native `disabled`, read
`document.activeElement`. Focus the other, apply `aria-disabled="true"`, read it again. The
`disabled` arm is expected to report `<body>` and the `aria-disabled` arm to report the
button. **An arm that only tested `aria-disabled` would pass without establishing that the
hazard is real**, which is the claim spec §7.1 rests on.

Evidence going in, not proof: `components/admin/RecentAutoAppliedStrip.tsx:371-380` records
this for a different control.

**Outcome commit.** Spec §7.1 and the U-1 row amended with the observed result and this probe
cited. Its own commit, per invariant 6.

## Task P2 — does an unmount-remount cost a second GET?

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/image-remount-request-count.probe.spec.ts` red-state=authored red-target=`tests/e2e/standalone.config.ts:86` why=`the spec basename is absent from the standalone-chromium testMatch allowlist, so the run collects zero tests; after the allowlist step the SAME command collects and fails on the unwritten count assertion` ac=AC-P2 -->

**Fixture.** `page.setContent` with a React-free reproduction: a served image at a route
whose response carries `private, max-age=0, must-revalidate` and NO `ETag` or `Last-Modified`
— the asset route's exact headers (`app/api/asset/diagram/[show]/[rev]/[key]/route.ts:12`),
which is the property the claim depends on. One arm removes the `<img>` and inserts a new one
with the same `src`; the other leaves the element in place and only changes a sibling
overlay.

**Everything but the variable is held constant**, which round 1 correctly said the earlier
draft left open. Both arms use: the same URL, the same response headers, the same
interception, no `loading` attribute on either, and the same transition timing driven by an
explicit await rather than a race. The count window opens AFTER the first load settles, so
the initial load is outside it by construction and cannot be miscounted into either arm.

**Assertion.** Remount arm 2 requests, same-node arm 1. Asserting only the same-node arm
would leave the rejection unproven, and the rejection is what spec §4.0.5 rests on.

**Outcome commit.** Spec §4.0.5 and the U-2 row amended. Its own commit.

## Task P3 — does a covered image load at the `loading` default?

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/covered-image-load-eligibility.probe.spec.ts` red-state=authored red-target=`tests/e2e/standalone.config.ts:86` why=`the spec basename is absent from the standalone-chromium testMatch allowlist, so the run collects zero tests; after the allowlist step the SAME command collects and fails on the unwritten request assertion` ac=AC-P3 -->

**Fixture.** `page.setContent` with an `<img>` carrying a `srcset`, **explicitly
`loading="lazy"`**, beneath an opaque absolutely-positioned overlay.

**The explicit attribute is the whole fidelity of this probe, and an earlier draft had it
backwards.** It said the fixture would sit at "the browser `loading` default", on the belief
that `next/image` leaves the attribute unset. It does not: with no `loading` prop and no
`priority` it computes `isLazy` true (`get-img-props`, line 271) and EMITS `loading="lazy"`
(same file, line 553). A bare `<img>` with no attribute defaults to EAGER — the opposite. A
fixture at the bare default would have tested eager loading, reported a request, and
"disproved" U-3 while never reproducing the real case. Caught in self-review, not by a
reviewer, and recorded here because it is exactly the fidelity failure a standalone fixture
invites.

**Three arms, because two would not separate the causes.** `loading="lazy"` WITH the overlay;
`loading="eager"` WITH the overlay; `loading="lazy"` with NO overlay. If the third issues a
request and the first does not, the overlay is the cause and `eager` is the repair. If the
first issues a request, U-3 is wrong and `eager` is unnecessary — and the plan says so rather
than keeping it for safety.

**Outcome commit.** Spec §4.0.5 and the U-3 row amended. Its own commit.

## Task P4 — can a device-scale change move the selected candidate?

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/srcset-candidate-stability.probe.spec.ts` red-state=authored red-target=`tests/e2e/standalone.config.ts:86` why=`the spec basename is absent from the standalone-chromium testMatch allowlist, so the run collects zero tests; after the allowlist step the SAME command collects and fails on the unwritten URL comparison` ac=AC-P4 -->

**Fixture.** A `srcset` carrying a real three-tier ladder at 256w, 512w and 1024w, mirroring
`DIAGRAM_VARIANT_WIDTHS` (`lib/sync/diagramVariants.ts:13`), plus an original-tier URL that is
deliberately NOT in the set. A single-tier fixture cannot express a candidate change and would
report "no difference" while proving nothing.

**The `sizes` string is copied verbatim from `DEFAULT_THUMBNAIL_SIZES`
(`components/diagrams/Gallery.tsx:106`), not invented.** Candidate selection is a function of
`srcset`, `sizes` and DPR together, so a fixture with a different `sizes` answers a different
question than the one U-4 asks.

**DPR is browser-context configuration, not a mid-page mutation** — round 1 was right that the
earlier draft implied otherwise. The probe opens two contexts with different
`deviceScaleFactor` and compares, rather than trying to change it on a live page.

**Two oracles, because one is insufficient.** First, the `srcset` ATTRIBUTE is compared across
the two contexts: it is what the app renders, and if it differs the candidate set is not
stable and U-4 is wrong at the source. Second, the REQUESTED URL is compared: it is what the
browser picks, and a change there is permitted by spec §3's bound while an original-tier URL
is not. The earlier draft asserted only the second, which could pass while the set changed.

**The probe reports rather than requires a re-selection.** If the browser keeps its first
pick, that is a finding about the fixture's discriminating power and the probe says so
instead of silently reading it as stability.

**Outcome commit.** Spec §3 and the U-4 row amended. Its own commit.

## Task P5 — is the registry actually a cover?

<!-- task: red=`npx vitest run tests/components/diagrams/perItemStateLifetime.probe.test.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:122` why=`this line is the first per-item member the scanner must enumerate and the registry must classify, and at task start neither module exists, so the probe's import does not resolve and nothing is enumerated; the task lands both and the SAME command then passes. RUN 2026-08-29: red observed as an unresolved import, then green at 8 assertions` ac=AC-P5 -->

**Fixture.** Copies of both component files in a tmpdir with declarations planted, so the
probe never edits the real tree.

**Planted shapes, one per case, planted separately so a pass cannot come from another:**

1. `const [x, setX] = useState<Record<string, number>>({})` — no `Map`, `Set` or `id`
2. `const yRef = useRef({})` — an object literal
3. `const [z, setZ] = useState<ReadonlySet<string>>(() => new Set())` — a shape the rejected
   grep DID catch, as the positive control that the scanner has not simply stopped working
4. the three real members the grep missed: `activeScale` (`GalleryLightbox.tsx:272`),
   `requestedScaleRef` (`GalleryLightbox.tsx:391`), `controlsSlotRef`
   (`GalleryLightbox.tsx:380`)

**Two separate assertions per case, and the second is the one that matters.** That the
scanner SEES the declaration, and that the registry check REDS while it is unclassified. A
scanner that enumerates correctly behind a gate that never fails is not a cover.

**A third assertion, which round 1 found missing from AC-17**: every `per-item` row in the
shipped registry carries a non-empty clear path or the exact string `deliberately none`. A
row present but empty would satisfy "classified" while documenting nothing, and `demotedRef`
is precisely a row whose correct value is the literal words.

**Outcome commit.** Spec §4.0.3 and the U-5 row amended. This is the one probe whose artifact
ships: the scanner and registry are the meta-test the class defense rests on, so this task
also discharges AC-17.

<!-- tasks: end -->

## Outcomes — all five RUN, 2026-08-29

Five outcome commits, one per task, each amending its own §1.4 row — not one batched commit,
which round 1 correctly called a violation of invariant 6.

| task | result | what it changed |
|---|---|---|
| P1 | **U-1 RATIFIED** | nothing. Native `disabled` ejects focus to `<body>` and `aria-disabled` does not, both measured, so §7.1's rejection of the obvious implementation stands on a measurement rather than on a note about another component |
| P2 | **U-2 RATIFIED** | nothing. A remount issues one further request, the surviving node zero, so §4.0.5's same-node requirement stands |
| P3 | **U-3 REFUTED** | **the design lost an attribute.** Covering is not what defers a lazy image; being off-screen is, and a tap implies the cell is in the viewport. `loading="eager"` is deleted from Task 2 |
| P4 | **U-4 RATIFIED** | nothing. The `srcset` is byte-identical across device-scale factors while the selected tier moves, which confirms §3's bound and proves the fixture discriminates |
| P5 | **U-5 RATIFIED** | the registry gained a row it would otherwise never have had. On its first run the scanner found `prefersReducedMotion` (`GalleryLightbox.tsx:257`), missed by every hand-derivation because it is a single-element destructure with no setter |

**One in five changed the answer, and it was the cheapest one to run.** That is the phase
paying for itself: had P3 run against the shipped control after the fact, `loading="eager"`
would have shipped and nobody would have learned it was unnecessary. P5's find is the same
lesson from the other direction — the cover caught a member in its own subject, immediately,
that three careful hand passes had missed.

The feature tasks are re-read against the amended spec before Task 1 starts.
