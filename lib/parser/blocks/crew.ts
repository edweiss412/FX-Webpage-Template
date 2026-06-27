/**
 * CREW block parser (§2.4, §6.6).
 *
 * Returns an array of CrewMemberRow parsed from the CREW (or TECH) block
 * in the markdown sheet. Personalization signals are extracted via
 * lib/parser/personalization.ts.
 *
 * Column layouts (verified against corpus):
 *   v4 (2026+): | CREW | NAME | ROLE | PHONE | EMAIL | [extra] |
 *   v2 (2025):  | CREW | NAME | ROLE | PHONE | (notes or EMAIL) |
 *   v1 (2024-05 only): TECH header, NAME+ROLE merged in col 0
 */

import type { CrewMemberRow, ParseWarning } from "../types";
import type { ParseAggregator } from "@/lib/parser/warnings";
import { clean, presence } from "./_helpers";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { emitFieldUnreadable } from "@/lib/parser/warnings";
import { digitsOnly } from "@/lib/format/phone";
import { canonicalize } from "@/lib/email/canonicalize";
import {
  extractDayRestriction,
  extractStageRestriction,
  extractRoleFlags,
  hasTripleAsterisk,
  normalizeStageWords,
} from "../personalization";

const CREW_HEADER_RE = /^\|\s*CREW\s*\|/m;
const TECH_HEADER_RE = /^\|\s*TECH\s*\|/m;
const BLOCK_LABEL_RE = /^\|\s*([A-Z][A-Z\s/]+?)\s*\|/;

const TERMINATING_LABELS = new Set([
  "DRESS",
  "TRANSPORTATION",
  "VENUE",
  "DATES",
  "HOTEL",
  "HOTELS",
  "ROOMS",
  "CONTACTS",
  "SCHEDULE",
  "PULL SHEET",
  "PULL",
  "DIAGRAMS",
  "DETAILS",
  "DETAILS/ROOM DIAGRAM",
  "CONTACT OFFICE",
  "CLIENT",
]);

export function parseCrew(
  markdown: string,
  // version is part of the public API contract (§2.4); reserved for future
  // version-specific column-shape handling. Detection is currently content-based.

  _version: "v1" | "v2" | "v4",
  agg?: ParseAggregator,
): CrewMemberRow[] {
  const techMatch = TECH_HEADER_RE.exec(markdown);
  if (techMatch && !CREW_HEADER_RE.test(markdown)) {
    return parseTechBlock(markdown, techMatch.index, agg);
  }
  const crewMatch = CREW_HEADER_RE.exec(markdown);
  if (!crewMatch) return [];
  return parseCrewBlock(markdown, crewMatch.index, agg);
}

type ColMap = { name: number; role: number; phone: number; email: number; flight: number };

const CREW_COLUMN_VOCAB = ["NAME", "ROLE", "PHONE", "EMAIL"] as const;
type ColCorrection = { raw: string; corrected: string };

function detectColumns(headerLine: string): { colMap: ColMap; corrections: ColCorrection[] } {
  const parts = headerLine.split("|");
  const segments = parts.slice(1, parts.length - 1).map((s) => s.trim().toUpperCase());
  let name = 1;
  let role = 2;
  let phone = 3;
  let email = -1;
  let flight = -1;
  const corrections: ColCorrection[] = [];
  const assign = (col: string, i: number) => {
    if (col === "NAME") name = i;
    else if (col === "ROLE") role = i;
    else if (col === "PHONE") phone = i;
    else if (col === "EMAIL") email = i;
  };
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] ?? "";
    if (seg === "NAME" || seg === "ROLE" || seg === "PHONE" || seg === "EMAIL") {
      assign(seg, i);
    } else if (seg.includes("FLIGHT")) {
      flight = i; // substring test — NOT fuzzed (spec §4.2)
    } else if (seg.length > 0) {
      // Fuzzy-correct a misspelled column header (e.g. 'E-MAIL'→'EMAIL'); exclude the
      // KNOWN_SUB_LABELS so a label like ROOM/DATE is never fuzzed into a column.
      const fix = gatedVocabCorrect(seg, CREW_COLUMN_VOCAB, { exclude: ["DATE", "DAY", "ROOM"] });
      if (fix?.corrected) {
        assign(fix.match, i);
        corrections.push({ raw: seg, corrected: fix.match });
      }
    }
  }
  return { colMap: { name, role, phone, email, flight }, corrections };
}

function isSeparatorRow(line: string): boolean {
  const parts = line.split("|");
  const segs = parts.slice(1, parts.length - 1);
  return segs.every((s) => /^[\s:|*-]*$/.test(s));
}

