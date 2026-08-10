# Quick wins 2 — closeout

Per-branch invariant-8 dual-gate findings and dispositions, the observed-RED transcripts index, and the census/sweep dispositions. Each block lands ON ITS OWN BRANCH before that branch's final review and merge, so every closeout edit is part of a reviewed, merged diff.

Plan: `docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md` · Specs: `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md`, `docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md`

## Branch A — fix/quick-wins-2-mech

### §12.1 Design gate

Both halves ran on the branch diff (`git diff origin/main...HEAD` restricted to `app/**/*.tsx`, `components/**/*.tsx`, `app/globals.css`, `DESIGN.md`), with the canonical v3 setup: `context.mjs` context load (PRODUCT.md + DESIGN.md) then the product-register read (`reference/product.md` — this is admin/crew app UI, design serves the product). Critique ran dual-agent (Assessment A design review · Assessment B detector + compiled-CSS evidence, isolated until synthesis). Audit ran as its own pass.

**Expected outcome was zero visual delta, and that is what both halves measured** — not asserted. Assessment B and the audit each compiled every rewritten class pair with the project's own Tailwind 4.2.4 against a copy of `app/globals.css` and diffed the emitted declarations:

| Pair | Emitted | Verdict |
| --- | --- | --- |
| `break-words` → `wrap-break-word` | `overflow-wrap: break-word` both sides | identical, byte for byte |
| `min-w-[8.5rem]` → `min-w-34` | `min-width: 8.5rem` vs `calc(var(--spacing) * 34)`, `--spacing: 0.25rem` | text differs, computed identical (34 × 0.25rem = 8.5rem); zero `--spacing` overrides exist under `app/` or `components/` |
| `h-full w-full` → `size-full` | same two declarations, one rule | equivalent; no competing `h-*`/`w-*` at the call site, and `cn` carries no tailwind-merge conflict resolution |
| `h-5 w-5` → `size-5` | same two declarations, one rule | equivalent |
| `shadow-(--shadow-tile)` → `shadow-tile` | `--tw-shadow: var(--shadow-tile)` vs `var(--shadow-tile-runtime)` | text differs, computed identical — `@theme` declares `--shadow-tile: var(--shadow-tile-runtime)`, and only the `-runtime` token is redeclared under `[data-theme="dark"]` and `@media(prefers-color-scheme:dark)`, so light AND dark match |
| `shadow-(--shadow-popover)` → `shadow-popover` | as above | identical, both themes |

Critique heuristics: 8 of 10 unchanged by the diff; Consistency 3 (uneven wrap coverage — fixed, below), Error prevention 4 (a derived guard replaces an enumerated census). Audit dimensions: Accessibility 4, Performance 4, Theming 4, Responsive 4, Anti-Patterns 3 — **19/20, Excellent**.

Accessibility and responsive were checked as a normalized multiset diff of every rewritten class string, old versus new, across all 48 files: zero deltas in any `min-h-tap-min` / `min-w-tap-min` / `size-tap-min`, `focus-visible:ring-*`, or `ring-offset-*` token; no orphaned `ring-offset-2`; every `sm:` / `min-[480px]:` / `min-[720|768|960px]:` variant preserved through the six concatenation rewrites.

