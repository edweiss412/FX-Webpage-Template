/**
 * tests/crew/wifiDisplay.test.ts — AC-1 / AC-2 for the display-time Wi-Fi splitter.
 *
 * Every SPLIT case is a verbatim `event_details.internet` value from the §4
 * full-corpus probe (docs/superpowers/specs/crew/2026-08-09-crew-wifi-room-enrichment-design.md),
 * across BOTH fixture families AND the live sheets. Expected values are typed
 * literals transcribed from the spec's §4 table — never derived by running the
 * parser (anti-tautology: a test that computes its own expectation cannot fail).
 *
 * The fixture-sourced values additionally carry an executable provenance check
 * (`corpus provenance`) that re-reads each fixture file: if a fixture is
 * re-exported and its internet cell changes, this suite goes red on the
 * PROVENANCE assertion instead of quietly testing a value the corpus no longer
 * contains.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { parseWifiValue } from "@/lib/crew/wifiDisplay";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const REPO_ROOT = path.resolve(__dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), "utf8");

// --- Live sheet values (gsheets probe 2026-08-09, INFO!EVENT DETAILS "Internet") ---
// Fixed Income Trading Summit 2025 — 1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4
const LIVE_FIXED_INCOME = "Hardline from Encore\n\nSSID: Hyatt_Meeting\nCode: FITS2025";
// FinTech Forum CTO Summit 2026 — 1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY
// Note the trailing spaces after `IHGWifi.com` and after `ORDTG.` — verbatim from the cell.
const LIVE_FINTECH =
  "Encore to provide hardline for streaming\n\nNetwork: IHGWifi.com \nPW: ORDTG. ";

// --- Fixture values (markdown renderings flatten the newlines to spaces) ------
const FIXTURE_FIXED_INCOME = "Hardline from Encore SSID: Hyatt_Meeting Code: FITS2025";
const FIXTURE_FINTECH = "Encore to provide hardline for streaming Network: IHGWifi.com PW: ORDTG.";
const FIXTURE_CONSULTANTS =
  "Wifi for Polling Network: Institutional Investor Passcode: Investor2025";
const FIXTURE_RIA = "SSID - Hyatt_Meeting Password: PHC2025";
const PROSE_EAST_COAST = "The conference wifi has 20mb download speed.";
const PROSE_RPAS = "Wifi from Encore";
const PROSE_WALDORF = "Wifi";
const PROSE_REDEFINING_FI = "Wifi for Polling from Encore";

/** Each fixture-derived corpus value and the fixture it was transcribed from. */
const PROVENANCE: ReadonlyArray<{ label: string; file: string; value: string }> = [
  {
    label: "Fixed Income (raw family)",
    file: "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md",
    value: FIXTURE_FIXED_INCOME,
  },
  {
    label: "Fixed Income (exporter family)",
    file: "fixtures/shows/exporter-xlsx/fixed-income.md",
    value: FIXTURE_FIXED_INCOME,
  },
  {
    label: "FinTech (raw family)",
    file: "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md",
    value: FIXTURE_FINTECH,
  },
  {
    label: "FinTech (exporter family)",
    file: "fixtures/shows/exporter-xlsx/fintech.md",
    value: FIXTURE_FINTECH,
  },
  {
    label: "Consultants (exporter family)",
    file: "fixtures/shows/exporter-xlsx/consultants.md",
    value: FIXTURE_CONSULTANTS,
  },
  {
    label: "RIA (exporter family)",
    file: "fixtures/shows/exporter-xlsx/ria.md",
    value: FIXTURE_RIA,
  },
  {
    label: "East Coast prose",
    file: "fixtures/shows/raw/2024-05-east-coast-family-office.md",
    value: PROSE_EAST_COAST,
  },
  {
    label: "RPAS prose",
    file: "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md",
    value: PROSE_RPAS,
  },
  {
    label: "Waldorf prose",
    file: "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md",
    value: PROSE_WALDORF,
  },
  {
    label: "Redefining FI prose (exporter mirror)",
    file: "fixtures/shows/exporter-xlsx/redefining-fi.md",
    value: PROSE_REDEFINING_FI,
  },
];

