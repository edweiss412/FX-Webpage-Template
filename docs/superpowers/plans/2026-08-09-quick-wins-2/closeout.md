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

### §12.1g Cross-model diff review — round 5, and the end of the name-lookup mechanism

Three findings. Two were exact holes in assertions I had already written; the third ended a class that had now recurred five times.

| # | Finding | Repair |
| --- | --- | --- |
| R5-1 | **"Name + enclosing scope" is still not identity** — an ordinary same-scope rename re-binds a row to a decoy, and the reviewer named it the FIFTH instance of this class with the right conclusion attached: "another collision tuple will not close it; replace row lookup with consumer-derived symbol/use-site binding." | Taken. The row list is GONE as a lookup key. The guard now discovers class-bearing constants from the USE SITES — every `className` expression, the identifiers it references, resolved the way the language resolves them, followed TRANSITIVELY through composers. A rename is followed automatically because the reference moves with it; a decoy is irrelevant because nothing references it. The nine names survive only as an expected SUBSET, asserted as a floor so the walk going quiet is a failure rather than a smaller clean set. |
| R5-2 | An EMPTY object literal yields zero rows, and zero rows satisfy the non-empty premise and the wrap assertion at once — the class text can leave the record entirely and the guard stays green. | Surfaced as an unwrappable row, the same handling as a member the reader cannot express. |
| R5-3 | The probe measured BOTH axes and the assertion discarded `row`. Not a recognition escape — the reviewer was explicit that engine and probe agree — an assertion ignoring a number it already had. `gap-x-2 gap-y-0` measures 8/0 and passed, and it matters for a real container: StagedReviewCard's row is `flex-wrap`, so when it wraps, the ROW gap separates the wrapped lines. | Both axes asserted. |

