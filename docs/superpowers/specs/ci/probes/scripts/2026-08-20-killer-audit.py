#!/usr/bin/env python3
"""THE KILLER AUDIT (plan Task 9 step 3, spec AC-7): every weaker implementation
spec section 6 names, EXECUTED against the shipped tests rather than tabulated.

WHAT THIS ANSWERS, AND WHY A TABLE CANNOT.  Spec section 6 names, for each rule,
the strictly weaker implementation its fixtures must kill.  A plan-side pass over
that table is a cover on the PLAN and it cannot see what actually ships: a table
that names the case and a suite that omits it is invisible to plan review (the
plan is correct) and invisible to a fixture audit (the fixture does not exist).
So the row list below is DERIVED by reading section 6's table, never from recall
-- and the derivation is RECONCILED AT RUN TIME rather than asserted: the
pre-flight PARSES that table out of the live spec and requires it to agree with
the list below row for row, in BOTH directions and in order (see
`reconcile_rows_against_spec`).  Each row carries three things:

  1. the WEAKER IMPLEMENTATION, quoted from the table's own middle column;
  2. the KILLING CHECK -- an exact test file and an exact `it(...)` title,
     verified to exist by reading the suite;
  3. a MUTANT RECIPE -- an exact, unique string replacement against shipped
     source that IMPLEMENTS that weaker behaviour.

Then it does the only thing that turns a claim into a proof: apply the recipe,
run ONLY that check, REQUIRE A FAILURE, revert, re-run and require a pass.

THE THREE STATES ARE MEASURED, NOT READ (spec section 6, AC-7):

  PROVEN               the check exists AND its red was OBSERVED IN THIS RUN.
  PRESENT BUT UNPROVEN a check exists and no recipe is named, so nothing was
                       observed.  That is a CLAIM, and it fails in the direction
                       that looks green.
  ABSENT               no check covers the row.

A SURVIVING MUTANT IS REPORTED AS ABSENT, and the reason line says which of the
two roads it came down.  A check the weaker implementation PASSES does not cover
the row -- presence is not adequacy, applied to this audit itself -- and calling
it PRESENT BUT UNPROVEN would file the worst outcome under the middle state.

WHY THE DELETION CONTROL IS KEPT AND WHAT IT DOES NOT PROVE.  Deleting a shipped
check yields ABSENT under a correct audit AND under an audit that labels every
present check PROVEN, because deleting the check removes it from both.  So the
control answers exactly one question -- does the reporting path work -- and it is
kept for that and described as that.  What makes PROVEN attributable is the
observed red, not the control.

THIS SCRIPT MUTATES SHIPPED SOURCE AND ONE SHIPPED TEST, AND IT RESTORES THEM ON
EVERY EXIT PATH -- normal return, exception, SIGINT, SIGTERM.  The originals are
captured in memory before the first edit and written back under `finally`, then
verified by SHA-256.  A crashed audit that left a mutated tree would hand the
next reader a defect that looks like theirs.

IT MUST NOT RUN WHILE A SCORED MUTATION RUN IS LIVE.  `pnpm mutation:guards`
overlays this same module; two writers in one working tree is the race invariant
11 exists to prevent, and here it silently corrupts a measurement rather than
failing loudly.  The pre-flight refuses on a dirty tree under the mutated paths;
`--allow-dirty` overrides it and is an assertion by the caller that no
measurement is in flight.

HEAVY-PHASE CLASSIFICATION (AGENTS.md).  Every vitest invocation here is SCOPED
to one file with an explicit `-t`, which the heavy-phase rule leaves unwrapped by
name.  Do NOT wrap this script in `pnpm heavy`: it holds its slot across ~40
sequential boots while doing nothing a full suite does.

USAGE
  python3 docs/superpowers/specs/ci/probes/scripts/2026-08-20-killer-audit.py --anchors
      Read-only.  Counts every recipe anchor and every cited `it(...)` title in
      the LIVE files and requires each to occur EXACTLY ONCE.  This is plan Task
      9 step 7, and it is run BEFORE the run it waits on rather than when it
      lands: a staged script is a citation into a moving file, and a wrong anchor
      either matches NOTHING, which you notice, or matches SOMEWHERE ELSE, which
      you do not.

  python3 docs/superpowers/specs/ci/probes/scripts/2026-08-20-killer-audit.py
      The audit.  Mutates, runs, reverts, restores, tallies.  Exit 1 if any row
      is ABSENT; exit 2 on an infrastructure fault (a dirty tree, an anchor that
      is not unique, a revert that did not restore, a check that fails on the
      PRISTINE tree).

ANCHORING IS ON EXACT STRING CONTENT, NEVER ON A LINE NUMBER.  Task 1 rewrites
this module's header docblock and shifts every line in it; a line-numbered recipe
would then edit whatever moved into place, which is the failure that leaves no
trace.  Every `from` string is asserted to occur EXACTLY ONCE before it is
applied, and a count of 0 or 2+ refuses loudly rather than guessing.
"""
import atexit
import hashlib
import pathlib
import re
import signal
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Optional


# ---------------------------------------------------------------------------
# Repo root, by SEARCH rather than by parent index.  `parents[6]` is a line-number
# citation wearing a different costume: move this script one directory and it
# silently resolves to the wrong tree.
# ---------------------------------------------------------------------------
def _repo_root() -> pathlib.Path:
    here = pathlib.Path(__file__).resolve()
    for candidate in here.parents:
        if (candidate / "package.json").is_file() and (
            candidate / "lib/specLint/claimSweep.ts"
        ).is_file():
            return candidate
    print("FAIL  no repo root above this script carries package.json + lib/specLint/claimSweep.ts")
    sys.exit(2)


ROOT = _repo_root()

CORE = "lib/specLint/claimSweep.ts"
ADAPTER = "scripts/spec-lint.ts"

#: Every path this audit may write.  The pre-flight reads them, the restore
#: writes them, and nothing else is touched.
# MUTABLE_PATHS is DERIVED from the rows, below, once ROWS and CONTROL_FILE exist.
# It is declared here only so the name is bound before the helpers that close over it.
MUTABLE_PATHS: list[str] = []