function parseCrewBlock(
  markdown: string,
  headerOffset: number,
  agg?: ParseAggregator,
): CrewMemberRow[] {
  const lines = markdown.slice(headerOffset).split("\n");
  const members: CrewMemberRow[] = [];
  const localWarnings: ParseWarning[] = [];
  const headerLine = lines[0] ?? "";
  const { colMap, corrections } = detectColumns(headerLine);
  for (const c of corrections) {
    agg?.warnings.push({
      severity: "warn",
      code: "COLUMN_HEADER_AUTOCORRECTED",
      message: `Read likely-misspelled column header '${c.raw}' as '${c.corrected}'`,
      rawSnippet: headerLine,
      blockRef: { kind: "crew", index: 0 },
    });
  }
  let inCrewSection = false;

  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line) {
      if (inCrewSection) break;
      continue;
    }
    if (!line.startsWith("|")) continue;
    if (isSeparatorRow(line)) continue;

    const parts = line.split("|");
    const cells = parts.slice(1, parts.length - 1).map((s) => s.trim());

    const col0 = cells[0] ?? "";
    if (col0) {
      const labelMatch = BLOCK_LABEL_RE.exec(`| ${col0} |`);
      if (labelMatch) {
        const label = (labelMatch[1] ?? "").trim().toUpperCase();
        if (TERMINATING_LABELS.has(label)) break;
      }
    }

    const nameRaw = clean(cells[colMap.name] ?? "");
    const roleRaw = clean(cells[colMap.role] ?? "");
    const phoneRaw = clean(cells[colMap.phone] ?? "");
    const emailRaw = colMap.email !== -1 ? clean(cells[colMap.email] ?? "") : "";
    const flightRaw = colMap.flight !== -1 ? clean(cells[colMap.flight] ?? "") : null;

    if (!nameRaw) continue;
    inCrewSection = true;

    members.push(
      buildCrewMember({
        nameRaw,
        roleRaw,
        phoneRaw,
        emailRaw,
        flightRaw,
        index: members.length,
        warnings: localWarnings,
        ...(agg !== undefined ? { agg } : {}),
      }),
    );
  }

  return members;
}

function parseTechBlock(
  markdown: string,
  headerOffset: number,
  agg?: ParseAggregator,
): CrewMemberRow[] {
  const lines = markdown.slice(headerOffset).split("\n");
  const members: CrewMemberRow[] = [];
  let inCrewSection = false;

  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line) {
      // A blank line ends the TECH table (the exporter separates blocks with a
      // blank row). Without this the scan ran to EOF and swept later merged
      // banners — e.g. "| DOCUMENTS - Agendas, Diagrams, Presentations | …" —
      // in as phantom crew members (East Coast).
      if (inCrewSection) break;
      continue;
    }
    if (!line.startsWith("|")) continue;
    if (isSeparatorRow(line)) continue;

    const parts = line.split("|");
    const cells = parts.slice(1, parts.length - 1).map((s) => s.trim());
    const techCell = clean(cells[0] ?? "");
    // Stop at the next section header (mirror parseCrewBlock's terminator).
    if (techCell) {
      const labelMatch = BLOCK_LABEL_RE.exec(`| ${techCell} |`);
      if (labelMatch && TERMINATING_LABELS.has((labelMatch[1] ?? "").trim().toUpperCase())) break;
    }
    const phoneRaw = clean(cells[1] ?? "");
    const arrivalRaw = clean(cells[2] ?? "");
    const departureRaw = clean(cells[3] ?? "");

    if (!techCell) continue;
    if (!techCell.includes("-")) continue;

    const firstDash = techCell.indexOf(" - ");
    if (firstDash === -1) continue;

    const name = techCell.slice(0, firstDash).trim();
    const roleAndFlags = techCell.slice(firstDash + 3).trim();
    const flightParts = [arrivalRaw, departureRaw].filter(Boolean);
    const flightRaw = flightParts.length > 0 ? flightParts.join(" | ") : null;

    inCrewSection = true;
    const localWarnings: ParseWarning[] = [];
    members.push(
      buildCrewMember({
        nameRaw: name,
        roleRaw: roleAndFlags,
        phoneRaw,
        emailRaw: "",
        flightRaw,
        index: members.length,
        warnings: localWarnings,
        ...(agg !== undefined ? { agg } : {}),
      }),
    );
  }

  return members;
}

