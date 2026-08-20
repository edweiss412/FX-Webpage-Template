#!/usr/bin/env python3
"""Claimed-repair sweep, BOTH directions, over EVERY DOCUMENT THIS ARC WRITES.

It began as a sweep over the spec/probe PAIR and that population was the defect:
plan review round 4 found seven current-tense survivors of the retired model in
the round-economy FILING while this script reported a clean sweep, because the
filing sat outside what it read.  The population is now spec, probe record, plan
and filing, and any document this arc adds later joins the list in the same
commit.

TWO DEFECTS ARE POSSIBLE HERE AND ONLY ONE IS CLOSED.  REACH -- not opening or
not finishing every document in the population -- is closed: the population is
declared above, a must-be-PRESENT control sits in EACH document, and the size is
printed beside every zero.  VOCABULARY is NOT closed and is a DOCUMENTED LIMIT:
the witness lists below are hand-maintained, so this sweep only knows the vectors
someone named.  That is the enumeration defect arriving on the sweep itself, and
it is declared rather than papered over.  Where a vector IS a number, take it as
an ARGUMENT from whatever produced it -- the population census is the source of
every figure in spec section 2 -- rather than retyping it here, so a new
measurement cannot silently outrun the check that guards it.

Positive direction: every repair CLAIMED in any round is present NOW.
Negative direction: every model any round RETIRED is gone -- a repair that adds
the replacement while leaving the superseded text standing reads as complete in
every positive check.  Raw counts only; no computed verdict.  Controls are
mandatory: a must-be-PRESENT witness proves the read succeeded, a must-be-ABSENT
witness proves the matcher can report absence.
"""
import re, pathlib, sys

SPEC  = "docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md"
PROBE = "docs/superpowers/specs/ci/probes/2026-08-20-claim-sweep-after-repair-probes.md"
norm  = lambda s: re.sub(r"\s+", " ", s)

PLAN   = "docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md"
FILING = "docs/review-rounds/feat/speclint-claim-sweep-after-repair/4dfd784ed062.md"
HANDOFF = "docs/superpowers/plans/2026-08-20-claim-sweep-after-repair-handoff.md"

# THE SWEEP UNIT IS EVERY DOCUMENT THIS ARC WRITES, not the spec/probe pair it
# started as.  Plan review round 4 found SEVEN current-tense survivors in the
# FILING -- six rounds for seven, three codes for four, nine limits for ten --
# while this script reported a clean sweep, because the filing sat outside the
# population it read.  A cover that is clean about documents it never opened is
# the fail-open this arc exists to catch, one artifact further out.
docs = {p: norm(pathlib.Path(p).read_text()) for p in (SPEC, PROBE, PLAN, FILING, HANDOFF)}
for p, t in docs.items():
    print(f"read {p}: {len(t)} normalised chars")
    # RULE 47: a check that reports a zero states the SIZE of the set it scanned.
    # "0 of 0" and "0 of 70" render identically and mean opposite things, so a
    # short read aborts rather than producing a clean sweep over nothing.
    assert len(t) > 4000, f"{p} read implausibly small ({len(t)} chars) -- run VOID"
print(f"population: {len(docs)} documents, "
      f"{sum(len(v) for v in docs.values())} normalised chars total")

def count(where, needle):
    return sum(docs[p].count(norm(needle)) for p in where)

