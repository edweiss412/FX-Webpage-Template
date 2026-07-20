import type { DocModel } from "./parse";
import type { Finding } from "./types";

const JS_FAMILY = new Set([
  "ts",
  "tsx",
  "typescript",
  "js",
  "jsx",
  "javascript",
  "mjs",
  "cjs",
  "json",
]);
// Raw U+2014 plus every non-raw spelling (spec §6): &mdash;, decimal NCR, hex NCR
// (case-insensitive x), —, \u{2014}.
const EM_DASH_CLASS = /—|&mdash;|&#8212;|&#[xX]2014;|\\u2014|\\u\{2014\}/g;

function emDashFindings(text: string, docLine: number, columnOffset: number): Finding[] {
  const out: Finding[] = [];
  EM_DASH_CLASS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EM_DASH_CLASS.exec(text)) !== null) {
    out.push({
      check: "copy",
      code: "COPY_EM_DASH",
      severity: "fail",
      docLine,
      column: columnOffset + m.index + 1,
      message: `em-dash (as \`${m[0]}\`) in user-visible copy`,
    });
  }
  return out;
}

interface QuotedSpan {
  start: number; // 0-based index of first content unit
  end: number; // 0-based exclusive
}

/** Line-local pairing: straight quotes pair sequentially, curly “→”, never cross-style. */
function scanProseLine(line: string, docLine: number): Finding[] {
  const findings: Finding[] = [];
  const quoted: QuotedSpan[] = [];
  let unscannedFrom = Infinity; // remainder after an unpaired OPENER is unscanned

  // straight quotes
  const straightPos: number[] = [];
  for (let i = 0; i < line.length; i++) if (line[i] === '"') straightPos.push(i);
  for (let k = 0; k + 1 < straightPos.length; k += 2) {
    quoted.push({ start: straightPos[k]! + 1, end: straightPos[k + 1]! });
  }
  if (straightPos.length % 2 === 1) {
    const openerAt = straightPos[straightPos.length - 1]!;
    findings.push({
      check: "copy",
      code: "COPY_UNPAIRED_QUOTE",
      severity: "advisory",
      docLine,
      column: openerAt + 1,
      message: "unpaired straight quote; remainder of line unscanned",
    });
    unscannedFrom = Math.min(unscannedFrom, openerAt);
  }

  // curly quotes
  let curlyOpen: number | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "“") {
      if (curlyOpen === null) curlyOpen = i;
      // nested opener inside an open curly span: ignore, the first opener governs
    } else if (ch === "”") {
      if (curlyOpen !== null) {
        quoted.push({ start: curlyOpen + 1, end: i });
        curlyOpen = null;
      } else {
        findings.push({
          check: "copy",
          code: "COPY_UNPAIRED_QUOTE",
          severity: "advisory",
          docLine,
          column: i + 1,
          message: "unmatched closing curly quote",
        });
        // stray closer never stops scanning
      }
    }
  }
  if (curlyOpen !== null) {
    findings.push({
      check: "copy",
      code: "COPY_UNPAIRED_QUOTE",
      severity: "advisory",
      docLine,
      column: curlyOpen + 1,
      message: "unpaired opening curly quote; remainder of line unscanned",
    });
    unscannedFrom = Math.min(unscannedFrom, curlyOpen);
  }

  for (const span of quoted) {
    if (span.start > unscannedFrom) continue; // inside the unscanned remainder
    const content = line.slice(span.start, span.end);
    findings.push(...emDashFindings(content, docLine, span.start));
    const dd = content.indexOf("--");
    if (dd >= 0) {
      findings.push({
        check: "copy",
        code: "COPY_DOUBLE_HYPHEN",
        severity: "advisory",
        docLine,
        column: span.start + dd + 1,
        message: "double hyphen in quoted copy",
      });
    }
    const ap = content.indexOf("'");
    if (ap >= 0) {
      findings.push({
        check: "copy",
        code: "COPY_STRAIGHT_APOSTROPHE",
        severity: "advisory",
        docLine,
        column: span.start + ap + 1,
        message: "straight apostrophe in quoted copy",
      });
    }
  }
  return findings;
}

export function checkCopy(model: DocModel): Finding[] {
  const findings: Finding[] = [];
  for (let idx = 0; idx < model.lines.length; idx++) {
    const info = model.fencedInfo[idx];
    const line = model.lines[idx]!;
    const docLine = idx + 1;
    if (info === undefined) {
      findings.push(...scanProseLine(line, docLine));
    } else if (typeof info === "string" && JS_FAMILY.has(info)) {
      // JS-family fences are scanned WHOLE (comments included) for the em-dash class.
      findings.push(...emDashFindings(line, docLine, 0));
    }
    // delimiter lines (null) and non-JS fences: unscanned
  }
  return findings;
}
