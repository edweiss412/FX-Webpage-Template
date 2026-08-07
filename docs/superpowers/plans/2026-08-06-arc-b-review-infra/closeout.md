# Arc B — review-infra pair: closeout

Branch `feat/review-infra-gates`. Two guard/detector entries, both closed against
measurements rather than against the prose that described them.

## 12. Impeccable gate

impeccable-gate: N/A — no UI surface

Verified against the final diff, not inherited from the plan's prediction: a pure
read-core under `lib/planFences/`, two extractions inside `lib/specLint/`, a CLI
under `scripts/`, the vendored parser inside `scripts/codex-guard.mjs`, tests, and
ledger/spec prose. Nothing under `app/` outside `app/api/**`, nothing under
`components/`, no `@theme` block, no `DESIGN.md` or Tailwind change.

## 13. Observed-RED records

### G1 — the plan-fence gate (`BL-PLAN-SNIPPET-FENCE-GATE`)

RED at G1a: the read-core suite against no implementation. RED at G1b: the
graduation guard, and the planted premise fixtures under
`tests/docs/fixtures/planFences/` — one plan per rule plus an unclosed fence —
which make the gate's ability to FAIL executable rather than assumed.

**Baseline: 3543 rows, 3621 occurrences** across 561 plan files (down from 4044/4122 before the R1 false-positive repairs) (5440 fences, 3587
eligible, 1249 attributed, 0 unplaced, 0 waiver errors). FENCE_EM_DASH 2906,
UNCHECKED_INDEX 145, MANGLED_TEMPLATE 44, DUPLICATE_IMPORT 0; the
UNIMPORTED_IDENTIFIER share fell furthest as the scan stopped reading comments,
string literals, destructured bindings and parameters.

Five mutants, all KILLED: a new violation appended to a real plan; a stale
baseline row; `FROZEN_ROWS` lowered below the live count; a `node:fs` import into
the pure read-core; a rule silenced in the core.

**The corpus run found a false positive the calibration probe had hidden.**
`re.test(x)`, `parts.join("/")` and `Promise.resolve()` are property reads whose
names collide with the known-API registry, and `{ test: 1 }` is a property key.
Counting them made test/resolve/join the top three hits at 360/96/89 of 1353. The
scan takes FREE identifiers now and the count fell to 1027. A rule that fires that
often on correct plans is one nobody keeps enabled — the gate's real failure mode
is being switched off, not being wrong once.

The remaining vitest-global hits are genuine: `vitest.config.ts` sets
`globals: false`, so a fence calling `it(` without importing it does not compile.

### G2 — the vendored CommonMark parse (`BL-CODEX-GUARD-COMMONMARK-PARSE`)

**The probe ran BEFORE the parser, and it contradicted the entry's premise.**
Thirteen fixtures, one per grammar feature limit 12 named, against the SHIPPED
recognizer: **eleven already classified correctly.** The genuine live misses were
HTML blocks, and only HTML blocks — a `VERDICT:` line inside `<pre>` or `<div>`
was read as the reviewer's own.

**Three of the eleven passed for the WRONG MECHANISM**, which is the finding worth
more than the pins. A second probe ran `> VERDICT: APPROVE` with no code construct
anywhere: also `no_verdict`. The marker test is line-anchored, so a `>` prefix
defeats it BEFORE the code decider is consulted, and a quoted line can never carry
a readable verdict. The block-quote container gap is therefore unobservable
through this oracle in the hide direction. Banking those three as container
coverage would have been a guard whose premise is false where it runs — the exact
defect class this arc's sibling arcs spent rounds on. They are pinned as prefix
behavior, under a describe that says so.

The consequence that DOES matter was probed and holds in both old and new code: a
quoted fence cannot swallow the document's real last line.

**Three defects surfaced while the parser was written**, each caught by the
shipped suite, each a silent regression had it landed:

1. Leading whitespace was never consumed when no container opened, so the content
   column read 0 and every root-level indented block was invisible.
2. The indented-block CONTINUATION test read the column where container matching
   stopped rather than where content starts. With an empty stack those differ, so
   a block ended after one line — first line blanked, second read as prose. Worse
   than not stripping at all.
3. List frames ignored CommonMark 5.2 (five or more columns after a marker is
   indented code inside the item, whose content column is marker-plus-one). All 15
   marker-line shapes read as prose without it.

Import surface pinned EXACTLY, with four mutants KILLED: a node_modules import, a
relative sibling, a `require()`, a dynamic `import()`. Two initially reported
SURVIVED because the probe's own anchor string did not exist and the edit was a
silent no-op; the recorded runs assert the mutation applied before believing its
result.

## 14. Acceptance criteria

