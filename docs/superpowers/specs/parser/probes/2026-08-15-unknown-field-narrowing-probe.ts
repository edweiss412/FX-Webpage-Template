// Probe: audit what's KEPT vs DROPPED if UNKNOWN_FIELD sweep is narrowed to
// "the venue block only" (the pipe-block, split on /\n\s*\n/, whose rows contain
// the row that opens the current UNKNOWN_FIELD window).
//
// Mirrors docs/superpowers/plans/2026-08-08-parser-mutation-wave/05-section-order-parity-probe.md
// "Reproduce" recipe: FIXTURES from tests/parser/mutation/fixtures.ts, canonOf mirroring
// venue.ts:105-117, isTerm mirroring venue.ts:122-133, eligible(r) = col-0 non-empty,
// not VENUE, canonOf null. Attribution: greedily match each UNKNOWN_FIELD warning (in
// emission order) against the next eligible row (by col0 text) in the flat row list
// (blocks.flatMap(parseTableRows), verified == parseTableRows(wholeMd) per the doc).

import { parseSheet } from "@/lib/parser/index";
import { parseTableRows, presence } from "@/lib/parser/blocks/_helpers";
import { resolveAlias, resolveAliasFull, resolveAliasScoped } from "@/lib/parser/aliases";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";
import { FIXTURES, readFixture, type FixtureRef } from "@/tests/parser/mutation/fixtures";

const VENUE_BLOCK_TERMINATORS = new Set([
  "CREW",
  "TECH",
  "DATES",
  "TRANSPORTATION",
  "HOTEL",
  "HOTELS",
  "ROOMS",
  "CONTACTS",
  "DETAILS",
  "EVENT DETAILS",
  "GS DETAILS",
  "PULL SHEET",
  "PULL",
  "DIAGRAMS",
  "CLIENT",
  "SCHEDULE",
]);

function canonOf(col0: string): string | null {
  const full = resolveAliasFull(col0);
  if (full) return full.canonical;
  if (col0.trim() !== "") {
    const fuzzy = resolveAliasScoped(col0, "venue.");
    if (fuzzy?.corrected) return fuzzy.canonical;
  }
  return null;
}

function isTerm(col0: string): boolean {
  const upperTrimmed = col0.toUpperCase().trim();
  if (upperTrimmed === "") return false;
  return (
    VENUE_BLOCK_TERMINATORS.has(upperTrimmed) ||
    [...VENUE_BLOCK_TERMINATORS].some(
      (t) => upperTrimmed.startsWith(t + "/") || upperTrimmed.startsWith(t + " "),
    )
  );
}

function eligible(r: string[]): boolean {
  const col0 = r[0] ?? "";
  if (col0.trim() === "") return false;
  if (col0.toUpperCase().trim() === "VENUE") return false;
  return canonOf(col0) === null;
}

