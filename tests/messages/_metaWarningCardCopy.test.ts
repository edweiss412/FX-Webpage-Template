// tests/messages/_metaWarningCardCopy.test.ts
// (spec 2026-07-20-warning-card-copy-restore §3.5)
//
// Structural meta-test for warning-card copy: every registry code carries a
// title + condensed helpfulContext (inline card guidance) + triggerContext
// (? popover), within caps, free of reader-facing jargon. Byte-identity to the
// spec §4.2 table is frozen for triggerContext AND helpfulContext on EVERY
// registry code (rows 1-42 back-filled by spec
// 2026-08-01-card-copy-parity-sync-job-name; BL-CARD-COPY-HELPFULCONTEXT-PARITY
// graduated), and for the changed titles (eight as of 2026-08-27) plus the
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
import { premise, premiseHolds } from "../_shared/premise";
import { CARD_SURFACED_LOG_ONLY } from "@/lib/messages/cardSurfacedLogOnly";
import {
  WARNING_CARD_COPY_CODES,
  EXPECTED_TRIGGER_CONTEXT,
  EXPECTED_TITLE_CHANGES,
  EXPECTED_HELPFUL_CONTEXT,
  EXPECTED_CONTROLS_NOTE,
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

  it("every card-surfaced admin-log-only code carries card copy (AC-V11)", () => {
    // Nothing enforced this implication before. CARD_SURFACED_LOG_ONLY is imported by four
    // test modules and by NONE of them for registry membership, so the three members being
    // registered was a coincidence rather than a rule. Without this, a contributor can drop a
    // code from WARNING_CARD_COPY_CODES while leaving it card-surfaced, and its copy escapes
    // the banned-vocabulary regex, the caps and the byte-fidelity freeze while still
    // rendering to an operator.
    //
    // Structural defense taken at FIRST occurrence rather than after a recurrence proves it:
    // docs/superpowers/specs/parser/2026-08-27-venue-block-predicate-design.md AC-V11.
    //
    // The floor is 0, not the current size: `premise` requires actual > mustExceed STRICTLY
    // ("Equal is not past"), so a floor equal to the membership count would throw on every
    // run. What is guarded against here is emptiness, which would make the filter below
    // trivially empty and the assertion meaningless.
    premise("card-surfaced log-only codes", CARD_SURFACED_LOG_ONLY.size, 0);
    const missing = [...CARD_SURFACED_LOG_ONLY].filter((c) => !WARNING_CARD_COPY_CODES.has(c));
    expect(missing, "card-surfaced but carrying no card copy").toEqual([]);
  });

  it("banned vocabulary + em-dash absent from the three authored fields", () => {
    for (const code of codes) {
      const e = CATALOG[code];
      if (!e) continue;
      for (const field of ["title", "helpfulContext", "triggerContext", "controlsNote"] as const) {
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

describe("spec 2026-08-27-wizard-warning-row-links-copy §4: the control sentence lives in controlsNote", () => {
  it("frozen copy fixture: controlsNote matches spec §4.2 byte-for-byte, total", () => {
    const carrying = Object.entries(CATALOG)
      .filter(([, e]) => typeof e?.controlsNote === "string")
      .map(([c]) => c)
      .sort();
    // TOTAL both ways: a string can neither drift from the frozen literal nor appear
    // unpinned. x1 (tests/cross-cutting/codes.test.ts) compares dougFacing, crewFacing,
    // followUp and helpfulContext only, so it cannot see this field at all.
    expect(Object.keys(EXPECTED_CONTROLS_NOTE).sort()).toEqual(carrying);
    for (const [code, note] of Object.entries(EXPECTED_CONTROLS_NOTE)) {
      expect(CATALOG[code]?.controlsNote, `${code}.controlsNote`).toBe(note);
    }
  });

  it("no RENDERED prose field of a card code names a card control, not just helpfulContext", () => {
    // Class sweep widened after the impeccable critique found the original miss: this
    // arc's own repair covered `helpfulContext` and left `longExplanation` naming Report
    // on PULL_SHEET_PARSE_PARTIAL - and `notePopoverParts` renders `longExplanation`
    // FIRST (NoteWarningCard.tsx, firstNonBlank(longExplanation, helpfulContext)) on a
    // card that mounts no mutate controls, plus /help/errors where there is no card at
    // all. Same defect, one field over.
    //
    // Derived cover, not a list: every RENDERED prose field of every card code. `followUp`
    // is deliberately excluded and inventoried - it is §12.4 routing prose ("Doug -> ...")
    // rendered only by the health-alert surface for health codes, never on a warning card.
    for (const field of ["helpfulContext", "longExplanation", "triggerContext"] as const) {
      const offenders = [...WARNING_CARD_COPY_CODES]
        .filter((code) => {
          const v = CATALOG[code]?.[field];
          return typeof v === "string" && /\b(Report|Ignore)\b/.test(v);
        })
        .sort();
      expect(offenders, `${field} names a card control`).toEqual([]);
    }
  });

  it("the COMPOSED guidance line stays under the cap, and no note carries an emphasis marker", () => {
    // Two impeccable-audit P3s. (1) helpfulContext is capped at 300 chars above, but the
    // card renders helpfulContext + " " + controlsNote in ONE span, so the cap stopped
    // bounding what is on screen. (2) `renderEmphasis` scans the COMPOSED string, so an
    // unbalanced `*` in one field could open an <em> spanning into the other; no carrier
    // has a marker today and this keeps it that way.
    for (const [code, note] of Object.entries(EXPECTED_CONTROLS_NOTE)) {
      const hc = CATALOG[code]?.helpfulContext;
      premiseHolds(`${code} has helpfulContext to compose with`, typeof hc === "string");
      expect(`${hc as string} ${note}`.length, `${code} composed guidance cap`).toBeLessThanOrEqual(
        300,
      );
      expect(/[*_]/.test(note), `${code}.controlsNote carries an emphasis marker`).toBe(false);
    }
  });

  it("only UNKNOWN_FIELD's note names Ignore, because Ignore's render is conditional on rawSnippet", () => {
    // The prop promises "Report + Ignore are mounted", but Ignore is gated on
    // hasIgnorableSnippet (DataQualityWarningControls.tsx). UNKNOWN_FIELD always writes a
    // rawSnippet, so the promise holds for it. A SECOND code whose note names Ignore
    // would reopen the exact bug this arc closed - a sentence naming a button that did
    // not render - silently. Adding one is then a deliberate act that must re-check the
    // snippet condition first.
    const namesIgnore = Object.entries(CATALOG)
      .filter(
        ([, e]) =>
          typeof e?.controlsNote === "string" && /\bIgnore\b/.test(e.controlsNote as string),
      )
      .map(([c]) => c)
      .sort();
    expect(namesIgnore).toEqual(["UNKNOWN_FIELD"]);
  });

  it("no helpfulContext of a card code names a card control; the sentence lives in controlsNote", () => {
    // Asserted over the WHOLE registry, not the three moved codes, so the class cannot
    // regrow on this surface. Scoped to the card codes on purpose: TILE_SERVER_RENDER_FAILED
    // and TILE_PROJECTION_FETCH_FAILED also say "use Report" in helpfulContext, but they
    // render on the alert surface where a Report control exists, and are outside this arc.
    const offenders = [...WARNING_CARD_COPY_CODES]
      .filter((code) => {
        const hc = CATALOG[code]?.helpfulContext;
        return typeof hc === "string" && /\b(Report|Ignore)\b/.test(hc);
      })
      .sort();
    expect(offenders).toEqual([]);

    const withNote: Array<[string, string]> = [];
    for (const [code, e] of Object.entries(CATALOG)) {
      const note = e?.controlsNote;
      if (typeof note === "string" && note.trim().length > 0) withNote.push([code, note]);
    }
    premiseHolds("at least the three moved rows carry a note", withNote.length >= 3);
    for (const [code, note] of withNote) {
      expect(
        WARNING_CARD_COPY_CODES.has(code),
        `${code} carries controlsNote but is not a card code`,
      ).toBe(true);
      expect(/\b(Report|Ignore)\b/.test(note), `${code}.controlsNote names no control`).toBe(true);
    }
  });
});
