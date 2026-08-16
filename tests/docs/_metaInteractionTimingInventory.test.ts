/**
 * tests/docs/_metaInteractionTimingInventory.test.ts
 *
 * SHARELINK-CONSTANTS-INVENTORY-1 (M-wave 2 spec §2.6): `DESIGN.md` §5.5 is the
 * pinned interaction-timing inventory, and its population is DERIVED rather than
 * hand-listed.
 *
 * The derivation is the whole point. A hand-authored sweep and a test generated
 * from that sweep share the same omissions, so the pair agrees about a world
 * neither one checked. Here the expected rows come from
 * `scripts/scan-interaction-timings.ts` reading the source, and §5.5 is compared
 * against them in BOTH directions: a timing the scanner finds and the document
 * omits fails by name, and a row the document carries that the scanner cannot
 * find fails too (a stale row is a lie with a longer half-life than a missing
 * one).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  EXCLUDED_PREFIXES,
  inventoryRows,
  scanRepo,
  scanTimingSites,
  UNCLASSIFIED_DISPOSITIONS,
} from "@/scripts/scan-interaction-timings";
import { premise, premiseHolds } from "../_shared/premise";

const REPO_ROOT = process.cwd();
const DESIGN_MD = readFileSync(join(REPO_ROOT, "DESIGN.md"), "utf8");

/**
 * A §5.5 inventory row: three cells — label, value, owning file.
 *
 * Parsed as GENERAL GFM rather than one exact spelling. The first version
 * demanded backticks on cells one and three and outer pipes with no leading
 * space, so an ordinary legal row — `| STALE_MS | 123 | components/Foo.tsx |`,
 * or the same row indented — was silently skipped. That is worse than a missing
 * check: it made the reverse-parity claim ("a row §5.5 lists that the scanner
 * cannot find fails") true only for rows written one particular way, and a stale
 * row spelled any other way would have sat there unread (brief C r1 F2).
 *
 * Backticks are optional and stripped, and the OUTER pipes are optional too —
 * GFM permits omitting either or both, and all three of those spellings render
 * as table rows while the first two versions of this pattern skipped them
 * (brief C r1 F2, then again on the confirming round). The header and its
 * `---` separator are rejected by the numeric cell.
 */