const escapeRe = (value: string): string => value.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/**
 * The value must be the WHOLE `Internet` cell, not merely a substring of the
 * file: horizontal padding only, delimited by the row's pipes, with `Internet`
 * as the exact label cell. Plain containment would survive both a suffix
 * appended to the real cell and the value appearing somewhere else in the sheet
 * (every fixture also carries an `Internet Requirements` row), so it would stop
 * detecting the drift this check exists to catch.
 */
const internetCellRe = (value: string): RegExp =>
  new RegExp(`\\|[ \\t]*Internet[ \\t]*\\|[ \\t]*${escapeRe(value)}[ \\t]*\\|`);

describe("corpus provenance", () => {
  it("every fixture-derived corpus value is still the verbatim Internet cell", () => {
    // Premise: the loop below proves nothing if the table is empty. Asserted
    // outside any per-case callback so a zero-length table is loud, not silent.
    premise("fixture-derived corpus cases", PROVENANCE.length, 0);
    for (const row of PROVENANCE) {
      expect(
        internetCellRe(row.value).test(read(row.file)),
        `${row.label}: not the verbatim Internet cell in ${row.file}`,
      ).toBe(true);
    }
  });
});

describe("parseWifiValue — splits (AC-1)", () => {
  it("live Fixed Income: multi-line prose + SSID/Code", () => {
    expect(parseWifiValue(LIVE_FIXED_INCOME)).toEqual({
      ssid: "Hyatt_Meeting",
      password: "FITS2025",
      notes: "Hardline from Encore",
    });
  });

  it("live FinTech: multi-line prose + Network/PW, trailing punctuation preserved", () => {
    expect(parseWifiValue(LIVE_FINTECH)).toEqual({
      ssid: "IHGWifi.com",
      password: "ORDTG.",
      notes: "Encore to provide hardline for streaming",
    });
  });

  it("fixture Fixed Income: flattened single line parses identically to the live value", () => {
    expect(parseWifiValue(FIXTURE_FIXED_INCOME)).toEqual({
      ssid: "Hyatt_Meeting",
      password: "FITS2025",
      notes: "Hardline from Encore",
    });
  });

  it("fixture FinTech: flattened single line parses identically to the live value", () => {
    expect(parseWifiValue(FIXTURE_FINTECH)).toEqual({
      ssid: "IHGWifi.com",
      password: "ORDTG.",
      notes: "Encore to provide hardline for streaming",
    });
  });

  // Regression pin for the spec R1 corruption class: without `Passcode` in the
  // password label set the lookahead does not stop, and the SSID captures
  // "Institutional Investor Passcode: Investor2025" as the network name.
  it("fixture Consultants: Passcode stops the SSID capture", () => {
    expect(parseWifiValue(FIXTURE_CONSULTANTS)).toEqual({
      ssid: "Institutional Investor",
      password: "Investor2025",
      notes: "Wifi for Polling",
    });
  });

  it("fixture RIA: dash separator on the network label; no prose", () => {
    expect(parseWifiValue(FIXTURE_RIA)).toEqual({
      ssid: "Hyatt_Meeting",
      password: "PHC2025",
      notes: null,
    });
  });

  it("labels are case-insensitive", () => {
    expect(parseWifiValue("ssid: Hyatt_Meeting code: FITS2025")).toEqual({
      ssid: "Hyatt_Meeting",
      password: "FITS2025",
      notes: null,
    });
  });

  it("a network label with no password label yields password null, not a guess", () => {
    expect(parseWifiValue("SSID: Hyatt_Meeting")).toEqual({
      ssid: "Hyatt_Meeting",
      password: null,
      notes: null,
    });
  });
});