@dataclass(frozen=True)
class Row:
    """One data row of spec section 6's weaker-implementation table.

    `rule` and `weaker` are QUOTED from the table's first two columns.  They are
    transcribed rather than paraphrased so that a reader diffing this list
    against the spec sees drift as a text difference rather than having to judge
    whether two summaries mean the same thing.  `reconcile_rows_against_spec`
    does that diff mechanically, before any mutation, so drift is a loud refusal
    rather than something a reader has to happen to notice.
    """

    rule: str
    weaker: str
    check_file: Optional[str]
    check_title: Optional[str]
    target: Optional[str]
    frm: Optional[str]
    to: Optional[str]
    #: WHY this replacement IS that weaker implementation, and what the check
    #: observes when it is in place.  A recipe nobody can tie to the table's
    #: prose is an edit, not a mutant.
    why: str
    #: Set only where the row has no shipped check.  Names what would close it.
    pending: Optional[str] = None


# ---------------------------------------------------------------------------
# THE ROWS.  Order and wording follow spec section 6's table top to bottom, and
# `reconcile_rows_against_spec` REQUIRES that, against the parsed live table,
# before anything is mutated.
#
# THERE IS NO HAND-TYPED ROW COUNT HERE.  The one this replaced -- `EXPECTED_ROWS
# = 20` -- was a second transcription of the same table, so the pre-flight
# compared two hand-written numbers to each other and agreed with itself: an
# added row read `actual_spec_rows=21, ROWS=20, EXPECTED_ROWS=20,
# preflight_mismatch=False`, and removals, reorderings and rewordings escaped the
# same way.  A count re-derived from the parse would not have been an independent
# check either, so the check below is the ROW TEXT matched both ways, never a
# number.
# ---------------------------------------------------------------------------
ROWS = [
    Row(
        rule="§3.0 refusal, `N === M`",
        weaker="accept it and run",
        check_file="tests/specLint/claimSweepRefusals.test.ts",
        check_title="REFUSES, naming the value standing on both sides",
        target=CORE,
        frm="  if (d.superseded !== null && d.replacement !== null && d.superseded === d.replacement) {",
        to="  if (false) {",
        why=(
            "Dead-branching the first refusal IS 'accept it and run': the declaration falls "
            "through to a null reason and the adapter runs it, which is the silent clean the "
            "refusal exists to prevent. The predicate-level check is cited because it is the "
            "fastest observation of the same branch the CLI case ('refuses by name, naming BOTH "
            "values, and emits no finding') exercises through a real subprocess."
        ),
    ),
    Row(
        rule="§3.0 refusal, `--claim-about` without `--repair`",
        weaker="run anyway on an inferred exclusion",
        check_file="tests/specLint/claimSweepRefusals.test.ts",
        check_title="REFUSES, naming the identifier rather than the flag alone",
        target=CORE,
        frm="  if (d.claimAbout !== null && d.repair === null) {",
        to="  if (false) {",
        why=(
            "With this branch dead, `--claim-about` with no `--repair` returns no reason and the "
            "run proceeds with EMPTY spans -- the incident's nine occurrences, including the five "
            "the repair itself wrote. The check observes the reason line going null."
        ),
    ),
    Row(
        rule="§2.0 population",
        weaker="measure the corpus INCLUDING the arm's own documents",
        check_file="tests/docs/_metaClaimSweepCorpusCovers.test.ts",
        check_title="measures the enumeration MINUS those documents, as a relation not a count",
        target="docs/superpowers/specs/ci/probes/scripts/2026-08-20-population-census.py",
        frm="    population = [p for p in tracked if p not in ARC_DOCUMENTS]",
        to="    population = list(tracked)",
        why=(
            "The check RUNS the census and reads its report, rather than re-deriving the "
            "population from `ARC_DOCUMENTS` and then checking it excludes `ARC_DOCUMENTS` -- "
            "which is consistent by construction and passes against a census that excludes "
            "nothing, the exact weaker implementation this row names. The recipe makes the "
            "census measure the whole enumeration; its own parity gate then fails, it exits "
            "non-zero, and the check reports it."
        ),
        pending=(
            "plan Task 9 step 4 lands the ONE `ARC_DOCUMENTS` authority plus the parity assertion "
            "and both directions of the relation; this row is re-pointed at that check in the same "
            "commit."
        ),
    ),
    Row(
        rule="§3.2 attribution",
        weaker='word the advisory as "the repair changed this claim"',
        check_file="tests/specLint/claimSweepNamed.test.ts",
        check_title="says the DECLARATION named the changed claim, and says nothing more, on every finding",
        target=CORE,
        frm="            message: `${doc.path}:${i + 1} mentions ${identifier}, DECLARED as a claim this repair changed`,",
        to="            message: `${doc.path}:${i + 1} mentions ${identifier}, a claim THIS REPAIR CHANGED`,",
        why=(
            "The replacement wording is the table's weaker form verbatim: it attributes the "
            "changed claim to the ARM's analysis rather than to the DECLARATION, which is a claim "
            "the arm cannot make (spec section 5 item 8, measured on HoverHelp.tsx:562). The "
            "occurrences stay correct under this mutant, which is exactly why no occurrence "
            "assertion can kill it and why this row needs its own check."
        ),
    ),
    Row(
        rule="§3.3 document set, resolution",
        weaker="INFER the peers from citations, stem, or date",
        check_file="tests/specLint/claimSweepCli.test.ts",
        check_title="sweeps all declared peers, not just the last",
        target=ADAPTER,
        frm="          if (seen.has(peer)) return [];",
        to="          return [];",
        why=(
            "Dropping every `--also` peer reproduces what all three inference rules get wrong on "
            "the incident's own arc, in the direction that matters: the plan -- where 7 of the 9 "
            "survivors are -- is not in the swept set. The recipe implements the OBSERVABLE "
            "CONSEQUENCE of an inferring resolver rather than building one, and says so."
        ),
    ),
    Row(
        rule="§3.4 unreadable peer",
        weaker="continue silently when `readFileLines()` returns null",
        check_file="tests/specLint/claimSweepDocumentSet.test.ts",
        check_title="emits exactly one SWEEP_DOCUMENT_UNREADABLE, naming the peer",
        target=CORE,
        frm="    if (doc.lines !== null) continue;",
        to="    continue;",
        why=(
            "An unconditional `continue` IS the silent implementation: no code is emitted for a "
            "document nobody read, while every occurrence-code assertion in the table still "
            "passes. The check observes the missing third code."
        ),
    ),
    Row(
        rule="§2.0 fixture literals",
        weaker="key the no-collision check on a NONCE token",
        check_file="tests/docs/_metaClaimSweepCorpusCovers.test.ts",
        check_title="finds NO synthetic literal anywhere in the corpus",
        target="tests/specLint/claimSweepLiterals.ts",
        frm='export const ABSENT_IDENTIFIER = "components/never/NoSuchFile.tsx:4242";',
        to='export const ABSENT_IDENTIFIER = "## 1. Problem";',
        why=(
            "The cover is keyed on the exported ARRAY, so a literal that carries no marker is "
            "still in the population -- which is what a nonce-keyed check cannot do. The recipe "
            "points one array member at a heading that occurs across the corpus outside this "
            "arc's documents, and the cover must report the collision. It targets the member by "
            "VALUE rather than adding one, so the row index the check names stays put."
        ),
        pending=(
            "plan Task 9 step 4 lands the collision cover keyed on that array, WITH the "
            "outside-arc positive control that makes its zero attributable; this row is re-pointed "
            "at it in the same commit."
        ),
    ),
    Row(
        rule="§3.4 signal inventory",
        weaker="hand-maintain the table and assert it is derived",
        check_file="tests/specLint/claimSweepIdentity.test.ts",
        check_title="reconciles in BOTH directions against the module's own exported codes",
        target=CORE,
        frm='  "SWEEP_DOCUMENT_UNREADABLE",\n  "CLAIM_IDENTIFIER_NOT_FOUND",',
        to='  "SWEEP_DOCUMENT_UNREADABLE_V2",\n  "CLAIM_IDENTIFIER_NOT_FOUND",',
        why=(
            "Renaming an exported code is the drift a hand-maintained table cannot see: section "
            "3.4's FINDING row still names `SWEEP_DOCUMENT_UNREADABLE`, which the module no longer "
            "exports. A reconciliation that merely ASSERTS it is derived reports nothing here; the "
            "shipped one must report both names."
        ),
    ),
    Row(
        rule="§3.4 accept-set",
        weaker="emit a fifth code, or drop one",
        check_file="tests/specLint/claimSweepIdentity.test.ts",
        check_title="emits exactly those codes over the whole fixture corpus, and no others",
        target=CORE,
        frm='  "CLAIM_IDENTIFIER_NOT_FOUND",\n] as const;',
        to='  "CLAIM_IDENTIFIER_NOT_FOUND",\n  "CLAIM_SWEEP_FIFTH_CODE",\n] as const;',
        why=(
            "A fifth member of the exported list that nothing emits breaks the equality between "
            "the EMITTED set and the module's OWN list. Distinct from the inventory row above: "
            "that one drifts the table against the code, this one drifts the code against what "
            "the arm actually emits."
        ),
    ),
    Row(
        rule="§3.4 not-found signal",
        weaker="match exactly and stay SILENT when nothing matches",
        check_file="tests/specLint/claimSweepNotFound.test.ts",
        check_title="emits EXACTLY ONE not-found finding",
        target=CORE,
        frm="  if (exactOccurrences === 0) {",
        to="  if (false) {",
        why=(
            "Dead-branching the fourth code IS 'stay silent when nothing matches'. The silent arm "
            "passes every occurrence assertion in the named half's suite, because there are no "
            "occurrences to assert on -- so only a check on the CODE itself can see it."
        ),
    ),
    Row(
        rule="§3.2 identity",
        weaker="match the identifier as a SUBSTRING",
        check_file="tests/specLint/claimSweepNamed.test.ts",
        check_title="reports nothing for a one-character truncation that matches nine lines as a substring",
        target=CORE,
        frm=r"const IDENTIFIER_BOUNDARY = /[A-Za-z0-9_.:\-]/;",
        to=r"const IDENTIFIER_BOUNDARY = /[^\s\S]/;",
        why=(
            "A boundary alphabet that matches NOTHING makes every neighbour legal, which is "
            "substring matching exactly. The truncated `…tsx:96` then reports on all nine lines "
            "it occurs in as a substring -- the ordinary CLI typo turned into nine wrong "
            "advisories."
        ),
    ),
    Row(
        rule="§3.0 declared input",
        weaker="INFER the pair from the repair's diff",
        check_file="tests/specLint/claimSweepRefusals.test.ts",
        check_title="REFUSES, naming the rev",
        target=CORE,
        frm="  if (d.repair !== null && d.superseded === null && d.claimAbout === null) {",
        to="  if (false) {",
        why=(
            "With the third refusal dead, `--repair` with nothing declared returns no reason and "
            "the run proceeds -- which is the shape an inferring implementation has, since the "
            "only way to report on that invocation is to pick a pair out of the commit's own diff. "
            "The check observes the reason line going null."
        ),
    ),
    Row(
        rule="§3.0 declared input",
        weaker="accept a declaration and ignore `--repair`",
        check_file="tests/specLint/claimSweepCli.test.ts",
        check_title="yields the four sites outside the repair's spans, end to end",
        target=ADAPTER,
        frm="          touchedLines:\n            declared.repair === null",
        to="          touchedLines:\n            true",
        why=(
            "Forcing the ternary's condition true parses `--repair` and then IGNORES it: the "
            "record carries an empty span map, so the repair's own five new claims are reported "
            "alongside the four real survivors. Nine, where the incident's acceptance criterion "
            "is four."
        ),
    ),
    Row(
        rule="§3.1 numeric half",
        weaker="report every surviving N (the naive form)",
        check_file="tests/specLint/claimSweepNumeric.test.ts",
        check_title="is silent on a sentence carrying BOTH values",
        target=CORE,
        frm="        if (carries(sentence, replacement, NUMERIC_BOUNDARY)) continue;",
        to="        if (false && carries(sentence, replacement, NUMERIC_BOUNDARY)) continue;",
        why=(
            "Short-circuiting the co-occurrence test leaves the naive form: every occurrence of "
            "the superseded value is reported, transition sentences included. That is the 923-site "
            "corpus shape that switches the arm off on first contact."
        ),
    ),
    Row(
        rule="§3.1 identity",
        weaker="key a finding `(code, doc, line, token)`, or dedup by line",
        check_file="tests/specLint/claimSweepIdentity.test.ts",
        check_title="reports TWICE on a line carrying the token twice in one sentence, at two DISTINCT columns",
        target=CORE,
        frm="      for (const at of hits) {",
        to="      for (const at of hits.slice(0, 1)) {",
        why=(
            "Taking only the first hit on a line IS a line-keyed identity: one finding per line, "
            "and the loss arrives looking like a legitimate dedup. Measured live at eight lines "
            "and eighteen occurrences, where ten vanish."
        ),
    ),
    Row(
        rule="§3.1 sentence scope",
        weaker="scope to the LINE instead",
        check_file="tests/specLint/claimSweepNumeric.test.ts",
        check_title="reports the stale occurrence on a line that also carries a transition sentence",
        target=CORE,
        frm="        const sentence = span === undefined ? line : line.slice(span.start, span.end);",
        to="        const sentence = line;",
        why=(
            "Widening the co-occurrence scope from the sentence to the whole line is line scope "
            "exactly. The incident's spec:220 carries one excluded and one surviving occurrence, "
            "so a line-scoped arm gets that line wrong in both directions at once."
        ),
    ),
    Row(
        rule="§3.1 discriminator",
        weaker="exclude anything inside the repair's diff",
        check_file="tests/specLint/claimSweepNumeric.test.ts",
        check_title="still reports the survivors that sit inside the repair's OWN hunks",
        target=CORE,
        frm="      const hits = boundedOccurrences(line, superseded, NUMERIC_BOUNDARY);",
        to="      const hits = record.touchedLines.get(doc.path)?.has(i + 1) === true ? [] : boundedOccurrences(line, superseded, NUMERIC_BOUNDARY);",
        why=(
            "Gating the numeric half's occurrences on the repair's spans is the cheaper "
            "diff-status rule the table names. The spec's consequence bound is an ADDED line in "
            "fede5f084's own hunk with the 58 left standing, so this mutant loses survivors the "
            "acceptance criterion requires."
        ),
    ),
    Row(
        rule="§3.2 named half",
        weaker="report every occurrence of the identifier",
        check_file="tests/specLint/claimSweepNamed.test.ts",
        check_title="excludes every occurrence inside the repair's hunks",
        target=CORE,
        frm="        if (touched !== undefined && touched.has(i + 1)) continue;",
        to="        if (false && touched !== undefined && touched.has(i + 1)) continue;",
        why=(
            "Short-circuiting the span exclusion reports every occurrence, the repair's OWN new "
            "claim included. Distinct from the adapter row above: that one supplies no spans, this "
            "one is handed correct spans and does not use them."
        ),
    ),
    Row(
        rule="§3.3 document set",
        weaker="sweep the spec only",
        check_file="tests/specLint/claimSweepDocumentSet.test.ts",
        check_title="includes the PLAN peer's survivors and EXCLUDES the undeclared sibling",
        target=CORE,
        frm=(
            "  for (const doc of docs) {\n"
            "    if (doc.lines === null) continue;\n"
            "    for (let i = 0; i < doc.lines.length; i += 1) {\n"
            "      const line = doc.lines[i]!;"
        ),
        to=(
            "  for (const doc of docs.slice(0, 1)) {\n"
            "    if (doc.lines === null) continue;\n"
            "    for (let i = 0; i < doc.lines.length; i += 1) {\n"
            "      const line = doc.lines[i]!;"
        ),
        why=(
            "The incident fixture's document order is [spec, plan, probe], so sweeping only the "
            "first document IS 'sweep the spec only' -- and the plan is where 7 of the 9 survivors "
            "are. The anchor spans four lines because `for (const doc of docs) {` alone occurs "
            "three times in the module."
        ),
    ),
    Row(
        rule="§3.4 severity",
        weaker="emit `fail`",
        check_file="tests/specLint/claimSweepIdentity.test.ts",
        check_title="is advisory on EVERY emitted finding, asserted structurally",
        target=CORE,
        frm='  return { check: "claimSweep", severity: "advisory", ...f };',
        to='  return { check: "claimSweep", severity: "fail", ...f };',
        why=(
            "Severity is set in ONE place, so this single edit makes every finding a `fail` -- an "
            "arm that blocks a merge on a judgement only the author can make. The check asserts "
            "over the emitted SET rather than sampling, so one escaped finding is enough."
        ),
    ),
]

