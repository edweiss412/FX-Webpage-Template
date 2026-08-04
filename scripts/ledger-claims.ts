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
import { resolveClaims } from "./lib/ledger-claims-core";
import { runCheck } from "./lib/ledger-check";
import { realGitSurface } from "./lib/ledger-git";

/** Display limit for the human table only. `--check` and `--json` see everything. */
const DISPLAY_CAP = 100;
const STALE_DAYS = 14;

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
    const ids = argv.slice(checkAt + 1).filter((a) => !a.startsWith("--"));
    const r = runCheck(git, ids, { fetch: !noFetch, verify: true });
    for (const n of r.notes) process.stdout.write(`${n}\n`);
    for (const w of r.warnings) process.stdout.write(`${w}\n`);
    for (const reason of r.reasons) process.stderr.write(`${reason}\n`);
    for (const c of r.collisions) {
      process.stderr.write(`COLLISION: ${c.id} is already declared by ${c.branch}\n`);
    }
    if (r.code === 0 && r.collisions.length === 0 && r.warnings.length === 0) {
      process.stdout.write("no collision\n");
    }
    return r.code;
  }

  const res = resolveClaims(git, { fetch: !noFetch });

  if (wantJson) {
    // An ENVELOPE, never a bare array: a healthy empty result and a
    // stale-cache false all-clear both serialize as `[]`, and every
    // report-level state the table prints in its header would be invisible to a
    // machine consumer. Never capped.
    process.stdout.write(
      `${JSON.stringify({ status: res.degraded.length === 0 ? "ok" : "degraded", degraded: res.degraded, claims: res.claims }, null, 2)}\n`,
    );
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

  const render = (rows: typeof res.claims) => {
    const byId = new Map<string, typeof res.claims>();
    for (const c of rows) byId.set(c.id, [...(byId.get(c.id) ?? []), c]);
    let shown = 0;
    for (const [id, cs] of byId) {
      if (shown >= DISPLAY_CAP) break;
      process.stdout.write(`${id}\n`);
      for (const c of cs) {
        const pr = c.pr === null ? "" : `  PR #${c.pr}`;
        process.stdout.write(`  ${c.kind.padEnd(8)} ${c.branch}${pr}  ${c.tipAgeDays}d ago\n`);
        shown++;
      }
    }
    const omitted = rows.length - shown;
    if (omitted > 0) process.stdout.write(`  ... ${omitted} more not shown (display cap)\n`);
  };

  render(fresh);
  if (stale.length > 0) {
    process.stdout.write(`\nstale (tip older than ${STALE_DAYS} days) — listed, not dropped:\n`);
    render(stale);
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
