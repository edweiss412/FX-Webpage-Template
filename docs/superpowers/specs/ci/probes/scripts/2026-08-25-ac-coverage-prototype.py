#!/usr/bin/env python3
"""Prototype of the acCoverage arm, and the generator of EVERY number in
`docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md`.

Tracked because spec round 2 finding 4 is right: a measurement whose generator is
untracked cannot be reproduced before implementation, and the round-1 marker-count
drift is what an unreproducible transcript looks like.

This is NOT the shipped arm. It is a Python approximation whose only job is to
justify the design before a line of TypeScript exists. The shipped suites
re-derive every number (spec AC-6 and AC-7); nothing here is trusted afterwards.

Faithfulness, stated so a reader can check rather than assume:
  - span pairing mirrors `extractSpans` at lib/specLint/parse.ts:37 (equal-length
    backtick runs pair; an unclosed run is literal)
  - cell ranges are 1-based and absolute, so a span is tested for FULL containment,
    which is how a span straddling a GFM cell boundary belongs to no cell
  - `sh -nc --` is spawned per span, and each result is kept under a (line, index)
    key — NOT under the line alone, which is the collision spec r2 finding 2 found
  - it does NOT reimplement `classifySpan`; the pin rule here is the narrow one the
    spec specifies, and the shipped arm delegates the verdict to that function

Usage:
    python3 <this> census          # section 2: the corpus grammar census
    python3 <this> blobs <dir>     # section 4: scores for the four historical blobs
    python3 <this> plants          # section 5: every plant, against the live fixture
    python3 <this> audit           # section 6.3: the 11-table stand-in, with accounting
    python3 <this> hazards         # section 6.4: table-reader hazard counts
    python3 <this> markers         # section 6.1: the red= marker population
"""
import collections
import pathlib
import re
import subprocess
import sys

PLANS = pathlib.Path("docs/superpowers/plans")
SPAN_RUN = re.compile(r"`+")
DELIM = re.compile(r"^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$")
FENCE_OPEN = re.compile(r"^ {0,3}(`{3,}|~{3,})")
PIN = re.compile(r"(?<![\w/.-])((?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+):(\d+)")


def spans(text):
    """Inline code spans, same pairing rule as lib/specLint/parse.ts:37."""
    runs = [(m.start(), len(m.group(0))) for m in SPAN_RUN.finditer(text)]
    out, i = [], 0
    while i < len(runs):
        pos, ln = runs[i]
        closed = False
        for j in range(i + 1, len(runs)):
            if runs[j][1] == ln:
                out.append((pos + ln + 1, text[pos + ln : runs[j][0]]))  # (1-based col, content)
                i = j + 1
                closed = True
                break
        if not closed:
            i += 1
    return out


def cells(line):
    """GFM cell ranges, 1-based and absolute. Leading and trailing pipes are BOTH
    optional (spec r2 findings 1 and the round-1 trailing-pipe repair)."""
    bounds = [i for i, c in enumerate(line) if c == "|" and (i == 0 or line[i - 1] != "\\")]
    if not bounds:
        return []
    stripped = len(line.rstrip())
    lead = line[: bounds[0]].strip() == ""
    edges = list(bounds)
    if not lead:
        edges = [-1] + edges  # the row omits its leading pipe; column 0 opens cell 1
    if not (bounds[-1] == stripped - 1 and len(bounds) >= 2):
        edges = edges + [stripped]  # the row omits its trailing pipe; EOL closes the last cell
    return [
        {"start": edges[k] + 2, "end": edges[k + 1] + 1, "text": line[edges[k] + 1 : edges[k + 1]]}
        for k in range(len(edges) - 1)
    ]


def unfenced(path):
    """(index, line) for every line outside a fenced block."""
    out, fence = [], None
    for i, l in enumerate(path.read_text(errors="replace").splitlines()):
        m = FENCE_OPEN.match(l)
        if fence is not None:
            if m and len(m.group(1)) >= len(fence) and m.group(1)[0] == fence[0]:
                fence = None
            continue
        if m:
            fence = m.group(1)
            continue
        out.append((i, l))
    return out


def tables(lines):
    """(header_line_1based, header, data_rows) for every markdown table."""
    i = 0
    while i < len(lines):
        if lines[i].lstrip().startswith("|"):
            j = i
            while j < len(lines) and lines[j].lstrip().startswith("|"):
                j += 1
            blk = lines[i:j]
            if len(blk) >= 2 and DELIM.match(blk[1]):
                yield i + 1, blk[0], blk[2:]
            i = j
        else:
            i += 1