# ---------------------------------------------------------------------------
# THE DELETION CONTROL.  One shipped check is excised, the row that cites it is
# re-classified, ABSENT is required, and the file is restored.
#
# It is deliberately NOT one of the recipe rows' targets in the mutation phase --
# it runs last, after every recipe has been applied and reverted, so a restore
# fault in the control cannot be mistaken for one in a recipe.
# ---------------------------------------------------------------------------
CONTROL_FILE = "tests/specLint/claimSweepNotFound.test.ts"
CONTROL_TITLE = "emits EXACTLY ONE not-found finding"

# DERIVED FROM THE ROWS, never enumerated. The hand-written list this replaced was
# correct when written and wrong the moment a row targeted a fourth file -- which
# is precisely what happened: re-pointing the two section 2.0 rows at the census
# script and the literals module raised `KeyError` on the ORIGINALS lookup, AFTER
# the run had already mutated and restored nineteen rows. A restore map that does
# not cover every path the rows can touch is a script that can leave a mutated
# tree behind, so it is computed from the same list the mutation phase walks.
MUTABLE_PATHS = sorted({r.target for r in ROWS if r.target is not None} | {CONTROL_FILE})


# ---------------------------------------------------------------------------
# File handling.  Originals are captured ONCE, before any edit, and every write
# goes through `_write` so the restore path has exactly one thing to undo.
# ---------------------------------------------------------------------------
ORIGINALS: dict[str, str] = {}


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf8")


