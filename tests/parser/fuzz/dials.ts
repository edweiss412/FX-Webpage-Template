// tests/parser/fuzz/dials.ts
//
// The Tier-2+ "dial registry" (spec §3.2): the finite set of independent axes
// a generated fixture varies along, each row citing the LIVE parser contract
// it exercises so the registry can never silently drift from the code it
// claims to cover. `tests/parser/fuzz/_metaDialRegistry.test.ts` walks this
// file's `DIAL_REGISTRY` and asserts every row's `contractFile`/`contractSymbol`
// is a real, currently-existing declaration (not just a string mentioned
// somewhere in that file) — so a renamed/removed contract symbol fails this
// module's own meta-test, not a downstream mystery.
//
// `dials.ts` declares DATA ONLY. The one cross-dial composition rule this
// milestone cares about (headerTypo(short) never composes with a headerless
// crewHeader — spec §3.2, sectionHeader/headerTypo-short notes below) is
// enforced by `validateGeneratedCase` in Task 5's `model.ts`, not here.
//
// Ordered BEFORE model.ts (Task 5) so `DialChoices`/`dialChoices` are an
// existing import, not a forward dependency.

import fc from "fast-check";

// ---------------------------------------------------------------------------
// DialChoices: the resolved value of every dial for one generated case.

/**
 * One fully-resolved draw across every fuzz dial (spec §3.2). Each field's
 * domain is documented on the corresponding `DIAL_REGISTRY` row(s) below —
 * this type is intentionally a flat plain object (no nesting) so a fixture
 * generator can destructure it directly.
 */
export type DialChoices = {
  /** lib/parser/blocks/_helpers.ts:127 `normalizeDate` — the four date text shapes it accepts. */
  dateFormat: "slash" | "dash" | "iso" | "longMDY" | "longDMY";
  /** lib/parser/blocks/_dimsToken.ts:40 `DIMS_FULL_SRC` — the three dimension-token shapes. */
  dimsFormat: "unit" | "bare" | "unicode";
  /**
   * lib/parser/blocks/crew.ts:31 `SECTION_HEADER_TOKENS`. Phase 1: "CREW"
   * only — "TECH" routes to `parseTechBlock` (crew.ts:64-66,214+), which
   * expects a DIFFERENT layout (Name - Role merged col0, no email); a TECH
   * dial value needs its own layout template + oracle rules, deferred to
   * Phase 1.5 with the other layout-family deferrals (spec §3.2 (token,layout)
   * pairing).
   */
  crewSectionToken: "CREW";
  /** lib/parser/blocks/crew.ts:75 `CREW_COLUMN_VOCAB` — labeled header, header row with columns permuted, or no header row at all (positional defaults). */
  crewHeader: "labeled" | "permuted" | "headerless";
  /** lib/parser/index.ts:546 `parseSheet` — permutation index over model.sections; blocks scan the whole doc so order is structurally independent given >=1 blank-line separation between blocks. */
  sectionOrder: number;
  /** lib/parser/index.ts:546 `parseSheet` — blank-row run length between blocks; 0 is out of contract (the exporter always `join("\n\n")`s, i.e. >=1). */
  blankPadding: 1 | 2 | 3;
  /**
   * lib/parser/sectionHeaderNormalize.ts:25 `SHORT_SECTION_VOCAB`. `null` =
   * the section header is spelled correctly ("CREW"); non-null = a single
   * Damerau distance-1 typo of "CREW", pre-screened against
   * `SHORT_SECTION_VOCAB_EXCLUDE` (never "CREWS") and `KNOWN_SUB_LABELS`
   * collisions. Phase 1: SHORT vocab (CREW) only — LONG vocab
   * (TRANSPORTATION/EVENT DETAILS/GS DETAILS) names sections outside the
   * Phase-1 model, deferred to Phase 1.5 with those sections.
   */
  headerTypo: null | { typoedCrewLabel: string };
  /** lib/parser/personalization.ts:58 `PAREN_ONLY_PATTERN` — whether the generated crew row carries a day-restriction parenthetical (sole producer of restriction clauses). */
  dayRestrictionOn: boolean;
};

