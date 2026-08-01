// r3 repair verification: FULL walker prototype — every §3 lane, §2
// disposition table, id-mode extraction, per-strong-node spans,
// code-span-overlap label provenance, global-token-rule label evaluation.
// Required: zero offenders on live BACKLOG.md with ALL lanes active
// (HEADING_TERMINAL_EXEMPT parity applied), and every targeted shape —
// including all r2-review mismatch shapes — correct.
import { readFileSync } from "node:fs";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

const TERMINAL_WORDS = ["CLOSED", "WITHDRAWN", "RESOLVED", "SUPERSEDED", "SHIPPED", "DONE", "OBSOLETE", "REFUTED"];
const TERMINAL = new RegExp(`^(?:${TERMINAL_WORDS.join("|")})$`, "i");
const PARTICLES = new Set(
  "aboard about above absent across after against along alongside amid amidst among amongst around as at atop barring before behind below beneath beside besides between beyond but by circa concerning considering despite down during except excepting excluding failing following for from in including inside into like minus near notwithstanding of off on onto opposite out outside over past pending per plus regarding respecting save since through throughout till to toward towards under underneath until unto up upon using versus via with within without worth".split(
    " ",
  ),
);
const FIELD_LABELS = /^(status|resolution|filed)$/i;
const EXEMPT = new Set(["BL-CI-STALE-BRANCH-PROTECTION-COMMENT"]);

const parse = (t) => remark().use(remarkGfm).parse(t);

// mode: "claim" drops delete; "id" keeps it. Strong spans are ONE span per
// strong NODE (full extent, nested emphasis/inlineCode descendants included).
function flattenLines(nodes, mode = "claim") {
  const lines = [{ text: "", strongSpans: [], codeSpans: [] }];
  const cur = () => lines[lines.length - 1];
  const push = (s) => (cur().text += s);
  const newline = () => lines.push({ text: "", strongSpans: [], codeSpans: [] });
  const walk = (n) => {
    switch (n.type) {
      case "text": {
        String(n.value)
          .split("\n")
          .forEach((p, i) => {
            if (i > 0) newline();
            push(p);
          });
        return;
      }
      case "inlineCode": {
        const start = cur().text.length;
        push(String(n.value));
        cur().codeSpans.push([start, start + String(n.value).length]);
        return;
      }
      case "strong": {
        const startLine = lines.length - 1;
        const start = cur().text.length;
        for (const c of n.children ?? []) walk(c);
        // span per strong NODE; if a newline split it, close at each line end
        if (lines.length - 1 === startLine) cur().strongSpans.push([start, cur().text.length]);
        else {
          lines[startLine].strongSpans.push([start, lines[startLine].text.length]);
          cur().strongSpans.push([0, cur().text.length]);
        }
        return;
      }
      case "emphasis":
        for (const c of n.children ?? []) walk(c);
        return;
      case "delete":
        if (mode === "id") for (const c of n.children ?? []) walk(c);
        return;
      case "code":
      case "html":
      case "link":
      case "linkReference":
      case "image":
      case "imageReference":
      case "table":
      case "footnoteDefinition":
      case "footnoteReference":
      case "definition":
      case "thematicBreak":
      case "yaml":
        return;
      case "break":
        newline();
        return;
      default: {
        const block = ["paragraph", "heading", "blockquote", "list", "listItem"].includes(n.type);
        if (block && cur().text !== "") newline();
        for (const c of n.children ?? []) walk(c);
        if (block) newline();
      }
    }
  };
  for (const n of nodes) walk(n);
  return lines.filter((l) => l.text.trim() !== "");
}

// global token rule: maximal [A-Za-z0-9-]+ runs; a claim token EQUALS a terminal word
const tokens = (s) => [...s.matchAll(/[A-Za-z0-9-]+/g)].map((m) => ({ t: m[0], i: m.index }));
const tokenAt = (text, i) => /^[A-Za-z0-9-]*/.exec(text.slice(i))[0];