PRESENT = [
    ("2.0 population section",        [SPEC],  "THE POPULATION IS DECLARED, AND EXCLUDES THIS ARC'S OWN DOCUMENTS"),
    ("2.0 names the census script",   [SPEC],  "2026-08-20-population-census.py"),
    ("2.0 ARC_DOCUMENTS tuple",       [SPEC],  "`ARC_DOCUMENTS` tuple names this spec"),
    ("2.0 no-arc-figure rule",        [SPEC],  "**No arc-inclusive figure is stated anywhere in this document**"),
    ("2.0 base-anchored derivation",  [SPEC],  "at this arc's merge-base `4dfd784ed062`"),
    # superseded when the handoff arrived and became the SECOND proof of the same
    # property; the plan-only wording is on the retired list.
    ("2.0 arrival moved nothing",     [SPEC],  "arriving are the proof the exclusion works"),
    ("2.0 shared-module literals",    [SPEC],  "Synthetic fixture literals therefore live in ONE SHARED MODULE"),
    ("3.2 arm does not establish",    [SPEC],  "THE ARM DOES NOT ESTABLISH THAT THE REPAIR CHANGED THE CLAIM"),
    ("3.2 HoverHelp counterexample",  [SPEC],  "components/admin/HoverHelp.tsx:562"),
    ("3.2 identity is the author's",  [SPEC],  "is therefore the AUTHOR's declaration"),
    ("3.3 declared, never inferred",  [SPEC],  "**Which FILES those are is DECLARED on the invocation and never inferred.**"),
    ("3.3 --also flag",               [SPEC],  "`--also` is repeatable and takes a path"),
    ("3.3 three inference rules",     [SPEC],  "| Match the date prefix |"),
    ("3.3 FileResolver by name",      [SPEC],  "the `FileResolver` interface in `lib/specLint/types.ts` supplies file ACCESS"),
    ("3.4 third code",                [SPEC],  "SWEEP_DOCUMENT_UNREADABLE"),
    ("3.4 attribution to declaration",[SPEC],  "this arm did not verify that the repair changed the"),
    ("5 item 8 collateral",           [SPEC],  "A COLLATERAL IDENTIFIER IS THE AUTHOR'S TO GET RIGHT"),
    ("5 item 9 undeclared peer",      [SPEC],  "A PEER THE AUTHOR DOES NOT DECLARE IS NOT SWEPT"),
    ("6 population cover row",        [SPEC],  "measure the corpus INCLUDING the arm's own documents"),
    ("6 attribution cover row",       [SPEC],  "word the advisory as \"the repair changed this claim\""),
    ("6 document-set cover row",      [SPEC],  "INFER the peers from citations, stem, or date"),
    ("6 unreadable cover row",        [SPEC],  "continue silently when `readFileLines()` returns null"),
    ("6 nonce-rejection cover row",   [SPEC],  "key the no-collision check on a NONCE token"),
    ("AC-2 attribution",              [SPEC],  "The advisory attributes the changed claim to the DECLARATION"),
    ("AC-5 exact declared set",       [SPEC],  "the swept set is EXACTLY the declared documents"),
    ("AC-6 population relation",      [SPEC],  "it contains none of `ARC_DOCUMENTS`"),
    ("probes 8.1 collateral",         [PROBE], "A touched identifier is not a reclassified one"),
    ("probes 8.2 inference rules",    [PROBE], "All three \"same arc\" inference rules are wrong"),
    ("probes 8.3 symlink",            [PROBE], "The unreadable-document branch is a live corpus shape"),
    ("probes numbering scheme",       [PROBE], "which is not the corpus round number"),
    # --- round 6 ---
    # round 6's "Three codes" pair is SUPERSEDED by round 7's four-code inventory, not
    # absent -- it moves to the retired list below rather than being deleted, so the
    # supersession is asserted in the direction that can catch a regression.
    ("6 identity carries the column", [SPEC],  "A finding's identity is `(code, doc, line, COLUMN, token)`"),
    ("6 identity fixture row",        [SPEC],  "or dedup by line |"),
    ("6 no dedup by position/line",   [SPEC],  "**No dedup by\nposition, by line, or by token is permitted**"),
    ("6 replay unmoved, measured",    [SPEC],  "survivors sit on nine DISTINCT lines"),
    ("AC-4 identity with column",     [SPEC],  "nine `(document, line, column, token)` numeric survivors"),
    ("3.1 cites 5 item 7",            [SPEC],  "recorded as §5 item 7 and restated in the module header."),
    ("probes 5.1 cites 5 item 7",     [PROBE], "the miss is declared (spec §5 item 7)"),
    ("7 states where measured",       [SPEC],  "A score is reported WITH WHERE IT WAS MEASURED"),
    ("7 surface-grain triage",        [SPEC],  "Triage at SURFACE grain, never at leg grain"),
    ("7 absence is not evidence",     [SPEC],  "Absence from a failure list is not\nevidence of passing"),
    ("probes 9.1 collision probe",    [PROBE], "The live corpus collides under a line-keyed identity"),
    ("probes 9.2 replay unaffected",  [PROBE], "The historical replay is unaffected"),
    ("probes 9.3 reviewer confirmed", [PROBE], "the replay was not the case in point"),
    # --- round 7 ---
    ("3.4 four codes",                [SPEC],  "**FOUR codes, and they are the whole FINDING accept-set"),
    ("3.4 not-found code",            [SPEC],  "CLAIM_IDENTIFIER_NOT_FOUND  advisory"),
    ("3.4 refusals are not findings", [SPEC],  "**The refusals are NOT findings"),
    ("3.4 refusal exit 2 precedent",  [SPEC],  "cannot infer kind from path"),
    ("3.4 signal inventory table",    [SPEC],  "SIGNAL INVENTORY — every normative outcome in §3"),
    ("3.4 three channels",            [SPEC],  "a REFUSAL says the run never happened"),
    # superseded by the ruling-condition repair: the claim moved from a sentence to
    # the derived reconciliation bullets. The old wording is on the retired list.
    ("3.4 code set asserted",         [SPEC],  "every exported\n  code appears in exactly ONE row"),
    ("3.4 derived not claimed",       [SPEC],  "enumeration in derivation's costume"),
    ("3.4 reconciliation control",    [SPEC],  "The cover carries a POSITIVE CONTROL so its clean verdict"),
    ("5 item 10 prose limit",         [SPEC],  "THE SIGNAL INVENTORY'S COMPLETENESS AGAINST PROSE IS NOT MECHANICALLY CHECKED"),
    ("3.2 names the not-found code",  [SPEC],  "`CLAIM_IDENTIFIER_NOT_FOUND`, §3.4"),
    ("6 not-found fixture row",       [SPEC],  "match exactly and stay SILENT when nothing matches"),
    ("6 accept-set fixture row",      [SPEC],  "emit a fifth code, or drop one"),
    ("AC-2 not-found clause",         [SPEC],  "occurring zero times EXACTLY emits"),
    ("AC-3 code-set clause",          [SPEC],  "equals exactly\n  the four of §3.4"),
    ("probes 10 supplement",          [PROBE], "closing the accept-set exposed a signal nothing could carry"),
    # --- the PLAN and the FILING, now inside the population (plan r4 f1) ---
    ("filing: seven rounds",          [FILING], "**Seven rounds of a recognizer"),
    ("filing: FOUR codes",            [FILING], "the arm ends with FOUR codes"),
    ("filing: TEN limits",            [FILING], "and TEN declared"),
    ("filing: 24 findings",           [FILING], "two of the 24 are mechanizable"),
    ("filing: other 22",              [FILING], "The other 22 were not mechanizable"),
    ("filing: 2 + 5 split",           [FILING], "seven-round stage sat 2 + 5"),
    ("filing: seven dispatches",      [FILING], "All seven dispatches returned"),
    # --- plan r5: the confirmation round's own row, and the counts it moved ---
    ("filing: plan 5 rounds",         [FILING], "## plan — 5 rounds"),
    ("filing: 25 across five",        [FILING], "**25 across\nfive rounds**"),
    ("filing: eleven of twenty-five", [FILING], "eleven of the twenty-five"),
    ("plan: derived stamp list",      [PLAN],   "IT IS A DERIVED LIST"),
    ("plan: subset stamp certifies",  [PLAN],   "A stamp over a subset is worse than no stamp, because it\ncertifies"),
    ("plan: safe forms by compute",   [PLAN],   "safe because of what they COMPUTE, not how they look"),
    ("2.0 motivating instance",       [SPEC],   "THE MOTIVATING INSTANCE IS THIS ARC'S OWN"),
    ("2.0 one control one read",      [SPEC],   "ONE control proves\nONE read succeeded"),
    ("2.0 handoff arrival",           [SPEC],   "The plan and the handoff arriving are the proof"),
    ("2.0 same-commit declaration",   [SPEC],   "joins `ARC_DOCUMENTS` in the SAME COMMIT"),
    ("handoff: ruling for the PR body",[HANDOFF], "belongs in the PR body verbatim"),
    ("plan: derived red check",       [PLAN],   "it is a verification step"),
    ("plan: nine tasks",              [PLAN],   "TDD contract for Tasks 1-9"),
    ("plan: derived commit scope",    [PLAN],   "DERIVED from the files the task touches"),
    ("plan: disposition record",      [PLAN],   "CLOSED BY RULING, not by an APPROVE verdict"),
]

