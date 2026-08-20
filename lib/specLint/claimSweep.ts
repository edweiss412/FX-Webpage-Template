/**
 * `spec:lint` claim sweep after a repair — the PURE core.
 *
 * Spec: `docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md`.
 * Ledger: `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`.
 *
 * `AGENTS.md` class-sweeps a finding's SHAPE across the CODE before patching the
 * named instance. It says nothing about the DOCUMENT. Given a DECLARED repair,
 * this arm reports the claims elsewhere in the same arc's declared documents
 * that the repair superseded and left standing. It is ADVISORY: it reports
 * claims to RE-READ, and it cannot know whether a surviving occurrence is stale
 * or deliberate.
 *
 * The adapter alone reads git and the filesystem; everything here is a pure map
 * from (documents, RepairRecord) to findings, pinned structurally by
 * `tests/specLint/_metaPureCore.test.ts`.
 *
 * ---------------------------------------------------------------------------
 * DOCUMENTED LIMITS — spec §5 items 1-10, restated VERBATIM.
 *
 * A documented limit belongs where the code is READ, not only where the spec is
 * filed: a maintainer reaching for this module does not necessarily reach for
 * that document. Task 9 of the plan verifies this block against §5 by
 * COMPARISON of the whole item text rather than by prefix, because a header
 * carrying every opening clause and truncating the rest passes a prefix grep
 * while establishing nothing.
 *
 * 1. **A sentence is delimited lexically**, so a repair whose transition genuinely spans two
 *    sentences would draw a false advisory. **No such case exists in the corpus** — that is
 *    measured, not assumed. The single non-excluded row in §2 is not a transition at all: it is the
 *    mutation-operator NAME `0to1` inside a test title
 *    (`docs/superpowers/plans/2026-08-16-serialize-error-structure.md`, "kills <=to<, 0to1, and
 *    halved-decrement budget mutants"), which the CENSUS regex matches as an arrow shape while `0`
 *    and `1` never appear as standalone words. It is a false hit of the census instrument, not a
 *    miss of the discriminator. An earlier draft of this limit diagnosed it as a two-sentence
 *    transition on assumption; instrumenting the loop refuted that.
 *
 * 2. **A value that legitimately recurs** — a version number, an unrelated count that happens to
 *    equal the superseded one — is reported. The failure direction is a nuisance line, never a
 *    missed collision.
 *
 * 3. **The arm reports; it never rewrites.** Prose repairs are read, not swept: only a reader can
 *    tell a before/after sentence from a statement of current fact, and a blanket regex over the
 *    numbers is the instrument that CREATED the drift being cleaned.
 *
 * 4. **A repair that supersedes a claim without changing a token is invisible** — a rewording that
 *    changes meaning while keeping every number and identifier. This arm tracks tokens, and silence
 *    is not a certificate.
 *
 * 5. **Adversarial construction is out of scope** (§1.1 item 7).
 *
 * 6. **A REWORDED SURVIVOR IS MISSED BY THE NAMED HALF** (§3.2). Its exclusion is span-based, so an
 *    occurrence the repair TOUCHED for an unrelated reason — a wording change on a line that still
 *    carries the retired claim — is treated like the repair's own new claim and suppressed.
 *    Measured on the incident: one ordinary edit at spec line 268 moves it inside the repair's
 *    spans and the retired union reasoning is silently excluded. This is the named-half analogue of
 *    §3.1's same-hunk case, and it is declared rather than closed for the same reason: separating
 *    "reworded but still stale" from "restated correctly" requires reading the claim. Missed
 *    advisory, never a false one.
 *
 * 7. **A HALF-REPAIRED SENTENCE IS MISSED** (§3.1). One sentence carrying two claims on the same
 *    value, with only the first repaired, is suppressed because the sentence now names the
 *    replacement. The discriminating refinement was tested and rejected: a half-repaired sentence
 *    and a legitimate transition both carry exactly one of each value, so no sentence-local count
 *    separates them, and anything that could would need to know which claim each number belongs to.
 *    Missed advisory, never a false one.
 *
 * 8. **A COLLATERAL IDENTIFIER IS THE AUTHOR'S TO GET RIGHT** (§3.2). The arm cannot separate an
 *    identifier whose CLAIM the repair changed from one the repair's diff merely TOUCHED, because
 *    the difference is semantic and the diff does not carry it. Measured on `c272ebed3`:
 *    `components/admin/HoverHelp.tsx:562` occurs on both the removed and the added line of the
 *    repair's hunk while staying in exactly the classification it started in. Declaring it produces
 *    advisories that are TRUE about the occurrences and WRONG about the repair, which is why §3.4's
 *    wording attributes the changed claim to the DECLARATION and never to the arm's own analysis. A
 *    nuisance advisory on a mis-declaration, never a silent miss.
 *
 * 9. **A PEER THE AUTHOR DOES NOT DECLARE IS NOT SWEPT** (§3.3). The swept set is `<doc>` plus each
 *    `--also`, so an undeclared plan or probe record is simply absent and the run says nothing
 *    about it. Each of the three inference rules that would close this is wrong on the incident's
 *    own arc — citation-only misses the plan, stem-only misses the probe record, date matching
 *    pulls in an unrelated spec (§3.3 measures all three) — so the arm declines to guess. Missed
 *    advisory, never a false one.
 *
 * 10. **THE SIGNAL INVENTORY'S COMPLETENESS AGAINST PROSE IS NOT MECHANICALLY CHECKED** (§3.4). The
 *    cover reconciles the table against the module's exported codes and against §5's item numbers,
 *    in both directions, and it CANNOT read §3's prose to find a requirement that has no row. A
 *    requirement added to §3 without a row is therefore invisible to it — the same shape as the
 *    defect that produced the fourth code, surviving in the one place a checker cannot reach
 *    without becoming a recognizer over English (§1.1 item 3). Declared, with the positive control
 *    that proves the cover fires on the half it DOES check, rather than left as an unstated
 *    assumption. The mitigation is procedural and stated here so it is met at the point of
 *    temptation: **an edit adding a normative outcome to §3 adds its row in the same commit**, and
 *    the module header restates this limit.
 * ---------------------------------------------------------------------------
 */
