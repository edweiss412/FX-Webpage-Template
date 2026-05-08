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
import { canonicalize } from "@/lib/email/canonicalize";
import {
  extractDayRestriction,
  extractStageRestriction,
  extractRoleFlags,
  hasTripleAsterisk,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function detectColumns(headerLine: string): ColMap {
  const parts = headerLine.split("|");
  const segments = parts.slice(1, parts.length - 1).map((s) => s.trim().toUpperCase());
  let name = 1;
  let role = 2;
  let phone = 3;
  let email = -1;
  let flight = -1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] ?? "";
    if (seg === "NAME") name = i;
    else if (seg === "ROLE") role = i;
    else if (seg === "PHONE") phone = i;
    else if (seg === "EMAIL") email = i;
    else if (seg.includes("FLIGHT")) flight = i;
  }
  return { name, role, phone, email, flight };
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
  const colMap = detectColumns(headerLine);
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

  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line || !line.startsWith("|")) continue;
    if (isSeparatorRow(line)) continue;

    const parts = line.split("|");
    const cells = parts.slice(1, parts.length - 1).map((s) => s.trim());
    const techCell = clean(cells[0] ?? "");
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

    const localWarnings: ParseWarning[] = [];
    members.push(
      buildCrewMember({
        nameRaw: name,
        roleRaw: roleAndFlags,
        phoneRaw,
        emailRaw: "",
        flightRaw,
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
  warnings: ParseWarning[];
  agg?: ParseAggregator;
}): CrewMemberRow {
  const { phoneRaw, emailRaw, flightRaw, warnings, agg } = params;

  const dayResult = extractDayRestriction({ nameCell: params.nameRaw, roleCell: params.roleRaw });
  warnings.push(...dayResult.warnings);
  if (agg) agg.warnings.push(...dayResult.warnings);

  const displayName = dayResult.cleanedNameCell.trim();
  const cleanedRole = dayResult.cleanedRoleCell.trim();

  const stageRestriction = extractStageRestriction(cleanedRole);
  const roleFlagResult = extractRoleFlags(cleanedRole);
  warnings.push(...roleFlagResult.warnings);
  if (agg) agg.warnings.push(...roleFlagResult.warnings);
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
    };
    warnings.push(tripleAsteriskWarning);
    if (agg) agg.warnings.push(tripleAsteriskWarning);
  }

  const email = canonicalize(emailRaw);

  return {
    name: displayName,
    email,
    phone: presence(phoneRaw),
    role: cleanedRole,
    role_flags: roleFlags,
    date_restriction: dateRestriction,
    stage_restriction: stageRestriction,
    flight_info: flightRaw ? presence(flightRaw) : null,
  };
}
