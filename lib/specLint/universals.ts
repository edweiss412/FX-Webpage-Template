import { qualifierBoundStarts } from "./numerics";
import type { DocModel, Heading } from "./parse";
import type { Finding, InventoryGroup } from "./types";

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
 * ONE match per line, like the instrument: the advisory's unit is the LINE, and a
 * second universal+cardinal claim on the same line is a documented limit rather
 * than a second finding. Contract and instrument therefore cannot disagree about
 * what the layer-2 record measured (spec §3, layer discipline).
 */
const UNIVERSAL_CARDINAL =
  /\b([Ee]very|[Ee]ach|[Aa]ll)\s+(?:one\s+of\s+the\s+|of\s+the\s+)?(\d{1,3})\b/;
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
/** Value bound: 4-digit reads were years, 0/1 reads were status text (spec §3.2 gate 2). */
const MIN_CARDINAL_VALUE = 2;

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

    // Gate 2: the accept-set, plus the value bound, the time-unit exclusion and
    // the inline-span exclusion.
    const m = UNIVERSAL_CARDINAL.exec(line);
    if (!m) continue;
    const cardinal = m[2]!;
    if (Number(cardinal) < MIN_CARDINAL_VALUE) continue;
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    if (TIME_UNIT_AFTER.test(line.slice(matchEnd))) continue;
    const inSpan = (spanRanges.get(docLine) ?? []).some(
      (r) => matchStart >= r.start && matchEnd <= r.end,
    );
    if (inSpan) continue;

    // Gate 3: a dated qualifier phrase excludes the cardinal it binds — its NEAREST
    // predecessor within reach, the same rule the prose-count arms apply (the
    // function itself is shared, so the two arms cannot drift apart).
    const cardinalStart = matchEnd - cardinal.length;
    if (qualifierBoundStarts(line).has(cardinalStart)) continue;

    // Gate 4: the population the universal quantifies is stated elsewhere — the same
    // cardinal string on a non-fenced, non-table line of a DIFFERENT section.
    const mySection = sectionOf(model, docLine)?.line ?? 0;
    const owners = cardinalSections.get(cardinal);
    let evidenceLine: number | null = null;
    for (const [owner, first] of owners ?? []) {
      if (owner !== mySection) {
        evidenceLine = first;
        break;
      }
    }
    if (evidenceLine === null) continue;

    // Gate 5: no probe command in the owning section.
    if (sectionHasCommand(docLine)) continue;

    findings.push({
      check: "universals",
      code: "ENUMERATED_UNIVERSAL_NO_PROBE",
      severity: "advisory",
      docLine,
      column: matchStart + 1,
      message: `universal claim over ${cardinal} stands away from its enumeration with no probe beside it: "${snippet(line)}" — let one section own the measurement and reference it, or put the enumerating command beside the claim`,
      detail: `${cardinal} also appears at line ${evidenceLine}: ${snippet(model.lines[evidenceLine - 1]!)}`,
    });
  }

  return { findings, inventory: [] };
}