// Shadow-mirror of parseVenue's scope-open logic (venue.ts full loop), instrumented to
// record the FIRST row (by flat-list index) that flips inVenueFieldScope true. Faithful
// copy of the field-recognition branches in lib/parser/blocks/venue.ts — read-only probe,
// no source files modified.
function findWindowOpenRowIndex(rows: string[][]): number | null {
  let inV2VenueBlock = false;
  let name: string | null = null;
  let address: string | null = null;
  let loadingDock: string | null = null;
  let googleLink: string | null = null;
  let notes: string | null = null;
  let inVenueFieldScope = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const col0 = row[0] ?? "";
    const col0Upper = col0.toUpperCase().trim();
    const col0Full = resolveAliasFull(col0);
    let col0Canon = col0Full?.canonical ?? null;
    if (col0Canon === null && col0.trim() !== "") {
      const fuzzy = resolveAliasScoped(col0, "venue.");
      if (fuzzy?.corrected) col0Canon = fuzzy.canonical;
    }

    if (col0 !== "" && inVenueFieldScope && isTerm(col0)) {
      inVenueFieldScope = false;
    }

    if (matchesSectionHeader(col0, ["VENUE"])) {
      const subLabel = row[1] ?? "";
      const subCanon = resolveAlias(subLabel);
      if (row.length >= 3) {
        const val = presence(row[2] ?? "");
        if (subCanon === "venue.name" && val && name === null) {
          name = val;
          if (!inVenueFieldScope) return i;
          inVenueFieldScope = true;
        } else if (subCanon === "venue.address" && val && address === null) {
          address = val;
          if (!inVenueFieldScope) return i;
          inVenueFieldScope = true;
        } else if (subCanon === "venue.loading_dock" && val && loadingDock === null) {
          loadingDock = val;
          if (!inVenueFieldScope) return i;
          inVenueFieldScope = true;
        }
        // the "col1 doesn't resolve" fallback branch does NOT set inVenueFieldScope
        // (per venue.ts) — deliberately not mirrored as a scope-open trigger here.
      }
      inV2VenueBlock = true;
      continue;
    }

    if (col0 === "" && inV2VenueBlock && row.length >= 3) {
      const subLabel = row[1] ?? "";
      const subCanon = resolveAlias(subLabel);
      const val = presence(row[2] ?? "");
      if (subCanon === "venue.address" && val && address === null) {
        address = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      } else if (subCanon === "venue.loading_dock" && val && loadingDock === null) {
        loadingDock = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      } else if (subCanon === "venue.google_link" && val && googleLink === null) {
        googleLink = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      } else if (subCanon === "venue.notes" && val && notes === null) {
        notes = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      }
      continue;
    }

    if (col0 !== "" && col0Upper !== "VENUE") {
      inV2VenueBlock = false;
    }

    if (col0Canon === "venue.name") {
      const val = presence(row[1] ?? "");
      const valCanon = val !== null ? resolveAlias(val) : null;
      if (val && valCanon === null && name === null) {
        name = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      }
      continue;
    }
    if (col0Canon === "venue.address") {
      const val = presence(row[1] ?? "");
      const valCanon = val !== null ? resolveAlias(val) : null;
      if (val && valCanon === null && address === null) {
        address = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      }
      continue;
    }
    if (col0Canon === "venue.loading_dock") {
      const val = presence(row[1] ?? "");
      if (val && loadingDock === null) {
        loadingDock = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      }
      continue;
    }
    if (col0Canon === "venue.google_link") {
      const val = presence(row[1] ?? "");
      if (val && googleLink === null) {
        googleLink = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      }
      continue;
    }
    if (col0Canon === "venue.notes") {
      const val = presence(row[1] ?? "");
      if (val && notes === null) {
        notes = val;
        if (!inVenueFieldScope) return i;
        inVenueFieldScope = true;
      }
      continue;
    }
  }
  return null;
}

type Emission = { key: string; value: string; rowIndex: number | null; blockIndex: number | null };

function auditFixture(f: FixtureRef) {
  const md = readFixture(f);
  const parsed = parseSheet(md, f.path);
  const warnings = parsed.warnings.filter((w) => w.code === "UNKNOWN_FIELD");

  const blocks = md.split(/\n\s*\n/);
  const blockRowCounts = blocks.map((b) => parseTableRows(b).length);
  const flatRows = parseTableRows(md);

  // sanity: blocks.flatMap(parseTableRows) length == parseTableRows(md) length
  const flatFromBlocks = blocks.flatMap((b) => parseTableRows(b));
  const splitConsistent =
    flatFromBlocks.length === flatRows.length &&
    flatFromBlocks.every((r, i) => r.join("|") === flatRows[i]!.join("|"));

  // row index -> block index
  const rowToBlock: number[] = [];
  {
    let bi = 0;
    let remaining = blockRowCounts[0] ?? 0;
    for (let ri = 0; ri < flatRows.length; ri++) {
      while (remaining === 0 && bi < blockRowCounts.length - 1) {
        bi++;
        remaining = blockRowCounts[bi] ?? 0;
      }
      rowToBlock.push(bi);
      remaining--;
    }
  }

  const windowOpenRow = findWindowOpenRowIndex(flatRows);
  const venueBlockIndex = windowOpenRow !== null ? rowToBlock[windowOpenRow]! : null;

  // greedy attribution
  const emissions: Emission[] = [];
  let cursor = 0;
  for (const w of warnings) {
    const key = (w.blockRef as { name?: string })?.name ?? "";
    let foundIdx: number | null = null;
    for (let i = cursor; i < flatRows.length; i++) {
      const r = flatRows[i]!;
      if (eligible(r) && (r[0] ?? "").trim() === key) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx === null) {
      emissions.push({ key, value: "", rowIndex: null, blockIndex: null });
    } else {
      cursor = foundIdx + 1;
      emissions.push({
        key,
        value: (flatRows[foundIdx]![1] ?? "").trim(),
        rowIndex: foundIdx,
        blockIndex: rowToBlock[foundIdx]!,
      });
    }
  }

  return {
    fixture: f,
    md,
    totalWarnings: warnings.length,
    emissions,
    venueBlockIndex,
    blocks,
    splitConsistent,
    unmatched: emissions.filter((e) => e.rowIndex === null).length,
  };
}

