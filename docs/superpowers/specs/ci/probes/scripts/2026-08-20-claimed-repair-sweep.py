#!/usr/bin/env python3
"""Round-5 repair sweep, BOTH directions, over the artifact PAIR.

Positive direction: every repair CLAIMED this round is present NOW.
Negative direction: every model this round RETIRED is gone -- a repair that adds
the replacement while leaving the superseded text standing reads as complete in
every positive check.  Raw counts only; no computed verdict.  Controls are
mandatory: a must-be-PRESENT witness proves the read succeeded, a must-be-ABSENT
witness proves the matcher can report absence.
"""
import re, pathlib, sys

SPEC  = "docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md"
PROBE = "docs/superpowers/specs/ci/probes/2026-08-20-claim-sweep-after-repair-probes.md"
norm  = lambda s: re.sub(r"\s+", " ", s)

docs = {p: norm(pathlib.Path(p).read_text()) for p in (SPEC, PROBE)}
for p, t in docs.items():
    print(f"read {p}: {len(t)} normalised chars")
    assert len(t) > 8000, f"{p} read implausibly small -- run VOID"

def count(where, needle):
    return sum(docs[p].count(norm(needle)) for p in where)

PRESENT = [
    ("2.0 population section",        [SPEC],  "THE POPULATION IS DECLARED, AND EXCLUDES THIS ARC'S OWN DOCUMENTS"),
    ("2.0 names the census script",   [SPEC],  "2026-08-20-population-census.py"),
    ("2.0 ARC_DOCUMENTS tuple",       [SPEC],  "`ARC_DOCUMENTS` tuple names this spec"),
    ("2.0 no-arc-figure rule",        [SPEC],  "**No arc-inclusive figure is stated anywhere in this document**"),
    ("2.0 base-anchored derivation",  [SPEC],  "at this arc's merge-base `4dfd784ed062`"),
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
    ("3.4 code set asserted",         [SPEC],  "the shipped module exports\nits codes"),
    ("3.2 names the not-found code",  [SPEC],  "`CLAIM_IDENTIFIER_NOT_FOUND`, §3.4"),
    ("6 not-found fixture row",       [SPEC],  "match exactly and stay SILENT when nothing matches"),
    ("6 accept-set fixture row",      [SPEC],  "emit a fifth code, or drop one"),
    ("AC-2 not-found clause",         [SPEC],  "occurring zero times EXACTLY emits"),
    ("AC-3 code-set clause",          [SPEC],  "equals exactly\n  the four of §3.4"),
    ("probes 10 supplement",          [PROBE], "closing the accept-set exposed a signal nothing could carry"),
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
]

print("\n-- CONTROLS --")
ctl_present = count([SPEC], "## 3. The arm")
ctl_absent  = count([SPEC, PROBE], "zzz-this-string-is-not-in-either-document-zzz")
print(f"  must-be-PRESENT control '## 3. The arm'      : {ctl_present}  (need >=1)")
print(f"  must-be-ABSENT  control nonsense string       : {ctl_absent}  (need 0)")
# a control drawn from the OTHER document, so a single-file read cannot fake the pair
ctl_probe = count([PROBE], "## 1. The entry's acceptance criterion")
print(f"  must-be-PRESENT control, PROBE record        : {ctl_probe}  (need >=1)")
assert ctl_present >= 1 and ctl_absent == 0 and ctl_probe >= 1, "CONTROLS VOID -- run means nothing"

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
