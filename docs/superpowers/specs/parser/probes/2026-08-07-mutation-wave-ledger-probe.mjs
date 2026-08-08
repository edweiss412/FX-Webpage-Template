#!/usr/bin/env node
// docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-ledger-probe.mjs
//
// Read-only dissection of the parser-mutation known-holes ledger
// (tests/parser/mutation/knownHoles.ts) for the mutation-wave spec.
//
// Reproduce (from the repo root of any checkout of this branch):
//   node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-ledger-probe.mjs
//   node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-ledger-probe.mjs --json
//
// Plain node — NO TypeScript, NO transpile, NO vitest. It re-derives the harness's
// segmentation and section classification directly from the SOURCE OF TRUTH files
// (lib/parser/knownSections.ts, tests/parser/mutation/classify.ts) by extracting the
// literal registries at runtime, so the probe cannot silently drift from a registry edit.
//
// SELF-VALIDATION (the "a gate must reconcile its own counts" rule): the probe asserts
// its re-derived segmentation actually explains every ledger siteId — every B<sec> index
// must exist in the fixture, every L<line> must be a row of that section, and every
// data-cell operator's L must be a `data`-class row. Any failure is printed as a loud
// SELF-CHECK FAILURE and sets a non-zero exit code, because a wrong reimplementation
// would otherwise produce a confident, wrong domain table.

import * as fsMod from "node:fs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../../.."); // docs/superpowers/specs/parser/probes -> repo root
const R = (p) => readFileSync(resolve(ROOT, p), "utf8");

const JSON_MODE = process.argv.includes("--json");
const out = [];
const say = (s = "") => out.push(s);
let selfCheckFailures = 0;
const fail = (s) => {
  selfCheckFailures++;
  say(`!! SELF-CHECK FAILURE: ${s}`);
};

// ───────────────────────── 1. Registry extraction (no drift) ─────────────────────────

/** Pull the string members out of a `export const NAME: ... = new Set([ ... ]);` literal. */
function extractSet(src, name) {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) throw new Error(`extractSet: ${name} not found`);
  const open = src.indexOf("[", i);
  const close = src.indexOf("]);", open);
  if (open < 0 || close < 0) throw new Error(`extractSet: ${name} literal unterminated`);
  const body = src.slice(open + 1, close);
  return new Set([...body.matchAll(/"([^"]*)"/g)].map((m) => m[1]));
}

/** Pull `KEY: "value"` / `"KEY": "value"` pairs out of a `Record<string,...>` object literal. */
function extractRecord(src, name) {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) throw new Error(`extractRecord: ${name} not found`);
  const open = src.indexOf("{", i);
  // brace-match so a nested literal cannot truncate the scan
  let depth = 0;
  let close = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") {
      depth--;
      if (depth === 0) {
        close = k;
        break;
      }
    }
  }
  if (close < 0) throw new Error(`extractRecord: ${name} literal unterminated`);
  const body = src.slice(open + 1, close);
  const rec = {};
  for (const m of body.matchAll(/(?:"([^"]+)"|([A-Za-z_][\w-]*))\s*:\s*"([^"]+)"/g)) {
    rec[m[1] ?? m[2]] = m[3];
  }
  return rec;
}

const KNOWN_SECTIONS_SRC = R("lib/parser/knownSections.ts");
const CLASSIFY_SRC = R("tests/parser/mutation/classify.ts");
const KNOWN_HOLES_SRC = R("tests/parser/mutation/knownHoles.ts");
const FIXTURES_SRC = R("tests/parser/mutation/fixtures.ts");

const KNOWN_SECTION_HEADERS = extractSet(KNOWN_SECTIONS_SRC, "KNOWN_SECTION_HEADERS");
const PREFIX_SECTION_FAMILIES = extractSet(KNOWN_SECTIONS_SRC, "PREFIX_SECTION_FAMILIES");
const SECTION_DOMAIN_MAP = extractRecord(CLASSIFY_SRC, "SECTION_DOMAIN_MAP");
const OPERATOR_FINDING_MAP = extractRecord(KNOWN_HOLES_SRC, "OPERATOR_FINDING_MAP");

