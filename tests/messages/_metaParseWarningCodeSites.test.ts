import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";

import {
  collectParseWarningCodeSites,
  type ParseWarningCodeScan,
} from "@/lib/messages/__internal__/parseWarningCodeSites";

/**
 * The scan builds a full TypeScript program (~19s: ~11.7s construction, ~2.8s
 * checker warm-up, ~4.5s walk, over 2882 files). Compute it ONCE for the whole
 * file — six assertions each paying that cost would be minutes, and vitest's
 * default 30s timeout does not cover even one.
 */
let cached: ParseWarningCodeScan | undefined;
function scan(): ParseWarningCodeScan {
  cached ??= collectParseWarningCodeSites();
  return cached;
}

const SCAN_TIMEOUT_MS = 180_000;

/**
 * The parse-warning universe as of this commit — a golden snapshot, independent
 * of anything the collector produces.
 *
 * This is the ONLY assertion that can detect the collector itself narrowing.
 * The generator and this guard call the same collector, so if the collector
 * narrows and the manifest is regenerated in the same commit, both shrink
 * together and every artifact-derived check stays green (probed: 57 -> 51,
 * manifest -> 51, set equality passes).
 *
 * An emitter-FILE anchor was tried first and rejected: sixteen of the
 * twenty-two contributing files hold more than one site, so tightening the
 * pre-filter within files drops 22 of 57 codes while the file set is untouched.
 *
 * Changing this list is a deliberate act: a new emitter adds a line, a removed
 * one deletes a line, and the diff is the review artifact. That is the trade
 * against the 4-code residue this change deletes — not fewer hand-maintained
 * entries, but entries that cannot rot silently.
 */
const EXPECTED_PARSE_WARNING_CODES: readonly string[] = [
  "AGENDA_BLOCK_UNRESOLVED",
  "AGENDA_DAY_AMBIGUOUS",
  "AGENDA_DAY_EMPTIED",
  "AGENDA_DAY_TRUNCATED",
  "AGENDA_FILE_INACCESSIBLE",
  "AGENDA_GRID_MALFORMED",
  "AGENDA_LINK_NOT_CLICKABLE",
  "AGENDA_PDF_UNREADABLE",
  "AGENDA_SCHEDULE_LOW_CONFIDENCE",
  "AGENDA_SCHEDULE_TIME_ADJUSTED",
  "BLOCK_DISAPPEARED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "CREW_COLUMN_POSITIONAL_FALLBACK",
  "DATE_ORDER_SUGGESTS_DMY",
  "DAY_RESTRICTION_DOUBLE_LOCATION",
  "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_TAB_MISSING",
  "EMBEDDED_ASSET_DRIFTED",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "FIELD_LABEL_AUTOCORRECTED",
  "FIELD_UNREADABLE",
  "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
  "HOTEL_CARDINALITY_EXCEEDED",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
  "HOTEL_INLINE_GROUP_OWN_HOTEL",
  "LINKED_FOLDER_OVERFLOW_TRUNCATED",
  "OPENING_REEL_NOT_VIDEO",
  "OPENING_REEL_PERMISSION_DENIED",
  "ORPHANED_CREW_ROWS",
  "PULL_SHEET_AMBIGUOUS_FORMAT",
  "PULL_SHEET_ON_ARCHIVED_TAB",
  "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
  "PULL_SHEET_PARSE_PARTIAL",
  "PULL_SHEET_UNKNOWN_VARIANT",
  "REEL_DRIFTED",
  "ROLE_TOKEN_AUTOCORRECTED",
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
  "SCHEDULE_TIME_UNPARSED",
  "SECTION_HEADER_AUTOCORRECTED",
  "SECTION_HEADER_NO_FIELDS",
  "STAGE_WORD_AUTOCORRECTED",
  "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
  "TRAVEL_FLIGHT_NAME_UNMATCHED",
  "TRAVEL_FLIGHT_UNPARSEABLE",
  "TRAVEL_TRANSPORT_NAME_UNMATCHED",
  "TYPO_NORMALIZED",
  "UNKNOWN_DAY_RESTRICTION",
  "UNKNOWN_FIELD",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_SECTION_HEADER",
  "UNKNOWN_STAGE_RESTRICTION",
  "VENUE_GEOCODE_UNRESOLVED",
  "VENUE_TIMEZONE_UNRESOLVED",
];

