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

**Baseline: 4044 rows, 4122 occurrences** across 561 plan files (5440 fences, 3587
eligible, 1249 attributed, 0 unplaced, 0 waiver errors). FENCE_EM_DASH 2906,
UNIMPORTED_IDENTIFIER 1027, UNCHECKED_INDEX 145, MANGLED_TEMPLATE 44,
DUPLICATE_IMPORT 0.

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
