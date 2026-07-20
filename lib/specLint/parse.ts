import type { Finding } from "./types";

export interface InlineSpan {
  line: number;
  column: number; // 1-based UTF-16 code-unit offset of content start
  content: string;
}
export interface Heading {
  line: number;
  depth: number;
  text: string;
}
export interface Waiver {
  line: number;
  kind: "ignore" | "not-ui";
  reason: string;
}
export interface DocModel {
  lines: string[]; // CRLF-normalized, trailing final-newline line dropped (spec §2)
  fencedInfo: (string | null | undefined)[]; // undefined = not fenced; string = inside fence; null = delimiter line
  spans: InlineSpan[]; // line-local inline code spans on non-fenced lines
  headings: Heading[];
  waivers: Waiver[];
  documentFindings: Finding[]; // EMPTY_DOC, WAIVER_MISSING_REASON
}

export function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const WAIVER = /^<!-- spec-lint: (ignore|not-ui) — (.*?)\s*-->$/;

function extractSpans(line: string, lineNo: number): InlineSpan[] {
  const runs: { pos: number; len: number }[] = [];
  const re = /`+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) runs.push({ pos: m.index, len: m[0].length });
  const spans: InlineSpan[] = [];
  let i = 0;
  while (i < runs.length) {
    const opener = runs[i]!;
    let closed = false;
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[j]!.len === opener.len) {
        const closer = runs[j]!;
        spans.push({
          line: lineNo,
          column: opener.pos + opener.len + 1,
          content: line.slice(opener.pos + opener.len, closer.pos),
        });
        i = j + 1;
        closed = true;
        break;
      }
    }
    if (!closed) i += 1; // unclosed run is literal; later runs may still pair
  }
  return spans;
}

export function parseDoc(text: string): DocModel {
  const lines = splitLines(text);
  const fencedInfo: (string | null | undefined)[] = new Array(lines.length).fill(undefined);
  const spans: InlineSpan[] = [];
  const headings: Heading[] = [];
  const waivers: Waiver[] = [];
  const documentFindings: Finding[] = [];

  if (lines.length === 0 || lines.every((l) => l.trim() === "")) {
    documentFindings.push({
      check: "document",
      code: "EMPTY_DOC",
      severity: "fail",
      docLine: 1,
      column: 1,
      message: "document is empty",
    });
    return { lines, fencedInfo, spans, headings, waivers, documentFindings };
  }

  let fence: { char: string; len: number; info: string } | null = null;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    const lineNo = idx + 1;
    if (fence) {
      const closeRe = new RegExp(
        `^ {0,3}(\\${fence.char === "`" ? "`" : "~"}{${fence.len},})\\s*$`,
      );
      if (closeRe.test(line)) {
        fencedInfo[idx] = null; // closing delimiter
        fence = null;
      } else {
        fencedInfo[idx] = fence.info;
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      const run = open[1]!;
      const rest = open[2]!;
      // CommonMark: info string of a backtick fence cannot contain a backtick
      if (!(run.startsWith("`") && rest.includes("`"))) {
        const info = (rest.trim().toLowerCase().split(/\s+/)[0] ?? "").trim();
        fence = { char: run[0]!, len: run.length, info };
        fencedInfo[idx] = null; // opening delimiter
        continue;
      }
    }
    // non-fenced line
    const trimmed = line.trim();
    const w = WAIVER.exec(trimmed);
    if (w) {
      const kind = w[1] as "ignore" | "not-ui";
      const reason = w[2]!.trim();
      if (reason === "") {
        documentFindings.push({
          check: "document",
          code: "WAIVER_MISSING_REASON",
          severity: "fail",
          docLine: lineNo,
          column: 1,
          message: "waiver has no reason",
        });
      } else {
        waivers.push({ line: lineNo, kind, reason });
      }
      continue;
    }
    const h = HEADING.exec(line);
    if (h) headings.push({ line: lineNo, depth: h[1]!.length, text: h[2]!.trim() });
    spans.push(...extractSpans(line, lineNo));
  }

  return { lines, fencedInfo, spans, headings, waivers, documentFindings };
}