/**
 * The exhaustive list of `DialChoices` keys — kept next to the type so
 * `_metaDialRegistry.test.ts` can assert it in BOTH directions against
 * `DIAL_REGISTRY`'s `key` column (`Object.keys` of a `dialChoices` sample
 * would only prove "this sample has these keys", not "this is the exhaustive
 * set" — and since the sample is BUILT from this same list, comparing it back
 * would be tautological). Exhaustiveness is guaranteed at COMPILE time by the
 * witness below.
 */
// COMPILE-TIME-EXHAUSTIVE witness: `Record<keyof DialChoices, true>` fails
// compilation on a MISSING key (a new DialChoices field whose witness wasn't
// updated) AND on an EXCESS key (a removed field leaving a stale witness
// entry). A plain `as const satisfies ReadonlyArray<keyof DialChoices>`
// literal only constrains listed keys to be VALID (a subset) — it does NOT
// force exhaustiveness, so a new dial field would stay green. Deriving
// `DIAL_CHOICES_KEYS` from this witness means the meta-test's key-coverage
// assertion is backed by a compile-time exhaustiveness guarantee, not a
// runtime sample that can't diverge from its own input (which was tautological).
const _ALL_DIAL_KEYS: Record<keyof DialChoices, true> = {
  dateFormat: true,
  dimsFormat: true,
  crewSectionToken: true,
  crewHeader: true,
  sectionOrder: true,
  blankPadding: true,
  headerTypo: true,
  dayRestrictionOn: true,
};
export const DIAL_CHOICES_KEYS = Object.keys(_ALL_DIAL_KEYS) as (keyof DialChoices)[];

// ---------------------------------------------------------------------------
// Registry row shape (spec §3.2 normative row: {name, contractFile,
// contractSymbol, note?, arbitrary}) plus `key`, binding a row to the
// `DialChoices` field it feeds (or `null` for a model-side contract / guard
// row that never appears in `DialChoices` itself).

export type DialRegistryRow = {
  name: string;
  contractFile: string;
  contractSymbol: string;
  note?: string;
  key: keyof DialChoices | null;
  arbitrary: fc.Arbitrary<unknown> | null;
};

export type DialRegistry = ReadonlyArray<DialRegistryRow>;

// ---------------------------------------------------------------------------
// Per-row arbitraries.

const dateFormatArb: fc.Arbitrary<DialChoices["dateFormat"]> = fc.constantFrom(
  "slash",
  "dash",
  "iso",
  "longMDY",
  "longDMY",
);

const dimsFormatArb: fc.Arbitrary<DialChoices["dimsFormat"]> = fc.constantFrom(
  "unit",
  "bare",
  "unicode",
);

// Phase 1: "CREW" is the only crewSectionToken value (see DialChoices.crewSectionToken doc).
const crewSectionTokenArb: fc.Arbitrary<DialChoices["crewSectionToken"]> = fc.constant("CREW");

const crewHeaderArb: fc.Arbitrary<DialChoices["crewHeader"]> = fc.constantFrom(
  "labeled",
  "permuted",
  "headerless",
);

// A permutation index over model.sections (Task 5 interprets this integer,
// e.g. via a factorial-number-system/Lehmer-code decode, into a concrete
// section ordering). dials.ts only needs to supply the raw non-negative
// index; the cap is generous but finite so shrinking stays useful.
const sectionOrderArb: fc.Arbitrary<DialChoices["sectionOrder"]> = fc.nat({ max: 5_000 });

const blankPaddingArb: fc.Arbitrary<DialChoices["blankPadding"]> = fc.constantFrom(1, 2, 3);

const dayRestrictionOnArb: fc.Arbitrary<DialChoices["dayRestrictionOn"]> = fc.boolean();

// headerTypo(short): a fixed, pre-screened list of Damerau distance-1
// transpositions of "CREW" — CR<->EW-adjacent swaps, none of which equal
// "CREW" itself, "CREWS"/"TECHS" (SHORT_SECTION_VOCAB_EXCLUDE,
// sectionHeaderNormalize.ts:26), or any KNOWN_SUB_LABELS entry
// (lib/parser/knownSections.ts:99 — none are 4-letter CREW-adjacent anyway).
const HEADER_TYPO_CANDIDATES = ["CRWE", "CERW", "RCEW"] as const;
const headerTypoShortArb: fc.Arbitrary<DialChoices["headerTypo"]> = fc
  .constantFrom(...HEADER_TYPO_CANDIDATES)
  .map((typoedCrewLabel) => ({ typoedCrewLabel }));

