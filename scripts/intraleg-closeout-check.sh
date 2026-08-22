#!/usr/bin/env bash
#
# Closeout gate for BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG.
#
# Every check GATES on its own exit status. Printing a status beside a comment
# is not enforcement, and a composite that happens to exit non-zero because a
# later absence-check runs afterwards is ordering luck rather than design — so
# each check below fails independently, and each one first establishes that its
# input EXISTS. A grep over a missing file finds nothing, and "found nothing" is
# the same shape as "clean".
#
set -euo pipefail

ROW="BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG"
BRANCH="feat/mutation-verdict-intraleg-probe"

# Inputs are overridable ONLY so each branch below can be probed against a
# constructed failing input. A gate nobody has watched fail is a gate nobody has
# verified, and the defaults are the real ledgers.
OPEN_LEDGERS=("${FX_CLOSEOUT_BACKLOG:-BACKLOG.md}" "${FX_CLOSEOUT_DEFERRED:-DEFERRED.md}")
ARCHIVE="${FX_CLOSEOUT_ARCHIVE:-BACKLOG-archive.md}"
BASE="${FX_CLOSEOUT_BASE:-origin/main}"

# The AC-13 freeze set. Stated ONCE in the spec's AC-13 row; this is its
# executable copy and the two are asserted identical by the probe record.
FREEZE_PATHS=(
  tests/mutation/source/determinism.ts
  tests/mutation/source/runner.ts
  tests/mutation/source/gate.ts
  tests/mutation/source/records.ts
  tests/mutation/source/registry.ts
  'tests/mutation/guardSurfaces.*'
  .github/workflows/
)

fail() {
  printf 'CLOSEOUT FAILED: %s\n' "$1" >&2
  exit 1
}

# Ledger ids are declared at BOTH depths in this repo, and anchoring at `## `
# alone would be blind in the same direction as the defect this check exists to
# prevent: BACKLOG.md declares 24 rows at `### ` and the archive 99. Measured,
# not assumed — `grep -cE '^### (BL|DEF)-'` on each file.
# `|| true` on the grep stage is load-bearing, not sloppiness. Under
# `set -euo pipefail` a grep that matches NOTHING exits 1, the pipeline inherits
# it, and the enclosing command substitution aborts the whole script — silently,
# with exit 1 and no message, in exactly the state where the ledger is clean.
# Every zero-match case below is therefore a NAMED failure instead of an abort.
heading_ids() {
  { grep -hoE '^#{2,3} (BL|DEF)-[A-Z0-9][A-Z0-9-]*' "$@" || true; } | sed -E 's/^#+ //' | sort -u
}

# ---------------------------------------------------------------- 0. floors
for f in "${OPEN_LEDGERS[@]}" "$ARCHIVE"; do
  [ -f "$f" ] || fail "ledger file $f does not exist; every check below would read as clean"
  [ -s "$f" ] || fail "ledger file $f is empty; every check below would read as clean"
done

open_count=$(heading_ids "${OPEN_LEDGERS[@]}" | wc -l | tr -d ' ')
archived_count=$(heading_ids "$ARCHIVE" | wc -l | tr -d ' ')
# A zero here is the extractor failing, not the ledger being empty — the floors
# above already established the files exist and carry bytes. Named, because a
# confident zero over a broken extractor is the worst reading this gate can give.
[ "$open_count" -gt 0 ] || fail "extracted ZERO open ledger ids from ${OPEN_LEDGERS[*]}; the extractor is broken, not the ledger"
[ "$archived_count" -gt 0 ] || fail "extracted ZERO archived ledger ids from $ARCHIVE; the extractor is broken, not the archive"
printf 'ledger population: %s open, %s archived\n' "$open_count" "$archived_count"

# ------------------------------------------------- 1. the row is ARCHIVED
if heading_ids "${OPEN_LEDGERS[@]}" | grep -qx "$ROW"; then
  fail "ROW STILL OPEN — $ROW is still declared as a heading in the open ledger. The archive move has not been made."
