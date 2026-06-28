import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";
import { CANONICAL_KEY_MAP } from "@/lib/parser/blocks/event";
import { isSensitiveCanonicalKey } from "@/lib/parser/gearClassification";

const md = (f: string) => readFileSync(`fixtures/shows/${f}`, "utf8");

// Every canonical key the closed-vocab form harvest is allowed to emit. Any harvested
// key MUST be one of these (closed-vocabulary principle, spec §3.4) — this is the set
// that structurally excludes PII/financial/metadata (they have no CANONICAL_KEY_MAP entry).
const KNOWN_CANON = new Set<string>(Object.values(CANONICAL_KEY_MAP));

// PII / contact metadata that the OLD whole-block (toCanonicalKey-for-unknowns) harvest
// leaked from the intake form. Under closed-vocab these are unknown labels → never emitted.
const PII_KEY_RE =
  /^(your_name|email_address|phone_number|title_of_event|logistics_director|venue_name.*|program_(start|end).*|timestamp|onsite_av.*|hotel_contact.*|technician.*|.*room_setup.*|.*room_strike.*|.*_name|.*_names)$/;

function assertNoPiiOrFinancial(ed: Record<string, string>, label: string): void {
  const keys = Object.keys(ed);
  const pii = keys.filter((k) => PII_KEY_RE.test(k));
  expect(pii, `${label} leaked PII keys: ${pii.join(",")}`).toEqual([]);
  const financial = keys.filter(isSensitiveCanonicalKey);
  expect(financial, `${label} leaked financial keys: ${financial.join(",")}`).toEqual([]);
}

describe("EVENT closed-vocab form-layout harvest (spec §3.4)", () => {
  // 1 — the gear-surface goal: consultants' dropped form values are recovered.
  it("consultants form-layout recovers keynote + Opening Sizzle Reel (closed-vocab)", () => {
    const ed = parseSheet(md("raw/2025-10-consultants-roundtable.md"), "c.md").show.event_details;
    expect(ed["keynote_requirements"]).toBe("TBD");
    expect(ed["opening_reel"]).toMatch(/Available if needed/i);
    // Every harvested key is a KNOWN canonical field (closed-vocab) — nothing else leaks in.
    for (const k of Object.keys(ed))
      expect(KNOWN_CANON.has(k), `consultants emitted unknown key "${k}"`).toBe(true);
  });

  // 2 — permission boundary: NO PII / financial key in consultants OR rpas.
  it("consultants: no PII / financial key", () => {
    assertNoPiiOrFinancial(
      parseSheet(md("raw/2025-10-consultants-roundtable.md"), "c.md").show.event_details,
      "consultants",
    );
  });
  it("rpas: no PII / financial key (intake form harvested closed-vocab)", () => {
    assertNoPiiOrFinancial(
      parseSheet(md("raw/2026-03-rpas-central-four-seasons.md"), "r.md").show.event_details,
      "rpas",
    );
  });

  // 3 — RPAS negative-regression. NOT byte-identical / exactly-17: the intake form may
  // legitimately ADD a known crew-safe field (digital_signage) and UPGRADE classic
  // SENTINEL values (TBD/N/A) with the form's real answer (the same first-real-wins
  // sentinel-upgrade mechanism fixed-income's opening_reel relies on). The strong
  // invariants: every classic key still present; every classic REAL value preserved
  // EXACTLY (first-real-wins); every EXTRA key is a known canonical field; no PII/financial.
  it("rpas: classic real values preserved, classic keys present, extras known-safe", () => {
    const ed = parseSheet(md("raw/2026-03-rpas-central-four-seasons.md"), "r.md").show
      .event_details;
    // The 11 classic REAL (non-sentinel) key/values — preserved byte-for-byte.
    const RPAS_CLASSIC_REAL: Record<string, string> = {
      diagrams: "LINK",
      scenic: "(1) II Blue Logo Spandex (2) Sections Grey Spandex",
      stage_size: "8' x 24' x 2'",
      opening_reel: "MAYBE",
      podium_type: "Truss Podium",
      polling: "YES",
      internet: "Wifi from Encore",
      power: "(2) Power Drops from Engineering",
      equipment_storage: "Behind Spandex Set",
      fonts: "Aptos Font Folder",
      test_pattern: "16 x 9 Test Pattern",
    };
    for (const [k, v] of Object.entries(RPAS_CLASSIC_REAL)) expect(ed[k], `rpas.${k}`).toBe(v);
    // The 6 classic SENTINEL keys remain present (value may be upgraded by the form).
    for (const k of [
      "led",
      "keynote_requirements",
      "virtual_speaker",
      "virtual_audience",
      "record",
      "staff_office_room",
    ])
      expect(Object.keys(ed), `rpas missing classic sentinel key ${k}`).toContain(k);
    // Any key beyond the original 17 classic keys must be a known canonical field.
    const CLASSIC_17 = new Set([...Object.keys(RPAS_CLASSIC_REAL), "led", "keynote_requirements", "virtual_speaker", "virtual_audience", "record", "staff_office_room"]); // prettier-ignore
    for (const k of Object.keys(ed))
      if (!CLASSIC_17.has(k))
        expect(KNOWN_CANON.has(k), `rpas extra key "${k}" is not a known canonical field`).toBe(
          true,
        );
  });

  // 4 — East Coast has NO intake form → the harvest is a no-op → byte-identical 13 keys.
  it("east-coast: event_details unchanged (no intake form) + no PII/financial", () => {
    const ed = parseSheet(md("raw/2024-05-east-coast-family-office.md"), "e.md").show.event_details;
    expect(ed).toEqual({
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
    });
    assertNoPiiOrFinancial(ed, "east-coast");
  });

  // 5 — mixed sheet: classic Opening Reel = TBD (sentinel) upgraded by the later form
  // "Opening Sizzle Reel | No" (real) → opening_reel === "No".
  it("fixed-income: form real 'No' upgrades classic sentinel TBD", () => {
    const ed = parseSheet(md("exporter-xlsx/fixed-income.md"), "fi.md").show.event_details;
    expect(ed["opening_reel"]).toBe("No");
    assertNoPiiOrFinancial(ed, "fixed-income");
  });

  // 6 — real-vs-real: classic real Opening Reel = YES is NOT clobbered by a HARVESTED form
  // "Opening Sizzle Reel | No"; the form-only field proves the harvest ran (R8-M2).
  it("classic real Opening Reel=YES survives a harvested form Opening Sizzle Reel=No", () => {
    const synthetic = [
      "| EVENT DETAILS | EVENT DETAILS |",
      "| :---: | :---: |",
      "| Opening Reel | YES |",
      "", // classic block: opening_reel=YES (real)
      "| Keynote Requirements | KEYNOTE-FROM-FORM |", // 3 known-vocab labels → anchor fires
      "| Virtual Speaker | yes |",
      "| Stage Size | 20x30 |",
      "| Opening Sizzle Reel | No |", // → opening_reel; must NOT clobber YES
    ].join("\n");
    const ed = parseSheet(synthetic, "s.md").show.event_details;
    expect(ed["keynote_requirements"]).toBe("KEYNOTE-FROM-FORM"); // PROVES the form harvest ran
    expect(ed["stage_size"]).toBe("20x30"); // (form-only)
    expect(ed["opening_reel"]).toBe("YES"); // first-real-wins: classic real preserved
  });
});
