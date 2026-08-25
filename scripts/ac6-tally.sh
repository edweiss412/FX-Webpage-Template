#!/bin/sh
# AC-6 tail tally, per the 2026-08-24 ruling. Mechanical, not declared.
#
#   ANCHOR   = last NON-DOCS commit on the branch (docs/ and *.md do not move it)
#   COUNTS   = a completed pull_request app-e2e run whose head is byte-identical to the anchor
#              outside docs/ and *.md  (git diff --name-only anchor..head, filtered, must be empty)
#   CANCELLED= neither counts nor breaks (supersession is our cadence, not the runner's stability)
#   A non-docs push MOVES the anchor and the tail restarts by construction.
set -e
W=/Users/ericweiss/FX-worktrees/loader
cd "$W"

ANCHOR=$(git log --format=%H HEAD | while read sha; do
  # --first-parent is load-bearing: a MERGE commit under a plain `git show --name-only`
  # prints only its combined-diff files (here, one .md), so the walker would classify a
  # merge that brought migrations and test files as DOCS-ONLY and skip past it.
  files=$(git show --name-only --format= --first-parent "$sha" | grep -v '^$' || true)
  nondocs=$(printf '%s\n' "$files" | grep -vE '^docs/|\.md$' || true)
  if [ -n "$nondocs" ]; then echo "$sha"; break; fi
done)
echo "anchor: $(echo "$ANCHOR" | cut -c1-9)  $(git log -1 --format=%s "$ANCHOR")"

gh run list --branch fix/admin-loader-ci-transient \
  --workflow "App e2e (mobile-safari + desktop-chromium)" --limit 40 \
  --json databaseId,headSha,event,status,conclusion,createdAt > /tmp/ac6-runs.json

python3 - "$ANCHOR" <<'PY'
import json, subprocess, sys
anchor = sys.argv[1]
runs = json.load(open("/tmp/ac6-runs.json"))
runs = [r for r in runs if r["event"] == "pull_request" and r["status"] == "completed"]
runs.sort(key=lambda r: r["createdAt"])
streak, counted = 0, []
for r in runs:
    sha = r["headSha"]
    try:
        out = subprocess.run(["git", "diff", "--name-only", f"{anchor}..{sha}"],
                             capture_output=True, text=True, check=True).stdout.split()
    except subprocess.CalledProcessError:
        continue                      # sha not present locally; cannot verify, do not count
    moved = [f for f in out if not (f.startswith("docs/") or f.endswith(".md"))]
    if moved:
        continue                      # outside the tail: predates the anchor or moved non-docs
    if r["conclusion"] == "cancelled":
        continue                      # neither counts nor breaks
    if r["conclusion"] == "success":
        streak += 1; counted.append((r["databaseId"], sha[:9]))
    else:
        streak = 0; counted = []      # a real red inside the tail resets it
print(f"runs in tail: {len(counted)}  consecutive green: {streak}/5")
for rid, sha in counted:
    print(f"  {rid}  {sha}  byte-identical to anchor outside docs/")
print("AC-6 MET" if streak >= 5 else f"AC-6 needs {5 - streak} more")
PY
