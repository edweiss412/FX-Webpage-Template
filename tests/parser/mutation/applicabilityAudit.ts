// tests/parser/mutation/applicabilityAudit.ts
import { normalizeHeader, KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES } from "@/lib/parser/knownSections";

// --- own minimal, independent header/domain resolution (NOT imported from classify.ts) ---
const DOMAIN_OF: Record<string, string> = {
  CREW: "crew", TECH: "crew", HOTEL: "hotel", HOTELS: "hotel", "HOTEL RESERVATIONS": "hotel",
  "HOTEL RESERVATION": "hotel", "HOTEL STAYS": "hotel", "HOTEL STAY": "hotel",
  "GENERAL SESSION": "rooms", BREAKOUT: "rooms", BREAKOUTS: "rooms", "ADDITIONAL ROOM": "rooms",
  "LUNCH ROOM": "rooms", "LUNCH SESSION": "rooms", FOYER: "rooms",
  "EVENT DETAILS": "event_details", DETAILS: "event_details", "GS DETAILS": "event_details",
  TRANSPORTATION: "transportation", DATES: "dates", AGENDA: "agenda", "AGENDA LINK": "agenda",
  VENUE: "venue", VENUES: "venue", DRESS: "dress", "IN HOUSE AV": "contacts", CLIENT: "client",
  "PULL SHEET": "pull_sheet", COI: "documents", "DOCUMENT FOLDER LINK": "documents",
};
function resolve(col0: string): string | null {
  const n = normalizeHeader(col0);
  if (KNOWN_SECTION_HEADERS.has(n)) return n;
  if (/^TRANSPORTATION\//.test(n)) return "TRANSPORTATION"; // v4 slash header (transport.ts:170) — independent mirror, plan-R11
  for (const fam of PREFIX_SECTION_FAMILIES)
    if (n.startsWith(fam) && (n.length === fam.length || /[^A-Z0-9]/.test(n[fam.length] ?? " "))) return fam;
  return null;
}
// EXACT parser parity (splitRow): split on raw pipe, drop framing via slice(1,-1) — so a
// missing trailing pipe drops the final cell, identical to parseSheet (plan-R13).
const cellsOf = (line: string) => line.trim().split("|").slice(1, -1).map((c) => c.trim());
const ALIGN = /^:?-{1,}:?$/;
const rowClass = (cells: string[]): "header" | "alignment" | "spacer" | "data" => {
  const ne = cells.filter((c) => c);
  if (ne.length === 0) return "spacer";
  if (ne.every((c) => ALIGN.test(c))) return "alignment";
  if (resolve(cells[0] ?? "")) return "header";
  return "data";
};

type Sec = { domain: string; headerToken: string | null; dataRows: string[][]; runIndex: number };
function sections(md: string): Sec[] {
  const out: Sec[] = [];
  let cur: Sec | null = null, runIndex = -1, inRun = false;
  for (const line of md.split("\n")) {
    if (line.trim() === "" || !line.trim().startsWith("|")) { cur = null; inRun = false; continue; }
    if (!inRun) { inRun = true; runIndex++; }
    const cells = cellsOf(line), cls = rowClass(cells);
    if (cls === "header") { cur = { domain: DOMAIN_OF[resolve(cells[0]!)!] ?? "other", headerToken: (cells[0] ?? "").trim(), dataRows: [], runIndex }; out.push(cur); }
    else if (cls === "data") { if (!cur) { cur = { domain: "other", headerToken: null, dataRows: [], runIndex }; out.push(cur); } cur.dataRows.push(cells); }
  }
  return out;
}

/**
 * Independently replicate the operator's header-typo eligibility guard (plan-R4):
 * ≥2 chars, an adjacent distinct pair exists, and the transposition is NOT itself a
 * recognized header. Kept minimal + local so the audit stays implementation-independent
 * of operators.ts while counting the SAME eligible sites for exact agreement.
 */
function typoEligible(token: string): boolean {
  const chars = [...token];
  if (chars.length < 2) return false;
  let pos = -1;
  for (let i = 0; i < chars.length - 1; i++) if (chars[i] !== chars[i + 1]) { pos = i; break; }
  if (pos < 0) return false;
  [chars[pos], chars[pos + 1]] = [chars[pos + 1]!, chars[pos]!];
  return resolve(chars.join("")) === null; // transposed token must not be a real header
}

/** Independent site counts per `${op}|${domain}` from raw markdown (covers ALL 7 corrupting ops, plan-R1). */
export function auditSites(md: string): Map<string, number> {
  const m = new Map<string, number>();
  const bump = (op: string, domain: string, n = 1) => m.set(`${op}|${domain}`, (m.get(`${op}|${domain}`) ?? 0) + n);
  const secs = sections(md);
  for (const s of secs) {
    if (s.headerToken && typoEligible(s.headerToken)) bump("header-typo", s.domain); // exact typo-eligible count (plan-R4)
    for (const row of s.dataRows) {
      const cells = row.filter((c) => c.length > 0);
      // ref-sub excludes cells already `#REF!` (no-op parity with the operator, plan-R18);
      // unicode-inject keeps them (injecting a ZWNJ into `#REF!` IS a real, non-identical change).
      bump("ref-sub", s.domain, cells.filter((c) => c.trim() !== "#REF!").length);
      bump("unicode-inject", s.domain, cells.filter((c) => [...c].length >= 2).length);
      if (row.length >= 3) bump("merged-cell", s.domain, row.length - 1); // one per interior pipe (plan-R5)
    }
    if (s.dataRows.length >= 1) bump("column-shift", s.domain);
    if (s.dataRows.length >= 2) bump("blank-row:inject", s.domain, s.dataRows.length - 1); // one per gap (plan-R3)
  }
  // blank-row:remove — one boundary site per adjacent run pair; credited to EACH adjacent
  // section's domain (the last section of run i and the first of run i+1).
  const firstOfRun = new Map<number, Sec>(), lastOfRun = new Map<number, Sec>();
  for (const s of secs) { if (!firstOfRun.has(s.runIndex)) firstOfRun.set(s.runIndex, s); lastOfRun.set(s.runIndex, s); }
  const runs = [...new Set(secs.map((s) => s.runIndex))].sort((a, b) => a - b);
  for (let i = 0; i < runs.length - 1; i++) {
    const a = lastOfRun.get(runs[i]!)!, b = firstOfRun.get(runs[i + 1]!)!;
    bump("blank-row:remove", a.domain);
    if (b.domain !== a.domain) bump("blank-row:remove", b.domain);
  }
  return m;
}

/** The 7 risk-critical domains — DUPLICATED here (not imported from classify.ts) so this
 *  audit's domain-presence view is independent of the shared classifier (plan-R10). */
const RISK_CRITICAL_AUDIT: ReadonlySet<string> = new Set([
  "crew", "hotel", "rooms", "transportation", "agenda", "dates", "event_details",
]);

/** Risk-critical domains the INDEPENDENT scan finds present (≥1 section), regardless of
 *  whether any operator has a site there — the reference for "present but inapplicable". */
export function auditPresentRiskCritical(md: string): Set<string> {
  const s = new Set<string>();
  for (const sec of sections(md)) if (RISK_CRITICAL_AUDIT.has(sec.domain)) s.add(sec.domain);
  return s;
}

/** Independently-derived expected `skippedInapplicable(md, op)`: every present risk-critical
 *  domain with ZERO audit sites for `op`. If the shared classifier regresses and drops a
 *  present domain, the shared `skippedInapplicable` omits it while THIS still lists it →
 *  the driver's equality assertion fails (plan-R10). Includes zero-site domains by design. */
export function expectedSkipped(md: string, op: string): string[] {
  const sites = auditSites(md);
  return [...auditPresentRiskCritical(md)].filter((d) => (sites.get(`${op}|${d}`) ?? 0) === 0).sort();
}

/**
 * EXACT counts HAND-DERIVED from the fixture markdown (plan-R7/R9). The `count` for each row
 * is obtained by a human OPENING the fixture at the cited `lines` range, reading the section,
 * and counting the operator's applicable sites BY HAND — it is NOT copied from `auditSites`
 * output (that would make this guard circular: a miscounting audit could preserve its own bad
 * number, plan-R9). The test asserts `auditSites(...) === count` exactly, so a hand-count that
 * disagrees with the audit means the AUDIT is wrong and must be fixed — never adjust `count` to
 * match the code. The `lines` field is provenance: it forces the derivation to be reproducible
 * and makes a lazy copy-from-code visible in review. MUST cover every corrupting operator + the
 * required rows the structural gate checks: ref-sub×hotel, merged-cell×hotel, ref-sub×crew, one
 * header-typo, one blank-row:remove. (The `HAND_FIXTURE` test above is the separate, fully
 * self-contained external oracle; this table extends that guarantee onto the real corpus.)
 */
export const GOLDEN_INVENTORY: Array<{ fixture: string; op: string; domain: string; count: number; lines: string }> = [
  // Every `count` is a real HAND-COUNT against the fixture excerpt at `lines` (Step 3b), NOT pasted
  // from auditSites. `lines` is a concrete `<start>-<end>` range (the provenance test enforces the
  // shape AND that auditSites(excerpt)===count). The rows below are the author's hand-count; the
  // implementer RE-VERIFIES each against `auditSites(sliceLines(fixture, lines))` before the green
  // run — the localization test is the arbiter, and per plan-R9 a disagreement means the AUDIT is
  // wrong (fix auditSites), never adjust the count to match code.
  //
  // consultants CREW section — header L69, six data rows L70-75, spacer L76; each data row has 3
  // non-empty cells (name / role / phone; col0 + trailing col empty):
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "ref-sub", domain: "crew", count: 18, lines: "69-76" }, // 6 rows × 3 cells
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "unicode-inject", domain: "crew", count: 18, lines: "69-76" }, // all 3 cells ≥2 scalars
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "merged-cell", domain: "crew", count: 24, lines: "69-76" }, // 6 rows × (5 cells − 1)
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "column-shift", domain: "crew", count: 1, lines: "69-76" }, // 1 per section w/ ≥1 data row
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "header-typo", domain: "crew", count: 1, lines: "69-76" }, // CREW header, typo-eligible
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "blank-row:inject", domain: "crew", count: 5, lines: "69-76" }, // 6 data rows → 5 gaps
  // consultants DRESS-run → TRANSPORTATION-run boundary (blank L79):
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", op: "blank-row:remove", domain: "transportation", count: 1, lines: "77-80" }, // one inter-run boundary
  // rpas HOTEL section — header L43, alignment L44, 13 data rows L45-57 (L58 is blank, L59 starts the
  // separate "HOTELS FOR DOUG'S DRIVE BACK" section); each data row has 4 non-empty cells (Codex R27):
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", op: "ref-sub", domain: "hotel", count: 52, lines: "43-57" }, // 13 rows × 4 cells
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", op: "merged-cell", domain: "hotel", count: 52, lines: "43-57" }, // 13 rows × (5 cells − 1)
];
