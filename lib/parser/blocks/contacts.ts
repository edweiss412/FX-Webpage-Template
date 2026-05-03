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
 * Title/role tokens that terminate name capture (Codex round-2 finding).
 *
 * When the name-extraction loop encounters one of these tokens, it stops
 * accumulating — the token and everything after it is a job title, not a
 * person name. The set is intentionally broad to cover common hospitality and
 * AV industry titles. Heuristic: prefer false-negative (shorter name) over
 * false-positive (name absorbs title).
 */
const NAME_STOP_TOKENS = new Set([
  // Seniority / level
  "Senior",
  "Junior",
  "Lead",
  "Associate",
  "Assistant",
  "Executive",
  "Vice",
  "Chief",
  // Job title nouns
  "Director",
  "Manager",
  "Coordinator",
  "Specialist",
  "Supervisor",
  "Administrator",
  "President",
  "Officer",
  "Head",
  // Domain descriptors (often part of multi-word titles)
  "Event",
  "Events",
  "Technology",
  "Sales",
  "Marketing",
  "Operations",
  "Engineering",
  "Audio",
  "Video",
  "Lighting",
  "Production",
  "Conference",
  "Account",
  "Hospitality",
  "Service",
  "Services",
  "Planning",
  // Suffix / credentials
  "Jr.",
  "Sr.",
  "II",
  "III",
  "IV",
  "PhD",
  "MD",
  // Common prepositions/articles in compound titles ("Director Of …")
  "Of",
  "And",
  "The",
  "For",
  "With",
]);

/**
 * Heuristically extract a person name from a token string.
 *
 * Algorithm (Codex round-2 update):
 *   1. Strip phone-number-like substrings.
 *   2. Tokenize on whitespace.
 *   3. Walk all tokens accumulating consecutive capitalized name words.
 *      A token is a valid name word when:
 *      a. It matches Unicode-aware capitalized pattern (handles "Jenaé",
 *         "François", initials like "J."), AND
 *      b. It is NOT in NAME_STOP_TOKENS (title/role keywords).
 *   4. When a stop-token or non-name token is hit, commit any run of 2+
 *      tokens as a candidate and reset — then keep scanning (so "Cell: 1-404
 *      Aaron Shapiro Director" still finds "Aaron Shapiro" after the reset).
 *   5. The last committed candidate wins (latest name run in the pre-email
 *      segment is usually the person whose email follows).
 *   6. Cap each run at 3 tokens (First Middle Last).
 *
 * Unicode-aware regex (\p{Lu}, \p{Ll} with the `u` flag) handles accented
 * characters such as "Jenaé" or "François" (Codex round-2 finding).
 *
 * Returns null if no run of 2+ name tokens is found.
 */
function extractName(text: string): string | null {
  if (!text) return null;

  // Remove phone-number-like substrings before tokenizing
  const cleaned = text.replace(PHONE_RE, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const tokens = cleaned.split(/\s+/);
  let run: string[] = [];
  let bestName: string | null = null;

  const commitRun = () => {
    if (run.length >= 2) bestName = run.join(" ");
    run = [];
  };

  for (const tok of tokens) {
    // Trim trailing punctuation (comma, semicolon — preserve "J.")
    const t = tok.replace(/[,;]+$/, "");
    if (!t) {
      commitRun();
      continue;
    }

    // Stop-token: commit current run and reset (keep scanning for more names)
    if (NAME_STOP_TOKENS.has(t)) {
      commitRun();
      continue;
    }

    // Valid capitalized name word? (Unicode-aware — handles Jenaé, J., DeTone)
    if (/^\p{Lu}[\p{Ll}\p{Lu}'.\-]*$/u.test(t)) {
      run.push(t);
      if (run.length >= 3) commitRun(); // cap at 3 tokens then start fresh
    } else {
      commitRun(); // non-name token: commit and reset
    }
  }
  // Commit any trailing run
  commitRun();

  return bestName;
}