import type { Finding } from "./types";

/**
 * THE WHOLE FINDING ACCEPT-SET. The arm emits no other code.
 *
 * One per half, because the halves assert different facts and one wording
 * cannot carry both; a third for a document that was never read; and a fourth
 * for a declared identifier that is not there, which is the one outcome the
 * other three cannot represent without lying about a location.
 *
 * THE REFUSALS ARE NOT FINDINGS and are deliberately absent from this list.
 * §3.0's three refusals are adapter-level USAGE ERRORS: the run does not
 * happen, no document is swept, and there is nothing to report ABOUT a
 * document. A refusal in this channel would put a usage mistake beside a claim
 * about the corpus, and a reader could not tell a swept-and-clean run from a
 * run that never started.
 *
 * Exported so the covering suite compares the EMITTED set against this list
 * rather than against a list retyped into a test — otherwise the drift the
 * check exists to catch simply relocates into the checker.
 */
export const CLAIM_SWEEP_CODES = [
  "VALUE_SUPERSEDED_ELSEWHERE",
  "CLAIM_SITE_UNSWEPT",
  "SWEEP_DOCUMENT_UNREADABLE",
  "CLAIM_IDENTIFIER_NOT_FOUND",
] as const;

export type ClaimSweepCode = (typeof CLAIM_SWEEP_CODES)[number];

/**
 * Every finding this module emits is built here, and `code` is typed
 * `ClaimSweepCode` rather than `string`. So the accept-set is closed at COMPILE
 * TIME in one direction — a fifth code does not typecheck — while the suite
 * closes the other, that every listed code is actually reachable. Neither
 * direction alone is the claim §3.4 makes.
 *
 * Severity is not a parameter. Every finding is ADVISORY: the arm reports
 * claims to RE-READ and cannot know whether a surviving occurrence is stale or
 * deliberate, so there is nothing for a `fail` to mean here. A `fail` would
 * also make the arm block a merge on a judgement only the author can make.
 */
function sweepFinding(f: {
  code: ClaimSweepCode;
  docPath?: string;
  docLine: number;
  column: number;
  /** Absent only on `SWEEP_DOCUMENT_UNREADABLE`, which is about a DOCUMENT. */
  token?: string;
  message: string;
  detail: string;
}): Finding {
  return { check: "claimSweep", severity: "advisory", ...f };
}