def _write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf8")


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf8")).hexdigest()[:12]


# ---------------------------------------------------------------------------
# THE SPEC TABLE, PARSED.  `ROWS` above is a transcription, and a transcription
# nothing reads back is a claim -- the same shape this whole audit exists to
# find.  These functions read section 6's weaker-implementation table out of the
# LIVE spec and reconcile it against `ROWS` in BOTH directions before a single
# byte is mutated.
#
# WHAT IS COMPARED IS TEXT, NOT A COUNT.  A parsed count checked against a
# derived count is a tautology; a parsed count checked against a hand-typed one
# catches an insertion or a deletion and nothing else -- a row swapped for
# another, reworded, or moved leaves both numbers equal.  So the comparison is on
# `rule` + `weaker`, whitespace normalised, and ORDER is compared too, because
# `ROWS`' own contract and the `[n]` labels in this run's output both cite the
# table's top-to-bottom order.  Order drift is REPORTED AND REFUSED rather than
# declared harmless.
# ---------------------------------------------------------------------------
SPEC = "docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md"

SECTION_6_OPEN = re.compile(r"^## 6\. Testing\b")
SECTION_7_OPEN = re.compile(r"^## 7\.")
FENCE = re.compile(r"^\s*(?:```|~~~)")
SEPARATOR_CELL = re.compile(r"^:?-{3,}:?$")