fi
heading_ids "$ARCHIVE" | grep -qx "$ROW" ||
  fail "ROW NOT ARCHIVED — $ROW is absent from $ARCHIVE as a heading. It is neither open nor archived, which is worse than either."

# The entry's body, from its heading to the next heading of any depth.
entry=$(awk -v row="$ROW" '
  $0 ~ "^#+ " row "( |$|—)" { inside = 1; print; next }
  inside && /^#+ / { exit }
  inside { print }
' "$ARCHIVE")
[ -n "$entry" ] || fail "the archived entry for $ROW extracted EMPTY; the heading matched but the body did not"

# ------------------------------------- 2. the RE-SCOPE is stated FIRST
# A row whose stated close condition is unmet graduates on a re-scope, and the
# re-scope goes first so a reader cannot mistake the graduation for the original
# condition being met.
first_para=$(printf '%s\n' "$entry" | awk 'NR > 1 && NF { print; found = 1; next } found && !NF { exit }')
printf '%s\n' "$first_para" | grep -qiE 're-scop|rescop' ||
  fail "the archived entry's FIRST paragraph does not state the re-scope. It reads: $(printf '%s' "$first_para" | head -c 160)"

# ------------------------- 3. the eliminated/bounded table carries METHODS
printf '%s\n' "$entry" | grep -qiE 'eliminat' ||
  fail "the archived entry carries no eliminated/bounded table"
printf '%s\n' "$entry" | grep -qE '^\|' ||
  fail "the archived entry's eliminated/bounded content is not a table"
printf '%s\n' "$entry" | grep -qiE '\|[^|]*(how|established|method|evidence)[^|]*\|' ||
  fail "the eliminated/bounded table has no column naming HOW each was established; a list of conclusions is not the record"

# ---------------------------------------------------- 4. set arithmetic
both=$(comm -12 <(heading_ids "${OPEN_LEDGERS[@]}") <(heading_ids "$ARCHIVE"))
[ -z "$both" ] || fail "ids declared BOTH open and archived: $(printf '%s' "$both" | tr '\n' ' ')"

dupes=$({ grep -hoE '^#{2,3} (BL|DEF)-[A-Z0-9][A-Z0-9-]*' "${OPEN_LEDGERS[@]}" || true; } |
  sed -E 's/^#+ //' | sort | uniq -d)
[ -z "$dupes" ] || fail "duplicate open ledger headings: $(printf '%s' "$dupes" | tr '\n' ' ')"

# ------------------------------------------- 5. the in-progress marker is off
# The MARKER, not the branch name anywhere. Invariant 12's form is
# `**Branch:** <name>` (or `**PR:** #n`), and a bare `grep -F "$BRANCH"` cannot
# tell that from a legitimate citation — it fired on
# `docs/review-rounds/<branch>/<sha>.jsonl`, a corpus path this arc's own
# economy filing has to name. Over-matching a guard into blocking correct work
# is the same defect class as under-matching it.
marker=$({ grep -hoE "\\*\\*Branch:\\*\\* *$BRANCH" "${OPEN_LEDGERS[@]}" "$ARCHIVE" || true; } | wc -l | tr -d ' ')
[ "$marker" -eq 0 ] ||
  fail "the in-progress marker for $BRANCH still appears $marker time(s) in the ledgers. It comes off in this commit, so it never reaches main — where the origin-existence rule would fail on a branch the merge deleted."

# --------------------------------------------- 6. the AC-13 freeze diff
frozen=$(git diff "$BASE"...HEAD -- "${FREEZE_PATHS[@]}")
[ -z "$frozen" ] ||
  fail "the AC-13 freeze diff is NOT empty. This arc composes the shipped instruments and edits none of them:
$(printf '%s' "$frozen" | head -40)"

printf 'CLOSEOUT OK: row archived with its re-scope and methods, set arithmetic clean, marker off, freeze diff empty\n'