const VETO = new RegExp(
  `(?:PARTIAL(?:LY)?|\\bNOT|\\bNEVER|\\bNO\\s+LONGER|\\bPREVIOUSLY|\\bFORMERLY)(?:\\s+(?!(?:${TERMINAL_WORDS.join("|")})\\b)[A-Za-z]+)?[\\s:—–-]*$`,
  "i",
);
const vetoed = (text, at) => VETO.test(text.slice(0, at));
const overlaps = (spans, s, e) => spans.some(([a, b]) => s < b && e > a);

function labelSpans(line) {
  const out = [];
  for (const [s, e] of line.strongSpans) {
    if (overlaps(line.codeSpans, s, e)) continue; // label provenance: full-span overlap check
    const inner = line.text.slice(s, e);
    const after = line.text.slice(e);
    const innerLabel = /:\s*$/.test(inner);
    const external = /^\s*[:—–-]/.test(after);
    if (innerLabel || external) out.push({ s, e, inner: inner.replace(/:\s*$/, "") });
  }
  return out;
}

// label evaluation under the global token rule: strip trailing whole-token
// particles, final remaining token must EQUAL a terminal word
function labelTerminal(line, L) {
  const tk = tokens(L.inner);
  while (tk.length && PARTICLES.has(tk[tk.length - 1].t.toLowerCase())) tk.pop();
  const last = tk[tk.length - 1];
  if (last && TERMINAL.test(last.t) && !vetoed(line.text, L.s + last.i)) return last.t;
  return null;
}

function lineVerdicts(line) {
  const hits = [];
  const labels = labelSpans(line);
  for (const L of labels) {
    const t = labelTerminal(line, L);
    if (t) hits.push(`terminal-label:${t}`);
  }
  for (const L of labels) {
    const labelTokens = tokens(L.inner);
    if (labelTokens.length !== 1 || !FIELD_LABELS.test(labelTokens[0].t)) continue;
    let vs = L.e + /^\s*[:—–-]?\s*✅?\s*/.exec(line.text.slice(L.e))[0].length;
    const tok = tokenAt(line.text, vs);
    if (TERMINAL.test(tok) && !vetoed(line.text, vs)) hits.push(`field-label:${tok}`);
  }
  const lead = /^\s*(status|resolution|filed)\b/i.exec(line.text);
  const leadStart = lead ? lead[0].length - lead[1].length : 0;
  const leadField =
    lead !== null && !overlaps(line.codeSpans, leadStart, leadStart + lead[1].length);
  if (leadField) {
    let i = lead[0].length + /^\s*[:—–-]?\s*✅?\s*/.exec(line.text.slice(lead[0].length))[0].length;
    const tok = tokenAt(line.text, i);
    if (TERMINAL.test(tok) && !vetoed(line.text, i)) hits.push(`leading:${tok}`);
    for (const [s, e] of line.strongSpans) {
      if (labels.some((L) => L.s === s)) continue;
      for (const { t, i: ti } of tokens(line.text.slice(s, e)))
        if (TERMINAL.test(t) && !vetoed(line.text, s + ti)) hits.push(`bold-nonlabel:${t}`);
    }
    // bare-field lane with particle chains: terminal token whose following
    // tokens are all particles until a separator
    for (const { t, i: ti } of tokens(line.text)) {
      if (!TERMINAL.test(t)) continue;
      let rest = line.text.slice(ti + t.length);
      const chain = new RegExp(`^(?:\\s+(?:${[...PARTICLES].join("|")}))*`, "i").exec(rest)[0];
      rest = rest.slice(chain.length);
      if (/^\s*:|^\s*[—–](?=\s|$)|^\s+-(?=\s|$)/.test(rest) && !vetoed(line.text, ti))
        hits.push(`bare-field:${t}`);
    }
  }
  return hits;
}

