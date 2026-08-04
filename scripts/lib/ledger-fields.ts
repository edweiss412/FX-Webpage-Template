/**
 * Ledger entry parsing, shared by the in-progress guard and the claim reader.
 *
 * Moved out of `tests/docs/_metaLedgerInProgress.test.ts` so `scripts/**` can
 * consume it without importing a vitest module whose top-level `describe`/`it`
 * execute on import.
 *
 * NO NETWORK, NO `git`. The one piece of I/O is `ledgerFiles`'s single
 * `readdirSync` of the repo root.
 *
 * ENTRY RECOGNITION IS NOT OURS. Ids and spans come from `extractEntries`, the
 * repository's authoritative ledger walker. The regex this file used to carry
 * required an em dash after the id, which `## BL-NULLCODE-STAMP-BATCH-2
 * residuals (2026-07-03)` does not have — so that entry was invisible here while
 * the walker saw it, and a marker on it resolved to the PRECEDING entry with
 * every vacuity gate satisfied. Two grammars for one file format is the defect;
 * a stricter second grammar merely relabels it.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { extractEntries, type ExtractOpts } from "../../tests/docs/_ledgerMdast";

const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };
const DEFERRED_OPTS: ExtractOpts = { requirePrefix: null, levels: [3] };

/**
 * Per-ledger opts. Not interchangeable: applying the backlog opts to a deferred
 * file yields zero entries, so a whole ledger disappears without any file being
 * empty.
 */
export function optsFor(file: string): ExtractOpts {
  return /^DEFERRED(-archive)?\.md$/.test(file) ? DEFERRED_OPTS : BACKLOG_OPTS;
}

/**
 * Ledger files, discovered rather than listed — within one naming family. A new
 * family (or a differently-suffixed archive) is invisible to this and to the two
 * guards that hardcode the same four names; tracked as
 * `BL-LEDGER-DISCOVERY-FAMILY-SCOPED`.
 */
export function ledgerFiles(root: string = join(__dirname, "..", "..")): string[] {
  return readdirSync(root)
    .filter((f) => /^(BACKLOG|DEFERRED)(-archive)?\.md$/.test(f))
    .sort();
}

export type LedgerItem = {
  file: string;
  id: string;
  /** 1-based line of the entry's own heading. */
  line: number;
  /** 1-based last line of the entry, inclusive; the line before the next entry. */
  endLine: number;
  /** Bold-run fields, window ∪ same-line-with-in-progress-status. */
  fields: Record<string, string>;
  /** Every line of the body, so predicates need no second read of the file. */
  bodyLines: string[];
};

const IN_PROGRESS = /\b(in[\s-]?progress|in[\s-]?flight|wip|underway)\b/i;

/** Fields that only make sense on work in flight. */
export const FLIGHT_FIELDS = ["Branch", "PR", "Owner", "Assignee", "In progress"] as const;

/** `feat/thing`, `fix/thing-2`, `chore/a-b-c` — the repo's own branch grammar. */
export const BRANCH_SHAPE = /^[a-z][a-z0-9]*\/[a-z0-9][a-z0-9._-]*$/;
export const PR_SHAPE = /^#\d+$/;

/**
 * Bold-run fields on ONE line, `**Key:** value · **Key2:** value2`. A value ends
 * at the next bold run on its line, matching how the entries are actually
 * written — a greedy read would swallow the whole meta line into the first key.
 */
export function fieldsOfLine(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const marks: { key: string; end: number; at: number }[] = [];
  const re = /\*\*([^*\n]{1,60}?):?\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const key = (m[1] ?? "").replace(/:\s*$/, "").trim();
    if (key) marks.push({ key, at: m.index, end: m.index + m[0].length });
  }
  marks.forEach((mark, i) => {
    const next = marks[i + 1];
    const stop = next ? next.at : line.length;
    const raw = line
      .slice(mark.end, stop)
      .replace(/^[:\s]*/, "")
      .replace(/\s*·\s*$/, "")
      .trim();
    if (out[mark.key] === undefined) out[mark.key] = raw;
  });
  return out;
}

/**
 * Entries with their spans and meta fields.
 *
 * Fields resolve from the first 12 lines of the body UNION any line that itself
 * carries an in-progress `Status`. The window alone misses a marker appended to
 * the end of a long entry; the union alone would let a `**Branch:**` quoted deep
 * in a discussion register as the entry's own. Requiring the status on the same
 * line is what separates the two. Window value wins on a key collision, so
 * existing entries are untouched.
 */
export function ledgerItems(file: string, text: string): LedgerItem[] {
  const entries = extractEntries(text, optsFor(file));
  const lines = text.split("\n");

  return entries.map((e, n) => {
    const line = e.line;
    const endLine = (entries[n + 1]?.line ?? lines.length + 1) - 1;
    const bodyLines = lines.slice(line, endLine);

    const fields: Record<string, string> = {};
    for (const l of bodyLines.slice(0, 12)) {
      for (const [k, v] of Object.entries(fieldsOfLine(l)))
        if (fields[k] === undefined) fields[k] = v;
    }
    for (const l of bodyLines) {
      const f = fieldsOfLine(l);
      if (!IN_PROGRESS.test(f.Status ?? "")) continue;
      for (const [k, v] of Object.entries(f)) if (fields[k] === undefined) fields[k] = v;
    }

    return { file, id: e.id, line, endLine, fields, bodyLines };
  });
}

/**
 * In-progress detection. SCANS LINES; never reads `fields.Status`.
 *
 * `fields` resolves a key collision in the window's favour, so an entry reading
 * `Status: OPEN` near the top with a valid marker below line 12 has
 * `fields.Status === "OPEN"` while this is true. A predicate reading the field
 * would downgrade a live claim and then fire a false flight-field violation on a
 * correctly-marked entry.
 */
export const isInProgress = (it: LedgerItem): boolean =>
  it.bodyLines.some((l) => IN_PROGRESS.test(fieldsOfLine(l).Status ?? ""));

export const flightFieldsOn = (it: LedgerItem): string[] =>
  FLIGHT_FIELDS.filter((f) => (it.fields[f] ?? "").length > 0);
