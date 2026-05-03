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
 * The row value cell is free-text containing name, phone, and email in any order.
 *
 * Email extraction: first email-pattern match in the cell value.
 * Phone extraction: first phone-pattern match in the cell value.
 * Name extraction: everything before the first email or phone found.
 *
 * Email canonicalization (AGENTS.md §1.3): all extracted emails route through canonicalize().
 */

import type { ContactRow, ContactKind } from "../types";
import { clean, presence } from "./_helpers";
import { canonicalize } from "@/lib/email/canonicalize";

// Labels that map to 'venue' kind (covers typos like "Hotal" and variants "Info"/"Information")
const VENUE_LABEL_RE = /^\s*(?:venue|hotel|hotal)\s+contact\s+(?:info(?:rmation)?|details?)\s*$/i;

// Labels that map to 'in_house_av' kind
const IN_HOUSE_AV_LABEL_RE = /^\s*in\s+house\s+av\s*$/i;

export function parseContacts(markdown: string, _version: "v1" | "v2" | "v4"): ContactRow[] {
  const contacts: ContactRow[] = [];

  // Scan all table rows for matching labels
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = splitRow(trimmed);
    if (cells.length < 2) continue;

    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");

    let kind: ContactKind | null = null;

    if (VENUE_LABEL_RE.test(col0)) {
      kind = "venue";
    } else if (IN_HOUSE_AV_LABEL_RE.test(col0)) {
      kind = "in_house_av";
    }

    if (!kind) continue;

    // Deduplicate: only keep the first occurrence of each kind.
    // Some fixtures have secondary "Hotel Contact Information" metadata rows later in the file.
    if (contacts.some((c) => c.kind === kind)) continue;

    // Combine all remaining cells as the raw value (in case content spans multiple columns)
    const rawValue = cells
      .slice(1)
      .map((c) => clean(c))
      .filter(Boolean)
      .join(" ");

    if (!rawValue) continue;

    const contact = parseContactValue(rawValue, kind);
    contacts.push(contact);
  }

  return contacts;
}

/**
 * Parse a free-text contact cell into a ContactRow.
 *
 * The cell typically looks like:
 *   "Isabella Vizzini Isabella.Vizzini@waldorfastoria.com 312 646 1418"
 *   "Kurt Ashcraft Senior Event Planning Manager 312 239 4217 kurt.ashcraft@hyatt.com"
 *   "Cesar Salazar 309-532-5534 <cesar.salazar@encoreglobal.com>"
 *   "Chris Mercado chris.mercado@encoreglobal.com Danilo Scekic danilo.scekic@encoreglobal.com"
 *   "Cecilia J. Cole ... cecilia.cole@encoreglobal.com ... Aaron Shapiro ... aaron.shapiro@encoreglobal.com"
 */
function parseContactValue(raw: string, kind: ContactKind): ContactRow {
  // Normalize: remove angle brackets around emails, normalize whitespace
  const text = raw.replace(/[<>]/g, " ").replace(/&#10;/g, " ").replace(/\s+/g, " ").trim();

  // Extract the first email address found
  const emailMatch = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i.exec(text);
  const emailRaw = emailMatch ? emailMatch[1]! : null;
  const email = canonicalize(emailRaw);

  // Extract the first phone number found (various formats)
  const phoneMatch =
    /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4}|\d{3,4}-\d{3,4}-\d{4})/.exec(
      text,
    );
  const phone = phoneMatch ? presence(phoneMatch[1]!) : null;

  return {
    kind,
    name: null, // name extraction from free-text is unreliable; store full content in notes
    email,
    phone,
    notes: presence(text),
  };
}

function splitRow(line: string): string[] {
  const parts = line.split("|");
  return parts.slice(1, parts.length - 1).map((s) => s.trim());
}