describe("parseWifiValue — raw fallback (AC-1 / AC-2)", () => {
  const PROSE_ONLY: ReadonlyArray<[string, string]> = [
    ["East Coast", PROSE_EAST_COAST],
    ["RPAS", PROSE_RPAS],
    ["Waldorf", PROSE_WALDORF],
    ["Redefining FI", PROSE_REDEFINING_FI],
  ];

  it("every prose-only corpus value returns null", () => {
    premise("prose-only corpus values", PROSE_ONLY.length, 0);
    for (const [label, value] of PROSE_ONLY) {
      expect(parseWifiValue(value), label).toBeNull();
    }
  });

  it("empty and whitespace-only values return null", () => {
    expect(parseWifiValue("")).toBeNull();
    expect(parseWifiValue("   \n  ")).toBeNull();
  });

  it("a password label with no network label returns null (never a half pair)", () => {
    expect(parseWifiValue("Code: FITS2025")).toBeNull();
  });

  // AC-2: fed AS the internet value, `Dress Code: formal` DOES match the `Code:`
  // password label — the guard is that a network label is REQUIRED, so the whole
  // parse is rejected and the raw string renders.
  it("Dress Code: formal returns null for want of a network label", () => {
    expect(parseWifiValue("Dress Code: formal")).toBeNull();
  });

  it("a Backdrop / Scenic-class value returns null", () => {
    expect(parseWifiValue("Backdrop / Scenic")).toBeNull();
    expect(parseWifiValue("(1) II Blue Logo Spandex\n(2) Sections Grey Spandex")).toBeNull();
  });
});

describe("parseWifiValue — label anchoring (spec §4 calibration)", () => {
  // `code` and `pw` as unanchored substrings are the documented hazard. A label
  // only counts at a word boundary, so "Barcode:" is not a password label — and
  // because it is nonetheless unknown vocabulary sitting inside the captured
  // value, the whole cell falls back raw rather than naming the network
  // "Foo Barcode: 12345".
  it("does not treat an embedded 'code' substring as a password label", () => {
    premiseHolds(
      "the anchoring case carries an embedded code substring",
      "Barcode:".includes("code"),
    );
    expect(parseWifiValue("SSID: Foo Barcode: 12345")).toBeNull();
  });

  it("a bare label with no value does not produce an empty field", () => {
    expect(parseWifiValue("SSID:")).toBeNull();
  });
});

/**
 * The split is all-or-nothing. A PARTIALLY understood cell is more dangerous
 * than an unrecognized one: it renders confident, wrong credentials instead of
 * the truth. Every case here is an ordinary spreadsheet input (not adversarial
 * content, which the threat-model fence puts out of scope), and each was
 * demonstrated against the shipped parser during whole-diff review R1 F1.
 */
describe("parseWifiValue — partial recognition falls back raw (review R1 F1)", () => {
  it("unknown vocabulary swallowed into a value rejects the whole parse", () => {
    // Would otherwise render the network name as "Guest WPA: secret".
    expect(parseWifiValue("SSID: Guest WPA: secret")).toBeNull();
    expect(parseWifiValue("SSID: Guest Login: secret")).toBeNull();
  });

  it("a repeated network label rejects rather than picking the first", () => {
    // The real SSID here is "Conference Network - 5G": the second network label
    // is part of it, and capturing "Conference" is silent corruption.
    expect(parseWifiValue("SSID: Conference Network - 5G Password: secret")).toBeNull();
  });

  it("a repeated password label rejects rather than picking the first", () => {
    expect(parseWifiValue("SSID: A Code: x Code: y")).toBeNull();
  });

  it("two complete pairs reject rather than silently dropping the second", () => {
    expect(parseWifiValue("SSID: A Code: x SSID: B Code: y")).toBeNull();
  });

  it("a recognized label with an empty value rejects rather than dropping it", () => {
    // "Code:" would otherwise vanish from the render entirely.
    expect(parseWifiValue("SSID: Foo Code:")).toBeNull();
  });

  it("the corpus values are unaffected by the all-or-nothing rule", () => {
    // The rule only earns its place if every real observed value still splits.
    // Asserted on the corpus itself, not on a proxy.
    const corpus = [
      LIVE_FIXED_INCOME,
      LIVE_FINTECH,
      FIXTURE_FIXED_INCOME,
      FIXTURE_FINTECH,
      FIXTURE_CONSULTANTS,
      FIXTURE_RIA,
    ];
    premise("corpus values that must still split", corpus.length, 0);
    for (const value of corpus) {
      expect(parseWifiValue(value), value).not.toBeNull();
    }
  });
});