// headerTypo(none): the baseline branch of the SAME field — no typo, "CREW"
// spelled correctly. Paired with headerTypoShortArb below (both share
// key: "headerTypo") so buildDialChoices unions them into the full
// `null | { typoedCrewLabel }` domain via fc.oneof.
const headerTypoNoneArb: fc.Arbitrary<DialChoices["headerTypo"]> = fc.constant(null);

// address (model-side, key: null): suffix-bearing US street addresses only
// (STREET_ADDRESS_RE's suffix branch — the ZIP-tail branch is a discriminator,
// never itself the generation target). Consumed directly by model.ts (Task 5)
// for hotel-fixture address cells; it never flows through DialChoices because
// it isn't a discrete "dial" — it's free-form fixture content.
const STREET_NAME_WORDS = [
  "Main",
  "Oak",
  "Maple",
  "Sunset",
  "Highland",
  "Park",
  "River",
  "Lake",
  "Elm",
  "Cedar",
] as const;
const STREET_SUFFIXES = ["St", "Ave", "Blvd", "Dr", "Rd", "Pl", "Ln", "Way", "Ct"] as const;
const addressArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 1, max: 99_999 }),
    fc.constantFrom(...STREET_NAME_WORDS),
    fc.constantFrom(...STREET_SUFFIXES),
  )
  .map(([num, name, suffix]) => `${num} ${name} ${suffix}`);

// ---------------------------------------------------------------------------
// DIAL_REGISTRY — spec §3.2 dial table, one row per line, plus the
// headerTypo-none row (the null branch of the SAME `headerTypo` field; see
// note on that row).

export const DIAL_REGISTRY: DialRegistry = [
  {
    name: "sectionHeader",
    contractFile: "lib/parser/blocks/crew.ts",
    contractSymbol: "SECTION_HEADER_TOKENS",
    note: "(token,layout) pairs; hotels Phase 1 = structured HOTEL only",
    key: "crewSectionToken",
    arbitrary: crewSectionTokenArb,
  },
  {
    name: "headerTypo-short",
    contractFile: "lib/parser/sectionHeaderNormalize.ts",
    contractSymbol: "SHORT_SECTION_VOCAB",
    note: "Phase 1: CREW typos only; require field-band row; never composes with headerless",
    key: "headerTypo",
    arbitrary: headerTypoShortArb,
  },
  {
    name: "headerTypo-none",
    contractFile: "lib/parser/sectionHeaderNormalize.ts",
    contractSymbol: "SHORT_SECTION_VOCAB",
    note: "baseline branch of the same headerTypo field: CREW spelled correctly (no typo); pairs with headerTypo-short to cover the full null|typo domain",
    key: "headerTypo",
    arbitrary: headerTypoNoneArb,
  },
  {
    name: "headerTypo-long",
    contractFile: "lib/parser/sectionHeaderNormalize.ts",
    contractSymbol: "LONG_SECTION_VOCAB",
    note: "guard/deferral row: long-vocab sections outside Phase-1 model; dial deferred to Phase 1.5",
    key: null,
    arbitrary: null,
  },
  {
    name: "headerTypo-short-exclude",
    contractFile: "lib/parser/sectionHeaderNormalize.ts",
    contractSymbol: "SHORT_SECTION_VOCAB_EXCLUDE",
    note: "guard row: typo dial must never emit an excluded plural",
    key: null,
    arbitrary: null,
  },
  {
    name: "dateFormat",
    contractFile: "lib/parser/blocks/_helpers.ts",
    contractSymbol: "normalizeDate",
    key: "dateFormat",
    arbitrary: dateFormatArb,
  },
  {
    name: "dimsFormat",
    contractFile: "lib/parser/blocks/_dimsToken.ts",
    contractSymbol: "DIMS_FULL_SRC",
    key: "dimsFormat",
    arbitrary: dimsFormatArb,
  },
  {
    name: "crewColumns",
    contractFile: "lib/parser/blocks/crew.ts",
    contractSymbol: "CREW_COLUMN_VOCAB",
    note: "headerless = positional defaults (name/role/phone; EMAIL is header-gated so unrecoverable positionally — normalizeCombo strips it), warning expected + those fields round-trip",
    key: "crewHeader",
    arbitrary: crewHeaderArb,
  },
  {
    name: "dayRestriction",
    contractFile: "lib/parser/personalization.ts",
    contractSymbol: "PAREN_ONLY_PATTERN",
    note: "sole producer of restriction clauses",
    key: "dayRestrictionOn",
    arbitrary: dayRestrictionOnArb,
  },
  {
    name: "sectionOrder",
    contractFile: "lib/parser/index.ts",
    contractSymbol: "parseSheet",
    note: "structural: blocks scan whole doc, order-independent given >=1 blank-line separation",
    key: "sectionOrder",
    arbitrary: sectionOrderArb,
  },
  {
    name: "blankPadding",
    contractFile: "lib/parser/index.ts",
    contractSymbol: "parseSheet",
    note: 'structural: 1-3 blank rows; 0 out of contract (exporter join("\\n\\n"))',
    key: "blankPadding",
    arbitrary: blankPaddingArb,
  },
  {
    name: "address",
    contractFile: "lib/parser/blocks/hotelConfTokens.ts",
    contractSymbol: "STREET_ADDRESS_RE",
    note: "suffix-bearing only; ZIP-tail regex is discriminator-only",
    key: null,
    arbitrary: addressArb,
  },
];