**P0: 0 · P1: 0.**

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| A-1 | P2 | `ShareLinkCopyButton.tsx` comment still read "`min-w-[8.5rem]` reserves the WIDER of…" after the class became `min-w-34`; the next person tuning the no-shift width greps `8.5rem` and finds nothing. | **FIXED** — comment now reads `min-w-34` (34 × 0.25rem = 8.5rem). |
| A-2 | P3 | `DESIGN.md` had no token-table row for `--shadow-popover` at all, though this arc canonicalized it and the new guard bans its arrow form. | **FIXED** — row added, light/dark values verified against `app/globals.css:356`/`:409`. |
| A-3 | P3 | Uneven `cn` coverage inside single files (`CompactAlertCard` wrapped `TONE_SKIN` but not `TONE_DIVIDER`/`TONE_DASHED_DIVIDER`; `RecentAutoAppliedStrip` wrapped `FALLBACK_PILL.cls` but not the sibling `KIND_PILL` map) — drift there still escaped `pnpm lint`. | **FIXED** — root cause was the census detector, not the sweep: its Tailwind-bearing heuristic required ≥2 tokens and did not model the `/opacity` modifier, so single-token values (`bg-status-idle`) and `border-status-warn/40` were invisible. Detector widened, re-run, and the 76 further sites repaired. See §12.3. |
| A-4 | P3 | `cn("single-class")` reads as a runtime no-op at the call site; the rationale lived only in `lib/ui/cn.ts` with nothing pointing there. | **PARTIALLY FIXED, remainder accepted** — `lib/ui/cn.ts` now states the single-argument idiom explicitly and names the pinning guard. A per-call-site comment across ~100 sites was rejected as worse than the problem: it would add 100 lines of identical prose to carry one fact that has one home. |
| A-5 | P3 | `app/globals.css`'s new comment embeds a dated plugin-behavior measurement (29 of 35 tokens canonicalized, six silent) that will rot. | **ACCEPTED** — spec §2.2 part 2 requires the comment to state the MEASURED mechanism rather than a theory, precisely because the previous claim was an unmeasured assertion that probed false. The measurement is date-stamped in the text and the comment already names the derived guard as the durable enforcement, so a reader who finds the numbers stale still lands on the thing that is not. |

Detector (`detect.mjs`) over the 45 changed `.tsx` files: exit 2, 14 findings, all `broken-image`, **all false positives** — every flagged line is an `<img>` mentioned inside a JSDoc or line comment, and none of the 14 lines is in this diff. The real JSX `<img>` tags at `VenueMapTile.tsx:100`, `step3ReviewSections.tsx:3726`, `GalleryLightbox.tsx:634`/`:703` carry real `src` values and were not flagged. Zero actionable detector findings.

Browser visualization: skipped. The change is source-level class spelling with no running dev server, and the compiled-CSS diff is strictly stronger evidence than a screenshot — it proves the emitted declarations rather than sampling one rendered state, and it covers dark mode, which a single light-mode capture would not.

The marker below reads `dispositions=none` because the grammar's cross-check ties that field to the P0/P1 count (`p0 + p1 > 0` requires `recorded`, zero requires `none`), and this gate found no P0 and no P1. The P2/P3 dispositions are the table above.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none

### §12.1b Cross-model diff review — round 1

Three tight-scope dispatches (the diff is ~60 files; `AGENTS.md` makes split briefs the default at that size), each with the REVIEWER-ONLY line, the fresh-eyes posture, a consequence bound, a threat-model fence, and a do-not-relitigate list. Corpus rows in `docs/review-rounds/fix/quick-wins-2-mech/`.

| Scope | Verdict | Findings |
| --- | --- | --- |
| the new guards and test surfaces | NEEDS-ATTENTION | 5 |
| the shared psql-target resolver | NEEDS-ATTENTION | 1 |
| the mechanical class sweep, docs and ledger | NEEDS-ATTENTION | 2 |

Every finding arrived with a probe, and every one was real. **Six of the eight are guard/assertion defects** — R1-1 through R1-5 in the guards, plus R1-7's broadened `min-w` assertion — while R1-6 is a resolver BEHAVIOR defect (an empty DSN silently selecting the local default) and R1-8 is a census arithmetic correction. An earlier draft said "seven of eight," which over-counted by folding R1-8 in; the round-3 docs review caught it against this table. The honest summary is unchanged in substance: the product changes held up (all four canonical substitutions and both shadow themes reproduced, token order and set retained, the six concatenations byte-identical, the 29/35 plugin claim exact), and most of what did not hold up was the machinery asserting it.

