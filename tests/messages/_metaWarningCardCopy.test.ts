// tests/messages/_metaWarningCardCopy.test.ts
// (spec 2026-07-20-warning-card-copy-restore §3.5)
//
// Structural meta-test for warning-card copy: every registry code carries a
// title + condensed helpfulContext (inline card guidance) + triggerContext
// (? popover), within caps, free of reader-facing jargon. Byte-identity to the
// spec §4.2 table is frozen for triggerContext AND helpfulContext on EVERY
// registry code (rows 1-42 back-filled by spec
// 2026-08-01-card-copy-parity-sync-job-name; BL-CARD-COPY-HELPFULCONTEXT-PARITY
// graduated), and for the changed titles (seven as of 2026-08-15) plus the
// longExplanation bodies enrolled in EXPECTED_LONG_EXPLANATION — the two fields
// no other gate governs (§12.4 parity compares four fields; §4.2 has no
// longExplanation column). The corpus oracle parses the
// committed fixture corpus and requires every emitted warn-severity code to be
// registered, behavioral fails-by-default for corpus-exercised parser codes
// (spec §3.5.4 scope: sync/enrichment producers rely on the AGENTS.md
// new-code checklist instead; a code slipping both layers renders today's
// title-only card, never a raw code).
//
// The catalog is read through an untyped Record view DELIBERATELY (spec §8.1):
// the pre-copy red state must be missing VALUES, not a missing type property.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { parseSheet } from "@/lib/parser";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";
import { premise } from "../_shared/premise";
import {
  WARNING_CARD_COPY_CODES,
  EXPECTED_TRIGGER_CONTEXT,
  EXPECTED_TITLE_CHANGES,
  EXPECTED_HELPFUL_CONTEXT,
  EXPECTED_LONG_EXPLANATION,
  EXPECTED_CORPUS_WARN_CODES,
  EXPECTED_CORPUS_FIXTURES,
} from "./warningCardCopyRegistry";

const CATALOG = MESSAGE_CATALOG as Record<string, Record<string, unknown>>;
const EM_DASH = String.fromCodePoint(0x2014);
const BANNED = new RegExp(
  String.raw`\b(pars(?:e|er|ed|ing)|token|extractor|positional|canonical(?:ize)?|structured|ingest(?:ion)?|fallback|enum|RPC|payload|metadata|variant|null|(?:un)?parseable)\b` +
    "|" +
    EM_DASH,
  "iu",
);
const CORPUS_DIR = "fixtures/shows/raw";