def is_ac_table(rows):
    if not rows:
        return False
    hits = sum(1 for r in rows if re.match(r"^\|\s*\**\s*AC-\d", r))
    return hits >= max(1, len(rows) // 2)


def names_path(command_text, path):
    """Whole-argument match. NOT a `/`-suffix match: spec r2 finding 3 showed that
    accepts `archive/<path>`, a different, nonexistent file."""
    for raw in command_text.split():
        tok = raw.strip("'\"")
        if tok == path or tok == "./" + path:
            return True
    return False


def check_table(all_lines, header_line, command_col):
    """The arm, over one declared table. Returns (row_count, findings)."""
    findings, rows = [], 0
    j = header_line + 1  # skip header + delimiter (header_line is 1-based)
    while j < len(all_lines) and all_lines[j].strip() != "":
        line = all_lines[j]
        cs = cells(line)
        rows += 1
        if command_col > len(cs):
            findings.append((j + 1, "HARD", "AC_COVERAGE_COL_OUT_OF_RANGE", f"{len(cs)} cells"))
            j += 1
            continue
        cell = cs[command_col - 1]
        sp = [(c, t) for (c, t) in spans(line) if c >= cell["start"] and c + len(t) <= cell["end"] and t.strip()]
        if not sp:
            findings.append((j + 1, "HARD", "AC_COMMAND_CELL_NOT_RUNNABLE", repr(cell["text"].strip()[:70])))
        else:
            # Every span, each under its OWN key. A line-keyed store loses all but
            # the last, which is exactly spec r2 finding 2.
            outcomes = {}
            for idx, (_, content) in enumerate(sp):
                outcomes[(j + 1, idx)] = subprocess.run(
                    ["sh", "-nc", "--", content], capture_output=True
                ).returncode
            for idx, (_, content) in enumerate(sp):
                if outcomes[(j + 1, idx)] != 0:
                    findings.append((j + 1, "HARD", "AC_COMMAND_UNPARSABLE", repr(content[:70])))
            command_text = " ".join(t for (_, t) in sp)
            other = " | ".join(cs[k]["text"] for k in range(len(cs)) if k != command_col - 1)
            for m in PIN.finditer(other):
                p = m.group(1)
                if not p.startswith("tests/"):
                    continue
                if not names_path(command_text, p):
                    findings.append((j + 1, "ADVISORY", "AC_COMMAND_PIN_UNOBSERVED", m.group(0)))
        j += 1
    return rows, findings


def find_header(all_lines, needle="| AC | Proved by | Producing command |"):
    for i, l in enumerate(all_lines):
        if l.startswith(needle):
            return i + 1
    return None


def cmd_census():
    tot = 0
    ac = []
    hdrs, heads, cols = collections.Counter(), collections.Counter(), set()
    for f in sorted(PLANS.rglob("*.md")):
        L = f.read_text(errors="replace").splitlines()
        for hl, hdr, rows in tables(L):
            tot += 1
            if not is_ac_table(rows):
                continue
            ac.append((str(f), hl))
            hdrs[hdr.strip()] += 1
            cols.add(len(hdr.split("|")) - 2)
            h = "<none>"
            for k in range(hl - 2, -1, -1):
                if L[k].startswith("#"):
                    h = L[k].strip()
                    break
            heads[h] += 1
    print(f"total markdown tables in plan corpus: {tot}")
    print(f"AC coverage tables:                   {len(ac)}")
    print(f"distinct header rows among them:      {len(hdrs)}")
    print(f"distinct enclosing headings:          {len(heads)}")
    print(f"column counts observed:               {min(cols)} to {max(cols)}")
    exact = [p for p, _ in ac if "| AC | Proved by | Producing command |" in pathlib.Path(p).read_text()]
    print(f"tables in the PLAN CORPUS using the fixture's exact header: {len(exact)}")


def cmd_hazards():
    rows = esc = lead = strad = nolead = 0
    for f in PLANS.rglob("*.md"):
        for _, l in unfenced(f):
            if "|" not in l:
                continue
            if not re.match(r"^\s*\|", l):
                continue
            rows += 1
            if "\\|" in l:
                esc += 1
            if re.match(r"^\s+\|", l):
                lead += 1
            if any(re.search(r"(?<!\\)\|", t) for _, t in spans(l)):
                strad += 1
    print(f"unfenced table-shaped rows in the plan corpus: {rows}")
    print(f"  carrying an escaped pipe (\\|):               {esc}")
    print(f"  with leading whitespace before the pipe:     {lead}")
    print(f"  with a code span containing an unescaped |:  {strad}")


def cmd_markers():
    out = subprocess.run(
        ["git", "grep", "-hoE", "<!-- task: red=`[^`]*`", "--", "*.md"],
        capture_output=True, text=True,
    ).stdout.splitlines()
    cmds = [re.sub(r"^.*red=`", "", c).rstrip("`") for c in out]
    dash = [c for c in cmds if c.lstrip().startswith("-")]
    print(f"red= markers in tracked markdown: {len(cmds)}")
    print(f"  beginning with a dash:          {len(dash)}")


def cmd_audit():
    v1 = [0, 0]
    mod = [0, 0]
    items = []
    for f in sorted(PLANS.rglob("*.md")):
        L = f.read_text(errors="replace").splitlines()
        for hl, hdr, rws in tables(L):
            if not is_ac_table(rws):
                continue
            nc = len(cells(hdr))
            # The span must be in the LAST CELL, not anywhere in the row. Checking
            # the whole row admitted a table whose final column is `Task 1 (...)`
            # prose and whose earlier cells carry spans — an instrument defect
            # found by reading this script's own output against its stated filter.
            def last_cell_has_span(r):
                cr = cells(r)
                if len(cr) < nc:
                    return False
                cell = cr[nc - 1]
                return any(
                    c >= cell["start"] and c + len(t) <= cell["end"] and t.strip()
                    for c, t in spans(r)
                )
            withspan = sum(1 for r in rws if last_cell_has_span(r))
            if withspan / len(rws) < 0.8:
                continue
            _, fi = check_table(L, hl, nc)
            h = sum(1 for x in fi if x[1] == "HARD")
            if "v1-pre-deployment" in str(f):
                v1[0] += 1
                v1[1] += h
            else:
                mod[0] += 1
                mod[1] += h
                items += [(str(f), *x) for x in fi]
    print(f"v1-era handoff tables: {v1[0]} tables, {v1[1]} hard")
    print(f"2026-08 plan tables:   {mod[0]} tables, {mod[1]} hard")
    print(f"total:                 {v1[0] + mod[0]} tables, {v1[1] + mod[1]} hard")
    print("2026-08 findings, itemised:")
    for r in items:
        print(f"  {r[0]} L{r[1]} {r[2]} {r[3]} {r[4][:70]}")


def cmd_blobs(d):
    for c in ["173bfccfe", "b1db667e0", "f921a138b", "b3705cebd", "HEAD"]:
        p = pathlib.Path(d) / f"{c}.md"
        L = p.read_text().splitlines()
        hl = find_header(L)
        rows, fi = check_table(L, hl, 3)
        h = sum(1 for x in fi if x[1] == "HARD")
        a = sum(1 for x in fi if x[1] == "ADVISORY")
        print(f"{c}: rows={rows} {h} hard, {a} advisory")
        for x in fi:
            print(f"    {x}")


FIXTURE = PLANS / "2026-08-21-pane-compaction-send-authorization.md"
PLANTS = {
    "unplanted": (None, None),
    "a_prose_cell": (
        "| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |",
        "| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | both red commands above |",
    ),
    "b_pin_dropped": (
        "`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts`",
        "`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/docs/_metaPaneCompactionContract.test.ts`",
    ),
    "c_later_span_broken": (
        "`pnpm vitest run tests/paneCompaction/adapter.test.ts`; `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |",
        "`pnpm vitest run 'tests/paneCompaction/adapter.test.ts`; `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |",
    ),
    "c2_FIRST_span_broken": (
        "| `pnpm vitest run tests/paneCompaction/authorization.test.ts`; `pnpm vitest run tests/paneCompaction/adapter.test.ts`;",
        "| `pnpm vitest run 'tests/paneCompaction/authorization.test.ts`; `pnpm vitest run tests/paneCompaction/adapter.test.ts`;",
    ),
    "d_superstring_appended": (
        "tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts`",
        "tests/paneCompaction/driver.test.tsx tests/docs/_metaPaneCompactionContract.test.ts`",
    ),
    "e_superstring_prepended": (
        "tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts`",
        "archive/tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts`",
    ),
    "f_row_without_leading_pipe": (
        "| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |",
        "AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | both red commands above |",
    ),
}


def cmd_plants():
    src = FIXTURE.read_text()
    for name, (old, new) in PLANTS.items():
        text = src
        if old is not None:
            assert src.count(old) == 1, f"{name}: anchor matched {src.count(old)} times"
            text = src.replace(old, new)
        L = text.splitlines()
        hl = find_header(L)
        rows, fi = check_table(L, hl, 3)
        h = sum(1 for x in fi if x[1] == "HARD")
        a = sum(1 for x in fi if x[1] == "ADVISORY")
        print(f"{name}: rows={rows} {h} hard, {a} advisory")
        for x in fi:
            print(f"    {x}")


if __name__ == "__main__":
    {"census": cmd_census, "hazards": cmd_hazards, "markers": cmd_markers,
     "audit": cmd_audit, "plants": cmd_plants,
     "blobs": lambda: cmd_blobs(sys.argv[2])}[sys.argv[1]]()
