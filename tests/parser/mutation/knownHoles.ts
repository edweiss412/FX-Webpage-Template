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
  // VALUE UNCHANGED on purpose (wave plan 05-section-order Task 4 Step 2): the 72 rows
  // that remain still resolve through this id, and an ARCHIVED entry keeps its id
  // resolvable exactly as BL-MUTATION-HARNESS-OPEN-HOLES did before it.
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
blank-row:inject:2025-03-dci-rpas-central:B10:L222:Xgap0|wrong|3a3d38d28a2f6854|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L223:Xgap1|wrong|1a0b00ff8851b86c|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L224:Xgap2|wrong|d6dbbd94c092eb74|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L225:Xgap3|wrong|01d48f73602df0a8|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L226:Xgap4|wrong|ac7253260f7598f8|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L151:Xgap0|wrong|1b8b600ad735440d|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L153:Xgap1|wrong|2459e378ef8b1690|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L154:Xgap2|wrong|eab66571ba669419|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L155:Xgap3|wrong|21ea55382d7828c3|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L156:Xgap4|wrong|bb8d862ab97196b6|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L157:Xgap5|wrong|01a9c0fadbe1ffa2|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L158:Xgap6|wrong|eedee75ce38f9df0|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L159:Xgap7|wrong|31bcbb2eede4c99b|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L160:Xgap8|wrong|76759b31cc27ef0e|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L161:Xgap9|wrong|76759b31cc27ef0e|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L162:Xgap10|wrong|ab58008a1e02100c|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L206:Xgap0|wrong|de10751399d34997|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L208:Xgap1|wrong|0e51ea009f56e419|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L209:Xgap2|wrong|0854edbc38bc2834|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L210:Xgap3|wrong|54446b63b0efb495|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L211:Xgap4|wrong|ad4416fb01d78653|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L212:Xgap5|wrong|8f87ec06589166fc|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L213:Xgap6|wrong|b4bf89cac1d571bd|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L214:Xgap7|wrong|3fd32821d070dde5|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L215:Xgap8|wrong|8993678f05a7794c|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L216:Xgap9|wrong|8993678f05a7794c|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L217:Xgap10|wrong|a8e27f8a8d5f5f59|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L111:Xgap0|wrong|4a0c1d95932fcccf|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L112:Xgap1|wrong|72e1500e4fbaab85|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L113:Xgap2|wrong|bbd8c6d0c20179c9|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L114:Xgap3|wrong|9ef1925ceb51cfa9|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L115:Xgap4|wrong|3e96e30d5797d623|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B33:L340:Xgap5|wrong|0a4424acb13aaa43|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B33:L342:Xgap7|wrong|a9a018bfc38349a0|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B33:L343:Xgap8|wrong|a9a018bfc38349a0|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B33:L344:Xgap9|wrong|7f2f5acc88c9bb8f|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L361:Xgap1|wrong|5a3b21c195e8d9d6|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L362:Xgap2|wrong|ca2429b6c87b2e2f|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L363:Xgap3|wrong|ce509f717c9bc726|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L364:Xgap4|wrong|963631f5e538ca47|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L365:Xgap5|wrong|52f5e01c3177651a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L366:Xgap6|wrong|aa5a22b4b0300f39|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L367:Xgap7|wrong|122a4e8cf9438b3c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L368:Xgap8|wrong|316fa3cb0864e50d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L369:Xgap9|wrong|02e7c81b949686fe|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L370:Xgap10|wrong|e9796b7bae2c6b16|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L371:Xgap11|wrong|920eb1a30961b9f7|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L372:Xgap12|wrong|9ccf006300c11598|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L373:Xgap13|wrong|17c13450240e56da|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L374:Xgap14|wrong|ef6af19f90f372c5|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L375:Xgap15|wrong|1a19a4fa7d309e57|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L376:Xgap16|wrong|971bd4b4cc50c144|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L377:Xgap17|wrong|3310da1d5361fdc0|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L378:Xgap18|wrong|9fab0983dbce4261|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L379:Xgap19|wrong|64eb86c1471b840b|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L380:Xgap20|wrong|f5934c982f560ea0|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L381:Xgap21|wrong|6ede65b6ca61f49e|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L382:Xgap22|wrong|44cc127c2486c299|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L383:Xgap23|wrong|c542973ce8e72f6a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L384:Xgap24|wrong|1baa21ac69abb115|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L385:Xgap25|wrong|2f756a97b59d2bcb|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L386:Xgap26|wrong|c6e7f3cb29f4c012|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L387:Xgap27|wrong|76e90c7e308cd735|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L388:Xgap28|wrong|ee9db647fb942fa2|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L389:Xgap29|wrong|504d6374c4ab9c62|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L390:Xgap30|wrong|b4abd7f219114cb1|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L391:Xgap31|wrong|76e8bc06947da89d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L392:Xgap32|wrong|a9481884031552a7|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L393:Xgap33|wrong|2b619a423faca977|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L394:Xgap34|wrong|cf4f7a6dc4053ad0|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L395:Xgap35|wrong|30d84a6c677cd5bb|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L396:Xgap36|wrong|f0368c7608532f47|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L397:Xgap37|wrong|434f864c648a4fb2|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L398:Xgap38|wrong|c782d77fb32cf8e9|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L399:Xgap39|wrong|e6c34eec9e4fd584|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L400:Xgap40|wrong|e14b2252bd1deb8e|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L401:Xgap41|wrong|3281995296bd149d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L402:Xgap42|wrong|a10e4db05d91e71c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L403:Xgap43|wrong|14952e9356f2a998|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L404:Xgap44|wrong|37ec11a5dd718b0c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L405:Xgap45|wrong|50571bf980906666|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L406:Xgap46|wrong|bdde6a82bb0631a5|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L407:Xgap47|wrong|95e4bab24aba3e5d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L408:Xgap48|wrong|90986d5569cc9a87|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L409:Xgap49|wrong|2e21c9cd2871c749|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L410:Xgap50|wrong|ce856dc1217aebbd|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L411:Xgap51|wrong|55908921a509fab8|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L412:Xgap52|wrong|9899cfe63579bef3|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L413:Xgap53|wrong|67c4ecc44254095f|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L414:Xgap54|wrong|1014edfd4327445d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L415:Xgap55|wrong|1c294870d611e0ae|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L416:Xgap56|wrong|093a7a7b8840da9d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L417:Xgap57|wrong|867375363954f911|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L418:Xgap58|wrong|f1c0f7551360b357|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L419:Xgap59|wrong|b99ff67bd248ef83|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L420:Xgap60|wrong|6bc3401981c0ff70|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L421:Xgap61|wrong|43ad42cbe83e4ed6|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L422:Xgap62|wrong|e8d6cb4e1de91291|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L423:Xgap63|wrong|fef8b29bd7c21b60|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L424:Xgap64|wrong|31ea356bcb77d81a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L425:Xgap65|wrong|e739c46740a8cf48|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L426:Xgap66|wrong|34105bf67a188b54|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L427:Xgap67|wrong|3d2c659ec0694942|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L428:Xgap68|wrong|b0f84e92a2969b3a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L429:Xgap69|wrong|917ef55c1bcf5ace|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L430:Xgap70|wrong|3113d195d6a15365|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L431:Xgap71|wrong|9923160311c2634b|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L432:Xgap72|wrong|d050ea0159ce7a89|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L433:Xgap73|wrong|898a9ff34d4935f5|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L434:Xgap74|wrong|bf7bdd1ef86d361d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L435:Xgap75|wrong|19ac8fadf3585501|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L436:Xgap76|wrong|fd552d345895e84c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L437:Xgap77|wrong|a983eba1afc6d6ac|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L438:Xgap78|wrong|d4383d4daa239c1f|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L439:Xgap79|wrong|b5d8a1cace92404d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L440:Xgap80|wrong|179c357e0185e034|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L441:Xgap81|wrong|1cf02676fa232401|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L442:Xgap82|wrong|961326f3d202d5c5|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L443:Xgap83|wrong|d170cf3eb9622b6d|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L444:Xgap84|wrong|9a553a1e010a4747|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L445:Xgap85|wrong|9f4b503ede0a7edf|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L446:Xgap86|wrong|ecb4f7493c160f52|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L447:Xgap87|wrong|dc3757f6fadf652a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L448:Xgap88|wrong|a9dfb72a0f1f17ee|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L449:Xgap89|wrong|4666a6e909a3cafd|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B34:L450:Xgap90|wrong|7d8423cd5cf3396a|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L70:Xgap0|wrong|317b61aa98c62560|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L71:Xgap1|wrong|9adcd16a15a44a0c|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L72:Xgap2|wrong|8bf632be071a5582|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L73:Xgap3|wrong|270acdd69da8d1ee|#10|blank-row wrong @ inject
blank-row:inject:2025-05-redefining-fixed-income-private-credit:B6:L74:Xgap4|wrong|40731d66356a7355|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L82:Xgap0|wrong|0c056e65fd97c8a2|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L83:Xgap1|wrong|bff4a0fb775596f3|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L84:Xgap2|wrong|1b86d4218a75ba1a|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L85:Xgap3|wrong|57134a47bf8932f9|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L86:Xgap4|wrong|628d1fae1a696d7c|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L257:Xgap4|wrong|8e21ddd365888035|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L258:Xgap5|wrong|6117542c31ad07e6|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L260:Xgap7|wrong|8562b076d7250eaf|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L261:Xgap8|wrong|8562b076d7250eaf|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L262:Xgap9|wrong|7b9c2dc855f0448f|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L56:Xgap0|wrong|e93ce952121c17ac|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L57:Xgap1|wrong|3231c641602fa5ee|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L58:Xgap2|wrong|02455ad4f29d5984|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L84:Xgap0|wrong|03d4cbb34ee60622|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L85:Xgap1|wrong|7c807ab28d55aaf0|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L86:Xgap2|wrong|973128ee18449bba|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L39:Xgap0|wrong|cd9f83c2c0989cd1|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L40:Xgap1|wrong|3eb4476404889721|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L41:Xgap2|wrong|3eb4476404889721|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L42:Xgap3|wrong|d0f6f00610644fbf|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L43:Xgap4|wrong|d3ae0fbcdd5074d1|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L44:Xgap5|wrong|51ef49253402aefc|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L45:Xgap6|wrong|26ddf90e3c533dc1|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L46:Xgap7|wrong|e3f656b506166047|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L47:Xgap8|wrong|1feab07e0e8d894e|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L48:Xgap9|wrong|5061f670338688b1|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L59:Xgap0|wrong|bddc0e9eca2c0260|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L60:Xgap1|wrong|9aabaa39847f9d66|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L61:Xgap2|wrong|07eef84ee91287e3|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L62:Xgap3|wrong|37a0e08a5d262bf8|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L63:Xgap4|wrong|d08b12c6f46d0a1d|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L64:Xgap5|wrong|152875339fc5b82b|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L65:Xgap6|wrong|e735d45f71ffacd1|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L66:Xgap7|wrong|9731ba1998d707c1|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L67:Xgap8|wrong|06e8b641fa4ae03f|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L68:Xgap9|wrong|b639f907c4a6cce9|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L69:Xgap10|wrong|fcf9fb0ac2f2230d|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L70:Xgap11|wrong|26834493ef4469b8|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L71:Xgap12|wrong|79d8b231ae32cb03|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L72:Xgap13|wrong|60c60facb7c2a4dc|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L73:Xgap14|wrong|b60ca4c51977749c|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L77:Xgap0|wrong|2b90f56280a344a7|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L78:Xgap1|wrong|97e761ee567a9d51|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L79:Xgap2|wrong|74a7e89b714ab125|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L97:Xgap0|wrong|d2564f587840e2d6|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L98:Xgap1|wrong|eeb6771ad94e9a59|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L99:Xgap2|wrong|935abf3c5cd52e6c|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L104:Xgap0|wrong|4758497f3adf69d5|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L105:Xgap1|wrong|4ee9bcac4835279a|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L106:Xgap2|wrong|a44bddd692b3a168|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L111:Xgap0|wrong|dd49492f38b30a37|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L112:Xgap1|wrong|7a616c4cc86d1ce5|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L113:Xgap2|wrong|cc2c1210235d76ac|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L53:Xgap0|wrong|4c7515d0e014e679|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L54:Xgap1|wrong|df8822d186414022|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L55:Xgap2|wrong|06885d54d15ba6d3|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L56:Xgap3|wrong|58d410421d536b9e|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L57:Xgap4|wrong|58d410421d536b9e|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L58:Xgap5|wrong|4931929d795c1f9e|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L59:Xgap6|wrong|c42b9ff5b6695f29|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L60:Xgap7|wrong|0443933e59326993|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L61:Xgap8|wrong|f6aa78e7c4a69ed6|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L62:Xgap9|wrong|fd621f0a58c3c369|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L63:Xgap10|wrong|c70e03c9e3163aae|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L64:Xgap11|wrong|9b476b40fb635da2|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L78:Xgap0|wrong|9d19a7d883cdf0e7|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L79:Xgap1|wrong|dcbc93d8c3729ce1|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L80:Xgap2|wrong|3021e29d00a97047|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L81:Xgap3|wrong|024dc8069cc1b071|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L82:Xgap4|wrong|d7efb1d8048fa341|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L83:Xgap5|wrong|c8e858e56fcaa1aa|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L84:Xgap6|wrong|0a3daf2bb0663535|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L85:Xgap7|wrong|ff506e5c8bd33eb2|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L86:Xgap8|wrong|985a5f606434bc28|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L87:Xgap9|wrong|fee022b5400c62b9|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L88:Xgap10|wrong|2184d727195922fd|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L89:Xgap11|wrong|2d2f3904ed96be18|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L90:Xgap12|wrong|983d11e3aed5c475|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L91:Xgap13|wrong|766daebbe674a00c|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L92:Xgap14|wrong|5806b897afaeec3c|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L93:Xgap15|wrong|d57d27f8ec08cd51|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L10:Xgap0|wrong|f446fbafea1f3524|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L11:Xgap1|wrong|5ccd8e671bc7db05|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L12:Xgap2|wrong|76c2f51a221b276f|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L13:Xgap3|wrong|f75f06cd16cd5795|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L14:Xgap4|wrong|f75f06cd16cd5795|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L15:Xgap5|wrong|8895d7891ec6789a|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L16:Xgap6|wrong|230812121e0638d8|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L17:Xgap7|wrong|c0c4e460688ebf7c|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L18:Xgap8|wrong|c967444643d5dec4|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L19:Xgap9|wrong|8eb6e304a277aa43|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L20:Xgap10|wrong|65a47adb29a9e02d|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L21:Xgap11|wrong|d1f5c95031aed691|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L35:Xgap0|wrong|3ae7e9e9e268f4c1|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L36:Xgap1|wrong|d9e6f0839f06aa53|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L37:Xgap2|wrong|4ea5240f02c867b7|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L38:Xgap3|wrong|3a8a5c4e066e0121|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L39:Xgap4|wrong|4c0040c5973c00b0|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L40:Xgap5|wrong|4f8717cc7af49018|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L41:Xgap6|wrong|dc14287c53acd5b1|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L42:Xgap7|wrong|26c97cad8eee82a1|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L43:Xgap8|wrong|f01ed5e4d48bad07|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L44:Xgap9|wrong|40cc6d2b10147150|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L45:Xgap10|wrong|8644c232b80514b5|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L46:Xgap11|wrong|20ff0c837ea797ce|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L47:Xgap12|wrong|3ce721543ab06034|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L48:Xgap13|wrong|0ec6bcaf9f0c1c27|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L49:Xgap14|wrong|acdba13040424908|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L50:Xgap15|wrong|bac68ff61c73fde6|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L54:Xgap0|wrong|4b0f767268e42d54|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L55:Xgap1|wrong|cb238adf9389359c|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L56:Xgap2|wrong|5cb2187d04bcaff3|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L25:Xgap0|wrong|490a65ab3c6e30fa|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L26:Xgap1|wrong|92ffbeeb831eb78f|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L27:Xgap2|wrong|d15e379eeffefe31|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L28:Xgap3|wrong|1ccfe366aecbe398|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L29:Xgap4|wrong|7a46b5f3da6eee3d|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L30:Xgap5|wrong|7a46b5f3da6eee3d|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L31:Xgap6|wrong|0cdcbdab9722cc62|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L32:Xgap7|wrong|a4a9b7cf22acea90|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L33:Xgap8|wrong|f18633d83dc68388|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L34:Xgap9|wrong|9f62f8b49ea33266|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L35:Xgap10|wrong|7ca19040776f3a45|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L36:Xgap11|wrong|2d241be4612207a4|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L37:Xgap12|wrong|47cb3d921ee9c3cc|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L51:Xgap0|wrong|acaf4aa458638e79|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L52:Xgap1|wrong|21db166d371320ed|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L53:Xgap2|wrong|b53d3349076f4049|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L54:Xgap3|wrong|412774f274f82b8a|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L55:Xgap4|wrong|80ba5b3f02a18b69|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L56:Xgap5|wrong|a19b78eff8403adf|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L57:Xgap6|wrong|2b542c9d9e8d703c|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L58:Xgap7|wrong|7296f7968c5a0ba3|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L59:Xgap8|wrong|27f075786005b31d|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L60:Xgap9|wrong|171702bb3bb398d8|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L61:Xgap10|wrong|a4ebd1a49ad8fd03|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L62:Xgap11|wrong|c66df37ae1b378a8|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L63:Xgap12|wrong|59156a110c05d47f|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L64:Xgap13|wrong|7285db4e58485aaf|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L65:Xgap14|wrong|7285db4e58485aaf|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L66:Xgap15|wrong|9d7ed30fa561dd23|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L93:Xgap0|wrong|4aed4e7dc68a9d05|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L94:Xgap1|wrong|5e2a4c7116c4e6ad|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L95:Xgap2|wrong|ed0bb3df0ce61423|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L100:Xgap0|wrong|fdbd2cb191eb7c85|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L101:Xgap1|wrong|435efdef258238d1|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L102:Xgap2|wrong|a8e19c72f348837c|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L107:Xgap0|wrong|8a145e7539c64a47|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L108:Xgap1|wrong|c8d756aee550f7f1|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L109:Xgap2|wrong|b0e0c4d97eff0d1a|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L114:Xgap0|wrong|40a16a410d3676e8|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L115:Xgap1|wrong|a38ac7e4d1a8fd29|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L116:Xgap2|wrong|c5f336bd6a949cb0|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L121:Xgap0|wrong|870d58402afa49d2|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L122:Xgap1|wrong|06a17e3d7b46a460|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L123:Xgap2|wrong|60c1a6db8d94120f|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L43:Xgap0|wrong|debddcc4a55399a9|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L44:Xgap1|wrong|4725c9cb008312b1|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L45:Xgap2|wrong|9e372338c6ff95d7|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L46:Xgap3|wrong|68052bd6544667e7|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L47:Xgap4|wrong|01da59bf8720c2f8|#10|blank-row wrong @ inject
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
blank-row:inject:fintech:B10:L61:Xgap0|wrong|9faae81a34ee477b|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L62:Xgap1|wrong|8121f1aa2de6599f|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L63:Xgap2|wrong|214b42ac11adbbc1|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L64:Xgap3|wrong|214b42ac11adbbc1|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L65:Xgap4|wrong|214b42ac11adbbc1|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L66:Xgap5|wrong|b99e80e4ad91c40e|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L67:Xgap6|wrong|b99e80e4ad91c40e|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L68:Xgap7|wrong|d9a10ac8e39e8e9f|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L69:Xgap8|wrong|061237f281a8895d|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L70:Xgap9|wrong|7d227d04f0ae4390|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L71:Xgap10|wrong|6ae97419c8de0fd2|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L72:Xgap11|wrong|9a5cc94876de4ca8|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L73:Xgap12|wrong|8995629852460554|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L74:Xgap13|wrong|b25be9dcb29c0643|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L100:Xgap9|wrong|1d1f2f9b973530c8|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L101:Xgap10|wrong|e6a9c731e1220e0b|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L102:Xgap11|wrong|41c5f69a8571a059|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L103:Xgap12|wrong|41c5f69a8571a059|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L104:Xgap13|wrong|41c5f69a8571a059|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L105:Xgap14|wrong|41c5f69a8571a059|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L106:Xgap15|wrong|54faeb7b8be83daa|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L91:Xgap0|wrong|83ef828a14edcb24|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L92:Xgap1|wrong|0809665c5b6a6677|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L93:Xgap2|wrong|8efe484a54b693ca|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L94:Xgap3|wrong|9b9f2837e2903bf2|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L95:Xgap4|wrong|e227ca5f61a3d53e|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L96:Xgap5|wrong|60bb4f2b4cfc0fd9|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L97:Xgap6|wrong|e9afa00d8632b5a9|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L98:Xgap7|wrong|8876b892e8a8d078|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L99:Xgap8|wrong|f45482cfb21835e0|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L111:Xgap0|wrong|f39e2a17bea32c38|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L112:Xgap1|wrong|473666efe00364f3|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L113:Xgap2|wrong|4628edfc87f77747|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L78:Xgap0|wrong|c31e39f7bfd2aec7|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L79:Xgap1|wrong|447a89bdeab9567a|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L80:Xgap2|wrong|be446df8dff760ef|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L81:Xgap3|wrong|2f561c9373cfd5b6|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L82:Xgap4|wrong|800c4071db00832f|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L83:Xgap5|wrong|e6b9e011245d9a89|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L84:Xgap6|wrong|b1280343f886d748|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L85:Xgap7|wrong|eec9bd865f42683c|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L86:Xgap8|wrong|c3a235dfd3420153|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L87:Xgap9|wrong|f44afdc85819b7a0|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L88:Xgap10|wrong|7edc65dcbcf97f29|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L89:Xgap11|wrong|9346444ee4024b61|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L90:Xgap12|wrong|d2b1a74fe578763a|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L91:Xgap13|wrong|30ea31240b2a39e8|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L92:Xgap14|wrong|7f0917e6f7c03027|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L97:Xgap0|wrong|c73147b8b866b003|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L98:Xgap1|wrong|3074444439342847|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L99:Xgap2|wrong|3353cf50871257ab|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L104:Xgap0|wrong|e856a589f16719ed|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L105:Xgap1|wrong|537768d8192f82cd|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L106:Xgap2|wrong|4114a6c36dcae7fa|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L54:Xgap0|wrong|ecf0dd6a68d6e692|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L55:Xgap1|wrong|37c470dde425a59b|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L56:Xgap2|wrong|969c03e8779f2638|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L57:Xgap3|wrong|969c03e8779f2638|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L58:Xgap4|wrong|8d5cb591693b8684|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L59:Xgap5|wrong|e29ed6f1c3257ebb|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L60:Xgap6|wrong|bd275657a6346872|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L61:Xgap7|wrong|83389500a2e12ac8|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L62:Xgap8|wrong|21dd5bf081a01e38|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L63:Xgap9|wrong|f8a5d9d89ac6b222|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L64:Xgap10|wrong|195967c01cb1a66f|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L66:Xgap1|wrong|6eb494b4e0812a5b|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L67:Xgap2|wrong|e33d423a6a2fc749|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L68:Xgap3|wrong|7760e838728bab06|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L69:Xgap4|wrong|40373e98adb77d50|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L70:Xgap5|wrong|01725365ed7f8a94|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L71:Xgap6|wrong|5a16290bb2ae6ea4|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L72:Xgap7|wrong|4f6b7809e48ad978|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L73:Xgap8|wrong|0b302b522ae5a714|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L74:Xgap9|wrong|0558fdbfa69d95e3|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L75:Xgap10|wrong|8463d09eccb3be2b|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L76:Xgap11|wrong|dd926f9fce8bb9f7|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L77:Xgap12|wrong|7e8d445154d4192d|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L78:Xgap13|wrong|5d3b9dc6f743836c|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L79:Xgap14|wrong|b59b1d20a5e42d7e|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L80:Xgap15|wrong|65022c0847c5fa99|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L81:Xgap16|wrong|ec004ca1840e5637|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L103:Xgap0|wrong|d97472460b7ebcdf|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L104:Xgap1|wrong|c455b9d0fedde85c|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L105:Xgap2|wrong|c0c18258942ba288|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L106:Xgap3|wrong|b3a2f2de8f1f1e75|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L107:Xgap4|wrong|dff776b56d590f08|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L108:Xgap5|wrong|ed23916acf1d8cb1|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L109:Xgap6|wrong|3a6bbc59160555ef|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L110:Xgap7|wrong|08f12fc7de0285b8|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L111:Xgap8|wrong|08f12fc7de0285b8|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B17:L112:Xgap9|wrong|53b154bc2420fb4c|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L117:Xgap0|wrong|18d9656cf60a9746|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L118:Xgap1|wrong|08feda2a12201f01|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L119:Xgap2|wrong|135e5dab07ed46a2|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L120:Xgap3|wrong|6dea77b1b89e7673|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L121:Xgap4|wrong|b60b0deb2b0bc33f|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L122:Xgap5|wrong|b40966c203c7284a|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L123:Xgap6|wrong|b0767c1797ecb44d|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L124:Xgap7|wrong|a6e32427a3f3277a|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L125:Xgap8|wrong|a6e32427a3f3277a|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B18:L126:Xgap9|wrong|a5a6232d34b957de|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L44:Xgap0|wrong|317b61aa98c62560|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L45:Xgap1|wrong|9adcd16a15a44a0c|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L46:Xgap2|wrong|8bf632be071a5582|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L47:Xgap3|wrong|270acdd69da8d1ee|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B9:L48:Xgap4|wrong|40731d66356a7355|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L70:Xgap1|wrong|f6247b75517195b6|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L71:Xgap2|wrong|b6bb843c084cdbe1|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L72:Xgap3|wrong|43eba70577419e51|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L73:Xgap4|wrong|8ad3aa540444e7ea|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L74:Xgap5|wrong|4cc1b64fa4f10ee7|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L75:Xgap6|wrong|fbe3dd1af32b47da|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L76:Xgap7|wrong|471e555de683026d|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L77:Xgap8|wrong|dd453b776b582778|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L78:Xgap9|wrong|1662fffb77ca102a|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L79:Xgap10|wrong|f0a85f9ef0402abd|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L80:Xgap11|wrong|8c05d47216a08682|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L81:Xgap12|wrong|f7471143c0ba0992|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L82:Xgap13|wrong|adc675d5980b1b08|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L83:Xgap14|wrong|6d1c809e84faa5d8|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L84:Xgap15|wrong|d88f8488bc28ed02|#10|blank-row wrong @ inject
blank-row:inject:ria:B15:L85:Xgap16|wrong|ebe15a1c4041231b|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L106:Xgap0|wrong|e19c7dd026b22e8b|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L107:Xgap1|wrong|4ce6ae8eadc4d291|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L108:Xgap2|wrong|631bc349281e0833|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L109:Xgap3|wrong|3188c6ce4db59c99|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L110:Xgap4|wrong|69cc440d7693f5e5|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L111:Xgap5|wrong|cb39bb863a0ebd9c|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L112:Xgap6|wrong|76b7fa51f4710ac0|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L113:Xgap7|wrong|76d38ed6073066e7|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L114:Xgap8|wrong|76d38ed6073066e7|#10|blank-row wrong @ inject
blank-row:inject:ria:B18:L115:Xgap9|wrong|7e552db3dc6494d2|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L120:Xgap0|wrong|4a51c0e42e03f911|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L121:Xgap1|wrong|38be45389fb382a9|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L122:Xgap2|wrong|4afc5ce52fea07a9|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L123:Xgap3|wrong|9e843a1824c351b1|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L124:Xgap4|wrong|65dd0afa0d5caf96|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L125:Xgap5|wrong|3da5b524139994b4|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L126:Xgap6|wrong|5ef027f8ee5bd5c6|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L127:Xgap7|wrong|00834e95a599417d|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L128:Xgap8|wrong|00834e95a599417d|#10|blank-row wrong @ inject
blank-row:inject:ria:B19:L129:Xgap9|wrong|e67b2efe327b56bb|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L42:Xgap0|wrong|60e64ff9b0b3d2db|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L43:Xgap1|wrong|491d73e32e203f14|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L44:Xgap2|wrong|ef1737a366b71e0b|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L45:Xgap3|wrong|9210e0f30cdd03e7|#10|blank-row wrong @ inject
blank-row:inject:ria:B9:L46:Xgap4|wrong|edff7d0ade4557c5|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L66:Xgap0|wrong|e55c5771e622703d|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L67:Xgap1|wrong|7bf5639ebf2633cf|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L68:Xgap2|wrong|7bf5639ebf2633cf|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L69:Xgap3|wrong|7bf5639ebf2633cf|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L70:Xgap4|wrong|7bf5639ebf2633cf|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L71:Xgap5|wrong|7bf5639ebf2633cf|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L72:Xgap6|wrong|0bde8c6e557108cb|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L73:Xgap7|wrong|aff20de957d46e49|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L74:Xgap8|wrong|4a6f7b409d2c56b1|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L75:Xgap9|wrong|4534d8bb89d21084|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L76:Xgap10|wrong|35d66fde492e2ec3|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L77:Xgap11|wrong|33a93763239a1089|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L78:Xgap12|wrong|5453673b40df4be0|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L100:Xgap5|wrong|88667590fe7ff0c3|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L101:Xgap6|wrong|a09d13f819e5179f|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L102:Xgap7|wrong|0c6f00b7198a2d68|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L103:Xgap8|wrong|488241e9180c6d72|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L104:Xgap9|wrong|9e47450b0367ea09|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L105:Xgap10|wrong|36eaf34384871fa9|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L106:Xgap11|wrong|3f9e0b841a829005|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L107:Xgap12|wrong|27a99a4b6913d1d8|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L108:Xgap13|wrong|9ec9365f71ae591c|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L109:Xgap14|wrong|00384dee3defc593|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L110:Xgap15|wrong|fc8348c676ecb063|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L95:Xgap0|wrong|4ef4344446ffd192|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L96:Xgap1|wrong|009b53f5f41f11f4|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L97:Xgap2|wrong|269366ba89dd8a48|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L98:Xgap3|wrong|7f2331be61ab9f13|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L99:Xgap4|wrong|9123bc04ac7818eb|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L115:Xgap0|wrong|c75095bd814299a2|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L116:Xgap1|wrong|c8714758cea1e88b|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L117:Xgap2|wrong|2a98543fc7dbb1ab|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L122:Xgap0|wrong|605220d157d83236|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L123:Xgap1|wrong|fd255f9475ef2ada|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L124:Xgap2|wrong|eb2969258be5c75e|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L129:Xgap0|wrong|486d9d39ca34fa00|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L130:Xgap1|wrong|fa3f75e61af62f96|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L131:Xgap2|wrong|8156f8e2a44dfa75|#10|blank-row wrong @ inject
blank-row:remove:2024-05-east-coast-family-office:B2:L24:Xgap|wrong|2e89964bc098464d|#10|blank-row wrong @ remove
blank-row:remove:2024-05-east-coast-family-office:B7:L82:Xgap|wrong|5931c53b0563e051|#10|blank-row wrong @ remove
blank-row:remove:2025-03-dci-rpas-central:B0:L5:Xgap|wrong|3a37c213c6614f55|#10|blank-row wrong @ remove
blank-row:remove:2025-03-dci-rpas-central:B14:L314:Xgap|wrong|3c84d5c20c89bdda|#10|blank-row wrong @ remove
blank-row:remove:2025-03-dci-rpas-central:B17:L338:Xgap|wrong|1731a41f45f8e28c|#10|blank-row wrong @ remove
blank-row:remove:2025-04-asset-mgmt-cfo-coo:B2:L36:Xgap|wrong|386dd35751f4d6c6|#10|blank-row wrong @ remove
blank-row:remove:2025-05-redefining-fixed-income-private-credit:B1:L26:Xgap|wrong|43b52203ea75545b|#10|blank-row wrong @ remove
blank-row:remove:2025-06-ria-investment-forum:B9:L235:Xgap|wrong|b85ac7597ab5df48|#10|blank-row wrong @ remove
blank-row:remove:2025-10-consultants-roundtable:B21:L208:Xgap|text_drift|df9994f92af6df6b|#10|section fused: warning anchor moved
blank-row:remove:2025-10-consultants-roundtable:B3:L37:Xgap|wrong|25d7f81bccefad34|#10|blank-row wrong @ remove
blank-row:remove:2026-03-rpas-central-four-seasons:B3:L38:Xgap|wrong|0883a00f69174f8b|#10|blank-row wrong @ remove
blank-row:remove:east-coast:B14:L88:Xgap|wrong|a22b97c209ef78a8|#10|blank-row wrong @ remove
blank-row:remove:east-coast:B21:L265:Xgap|wrong|8ef6c577a1b527aa|#10|blank-row wrong @ remove
blank-row:remove:east-coast:B9:L59:Xgap|wrong|3761fff0c7061d42|#10|blank-row wrong @ remove
blank-row:remove:fintech:B24:L276:Xgap|text_drift|faa418300a783b00|#10|section fused: warning anchor moved
blank-row:remove:fixed-income:B22:L245:Xgap|text_drift|d8c4110edc9a79d9|#10|section fused: warning anchor moved
blank-row:remove:rpas:B25:L229:Xgap|text_drift|04fa28bef3b0da16|#10|section fused: warning anchor moved
column-shift:2024-05-east-coast-family-office:B4:L18:X0|wrong|10fd84f06800bbb0|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2024-05-east-coast-family-office
column-shift:2025-03-dci-rpas-central:B11:L229:X0|wrong|9691549506db26ea|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-03-dci-rpas-central
column-shift:2025-03-dci-rpas-central:B12:L231:X0|wrong|50c961e1a34886c4|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-03-dci-rpas-central
column-shift:2025-04-asset-mgmt-cfo-coo:B11:L120:X0|wrong|40d1f7e036584e35|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-04-asset-mgmt-cfo-coo
column-shift:2025-05-redefining-fixed-income-private-credit:B8:L79:X0|wrong|0c304ed11acd02fd|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-05-redefining-fixed-income-private-credit
column-shift:2025-10-fixed-income-trading-summit:B6:L51:X0|wrong|e48d7016d425f3b5|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-10-fixed-income-trading-summit
column-shift:2026-03-rpas-central-four-seasons:B7:L67:X0|wrong|7438800388b79dc6|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-03-rpas-central-four-seasons
column-shift:2026-03-rpas-central-four-seasons:B8:L74:X0|wrong|7cb7de8c294c609b|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-03-rpas-central-four-seasons
column-shift:2026-04-asset-mgmt-cfo-coo-waldorf:B2:L24:X0|wrong|da71b94b552b4b81|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
column-shift:2026-04-asset-mgmt-cfo-coo-waldorf:B3:L31:X0|wrong|239d3dbbd2f42b6d|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
column-shift:2026-05-fintech-forum-cto-summit:B4:L40:X0|wrong|bdb404879c6078d5|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-05-fintech-forum-cto-summit
column-shift:2026-05-fintech-forum-cto-summit:B5:L47:X0|wrong|4f4fb91473c2e665|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2024-05-east-coast-family-office:B1:L7:X0|wrong|4c3e437a84346271|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2024-05-east-coast-family-office:B2:L12:X0|wrong|f967fc73cd9597ac|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2024-05-east-coast-family-office:B3:L16:X0|wrong|f303aa992dc08106|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2024-05-east-coast-family-office:B4:L18:X0|wrong|26f0adcfe80789c7|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2025-03-dci-rpas-central:B0:L0:X0|wrong|980105b5194f8434|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B10:L220:X0|wrong|4ce98cf222ce1461|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B12:L231:X0|wrong|191deddc3e6693ad|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B17:L258:X0|wrong|e4883c4a6c066f71|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B20:L315:X0|wrong|c10650866a6a92ed|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-04-asset-mgmt-cfo-coo:B11:L120:X0|wrong|3cfc01769503b8dd|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B18:L228:X0|wrong|0eb69f9a56ea788f|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B20:L310:X0|wrong|268581533d85b844|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B9:L110:X0|wrong|fe833a3ed9ddbb11|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-05-redefining-fixed-income-private-credit:B0:L0:X0|wrong|5e4d4106a8daf135|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B15:L197:X0|wrong|d8449dbeb750cbd3|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B18:L217:X0|wrong|a0a9592a621af088|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B30:L331:X0|wrong|c8dd2c71251bab77|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B31:L332:X0|wrong|32f7c340b4200023|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B6:L69:X0|wrong|04221874bb1e728c|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B8:L79:X0|wrong|00e5bc490a4cef78|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-06-ria-investment-forum:B1:L4:X0|wrong|4e24a6e609543c1e|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-06-ria-investment-forum:B3:L13:X0|wrong|7ee01904e348af69|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-06-ria-investment-forum:B7:L33:X0|wrong|39efbcc74b7b9199|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-10-consultants-roundtable:B0:L0:X0|wrong|b2a255e93f16d900|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B11:L76:X0|wrong|bd1c4077160a8c99|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B13:L81:X0|wrong|11f8fc3fd317d8b1|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B15:L95:X0|wrong|9e3e51635376977c|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B27:L173:X0|wrong|634b69e3b6ec27ad|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B38:L249:X0|wrong|662f3c2a6f13ea56|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B39:L250:X0|wrong|567c3163deace300|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B6:L44:X0|wrong|a8117013ca3b2a6e|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B8:L55:X0|wrong|69ca1b7e808d687e|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-fixed-income-trading-summit:B0:L0:X0|wrong|7b6bbcbeadb0e669|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B1:L8:X0|wrong|268bdc486e8ac56f|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B10:L83:X0|wrong|9e6610de1955123c|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B4:L32:X0|wrong|05548598c4164585|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B5:L37:X0|wrong|f3250038fb161fac|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B6:L51:X0|wrong|3758a332ae09b6ee|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B9:L76:X0|wrong|033711d5527771d9|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2026-03-rpas-central-four-seasons:B0:L0:X0|wrong|e5a07ec3aee724bf|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B10:L96:X0|wrong|09d9194f9e32f932|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B11:L103:X0|wrong|5005650769f388a2|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B12:L110:X0|wrong|5a28117b1f437571|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B2:L16:X0|wrong|865800f04a7310bb|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B42:L724:X0|wrong|3487702e4b17b364|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B43:L725:X0|wrong|5599b8335fa10857|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B6:L51:X0|wrong|47d32048fd76856f|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B7:L67:X0|wrong|a90ffc26b2eeb37e|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B0:L0:X0|wrong|403aea478e9b10ba|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L8:X0|wrong|7e0bccf2bd8f2280|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B2:L24:X0|wrong|d3419594db186582|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B7:L65:X0|wrong|0d5b433ac89a8969|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-05-fintech-forum-cto-summit:B0:L0:X0|wrong|0d6f159a2f1c6e1b|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B1:L8:X0|wrong|e6140c97e4aca2a0|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B3:L23:X0|wrong|48811bb36d0c7c7b|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B4:L40:X0|wrong|5630aa5df4a6f176|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B9:L81:X0|wrong|57c977391126a809|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:consultants:B1:L3:X0|wrong|bb46b19be9033a84|#5|header-typo wrong @ consultants
header-typo:consultants:B11:L53:X0|wrong|5928a6b98a45bcf9|#5|header-typo wrong @ consultants
header-typo:consultants:B15:L84:X0|wrong|787ebca3f69f8844|#5|header-typo wrong @ consultants
header-typo:consultants:B16:L91:X0|wrong|f7eb2123664a073c|#5|header-typo wrong @ consultants
header-typo:consultants:B17:L98:X0|wrong|f3d137d291bf4d12|#5|header-typo wrong @ consultants
header-typo:consultants:B18:L105:X0|wrong|4e0d050f85c1310c|#5|header-typo wrong @ consultants
header-typo:consultants:B19:L112:X0|wrong|7d56b3d3cab2e1fe|#5|header-typo wrong @ consultants
header-typo:consultants:B2:L9:X0|wrong|79afcca704b7a81a|#5|header-typo wrong @ consultants
header-typo:consultants:B20:L119:X0|wrong|bb76b44145aaee8b|#5|header-typo wrong @ consultants
header-typo:consultants:B23:L143:X0|wrong|39849c02ce8d21d4|#5|header-typo wrong @ consultants
header-typo:consultants:B25:L181:X0|wrong|4d3c885ba04c4aab|#5|header-typo wrong @ consultants
header-typo:consultants:B27:L187:X0|wrong|586e27990a2d5ae0|#5|header-typo wrong @ consultants
header-typo:consultants:B29:L196:X0|wrong|04e4c11210a8fe17|#5|header-typo wrong @ consultants
header-typo:consultants:B31:L205:X0|wrong|807f4055b17eee4b|#5|header-typo wrong @ consultants
header-typo:consultants:B33:L214:X0|wrong|95aff5c226326ab6|#5|header-typo wrong @ consultants
header-typo:consultants:B35:L222:X0|wrong|8faf00c3b9be63be|#5|header-typo wrong @ consultants
header-typo:consultants:B48:L280:X0|wrong|740764c914c1ca04|#5|header-typo wrong @ consultants
header-typo:consultants:B49:L281:X0|wrong|cf046363f69e5715|#5|header-typo wrong @ consultants
header-typo:consultants:B7:L37:X0|wrong|855fe2e1b4b5d4f1|#5|header-typo wrong @ consultants
header-typo:consultants:B9:L42:X0|wrong|eaee0c3442d1817b|#5|header-typo wrong @ consultants
header-typo:east-coast:B13:L60:X0|wrong|e2c917b157967c62|#5|header-typo wrong @ east-coast
header-typo:east-coast:B2:L5:X0|wrong|06b55fbd98b5758a|#5|header-typo wrong @ east-coast
header-typo:east-coast:B22:L132:X0|wrong|99b53bbdf845d9b5|#5|header-typo wrong @ east-coast
header-typo:east-coast:B3:L8:X0|wrong|69d709f6ec503c06|#5|header-typo wrong @ east-coast
header-typo:east-coast:B6:L26:X0|wrong|1c152af3757faf15|#5|header-typo wrong @ east-coast
header-typo:east-coast:B7:L28:X0|wrong|782c33283c9e5e23|#5|header-typo wrong @ east-coast
header-typo:east-coast:B8:L31:X0|wrong|d07b10a5f0689dcb|#5|header-typo wrong @ east-coast
header-typo:east-coast:B9:L34:X0|wrong|cf70a1900755a3ae|#5|header-typo wrong @ east-coast
header-typo:fintech:B11:L77:X0|wrong|6fa364bde01a24e6|#5|header-typo wrong @ fintech
header-typo:fintech:B14:L89:X0|wrong|0b6448b3ff90c519|#5|header-typo wrong @ fintech
header-typo:fintech:B2:L5:X0|wrong|f771ef298e2d23c3|#5|header-typo wrong @ fintech
header-typo:fintech:B21:L159:X0|wrong|e3c733985ac557e9|#5|header-typo wrong @ fintech
header-typo:fintech:B3:L12:X0|wrong|6961175983a970f0|#5|header-typo wrong @ fintech
header-typo:fintech:B8:L40:X0|wrong|ab9298dd26c0a2af|#5|header-typo wrong @ fintech
header-typo:fintech:B9:L43:X0|wrong|2adbc448b812788c|#5|header-typo wrong @ fintech
header-typo:fixed-income:B1:L3:X0|wrong|d39051bcb210ab8b|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B10:L67:X0|wrong|51417a5b106b900b|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B13:L76:X0|wrong|a43e45ac37368a0f|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B14:L95:X0|wrong|784f10caa71ad62b|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B15:L102:X0|wrong|77f52d285833d604|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B17:L124:X0|wrong|05fb928d4d720039|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B19:L162:X0|wrong|63b1bfb5ed069f07|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B2:L11:X0|wrong|a0ffc3d3eac63063|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B7:L40:X0|wrong|954695707cf4d7a1|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B8:L43:X0|wrong|be08f92fff1149c7|#5|header-typo wrong @ fixed-income
header-typo:redefining-fi:B1:L3:X0|wrong|5e4d4106a8daf135|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B11:L54:X0|wrong|00e5bc490a4cef78|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B15:L84:X0|wrong|844dca52c20dba3b|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B17:L101:X0|wrong|0d99b1a8b6bb4e57|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B18:L115:X0|wrong|18d9656cf60a9746|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B2:L9:X0|wrong|d8449dbeb750cbd3|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B36:L354:X0|wrong|d94a636734c86304|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B37:L355:X0|wrong|19fb6fdf9f50dd15|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B9:L43:X0|wrong|04221874bb1e728c|#5|header-typo wrong @ redefining-fi
header-typo:ria:B1:L4:X0|wrong|3bc968f32d2ce9a2|#5|header-typo wrong @ ria
header-typo:ria:B12:L58:X0|wrong|68f012f6ffa2daf1|#5|header-typo wrong @ ria
header-typo:ria:B16:L88:X0|wrong|90ce6f50a123dcf0|#5|header-typo wrong @ ria
header-typo:ria:B18:L104:X0|wrong|f4f5d1f62f040ef1|#5|header-typo wrong @ ria
header-typo:ria:B19:L118:X0|wrong|95c3812de2383ff9|#5|header-typo wrong @ ria
header-typo:ria:B2:L10:X0|wrong|9ccd601447deebb7|#5|header-typo wrong @ ria
header-typo:ria:B7:L36:X0|wrong|5b0f29d94ca16dcb|#5|header-typo wrong @ ria
header-typo:ria:B9:L41:X0|wrong|7a9cd1bb597964a9|#5|header-typo wrong @ ria
header-typo:rpas:B1:L3:X0|wrong|4e7685927c5a75a9|#5|header-typo wrong @ rpas
header-typo:rpas:B11:L81:X0|wrong|44bc7129a6edb8ad|#5|header-typo wrong @ rpas
header-typo:rpas:B14:L93:X0|wrong|95abec700f224ab5|#5|header-typo wrong @ rpas
header-typo:rpas:B15:L113:X0|wrong|9c02cd9a8095fd9b|#5|header-typo wrong @ rpas
header-typo:rpas:B16:L120:X0|wrong|23ee47a4c7844e9d|#5|header-typo wrong @ rpas
header-typo:rpas:B17:L127:X0|wrong|92b74a668f3827f2|#5|header-typo wrong @ rpas
header-typo:rpas:B19:L149:X0|wrong|1121b42ef5a14235|#5|header-typo wrong @ rpas
header-typo:rpas:B2:L11:X0|wrong|deea782c2cd0286b|#5|header-typo wrong @ rpas
header-typo:rpas:B21:L189:X0|wrong|e5f568b79b1f4035|#5|header-typo wrong @ rpas
header-typo:rpas:B23:L198:X0|wrong|7144402bfa53d19d|#5|header-typo wrong @ rpas
header-typo:rpas:B54:L339:X0|wrong|b3f929bd8d728d05|#5|header-typo wrong @ rpas
header-typo:rpas:B55:L340:X0|wrong|3ae412a668c5a441|#5|header-typo wrong @ rpas
header-typo:rpas:B7:L39:X0|wrong|5e01ede1df0228b9|#5|header-typo wrong @ rpas
header-typo:rpas:B8:L42:X0|wrong|5a124e58248a2cab|#5|header-typo wrong @ rpas
merged-cell:2025-03-dci-rpas-central:B20:L317:X0|wrong|6c526f2260e7d7de|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-03-dci-rpas-central:B20:L317:X1|wrong|1973a94b4aa13fc0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-03-dci-rpas-central:B20:L318:X1|wrong|6c526f2260e7d7de|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L312:X0|wrong|43988ebbf32d3781|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L312:X1|wrong|f22dcca5be4865ad|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L313:X1|wrong|43988ebbf32d3781|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L199:X0|wrong|f107ab13d9a0ddcb|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L199:X1|wrong|cbd7905e843f9b29|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L200:X1|wrong|f107ab13d9a0ddcb|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-06-ria-investment-forum:B0:L0:X0|wrong|127234075b657728|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L35:X0|wrong|a994e3cd2bf9b502|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L35:X1|wrong|eb411fbd7e75bdc5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L36:X1|wrong|a994e3cd2bf9b502|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-10-consultants-roundtable:B15:L97:X0|wrong|814f713f29b66dd3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B15:L97:X1|wrong|2df1658c3e0e8201|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B15:L98:X1|wrong|814f713f29b66dd3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B22:L139:X1|text_drift|6d3a7189be07eae2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: snippet moved]
merged-cell:2025-10-consultants-roundtable:B28:L209:X10|wrong|dd0fe1c636111ede|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X11|text_drift|bd20732b92d44cdb|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X12|text_drift|bd20732b92d44cdb|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X13|text_drift|bd20732b92d44cdb|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X14|text_drift|bd20732b92d44cdb|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X17|signal_loss|b2419d20b310b8a2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X18|signal_loss|b2419d20b310b8a2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X19|signal_loss|b2419d20b310b8a2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X2|wrong|0ad8a063433941da|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X20|signal_loss|b2419d20b310b8a2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X3|wrong|c8ea5feb15eb53b2|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X4|wrong|c8ea5feb15eb53b2|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X5|wrong|35b3011293573741|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X6|wrong|35b3011293573741|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X7|wrong|35b3011293573741|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X8|wrong|35b3011293573741|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X9|wrong|dd0fe1c636111ede|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-fixed-income-trading-summit:B32:L251:X0|text_drift|e821a575cee5ed9a|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-fixed-income-trading-summit [triaged 2026-08-10: snippet moved]
merged-cell:2025-10-fixed-income-trading-summit:B4:L34:X0|wrong|76949991789c598c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2025-10-fixed-income-trading-summit:B4:L34:X1|wrong|2f2dacc7394c7b82|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2025-10-fixed-income-trading-summit:B4:L35:X1|wrong|76949991789c598c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2026-03-rpas-central-four-seasons:B22:L237:X0|text_drift|03d3605a3f1b9a5e|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-03-rpas-central-four-seasons [triaged 2026-08-10: snippet moved]
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B29:L339:X0|text_drift|910b33455ff75e35|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-04-asset-mgmt-cfo-coo-waldorf [triaged 2026-08-10: snippet moved]
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B36:L744:X0|wrong|a5d7a38d71da4d6b|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B36:L744:X6|wrong|a5d7a38d71da4d6b|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
merged-cell:2026-05-fintech-forum-cto-summit:B30:L311:X0|text_drift|47834f14f424a469|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-05-fintech-forum-cto-summit [triaged 2026-08-10: snippet moved]
merged-cell:consultants:B0:L0:X0|wrong|96eb10a9aa679f56|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X1|wrong|96eb10a9aa679f56|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X2|wrong|96eb10a9aa679f56|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X3|wrong|96eb10a9aa679f56|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L11:X0|wrong|eb23e5e003242627|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L11:X1|wrong|fb993d016745b7b8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L12:X1|wrong|eb23e5e003242627|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B22:L141:X0|wrong|6931060870d9d079|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B22:L141:X1|wrong|6931060870d9d079|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B24:L146:X0|wrong|6ae81e6878f3ce26|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B26:L184:X0|wrong|1c2bcfa1d2c69b54|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B26:L184:X6|wrong|f727b9113cce93d1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B28:L190:X0|wrong|f668a5bb0f514c96|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B28:L190:X6|wrong|a6c33ee4760bf0bc|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B30:L199:X0|wrong|b7a3f57e7b834086|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B30:L199:X6|wrong|7221b873098f9ab9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B32:L208:X0|wrong|ce40735752a820e9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B32:L208:X6|wrong|d0f5a6bf4fd69b3e|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L217:X0|wrong|e692073c641b37b5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L217:X6|wrong|264d8e631e10ba68|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L219:X0|wrong|32c741f8405b6875|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L219:X6|wrong|a19f30e0120a9c73|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L220:X0|wrong|f399f907234c9715|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L220:X6|wrong|bd7cf8c07d14f547|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B36:L225:X0|wrong|77760cd765411164|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:east-coast:B0:L0:X0|wrong|6d4b029acbe6582f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:east-coast:B2:L6:X0|wrong|6611f4e90054037e|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:east-coast:B7:L29:X0|wrong|98970b5afc73aca1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:fintech:B0:L0:X0|wrong|7222f8dc4874d8f9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X1|wrong|7222f8dc4874d8f9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X2|wrong|7222f8dc4874d8f9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X3|wrong|7222f8dc4874d8f9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B22:L162:X0|wrong|51206592a77b23e2|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X0|wrong|6d3c6c303a1bc39c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X1|wrong|6d3c6c303a1bc39c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X2|wrong|6d3c6c303a1bc39c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X3|wrong|6d3c6c303a1bc39c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X4|wrong|6d3c6c303a1bc39c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X5|wrong|6d3c6c303a1bc39c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X7|wrong|6d3c6c303a1bc39c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B6:L35:X0|wrong|8bcc6bfaab12c2f1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B6:L35:X1|wrong|4a551800b689b8bf|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fixed-income:B0:L0:X0|wrong|a898be4df4d28a57|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X1|wrong|a898be4df4d28a57|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X2|wrong|a898be4df4d28a57|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X3|wrong|a898be4df4d28a57|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B18:L127:X0|wrong|d733e295fdbc1c2d|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B20:L165:X0|wrong|4ae040d5007e7a00|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B5:L35:X0|wrong|c1ea1fafa6d5477b|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B5:L35:X1|wrong|d174ffb5a60bb1b8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:redefining-fi:B2:L11:X0|wrong|f107ab13d9a0ddcb|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:redefining-fi:B2:L11:X1|wrong|cbd7905e843f9b29|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:redefining-fi:B2:L12:X1|wrong|f107ab13d9a0ddcb|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:ria:B0:L0:X0|wrong|89745e4d9656b163|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L12:X0|wrong|684ceb32b635e4a6|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L12:X1|wrong|f80365683475fcf0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L13:X1|wrong|684ceb32b635e4a6|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B5:L31:X0|wrong|ca9d84dc9c0422bc|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B5:L31:X1|wrong|0a8a60f10da66104|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:rpas:B0:L0:X0|wrong|284df5d1506891f4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X1|wrong|284df5d1506891f4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X2|wrong|284df5d1506891f4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X3|wrong|284df5d1506891f4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B20:L152:X0|wrong|e3a173d4cab161c8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B22:L192:X0|wrong|a9beea6b9192afab|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B24:L201:X0|wrong|d1b3376606ad6294|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X0|wrong|d606721a9271c952|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X1|wrong|d606721a9271c952|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X2|wrong|d606721a9271c952|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X3|wrong|d606721a9271c952|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X4|wrong|d606721a9271c952|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X5|wrong|d606721a9271c952|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X6|wrong|d606721a9271c952|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X8|wrong|d606721a9271c952|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B5:L34:X0|wrong|efe168e001078c28|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B5:L34:X1|wrong|1e3d38c4ed7c5232|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
section-reorder:2024-05-east-coast-family-office:B0:L0:Xpair0|wrong|8f452b074f633910|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2024-05-east-coast-family-office
section-reorder:2025-03-dci-rpas-central:B0:L0:Xpair0|wrong|3a37c213c6614f55|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-03-dci-rpas-central
section-reorder:2025-03-dci-rpas-central:B7:L0:Xpair7|wrong|f2c64205cc40cc6b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-03-dci-rpas-central
section-reorder:2025-04-asset-mgmt-cfo-coo:B0:L0:Xpair0|wrong|ef885529ffc657ee|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-04-asset-mgmt-cfo-coo
section-reorder:2025-04-asset-mgmt-cfo-coo:B3:L0:Xpair3|wrong|225c4a14d0d1861d|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-04-asset-mgmt-cfo-coo
section-reorder:2025-06-ria-investment-forum:B0:L0:Xpair0|wrong|127234075b657728|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-06-ria-investment-forum
section-reorder:consultants:B0:L0:Xpair0|wrong|96eb10a9aa679f56|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B14:L0:Xpair14|wrong|c7b61d1d70b0b930|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B15:L0:Xpair15|wrong|170e719a44ebef5f|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B16:L0:Xpair16|wrong|5da590f313adc847|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B20:L0:Xpair20|wrong|0dafceefb8fa7051|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B21:L0:Xpair21|wrong|0dafceefb8fa7051|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B22:L0:Xpair22|wrong|7d79424414597970|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B23:L0:Xpair23|wrong|c783899518ea8804|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B24:L0:Xpair24|wrong|5d1d597e0b277d44|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B25:L0:Xpair25|wrong|20d6f843c9c1c1d5|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B26:L0:Xpair26|wrong|c54a2aae0a6864c9|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B27:L0:Xpair27|wrong|64d0c533533fc7af|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B28:L0:Xpair28|wrong|b91278baf8744698|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B29:L0:Xpair29|wrong|14c8c61b5d20e8be|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B30:L0:Xpair30|wrong|ba92b2cc876af287|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B31:L0:Xpair31|wrong|1f4e136e64fb46c8|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B32:L0:Xpair32|wrong|beae3992efdc6f4b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B33:L0:Xpair33|wrong|ae1c0151463869e9|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B34:L0:Xpair34|wrong|178113228e32613f|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B35:L0:Xpair35|wrong|d2b04744f1879c4f|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:east-coast:B0:L0:Xpair0|wrong|6bae3ca98e5a02e0|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B12:L0:Xpair12|wrong|fb9ebbaf30016a3a|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B13:L0:Xpair13|wrong|fb9ebbaf30016a3a|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B14:L0:Xpair14|wrong|08c27054ae426583|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:fintech:B0:L0:Xpair0|wrong|7222f8dc4874d8f9|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B18:L0:Xpair18|wrong|e7c4bdf5182c702c|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B19:L0:Xpair19|wrong|e7c4bdf5182c702c|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B20:L0:Xpair20|wrong|e7c4bdf5182c702c|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B21:L0:Xpair21|wrong|f91057a088037e52|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fixed-income:B0:L0:Xpair0|wrong|a898be4df4d28a57|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B13:L0:Xpair13|wrong|fad113cd971180c9|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B15:L0:Xpair15|wrong|50ff5be44a645e68|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B16:L0:Xpair16|wrong|50ff5be44a645e68|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B17:L0:Xpair17|wrong|9051454a346b3716|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B18:L0:Xpair18|wrong|54a403b190e520c8|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B19:L0:Xpair19|wrong|1ef899a73d2231aa|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B20:L0:Xpair20|wrong|7eb1914dbfafe660|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:redefining-fi:B14:L0:Xpair14|wrong|31e8afe7037d1f3c|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ redefining-fi
section-reorder:redefining-fi:B15:L0:Xpair15|wrong|0eb61ef6333f9609|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ redefining-fi
section-reorder:ria:B0:L0:Xpair0|wrong|f2faf68c54ef61ad|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:ria:B15:L0:Xpair15|wrong|e1b8be68debaa14b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:ria:B16:L0:Xpair16|wrong|6f460db78c2c63ff|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:rpas:B0:L0:Xpair0|wrong|284df5d1506891f4|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B14:L0:Xpair14|wrong|3384123f44330eba|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B15:L0:Xpair15|wrong|caebfa2e72dd75b9|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B17:L0:Xpair17|wrong|b0f498c08feb6173|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B18:L0:Xpair18|wrong|b0f498c08feb6173|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B19:L0:Xpair19|wrong|68ec8ff4e34a1b7b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B20:L0:Xpair20|wrong|6b3e24a4f3425108|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B21:L0:Xpair21|wrong|58e63db966046a74|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B22:L0:Xpair22|wrong|9abdac6825c57310|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B23:L0:Xpair23|wrong|a0fb927d09d3ad2b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B24:L0:Xpair24|wrong|1d9a0a7db972ec03|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
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
