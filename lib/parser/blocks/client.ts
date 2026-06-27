import type { ShowRow, ClientContact, ClientContactPerson } from "@/lib/parser/types";
import type { ParseAggregator } from "@/lib/parser/warnings";
import { canonicalize } from "@/lib/email/canonicalize";
import { clean, presence, parseTableRows } from "./_helpers";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { KNOWN_SUB_LABELS } from "@/lib/parser/knownSections";

// Closed-vocab client field labels (lowercase) the fuzzy fallback recovers toward. Exported so
// lib/parser/typoVocabRegistry.ts derives the registry entries from this single source (the gate
// AND the registry use these exact consts — no drift).
export const CLIENT_V2_LABELS = ["client contact", "client phone", "client email"] as const;
export const CLIENT_V4_LABELS = [
  "contact",
  "contact cell",
  "contact office",
  "contact email",
] as const;
const CLIENT_GATE_OPTS = {
  minLen: 5,
  tieAbort: true,
  exclude: [...KNOWN_SUB_LABELS].map((s) => s.toLowerCase()),
} as const;

// Merge a fuzzy cell into a parsed field: a real fuzzy value fills an empty/sentinel slot only,
// never clobbering a real value. Returns the (possibly updated) value + whether it changed (drives
// the warn). `normalize` is presence for text/phone, canonicalize for email.
function mergeFuzzyCell(
  cur: string | null,
  raw: string,
  normalize: (s: string) => string | null,
): { val: string | null; changed: boolean } {
  const v = normalize(raw);
  if (v !== null && (cur === null || shouldHideGenericOptional(cur)))
    return { val: v, changed: true };
  return { val: cur, changed: false };
}

function fuzzyFieldLabel(f: "name" | "phone" | "email"): string {
  return f === "name" ? "client contact" : f === "phone" ? "client phone" : "client email";
}

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

function parseClientV4(
  rows: string[][],
  agg?: ParseAggregator,
): Pick<ShowRow, "client_label" | "client_contact"> {
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

  // PR-D4 deferred fuzzy candidates per sub-label (last-write-wins). Applied post-loop via a
  // per-column merge so neither main nor secondary real values are clobbered.
  const fuzzyCandidates = new Map<string, { rawLabel: string; main: string; sec: string }>();

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
        // Fuzzy-before-break (PR-D4 CRITICAL): a typo of a known sub-label must NOT terminate the
        // block. On a near-miss, record a deferred candidate and continue; only a genuine unknown
        // label breaks. The post-loop merge preserves both columns + exact-real values.
        const fuzzy = gatedVocabCorrect(normalizedLabel, [...CLIENT_V4_LABELS], CLIENT_GATE_OPTS);
        if (fuzzy?.corrected) {
          fuzzyCandidates.set(fuzzy.match, {
            rawLabel: (row[0] ?? "").trim(),
            main: row[1] ?? "",
            sec: row[2] ?? "",
          });
          continue; // recovered — do NOT break, do NOT fall through to exact field-detection
        }
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

  // Apply deferred fuzzy candidates for a confirmed client block (after the guard above). Merge
  // main + secondary INDEPENDENTLY: a real fuzzy cell fills an empty/sentinel slot only, so an
  // exact real value always wins and no real value (in either column) is clobbered. Warn iff a
  // cell actually changed (an exact-claimed field suppresses the warn).
  for (const [sublabel, cand] of fuzzyCandidates) {
    let changed = false;
    const apply = (
      cur: string | null,
      raw: string,
      norm: (s: string) => string | null,
    ): string | null => {
      const r = mergeFuzzyCell(cur, raw, norm);
      if (r.changed) changed = true;
      return r.val;
    };
    if (sublabel === "contact") {
      mainName = apply(mainName, cand.main, presence);
      secName = apply(secName, cand.sec, presence);
    } else if (sublabel === "contact cell") {
      mainPhone = apply(mainPhone, cand.main, presence);
      secPhone = apply(secPhone, cand.sec, presence);
    } else if (sublabel === "contact office") {
      mainOfficePhone = apply(mainOfficePhone, cand.main, presence);
      secOfficePhone = apply(secOfficePhone, cand.sec, presence);
    } else if (sublabel === "contact email") {
      mainEmail = apply(mainEmail, cand.main, canonicalize);
      secEmail = apply(secEmail, cand.sec, canonicalize);
    }
    if (changed) {
      agg?.warnings.push({
        severity: "warn",
        code: "FIELD_LABEL_AUTOCORRECTED",
        message: `Read likely-misspelled client label '${cand.rawLabel}' as '${sublabel}'`,
        blockRef: { kind: "client" },
        rawSnippet: cand.rawLabel,
      });
    }
  }

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
function parseClientV2orV1(
  rows: string[][],
  agg?: ParseAggregator,
): Pick<ShowRow, "client_label" | "client_contact"> {
  let clientLabel = "";
  let contactName: string | null = null;
  let contactPhone: string | null = null;
  let contactEmail: string | null = null;

  const fuzzyCandidates = new Map<
    "name" | "phone" | "email",
    { rawLabel: string; value: string }
  >();
  const V2_LABEL_TO_FIELD: Record<string, "name" | "phone" | "email"> = {
    "client contact": "name",
    "client phone": "phone",
    "client email": "email",
  };

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

    // Fuzzy fallback (PR-D4): a near-miss of a v2 client label is recorded (deferred). The 'CLIENT'
    // org marker and the v1 merged-cell slash variants above are intentionally NOT fuzzed.
    const fuzzy = gatedVocabCorrect(labelLower, [...CLIENT_V2_LABELS], CLIENT_GATE_OPTS);
    if (fuzzy?.corrected) {
      const field = V2_LABEL_TO_FIELD[fuzzy.match];
      if (field && presence(val) !== null)
        fuzzyCandidates.set(field, { rawLabel: rawLabel.trim(), value: val });
    }
  }

  if (!clientLabel) return { client_label: "", client_contact: null };

  // Apply deferred fuzzy candidates ONLY for a confirmed client block (after the guard above), so
  // an unrecognized block never emits a warning. Merge per field: a real fuzzy value fills an
  // empty/sentinel slot only — an exact real value always wins, and no real value is clobbered.
  for (const [field, cand] of fuzzyCandidates) {
    const norm = field === "email" ? canonicalize : presence;
    const cur = field === "name" ? contactName : field === "phone" ? contactPhone : contactEmail;
    const r = mergeFuzzyCell(cur, cand.value, norm);
    if (!r.changed) continue; // exact-claimed (real) — suppress the warn
    if (field === "name") contactName = r.val;
    else if (field === "phone") contactPhone = r.val;
    else contactEmail = r.val;
    agg?.warnings.push({
      severity: "warn",
      code: "FIELD_LABEL_AUTOCORRECTED",
      message: `Read likely-misspelled client label '${cand.rawLabel}' as '${fuzzyFieldLabel(field)}'`,
      blockRef: { kind: "client" },
      rawSnippet: cand.rawLabel,
    });
  }

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

  agg?: ParseAggregator,
): Pick<ShowRow, "client_label" | "client_contact"> {
  const rows = parseTableRows(markdown);

  if (version === "v4") {
    return parseClientV4(rows, agg);
  }
  // v1 and v2 share the same extraction path; v1 additionally handles merged cells
  return parseClientV2orV1(rows, agg);
}
