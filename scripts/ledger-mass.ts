/**
 * `pnpm ledger:mass` — severity × effort weighted mass over the OPEN ledger queues.
 *
 * Spec: `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §3.1-§3.2.
 *
 * The open-entry count reads flat while debt actually shrinks, because closing
 * an L and filing an XS is net zero to a count and a large win to the queue.
 * Mass is the number that moves: it weights each entry by how much work it
 * claims and how much it matters.
 *
 * NO SECOND GRAMMAR. Entries come from `scripts/lib/ledger-fields.ts`
 * (`ledgerFiles`, `ledgerItems`), which is the repository's authoritative walker
 * — the same one the in-progress guard, the claim reader and the sizing guard
 * consume. A metric that parsed the ledgers its own way would drift from the
 * guards silently, and disagreeing counts are how a ledger stops being trusted.
 *
 * Usage:
 *   pnpm ledger:mass                  # working tree, human table
 *   pnpm ledger:mass --json           # the full machine envelope
 *   pnpm ledger:mass --at <rev>       # ledger blobs as committed at <rev>
 *   pnpm ledger:mass --root <dir>     # ledgers discovered under an alternate dir
 *
 * `--at` and `--root` are mutually exclusive: one names a git revision and the
 * other a filesystem tree, and silently letting one win would answer a question
 * nobody asked.
 *
 * Exit codes: 0 always on a successful read; 2 on a usage error. Mass is a
 * measurement, not a gate — the gate is `tests/docs/_metaLedgerSizing.test.ts`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ledgerFiles, ledgerItems, type LedgerItem } from "./lib/ledger-fields";

const ROOT = join(__dirname, "..");

/**
 * THE weights. One table, exported, referenced by every consumer — including
 * mdview, which necessarily re-implements the parse in its own runtime and is
 * kept honest by the §3.4 parity oracle rather than by sharing this module.
 *
 * These are conventions, not measurements (spec §5 limit 2): mass comparisons
 * are meaningful only under a fixed table, and changing it re-bases history.
 */
export const EFFORT_WEIGHTS = { XS: 1, S: 2, M: 4, L: 8 } as const;
export const SEVERITY_MULTIPLIERS = {
  low: 1,
  "low-medium": 1.5,
  medium: 2,
  "medium-high": 2.5,
  high: 3,
} as const;

export type EffortTier = keyof typeof EFFORT_WEIGHTS;
export type SeverityTier = keyof typeof SEVERITY_MULTIPLIERS;

/** Tier order for display and for the per-tier envelope — never `Object.keys`. */
export const EFFORT_TIERS = ["XS", "S", "M", "L"] as const;

/**
 * Effort by LEADING TOKEN, case-insensitive: `S–M depending on scope` is an S,
 * `S (read CI history) to M (if real)` is an S, and `likely S` is UNSIZED —
 * a hedge in front of the value means the value was never chosen. `XS` is
 * matched before `S` so the longer tier wins its own spelling.
 *
 * Returns null for absent-or-unrecognized, which is one state on purpose: both
 * mean no size was committed to, and both are excluded from mass.
 */
export function parseEffort(raw: string | undefined): EffortTier | null {
  const m = /^\s*(XS|S|M|L)\b/i.exec(raw ?? "");
  return m ? (m[1]!.toUpperCase() as EffortTier) : null;
}

/**
 * Severity by the same leading-token rule, longest spelling first so
 * `LOW-MEDIUM (false operator alert…)` does not read as `low`.
 *
 * The two outcomes are NOT one state here, unlike effort. Absent is the corpus
 * norm and means multiplier 1 silently — severity refines a mass, it never
 * gates one. Present-but-unrecognized also means multiplier 1, but the id is
 * REPORTED: a mistyped severity that contributed a plausible mass with no named
 * signal is precisely the silent-auto-correct failure this metric must not have.
 */