| # | Scope | Finding | Repair |
| --- | --- | --- | --- |
| R1-1 | guards | `themeTokenArrowBan`'s fixture planted into the SCANNER's own `UI_ROOTS`/`UI_EXTENSIONS` and used the scanner's parsed token spellings, so any mutation of those moved the fixture with it. Probed: deleting `"app"` (168 tracked files) or `"lib"` (496), replacing `.ts` with `.js`, and appending `-mut` to every parsed token each left ALL FOUR tests green. | Fixture roots, extensions and token names now come from an INDEPENDENT read, with an agreement assertion binding them to the scanner. All four mutants now fail by name (2 of 4 fail two tests each). |
| R1-2 | guards | A `scopeTiles` row whose `viewerNames` went empty ran its named test with ZERO assertions and reported PASS — probed for all eight rows. | Non-emptiness asserted twice: once over the whole table, once inside each row's own test, so a silent row fails in the test that is silent rather than in a sibling. |
| R1-3 | guards | The Branch-0-inert premise validated a separately built `idInputs` array, not the call. Probed: injecting ids at the real call sites left the premise green while all four positive fuzzy-name legs were answered by Branch 0 instead of the name comparison they claim to exercise. Exactly the shape `docs/agents/writing-plans.md` names — "a premise that validates something ADJACENT to the case is not a premise". | ONE `callOptionsFor` constructor now feeds both the premise and the assertions, and each leg re-asserts inertness on its own options object. The mutant now fails 9 tests. |
| R1-4 | guards | The tap-target static pin walked to the nearest gap-bearing ANCESTOR. Probed: deleting the inner `gap-2` made it climb to the outer `flex flex-col gap-2` header and accept that VERTICAL gap — a different axis, a different box — while reporting PASS. | The walk is now the IMMEDIATE parent only; no literal className, or no gap on it, is a premise failure rather than a climb. |
| R1-5 | guards | `TAILWIND_SPACING_STEP_PX = 4` restated the project's spacing step instead of deriving it, and the premise "the band is a whole number of steps" compared two test-local constants. Probed: injecting `--spacing: 0.1875rem` left both static pins green at a computed 8 while the real gap was 6, under the band. | The constant is DELETED. The AST supplies the gap TOKEN and the real engine resolves it, with a premise that the token was emitted at all (an absent class computes 0 and would otherwise fail for the wrong reason). Both pins now fail under the injected spacing. |
| R1-6 | resolver | An explicitly EMPTY DSN was treated as ABSENT. The resolution this replaced used nullish `??`, so `DATABASE_URL=""` refused; the shared resolver silently selected the local default instead — a refusal turned into an acceptance, the one thing the migration was not allowed to do. | ABSENT and EMPTY are now different states, with the empty channel refused by name and the absent-falls-through control asserted beside it. |
| R1-7 | sweep | The retargeted `min-w` assertion accepted `min-w-0` — probed, and Tailwind emits `min-width: calc(var(--spacing) * 0)` for it — so the reserved label width could go to zero silently. | Pinned to `min-w-34`. |
| R1-8 | sweep | The census reported round 2 as 12 files and the union as 43; commit-derived enumeration gives 14 and 38 (the rounds overlap on 7). | Corrected in both the closeout and the archive entry, with the overlap stated so the numbers reconcile. |

Two CI failures surfaced in the same window and are repaired with them: the psql startup-file guard's indirection tripwire fired on the new unit suite's binary-name assertion (reworded rather than exempted — that guard already carries a SELF list and growing it is the worse trade), and the standalone spec baseline was one regen behind A6's four new cases.

### §12.1c Cross-model diff review — round 2

Two dispatches over the round-1 repairs plus a peer sweep. **One of them produced no verdict**: the resolver/ledger/sweep/docs dispatch was killed by the wrapper's own timeouts (attempt 1 at 1200s, attempt 2 at 300s), so that scope was NOT reviewed in round 2 and nothing here may be read as clearing it. An earlier draft of this section said those surfaces "came back clean" — that was wrong in the precise way `AGENTS.md` warns about (`no_verdict` is an infrastructure fault, never evidence the reviewer found nothing), and it was caught by the round-3 docs review rather than by me. The scope was re-dispatched in round 3 and cleared there.

What the GUARDS dispatch did report clean, in its own words: "`scopeTiles` has no remaining zero-assertion or premise/call divergence route; the `min-w-34` assertion is exact; the arc diff contains no other broadened assertion accepting a degenerate value." Three NEW findings, all on the surface round 1 had already opened — the tap-target pins and the arrow-ban parser — and all three probe-backed.