/**
 * One document in the DECLARED swept set (spec §3.3). `lines` is null when the
 * resolver could not read it — a tracked symlink, an unreadable file. The
 * declaration is what puts a document here; nothing is inferred from a
 * citation, a filename stem or a date prefix, because all three were measured
 * wrong on the incident's own arc, each in a different direction.
 */
export interface SweepDocument {
  /** Repo-relative path, used verbatim in the finding's identity and message. */
  path: string;
  /** null = declared but unreadable. It was NOT swept, and silence is not a clean. */
  lines: string[] | null;
}

/**
 * The repair, DECLARED by the author and never inferred from a diff (spec §3.0).
 *
 * The incident commit changes many numeric literals and carries `58` on BOTH
 * sides of its own diff, so no rule over that diff selects the semantic pair
 * `58 -> 57` deterministically. The numeric half therefore takes a
 * superseded/replacement PAIR and the named half takes a changed-claim
 * IDENTIFIER — different shapes, because they are different facts: a repair
 * that re-classifies a site changes the CLAIM about a stable identifier, and
 * the identifier itself has no replacement.
 */
export interface RepairRecord {
  /** The superseded numeric literal, or null when no numeric pair was declared. */
  superseded: string | null;
  /** Its replacement. Null iff `superseded` is null. */
  replacement: string | null;
  /** An identifier whose claim the author says the repair changed, or null. */
  claimAbout: string | null;
  /**
   * Repo-relative path -> the 1-based lines the repair's hunks added or
   * changed. Consumed by the NAMED half only: the numeric half is deliberately
   * blind to diff status, because the incident's sharpest survivor is an ADDED
   * line inside the repair's own hunk (probes §3.1).
   */
  touchedLines: ReadonlyMap<string, ReadonlySet<number>>;
}

/**
 * What the author DECLARED on the invocation, before any document is read.
 *
 * Separate from `RepairRecord` on purpose: this is the raw declaration, whose
 * three malformed shapes are REFUSED (§3.0); a `RepairRecord` is what a
 * well-formed declaration becomes.
 */
export interface ClaimSweepDeclaration {
  superseded: string | null;
  replacement: string | null;
  claimAbout: string | null;
  repair: string | null;
}

/**
 * The three refusals of spec §3.0, as a PURE predicate: the reason line, or
 * null when the declaration is well formed.
 *
 * A refusal is NOT a finding. The adapter routes the returned reason to the
 * usage channel — exit 2, no report written — because the run does not happen,
 * no document is swept, and there is nothing to report ABOUT a document. If a
 * refusal emitted a finding, a usage mistake would arrive in the same channel
 * as a claim about the corpus and a reader could not tell a swept-and-clean run
 * from a run that never started.
 *
 * Each reason NAMES the offending values rather than the flag alone, because
 * the flag name is what the pre-existing unknown-flag error already says and it
 * does not distinguish these three from a typo.
 *
 * Flag ARITY errors — `--superseded` without `--replacement`, a flag given no
 * value — are NOT among these three and are not part of §3.4's signal
 * inventory. They belong to the adapter's pre-existing usage channel alongside
 * `--kind requires a value (spec|plan)`: they say the invocation is
 * unparseable, where these three say a parseable invocation declares something
 * incoherent.
 */
export function declarationRefusal(d: ClaimSweepDeclaration): string | null {
  if (d.superseded !== null && d.replacement !== null && d.superseded === d.replacement) {
    return (
      `--superseded and --replacement are both ${d.superseded}: a declaration whose ` +
      `superseded value is equal to its replacement makes EVERY sentence containing ` +
      `${d.superseded} also carry the replacement, so every occurrence is suppressed and ` +
      `the run reports a silent clean. Declare the value the repair replaced ` +
      `${d.superseded} WITH.`
    );
  }
  if (d.claimAbout !== null && d.repair === null) {
    return (
      `--claim-about ${d.claimAbout} requires --repair <rev>: only the repair's hunk ` +
      `spans can exclude the repair's OWN new claim, and without them every occurrence ` +
      `of the identifier is reported, including the ones the repair just wrote.`
    );
  }
  if (d.repair !== null && d.superseded === null && d.claimAbout === null) {
    return (
      `--repair ${d.repair} was given with nothing DECLARED: pass --superseded <N> ` +
      `--replacement <M>, or --claim-about <identifier>, or both. The arm does not read ` +
      `a commit and guess what it superseded -- that commit's own diff carries values on ` +
      `both sides, so no rule over it selects a semantic pair. Silence from an undeclared ` +
      `invocation is not a certificate, which is why this refuses rather than reporting clean.`
    );
  }
  return null;
}