function headingVerdict(headingLine, id) {
  // dash-anchored or ✅-anchored terminal token AFTER the id token (§3):
  // anchors inside an arbitrary bracket prefix or anywhere before the id
  // are not the entry's own closure claim.
  const text = headingLine.text;
  // Re-run the extraction shape on the claim-flattened text: the bracket
  // prefix is skipped structurally, so an id (or id-substring) occurrence
  // INSIDE the prefix cannot anchor the scan. Delete-wrapped id: no match,
  // fall back to 0 (ratified conservative-loud).
  const em = /^\s*(?:\[[^\]]+\]\s*)?([A-Za-z0-9][A-Za-z0-9/-]*)/.exec(text);
  const from = em && em[1] === id ? em.index + em[0].length : 0;
  const m = /(?:[—–]|(?<=\s)-(?=\s)|✅)\s*✅?\s*/g;
  m.lastIndex = 0;
  const hits = [];
  for (let x = m.exec(text); x; x = m.exec(text)) {
    if (x.index < from) continue;
    const tok = tokenAt(text, x.index + x[0].length);
    if (TERMINAL.test(tok) && !vetoed(text, x.index + x[0].length)) hits.push(`heading:${tok}`);
  }
  return hits;
}

function openingVerdict(line) {
  if (!line) return [];
  const hits = [];
  const first = tokens(line.text)[0];
  if (first && TERMINAL.test(first.t) && line.text.slice(0, first.i).trim() === "") {
    const inStrong = overlaps(line.strongSpans, first.i, first.i + first.t.length);
    const allCaps = first.t === first.t.toUpperCase();
    if ((inStrong || allCaps) && !vetoed(line.text, first.i)) hits.push(`opening:${first.t}`);
  }
  return hits;
}

function entries(text, { requirePrefix, levels } = { requirePrefix: "BL-", levels: [2, 3] }) {
  const root = parse(text);
  const tops = root.children;
  const found = [];
  tops.forEach((n, i) => {
    if (n.type !== "heading" || !(levels ?? [2, 3]).includes(n.depth)) return;
    const flat = flattenLines([n], "id")[0]?.text ?? "";
    const m = /^\s*(?:\[[^\]]+\]\s*)?([A-Za-z0-9][A-Za-z0-9/-]*)/.exec(flat);
    if (!m || /[a-z]/.test(m[1])) return;
    if (requirePrefix && !m[1].startsWith(requirePrefix)) return;
    // id END in the CLAIM-flattened heading (id may be delete-wrapped there:
    // find the id text if present, else scan from 0 — a struck id vanishes
    // from claim-flatten, and what remains after it is the suffix).
    found.push({ id: m[1], i });
  });
  return found.map((f, k) => ({
    ...f,
    headingLine: flattenLines([tops[f.i]], "claim")[0] ?? { text: "", strongSpans: [], codeSpans: [] },
    body: tops.slice(f.i + 1, k + 1 < found.length ? found[k + 1].i : tops.length),
  }));
}

function entryVerdicts(e) {
  const hits = [];
  hits.push(...headingVerdict(e.headingLine, e.id));
  const bodyLines = flattenLines(e.body, "claim");
  hits.push(...openingVerdict(bodyLines[0]));
  for (const l of bodyLines) hits.push(...lineVerdicts(l));
  return hits;
}

// --- live run, ALL lanes ---
const backlog = readFileSync("BACKLOG.md", "utf8");
const offenders = [];
for (const e of entries(backlog)) {
  if (EXEMPT.has(e.id)) continue;
  const h = entryVerdicts(e);
  if (h.length) offenders.push({ id: e.id, hits: h });
}
console.log("live BACKLOG offenders, ALL lanes, post-exemption:", JSON.stringify(offenders, null, 1));

