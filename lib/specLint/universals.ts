import { qualifierBoundStarts } from "./numerics";
import type { DocModel, Heading } from "./parse";
import type { Finding, InventoryGroup, InventoryOccurrence } from "./types";

// ===========================================================================
// Prose-consistency arms (spec docs/superpowers/specs/2026-08-17-speclint-
// prose-consistency-arms.md). One advisory code and two inventory groups.
//
// This module performs NO I/O — DocModel in, findings + inventory out (the
// `numerics.ts` posture, spec §4).
//
// TRUTH IS NEVER EVALUATED (spec §7). The arms detect the STRUCTURE the
// originating escapes shared — a universal-quantifier claim standing away from
// its enumeration with no probe beside it — and hand the judgment to the
// mandated human sweep. Everything outside each accept-set is IGNORED, never
// guessed at (spec §5).
// ===========================================================================

/**
 * Arm A's accept-set (spec §3.2 gate 2): a universal quantifier token, initial
 * letter either case, then an optional `one of the `/`of the `, then a 1-3 digit
 * cardinal. Exactly the instrument's match
 * (`docs/superpowers/specs/probes/2026-08-17-prose-consistency-probe-v1.ts`, pass 2).
 *
 * GLOBAL, and every candidate on the line is evaluated (whole-diff review R1). The
 * advisory's unit is still the LINE — at most one fires — but the gates are
 * candidate-specific, so stopping at the first MATCH let a rejected candidate
 * suppress a later qualifying one and the line drew silence. Silence is contracted
 * to mean "no qualifying structure" (spec §1.2), so it may only be reached after
 * every candidate has been tried.
 */
const UNIVERSAL_CARDINAL =
  /\b([Ee]very|[Ee]ach|[Aa]ll)\s+(?:one\s+of\s+the\s+|of\s+the\s+)?(\d{1,3})\b/g;
/** Dated historical records are never compared (spec §3.2 gate 1). */
const ISO_DATE_LINE = /\d{4}-\d{2}-\d{2}/;
/** A table row: leading optional whitespace then a pipe (spec §3.2 gate 1). */
const TABLE_ROW = /^\s*\|/;
/**
 * A cardinal followed — across a single whitespace OR hyphen separator — by a
 * time-unit noun quantifies a FREQUENCY, not a population (spec §3.2 gate 2;
 * R1 + R2 F1 repairs, probe-backed on 11 live wrong-class emissions).
 */
const TIME_UNIT_AFTER =
  /^[-\s]\s*(ms|s|min|mins|minute|minutes|hour|hours|second|seconds|day|days|week|weeks|month|months)\b/;
/** The closed probe-command set (spec §3.2 gate 5). */
const CMD_WORDS = /^(rg|grep|pnpm|git|gh|node|npx|tsx|find|ls|comm|wc|cat|sed|awk|jq|psql|curl)\b/;
/** Every cardinal token a claim's enumeration evidence could be found under (gate 4). */
const CARDINAL_TOKEN = /\b\d{1,4}\b/g;
/**
 * A matched cardinal must be a COMPLETE numeric literal, not the first digit group of a
 * longer one. `all 5,022 eligible data rows` matched "all 5" because a grouping comma is
 * a word boundary — and 5,022 is precisely the 4-digit population the width bound below
 * exists to exclude. Layer-3 corpus finding, four live instances
 * (`ci/2026-07-06-mutation-harness-sharding.md:77,78`,
 * `parser/2026-08-07-parser-mutation-wave-design.md:319,345`); the decimal form is the
 * same shape and is declined with it. This NARROWS the accept-set — the repair direction
 * ratified for a recognizer (AGENTS.md, "Repair direction under same-axis recurrence").
 */
const LITERAL_CONTINUATION = /^(?:,\d{3}|\.\d)/;
/** Value bound: 4-digit reads were years, 0/1 reads were status text (spec §3.2 gate 2). */
const MIN_CARDINAL_VALUE = 2;

/**
 * Arm B's `universal-claims` recognizer (spec §3.4): a CLAUSE START — line start, or
 * after a period, semicolon or colon followed by a space — then an optional
 * list-marker/bold prefix, then one of the closed quantifier set as a word. Exactly the
 * instrument's measured recognizer, capital-initial and case-SENSITIVE: a lowercase
 * `every` mid-sentence is not a clause-initial claim. Synonyms outside the set
 * ("entire", "none of", "always") are a documented limit (spec §7).
 */
const UNIVERSAL_CLAUSE = /(?:^|[.;:] )\s*(?:[-*] )?\*{0,2}(Every|Each|All|Any|No|Never|Nothing)\b/;
/** Arm B's two heading families, both at depth >= 2 (spec §3.4). */
const SCOPE_FENCE_HEADING = /out of scope|non-goals?/i;
const CLOSEOUT_HEADING = /clos(e-?out|eout)|graduation/i;
/** The shallowest heading depth that can OPEN a region: a depth-1 title is a doc
 * identity, not a fence region (R1 F2 repair, probe-backed at 513 lines). */