/**
 * ASCII word characters — the boundary alphabet for a NUMERIC token, matching
 * `\b` in both the probe scripts and this module. `1058` must not match `58`;
 * `57/58` must. Written as an explicit class rather than `\b` so the rule is
 * one definition shared by both halves and so it cannot drift with a regex
 * flavour's Unicode word definition.
 */
const NUMERIC_BOUNDARY = /[A-Za-z0-9_]/;

/**
 * The boundary alphabet for a declared IDENTIFIER — a `file:line`, a symbol.
 *
 * Deliberately NOT the numeric one, and the difference is measured rather than
 * chosen. `/` is EXCLUDED, so a path separator is a boundary: every occurrence
 * of `PublishedReviewModal.tsx:964` in the incident arc is preceded by `/`
 * (it is the tail of `components/admin/showpage/...`), so treating `/` as
 * identifier continuation returns ZERO occurrences and the replay reports
 * nothing at all. `.`, `:` and `-` ARE included, so `…tsx:96` does not match
 * inside `…tsx:964` — the one-character truncation that occurs zero times
 * exactly and on nine lines as a substring.
 *
 * A number is a WORD; a `file:line` is a path-ish token whose separator is `/`.
 * One alphabet for both would get one of the two wrong.
 */
const IDENTIFIER_BOUNDARY = /[A-Za-z0-9_.:\-]/;

/**
 * A sentence break: whitespace immediately after `.`, `;` or `:`. A sentence is
 * delimited LEXICALLY and never spans a line (spec §5 item 1) — the same rule
 * the probe scripts measured recall and precision with, so the shipped arm and
 * the calibration cannot disagree about what a sentence is.
 */
const SENTENCE_BREAK = /(?<=[.;:])\s+/g;

/**
 * Every lexical sentence in one line, as half-open [start, end) offsets.
 *
 * The loop is bounded by `line.length` ON PURPOSE. `SENTENCE_BREAK` requires at
 * least one whitespace character, so `lastIndex` advances today — but a mutant
 * that weakens `\s+` to `\s*` would let it match empty and spin forever, and a
 * hang scores as a KILL, so it would inflate the score while costing the whole
 * measurement. A ceiling EXTERNAL to the predicate is what no mutant can lift:
 * the worst case becomes a survivor you can see rather than a run that dies.
 */
export function sentenceSpans(line: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const re = new RegExp(SENTENCE_BREAK.source, "g");
  let start = 0;
  for (let guard = 0; guard <= line.length; guard += 1) {
    const m = re.exec(line);
    if (m === null) break;
    spans.push({ start, end: m.index });
    start = m.index + m[0].length;
  }
  spans.push({ start, end: line.length });
  return spans;
}

/**
 * Every occurrence of `token` in `line` whose neighbours are outside
 * `boundary`, as 0-based offsets. Bounded by `line.length` for the same reason
 * `sentenceSpans` is.
 */
export function boundedOccurrences(line: string, token: string, boundary: RegExp): number[] {
  const out: number[] = [];
  if (token.length === 0) return out;
  let from = 0;
  for (let guard = 0; guard <= line.length; guard += 1) {
    const at = line.indexOf(token, from);
    if (at < 0) break;
    const before = at === 0 ? "" : line.charAt(at - 1);
    const after = line.charAt(at + token.length);
    if (!boundary.test(before) && !boundary.test(after)) out.push(at);
    from = at + 1;
  }
  return out;
}

/** True when `token` occurs at least once in `text` on its own boundaries. */
function carries(text: string, token: string, boundary: RegExp): boolean {
  return boundedOccurrences(text, token, boundary).length > 0;
}