- [x] **AC-B1** — the meta-test walks the plans tree from disk and fails by name on
      each planted fixture; the five rules ship with their accept-sets in headers;
      the baseline is committed, shrink-only-enforced, and its row count recorded
      in the archive; the waiver is the rule-scoped `plan-fences: ignore RULE —
      reason` token with unknown-rule, empty-reason and suppressed-nothing all
      rejected and waived findings REPORTED; `pnpm plan:fences` reports the same
      findings as the meta-test over the same tree (asserted, both frontends
      compared finding-for-finding); the full-corpus run shows zero non-baseline,
      non-waived hits and both ceilings hold.
- [x] **AC-B2** — `stripCodeBlocks` replaced by the vendored block-level pass with
      both callers' behavior pinned by the existing suites (343 codex-guard tests
      green); the entry's probes are committed fixtures; every MUST-core feature
      covered with its fixture; each MAY-set construct covered or re-documented
      with a probe; §8.3 limit 12 rewritten to the residue; the import-surface
      assertion green; the citation drift repaired in the archive record.
- [x] **AC-B3** — claim handoff per §3 with no undeclared instant; TDD per task;
      conventional commits; both entries archived; `impeccable-gate: N/A` (§12).
      Cross-model diff review APPROVE, real CI green, and main ff'd to `0 0` are
      recorded at merge.

## 15. Cross-model review train

**R1 — BLOCKING, 9 findings, all nine confirmed and repaired.** Whole final diff,
`--stage diff`. Two changed the gate's shape and are worth reading:

- **Finding 2 — the baseline generator defeated its own ratchet.** It regenerated
  the rows AND both "frozen" ceilings from the current corpus, so the shrink-only
  contract was a convention a reviewer had to enforce by reading. The surviving
  mutant was two commands long: add a violation, rerun the generator, commit —
  new row and raised ceilings land together, everything green. It now REFUSES to
  raise either ceiling. **A documented contract that no mechanism enforces is a
  comment**, and this one had been written down three times.
- **Finding 9 — identity keyed on the absolute fence line.** Inserting one blank
  line near the top of a historical plan invalidated every row below it; probed
  at 44 offenders and 44 stale rows on a single file, with no fence changed. A
  mass false positive on correct prose is how a gate gets disabled, which is the
  failure mode this gate's own design notes warned about. Identity is now a
  content digest.

The other seven: a fence indented under a list marker was silently dropped rather
than reported (1); `spec-lint: not-ui` suppressed a code rule it never named (3);
dedent and lazy continuation were conflated so a root fence after `- item`
stripped nothing (4); CRLF messages never closed a fence (5); type-7 HTML
rejected `>` inside a quoted attribute (6); the identifier scan read comments and
string literals and treated destructured bindings and parameters as unbound (7);
and the six-line attribution bound counted only prose, crossing unbounded blanks
(8).

Findings 7 and the earlier member-access repair together took the baseline from
4044 rows to **3543** — a fifth of the original rows were the gate being wrong
about correct code.

Each parser repair ships with a fixture that FAILS against the pre-repair code,
verified by reverting each fix in turn: `revert-crlf`, `revert-dedent`,
`revert-type7`, all KILLED. A fix with no case that would have caught it is a
claim, not a repair.

**Four local suite failures, all self-inflicted, fixed in the same commit:** a
literal NUL byte in a map key, an em dash in a user-visible message string, and
three SHOUTY waiver codes that read as orphan §12.4 producer codes to the catalog
guard. The full local suite is the only reason those were caught before CI.

**R2 — BLOCKING, 6 findings, all six confirmed and repaired.** Scoped to R1's
repairs. Three of the six are the same shape and worth stating together: **a
repair that closes the reported instance without closing its class.**

