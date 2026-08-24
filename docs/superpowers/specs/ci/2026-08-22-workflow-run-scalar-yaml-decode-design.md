# Workflow `run:` scalar — decode YAML quoting before the shell lexer

**Ledger row:** `BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE` (BACKLOG.md:282)
**Branch:** `fix/yaml-run-scalar-quoting-decode`
**Surface:** `tests/cross-cutting/psqlStartupFiles/scan.ts` (enrolled guard surface `psqlStartupScan`, `tests/mutation/source/registry.ts:2420`)
**Deciding suite:** `tests/cross-cutting/psqlStartupFileSuppression.test.ts`
**Authored:** 2026-08-22, against `origin/main` at `50ca72a56`.

---

## 1. The defect

Production hands the whole workflow YAML file to the scanner, which reads `run:` values. When the
scalar is QUOTED, the quote characters and the escape grammar belong to YAML, not to the shell. Two
of the scanner's three YAML consumers do not make that distinction: they lex YAML syntax as shell
syntax.

The consequences are the two directions this guard's own consequence bound forbids. A single-quoted
scalar goes SILENT on input a plain scalar correctly signals. A double-quoted scalar FABRICATES a
`PsqlSite` — the guard asserting that an unprotected psql call runs, for a command bash refuses to
parse.

### 1.1 Resolved scope — do not relitigate

Each of these is settled. Verify the citation; do not re-derive the decision.