/**
 * The numeric half (spec §3.1): report every occurrence of the superseded value
 * whose ENCLOSING SENTENCE does not also carry the replacement.
 *
 * A transition sentence names both values by construction; a stale claim names
 * only the superseded one. That single co-occurrence test is the whole
 * discriminator — no recognizer for transition prose, no tense model, no
 * parser. It reported 9 of 9 incident survivors and excluded 935 of 935 real
 * corpus transition sentences.
 *
 * THE SENTENCE IS THE SCOPE AND THE LINE IS NOT: the incident's spec line 220
 * carries one EXCLUDED and one SURVIVING occurrence, and a line-scoped
 * implementation gets that line wrong in both directions at once.
 */
function numericHalf(docs: readonly SweepDocument[], record: RepairRecord): Finding[] {
  const { superseded, replacement } = record;
  if (superseded === null || replacement === null) return [];
  const findings: Finding[] = [];
  for (const doc of docs) {
    if (doc.lines === null) continue;
    for (let i = 0; i < doc.lines.length; i += 1) {
      const line = doc.lines[i]!;
      const hits = boundedOccurrences(line, superseded, NUMERIC_BOUNDARY);
      if (hits.length === 0) continue;
      const spans = sentenceSpans(line);
      for (const at of hits) {
        const span = spans.find((s) => s.start <= at && at < s.end);
        const sentence = span === undefined ? line : line.slice(span.start, span.end);
        if (carries(sentence, replacement, NUMERIC_BOUNDARY)) continue;
        findings.push(
          sweepFinding({
            code: "VALUE_SUPERSEDED_ELSEWHERE",
            docPath: doc.path,
            docLine: i + 1,
            column: at + 1,
            token: superseded,
            message:
              `${doc.path}:${i + 1} carries ${superseded}, declared superseded by ` +
              `${replacement}, in a sentence that does not name ${replacement}`,
            detail: "re-read it -- it is stale, or it is deliberate and wants a word saying so.",
          }),
        );
      }
    }
  }
  return findings;
}

/**
 * The named-claim half (spec §3.2): report every occurrence of a DECLARED
 * identifier OUTSIDE the repair's hunks, as a claim to re-read.
 *
 * THE ARM DOES NOT ESTABLISH THAT THE REPAIR CHANGED THE CLAIM, and the finding
 * text must not say it did. An earlier draft described the identifier
 * STRUCTURALLY — "a token the repair's own diff carries on both a removed and
 * an added line" — which reads as a criterion the arm could check. It is not
 * one, and the counterexample is in the incident's own repair:
 * `components/admin/HoverHelp.tsx:562` sits on BOTH sides of a rewritten bullet
 * while its classification is untouched, and the site that repair actually
 * reclassified is a different one on the same line. WHICH identifier had its
 * claim changed is therefore the AUTHOR's declaration, on exactly the grounds
 * the numeric pair is: it is a semantic fact about the repair, and no rule over
 * the diff recovers it.
 *
 * This half does NOT inherit the numeric half's before/after problem. An
 * identifier does not appear in transition sentences the way a number does,
 * because a repair that re-classifies a site does not write "site X was in (a),
 * now in (b)" as a value pair. So there is no sentence rule here — the
 * exclusion is span-based, and its cost is spec §5 item 6: an occurrence the
 * repair TOUCHED for an unrelated reason is treated like its own new claim and
 * suppressed. Missed advisory, never a false one.
 *
 * Its VOLUME is high by design. A reclassified site is claimed about wherever
 * the arc discusses it — nine occurrences for the incident's one site — and the
 * advisory asks for exactly the re-read the ledger entry wants. The numeric
 * half is the precise one; this is the thorough one.
 */
