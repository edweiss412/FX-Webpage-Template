#!/usr/bin/env bash
# scripts/ci/assert-pnpm-sources-clean.sh
#
# Pre-node CI layer (R13-B/R14-B): the node-side pnpm settings allowlist in
# tests/scripts/runExcludedTest.test.ts executes inside the very node process
# those settings control — an effective nodeOptions preload
# (--import=data:…process.exit(0)), whether from a pnpm config file OR a
# NODE_OPTIONS-shaped env var, exits node successfully before vitest or the
# run-excluded oracle starts, so every vitest-hosted guard reports nothing
# while the step goes green. This layer is pure bash — no node, no pnpm, no
# python — so nothing it checks can disable it, and it runs BEFORE any of
# them in every covering job.
#
# It defends exactly the node-killing routes; the broad settings/workflow
# qualification (every non-node-killing setting, the if:/shell:/step-env
# allowlists) stays with the vitest-hosted guards, which now run unpoisoned
# because this layer guarantees node starts clean.
#
# Pinned as a pre-step of the unit-suite vitest jobs
# (tests/cross-cutting/unit-suite-shard-topology.test.ts) and of the x5
# run-excluded job (tests/ci/_metaEnvBoundExclusionCoverage.test.ts).
#
# CEILING (round-economy fence, 2026-07-31): this catches drift, accident,
# and the demonstrated obfuscations (YAML/JSON escape-encoded keys, config
# nodeOptions, NODE_OPTIONS/npm_config_node_options env, defaults.run.shell
# no-op). It does NOT attempt to defeat an actor hand-crafting novel
# escape-encoded env KEYS inside a reviewed workflow file — that is a
# glaring tracked-file edit in the PR diff, code review's jurisdiction, the
# same ceiling ratified for the oracle/registry/meta-test themselves.
set -euo pipefail

fail() {
  echo "assert-pnpm-sources-clean: $1" >&2
  exit 1
}

# Whole-line `#` comments never execute / configure; strip them so a comment
# (an em-dash in prose, the word "nodeOptions" in a rationale) is not a hit.
strip_comments() { grep -vE '^[[:space:]]*#' "$1" 2>/dev/null || true; }

# 1. .npmrc is an unbounded pnpm settings source (quoted keys, array
#    spellings, config-source selectors, node-options) — refuse its
#    existence outright.
[ ! -f .npmrc ] || fail ".npmrc exists — an unbounded pnpm settings source"

# 2. pnpm CONFIG files: the node-killing key is `nodeOptions`. Backslash and
#    non-ASCII have no legitimate use in these files' directives, and every
#    demonstrated bypass needs one (\x4f / O / \U0000004f escapes, a
#    backslash-newline continuation splitting the key) — so refuse both,
#    plus the literal token in any case/separator form.
# Portable patterns only (no grep -P): CI is GNU/Linux but the vitest
# behavioral test runs this script on dev macOS (BSD grep) too.
for f in package.json pnpm-workspace.yaml; do
  [ -f "$f" ] || continue
  body="$(strip_comments "$f")"
  printf '%s' "$body" | grep -qF '\' && fail "$f contains a backslash — escape/continuation obfuscation of a settings key"
  printf '%s' "$body" | LC_ALL=C grep -q '[^[:print:][:space:]]' && fail "$f contains a non-ASCII byte outside comments"
  printf '%s' "$body" | grep -qiE 'node[_-]?options' && fail "$f mentions node-options — a preload can exit node before any test runs"
done

# 3. The covering WORKFLOW files: a NODE_OPTIONS / npm_config_node_options
#    env at any scope poisons the vitest node, and a `defaults:` run-shell
#    override no-ops every run step (including this guard AND the vitest
#    step). None appears legitimately in these two files. Backslash IS legit
#    here (run: blocks), so refuse the escape SEQUENCES (\x \u \U — verified
#    absent) and non-ASCII in non-comment lines instead of all backslashes.
for wf in .github/workflows/unit-suite.yml .github/workflows/x-audits.yml; do
  [ -f "$wf" ] || continue
  body="$(strip_comments "$wf")"
  printf '%s' "$body" | grep -qiE 'node[_-]?options' && fail "$wf references node-options in a directive — env poison of the vitest node"
  printf '%s' "$body" | grep -qE '(^|[^[:alnum:]_-])defaults[[:space:]]*:' && fail "$wf declares defaults: — a run-shell override can no-op the covering steps"
  printf '%s' "$body" | grep -qE '\\[xuU]' && fail "$wf contains a \\x/\\u/\\U escape — encoding obfuscation of an env key"
  printf '%s' "$body" | LC_ALL=C grep -q '[^[:print:][:space:]]' && fail "$wf contains a non-ASCII byte outside comments"
done

# 4. SELF-EXCLUSION (R16-B): the coverage/oracle/topology guards are the
#    only checks of the exclusion contract, and each is a vitest file that
#    ENV_BOUND_EXCLUDES could list — excluding a guard silently disables it
#    (the partition guard accepts zero membership for any array entry). This
#    pre-node layer is not excludable, so it refuses any guard test appearing
#    in the ENV_BOUND_EXCLUDES array of vitest.projects.ts.
if [ -f vitest.projects.ts ]; then
  arr="$(sed -n '/ENV_BOUND_EXCLUDES[[:space:]]*=[[:space:]]*\[/,/\]/p' vitest.projects.ts)"
  printf '%s' "$arr" | grep -qE '_metaEnvBoundExclusionCoverage\.test\.ts|runExcludedTest\.test\.ts|unit-suite-shard-topology\.test\.ts|vitest-projects-partition\.test\.ts' &&
    fail "a coverage/oracle guard test is listed in ENV_BOUND_EXCLUDES — it would exclude the very verifier of the exclusion contract"
  # R17-B: the literal scan above sees only what is written between the
  # brackets — identifier indirection (`const X = "…guard…"; [X]`), a spread,
  # or any non-literal entry hides the real runtime value from it while
  # vitest.config.ts still resolves and excludes the guard. The value-level
  # belt in _metaEnvBoundExclusionCoverage.test.ts catches indirection, but
  # is itself excludable (circular for self-exclusion), so this non-excludable
  # layer requires every array ELEMENT to be a PLAIN string literal — nothing
  # can then be hidden behind a name the runtime resolves differently.
  while IFS= read -r line; do
    t="$(printf '%s' "$line" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$t" ] && continue
    case "$t" in \#* | //*) continue ;; esac
    printf '%s' "$t" | grep -qE "^(\"[^\"]*\"|'[^']*'),?$" ||
      fail "ENV_BOUND_EXCLUDES entry is not a plain string literal: $t (indirection can hide a guard exclusion from the literal scan)"
  done < <(printf '%s' "$arr" | sed '1d;$d')
fi

# 5. SELF-ENVIRONMENT: a workflow/job-scoped NODE_OPTIONS (or pnpm's
#    npm_config_node_options) is present in THIS step's env too, since the
#    guard runs in the same job — refuse it directly, regardless of how the
#    workflow spelled it. Case-insensitive: node reads NODE_OPTIONS exactly,
#    but pnpm lowercases npm_config_* keys.
while IFS='=' read -r k _; do
  case "$(printf '%s' "$k" | tr '[:upper:]' '[:lower:]')" in
    node_options | npm_config_node_options | npm_config_node-options)
      fail "environment carries $k — a node preload poison at job/workflow scope"
      ;;
  esac
done < <(env)

echo "assert-pnpm-sources-clean: ok"
