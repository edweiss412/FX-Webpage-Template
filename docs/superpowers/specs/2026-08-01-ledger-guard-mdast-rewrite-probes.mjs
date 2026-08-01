// r41 probe harness — r40 guard machinery ported VERBATIM from
// test/guard-hardening-followup snapshot a1cfce98d
// (tests/docs/_metaDeferralLedgerGraduation.test.ts). Probes reproduce (or
// fail to reproduce) the three r41 open findings named in
// BL-LEDGER-GUARD-MDAST-REWRITE: "census expression shapes; later same-line
// fields; hyphenated-id false positives". Findings 2 and 3 are ledger-guard
// shapes and probed here; finding 1 is containment-census and probed after
// the restore (separate phase).

const TERMINAL_WORDS = "CLOSED|WITHDRAWN|RESOLVED|SUPERSEDED|SHIPPED|DONE|OBSOLETE|REFUTED";
const WRAP = "(?:[*_`]|✅|\\s)*";
const AFTER = "(?![A-Za-z0-9])";
const CONTAINER = "(?:>\\s*|(?:[-*+]|\\d{1,9}[.)])\\s+(?:\\[[ xX]\\]\\s+)?)*";

const STATUS_TERMINAL = new RegExp(
  `^\\s*${CONTAINER}(?:[*_]{1,3})?(?:Status|Resolution)(?:[*_]{1,3})?\\s*[:—–-]?${WRAP}(${TERMINAL_WORDS})${AFTER}`,
  "i",
);
const FILED_TERMINAL = new RegExp(
  `^\\s*${CONTAINER}(?:[*_]{1,3})?Filed(?:[*_]{1,3})?\\s*[:—–-]?${WRAP}(${TERMINAL_WORDS})${AFTER}`,
  "i",
);
const STATUS_FIELD_LINE = new RegExp(`^\\s*${CONTAINER}(?:[*_]{1,3})?(?:Status|Resolution)`, "i");
const FILED_FIELD_LINE = new RegExp(`^\\s*${CONTAINER}(?:[*_]{1,3})?Filed`, "i");
const CONTAINER_ONLY = new RegExp(`^\\s*${CONTAINER}\\s*$`);
const firstContentLine = (lines) => lines.find((l) => l.trim() !== "" && !CONTAINER_ONLY.test(l)) ?? "";

const normalizeSection = (text) =>
  text
    .split("\n")
    .map((line) => line.replace(/<!--.*?-->/g, ""))
    .join("\n")
    .replace(/(?<![A-Za-z0-9_])__(?!_)([^_\n]+?)(?<!_)__(?![A-Za-z0-9_])/g, "**$1**");

const HEADING_TERMINAL = new RegExp(`(?:[—–]|(?<=\\s)-)${WRAP}(${TERMINAL_WORDS})${AFTER}`, "i");
const OPENING_TERMINAL_BOLD = new RegExp(
  `^\\s*${CONTAINER}\\*\\*${WRAP}(${TERMINAL_WORDS})${AFTER}`,
  "i",
);
const OPENING_TERMINAL_BARE = new RegExp(`^\\s*${CONTAINER}${WRAP}(${TERMINAL_WORDS})${AFTER}`);

const PARTICLE_WORDS =
  "aboard|about|above|absent|across|after|against|along|alongside|amid|amidst|among|amongst|around|as|at|atop|barring|before|behind|below|beneath|beside|besides|between|beyond|but|by|circa|concerning|considering|despite|down|during|except|excepting|excluding|failing|following|for|from|in|including|inside|into|like|minus|near|notwithstanding|of|off|on|onto|opposite|out|outside|over|past|pending|per|plus|regarding|respecting|save|since|through|throughout|till|to|toward|towards|under|underneath|until|unto|up|upon|using|versus|via|with|within|without|worth";

const PARTIAL_BEFORE = new RegExp(
  `(?:PARTIAL(?:LY)?|\\bNOT|\\bNEVER|\\bNO\\s+LONGER|\\bPREVIOUSLY|\\bFORMERLY)` +
    `(?:\\s+(?!(?:${TERMINAL_WORDS})\\b)[A-Za-z]+)?[\\s*_\`:—–-]*$`,
  "i",
);

