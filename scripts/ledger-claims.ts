#!/usr/bin/env tsx
/**
 * Who is working on which ledger row, right now.
 *
 * Invariant 12's marker lives on the working branch, so `origin/main` is
 * structurally the one place it can never appear. This reads the claim off every
 * live branch instead.
 *
 *   pnpm ledger:claims                    # the table
 *   pnpm ledger:claims --no-fetch         # from cached refs; what preflight runs
 *   pnpm ledger:claims --json             # {status, degraded, claims}
 *   pnpm ledger:claims --check BL-A BL-B  # 0 clear · 1 collision · 2 untrusted
 */
import { fileURLToPath } from "node:url";

import type { Claim, Resolution } from "./lib/ledger-claims-core";
import { resolveClaims } from "./lib/ledger-claims-core";
import { runCheck } from "./lib/ledger-check";
import { realGitSurface } from "./lib/ledger-git";

/** Display limit for the human table only. `--check` and `--json` see everything. */
const DISPLAY_CAP = 100;
const STALE_DAYS = 14;

/**
 * Report mode's `--json` payload.
 *
 * An ENVELOPE, never a bare array: a healthy empty result and a stale-cache
 * false all-clear both serialize as `[]`, and every report-level state the
 * table prints in its header would be invisible to a machine consumer.
 * `status` mirrors the exit code, which report mode always exits 0 with -- a
 * degraded READ is still a complete answer to "what is in flight", and only
 * `--check` makes an authoritative claim that can be untrusted, so the degraded
 * flags carry the caveat without overloading the exit code.
 *
 * NEVER CAPPED, and exported so that is provable. The display cap belongs to
 * the human table alone; a `claims.slice(0, N)` here silently truncates a
 * machine consumer's view of what is in flight. It is exported because the live
 * repository has ~13 claims, so an end-to-end CLI assertion cannot reach any
 * plausible cap -- the guard could not fail against the mutant it names
 * (whole-diff R11 F3). With the builder exposed, a 101-claim fixture tests the
 * CLI's own serialization rather than only the core's.
 */
export function reportEnvelope(res: Resolution): {
  status: number;
  degraded: string[];
  claims: Claim[];
} {
  return { status: 0, degraded: res.degraded, claims: res.claims };
}

function main(argv: string[]): number {
  const wantJson = argv.includes("--json");
  const noFetch = argv.includes("--no-fetch");
  const checkAt = argv.indexOf("--check");

  const unknown = argv.find(
    (a) => a.startsWith("--") && !["--json", "--no-fetch", "--check"].includes(a),
  );
  if (unknown) {
    process.stderr.write(`unknown flag: ${unknown}\n`);
    return 2;
  }

  const git = realGitSurface();

  if (checkAt !== -1) {
    // `--check` is the authoritative gate and ALWAYS fetches. Combining it with
    // `--no-fetch` would return exit 0 or 1 from a cache that may predate the
    // very push being checked for — an authoritative answer from an unverified
    // universe, which is the defect this tool exists to remove. Refused rather
    // than silently downgraded.
    if (noFetch) {
      process.stderr.write("--check always fetches; --no-fetch cannot be combined with it\n");
      return 2;
    }
    const ids = argv.slice(checkAt + 1).filter((a) => !a.startsWith("--"));
    const r = runCheck(git, ids, { fetch: true, verify: true });

    if (wantJson) {
      // `--check --json` is a machine caller asking a machine question; giving
      // it plain text made the JSON contract conditional on which mode you used.
      // `status` mirrors the exit code here, as the envelope promises.
      process.stdout.write(
        `${JSON.stringify(
          {
            status: r.code,
            // Same envelope keys as report mode: a machine consumer should not
            // have to branch on which flag produced the JSON.
            degraded: r.reasons,
            claims: r.collisions,
            warnings: r.warnings,
            notes: r.notes,
          },
          null,
          2,
        )}\n`,
      );
      return r.code;
    }

    for (const n of r.notes) process.stdout.write(`${n}\n`);
    for (const w of r.warnings) process.stdout.write(`${w}\n`);
    for (const reason of r.reasons) process.stderr.write(`${reason}\n`);
    for (const c of r.collisions) {
      const pr = c.pr === null ? "" : ` (PR #${c.pr})`;
      process.stderr.write(`COLLISION: ${c.id} is already declared by ${c.branch}${pr}\n`);
    }
    if (r.code === 0 && r.collisions.length === 0 && r.warnings.length === 0) {
      process.stdout.write("no collision\n");
    }
    return r.code;
  }

  const res = resolveClaims(git, { fetch: !noFetch });

  if (wantJson) {
    process.stdout.write(`${JSON.stringify(reportEnvelope(res), null, 2)}\n`);
    return 0;
  }

  // --- human table -----------------------------------------------------------
  if (noFetch) process.stdout.write("(cached refs; run `pnpm ledger:claims` for a fresh read)\n");
  for (const d of res.degraded) {
    if (d !== "no-fetch-cached-refs") process.stdout.write(`note: ${d}\n`);
  }

  const fresh = res.claims.filter((c) => !c.stale);
  const stale = res.claims.filter((c) => c.stale);

  if (res.claims.length === 0) {
    process.stdout.write("no claims in flight on any live branch\n");
    return 0;
  }

  // The cap is global across BOTH sections and applies INSIDE an id group. It
  // previously broke only between groups, so one id claimed by 101 branches
  // printed 101 rows, and 100 fresh plus 100 stale printed 200 — in both cases
  // with no omission notice, which is the silent truncation the cap exists to
  // avoid being.
  let budget = DISPLAY_CAP;
  let omitted = 0;

  const render = (rows: typeof res.claims) => {
    const byId = new Map<string, typeof res.claims>();
    for (const c of rows) byId.set(c.id, [...(byId.get(c.id) ?? []), c]);
    for (const [id, cs] of byId) {
      if (budget <= 0) {
        omitted += cs.length;
        continue;
      }
      process.stdout.write(`${id}\n`);
      for (const c of cs) {
        if (budget <= 0) {
          omitted++;
          continue;
        }
        const pr = c.pr === null ? "" : `  PR #${c.pr}`;
        process.stdout.write(`  ${c.kind.padEnd(8)} ${c.branch}${pr}  ${c.tipAgeDays}d ago\n`);
        budget--;
      }
    }
  };

  render(fresh);
  if (stale.length > 0) {
    process.stdout.write(`\nstale (tip older than ${STALE_DAYS} days) — listed, not dropped:\n`);
    render(stale);
  }
  if (omitted > 0) {
    process.stdout.write(`\n... ${omitted} more row(s) not shown (display cap ${DISPLAY_CAP}). `);
    process.stdout.write("Use --json for the complete, uncapped set.\n");
  }
  return 0;
}

// Only when run as a program. Without the guard, importing this module to test
// its own units EXECUTES the CLI and exits the test process -- which is why the
// uncapped-envelope guard could previously only be written against the core
// (whole-diff R11 F3). Same idiom as scripts/extract-spec-codes.ts:479.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