const MIN_FENCE_DEPTH = 2;
/** Structural Markdown lines carry no claim (R4 repair). A table CONTENT row is not
 * structural — a fence claim can live in a table cell. */
const THEMATIC_BREAK = /^ {0,3}([-_*])( *\1){2,} *$/;
const TABLE_DELIMITER = /^\s*\|[\s\-:|]+\|?\s*$/;

const SNIPPET_MAX = 140;
const snippet = (line: string): string => line.trim().slice(0, SNIPPET_MAX);

/** Line-local inline code spans, as half-open [start, end) UTF-16 offsets. */
function spanRangesByLine(model: DocModel): Map<number, { start: number; end: number }[]> {
  const out = new Map<number, { start: number; end: number }[]>();
  for (const s of model.spans) {
    const list = out.get(s.line) ?? [];
    list.push({ start: s.column - 1, end: s.column - 1 + s.content.length });
    out.set(s.line, list);
  }
  return out;
}

/** Inline span CONTENTS by line, for the probe-command scan. */
function spanContentsByLine(model: DocModel): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const s of model.spans) {
    const list = out.get(s.line) ?? [];
    list.push(s.content);
    out.set(s.line, list);
  }
  return out;
}

/** Section = nearest PRECEDING heading of any depth (spec §3.2 gate 4). */
function sectionOf(model: DocModel, line: number): Heading | null {
  let found: Heading | null = null;
  for (const h of model.headings) if (h.line <= line) found = h;
  return found;
}

/** A section runs to the next heading of depth <= its own (spec §3.2 gate 5). */
function sectionEnd(model: DocModel, h: Heading): number {
  for (const other of model.headings) {
    if (other.line > h.line && other.depth <= h.depth) return other.line - 1;
  }
  return model.lines.length;
}

export function checkUniversals(
  model: DocModel,
  kind: "spec" | "plan",
): { findings: Finding[]; inventory: InventoryGroup[] } {
  // Spec-kind docs only (spec §1.1; the `checkSections` precedent). Plans are
  // outside the calibrated domain, so they draw silence rather than a guess.
  if (kind !== "spec") return { findings: [], inventory: [] };

  const spanRanges = spanRangesByLine(model);
  const spanContents = spanContentsByLine(model);
  const headingLines = new Set(model.headings.map((h) => h.line));

  const sectionHasCommand = (line: number): boolean => {
    const h = sectionOf(model, line);
    const start = h ? h.line : 1;
    const end = h ? sectionEnd(model, h) : model.lines.length;
    for (let l = start; l <= end; l++) {
      const info = model.fencedInfo[l - 1];
      if (typeof info === "string" && (info === "sh" || info === "bash" || info === "")) {
        if (CMD_WORDS.test(model.lines[l - 1]!.trim())) return true;
      }
      for (const content of spanContents.get(l) ?? []) {
        if (CMD_WORDS.test(content.trim())) return true;
      }
    }
    return false;
  };

  // Gate 4's index: cardinal string -> the set of section heading-lines that carry
  // it on a non-fenced, non-table line (0 = the pre-heading preamble).
  const cardinalSections = new Map<string, Map<number, number>>();
  for (let i = 0; i < model.lines.length; i++) {
    if (model.fencedInfo[i] !== undefined) continue;
    const line = model.lines[i]!;
    if (TABLE_ROW.test(line)) continue;
    CARDINAL_TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CARDINAL_TOKEN.exec(line)) !== null) {
      const owner = sectionOf(model, i + 1)?.line ?? 0;
      const byOwner = cardinalSections.get(m[0]) ?? new Map<number, number>();
      // First line seen per section: the message quotes ONE other-section line.
      if (!byOwner.has(owner)) byOwner.set(owner, i + 1);
      cardinalSections.set(m[0], byOwner);
    }
  }

  const findings: Finding[] = [];

  for (let i = 0; i < model.lines.length; i++) {
    const docLine = i + 1;
    // Gate 1: non-fenced, non-table, non-heading, undated. A heading is a label,
    // not a claim sentence — every motivating escape is body prose (spec §3.2).
    if (model.fencedInfo[i] !== undefined) continue;
    if (headingLines.has(docLine)) continue;
    const line = model.lines[i]!;
    if (TABLE_ROW.test(line)) continue;
    if (ISO_DATE_LINE.test(line)) continue;

    // Gates 2 to 5, per CANDIDATE. Every accept-set match on the line is tried, and
    // the FIRST that clears every gate owns the line: the gates below reject a
    // particular cardinal, not the line, so abandoning the line at the first
    // rejected candidate would report silence on a line that does carry a
    // qualifying claim (whole-diff review R1, live proof at
    // `docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md:238`).
    const mySection = sectionOf(model, docLine)?.line ?? 0;
    const bound = qualifierBoundStarts(line);
    const spans = spanRanges.get(docLine) ?? [];
    UNIVERSAL_CARDINAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = UNIVERSAL_CARDINAL.exec(line)) !== null) {
      const cardinal = m[2]!;
      const matchStart = m.index;
      const matchEnd = m.index + m[0].length;

      // Gate 2: the value bound, the literal-continuation exclusion, the time-unit
      // exclusion and the inline-span exclusion.
      if (Number(cardinal) < MIN_CARDINAL_VALUE) continue;
      if (LITERAL_CONTINUATION.test(line.slice(matchEnd))) continue;
      if (TIME_UNIT_AFTER.test(line.slice(matchEnd))) continue;
      if (spans.some((r) => matchStart >= r.start && matchEnd <= r.end)) continue;

      // Gate 3: a dated qualifier phrase excludes the cardinal it binds — its NEAREST
      // predecessor within reach, the same rule the prose-count arms apply (the
      // function itself is shared, so the two arms cannot drift apart).
      if (bound.has(matchEnd - cardinal.length)) continue;

      // Gate 4: the population the universal quantifies is stated elsewhere — the same
      // cardinal string on a non-fenced, non-table line of a DIFFERENT section.
      let evidenceLine: number | null = null;
      for (const [owner, first] of cardinalSections.get(cardinal) ?? []) {
        if (owner !== mySection) {
          evidenceLine = first;
          break;
        }
      }
      if (evidenceLine === null) continue;

      // Gate 5: no probe command in the owning section. Line-scoped, so it is the
      // same answer for every candidate; it stays inside the loop because reaching
      // it at all means a candidate cleared everything else.
      if (sectionHasCommand(docLine)) break;

      findings.push({
        check: "universals",
        code: "ENUMERATED_UNIVERSAL_NO_PROBE",
        severity: "advisory",
        docLine,
        column: matchStart + 1,
        message: `universal claim over ${cardinal} stands away from its enumeration with no probe beside it: "${snippet(line)}". Let one section own the measurement and reference it, or put the enumerating command beside the claim.`,
        detail: `${cardinal} also appears at line ${evidenceLine}: ${snippet(model.lines[evidenceLine - 1]!)}`,
      });
      // ONE advisory per line: the unit both arms measure is the claim line.
      break;
    }
  }

  return { findings, inventory: inventoryGroups(model, headingLines) };
}

