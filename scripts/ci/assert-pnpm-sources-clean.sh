#!/usr/bin/env bash
# scripts/ci/assert-pnpm-sources-clean.sh
#
# Runs BEFORE any pnpm/node invocation in CI (R13-B): the node-side pnpm
# settings allowlist executes inside the very process those settings
# control — an effective nodeOptions preload (--import=data:…process.exit(0))
# exits node successfully before vitest or the run-excluded oracle starts,
# so every vitest-hosted guard reports nothing while the step goes green.
# This layer is bash-only by construction and checks exactly the
# node-killing routes; everything else stays with the (unpoisoned-world)
# vitest allowlist in tests/scripts/runExcludedTest.test.ts.
#
# Pinned verbatim as a pre-step of the unit-suite vitest jobs
# (tests/cross-cutting/unit-suite-shard-topology.test.ts) and of the x5
# run-excluded job (tests/ci/_metaEnvBoundExclusionCoverage.test.ts).
set -euo pipefail

fail() {
  echo "assert-pnpm-sources-clean: $1" >&2
  exit 1
}

[ ! -f .npmrc ] || fail ".npmrc exists — an unbounded pnpm settings source"

for f in package.json pnpm-workspace.yaml; do
  [ -f "$f" ] || continue
  # Comments included on purpose: refuse-to-model. The token has no
  # legitimate use in either file in this repo.
  if grep -nE 'node-options|nodeOptions' "$f"; then
    fail "$f mentions node-options/nodeOptions — a preload can exit node before any test runs"
  fi
done

echo "assert-pnpm-sources-clean: ok"