| Decision | Ratification |
| --- | --- |
| The fabricated site is the WORSE half. A silent miss is the familiar direction and the census bounds it; asserting a call site the shell never executes is the guard lying in the loud direction. | BACKLOG.md:296 |
| Both failing spellings are PRE-EXISTING, not introduced by the attached-redirection arc. All three spellings were run against `scan.ts` at the merge-base and at HEAD; the two failing rows are byte-identical at both revisions. | BACKLOG.md:294; `docs/review-rounds/fix/shell-attached-redirection-target/0ba72c23774f.md:33` |
| The plain-scalar advisory is the predecessor arc's SHIPPED IMPROVEMENT, not a regression to undo. Base is silent there; HEAD emits the advisory. | BACKLOG.md:294 |
| The finding was raised against the attached-redirection diff and REFUTED against it. The refutation stands; the defect is real of the tree either way. That is why it is a ledger row rather than a round on that arc. | BACKLOG.md:284 |
| `matchBrace` / the delimiter walk is OUT OF SCOPE for this arc. `arc-bracecross` rewrites it after this merges; a refactor here is a merge conflict, not an improvement. | Arc brief, seam note |
| `scanWorkflowIndirection` is already YAML-correct and is NOT touched. It reads `node.value` — the DECODED scalar — never a raw slice. | `scan.ts:4215-4222` |
| Advisories are a HARD RED on the live tree, not a soft note. `usage.indirections` must equal `[]`. Any design that emits an advisory for a benign quoted scalar breaks the build for correct authoring. | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:1609-1614` |

---

## 2. Probe record

Every number below is from a command, run at `50ca72a56` in this worktree. Probe scripts are kept
OUTSIDE the repository tree: `collectPsqlUsage` walks all 3620 tracked and untracked files, and an
earlier run of these very probes injected 7 spurious indirections into the live corpus and aborted
the AC-5 digest instrument. That contamination is itself a finding about how this surface is probed,
recorded here so the next author does not rediscover it.

### 2.1 The row's table, reproduced

The row states three spellings without giving the body. The body is recovered by search rather than
assumed: 104 candidate bodies were generated from a shell-significant prefix/suffix alphabet around
a `psql -qAt mydb` command, each rendered into all three YAML spellings, each scanned, and each
handed to `bash -n` as the oracle.

**30 of the 104 bodies reproduce the row's exact signature.** The defect is a family, not one input.
The canonical representative:

```
echo >$(psql -qAt mydb
```

| `run:` scalar | raw slice handed to the shell lexer | bash `-n` | scanner |
| --- | --- | --- | --- |
| plain | `echo >$(psql -qAt mydb` | exit 2 | 0 sites, **1 advisory** — correct |
| single-quoted | `'echo >$(psql -qAt mydb'` | exit 2 | **0 sites, 0 advisories** — silently unsignaled |
| double-quoted | `"echo >$(psql -qAt mydb"` | exit 2 | **1 site** — fabricated |

The fabricated record, in full: `{ line: 7, form: "shell", tokens: ["-qAt", "mydb"],
precedingWords: [], nested: true, suppressesStartupFiles: false }`. It is the worst available
shape — an unprotected psql call inside a command substitution — for a script bash refuses to run.

### 2.2 Why each row comes out the way it does

- **plain.** The attached redirection target `$(psql -qAt mydb` never closes. It is recorded
  unlexable, it carries a substitution opener, so `scanShellIndirection` reports it
  (`scan.ts:3456`, the `hits.push` on `target.unlexable` inside `scanShellIndirection`). The `psql`
  word is inside the swallowed span, so no site is emitted. Correct in both channels: bash refuses
  the script, and the guard reports a target it cannot read.
- **single-quoted.** `scanShellIndirection` lexes the WHOLE FILE as shell text (`scan.ts:3416-3421`).
  YAML's `'` delimiters are read as SHELL single quotes, so the entire run body becomes one literal
  word: no redirection, no target, no advisory. `scanWorkflowSource`'s raw pass reads the same one
  word, so no site either. The decoded pass runs (decoded differs from the raw slice) but produces
  no site, and the ADVISORY channel is never handed the decoded value at all. Total silence — and
  the signal the plain spelling emits is lost for no reason but the quoting.
- **double-quoted.** `scanWorkflowSource` scans the RAW SLICE (`scan.ts:4041`, `4076`). The lexer
  opens a double-quoted span at the leading YAML quote; inside it `$(` is an active opener
  (`scan.ts:1129-1131`), so the substitution scan consumes the YAML CLOSING quote on its way past
  and recovers `psql -qAt mydb` as a command word inside a substitution body that exists only
  because two YAML delimiters were read as shell.

### 2.3 Live-corpus census

```
tracked YAML files: 23 (parse failures: 0)
  run:BLOCK_LITERAL = 41
  run:PLAIN         = 113
  shell:PLAIN       = 16
QUOTED executable scalars repo-wide: 0
```

Derived by walking `git ls-files '*.yml' '*.yaml'`, parsing each with the same `yaml` library the
scanner uses, and tallying the `type` of every scalar under `run:`, `shell:`, `entrypoint:` and
`args:`. **Zero quoted executable scalars exist anywhere in the tree**, and no `BLOCK_FOLDED` run
body exists either.

Two things follow, and both are load-bearing:

1. The exposure is prospective. No live call site is currently hidden or fabricated by this defect,
   which is why the row was filed rather than shipped hot.
2. A repair scoped to the QUOTE_SINGLE / QUOTE_DOUBLE path **cannot move the AC-5 finding set**,
   because the corpus contains no input that reaches it. That is a mechanical claim, settled by
   running the digest, not an argument.

### 2.4 AC-5 finding-set digest — what it hashes, and this repair's effect

`docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts`
digests EVERY array-valued key of `collectPsqlUsage` — sites AND indirections — serialising every
field of every record with keys sorted, deriving the field set from the record rather than
hand-listing it (`baseline-corpus.mts:53-62`). At `50ca72a56` on a clean tree:

```
sites: 76   indirections: 0   unreadable: 0
DIGEST: 8ebe8b08d43e6308aa471112d9f086d0118e6238
PASS: finding set matches the pinned digest over 76 rows.
```

**Declared: this repair does not move the digest, and the AC-5 row below is what gates that claim.** The digest is
therefore not evidence the repair landed — an unchanged digest is expected here. What proves the
repair landed is §6's AC-1 through AC-4, whose fixtures are synthetic because the corpus has no
quoted scalars to draw on.

### 2.5 `yaml` library API, verified

`parseDocument` gives every scalar a `type` from a closed set, and the decoded value on `.value`:

| input | `type` | raw slice | decoded | growth | raw NL | decoded NL |
| --- | --- | --- | --- | --- | --- | --- |
| `run: psql -X db` | `PLAIN` | `psql -X db` | `psql -X db` | 0 | 0 | 0 |
| `run: 'psql -X db'` | `QUOTE_SINGLE` | `'psql -X db'` | `psql -X db` | −2 | 0 | 0 |
| `run: "psql -X db"` | `QUOTE_DOUBLE` | `"psql -X db"` | `psql -X db` | −2 | 0 | 0 |
| `run: "\x70sql -X db"` | `QUOTE_DOUBLE` | `"\x70sql -X db"` | `psql -X db` | −5 | 0 | 0 |
| `run: "psql -X db\npsql -qAt db"` | `QUOTE_DOUBLE` | (as written) | two lines | −3 | **0** | **1** |
| `run: \|` + body | `BLOCK_LITERAL` | header + body | body | −4 | 2 | 1 |
| `run: >` + body | `BLOCK_FOLDED` | header + body | body | −4 | 2 | 1 |
| `run: 'psql -X\n  db'` | `QUOTE_SINGLE` | (two lines) | `psql -X db` | −4 | 1 | 0 |

Two facts the design rests on:

- **A quoted scalar's decoded value is never longer than its raw slice** (growth ≤ −2 always: the
  two delimiters are removed and escapes only shrink). Padding a blanked span is therefore always
  possible.
- **A double-quoted `\n` escape adds a newline the raw slice does not have.** Splicing a decoded
  value back into the file-wide source at the same byte offsets would preserve byte count and
  CHANGE LINE COUNT, shifting every line attribution after it. This is why §3 blanks and rescans
  rather than splicing.

---

## 3. Design

The discriminator is the scalar's YAML STYLE, taken from the YAML parser that already read the
document — not a lookalike re-derived from the source text. This is an accept-set keyed on type, not
on spelling.

### 3.1 Accept-set

| `type` | Is the raw slice shell text? | Treatment |
| --- | --- | --- |
| `PLAIN` | Yes | Unchanged. Raw pass as today; decoded pass as today when the two differ (a multi-line plain scalar folds). |
| `BLOCK_LITERAL` | Yes, after the header line is blanked | Unchanged. The header-blanking regex is `scan.ts:4062`; it keys on the `|`/`>` header text, not on the style name. |
| `BLOCK_FOLDED` | Yes, after the header line is blanked | Unchanged, by the same `scan.ts:4062` header blanking. |
| `QUOTE_SINGLE` | **No** | Raw pass SUPPRESSED. Decoded value only. |
| `QUOTE_DOUBLE` | **No** | Raw pass SUPPRESSED. Decoded value only. |
| anything else | Unknown | Raw pass SUPPRESSED. Never silently treated as shell text. |

`spec:lint` reports `CITATION_SYMBOL_ABSENT` on the two block rows, and the report is right about
the fact: `BLOCK_LITERAL` and `BLOCK_FOLDED` are `yaml` library values (verified in §2.5) and appear
nowhere in `scan.ts`, which keys on the header TEXT rather than on the style name. The cells say so.
Dispositioned, not repaired — renaming the rows to match the code would lose the accept-set's
discriminator, which is the style.

The last row is the accept-set discipline made explicit: a `type` this design did not model is not
assumed to be shell text. `yaml@2.9.0` emits exactly the five above for scalars, so that branch is
unreachable today — which is precisely why the completeness of the set is stated EXECUTABLY rather
than in prose. AC-9 pins the styles the installed library actually emits against the five modelled
here, so an upgrade introducing a sixth fails by name instead of silently taking the not-shell-text
branch for a style that IS shell text. An unreachable "report it" branch was the first draft of this
row and was replaced: a criterion nothing can run is a description.

### 3.2 Site channel — `scanWorkflowSource`

Gate the raw pass on the accept-set. For `QUOTE_SINGLE` and `QUOTE_DOUBLE`, the decoded value is
the only shell text, and the existing decoded pass already scans it, already pins its sites to the
`run:` key's line, and already explains why (`scan.ts:4109-4113`: a decoded line number is an offset
into the decoded value and does not correspond to a physical line).

So the site half of the repair is a suppression, not an addition: the decoded pass stays exactly as
it is and becomes the only pass for quoted scalars. The `verdictIdentity` dedupe
(`scan.ts:4098-4105`) is unaffected — with no raw findings, `seen` is empty and every decoded site
is kept.

This alone closes the double-quoted row: with no raw pass, the fabricated site cannot be produced.

### 3.3 Advisory channel — `scanShellIndirection`

The single-quoted row needs the other half. `scanShellIndirection` lexes the whole file and never
parses YAML, so a quoted scalar's delimiters reach the lexer as shell quotes.

For a YAML file:

1. Parse the document (the same `parseDocument` the workflow reader already uses) and locate every
   EXECUTABLE scalar whose `type` is `QUOTE_SINGLE` or `QUOTE_DOUBLE`. Executable means all four
   keys the scanner already treats as text that runs: `run` and `shell`
   (`EXECUTABLE_WORKFLOW_KEYS`, `scan.ts:3690`) plus `entrypoint` and `args` (`CONTAINER_ARGV_KEYS`).
   The container-argv pair is included because this channel lexes the whole FILE, so their YAML
   delimiters reach the shell lexer exactly as a `run:` scalar's do — probed at base, `args:` PLAIN
   reports one advisory while `args:` DOUBLE and `args:` SINGLE report none. Their SITE channel is
   already correct and is not touched: the container-argv path composes decoded values
   (`scan.ts:3997`), never a raw slice.
2. **Blank each span in SOURCE COORDINATES, before any length-changing transform.** Replace every
   non-newline character with a space and keep newlines: byte count and line count are both
   preserved, so every other word's physical line is unchanged and the lexer sees whitespace where
   YAML syntax used to be. This also removes the channel's ability to fabricate on the double-quoted
   spelling.

   The ordering is load-bearing and easy to get backwards. This channel already rewrites its input
   once — `source.replace(/\\\n[ \t]+/g, "\\\n")` at `scan.ts:3416-3418` strips indentation after
   a continuation — and that rewrite REMOVES BYTES. Parser ranges are offsets into the original
   source, so applying them to the shortened string blanks the wrong region. Measured on a flow
   scalar carrying one physical continuation, with a plain binding on the step after it: the
   transform removes 10 bytes, and the reversed order overruns by exactly that much into the next
   line, leaving `         un: PG=psql; $PG -qAt mydb` where `      - run: PG=psql; ...` stood. The
   key itself is destroyed, so that step stops being a `run:` scalar at all and its binding is never
   read. Blank first, then transform.
3. **Rescan** each blanked scalar's DECODED value through the same indirection machinery, pinning
   every resulting hit to the key's line — the anchoring contract §3.2's decoded site pass already
   follows.

Per-scalar rescanning is more faithful than the file-wide lex, not less: each `run:` scalar is a
separate script that GitHub writes to its own temporary file, so cross-step binding context is
something the file-wide lex invents rather than something the rescan loses.

A benign quoted scalar (`run: "echo hello"`) decodes to text with no unlexable target and no
substitution opener, so it produces nothing. The advisory fires on content, never on quoting — which
is what keeps the hard-red assertion at `psqlStartupFileSuppression.test.ts:1609` from turning
correct authoring into a broken build.

### 3.4 What is deliberately NOT changed

- `scanWorkflowIndirection` — already reads decoded values (`scan.ts:4215-4222`).
- `matchBrace`, `closeDoubleQuoted`, `openerEnd`, `substitutionOpenerEnd` and the delimiter walk —
  the seam reserved for `arc-bracecross`. This arc's diff does not touch them. The double-quoted
  fabrication is repaired by never handing YAML to that walk, not by changing how the walk reads
  a `$(`.
- The plain and block paths, byte for byte. §2.3 is why: they are 100% of the live corpus, and
  the AC-5 row gates the claim.

---

## 4. Documented limits

Carried from round 0. Each is a case where the repair is CONSERVATIVE and SIGNALED, never silently
wrong, and each files here rather than as a review round.

1. **A decoded value's internal line numbers are not physical lines.** Sites and advisories from a
   quoted scalar are pinned to the `run:` key's line. For a multi-line quoted scalar the offending
   text may be several lines below the reported one. This is the shipped anchoring contract for
   decoded findings (`scan.ts:4109-4113`), inherited deliberately.
2. **Cross-step shell state is not modelled.** A binding written in one `run:` scalar and consumed in
   another is invisible to a per-scalar rescan. It is invisible to the file-wide lex too, which
   merely happened to see both spans; GitHub runs them as separate scripts, so the file-wide reading
   was never sound.
3. **`${{ }}` expression substitution is not evaluated.** A quoted scalar whose psql invocation is
   assembled by a GitHub expression is not resolved by this design any more than by the current one.
4. **A `type` outside the five modelled styles is reported, not read.** §3.1's last row. Unreachable
   with `yaml@2.9.0`.
5. **A limit this repair RETIRES, recorded because retiring one is a change of behaviour.** The
   predecessor arc `fix/shell-binding-mixed-quoted-value` declared quoted YAML `run:` scalars a
   documented miss for its binding family, and said in as many words that "recall here needs
   YAML-aware value extraction, a different surface"
   (`docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md:322-328`). This
   arc IS that surface, so the miss becomes a hit — the improving direction. It was found by running
   the deciding suite under a throwaway prototype, not by reading: `spec:lint`'s
   `DECLARED_LIMIT_PIN_UNNAMED` arm named a DIFFERENT pin and was silent on this one. AC-10 is the
   obligation discharged.
6. **Shell text embedded in JS remains documented limit 1 of the predecessor design.** Unchanged
   here (`docs/superpowers/specs/ci/2026-08-21-shell-attached-redirection-target-design.md:457`).
7. **`docs/superpowers/specs/ci/probes/` is not index-checked, so the three script probes this arc
   adds are discoverable only by the rows added to its README by hand.**
   `tests/docs/specsReadmeIndexParity.test.ts` treats a directory as an indexed subsystem only when
   its README carries the literal `| Entry | Date |` header
   (`tests/docs/specsReadmeIndexParity.test.ts:42`, `INDEX_HEADER`); `docs/superpowers/specs/ci/probes/README.md` heads its table
   `| Probe | Question | Feeds |` instead, so no test ranges over that directory and an unlisted
   probe fails nothing. Surfaced by sweeping the parity failure that DID fire, on the sibling
   `docs/superpowers/specs/ci/README.md`. Recorded here rather than filed: the repair is a README header convention
   spanning every probe directory in the corpus, no incident has been measured against it, and the
   process-facing mint bar wants one.
8. **The AC-6 census does not resolve ALIASES, so an aliased quoted executable scalar would be
   counted as zero.** `run: *cmd` parses to an Alias node, `isScalar` is false for it, and the
   census skips the pair
   (`docs/superpowers/specs/ci/probes/2026-08-22-quoted-scalar-census.mts:50`) — while
   `scanWorkflowSource` DOES resolve aliases, so such a scalar is affected by this repair. Unlike
   the other limits here the failure direction is a MISCOUNT rather than a conservative demote, and
   the census underwrites AC-5's digest-neutrality argument, so it is recorded rather than left
   implicit. UNREACHABLE on the live corpus, probed rather than assumed: across all 23 tracked YAML
   files there are **0 alias nodes, 0 aliased executable keys, and 0 non-scalar executable values**
   (the two files matching `&`-ish syntax carry shell `&&`, not anchors). Re-file trigger: the first
   anchor/alias to appear under an executable key in a tracked workflow.

---

## 5. Convergence criterion

**Closed criterion.** The three spellings of §2.1 are each correct with bash as the oracle: the
single-quoted and plain spellings both emit the advisory and no site, the double-quoted spelling
emits no fabricated site, and the live corpus census of §2.3 — 113 `PLAIN` + 41 `BLOCK_LITERAL`
`run:` scalars, 16 `PLAIN` `shell:` scalars, 0 quoted — is restated by command with the AC-5 digest
unmoved. Finite and settled mechanically: a corpus scan and a fixture table, not an argument.

**Probe domain.** The live `.github/workflows/**` and `.github/actions/**` corpus, plus the row's
three spellings and their one-edit neighbours — the 104-body family of §2.1 is exactly that
neighbourhood, enumerated. A probe drawn from outside this domain, or more than one ordinary edit
from an input in it, files to §4 as a documented limit rather than as a finding.

**Threat-model fence.** Accidental workflow authoring by an ordinary contributor: someone quotes a
`run:` scalar because YAML made them, or because a colon or a leading `%` demanded it. Adversarial
YAML — a workflow author deliberately spelling a psql call to evade this guard — is OUT OF SCOPE and
files to §4. Every admissibility clause below cites this fence and the domain above.

**Consequence bound.** Every input is scanned correctly OR signalled, never silently wrong. A
conservative outcome plus a surfaced advisory is a DOCUMENTED LIMIT, not a finding. A finding
requires a probe, drawn from the probe domain, showing either silent corruption (a real call site
missed with nothing reported) or a fabrication (a `PsqlSite` for a command bash does not run).

**Score.** `psqlStartupScan` is an enrolled guard surface, so the convergence criterion for the
diff stage is the mutation score plus an empty unaccepted-survivor set — both machine-computed. A
"the guard does not pin what it claims" finding is admissible only with the surviving mutant that
demonstrates it: an operator and a site, both from the declared set. `pnpm mutation:sites` runs after
EVERY edit to `scan.ts`, comment-only edits included, because registry keys are line-anchored.

---

## 6. Acceptance criteria

| AC | Claim | How it is settled |
| --- | --- | --- |
| AC-1 | A double-quoted `run:` scalar produces NO fabricated site. The §2.1 canonical body, double-quoted, yields 0 sites. | Fixture in the deciding suite asserting `scanWorkflowSource` returns `[]` for that workflow. Red on the current tree, which returns one site with `nested: true`; green once the accept-set check of §3.2 is in. |
| AC-2 | Both QUOTED styles emit the advisory the plain spelling emits, for EVERY executable key: `run`, `shell`, `entrypoint`, `args` — eight cells, each exactly one indirection hit at the KEY's line. | A key x style matrix, not a `run` sample: probed at base all four keys read `plain=1 single=0 double=0`, so a `run`-only acceptance passes an implementation that fixes one key. At least one fixture puts the key and the scalar on DIFFERENT lines, which is the only shape that distinguishes the key-range anchoring this spec requires from `value.range[0]`. |
| AC-3 | Plain and block spellings are unchanged. The plain spelling still yields 0 sites and 1 advisory; a `BLOCK_LITERAL` body still yields its sites at their physical lines. | Fixtures pinning both, plus AC-5. |
| AC-4 | Decoding is not SILENCING, and it is not silencing PER QUOTE STYLE. Six rows, each asserted on `suppressesStartupFiles` rather than on presence: `'psql -X mydb'` (site, protected), `'psql -qAt mydb'` (site, unprotected), **`"psql -qAt mydb"` (site, unprotected)**, **`"\x70sql -qAt mydb"` (site, unprotected)**, `"echo hello"` (nothing), `psql -qAt mydb` plain (site, unprotected). | Fixture table. The two bolded rows are QUOTE_DOUBLE positives and they are what rules out the degenerate implementation: one that handles single quotes correctly and suppresses BOTH passes for double quotes satisfies every other AC, because every other double-quoted assertion expects nothing and the live corpus has no quoted scalar to contradict it. `bash -n` accepts `psql -qAt mydb`, so losing its decoded pass is silent corruption. The `\x70sql` row is decoded-only: its raw slice holds no literal `psql`. |
| AC-5 | The live-corpus finding set is unchanged: 76 sites, 0 indirections, 0 unreadable, digest `8ebe8b08d43e6308aa471112d9f086d0118e6238`. | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238` — exits 1 when the set moves, 2 on a thin or zero-row read. Run on a CLEAN tree; see §2's contamination note. |
| AC-6 | The census of §2.3 is restated by command and still reports zero quoted executable scalars. | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-quoted-scalar-census.mts --expect-quoted 0` — exits 1 naming any quoted scalar it finds, and exits 2 if it finds no executable scalar of any style, because a zero over an empty population describes nothing. A non-zero result retires AC-5's reasoning and is a finding against this spec, not against the diff. |
| AC-7 | Every registry key for `psqlStartupScan` resolves after the final edit. | `pnpm mutation:sites` clean, then `pnpm heavy pnpm mutation:guards` with the score and the unaccepted-survivor set stated in the round-1 diff brief's GUARD SURFACE line. |
| AC-9 | The accept-set of §3.1 is a NAMED exported constant, and it PARTITIONS what the installed `yaml` emits: the constant is DISJOINT from the two quoted styles, and their union EQUALS the set of scalar `type` values the library produces over the §2.5 spelling corpus. | Test in the deciding suite. **Equality, not coverage** — coverage plus disjointness admits an arbitrary extra member in the constant (a `NOT_A_YAML_STYLE` passes both), so a change that weakens default-deny stays green. Under equality, adding a member breaks the union and dropping one breaks it the other way. |
| AC-10 | Every site in the sweep's `DECLARED` list is superseded, and the two declared-limit rows are re-pinned as HITS. | `pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-quoted-run-claim-sweep.mts`. The gate ranges over a FINITE DECLARED LIST, not over what the matcher finds: gating on every hit was unsatisfiable, because 13 of 26 were false positives in unrelated files where `quoted`, `limit` and `zero` merely co-occur, and no edit here could ever mark them. The prose matcher is therefore a DISCOVERY arm — it must still find every declared site it can reach, and it exits 2 if it goes blind — while other candidates are REPORTED for a reading rather than enforced. Exits 1 naming any declared site without a marker; none is marked before the repair. One site whose claim wraps past the matcher window is gated but exempt from the self-test, recorded in the script. |
| AC-8 | This arc's diff to `scan.ts` touches ONLY the declarations it is allowed to touch. | `node docs/superpowers/specs/ci/probes/2026-08-22-seam-check.mjs` — an ALLOWLIST over every top-level statement class, imports and exports included; only trivia is unowned. Three denylist designs preceded it and review found a hole in each, plus one in the allowlist's first cut: a denylist accepts whatever it did not model, and an unowned statement class is exempt by another name. Both hunk sides are read, each against its own revision. Validated against every known escape, including two owner-collision spellings that put a forbidden declaration on a permitted one's line, with a permitted edit passing. |

---

## 7. Meta-test inventory

CREATES: none. EXTENDS: `tests/cross-cutting/psqlStartupFileSuppression.test.ts` — the deciding
suite for the enrolled surface — with the AC-1 through AC-4 fixtures. No new registry is introduced;
the existing `psqlStartupScan` row (`tests/mutation/source/registry.ts:2420-2422`) already names the
source path and the suite, and its `suitePaths` needs no change because the fixtures land in the
suite it already lists.

No advisory-lock surface, no DB surface, no UI surface. **impeccable-gate: N/A — no UI surface.**
