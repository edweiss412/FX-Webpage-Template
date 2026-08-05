import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { ledgerIds, type ExtractOpts } from "../../tests/docs/_ledgerMdast";
import { CORPUS_DIR } from "./arc";
import { COUNTED_STAGES, isCountedStage, ROUND_THRESHOLD, type Stage } from "./constants";
import { countedRounds, recordedRounds, roundGaps } from "./count";
import { parseFiling, type FilingSection } from "./filing";
import { parseRow, type ReviewRoundRow } from "./row";

export type ProblemKind =
  | "malformed_row"
  | "identity_mismatch"
  | "round_gap"
  | "missing_filing"
  | "filing_malformed"
  | "unresolved_id"
  | "stage_not_filable"
  | "stage_without_rows"
  | "count_mismatch"
  | "duplicate_section"
  | "orphan_filing"
  | "unrecognized_corpus_file";

export type Problem = { kind: ProblemKind; message: string };

export type Arc = {
  /** Repo-relative directory holding the arc's files. */
  dir: string;
  branch: string;
  baseSha: string;
  /** Repo-relative, or null when the arc has only a filing. */
  corpusPath: string | null;
  filingPath: string | null;
  rows: ReviewRoundRow[];
  malformed: { line: number; problem: string }[];
  filingText: string | null;
};

/**
 * Discovery is keyed on the FILENAME SHAPE arc identity already defines (spec
 * §5.2), over BOTH extensions. Two reasons, and dropping either breaks a real
 * case:
 *
 *  - Both extensions, because a `.jsonl`-first walk that reaches for a sibling
 *    never VISITS an orphan filing, which makes the orphan check vacuous in
 *    exactly the situation it exists for.
 *  - Shape-keyed rather than "any .md", because docs/review-rounds/README.md has
 *    no sibling corpus and would be reported as an orphan forever - the live
 *    corpus check could never be green once Task 12 ships it.
 *
 * The shape is not a new convention. It is the one the writer already produces,
 * so keying on it additionally rejects a filing whose stem is not a merge base
 * at all, which a loose walk would have accepted silently.
 *
 * But a name that fails the shape is CLASSIFIED, never dropped, and the two
 * extensions are classified differently. A `.jsonl` is DATA this gate is
 * answerable for: `feat/foo/aaaaaaaaaaa.jsonl` holding four verdict rows is a
 * typo or a hand-written file, no arc owns its rows, and a filter that merely
 * ADMITS the arc shape reports clean over it. A `.md` is PROSE, load-bearing
 * only when it claims to be a filing - which it claims by carrying the arc's
 * name - and a stray one carries no rows that could go uncounted.
 */
const ARC_FILE = /^([0-9a-f]{12})\.(jsonl|md)$/;

type Discovered = {
  /** Absolute paths matching ARC_FILE. */
  arcFiles: string[];
  /** Absolute paths of `.jsonl` files that do NOT. */
  strayCorpora: string[];
};

function walk(dir: string, out: Discovered): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (ARC_FILE.test(entry.name)) out.arcFiles.push(abs);
    else if (entry.name.endsWith(".jsonl")) out.strayCorpora.push(abs);
    // Anything else - a README, a note, an editor backup - is not arc data.
  }
}

function discover(root: string): Discovered {
  const out: Discovered = { arcFiles: [], strayCorpora: [] };
  const base = join(root, CORPUS_DIR);
  // An absent corpus directory is a legal clean state (spec §12).
  if (existsSync(base)) walk(base, out);
  return out;
}

/**
 * Repo-relative paths of `.jsonl` files under docs/review-rounds/ that are not
 * named for an arc, so nothing can attribute their rows.
 */
export function unrecognizedCorpusFiles(root: string): string[] {
  const base = join(root, CORPUS_DIR);
  return discover(root)
    .strayCorpora.map((abs) => [CORPUS_DIR, ...relative(base, abs).split(sep)].join("/"))
    .sort();
}

/**
 * Every arc under `docs/review-rounds/`, discovered from disk so a NEW arc is
 * covered by default rather than silently exempt. An absent corpus directory is
 * a legal clean state (spec §12), not a failure.
 */
export function readArcs(root: string): Arc[] {
  const base = join(root, CORPUS_DIR);
  const byArc = new Map<string, Arc>();
  for (const abs of discover(root).arcFiles.sort()) {
    const segments = relative(base, abs).split(sep);
    const name = segments[segments.length - 1] ?? "";
    const match = ARC_FILE.exec(name);
    if (match === null) continue;
    const baseSha = match[1] ?? "";
    // The branch is the nested path, never a slug: flattening `/` to `-` would
    // collide two branches differing only there.
    const branch = segments.slice(0, -1).join("/");
    const key = `${branch}\u0000${baseSha}`;

    let arc = byArc.get(key);
    if (arc === undefined) {
      arc = {
        dir: [CORPUS_DIR, ...segments.slice(0, -1)].join("/"),
        branch,
        baseSha,
        corpusPath: null,
        filingPath: null,
        rows: [],
        malformed: [],
        filingText: null,
      };
      byArc.set(key, arc);
    }

    const relPath = [CORPUS_DIR, ...segments].join("/");
    const text = readFileSync(abs, "utf8");
    if (match[2] === "jsonl") {
      arc.corpusPath = relPath;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (line.trim() === "") continue;
        const parsed = parseRow(line);
        if (parsed.ok) arc.rows.push(parsed.row);
        else arc.malformed.push({ line: i + 1, problem: parsed.problem });
      }
    } else {
      arc.filingPath = relPath;
      arc.filingText = text;
    }
  }
  return [...byArc.values()];
}

