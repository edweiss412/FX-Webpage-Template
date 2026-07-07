#!/usr/bin/env bash
# worktree-link-env.sh — symlink gitignored local secrets from the MAIN worktree
# into the current (linked) worktree, so DB/e2e tests don't fail on missing env.
#
# WHY: `.env.local` is gitignored and lives only in the main checkout. A fresh
# `git worktree add` starts with no `.env.local`, so every test that reads
# HASH_FOR_LOG_PEPPER / SUPABASE_* / TEST_DATABASE_URL / PICKER_COOKIE_SIGNING_KEY
# fails with confusing downstream errors until the file is present. A SYMLINK
# (not a copy) keeps one source of truth — edit main, every worktree sees it, no
# stale drift.
#
# Idempotent + safe: never overwrites a real file (only replaces an existing
# symlink), refuses to run from the main worktree, verifies the link resolves.
#
# Usage (from inside the target worktree):
#   bash scripts/worktree-link-env.sh
#   pnpm worktree:link-env
set -euo pipefail

# Files to link from main. Add more gitignored local-only secrets here if needed.
LINK_FILES=(".env.local")

# Resolve the MAIN worktree root: the parent of the shared .git common dir.
common_dir="$(git rev-parse --git-common-dir)"
case "$common_dir" in
  /*) : ;;                               # already absolute
  *)  common_dir="$(cd "$common_dir" && pwd)" ;;
esac
main_root="$(dirname "$common_dir")"
here="$(git rev-parse --show-toplevel)"

if [ "$here" = "$main_root" ]; then
  echo "worktree-link-env: current dir IS the main worktree ($main_root) — nothing to link." >&2
  exit 0
fi

status=0
for f in "${LINK_FILES[@]}"; do
  src="$main_root/$f"
  dst="$here/$f"

  if [ ! -e "$src" ]; then
    echo "  SKIP  $f — not present in main worktree ($src)" >&2
    continue
  fi

  # Already correctly linked? no-op.
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    echo "  OK    $f — already linked"
    continue
  fi

  # Real (non-symlink) file already here — refuse to clobber a possibly-edited copy.
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    echo "  KEEP  $f — a real file already exists here; not overwriting" >&2
    status=1
    continue
  fi

  ln -sfn "$src" "$dst"
  echo "  LINK  $f -> $src"
done

# Verify the primary secret file resolves and is readable.
if [ -r "$here/.env.local" ]; then
  echo "worktree-link-env: .env.local resolves ✓"
else
  echo "worktree-link-env: .env.local NOT readable after linking ✗" >&2
  status=1
fi

exit $status