| # | Finding | Reachability, probed BEFORE repairing | Repair |
| --- | --- | --- | --- |
| R2-1 | Both "independent" token readers shared two grammar blind spots — only the first declaration per line, only the first `@theme` block — so they AGREED while a declared token's arrow use went unreported. Agreement between two readers is evidence only when they can disagree. | 1 `@theme` block, 0 same-line pairs today. A real class, not a live defect. | Both readers now walk EVERY block and EVERY declaration, and the grammar itself is planted as a fixture (a two-block, same-line CSS string both must parse identically) rather than assumed. |
| R2-2 | The static pins' detached `document.body` probe resolves the ROOT `--spacing`; a container under a scoped override would diverge, passing at 8 while the real gap is 6. | Zero `--spacing` overrides tree-wide. | The assumption is now CHECKED, not assumed: a pure-Node walk over `app/`, `components/`, `lib/` fails the premise if any override lands. Measuring the real container is not available to a static pin — neither is in a mounted subtree, and widening the mount is the harness redesign the ratified scope excludes. |
| R2-3 | All three gap guards missed responsive collapse: `gap-2 sm:gap-0` extracts as `gap-2`, and every case ran at one width. | **REACHABLE — the pattern already ships** (`min-[720px]:gap-0`, `components/crew/primitives/KeyTimesStrip.tsx`). | The extractor now COLLECTS variant-prefixed gaps and fails the premise when any exist — a static pin cannot settle a per-viewport gap from source, so it refuses rather than guesses. The measured case, which CAN just look, runs at both ends of the suite's viewport range. |

Each repair was verified by its mutant: `min-[720px]:gap-0` on the Step3Review row fails that pin; a scoped `--spacing` in `globals.css` fails both static pins; restored, 5 passed. `rg` is not on the Playwright runner's PATH, so the override scan is a Node walk — a search that cannot run must not read as a search that found nothing.

### §12.1d Same-vector sweep, run instead of waiting for round 3

Two consecutive rounds landed on one class: **a guard whose fixture or probe shares an assumption with the mechanism it checks.** R1-1 shared the scanner's roots/extensions/token spellings; R2-1 shared its parser grammar; R2-2 shared a root-scope assumption; R2-3 shared a single-viewport assumption. The same-vector rule sets three rounds as the trigger for comprehensive re-analysis and its tightening says to ship the defense at FIRST occurrence when the class is nameable — it was nameable at R1-1, so the analysis ran here rather than after a third round paid for it.

Sweeping the four guard files for the class turned up one more instance, and it was the largest: **`themeTokenArrowBan`'s fixture never exercises the live walker at all.** Every premise runs through `walkFiles` (an on-disk temp tree); the live guard runs through `trackedFiles` (`git ls-files`). A `trackedFiles` that returned nothing — a wrong git argument, a cwd outside a repository, a filter dropping every extension — would report zero offenders and PASS with all four premises green. The two walkers are deliberately different code, so the fixture cannot vouch for the one that matters; a floor on what it returns can, and now does (`premise(trackedCount, 200)`). Mutant: making the `git ls-files` split match nothing fails the live guard by name; restored, 6 passed.

The other three files were swept and are clean of the class: `canonicalClassConstWrap` reads the same files it asserts about (unavoidable, and a removed callee makes every row report rather than none); `scopeTiles` now shares one constructor between premise and call by construction; the tap-target pins state their remaining assumption executably.

### §12.1e Cross-model diff review — round 3, and the decision to stop widening

Three dispatches. The RESOLVER scope returned **APPROVE, 0 findings** — that surface is closed. The DOCS scope returned 3, all defects in this closeout's own record-keeping (§12.1f). The GUARDS scope returned 6, and every one of them was the same shape: *the recognizer does not recognize enough.*

That is the ratchet the round-economy retrospective names, and round 3 is where it gets refused rather than fed. The rule is explicit — when consecutive rounds keep landing on one function, the mechanism is answering the wrong question, and the repair is to delete or derive it rather than widen it again.

**What the gap extractor could not stop missing.** Round 2 taught it about `min-[720px]:gap-0`. Round 3 handed it four more spellings it still missed, each with a live Tailwind 4.2.4 probe: a second unprefixed utility (`gap-2 gap-x-0`), a stacked variant (`md:hover:gap-0`), a semantic-valued variant (`min-[1240px]:gap-x-tile-gap` — already a grammar in this corpus), and an intermediate collapse restored at the far endpoint (`gap-2 min-[720px]:gap-0 min-[1280px]:gap-2`, which reads 8 at 320 and 1280 and 0 at 768). Widening it a third time would have bought the next round's spelling.

