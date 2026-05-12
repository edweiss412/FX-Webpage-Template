#!/usr/bin/env bash
# Gate the M8 §13.2.3 amendment-3 spec patch.
set -euo pipefail

SPEC=docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md

extract_section() {
  local start_re="$1"
  awk -v start="$start_re" '
    function depth_of(line) {
      if (match(line, /^#+/)) return RLENGTH
      return 0
    }
    $0 ~ start { in_sec=1; print; depth=depth_of($0); next }
    in_sec && /^#+ / {
      d = depth_of($0)
      if (d <= depth) { in_sec=0; next }
    }
    in_sec { print }
  ' "$SPEC"
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

extract_section '^### 13\.2\.3' > "$TMP/13.2.3.md"
extract_section '^### 4\.1' > "$TMP/4.1.md"
extract_section '^### 14\.3' > "$TMP/14.3.md"

fail() {
  echo "x $1"
  exit 1
}

pass() {
  echo "ok $1"
}

count_multiline() {
  local pat="$1"
  local file="$2"
  perl -0777 -ne 'BEGIN{$c=0}while(/'"$pat"'/sg){$c++}END{print $c}' "$file"
}

must_be_zero_in() {
  local file="$1"
  local pat="$2"
  local label="$3"
  local n
  n=$(count_multiline "$pat" "$file")
  [[ "$n" == "0" ]] || fail "$label (expected 0 in $(basename "$file"), got $n)"
  pass "$label [$(basename "$file")]"
}

must_be_at_least_in() {
  local file="$1"
  local pat="$2"
  local min="$3"
  local label="$4"
  local n
  n=$(count_multiline "$pat" "$file")
  (( n >= min )) || fail "$label (expected >=$min in $(basename "$file"), got $n)"
  pass "$label [$(basename "$file")]"
}

must_be_zero_in "$TMP/13.2.3.md" 'searchIssuesByMarker' 'rejected: code-search recovery removed'
must_be_zero_in "$TMP/13.2.3.md" "processing_lease_until\\s*<\\s*now\\(\\)\\s*-\\s*interval\\s*'24" 'rejected: lease-time reaper predicate removed'
must_be_zero_in "$TMP/13.2.3.md" 'UPDATE\s+reports\s+SET\s+github_issue_url\s*=\s*\$url\s+WHERE\s+id\s*=\s*\$reportId' 'rejected: unfenced tail UPDATE removed'

must_be_at_least_in "$TMP/13.2.3.md" 'findIssueByMarker' 1 'amendment 1: findIssueByMarker introduced'
must_be_at_least_in "$TMP/13.2.3.md" 'GITHUB_BOT_LOGIN' 1 'amendment 1: bot-login env'
must_be_at_least_in "$TMP/13.2.3.md" 'issue\.created_at' 1 'amendment 1: client-side created_at post-filter'
must_be_at_least_in "$TMP/13.2.3.md" 'LookupInconclusive' 1 'amendment 1: fail-closed sentinel'
must_be_at_least_in "$TMP/14.3.md" 'GITHUB_BOT_LOGIN' 1 'amendment 1: bot-login env declared in §14.3 env table'
must_be_at_least_in "$TMP/13.2.3.md" 'DUPLICATE_LIVE_MATCHES' 1 'amendment 1: duplicate-live-matches fail-closed'

must_be_at_least_in "$TMP/13.2.3.md" "created_at\\s*<\\s*now\\(\\)\\s*-\\s*interval\\s*'24\\s*hours'" 1 'amendment 2: reaper created_at cutoff'
must_be_at_least_in "$TMP/13.2.3.md" "AND\\s+processing_lease_until\\s*<\\s*now\\(\\)" 1 'amendment 2: reaper live-lease skip'
must_be_at_least_in "$TMP/13.2.3.md" "created_at\\s*>=\\s*now\\(\\)\\s*-\\s*interval\\s*'24\\s*hours'" 1 'amendment 2: retry lease-claim horizon fence'

must_be_at_least_in "$TMP/4.1.md" 'lease_holder\s+uuid' 1 'amendment 3: lease_holder uuid in §4.1 schema sketch'
must_be_at_least_in "$TMP/13.2.3.md" 'lease_holder\s+uuid' 1 'amendment 3: lease_holder uuid in §13.2.3 runtime contract'
must_be_at_least_in "$TMP/13.2.3.md" 'INSERT\s+INTO\s+reports[^;]*?\([^)]*processing_lease_until[^)]*lease_holder[^)]*\)' 1 'amendment 3: reservation INSERT contains lease fields'
must_be_at_least_in "$TMP/13.2.3.md" "VALUES\\s*\\([^)]*now\\(\\)\\s*\\+\\s*interval\\s*'90\\s*seconds'[^)]*::uuid[^)]*\\)" 1 'amendment 3: reservation VALUES sets lease window and holder'
must_be_at_least_in "$TMP/13.2.3.md" 'processing_lease_until\s*>\s*now\(\)' 1 'amendment 3: existing-row dispatch checks live lease'
must_be_at_least_in "$TMP/13.2.3.md" 'processing_lease_until\s*<=?\s*now\(\)' 1 'amendment 3: existing-row dispatch checks expired lease'
must_be_at_least_in "$TMP/13.2.3.md" 'rotate\s+lease_holder|lease_holder[^.]*rotated' 1 'amendment 3: lease re-acquisition rotates lease_holder'
must_be_at_least_in "$TMP/13.2.3.md" 'AND\s+lease_holder\s*=' 2 'amendment 3: tail-UPDATE fences original + retry'
must_be_at_least_in "$TMP/13.2.3.md" 'fxav-orphan-lost-lease' 1 'amendment 3: orphan-cleanup label'
must_be_at_least_in "$TMP/13.2.3.md" 'REPORT_ORPHANED_LOST_LEASE' 1 'amendment 3: orphan admin_alerts code'
must_be_at_least_in "$TMP/13.2.3.md" 'REPORT_HORIZON_EXPIRED' 1 'amendment 3: reaped-row 410'

echo
echo "All §13.2.3 amendment-3 invariants present."
