/**
 * lib/planFences/extract.ts — container-aware fence extraction.
 *
 * Spec §2.1: fences are recognized AFTER stripping leading list-marker and
 * block-quote container prefixes; a closer must match the opener's fence
 * character and length at the same-or-shallower container depth; a fence the
 * extractor cannot place is REPORTED as unplaced rather than skipped.
 *
 * Deliberately NOT the calibration probe's rule. The probe strips any 2+-space
 * indentation as a container prefix, which reads a root-level 4-space-indented
 * delimiter — indented code under CommonMark — as a fence. That divergence is
 * invisible in the corpus numbers and is pinned by a planted case in the suite.
 *
 * Pure: no I/O.
 */
import type { UnplacedFence } from "./types";

/** The set of info strings that can carry code, plus bare (spec §2.1 R1 F4). */
const CODE_INFO = new Set(["ts", "tsx", "typescript", "js", "jsx", "mjs"]);

/**
 * The eligibility predicate, VERBATIM from the spec: the probe's
 * `/[;{}=]|=>/` (single characters — `;` `{` `}` `=` — or an arrow) UNION a
 * line-anchored import/export statement test. The union arm has zero corpus
 * instances, which is exactly why it needs a planted case rather than trust.
 */
const BODY_LOOKS_LIKE_CODE = /[;{}=]|=>/;
const BODY_HAS_MODULE_STATEMENT = /^[ \t]*(?:import|export)\s/m;

export type Fence = {
  /** 1-based line of the opening delimiter. */
  openLine: number;
  /** 1-based line of the closing delimiter. */
  closeLine: number;
  info: string;
  /** Interior lines, container prefixes already peeled. */
  body: string[];
  /** 1-based document line of each body entry, parallel to `body`. */
  bodyLines: number[];
  eligible: boolean;
};

/** Peel block-quote markers and list markers; return the remaining text + depth. */
function peelContainers(line: string): { rest: string; depth: number } {
  let rest = line;
  let depth = 0;
  for (;;) {
    const quote = /^ {0,3}> ?/.exec(rest);
    if (quote) {
      rest = rest.slice(quote[0].length);
      depth += 1;
      continue;
    }
    // A list marker only opens a container when followed by whitespace; `-` alone
    // on a line is a marker with an empty item, which carries no fence.
    const marker = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+/.exec(rest);
    if (marker) {
      rest = rest.slice(marker[0].length);
      depth += 1;
      continue;
    }
    return { rest, depth };
  }
}

const FENCE_DELIM = /^( {0,3})(`{3,}|~{3,})(.*)$/;

type Delim = { chars: string; len: number; info: string; depth: number };

/**
 * Classify a line as a fence delimiter, or null.
 *
 * The 4-space test runs on the text AFTER container peeling, so it means
 * "4 columns past this container's content column" rather than "4 columns from
 * the left" — the distinction the probe collapses.
 */
function delimiterOf(line: string): Delim | null {
  const { rest, depth } = peelContainers(line);
  const m = FENCE_DELIM.exec(rest);
  if (!m) return null;
  return { chars: m[2]![0]!, len: m[2]!.length, info: m[3]!.trim(), depth };
}

export type Extraction = { fences: Fence[]; unplaced: UnplacedFence[] };

export function extractFences(path: string, text: string): Extraction {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const fences: Fence[] = [];
  const unplaced: UnplacedFence[] = [];

  let open: { at: number; d: Delim } | null = null;
  let body: string[] = [];
  let bodyLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const d = delimiterOf(line);
    if (open === null) {
      if (d) {
        open = { at: i + 1, d };
        body = [];
        bodyLines = [];
      }
      continue;
    }
    // Inside a fence. A closer matches the opener's CHARACTER, is at least as
    // long, carries no info string, and sits at the same or shallower depth.
    const closes =
      d !== null &&
      d.chars === open.d.chars &&
      d.len >= open.d.len &&
      d.info === "" &&
      d.depth <= open.d.depth;
    if (closes) {
      const info = open.d.info.split(/\s+/)[0] ?? "";
      const joined = body.join("\n");
      const eligible =
        (CODE_INFO.has(info.toLowerCase()) || info === "") &&
        (BODY_LOOKS_LIKE_CODE.test(joined) || BODY_HAS_MODULE_STATEMENT.test(joined));
      fences.push({
        openLine: open.at,
        closeLine: i + 1,
        info,
        body,
        bodyLines,
        eligible,
      });
      open = null;
      continue;
    }
    body.push(peelContainers(line).rest);
    bodyLines.push(i + 1);
  }

  if (open !== null) {
    // Open at EOF: the extractor cannot place it. Reported by path and line —
    // the whole point of limit 3b is that this number is visible.
    unplaced.push({
      path,
      line: open.at,
      reason: "fence opened and never closed",
    });
  }

  return { fences, unplaced };
}

/** Every line that is a fence delimiter, for the waiver-coverage helper. */
export function fenceDelimiterLines(text: string): Set<number> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = new Set<number>();
  const { fences } = extractFences("", text);
  for (const f of fences) {
    out.add(f.openLine);
    out.add(f.closeLine);
  }
  void lines;
  return out;
}