function main() {
  const results = FIXTURES.map(auditFixture);
  const grandTotal = results.reduce((s, r) => s + r.totalWarnings, 0);

  console.log("=== VERIFY ===");
  console.log("grandTotal (raw parseSheet UNKNOWN_FIELD count):", grandTotal, "expected 394");
  for (const r of results) {
    if (!r.splitConsistent) {
      console.log(`  ! split-inconsistent: ${r.fixture.path}`);
    }
    if (r.unmatched > 0) {
      console.log(`  ! unmatched emissions: ${r.fixture.path} -> ${r.unmatched}`);
    }
  }

  console.log("\n=== per-fixture ===");
  let keptTotal = 0;
  let droppedTotal = 0;
  const droppedByKey = new Map<string, { count: number; block: string; examples: Set<string> }>();
  const keptByKey = new Map<string, number>();

  for (const r of results) {
    let kept = 0;
    let dropped = 0;
    for (const e of r.emissions) {
      if (e.blockIndex === null) continue; // unmatched, shouldn't happen if VERIFY clean
      if (e.blockIndex === r.venueBlockIndex) {
        kept++;
        keptByKey.set(e.key, (keptByKey.get(e.key) ?? 0) + 1);
      } else {
        dropped++;
        const blockText = r.blocks[e.blockIndex] ?? "";
        const firstLine = blockText.trim().split("\n")[0] ?? "";
        const blockRows = parseTableRows(blockText);
        const label = (blockRows[0]?.[0] ?? firstLine).trim() || "(blank col0)";
        const rowText = `${e.key} | ${e.value}`;
        const existing = droppedByKey.get(e.key) ?? {
          count: 0,
          block: label,
          examples: new Set<string>(),
        };
        existing.count++;
        existing.examples.add(rowText);
        droppedByKey.set(e.key, existing);
      }
    }
    keptTotal += kept;
    droppedTotal += dropped;
    console.log(
      `${r.fixture.path.padEnd(55)} total=${r.totalWarnings.toString().padStart(4)} kept=${kept
        .toString()
        .padStart(4)} dropped=${dropped.toString().padStart(4)} venueBlockIdx=${r.venueBlockIndex}`,
    );
  }

  console.log("\n=== TOTALS ===");
  console.log("kept:", keptTotal, "dropped:", droppedTotal, "sum:", keptTotal + droppedTotal);

  console.log("\n=== dropped keys (all distinct, grouped implicitly, sorted by count desc) ===");
  const droppedSorted = [...droppedByKey.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [key, info] of droppedSorted) {
    console.log(
      `${info.count.toString().padStart(4)}  [${info.block}]  "${key}"  ex: ${[...info.examples]
        .slice(0, 3)
        .join("  ||  ")}`,
    );
  }

  console.log("\n=== kept keys (all distinct, sorted by count desc) ===");
  const keptSorted = [...keptByKey.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of keptSorted) {
    console.log(`${count.toString().padStart(4)}  "${key}"`);
  }

  // dump JSON for the report-writing step
  const dump = {
    grandTotal,
    keptTotal,
    droppedTotal,
    droppedByKey: droppedSorted.map(([key, info]) => ({
      key,
      count: info.count,
      block: info.block,
      examples: [...info.examples].slice(0, 3),
    })),
    keptByKey: keptSorted.map(([key, count]) => ({ key, count })),
    perFixture: results.map((r) => ({
      path: r.fixture.path,
      total: r.totalWarnings,
      venueBlockIndex: r.venueBlockIndex,
    })),
  };
  require("node:fs").writeFileSync(
    ".claude/tmp/unknown-field-narrowing-audit.json",
    JSON.stringify(dump, null, 2),
  );
}

main();
