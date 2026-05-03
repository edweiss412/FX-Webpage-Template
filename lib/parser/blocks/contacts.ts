/**
 * CONTACTS block parser (§2.9).
 *
 * Returns ContactRow[] with kind: 'venue' | 'in_house_av'.
 *
 * Contact information appears in rows labeled:
 *   - "Venue Contact Info" / "Hotel Contact Info" / "Hotal Contact Info" (typo) → kind: 'venue'
 *   - "In House AV" → kind: 'in_house_av'
 *
 * These rows appear in the TRANSPORTATION block in all corpus versions (v1, v2, v4).
 * The row value cell is free-text containing one or more people's name, phone, and email.
 *
 * Multi-person support (Codex round-1 finding): a single "In House AV" cell may contain
 * multiple humans (e.g. Cecilia J. Cole AND Aaron Shapiro in 2026-04-waldorf). Each
 * person becomes a separate ContactRow with the same `kind`. No dedup by kind is performed —
 * multiple rows with the same kind are valid and needed for MI-7/MI-7b detection.
 *
 * Name extraction: heuristic — text preceding each email is scanned for a run of 2+
 * capitalized tokens (handles "J." initials). Job titles between a name and email are
 * absorbed into `notes`.
 *
 * Email canonicalization (AGENTS.md §1.3): all extracted emails route through canonicalize().
 */

import type { ContactRow, ContactKind } from "../types";
import type { ParseAggregator } from "@/lib/parser/warnings";
import { clean, presence, splitRow } from "./_helpers";
import { canonicalize } from "@/lib/email/canonicalize";

// Labels that map to 'venue' kind (covers typos like "Hotal" and variants "Info"/"Information")
const VENUE_LABEL_RE = /^\s*(?:venue|hotel|hotal)\s+contact\s+(?:info(?:rmation)?|details?)\s*$/i;

// Labels that map to 'in_house_av' kind
const IN_HOUSE_AV_LABEL_RE = /^\s*in\s+house\s+av\s*$/i;

// Matches email addresses
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i;

// Matches phone numbers in common formats
const PHONE_RE =
  /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4}|\d{3,4}-\d{3,4}-\d{4}/;

// A person name: two or more tokens each starting with a capital letter (or being an initial "J.")
const NAME_START_RE = /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+)+$/;

export function parseContacts(
  markdown: string,
  _version: "v1" | "v2" | "v4",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _agg?: ParseAggregator,
): ContactRow[] {
  const contacts: ContactRow[] = [];

  // Deduplicate rows with identical (kind, rawValue) — catches duplicate metadata rows
  // that appear multiple times in the same file with the same content.
  // We do NOT deduplicate across different rows with the same kind — multiple
  // "In House AV" rows are valid (different humans, same role label).
  const seenRowKeys = new Set<string>();

  // Scan all table rows for matching labels
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = splitRow(trimmed);
    if (cells.length < 2) continue;

    const col0 = clean(cells[0] ?? "");

    let kind: ContactKind | null = null;

    if (VENUE_LABEL_RE.test(col0)) {
      kind = "venue";
    } else if (IN_HOUSE_AV_LABEL_RE.test(col0)) {
      kind = "in_house_av";
    }

    if (!kind) continue;

    // Combine all remaining cells as the raw value (in case content spans multiple columns)
    const rawValue = cells
      .slice(1)
      .map((c) => clean(c))
      .filter(Boolean)
      .join(" ");

    if (!rawValue) continue;

    const rowKey = `${kind}::${rawValue}`;
    if (seenRowKeys.has(rowKey)) continue;
    seenRowKeys.add(rowKey);

    // Parse the cell into one or more ContactRows (multi-person support)
    const parsed = parseContactCell(rawValue, kind);
    contacts.push(...parsed);
  }

  return contacts;
}

