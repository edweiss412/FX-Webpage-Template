#!/usr/bin/env bash
# scripts/ci/attached-target-closeout-check.sh
#
# Ledger closeout gate for BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION.
#
# Every predicate anchors on a DECLARATION (`^## <id>`), never on a mention:
# archive entries routinely cite other rows by id in their prose, so an
# id-anywhere grep reports a row as archived before anything is archived, and
# reports 120 false both-open-and-archived overlaps.
#
# Each check prints PASS or FAIL and the whole script exits non-zero on any
# failure. No check shares a command with an irreversible action.
set -uo pipefail

ROW="BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION"
cd "$(git rev-parse --show-toplevel)" || exit 2
FAILED=0
note() { printf '%-6s %s\n' "$1" "$2"; [ "$1" = FAIL ] && FAILED=1; return 0; }

# The read must be proven to have succeeded before any count is taken: `wc -l`
# prints 0 for a missing file and exits 0, so "prints 0" and "could not look"
# are otherwise indistinguishable.
for f in BACKLOG.md BACKLOG-archive.md; do
  [ -r "$f" ] || { note FAIL "cannot read $f"; echo "ABORT"; exit 2; }
done

# `grep -c` exits 1 on zero matches and 2 on an unreadable file, and both
# would be swallowed by a bare `|| true`, so the two are separated: a real
# zero prints 0, an unreadable file aborts rather than counting as clean.
decl_count() {
  local n
  n=$(grep -c "^## ${2}" "$1" 2>/dev/null); local rc=$?
  if [ "$rc" -gt 1 ]; then note FAIL "cannot count declarations in $1"; echo "ABORT"; exit 2; fi
  printf '%s' "${n:-0}"
}

OPEN=$(decl_count BACKLOG.md "$ROW")
ARCH=$(decl_count BACKLOG-archive.md "$ROW")

# 1. the row is DECLARED in the archive, exactly once
[ "$ARCH" = 1 ] && note PASS "row declared in archive exactly once" \
                || note FAIL "row declared in archive $ARCH times, expected 1"

# 2. the row is GONE from the open queue
[ "$OPEN" = 0 ] && note PASS "row absent from open queue" \
                || note FAIL "row still declared open $OPEN times"

# 3. no id is BOTH open and archived — computed over declarations only
# mktemp, not a fixed name: this script ships, this machine runs many arcs at
# once, and two concurrent runs on one path would each read the other's set.
OVERLAP=$(mktemp "${TMPDIR:-/tmp}/closeout_overlap.XXXXXX") || { echo "ABORT: mktemp failed"; exit 2; }
trap 'rm -f "$OVERLAP"' EXIT
comm -12 \
  <(grep -oE '^## (BL|DEF)-[A-Z0-9-]+' BACKLOG.md | sed 's/^## //' | sort -u) \
  <(grep -oE '^## (BL|DEF)-[A-Z0-9-]+' BACKLOG-archive.md | sed 's/^## //' | sort -u) \
  > "$OVERLAP"
OVER=$(wc -l < "$OVERLAP" | tr -d ' ')
[ "$OVER" = 0 ] && note PASS "no id both open and archived" \
                || { note FAIL "$OVER ids both open and archived"; head -5 "$OVERLAP"; }

# 4. no in-progress marker survives anywhere in the ledger
MARK=$(grep -c 'Status:\*\* IN PROGRESS' BACKLOG.md BACKLOG-archive.md 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
[ "$MARK" = 0 ] && note PASS "zero in-progress markers" \
                || note FAIL "$MARK in-progress markers survive"

echo "----"
[ "$FAILED" = 0 ] && { echo "CLOSEOUT: PASS"; exit 0; } || { echo "CLOSEOUT: FAIL"; exit 1; }