function buildCrewMember(params: {
  nameRaw: string;
  roleRaw: string;
  phoneRaw: string;
  emailRaw: string;
  flightRaw: string | null;
  index: number;
  warnings: ParseWarning[];
  agg?: ParseAggregator;
}): CrewMemberRow {
  const { phoneRaw, emailRaw, flightRaw, index, warnings, agg } = params;

  // Stable per-row key for deep-link anchoring of crew-role-cell warnings. name
  // is the RAW name cell (pre-restriction-strip); the raw-grid scanner re-extracts
  // and normalizes the same value to locate the cell (lib/drive/crewRoleAnchors.ts).
  const crewBlockRef = { kind: "crew" as const, index, name: params.nameRaw };

  // Class A — a field carried a non-empty value that yields no usable tap-target:
  // a phone with no digits (no `tel:` number) or an email with no "@" (not an
  // address). Flag it AND null the field below, so a fresh publish renders NO link
  // (on the MI-11 hold path the prior approved value stays live until approval). The
  // member still parses. Shared by both header paths; for email, in practice only the
  // CREW path emits — v1 TECH sheets carry no EMAIL column.
  const phoneUnreadable = presence(phoneRaw) !== null && digitsOnly(phoneRaw).length === 0;
  if (phoneUnreadable) {
    emitFieldUnreadable(agg, { section: "crew", field: "phone", rawSnippet: phoneRaw, index });
  }
  // INVARIANT 3 (whole-diff R4): canonicalize() is the ONLY function allowed to touch
  // the raw email. Derive the unreadable check from the CANONICAL value — never inspect
  // emailRaw directly — and surface that same canonical value (the warning snippet uses
  // it too, so no raw email enters the system uncanonicalized).
  const canonicalEmail = canonicalize(emailRaw);
  const emailUnreadable = canonicalEmail !== null && !canonicalEmail.includes("@");
  if (emailUnreadable) {
    emitFieldUnreadable(agg, {
      section: "crew",
      field: "email",
      rawSnippet: canonicalEmail!,
      index,
    });
  }

  const dayResult = extractDayRestriction({ nameCell: params.nameRaw, roleCell: params.roleRaw });
  warnings.push(...dayResult.warnings);
  if (agg) agg.warnings.push(...dayResult.warnings);

  const displayName = dayResult.cleanedNameCell.trim();
  const cleanedRole = dayResult.cleanedRoleCell.trim();

  // Auto-correct misspelled stage words ONCE, upstream of both extractors, so the
  // UNKNOWN_ROLE_TOKEN cascade AND the silent stage_restriction mis-parse are fixed.
  const stageNorm = normalizeStageWords(cleanedRole);
  const roleCellForParse = stageNorm.corrected;
  if (stageNorm.corrections.length > 0) {
    const stageNote: ParseWarning = {
      severity: "warn",
      code: "STAGE_WORD_AUTOCORRECTED",
      message: `Read likely-misspelled stage word(s) ${stageNorm.corrections
        .map((c) => `'${c.detected}' as '${c.corrected}'`)
        .join(", ")} in role cell: '${cleanedRole}'`,
      rawSnippet: cleanedRole,
      blockRef: crewBlockRef,
    };
    warnings.push(stageNote);
    if (agg) agg.warnings.push(stageNote);
  }

  const stageRestriction = extractStageRestriction(roleCellForParse);
  const roleFlagResult = extractRoleFlags(roleCellForParse);
  // Stamp UNKNOWN_ROLE_TOKEN / ROLE_TOKEN_AUTOCORRECTED warnings with the crew-row
  // blockRef so they can deep-link to the offending role cell. extractRoleFlags stays pure.
  const stampedRoleWarnings = roleFlagResult.warnings.map((w) =>
    w.code === "UNKNOWN_ROLE_TOKEN" || w.code === "ROLE_TOKEN_AUTOCORRECTED"
      ? { ...w, blockRef: crewBlockRef }
      : w,
  );
  warnings.push(...stampedRoleWarnings);
  if (agg) agg.warnings.push(...stampedRoleWarnings);
  const roleFlags = [...roleFlagResult.flags];
  if (/\bONLY\b/i.test(params.nameRaw) || /\bONLY\b/i.test(params.roleRaw)) {
    if (!roleFlags.includes("ONLY")) roleFlags.push("ONLY");
  }

  let dateRestriction = dayResult.restriction;
  if (hasTripleAsterisk(params.roleRaw) && dateRestriction.kind === "none") {
    dateRestriction = { kind: "unknown_asterisk", days: null };
    const tripleAsteriskWarning = {
      severity: "warn" as const,
      code: "UNKNOWN_DAY_RESTRICTION",
      message: `Role cell contains *** but no explicit day dates found: '${params.roleRaw}'`,
      rawSnippet: params.roleRaw,
      blockRef: crewBlockRef,
    };
    warnings.push(tripleAsteriskWarning);
    if (agg) agg.warnings.push(tripleAsteriskWarning);
  }

  return {
    name: displayName,
    // Unreadable fields are nulled (see Class-A note above) so a fresh publish renders
    // no dead tap-target; email uses the already-canonicalized value (invariant 3).
    email: emailUnreadable ? null : canonicalEmail,
    phone: phoneUnreadable ? null : presence(phoneRaw),
    role: cleanedRole,
    role_flags: roleFlags,
    date_restriction: dateRestriction,
    stage_restriction: stageRestriction,
    flight_info: flightRaw ? presence(flightRaw) : null,
  };
}