/**
 * Parse a free-text contact cell into one or more ContactRows.
 *
 * Splits the cell into per-person segments using email addresses as anchors:
 *   1. Normalize separators: &#10; / &#9; / angle brackets → spaces.
 *   2. Find all email addresses in the text.
 *   3. For each email, the pre-email text (up to the previous email's end) is
 *      scanned for a name; the post-email text (up to the next email) is
 *      scanned for a phone.
 *
 * If the cell contains no emails, falls back to a single ContactRow with
 * no name, the first phone found, and full text as notes.
 *
 * Examples handled:
 *   "Isabella Vizzini Isabella.Vizzini@waldorfastoria.com 312 646 1418"
 *   "Kurt Ashcraft Senior Event Planning Manager 312 239 4217 kurt.ashcraft@hyatt.com"
 *   "Cesar Salazar 309-532-5534 <cesar.salazar@encoreglobal.com>"
 *   "Cecilia J. Cole Event Sales Manager cecilia.cole@encoreglobal.com Cell: 1-404-723-2159
 *    Aaron Shapiro Director of Event Technology aaron.shapiro@encoreglobal.com Cell: 847.414.9205"
 */
function parseContactCell(raw: string, kind: ContactKind): ContactRow[] {
  // Normalize: strip angle brackets, HTML entities, extra whitespace
  const text = raw
    .replace(/[<>]/g, " ")
    .replace(/&#10;/g, " ")
    .replace(/&#9;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Find all email positions
  const emailGlobalRe = new RegExp(EMAIL_RE.source, "gi");
  const emailMatches: { email: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = emailGlobalRe.exec(text)) !== null) {
    emailMatches.push({ email: m[0]!, index: m.index, end: m.index + m[0]!.length });
  }

  // No emails found: return single fallback row
  if (emailMatches.length === 0) {
    const phoneMatch = PHONE_RE.exec(text);
    return [
      {
        kind,
        name: null,
        email: null,
        phone: phoneMatch ? presence(phoneMatch[0]) : null,
        notes: presence(text),
      },
    ];
  }

  // Build one ContactRow per email
  const rows: ContactRow[] = [];
  for (let i = 0; i < emailMatches.length; i++) {
    const { email: emailRaw, index: emailStart, end: emailEnd } = emailMatches[i]!;
    const prevEmailEnd = i === 0 ? 0 : emailMatches[i - 1]!.end;
    const nextEmailStart = i === emailMatches.length - 1 ? text.length : emailMatches[i + 1]!.index;

    // Pre-email text: between previous email's end and this email's start
    const pre = text.slice(prevEmailEnd, emailStart).trim();
    // Post-email text: between this email's end and next email's start
    const post = text.slice(emailEnd, nextEmailStart).trim();

    // Extract name from the pre segment
    const name = extractName(pre);

    // Extract phone from pre or post (prefer post for "Cell: XXX" pattern)
    const phoneInPost = PHONE_RE.exec(post);
    const phoneInPre = PHONE_RE.exec(pre);
    const phoneMatch = phoneInPost ?? phoneInPre;
    const phone = phoneMatch ? presence(phoneMatch[0]) : null;

    // Notes: full per-person segment text
    const segmentText = [pre, emailRaw, post].filter(Boolean).join(" ").trim();

    rows.push({
      kind,
      name: name ?? null,
      email: canonicalize(emailRaw),
      phone,
      notes: presence(segmentText),
    });
  }

  return rows;
}

/**
 * Heuristically extract a person name from a token string.
 *
 * Looks for a run of 2+ tokens each starting with a capital letter
 * (handles "J." initials, hyphenated names like "DeTone").
 * Phone-number-like substrings are stripped before tokenizing.
 * Returns null if no clear 2+ token name is found.
 */
function extractName(text: string): string | null {
  if (!text) return null;

  // Remove phone-number-like substrings before tokenizing
  const cleaned = text.replace(PHONE_RE, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const tokens = cleaned.split(/\s+/);

  let nameTokens: string[] = [];
  let bestName: string | null = null;

  for (const token of tokens) {
    if (/^[A-Z][a-zA-Z.'-]*$/.test(token)) {
      nameTokens.push(token);
    } else {
      // Non-name token: commit any accumulated run of 2+ tokens as a candidate
      if (nameTokens.length >= 2) {
        bestName = nameTokens.join(" ");
      }
      // Reset run unless token is a lowercase connector ("of", "the", etc.)
      if (!/^[a-z]/.test(token)) {
        nameTokens = [];
      }
    }
  }
  // Commit any trailing run
  if (nameTokens.length >= 2) {
    bestName = nameTokens.join(" ");
  }

  // Validate: must be 2+ capitalized tokens
  if (bestName && NAME_START_RE.test(bestName)) {
    return bestName;
  }
  return null;
}
