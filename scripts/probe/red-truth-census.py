#!/usr/bin/env python3
"""Reproduces the two census tables in BL-SPECLINT-RED-TRUTH-PROBE's archive entry.

The row asked for a GREEN-AT-BASE lint over declared `red=` targets. It was
demoted on measurement, and these are the numbers behind the demotion:

  1. how many task markers declare each `red-state`, so the size of the
     population `--exec-red` does NOT reach is visible; and
  2. for `red-state=authored` markers, whether the test files their command
     names already exist at that plan's base -- which is what decides whether
     running the command there observes anything at all.

Reads committed content at the current `HEAD` rather than the working tree, so
uncommitted edits do not move the numbers. It is NOT branch-independent: the
plan set comes from this checkout's index and the bodies from this checkout's
`HEAD`, so an older commit has an older corpus and reports smaller totals. Run
it from the branch whose entry quotes the tables. (An earlier version of this
docstring claimed branch-independence; that was false, and diff review R1
refuted it by running the script at `fb464274` and getting 662 rather than 696.)

"That plan's base" is the parent of the commit that first added the plan file,
which is the tree an author's red would have been written against.
"""
import collections
import re
import subprocess
import sys

# The shipped parser's marker shape, character for character
# (`MARKER` / `MARKER_AC_ABSENT`, lib/specLint/taskContract.ts:154): anchored to
# the line, at most three leading spaces, single spaces around the fields, and
# nothing after ` -->` but whitespace. Written loosely at first, which counted
# six quoted example markers inside test fixtures as real ones and inflated the
# total from 696 to 702 -- the very defect the entry this script serves is about.
MARKER = re.compile(r"^ {0,3}<!-- task: red=`([^`]*)`(.*?) -->[ \t]*$")
# Fenced spans are inert to the shipped arms, and plans about the linter quote
# marker-shaped strings inside them as fixtures.
FENCE = re.compile(r"^ {0,3}(?:```|~~~)")
STATE = re.compile(r"red-state=([a-z]*)")
# Test-file tokens a vitest/playwright invocation would select on.
TEST_TOKEN = re.compile(r"(?<![\w/.-])((?:tests|e2e)/[\w./@-]+\.(?:test|spec|probe)[\w.]*\.[jt]sx?)")
# Delimited, never a substring: `-t`/`--testNamePattern` followed by = or space.
NAME_FILTER = re.compile(r"\s(?:-t|--testNamePattern)[=\s]")


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def plan_files() -> list[str]:
    out = git("ls-files", "docs/superpowers/plans/").stdout
    return [p for p in out.split("\n") if p.endswith(".md")]


def markers(path: str):
    """Every well-formed task marker in one plan, fenced spans excluded."""
    found = []
    fenced = False
    for line in git("show", f"HEAD:{path}").stdout.split("\n"):
        if FENCE.match(line):
            fenced = not fenced
            continue
        if fenced:
            continue
        hit = MARKER.match(line)
        if hit:
            found.append(hit)
    return found


def base_of(path: str) -> str:
    """Parent of the commit that first added this plan file; '' if unresolvable."""
    log = [c for c in git("log", "--diff-filter=A", "--format=%H", "--", path).stdout.split() if c]
    if not log:
        return ""
    return git("rev-parse", log[-1] + "^").stdout.strip()


def main() -> int:
    by_state: collections.Counter[str] = collections.Counter()
    by_shape: collections.Counter[str] = collections.Counter()

    for path in plan_files():
        found = markers(path)
        if not found:
            continue
        authored = []
        for m in found:
            hit = STATE.search(m.group(2))
            by_state[hit.group(1) if hit else "(absent)"] += 1
            if hit and hit.group(1) == "authored":
                authored.append(m)
        if not authored:
            continue
        base = base_of(path)
        for m in authored:
            command = m.group(1)
            tokens = TEST_TOKEN.findall(command)
            filtered = " +t" if NAME_FILTER.search(command) else ""
            if not base:
                by_shape["unresolved-base"] += 1
                continue
            if not tokens:
                by_shape["no test-file token"] += 1
                continue
            present = [git("cat-file", "-e", f"{base}:{t}").returncode == 0 for t in tokens]
            shape = "all exist" if all(present) else ("none exist" if not any(present) else "some exist")
            by_shape[shape + filtered] += 1

    print("Table 1 — well-formed task markers by declared red-state")
    for state, n in by_state.most_common():
        print(f"  {state or '(empty)':<24} {n:>4}")
    print(f"  {'TOTAL':<24} {sum(by_state.values()):>4}")

    print()
    print("Table 2 — red-state=authored markers: do the test files their command")
    print("          names exist at that plan's base?")
    for shape in sorted(by_shape):
        print(f"  {shape:<24} {by_shape[shape]:>4}")
    print(f"  {'TOTAL':<24} {sum(by_shape.values()):>4}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
