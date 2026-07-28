// Spec 2026-07-27-export-blank-row-segmentation §6 T6 (corpus zero-warning) +
// T9 (split-recall ratchet with a frozen universe).
//
// T6 failure mode: discriminator drift re-admitting the probe-3/4 false-positive
// classes on intact live sheets (GEAR lists under room headers, GS Strike Time
// rows, ROLE legends, FORM labels).
//
// T9 failure mode: a discriminator or locator change that silently trades away
// recall. The universe is FROZEN (7 fixture slugs, every fixture >=1 crew/TECH
// block, 29 total simulated splits — the 2026-07-27 probe-5 census) so a locator
// that returns zero blocks or skips a fixture fails the pin instead of passing
// vacuously. Re-derive the literals only when the exporter corpus is
// re-snapshotted (fixtures/shows/exporter-xlsx/README.md).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSheet } from "@/lib/parser";

const orphanCount = (md: string, name: string): number =>
  parseSheet(md, name).warnings.filter((w) => w.code === "ORPHANED_CREW_ROWS").length;

describe("ORPHANED_CREW_ROWS corpus zero-warning walker (T6)", () => {
  const ROOTS = [
    "fixtures/shows/exporter-xlsx",
    "fixtures/shows/raw",
    "fixtures/shows/synthetic",
    "fixtures/shows/email-embedded",
    "fixtures/shows/pdf-only",
  ];
  for (const root of ROOTS) {
    const files = readdirSync(join(process.cwd(), root)).filter(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
    it(`${root}: every committed fixture parses with zero orphan warnings (${files.length} files)`, () => {
      expect(files.length).toBeGreaterThan(0); // traversal-rot guard: an empty dir is a failure
      for (const f of files) {
        const md = readFileSync(join(process.cwd(), root, f), "utf8");
        expect(orphanCount(md, f), `${root}/${f}`).toBe(0);
      }
    });
  }
});

describe("ORPHANED_CREW_ROWS split-recall ratchet (T9, frozen universe)", () => {
  const DIR = join(process.cwd(), "fixtures/shows/exporter-xlsx");
  const SLUGS = [
    "consultants",
    "east-coast",
    "fintech",
    "fixed-income",
    "redefining-fi",
    "ria",
    "rpas",
  ] as const;
  const isDelim = (l: string) => /^\|(\s*:?-+:?\s*\|)+\s*$/.test(l.trim());
  const firstTok = (line: string): string => {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim()); // canonicalize-exempt: markdown cell whitespace, not an email
    return (cells.find((c) => c.length > 0) ?? "").toUpperCase();
  };

  it("all 7 fixtures found; every fixture has >=1 crew/TECH block; 29 simulated splits all detected", () => {
    const found = readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
    expect(found.sort()).toEqual(SLUGS.map((s) => `${s}.md`).sort());

    let totalSplits = 0;
    for (const slug of SLUGS) {
      const md = readFileSync(join(DIR, `${slug}.md`), "utf8");
      const blocks = md.split(/\n{2,}/);
      let crewBlocks = 0;
      blocks.forEach((block, blockIndex) => {
        const lines = block.split("\n");
        const dataRows = lines.filter((l) => l.trim().startsWith("|")).filter((l) => !isDelim(l));
        if (dataRows.length < 2) return;
        if (!/^(CREW|TECH)\b/.test(firstTok(dataRows[0]!))) return;
        crewBlocks += 1;
        // simulate a blank-row split before EVERY internal data row of this block
        for (let i = 1; i < dataRows.length; i += 1) {
          totalSplits += 1;
          const splitBlock = [
            [dataRows[0]!, lines.find(isDelim) ?? "", ...dataRows.slice(1, i)].join("\n"),
            dataRows.slice(i).join("\n"),
          ].join("\n\n");
          const mutated = [...blocks.slice(0, blockIndex), splitBlock, ...blocks.slice(blockIndex + 1)].join(
            "\n\n",
          );
          expect(
            orphanCount(mutated, `${slug}--split${i}.md`),
            `${slug} crew block, split before row ${i}`,
          ).toBeGreaterThanOrEqual(1);
        }
      });
      expect(crewBlocks, `${slug}: crew/TECH block located`).toBeGreaterThanOrEqual(1);
    }
    expect(totalSplits).toBe(29); // frozen probe-5 census; re-derive on corpus re-snapshot
  });
});
