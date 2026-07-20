import type { DocModel, InlineSpan } from "./parse";
import type { Finding, InventoryGroup, InventoryOccurrence } from "./types";

const LEXICON = /\b\d+(?:\.\d+)?\b/g;
const NOUN_AFTER = /^\s+([a-z][a-z-]{2,})/;
const EXCLUSION_CONTEXTS = [
  /\d{4}-\d{2}-\d{2}/g, // ISO dates
  /v?\d+\.\d+\.\d+/g, // version strings
  /\d+:\d+/g, // clock times
  /0x[0-9a-fA-F]+/g, // hex literals
];
const SNIPPET_BEFORE = 41;
const SNIPPET_AFTER = 40;

interface Range {
  start: number;
  end: number;
}

function rangesOn(line: string, res: RegExp[]): Range[] {
  const out: Range[] = [];
  for (const re of res) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const inRange = (i: number, rs: Range[]): boolean => rs.some((r) => i >= r.start && i < r.end);

export function checkNumerics(
  model: DocModel,
  candidateSpans: InlineSpan[],
): { findings: Finding[]; inventory: InventoryGroup[] } {
  interface Hit {
    raw: string;
    docLine: number;
    column: number; // 1-based UTF-16
    snippet: string;
    noun: string | null;
  }
  const hits: Hit[] = [];

  for (let idx = 0; idx < model.lines.length; idx++) {
    if (model.fencedInfo[idx] !== undefined) continue; // fenced or delimiter
    const line = model.lines[idx]!;
    const lineNo = idx + 1;
    const spanRanges: Range[] = candidateSpans
      .filter((s) => s.line === lineNo)
      .map((s) => ({ start: s.column - 1, end: s.column - 1 + s.content.length }));
    const exclRanges = rangesOn(line, EXCLUSION_CONTEXTS);
    LEXICON.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LEXICON.exec(line)) !== null) {
      if (inRange(m.index, spanRanges) || inRange(m.index, exclRanges)) continue;
      const column = m.index + 1;
      const noun = NOUN_AFTER.exec(line.slice(m.index + m[0].length));
      hits.push({
        raw: m[0],
        docLine: lineNo,
        column,
        snippet: line.slice(Math.max(0, column - SNIPPET_BEFORE), column + SNIPPET_AFTER),
        noun: noun ? noun[1]! : null,
      });
    }
  }

  // Noun-anchored mismatch: normalized noun bound to ≥2 distinct raws.
  const findings: Finding[] = [];
  const byNoun = new Map<string, Hit[]>();
  for (const h of hits) {
    if (h.noun === null) continue;
    const norm = h.noun.toLowerCase().replace(/s$/, "");
    const list = byNoun.get(norm);
    if (list) list.push(h);
    else byNoun.set(norm, [h]);
  }
  const mismatches: { first: Hit; all: Hit[] }[] = [];
  for (const group of byNoun.values()) {
    const raws = new Set(group.map((h) => h.raw));
    if (raws.size >= 2) mismatches.push({ first: group[0]!, all: group });
  }
  mismatches.sort((a, b) => a.first.docLine - b.first.docLine || a.first.column - b.first.column);
  for (const mm of mismatches) {
    findings.push({
      check: "numerics",
      code: "NUMERIC_NOUN_MISMATCH",
      severity: "advisory",
      docLine: mm.first.docLine,
      column: mm.first.column,
      message: `"${mm.first.noun}" appears with ${new Set(mm.all.map((h) => h.raw)).size} distinct numbers`,
      detail: mm.all.map((h) => `doc line ${h.docLine}: "${h.raw} ${h.noun}"`).join("; "),
    });
  }

  // Inventory: group by RAW; groups by Number(raw) then raw; occurrences by (docLine, column).
  const byRaw = new Map<string, InventoryOccurrence[]>();
  for (const h of hits) {
    const occ: InventoryOccurrence = { docLine: h.docLine, column: h.column, snippet: h.snippet };
    const list = byRaw.get(h.raw);
    if (list) list.push(occ);
    else byRaw.set(h.raw, [occ]);
  }
  const inventory: InventoryGroup[] = [...byRaw.entries()]
    .map(([raw, occurrences]) => ({
      raw,
      occurrences: occurrences.sort((a, b) => a.docLine - b.docLine || a.column - b.column),
    }))
    .sort((a, b) => Number(a.raw) - Number(b.raw) || (a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0));

  return { findings, inventory };
}
