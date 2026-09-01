// tests/parser/mutation/rebless.ts
//
// The decisions behind a parser-ledger re-bless, as importable functions.
//
// SEPARATE FROM ITS CLI for the reason scripts/check-shard-budget.ts gives in its
// own header: a guard whose main is inline cannot be imported, so it cannot be
// tested case by case and cannot be enrolled in the source-mutation registry.
// Nothing here calls process.exit or writes a file; the adapter does both.
//
// WHY THIS EXISTS AT ALL. The ledger's fingerprints have drifted and been
// re-blessed five times, and every one of those re-blesses was done by a script
// nobody committed -- the sharding plan's closeout names a regeneration script
// that is in no tree. The sixth instance should not re-derive it.
//
// WHAT IT REFUSES, which is the whole point. A re-bless is legitimate only when
// the reconciliation is pure fingerprint movement at stable (siteId, kind) pairs.
// A new hole is a coverage REGRESSION; a fixed hole is a coverage WIN. Absorbing
// either into a fingerprint refresh silently changes what the harness claims, so
// both are refusals with the sites named, never warnings.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { type Alarm, type KnownHole, reconcileLedger } from "./knownHoles";

export type ShardScan = { files: string[]; missing: number[]; duplicated: string[] };

/** One collected file, with the provenance its producer stamped. */
export type ShardFile = {
  path: string;
  index: number;
  shard: unknown;
  runId: unknown;
  alarms: Alarm[];
};

/**
 * Locate one `alarms-shard<i>.json` per shard index.
 *
 * COMPLETENESS IS THE POINT, and it is why this takes a COUNT rather than a glob.
 * Seven shards' alarms reconciled against a whole ledger makes every row of the
 * missing eighth read as a fixed hole -- the single input that would let a
 * re-bless delete a fifth of the ledger while reporting a clean coverage win.
 *
 * `actions/download-artifact` with a `pattern:` lays each artifact down as its
 * own directory, so both the flat and the per-artifact layout are accepted.
 * Anything deeper is not a shape this repo produces and is not guessed at.
 */
export function findShardFiles(root: string, shards: number): ShardScan {
  const files: string[] = [];
  const missing: number[] = [];
  const duplicated: string[] = [];
  // An unreadable root is a USAGE error, not "every shard is missing". The two read
  // identically downstream -- both produce a refusal -- but only one of them tells the
  // caller their path was wrong, and a refusal that blames the artifacts for a typo in
  // the directory sends the reader looking in the wrong place.
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    throw new Error(`alarms directory is not readable: ${root}`);
  }
  for (let i = 0; i < shards; i++) {
    const name = `alarms-shard${String(i)}.json`;
    const candidates = [join(root, name), ...entries.map((e) => join(root, e, name))];
    const found = candidates.filter((c) => {
      try {
        return statSync(c).isFile();
      } catch {
        return false;
      }
    });
    // EXACTLY once, not at least once. `find` returned the first match and silently
    // dropped the rest, so a flat copy beside a nested one -- or two nested artifact
    // directories -- read as a clean set while one of the two was chosen arbitrarily.
    // That is licensing condition 1 stated but not enforced, and the tool would have
    // re-blessed from whichever file the directory order happened to surface.
    if (found.length === 0) missing.push(i);
    else if (found.length > 1) duplicated.push(`shard ${String(i)}: ${found.join(", ")}`);
    else files.push(found[0]!);
  }
  return { files, missing, duplicated };
}

/** Throws rather than returning a partial list: a file that parsed to something
 *  without an `alarms` array is corrupt input, and treating it as zero alarms is
 *  the same silent-deletion shape `findShardFiles` exists to prevent. */
export function readShardFiles(files: readonly string[]): ShardFile[] {
  return files.map((path, index) => {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (!Array.isArray(parsed.alarms)) throw new Error(`${path} has no \`alarms\` array`);
    return {
      path,
      index,
      shard: parsed.shard,
      runId: parsed.runId,
      alarms: parsed.alarms as Alarm[],
    };
  });
}

/**
 * PROVENANCE, which a filename cannot establish because the reader chooses it.
 *
 * Two shapes, both of which pass every presence check: a file renamed onto an index
 * it did not come from, and a file left over from an earlier download sitting among
 * fresh ones. The second is the one that re-blesses a mixed snapshot silently, so
 * disagreeing run identities is a refusal rather than a warning.
 */
