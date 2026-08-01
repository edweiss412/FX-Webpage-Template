// r2 repair verification: run the REPAIRED lane semantics (spec §3 after the
// r1 round) over the live ledgers. Required output: zero offenders on live
// BACKLOG.md (live-clean criterion) with the two new lanes active, plus
// verdicts for the P1/P2/line-607 shapes.
import { readFileSync } from "node:fs";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

const TERMINAL = /^(CLOSED|WITHDRAWN|RESOLVED|SUPERSEDED|SHIPPED|DONE|OBSOLETE|REFUTED)$/i;
const PARTICLES = new Set(
  "aboard about above absent across after against along alongside amid amidst among amongst around as at atop barring before behind below beneath beside besides between beyond but by circa concerning considering despite down during except excepting excluding failing following for from in including inside into like minus near notwithstanding of off on onto opposite out outside over past pending per plus regarding respecting save since through throughout till to toward towards under underneath until unto up upon using versus via with within without worth".split(
    " ",
  ),
);
const FIELD_LABELS = /^(status|resolution|filed)$/i;

const parse = (t) => remark().use(remarkGfm).parse(t);

// claim-flatten per spec §2 disposition table; returns lines with strong spans
function flattenLines(nodes) {
  const lines = [{ text: "", spans: [], codeSpans: [] }];
  const push = (s) => (lines[lines.length - 1].text += s);
  const newline = () => lines.push({ text: "", spans: [], codeSpans: [] });
  const walk = (n, inStrong) => {
    switch (n.type) {
      case "text": {
        const parts = String(n.value).split("\n");
        parts.forEach((p, i) => {
          if (i > 0) newline();
          const start = lines[lines.length - 1].text.length;
          push(p);
          if (inStrong) lines[lines.length - 1].spans.push([start, start + p.length]);
        });
        return;
      }
      case "inlineCode": {
        const start = lines[lines.length - 1].text.length;
        push(String(n.value));
        lines[lines.length - 1].codeSpans.push([start, start + String(n.value).length]);
        if (inStrong) lines[lines.length - 1].spans.push([start, start + String(n.value).length]);
        return;
      }
      case "strong":
        for (const c of n.children ?? []) walk(c, true);
        return;
      case "emphasis":
        for (const c of n.children ?? []) walk(c, inStrong);
        return;
      case "delete":
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
        return; // html: inline tag nodes carry no prose; block islands are single nodes
      case "break":
        newline();
        return;
      default: {
        const block = ["paragraph", "heading", "blockquote", "list", "listItem"].includes(n.type);
        if (block && lines[lines.length - 1].text !== "") newline();
        for (const c of n.children ?? []) walk(c, inStrong);
        if (block) newline();
      }
    }
  };
  for (const n of nodes) walk(n, false);
  return lines.filter((l) => l.text.trim() !== "");
}

const tokenAt = (text, i) => {
  const m = /^[A-Za-z0-9-]+/.exec(text.slice(i));
  return m ? m[0] : "";
};
const words = (s) => s.split(/[^A-Za-z]+/).filter(Boolean);
const stripParticles = (w) => {
  const a = [...w];
  while (a.length && PARTICLES.has(a[a.length - 1].toLowerCase())) a.pop();
  return a;
};
const VETO = new RegExp(
  "(?:PARTIAL(?:LY)?|\\bNOT|\\bNEVER|\\bNO\\s+LONGER|\\bPREVIOUSLY|\\bFORMERLY)(?:\\s+(?!(?:CLOSED|WITHDRAWN|RESOLVED|SUPERSEDED|SHIPPED|DONE|OBSOLETE|REFUTED)\\b)[A-Za-z]+)?[\\s:—–-]*$",
  "i",
);
const vetoed = (line, at) => VETO.test(line.slice(0, at));

// label spans on a line: strong span whose text ends with ':' or is followed by ':' / dash
function labelSpans(line) {
  const out = [];
  for (const [s, e] of line.spans) {
    const inner = line.text.slice(s, e);
    const after = line.text.slice(e);
    const innerLabel = /:\s*$/.test(inner);
    const external = /^\s*[:—–-]/.test(after);
    const inCodeSpan = (line.codeSpans ?? []).some(([a, b]) => s >= a && s < b);
    if ((innerLabel || external) && !inCodeSpan) out.push({ s, e, inner: inner.replace(/:\s*$/, ""), external });
  }
  return out;
}

