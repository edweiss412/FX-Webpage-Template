/**
 * DRESS block parser (BL-PARSER-DRESS-DROP).
 *
 * The INFO `DRESS` block sits BEFORE the DETAILS header, so parseEventDetails
 * (which slices from the DETAILS header) never reads it. This standalone parser
 * captures the full block — header value + continuation rows, skipping the
 * exporter's `| :---: | :---: |` separator — into a label-retaining multi-line
 * string, then merges it into the existing `event_details.dress_code` consumer
 * via the same sentinel-aware precedence parseEventDetails uses (event.ts:314).
 */
import { clean, presence, splitRow } from "./_helpers";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { matchesSectionHeader } from "./_sectionHeaderMatch";

export const SECTION_HEADER_TOKENS = ["DRESS"] as const;

const isSeparatorRow = (cells: string[]): boolean =>
  cells.length > 0 && cells.every((c) => /^[\s:|*-]*$/.test(c));

export function parseDress(markdown: string): string | null {
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (!t.startsWith("|")) continue;
    const cells = splitRow(t);
    if (!matchesSectionHeader(clean(cells[0] ?? ""), SECTION_HEADER_TOKENS)) continue;

    // Value reads go through presence() (= decodeEntities(clean(...)).trim()), the
    // value-STORAGE boundary every other event_details writer uses (event.ts:314 via
    // _helpers.presence). This decodes the exporter's `&#10;`/`&#9;` in-cell-whitespace
    // entities to spaces so a raw entity never reaches the crew dress card (audit idx42);
    // the inter-row join("\n") below still preserves genuine multi-row line structure.
    // The col0 terminator check stays on clean() — it is a structural row-kind test, not a
    // stored value.
    const collected: string[] = [];
    const headerVal = presence(cells[1] ?? "");
    if (headerVal) collected.push(headerVal);

    for (let j = i + 1; j < lines.length; j++) {
      const ct = lines[j]!.trim();
      if (!ct.startsWith("|")) break; // blank / non-table line ends the block
      const ccells = splitRow(ct);
      if (isSeparatorRow(ccells)) continue; // skip markdown separator row
      if (clean(ccells[0] ?? "")) break; // a real labeled row ends the block
      const val = presence(ccells[1] ?? "");
      if (val) collected.push(val);
    }

    const joined = collected.join("\n").trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}

/**
 * Sentinel-aware merge into event_details.dress_code (mirrors event.ts:314
 * writeField): a sentinel dress block never clobbers an existing real value;
 * otherwise the dress block wins.
 */
export function mergeDressCode(eventDetails: Record<string, string>, dress: string | null): void {
  if (dress === null) return;
  const existing = eventDetails["dress_code"];
  const existingIsReal = existing !== undefined && !shouldHideGenericOptional(existing);
  const incomingIsSentinel = shouldHideGenericOptional(dress);
  if (incomingIsSentinel && existingIsReal) return;
  eventDetails["dress_code"] = dress;
}
