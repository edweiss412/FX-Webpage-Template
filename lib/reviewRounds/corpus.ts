import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { CORPUS_DIR } from "./arc";
import { COUNTED_STAGES, isCountedStage, ROUND_THRESHOLD, type Stage } from "./constants";
import { countedRounds, recordedRounds, roundGaps } from "./count";
import { parseFiling, type FilingSection } from "./filing";
import { MECHANIZABLE_GRANDFATHERED } from "./mechanizableGrandfather";
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
  | "unrecognized_corpus_file"
  | "mechanizable_untracked";

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

/**
 * `resolvableIds` is REQUIRED, and the ledger reader that produces the live set
 * lives on the test side (tests/docs/_metaReviewRoundEconomy.test.ts). This
 * module is shipped code, and the ledger recognizer it used to call is a test
 * helper - tests/docs/_ledgerMdast - so resolving ids here made lib/ import
 * from tests/, which the carve-containment guard bans as a laundering channel.
 *
 * Required rather than defaulted to an empty set: a caller that forgot the
 * argument would resolve NOTHING, so every cited id would be reported
 * `unresolved_id` - a silent-by-construction wrong answer dressed as a finding.
 * The type makes the choice at every call site instead.
 */
export function checkCorpus(root: string, opts: { resolvableIds: Set<string> }): Problem[] {
  const problems: Problem[] = [];
  const resolvable = opts.resolvableIds;

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
    // The Mechanizable-parity rule binds NEW filings only (enforcement-pair
    // spec §3.3): filings are immutable evidence, so paths frozen in the
    // grandfather set keep the shipped raw-scan semantics untouched.
    const grandfathered = arc.filingPath !== null && MECHANIZABLE_GRANDFATHERED.has(arc.filingPath);
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
        // Spec R9 finding 1: for NEW filings the field duty is satisfied by
        // RENDERED fields, because the raw line scan is satisfied by lines
        // inside a fence, an indented block, or an HTML node - content the
        // reader never sees - and parity below is then never consulted.
        // Grandfathered filings keep the shipped raw semantics.
        const examinedOk = grandfathered ? section.hasExamined : section.astExamined;
        const dispositionOk = grandfathered
          ? section.hasDisposition
          : section.astDispositions.length > 0;
        if (!examinedOk || !dispositionOk) {
          const rawOnly: string[] = [];
          if (section.hasExamined && !examinedOk) rawOnly.push("**Examined:**");
          if (section.hasDisposition && !dispositionOk) rawOnly.push("disposition");
          problems.push({
            kind: "filing_malformed",
            message:
              rawOnly.length > 0
                ? `${arc.filingPath}:${section.line}: stage ${stage} has its ${rawOnly.join(" and ")} line(s) only in non-rendered content (a fence, indented code, or an HTML node), which reads as absent`
                : `${arc.filingPath}:${section.line}: stage ${stage} needs an **Examined:** line and at least one disposition line`,
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

        // Mechanizable ledger parity (enforcement-pair spec §3.1/§3.2), NEW
        // filings only. The analysis is AST-derived, so fenced examples,
        // HTML comments, and struck-through text satisfy nothing.
        if (grandfathered) continue;
        if (section.nestedMechanizable) {
          // Spec R12: a field nested under a listItem renders for the reader
          // while marker discovery sees nothing - rejected, never admitted.
          problems.push({
            kind: "filing_malformed",
            message: `${arc.filingPath}:${section.line}: stage ${stage} nests a **Mechanizable:** field under a list item; the field must be a top-level paragraph`,
          });
        }
        const mech = section.mechanizable;
        if (mech === null) continue;
        if (mech.markerCount > 1) {
          // Spec R6: two markers have no defined aggregation - every singular
          // projection silently loses an untracked block in one ordering.
          problems.push({
            kind: "filing_malformed",
            message: `${arc.filingPath}:${section.line}: stage ${stage} holds ${mech.markerCount} Mechanizable markers, and nothing says which is the entry`,
          });
          continue;
        }
        if (!mech.isNone && mech.citedIds.length === 0 && !mech.hasDecline) {
          problems.push({
            kind: "mechanizable_untracked",
            message: `${arc.filingPath}:${section.line}: stage ${stage} declares a non-none Mechanizable entry that cites no BL-/DEF- id and records no "declined: <reason>"`,
          });
        }
        for (const id of mech.citedIds) {
          // Spec R10: remark decodes backslash escapes and character
          // references before CITED_ID runs, so an AST-derived id the raw
          // section scan never saw must still resolve. Ids the raw scan DID
          // see are already checked by the section loop below - not repeated
          // here, so one bad id is one problem.
          if (resolvable.has(id) || section.citedIds.includes(id)) continue;
          problems.push({
            kind: "unresolved_id",
            message: `${arc.filingPath}:${section.line}: cited id ${id} resolves against no ledger entry`,
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