function lineVerdicts(line) {
  const hits = [];
  const lead = /^\s*(status|resolution|filed)\b/i.exec(line.text);
  const leadStart = lead ? lead[0].length - lead[1].length : 0;
  const inCode = (i) => (line.codeSpans ?? []).some(([a, b]) => i >= a && i < b);
  const leadField = lead !== null && !inCode(leadStart);
  const labels = labelSpans(line);
  // terminal-label lane (line-wide)
  for (const L of labels) {
    const w = stripParticles(words(L.inner));
    const last = w[w.length - 1];
    if (last && TERMINAL.test(last) && !vetoed(line.text, s0(line, L, last))) hits.push(`terminal-label:${last}`);
  }
  // mid-line field-label lane (line-wide)
  for (const L of labels) {
    if (!FIELD_LABELS.test(L.inner.trim())) continue;
    let vs = L.e;
    const mSep = /^\s*[:—–-]?\s*✅?\s*/.exec(line.text.slice(vs));
    vs += mSep[0].length;
    const tok = tokenAt(line.text, vs);
    if (TERMINAL.test(tok) && !vetoed(line.text, vs)) hits.push(`field-label:${tok}`);
  }
  if (leadField) {
    // line-leading value lane
    let i = lead[0].length + (line.text.length - line.text.trimStart().length);
    const mSep = /^\s*[:—–-]?\s*✅?\s*/.exec(line.text.slice(i));
    i += mSep[0].length;
    const tok = tokenAt(line.text, i);
    if (TERMINAL.test(tok) && !vetoed(line.text, i)) hits.push(`leading:${tok}`);
    // per-occurrence bold non-label scan + bare-field lane (confined here)
    for (const [s, e] of line.spans) {
      if (labels.some((L) => L.s === s)) continue;
      const seg = line.text.slice(s, e);
      const re = /(?<![A-Za-z0-9-])(CLOSED|WITHDRAWN|RESOLVED|SUPERSEDED|SHIPPED|DONE|OBSOLETE|REFUTED)(?![A-Za-z0-9-])/gi;
      for (let m = re.exec(seg); m; m = re.exec(seg))
        if (!vetoed(line.text, s + m.index)) hits.push(`bold-nonlabel:${m[1]}`);
    }
    const bare = /(?<![A-Za-z0-9-])(CLOSED|WITHDRAWN|RESOLVED|SUPERSEDED|SHIPPED|DONE|OBSOLETE|REFUTED)(?=\s*:|\s*[—–](?=\s|$)|\s+-(?=\s|$))/gi;
    for (let m = bare.exec(line.text); m; m = bare.exec(line.text))
      if (!vetoed(line.text, m.index)) hits.push(`bare-field:${m[1]}`);
  }
  return hits;
}
function s0(line, L, last) {
  return L.s + line.text.slice(L.s, L.e).lastIndexOf(last);
}

// --- entries from live BACKLOG.md, id-heading to id-heading partition ---
function entries(text) {
  const root = parse(text);
  const tops = root.children;
  const found = [];
  tops.forEach((n, i) => {
    if (n.type !== "heading" || n.depth < 2 || n.depth > 3) return;
    const flat = flattenLines([n])[0]?.text ?? "";
    const m = /^\s*(?:\[[^\]]+\]\s*)?~{0,2}([A-Za-z0-9][A-Za-z0-9/-]*)/.exec(flat);
    if (!m || /[a-z]/.test(m[1]) || !m[1].startsWith("BL-")) return;
    found.push({ id: m[1], i, heading: flat });
  });
  return found.map((f, k) => ({
    ...f,
    body: tops.slice(f.i + 1, k + 1 < found.length ? found[k + 1].i : tops.length),
  }));
}

const backlog = readFileSync("BACKLOG.md", "utf8");
const offenders = [];
for (const e of entries(backlog)) {
  const lines = flattenLines(e.body);
  for (const l of lines) {
    const h = lineVerdicts(l);
    if (h.length) offenders.push({ id: e.id, hits: h, line: l.text.slice(0, 90) });
  }
}
// exemption parity
const filtered = offenders.filter((o) => o.id !== "BL-CI-STALE-BRANCH-PROTECTION-COMMENT");
console.log("live BACKLOG offenders (post-exemption):", JSON.stringify(filtered, null, 1));

// --- targeted shapes ---
const shape = (name, md, expect) => {
  const lines = flattenLines(parse(md).children);
  const hits = lines.flatMap((l) => lineVerdicts(l));
  console.log(`${name}: hits=${JSON.stringify(hits)} expected=${expect} ${((hits.length > 0) === expect) ? "OK" : "MISMATCH"}`);
};
shape("P1 mid-line Status", "**Class:** CI wiring · **Status:** CLOSED", true);
shape("P2 terminal label", "**Effort:** M. **Resolved:** by PR #700.", true);
shape("line-607 narrative REFUTED", "**Partial closure (2026-07-27):** two shipped. Details **Header-aware segmentation** — a REFUTED: claim discussion **Residuals (still open):** more", false);
shape("backticked value", "**Status:** `RESOLVED`", true);
shape("quoted example line", "`Status: CLOSED`", false);
shape("inline html island", "<strong>CLOSED</strong> by PR #1", false /* opening lane not modeled here; expect no FIELD hit */);
shape("footnote", "[^h]: **Status:** CLOSED in the predecessor.", false);