#: Section 6 carries TWO pipe tables -- this one and the paired-fixture table
#: below it -- so the table is identified by its own header cells rather than by
#: being first, which would silently follow a reordering of the section.  Exactly
#: one table must carry this header; 0 or 2+ refuses.
WEAKER_TABLE_HEADER = ["Rule", "Weaker implementation that would pass", "Fixture that kills it"]


def _norm(cell: str) -> str:
    """Whitespace-normalised cell text -- the unit both sides are compared on."""
    return " ".join(cell.split())


def _split_table_row(line: str) -> list[str]:
    """One pipe-table row into its cells, honouring `\\|` escapes.

    Written out rather than `line.split("|")` because an escaped pipe inside a
    cell would otherwise manufacture a column, and the row would then be refused
    for an arity it does not actually have.
    """
    cells: list[str] = []
    buf: list[str] = []
    i = 0
    while i < len(line):
        if line[i] == "\\" and i + 1 < len(line) and line[i + 1] == "|":
            buf.append("|")
            i += 2
            continue
        if line[i] == "|":
            cells.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(line[i])
        i += 1
    cells.append("".join(buf))
    # A pipe table's rows open and close with a delimiter, so the fragments
    # outside the outermost pipes are empty and are not columns.
    if cells and not cells[0].strip():
        cells.pop(0)
    if cells and not cells[-1].strip():
        cells.pop()
    return [_norm(c) for c in cells]


def _spec_fail(message: str) -> None:
    print(f"  FAIL  {SPEC}: {message}")
    print("        The rows this audit walks are DERIVED from section 6's table. If the table")
    print("        cannot be read, nothing measured below is attributable to it.")
    sys.exit(2)


def parse_spec_rows() -> list[tuple[str, str]]:
    """`(rule, weaker)` for every data row of section 6's weaker table, in order."""
    lines = _read(SPEC).split("\n")
    start: Optional[int] = None
    end: Optional[int] = None
    for i, ln in enumerate(lines):
        if start is None:
            if SECTION_6_OPEN.match(ln):
                start = i
        elif SECTION_7_OPEN.match(ln):
            end = i
            break
    if start is None:
        _spec_fail("no line begins `## 6. Testing`")
    if end is None:
        _spec_fail("section 6 is never closed by a line beginning `## 7.`")

    matches: list[list[str]] = []
    block: list[str] = []
    fenced = False
    # The trailing "" flushes a table that runs to the last line of the section.
    for ln in lines[start:end] + [""]:
        if FENCE.match(ln):
            fenced = not fenced
            ln = ""
        if not fenced and ln.lstrip().startswith("|"):
            block.append(ln.strip())
            continue
        if block:
            if _split_table_row(block[0]) == WEAKER_TABLE_HEADER:
                matches.append(block)
            block = []
    if len(matches) != 1:
        _spec_fail(
            f"{len(matches)} table(s) in section 6 carry the header {WEAKER_TABLE_HEADER!r}; "
            "need exactly 1"
        )

    table = matches[0]
    if len(table) < 3:
        _spec_fail("the weaker-implementation table carries no data rows")
    separator = _split_table_row(table[1])
    if not separator or not all(SEPARATOR_CELL.match(c) for c in separator):
        _spec_fail(f"the row under the table header is not a separator: {table[1]!r}")

    parsed: list[tuple[str, str]] = []
    for raw in table[2:]:
        cells = _split_table_row(raw)
        if len(cells) != len(WEAKER_TABLE_HEADER):
            _spec_fail(
                f"a data row has {len(cells)} column(s), not {len(WEAKER_TABLE_HEADER)}: {raw!r}"
            )
        parsed.append((cells[0], cells[1]))
    return parsed


