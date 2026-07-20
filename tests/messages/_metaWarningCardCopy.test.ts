// tests/messages/_metaWarningCardCopy.test.ts
// (spec 2026-07-20-warning-card-copy-restore §3.5)
//
// Structural meta-test for warning-card copy: every registry code carries a
// title + condensed helpfulContext (inline card guidance) + triggerContext
// (? popover), within caps, free of reader-facing jargon, and byte-identical
// to the spec §4.2 table via the frozen fixture. The corpus oracle parses the
// committed fixture corpus and requires every emitted warn-severity code to be
// registered — behavioral fails-by-default for corpus-exercised parser codes
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
import {
  WARNING_CARD_COPY_CODES,
  EXPECTED_TRIGGER_CONTEXT,
  EXPECTED_TITLE_CHANGES,
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
