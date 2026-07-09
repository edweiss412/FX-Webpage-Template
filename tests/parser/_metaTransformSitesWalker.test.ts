// tests/parser/_metaTransformSitesWalker.test.ts
//
// STRUCTURAL WALKER (spec 2026-07-07-ambiguity-warnings-v1 §6). Filesystem-walked,
// fails-by-default for any NEW file under lib/parser/blocks/ (mirrors the line-4
// contract of _metaKnownSectionsWalker.test.ts). Every block file MUST export
// `TRANSFORM_SITES` — a list of the file's value-producing transform sites, each
// either warning-backed (`{ site, code }`) or documented as exempt
// (`{ site, exempt: "deterministic" | "verbatim" | "deferred:BL-<REF>" }`).
//
// Asserts spec §6 (1)(2)(4)(5):
//   (1) export present on every block file (a file with zero sites exports `[]`);
//   (2) every declared `code` passes `isMessageCode` (lib/messages/lookup.ts:91) —
//       NO catalog-severity assertion (retired R8: severity is optional/"warning",
//       and ParseWarning.severity==="warn" is proven by each site's emit unit test);
//   (4) the five required named declarations exist (crew → CREW_COLUMN_POSITIONAL_FALLBACK;
//       rooms → ROOM_HEADER_SPLIT_AMBIGUOUS; hotels → HOTEL_GUEST_SPLIT_AMBIGUOUS AND
//       HOTEL_CARDINALITY_EXCEEDED; dates → DATE_ORDER_SUGGESTS_DMY);
//   (5) inverse completeness — every AMBIGUITY_CODES member is declared as some file's
//       TRANSFORM_SITES code.
// PLUS the deferred-ref discipline (plan R5 hardening): every `deferred:<ref>` exempt
// value matches /^deferred:BL-[A-Z0-9-]+$/ AND the ref string appears in BACKLOG.md.
//
// HONEST LIMIT (spec §6): the walker enforces DECLARATION, not detection — a new
// undeclared transform inside an EXISTING file is a review catch, not a CI catch.
// The fails-by-default property covers NEW block files and drift in declared sites.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AMBIGUITY_CODES } from "@/lib/parser/ambiguityCodes";
import { isMessageCode } from "@/lib/messages/lookup";

const BLOCKS_DIR = join(process.cwd(), "lib/parser/blocks");
const BACKLOG_PATH = join(process.cwd(), "BACKLOG.md");

type TransformSiteEntry = { site: string; code: string } | { site: string; exempt: string };

interface Scanned {
  file: string;
  sites: readonly TransformSiteEntry[];
}

// The five required per-file named declarations (spec §6(4)).
const REQUIRED_DECLARATIONS: Record<string, readonly string[]> = {
  "crew.ts": ["CREW_COLUMN_POSITIONAL_FALLBACK"],
  "rooms.ts": ["ROOM_HEADER_SPLIT_AMBIGUOUS"],
  "hotels.ts": ["HOTEL_GUEST_SPLIT_AMBIGUOUS", "HOTEL_CARDINALITY_EXCEEDED"],
  "dates.ts": ["DATE_ORDER_SUGGESTS_DMY"],
};

const DEFERRED_REF_RE = /^deferred:(BL-[A-Z0-9-]+)$/;

async function scanFiles(): Promise<Scanned[]> {
  const blockFiles = readdirSync(BLOCKS_DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );
  const out: Scanned[] = [];
  for (const file of blockFiles) {
    const path = join(BLOCKS_DIR, file);
    const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
    const sites = mod.TRANSFORM_SITES as readonly TransformSiteEntry[] | undefined;
    // (1) export present on every block file — fails-by-default for a NEW file.
    expect(
      Array.isArray(sites),
      `${file} does not export a TRANSFORM_SITES array — add \`export const TRANSFORM_SITES\` (spec §6). A file with zero transform sites exports \`[]\`.`,
    ).toBe(true);
    out.push({ file, sites: sites ?? [] });
  }
  return out;
}

describe("transform-sites source walker", () => {
  it("(1) every block file exports a TRANSFORM_SITES array", async () => {
    const scanned = await scanFiles();
    expect(scanned.length).toBeGreaterThan(0);
  });

  it("(2) every declared `code` is a catalog message code (isMessageCode)", async () => {
    const scanned = await scanFiles();
    for (const s of scanned) {
      for (const entry of s.sites) {
        if ("code" in entry) {
          expect(
            isMessageCode(entry.code),
            `${s.file}: TRANSFORM_SITES code "${entry.code}" (site "${entry.site}") is not a catalog message code`,
          ).toBe(true);
        }
      }
    }
  });

  it("(4) the five required per-file named declarations exist", async () => {
    const scanned = await scanFiles();
    const byFile = new Map(scanned.map((s) => [s.file, s.sites]));
    for (const [file, required] of Object.entries(REQUIRED_DECLARATIONS)) {
      const sites = byFile.get(file);
      expect(sites, `${file} not found under lib/parser/blocks/`).toBeTruthy();
      const codes = new Set((sites ?? []).flatMap((e) => ("code" in e ? [e.code] : [])));
      for (const code of required) {
        expect(
          codes.has(code),
          `${file} must declare a TRANSFORM_SITES entry with code "${code}" (spec §6(4))`,
        ).toBe(true);
      }
    }
  });

  it("(5) inverse completeness: every AMBIGUITY_CODES member is a declared TRANSFORM_SITES code", async () => {
    const scanned = await scanFiles();
    const declared = new Set(
      scanned.flatMap((s) => s.sites.flatMap((e) => ("code" in e ? [e.code] : []))),
    );
    const undeclared = [...AMBIGUITY_CODES].filter((c) => !declared.has(c));
    expect(
      undeclared,
      `AMBIGUITY_CODES members with no declared TRANSFORM_SITES site: ${undeclared.join(", ")}`,
    ).toEqual([]);
  });

  it("deferred exemptions use a concrete BL-<REF> present in BACKLOG.md", async () => {
    const scanned = await scanFiles();
    const backlog = readFileSync(BACKLOG_PATH, "utf8");
    for (const s of scanned) {
      for (const entry of s.sites) {
        if (!("exempt" in entry)) continue;
        if (!entry.exempt.startsWith("deferred:")) continue;
        const m = DEFERRED_REF_RE.exec(entry.exempt);
        expect(
          m,
          `${s.file}: exempt "${entry.exempt}" (site "${entry.site}") must match /^deferred:BL-[A-Z0-9-]+$/ — never a bare deferred:BACKLOG`,
        ).toBeTruthy();
        const ref = m![1]!;
        expect(
          backlog.includes(ref),
          `${s.file}: deferred ref "${ref}" (site "${entry.site}") has no matching row in BACKLOG.md`,
        ).toBe(true);
      }
    }
  });
});