export function parseSeverity(raw: string | undefined): {
  tier: SeverityTier | null;
  unrecognized: boolean;
} {
  const value = (raw ?? "").trim();
  if (value === "") return { tier: null, unrecognized: false };
  const m = /^\s*(low-medium|medium-high|low|medium|high)\b/i.exec(value);
  if (!m) return { tier: null, unrecognized: true };
  return { tier: m[1]!.toLowerCase() as SeverityTier, unrecognized: false };
}

export type QueueReport = {
  file: string;
  entries: number;
  /** Sized entries only, per tier. Unsized are counted separately, never as a tier. */
  byTier: Record<EffortTier, number>;
  mass: number;
  unsized: string[];
  severityUnrecognized: string[];
};

export type MassReport = {
  source: { kind: "worktree" | "rev" | "root"; value: string };
  queues: QueueReport[];
  totals: {
    entries: number;
    byTier: Record<EffortTier, number>;
    mass: number;
    unsized: number;
    severityUnrecognized: number;
  };
};

/** `BACKLOG-archive.md` and friends. Mass measures the OPEN queues only. */
const isArchive = (file: string) => /-archive\.md$/.test(file);

export function reportForQueue(file: string, items: LedgerItem[]): QueueReport {
  const byTier: Record<EffortTier, number> = { XS: 0, S: 0, M: 0, L: 0 };
  const unsized: string[] = [];
  const severityUnrecognized: string[] = [];
  let mass = 0;

  for (const item of items) {
    const severity = parseSeverity(item.fields.Severity);
    if (severity.unrecognized) severityUnrecognized.push(item.id);

    const effort = parseEffort(item.fields.Effort);
    if (effort === null) {
      unsized.push(item.id);
      continue;
    }
    byTier[effort] += 1;
    mass += EFFORT_WEIGHTS[effort] * (severity.tier ? SEVERITY_MULTIPLIERS[severity.tier] : 1);
  }

  return { file, entries: items.length, byTier, mass, unsized, severityUnrecognized };
}

/**
 * One ledger file as committed at `rev`.
 *
 * A truncated object store and a mistyped rev both surface from `git show` as
 * `fatal: invalid object name`, and only one of them is the reader's mistake.
 * Shallow checkouts are the common case here — `actions/checkout` defaults to
 * `fetch-depth: 1` — so when the repo IS shallow the message says so and names
 * the fetch that repairs it, rather than sending the reader to re-check a rev
 * that was correct all along.
 */
