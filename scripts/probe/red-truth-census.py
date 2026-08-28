#!/usr/bin/env python3
"""Reproduces the two census tables in BL-SPECLINT-RED-TRUTH-PROBE's archive entry.

The row asked for a GREEN-AT-BASE lint over declared `red=` targets. It was
demoted on measurement, and these are the numbers behind the demotion:

  1. how many task markers declare each `red-state`, so the size of the
     population `--exec-red` does NOT reach is visible; and
  2. for `red-state=authored` markers, whether the test files their command
     names already exist at that plan's base -- which is what decides whether
     running the command there observes anything at all.

Read from git, never from the working tree, so the answer does not depend on
which branch is checked out. "That plan's base" is the parent of the commit
that first added the plan file, which is the tree an author's red would have
been written against.
"""
import collections
import re
import subprocess
import sys

# One line, backticked value: the shipped parser's marker shape
# (lib/specLint/taskContract.ts). A marker split across lines is not one.
MARKER = re.compile(r"<!--\s*task:\s*red=`([^`]*)`(.*?)-->")
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
    """Every well-formed one-line task marker in one plan, as (command, tail)."""
    blob = git("show", f"HEAD:{path}").stdout
    return list(MARKER.finditer(blob))


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