const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };
const DEFERRED_OPTS: ExtractOpts = { requirePrefix: null, levels: [3] };
const LEDGERS: readonly (readonly [string, ExtractOpts])[] = [
  ["BACKLOG.md", BACKLOG_OPTS],
  ["BACKLOG-archive.md", BACKLOG_OPTS],
  ["DEFERRED.md", DEFERRED_OPTS],
  ["DEFERRED-archive.md", DEFERRED_OPTS],
];

/**
 * The resolvable-id set, over all four ledgers under BOTH option sets (plan R2).
 * DEFERRED entries carry bare SHOUTY ids, so the production `definedIds` helper
 * - which resolves every ledger under BACKLOG_OPTS - collects only `BL-` ids.
 *
 * It deliberately does NOT import `definedIds` from
 * tests/docs/_metaLedgerReferentialIntegrity.test.ts: that symbol is exported
 * from a `*.test.ts` module, and importing it re-registers that file's whole
 * suite inside this one.
 *
 * ENTRY HEADINGS ONLY, and that is a live structural invariant rather than a
 * preference. `definedIds` resolves headings PLUS ids defined as sub-item
 * bullets inside an entry's body, and the P5-sole probe in
 * tests/docs/_metaLedgerReferentialIntegrity.test.ts pins that the sub-item
 * helper has EXACTLY ONE caller - "a second production caller with its own file
 * list would pass every plant above while scanning whatever it liked". Calling
 * it here would be that second caller. The alternatives are worse: importing
 * `definedIds` re-registers a whole suite (above), and exempting this file
 * weakens the probe that stops the resolvable universe from being widened
 * unaccountably.
 *
 * DOCUMENTED LIMIT, measured 2026-08-04 against the live ledgers: exactly 8
 * ids this recognizer could ever cite are defined only as sub-item bullets and
 * so do not resolve here - the five mutation operator classes such as
 * `BL-MUTATION-UNICODE`, and the three sync-feed rows such as
 * `BL-SYNCFEED-UI-1`. (The body-defined set holds 16, but the other 8 carry no
 * `BL-`/`DEF-` prefix, so CITED_ID cannot cite them and they cost nothing.)
 *
 * A filing citing one of the 8 is reported `unresolved_id`, which is a FALSE
 * POSITIVE: loud, self-explanatory and blocking, never silent wrongness - the
 * one outcome the consequence bound forbids. The remedy is also the better
 * citation. BACKLOG.md says of those sub-items that "the parent owns the
 * shrink-only ratchet that gives them their meaning", so a filing should cite
 * the parent row - which is a heading, and resolves.
 */
export function liveLedgerIds(root: string): Set<string> {
  const out = new Set<string>();
  for (const [file, opts] of LEDGERS) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    for (const id of ledgerIds(text, opts)) out.add(id);
  }
  return out;
}