def reconcile_rows_against_spec() -> int:
    """Require `ROWS` and section 6's table to be the SAME rows, in the same order.

    Fails naming all four ways they can diverge: a spec row this script does not
    carry, a carried row the spec does not name, a row whose wording drifted on
    one side, and a reordering.  The returned count is printed for the reader and
    is a CONSEQUENCE of the match, never the check.
    """
    spec_pairs = parse_spec_rows()
    row_pairs = [(_norm(r.rule), _norm(r.weaker)) for r in ROWS]

    spec_only = list((Counter(spec_pairs) - Counter(row_pairs)).elements())
    rows_only = list((Counter(row_pairs) - Counter(spec_pairs)).elements())

    problems: list[str] = []
    # A row whose wording drifted appears once in each leftover list.  Pairing
    # those by `rule` reports ONE difference carrying both texts, rather than a
    # phantom deletion beside a phantom insertion the reader has to match up.
    for spec_pair in list(spec_only):
        mate = next((r for r in rows_only if r[0] == spec_pair[0]), None)
        if mate is None:
            continue
        spec_only.remove(spec_pair)
        rows_only.remove(mate)
        problems.append(
            f"WORDING DRIFT on rule {spec_pair[0]!r}\n"
            f"          spec  : {spec_pair[1]!r}\n"
            f"          script: {mate[1]!r}"
        )
    for spec_pair in spec_only:
        problems.append(
            f"SPEC ROW NOT CARRIED     rule {spec_pair[0]!r} | weaker {spec_pair[1]!r}"
        )
    for row_pair in rows_only:
        problems.append(
            f"CARRIED ROW NOT IN SPEC  rule {row_pair[0]!r} | weaker {row_pair[1]!r}"
        )

    if not problems and spec_pairs != row_pairs:
        for i, (spec_pair, row_pair) in enumerate(zip(spec_pairs, row_pairs), start=1):
            if spec_pair != row_pair:
                problems.append(
                    f"ORDER DRIFT at position {i}\n"
                    f"          spec  : {spec_pair[0]!r} | {spec_pair[1]!r}\n"
                    f"          script: {row_pair[0]!r} | {row_pair[1]!r}"
                )

    print(f"  spec section 6 data rows     : {len(spec_pairs)}  (parsed from {SPEC})")
    print(f"  rows carried by this script  : {len(row_pairs)}")
    if problems:
        print(f"  RECONCILIATION FAILED -- {len(problems)} difference(s):")
        for p in problems:
            print(f"      {p}")
        print("  These rows are DERIVED from that table. Reconcile the two, then re-run.")
        sys.exit(2)
    print("  reconciled                   : every row matches, both directions, same order")
    return len(spec_pairs)


def capture_originals() -> None:
    for rel in MUTABLE_PATHS:
        ORIGINALS[rel] = _read(rel)


def restore_all(quiet: bool = False) -> bool:
    """Put every mutated file back and VERIFY it, by hash.

    Restoration that is not verified is a claim about the tree in the same
    direction every other claim in this arc fails: it looks green.  Called from
    `finally`, from `atexit`, and from the signal handlers, so a partially
    applied recipe cannot outlive this process however it dies.
    """
    ok = True
    for rel, original in ORIGINALS.items():
        try:
            current = _read(rel)
        except OSError as e:  # pragma: no cover -- the tree went away under us
            print(f"RESTORE  FAIL  {rel}: {e}")
            ok = False
            continue
        if current != original:
            _write(rel, original)
        back = _read(rel)
        if back != original:
            print(f"RESTORE  FAIL  {rel} did NOT come back to {_sha(original)} (now {_sha(back)})")
            ok = False
        elif not quiet:
            print(f"RESTORE  ok    {rel}  sha {_sha(back)}")
    return ok


def _signal_restore(signum, _frame):  # pragma: no cover -- exercised by hand
    print(f"\n-- SIGNAL {signum} -- restoring the tree before exiting --")
    restore_all()
    sys.exit(130)


# ---------------------------------------------------------------------------
# Occurrence counting.  Every anchor in this file is asserted to occur EXACTLY
# ONCE, and both failure directions are named: 0 means the anchor was typed from
# memory or the file moved under it; 2+ means the recipe would edit two places
# and the audit would be measuring something it cannot name.
# ---------------------------------------------------------------------------
def count_in(rel: str, needle: str) -> int:
    return _read(rel).count(needle)


def title_needle(title: str) -> str:
    """The exact source text a cited `it(...)` title appears as.

    Counted as `it("<title>"` rather than as the bare title, so a title that also
    appears in a comment or in a `describe` name is not miscounted as the check.
    """
    return 'it("' + title + '"'


#: `-t` is a testNamePattern and vitest compiles it to a RegExp, so a title
#: carrying a metacharacter would silently select a different set of tests --
#: including, for `.*`, all of them.  Refused rather than escaped: an escaped
#: pattern is one more thing that can drift from the title it cites.
REGEX_META = re.compile(r"[.*+?^$|()\[\]{}\\]")


# ---------------------------------------------------------------------------
# Running one check.
# ---------------------------------------------------------------------------
ANSI = re.compile(r"\x1b\[[0-9;]*m")
TESTS_LINE = re.compile(r"Tests\s+(?P<body>.*)")


@dataclass
class RunResult:
    exit_code: int
    passed: int
    failed: int
    output: str

    @property
    def executed(self) -> int:
        return self.passed + self.failed