// ---------------------------------------------------------------------------
// buildDialChoices: compose `dialChoices` FROM the registry so no dial's
// range can drift from the row that documents it.

/**
 * Groups `registry`'s keyed rows by `key`, unions same-key arbitraries with
 * `fc.oneof` (duplicate-key semantics: rows sharing a key each contribute an
 * arbitrary over the SAME field type — e.g. `headerTypo-short` +
 * `headerTypo-none` above), and composes the result into one
 * `fc.Arbitrary<DialChoices>` via `fc.record`. Throws (at call time, i.e.
 * module load for the `dialChoices` export below) if any `DialChoices` key
 * has zero contributing rows, or if a keyed row's `arbitrary` is `null`.
 */
export function buildDialChoices(registry: DialRegistry): fc.Arbitrary<DialChoices> {
  const groups = new Map<keyof DialChoices, fc.Arbitrary<unknown>[]>();

  for (const row of registry) {
    if (row.key === null) continue;
    if (row.arbitrary === null) {
      throw new Error(
        `buildDialChoices: row "${row.name}" has key "${row.key}" but a null arbitrary`,
      );
    }
    const list = groups.get(row.key) ?? [];
    list.push(row.arbitrary);
    groups.set(row.key, list);
  }

  const perKey: Record<string, fc.Arbitrary<unknown>> = {};
  for (const key of DIAL_CHOICES_KEYS) {
    const arbs = groups.get(key);
    if (!arbs || arbs.length === 0) {
      throw new Error(`buildDialChoices: no registry row supplies DialChoices key "${key}"`);
    }
    // arbs.length > 0 is already guaranteed by the check above, so arbs[0] is
    // safe under noUncheckedIndexedAccess.
    perKey[key] = arbs.length === 1 ? arbs[0]! : fc.oneof(...arbs);
  }

  // Cast at the boundary: `perKey` is built generically (keyed by the runtime
  // `DIAL_CHOICES_KEYS` list) so TS can't statically track each field's exact
  // literal type through the loop above — the per-row arbitraries
  // (dateFormatArb, dimsFormatArb, ...) are what actually pin each field's
  // real type at its point of definition; this cast doesn't widen anything
  // beyond what's already true, and the meta-test's sample-key-equality
  // assertion is the runtime backstop for this boundary.
  return fc.record(perKey) as unknown as fc.Arbitrary<DialChoices>;
}

/** The composed dial arbitrary every Task-5+ fixture generator draws from. */
export const dialChoices: fc.Arbitrary<DialChoices> = buildDialChoices(DIAL_REGISTRY);
