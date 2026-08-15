# Review-round filings — chore/guard-completeness-wave @ ecbddfa1aac4

Third corpus key for this arc. `git merge-base origin/main HEAD` moved twice as `origin/main` was
merged in mid-arc, and the merge-base IS the arc identity, so the rows split across three files and
the numbering restarts in each. The end-to-end diff-stage count for the branch is recorded in the
plan's §12, derived from all three files.

## diff — 4 rounds

**Examined:** R1 (BLOCKING/1), R2 (BLOCKING/1), R3 (BLOCKING/2), R4 (APPROVE/0). R1 and R2 were close-out ACCOUNTING, not code: two corpus arcs documented
where the corpus held three; "16 ledger rows across three surfaces" where four enrolled surfaces
hold 17 (`ledgerClaimsCore` was changed by this branch and missing from the table); a round
breakdown of r1/r2/r3 against a corpus saying r1/r2; "neither file" with three files; "the other two
rows" after a third joined; and a `registry.ts` comment reading 61 mutants that was accurate on
`origin/main` and stale only because this branch added 12 lines to the module under it. R3 found two
REAL executable escapes on the analyzer, each with a probe returning `ok:true` on a discovered file:
`EXECUTION_METHODS` omitted postgres.js's `.file()`, which reads a path and submits its contents as
a query; and `noteTarget` unwrapped `ParenthesizedExpression` only, so a checked factory could be
reassigned to an unchecked client through `as`, `<T>`, `!` or `satisfies` — all four compiling clean
on an assignment LHS under `strict`. R4 reviewed those two repairs and the eight-row siteId
reconciliation they forced, scoped strictly, with everything R1-R3 settled fenced.

**Mechanizable:** none as a new lint arm, but the accounting class was closed STRUCTURALLY rather
than by patching, and that is the transferable part. R1 and R2 were the same shape twice — close-out
prose asserting a count the tree contradicted — and the second round proved that repairing named
instances only queues the next one, because every further round changes the numbers again. The close
is a derivation: the diff-stage review line and the round count are now computed from these corpus
rows at the moment of the final commit, so they cannot drift from the artifact they describe. Any
close-out figure a reviewer can recompute from the repo should be computed, not typed.

**Judgment:** the two rounds spent on accounting were avoidable and are charged to this arc; the two
spent on the analyzer were not. R3's findings were exactly the kind only a probing reviewer finds —
both were silent ACCEPTANCE of a whole-database wipe on a file the guard had discovered, the failure
mode this entire surface exists to prevent, and neither was reachable by reading the mutation score,
because the score was 1.00 with zero unaccepted survivors at the time. That is the honest limit of a
mutation gate as a convergence criterion: it proves the suite pins the code that EXISTS, and says
nothing about an API method nobody enumerated or a syntax form nobody unwrapped. Both classes were
swept to a derivation before repair — the driver's own type surface for execution methods, the
closed set of TypeScript LHS wrapper kinds — so each finding named its complete class rather than
its first instance.