def run_check(rel_file: str, title: str, timeout: int = 900) -> RunResult:
    """`pnpm exec vitest run <file> -t "<title>"`, with the COUNT parsed out.

    THE COUNT IS THE PREMISE, and without it this audit has the defect it exists
    to find.  A `-t` pattern that selects NOTHING leaves vitest reporting zero
    executed tests and exiting 0 -- which reads as a pass on the pristine tree
    and, worse, as "no failure" on the mutated one.  So every observation below
    requires `executed >= 1`, and a run that executed nothing is an INFRA fault
    rather than a green.
    """
    proc = subprocess.run(
        ["pnpm", "exec", "vitest", "run", rel_file, "-t", title],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    out = ANSI.sub("", (proc.stdout or "") + (proc.stderr or ""))
    passed = failed = 0
    for m in TESTS_LINE.finditer(out):
        body = m.group("body")
        p = re.search(r"(\d+) passed", body)
        f = re.search(r"(\d+) failed", body)
        passed = max(passed, int(p.group(1)) if p else 0)
        failed = max(failed, int(f.group(1)) if f else 0)
    return RunResult(proc.returncode, passed, failed, out)


# ---------------------------------------------------------------------------
# Classification.
# ---------------------------------------------------------------------------
PROVEN = "PROVEN"
UNPROVEN = "PRESENT-BUT-UNPROVEN"
ABSENT = "ABSENT"


def check_present(row: Row) -> bool:
    """Does the cited check EXIST -- by exact `it("<title>"` in the cited file.

    Read from the LIVE file, ALWAYS.  This used to take an override text so the
    deletion control could ask it about an in-memory excision; the control now
    writes the excision to disk and goes through `audit_row`, so there is exactly
    one presence path and the control exercises the real one.
    """
    if row.check_file is None or row.check_title is None:
        return False
    return title_needle(row.check_title) in _read(row.check_file)


def audit_row(row: Row, index: int) -> tuple[str, str]:
    """Apply, observe, revert, confirm.  Returns (state, one-line reason)."""
    label = f"[{index:>2}] {row.rule} | {row.weaker}"
    print(f"\n{label}")

    if not check_present(row):
        reason = "no check under tests/specLint covers this row"
        if row.pending:
            reason += f" -- {row.pending}"
        print(f"      {ABSENT}: {reason}")
        return ABSENT, reason

    print(f"      check: {row.check_file} :: \"{row.check_title}\"")

    if row.frm is None or row.to is None or row.target is None:
        print(f"      {UNPROVEN}: a check exists and NO mutant recipe is named, so nothing was observed")
        return UNPROVEN, "check present, no recipe named"

    if REGEX_META.search(row.check_title or ""):
        print(f"      INFRA: the cited title carries a regex metacharacter; `-t` would select the wrong tests")
        raise SystemExit(2)

    occurrences = count_in(row.target, row.frm)
    print(f"      anchor: {occurrences} occurrence(s) of the recipe's `from` in {row.target}  (need exactly 1)")
    if occurrences != 1:
        print("      INFRA: refusing to apply a recipe whose anchor is not unique")
        raise SystemExit(2)

    original = ORIGINALS[row.target]
    mutated = original.replace(row.frm, row.to)
    if mutated == original:
        print("      INFRA: the recipe produced no change")
        raise SystemExit(2)

    _write(row.target, mutated)
    red = run_check(row.check_file, row.check_title)
    _write(row.target, original)
    green = run_check(row.check_file, row.check_title)

    print(
        f"      mutant : exit {red.exit_code}  tests executed {red.executed} "
        f"({red.passed} passed, {red.failed} failed)"
    )
    print(
        f"      revert : exit {green.exit_code}  tests executed {green.executed} "
        f"({green.passed} passed, {green.failed} failed)"
    )

    if green.executed < 1 or green.exit_code != 0:
        print("      INFRA: the check does not pass on the PRISTINE tree; nothing here is measurable")
        raise SystemExit(2)
    if red.executed < 1:
        print("      INFRA: the mutant run executed NO tests; the `-t` pattern selected nothing")
        raise SystemExit(2)
    if red.exit_code == 0 or red.failed == 0:
        reason = "the mutant SURVIVED the cited check -- present, and it does not discriminate"
        print(f"      {ABSENT}: {reason}")
        return ABSENT, reason

    print(f"      {PROVEN}: red OBSERVED in this run ({red.failed} failed), green confirmed after revert")
    return PROVEN, "red observed in this run"


# ---------------------------------------------------------------------------
# The deletion control.
# ---------------------------------------------------------------------------
def excise_it_block(text: str, title: str) -> str:
    """Remove one `it(...)` block whole, by indentation-matched closer.

    These suites are prettier-formatted, so a block opened at indent N closes on
    the first later line that is exactly `N spaces + "});"`.  That assumption is
    ASSERTED rather than trusted: no closer inside a bounded window refuses,
    because a half-excised file would make the control report ABSENT for a reason
    that has nothing to do with the reporting path.
    """
    needle = title_needle(title)
    idx = text.index(needle)
    lines = text.split("\n")
    start = text.count("\n", 0, idx)
    indent = len(lines[start]) - len(lines[start].lstrip(" "))
    closer = " " * indent + "});"
    for end in range(start + 1, min(start + 200, len(lines))):
        if lines[end] == closer:
            return "\n".join(lines[:start] + lines[end + 1 :])
    raise RuntimeError(f"no `{closer}` within 200 lines of the block opening `{needle}`")


def deletion_control(prior_state: str) -> tuple[bool, str]:
    """Delete one shipped check; require the row that cites it to report ABSENT.

    ROUTED THROUGH `audit_row`, the same and only entry point every real row
    takes, and the returned state must be EXACTLY `ABSENT`.  The version this
    replaced called the presence predicate directly, which proved that one
    predicate answers "no" and said nothing about whether a deleted check REACHES
    the ABSENT bucket: measured against it, an audit that classified the deleted
    check `PROVEN` still reported `deletion_control_ok=True`.  The excision is
    therefore written to DISK and `audit_row` reads it exactly as it reads every
    other row -- no override argument, no second path, no shortcut.

    PREMISE, STATED EXECUTABLY: a row that was ALREADY absent on the pristine
    tree would report ABSENT for a reason the deletion did not cause, and the
    control would pass while observing nothing.  `prior_state` is that row's
    state from the main pass, and anything but a non-ABSENT value refuses.

    WHAT IT ANSWERS: whether the reporting path works -- whether a row with no
    check reaches the ABSENT bucket rather than being silently skipped or
    defaulted into a present state.

    WHAT IT DOES NOT ANSWER: anything about PROVEN. An audit that labelled every
    present check PROVEN would pass this control unchanged, because deleting the
    check removes it from that audit too. That is why the control is kept and
    described rather than counted as evidence.
    """
    print("\n-- DELETION CONTROL --")
    index, row = next(
        (i, r)
        for i, r in enumerate(ROWS, start=1)
        if r.check_file == CONTROL_FILE and r.check_title == CONTROL_TITLE
    )
    if prior_state == ABSENT:
        print(f"  INFRA: row [{index}] was already {ABSENT} on the pristine tree, so ABSENT after")
        print("         the deletion would be attributable to the row, not to the reporting path")
        raise SystemExit(2)

    original = ORIGINALS[CONTROL_FILE]
    print(f'  removing {CONTROL_FILE} :: "{CONTROL_TITLE}"')
    print(f"  row [{index}], {prior_state} on the pristine tree; re-audited through `audit_row`")
    excised = excise_it_block(original, CONTROL_TITLE)
    removed_lines = original.count("\n") - excised.count("\n")
    _write(CONTROL_FILE, excised)
    try:
        state, reason = audit_row(row, index)
    finally:
        _write(CONTROL_FILE, original)
    back_ok = _read(CONTROL_FILE) == original
    print(f"\n  block removed          : {removed_lines} line(s)")
    print(f"  audit_row returned     : {state} -- {reason}")
    print(f"  required               : {ABSENT}, exactly")
    print(f"  file restored          : {'yes' if back_ok else 'NO -- FAIL'}  sha {_sha(_read(CONTROL_FILE))}")
    print("  reads only: does the ABSENT reporting path work. It says NOTHING about PROVEN --")
    print("  an audit that labelled every present check PROVEN would pass this control too.")
    return (state == ABSENT and back_ok), CONTROL_TITLE


# ---------------------------------------------------------------------------
# Pre-flight.
# ---------------------------------------------------------------------------
def preflight(allow_dirty: bool) -> None:
    print("-- PRE-FLIGHT --")
    print(f"  repo root                    : {ROOT}")
    reconcile_rows_against_spec()
    proc = subprocess.run(
        ["git", "status", "--porcelain", "--"] + MUTABLE_PATHS,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    dirty = [ln for ln in proc.stdout.split("\n") if ln.strip()]
    print(f"  uncommitted changes on mutated paths: {len(dirty)}")
    for ln in dirty:
        print(f"      {ln}")
    if dirty and not allow_dirty:
        print(
            "  FAIL  refusing to mutate a dirty tree. A scored mutation run overlays these same\n"
            "        files, and two writers in one working tree corrupt the measurement SILENTLY.\n"
            "        Commit or stash, or pass --allow-dirty to assert no measurement is in flight."
        )
        sys.exit(2)


# ---------------------------------------------------------------------------
# Anchor dry-run (plan Task 9 step 7).
# ---------------------------------------------------------------------------
def anchors_mode() -> int:
    print("-- ANCHOR DRY-RUN (plan Task 9 step 7) --")
    print("Counted against the LIVE files, BEFORE the run this script waits on. A wrong")
    print("anchor matches NOTHING, which you notice, or SOMEWHERE ELSE, which you do not.")
    print()
    reconcile_rows_against_spec()
    bad = 0
    print("\n  n  from-anchor  it-title  row")
    for i, row in enumerate(ROWS, start=1):
        frm_n = "  -" if row.frm is None else f"{count_in(row.target, row.frm):>3}"
        if row.check_file is None or row.check_title is None:
            title_n = "  -"
        else:
            title_n = f"{count_in(row.check_file, title_needle(row.check_title)):>3}"
        flag = ""
        if row.frm is not None and count_in(row.target, row.frm) != 1:
            flag, bad = "  <== NOT UNIQUE", bad + 1
        if (
            row.check_title is not None
            and count_in(row.check_file, title_needle(row.check_title)) != 1
        ):
            flag, bad = "  <== NOT UNIQUE", bad + 1
        if row.check_title is not None and REGEX_META.search(row.check_title):
            flag, bad = "  <== REGEX METACHARACTER IN TITLE", bad + 1
        print(f"  {i:>2}  {frm_n}          {title_n}     {row.rule} | {row.weaker}{flag}")
    ctl = count_in(CONTROL_FILE, title_needle(CONTROL_TITLE))
    print(f"\n  deletion control anchor in {CONTROL_FILE}: {ctl}  (need exactly 1)")
    if ctl != 1:
        bad += 1
    no_check = [r for r in ROWS if r.check_file is None]
    print(f"  rows carrying NO check (will report {ABSENT}): {len(no_check)}")
    for r in no_check:
        print(f"      {r.rule} | {r.weaker}")
    print(f"\nRAW: anchors not exactly 1: {bad}")
    return 1 if bad else 0


# ---------------------------------------------------------------------------
def main() -> int:
    argv = sys.argv[1:]
    if "--anchors" in argv:
        return anchors_mode()

    preflight("--allow-dirty" in argv)
    capture_originals()
    atexit.register(restore_all, True)
    signal.signal(signal.SIGINT, _signal_restore)
    signal.signal(signal.SIGTERM, _signal_restore)

    states: list[tuple[Row, str, str]] = []
    control_ok = False
    try:
        print("\n-- ROWS, DERIVED FROM SPEC SECTION 6's TABLE --")
        for i, row in enumerate(ROWS, start=1):
            state, reason = audit_row(row, i)
            states.append((row, state, reason))
        # The control's premise is the state THIS run observed for that row, not
        # an assumption about it.
        prior = next(
            (
                s
                for r, s, _ in states
                if r.check_file == CONTROL_FILE and r.check_title == CONTROL_TITLE
            ),
            ABSENT,
        )
        control_ok, _ = deletion_control(prior)
    finally:
        print("\n-- RESTORE --")
        restored = restore_all()

    proven = [s for s in states if s[1] == PROVEN]
    unproven = [s for s in states if s[1] == UNPROVEN]
    absent = [s for s in states if s[1] == ABSENT]

    print("\n-- TALLY --")
    print(f"  {PROVEN:<22}: {len(proven)} of {len(ROWS)}")
    print(f"  {UNPROVEN:<22}: {len(unproven)} of {len(ROWS)}")
    print(f"  {ABSENT:<22}: {len(absent)} of {len(ROWS)}")
    for row, _, reason in absent:
        print(f"      {row.rule} | {row.weaker}")
        print(f"          {reason}")
    print(f"  deletion control            : {'reporting path works' if control_ok else 'FAILED'}")
    print(f"  tree restored               : {'yes' if restored else 'NO'}")
    print(
        f"\nRAW: proven {len(proven)} | present-but-unproven {len(unproven)} | absent {len(absent)}"
        f" | control {'ok' if control_ok else 'failed'} | restored {'ok' if restored else 'FAILED'}"
    )
    if not restored:
        return 2
    return 1 if (absent or not control_ok) else 0


if __name__ == "__main__":
    sys.exit(main())
