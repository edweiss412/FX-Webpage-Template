import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";
import { CANONICAL_KEY_MAP } from "@/lib/parser/blocks/event";
import { isSensitiveCanonicalKey } from "@/lib/parser/gearClassification";

const md = (f: string) => readFileSync(`fixtures/shows/${f}`, "utf8");

// Every canonical key the closed-vocab form harvest is allowed to emit. Any harvested
// key MUST be one of these (closed-vocabulary principle, spec §3.4) — the set that
// structurally excludes PII/financial/metadata (they have no CANONICAL_KEY_MAP entry).
const KNOWN_CANON = new Set<string>(Object.values(CANONICAL_KEY_MAP));

// PII / contact metadata that an open-vocab (toCanonicalKey-for-unknowns) harvest would
// leak from the intake form. Under closed-vocab these are unknown labels → never emitted.
const PII_KEY_RE =
  /^(your_name|email_address|phone_number|title_of_event|logistics_director|venue_name.*|program_(start|end).*|timestamp|onsite_av.*|hotel_contact.*|technician.*|.*room_setup.*|.*room_strike.*|.*_name|.*_names)$/;

function assertNoPiiOrFinancial(ed: Record<string, string>, label: string): void {
  const keys = Object.keys(ed);
  const pii = keys.filter((k) => PII_KEY_RE.test(k));
  expect(pii, `${label} leaked PII keys: ${pii.join(",")}`).toEqual([]);
  const financial = keys.filter(isSensitiveCanonicalKey);
  expect(financial, `${label} leaked financial keys: ${financial.join(",")}`).toEqual([]);
}

// Pre-change classic-only baselines (captured from the parser before this milestone). The
// CONDITIONAL gate means these working shows (populated classic block) are byte-identical
// after the change — the form harvest never runs for them.
const EAST_ED: Record<string, string> = {
  internet: "The conference wifi has 20mb download speed.",
  keynote_requirements: "NONE",
  led: "NO",
  live_streaming: "NO",
  opening_reel: "YES - LOOP VIDEO",
  polling: "YES",
  power: "Only 2 circuits in Mabel Room - this setup needs additional power",
  record: "NO",
  scenic: "(1) Section Printed Spandex (4) Sections Grey Spandex",
  stage: "8' x 24' x 2'",
  storage: "Back of house near kitchen area",
  test_pattern: "16 x 9 Test Pattern",
  truss_podium: "YES",
};
const RPAS_ED: Record<string, string> = {
  diagrams: "LINK",
  led: "N/A",
  scenic: "(1) II Blue Logo Spandex (2) Sections Grey Spandex",
  stage_size: "8' x 24' x 2'",
  opening_reel: "MAYBE",
  keynote_requirements: "TBD",
  virtual_speaker: "N/A",
  virtual_audience: "N/A",
  podium_type: "Truss Podium",
  record: "N/A",
  polling: "YES",
  internet: "Wifi from Encore",
  power: "(2) Power Drops from Engineering",
  equipment_storage: "Behind Spandex Set",
  staff_office_room: "TBD",
  fonts: "Aptos Font Folder",
  test_pattern: "16 x 9 Test Pattern",
};

describe("EVENT closed-vocab form-layout harvest — conditional, dropped-block scope (spec §3.4)", () => {
  // 1 — the gear-surface goal: consultants' DROPPED form values are recovered (classic={} →
  // harvest runs). Closed-vocab: every harvested key is a KNOWN canonical field.
  it("consultants (dropped classic block) recovers keynote + Opening Sizzle Reel via the form harvest", () => {
    const ed = parseSheet(md("raw/2025-10-consultants-roundtable.md"), "c.md").show.event_details;
    expect(ed["keynote_requirements"]).toBe("TBD");
    expect(ed["opening_reel"]).toMatch(/Available if needed/i);
    for (const k of Object.keys(ed))
      expect(KNOWN_CANON.has(k), `consultants emitted unknown key "${k}"`).toBe(true);
    assertNoPiiOrFinancial(ed, "consultants");
  });

  // 2/Negative-regression — RPAS is a WORKING show (classic=17 keys) → the form harvest is
  // GATED OFF → event_details is BYTE-IDENTICAL to the pre-change classic-only baseline. No
  // digital_signage add, no keynote "upgrade". This pins "working shows are untouched".
  it("rpas (populated classic block) is byte-identical to the 17-key classic baseline", () => {
    const ed = parseSheet(md("raw/2026-03-rpas-central-four-seasons.md"), "r.md").show
      .event_details;
    expect(ed).toEqual(RPAS_ED);
    assertNoPiiOrFinancial(ed, "rpas");
  });

  // East Coast — also a working show (no intake form anyway) → byte-identical 13 keys.
  it("east-coast (populated classic block) is byte-identical to the 13-key classic baseline", () => {
    const ed = parseSheet(md("raw/2024-05-east-coast-family-office.md"), "e.md").show.event_details;
    expect(ed).toEqual(EAST_ED);
    assertNoPiiOrFinancial(ed, "east-coast");
  });

  // fixed-income — populated classic block → form harvest gated OFF → opening_reel keeps the
  // classic value "TBD" (the form's "Opening Sizzle Reel | No" is NOT harvested). The GEAR
  // date-grid scope recovery is a separate parser and is unaffected.
  it("fixed-income (populated classic block) keeps classic opening_reel='TBD' (form not harvested)", () => {
    const ed = parseSheet(md("exporter-xlsx/fixed-income.md"), "fi.md").show.event_details;
    expect(ed["opening_reel"]).toBe("TBD");
    assertNoPiiOrFinancial(ed, "fixed-income");
  });

  // GATE proof (non-tautological): the harvest fires iff the classic block dropped everything.
  it("gate ON: an EMPTY classic block (header only) lets a later form block be harvested", () => {
    const synthetic = [
      "| EVENT DETAILS | EVENT DETAILS |",
      "| :---: | :---: |",
      "", // classic block has NO data rows → event_details still empty → harvest runs
      "| Keynote Requirements | FORM-VALUE |",
      "| Virtual Speaker | yes |",
      "| Stage Size | 20x30 |",
    ].join("\n");
    const ed = parseSheet(synthetic, "s.md").show.event_details;
    expect(ed["keynote_requirements"]).toBe("FORM-VALUE");
    expect(ed["stage_size"]).toBe("20x30");
  });

  it("gate OFF: a POPULATED classic block leaves a later form block un-harvested", () => {
    const synthetic = [
      "| EVENT DETAILS | EVENT DETAILS |",
      "| :---: | :---: |",
      "| Opening Reel | YES |", // classic produces a key → event_details non-empty
      "", // → harvest is GATED OFF
      "| Keynote Requirements | FORM-ONLY |", // 3 known labels — would anchor IF the harvest ran
      "| Virtual Speaker | yes |",
      "| Stage Size | 20x30 |",
    ].join("\n");
    const ed = parseSheet(synthetic, "s.md").show.event_details;
    expect(ed["opening_reel"]).toBe("YES"); // classic value intact
    expect(ed["keynote_requirements"]).toBeUndefined(); // form NOT harvested (working show untouched)
    expect(ed["stage_size"]).toBeUndefined();
  });
});
