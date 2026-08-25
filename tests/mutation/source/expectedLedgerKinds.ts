// tests/mutation/source/expectedLedgerKinds.ts
// Lifted verbatim out of the retired tests/mutation/guardSurfaces.gate.test.ts
// when the source-mutation gate was sharded (wall-clock spec §3.2/§3.3). Both
// the per-surface shard files and the corpus-wide gates file read it, so it
// cannot live in either: the shards need the per-surface row, the gates file
// needs the whole key set to prove completeness.
//
// Every comment below is a per-surface argument someone paid review rounds for.
// They moved unmodified.

/**
 * Per-surface ledger-kind expectations.
 *
 * Declared HERE rather than counted from the surface's own ledger, because
 * counting a list and comparing it to itself proves nothing — the point (whole-diff
 * R1 F4) is that the deliberately coarse score floor cannot catch one or two rows
 * migrating between kinds, so the target has to be stated independently.
 *
 * Keyed by surface id, and every enrolled surface must appear: a NEW surface fails
 * by default until it declares its own counts, rather than silently inheriting the
 * first customer's (whole-diff R2 MEDIUM — the previous version asserted
 * taskContract's 18/2 against every surface in `describe.each`).
 */
export const EXPECTED_LEDGER_KINDS: Record<string, Record<string, number>> = {
  // The invariant-10 discovery engine, enrolled 2026-08-17. The first scored run
  // reported 64 survivors on `enumerate.ts` (score 0.6168) and 5 on totality.ts
  // (0.75); the module had one deciding suite and a large pre-existing surface
  // (`scanBody`, `isLocallyRebound`, `routeMutatingMethods`) that no test
  // discriminated. All but three were REPAID with cases rather than accepted.
  // THREE proven equivalences remain and NO accepted gap: a modifier comparison
  // whose two conjuncts cannot both hold, a body requirement no reachable node
  // can distinguish, and a disjunct the flip makes dead (per-site arguments on
  // the registry rows). Two further rows were claimed at first and REFUTED in
  // diff review round 1 — both rested on a downstream re-check that an
  // unresolvable member value never reaches — and are now killed by fixtures;
  // an argument resting on double-guarding is the shape to distrust here.
  // An `accepted-gap` appearing in this row would be the surface's first and
  // owes its own filing; a NEW equivalent row is a coverage regression to explain.
  // totality.ts declares an EMPTY ledger — every mutant of it is killed.
  mutationSurfaceEnumerate: { equivalent: 3 },
  mutationSurfaceTotality: {},
  // premiseScan, enrolled 2026-08-16. The gate found 8 survivors on the first
  // run; five were REPAID with cases and three more disappeared with the dead
  // duplicated `unclassifiable` rules the gate exposed. What remains is three
  // proven equivalences (a never-empty array guard, a provably-unreachable
  // `unresolved` branch, and a start-offset comparison two sibling nodes cannot
  // tie) plus ONE honest accepted-gap: the `@/` specifier slice, which is not
  // equivalent and has no killing fixture in today's corpus
  // (BL-PREMISESCAN-ALIAS-SLICE-UNCOVERED).
  // 3 -> 2 equivalences on 2026-08-17. The `unresolved` row is RETIRED, not
  // re-keyed: it argued that `unresolved` is provably always empty, and the
  // import-edge repair populates it with every §2.3 and §2.4b reason, so the
  // argument is false rather than relocated. The site itself is gone too — one
  // place now decides the unclassifiable verdict.
  premiseScan: { equivalent: 2 },
  // spawnBounded, enrolled 2026-08-17. EMPTY, and measured rather than asserted:
  // the scoped run scored 12/12 with no survivor to dispose of and no no-op, so
  // there is no ledger row of any kind. The surface's `scoreFloor` is 1 to match,
  // which makes this the strictest declaration in the table — any future row here
  // arrives together with a floor edit and its own written argument, rather than
  // slipping under coarse-floor slack.
  spawnBounded: {},
  // psqlStartupScan: THIRTY equivalence arguments and NO accepted gap. FOUR arrived
  // 2026-08-21 with BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION, and they are
  // ONE argument at four sites rather than four stories: a character-indexing loop's
  // widened bound adds an iteration where `text[index]` is undefined and every branch
  // compares against a one-character literal. A FIFTH survivor of the same family was
  // DELETED rather than blessed -- the dangling-backslash branch it sat in could not
  // change any observable, probed across that family with every case ending WITHOUT a
  // trailing newline -- so the ledger carries four rows where it could have carried
  // five. TOTALISING these four is deliberately REFUSED: it moves termination into the
  // predicate, where an equality-flip mutant hangs and costs the whole measurement.
  // psqlStartupScan (historical): TWENTY-FOUR equivalence arguments and NO accepted gap. SIX arrived
  // with the 2026-08-17 arc, and only one of the six is a disposition rather than new
  // code. Its first re-measure surfaced six survivors: two were
  // repaid with tests pinning the octal escape's digit range at both ends, three are new
  // code whose mutants no consumer can distinguish (an ANSI-C close scan read one past
  // the end, and the word-split reading's two count guards, each redundant with a
  // conjunct beside it), and the sixth is `relational-boundary:2511:54` — whose killing
  // test ran through a consumer the repair DELETED. Its registry row argues equivalence
  // against the two consumers that remain rather than restoring the accepted gap it used
  // to be, so the surface still declares no counted survivor.
  //
  // The whole-diff review's own repairs then added two more of each kind: the compound-array
  // reading's element-walk bound and its empty-element guard are both partners of a condition
  // beside them, while the two Unicode-maximum bounds the same repair introduced were REPAID
  // with tests pinning each guard at the last code point it must still accept.
  //
  // The other EIGHTEEN came from the 2026-08-16 disposition arc (per-site reasons live
  // on the registry rows). Thirteen of
  // the thirty-one first-run survivors were repaid with tests instead. Both counts moved
  // during cross-model review, and in the same direction — each round refuted a written
  // argument with a probe the argument had not been checked against, and each refutation
  // became a test rather than a re-argued row. Equivalents went 19 -> 18
  // (`regex-quantifier-bound:3005:32` IS distinguishable by a malformed three-indicator
  // block-scalar header), and the surface's only accepted gap went 1 -> 0
  // (`relational-boundary:2167:54` IS distinguishable by a trailing backslash at end of
  // input, which the shell leaves literal). So the surface now declares a ledger with no
  // counted survivor at all: an `accepted-gap` appearing here would be this surface's
  // first, owing its own filing AND a `scoreFloor` edit, and a new equivalent row is a
  // coverage regression to explain.
  // THIRTY-ONE from 2026-08-25: BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND adds
  // `doubleQuotedEnd`, the second of the two per-context recognizers the crossing
  // repair introduces, and its loop header is a FURTHER SITE of the same one
  // argument above rather than a new story. The row is owed an explanation because
  // a new equivalent row is a coverage regression: the explanation is that the
  // repair adds a character-indexing loop, and every such loop on this surface has
  // carried this bound. Deletion was refused for the reason the family already
  // records -- the bound is the loop's only terminator, so removing it moves
  // termination into the predicate where an equality-flip mutant hangs -- which is
  // also why the family's fifth member could be deleted and this one cannot: that
  // one sat in a removable branch, this is a loop header. A killing test was
  // attempted over ten inputs driving an unterminated double-quoted span to end of
  // text and could not be built; the row carries that probe.
  psqlStartupScan: { equivalent: 31 },
  // The pane-compaction classifier, enrolled with an EMPTY ledger: it is a pure
  // classifier over injected fixtures, so every survivor is repayable by a test
  // rather than blessable. A row appearing here later is a coverage regression
  // to explain, not a number to bump.
  // 8 -> 6 (2026-08-21): `runCompact`'s `{ exitCode: 0 | 1; message: string }`
  // return type is gone -- the function stopped GATING -- and the two rows keyed
  // to that annotation went with it. It returns `boolean` today; this sentence
  // said "returns nothing" until diff round 3 finding 4, where the round 2
  // repair had falsified it in BOTH independent copies at once, which is exactly
  // the drift this file's independence is supposed to expose. Declared
  // INDEPENDENTLY of the registry, which is the whole point: this number and the
  // rows are two statements of one fact, and the parity gate is what stops them
  // drifting apart silently.
  paneCompactionCore: { equivalent: 6 },
  // 18/2 → 22/0 (2026-08-04, BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY). The two
  // `accepted-gap` rows were the comparator's equal-key blind spot, and adding
  // the message as a third key removed the gap rather than re-accepting it. The
  // comparator also moved into `compareFindings`, whose own mutants split into
  // four sign-not-magnitude and two guarded-branch equivalents — all six with
  // control-flow arguments, which is why the surface now carries NO accepted gap.
  taskContract: { equivalent: 22 },
  // The 2026-08-15 arms surfaces, enrolled with EMPTY ledgers. Both are pure
  // classifiers over literal fixtures, so every survivor is repayable by a test
  // rather than blessable: a row appearing here later is a coverage regression
  // to explain, not a number to bump.
  // citationIntent swept clean: 21/21 killed, no blessed survivor, so a row
  // appearing here later is a coverage regression to repair.
  // The claim sweep, enrolled 2026-08-20 BEFORE its first diff dispatch. Its
  // defect class is exactly "reports OK while the output moved", which is what
  // the source-mutation gate is for.
  //
  // The discovery run left 25 survivors. EIGHTEEN were killed with cases, all
  // of them in the SUITES -- `lib/specLint/claimSweep.ts` is byte-identical
  // across the discovery and confirming runs, so no site was made
  // unrepresentable and no number was bought by reshaping. Three of the
  // eighteen were survivors of a structural blind spot worth naming: the
  // refusal and CLI suites assert through a spawned `tsx` child, and a child
  // reads the module FROM DISK, so the runner's in-memory overlay is invisible
  // to it. A subprocess assertion decides the CHANNEL and can decide nothing
  // about a branch.
  //
  // The remaining SEVEN are argued, under three derived covers stated on the
  // registry row: five are loop ceilings no input can reach, one is a counter
  // whose only reader is a zero test, one is a `continue` whose fall-through is
  // itself a continue. Rule 20's order puts equivalence LAST and these reached
  // it, so this number going UP is a decision someone has to make explicitly
  // rather than a default.
  claimSweep: { equivalent: 7 },
  citationIntent: {},
  // redContract: SEVEN reachability arguments — the GATE bound that only ever
  // runs on GATE_ANY hits, three one-past-the-end scan bounds, and the two
  // extent-containment equalities a marker line can never occupy. No
  // accepted-gap: every other survivor of the first run was repaid by a test.
  redContract: { equivalent: 7 },
  // declaredLimitPins: the declared-limit pin arm, enrolled 2026-08-20 BEFORE the
  // first review dispatch, per the enrolment-precedes-review rule. The empty ledger is
  // DECLARED HERE AHEAD OF THE FIRST SCORED RUN rather than written to match it, which
  // is the whole point: if the run produces survivors, each is repaid with a CASE or
  // argued individually in the registry row, and this number moves deliberately.
  // A survivor on this surface is the gate reporting that the deciding suites cannot
  // see a change — suite inadequacy, not harness noise.
  declaredLimitPins: { equivalent: 5 },
  // fixtureContract: TWO reachability arguments, both the one-past-the-end scan
  // bound redContract already carries three of. The empty ledger was DECLARED
  // before the first scored run per the enrolment-precedes-review rule, and the
  // run refuted it: 13 survivors at 0.8194. Eleven were repaid — eight by cases
  // and three by deleting the duplication that made them unreachable (a second
  // copy of the indent bound, a second copy of parseDoc's, and a pair of
  // nullable fields where a union makes the invalid state unrepresentable) —
  // which is the direction the repair rule prescribes: delete or derive, never
  // bless. No accepted-gap; one appearing here would be this surface's first
  // and owes its own filing.
  fixtureContract: { equivalent: 2 },
  // Counted from the surface, not read back off its ledger: `scripts/lib/
  // ledger-claims-core.ts` has exactly THREE `?? 0` fallbacks whose key is
  // always present -- two in the tip comparator, one in the age loop -- and
  // nothing else that survives. No accepted-gap: every other survivor was
  // repaid by a test, so a row appearing here later is a regression to
  // explain rather than a number to update.
  ledgerClaimsCore: { equivalent: 3 },
  // Enrolled 2026-08-10 with an EMPTY ledger, deliberately. The surface's first
  // run scored 0.607, and the answer was to assert the recognizer's forms
  // directly (tests/docs/interactionTimingScan.test.ts) and to move the CLI out
  // of the mutated module — not to accept survivors. A row appearing here later
  // is therefore a regression to explain, not a number to update.
  interactionTimingScan: { equivalent: 17 },
  // Counted from the surface: SIX reachability arguments -- the three two-field
  // parses at ledger-git.ts:66, :142 and :232, the twice-tested regex group at :259,
  // the `+++ b/` fallthrough at :320, and headRepo's three-way collapse at :365
  // -- plus ONE accepted-gap. The former family of six (the spawn timeouts at
  // :32-34 and MAX_GIT_STDOUT's three literals at :62) is CLOSED: the injectable
  // spawn seam makes every bound observable and
  // tests/scripts/ledgerGitSpawnSeam.test.ts kills all six
  // (chore/guard-completeness-wave, BL-LEDGER-GIT-TIMEOUT-CONSTANTS).
  // The accepted-gap is `logical-connector:259:20:&&>||`, and it is a new family
  // carrying its own backlog entry as this line has always required:
  // BL-LEDGERGIT-FILEOIDS-AMBIENT-REF-VERDICT. It is the surface's first row
  // whose verdict is environment-DEPENDENT, which the row above it claims none
  // are, so it is also the falsifier for that claim. It is killed on a full
  // clone and survives CI's zero-ref checkout, and it closes by construction
  // rather than by a bumped number: give a case an origin ref and delete the row.
  ledgerGit: { equivalent: 6, "accepted-gap": 1 },
  // Counted from the surface: count.ts carries NO blessed survivor at all. Its
  // floor is 1, so any row appearing here is a coverage regression to repair
  // rather than a number to update.
  reviewRoundCount: {},
  // Counted from the surface: exactly TWO reachability arguments -- the
  // directory fallthrough at corpus.ts:79, which lands on the very next line's
  // `isFile()` skip, and the one-past-the-end read at :146, which `?? ""` turns
  // into a blank line the parser never sees. No accepted-gap: this surface's
  // floor is 1, so a gap here would have to be repaid, not blessed.
  reviewRoundCorpus: { equivalent: 2 },
  // Enrolled by the enforcement-pair arc (spec §6.3): the parse contract for
  // Mechanizable parity. Counted from the surface after the diff R1/R2 repairs
  // reshaped the walkers: EIGHT reachability arguments - the visibleText
  // code/html literal guard, six guard-flip legs across the three recursive
  // walkers (label collection is paragraph-scoped and fieldName/
  // beginsWithDecline are paragraph-only, so descending into code/html/delete
  // subtrees finds nothing), and close()'s current-null hygiene. Every other
  // survivor across the enrolment runs was repaid by a named test in
  // tests/reviewRounds/filing.test.ts or the meta-test's message assertions -
  // an accepted-gap row appearing here later needs its own backlog entry.
  reviewRoundFiling: { equivalent: 8 },
  // Counted from the surface: the executed-count oracle carries NO blessed
  // survivor. Its floor is 1, so a row appearing here is a coverage regression
  // to repair rather than a number to update. The surface exists in its current
  // shape BECAUSE of this table: enrolled as one file with its CLI main block
  // inline it scored 0.27, 18 of 19 survivors sitting in code the referring
  // suite can never execute through an import.
  phantomGapExecuted: {},
  // M-wave 2 W-GUARDS (2026-08-10). popoverOverlayExtract: TWO equivalent rows
  // (the template-separator connector flip, which can only inject the token
  // `undefined` where no accept-set token contains it; and the null-key
  // fall-through continue, which reaches only comparisons a null key cannot
  // match). renderedTextHaystack: clean sweep, 17/17 killed after the
  // hardening rows.
  // chore/guard-completeness-wave (2026-08-15). destructiveFileAnalysis: EIGHT
  // reachability arguments — the begin-callback receiver test Rule 1 already rejects
  // ahead of, four fixpoint loop bounds the break-on-no-growth condition makes
  // unreachable, the candidate-declaration count that cannot be zero by construction,
  // Rule 3's tag test whose only other identifier position is a type argument, the
  // ordering comparison two distinct nodes cannot tie, and the candidate-walker
  // parameter leg where widening CANDIDATES cannot widen CHECKED because declQualifies
  // re-derives `.begin`-ness independently. Everything else the runs surfaced was killed
  // by a fixture, or deleted as dead code.
  //
  // The eighth row arrived late and is worth the sentence: CI's whole-gate run found
  // TWELVE unaccepted survivors that three SIGTERM-killed local runs never reached, all
  // in code this branch added. Eleven were real. Nine of those never flip `ok` — they
  // move the rejection from Rule 1 to the containment rule — so only this suite's
  // reason-CLASS pinning could kill them, which is the argument for that discipline.
  destructiveFileAnalysis: { equivalent: 8 },
  // pgCronSmokes: a clean sweep, 14/14 killed on first enrolment. Empty is the honest
  // declaration and a row appearing here later is a regression to explain.
  pgCronSmokes: {},
  popoverOverlayExtract: { equivalent: 2 },
  renderedTextHaystack: {},
  // W-NEARMISS (2026-08-15). Both surfaces were enrolled with an EMPTY ledger, and
  // the note that stood here said both were expected to STAY empty. That was
  // superseded a day later and is DELETED rather than left standing above its own
  // correction: 6d6760019 added two accepted rows to EACH surface when CI found six
  // survivors between them, and moved neither declaration.
  //
  // d342677e0 then diagnosed exactly that, wrote the explanation, repaired
  // fieldNearMiss -- and left rowScanOpener, the row immediately below the comment
  // describing the class, red for five more days. It went unseen because the only
  // assertion covering it ran inside the nightly sharded gate, where a cancelled leg
  // carries no verdict and a leg red for a sibling surface masks every other surface
  // on it.
  //
  // Both are now counted from the registry, the side carrying the arguments:
  // fieldNearMiss holds one loop-exit equivalence and one honest accepted-gap
  // (BL-NEARMISS-EQUAL-SIZE-TOKEN-SUBSET); rowScanOpener holds two reachability
  // equivalences -- a `cells.length > 0` guard that the vacuously-true alignment-row
  // skip makes unreachable, and a redundant `opener` reset. A row appearing here
  // later is still a coverage regression to explain rather than a number to bump,
  // but that sentence is now ENFORCED, by _metaLedgerKindsDeclarationParity.test.ts
  // in the merge-gating suite, instead of trusted.
  fieldNearMiss: { equivalent: 1, "accepted-gap": 1 },
  rowScanOpener: { equivalent: 2 },
  // Counted from the surface: 42 reachability / control-flow arguments and NO accepted
  // gap. The triage ran 84 -> 54 -> 45 -> 44 -> 43 -> 42 survivors, repaying 42 of them
  // with tests rather than blessing them. The last TWO came off because whole-diff review
  // refuted their equivalence arguments with probes: R1's compared a marker width instead
  // of an indent, and R2's assumed a one-token union forced identical digit runs, which
  // SET tokenization does not (multiplicity is discarded). Both are now killed by the
  // shapes those probes used. So a 43rd row is a coverage regression to argue rather than
  // a number to bump, and an `accepted-gap` appearing here at all would be this surface's
  // first, needing its own backlog entry.
  // The prose-consistency arms, enrolled 2026-08-17. The first scored run reported
  // 41 survivors at 0.6306: the module had a large boundary surface (section
  // arithmetic, the probe scan's extent, span edges, index origins, the message's
  // own coordinates) that the gate-shaped fixtures never reached. THIRTY-FIVE were
  // REPAID with cases in a third deciding suite rather than accepted, taking the
  // score to 0.9459. The SIX that remain are proven equivalences in five families
  // and there is NO accepted gap: an unreachable index width, a span-start shift no
  // match can occupy, two one-past-the-end loop bounds, a redundant lastIndex reset,
  // and an initial value read only after it is overwritten. Each family's paired
  // mutant in the OBSERVABLE direction is killed, not accepted.
  specLintUniversals: { equivalent: 6 },
  specLintNumerics: { equivalent: 50 },
  // chore/heavy-orphan-reaper (2026-08-16): the heavy-orphan reaper's decision function,
  // enrolled before this arc's first diff-stage review dispatch. An EMPTY declaration,
  // counted from the surface rather than read back off a run: `accepted` is `[]`, so a row
  // appearing here later is a coverage regression to repay rather than a number to bump,
  // and an `accepted-gap` would be this surface's first and would owe its own backlog entry
  // plus a `scoreFloor` edit.
  //
  // Empty is the honest declaration because the two survivors the first probe found were
  // REMOVED rather than blessed, and both were the same shape — a clause whose deletion or
  // operator swap changes nothing at runtime. `tokens.length < 2` could not differ from
  // `< 1`, and the compound `argv0 === undefined || last === undefined` could not differ
  // from `&&` because the two are undefined together. Taking the last token by reduce over
  // a provably non-empty array left no such clause to mutate. Reaching for an `equivalent`
  // row is the move that would have been wrong here: the surface is small and pure enough
  // that an unkillable mutant is evidence of a dead line, not of an untestable one.
  heavyReapClassify: {},
  // The interactive-scan surfaces, enrolled 2026-08-15. `tapTargetScan` carries
  // NO blessed survivor: its whole body is one map over the shared core's
  // verdicts, and the census suite kills its single mutant, so a row appearing
  // here later is a coverage regression to repair rather than a number to bump.
  tapTargetScan: {},
  // The control-outline regression pin, enrolled 2026-08-16 before its first
  // review dispatch. Declared EMPTY: the module is 21 census rows plus one
  // resolver, and the pin's own suite reds on every site — a row appearing here
  // later is a coverage regression to repair, not a number to bump.
  controlOutlineScan: {},
  // Enrolled 2026-08-22. The first scored run reported 45 unaccepted survivors at 0.8052; nine
  // cases took it to 22 at 0.912, and eight more close every survivor that is KILLABLE. The
  // fourteen that remain are all EQUIVALENCES and there is NO accepted gap: three loop bounds
  // whose extra index reads `undefined`, a sentinel comparison whose two branches coincide, two
  // guards over mandatory capture groups, two `??` fallbacks whose left side is never nullish, a
  // tie-break over a total order, two boundaries dominated by the conjunct beside them, two more
  // dominated one step downstream, and a float boundary outside its function's domain — that last
  // one enumerated over all 256 inputs rather than argued. Per-site arguments, each with its
  // falsifier, are on the registry rows.
  controlOutlineResidue: { equivalent: 14 },
  // The shared core is this arc's mutation-relevant surface: the in-scope
  // predicate, the resolver and both token grammars live here, and three suites
  // decide its verdicts. Its eleven blessed survivors are all ONE shape — a
  // mutation whose only effect is on a value no consumer can distinguish: an
  // empty string added to a token list nothing counts, a loop's off-the-end read
  // of `undefined`, a 2px shift against a 24px gap, a consistent relabelling
  // under a symmetric `min`. Across two rounds SIXTY-SEVEN other survivors were
  // repaid with fixtures rather than rows, so a TWELFTH row here is a gap to
  // repay rather than a number to bump.
  interactiveScanCore: { equivalent: 11 },
  // feat/mutation-playwright-component-mode (2026-08-15): the browser mode's own
  // two modules, enrolled before the arc's first review dispatch. Both declare an
  // EMPTY ledger and a floor of 1 — a row appearing here later is a coverage
  // regression to repair, not a number to update.
  // First run scored 55/57 and 30/39. Ten of the eleven survivors were real
  // coverage gaps and were repaid with cases in the two deciding suites, each
  // proven against its own mutant; the one row below is the only survivor whose
  // mutation no consumer can distinguish. So a SECOND row here is a gap to
  // repay rather than a number to bump.
  browserRegistry: {},
  browserMutate: { equivalent: 1 },
  // The execution-methods derivation, enrolled by this branch. EMPTY, and that is
  // the claim: the first run's single unaccepted survivor
  // (logical-connector:44:43) was repaid with a fixture rather than blessed, and
  // the two survivors predicted from reading the source were killed by fixtures
  // already present. A row appearing here later is a coverage regression to
  // repair, not a number to update.
  executionMethodsDerivation: {},
  // The modal-wait guard (2026-08-16). TWO equivalent rows, matching the
  // registry's accepted[] exactly — this file and the registry are compared for
  // equality by the gate below, so an empty declaration here while the registry
  // carries rows fails deterministically. It did: the accepted rows were added
  // when the score was first measured and this expectation was not updated with
  // them, which diff review caught by static probe
  // (actualKindCounts={"equivalent":2} vs {}). Six of the first run's eight
  // survivors were repaid with cases rather than blessed, so a THIRD row is a
  // gap to repay rather than a number to bump.
  "modal-wait-helper-scan": { equivalent: 2 },
  // The census's AUTHORED half, enrolled 2026-08-17 with the candidate-contract
  // v2 rewrite. Empty, and honestly so: every survivor of its first run was
  // repaid with a deciding case rather than blessed, so a row appearing here
  // later is this surface's first accepted gap and needs its own argument.
  "modal-wait-disposition": {},
  // Fresh enrolment: every survivor is repaid or argued in the registry row's
  // accepted list; a nonzero count appearing here later is a regression to
  // repair rather than a number to bump. First run scored 63/65; both survivors
  // were repaid with fixtures sitting exactly on NODES_MAX, so the re-run is
  // 65/65 with an empty ledger.
  serializeErrorStructure: {},
  // Enrolled 2026-08-16 with an EMPTY ledger: no survivor is blessed, so a row
  // appearing here at all is this surface's first accepted gap and needs its own
  // argument plus a backlog ref.
  sameOriginServerAction: {},
  // The mutation-gate sharding arc's own two guard surfaces, enrolled 2026-08-16
  // BEFORE its first whole-diff review dispatch, so the convergence criterion is
  // a score plus an empty unaccepted-survivor set rather than reviewer
  // imagination. Both declare an EMPTY ledger, deliberately.
  //
  // sourceShardPartition: every branch in the partition is decided by
  // tests/mutation/source/shardPartition.test.ts, so a row appearing here later
  // is a coverage regression to repair, not a number to bump.
  sourceShardPartition: {},
  // shardBudget: the module is pure decision logic with the CLI deliberately in
  // a separate file, so every branch is reachable through the referring suite
  // and a row appearing here is a gap to repay. The separation is not a style
  // choice -- phantomGapExecuted above records that the combined shape scored
  // 0.27, with 18 of 19 survivors in code no import can reach.
  shardBudget: {},
  // sendAuthScan, enrolled 2026-08-20 BEFORE this arc's first diff-review round.
  // EMPTY, and that is a hard acceptance condition rather than a hopeful default:
  // the arc's convergence criterion is the score plus an EMPTY unaccepted-survivor
  // set, and a survivor of the WEAKER-IMPLEMENTATION shape — a node kind
  // unexamined, a comment syntax unrecognized, an import form unfollowed, an
  // exemption reaching past its rule — is BLOCKING and must end up KILLED. Neither
  // `accepted-gap` nor `equivalent` is available for that shape: an accepted gap
  // would re-open, wearing a machine-checked veneer, the class four plan rounds
  // spent bounding, and a mutant that changes which inputs the scanner classifies
  // is not behaviour-preserving by definition. Any row appearing here later is
  // this surface's first and owes its own written argument.
  sendAuthScan: {},
  // The connection census, enrolled 2026-08-21. TWO proven equivalences and NO accepted gap.
  // The first scored run reported 74 survivors (0.7898) and the arc repaid them across three
  // measured rounds — 74, then 24, then 7 — with cases, or by DELETING code no input could
  // reach (six unreachable branches in a declaration-position predicate; a dead
  // `initializer === cur` conjunct). Nothing was blessed to lift the number: an
  // `accepted-gap` row would DEPRESS the score by design, and there are none.
  //
  // The two equivalences are structural, each argued in full on its registry row. An
  // out-of-population import target is unobservable because every consumer of `edges` and
  // `reaches` keys on members of `files`, which such a target is by definition not. And the
  // fixpoint's CLASS-growth signal can never be a pass's last growth: classes and reach
  // cross the same edges at the same one-hop-per-pass rate, so a class arriving at distance
  // N implies a node at distance N, which grows reach in that same pass. The converse does
  // not hold, which is why the two REACH signals are killed rather than accepted, each by
  // its own chain fixture. A third row appearing here owes its own written argument.
  connectionCensus: { equivalent: 2 },
};