- **Finding 1** — R1's fix reported unplaceable fences by testing the RAW line, so
  a container-prefixed run (`>     ```ts`) still matched nothing and was still
  dropped silently. It tests the PEELED text now.
- **Finding 2** — R1's generator refusal parsed the committed ceilings and FAILED
  OPEN: an unparseable file read as "no ceiling", so reformatting the two
  constants (a type annotation, a numeric separator) restored the bypass the
  refusal existed to close. It fails CLOSED now — a file that exists but cannot
  be read is an error, never permission. Both bypass mutants were re-probed and
  both are refused, each with its own message.
- **Finding 3** — `not-ui` stopped suppressing (correct) but was left out of the
  set waiver TARGETING skips, so an `ignore` stacked above a `not-ui` line
  targeted that line instead of the fence and silently waived nothing. It is
  recognized-but-inert now.

The other three: the interrupting set omitted ATX headings and thematic breaks,
so `- item` / `# heading` / `<x-tag>` kept a stale list frame (4); the identifier
scan was still unsound in three ways — masking a whole template literal hid
executable code inside `${...}`, a typed parameter bound its TYPE instead of its
name, and a method definition named `expect` still false-fired (5); and a
DUPLICATED fence produced two identical identities so the baseline's single row
pardoned both (6).

Finding 5's third part retired a trade R1 had made deliberately. The stated reason
for not binding method definitions was that `expect(x);` and a definition are the
same shape at line start — true, but they differ by what FOLLOWS the parameter
list, and a body brace is a clean discriminator. **"I considered it and accepted
the false positive" is not the same as "it cannot be done", and the reviewer was
right to refuse the first as an answer to the second.**

Baseline regenerated under the new identity: **3551 rows, 3629 occurrences.**

Six regression cases added, one per finding, each failing against the post-R1
code.

**R3 — BLOCKING, 6 findings, all six confirmed and repaired.** Scoped to R2's
repairs. **Finding 3 is the one to read: R2's finding 4 had never been applied at
all.** The edit was a string replace whose anchor no longer matched, followed by a
success message that reported nothing about whether anything changed — the exact
failure this session had already recorded once, and repeated because that repair
was the one where the assertion was skipped. The reviewer caught it by running
the mutant against the tree instead of reading the commit message.

The repair then needed a second part the finding did not name: widening the
interrupting set was not sufficient, because an ATX heading is a LEAF block and
must also CLOSE the paragraph. With `paragraphOpen` still true, type-7 HTML could
not open on the next line and the example verdict stayed live. Two fixtures pin
both halves.

The other five:

- **Finding 1** — peeling is stateless, so a quote nested inside a list
  (`10. item` then `    >     ```ts`) still peeled one level and was dropped. The
  unplaceable check now strips ALL leading container punctuation; being liberal
  there can only REPORT more, never analyze less.
- **Finding 2** — the fail-closed ceiling check was correct and UNTESTED, so
  deleting it left every suite green. The decision is now a pure function in
  `lib/planFences/baselineGuard.ts` with seven cases, including the reformat
  bypass and the absent-versus-unreadable distinction. **A rule nothing exercises
  is a rule the next person removes**, and the closeout's earlier "one case per
  finding" claim was false for this one.
- **Finding 4** — interpolation masking counted one brace level, so
  `${expect({ a: { b: 1 } })}` was masked wholesale, hiding executable code. Brace
  counting replaced the regex.
- **Finding 5** — method binding missed modifiers (`public`, `private`, …) and did
  not bind the method's OWN parameters.
- **Finding 6** — the occurrence ORDINAL introduced in R2 was order-dependent:
  inserting a waived copy BEFORE a frozen fence renamed the historical one and
  produced an offender AND a stale row for an untouched document. Identity is
  content-only again and the gate compares SUMMED counts, which keeps a duplicate
  visible (a copy doubles the total) without making identity depend on position.
  R2 and R3 fixed the same field in opposite directions; the summing form
  satisfies both.

Baseline regenerated: **3551 rows, 3629 occurrences** — unchanged, which is the
expected result of a repair that changes identity semantics without changing what
the rules find.

**R4 — BLOCKING, 5 findings, all five confirmed and repaired.**

**Finding 1 was a SECOND phantom repair**, and this one is worth the space because the
mechanism differs from R3's. The edit script DID assert its anchor — but a later
assertion in the same script failed, and because the script writes once at the end,
the earlier successful edit was discarded with it. The assertion was fine; the write
granularity was not. Both times, a commit message described a change the commit did
not contain, and both times the reviewer found it by running the mutant against the
tree rather than reading the diff. Everything after this point was verified by
grepping the tree for the new content before reporting success.

**Findings 3, 4 and 5 were the same shape: correct repairs with no case that would
notice their removal.** The reviewer supplied a surviving mutant for each — delete the
generator's decision block, delete `looksLikeFence`'s third disjunct, revert the
modifier and own-parameter binding — and every suite stayed green against all three.
Four regression cases and one integration test now cover them, and the full mutant
set was re-run afterwards:

| mutant | result |
| --- | --- |
| drop `looksLikeFence`'s container-punctuation disjunct | KILLED |
| drop generic-method support | KILLED |
| drop modifier support in method binding | KILLED |
| delete the generator's decision block entirely | KILLED |
| revert to whole-template-literal masking | KILLED |

**Finding 2 closed a real ordering hole R3's own repair opened.** Findings were summed
BEFORE waiver resolution, so a waived duplicate suppressed both occurrences when placed
first and neither when placed second — and in the first arrangement, following the
gate's own stale-row instruction would have removed the historical row and silently
pardoned the unwaived original. Waivers resolve per-fence now and the merge happens
after, which is what "a waiver covers ITS fence" was supposed to mean.

The generator gained `PLAN_FENCES_ROOT` / `PLAN_FENCES_OUT` overrides so the
integration test can drive the real script against a temp tree instead of the
committed baseline.

Round-economy filing at
`docs/review-rounds/feat/review-infra-gates/61281c23e8ce.md`: four rounds, 26 findings,
26 accepted, 0 refuted.