function partialModified(line, matcher) {
  const m = matcher.exec(line);
  if (m === null) return null;
  const wordAt = m.index + m[0].indexOf(m[1]);
  return PARTIAL_BEFORE.test(line.slice(0, wordAt));
}

const terminalHit = (line, matcher) => partialModified(line, matcher) === false;

const FIELD_VALUE_TERMINAL = new RegExp(
  `(?<![A-Za-z0-9])(${TERMINAL_WORDS})(?=(?:\\s+(?:${PARTICLE_WORDS}))*[*_\x60]{0,3}(?:\\s*:|\\s*[—–](?=\\s|$)|\\s+-(?=\\s|$)))`,
  "gi",
);

function fieldValueTerminalHit(line) {
  for (let m = FIELD_VALUE_TERMINAL.exec(line); m !== null; m = FIELD_VALUE_TERMINAL.exec(line)) {
    if (!PARTIAL_BEFORE.test(line.slice(0, m.index))) {
      FIELD_VALUE_TERMINAL.lastIndex = 0;
      return true;
    }
  }
  FIELD_VALUE_TERMINAL.lastIndex = 0;
  return false;
}

function boldFieldTerminalHit(line) {
  const segRe = /\*\*[^*\n]+\*\*/g;
  for (let s = segRe.exec(line); s !== null; s = segRe.exec(line)) {
    const seg = s[0];
    const inner = seg.slice(2, -2);
    const after = line.slice(s.index + seg.length);
    const externallyLabeled = /^\s*[:—–-]/.test(after);
    const innerLabel = /:\s*$/.test(inner);
    if (innerLabel || externallyLabeled) {
      const words = inner
        .replace(/:\s*$/, "")
        .split(/[^A-Za-z]+/)
        .filter(Boolean);
      const PARTICLES = new RegExp(`^(?:${PARTICLE_WORDS})$`, "i");
      while (words.length > 0 && PARTICLES.test(words[words.length - 1])) words.pop();
      const last = words[words.length - 1];
      if (last !== undefined && new RegExp(`^(?:${TERMINAL_WORDS})$`, "i").test(last)) {
        const wordAt = s.index + 2 + inner.lastIndexOf(last);
        if (!PARTIAL_BEFORE.test(line.slice(0, wordAt))) return true;
      }
      continue;
    }
    const word = new RegExp(`(?<![A-Za-z0-9])(${TERMINAL_WORDS})(?![A-Za-z0-9])`, "gi");
    for (let m = word.exec(seg); m !== null; m = word.exec(seg)) {
      if (!PARTIAL_BEFORE.test(line.slice(0, s.index + m.index))) return true;
    }
  }
  return false;
}

function entrySectionTerminal(section) {
  const lines = section.split("\n");
  const headingLine = lines[0] ?? "";
  const openingLine = firstContentLine(lines.slice(1));
  const statusLines = lines.filter((l) => STATUS_FIELD_LINE.test(l));
  const filedLines = lines.filter((l) => FILED_FIELD_LINE.test(l));
  const statusHit = statusLines.some(
    (l) => terminalHit(l, STATUS_TERMINAL) || boldFieldTerminalHit(l) || fieldValueTerminalHit(l),
  );
  const filedHit = filedLines.some(
    (l) => terminalHit(l, FILED_TERMINAL) || boldFieldTerminalHit(l) || fieldValueTerminalHit(l),
  );
  const headingHit = terminalHit(headingLine, HEADING_TERMINAL);
  const openingHit =
    terminalHit(openingLine, OPENING_TERMINAL_BOLD) || terminalHit(openingLine, OPENING_TERMINAL_BARE);
  return statusHit || filedHit || headingHit || openingHit;
}

// ---------------------------------------------------------------------------
// PROBES
// ---------------------------------------------------------------------------
let n = 0;
const probe = (name, actual, expectedIfDefective, note) => {
  n++;
  const reproduced = actual === expectedIfDefective;
  console.log(
    `P${n} ${reproduced ? "REPRODUCED" : "not-reproduced"} — ${name}\n   guard says: ${actual}; defect predicts: ${expectedIfDefective}${note ? `\n   ${note}` : ""}`,
  );
};