function showAtRev(rev: string, file: string): string {
  try {
    return execFileSync("git", ["show", `${rev}:${file}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
    });
  } catch (cause) {
    const shallow =
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 30_000,
      }).trim() === "true";
    throw new Error(
      `--at could not read \`${file}\` at \`${rev}\`. ` +
        (shallow
          ? "This checkout is SHALLOW, so the rev is very likely absent rather than wrong. "
          : "This checkout is NOT shallow, so the rev is unknown here — check the spelling first; " +
            "if it is right, it lives on a branch this checkout has never fetched. ") +
        `Recover it with \`git fetch --no-tags ${shallow ? "--depth=1 " : ""}origin ${rev}\` ` +
        "(fetch-by-SHA needs the full 40 characters). " +
        `Underlying: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/** Ledger text for each open queue, from whichever source the flags selected. */
function readQueues(source: MassReport["source"]): { file: string; text: string }[] {
  if (source.kind === "rev") {
    // `--at` reads FILES as committed at that rev; an entry that moved between
    // files across history is counted where it then lived (spec §5 limit 5).
    // Discovery still comes from the working tree's naming family, since a rev
    // has no directory to walk without a second git call per candidate.
    return ledgerFiles(ROOT)
      .filter((f) => !isArchive(f))
      .map((file) => ({ file, text: showAtRev(source.value, file) }));
  }
  const root = source.kind === "root" ? source.value : ROOT;
  return ledgerFiles(root)
    .filter((f) => !isArchive(f))
    .map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }));
}

export function buildReport(source: MassReport["source"]): MassReport {
  const queues = readQueues(source).map(({ file, text }) =>
    reportForQueue(file, ledgerItems(file, text)),
  );

  const totals = {
    entries: queues.reduce((n, q) => n + q.entries, 0),
    byTier: EFFORT_TIERS.reduce(
      (acc, tier) => {
        acc[tier] = queues.reduce((n, q) => n + q.byTier[tier], 0);
        return acc;
      },
      { XS: 0, S: 0, M: 0, L: 0 } as Record<EffortTier, number>,
    ),
    mass: queues.reduce((n, q) => n + q.mass, 0),
    unsized: queues.reduce((n, q) => n + q.unsized.length, 0),
    severityUnrecognized: queues.reduce((n, q) => n + q.severityUnrecognized.length, 0),
  };

  return { source, queues, totals };
}

export function renderHuman(report: MassReport): string {
  const out: string[] = [];
  const label =
    report.source.kind === "worktree"
      ? "working tree"
      : report.source.kind === "rev"
        ? `rev ${report.source.value}`
        : `root ${report.source.value}`;
  out.push(`ledger mass — ${label}`);
  out.push("");
  out.push(
    `${"queue".padEnd(14)} ${"open".padStart(5)} ${EFFORT_TIERS.map((t) => t.padStart(4)).join("")} ${"unsized".padStart(8)} ${"mass".padStart(7)}`,
  );
  for (const q of report.queues) {
    out.push(
      `${q.file.padEnd(14)} ${String(q.entries).padStart(5)} ${EFFORT_TIERS.map((t) => String(q.byTier[t]).padStart(4)).join("")} ${String(q.unsized.length).padStart(8)} ${String(q.mass).padStart(7)}`,
    );
  }
  out.push(
    `${"TOTAL".padEnd(14)} ${String(report.totals.entries).padStart(5)} ${EFFORT_TIERS.map((t) => String(report.totals.byTier[t]).padStart(4)).join("")} ${String(report.totals.unsized).padStart(8)} ${String(report.totals.mass).padStart(7)}`,
  );

  // Unsized ids are LISTED, not just counted: an unsized entry is invisible to
  // mass, so the count alone understates the queue with nothing to act on.
  for (const q of report.queues) {
    if (q.unsized.length === 0) continue;
    out.push("");
    out.push(`${q.file} unsized (${q.unsized.length}) — excluded from mass:`);
    for (const id of q.unsized) out.push(`  ${id}`);
  }
  for (const q of report.queues) {
    if (q.severityUnrecognized.length === 0) continue;
    out.push("");
    out.push(
      `${q.file} severity-unrecognized (${q.severityUnrecognized.length}) — counted at multiplier 1:`,
    );
    for (const id of q.severityUnrecognized) out.push(`  ${id}`);
  }
  return out.join("\n");
}

function main(argv: string[]): number {
  const flagAt = argv.indexOf("--at");
  const flagRoot = argv.indexOf("--root");
  const json = argv.includes("--json");

  const unknown = argv.filter(
    (a, i) =>
      a.startsWith("--") &&
      !["--json", "--at", "--root"].includes(a) &&
      i !== flagAt + 1 &&
      i !== flagRoot + 1,
  );
  if (unknown.length > 0) {
    process.stderr.write(`unknown flag: ${unknown.join(" ")}\n`);
    return 2;
  }
  if (flagAt !== -1 && flagRoot !== -1) {
    process.stderr.write("--at and --root are mutually exclusive\n");
    return 2;
  }

  let source: MassReport["source"] = { kind: "worktree", value: ROOT };
  for (const [at, kind] of [
    [flagAt, "rev"],
    [flagRoot, "root"],
  ] as const) {
    if (at === -1) continue;
    const value = argv[at + 1];
    if (value === undefined || value.startsWith("--")) {
      process.stderr.write(`${kind === "rev" ? "--at" : "--root"} needs a value\n`);
      return 2;
    }
    source = { kind, value };
  }

  const report = buildReport(source);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderHuman(report)}\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
