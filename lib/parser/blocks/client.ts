import type { ShowRow, ClientContact, ClientContactPerson } from "@/lib/parser/types";
import type { ParseAggregator } from "@/lib/parser/warnings";
import { canonicalize } from "@/lib/email/canonicalize";
import { clean, presence, parseTableRows } from "./_helpers";

// ── v4 parser ─────────────────────────────────────────────────────────────────
//
// v4 CLIENT block shape (2026-03, 2026-04, 2025-10, 2026-05 fixtures):
//
//   | CLIENT | <org>  | (blank or SECONDARY info) | ... |
//   | :--:   | :--:   | :--: | ... |
//   |        | MAIN   | SECONDARY | ... |          ← "MAIN" / "SECONDARY" header row
//   | Contact      | <main name>  | <sec name>  | ... |
//   | Contact Cell | <main phone> | <sec phone> | ... |
//   | Contact Office | <main off> | <sec off>   | ... |  ← v4 marker
//   | Contact Email  | <main email>| <sec email> | ... |
//
// Column indices: label=0, main=1, secondary=2 (when present).

function parseClientV4(rows: string[][]): Pick<ShowRow, "client_label" | "client_contact"> {
  let clientLabel = "";
  let mainName: string | null = null;
  let mainPhone: string | null = null;
  let mainOfficePhone: string | null = null;
  let mainEmail: string | null = null;
  let secName: string | null = null;
  let secPhone: string | null = null;
  let secOfficePhone: string | null = null;
  let secEmail: string | null = null;

  // Detect if a row is the MAIN/SECONDARY column-header row
  // so we can skip it (it's metadata, not data).
  const isMainSecRow = (row: string[]): boolean => {
    for (const cell of row) {
      if (cell.trim().toUpperCase() === "MAIN" || cell.trim().toUpperCase() === "SECONDARY") {
        return true;
      }
    }
    return false;
  };

  // Find the CLIENT block: rows where first cell is "CLIENT"
  let inClientBlock = false;
  for (const row of rows) {
    const label = (row[0] ?? "").toUpperCase();

    if (label === "CLIENT") {
      inClientBlock = true;
      // The org name is in column 1
      clientLabel = clean(row[1] ?? "");
      continue;
    }

    if (!inClientBlock) continue;

    // Stop when we hit a clearly different block header (non-empty label
    // that is not a known CLIENT sub-row label and not blank)
    const knownClientLabels = new Set([
      "contact",
      "contact cell",
      "contact office",
      "contact email",
      "",
    ]);
    const normalizedLabel = label.toLowerCase();
    if (
      !knownClientLabels.has(normalizedLabel) &&
      normalizedLabel !== "main" &&
      normalizedLabel !== "secondary"
    ) {
      // Allow blank-first-cell rows (they carry MAIN/SECONDARY data)
      // but stop if we see a real section header
      if (label.length > 0 && !isMainSecRow(row)) {
        break;
      }
    }

    if (isMainSecRow(row)) continue;

    // Blank first cell = MAIN/SECONDARY data rows
    if (label === "" || normalizedLabel === "contact") {
      if (normalizedLabel === "contact" || label === "") {
        // "Contact" row carries name
        if (normalizedLabel === "contact") {
          mainName = presence(row[1] ?? "");
          secName = presence(row[2] ?? "");
        }
      }
      continue;
    }

    if (normalizedLabel === "contact cell") {
      mainPhone = presence(row[1] ?? "");
      secPhone = presence(row[2] ?? "");
    } else if (normalizedLabel === "contact office") {
      mainOfficePhone = presence(row[1] ?? "");
      secOfficePhone = presence(row[2] ?? "");
    } else if (normalizedLabel === "contact email") {
      mainEmail = canonicalize(row[1] ?? "");
      secEmail = canonicalize(row[2] ?? "");
    }
  }

  if (!clientLabel) return { client_label: "", client_contact: null };

  if (!mainName && mainPhone === null && mainEmail === null) {
    return { client_label: clientLabel, client_contact: null };
  }

  const main: ClientContactPerson = {
    name: mainName ?? "",
    email: mainEmail,
    phone: mainPhone,
    ...(mainOfficePhone !== null ? { officePhone: mainOfficePhone } : {}),
  };

  let secondary: ClientContactPerson | null = null;
  if (secName !== null) {
    secondary = {
      name: secName,
      email: secEmail,
      phone: secPhone,
      ...(secOfficePhone !== null ? { officePhone: secOfficePhone } : {}),
    };
  }

  const contact: ClientContact = {
    ...main,
    ...(secondary !== null ? { secondary } : {}),
  };

  return { client_label: clientLabel, client_contact: contact };
}