/**
 * The two inventory groups (spec §3.4). Never a finding, never an exit code — the
 * post-repair self-consistency sweep walks these lines instead of grepping for the
 * repair's own vocabulary, which is what let E4 and E5 through (spec §2).
 *
 * ONE occurrence per line, like the instrument and like arm A: the unit both groups
 * measure is the claim LINE, so a second clause-initial quantifier on the same line is
 * a documented limit rather than a second row.
 */
function inventoryGroups(model: DocModel, headingLines: Set<number>): InventoryGroup[] {
  const universals: InventoryOccurrence[] = [];
  const fences: InventoryOccurrence[] = [];

  let inRegion = false;
  let regionDepth = 0;

  for (let i = 0; i < model.lines.length; i++) {
    const docLine = i + 1;
    if (model.fencedInfo[i] !== undefined) continue;
    const line = model.lines[i]!;

    if (headingLines.has(docLine)) {
      const heading = model.headings.find((h) => h.line === docLine)!;
      // An equal-or-shallower heading terminates the region it sits under.
      if (inRegion && heading.depth <= regionDepth) inRegion = false;
      // A MATCHING heading nested inside an OPEN region does not re-anchor it: doing so
      // would let the next nested sibling close the parent early (R3 F2, probed at 142
      // silently dropped lines). A heading line is itself excluded from both groups.
      if (
        !inRegion &&
        heading.depth >= MIN_FENCE_DEPTH &&
        (SCOPE_FENCE_HEADING.test(heading.text) || CLOSEOUT_HEADING.test(heading.text))
      ) {
        inRegion = true;
        regionDepth = heading.depth;
      }
      continue;
    }

    if (
      inRegion &&
      line.trim() !== "" &&
      !THEMATIC_BREAK.test(line) &&
      !TABLE_DELIMITER.test(line)
    ) {
      fences.push({ docLine, column: 1, snippet: snippet(line) });
    }

    if (TABLE_ROW.test(line)) continue;
    const m = UNIVERSAL_CLAUSE.exec(line);
    if (m) {
      const quantifierAt = m.index + m[0].lastIndexOf(m[1]!);
      universals.push({ docLine, column: quantifierAt + 1, snippet: snippet(line) });
    }
  }

  const out: InventoryGroup[] = [];
  if (universals.length > 0) out.push({ raw: "universal-claims", occurrences: universals });
  if (fences.length > 0) out.push({ raw: "scope-fences", occurrences: fences });
  return out;
}
