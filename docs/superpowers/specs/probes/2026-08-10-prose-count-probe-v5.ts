/**
 * v5 — final calibration.
 * Hand classification of the v4 sample found the dominant shape-(b) FP causes to be
 * mechanical: decimal/version fragments (§12.4, 4.2, M9.5 → "2"/"4"/"5"), the ordered-list
 * marker itself ("4. **Anti-tautology rule**:"), and a list counter that over-runs the
 * enumeration into following checklist steps. v5 adds T6 (lexical guards) and T7 (list
 * counter stops at a checklist step / at a bullet that starts a new syntactic kind),
 * and re-measures. Shape (c) additionally excludes fenced lines.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseDoc, type DocModel } from "../../../../lib/specLint/parse";

const REPO = process.cwd();
const OUT = new URL(".", import.meta.url).pathname;
function walk(d: string, a: string[] = []): string[] { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith(".") || e.name === "node_modules") continue; const p = join(d, e.name); if (e.isDirectory()) walk(p, a); else if (e.isFile() && e.name.endsWith(".md")) a.push(p); } return a; }
interface Doc { rel: string; model: DocModel }
const docs: Doc[] = [...walk(join(REPO, "docs")), join(REPO, "BACKLOG.md"), join(REPO, "DEFERRED.md")].sort().map((p) => ({ rel: relative(REPO, p), model: parseDoc(readFileSync(p, "utf8")) }));
const spanRangesFor = (m: DocModel, n: number) => m.spans.filter((s) => s.line === n).map((s) => ({ start: s.column - 1, end: s.column - 1 + s.content.length }));
const inRanges = (i: number, rs: { start: number; end: number }[]) => rs.some((r) => i >= r.start && i < r.end);
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const WORD_ALT = Object.keys(WORDS).join("|");
const CARD_RE = new RegExp(String.raw`\b(\d{1,4}|${WORD_ALT})\b`, "gi");
const isPlural = (w: string) => /[a-z]s$/.test(w) && !/(ss|us|is)$/.test(w);
const BULLET = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
// checklist step / task-scaffolding bullets are NOT enumeration members
const CHECKLIST = /^\s*(?:\[[ x]\]\s*)?\*{0,2}(?:Step|Task|Substep|Phase)\s*\d|^\s*-?\s*\[[ x]\]/i;

interface Card { idx: number; end: number; raw: string; value: number; words: string[]; head: string; lexOk: boolean }
function cardinalsOn(line: string, spans: { start: number; end: number }[], isBulletMarkerEnd: number): Card[] {
  const out: Card[] = [];
  CARD_RE.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = CARD_RE.exec(line)) !== null) {
    if (inRanges(m.index, spans)) continue;
    const raw = m[1]!;
    const value = /^\d+$/.test(raw) ? Number(raw) : (WORDS[raw.toLowerCase()] ?? NaN);
    if (!Number.isFinite(value)) continue;
    const rest = line.slice(m.index + raw.length);
    if (!/^\s/.test(rest)) continue;
    const words: string[] = []; let cur = rest;
    for (let k = 0; k < 3; k++) { const w = /^[\s]+([a-zA-Z][a-zA-Z-]*)/.exec(cur); if (!w) break; words.push(w[1]!.toLowerCase()); cur = cur.slice(w[0].length); }
    if (words.length === 0) continue;
    let head = words[0]!;
    for (let k = words.length - 1; k >= 0; k--) if (isPlural(words[k]!)) { head = words[k]!; break; }
    // LEXICAL GUARDS (T6):
    const before = line.slice(0, m.index);
    const prevChar = before.slice(-1);
    const lexOk =
      prevChar !== "." &&                                  // decimal tail: "4.2", "M9.5", "§12.4"
      !/[A-Za-z0-9]$/.test(prevChar) &&                    // glued to an identifier
      !/§\s*[\d.]*$/.test(before) &&                       // section reference
      !/\b[Mm]\d*\.?$/.test(before) &&                     // milestone "M9.5"
      !(m.index <= isBulletMarkerEnd);                     // the ordered-list marker itself
    out.push({ idx: m.index, end: m.index + raw.length, raw, value, words, head, lexOk });
  }
  return out;
}
function countList(model: DocModel, start: number, stopAtChecklist: boolean) {
  const first = BULLET.exec(model.lines[start]!); if (!first) return { count: 0, items: [] as string[] };
  const indent = first[1]!.length; let count = 0, blanks = 0; const items: string[] = [];
  for (let i = start; i < model.lines.length; i++) {
    const line = model.lines[i]!;
    if (line.trim() === "") { blanks++; if (blanks >= 2) break; continue; }
    const b = BULLET.exec(line);
    if (b && b[1]!.length === indent) {
      if (stopAtChecklist && CHECKLIST.test(b[3]!)) break;   // enumeration ended; task scaffolding began
      blanks = 0; count++; items.push(b[3]!.slice(0, 60)); continue;
    }
    if (b && b[1]!.length > indent) { blanks = 0; continue; }
    if (line.match(/^(\s*)/)![1]!.length > indent) { blanks = 0; continue; }
    break;
  }
  return { count, items };
}

interface BHit { doc: string; docLine: number; raw: string; isWord: boolean; value: number; head: string; listLine: number; listCount: number; listCountStop: number; parity: string; parityStop: string; tier: number; lexOk: boolean; snippet: string; items: string[] }
const hits: BHit[] = [];
for (const doc of docs) {
  const L = doc.model.lines;
  for (let i = 0; i < L.length; i++) {
    if (doc.model.fencedInfo[i] !== undefined) continue;
    const line = L[i]!;
    const cb = BULLET.exec(line);
    const markerEnd = cb ? cb[1]!.length + cb[2]!.length : -1;
    const cards = cardinalsOn(line, spanRangesFor(doc.model, i + 1), markerEnd);
    for (let k = 0; k < cards.length; k++) {
      const a = cards[k]!;
      if (!isPlural(a.head)) continue;
      let li = -1;
      for (let d = 1; d <= 2 && i + d < L.length; d++) { const c = L[i + d]!; if (c.trim() === "") continue; if (BULLET.test(c)) li = i + d; break; }
      if (li < 0) continue;
      const plain = countList(doc.model, li, false);
      const stop = countList(doc.model, li, true);
      if (plain.count < 1) continue;
      let tier = 0;
      if (a.value >= 2 && a.value <= 40) { tier = 1;
        if (k === cards.length - 1) { tier = 2;
          if (!/[.!?](\s|$)/.test(line.slice(a.end))) { tier = 3;
            if (/:\s*$/.test(line) || line.length - a.end <= 60) { tier = 4;
              const lb = BULLET.exec(L[li]!)!;
              if (!cb || lb[1]!.length > cb[1]!.length) { tier = 5;
                if (a.lexOk) tier = 6;
              } } } } }
      hits.push({ doc: doc.rel, docLine: i + 1, raw: a.raw, isWord: !/^\d+$/.test(a.raw), value: a.value, head: a.head, listLine: li + 1, listCount: plain.count, listCountStop: stop.count, parity: plain.count === a.value ? "PARITY" : "MISMATCH", parityStop: stop.count === a.value ? "PARITY" : "MISMATCH", tier, lexOk: a.lexOk, snippet: line.slice(Math.max(0, a.idx - 80), a.idx + 130).replace(/\s+/g, " "), items: stop.items });
    }
  }
}
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);
console.log("=== SHAPE B final tiers ===");
for (let t = 4; t <= 6; t++) {
  const at = hits.filter((h) => h.tier >= t);
  console.log(`  tier>=${t}: hits=${at.length} PARITY=${at.filter(h=>h.parity==="PARITY").length} (${pct(at.filter(h=>h.parity==="PARITY").length, at.length)}) MISMATCH=${at.filter(h=>h.parity==="MISMATCH").length}`);
}
const T6 = hits.filter((h) => h.tier >= 6);
console.log(`  T6 with checklist-stop counter: PARITY=${T6.filter(h=>h.parityStop==="PARITY").length} (${pct(T6.filter(h=>h.parityStop==="PARITY").length, T6.length)}) MISMATCH=${T6.filter(h=>h.parityStop==="MISMATCH").length}`);
console.log(`  lexical guard alone removed ${hits.filter(h=>h.tier===5).length} of ${hits.filter(h=>h.tier>=5).length} T5 hits (${pct(hits.filter(h=>h.tier===5).length, hits.filter(h=>h.tier>=5).length)} were decimal/section/marker fragments)`);
const T6m = T6.filter((h) => h.parityStop === "MISMATCH");
console.log(`  T6+stop mismatch by class: specs=${T6m.filter(h=>h.doc.includes("/specs/")).length} plans=${T6m.filter(h=>h.doc.includes("/plans/")).length} filings=${T6m.filter(h=>h.doc.startsWith("docs/review-rounds/")).length} ledgers=${T6m.filter(h=>!h.doc.startsWith("docs/")).length}`);
const dh = new Map<number, number>(); for (const h of T6m) dh.set(h.listCountStop - h.value, (dh.get(h.listCountStop - h.value) ?? 0) + 1);
console.log("  delta:", [...dh].sort((a,b)=>a[0]-b[0]).map(([d,n])=>`${d>0?"+":""}${d}:${n}`).join(" "));
console.log(`  word vs digit among T6: word=${T6.filter(h=>h.isWord).length} digit=${T6.filter(h=>!h.isWord).length}`);

// ---------- SHAPE C, fenced excluded
const tok = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const jac = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };
const ISO = /\d{4}-\d{2}-\d{2}/;
const RECORD = /\b(?:R\d+|commit|round \d|verdict|duration|dispatched|status:|source:|deferred|filed|@|\$\()/i;
interface CHit { doc: string; lines: number[]; texts: string[]; nums: string[][]; sim: number }
const chits: CHit[] = []; let scanned = 0;
for (const doc of docs) {
  const cands: { line: number; text: string; toks: string[] }[] = [];
  doc.model.lines.forEach((l, i) => {
    if (doc.model.fencedInfo[i] !== undefined) return;         // prose only
    const t = l.trim().replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "");
    if (t.length < 40 || t.length > 400) return;
    if (!/\d/.test(t)) return;
    if (ISO.test(t) || RECORD.test(t)) return;
    cands.push({ line: i + 1, text: t, toks: tok(t) });
  });
  scanned += cands.length;
  const used = new Set<number>();
  for (let i = 0; i < cands.length; i++) {
    if (used.has(i)) continue;
    const g = [cands[i]!];
    for (let j = i + 1; j < cands.length; j++) { if (used.has(j)) continue; if (jac(cands[i]!.toks, cands[j]!.toks) >= 0.85 && cands[i]!.text !== cands[j]!.text) { g.push(cands[j]!); used.add(j); } }
    if (g.length < 2) continue;
    const nums = g.map((x) => x.text.match(/\d+/g) ?? []);
    if (new Set(nums.map((n) => n.join(","))).size <= 1) continue;
    used.add(i);
    chits.push({ doc: doc.rel, lines: g.map((x) => x.line), texts: g.map((x) => x.text.slice(0, 200)), nums, sim: jac(g[0]!.toks, g[1]!.toks) });
  }
}
console.log(`\n=== SHAPE C (prose only, no fenced/dated/record) ===\n  candidates=${scanned} groups=${chits.length}`);
for (const h of chits) { console.log(`   ${h.doc} lines=${h.lines.join(",")} sim=${h.sim.toFixed(2)}`); h.texts.forEach((t, i) => console.log(`      @${h.lines[i]}: ${t.slice(0, 150)}`)); }

writeFileSync(join(OUT, "v5-shapeB-T6.txt"), T6.map(h => `${h.parityStop} ${h.doc}:${h.docLine} claim=${h.raw}(${h.value}) noun=${h.head} list@${h.listLine} count=${h.listCountStop}(raw ${h.listCount})\n   TEXT: ${h.snippet}\n   ITEMS: ${h.items.map(s=>s.replace(/\s+/g," ")).join(" | ")}\n`).join("\n"));
writeFileSync(join(OUT, "v5-report.json"), JSON.stringify({ B: hits, C: chits }, null, 2));
console.log("\nwrote v5-shapeB-T6.txt, v5-report.json");
