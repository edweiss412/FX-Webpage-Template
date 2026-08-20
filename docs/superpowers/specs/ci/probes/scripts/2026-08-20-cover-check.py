#!/usr/bin/env python3
"""Fixture/cover checker for this arc's documents.

WHITESPACE IS NORMALISED BEFORE MATCHING. Three of this arc's "OPEN" results were
witnesses that failed only because the document wrapped the sentence across a line
-- indistinguishable, at the point of authorship, from a genuinely missing repair.
A checker with the same failure mode as the thing it checks is the defect it exists
to catch, so the normalisation is part of the tool rather than a habit.
Prints RAW per-witness results and both controls; it computes no verdict."""
import re, sys, pathlib

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s)

def check(path: str, witnesses: dict[str, str], present_ctl: str, absent_ctl: str) -> int:
    raw = pathlib.Path(path).read_text()
    print(f"population: {path} — {len(raw)} bytes")
    assert len(raw) > 4000, "read implausibly small — run VOID"
    hay = norm(raw)
    ok_present = norm(present_ctl).lower() in hay.lower()
    ok_absent = norm(absent_ctl) not in hay
    print(f"controls: must-be-PRESENT={ok_present}  must-be-ABSENT-ok={ok_absent}")
    assert ok_present and ok_absent, "controls VOID — the must-be-present half is the load-bearing one"
    open_n = 0
    for label, w in witnesses.items():
        hit = norm(w) in hay
        print(f"  {'ok   ' if hit else 'OPEN '} {label}")
        open_n += 0 if hit else 1
    print(f"OPEN: {open_n}")
    return open_n

if __name__ == "__main__":
    sys.exit(0)