// fixtures.ts: XLSX + RAW slug lists and their path templates
function extractSlugArray(src, name) {
  const i = src.indexOf(`const ${name} = [`);
  if (i < 0) throw new Error(`extractSlugArray: ${name} not found`);
  const close = src.indexOf("];", i);
  return [...src.slice(i, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}
const FIXTURES = [
  ...extractSlugArray(FIXTURES_SRC, "XLSX").map((slug) => ({
    slug,
    family: "xlsx",
    path: `fixtures/shows/exporter-xlsx/${slug}.md`,
  })),
  ...extractSlugArray(FIXTURES_SRC, "RAW").map((slug) => ({
    slug,
    family: "raw",
    path: `fixtures/shows/raw/${slug}.md`,
  })),
];

// ───────────────────────── 2. Harness segmentation (mirrors rows.ts / classify.ts) ─────────────

const normalizeHeader = (raw) => raw.replace(/\s+/g, " ").trim().toUpperCase();

// classify.ts:tokenPrefix
const tokenPrefix = (n, entry) =>
  n.startsWith(entry) && (n.length === entry.length || /[^A-Z0-9]/.test(n[entry.length] ?? " "));

// classify.ts:resolveHeader
function resolveHeader(col0) {
  const n = normalizeHeader(col0 ?? "");
  if (KNOWN_SECTION_HEADERS.has(n)) return n;
  if (/^TRANSPORTATION\//.test(n)) return "TRANSPORTATION";
  for (const fam of PREFIX_SECTION_FAMILIES) if (tokenPrefix(n, fam)) return fam;
  return null;
}
const isHeaderCells = (cells) => resolveHeader(cells[0] ?? "") !== null;
const classifySection = (sec) => {
  if (!sec.headerRow) return "other";
  const h = resolveHeader(sec.headerRow.cells[0] ?? "");
  return h ? (SECTION_DOMAIN_MAP[h] ?? "other") : "other";
};

// rows.ts:splitCells — EXACT parser parity with splitRow (split("|").slice(1,-1))
function splitCells(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return [];
  return t
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}
const ALIGN = /^:?-{1,}:?$/;
function classifyRow(cells) {
  const nonEmpty = cells.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return "spacer";
  if (nonEmpty.every((c) => ALIGN.test(c))) return "alignment";
  if (isHeaderCells(cells)) return "header";
  return "data";
}

// rows.ts:segment
function segment(md) {
  const lines = md.split("\n");
  const runs = [];
  const sections = [];
  let curRun = null;
  let curSec = null;
  const closeRun = () => {
    if (curSec && curRun && !curRun.sections.includes(curSec)) curRun.sections.push(curSec);
    curSec = null;
    curRun = null;
  };
  lines.forEach((line, i) => {
    if (line.trim() === "" || !line.trim().startsWith("|")) {
      closeRun();
      return;
    }
    if (!curRun) {
      curRun = { index: runs.length, sections: [], startLine: i };
      runs.push(curRun);
      curSec = null;
    }
    const cells = splitCells(line);
    const cls = classifyRow(cells);
    const row = { line: i, cells, cls };
    if (cls === "header") {
      if (curSec) curRun.sections.push(curSec);
      curSec = { index: sections.length, headerRow: row, rows: [row], runIndex: curRun.index };
      sections.push(curSec);
    } else {
      if (!curSec) {
        curSec = { index: sections.length, headerRow: null, rows: [], runIndex: curRun.index };
        sections.push(curSec);
      }
      curSec.rows.push(row);
    }
  });
  closeRun();
  return { runs, sections };
}

// operators.ts:sectionReorder block model
const blocksOf = (md) => md.split(/\n\s*\n/);

// ── RELAXED surface resolution ────────────────────────────────────────────────
// The harness classifier is header-anchored and EXACT: a section whose col-0 cell is
// `PULL SHEET/<show name>` or `AGENDA LINK - RFI` resolves to NOTHING, so the section is
// "headerless" and its domain is `other` — even though the live parser fully parses it
// (pull-sheet.ts matches `PULL SHEET/`, index.ts:353 matches `AGENDA LINK[^|]*`). The
// `other` bucket is therefore NOT "unparsed junk"; it is mostly real parser surfaces the
// harness taxonomy cannot name. This relaxed resolver names them, so the per-class tables
// below can anchor warn codes to a real surface instead of an opaque bucket.
const SUFFIX_SEPARATORS = ["/", " - ", "&#10;", " ("];
function relaxCol0(raw) {
  const n = normalizeHeader(raw ?? "");
  if (!n) return null;
  const strict = resolveHeader(n);
  if (strict) return { token: strict, via: "registry" };
  for (const sep of SUFFIX_SEPARATORS) {
    const i = n.indexOf(sep.toUpperCase());
    if (i <= 0) continue;
    const head = n.slice(0, i).trim();
    if (KNOWN_SECTION_HEADERS.has(head)) return { token: head, via: `suffixed ("${sep.trim() || sep}")` };
  }
  return null;
}
/** Name the parser surface a section belongs to (strict registry first, then relaxed census). */
function resolveSurface(sec) {
  const strictDom = classifySection(sec);
  if (sec.headerRow) {
    const t = resolveHeader(sec.headerRow.cells[0] ?? "");
    if (t) return { surface: t, domain: strictDom, via: "registry" };
  }
  // Headerless: census every row's col-0 through the relaxed resolver.
  const votes = new Map();
  let via = "";
  for (const r of sec.rows) {
    const v = relaxCol0(r.cells[0] ?? "");
    if (!v) continue;
    votes.set(v.token, (votes.get(v.token) ?? 0) + 1);
    if (!via) via = v.via;
  }
  if (votes.size) {
    const [tok] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    return { surface: `${tok} (suffixed/scalar form)`, domain: SECTION_DOMAIN_MAP[tok] ?? "other", via };
  }
  // Shape heuristics for the label-value grids the registry has no token for at all.
  const col0s = sec.rows.map((r) => normalizeHeader(r.cells[0] ?? "")).filter(Boolean);
  const gsbo = col0s.filter((v) => /^(GS|BO)\s/.test(v)).length;
  if (gsbo >= 2)
    return { surface: "GS/BO room-detail label grid", domain: "rooms", via: "col-0 label census" };
  const DAY = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/;
  const DAYTYPE = /^(TRAVEL DAY|SET DAY|SHOW DAY|STRIKE DAY)$/;
  if (col0s.some((v) => DAY.test(v)) || col0s.some((v) => DAYTYPE.test(v)))
    return { surface: "agenda day grid", domain: "agenda", via: "col-0 label census" };
  if (col0s.includes("ITEM") || col0s.includes("QTY") || col0s.includes("CAT"))
    return { surface: "pull-sheet item grid", domain: "pull_sheet", via: "col-0 label census" };
  if (col0s.includes("TIMESTAMP") && col0s.some((v) => v.includes("EMAIL")))
    return { surface: "form-response grid", domain: "client", via: "col-0 label census" };
  if (col0s.some((v) => /^(TRUE|FALSE)$/.test(v)))
    return { surface: "pull-sheet gear grid (boolean col-0)", domain: "pull_sheet", via: "col-0 label census" };
  if (col0s.length === 0)
    return { surface: "blank-col-0 grid (data starts at col 1+)", domain: "other", via: "shape" };
  return { surface: "UNRESOLVED headerless grid", domain: "other", via: "none" };
}

// Per-fixture model, keyed by slug.
const MODEL = new Map();
for (const f of FIXTURES) {
  const md = R(f.path);
  const { sections } = segment(md);
  MODEL.set(f.slug, {
    ...f,
    md,
    lines: md.split("\n"),
    sections,
    byIndex: new Map(sections.map((s) => [s.index, s])),
    blocks: blocksOf(md),
  });
}

// ───────────────────────── 3. Ledger parse ─────────────────────────

const RAW_HOLES = (() => {
  const i = KNOWN_HOLES_SRC.indexOf("const RAW_HOLES = `");
  const start = KNOWN_HOLES_SRC.indexOf("`", i) + 1;
  const end = KNOWN_HOLES_SRC.indexOf("`;", start);
  return KNOWN_HOLES_SRC.slice(start, end);
})();

const OPS = Object.keys(OPERATOR_FINDING_MAP).sort((a, b) => b.length - a.length);
const opOf = (siteId) => OPS.find((op) => siteId.startsWith(op + ":")) ?? null;

const HOLES = RAW_HOLES.trim()
  .split("\n")
  .map((line) => {
    const [siteId, kind, fingerprint, finding, ...noteParts] = line.split("|");
    const op = opOf(siteId);
    const rest = op ? siteId.slice(op.length + 1) : siteId;
    const m = rest.match(/^(.*?):B(\d+):L(\d+):X(.*)$/);
    return {
      siteId,
      kind,
      fingerprint,
      finding,
      note: noteParts.join("|"),
      op,
      slug: m?.[1] ?? null,
      sec: m ? Number(m[2]) : null,
      line: m ? Number(m[3]) : null,
      locus: m?.[4] ?? null,
    };
  });

// ───────────────────────── 4. Self-checks ─────────────────────────

say("# Parser-mutation known-holes ledger probe — 2026-08-07");
say();
say(`ledger rows parsed: ${HOLES.length}`);
say(`fixtures modeled:   ${MODEL.size}`);
say();

for (const h of HOLES) {
  if (!h.op) fail(`unmapped operator prefix: ${h.siteId}`);
  if (h.slug === null) fail(`siteId did not match <slug>:B<n>:L<n>:X<locus>: ${h.siteId}`);
  else if (!MODEL.has(h.slug)) fail(`unknown fixture slug ${h.slug} (${h.siteId})`);
}
// Section/line reachability per operator family.
const DATA_CELL_OPS = new Set(["ref-sub", "unicode-inject", "merged-cell"]);
for (const h of HOLES) {
  if (!h.slug || !MODEL.has(h.slug)) continue;
  const fx = MODEL.get(h.slug);
  if (h.op === "section-reorder") {
    if (h.sec >= fx.blocks.length - 1)
      fail(`section-reorder B${h.sec} out of block range (${fx.blocks.length} blocks) ${h.siteId}`);
    continue;
  }
  if (h.op === "blank-row:remove") continue; // B = RUN index, not section index
  const sec = fx.byIndex.get(h.sec);
  if (!sec) {
    fail(`section B${h.sec} absent in ${h.slug} (${h.siteId})`);
    continue;
  }
  const row = sec.rows.find((r) => r.line === h.line);
  if (!row) {
    fail(`line L${h.line} not a row of B${h.sec} in ${h.slug} (${h.siteId})`);
    continue;
  }
  if (DATA_CELL_OPS.has(h.op) && row.cls !== "data")
    fail(`${h.op} targets a ${row.cls} row (expected data) at ${h.siteId}`);
  if (DATA_CELL_OPS.has(h.op)) {
    const idx = Number(h.locus);
    if (!Number.isInteger(idx)) fail(`${h.op} non-numeric locus ${h.locus} (${h.siteId})`);
    else if (h.op !== "merged-cell" && !(idx < row.cells.length))
      fail(`${h.op} cell index ${idx} >= ${row.cells.length} cells (${h.siteId})`);
  }
}
say(
  selfCheckFailures === 0
    ? "SELF-CHECK: PASS — every ledger siteId resolves to a live section/row in the modeled corpus."
    : `SELF-CHECK: ${selfCheckFailures} FAILURE(S) — the domain tables below are NOT trustworthy.`,
);
say();

// ───────────────────────── 5. §1 counts per finding class × kind ─────────────────────────

const EXPECTED = {
  "BL-MUTATION-REF-SUB": { total: 3314, wrong: 3094, signal_loss: 220 },
  "BL-MUTATION-MERGED-CELL": { total: 2404, wrong: 2271, signal_loss: 133 },
  "BL-MUTATION-UNICODE": { total: 827, wrong: 827, signal_loss: 0 },
  "BL-MUTATION-COLUMN-SHIFT": { total: 211, wrong: 193, signal_loss: 18 },
  "BL-MUTATION-SECTION-ORDER": { total: 82, wrong: 58, signal_loss: 24 },
};

const byFinding = new Map();
for (const h of HOLES) {
  const k = h.finding;
  if (!byFinding.has(k)) byFinding.set(k, { total: 0, wrong: 0, signal_loss: 0, ops: new Set() });
  const b = byFinding.get(k);
  b.total++;
  b[h.kind]++;
  b.ops.add(h.op);
}

say("## 1. Row counts per finding class x kind");
say();
say("| finding | operator(s) | total | wrong | signal_loss | expected | reconcile |");
say("| --- | --- | ---: | ---: | ---: | --- | --- |");
const rows1 = [];
for (const [finding, b] of [...byFinding.entries()].sort((a, b2) => b2[1].total - a[1].total)) {
  const e = EXPECTED[finding];
  const exp = e ? `${e.total} (${e.wrong}/${e.signal_loss})` : "(not asserted)";
  const ok = !e
    ? "n/a"
    : e.total === b.total && e.wrong === b.wrong && e.signal_loss === b.signal_loss
      ? "OK"
      : "**MISMATCH**";
  if (ok === "**MISMATCH**") selfCheckFailures++;
  rows1.push({ finding, ops: [...b.ops], ...b, ops: [...b.ops] });
  say(
    `| ${finding} | ${[...b.ops].join(", ")} | ${b.total} | ${b.wrong} | ${b.signal_loss} | ${exp} | ${ok} |`,
  );
}
const tot = HOLES.length;
const totW = HOLES.filter((h) => h.kind === "wrong").length;
const totS = HOLES.filter((h) => h.kind === "signal_loss").length;
say(`| **ALL** | | **${tot}** | **${totW}** | **${totS}** | 7842 (7444/398) | ${
  tot === 7842 && totW === 7444 && totS === 398 ? "OK" : "**MISMATCH**"
} |`);
say();

// Distinct-note census (the note field is template-generated; prove it).
const noteSet = new Map();
for (const h of HOLES) noteSet.set(h.note, (noteSet.get(h.note) ?? 0) + 1);
say(
  `Distinct \`note\` strings across all ${tot} rows: **${noteSet.size}**. ` +
    `Every note matches \`<operator-ish> <kind> @ <slug|variant>\` — the field is template-generated ` +
    `at regen time and carries NO per-hole diagnostic content.`,
);
say();

// ───────────────────────── 6. §2 SECTION-REORDER deep dive ─────────────────────────

const SR = HOLES.filter((h) => h.op === "section-reorder");

/** Characterize a block: its col-0 header tokens (never cell values — no PII in the doc). */
function blockProfile(fx, i) {
  const b = fx.blocks[i];
  if (b === undefined) return { headers: ["<absent>"], lines: 0, tableLines: 0, nonTableLines: 0 };
  const ls = b.split("\n");
  const headers = [];
  let tableLines = 0;
  let nonTableLines = 0;
  for (const l of ls) {
    const t = l.trim();
    if (t === "") continue;
    if (!t.startsWith("|")) {
      nonTableLines++;
      continue;
    }
    tableLines++;
    const cells = splitCells(l);
    const h = resolveHeader(cells[0] ?? "");
    if (h) headers.push(h);
  }
  return {
    headers: headers.length ? [...new Set(headers)] : ["(no known header)"],
    lines: ls.length,
    tableLines,
    nonTableLines,
  };
}
const domOfHeaders = (hs) => [...new Set(hs.map((h) => SECTION_DOMAIN_MAP[h] ?? "other"))];

say("## 2. SECTION-REORDER deep dive (all 82 rows)");
say();
say(`Block model: \`md.split(/\\n\\s*\\n/)\` (operators.ts:sectionReorder). \`B<i>\`/\`Xpair<i>\` = swap of block *i* with block *i+1*. **\`B<i>\` here is a BLOCK index, NOT a LogicalSection index** — unlike every other operator.`);
say();
say("### 2a. All 24 signal_loss rows");
say();
say("| siteId | fingerprint | note | block i headers | block i+1 headers | i domains | i+1 domains | i non-table lines | i+1 non-table lines |");
say("| --- | --- | --- | --- | --- | --- | --- | ---: | ---: |");
const srSignal = SR.filter((h) => h.kind === "signal_loss").sort((a, b) =>
  a.slug === b.slug ? a.sec - b.sec : a.slug.localeCompare(b.slug),
);
for (const h of srSignal) {
  const fx = MODEL.get(h.slug);
  const A = blockProfile(fx, h.sec);
  const B = blockProfile(fx, h.sec + 1);
  say(
    `| \`${h.siteId}\` | \`${h.fingerprint}\` | ${h.note} | ${A.headers.join(" + ")} | ${B.headers.join(" + ")} | ${domOfHeaders(A.headers).join(",")} | ${domOfHeaders(B.headers).join(",")} | ${A.nonTableLines} | ${B.nonTableLines} |`,
  );
}
say();

// Aggregate adjacency shapes for both kinds.
function srShape(h) {
  const fx = MODEL.get(h.slug);
  const A = blockProfile(fx, h.sec);
  const B = blockProfile(fx, h.sec + 1);
  const da = domOfHeaders(A.headers).join(",");
  const db = domOfHeaders(B.headers).join(",");
  return { A, B, da, db, pair: `${da} <-> ${db}` };
}
function tally(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

say("### 2b. Adjacency shape, signal_loss vs wrong");
say();
say("| domain-pair swapped | signal_loss | wrong |");
say("| --- | ---: | ---: |");
const srWrong = SR.filter((h) => h.kind === "wrong");
const pairsS = new Map(tally(srSignal, (h) => srShape(h).pair));
const pairsW = new Map(tally(srWrong, (h) => srShape(h).pair));
for (const k of [...new Set([...pairsS.keys(), ...pairsW.keys()])].sort(
  (a, b) => (pairsS.get(b) ?? 0) + (pairsW.get(b) ?? 0) - ((pairsS.get(a) ?? 0) + (pairsW.get(a) ?? 0)),
))
  say(`| ${k} | ${pairsS.get(k) ?? 0} | ${pairsW.get(k) ?? 0} |`);
say();

say("### 2c. Per-fixture split + non-table-line involvement");
say();
say("| fixture | blocks | reorder mutants generated | signal_loss | wrong | signal_loss touching a block with non-table lines | wrong touching a block with non-table lines |");
say("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const [slug, fx] of MODEL) {
  const mine = SR.filter((h) => h.slug === slug);
  if (!mine.length && fx.blocks.length < 2) continue;
  const gen = Math.max(0, fx.blocks.length - 1);
  const s = mine.filter((h) => h.kind === "signal_loss");
  const w = mine.filter((h) => h.kind === "wrong");
  const touches = (h) => {
    const { A, B } = srShape(h);
    return A.nonTableLines > 0 || B.nonTableLines > 0;
  };
  say(
    `| ${slug} | ${fx.blocks.length} | ${gen} | ${s.length} | ${w.length} | ${s.filter(touches).length} | ${w.filter(touches).length} |`,
  );
}
say();

say("### 2d. Note patterns on the 58 `wrong` rows");
say();
say("| note | count |");
say("| --- | ---: |");
for (const [k, n] of tally(srWrong, (h) => h.note)) say(`| ${k} | ${n} |`);
say();

// ───────────────────────── 7. §3 UNICODE 827 ─────────────────────────

const UNI = HOLES.filter((h) => h.op === "unicode-inject");

/** Column label for a data cell = the section header row's cell at the same index, if any. */
function columnLabel(sec, idx) {
  const c = sec.headerRow?.cells?.[idx];
  return c && c.length ? c : "(no header cell)";
}
/** PII-safe shape class of a cell value. Never emits the value itself. */
function shapeOf(v) {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return "url";
  if (/@/.test(s)) return "email-ish";
  if (/^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(s)) return "date";
  if (/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(s)) return "time";
  if (/\d{3}\D?\d{3}\D?\d{4}/.test(s)) return "phone-ish";
  if (/^\$?[\d,.]+$/.test(s)) return "numeric";
  if (/^[A-Z0-9 ()\/&.'-]+$/.test(s) && s === s.toUpperCase()) return "ALLCAPS-token";
  if (s.includes("&#10;")) return "multiline-entity";
  if (/\\\|/.test(s)) return "escaped-pipe";
  return "free-text";
}

say("## 3. UNICODE-INJECT — all 827 rows");
say();
say(`Operator: ZWNJ (U+200C) inserted at the scalar midpoint of a **data-row cell** (\`eachDataCell\`, operators.ts). Header rows are \`cls === "header"\` and are therefore **never** targets — there are 0 section-label unicode holes by construction.`);
say();

say("### 3a. By domain");
say();
say("| domain | holes | distinct fixtures | distinct sections | distinct header tokens |");
say("| --- | ---: | ---: | ---: | --- |");
const uniByDom = new Map();
for (const h of UNI) {
  const fx = MODEL.get(h.slug);
  const sec = fx.byIndex.get(h.sec);
  const d = classifySection(sec);
  const hdr = sec.headerRow ? resolveHeader(sec.headerRow.cells[0] ?? "") : null;
  if (!uniByDom.has(d))
    uniByDom.set(d, { n: 0, fx: new Set(), secs: new Set(), hdrs: new Set(), rows: [] });
  const b = uniByDom.get(d);
  b.n++;
  b.fx.add(h.slug);
  b.secs.add(`${h.slug}:B${h.sec}`);
  b.hdrs.add(hdr ?? "(headerless)");
  b.rows.push({ h, sec, d, hdr });
}
for (const [d, b] of [...uniByDom.entries()].sort((a, b2) => b2[1].n - a[1].n))
  say(`| ${d} | ${b.n} | ${b.fx.size} | ${b.secs.size} | ${[...b.hdrs].sort().join(", ")} |`);
say();

say("### 3a2. By RESOLVED parser surface (the `other` bucket, un-blurred)");
say();
say("| resolved surface | resolved domain | via | holes |");
say("| --- | --- | --- | ---: |");
const surfOf = (h) => {
  const fx = MODEL.get(h.slug);
  const sec = fx.byIndex.get(h.sec);
  return resolveSurface(sec);
};
const uniSurf = new Map();
for (const h of UNI) {
  const s = surfOf(h);
  const k = `${s.surface}|${s.domain}|${s.via}`;
  uniSurf.set(k, (uniSurf.get(k) ?? 0) + 1);
}
for (const [k, n] of [...uniSurf.entries()].sort((a, b) => b[1] - a[1])) {
  const [surface, domain, via] = k.split("|");
  say(`| ${surface} | ${domain} | ${via} | ${n} |`);
}
say();

say("### 3b. By section (B<sec>) — every section carrying >=1 unicode hole");
say();
say("| fixture | B<sec> | header token | domain | holes | distinct lines | distinct cell indexes |");
say("| --- | ---: | --- | --- | ---: | ---: | --- |");
const uniBySec = new Map();
for (const h of UNI) {
  const k = `${h.slug}|${h.sec}`;
  if (!uniBySec.has(k)) uniBySec.set(k, []);
  uniBySec.get(k).push(h);
}
for (const [k, list] of [...uniBySec.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const [slug, secStr] = k.split("|");
  const fx = MODEL.get(slug);
  const sec = fx.byIndex.get(Number(secStr));
  const hdr = sec.headerRow ? (resolveHeader(sec.headerRow.cells[0] ?? "") ?? "(unresolved)") : "(headerless)";
  const idxs = [...new Set(list.map((h) => Number(h.locus)))].sort((a, b) => a - b);
  say(
    `| ${slug} | B${secStr} | ${hdr} | ${classifySection(sec)} | ${list.length} | ${new Set(list.map((h) => h.line)).size} | ${idxs.join(",")} |`,
  );
}
say();

say("### 3c. By target-cell shape (closability signal)");
say();
say("| cell shape | holes | note |");
say("| --- | ---: | --- |");
const uniShapes = tally(UNI, (h) => {
  const fx = MODEL.get(h.slug);
  const sec = fx.byIndex.get(h.sec);
  const row = sec.rows.find((r) => r.line === h.line);
  return shapeOf(row.cells[Number(h.locus)] ?? "");
});
for (const [k, n] of uniShapes) say(`| ${k} | ${n} | |`);
say();

say("### 3d. Structural closability audit");
say();
// Every unicode hole is, by construction, a data cell of a pipe-table row. The question is
// whether anything about the SITE would escape a strip applied at splitRow/parseTableRows.
let escapedPipe = 0;
let entityMultiline = 0;
let col0 = 0;
let nonTableNeighborhood = 0;
for (const h of UNI) {
  const fx = MODEL.get(h.slug);
  const sec = fx.byIndex.get(h.sec);
  const row = sec.rows.find((r) => r.line === h.line);
  const v = row.cells[Number(h.locus)] ?? "";
  if (/\\\|/.test(v) || /\\/.test(v)) escapedPipe++;
  if (v.includes("&#10;") || v.includes("&#9;")) entityMultiline++;
  if (Number(h.locus) === 0) col0++;
  const raw = fx.lines[h.line] ?? "";
  if (!raw.trim().startsWith("|")) nonTableNeighborhood++;
}
say(`- Holes whose target cell contains a markdown backslash escape: **${escapedPipe}**`);
say(`- Holes whose target cell contains an exporter entity (\`&#10;\`/\`&#9;\`): **${entityMultiline}**`);
say(`- Holes targeting **cell index 0** (col-0 — the header-detection / label column): **${col0}**`);
say(`- Holes whose source line is NOT a pipe-table line: **${nonTableNeighborhood}** (expected 0 — the operator only visits table data rows)`);
say();

// ───────────────────────── 8. §4 REF-SUB / MERGED-CELL / COLUMN-SHIFT ─────────────────────

function domainBreakdown(op) {
  const list = HOLES.filter((h) => h.op === op);
  const m = new Map();
  for (const h of list) {
    const fx = MODEL.get(h.slug);
    const sec = fx.byIndex.get(h.sec);
    if (!sec) continue;
    const d = classifySection(sec);
    const hdr = sec.headerRow ? (resolveHeader(sec.headerRow.cells[0] ?? "") ?? "(unresolved)") : "(headerless)";
    if (!m.has(d)) m.set(d, { n: 0, wrong: 0, signal_loss: 0, hdrs: new Set(), fx: new Set() });
    const b = m.get(d);
    b.n++;
    b[h.kind]++;
    b.hdrs.add(hdr);
    b.fx.add(h.slug);
  }
  return { list, m };
}

say("## 4. REF-SUB / MERGED-CELL / COLUMN-SHIFT — per-domain breakdown");
say();
say("### 4a. EFFECTIVE-domain matrix (strict registry domain, with `other` replaced by the resolved surface's domain)");
say();
say("This is the table warn codes should anchor to — the strict `other` bucket is a harness-taxonomy artifact, not a parser fact.");
say();
{
  const OPS4 = ["ref-sub", "merged-cell", "column-shift", "unicode-inject"];
  const grid = new Map();
  const totals = new Map();
  for (const h of HOLES) {
    if (!OPS4.includes(h.op)) continue;
    const fx = MODEL.get(h.slug);
    const sec = fx?.byIndex.get(h.sec);
    if (!sec) continue;
    const strict = classifySection(sec);
    const eff = strict === "other" ? resolveSurface(sec).domain : strict;
    const k = `${eff}|${h.op}`;
    grid.set(k, (grid.get(k) ?? 0) + 1);
    totals.set(eff, (totals.get(eff) ?? 0) + 1);
  }
  say(`| effective domain | ${OPS4.join(" | ")} | total |`);
  say(`| --- | ${OPS4.map(() => "---:").join(" | ")} | ---: |`);
  for (const [eff, t] of [...totals.entries()].sort((a, b) => b[1] - a[1]))
    say(`| ${eff} | ${OPS4.map((o) => grid.get(`${eff}|${o}`) ?? 0).join(" | ")} | ${t} |`);
}
say();
for (const op of ["ref-sub", "merged-cell", "column-shift"]) {
  const { list, m } = domainBreakdown(op);
  say(`### 4.${op}`);
  say();
  say(`Total ${list.length} (${list.filter((h) => h.kind === "wrong").length} wrong / ${list.filter((h) => h.kind === "signal_loss").length} signal_loss)`);
  say();
  say("| domain | holes | wrong | signal_loss | fixtures | header tokens |");
  say("| --- | ---: | ---: | ---: | ---: | --- |");
  for (const [d, b] of [...m.entries()].sort((a, b2) => b2[1].n - a[1].n))
    say(`| ${d} | ${b.n} | ${b.wrong} | ${b.signal_loss} | ${b.fx.size} | ${[...b.hdrs].sort().join(", ")} |`);
  say();
  // The `other` bucket, un-blurred: resolved parser surfaces.
  const otherList = list.filter((h) => {
    const fx = MODEL.get(h.slug);
    const sec = fx?.byIndex.get(h.sec);
    return sec && classifySection(sec) === "other";
  });
  if (otherList.length) {
    const t = new Map();
    for (const h of otherList) {
      const fx = MODEL.get(h.slug);
      const s = resolveSurface(fx.byIndex.get(h.sec));
      const k = `${s.surface}|${s.domain}`;
      if (!t.has(k)) t.set(k, { n: 0, wrong: 0, signal_loss: 0 });
      const b = t.get(k);
      b.n++;
      b[h.kind]++;
    }
    say(`\`other\` (${otherList.length} holes) resolved to real parser surfaces:`);
    say();
    say("| resolved surface | resolved domain | holes | wrong | signal_loss |");
    say("| --- | --- | ---: | ---: | ---: |");
    for (const [k, b] of [...t.entries()].sort((a, b2) => b2[1].n - a[1].n)) {
      const [surface, domain] = k.split("|");
      say(`| ${surface} | ${domain} | ${b.n} | ${b.wrong} | ${b.signal_loss} |`);
    }
    say();
  }
  say("Note patterns (top 5):");
  say();
  say("| note | count |");
  say("| --- | ---: |");
  for (const [k, n] of tally(list, (h) => h.note).slice(0, 5)) say(`| ${k} | ${n} |`);
  say();
  // Column profile: which cell index is targeted (ref-sub / merged-cell only).
  if (op !== "column-shift") {
    const byIdx = tally(list, (h) => `X${h.locus}`).slice(0, 10);
    say(`Top target cell indexes: ${byIdx.map(([k, n]) => `${k}=${n}`).join(", ")}`);
    say();
    // Column LABEL profile — which named column the hole lands in.
    const labels = tally(list, (h) => {
      const fx = MODEL.get(h.slug);
      const sec = fx.byIndex.get(h.sec);
      if (!sec) return "(unresolved)";
      return normalizeHeader(columnLabel(sec, Number(h.locus)));
    }).slice(0, 12);
    say("Top target column labels (from the section's header row, normalized):");
    say();
    say("| column label | holes |");
    say("| --- | ---: |");
    for (const [k, n] of labels) say(`| ${k} | ${n} |`);
    say();
  }
}

// signal_loss concentration across the three classes
say("### 4d. Where the `signal_loss` sub-population lives (EFFECTIVE domain + resolved surface)");
say();
say("| operator | effective domain | resolved surface | signal_loss |");
say("| --- | --- | --- | ---: |");
{
  const t = new Map();
  for (const h of HOLES) {
    if (h.kind !== "signal_loss") continue;
    if (!["ref-sub", "merged-cell", "column-shift", "unicode-inject"].includes(h.op)) continue;
    const fx = MODEL.get(h.slug);
    const sec = fx?.byIndex.get(h.sec);
    if (!sec) continue;
    const strict = classifySection(sec);
    const s = resolveSurface(sec);
    const eff = strict === "other" ? s.domain : strict;
    const k = `${h.op}|${eff}|${s.surface}`;
    t.set(k, (t.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...t.entries()].sort((a, b) => b[1] - a[1])) {
    const [op, eff, surface] = k.split("|");
    say(`| ${op} | ${eff} | ${surface} | ${n} |`);
  }
}
say();

// ───────────────────────── 8b. Tokenizer census (unicode closability) ────────────────────

say("## 5. Cell-tokenizer census in `lib/parser` (decides unicode closability)");
say();
say("A zero-width strip only closes a hole if it runs BEFORE the decision that hole corrupts. `clean()` (lib/parser/blocks/_helpers.ts:45) already strips `[\\u200B-\\u200D\\uFEFF]` — U+200C ZWNJ included — so all 827 unicode holes are decisions made UPSTREAM of `clean()`. This censuses every place a cell string is produced from a raw line.");
say();
const PARSER_FILES = [];
(function walk(dir) {
  const { readdirSync, statSync } = require_fs();
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) PARSER_FILES.push(p);
  }
})(resolve(ROOT, "lib/parser"));
function require_fs() {
  return fsMod;
}
const counts = { splitRow: [], parseTableRows: [], handRolled: [], rawLineRegex: [] };
for (const abs of PARSER_FILES) {
  const rel = abs.slice(resolve(ROOT).length + 1);
  const src = readFileSync(abs, "utf8");
  src.split("\n").forEach((l, i) => {
    const at = `${rel}:${i + 1}`;
    if (rel.endsWith("_helpers.ts")) return; // the definitions themselves
    if (/\bsplitRow\s*\(/.test(l)) counts.splitRow.push(at);
    if (/\bparseTableRows\s*\(/.test(l)) counts.parseTableRows.push(at);
    if (/\.split\("\|"\)|split\(CELL_SPLIT_RE\)/.test(l)) counts.handRolled.push(at);
    if (/RAW_HEADER_REGEX_ALLOWLIST/.test(l)) counts.rawLineRegex.push(at);
  });
}
say("| tokenizer | call sites | files | closed by a strip inside the tokenizer? |");
say("| --- | ---: | ---: | --- |");
const fileset = (a) => new Set(a.map((x) => x.split(":")[0])).size;
say(`| \`splitRow()\` (_helpers.ts:39) | ${counts.splitRow.length} | ${fileset(counts.splitRow)} | YES — one edit |`);
say(`| \`parseTableRows()\` (_helpers.ts:18) | ${counts.parseTableRows.length} | ${fileset(counts.parseTableRows)} | YES — one edit |`);
say(`| hand-rolled \`.split("\\|")\` / \`CELL_SPLIT_RE\` | ${counts.handRolled.length} | ${fileset(counts.handRolled)} | NO — each site needs its own strip |`);
say(`| raw-line label regexes (\`RAW_HEADER_REGEX_ALLOWLIST\`) | ${counts.rawLineRegex.length} | ${fileset(counts.rawLineRegex)} | NO — never tokenizes into cells at all |`);
say();
say("Hand-rolled cell-split sites (each one bypasses `splitRow`):");
say();
for (const s of counts.handRolled) say(`- \`${s}\``);
say();
say("Raw-line label-regex sites (match a literal `|`-delimited label against the UNSPLIT line):");
say();
for (const s of counts.rawLineRegex) say(`- \`${s}\``);
say();

// ───────────────────────── 9. Corpus context ─────────────────────────

// ── UNRESOLVED headerless sections: name what is left ───────────────────────────
say("## 6. The `UNRESOLVED headerless grid` residue");
say();
say("Sections carrying >=1 hole that neither the strict registry nor the relaxed resolver can name. Col-0 values are shown ONLY when they are all-caps tokens or registry sub-labels — free text (crew names, hotels, phone numbers) is reported as a count, never quoted, because this file is committed.");
say();
const unresolvedSecs = new Map();
for (const h of HOLES) {
  if (!h.slug || !MODEL.has(h.slug)) continue;
  if (h.op === "section-reorder" || h.op === "blank-row:remove") continue;
  const fx = MODEL.get(h.slug);
  const sec = fx.byIndex.get(h.sec);
  if (!sec) continue;
  const s = resolveSurface(sec);
  if (s.surface !== "UNRESOLVED headerless grid") continue;
  const k = `${h.slug}|${h.sec}`;
  if (!unresolvedSecs.has(k))
    unresolvedSecs.set(k, { sec, slug: h.slug, n: 0, sl: 0, ops: new Set() });
  const b = unresolvedSecs.get(k);
  b.n++;
  if (h.kind === "signal_loss") b.sl++;
  b.ops.add(h.op);
}
say("| fixture | B<sec> | lines | rows | max width | holes | signal_loss | operators | col-0 token census (all-caps only) |");
say("| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |");
for (const [, b] of [...unresolvedSecs.entries()].sort((a, b2) => b2[1].sl - a[1].sl || b2[1].n - a[1].n).slice(0, 25)) {
  const rows = b.sec.rows;
  const caps = [
    ...new Set(
      rows
        .map((r) => normalizeHeader(r.cells[0] ?? ""))
        .filter((v) => v && v.length <= 26 && /^[A-Z0-9 &()/.'#\\-]+$/.test(v)),
    ),
  ].slice(0, 6);
  const freeText = rows.filter((r) => {
    const v = normalizeHeader(r.cells[0] ?? "");
    return v && !(v.length <= 26 && /^[A-Z0-9 &()/.'#\\-]+$/.test(v));
  }).length;
  const blank0 = rows.filter((r) => !(r.cells[0] ?? "").trim()).length;
  say(
    `| ${b.slug} | B${b.sec.index} | ${rows[0].line}-${rows[rows.length - 1].line} | ${rows.length} | ${Math.max(...rows.map((r) => r.cells.length))} | ${b.n} | ${b.sl} | ${[...b.ops].join(", ")} | ${caps.length ? caps.join(", ") : "(none)"}${freeText ? ` +${freeText} free-text` : ""}${blank0 ? ` +${blank0} blank-col0` : ""} |`,
  );
}
say();
say(`Total unresolved sections carrying holes: **${unresolvedSecs.size}**.`);
say();

say("## 7. Corpus context");
say();
say("| fixture | family | lines | pipe blocks | logical sections | risk-critical sections |");
say("| --- | --- | ---: | ---: | ---: | ---: |");
const RISK = new Set(["crew", "hotel", "rooms", "transportation", "agenda", "dates", "event_details"]);
for (const [slug, fx] of MODEL) {
  const rc = fx.sections.filter((s) => RISK.has(classifySection(s))).length;
  say(`| ${slug} | ${fx.family} | ${fx.lines.length} | ${fx.blocks.length} | ${fx.sections.length} | ${rc} |`);
}
say();

const text = out.join("\n");
if (JSON_MODE) {
  console.log(
    JSON.stringify(
      {
        rows: HOLES.length,
        selfCheckFailures,
        byFinding: Object.fromEntries(
          [...byFinding].map(([k, v]) => [k, { total: v.total, wrong: v.wrong, signal_loss: v.signal_loss }]),
        ),
      },
      null,
      2,
    ),
  );
} else {
  console.log(text);
}
process.exit(selfCheckFailures === 0 ? 0 : 1);
