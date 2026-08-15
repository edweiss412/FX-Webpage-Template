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
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { parseWifiValue } from "@/lib/crew/wifiDisplay";
import { CORPUS_TEMP_PREFIX } from "@/tests/helpers/corpusTemp";
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
/**
 * The Waldorf cell is a SPLIT value, not prose, as of
 * `feat/wifi-password-legibility`. It is the one seeded show the crew-page e2e
 * suite drives, and the password-row geometry cases there need a real parsed
 * credential pair on the live route — so the fixture carries one. Every other
 * corpus value is untouched: this is the seed's cell, not a corpus observation.
 */
const FIXTURE_WALDORF = "SSID: WaldorfMeeting Password: Astoria2026";
const PROSE_REDEFINING_FI = "Wifi for Polling from Encore";

/**
 * The corpus cover, DERIVED FROM DISK rather than listed.
 *
 * An enumerated list of ten files claimed to guard a seventeen-file corpus, so
 * the seven it omitted could change freely under a "full-corpus" guard (review
 * S6 R1). The inventory now walks both fixture families, so a fixture ADDED to
 * the corpus is covered by default and a fixture whose Internet cell starts
 * splitting must be declared below or fail.
 */
const FIXTURE_DIRS = ["fixtures/shows/raw", "fixtures/shows/exporter-xlsx"] as const;

function fixtureFiles(): string[] {
  return FIXTURE_DIRS.flatMap((dir) =>
    readdirSync(path.join(REPO_ROOT, dir))
      // The temp prefix is EXCLUDED because this suite runs in the parallel
      // project: a serial test writes synthetic fixtures into the same corpus,
      // and an unfiltered listing would parse one mid-overlap. Pinned by
      // tests/cross-cutting/corpus-temp-prefix.test.ts.
      .filter(
        (name) =>
          name.endsWith(".md") && name !== "README.md" && !name.startsWith(CORPUS_TEMP_PREFIX),
      )
      .map((name) => `${dir}/${name}`),
  ).sort();
}

/**
 * The FIRST `| Internet |` row's cell. First, deliberately: several fixtures
 * carry a later `| Internet | FALSE |` checklist row, and five raw fixtures have
 * an EMPTY event-details cell whose row ends after the label — reading "the row
 * that has a value" would silently promote the checklist row into the corpus.
 * Trailing pipes from the wider raw tables are stripped.
 */
function internetCellOf(file: string): string | null {
  for (const line of read(file).split("\n")) {
    if (!/^\|\s*Internet\s*\|/.test(line)) continue;
    const afterLabel = line.slice(line.indexOf("|", 1) + 1);
    return afterLabel.replace(/\|.*$/, "").trim();
  }
  return null;
}

/**
 * Every cell in the corpus that SPLITS, with its exact expected parse. A fixture
 * whose cell splits and is absent here fails the cover test below, so this map
 * is the closure the spec §4 accounting refers to — not a sample of it.
 */
const EXPECTED_SPLITS: ReadonlyMap<
  string,
  { ssid: string; password: string | null; notes: string | null }
> = new Map([
  [
    FIXTURE_FIXED_INCOME,
    { ssid: "Hyatt_Meeting", password: "FITS2025", notes: "Hardline from Encore" },
  ],
  [
    FIXTURE_FINTECH,
    {
      ssid: "IHGWifi.com",
      password: "ORDTG.",
      notes: "Encore to provide hardline for streaming",
    },
  ],
  [
    FIXTURE_CONSULTANTS,
    { ssid: "Institutional Investor", password: "Investor2025", notes: "Wifi for Polling" },
  ],
  [FIXTURE_RIA, { ssid: "Hyatt_Meeting", password: "PHC2025", notes: null }],
  [FIXTURE_WALDORF, { ssid: "WaldorfMeeting", password: "Astoria2026", notes: null }],
]);

