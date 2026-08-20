#!/usr/bin/env python3
"""Every §2 calibration row, over ONE declared population.

THE ARC'S OWN DOCUMENTS ARE EXCLUDED, BY PATH, AND THAT IS THIS SCRIPT'S POINT.
This arm scans documents; its spec and probe record ARE documents, and every
example they contain ("grows from 21 rows to 57, not 58", the census tables, the
probe transcripts) is a transition sentence in the very corpus §2 measures. Three
separate number-drift repairs on this arc chased that growth as corpus growth when
the growth was the arc's own writing. The exclusion list below is the fix: measured
over it, the rows do not move when this arc edits its own documents.

Every row §2 states comes from ONE run of this script, so no two rows can be
measured over different populations -- which is the inconsistency the split
scripts produced.
"""
import subprocess, re, collections, sys

ARC_DOCUMENTS = (
    "docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md",
    "docs/superpowers/specs/ci/probes/2026-08-20-claim-sweep-after-repair-probes.md",
    "docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md",
)

def sentences(text):
    for para in text.split("\n"):
        for s in re.split(r"(?<=[.;:])\s+", para):
            if s.strip():
                yield s

SHAPES = {
    "X -> Y / X to Y":  re.compile(r"\b(\d+)\s*(?:->|→|to)\s*(\d+)\b"),
    "'N, not M'":       re.compile(r"\b(\d+),\s*not\s+(\d+)\b"),
    "'was N'":          re.compile(r"\bwas\s+(\d+)\b"),
    "'from N to M'":    re.compile(r"\bfrom\s+(\d+)\s+to\s+(\d+)\b"),
    "'no longer N'":    re.compile(r"\bno longer\s+(\d+)\b"),
    "'rather than N'":  re.compile(r"\brather than\s+(\d+)\b"),
}
ARROW = re.compile(r"\b(\d+)\s*(?:->|→|to|,\s*not)\s*(\d+)\b")

def main() -> int:
    tracked = [p for p in subprocess.run(
        ["git", "ls-files", "docs/superpowers"], capture_output=True, text=True
    ).stdout.split("\n") if p.endswith(".md")]
    population = [p for p in tracked if p not in ARC_DOCUMENTS]
    excluded_present = [p for p in ARC_DOCUMENTS if p in tracked]

    print("POPULATION")
    print(f"  tracked docs/superpowers markdown files:      {len(tracked)}")
    print(f"  this arc's own documents, excluded by path:   {len(excluded_present)}")
    for p in excluded_present:
        print(f"      {p}")
    print(f"  population actually measured below:           {len(population)}")

    raw = collections.Counter()
    dedup = set()
    for p in population:
        try:
            txt = open(p, encoding="utf8").read()
        except Exception:
            continue
        for name, rx in SHAPES.items():
            for m in rx.finditer(txt):
                raw[name] += 1
                dedup.add((p, m.start(1)))
    print("\nNAIVE-FORM FALSE POSITIVES (the sites a bare surviving-N sweep would flag)")
    for name, n in raw.most_common():
        print(f"  {n:>5}  {name}")
    print(f"  raw matches, before dedup (the six shapes overlap): {sum(raw.values())}")
    print(f"  DEDUPLICATED by (path, value offset):               {len(dedup)}")
    print(f"  ...of which plain 'X -> Y' transition sentences:    {raw['X -> Y / X to Y']}")

    both = one = 0
    outliers = []
    for p in population:
        try:
            txt = open(p, encoding="utf8").read()
        except Exception:
            continue
        for s in sentences(txt):
            for m in ARROW.finditer(s):
                a, b = m.group(1), m.group(2)
                if re.search(rf"\b{a}\b", s) and re.search(rf"\b{b}\b", s):
                    both += 1
                else:
                    one += 1
                    outliers.append((p, s.strip()[:110]))
    print("\nDISCRIMINATOR OVER THE POPULATION")
    print(f"  transition-shape sentences carrying BOTH values (excluded by the rule): {both}")
    print(f"  ...carrying only one (NOT excluded):                                   {one}")
    print(f"  census shape hits, total:                                              {both + one}")
    for p, s in outliers:
        print(f"      NOT EXCLUDED  {p}")
        print(f"                    {s}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