// --- targeted shapes ---
let fails = 0;
const shape = (name, md, expect, kind = "entry") => {
  let hits;
  if (kind === "entry") {
    const es = entries(`## BL-PROBE — probe\n\n${md}\n`);
    hits = es.flatMap(entryVerdicts);
  } else if (kind === "heading") {
    const es = entries(`${md}\n\nbody\n`);
    hits = es.flatMap((e) => headingVerdict(e.headingLine, e.id));
  } else if (kind === "ids") {
    hits = entries(md).map((e) => e.id);
    console.log(`${name}: ids=${JSON.stringify(hits)}`);
    return;
  }
  const ok = (hits.length > 0) === expect;
  if (!ok) fails++;
  console.log(`${name}: hits=${JSON.stringify(hits)} expected=${expect} ${ok ? "OK" : "MISMATCH"}`);
};

// r1-round originals
shape("P1 mid-line Status", "**Class:** CI wiring · **Status:** CLOSED", true);
shape("P2 terminal label", "**Effort:** M. **Resolved:** by PR #700.", true);
shape("line-607 narrative", "**Partial closure (2026-07-27):** shipped. **Header-aware segmentation** — details, a REFUTED: mention. **Residuals (still open):** more", false);
shape("backticked value", "**Status:** `RESOLVED`", true);
shape("quoted example line", "`Status: CLOSED`", false);
shape("footnote", "[^h]: **Status:** CLOSED in the predecessor.", false);
// r2-round mismatch shapes
shape("heading lane control", "## BL-H — CLOSED 2026-08-01", true, "heading");
shape("heading exempt-shape ✅", "## BL-H2 — ✅ RESOLVED (kept)", true, "heading");
shape("decorative ✅ open title", "## BL-H3 — align the ✅ icon", false, "heading");
shape("opening lane control", "**CLOSED** by PR #9.", true);
shape("opening bare all-caps", "RESOLVED by the popover migration.", true);
shape("opening bare titlecase", "Resolved only as part of BL-X.", false);
shape("bare-field particle chain", "**Status:** open — CLOSED as of: 2026", true); // bare-field on leading-field line
shape("hyphenated terminal label", "**re-CLOSED:** discussion", false);
shape("digit-suffix label", "**CLOSED2:** discussion", false);
shape("digit-prefix label", "**2CLOSED:** discussion", false);
shape("hyphen-particle label", "**CLOSED-by:** discussion", false);
shape("partial code-label overlap", "**Sta`tus`:** CLOSED", false);
shape("fragmented strong label", "**Class:** x · **Resolved *by*:** PR #9", true);
shape("inline html island opening", "<strong>CLOSED</strong> by PR #1", true); // opening lane: bare ALL-CAPS after tag drop
shape("struck-id extraction", "## ~~BL-STRUCK~~ — reopened\n\nbody\n\n## BL-NEXT — open\n\nbody2\n", null, "ids");
// r3-review shapes
{
  const es = entries("## PROSE heading section\n\nbody\n\n### REAL-ID — open\n\nbody\n", { requirePrefix: null, levels: [3] });
  const ids = es.map((e) => e.id);
  const ok = JSON.stringify(ids) === JSON.stringify(["REAL-ID"]);
  if (!ok) fails++;
  console.log(`deferred depth-mask probe: ids=${JSON.stringify(ids)} expected=["REAL-ID"] ${ok ? "OK" : "MISMATCH"}`);
}
shape("pre-id em-dash anchor", "## [was — CLOSED once] BL-P — open", false, "heading");
shape("pre-id en-dash anchor", "## [was – CLOSED once] BL-P2 — open", false, "heading");
shape("pre-id ASCII-dash anchor", "## [was - CLOSED once] BL-P3 — open", false, "heading");
shape("pre-id check anchor", "## [✅ CLOSED prior arc] BL-P4 — open", false, "heading");
shape("post-id anchor still caught", "## [P2] BL-P5 — CLOSED 2026", true, "heading");
// r4-review shapes
shape("pre-id duplicated-id anchor", "## [BL-P6 — CLOSED prior arc] BL-P6 — open", false, "heading");
shape("pre-id id-substring anchor", "## [XBL-P7X — CLOSED prior arc] BL-P7 — open", false, "heading");
console.log(fails === 0 ? "ALL SHAPES OK" : `${fails} MISMATCHES`);
