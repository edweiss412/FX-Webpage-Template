# Arc state — fix/shell-lexer-quoted-value-recall, written before a context compaction

Durable because a compaction would otherwise cost the derivations below, and a future
reader would re-derive all of them. Every figure here is derived or quoted, not recalled.

## Score, and how it is derived

**74 mutants, 26 `equivalent`, 0 accepted gap, 48 counted, 48 killed, score 1.0000,
`scoreFloor` 1.** A GREEN gate prints no counts, so these come from the shipped
registry and generator: `enumerateSites` + `generateMutants` give the mutant total,
the registry gives the row count, `counted = mutants − rows`, and `killed = counted`
because the run cleared the floor. Cross-check from the 25-row run, which scored
0.9795918 = 48/49 with one unaccepted survivor: restoring that row moves 49 → 48
counted and the survivor into the ledger, giving 48/48.

## Provenance, stated with its limits

Stamp is DERIVED, not hand-listed: registry row, `sourcePath`, `suitePaths`, and the
transitive local imports of each — **seven files**. An earlier three-blob stamp
(source, suite, registry) omitted four real inputs: `tests/_shared/premise.ts`,
`tests/_shared/stripComments.ts`, `tests/mutation/source/ledger.ts`, and
`tests/mutation/source/operators.ts` — the last of which DECLARES the operators the
score is a function of. The set that reads as obvious is the set that omits.

- Final run stamps, BEFORE == AFTER: `scan.ts` `a1f9db0c`, suite `cb45f9ea`,
  registry `b38331b3d1`, plus the four above unchanged.
- **Degraded stamp, one run:** an intermediate run's AFTER stamp was lost when its
  wrapper was killed during an unrelated poller cleanup. Taken by hand the pair
  closes, but it is no longer emitted by the same invocation. Recorded as degraded,
  not equivalent.
- **Uncoverable input:** the deciding suite reads the LIVE REPOSITORY TREE for its
  census assertions, so the repo is an input no stamp can cover.

## The flaky site — do not "fix" this by removing the row

`relational-boundary:3578:35:<><=`, the `depth < 32` guard in the YAML alias walk's
`resolved` helper. Four observations, byte-identical `scan.ts` `a1f9db0c` and suite
`cb45f9ea` throughout:

| run | ledger state | verdict |
| --- | --- | --- |
| discovery | 27 rows | SURVIVOR |
| confirming | 26 rows | STALE, i.e. KILLED |
| re-run after removal | 25 rows | UNACCEPTED SURVIVOR, i.e. SURVIVES |
| hand-applied `depth <= 32` ×3 | n/a | survives 3/3 |

Three of four say it survives. The row is RESTORED. **A single stale-row report is
not grounds to remove it** — this arc removed it on one such report and had to
reverse. Folded into `BL-MUTATION-SCORE-NONDETERMINISM` as a second surface, and a
cleaner reproduction than the `ledgerGit` one because two runs of the RUNNER ITSELF
disagree with identical inputs, needing no third-party instrument.

**Instruments that CANNOT adjudicate this**, so nobody re-tries them: a hand-applied
mutant uses raw file line numbers, and a local `enumerateSites` call reproduces none
of the runner's site IDs — it finds no site at column 35 or 31 at all. Settling it
needs the runner's own control harness. Out of scope for this PR.

## The vanishing site is not metric-gaming

Round 3's F2 repair replaced `target.offset < effective.offset` with an EQUALITY on
the producing operator's offset, so `relational-boundary` no longer generates a site
there and one row retired. The site went as a CONSEQUENCE of a correctness fix — the
equality is what stops `read -r PG <<< notpsql 2<<< psql` reporting where bash binds
`notpsql`. The discriminator is whether behaviour changed; it did. A reshape that
preserved behaviour while removing a site would be the forbidden thing.

## Verified state at the time of writing

- Deciding suite **975** passed; docs meta 27/27; typecheck clean; prettier clean.
- Weaker-implementation audit **9/9 PROVEN**; round-3 both-directions proof **2/2
  PROVEN**, source blob-verified after every case.
- Red-targets re-read, not merely resolved: `scan.ts:1584` `pendingTarget = redirection[0];`,
  `scan.ts:1329` the brace-expansion `if`, `scan.ts:2830` `function valueBinds`.
- Stale-number sweep: **0 documents need attention**, per-document controls, document
  set and exemptions both derived.
- `origin/main` at `4dfd784ed`, no conflict; all twelve required contexts green on the
  previously pushed commit.

## Next action

Dispatch diff **round 4** with `_briefs/2026-08-20-arc-shell-diff-r4.md`,
`--stage diff --round 4`. **R4 is the last round on the guard-sufficiency axis:**
another necessary-not-sufficient finding means DECLINE TO FIRE plus a documented
limit, not a fourth repair. A round-economy filing in
`docs/review-rounds/fix/shell-lexer-quoted-value-recall/4dfd784ed062.md` becomes owed
once r4's row lands (four counted diff rounds) — write it after the row exists.
Never stage with `git add -A`: the scratch shard file is untracked by design.
