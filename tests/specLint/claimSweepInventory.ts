/**
 * The §3.4 SIGNAL INVENTORY, parsed out of the spec, plus the reconciliation
 * that runs over it in BOTH directions.
 *
 * A TABLE THAT MERELY CLAIMS TO BE DERIVED IS ENUMERATION IN DERIVATION'S
 * COSTUME, and it drifts the first time a requirement is added — which is
 * exactly how the not-found signal came to be REQUIRED by §3.2 and
 * UNREPRESENTABLE by §3.4. So the cover reads the spec's own table and the
 * module's own exported codes, and reconciles them; nothing is retyped into a
 * test, so the drift cannot relocate into the checker.
 *
 * The half this CANNOT do is read §3's prose to find a requirement with no row
 * at all. That is spec §5 item 10, DECLARED — extracting normative outcomes
 * from English is the recognizer §1.1 item 3 forbids this arm, and building one
 * HERE, inside the guard's own test, would be the same mistake at one remove.
 *
 * Exported as a module rather than inlined so the reconciliation can be run
 * against a CONSTRUCTED table too: a check that cannot fail is not a check, and
 * one that cries wolf is worse than none, so both halves are proved.
 */

export type InventoryRow = {
  requirement: string;
  channel: string;
  /** The code named by a `FINDING \`X\`` channel, else null. */
  findingCode: string | null;
  /** True when the channel declares a refusal. */
  refusal: boolean;
  /** The `§5 item N` this row cites, else null. */
  limitItem: number | null;
};

/** Rows of the `§3 requires | Channel` table in §3.4, in document order. */
export function parseInventory(specText: string): InventoryRow[] {
  const lines = specText.split("\n");
  const start = lines.findIndex((l) => l.startsWith("| §3 requires | Channel |"));
  if (start < 0) throw new Error("§3.4 inventory table not found (heading row absent)");
  const rows: InventoryRow[] = [];
  // `+ 2` skips the heading and the `| --- | --- |` separator.
  for (let i = start + 2; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.startsWith("|")) break; // the table ends at the first non-row
    const cells = line.split("|").slice(1, -1);
    if (cells.length !== 2) throw new Error(`inventory row ${i + 1} has ${cells.length} cells`);
    const requirement = cells[0]!.trim();
    const channel = cells[1]!.trim();
    const finding = /^FINDING `([A-Z_]+)`$/.exec(channel);
    const limit = /§5 item (\d+)/.exec(channel);
    rows.push({
      requirement,
      channel,
      findingCode: finding === null ? null : finding[1]!,
      refusal: channel.startsWith("REFUSAL"),
      limitItem: limit === null ? null : Number(limit[1]),
    });
  }
  return rows;
}

/** The item numbers of `§5 Documented limits`, derived from the spec. */
export function parseLimitItems(specText: string): number[] {
  const lines = specText.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## 5. Documented limits"));
  const end = lines.findIndex((l) => l.startsWith("## 6. Testing"));
  if (start < 0 || end < 0 || end <= start) throw new Error("§5 boundaries not found");
  const items: number[] = [];
  for (const line of lines.slice(start + 1, end)) {
    const m = /^(\d+)\. /.exec(line);
    if (m !== null) items.push(Number(m[1]));
  }
  return items;
}

export type Mismatch = { kind: string; detail: string };

/**
 * BOTH DIRECTIONS. Returns every mismatch found; an empty array is the only
 * clean result, and the caller asserts on it.
 *
 * Deliberately returns the mismatches rather than throwing on the first, so a
 * failing run names EVERY disagreement at once rather than one per re-run —
 * a repeated vector dripped one instance per round is a review defect, and the
 * same is true of a checker.
 */
export function reconcile(
  rows: readonly InventoryRow[],
  exportedCodes: readonly string[],
  limitItems: readonly number[],
  refusalCount: number,
): Mismatch[] {
  const out: Mismatch[] = [];

  // Floors first. A derivation's failure mode is silently deriving NOTHING,
  // which renders identically to correctly finding nothing.
  if (rows.length === 0)
    out.push({ kind: "empty-table", detail: "the inventory parsed to 0 rows" });
  if (exportedCodes.length === 0)
    out.push({ kind: "empty-codes", detail: "the module exported 0 codes" });
  if (limitItems.length === 0)
    out.push({ kind: "empty-limits", detail: "§5 parsed to 0 documented limits" });

  const findingRows = rows.filter((r) => r.findingCode !== null);

  // Direction 1: every FINDING row names a code the module actually exports.
  for (const row of findingRows) {
    if (!exportedCodes.includes(row.findingCode!)) {
      out.push({
        kind: "row-names-unexported-code",
        detail: `row "${row.requirement}" names ${row.findingCode}, which the module does not export`,
      });
    }
  }

  // Direction 2: every exported code appears in EXACTLY ONE row.
  for (const code of exportedCodes) {
    const hits = findingRows.filter((r) => r.findingCode === code).length;
    if (hits !== 1) {
      out.push({
        kind: hits === 0 ? "exported-code-has-no-row" : "exported-code-has-many-rows",
        detail: `${code} appears in ${hits} inventory rows, expected exactly 1`,
      });
    }
  }

  // Every cited `§5 item N` exists, so a limit deleted from §5 cannot leave a
  // row pointing at nothing.
  for (const row of rows) {
    if (row.limitItem === null) continue;
    if (!limitItems.includes(row.limitItem)) {
      out.push({
        kind: "row-cites-missing-limit",
        detail: `row "${row.requirement}" cites §5 item ${row.limitItem}, which does not exist`,
      });
    }
  }

  // Every REFUSAL row corresponds to a refusal the suites assert exits 2.
  const refusalRows = rows.filter((r) => r.refusal).length;
  if (refusalRows !== refusalCount) {
    out.push({
      kind: "refusal-row-count",
      detail: `${refusalRows} REFUSAL rows against ${refusalCount} asserted refusals`,
    });
  }

  return out;
}