describe("warning-card copy registry (spec 2026-07-20-warning-card-copy-restore §3.5)", () => {
  const codes = [...WARNING_CARD_COPY_CODES].sort();

  it("every registry code: non-empty title, capped helpfulContext, capped triggerContext", () => {
    for (const code of codes) {
      const e = CATALOG[code];
      expect(e, `${code} missing from catalog`).toBeDefined();
      if (!e) continue;
      expect(
        typeof e.title === "string" && (e.title as string).trim().length > 0,
        `${code}.title`,
      ).toBe(true);
      const hc = e.helpfulContext;
      expect(
        typeof hc === "string" && hc.trim().length > 0 && hc.length <= 300,
        `${code}.helpfulContext cap`,
      ).toBe(true);
      const tc = e.triggerContext;
      expect(
        typeof tc === "string" && tc.trim().length > 0 && tc.length <= 160,
        `${code}.triggerContext cap`,
      ).toBe(true);
    }
  });

  it("banned vocabulary + em-dash absent from the three authored fields", () => {
    for (const code of codes) {
      const e = CATALOG[code];
      if (!e) continue;
      for (const field of ["title", "helpfulContext", "triggerContext"] as const) {
        const v = e[field];
        if (typeof v !== "string") continue;
        const m = BANNED.exec(v);
        expect(m, `${code}.${field} banned term ${JSON.stringify(m?.[0])}`).toBeNull();
      }
    }
  });

  it("frozen copy fixture: triggerContext + changed titles match spec §4.2 byte-for-byte", () => {
    for (const code of codes) {
      expect(CATALOG[code]?.triggerContext, `${code}.triggerContext`).toBe(
        EXPECTED_TRIGGER_CONTEXT[code],
      );
    }
    for (const [code, title] of Object.entries(EXPECTED_TITLE_CHANGES)) {
      expect(CATALOG[code]?.title, `${code}.title`).toBe(title);
    }
  });

  it("canonical §4.2 rows and the catalog agree, read from the DOCUMENT itself", () => {
    // A fixture that duplicates the table's strings cannot detect the table changing:
    // editing a canonical row alone would leave the suite green while the doc
    // and the shipped copy diverge. This reads the document, so either side moving
    // fails. Covers every registry code: EXPECTED_HELPFUL_CONTEXT is total (see
    // key-set assertion below).
    const doc = readFileSync(
      join(process.cwd(), "docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md"),
      "utf8",
    );
    const rowFor = (code: string): { helpfulContext: string; triggerContext: string } => {
      const line = doc
        .split("\n")
        .find((l) => l.startsWith("| ") && l.split("|")[2]?.trim().split(/\s/)[0] === code);
      expect(line, `no §4.2 row for ${code}`).toBeDefined();
      const cells = line!.split("|");
      return { helpfulContext: cells[3]!.trim(), triggerContext: cells[4]!.trim() };
    };
    for (const code of Object.keys(EXPECTED_HELPFUL_CONTEXT)) {
      const row = rowFor(code);
      expect(CATALOG[code]?.helpfulContext, `${code} §4.2 helpfulContext`).toBe(row.helpfulContext);
      expect(CATALOG[code]?.triggerContext, `${code} §4.2 triggerContext`).toBe(row.triggerContext);
    }
  });

  it("frozen copy fixture: helpfulContext matches spec §4.2 byte-for-byte", () => {
    // Covers every registry code: EXPECTED_HELPFUL_CONTEXT is total (key-set
    // assertion below). A typo in EITHER the canonical §4.2 row or the catalog
    // entry fails here.
    expect(Object.keys(EXPECTED_HELPFUL_CONTEXT).sort()).toEqual(
      [...WARNING_CARD_COPY_CODES].sort(),
    );
    for (const [code, helpfulContext] of Object.entries(EXPECTED_HELPFUL_CONTEXT)) {
      expect(WARNING_CARD_COPY_CODES.has(code), `${code} registered`).toBe(true);
      expect(CATALOG[code]?.helpfulContext, `${code}.helpfulContext`).toBe(helpfulContext);
    }
  });

  it("frozen copy fixture: enrolled longExplanation bodies match byte-for-byte", () => {
    // The /help/errors body (app/help/errors/page.tsx:94) is outside BOTH parity
    // gates: x1 compares four §12.4 fields and the §4.2 table has no
    // longExplanation column. Enrolled codes are pinned here so a help-page body
    // cannot silently drift. Premise: the map must be non-empty and every key a
    // registered code, or this loop asserts over nothing and passes forever.
    premise(
      "EXPECTED_LONG_EXPLANATION enrolls at least one code",
      Object.keys(EXPECTED_LONG_EXPLANATION).length,
      0,
    );
    for (const [code, longExplanation] of Object.entries(EXPECTED_LONG_EXPLANATION)) {
      expect(WARNING_CARD_COPY_CODES.has(code), `${code} registered`).toBe(true);
      expect(CATALOG[code]?.longExplanation, `${code}.longExplanation`).toBe(longExplanation);
    }
  });

  it("OPERATOR_ACTIONABLE_ANCHORED is a subset of the registry", () => {
    for (const code of OPERATOR_ACTIONABLE_ANCHORED) {
      expect(WARNING_CARD_COPY_CODES.has(code), code).toBe(true);
    }
  });

  it("corpus oracle: fixture list + emitted warn-code set frozen; every emitted code registered (spec §3.5.4)", () => {
    const files = readdirSync(CORPUS_DIR)
      .filter((f) => f.endsWith(".md") && !f.startsWith(CORPUS_TEMP_PREFIX))
      .sort();
    expect(new Set(files)).toEqual(EXPECTED_CORPUS_FIXTURES);
    const emitted = new Set<string>();
    for (const f of files) {
      const parsed = parseSheet(readFileSync(join(CORPUS_DIR, f), "utf8"), f);
      for (const w of parsed.warnings) if (w.severity === "warn") emitted.add(w.code);
    }
    for (const code of emitted) {
      expect(
        WARNING_CARD_COPY_CODES.has(code),
        `corpus emitted unregistered warn code ${code}`,
      ).toBe(true);
    }
    expect(emitted).toEqual(EXPECTED_CORPUS_WARN_CODES);
  });
});