describe("corpus cover (filesystem-derived)", () => {
  it("every fixture's Internet cell is classified, and every splitting cell is pinned", () => {
    const files = fixtureFiles();
    premise("fixture files discovered on disk", files.length, 10);

    let split = 0;
    let prose = 0;
    let empty = 0;
    for (const file of files) {
      const cell = internetCellOf(file);
      expect(cell, `${file}: no Internet row found`).not.toBeNull();
      if (cell!.length === 0) {
        empty += 1;
        continue;
      }
      const parsed = parseWifiValue(cell!);
      if (parsed === null) {
        prose += 1;
        continue;
      }
      split += 1;
      const expected = EXPECTED_SPLITS.get(cell!);
      expect(
        expected,
        `${file}: its Internet cell splits but is not pinned in EXPECTED_SPLITS — ` +
          `add it with its exact expected parse, or explain why it may split unpinned`,
      ).toBeDefined();
      expect(parsed, file).toEqual(expected);
    }

    // The §4 accounting, asserted over the whole corpus rather than a sample.
    // 7/5/5 as of `feat/wifi-password-legibility`: the Waldorf fixture's cell
    // moved from prose to a labeled credential pair so the seeded crew route
    // renders a real password row for the e2e geometry suite.
    expect({ split, prose, empty }).toEqual({ split: 7, prose: 5, empty: 5 });
  });

  it("every pinned split value is actually present in the corpus", () => {
    // The other direction: a pinned value that no fixture carries is a stale
    // literal testing nothing.
    const cells = new Set(fixtureFiles().map((file) => internetCellOf(file) ?? ""));
    premise("cells collected", cells.size, 0);
    for (const value of EXPECTED_SPLITS.keys()) {
      expect(cells.has(value), `${JSON.stringify(value)} is pinned but no fixture carries it`).toBe(
        true,
      );
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

/**
 * Diff review R2 F1: an accepted label word can appear inside a value without
 * being matched as a pair (no separator after it), and the unknown-vocabulary
 * check only saw the colon form. Both leave the residue presented as an SSID.
 * Every case below was probed against the shipped module by the reviewer.
 */
describe("parseWifiValue — unresolved syntax inside a value falls back raw (review R2 F1)", () => {
  it("an unknown label in DASH form rejects, as the colon form already did", () => {
    expect(parseWifiValue("SSID: Guest WPA - secret")).toBeNull();
    expect(parseWifiValue("SSID: Guest Login - secret")).toBeNull();
  });

  /**
   * Structural defense for a vector that took three review rounds (S3 F1).
   * Each earlier guard tried to RECOGNIZE unknown labels and was bounded by a
   * number or a character class, so every round produced fresh escapes from
   * exactly those bounds. The shipped rule instead rejects any UNCONSUMED
   * separator, which ranges over the closed set the accept-set defines.
   *
   * These cases are the union of every escape all three rounds produced. They
   * are listed not as the closure set — enumeration is not the criterion — but
   * so a future widening that reopens any of them fails by name.
   */
  it("every escape the three review rounds produced is closed", () => {
    const escapes = [
      "SSID: Guest WPA: secret", // R1: unknown colon label
      "SSID: Guest WPA - secret", // R2: unknown dash label, spaced
      "SSID: Guest WPA- secret", // S3: one-sided dash
      "SSID: Guest WPA -secret", // S3: one-sided dash, other side
      "SSID: Guest P: secret", // S3: below the old 2-char floor
      "SSID: Guest AuthenticationCode: secret", // S3: above the old 16-char cap
      "SSID: Guest WiFi_Password: secret", // S3: underscore, outside the old class
      "SSID: Guest 802.1X: WPA2", // S3: digit-initial
      "SSID: Guest Contraseña: secreto", // S3: non-ASCII
    ];
    premise("escapes swept", escapes.length, 0);
    for (const value of escapes) {
      expect(parseWifiValue(value), value).toBeNull();
    }
  });

  it("the accept-set is EXACTLY the vocabulary the spec ratifies", () => {
    // Behavioral cases cannot see a WIDENED vocabulary: adding `WLAN` or `PIN`
    // to the matcher leaves every other test green while newly structuring
    // `WLAN: Guest Password: secret` (review S5 R2, probed). Spec §1.2 ratifies
    // the exact sets, and widening requires a corpus probe, so the constants are
    // pinned here — a change to either must be a deliberate edit to this line.
    const source = readFileSync(path.join(REPO_ROOT, "lib/crew/wifiDisplay.ts"), "utf8");
    expect(source).toContain('const NET = "SSID|Network";');
    expect(source).toContain('const PWD = "Code|PW|Passcode|Password";');
    // ...and the matcher must consume the shared separator, not its own copy.
    expect(source, "LABEL_RE must use the shared SEP").toMatch(
      /const LABEL_RE = new RegExp\(`[^`]*\$\{SEP\}`, "gi"\)/,
    );

    // Behaviorally: spellings OUTSIDE the ratified sets do not structure a cell.
    const unobserved = ["WLAN", "PIN", "WPA", "Login", "Passphrase"];
    premise("unobserved spellings swept", unobserved.length, 0);
    for (const word of unobserved) {
      expect(parseWifiValue(`${word}: Guest Password: secret`), word).toBeNull();
      expect(parseWifiValue(`SSID: Guest ${word}: secret`), word).toBeNull();
    }
  });

  it("the leftover-separator rule is DERIVED from the accepted separators", () => {
    // The guard and the label matcher must read the same separator class, or the
    // guard silently stops covering a separator the grammar accepts. Asserted
    // against the module source because both are internal, and drift between
    // them is exactly the regression that reopens this vector.
    const source = readFileSync(path.join(REPO_ROOT, "lib/crew/wifiDisplay.ts"), "utf8");
    const declared = /const SEP_CHARS = "([^"]+)";/.exec(source)?.[1];
    premiseHolds("the module declares a single SEP_CHARS source", declared !== undefined);
    // Both consumers must interpolate the ONE declaration. Matched by shape
    // rather than exact escaping, which prettier is free to rewrite.
    expect(source, "SEP must derive from SEP_CHARS").toMatch(
      /const SEP = `[^`]*\$\{SEP_CHARS\}[^`]*`/,
    );
    expect(source, "the leftover check must derive from SEP_CHARS").toMatch(
      /const LEFTOVER_SEPARATOR_RE = new RegExp\(`\[\$\{SEP_CHARS\}\]`\)/,
    );

    // And behaviourally: every declared separator, unconsumed inside a value,
    // rejects. Derived from the declaration rather than transcribed, so adding a
    // separator to the grammar without widening the guard fails here.
    const chars = declared!.replace(/\\/g, "");
    premise("declared separator characters", chars.length, 0);
    for (const ch of chars) {
      expect(parseWifiValue(`SSID: Guest WPA${ch} secret`), ch).toBeNull();
    }
  });

  it("an accepted label word with no separator after it rejects", () => {
    // The label was never matched as a pair, so its text was absorbed into the
    // neighbouring value and "Guest Password is secret" became the network name.
    expect(parseWifiValue("SSID: Guest Password is secret")).toBeNull();
    expect(parseWifiValue("SSID: Guest Network is Corporate")).toBeNull();
  });

  it("every accepted label word is covered, not just the ones probed", () => {
    // Derived from the label sets themselves, so a widened vocabulary cannot add
    // a word this case silently stops covering. Only the NO-separator form is
    // swept: `SSID: Guest Code - secret` is a legitimate two-pair cell (network
    // "Guest", password "secret"), and rejecting it would be the opposite bug.
    const labelWords = ["SSID", "Network", "Code", "PW", "Passcode", "Password"];
    premise("accepted label words swept", labelWords.length, 0);
    for (const word of labelWords) {
      expect(parseWifiValue(`SSID: Guest ${word} is secret`), word).toBeNull();
    }
  });

  it("an accepted label word WITH a separator is still a legitimate pair", () => {
    // The boundary of the rule above, pinned so a future tightening cannot
    // swallow the corpus's own dash form (RIA ships exactly this shape).
    expect(parseWifiValue("SSID: Guest Code - secret")).toEqual({
      ssid: "Guest",
      password: "secret",
      notes: null,
    });
  });

  it("a plain multi-word SSID followed by a real password label still splits", () => {
    // The reviewer listed this among the escapes; it is the CORRECT reading —
    // network "Guest WiFi", password "secret" — and is pinned so a later
    // tightening cannot quietly reject it.
    expect(parseWifiValue("SSID: Guest WiFi Password: secret")).toEqual({
      ssid: "Guest WiFi",
      password: "secret",
      notes: null,
    });
  });
});

/**
 * Documented limit, spec §6.7 (whole-diff review, post-merge segment F1). Prose
 * on its OWN line is recovered as notes, before or after the label lines — the
 * shape every multi-line corpus value has. On a single FLATTENED line there is
 * no structural signal separating trailing prose from a multi-word value, and
 * the corpus itself proves it: `Institutional Investor` is a genuine two-word
 * SSID. These cases pin the limit so the behavior is DECLARED rather than
 * accidental, and so the day a probe supplies a real discriminator, the change
 * shows up here as a deliberate edit.
 */
describe("parseWifiValue — flattened trailing prose (documented limit, spec §6.7)", () => {
  it("prose on its own line is recovered as notes, before OR after the labels", () => {
    expect(parseWifiValue("Hardline from Encore\nSSID: Guest\nPassword: secret")).toEqual({
      ssid: "Guest",
      password: "secret",
      notes: "Hardline from Encore",
    });
    expect(parseWifiValue("SSID: Guest\nPassword: secret\nHardline from Encore")).toEqual({
      ssid: "Guest",
      password: "secret",
      notes: "Hardline from Encore",
    });
  });

  it("prose trailing a value on ONE line is absorbed into that value", () => {
    // The limit. Nothing is lost or hidden — the whole text renders, attributed
    // to the wrong row. Fixing it needs a probe, not a guess (BL-WIFI-FLATTENED-
    // TRAILING-PROSE); a word-count cap would reject the real corpus value
    // asserted immediately below.
    expect(parseWifiValue("SSID: Guest Hardline from Encore")).toEqual({
      ssid: "Guest Hardline from Encore",
      password: null,
      notes: null,
    });
    expect(parseWifiValue("SSID: Guest Password: secret Hardline from Encore")).toEqual({
      ssid: "Guest",
      password: "secret Hardline from Encore",
      notes: null,
    });
  });

  it("the corpus value that makes the limit unfixable-by-guessing still splits", () => {
    // A genuine two-word SSID, structurally identical to "Guest Hardline". Any
    // rule that rejected the case above on word count would break this.
    expect(parseWifiValue(FIXTURE_CONSULTANTS)?.ssid).toBe("Institutional Investor");
  });
});

/**
 * Whole-diff review, segment 3 F1. The all-or-nothing rule checked captured
 * VALUES only, so credential-shaped text on a standalone residue line slid
 * through as prose: the cell split and rendered the password inside "Internet
 * notes" instead of falling back raw. Spec §6.1 promises the opposite — an
 * unobserved label spelling makes the WHOLE cell render raw.
 *
 * The sweep below is the reviewer's own, made executable and derived from the
 * label sets rather than transcribed: every accepted label word, in both residue
 * positions (before and after the label line), plus the unknown colon and dash
 * forms.
 */
describe("parseWifiValue — credential-shaped residue rejects too (review S3 F1)", () => {
  const LABEL_WORDS = ["SSID", "Network", "Code", "PW", "Passcode", "Password"];
  const placements: ReadonlyArray<(residue: string) => string> = [
    (residue) => `${residue}\nSSID: Guest`,
    (residue) => `SSID: Guest\n${residue}`,
  ];

  it("an accepted label word on a residue line rejects, in either position", () => {
    premise("accepted label words swept", LABEL_WORDS.length, 0);
    premise("residue positions swept", placements.length, 1);
    for (const word of LABEL_WORDS) {
      for (const place of placements) {
        const value = place(`${word} is secret`);
        expect(parseWifiValue(value), JSON.stringify(value)).toBeNull();
      }
    }
  });

  it("an unknown label on a residue line rejects, colon or dash, either position", () => {
    for (const residue of ["WPA: secret", "WPA - secret"]) {
      for (const place of placements) {
        const value = place(residue);
        expect(parseWifiValue(value), JSON.stringify(value)).toBeNull();
      }
    }
  });

  it("real corpus prose is still prose", () => {
    // The rule earns its place only if every observed notes value survives it.
    const withNotes = [
      LIVE_FIXED_INCOME,
      LIVE_FINTECH,
      FIXTURE_FIXED_INCOME,
      FIXTURE_FINTECH,
      FIXTURE_CONSULTANTS,
    ];
    premise("corpus values that must still produce notes", withNotes.length, 0);
    for (const value of withNotes) {
      expect(parseWifiValue(value)?.notes, value).toBeTruthy();
    }
  });
});

/**
 * Documented limit §6.7, second half (whole-diff review, segment 3 R3).
 * Credential-ish prose carrying NO accepted syntax — no separator, no accepted
 * label word — cannot be told from a network name by the accepted grammar.
 *
 * These cases assert the OUTCOME the consequence bound actually requires: every
 * character of the input still reaches the crew member. They are pinned so the
 * behavior is a decision rather than an accident, and so a future change that
 * starts DROPPING such text fails here even though the attribution question
 * stays open.
 */
describe("parseWifiValue — credential-ish prose without syntax (documented limit §6.7)", () => {
  const CASES = [
    "SSID: Guest WPA is secret",
    "SSID: Guest WPA=secret",
    "WPA is secret\nSSID: Guest",
    "SSID: Guest\nWPA is secret",
    "Access key=secret\nSSID: Guest",
    "SSID: Guest\nAccess key=secret",
  ];

  it("renders every character of the cell, in order, losing nothing", () => {
    premise("cases swept", CASES.length, 0);
    for (const value of CASES) {
      const parsed = parseWifiValue(value);
      // Either the whole cell renders raw, or the split renders all of its text.
      const rendered =
        parsed === null
          ? value
          : [parsed.ssid, parsed.password, parsed.notes].filter(Boolean).join(" ");

      // Each LINE's non-label content must survive as one CONTIGUOUS run, not as
      // a bag of words. A per-word `toContain` loop passes on silently reordered
      // output — probed: "secret is WPA Guest" satisfied every word check — so it
      // proved presence, never preservation. Rows may be attributed differently
      // (that is limit §6.7); the text inside a row may not be rewritten.
      const segments = value
        .split("\n")
        .map((line) =>
          line.replace(/\b(?:SSID|Network|Code|PW|Passcode|Password)\s*[:-]?\s*/gi, "").trim(),
        )
        .filter((segment) => segment.length > 0);
      premise(`${JSON.stringify(value)}: segments to account for`, segments.length, 0);
      for (const segment of segments) {
        expect(
          rendered,
          `${JSON.stringify(value)} did not preserve ${JSON.stringify(segment)}`,
        ).toContain(segment);
      }
    }
  });

  it("prose on its own line still reaches the notes row", () => {
    // The designed behavior §3.1 promises, asserted directly so "notes carried
    // the prose" is never mistaken for an accident of the guard.
    expect(parseWifiValue("WPA is secret\nSSID: Guest")?.notes).toBe("WPA is secret");
    expect(parseWifiValue("SSID: Guest\nAccess key=secret")?.notes).toBe("Access key=secret");
  });
});

/**
 * Review S6 R2. Producers write QUALIFIED labels — `Door Code:`, `Dress Code:` —
 * that are not the Wi-Fi password, and word-boundary anchoring alone read them
 * as one: `Door Code: 2468\nSSID: Guest` rendered the password as `2468` with
 * "Door" demoted to notes. A password label on a line with NO network label must
 * therefore START that line.
 *
 * The rule is deliberately asymmetric, and the corpus is what justifies it:
 * prose PRECEDING a network label is an observed shape (`Wifi for Polling
 * Network: Institutional Investor ...`), so the same constraint cannot apply to
 * network labels; every observed password label is either line-initial or
 * follows a network pair on the same line, both of which stay legal.
 */
describe("parseWifiValue — qualified password labels reject (review S6 R2)", () => {
  const QUALIFIERS = ["Door", "Dress", "Gate", "Alarm"];
  const PASSWORD_LABELS = ["Code", "PW", "Passcode", "Password"];

  const NETWORK_LABELS = ["SSID", "Network"];
  const SEPARATORS = [": ", " - "];

  it("a qualified password label rejects wherever the network label sits", () => {
    // Swept across BOTH placements, because the first repair tested only the
    // newline form and a network label LATER ON THE SAME LINE legitimized the
    // qualified one — 128 of 128 cases split silently (review S6 R3). What makes
    // a password label real is a network name already to its LEFT, or nothing to
    // its left at all.
    premise("qualifiers swept", QUALIFIERS.length, 0);
    premise("password labels swept", PASSWORD_LABELS.length, 3);
    premise("network labels swept", NETWORK_LABELS.length, 1);
    premise("separators swept", SEPARATORS.length, 1);

    for (const qualifier of QUALIFIERS) {
      for (const label of PASSWORD_LABELS) {
        // The network label on a LATER line.
        const newlineForm = `${qualifier} ${label}: 2468\nSSID: Guest`;
        expect(parseWifiValue(newlineForm), newlineForm).toBeNull();

        // ...and on the SAME line, after the qualified label.
        for (const network of NETWORK_LABELS) {
          for (const separator of SEPARATORS) {
            const sameLine = `${qualifier} ${label}: 2468 ${network}${separator}Guest`;
            expect(parseWifiValue(sameLine), sameLine).toBeNull();
          }
        }
      }
    }
  });

  it("a line-initial password label on its own line still splits", () => {
    // The shape both live sheets actually use — the rule must not touch it.
    expect(parseWifiValue("SSID: Guest\nCode: FITS2025")).toEqual({
      ssid: "Guest",
      password: "FITS2025",
      notes: null,
    });
  });

  it("a password label following a network pair on ONE line still splits", () => {
    // The flattened fixture shape, and both pinned boundary cases.
    expect(parseWifiValue(FIXTURE_FIXED_INCOME)?.password).toBe("FITS2025");
    expect(parseWifiValue("SSID: Guest Code - secret")?.password).toBe("secret");
    expect(parseWifiValue("SSID: Guest WiFi Password: secret")?.password).toBe("secret");
  });
});

/**
 * Documented limit §6.8 (review S7 R1). Once a network label is established to
 * the left, a longer network name and a qualified password label are the SAME
 * structure. The corpus settles which reading ships: `Institutional Investor` is
 * a real two-token SSID, so any rule rejecting `Guest Door` rejects it too.
 */
describe("parseWifiValue — multi-token network values (documented limit §6.8)", () => {
  it("reads the longer network name, and the corpus is why", () => {
    const shape: ReadonlyArray<[string, string]> = [
      ["SSID: Guest WiFi Password: secret", "Guest WiFi"],
      ["SSID: Guest Door Code: 2468", "Guest Door"],
      [FIXTURE_CONSULTANTS, "Institutional Investor"],
    ];
    premise("same-shape cases", shape.length, 2);
    for (const [value, expectedSsid] of shape) {
      expect(parseWifiValue(value)?.ssid, value).toBe(expectedSsid);
    }
    // The claim that makes this a limit rather than a bug: the corpus member and
    // the disputed case are indistinguishable, so they must be read alike.
    premiseHolds(
      "the corpus value really does carry a multi-token SSID, so no rule can " +
        "reject the disputed case without rejecting it",
      (parseWifiValue(FIXTURE_CONSULTANTS)?.ssid.split(" ").length ?? 0) > 1,
    );
  });

  it("still rejects a qualified label with NO network established to its left", () => {
    // The genuinely different case, and the one the splitter does reject.
    expect(parseWifiValue("Door Code: 2468")).toBeNull();
    expect(parseWifiValue("Door Code: 2468\nSSID: Guest")).toBeNull();
    expect(parseWifiValue("Door Code: 2468 SSID: Guest")).toBeNull();
  });
});