**So the regex is gone.** The AST now answers only a closed question — *which element, and what does its className literally say* — and hands the WHOLE class string to the real engine, measured at EVERY declared viewport. "Which Tailwind utilities win at this width" is a question about a compiler; a compiler answers it exactly, and a recognizer never will. All four round-3 spellings die against the new mechanism without it knowing any of them exist, and mutant #14 still dies.

| # | Finding | Repair |
| --- | --- | --- |
| R3-1 | `premise(trackedCount, 200)` was a PICKED bound — a mutant dropping an entire root returned 362, over the floor, so the guard passed while a third of the tree went unscanned. | Derived from the tree: the independent disk walk supplies the expected size, and the tracked walk must return ≥90% of it. The drop-root mutant now fails. |
| R3-2 | `findDeclaration` took the FIRST same-named declaration anywhere, so an unrelated `base` above `StepIndicator` satisfied the row while the intended one went bare. `base`/`focusRing` are the most collision-prone names in the set. | Ambiguity is REFUSED, not resolved by position: a row must resolve to exactly one declaration. |
| R3-3 | `initializersOf` silently dropped `SpreadAssignment`/`ShorthandPropertyAssignment`, so `{ ...DARK, sm }` emptied the list — and an empty list satisfies the shape premise, the non-empty premise and the wrap assertion at once. | An unreadable member is surfaced as a row that cannot be wrapped, so it fails loudly instead of vanishing. |
| R3-4 | The `--spacing` scope check sees static spellings and misses runtime `setProperty` / React inline styles. | Kept as a TRIPWIRE with its reach stated; the residual is a documented limit, because closing it needs the container mounted — the redesign the ratified scope excludes. Chasing it with a wider scan is the same road this round backed out of. |
| R3-5 | Gap extraction missed `gap-x-0`, stacked variants, and semantic-valued variants. | Mechanism deleted (above). |
| R3-6 | Endpoint-only measurement missed an intermediate collapse. | Every declared viewport, for both the static pins and the measured case. |

Round 3 also confirmed the round-1 and round-2 repairs held: both token readers returned all four planted tokens where the old ones returned two, `[--spacing:3px]` was detected, `min-[720px]:gap-0` was collected, and an empty tracked walker failed its floor.

### §12.1f Cross-model diff review — round 4

Guards only; the resolver closed at APPROVE in round 3 and the docs findings were repaired there. Four findings, all real, and one of them is a correction to THIS RECORD rather than to code.

| # | Finding | Repair |
| --- | --- | --- |
| R4-1 | **My round-3 commit transcript claimed a `md:hover:gap-0` mutant had been killed. What I actually ran was `md:gap-0`.** The media-query variant is settled by resizing; the hover one is not — Tailwind puts the override under `&:hover`, and the probe is a hidden, un-hovered element, so it would report the resting gap and call it clearance. | The claim is corrected here, and a pseudo-state-gated gap is now REFUSED rather than measured: `hover`/`focus`/`active`/`group-*`/`peer-*` on a gap utility fails the premise. It does not try to compute such a gap — that is the recognizer road this file left — it declines to vouch, the same posture as the `--spacing` tripwire. The real `md:hover:gap-0` mutant now fails. |
| R4-2 | `immediateParentClassOf` took the FIRST element carrying the testid, so a duplicate earlier in AST order bound the wrong element. A closed question with two answers is not closed. | Ambiguity refused: exactly one match or `null`, which is a premise failure. A planted duplicate now fails. |
| R4-3 | The `0.9` ratio was still a PICKED number, and the probe was decisive — dropping the whole `components/admin/settings/` subtree (7 of 858 files) left the ratio at 0.99, over any sane floor, while a planted offender in that subtree went unreported. A proportion cannot notice a small subtree, and small subtrees are where a walker bug lives. | Sets, not sizes. Every file the independent disk walk finds is either tracked — and must appear in the live scan — or reported untracked by a separate git query; anything in neither is named individually. The subtree-drop mutant now fails. |
| R4-4 | Uniqueness still did not establish IDENTITY: rename the intended `base` to `stepBase`, leave an unrelated wrapped `base` behind, and the row finds exactly one declaration, passes every premise, and binds a different constant. | Rows bind by name AND enclosing scope, so a row names a place rather than a word. The rename-plus-decoy mutant now fails. |

