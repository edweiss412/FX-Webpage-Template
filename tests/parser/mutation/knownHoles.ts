// tests/parser/mutation/knownHoles.ts
/**
 * `text_drift` (spec 2026-08-09-warning-shape-mutation-stability §11): payload equal,
 * every code count exactly preserved, only a warning's human-readable text moved. A
 * distinct bucket from `signal_loss`, which remains never-deferrable.
 */
export type Alarm = {
  siteId: string;
  kind: "wrong" | "signal_loss" | "text_drift";
  fingerprint: string;
};
export type KnownHole = Alarm & {
  finding: string; // audit finding ref (#N) or a BACKLOG.md id (BL-MUTATION-*)
  note: string;
};

/** Stable comparison key — a hole is identified by (siteId, kind, fingerprint) so a
 *  DEEPENED hole (same site/kind, changed behavior fingerprint) reads as both a stale
 *  old row AND a new alarm, never silently absorbed (plan-R9). */
export const ledgerKey = (a: Alarm): string => `${a.siteId}|${a.kind}|${a.fingerprint}`;

/** Result of a ledger reconciliation. `newAlarms`/`staleRows` are the raw bidirectional set
 *  diff (kept for callers that only care whether the run is clean); the four `*Holes`/`drifted*`
 *  fields PARTITION those two lists so a red nightly is triageable in seconds instead of an audit:
 *    newAlarms  = newHoles ∪ driftedAlarms
 *    staleRows  = fixedHoles ∪ driftedStale
 *  The partition key is (siteId, kind) — one level coarser than the full (siteId, kind, fingerprint)
 *  identity — so a fingerprint-only change (parser output shape shifted at a KNOWN hole) reads as
 *  DRIFT on both sides, distinct from a genuinely new/absent (siteId, kind). */
export type LedgerReconciliation = {
  /** actual ∖ ledger by full key (union of the two classified buckets below). */
  newAlarms: string[];
  /** ledger ∖ actual by full key (union of the two classified buckets below). */
  staleRows: string[];
  /** newAlarms whose (siteId, kind) has NO ledger row at all → genuine REGRESSION (a site that
   *  never survived mutation now does). Never re-bless blindly; investigate the parser change. */
  newHoles: string[];
  /** newAlarms whose (siteId, kind) IS ledgered but the fingerprint changed → benign IFF the parser
   *  output change was intentional. Re-bless by regenerating the ledger (BL-MUTATION-LEDGER-*). */
  driftedAlarms: string[];
  /** staleRows whose (siteId, kind) has NO surviving alarm → hole CLOSED (coverage win). Shrink the
   *  ledger by deleting these rows. */
  fixedHoles: string[];
  /** staleRows that are the ledger side of a drift pair (their (siteId, kind) still survives with a
   *  different fingerprint). Same benign-drift class as driftedAlarms. */
  driftedStale: string[];
};

/** Bidirectional set diff, then partitioned by (siteId, kind) into regression / fixed / drift so the
 *  nightly harness failure message names WHICH happened (a red run is triaged, not auto-healed — a
 *  golden baseline that auto-accepts its own new state cannot detect regressions). */
export function reconcileLedger(
  actual: readonly Alarm[],
  ledger: readonly KnownHole[],
): LedgerReconciliation {
  const a = new Set(actual.map(ledgerKey));
  const l = new Set(ledger.map(ledgerKey));
  const newAlarms = [...a].filter((k) => !l.has(k));
  const staleRows = [...l].filter((k) => !a.has(k));

  // (siteId, kind) presence on each side — the coarser key that separates drift from new/fixed.
  const siteKind = (x: Alarm): string => `${x.siteId}|${x.kind}`;
  const actualSK = new Set(actual.map(siteKind));
  const ledgerSK = new Set(ledger.map(siteKind));
  // Map each full key back to its (siteId, kind) without re-parsing the string: siteId contains ':'
  // but never '|', kind and fingerprint are pipe-free, so the objects are the reliable source.
  const skByKey = new Map<string, string>();
  for (const x of actual) skByKey.set(ledgerKey(x), siteKind(x));
  for (const x of ledger) skByKey.set(ledgerKey(x), siteKind(x));
  const skOf = (k: string): string => skByKey.get(k)!;

  return {
    newAlarms,
    staleRows,
    newHoles: newAlarms.filter((k) => !ledgerSK.has(skOf(k))),
    driftedAlarms: newAlarms.filter((k) => ledgerSK.has(skOf(k))),
    fixedHoles: staleRows.filter((k) => !actualSK.has(skOf(k))),
    driftedStale: staleRows.filter((k) => actualSK.has(skOf(k))),
  };
}

/**
 * Operator → audit finding # or BACKLOG.md id (Codex whole-diff R3 [medium]: the ledger must be
 * triageable — a failure of 1000s of rows needs a mapping to which parser fix shrinks which class,
 * NOT a blanket "unaudited"). `header-typo` and `blank-row:*` map to numbered audit findings; the
 * rest map to BL-MUTATION-* sub-items (BACKLOG.md § BL-MUTATION-HARNESS-OPEN-HOLES). Enforced by
 * knownHoles.test.ts ("no blanket 'unaudited'"). Keyed on the operator prefix of the siteId.
 */
export const OPERATOR_FINDING_MAP: Record<string, string> = {
  "header-typo": "#5", // short-header typo intolerance (audit #5)
  "ref-sub": "BL-MUTATION-REF-SUB", // #REF! value corruption absorbed
  "unicode-inject": "BL-MUTATION-UNICODE", // zero-width char retained
  "column-shift": "BL-MUTATION-COLUMN-SHIFT", // leading-column layout shift
  "blank-row:inject": "#10", // blank-row segmentation split (audit #10)
  "blank-row:remove": "#10", // blank-row segmentation fuse (audit #10)
  "merged-cell": "BL-MUTATION-MERGED-CELL", // exported merged-cell fusion
  // VALUE UNCHANGED on purpose (wave plan 05-section-order Task 4 Step 2): the 59 rows
  // that remain still resolve through this id, and an ARCHIVED entry keeps its id
  // resolvable exactly as BL-MUTATION-HARNESS-OPEN-HOLES did before it. (59, not the 72 the
  // wave plan predicted — the collected run closed 24 of the 82, not 10.)
  "section-reorder": "BL-MUTATION-SECTION-ORDER", // documented: source order ratified (spec 2026-08-07 §7; archived row)
};

/** Resolve a siteId's finding via its operator prefix (longest key first so `blank-row:inject`
 *  wins over any shorter key). Throws on an unmapped operator — a NEW operator must add a row to
 *  OPERATOR_FINDING_MAP, so the ledger can never silently regress to "unaudited". */
export function findingFor(siteId: string): string {
  const keys = Object.keys(OPERATOR_FINDING_MAP).sort((a, b) => b.length - a.length);
  for (const op of keys) if (siteId.startsWith(op + ":")) return OPERATOR_FINDING_MAP[op]!;
  throw new Error(`findingFor: no OPERATOR_FINDING_MAP entry for siteId ${siteId}`);
}

