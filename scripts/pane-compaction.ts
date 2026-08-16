#!/usr/bin/env tsx
/**
 * Which panes want compacting, and what it would take.
 *
 *   pnpm panes:compact                       # the report
 *   pnpm panes:compact --json                # {status, degraded, panes}
 *   pnpm panes:compact --check --as <id>     # 0 clear · 1 actionable · 2 untrusted
 *
 * A thin adapter. Every decision lives in the importable core, which is what
 * lets the classifier be enrolled in the source-mutation registry — a terminal
 * script cannot be.
 */
import { checkExitCode, renderRow, reportEnvelope } from "./lib/pane-compaction-core";

export const USAGE = "pnpm panes:compact [--json] [--check --as <sessionId>]";

export { checkExitCode, renderRow, reportEnvelope };
