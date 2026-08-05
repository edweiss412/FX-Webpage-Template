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

/** A ledger family: the stem its files are named for, plus how they parse. */
export type LedgerFamily = { readonly name: string; readonly opts: ExtractOpts };

/**
 * THE REGISTRY — the single grammar holder for what a ledger file IS.
 *
 * Discovery used to be a regex naming two families inline, and two other
 * consumers repeated the same four filenames independently: the
 * referential-integrity guard's own list and the claim reader. A fifth family
 * was therefore invisible three times over, which is
 * `BL-LEDGER-DISCOVERY-FAMILY-SCOPED`.
 *
 * WIDENED BY REGISTRATION RATHER THAN BY LOOSENING THE REGEX. Adding a family
 * here is one reviewed line and every consumer sees it at once; a looser pattern
 * would instead admit whatever it failed to model, and the repo root is full of
 * all-caps markdown that is not a ledger (README, AGENTS, CLAUDE, MEMORY). The
 * opts travel WITH the name because they are not interchangeable — applying the
 * backlog opts to a deferred file yields zero entries, so a whole ledger
 * disappears without any file being empty.
 */
export const LEDGER_FAMILIES: readonly LedgerFamily[] = [
  { name: "BACKLOG", opts: BACKLOG_OPTS },
  { name: "DEFERRED", opts: DEFERRED_OPTS },
];

/** `<FAMILY>.md` or `<FAMILY>-archive.md`, for one registered family. */
const fileRe = (family: string): RegExp => new RegExp(`^${family}(-archive)?\\.md$`);

/**
 * Ledger-SHAPED: an all-caps stem with an optional `-archive` suffix.
 *
 * Deliberately narrower than "a markdown file". This pattern exists only to
 * decide what `unregisteredLedgerFiles` is willing to COMPLAIN about, and a
 * report that names README.md on every run is one people learn to ignore —
 * which is the same dark ledger by another route.
 */
const LEDGER_SHAPED = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*(-archive)?\.md$/;

/** Stems that are all-caps markdown at the repo root but are not ledgers. */
const NOT_LEDGERS = new Set([
  "README",
  "AGENTS",
  "CLAUDE",
  "MEMORY",
  "PRODUCT",
  "DESIGN",
  "LICENSE",
]);

/**
 * Per-ledger opts, resolved through the registry.
 *
 * Falls back to the backlog opts for an unrecognised name so existing callers
 * that hand it an arbitrary string keep their previous behaviour.
 */
export function optsFor(
  file: string,
  families: readonly LedgerFamily[] = LEDGER_FAMILIES,
): ExtractOpts {
  return families.find((f) => fileRe(f.name).test(file))?.opts ?? BACKLOG_OPTS;
}

/**
 * Ledger files, discovered rather than listed — for every REGISTERED family.
 *
 * `families` is a parameter so a test can register a fifth family against a
 * fixture root without mutating module state, which is also what proves the
 * registry is consulted rather than a widened regex.
 */
export function ledgerFiles(
  root: string = join(__dirname, "..", ".."),
  families: readonly LedgerFamily[] = LEDGER_FAMILIES,
): string[] {
  const accept = families.map((f) => fileRe(f.name));
  return readdirSync(root)
    .filter((f) => accept.some((re) => re.test(f)))
    .sort();
}

/**
 * Ledger-shaped files at `root` that NO registered family claims.
 *
 * The other half of an accept-set: everything outside it is reported BY NAME
 * rather than skipped in silence. A new ledger family added to the repo without
 * a registry row shows up here instead of going dark, so the cost of forgetting
 * is a named failure rather than a guard that quietly stops covering a file.
 */
export function unregisteredLedgerFiles(
  root: string = join(__dirname, "..", ".."),
  families: readonly LedgerFamily[] = LEDGER_FAMILIES,
): string[] {
  const claimed = families.map((f) => fileRe(f.name));
  return readdirSync(root)
    .filter(
      (f) =>
        LEDGER_SHAPED.test(f) &&
        !claimed.some((re) => re.test(f)) &&
        !NOT_LEDGERS.has(f.replace(/(-archive)?\.md$/, "")),
    )
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
/**
 * Parsed entries, memoized by (file, content).
 *
 * Most branches never touch a ledger, so across 15 refs the same four blobs are
 * parsed 60 times — and the mdast walk over a 1400-line BACKLOG.md is the
 * dominant cost of the whole read: measured at 11.5 s for 15 branches against a
 * 15 s preflight budget. Keying on content collapses that to one parse per
 * DISTINCT blob, which is typically four.
 *
 * Keyed on the text itself rather than a git OID so the cache cannot go stale:
 * different content is a different key by construction.
 */
const parseCache = new Map<string, LedgerItem[]>();

export function ledgerItems(
  file: string,
  text: string,
  families: readonly LedgerFamily[] = LEDGER_FAMILIES,
): LedgerItem[] {
  // The RESOLVED OPTS participate in the cache key, not the family names.
  // Names alone were wrong and the guard's own comment claimed otherwise: two
  // registries can share a family name and declare different parse opts, and
  // keying on the name would serve the first parse to the second — silently, and
  // exactly in the tests that exist to prove opts are honoured (Codex R1 MEDIUM).
  // Serializing the opts that will actually be used makes the key say what the
  // parse depends on.
  const key = `${JSON.stringify(optsFor(file, families))}\u0000${file}\u0000${text.length}\u0000${text}`;
  const hit = parseCache.get(key);
  if (hit !== undefined) return hit;
  const out = ledgerItemsUncached(file, text, families);
  parseCache.set(key, out);
  return out;
}

function ledgerItemsUncached(
  file: string,
  text: string,
  families: readonly LedgerFamily[],
): LedgerItem[] {
  const entries = extractEntries(text, optsFor(file, families));
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