const ROW = /^\s*\|?([^|]+)\|([^|]+)\|([^|]+)\|?\s*$/;
const cell = (raw: string): string => raw.trim().replace(/^`([^`]*)`$/, "$1").trim();

function inventorySection(): string {
  const start = DESIGN_MD.indexOf("### 5.5 Interaction constants");
  const after = DESIGN_MD.indexOf("\n## 6.", start);
  premiseHolds("DESIGN.md still has a §5.5 that ends before §6", start >= 0 && after > start);
  return DESIGN_MD.slice(start, after);
}

function documentedRows(): { label: string; value: number; file: string }[] {
  return inventorySection()
    .split("\n")
    .map((line) => ROW.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ label: cell(m[1]!), value: Number(cell(m[2]!)), file: cell(m[3]!) }))
    // The header row and the `---` separator survive the shape test and are
    // rejected here, by the one cell whose type the contract fixes.
    .filter((r) => Number.isFinite(r.value));
}

const key = (r: { label: string; value: number; file: string }): string =>
  `${r.file} :: ${r.label} = ${r.value}`;

describe("DESIGN.md §5.5 interaction-timing inventory", () => {
  test("the scanner's population is non-trivial and fully classified", () => {
    const result = scanRepo(REPO_ROOT);
    // Premise: an empty or single-row scan could agree with any document at all.
    premise("the scan universe yields a real population", inventoryRows(result).length, 1);
    premise("the scan walks a real tree", result.filesScanned, 50);
    expect(
      result.unclassified.map((s) => `${s.file}:${s.line} ${s.name}`),
      "timer delays that resolve to no covered binding and carry no disposition",
    ).toEqual([]);
  });

  test("§5.5 lists exactly the derived population, by name, value and owning file", () => {
    const derived = inventoryRows(scanRepo(REPO_ROOT)).map(key).sort();
    const documented = documentedRows().map(key).sort();
    // Premise: a document with no parsable rows would make the "documented ⊇
    // derived" direction vacuous and the other direction trivially true.
    premise("§5.5 carries parsable inventory rows", documented.length, 1);

    expect(
      derived.filter((row) => !documented.includes(row)),
      "timings the scanner found that §5.5 does not list",
    ).toEqual([]);
    expect(
      documented.filter((row) => !derived.includes(row)),
      "rows §5.5 lists that the scanner cannot find (stale citations)",
    ).toEqual([]);
  });

  test("a planted unlisted constant is caught by the recognizer", () => {
    // The premise fixture: proof that the guard's failure mode is reachable at
    // all. If the recognizer stopped matching, this test — not the parity test —
    // is the one that tells you why, which is the difference between "the code
    // is wrong" and "this environment cannot see the code".
    const planted = scanTimingSites(
      [
        "const SOMETHING_ELSE = 3;",
        "const PLANTED_RESET_MS = 1234;",
        "const plantedHoverDelay = 55;",
        "function f({ plantedTimeoutMs = 99 }) { return plantedTimeoutMs; }",
        "setTimeout(() => {}, 4321);",
        "const motion = { duration: 0.4 };",
      ].join("\n"),
      "components/__planted__.tsx",
    );
    const found = planted.map((s) => `${s.kind}:${s.name ?? s.value}`);
    expect(found).toContain("named-constant:PLANTED_RESET_MS");
    expect(found).toContain("named-constant:plantedHoverDelay");
    expect(found).toContain("named-constant:plantedTimeoutMs");
    expect(found).toContain("timer-literal:4321");
    expect(found).toContain("motion-duration:0.4");
    // A number whose name says nothing about time is NOT a timing.
    expect(found.some((f) => f.includes("SOMETHING_ELSE"))).toBe(false);
  });

  test("the app/api exclusion is load-bearing, not a no-op carve-out", () => {
    // Three named hits inside the excluded tree. Each must still be RECOGNIZED
    // when the scanner is pointed at the file — otherwise the exclusion is
    // hiding nothing and could be deleted without effect, which is the shape of
    // a fence that quietly stopped fencing.
    const fixtures = [
      "app/api/cron/sync/route.ts",
      "app/api/admin/venue-map/route.ts",
      "app/api/observe/client-error/route.ts",
    ];
    for (const file of fixtures) {
      const sites = scanTimingSites(readFileSync(join(REPO_ROOT, file), "utf8"), file);
      premise(`${file} carries a timing the recognizer sees`, sites.length, 0);
    }
    const universe = scanRepo(REPO_ROOT).sites.map((s) => s.file);
    expect(
      universe.filter((f) => EXCLUDED_PREFIXES.some((p) => f.startsWith(p))),
      "excluded-tree files that leaked into the scanned universe",
    ).toEqual([]);
  });
});

// ── Property-totality census pins (BL-TIMING-SCAN-PROPERTY-TOTALITY) ─────────

describe("the non-literal timing-property census", () => {
  /** The six live sites, by (file, propertyKey, name) and by COUNT. */
  const CENSUS: ReadonlyArray<readonly [string, string, string, number]> = [
    ["components/admin/telemetry/EventRow.tsx", "duration", "reduce ? 0 : 0.22", 1],
    ["components/crew/CrewSectionTransition.tsx", "duration", "duration", 1],
    ["components/crew/RightNowHero.tsx", "duration", "prefersReducedMotion === true ? 0 : 0.22", 1],
    ["components/diagrams/GalleryLightbox.tsx", "duration", "emblaDuration(prefersReducedMotion)", 2],
    ["components/diagrams/GalleryLightbox.tsx", "duration", "motionDuration", 1],
  ];

  const unclassifiedCounts = (): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const site of scanRepo(REPO_ROOT).sites) {
      if (site.kind !== "unclassified" || site.propertyKey === undefined) continue;
      const k = `${site.file} ${site.propertyKey} ${site.name}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  };

  test("every census site is live, with its exact COUNT", () => {
    // Counts, not containment: the two GalleryLightbox `emblaDuration(...)`
    // calls are the identical expression, so a containment check keyed without
    // a count cannot see ONE of them disappear. That is line-independent — it
    // survives the file moving — while still failing if an occurrence is lost.
    const counts = unclassifiedCounts();
    premise("the repo scan produced unclassified property sites at all", counts.size, 0);
    const actual = CENSUS.map(([f, k, n]) => [f, k, n, counts.get(`${f} ${k} ${n}`) ?? 0]);
    expect(actual).toEqual(CENSUS.map((row) => [...row]));
  });

  test("every disposition row matches at least one live site", () => {
    // `scanRepo` only ever SUBTRACTS disposition keys, so a stale row is
    // invisible to every other assertion — it silently excuses nothing.
    const live = new Set<string>();
    for (const site of scanRepo(REPO_ROOT).sites) {
      if (site.kind === "unclassified") live.add(`${site.file} ${site.name}`);
    }
    premiseHolds("the scan produced unclassified sites to match against", live.size > 0);
    const stale = UNCLASSIFIED_DISPOSITIONS.filter((row) => !live.has(`${row.file} ${row.name}`)).map(
      (row) => `${row.file} ${row.name}`,
    );
    expect(stale, "disposition rows matching no live site").toEqual([]);
  });
});