ABSENT = [
    # the retired MODEL is the UNQUALIFIED live claim, not the historical figure:
    # probes 6 now keeps "947 of 947 in that run" beside "935 of 935" with the
    # population each ranges over, which is the repair rather than a survival.
    ("retired: unqualified 947-of-947 claim", [SPEC, PROBE], "excludes **947 of 947 real transition sentences**, with one census artefact alongside."),
    ("retired: bare 947 in the SPEC",         [SPEC],        "947 of 947"),
    ("retired: old naive dedup 1021",         [SPEC],        "| 1021 |"),
    ("retired: old raw 1049",                 [SPEC],        "| 1049 |"),
    ("retired: old tracked count 1127",       [SPEC],        "| 1127 |"),
    ("retired: pre-plan population line",      [SPEC],        "(the plan is declared, not yet written)"),
    ("retired: 1133/2 table row",              [SPEC],        "1133, of which 2 are this arc's own"),
    ("retired: hand-asserted code set",        [SPEC],        "the shipped module exports\nits codes and §6's cover asserts"),
    ("retired: arc-inclusive 953 / 17 / 936", [SPEC, PROBE], "953 / 17 / 936"),
    ("retired: arc-inclusive 958 / 22 / 936", [SPEC, PROBE], "958 / 22 / 936"),
    ("retired: 17 contributed by this arc",   [PROBE],       "…contributed by THIS ARC's own documents:            17"),
    ("retired: FileResolver resolves the set",[SPEC],        "Resolved through the existing\n`FileResolver`"),
    ("retired: line-numbered types.ts cite",  [SPEC],        "lib/specLint/types.ts:41-45"),
    # --- round 6: the superseded text, quoted in full so the deliberate
    # withdrawn-draft mention of the old key does not read as a survival ---
    ("retired: 'Two codes' header",           [SPEC],        "Two codes, because the two halves assert different things"),
    ("retired: 3.1 -> 5 item 6",              [SPEC],        "recorded as §5 item 6"),
    ("retired: probes 5.1 -> 5 item 6",       [PROBE],       "the miss is declared (spec §5 item 6)"),
    ("retired: AC-4 line-keyed identity",     [SPEC],        "nine `(document, line, token)` numeric survivors"),
    # --- round 7: the three-code closure the confirmation round refuted ---
    ("retired: 'Three codes' header",         [SPEC],        "**Three codes.** One per half"),
    ("retired: 'Three codes' closure",        [SPEC],        "The three are the whole accept-set: the arm emits nothing else."),
    ("retired: silent not-found wording",     [SPEC],        "the exact rule reports none and says the identifier was not found"),
    # --- plan r4 f1: the retired model as it stood in the FILING ---
    ("retired: filing six rounds",            [FILING],      "**Six rounds of a recognizer"),
    ("retired: filing THREE codes",           [FILING],      "the arm ends with THREE codes"),
    ("retired: filing two of the 23",         [FILING],      "two of the 23 are mechanizable"),
    ("retired: filing other 21",              [FILING],      "The other 21 were not mechanizable"),
    ("retired: filing 2 + 4",                 [FILING],      "six-round stage sat 2 + 4"),
    ("retired: filing six dispatches",        [FILING],      "All six dispatches returned"),
    ("retired: plan 4 rounds heading",         [FILING],      "## plan — 4 rounds"),
    ("retired: eleven of twenty-two",          [FILING],      "eleven of the twenty-two"),
    ("retired: 1134/3 table row",              [SPEC],        "1134, of which 3 are this arc's own"),
    ("retired: plan-only arrival proof",       [SPEC],        "**The plan arriving is the proof the exclusion works.**"),
    ("retired: unexported INPUTS stamp",       [PLAN],        "git hash-object $INPUTS"),
    ("retired: header-advance as safe form",   [PLAN],        "and a SEARCH LOOP THAT ADVANCES IN ITS OWN HEADER"),
    # --- plan rounds 1-3: task shapes the plan retired ---
    ("retired: twelve-task cardinality",      [PLAN],        "repeated twelve times"),
    ("retired: number-mapped commit scopes",  [PLAN],        "Scope is `speclint` for Tasks 1-9 and 12"),
    ("retired: separate no-rewrite task",     [PLAN],        "## Task 9 — the arm never rewrites a document"),
    ("retired: separate corpus task",         [PLAN],        "## Task 8 — the corpus regression, as a relation"),
    ("retired: separate killer-audit task",   [PLAN],        "## Task 10 — the killer audit"),
]