**The use-site rewrite immediately found two sites the nine-name enumeration never covered**, both genuinely dark under the lint rule: `pillState` (a nested per-state ternary behind `cn(base, pillState)` — the rule follows a callee's arguments but does not enter a ternary) and `containerMaxWidth` (a ternary interpolated into a template-literal className). Both are now wrapped per BRANCH, because wrapping a ternary as a whole exposes neither branch. That is the derived cover paying for itself on the first run — the enumeration had been complete against its own list and wrong about the world.

### §12.1g Round 6 BLOCKING, and the decision to delete the guard

Round 6 returned BLOCKING with two findings, both on `canonicalClassConstWrap`: the hand-written identifier resolver does not follow TypeScript scoping (an out-of-scope block binding shadows it; two declarations sharing a label overwrite each other) and the bounded walk prunes valid paths (`seen` keyed only by declaration skips a later `SIZE_CLASS.sm` after `SIZE_CLASS.md`; the six-hop cap silently truncates composer chains). The prescribed repair was a checker-backed symbol graph keyed by `(symbol, property-key)` with cycle detection.

Both findings are correct, and the reviewer named them for what they were: the SIXTH recurrence of "a name is not an identity" and another "the recognizer does not recognize enough".

**Six rounds landed on this one file, and the last four were one question asked four ways** — *is THIS declaration the one the row means?* A name was not an identity, so uniqueness was added; uniqueness was not, so enclosing scope was added; scope was not, so use-site discovery was added; and use-site discovery needed a resolver, which round 6 showed does not match TypeScript's own scoping. The prescribed fix would have made the model agree with the rule by REBUILDING the rule's resolution — a static-analysis engine, inside a test, to pin nine constants.

**Owner decision (2026-08-10): delete the guard.** The reasoning it rests on:

- **The lint rule is the cover.** The nine constants are `cn(...)`-wrapped, which is the entire product change. `better-tailwindcss/enforce-canonical-classes` now traverses them, `pnpm lint` runs it, and `quality` (which runs lint) is a required CI context. Drift inside any of them fails CI on its own, with no guard at all.
- **The wrap is already evidenced.** A3's commit records both halves of the behavioral proof: a planted `min-h-[44px]` was SILENT under `pnpm lint` pre-wrap in all three files and REPORTED post-wrap in each, with the AccentButton pair re-run after the first plant proved non-discriminating. That observation is what the guard was a proxy for.
- **What is lost is a regression pin** whose subject the rule already covers. A future const that dodges the rule files as a NEW instance under spec §4 limit 2, exactly as that limit says.

An intermediate design was built and rejected on measurement rather than taste: a behavioral probe that plants into each declaration IN MEMORY and asks the REAL eslint through `--stdin --stdin-filename`. It models nothing, so renames, scoping and composition cannot fool it — but each invocation took ~219s under this machine's load and still tripped synckit's `Atomics.wait` timeout, so nine of them is not a per-CI-run unit test. Its first form was worse and is worth recording: it wrote the plants into the real source files and restored them afterwards, and it left three production files modified when the run failed. A test that can corrupt the tree it is testing is a worse defect than the one it was written to catch.

### §12.1h Round 7 — the deletion verified, and the last enumeration inverted

Round 7 reviewed the post-deletion diff. **It independently verified the claim the deletion rests on**, with the probe I could not run locally: declaration-anchored in-memory plants passed through the REAL ESLint configuration produced canonical-class errors at all nine constants (`DeveloperToggleButton.tsx` 80/83/87, `AccentButton.tsx` 87/93/98/106, `OnboardingWizard.tsx` 166/169), and `.github/workflows/quality.yml:36` runs `pnpm lint`. It also confirmed no executable suite, registry, config or meta-test referenced the deleted file. Two findings.

| # | Finding | Repair |
| --- | --- | --- |
| R7-1 (BLOCKING) | The pseudo-state gap refusal ENUMERATED prefixes (`hover`, `focus`, `group-*`, …) and missed Tailwind's arbitrary variants: `has-[:hover]:gap-0` compiles to `&:has(*:is(:hover))`, the hidden unhovered probe measures the base gap, and the pin passes while the container collapses whenever a child is hovered. Enumerating spellings does not terminate — the same lesson the gap recognizer taught two rounds earlier, one level down. | **Inverted to an accept-set.** The sweep resizes the viewport, so the only variants it can settle are width variants; every OTHER variant on a gap utility is refused, including ones nobody has written yet. Mutant: `has-[:hover]:gap-0` now fails; control: an ordinary `md:gap-3` is NOT refused. |
| R7-2 | The deletion left two present-tense claims that the removed test "pins" the sites (`lib/ui/cn.ts`, the archive entry). | Both rewritten to name the lint rule as the cover, with the six-round history and §12.1g as the pointer. |

The shape worth carrying forward: this arc's last four mechanism defects were all one thing — **an enumeration standing in for a decision procedure**. A list of Tailwind spellings, a list of declaration names, a list of pseudo-state prefixes. Each was replaced by asking the authority directly (the compiler, the lint rule) or by inverting to an accept-set that refuses the unknown. That is the generalizable lesson, and it is why the round count stopped climbing.

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

### §12.1i — round 9 (BLOCKING, 1 finding) and its repair

**R9-1 (BLOCKING).** The R7 accept-set was still GATED by a regex recognizing
named `gap-*` utilities, so `has-[:hover]:[gap:0px]` was never offered to it —
along with `[column-gap:…]`, `[row-gap:…]` and the legacy `grid-*` aliases. The
mounted HelpSheet case had no state refusal at all, so an ordinary `hover:gap-0`
on the real header passed at its resting measurement. Reviewer's probe:
`has-[:hover]:gap-0 refused=true`, `md:gap-3 refused=false`,
`has-[:hover]:[gap:0px] refused=false`.

**Repair.** Nothing recognizes a Tailwind spelling any more. For each class
token, `gapTokensNotSettledByWidth` finds the rule the engine EMITTED and reads
the property names off the declaration; a token is a gap token iff the browser
says its rule sets a gap property. Variant splitting is bracket-aware (`has-
[:hover]:[gap:0px]` has two structural colons among four). The same procedure now
also runs against the mounted header's live class string.

**The repair's first version was wrong, and its own probe caught it.** Tailwind
v4 emits variants as native nesting — `.hover\:gap-0 { &:hover { gap: … } }` —
so the rule whose selector matches the class carries ZERO declarations. Reading
only that rule found nothing and classified every state-conditioned gap as
harmless: the entire population the check exists to catch. It now reads the
matched rule's whole subtree. What exposed it was probing BOTH failure
directions plus a control — an over-refusing check and a never-refusing check
are indistinguishable from a single-direction probe.

**Probe, four arms, all against the shipped code:**

| arm | plant | expected | observed |
| --- | --- | --- | --- |
| 1 | none | whole spec green | `56 passed` |
| 2 | `has-[:hover]:[gap:0px]` on the Step3Review pin | refused | `premise not met … (unexercisable: has-[:hover]:[gap:0px])` |
| 3 | `md:gap-3` on the same pin | NOT refused | `1 passed` |
| 4 | `hover:gap-0` on the mounted HelpSheet header | refused | `premise not met … (unexercisable: hover:gap-0)`, all 4 viewports |

> Branch A's block lands on `fix/quick-wins-2-mech` and branch C's on `feat/wizard-step-connector`; whichever merges second resolves the overlap. Same file, disjoint sections, by design.

Plan: `docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md` · Specs: `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md`, `docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md`

## Branch B — feat/crew-chrome-footer-avatar

### §12.1 Design gate

Both halves ran on the branch diff (`git diff origin/main...HEAD` restricted to `app/**/*.tsx`, `components/**/*.tsx`, `app/globals.css`) with the canonical v3 setup: `context.mjs` context load, then the product-register read. Critique and audit ran as isolated passes.

**Critique 28/40 (Good) · Audit 17/20 (Good) · P0: 0 · P1: 2** (one per half, and they agree on the surrounding P2s). Both independently verified the parts that could have gone wrong quietly: the `avatarColor` palette is AA against white initials (`#9A4A00` 6.26:1, `#515763` 7.26:1), the form boundary keeps `slug`/`shareToken`/`showId` with the typed wrapper, all four partial-identity labels are non-empty, `menuitemcheckbox` + `aria-checked` (never `aria-pressed`), Escape restores focus, Tab closes without trapping, the open-focus effect is post-commit and sound, 44px holds on the trigger, both rows and the report button, every `ring-offset-2` is container-matched, the pointerdown listener is removed, `z-20` clears the bar's `z-10` with no intervening stacking context, and no em dashes reached user-visible copy. `noBareRingOffset` + `_metaEmDashCopy`: 32/32.

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| B-1 | P1 | **The theme row contradicted itself.** It rendered a Sun beside the label "Dark mode" while `aria-checked` was true, and gave sighted users no visible checked state at all. The Sun/Moon swap is correct for the STANDALONE toggle — an action button whose affordance is "this is what you'll get if you tap" — and wrong for a `menuitemcheckbox`, which shows whether it IS on. | **FIXED** — glyph pinned to Moon, state carried by a trailing check. |
| B-2 | P1 | **Faint copy fell below AA on the re-grounded band.** Moving the footer from `bg-bg` to `bg-surface-raised` dropped `text-text-faint` to 3.35:1 light / 3.53:1 dark, under the 4.5:1 floor — and it is the ONLY copy in the `syncing…` state. `text-text-faint` has no DESIGN §1.2 row, which is why nothing caught it. | **FIXED** — `text-text-subtle` (5.97:1 dark) for the two copy spans; the `aria-hidden` separator dots stay faint, being decoration. |
| B-3 | P2 | **The popover was unbounded.** `w-max` is `width: max-content`, which the containing block does not clamp, so a long name plus a long role (roles like "A1 / V1 / BO / GAV" are real) runs off the left edge at 390px with no scroll recovery. | **FIXED** — `max-w-[calc(100vw-2rem)]`. |
| B-4 | P2 | **The icon button's hover was a no-op, then an inversion.** Its recipe was copied from a `bg-bg` container: on the band, light `surface` and `surface-raised` are both `#ffffff` (no visible change) and dark hover matched the band exactly, flattening the button into it. | **FIXED** — `hover:bg-surface-sunken` for the icon variant. |
| B-5 | P2 | **`role="menu"` owned a generic child.** The identity header was correctly hoisted out, but the person row's `<form>` (no accessible name → `generic`) sat directly inside. axe walks through null-role wrappers, so the suite's own containment assertions could not see it. | **FIXED** — `role="none"` on the form; the submit remains the menu item and the server-action boundary is untouched. |
| B-6 | P3 | Escape stopped closing the menu after a click on the identity header — focus fell to `<body>`, outside the popover's `onKeyDown`. | **FIXED** — `tabIndex={-1}` on the header, script-focusable only, never in the tab order. |
| B-7 | P3 | `aria-label="FXAV"` on a `<p>` is prohibited on `role=paragraph` and redundant with its own text. | **FIXED**; the Header suite's locator moved to the testid, since its subject is the color token. |
| B-8 | P3 | No exit transition — the popover unmounts hard while spec §2.3's inventory says "same, reversed". | **ACCEPTED.** The jsdom suite pins the unmount deliberately, so a future refactor that hides instead of unmounting fails and owes a real exit entry. Adding an exit animation means keeping the node mounted through it, which is the branch-stability hazard DESIGN §15 warns about for announced regions. Not worth that trade for a 120ms fade. |
| B-9 | P2 | The band's surface reads differently per theme: in light, `surface-raised` equals `surface` (an invisible lift with no shadow); in dark it is lighter than both the cards and the fixed bar. | **DEFERRED** — a DESIGN.md token question (whether `--color-surface-raised` earns a shadow in light, and whether the band should sit below the bar in dark), not a code fix, and §1.2 is missing `text-subtle`/`text-faint`-on-`surface-raised` rows entirely. Filed rather than guessed at inside a UI branch. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

### §12.2 Observed-RED transcripts

| Task | RED observed | Restored |
| --- | --- | --- |
| B1 | `footer.bottom=843.91` vs `barTop=790.70` (the box ends 53px UNDER the bar); short page `footer.bottom=212.86` vs `viewport.bottom=900` (687px of dead space, unanchored) | both green after the flex chain + clearance |
| B3 | the four identity-chip suites failed against the new component — 10 cases pinning the text-chip rendering | all four retargeted in the same commit; 21-case menu suite added |

## Branch C — feat/wizard-step-connector

### §12.1 — invariant-8 dual gate

Both halves ran on the C1 diff (`components/admin/OnboardingWizard.tsx`, the
StepIndicator connector). Critique ran dual-agent: Assessment A (design review)
and Assessment B (detector + measured browser evidence) as isolated parallel
sub-agents, per the command's hard invariant — not inline, so no degraded
banner applies.

**Design health: 27/40.** P0 = 0. P1 = 2. Deterministic scan
(`detect.mjs`) on the component: **clean, zero findings, exit 0.**

**The two assessments agreed to the second decimal**, which is what makes the
findings actionable rather than a matter of taste. A computed the ratios from
tokens; B measured them in a real browser at every step, at 390px and 900px, in
both themes. Both landed on:

| Comparison | Light | Dark | Floor | |
| --- | --- | --- | --- | --- |
| hairline vs page (`--color-border`) | 1.22:1 | 1.35:1 | 3:1 | invisible |
| done vs ahead (`border-strong` vs `border`) | 1.25:1 | 1.26:1 | 3:1 | indistinguishable |
| connector width, all 12 cells | 60.00px | 60.00px | — | `flex-1` never grew |
| trailing dead space, 900px step 3 | 257.77px | — | — | unused |

**P1-1 — the connector's state colour was imperceptible.** The done/ahead split
the spec prescribes measured 1.25:1. Not a §1.4.1 violation (the element is
`aria-hidden` and the done pill carries a Check glyph), which is precisely the
finding: the colour branch was both invisible AND redundant.

**P1-2 — `flex-1` on the nav was inert and cost layout.** The connectors cap at
60px, so the grow never fired; the leftover collected as trailing space and the
rail resized between steps 2 and 3 as `containerMaxWidth` changed.

**Disposition: BOTH FIXED**, owner-decided (Option B plus a contrast repair,
chosen over three alternatives rendered at true scale in both themes). The
connector sets `w-confirm-box` directly and both colours moved from the border
ramp to the text ramp — `text-faint` ahead (3.16:1 / 4.22:1), `text-subtle`
done (6.5:1 / 6.8:1). The state distinction the spec asks for is preserved and
now perceivable, rather than dropped.

**P2 — DESIGN.md had no stepper entry at all**, which is why a border token was
paired with a standalone rule unquestioned. FIXED: new §1.2a records the
measured ratios and names the faint/subtle pair as the sanctioned hairline
ramp, so the next 1px rule does not re-derive this.

**P2 — token coupling** (`--spacing-confirm-box` is a confirm-BUTTON dimension,
so resizing that button silently resizes the stepper): NOT fixed, and not
deferred silently — it is the same token the C1 canonicalization pinned, and
retargeting it is a token-taxonomy change beyond this arc's scope. The coupling
is now at least documented in §1.2a's neighbourhood rather than implicit.

**P3 — `justify-between` on the parent row is inert with a single child:**
accepted. Harmless, and removing it would touch a row this arc does not
otherwise own.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

### §12.2 — observed RED

`C1` RED was observed only after four harness faults were cleared, each of
which would have produced a red run for the wrong reason: a sibling worktree
owning port 3000 (Playwright's `reuseExistingServer` would have measured
another branch's code), four booted webServers where one was needed
(`BASELINE_SERVER_ONLY`), a hand-started dev server missing the config's
test-auth env (`signInAs` 404, nine tests red for a reason unrelated to
connectors), and a shared-DB strand from another session's crashed run
(`enterWizardAdminState` refusing to capture all-null `app_settings`).

Genuine RED: 6 band cases failed with `width: 0, height: 1, inBand: false` on
both connectors. GREEN after the nav fix: 9/9.