console.log("=== Finding: later same-line fields (miss / false negative) ===");
// A closure claim in a LATER field on a line whose FIRST label is neither
// Status/Resolution nor Filed. entrySectionTerminal only feeds lines matching
// STATUS_FIELD_LINE / FILED_FIELD_LINE (line-start anchored) to the matchers.
probe(
  "**Class:** infra · **Status:** CLOSED (Status is not the line-leading field)",
  entrySectionTerminal(
    normalizeSection("## BL-P1 — probe\n\n**Class:** CI wiring · **Status:** CLOSED\n"),
  ),
  false,
  "house style puts Status first, but multi-field rows (Status · Severity · Class · Filed) reorder freely",
);
probe(
  "**Effort:** M. **Resolved:** by PR #700 (closure field after non-field lead)",
  entrySectionTerminal(normalizeSection("## BL-P2 — probe\n\n**Effort:** M. **Resolved:** by PR #700.\n")),
  false,
);
// Control: same claims with the field leading the line — must hit.
probe(
  "CONTROL **Status:** CLOSED leading the line",
  entrySectionTerminal(normalizeSection("## BL-P3 — probe\n\n**Status:** CLOSED\n")),
  true,
  "control — proves the harness port is faithful",
);

console.log("\n=== Finding: hyphenated-id false positives ===");
// Heading lane: suffix starting with a terminal word followed by a hyphen —
// AFTER = (?![A-Za-z0-9]) lets `-` through.
probe(
  "heading `## BL-P4 — RESOLVED-vs-CLOSED naming sweep` (open entry, title quotes words)",
  terminalHit("## BL-P4 — RESOLVED-vs-CLOSED naming sweep", HEADING_TERMINAL),
  true,
);
probe(
  "heading `## BL-P5 — DONE-state gallery polish`",
  terminalHit("## BL-P5 — DONE-state gallery polish", HEADING_TERMINAL),
  true,
);
// Field-value lane on a Status/Filed line quoting a hyphenated id whose final
// segment is a terminal word, followed by a colon (r40 fixed only the dash
// separators).
probe(
  "field-value `**Filed:** see BL-DRIVE-RESOLVED: details` (id's last segment terminal, colon after)",
  fieldValueTerminalHit(normalizeSection("**Filed:** 2026-07-31, see BL-DRIVE-RESOLVED: details")),
  true,
);
// Control from the r40 ratification: dash-separated hyphenated id must NOT hit.
probe(
  "CONTROL r40 `BL-CLOSED-LOOP-FIX — quoted on a field line` stays silent",
  fieldValueTerminalHit(normalizeSection("**Filed:** 2026, see BL-CLOSED-LOOP-FIX — details")),
  false,
  "control — r40's own ratified fix must still hold in this port",
);

console.log("\n=== Live-ledger sweep: do any of these shapes exist TODAY? ===");
import { readFileSync } from "node:fs";
const ROOT = "/Users/ericweiss/FX-worktrees/ledger-guard-mdast-rewrite";
for (const rel of ["BACKLOG.md", "DEFERRED.md"]) {
  const text = readFileSync(`${ROOT}/${rel}`, "utf8");
  const lines = text.split("\n");
  let laterField = 0;
  let hyphenHeading = 0;
  for (const l of lines) {
    // later-field shape: line has a bold Status/Resolution/Filed label NOT at line start
    if (
      /\*\*(Status|Resolution|Filed)[:*]/i.test(l) &&
      !STATUS_FIELD_LINE.test(l) &&
      !FILED_FIELD_LINE.test(l)
    )
      laterField++;
    // hyphenated terminal in heading suffix
    if (/^#{2,3} /.test(l) && new RegExp(`[—–]\\s*(?:${TERMINAL_WORDS})-`, "i").test(l)) hyphenHeading++;
  }
  console.log(`${rel}: later-field-shape lines=${laterField}, hyphen-terminal headings=${hyphenHeading}`);
}