print("\n-- CONTROLS --")
ctl_present = count([SPEC], "## 3. The arm")
ctl_absent  = count([SPEC, PROBE], "zzz-this-string-is-not-in-either-document-zzz")
print(f"  must-be-PRESENT control '## 3. The arm'      : {ctl_present}  (need >=1)")
print(f"  must-be-ABSENT  control nonsense string       : {ctl_absent}  (need 0)")
# one control PER DOCUMENT: a single global control is satisfied by any one
# member of the population, which is exactly how the filing stayed invisible
ctl_probe = count([PROBE], "## 1. The entry's acceptance criterion")
ctl_plan = count([PLAN], "## 0. Pre-draft code-verification pass")
ctl_filing = count([FILING], "# Review-round filing")
ctl_handoff = count([HANDOFF], "# Handoff —")
print(f"  must-be-PRESENT control, PROBE record        : {ctl_probe}  (need >=1)")
print(f"  must-be-PRESENT control, PLAN                : {ctl_plan}  (need >=1)")
print(f"  must-be-PRESENT control, FILING              : {ctl_filing}  (need >=1)")
print(f"  must-be-PRESENT control, HANDOFF             : {ctl_handoff}  (need >=1)")
# ONE CONTROL PER DOCUMENT, because a control in one file proves only that ONE
# read succeeded -- which is exactly how the filing stayed invisible.
assert ctl_present >= 1 and ctl_absent == 0 and ctl_probe >= 1 and ctl_plan >= 1 and ctl_filing >= 1 and ctl_handoff >= 1, \
    "CONTROLS VOID -- run means nothing"

print("\n-- POSITIVE DIRECTION: repairs claimed this round --")
missing = 0
for label, where, needle in PRESENT:
    n = count(where, needle)
    print(f"  {n:>3}  {'ok   ' if n >= 1 else 'ABSENT'}  {label}")
    missing += 0 if n >= 1 else 1

print("\n-- NEGATIVE DIRECTION: models this round retired --")
survived = 0
for label, where, needle in ABSENT:
    n = count(where, needle)
    print(f"  {n:>3}  {'ok   ' if n == 0 else 'SURVIVES'}  {label}")
    survived += 0 if n == 0 else 1

print(f"\nRAW: claimed-but-absent {missing} of {len(PRESENT)} | retired-but-surviving {survived} of {len(ABSENT)}")
sys.exit(1 if (missing or survived) else 0)