export function checkCorpus(root: string, opts: { resolvableIds?: Set<string> } = {}): Problem[] {
  const problems: Problem[] = [];
  // `??` short-circuits, so a fixture root with no ledgers never reads one.
  const resolvable = opts.resolvableIds ?? liveLedgerIds(root);

  for (const path of unrecognizedCorpusFiles(root)) {
    // Reported, never skipped: a corpus file not named for its arc holds rows
    // nothing can attribute, and a walk that merely ADMITS the arc-name shape
    // returns clean over a file at threshold. Typo or hand-written, both loud.
    problems.push({
      kind: "unrecognized_corpus_file",
      message: `${path}: a .jsonl that is not named <baseSha12>.jsonl, so no arc owns its rows and nothing counts them`,
    });
  }

  for (const arc of readArcs(root)) {
    for (const bad of arc.malformed) {
      // A malformed row swallowed as an empty corpus reads as "this arc ran no
      // rounds", which reports an obliged arc as compliant.
      problems.push({
        kind: "malformed_row",
        message: `${arc.corpusPath}: line ${bad.line} is not a valid row: ${bad.problem}`,
      });
    }

    if (arc.corpusPath === null) {
      problems.push({
        kind: "orphan_filing",
        message: `${arc.filingPath}: a filing with no corpus beside it, so nothing says which rounds it describes`,
      });
      continue;
    }

    for (const row of arc.rows) {
      if (row.branch === arc.branch && row.baseSha === arc.baseSha) continue;
      problems.push({
        kind: "identity_mismatch",
        message: `${arc.corpusPath}: a row declares (${row.branch}, ${row.baseSha}) but its path says (${arc.branch}, ${arc.baseSha})`,
      });
    }

    for (const stage of roundGaps(arc.rows)) {
      problems.push({
        kind: "round_gap",
        message: `${arc.corpusPath}: stage ${stage} declares rounds that are not a contiguous 1..N`,
      });
    }

    const counted = countedRounds(arc.rows);
    const recorded = recordedRounds(arc.rows);
    const sections = arc.filingText === null ? [] : parseFiling(arc.filingText);
    const byStage = new Map<string, FilingSection[]>();
    for (const section of sections) {
      const group = byStage.get(section.stage);
      if (group) group.push(section);
      else byStage.set(section.stage, [section]);
    }

    const filingPath = `${arc.corpusPath.slice(0, -".jsonl".length)}.md`;
    for (const [stage, n] of counted) {
      if (n < ROUND_THRESHOLD) continue;
      if ((byStage.get(stage) ?? []).length > 0) continue;
      // The baseSha is in the message so a reused branch name cannot leave a
      // reader guessing WHICH arc owes the filing.
      problems.push({
        kind: "missing_filing",
        message: `${arc.branch} ${arc.baseSha}: stage ${stage} burned ${n} counted rounds and has no filing section (expected ${filingPath})`,
      });
    }

    for (const [stage, group] of byStage) {
      if (group.length > 1) {
        problems.push({
          kind: "duplicate_section",
          message: `${arc.filingPath}: ${group.length} sections for stage ${stage}, and nothing says which is the filing`,
        });
      }
      for (const section of group) {
        // Spec §6 item 1: only spec, plan and diff are filable. `task` rows are
        // RECORDED and never COUNTED (spec §5.1), so a `task` section is a
        // CATEGORY ERROR rather than a miscount - and every check below waves
        // it through. Against four contiguous `task` rows and a heading of
        // `## task - 0 rounds`: `recorded.get("task")` is 4, so
        // stage_without_rows does not fire, and `counted.get("task") ?? 0` is 0
        // against a declared 0, so count_mismatch does not either. checkCorpus
        // returned CLEAN on a filing the spec forbids. Checked before the
        // heading's count, because a section for a stage that cannot be filed
        // has no count worth reading.
        if (!isCountedStage(stage)) {
          problems.push({
            kind: "stage_not_filable",
            message: `${arc.filingPath}:${section.line}: stage ${stage} carries no filing; only ${[...COUNTED_STAGES].join(", ")} are counted stages`,
          });
          continue;
        }
        // Spec §6 item 1: the heading CARRIES its round count. A loose heading
        // (`## diff`) parses to `declaredRounds: null`, and until this check
        // existed that section satisfied the filing duty by merely being there:
        // its presence suppressed `missing_filing`, both body-field checks
        // passed, and the count check below skipped `null` outright. A
        // structurally nonconforming filing was reported compliant over four
        // counted rounds - silent wrongness, the one outcome the consequence
        // bound forbids. Reported here rather than ALSO as `missing_filing`,
        // because "this section's heading is malformed" and "there is no
        // section" cannot both be true of the same section, and the gate blocks
        // on either one.
        const declared = section.declaredRounds;
        if (declared === null) {
          problems.push({
            kind: "filing_malformed",
            message: `${arc.filingPath}:${section.line}: stage ${stage} heading declares no round count; the heading must carry "<n> rounds"`,
          });
          continue;
        }
        if (!section.hasExamined || !section.hasDisposition) {
          problems.push({
            kind: "filing_malformed",
            message: `${arc.filingPath}:${section.line}: stage ${stage} needs an **Examined:** line and at least one disposition line`,
          });
          continue;
        }
        if ((recorded.get(stage as Stage) ?? 0) === 0) {
          // Catches a filing copy-pasted between arcs: a section for a stage
          // this arc never dispatched.
          problems.push({
            kind: "stage_without_rows",
            message: `${arc.filingPath}:${section.line}: stage ${stage} has no rows in this arc's corpus`,
          });
          continue;
        }
        const expected = counted.get(stage as Stage) ?? 0;
        if (declared !== expected) {
          problems.push({
            kind: "count_mismatch",
            message: `${arc.filingPath}:${section.line}: stage ${stage} declares ${declared} rounds; the corpus counts ${expected}`,
          });
        }
      }
    }

    for (const section of sections) {
      for (const id of section.citedIds) {
        if (resolvable.has(id)) continue;
        problems.push({
          kind: "unresolved_id",
          message: `${arc.filingPath}:${section.line}: cited id ${id} resolves against no ledger entry`,
        });
      }
    }
  }
  return problems;
}