// ─── LEDGER (ratchet-shrunk 2026-07-28 by the blank-row segmentation fix on this branch
//     (BL-EXPORT-BLANK-ROW-SEGMENTATION, header-aware splitBlocks): 62 fixed holes dropped —
//     56 blank-row:inject plus 6 header-typo:*:B5-ish DRESS-header sites (whole-diff r1 F1:
//     a typoed DRESS header orphans its crew-shaped rows, so ORPHANED_CREW_ROWS now alarms —
//     detection-under-corruption; the corpus walker pins zero valid-sheet false positives) —
//     0 rows added, 0 fingerprint drift; regenerated from the sharded HEAD corpus, 8 LPT shard
//     dumps, re-verified byte-identical after the r1 F2/F3 repairs. Prior re-bless 2026-07-28
//     (hotel ambiguity-judgment drift, PR #633); before that 2026-07-22 (autocorrect field). ────
// ─── RE-BLESSED 2026-09-01 (`fix/mutation-harness-main-schedule`, PR #966): 791 drifted
//     fingerprints at STABLE (siteId, kind) pairs — 0 new holes, 0 fixed holes, 1019 rows before
//     and after, and the by-operator and by-kind census below unmoved. Two intentional parser
//     changes caused it and neither ran the refresh their fingerprints require: PR #939
//     `fix/nearmiss-non-field-blocks` (lib/parser/blocks/_rowScan.ts, lib/parser/fieldNearMiss.ts)
//     and PR #948 `feat/ref-error-cell-anchors`. Main's nightly had been red on this since
//     2026-08-29; the 2026-08-16 instance was the same class on one fixture (PR #790 rewrote an
//     Internet cell in 2026-04-asset-mgmt-cfo-coo-waldorf) and was re-blessed without a row.
//     REGENERATED BY A COMMITTED TOOL for the first time: scripts/rebless-parser-ledger.ts, from
//     the eight alarm dumps of run 33488302278 at head 391b5171. It refuses anything but pure
//     fingerprint movement from ONE complete run — a new hole, a fixed hole, a missing shard, a
//     (siteId, kind) carrying two fingerprints on either side, or files from two runs. The
//     previous four re-blesses were done by hand or by a script nobody committed. ────
// ─── SHRUNK 2026-08-08 by the parseSheet-entry zero-width strip (`feat/mutation-unicode`,
//     PR #736, mutation wave 1/5): 827 unicode-inject holes closed, the WHOLE class, taking
//     7842 → 7015. Same commit RE-BLESSED 2497 drifted fingerprints that origin/main already
//     carried — the 2026-07-31 hotel inline-later-group wave changed parse output (an
//     intentional, ratified change: HOTEL_INLINE_GROUP_* shipped with full registration
//     lockstep) without the ledger refresh its fingerprints require. Fingerprint-only movement
//     at the SAME siteIds; zero new siteIds, zero fixed holes. ────
// ─── SHRUNK 2026-08-09 by the REF_ERROR_LITERAL detector (`feat/mutation-ref-sub`,
//     mutation wave 2/5): 3314 ref-sub holes closed, the WHOLE class and the largest in
//     the harness, taking 7015 → 3701. ────
// ─── The SIGNAL_TEXT_DRIFT split (2026-08-09, spec parser/2026-08-09-warning-shape-
//     mutation-stability §11): 143 rows re-kinded signal_loss → text_drift by the
//     classifier (fingerprints re-blessed from the run that produced them; findings
//     PRESERVED so they stay resolvable; mechanism triage owed, BL-MUTATION-DRIFT-TRIAGE),
//     plus 7 new text_drift rows for the REF_ERROR_LITERAL sites, each mechanism-named.
//     35 rows discriminated as GENUINE signal_loss and were left alone. ────
// ─── SHRUNK 2026-08-09/10 by the ROW_CELLS_FUSED width discriminator
//     (`feat/mutation-merged-cell`, mutation wave 3/5): 2294 holes closed, 3708 → 1414.
//     The class it targeted is `merged-cell` (2285 of its 2407 rows). The shrink is NOT
//     scoped to that operator, deliberately: short-by-one is the SHAPE the discriminator
//     recognizes, and `column-shift` produces it too (9 rows). That is a real coverage win
//     for a class branch 4 owns, so branch 4 should re-derive its blast radius from this
//     ledger rather than trust the figure in its plan.
//
//     DERIVED TWICE, and the second derivation is the one that counts. The first pass ran
//     against a parser that cross-model review then rewrote — escape-aware cell counting,
//     structural rather than lexical section boundaries, the header excluded from the
//     measured population, and abstention on an ambiguous run. 101 mutants that the first
//     parser caught survive the final one, and every one of them was ADDED BACK by the
//     re-derivation rather than left out. That is the ratchet working: the ledger records
//     what the CURRENT parser actually catches, and a row whose mutant survives again
//     belongs in it. Quietly keeping the smaller number would have been 101 silent holes.
//
//     RESIDUE: 122 merged-cell mutants survive by design (spec §5.3). The fused row sits
//     where the discriminator has no well-defined modal to be short of — a section under
//     the 3-data-row floor (every `B0:L0` row is the one-data-row title block), a section
//     whose width distribution ties, a HEADER row (excluded from the population, since a
//     narrower section title is ordinary authoring), or a run holding a second
//     delimiter-shaped row, which is ambiguous by construction and abandoned whole.
//
//     Say what that means precisely, because an earlier draft of this note said "zero
//     corruption" and that was WRONG: these 122 rows are ledgered holes, so the MUTANTS do
//     corrupt payload silently. What is zero is the DETECTOR'S OUTPUT — it abstains where
//     it cannot tell rather than guessing. The corruption is real, still ledgered, and
//     still owed to a future pass. ────
// ─── SHRUNK 2026-08-14 by the leading-column normalization (`feat/mutation-column-shift`,
//     mutation wave 4/5): 326 holes closed, 1414 → 1088. All four reconciliation buckets
//     empty against the full 8-shard run.
//
//     THE SHRINK IS DERIVED FROM THE HARNESS, and the two figures that looked authoritative
//     were both wrong to delete by. The plan said 211; this ledger's own `column-shift` rows
//     numbered 202, and the branch-3 note directly above already said to prefer the ledger.
//     Deleting the 202 was TRIED and the harness rejected it: five of eight shards returned
//     `newHoles`, the bucket spec §9 marks HARD. The parser was fine — the fix restores 508
//     of 535 sites, so the 27 that stay unrestored still survive, and removing their rows
//     reclassified them from known holes into new ones. Sizing a shrink by an operator's row
//     count silently asserts the fix closes every row of that operator; here that was false
//     by 12 within `column-shift` alone.
//
//     The correct shrink is the harness's own `fixedHoles` set, collected via
//     COLLECT_MUTATION_ALARMS and reconciled against the UNTOUCHED ledger. It is both
//     SMALLER within the target operator (190 of 202 `column-shift` rows) and LARGER overall
//     (326), because dropping a uniformly-empty leading column also closes 136
//     `blank-row:inject` holes — the same cross-operator effect branch 3 recorded from the
//     other side, and the reason a per-operator count is the wrong instrument in both
//     directions. `newHoles` against the FULL ledger measured 0, which is what proves the
//     earlier rejection was the ledger edit and not a parser regression.
//
//     RESIDUE: 12 `column-shift` rows remain, spread over 8 shows. They are the part of the
//     27 unrestored sites that carries ledgered mutants; 14 of the 27 are a pre-existing
//     vocabulary gap (`COI` and `IN HOUSE AV` are in `knownSections.ts` and in the harness's
//     own map but absent from `sectionKind.ts`'s `LABEL_TO_KIND`), deliberately untouched
//     because growing that table widens the cell-2 opener's false-positive surface — the
//     exact class that took three review rounds to close. ────
// ─── REGENERATED 2026-08-15 by the content-keyed field near-miss detector
//     (`feat/mutation-section-order`, mutation wave 5/5): 1088 → 1019. The positional
//     `UNKNOWN_FIELD` sweep read `parseVenue`'s SCOPE WINDOW, so its emissions moved
//     whenever a block moved and the swap oracle saw real signal loss. The replacement
//     is keyed on row CONTENT alone and reads nothing positional, which is why the
//     section-order holes close — but the same property reaches every operator, and it
//     moved 1,002 of the 1,088 committed fingerprints. This ledger is therefore
//     REGENERATED from the harness's own alarms rather than edited: 86 holes closed,
//     17 opened, and every surviving row re-fingerprinted.
//
//     THE AUTHORED ID-SET WAS THE WRONG INSTRUMENT, AGAIN. The wave plan named ten
//     `section-reorder` rows to delete. The harness's own `fixedHoles` set, collected via
//     COLLECT_MUTATION_ALARMS and reconciled against the untouched ledger, is 86 — of
//     which 24 are `section-reorder` (the plan's ten are a strict subset), 49 are
//     `blank-row`, 10 `header-typo`, 3 `merged-cell`. Branch 4 recorded this exact class
//     from the other side and wrote the rule directly above; this arc re-learned it by
//     shipping the authored set and watching five shards go red. Size a shrink by the
//     harness, never by an operator's row count or a plan's id list.
//
//     THE 17 NEW HOLES ARE THE RATIFIED QUIETING'S MEASURED COST, and they are ledgered
//     with their mechanism rather than re-blessed. Probe:
//     `docs/superpowers/specs/parser/probes/2026-08-16-newhole-mechanism.md`. All 17 were
//     `SIGNALED` pre-arc, and in all 17 the ONLY signal was the positional sweep: 14 by a
//     changed `UNKNOWN_FIELD` COUNT between baseline and mutant, 3 by a changed MESSAGE at
//     an unchanged count of 119 (a typo replaced one flagged label with another, e.g.
//     'dAditional Room Setup'). The old sweep flagged any unrecognized venue row, so a
//     header typo inside a venue block always produced a new message; the content-keyed
//     detector deliberately does not, because a transposition typo is not a near-miss of a
//     field the sheet shows and spec §1.1 item 4 ratifies NO edit-distance fuzzing in v1.
//     Those three rows are the live instances that spec §9 names as the precondition for
//     admitting edit distance later.
// 1019 known silent holes = current parser reality, pinned so a REGRESSION (a NEW silent
// hole) or a FIX (a resolved hole → stale row) both fail the nightly harness. Stored as
// pipe-delimited rows inside a TEMPLATE LITERAL (prettier leaves its interior intact, so each hole
// stays ONE line instead of prettier exploding 1019 object literals to ~12k lines). Row format:
//   siteId|kind|fingerprint|finding|note      (fields are pipe-free: siteId uses ':', fp is hex)
// finding = OPERATOR_FINDING_MAP[operator] (audit #N or BL-MUTATION-* — never a blanket "unaudited",
// Codex R3). Fingerprints use the EXHAUSTIVE-by-type signal redaction (oracle.ts redactNode) so an
// in-ledger drift on ANY signal field is caught (Codex R3). Ratchet: SHRINK this list as holes are
// fixed; never grow it silently.
//
// BREAKDOWN, computed from the rows below by the same script that wrote them:
//   by operator: blank-row 696, header-typo 133, merged-cell 119, section-reorder 59,
//   column-shift 12;
//   total 1019 = 1002 wrong + 13 text_drift + 4 signal_loss;
//   section-reorder = 59, ALL of kind `wrong` — the operator's entire signal_loss and
//   text_drift population closed with the positional sweep;
//   all others = 960 — 943 wrong + 13 text_drift + 4 signal_loss.
//
// THE FIGURES BEFORE THIS ARC WERE STALE, and by more than any of its shrinks: they read
// "= 82; all others = 1332; by kind: 1349 wrong + 35 signal_loss + 30 text_drift", which
// sums to 1414 — the pre-wave-4 total. The wave-4 shrink (1414 → 1088) moved the rows and
// left the line behind, so only the `82` was ever true at HEAD. Recounted here in full
// rather than decremented, since decrementing a wrong number keeps it wrong.
const RAW_HOLES = `
blank-row:inject:2024-05-east-coast-family-office:B10:L80:Xgap11|wrong|66c42979907e2839|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L208:Xgap1|wrong|8ce85a4eab985bc2|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L209:Xgap2|wrong|ffe1846acfead85d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L210:Xgap3|wrong|d21bfa9e0fe27612|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L211:Xgap4|wrong|7a4e44ea37d4e70a|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L212:Xgap5|wrong|13112bb95fa62376|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L213:Xgap6|wrong|7350f1075f853b84|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L214:Xgap7|wrong|54a5cd1dec133959|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L215:Xgap8|wrong|a18b56f0a671f057|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L216:Xgap9|wrong|3d053443717554ee|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L217:Xgap10|wrong|48872cb8dfd88480|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L218:Xgap11|wrong|6502e62c98f66b6b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L219:Xgap12|wrong|f362468a079ad069|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L220:Xgap13|wrong|da1ac884f9de0780|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L221:Xgap14|wrong|f633f8eefddeec08|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L222:Xgap15|wrong|b830c128e09a87d0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L223:Xgap16|wrong|2b638732dd3cce21|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L224:Xgap17|wrong|781b5ed188d28b44|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L225:Xgap18|wrong|8d06372ad4597f40|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L226:Xgap19|wrong|189bdeb157596433|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L227:Xgap20|wrong|267810c76677bf72|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L228:Xgap21|wrong|ab1c520756fb6f8d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L229:Xgap22|wrong|b665ea203571342b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L230:Xgap23|wrong|d760991b9b204ae2|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L231:Xgap24|wrong|35270a72678a4d00|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L232:Xgap25|wrong|d27d3e3cf186375a|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L233:Xgap26|wrong|273d2c3881497851|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L234:Xgap27|wrong|51c1ccf273c87ef2|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L235:Xgap28|wrong|11c04aed433e5133|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L236:Xgap29|wrong|4d31128bf2298f02|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L237:Xgap30|wrong|482df3d0d9f18f25|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L238:Xgap31|wrong|cd09f1eefac39231|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L239:Xgap32|wrong|fd6464494c0a9a3f|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L240:Xgap33|wrong|81df2e588d9eb5ae|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L241:Xgap34|wrong|65655808dbb439d7|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L242:Xgap35|wrong|cb0b742fb9389d1c|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L243:Xgap36|wrong|4ec8918dae69e48c|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L244:Xgap37|wrong|d0e29553509fd765|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L245:Xgap38|wrong|08a3912031ea80fb|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L246:Xgap39|wrong|6e3a3fc3cf377fe1|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L247:Xgap40|wrong|d94c3a671cb9df5f|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L248:Xgap41|wrong|bc62469ca76633c0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L249:Xgap42|wrong|a483664edbf07cb1|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L250:Xgap43|wrong|66dffa1ac56c6c06|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L251:Xgap44|wrong|ada420c68c57e818|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L252:Xgap45|wrong|775db2116599a693|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L253:Xgap46|wrong|c25ddf9af7ec4af6|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L254:Xgap47|wrong|10fd56186bc78a38|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L255:Xgap48|wrong|5d7948d90fd6dcba|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L256:Xgap49|wrong|4e3d4ebc50b35b81|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L257:Xgap50|wrong|9ea1de44bda8165b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L258:Xgap51|wrong|d1517b4909331e1b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L259:Xgap52|wrong|ff0ae11232e17807|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L260:Xgap53|wrong|02212631f26c0d06|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L261:Xgap54|wrong|960dcb456065ee5f|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L262:Xgap55|wrong|fbad7ef6d8fd7af2|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L263:Xgap56|wrong|db65657b364823fa|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L264:Xgap57|wrong|5a8de75ad9f198fc|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L265:Xgap58|wrong|a82af2639f7e3a22|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L266:Xgap59|wrong|3de349c83aa15046|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L267:Xgap60|wrong|b6bc0a268ca17ea9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L268:Xgap61|wrong|bde893dec6a43d9f|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L269:Xgap62|wrong|337d50bac0564ee0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L270:Xgap63|wrong|0369632831d4b4a0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L271:Xgap64|wrong|617d5f0a4ab027d4|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L272:Xgap65|wrong|a87a2cd65a37f54a|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L273:Xgap66|wrong|61b39e1e81f2cbf9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L274:Xgap67|wrong|b8b57e50d14ad6cb|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L275:Xgap68|wrong|735c3f11d6eb96a5|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L276:Xgap69|wrong|33c787bc3b9eed78|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L277:Xgap70|wrong|72bd635e1818abc3|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L278:Xgap71|wrong|4f1515ac431c273d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L279:Xgap72|wrong|7bbc665599902562|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L280:Xgap73|wrong|8ac01b4aeaa1e0e0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L281:Xgap74|wrong|f57051b267d03925|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L282:Xgap75|wrong|96cc6191a76f9007|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L283:Xgap76|wrong|935d296d30434177|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L284:Xgap77|wrong|8fe6515577b266e2|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L285:Xgap78|wrong|97b9beed721b35c9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L286:Xgap79|wrong|c740d2a4a611d0e0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L287:Xgap80|wrong|1d41f2385f7a27a3|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L288:Xgap81|wrong|5974df268901f9f2|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L289:Xgap82|wrong|dc5502ea1f3d98f9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L290:Xgap83|wrong|9b3df862a12ff59e|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L291:Xgap84|wrong|f56fe5e20b52facc|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L292:Xgap85|wrong|17560c8f70a92a96|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L293:Xgap86|wrong|6df7ad96f7ae6986|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L294:Xgap87|wrong|279dfc70154411e4|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L295:Xgap88|wrong|7a97e1121e92f973|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L296:Xgap89|wrong|c86f6086e09dee7c|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L297:Xgap90|wrong|b58afa026798bffd|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L25:Xgap0|wrong|2e89964bc098464d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L27:Xgap1|wrong|44d11b8aecd1beab|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L28:Xgap2|wrong|9adb70de96334463|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L29:Xgap3|wrong|c84391e6d473b203|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L30:Xgap4|wrong|fe002f9bf9f3fc45|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L34:Xgap7|wrong|bac12542d51cd2e6|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L35:Xgap8|wrong|e5525df94c4064be|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L36:Xgap9|wrong|5817a34ad3de27c9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L37:Xgap10|wrong|423f31d834619614|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L38:Xgap11|wrong|26be07fb28eddee3|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L222:Xgap0|wrong|7fde6e83886d8504|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L223:Xgap1|wrong|55c236c524ecbc65|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L224:Xgap2|wrong|7cccc763b8e7f302|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L225:Xgap3|wrong|d909511b37b22a5a|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L226:Xgap4|wrong|c558975d56e59c8b|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L151:Xgap0|wrong|dc569e5203fcfd86|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L153:Xgap1|wrong|333120355ebd5ac6|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L154:Xgap2|wrong|af03c5e7c661f8eb|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L155:Xgap3|wrong|a22cd928d5db510a|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L156:Xgap4|wrong|39845559c2613096|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L157:Xgap5|wrong|2115a29f7b548ae3|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L158:Xgap6|wrong|de2e9efc692cf6f3|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L159:Xgap7|wrong|d61d13f17147b10e|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L160:Xgap8|wrong|4914b42478dbf447|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L161:Xgap9|wrong|4914b42478dbf447|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L162:Xgap10|wrong|f403a3bf37ad70a4|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L206:Xgap0|wrong|a22d4fa3e01848a1|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L208:Xgap1|wrong|1cea93cba8afe9a9|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L209:Xgap2|wrong|eab4c0aa27b668cd|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L210:Xgap3|wrong|a4a2d03853abd555|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L211:Xgap4|wrong|ee9e75d10cd76aa4|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L212:Xgap5|wrong|63df299692bd8fc6|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L213:Xgap6|wrong|9bed0ada35a9a17e|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L214:Xgap7|wrong|e3bbd4b03ef779e0|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L215:Xgap8|wrong|3a408cb7b09e19e5|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L216:Xgap9|wrong|3a408cb7b09e19e5|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L217:Xgap10|wrong|4eeeaaf1ff10ecd1|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L111:Xgap0|wrong|6e18ac958fd6a038|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L112:Xgap1|wrong|c7bedf365d85b0a5|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L113:Xgap2|wrong|6472b424659cbfeb|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L114:Xgap3|wrong|d9413457b69042ae|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L115:Xgap4|wrong|a3becb0fd952d2fc|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B33:L340:Xgap5|wrong|fb26d10b3db4a5f8|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B33:L342:Xgap7|wrong|6a5a677bc1b65d97|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B33:L343:Xgap8|wrong|6a5a677bc1b65d97|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B33:L344:Xgap9|wrong|c32d0cbbf51ead28|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L361:Xgap1|wrong|cc3171a29365f2a3|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L362:Xgap2|wrong|6290bad5dadb1174|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L363:Xgap3|wrong|e1ade13e6ef9902a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L364:Xgap4|wrong|adc084be0acb0b26|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L365:Xgap5|wrong|cf11381d5c55f088|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L366:Xgap6|wrong|f60f5016342cbfb7|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L367:Xgap7|wrong|b0d2f124098f7358|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L368:Xgap8|wrong|4a32b936e09dd67c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L369:Xgap9|wrong|f19a88a2759723eb|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L370:Xgap10|wrong|d81d24de93334f1e|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L371:Xgap11|wrong|e283504a97569e9c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L372:Xgap12|wrong|9e0197f2cac4372d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L373:Xgap13|wrong|345f6fceb65f96e6|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L374:Xgap14|wrong|e53ce40d453a37e2|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L375:Xgap15|wrong|bbfd01051ee55b6e|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L376:Xgap16|wrong|7e318899711aec46|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L377:Xgap17|wrong|2ef61c5a51cda50f|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L378:Xgap18|wrong|1cf81f9a5ae2d60c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L379:Xgap19|wrong|8ed86a08ea7fb59b|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L380:Xgap20|wrong|4c6ba55ac4521ae7|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L381:Xgap21|wrong|7403ea9d34e1b586|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L382:Xgap22|wrong|4b99ef64cf06da53|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L383:Xgap23|wrong|22a29e6a2dd8c720|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L384:Xgap24|wrong|d551aa3791bcfeda|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L385:Xgap25|wrong|c6c1dc64d4f7ff95|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L386:Xgap26|wrong|1a2a7a7d242c426e|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L387:Xgap27|wrong|f50f5f25c3dcb1f1|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L388:Xgap28|wrong|b7ada0e4407fa8df|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L389:Xgap29|wrong|747d05b6bfd958cc|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L390:Xgap30|wrong|56ab282db81af16c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L391:Xgap31|wrong|4016f842de7b5efa|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L392:Xgap32|wrong|1d85eb1521ed6194|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L393:Xgap33|wrong|07066281148f5908|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L394:Xgap34|wrong|6115c7e45dd05b04|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L395:Xgap35|wrong|74550fc4f7645b3a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L396:Xgap36|wrong|97ed7afd369faf4a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L397:Xgap37|wrong|4a4780172d01665e|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L398:Xgap38|wrong|c5b242f8525bd1c5|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L399:Xgap39|wrong|98b1f3e94510f60b|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L400:Xgap40|wrong|9458c55671d4f9e5|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L401:Xgap41|wrong|d1d34918ded47c80|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L402:Xgap42|wrong|8f481c713d941f92|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L403:Xgap43|wrong|54d40bf490b04e6b|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L404:Xgap44|wrong|1c14db838bb3eb5c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L405:Xgap45|wrong|5fbcadb4ded6aacc|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L406:Xgap46|wrong|1e6a10d7629e2722|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L407:Xgap47|wrong|89777a9ff94b03a6|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L408:Xgap48|wrong|66114d4ceafdd2bf|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L409:Xgap49|wrong|b8ea92b1abad6648|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L410:Xgap50|wrong|7a63b9650e8e4341|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L411:Xgap51|wrong|f60c905d9df3344d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L412:Xgap52|wrong|7a6bc813c65d5f4f|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L413:Xgap53|wrong|206994997922b1a1|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L414:Xgap54|wrong|2d6e038a1780d485|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L415:Xgap55|wrong|736a265c6cb8913c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L416:Xgap56|wrong|364e6d02f061674d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L417:Xgap57|wrong|54243acb819a6ae2|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L418:Xgap58|wrong|b48d95e28bd0207f|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L419:Xgap59|wrong|c0f5df75f39b4c07|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L420:Xgap60|wrong|b9d3d00839c033e6|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L421:Xgap61|wrong|1b08699079992086|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L422:Xgap62|wrong|bd587079cb1d853f|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L423:Xgap63|wrong|ada3ade1317ce603|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L424:Xgap64|wrong|a9e9c481d3066e60|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L425:Xgap65|wrong|7b36621dc53e2ffc|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L426:Xgap66|wrong|015d473c19e6381a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L427:Xgap67|wrong|3eb2181d49299493|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L428:Xgap68|wrong|380c1eca7450edb1|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L429:Xgap69|wrong|d4040c95dd19e63e|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L430:Xgap70|wrong|25883860680557f5|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L431:Xgap71|wrong|351b0464a7a30cae|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L432:Xgap72|wrong|3475544951889a46|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L433:Xgap73|wrong|98f6616703c71e04|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L434:Xgap74|wrong|a29cf91b79347ac9|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L435:Xgap75|wrong|170b036be4c7f9a5|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L436:Xgap76|wrong|55286cfe87193770|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L437:Xgap77|wrong|b29480ee174004fa|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L438:Xgap78|wrong|7f43afa77a1c300e|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L439:Xgap79|wrong|663811c8262e1d55|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L440:Xgap80|wrong|6ed6e3c556e1f6b8|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L441:Xgap81|wrong|d9f81bc3acc9dab1|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L442:Xgap82|wrong|9c65b109e0ac9aee|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L443:Xgap83|wrong|74172c75eb15e06b|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L444:Xgap84|wrong|286e3ffb58c53de4|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L445:Xgap85|wrong|f7391825efc99f17|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L446:Xgap86|wrong|e1e58275151b87bd|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L447:Xgap87|wrong|39878f672818e582|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L448:Xgap88|wrong|31869ed331dd041a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L449:Xgap89|wrong|08a62c322b217de1|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L450:Xgap90|wrong|f42d0a326a04ca52|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L70:Xgap0|wrong|7aa8115dbfeeb444|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L71:Xgap1|wrong|f53253d0b43de166|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L72:Xgap2|wrong|3957d749f1130b60|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L73:Xgap3|wrong|964b12c82410c019|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L74:Xgap4|wrong|c0f8f51a0ff35ba5|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L82:Xgap0|wrong|bbb093040f7b989d|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L83:Xgap1|wrong|89d11a2ad4694f78|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L84:Xgap2|wrong|aaca8591127cf832|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L85:Xgap3|wrong|2f03e21ebf2512ff|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L86:Xgap4|wrong|f0cf25eee0e4a24b|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L257:Xgap4|wrong|70c835724baeea5d|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L258:Xgap5|wrong|b5eb07a23d66dc3c|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L260:Xgap7|wrong|f7e5378036f25f79|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L261:Xgap8|wrong|f7e5378036f25f79|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L262:Xgap9|wrong|bce2c26bf8ce2269|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L56:Xgap0|wrong|eb8e9836d61c8bb9|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L57:Xgap1|wrong|ab48301659671a45|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L58:Xgap2|wrong|4150d1b34ba6c370|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L84:Xgap0|wrong|99bfed62193a9c6c|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L85:Xgap1|wrong|888910282e3e59b3|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L86:Xgap2|wrong|4095bfb0ad9806fd|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L39:Xgap0|wrong|eef6d9965c5fa10b|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L40:Xgap1|wrong|0bd3b4871c58d91a|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L41:Xgap2|wrong|0bd3b4871c58d91a|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L42:Xgap3|wrong|5803b293fce98357|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L43:Xgap4|wrong|48ecb65a319d4fa8|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L44:Xgap5|wrong|e9ee8ec4a01d8a36|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L45:Xgap6|wrong|d59962b6badc2641|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L46:Xgap7|wrong|e61e5f97ef11deca|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L47:Xgap8|wrong|b4284289d45c7885|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L48:Xgap9|wrong|e8e3d96aa27d475d|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L59:Xgap0|wrong|01262262e478d077|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L60:Xgap1|wrong|f9f7b43621928483|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L61:Xgap2|wrong|0064d19f9f1358f8|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L62:Xgap3|wrong|3a1871fdef4c76f8|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L63:Xgap4|wrong|187a442ee7ae66f8|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L64:Xgap5|wrong|c76d0c945503b717|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L65:Xgap6|wrong|b3cda125636ebac0|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L66:Xgap7|wrong|024afec466d2578e|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L67:Xgap8|wrong|57774d09655abbcc|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L68:Xgap9|wrong|23a73c86e8e84f21|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L69:Xgap10|wrong|64f71ff3c71084cd|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L70:Xgap11|wrong|94d357d0bec915a5|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L71:Xgap12|wrong|217a8a4a82ba4c2e|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L72:Xgap13|wrong|d109197cbe43d78e|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L73:Xgap14|wrong|bb6c77dfe8612d8a|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L77:Xgap0|wrong|26b3f3d082d3db3d|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L78:Xgap1|wrong|c3ff84c3085e5dfa|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L79:Xgap2|wrong|198212972c4df0b6|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L97:Xgap0|wrong|0ff6033527eabba4|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L98:Xgap1|wrong|7cbe833bb304a59c|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L99:Xgap2|wrong|c21e960c594f4511|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L104:Xgap0|wrong|b4ed13f8dfc75a82|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L105:Xgap1|wrong|6127b5a7d32dcc32|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L106:Xgap2|wrong|c413c7aa5694dbbe|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L111:Xgap0|wrong|1ecd3c1e4d7fcb38|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L112:Xgap1|wrong|f3e2bcbaa0e1dde2|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L113:Xgap2|wrong|dc7e96dd1faff348|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L53:Xgap0|wrong|2469da54eab792e8|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L54:Xgap1|wrong|6ba45ad2316a2ce2|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L55:Xgap2|wrong|4382c921f9bd1ff0|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L56:Xgap3|wrong|fe62af9b687d8bba|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L57:Xgap4|wrong|fe62af9b687d8bba|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L58:Xgap5|wrong|62b8baac5d4e8689|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L59:Xgap6|wrong|c1c1ccefb9bcd895|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L60:Xgap7|wrong|7771866a657a128b|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L61:Xgap8|wrong|12d6722818c52e0f|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L62:Xgap9|wrong|58b1c9843d11a087|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L63:Xgap10|wrong|6b8f41d4c202a014|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L64:Xgap11|wrong|0224b31946368e95|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L78:Xgap0|wrong|d1ef408ed7e96f6b|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L79:Xgap1|wrong|b5ed916bd932c453|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L80:Xgap2|wrong|15cfbb7c147c09c2|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L81:Xgap3|wrong|c57254e40847a6c2|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L82:Xgap4|wrong|b6cbdf5358e1e504|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L83:Xgap5|wrong|6b1928ede58981fa|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L84:Xgap6|wrong|87e8e07d2eaf3034|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L85:Xgap7|wrong|4bf7b72609f4c314|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L86:Xgap8|wrong|db729af25faf156a|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L87:Xgap9|wrong|27947c61e0f73f89|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L88:Xgap10|wrong|84baa4b7ed8de9ea|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L89:Xgap11|wrong|f26040e495d8a005|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L90:Xgap12|wrong|0aab207d262debbd|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L91:Xgap13|wrong|3506eaa3f3b22a15|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L92:Xgap14|wrong|864897c6bc574003|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L93:Xgap15|wrong|3b2f42ae06e90194|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L10:Xgap0|wrong|dafb24937878282a|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L11:Xgap1|wrong|895e2d3d18c13571|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L12:Xgap2|wrong|d2965f7b81454a1b|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L13:Xgap3|wrong|b8869c8bfd9f9f0d|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L14:Xgap4|wrong|b8869c8bfd9f9f0d|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L15:Xgap5|wrong|16e3159d454b5753|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L16:Xgap6|wrong|49baf77eb5297007|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L17:Xgap7|wrong|9ec75d75e6cfbaf3|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L18:Xgap8|wrong|014439ef80d4c4d6|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L19:Xgap9|wrong|2bfda56af913a24b|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L20:Xgap10|wrong|aec8b502476c09d9|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L21:Xgap11|wrong|f32f606512f9c90d|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L35:Xgap0|wrong|3997555353a66ad1|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L36:Xgap1|wrong|4ee7920031653995|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L37:Xgap2|wrong|a1540335177a361b|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L38:Xgap3|wrong|f0962da70e058be6|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L39:Xgap4|wrong|4b92199cf1612835|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L40:Xgap5|wrong|bf3d05face6be049|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L41:Xgap6|wrong|54db34112ddf5212|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L42:Xgap7|wrong|d4feb6e132ebe61f|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L43:Xgap8|wrong|fc9fcd107ae551a8|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L44:Xgap9|wrong|efd65ff0824329ee|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L45:Xgap10|wrong|ae7ae8cc48a0eaa3|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L46:Xgap11|wrong|cc1c97dd3a439eeb|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L47:Xgap12|wrong|850e27b6ede273b3|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L48:Xgap13|wrong|a12f5be99146689e|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L49:Xgap14|wrong|3a877d016a2a8e69|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L50:Xgap15|wrong|b380181d7d9e5fbd|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L54:Xgap0|wrong|42348f60bbc1af20|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L55:Xgap1|wrong|fa412325b6dd8bf1|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L56:Xgap2|wrong|c805b6a1ff027868|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L25:Xgap0|wrong|a6e74c99f1923d99|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L26:Xgap1|wrong|596e4833f8c8d1e9|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L27:Xgap2|wrong|64f83f59183f2ba7|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L28:Xgap3|wrong|e56eb426cae5add2|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L29:Xgap4|wrong|5bcd521efd70ef62|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L30:Xgap5|wrong|5bcd521efd70ef62|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L31:Xgap6|wrong|e49cc56be2860efb|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L32:Xgap7|wrong|5053c401e6536f26|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L33:Xgap8|wrong|b9192fac5ca5539d|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L34:Xgap9|wrong|0f88b03c1092e864|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L35:Xgap10|wrong|8bf5c925cb692c5e|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L36:Xgap11|wrong|ace7f4309ceb92d4|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L37:Xgap12|wrong|25d0ea5723401c55|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L51:Xgap0|wrong|5182fc5a46e0a458|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L52:Xgap1|wrong|00b0990e62b06cf0|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L53:Xgap2|wrong|41a023160c26dc2e|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L54:Xgap3|wrong|0cbe444f263362b0|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L55:Xgap4|wrong|bfef18d984f0b0f4|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L56:Xgap5|wrong|913d899498d37be2|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L57:Xgap6|wrong|514e8e81a00a1c6f|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L58:Xgap7|wrong|9e22df7ab4d4583a|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L59:Xgap8|wrong|9ebc50edff1bcfd6|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L60:Xgap9|wrong|28351f7531ee2b8f|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L61:Xgap10|wrong|183a8c69d798ed05|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L62:Xgap11|wrong|97d231e4d5d78d5b|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L63:Xgap12|wrong|0c7666a35ae7f951|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L64:Xgap13|wrong|9a5d57e3fbf10201|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L65:Xgap14|wrong|9a5d57e3fbf10201|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L66:Xgap15|wrong|765e21f55ec4ecfa|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L93:Xgap0|wrong|86f2e5f96baa4b31|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L94:Xgap1|wrong|dc66b2e48d0adc4c|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L95:Xgap2|wrong|fda8a4488f2bd26c|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L100:Xgap0|wrong|ec66f9f13d7fbf6c|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L101:Xgap1|wrong|8c7290c05de20626|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L102:Xgap2|wrong|2e7aec8a9b095b01|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L107:Xgap0|wrong|ef8521cc641c9e4c|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L108:Xgap1|wrong|7b6526d9f996deb4|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L109:Xgap2|wrong|f34061693f88cc2c|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L114:Xgap0|wrong|269c46374ac0af95|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L115:Xgap1|wrong|5387dc0a42cd08fd|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L116:Xgap2|wrong|1b27ae7cc8448b72|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L121:Xgap0|wrong|af2915f8c9904812|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L122:Xgap1|wrong|4bb376d9f0b10403|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L123:Xgap2|wrong|620e06f62bc950c3|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L43:Xgap0|wrong|2c6bdcb61b163573|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L44:Xgap1|wrong|bb840f22082dbe99|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L45:Xgap2|wrong|19fbf49d3bf6044d|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L46:Xgap3|wrong|4a24a966447a737b|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L47:Xgap4|wrong|57151cb0885a5ee4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L57:Xgap12|wrong|643bf580df1975ed|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L80:Xgap0|wrong|4f13fcb3446adae3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L82:Xgap1|wrong|8417c49d87eee35a|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L83:Xgap2|wrong|077b82bee098f89f|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L84:Xgap3|wrong|a3655f266846c70f|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L85:Xgap4|wrong|8545b05ff3e4a80a|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L89:Xgap0|wrong|a22b97c209ef78a8|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L91:Xgap1|wrong|2158e49cc4653ed9|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L92:Xgap2|wrong|c5b9cec2a80c06ad|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L93:Xgap3|wrong|8e2e3038e88159a8|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L94:Xgap4|wrong|89ac12fea055be97|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L141:Xgap2|wrong|aa1b21d49bf05147|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L142:Xgap3|wrong|9ff09f680d293ee5|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L143:Xgap4|wrong|2671d005fd33c0a4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L144:Xgap5|wrong|d095b81ecaa2939f|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L145:Xgap6|wrong|3a11fa20708f5707|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L146:Xgap7|wrong|14fd751a711525de|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L147:Xgap8|wrong|a45ef585dd612076|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L148:Xgap9|wrong|bd4dd28265b529c3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L149:Xgap10|wrong|db32301acde39024|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L150:Xgap11|wrong|1c3b4b2a74e6ae82|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L151:Xgap12|wrong|eb5b25a5b6bfa40b|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L152:Xgap13|wrong|ca7d68066484ff3a|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L153:Xgap14|wrong|4f1b3a2ecff2a957|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L154:Xgap15|wrong|a6175d23fbb5eb4f|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L155:Xgap16|wrong|ac595c7e21aac61e|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L156:Xgap17|wrong|221c00197ffd0370|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L157:Xgap18|wrong|790a4bbf1291a202|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L158:Xgap19|wrong|64ebd70f1c020bfc|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L159:Xgap20|wrong|9b130358eff08634|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L160:Xgap21|wrong|1cc1f26b55e65a53|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L161:Xgap22|wrong|5fa1b2196b07410a|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L162:Xgap23|wrong|0c5b35f544fa3e20|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L163:Xgap24|wrong|632f7bf3e7d1cd22|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L164:Xgap25|wrong|a804306ae200bb88|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L165:Xgap26|wrong|1707026d062c1699|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L166:Xgap27|wrong|0b02a8f504d93963|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L167:Xgap28|wrong|17788645596f6eff|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L168:Xgap29|wrong|be5ab12206d32d2d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L169:Xgap30|wrong|697534593b52b5c4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L170:Xgap31|wrong|264f93616c084cd9|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L171:Xgap32|wrong|6804568ae6ab4bbd|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L172:Xgap33|wrong|a559ce7058232fc4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L173:Xgap34|wrong|8d24729b94ef7a80|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L174:Xgap35|wrong|ffcda97d46e4a165|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L175:Xgap36|wrong|7e864103c906299c|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L176:Xgap37|wrong|166c872878834954|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L177:Xgap38|wrong|553ab1d94077fb9d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L178:Xgap39|wrong|fe4e660332f346f3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L179:Xgap40|wrong|4435be19bd0ebb76|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L180:Xgap41|wrong|dca08f331601be28|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L181:Xgap42|wrong|1285a67007a6ed67|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L182:Xgap43|wrong|ff745eefd400130f|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L183:Xgap44|wrong|8be29a11930fecab|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L184:Xgap45|wrong|25cfd8177cb6cfc5|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L185:Xgap46|wrong|cc8634e446e0bbd3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L186:Xgap47|wrong|478b448266b9bfd3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L187:Xgap48|wrong|576a2dd02324a0b1|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L188:Xgap49|wrong|4fa02005417d8b52|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L189:Xgap50|wrong|d0377c6fef0d11ee|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L190:Xgap51|wrong|ffb08a1f186db0c4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L191:Xgap52|wrong|899fb9ba4e5b5a3d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L192:Xgap53|wrong|7918a11676d1d1ee|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L193:Xgap54|wrong|2b1ebb1e2cedf72f|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L194:Xgap55|wrong|9f6e5fc03c054da4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L195:Xgap56|wrong|134c0e2cb1b172e4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L196:Xgap57|wrong|ae6bfe867d3136c3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L197:Xgap58|wrong|3538fd39f6e35e37|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L198:Xgap59|wrong|fd6f3c55096fa6ea|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L199:Xgap60|wrong|254f9216964d952b|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L200:Xgap61|wrong|98324f843488df97|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L201:Xgap62|wrong|7db15c88d7047b50|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L202:Xgap63|wrong|1d5fe42dde9260a0|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L203:Xgap64|wrong|df3c30d70f35486e|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L204:Xgap65|wrong|494ed859abbb60d3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L205:Xgap66|wrong|0c30379a6c480ad5|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L206:Xgap67|wrong|f2bb7da29af615ac|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L207:Xgap68|wrong|1bc1e7a0b9ed48d1|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L208:Xgap69|wrong|703ace663f242617|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L209:Xgap70|wrong|12ff082cba41d388|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L210:Xgap71|wrong|feed2abff9bd98e4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L211:Xgap72|wrong|88a5689e31e62204|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L212:Xgap73|wrong|31c2571088e12689|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L213:Xgap74|wrong|09cd9ed1b2ad920f|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L214:Xgap75|wrong|22b161f3a557f089|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L215:Xgap76|wrong|18a76d5191332fba|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L216:Xgap77|wrong|8751e52e877fd362|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L217:Xgap78|wrong|0168101683ea4561|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L218:Xgap79|wrong|fa80b469a54c3495|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L219:Xgap80|wrong|0a9bee786d8859d7|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L220:Xgap81|wrong|20496955013a7973|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L221:Xgap82|wrong|5cb1fba92f6fd980|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L222:Xgap83|wrong|a92820a7f0dbf8cb|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L223:Xgap84|wrong|541c5bd3bcc72663|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L224:Xgap85|wrong|1ad020ca4396a1ef|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L225:Xgap86|wrong|9405d8d12de0ad05|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L226:Xgap87|wrong|64e147fe76d61319|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L227:Xgap88|wrong|4b9549a78109a58d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L228:Xgap89|wrong|fc7d7d6540b04bc3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L229:Xgap90|wrong|9171422e5fde48d8|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L230:Xgap91|wrong|2846e39dc7b4726b|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L61:Xgap0|wrong|21916c80ce483ae5|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L62:Xgap1|wrong|15cd31d888b1ae90|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L63:Xgap2|wrong|e3559dec91ab96ab|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L64:Xgap3|wrong|e3559dec91ab96ab|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L65:Xgap4|wrong|e3559dec91ab96ab|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L66:Xgap5|wrong|1f382c51527d51a5|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L67:Xgap6|wrong|1f382c51527d51a5|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L68:Xgap7|wrong|ff5d4ff4f7531454|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L69:Xgap8|wrong|ae777b9afa0a411e|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L70:Xgap9|wrong|b5c4f418938acc63|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L71:Xgap10|wrong|eac707a9ae0fef10|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L72:Xgap11|wrong|cc24f3c253fc43e1|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L73:Xgap12|wrong|e02107e7cfbbcd72|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L74:Xgap13|wrong|07f124b5db69a1f3|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L100:Xgap9|wrong|05f167d0618da801|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L101:Xgap10|wrong|c5d531270996b3c7|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L102:Xgap11|wrong|32c5dbb7bb8e9ba8|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L103:Xgap12|wrong|32c5dbb7bb8e9ba8|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L104:Xgap13|wrong|32c5dbb7bb8e9ba8|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L105:Xgap14|wrong|32c5dbb7bb8e9ba8|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L106:Xgap15|wrong|c5663751b1d34aa0|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L91:Xgap0|wrong|10b91299d3c42018|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L92:Xgap1|wrong|3bd80ad343b7adbc|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L93:Xgap2|wrong|22babfdedaf3283d|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L94:Xgap3|wrong|beda53560377db39|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L95:Xgap4|wrong|7cdf230009173eda|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L96:Xgap5|wrong|450a7a5e3fb90d96|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L97:Xgap6|wrong|41f4d704d3ff3bfd|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L98:Xgap7|wrong|14ecf25c5adcb0b9|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L99:Xgap8|wrong|9fc0ea1263dc9f73|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L111:Xgap0|wrong|25178cf65b51f9b4|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L112:Xgap1|wrong|a4704a734cead152|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L113:Xgap2|wrong|30e28b4724a82d11|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L78:Xgap0|wrong|88577c33efb86611|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L79:Xgap1|wrong|e39c3193832379f8|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L80:Xgap2|wrong|3ea7da90bbe5629b|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L81:Xgap3|wrong|52d1c686ba231528|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L82:Xgap4|wrong|076189aa0bfca5c7|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L83:Xgap5|wrong|aa75058edb691cee|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L84:Xgap6|wrong|2dbef1ec3d61591e|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L85:Xgap7|wrong|ff51c4df5bd09126|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L86:Xgap8|wrong|43a2c29fac99dfab|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L87:Xgap9|wrong|3da8fa386a83fdaa|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L88:Xgap10|wrong|ac0448d5bd2a7b3f|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L89:Xgap11|wrong|71b721231f80cba5|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L90:Xgap12|wrong|562bcd11ef904d34|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L91:Xgap13|wrong|1bc5e2f38c4d0be8|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L92:Xgap14|wrong|10a7a491c6e0ff16|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L97:Xgap0|wrong|4b3499482f337bf2|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L98:Xgap1|wrong|4895c520506d8ccb|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L99:Xgap2|wrong|3ea6de91a7d1e75a|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L104:Xgap0|wrong|555716dbb1fb03a3|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L105:Xgap1|wrong|74b8c444c9c8c34a|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L106:Xgap2|wrong|f40f827cce7b7d10|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L54:Xgap0|wrong|ae0f69cd365e2db5|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L55:Xgap1|wrong|f9b2169c1844ba60|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L56:Xgap2|wrong|959a78395186b4e9|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L57:Xgap3|wrong|959a78395186b4e9|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L58:Xgap4|wrong|cccb5c4f9ba98e02|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L59:Xgap5|wrong|a6cf66d9b7a65b21|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L60:Xgap6|wrong|cabbc95da29fda13|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L61:Xgap7|wrong|7bef1030234ec06e|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L62:Xgap8|wrong|9f12118bba9a7f77|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L63:Xgap9|wrong|89e09880d428650f|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L64:Xgap10|wrong|cbc538e4cc9ee3d0|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L66:Xgap1|wrong|cdf535bb54b204ca|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L67:Xgap2|wrong|0a61b3bb33acae1b|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L68:Xgap3|wrong|4d5f9e0bf7bff223|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L69:Xgap4|wrong|03ffbac578e50af1|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L70:Xgap5|wrong|bf4420cfeff90523|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L71:Xgap6|wrong|27d0786410e5b104|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L72:Xgap7|wrong|1719b3036a624fab|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L73:Xgap8|wrong|d402b2364a3e5c61|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L74:Xgap9|wrong|883534496817bfec|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L75:Xgap10|wrong|5a055d6434992372|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L76:Xgap11|wrong|caecad26b0d74b94|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L77:Xgap12|wrong|6ba2db0ac501b135|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L78:Xgap13|wrong|182ea26dec805411|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L79:Xgap14|wrong|90a766a362ed98df|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L80:Xgap15|wrong|a8ec87158fc351a6|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L81:Xgap16|wrong|b70aebb2ddb5dce2|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L103:Xgap0|wrong|f7627cd671a60a45|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L104:Xgap1|wrong|d8cc322dcf62f9ed|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L105:Xgap2|wrong|59944a1ea723d933|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L106:Xgap3|wrong|9a6a022b34e0d749|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L107:Xgap4|wrong|bc06943d98473730|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L108:Xgap5|wrong|ac82e4c9b9311d3d|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L109:Xgap6|wrong|8892fb001899cccf|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L110:Xgap7|wrong|9596e8e851fda17c|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L111:Xgap8|wrong|9596e8e851fda17c|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L112:Xgap9|wrong|2f0f188a06d36c28|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L117:Xgap0|wrong|60828a47b6f53bd1|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L118:Xgap1|wrong|0ecfee7da746e754|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L119:Xgap2|wrong|16a6d1b4840c4bf4|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L120:Xgap3|wrong|ecc0d8813fd8b118|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L121:Xgap4|wrong|fac0990b275471bf|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L122:Xgap5|wrong|b5080ee6142d339e|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L123:Xgap6|wrong|78bd4cf9adabd663|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L124:Xgap7|wrong|86bc18167507df1a|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L125:Xgap8|wrong|86bc18167507df1a|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L126:Xgap9|wrong|b0408d05712d4860|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L44:Xgap0|wrong|7aa8115dbfeeb444|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L45:Xgap1|wrong|f53253d0b43de166|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L46:Xgap2|wrong|3957d749f1130b60|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L47:Xgap3|wrong|964b12c82410c019|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L48:Xgap4|wrong|c0f8f51a0ff35ba5|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L70:Xgap1|wrong|53299a8f1a0b852e|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L71:Xgap2|wrong|06b678f2e7dfbc36|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L72:Xgap3|wrong|f20e874955f61d1e|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L73:Xgap4|wrong|416bed1446c80dc3|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L74:Xgap5|wrong|65eb966591f45ed4|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L75:Xgap6|wrong|4ac598a3c8a48ea9|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L76:Xgap7|wrong|110fff43ee7dd174|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L77:Xgap8|wrong|7b06383ecfe58e4d|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L78:Xgap9|wrong|559e724a94ff8b2d|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L79:Xgap10|wrong|316ed1d0ea206634|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L80:Xgap11|wrong|b0312dedb05f26b8|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L81:Xgap12|wrong|22e8b257ee4866eb|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L82:Xgap13|wrong|2aa63d5a120c5cb0|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L83:Xgap14|wrong|99cd9037ee87c6e2|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L84:Xgap15|wrong|9a7f8a1910cbdfa3|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L85:Xgap16|wrong|4ae42c922ef21acd|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L106:Xgap0|wrong|dc06e488c8127eb7|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L107:Xgap1|wrong|67b52b2e4178763b|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L108:Xgap2|wrong|5bc78f6a46b79a48|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L109:Xgap3|wrong|b5048e5138437359|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L110:Xgap4|wrong|4a3903e9885ac401|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L111:Xgap5|wrong|c19249f79c41a232|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L112:Xgap6|wrong|2e15d707e31eff3f|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L113:Xgap7|wrong|204c8ae683fdf223|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L114:Xgap8|wrong|204c8ae683fdf223|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L115:Xgap9|wrong|a9bca52522f45916|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L120:Xgap0|wrong|1fa0b195b4ffe5d6|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L121:Xgap1|wrong|e51c9dd5d5fbef96|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L122:Xgap2|wrong|e020bc1e13813ea2|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L123:Xgap3|wrong|c452de7622024a3d|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L124:Xgap4|wrong|2ab3e939a937c693|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L125:Xgap5|wrong|1a9409f7c585fec5|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L126:Xgap6|wrong|56de0b555fa4dc17|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L127:Xgap7|wrong|8ca6cf79cb860c79|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L128:Xgap8|wrong|8ca6cf79cb860c79|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L129:Xgap9|wrong|ff1725134c131e7e|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L42:Xgap0|wrong|4b376c9d512e2351|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L43:Xgap1|wrong|06539f52f0f91e68|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L44:Xgap2|wrong|1eedca0f5001f23b|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L45:Xgap3|wrong|2573f8632265fbb7|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L46:Xgap4|wrong|12e7879892acc5c4|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L66:Xgap0|wrong|b394c69de15df484|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L67:Xgap1|wrong|da06c98f6454ef30|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L68:Xgap2|wrong|da06c98f6454ef30|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L69:Xgap3|wrong|da06c98f6454ef30|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L70:Xgap4|wrong|da06c98f6454ef30|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L71:Xgap5|wrong|da06c98f6454ef30|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L72:Xgap6|wrong|65bfc193ad5c31f4|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L73:Xgap7|wrong|2adde0c0d23103aa|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L74:Xgap8|wrong|ecce18359d371d9b|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L75:Xgap9|wrong|08a8dafd511122b3|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L76:Xgap10|wrong|cddf0ff3a4baeb60|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L77:Xgap11|wrong|230c3079ee449b26|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L78:Xgap12|wrong|b8f3e11800b75067|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L100:Xgap5|wrong|8ab78f864be8349d|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L101:Xgap6|wrong|5f27be058ec06a64|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L102:Xgap7|wrong|0c7509931058322b|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L103:Xgap8|wrong|1ea7d9fc9219377f|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L104:Xgap9|wrong|838855a6f5e1b36e|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L105:Xgap10|wrong|c73a6d5a3fae41af|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L106:Xgap11|wrong|d05d30a2b2ad7b50|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L107:Xgap12|wrong|88180057c43d1a2e|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L108:Xgap13|wrong|6d40989265a60e88|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L109:Xgap14|wrong|6ddd54314acb39cd|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L110:Xgap15|wrong|03d4a19527db6b59|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L95:Xgap0|wrong|e406d01bb8529646|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L96:Xgap1|wrong|6303a845c53ac7a2|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L97:Xgap2|wrong|c6589584458359bd|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L98:Xgap3|wrong|125d353465e4d7e2|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L99:Xgap4|wrong|1cd2055cb6277869|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L115:Xgap0|wrong|fa38d82a5d60006a|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L116:Xgap1|wrong|acfa9323a870d7e2|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L117:Xgap2|wrong|de613b7b102a4a12|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L122:Xgap0|wrong|fa3c66dff663b2b7|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L123:Xgap1|wrong|c450ec50e4f0a8f3|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L124:Xgap2|wrong|25de325f92026cdd|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L129:Xgap0|wrong|52fcb44a96592beb|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L130:Xgap1|wrong|5b96c339582b24a8|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L131:Xgap2|wrong|47694614173e9719|#10|blank-row wrong @ inject
blank-row:remove:2024-05-east-coast-family-office:B2:L24:Xgap|wrong|2e89964bc098464d|#10|blank-row wrong @ remove
blank-row:remove:2024-05-east-coast-family-office:B7:L82:Xgap|wrong|5931c53b0563e051|#10|blank-row wrong @ remove
blank-row:remove:2025-03-dci-rpas-central:B0:L5:Xgap|wrong|65551919eafe6991|#10|blank-row wrong @ remove
blank-row:remove:2025-03-dci-rpas-central:B14:L314:Xgap|wrong|2e25a97792449be2|#10|blank-row wrong @ remove
blank-row:remove:2025-03-dci-rpas-central:B17:L338:Xgap|wrong|106153cca7c8c6dd|#10|blank-row wrong @ remove
blank-row:remove:2025-04-asset-mgmt-cfo-coo:B2:L36:Xgap|wrong|dbd2436f60b4bdaf|#10|blank-row wrong @ remove
blank-row:remove:2025-05-redefining-fixed-income-private-credit:B1:L26:Xgap|wrong|e3cb11dddad11787|#10|blank-row wrong @ remove
blank-row:remove:2025-06-ria-investment-forum:B9:L235:Xgap|wrong|ae0b75edfcf9fc76|#10|blank-row wrong @ remove
blank-row:remove:2025-10-consultants-roundtable:B21:L208:Xgap|text_drift|21ea0c450614d0b5|#10|section fused: warning anchor moved
blank-row:remove:2025-10-consultants-roundtable:B3:L37:Xgap|wrong|0c3a2d0ff15d8566|#10|blank-row wrong @ remove
blank-row:remove:2026-03-rpas-central-four-seasons:B3:L38:Xgap|wrong|fc8ff5658ab2f9a2|#10|blank-row wrong @ remove
blank-row:remove:east-coast:B14:L88:Xgap|wrong|a22b97c209ef78a8|#10|blank-row wrong @ remove
blank-row:remove:east-coast:B21:L265:Xgap|wrong|8ef6c577a1b527aa|#10|blank-row wrong @ remove
blank-row:remove:east-coast:B9:L59:Xgap|wrong|3761fff0c7061d42|#10|blank-row wrong @ remove
blank-row:remove:fintech:B24:L276:Xgap|text_drift|5dfdb824f7c25eb5|#10|section fused: warning anchor moved
blank-row:remove:fixed-income:B22:L245:Xgap|text_drift|314b8920cbd0f24b|#10|section fused: warning anchor moved
blank-row:remove:rpas:B25:L229:Xgap|text_drift|c7460508a8338c93|#10|section fused: warning anchor moved
column-shift:2024-05-east-coast-family-office:B4:L18:X0|wrong|10fd84f06800bbb0|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2024-05-east-coast-family-office
column-shift:2025-03-dci-rpas-central:B11:L229:X0|wrong|864a64e06a192283|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-03-dci-rpas-central
column-shift:2025-03-dci-rpas-central:B12:L231:X0|wrong|171046840bdd9231|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-03-dci-rpas-central
column-shift:2025-04-asset-mgmt-cfo-coo:B11:L120:X0|wrong|2e089237746a2537|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-04-asset-mgmt-cfo-coo
column-shift:2025-05-redefining-fixed-income-private-credit:B8:L79:X0|wrong|b4ae64e0367024d4|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-05-redefining-fixed-income-private-credit
column-shift:2025-10-fixed-income-trading-summit:B6:L51:X0|wrong|cea539d51b9cda9d|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-10-fixed-income-trading-summit
column-shift:2026-03-rpas-central-four-seasons:B7:L67:X0|wrong|a0271b11954405bf|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-03-rpas-central-four-seasons
column-shift:2026-03-rpas-central-four-seasons:B8:L74:X0|wrong|9a8fef9d28ca1c20|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-03-rpas-central-four-seasons
column-shift:2026-04-asset-mgmt-cfo-coo-waldorf:B2:L24:X0|wrong|1845fbd8208bc739|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
column-shift:2026-04-asset-mgmt-cfo-coo-waldorf:B3:L31:X0|wrong|232f492be88cf508|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
column-shift:2026-05-fintech-forum-cto-summit:B4:L40:X0|wrong|dc226524442b4691|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-05-fintech-forum-cto-summit
column-shift:2026-05-fintech-forum-cto-summit:B5:L47:X0|wrong|d3bc8520a7c468d9|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2024-05-east-coast-family-office:B1:L7:X0|wrong|4c3e437a84346271|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2024-05-east-coast-family-office:B2:L12:X0|wrong|f967fc73cd9597ac|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2024-05-east-coast-family-office:B3:L16:X0|wrong|f303aa992dc08106|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2024-05-east-coast-family-office:B4:L18:X0|wrong|26f0adcfe80789c7|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2025-03-dci-rpas-central:B0:L0:X0|wrong|436208a511bb9761|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B10:L220:X0|wrong|8b153aa990cce9d6|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B12:L231:X0|wrong|24f7541ac4977d19|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B17:L258:X0|wrong|47943e21a27f2b95|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B20:L315:X0|wrong|738daad796d24baf|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-04-asset-mgmt-cfo-coo:B11:L120:X0|wrong|7c3d0cca3b2a987e|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B18:L228:X0|wrong|55400a3db401122f|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B20:L310:X0|wrong|b4b956291b35d48a|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B9:L110:X0|wrong|96260ebf030a1968|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-05-redefining-fixed-income-private-credit:B0:L0:X0|wrong|788dad20685fdd17|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B15:L197:X0|wrong|afba5e232795d545|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B18:L217:X0|wrong|632dfa8e8d558a8a|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B30:L331:X0|wrong|6bdb7ff8540bcdd6|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B31:L332:X0|wrong|0514f815d3cd7421|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B6:L69:X0|wrong|7e820e2f7f593a90|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B8:L79:X0|wrong|5c5fc2e931a01212|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-06-ria-investment-forum:B1:L4:X0|wrong|1a21f56d66ea91cc|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-06-ria-investment-forum:B3:L13:X0|wrong|42c8f54facee072e|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-06-ria-investment-forum:B7:L33:X0|wrong|3408213b30d23fc2|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-10-consultants-roundtable:B0:L0:X0|wrong|5888c5c846f3dfc3|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B11:L76:X0|wrong|01dbb31e05871c7a|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B13:L81:X0|wrong|730eab20f86e614e|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B15:L95:X0|wrong|e5879ab1013d8095|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B27:L173:X0|wrong|f4e5816fcd4a8e05|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B38:L249:X0|wrong|46b18247238705df|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B39:L250:X0|wrong|8a37e21d2ece6f15|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B6:L44:X0|wrong|e38665cdedf96f7b|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B8:L55:X0|wrong|65295f9c2c03f094|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-fixed-income-trading-summit:B0:L0:X0|wrong|0c4285a294460188|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B1:L8:X0|wrong|4ebe2ea5ddd20bfc|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B10:L83:X0|wrong|b3708b7b47b951a2|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B4:L32:X0|wrong|b100502297005af6|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B5:L37:X0|wrong|b9f06736f64134d0|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B6:L51:X0|wrong|63b154b43f230c5c|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B9:L76:X0|wrong|c513caf28375073a|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2026-03-rpas-central-four-seasons:B0:L0:X0|wrong|4644a582951556fb|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B10:L96:X0|wrong|429b2e55e3141307|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B11:L103:X0|wrong|7869bf4c0051d9ed|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B12:L110:X0|wrong|21cf3dea1559d25e|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B2:L16:X0|wrong|8a92a5599ed7b925|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B42:L724:X0|wrong|1d2f7fe389333270|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B43:L725:X0|wrong|f3f2233ee6f95b57|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B6:L51:X0|wrong|b160b7d2d326616b|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B7:L67:X0|wrong|48f3a49a9e170fe1|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B0:L0:X0|wrong|799d7a4cbb9055b6|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L8:X0|wrong|d49f7bb1cd685baf|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B2:L24:X0|wrong|21648065c97058da|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B7:L65:X0|wrong|f918ba1823ecc956|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-05-fintech-forum-cto-summit:B0:L0:X0|wrong|cce86128d1c94f64|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B1:L8:X0|wrong|dcfe7f6b572c591b|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B3:L23:X0|wrong|fce99b942b9c4c27|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B4:L40:X0|wrong|8d41d8dc124022b6|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B9:L81:X0|wrong|f1cefb8936220944|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:consultants:B1:L3:X0|wrong|e414459ad890d35a|#5|header-typo wrong @ consultants
header-typo:consultants:B11:L53:X0|wrong|aa38477d2d1cc552|#5|header-typo wrong @ consultants
header-typo:consultants:B15:L84:X0|wrong|5e990637710c2faa|#5|header-typo wrong @ consultants
header-typo:consultants:B16:L91:X0|wrong|e312431991aec92c|#5|header-typo wrong @ consultants
header-typo:consultants:B17:L98:X0|wrong|dba85c3e081db30a|#5|header-typo wrong @ consultants
header-typo:consultants:B18:L105:X0|wrong|00fd25cb84470a31|#5|header-typo wrong @ consultants
header-typo:consultants:B19:L112:X0|wrong|e170f4d9547d0516|#5|header-typo wrong @ consultants
header-typo:consultants:B2:L9:X0|wrong|62dc9ff6e3dd73a3|#5|header-typo wrong @ consultants
header-typo:consultants:B20:L119:X0|wrong|838be592db75df1a|#5|header-typo wrong @ consultants
header-typo:consultants:B23:L143:X0|wrong|48bf420c7b0c02e9|#5|header-typo wrong @ consultants
header-typo:consultants:B25:L181:X0|wrong|ab43204280df1a43|#5|header-typo wrong @ consultants
header-typo:consultants:B27:L187:X0|wrong|2bc9f5e9ac4467b4|#5|header-typo wrong @ consultants
header-typo:consultants:B29:L196:X0|wrong|997b57b5d6271c34|#5|header-typo wrong @ consultants
header-typo:consultants:B31:L205:X0|wrong|abb93f0ddf0a4a49|#5|header-typo wrong @ consultants
header-typo:consultants:B33:L214:X0|wrong|2af9984dd132026b|#5|header-typo wrong @ consultants
header-typo:consultants:B35:L222:X0|wrong|400f97818dce58e0|#5|header-typo wrong @ consultants
header-typo:consultants:B48:L280:X0|wrong|c44508ec1ee64b56|#5|header-typo wrong @ consultants
header-typo:consultants:B49:L281:X0|wrong|b7569741112e0f28|#5|header-typo wrong @ consultants
header-typo:consultants:B7:L37:X0|wrong|e393608617198839|#5|header-typo wrong @ consultants
header-typo:consultants:B9:L42:X0|wrong|8ab4f456879a4da4|#5|header-typo wrong @ consultants
header-typo:east-coast:B13:L60:X0|wrong|e2c917b157967c62|#5|header-typo wrong @ east-coast
header-typo:east-coast:B2:L5:X0|wrong|06b55fbd98b5758a|#5|header-typo wrong @ east-coast
header-typo:east-coast:B22:L132:X0|wrong|99b53bbdf845d9b5|#5|header-typo wrong @ east-coast
header-typo:east-coast:B3:L8:X0|wrong|69d709f6ec503c06|#5|header-typo wrong @ east-coast
header-typo:east-coast:B6:L26:X0|wrong|1c152af3757faf15|#5|header-typo wrong @ east-coast
header-typo:east-coast:B7:L28:X0|wrong|782c33283c9e5e23|#5|header-typo wrong @ east-coast
header-typo:east-coast:B8:L31:X0|wrong|d07b10a5f0689dcb|#5|header-typo wrong @ east-coast
header-typo:east-coast:B9:L34:X0|wrong|cf70a1900755a3ae|#5|header-typo wrong @ east-coast
header-typo:fintech:B11:L77:X0|wrong|e6baf75f2f240eb2|#5|header-typo wrong @ fintech
header-typo:fintech:B14:L89:X0|wrong|2447edb64a1d6ca7|#5|header-typo wrong @ fintech
header-typo:fintech:B2:L5:X0|wrong|444b48c2e7807fdd|#5|header-typo wrong @ fintech
header-typo:fintech:B21:L159:X0|wrong|452981a6464be3b9|#5|header-typo wrong @ fintech
header-typo:fintech:B3:L12:X0|wrong|847c483542b34d13|#5|header-typo wrong @ fintech
header-typo:fintech:B8:L40:X0|wrong|54a73b97722c7087|#5|header-typo wrong @ fintech
header-typo:fintech:B9:L43:X0|wrong|a2d6da7d9308f0ea|#5|header-typo wrong @ fintech
header-typo:fixed-income:B1:L3:X0|wrong|9027096a55930b1e|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B10:L67:X0|wrong|8c4d248903c7357d|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B13:L76:X0|wrong|f1d98ee1859431b2|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B14:L95:X0|wrong|0b8cc0d934ede2e7|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B15:L102:X0|wrong|b5d9d3c7c630b905|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B17:L124:X0|wrong|33c55efdb386e57d|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B19:L162:X0|wrong|4c2c46f775c21522|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B2:L11:X0|wrong|dad29fcde92a9e28|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B7:L40:X0|wrong|3bd6551796ed9523|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B8:L43:X0|wrong|e92eb4ce925172e3|#5|header-typo wrong @ fixed-income
header-typo:redefining-fi:B1:L3:X0|wrong|788dad20685fdd17|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B11:L54:X0|wrong|5c5fc2e931a01212|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B15:L84:X0|wrong|d24116412a9426f5|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B17:L101:X0|wrong|671dfc976ba8f8b4|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B18:L115:X0|wrong|60828a47b6f53bd1|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B2:L9:X0|wrong|afba5e232795d545|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B36:L354:X0|wrong|7fe633657c05eab7|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B37:L355:X0|wrong|b6ea39f155a7ac96|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B9:L43:X0|wrong|7e820e2f7f593a90|#5|header-typo wrong @ redefining-fi
header-typo:ria:B1:L4:X0|wrong|a7b975a16150acf3|#5|header-typo wrong @ ria
header-typo:ria:B12:L58:X0|wrong|6487bc8ec18a72a7|#5|header-typo wrong @ ria
header-typo:ria:B16:L88:X0|wrong|2f8ee4464cf378cc|#5|header-typo wrong @ ria
header-typo:ria:B18:L104:X0|wrong|f95d2c432717d94c|#5|header-typo wrong @ ria
header-typo:ria:B19:L118:X0|wrong|cbce87f8a4591ff5|#5|header-typo wrong @ ria
header-typo:ria:B2:L10:X0|wrong|eaac225dee666678|#5|header-typo wrong @ ria
header-typo:ria:B7:L36:X0|wrong|2ca39bbf23a0301a|#5|header-typo wrong @ ria
header-typo:ria:B9:L41:X0|wrong|5348af6bbdca483b|#5|header-typo wrong @ ria
header-typo:rpas:B1:L3:X0|wrong|9747fe6d6647a32c|#5|header-typo wrong @ rpas
header-typo:rpas:B11:L81:X0|wrong|f8ab752ce372a931|#5|header-typo wrong @ rpas
header-typo:rpas:B14:L93:X0|wrong|ae415007cc13dd03|#5|header-typo wrong @ rpas
header-typo:rpas:B15:L113:X0|wrong|09d8d07c98fa3fa0|#5|header-typo wrong @ rpas
header-typo:rpas:B16:L120:X0|wrong|1f3528e4da46996c|#5|header-typo wrong @ rpas
header-typo:rpas:B17:L127:X0|wrong|e3b2175dc30af780|#5|header-typo wrong @ rpas
header-typo:rpas:B19:L149:X0|wrong|9a5b312143074978|#5|header-typo wrong @ rpas
header-typo:rpas:B2:L11:X0|wrong|3e514d7f21924978|#5|header-typo wrong @ rpas
header-typo:rpas:B21:L189:X0|wrong|2ea90a50d124b226|#5|header-typo wrong @ rpas
header-typo:rpas:B23:L198:X0|wrong|3cf68f2aec72d121|#5|header-typo wrong @ rpas
header-typo:rpas:B54:L339:X0|wrong|44711f7326a6c4a8|#5|header-typo wrong @ rpas
header-typo:rpas:B55:L340:X0|wrong|fd6a8a0fc1c92551|#5|header-typo wrong @ rpas
header-typo:rpas:B7:L39:X0|wrong|4210eb96e9109559|#5|header-typo wrong @ rpas
header-typo:rpas:B8:L42:X0|wrong|d33c251051eb5b66|#5|header-typo wrong @ rpas
merged-cell:2025-03-dci-rpas-central:B20:L317:X0|wrong|3d0a31cc475875e3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-03-dci-rpas-central:B20:L317:X1|wrong|189ee0312475a5e1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-03-dci-rpas-central:B20:L318:X1|wrong|3d0a31cc475875e3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L312:X0|wrong|e2fc4a92a43d87ae|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L312:X1|wrong|2fa93aabb339509e|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L313:X1|wrong|e2fc4a92a43d87ae|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L199:X0|wrong|2b3473ed7cc584d8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L199:X1|wrong|0fac62bfdfb618e3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L200:X1|wrong|2b3473ed7cc584d8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-06-ria-investment-forum:B0:L0:X0|wrong|8bad135e4d72fb48|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L35:X0|wrong|e6b1c43d65d65974|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L35:X1|wrong|2e5687bc850c79e5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L36:X1|wrong|e6b1c43d65d65974|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-10-consultants-roundtable:B15:L97:X0|wrong|d80f0e429a9ab17f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B15:L97:X1|wrong|4c3cd960b8a9e985|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B15:L98:X1|wrong|d80f0e429a9ab17f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B22:L139:X1|text_drift|efac5ce34930a269|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: snippet moved]
merged-cell:2025-10-consultants-roundtable:B28:L209:X10|wrong|a6da1b6c157d9eee|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X11|text_drift|b344e3a1d4136f99|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X12|text_drift|b344e3a1d4136f99|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X13|text_drift|b344e3a1d4136f99|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X14|text_drift|b344e3a1d4136f99|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X17|signal_loss|5d773862ecb14b0f|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X18|signal_loss|5d773862ecb14b0f|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X19|signal_loss|5d773862ecb14b0f|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X2|wrong|7734e7875c931b5d|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X20|signal_loss|5d773862ecb14b0f|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X3|wrong|db71082869d0e3ee|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X4|wrong|db71082869d0e3ee|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X5|wrong|16a68f8ed6d841d5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X6|wrong|16a68f8ed6d841d5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X7|wrong|16a68f8ed6d841d5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X8|wrong|16a68f8ed6d841d5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X9|wrong|a6da1b6c157d9eee|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-fixed-income-trading-summit:B32:L251:X0|text_drift|bea3734fe3663761|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-fixed-income-trading-summit [triaged 2026-08-10: snippet moved]
merged-cell:2025-10-fixed-income-trading-summit:B4:L34:X0|wrong|074a0baf3bd699a4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2025-10-fixed-income-trading-summit:B4:L34:X1|wrong|0699618a5f396643|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2025-10-fixed-income-trading-summit:B4:L35:X1|wrong|074a0baf3bd699a4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2026-03-rpas-central-four-seasons:B22:L237:X0|text_drift|639be258dbe830b7|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-03-rpas-central-four-seasons [triaged 2026-08-10: snippet moved]
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B29:L339:X0|text_drift|2da862c3b4678096|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-04-asset-mgmt-cfo-coo-waldorf [triaged 2026-08-10: snippet moved]
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B36:L744:X0|wrong|ec8d24cd495b6337|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B36:L744:X6|wrong|ec8d24cd495b6337|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
merged-cell:2026-05-fintech-forum-cto-summit:B30:L311:X0|text_drift|d7f25219675d6a29|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-05-fintech-forum-cto-summit [triaged 2026-08-10: snippet moved]
merged-cell:consultants:B0:L0:X0|wrong|79cd2637111f5183|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X1|wrong|79cd2637111f5183|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X2|wrong|79cd2637111f5183|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X3|wrong|79cd2637111f5183|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L11:X0|wrong|f9d923a26b8e2682|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L11:X1|wrong|278575d2b58f4568|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L12:X1|wrong|f9d923a26b8e2682|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B22:L141:X0|wrong|79dc4876378abbce|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B22:L141:X1|wrong|79dc4876378abbce|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B24:L146:X0|wrong|36ae5dc47103fb54|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B26:L184:X0|wrong|5f553c54dbaff577|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B26:L184:X6|wrong|fe8248db5a91d1c7|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B28:L190:X0|wrong|7f1659cbacd3a1c8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B28:L190:X6|wrong|00b5f74c9ecd5f8d|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B30:L199:X0|wrong|d87447f9fb81ba5d|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B30:L199:X6|wrong|64d64e600af08358|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B32:L208:X0|wrong|aa418796f4344162|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B32:L208:X6|wrong|ffd0447023921658|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L217:X0|wrong|27d861adb7e67104|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L217:X6|wrong|e17a1fa4d22538e0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L219:X0|wrong|ab13f917ba473d17|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L219:X6|wrong|ea68d4fc7ec673cb|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L220:X0|wrong|39ab828bbc90ba23|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L220:X6|wrong|06eb043276859f61|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B36:L225:X0|wrong|8fed4874f8c8d898|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:east-coast:B0:L0:X0|wrong|6d4b029acbe6582f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:east-coast:B2:L6:X0|wrong|6611f4e90054037e|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:east-coast:B7:L29:X0|wrong|98970b5afc73aca1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:fintech:B0:L0:X0|wrong|c6d68e620830224f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X1|wrong|c6d68e620830224f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X2|wrong|c6d68e620830224f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X3|wrong|c6d68e620830224f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B22:L162:X0|wrong|2617c4575997f353|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X0|wrong|d50712471e4f5be0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X1|wrong|d50712471e4f5be0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X2|wrong|d50712471e4f5be0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X3|wrong|d50712471e4f5be0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X4|wrong|d50712471e4f5be0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X5|wrong|d50712471e4f5be0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X7|wrong|d50712471e4f5be0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B6:L35:X0|wrong|bfa9cbb8ff7c6518|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B6:L35:X1|wrong|e1a991e80fa1ec6b|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fixed-income:B0:L0:X0|wrong|bf0467f848d23248|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X1|wrong|bf0467f848d23248|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X2|wrong|bf0467f848d23248|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X3|wrong|bf0467f848d23248|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B18:L127:X0|wrong|a322d3ab3667d493|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B20:L165:X0|wrong|5477ef65d2949c0c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B5:L35:X0|wrong|046af06d9296f69b|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B5:L35:X1|wrong|0d7a2594fe1497ad|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:redefining-fi:B2:L11:X0|wrong|2b3473ed7cc584d8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:redefining-fi:B2:L11:X1|wrong|0fac62bfdfb618e3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:redefining-fi:B2:L12:X1|wrong|2b3473ed7cc584d8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:ria:B0:L0:X0|wrong|631fa7c927ce79ce|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L12:X0|wrong|15f4f83672024a41|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L12:X1|wrong|d73fe2cc00cd6764|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L13:X1|wrong|15f4f83672024a41|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B5:L31:X0|wrong|14c65cf385185186|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B5:L31:X1|wrong|42919f2f21ba1af8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:rpas:B0:L0:X0|wrong|de384bf1a099c45f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X1|wrong|de384bf1a099c45f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X2|wrong|de384bf1a099c45f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X3|wrong|de384bf1a099c45f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B20:L152:X0|wrong|d1c99d55b2a2686c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B22:L192:X0|wrong|7ec9550c2bda9101|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B24:L201:X0|wrong|73edf92dc549ac52|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X0|wrong|ad8e832d3fdeccf8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X1|wrong|ad8e832d3fdeccf8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X2|wrong|ad8e832d3fdeccf8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X3|wrong|ad8e832d3fdeccf8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X4|wrong|ad8e832d3fdeccf8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X5|wrong|ad8e832d3fdeccf8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X6|wrong|ad8e832d3fdeccf8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X8|wrong|ad8e832d3fdeccf8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B5:L34:X0|wrong|cc13731fd6dbb9a9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B5:L34:X1|wrong|b69d32364f822585|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
section-reorder:2024-05-east-coast-family-office:B0:L0:Xpair0|wrong|8f452b074f633910|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2024-05-east-coast-family-office
section-reorder:2025-03-dci-rpas-central:B0:L0:Xpair0|wrong|65551919eafe6991|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-03-dci-rpas-central
section-reorder:2025-03-dci-rpas-central:B7:L0:Xpair7|wrong|90a1ff584744d4ef|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-03-dci-rpas-central
section-reorder:2025-04-asset-mgmt-cfo-coo:B0:L0:Xpair0|wrong|2a71feb98ce2089d|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-04-asset-mgmt-cfo-coo
section-reorder:2025-04-asset-mgmt-cfo-coo:B3:L0:Xpair3|wrong|b0b9056446c18127|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-04-asset-mgmt-cfo-coo
section-reorder:2025-06-ria-investment-forum:B0:L0:Xpair0|wrong|8bad135e4d72fb48|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-06-ria-investment-forum
section-reorder:consultants:B0:L0:Xpair0|wrong|79cd2637111f5183|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B14:L0:Xpair14|wrong|90dece2f38e332ec|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B15:L0:Xpair15|wrong|92e3b77ef2d7cd3b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B16:L0:Xpair16|wrong|b4e8d1e691f432c6|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B20:L0:Xpair20|wrong|a7967b0c656c7086|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B21:L0:Xpair21|wrong|a7967b0c656c7086|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B22:L0:Xpair22|wrong|fd9819024f1c055c|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B23:L0:Xpair23|wrong|143af7bd7438ea43|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B24:L0:Xpair24|wrong|4e3144f0775501ec|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B25:L0:Xpair25|wrong|c11bbe846c4edefa|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B26:L0:Xpair26|wrong|70125289e94e0bb1|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B27:L0:Xpair27|wrong|32f2a307209a3a5f|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B28:L0:Xpair28|wrong|b21027586673e1ff|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B29:L0:Xpair29|wrong|2b816bdbb3591cc2|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B30:L0:Xpair30|wrong|91e40fc9e49a8150|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B31:L0:Xpair31|wrong|36659caacc5d3a09|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B32:L0:Xpair32|wrong|d09763f7f3b84ad9|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B33:L0:Xpair33|wrong|2545e3c3f84b319d|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B34:L0:Xpair34|wrong|925c47bff1e1291b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B35:L0:Xpair35|wrong|9ff1bd8c65d12d84|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:east-coast:B0:L0:Xpair0|wrong|6bae3ca98e5a02e0|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B12:L0:Xpair12|wrong|fb9ebbaf30016a3a|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B13:L0:Xpair13|wrong|fb9ebbaf30016a3a|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B14:L0:Xpair14|wrong|08c27054ae426583|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:fintech:B0:L0:Xpair0|wrong|c6d68e620830224f|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B18:L0:Xpair18|wrong|e666c50b2da24861|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B19:L0:Xpair19|wrong|e666c50b2da24861|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B20:L0:Xpair20|wrong|e666c50b2da24861|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B21:L0:Xpair21|wrong|c46608d101d8969b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fixed-income:B0:L0:Xpair0|wrong|bf0467f848d23248|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B13:L0:Xpair13|wrong|986b513f01a2d931|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B15:L0:Xpair15|wrong|822e69122f0d9c12|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B16:L0:Xpair16|wrong|822e69122f0d9c12|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B17:L0:Xpair17|wrong|ad53ed0c43bb198b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B18:L0:Xpair18|wrong|c754f0128b6815d2|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B19:L0:Xpair19|wrong|047703043c45cdad|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B20:L0:Xpair20|wrong|5a653d5270bd0e9e|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:redefining-fi:B14:L0:Xpair14|wrong|382f0488b5b55e14|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ redefining-fi
section-reorder:redefining-fi:B15:L0:Xpair15|wrong|703181fc47d0dfdb|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ redefining-fi
section-reorder:ria:B0:L0:Xpair0|wrong|db738faf3df84405|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:ria:B15:L0:Xpair15|wrong|e4076f3d6536553e|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:ria:B16:L0:Xpair16|wrong|117a1e40608b8d13|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:rpas:B0:L0:Xpair0|wrong|de384bf1a099c45f|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B14:L0:Xpair14|wrong|654d5e309df1fb5d|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B15:L0:Xpair15|wrong|1af605e77052501e|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B17:L0:Xpair17|wrong|f8ab261915af83b1|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B18:L0:Xpair18|wrong|f8ab261915af83b1|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B19:L0:Xpair19|wrong|d22b273fd4e79cfc|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B20:L0:Xpair20|wrong|f740739a7becd405|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B21:L0:Xpair21|wrong|5bc1722530197eea|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B22:L0:Xpair22|wrong|088a45666b23f340|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B23:L0:Xpair23|wrong|b4601e6c66e80174|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B24:L0:Xpair24|wrong|485db12a87488e47|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
`;

export const KNOWN_SILENT_HOLES: readonly KnownHole[] = RAW_HOLES.trim()
  .split("\n")
  .map((line) => {
    const [siteId, kind, fingerprint, finding, ...noteParts] = line.split("|");
    return {
      siteId: siteId!,
      kind: kind as Alarm["kind"],
      fingerprint: fingerprint!,
      finding: finding!,
      note: noteParts.join("|"),
    };
  });