Round 4 also confirmed the round-3 repairs held: unsupported object members were checked exhaustively (spread, shorthand, method, getter, setter all surface as unwrappable rather than vanishing), and both static pins and the mounted case iterate all four declared viewports.

### §12.2 Observed-RED transcripts index

Every RED in this branch was observed against the live tree, and both observations recorded in the task's own commit message.

| Task | RED observed | Restored |
| --- | --- | --- |
| A1 | `rg -q 'hand on initial canonicalization' eslint.config.mjs` exit 0 before, exit 1 after | n/a (comment edit) |
| A2 | guard failed with a 22-site census (21 `--shadow-tile`, 1 `--shadow-popover`) | green post-sweep |
| A2 mutants | M1 parse-namespace narrowing → 3 named failures · M2 extension narrowing → 1 · M3 exclusion removal → 2 · M4 literal-restriction removal → 1 | 4 passed |
| A3 | structural case failed on 15 unwrapped initializers across the nine consts | green post-wrap |
| A3 evidence | planted `min-h-[44px]`: SILENT pre-wrap in all three files; REPORTED post-wrap at `DeveloperToggleButton.tsx:80`, `OnboardingWizard.tsx:166`, `AccentButton.tsx:88` | plants removed |
| A4 | `nameMatch.ts` multi-token surname branch neutered → 6 failed / 36 passed, including three of the new set's own legs | 42 passed, `git diff` empty |
| A5 | the two spawn-level cases failed (no refusal; ambient env reached the child) | green post-migration |
| A6 | mutant #14 per container: HelpSheet `gap-3`→`gap-0`, Step3Review `gap-2`→`gap-0`, StagedReviewCard `gap-2`→`gap-0`, each killing exactly its own case | 4 passed, tree clean |

### §12.3 Census and sweep dispositions

**A2 arrow-form census** — derived from the guard's own RED output, never copied from the spec or the entry (the entry's 2026-08-07 count of 24 had already rotted): 22 sites, 2 distinct tokens, all canonicalized. Residue grep `rg 'shadow-\(--shadow-(tile|popover)\)' app components lib` returns exactly one hit, `app/globals.css:287`, the deprecation mention that names the form in order to forbid it. Test-side fallout (three jsdom assertions, four e2e verbatim transcriptions, two rationale comments, one DESIGN.md row) repaired in the same PR.

**A3 class-const census** — the spec's `rg` shape misses one-line declarations, function-scoped consts, object VALUES and literal concatenations, so the sweep ran as an AST pass over every tracked `.ts`/`.tsx` under `app/` and `components/`. Two rounds, because the design-gate found the first round's detector under-inclusive:

| Round | Cover | Sites | Disposition |
| --- | --- | --- | --- |
| 1 | initializer or Record value, Tailwind-bearing (≥2 tokens, ≥60% matching a utility prefix), not already inside a recognized callee | 56 across 31 files | all repaired |
| 2 (gate finding A-3) | round 1 widened: `/opacity` modifiers modeled, single-token values admitted when they carry a dash, nested object values walked | 76 further across 14 files | all repaired |

The two rounds overlap on 7 files, so the union is **38 files**, not the 31 + 14 a reader would add up to — corrected from a commit-derived enumeration after the cross-model review probed it (`round1_files=31 round2_files=14 overlap=7 union=38`).

Deferral was considered under class-sweep exception (c) — "spans enough sites to blow the review scope" — and REJECTED on measurement rather than feel: the transform is mechanical, `tsc --noEmit` is clean, and the whole class produced only four Tailwind drifts. Deferring would have cost a full pipeline to re-earn context already held.

**A5 psql-target class sweep**, the spec's scoped command re-run at implementation time:

```
rg -n 'TEST_DATABASE_URL \?\?' tests/e2e/helpers --glob '*.ts'
```

Three hits, all prose inside comments describing the removed pattern (`psqlTarget.ts:9`, `lockedCrewRestriction.ts:53`, `devCaptureStaged.ts:42`). Zero live module-load captures remain; both in-class helpers consume the one shared resolver through every DSN entry point.