function namedHalf(docs: readonly SweepDocument[], record: RepairRecord): Finding[] {
  const identifier = record.claimAbout;
  if (identifier === null) return [];
  const findings: Finding[] = [];
  // Counted BEFORE the span filter, and that placement is the whole of the
  // not-found rule below. An identifier the repair restated at every one of its
  // occurrences reports NOTHING and WAS FOUND -- two different states that a
  // predicate keyed on the REPORTED list collapses into one, which would put a
  // false statement about the corpus in the arm's own finding text.
  let exactOccurrences = 0;
  for (const doc of docs) {
    if (doc.lines === null) continue;
    const touched = record.touchedLines.get(doc.path);
    for (let i = 0; i < doc.lines.length; i += 1) {
      for (const at of boundedOccurrences(doc.lines[i]!, identifier, IDENTIFIER_BOUNDARY)) {
        exactOccurrences += 1;
        // The repair's OWN new claim is the one occurrence that is not unswept.
        if (touched !== undefined && touched.has(i + 1)) continue;
        findings.push(
          sweepFinding({
            code: "CLAIM_SITE_UNSWEPT",
            docPath: doc.path,
            docLine: i + 1,
            column: at + 1,
            token: identifier,
            message: `${doc.path}:${i + 1} mentions ${identifier}, DECLARED as a claim this repair changed`,
            detail:
              "the identifier is not superseded, and this arm did not verify that the repair " +
              "changed the claim -- the declaration did. Re-read this occurrence against the " +
              "repair's new claim.",
          }),
        );
      }
    }
  }
  // THE FOURTH CODE (spec §3.4). Exact matching means a declared identifier can
  // occur zero times, and §3.2 requires that be REPORTED rather than silently
  // swept: the one-character truncation `PublishedReviewModal.tsx:96` occurs
  // ZERO times exactly and on NINE lines as a substring, so exact matching
  // without this report converts nine wrong advisories into SILENCE -- the same
  // defect wearing the conservative direction's clothes. A narrowing that gives
  // a declined input no channel is not a narrowing; it is going quiet.
  //
  // It carries the fact and NO location, because there is no location.
  if (exactOccurrences === 0) {
    findings.push(
      sweepFinding({
        code: "CLAIM_IDENTIFIER_NOT_FOUND",
        docLine: 1,
        column: 1,
        token: identifier,
        message: `${identifier} was DECLARED as a changed claim and occurs zero times EXACTLY in the swept set`,
        detail:
          "nothing was swept for it. Check the declaration for a truncation or a typo -- an " +
          "ordinary one-character slip matches as a SUBSTRING and would have reported everywhere.",
      }),
    );
  }
  return findings;
}

/**
 * The THIRD code (spec §3.4): a document that was DECLARED and could not be
 * read was NOT swept, and silence about it is not a clean.
 *
 * Neither occurrence code can truthfully describe a document that was never
 * read -- both assert something about content -- so an implementation that
 * continues silently on `readFileLines() === null` satisfies every occurrence
 * assertion while "never silently skipped" is false of it. The code IS the
 * contract.
 *
 * ONE per unreadable document, not one per run: two unreadable peers are two
 * documents nobody swept, and a single run-level advisory would name at most
 * one of them.
 *
 * This is a LIVE corpus shape rather than a hypothetical. `git ls-files -s
 * docs/superpowers | awk '$1==120000'` finds a tracked SYMLINK under the swept
 * tree, and `FileResolver`'s own contract names the case: "null = tracked but
 * unreadable OR tracked symlink".
 */
function unreadableDocuments(docs: readonly SweepDocument[]): Finding[] {
  const findings: Finding[] = [];
  for (const doc of docs) {
    if (doc.lines !== null) continue;
    findings.push(
      sweepFinding({
        code: "SWEEP_DOCUMENT_UNREADABLE",
        docPath: doc.path,
        docLine: 1,
        column: 1,
        message: `${doc.path} was declared in the swept set and could not be read; it was NOT swept`,
        detail: "the sweep over this document did not happen. Silence about it is not a clean.",
      }),
    );
  }
  return findings;
}

/**
 * The sweep. A null record means no repair was declared and the arm runs
 * nothing — silence from an undeclared invocation is not a certificate, which
 * is why the adapter REFUSES such an invocation rather than reporting a clean.
 *
 * No dedup by position, by line or by token is performed, and there is no
 * ordering guarantee: findings on one line have no natural order, so every
 * assertion over more than one of them must be order-independent. A line
 * carrying the superseded token twice in a sentence lacking the replacement
 * reports TWICE, at two different columns — measured live at eight lines and
 * eighteen occurrences, where a line-keyed identity would lose ten of them
 * silently, into what looks like a legitimate dedup.
 */
export function claimSweep(docs: readonly SweepDocument[], record: RepairRecord | null): Finding[] {
  if (record === null) return [];
  return [...numericHalf(docs, record), ...namedHalf(docs, record), ...unreadableDocuments(docs)];
}