export function provenanceProblems(files: readonly ShardFile[]): string[] {
  const problems: string[] = [];
  for (const f of files) {
    if (f.shard !== f.index) {
      problems.push(`${f.path} declares shard ${String(f.shard)} but sits at index ${f.index}`);
    }
  }
  // A run identity must be PRESENT, a STRING, and NON-EMPTY before it can be compared.
  // `String(runId)` accepted every one of: missing, null, "", {} and [] -- and made
  // `1` and `"1"` indistinguishable. A set of files that all declare nothing is not a
  // set that came from one run; it is a set with no provenance at all, which is the
  // condition this function exists to refuse.
  for (const f of files) {
    if (typeof f.runId !== "string" || f.runId === "") {
      problems.push(
        `${f.path} declares no usable runId (${JSON.stringify(f.runId)}); provenance cannot be established`,
      );
    }
  }
  const runs = new Set(
    files
      .filter((f) => typeof f.runId === "string" && f.runId !== "")
      .map((f) => f.runId as string),
  );
  if (runs.size > 1) {
    problems.push(`files come from ${runs.size} different runs: ${[...runs].sort().join(", ")}`);
  }
  return problems;
}

/**
 * CARDINALITY on the LEDGER side, the twin of the check below.
 *
 * Two rows for one `(siteId, kind)` and one current alarm makes `reconcileLedger`
 * report BOTH as `driftedStale` with `newHoles` and `fixedHoles` empty, so the drift
 * path accepts it; rewriting both to the current fingerprint preserves order, count
 * and the header census, and the internal `Set` then deduplicates them so the NEXT
 * reconciliation reports clean. The 1019 rows are unique today, which is why this is
 * checked rather than argued -- it is one ordinary edit away, and the
 * `rewritten !== drifted` cross-check catches it only as "the ledger text and the
 * parsed ledger disagree", which is not a diagnosis anyone can act on.
 */

/**
 * CARDINALITY on the RUN side, which set membership cannot see.
 *
 * `reconcileLedger` classifies by `(siteId, kind)` membership, so a run reporting
 * TWO fingerprints for one pair leaves `newHoles` and `fixedHoles` both empty and
 * reads as ordinary drift -- after which the rewrite writes whichever fingerprint
 * it saw last. A re-bless is a bijection onto the ledger's rows or it is not a
 * re-bless.
 */
export function ledgerCardinalityProblems(ledger: readonly KnownHole[]): string[] {
  const seen = new Map<string, number>();
  for (const h of ledger) {
    const k = `${h.siteId}|${h.kind}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `ledger carries ${n} rows for ${k}`);
}

export function cardinalityProblems(actual: readonly Alarm[]): string[] {
  const seen = new Map<string, Set<string>>();
  for (const a of actual) {
    const k = `${a.siteId}|${a.kind}`;
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(a.fingerprint);
  }
  return [...seen]
    .filter(([, fps]) => fps.size > 1)
    .map(([k, fps]) => `${k} carries ${fps.size} fingerprints: ${[...fps].sort().join(", ")}`);
}

export type Verdict =
  | { kind: "refuse"; newHoles: string[]; fixedHoles: string[] }
  | { kind: "current"; rows: number }
  | { kind: "drifted"; drifted: number; rows: number };

/** The one decision. `reconcileLedger` already partitions the diff; this says which
 *  partitions license a rewrite. */
export function classify(actual: readonly Alarm[], ledger: readonly KnownHole[]): Verdict {
  const rec = reconcileLedger(actual, ledger);
  if (rec.newHoles.length > 0 || rec.fixedHoles.length > 0) {
    return { kind: "refuse", newHoles: rec.newHoles, fixedHoles: rec.fixedHoles };
  }
  if (rec.driftedAlarms.length === 0) return { kind: "current", rows: ledger.length };
  return { kind: "drifted", drifted: rec.driftedAlarms.length, rows: ledger.length };
}

/**
 * Rewrite the fingerprint column of the ledger's text block, in place, preserving
 * row ORDER and row COUNT exactly -- a re-bless diff must be fingerprints and
 * nothing else, or it is not reviewable.
 *
 * The new fingerprint comes from the ACTUAL alarms rather than from a drift key,
 * so the value written is the one the run observed and not one parsed back out of
 * a display string.
 */
export function rewriteLedgerText(
  text: string,
  actual: readonly Alarm[],
): { next: string; rewritten: number } {
  const fresh = new Map<string, string>();
  for (const a of actual) fresh.set(`${a.siteId}|${a.kind}`, a.fingerprint);

  const open = text.indexOf("const RAW_HOLES = `");
  if (open === -1) throw new Error("no RAW_HOLES literal");
  const bodyStart = text.indexOf("\n", open) + 1;
  const bodyEnd = text.indexOf("\n`;", bodyStart);
  if (bodyEnd === -1) throw new Error("RAW_HOLES literal is unterminated");

  let rewritten = 0;
  const next = text
    .slice(bodyStart, bodyEnd)
    .split("\n")
    .map((row) => {
      if (row.trim() === "") return row;
      const [siteId, kind, fingerprint, ...rest] = row.split("|");
      const f = fresh.get(`${siteId}|${kind}`);
      if (f === undefined || f === fingerprint) return row;
      rewritten++;
      return [siteId, kind, f, ...rest].join("|");
    })
    .join("\n");

  return { next: text.slice(0, bodyStart) + next + text.slice(bodyEnd), rewritten };
}