// ── v2 parser ─────────────────────────────────────────────────────────────────
//
// v2 CLIENT block shape (2025-03, 2025-05, 2025-06, 2025-10, 2025-04 fixtures):
//
//   | CLIENT | <org> |
//   | :--: | :--: |
//   | Client Contact | <name> |
//   | Client Phone | <phone> |
//   | Client Email | <email> |
//
// v1 fallback uses merged cells: "CLIENT /Org", "Client Contact/Name", "Client Email/email"

// v1 and v2 share an identical extraction path (v1 additionally handles merged-cell
// patterns via regex). No version branching is needed — the private helper takes rows only.
function parseClientV2orV1(rows: string[][]): Pick<ShowRow, "client_label" | "client_contact"> {
  let clientLabel = "";
  let contactName: string | null = null;
  let contactPhone: string | null = null;
  let contactEmail: string | null = null;

  for (const row of rows) {
    const rawLabel = row[0] ?? "";
    const labelNorm = rawLabel.toUpperCase().trim();
    const val = clean(row[1] ?? "");

    // v2 shape: "CLIENT" row with org in col 1
    if (labelNorm === "CLIENT") {
      clientLabel = val;
      continue;
    }

    // v1 merged-cell shape: "CLIENT /Org" — entire org name is in col 0 after the slash
    // Used by 2024-05 and 2025-04 fixtures.
    if (/^client\s*\//i.test(rawLabel)) {
      clientLabel = clean(rawLabel.replace(/^client\s*\/\s*/i, ""));
      continue;
    }

    // v2 shape
    const labelLower = rawLabel.toLowerCase().trim();
    if (labelLower === "client contact") {
      contactName = presence(val);
      continue;
    }
    if (labelLower === "client phone") {
      contactPhone = presence(val);
      continue;
    }
    if (labelLower === "client email") {
      contactEmail = canonicalize(val);
      continue;
    }

    // v1 merged-cell shape: "Client Contact/Name" — name is part of col 0
    if (/^client\s+contact\s*\//i.test(rawLabel)) {
      contactName = presence(clean(rawLabel.replace(/^client\s+contact\s*\/\s*/i, "")));
      continue;
    }
    // v1: "Client Phone/..." or "Client Cell/..."
    if (/^client\s+(phone|cell)\s*\//i.test(rawLabel)) {
      contactPhone = presence(clean(rawLabel.replace(/^client\s+(phone|cell)\s*\/\s*/i, "")));
      continue;
    }
    // v1: "Client Email/..."
    if (/^client\s+email\s*\//i.test(rawLabel)) {
      contactEmail = canonicalize(rawLabel.replace(/^client\s+email\s*\/\s*/i, ""));
      continue;
    }
  }

  if (!clientLabel) return { client_label: "", client_contact: null };

  if (!contactName && contactPhone === null && contactEmail === null) {
    return { client_label: clientLabel, client_contact: null };
  }

  const contact: ClientContact = {
    name: contactName ?? "",
    email: contactEmail,
    phone: contactPhone,
  };

  return { client_label: clientLabel, client_contact: contact };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract the client_label and client_contact from a show markdown sheet.
 *
 * @param markdown - Raw markdown string of the show sheet.
 * @param version  - Template version, as returned by detectVersion().
 *                   v1 reuses the v2 shape (per amendment 4).
 */
export function parseClient(
  markdown: string,
  version: "v1" | "v2" | "v4",
   
  _agg?: ParseAggregator,
): Pick<ShowRow, "client_label" | "client_contact"> {
  const rows = parseTableRows(markdown);

  if (version === "v4") {
    return parseClientV4(rows);
  }
  // v1 and v2 share the same extraction path; v1 additionally handles merged cells
  return parseClientV2orV1(rows);
}