/**
 * Structural guard over the parse-warning emit surface.
 *
 * Discovery is program-walked (the TypeScript program, not a file list), so an
 * emitter landing in a directory nobody anticipated is covered by construction
 * rather than by remembering to extend a root list. Spec:
 * docs/superpowers/specs/2026-08-03-parse-warning-code-recognizer-design.md
 */
describe("parse-warning code sites", () => {
  it(
    "finds a plain object-literal emit",
    () => {
      const { sites } = scan();
      const hit = sites.find((s) => s.code === "SECTION_HEADER_NO_FIELDS");
      // emitEmptySection pushes the literal into agg.warnings (lib/parser/warnings.ts:44-51).
      // Asserting file AND via, not merely presence, so a later rule cannot satisfy
      // this through the wrong path.
      expect(hit?.file).toBe("lib/parser/warnings.ts");
      expect(hit?.via).toBe("literal");
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "resolves a code referenced through an imported const",
    () => {
      const { sites } = scan();
      const hit = sites.find((s) => s.code === "BLOCK_DISAPPEARED");
      // lib/sync/blockDisappearance.ts:79 reads `code: BLOCK_DISAPPEARED`, where
      // the identifier is IMPORTED from lib/parser/warnings.ts:67. An
      // implementation that reads the local symbol without following the import
      // alias resolves nothing here.
      expect(hit?.file).toBe("lib/sync/blockDisappearance.ts");
      expect(hit?.via).toBe("const");
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "resolves a code passed as a factory argument",
    () => {
      const { sites } = scan();
      const hit = sites.find((s) => s.code === "AGENDA_SCHEDULE_TIME_ADJUSTED");
      // `warn(code, message): ParseWarning` (lib/sync/enrichAgenda.ts:45-47) takes
      // the code as an ARGUMENT, so no `code:` regex reaches it from any root.
      // This is one of the four codes the hand-maintained residue existed to supply.
      expect(hit?.file).toBe("lib/sync/enrichAgenda.ts");
      expect(hit?.via).toBe("factory");
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "records no site from an excluded file",
    () => {
      const { sites } = scan();
      // M6. findReferencesAsNodes() searches the WHOLE program, so the
      // scanned-file predicate has to govern recorded call sites and not merely
      // the file walk. Probed against the unpatched recognizer: exporting the
      // factory at lib/sync/enrichAgenda.ts:45 and calling it from a test with a
      // literal minted that code into the production manifest (58 codes, one site
      // attributed to tests/). Nothing may be attributed to an excluded tree.
      const leaked = sites.filter(
        (s) => s.file.startsWith("tests/") || s.file.startsWith("lib/dev/attentionScenarios/"),
      );
      expect(leaked).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "enumerates a union-typed code parameter",
    () => {
      const { sites } = scan();
      // reelWarning(code: ReelWarningCode) at lib/sync/phase2.ts:337-339 has ONE
      // call site and it passes reel.warningCode dynamically (phase2.ts:385), so
      // the factory rule finds zero literals. The union at
      // lib/sync/verifyReelOnApply.ts:17-20 IS the enumeration — which is why the
      // union rule has to be ordered ahead of the factory rule.
      const reel = ["REEL_DRIFTED", "OPENING_REEL_PERMISSION_DENIED", "OPENING_REEL_NOT_VIDEO"];
      for (const code of reel) {
        expect(sites.find((s) => s.code === code)?.via, code).toBe("union");
      }
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "signals a code composed through a non-ParseWarning spread",
    () => {
      const { unresolved } = scan();
      // M8. `const p = {code:"X"}; const w: ParseWarning = {...p, severity, message}`
      // defeats a naive pre-filter from both sides: the fragment has no
      // severity/message, the enclosing literal has no own `code`. Neither is a
      // candidate, so the code is missed with nothing reaching `unresolved`.
      // The discriminator is whether any spread SOURCE is itself a ParseWarning:
      // if one is, this is propagation (lib/parser/blocks/crew.ts:380-390
      // re-stamps blockRef) and is skipped; if none is, the code entered from a
      // non-warning fragment and must be signaled.
      const propagationFalsePositives = unresolved.filter((u) =>
        u.file.startsWith("lib/parser/blocks/crew.ts"),
      );
      expect(propagationFalsePositives).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "signals non-object-literal ParseWarning construction",
    () => {
      const { nonLiteral } = scan();
      // M7. A class implementing ParseWarning and an Object.assign composition are
      // both type-correct and runtime-valid, and both produce ZERO object-literal
      // candidates — so they never reach `unresolved` either. Detected and
      // signaled rather than modelled.
      //
      // `any`/`unknown` must be rejected before the assignability test:
      // Object.assign(Object.create(null), {...}) at
      // components/admin/review/PublishedArchivedTabOffer.tsx:26 is `any`, and
      // `any` is assignable to everything, so without that exclusion this fails
      // on existing production code before any mutant is planted.
      expect(nonLiteral).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "recognizes a factory argument that a sibling literal call could mask",
    () => {
      const { sites } = scan();
      // M9 (Codex whole-diff P1). `warning("EMBEDDED_ASSET_DRIFTED")` and
      // `warning(reelVerification.warningCode)` sit two lines apart in
      // lib/sync/applyStaged.ts. An aggregate "no literal call sites" test is
      // satisfied by the first and silently drops the second, so
      // EMBEDDED_RECOVERY_REQUIRES_RESTAGE — which genuinely reaches
      // shows_internal.parse_warnings — went unrecognized. Call sites are now
      // judged one at a time.
      expect(sites.map((s) => s.code)).toContain("EMBEDDED_RECOVERY_REQUIRES_RESTAGE");
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "matches the golden parse-warning universe",
    () => {
      const { sites } = scan();
      const recognized = [...new Set(sites.map((s) => s.code))].sort();
      expect(recognized).toEqual([...EXPECTED_PARSE_WARNING_CODES]);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "leaves nothing unrecognized",
    () => {
      const { unresolved } = scan();
      // Assertion 2. An emit shape the four rules cannot resolve is SIGNALED
      // here rather than silently dropped — the "recognized or signaled, never
      // silently wrong" bound. There is no exemption mechanism: two schemas were
      // tried and both admitted an escaping mutant, so adding one is a
      // deliberate change to this guard's own code.
      expect(unresolved).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "agrees with the committed manifest",
    () => {
      const { sites } = scan();
      const recognized = [...new Set(sites.map((s) => s.code))].sort();
      const manifest: Record<string, { source: string } | undefined> = INTERNAL_CODE_ENUMS;
      const attributed = Object.keys(INTERNAL_CODE_ENUMS)
        .filter((code) => manifest[code]?.source.includes("parse_warnings.code"))
        .sort();
      // Set EQUALITY, not a subset check. A subset check passes under an
      // additive implementation that retains the old regex scan alongside the
      // collector, because the extra provenance it adds is never missing.
      expect(attributed, "run `pnpm gen:internal-code-enums`").toEqual(recognized);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "keeps warning factories out of production imports",
    () => {
      // Assertion 5, the mirror class the fixture-tree exclusion opens: a factory
      // whose BODY lives in an excluded tree would have its production call sites
      // silently dropped. Narrowed to FACTORIES because ten production files
      // legitimately import types and scenario data from that tree.
      const offenders = execSync(
        "rg -l --glob '!tests/**' --glob '!lib/dev/attentionScenarios/**' " +
          '"import[^;]*\\b(buildWarning|crewScopedWarning)\\b[^;]*from .@/lib/dev/attentionScenarios" . || true',
        { cwd: process.cwd(), encoding: "utf8" },
      ).trim();
      expect(offenders).toBe("");
    },
    SCAN_TIMEOUT_MS,
  );
});
