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
// ─── SHRUNK 2026-08-15 by the content-keyed field near-miss detector
//     (`feat/mutation-section-order`, mutation wave 5/5): 10 holes closed, 1088 → 1078.
//     The `UNKNOWN_FIELD` emitter used to read `parseVenue`'s POSITIONAL scope window, so
//     moving a block moved the emission set and the swap oracle saw real signal loss. The
//     replacement is keyed on row CONTENT alone and reads nothing positional, so it is
//     swap-invariant by construction and these ten holes are CLOSED, not re-blessed.
//
//     THE OTHER 72 `section-reorder` ROWS STAY, and they are not debt of the same kind:
//     they are the parser's ratified order-sensitivity (spec 2026-08-07 §7), documented
//     rather than owed. That is why the shrink is exactly the ten the §2.3 real-loss set
//     names and not the whole operator — sizing a shrink by an operator's row count is
//     the instrument branch 4 already recorded as wrong in both directions. ────
// 1078 known silent holes = current parser reality, pinned so a REGRESSION (a NEW silent
// hole) or a FIX (a resolved hole → stale row) both fail the nightly harness. Stored as
// pipe-delimited rows inside a TEMPLATE LITERAL (prettier leaves its interior intact, so each hole
// stays ONE line instead of prettier exploding 1078 object literals to ~12k lines). Row format:
//   siteId|kind|fingerprint|finding|note      (fields are pipe-free: siteId uses ':', fp is hex)
// finding = OPERATOR_FINDING_MAP[operator] (audit #N or BL-MUTATION-* — never a blanket "unaudited",
// Codex R3). Fingerprints use the EXHAUSTIVE-by-type signal redaction (oracle.ts redactNode) so an
// in-ledger drift on ANY signal field is caught (Codex R3). Ratchet: SHRINK this list as holes are
// fixed; never grow it silently.
//
// BREAKDOWN, recounted from the live rows on 2026-08-15 (see the census note below):
//   section-reorder (order-sensitivity, reclassified corrupting) = 72 — 58 wrong + 14
//   text_drift, and ZERO signal_loss, because the ten rows the near-miss detector closed
//   were the whole of this operator's signal_loss population;
//   all others = 1006 — 983 wrong + 16 text_drift + 7 signal_loss;
//   total 1078 = 1041 wrong + 30 text_drift + 7 signal_loss;
//   by operator: blank-row 738, header-typo 134, merged-cell 122, section-reorder 72,
//   column-shift 12.
//
// THE PREVIOUS FIGURES WERE STALE, and by more than this shrink: they read "= 82; all
// others = 1332; by kind: 1349 wrong + 35 signal_loss + 30 text_drift", which sums to
// 1414 — the pre-wave-4 total. The wave-4 shrink (1414 → 1088) moved the rows and left
// this line behind, so only the `82` was ever true at HEAD. Recounted here in full rather
// than decremented, since decrementing a wrong number keeps it wrong.
const RAW_HOLES = `
blank-row:inject:2024-05-east-coast-family-office:B10:L69:Xgap0|wrong|73d9f07eed068f65|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L70:Xgap1|wrong|c1155b75248f6c82|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L71:Xgap2|wrong|ee0abbf53bbca1e1|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L72:Xgap3|wrong|33e14c2d9e2bb116|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L73:Xgap4|wrong|dfe6a867f1109c7a|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L74:Xgap5|wrong|19358feba5a736e0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L75:Xgap6|wrong|a5e21c8991af70d1|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L76:Xgap7|wrong|5f9abce98f9661f8|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L77:Xgap8|wrong|bf12605c47738aa5|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L78:Xgap9|wrong|3a82fa138b27fe50|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L79:Xgap10|wrong|a64a72cd25a780d1|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B10:L80:Xgap11|wrong|d03fcbe6bc869139|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L208:Xgap1|wrong|b76c144b22e3c8fa|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L209:Xgap2|wrong|5e8fd700a0f4759b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L210:Xgap3|wrong|22093ed10919d71c|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L211:Xgap4|wrong|2c9a15028eb3a414|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L212:Xgap5|wrong|8cc48ced2abff7f8|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L213:Xgap6|wrong|ed92e40758602e37|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L214:Xgap7|wrong|70e79b5d3ede39d6|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L215:Xgap8|wrong|261392012699f9b5|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L216:Xgap9|wrong|95cb7c676789e756|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L217:Xgap10|wrong|9c4243ed693ff2ef|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L218:Xgap11|wrong|c50b19e005b62acc|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L219:Xgap12|wrong|0013c7cde8cb78dc|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L220:Xgap13|wrong|0b7db69054301e12|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L221:Xgap14|wrong|8c2bcf78b8d9b339|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L222:Xgap15|wrong|f380162bcc1051e0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L223:Xgap16|wrong|0f303fca07f3546d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L224:Xgap17|wrong|a102a1d4cf43b3fa|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L225:Xgap18|wrong|15eadc217b6d868c|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L226:Xgap19|wrong|9067147ffdfa5ccb|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L227:Xgap20|wrong|3c3f415fb87bf976|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L228:Xgap21|wrong|374b7f465c8603c0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L229:Xgap22|wrong|868fbecea7c31127|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L230:Xgap23|wrong|f0ffc9ffc3b26bbe|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L231:Xgap24|wrong|7b2beb4635ce42a5|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L232:Xgap25|wrong|6b2315ac3c94310b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L233:Xgap26|wrong|81e1f117345eddf3|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L234:Xgap27|wrong|40a03651213c9832|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L235:Xgap28|wrong|1a78ae84ae7d0702|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L236:Xgap29|wrong|c1bc312c55e7fad5|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L237:Xgap30|wrong|240aee24e63b548e|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L238:Xgap31|wrong|108690a2754c399c|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L239:Xgap32|wrong|cdf63138ba2f4ee2|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L240:Xgap33|wrong|71443083cbad511b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L241:Xgap34|wrong|3f2e1529c2e52fc8|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L242:Xgap35|wrong|87bae76f0444f643|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L243:Xgap36|wrong|2a1144d0190da9c9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L244:Xgap37|wrong|fb1a864d6c52ec93|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L245:Xgap38|wrong|45b39950e43529a5|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L246:Xgap39|wrong|c5f88607dd711c65|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L247:Xgap40|wrong|9800ae455db036d6|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L248:Xgap41|wrong|26173558900c990e|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L249:Xgap42|wrong|4ffaf4750e7f8e5a|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L250:Xgap43|wrong|15317a7ebaeaebe6|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L251:Xgap44|wrong|4b9ac219c65dee8b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L252:Xgap45|wrong|cd6082daa3c1be5d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L253:Xgap46|wrong|9d023281fe703d93|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L254:Xgap47|wrong|bb1d3c27f61e9ca7|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L255:Xgap48|wrong|564da175096625e9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L256:Xgap49|wrong|bf010c6106c315c2|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L257:Xgap50|wrong|d278212e05382832|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L258:Xgap51|wrong|0d00166dc26e3b97|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L259:Xgap52|wrong|5af9283dc3819474|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L260:Xgap53|wrong|94eb1a79384c93b1|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L261:Xgap54|wrong|f29abe83e4eb545a|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L262:Xgap55|wrong|1302e9cf8babd837|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L263:Xgap56|wrong|c7e13889dc6aae9e|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L264:Xgap57|wrong|482733e2b3be9c6c|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L265:Xgap58|wrong|a0156850c945d5f3|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L266:Xgap59|wrong|5e7490ad692f6d09|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L267:Xgap60|wrong|8de0ffdf766081b3|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L268:Xgap61|wrong|120daa9602c0c3e0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L269:Xgap62|wrong|a0927b937b527bb4|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L270:Xgap63|wrong|4844435b9dc9c5e6|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L271:Xgap64|wrong|2916a71840bd4d03|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L272:Xgap65|wrong|3a9605b637bd39b6|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L273:Xgap66|wrong|d51b3ceeae16eb78|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L274:Xgap67|wrong|c7652174db8bf5a9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L275:Xgap68|wrong|18e3605715cd97a3|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L276:Xgap69|wrong|a77e1602c78a54b7|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L277:Xgap70|wrong|74d97bb3dba985a3|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L278:Xgap71|wrong|822e220bd3c0fdf7|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L279:Xgap72|wrong|1e65d8a82c6bde75|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L280:Xgap73|wrong|d5d9c7050f5faded|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L281:Xgap74|wrong|d18edd21564ca15b|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L282:Xgap75|wrong|7838b5c236b00045|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L283:Xgap76|wrong|a9ab423380bac77a|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L284:Xgap77|wrong|eb8c960df7a7e9bf|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L285:Xgap78|wrong|9a6e164f4d810731|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L286:Xgap79|wrong|21fa41d01e1361b7|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L287:Xgap80|wrong|9a28f090f64b600f|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L288:Xgap81|wrong|6bfa637abd6cd0ae|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L289:Xgap82|wrong|e149f254709103a3|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L290:Xgap83|wrong|c5f889cc1c141089|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L291:Xgap84|wrong|69804c7c348d2bbd|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L292:Xgap85|wrong|05219f2a7e1db114|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L293:Xgap86|wrong|4f40d25684fdf1d6|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L294:Xgap87|wrong|8739403281beae89|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L295:Xgap88|wrong|ea7ef95ef927aa05|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L296:Xgap89|wrong|57698fea1728fb2e|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B14:L297:Xgap90|wrong|301573e084e37661|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L25:Xgap0|wrong|e43544c3d07ae7ae|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L27:Xgap1|wrong|11616e48a91c2870|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L28:Xgap2|wrong|c3a55599ea30aa5d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L29:Xgap3|wrong|42a27851846ef751|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L30:Xgap4|wrong|863d81818d228bf9|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L34:Xgap7|wrong|d3c594b529808130|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L35:Xgap8|wrong|19159b9083030d8d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L36:Xgap9|wrong|038ab70e26d79be0|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L37:Xgap10|wrong|60359f0a74fbba4d|#10|blank-row wrong @ inject
blank-row:inject:2024-05-east-coast-family-office:B6:L38:Xgap11|wrong|9a9d8cd5a7c1f0c6|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L222:Xgap0|wrong|9d40aaf260dd7b78|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L223:Xgap1|wrong|68f7a100803cef86|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L224:Xgap2|wrong|9594cc9aed058f8b|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L225:Xgap3|wrong|cbfc4997e8494e0f|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B10:L226:Xgap4|wrong|27047f1417cc37c2|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L151:Xgap0|wrong|d84683fae7a83d4b|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L153:Xgap1|wrong|949fc4cc52bbdb62|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L154:Xgap2|wrong|25810da40588e025|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L155:Xgap3|wrong|68314a26a91061ee|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L156:Xgap4|wrong|c09932d8211c7f1a|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L157:Xgap5|wrong|6668122b20f3dd18|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L158:Xgap6|wrong|fd7c8b63581691e0|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L159:Xgap7|wrong|36781822179cf9e9|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L160:Xgap8|wrong|82245528aee93511|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L161:Xgap9|wrong|82245528aee93511|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B4:L162:Xgap10|wrong|bc826e93a4801231|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L206:Xgap0|wrong|ef623b9afd74d11a|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L208:Xgap1|wrong|2cfd038e226f73ff|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L209:Xgap2|wrong|1fe63f649ef2c1ed|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L210:Xgap3|wrong|e7e5120963f15d4b|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L211:Xgap4|wrong|96e21d7acd3ccdba|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L212:Xgap5|wrong|b10b7036486d2424|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L213:Xgap6|wrong|8bfb2f15beafd3bd|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L214:Xgap7|wrong|250a572c00c62f8f|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L215:Xgap8|wrong|b3adf3d091cfdabd|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L216:Xgap9|wrong|b3adf3d091cfdabd|#10|blank-row wrong @ inject
blank-row:inject:2025-03-dci-rpas-central:B9:L217:Xgap10|wrong|3fef395c7f151175|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L111:Xgap0|wrong|885dee601c734922|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L112:Xgap1|wrong|1e89bf6acccf7839|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L113:Xgap2|wrong|e664b85ad4e469c5|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L114:Xgap3|wrong|dbed37cfe49e1e26|#10|blank-row wrong @ inject
blank-row:inject:2025-04-asset-mgmt-cfo-coo:B9:L115:Xgap4|wrong|22ddc402f8576b6f|#10|blank-row wrong @ inject
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
blank-row:inject:2025-10-consultants-roundtable:B13:L82:Xgap0|wrong|96ca8aab00038840|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L83:Xgap1|wrong|22f7f7568fb6bf5f|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L84:Xgap2|wrong|132b7f309f2b207f|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L85:Xgap3|wrong|113119cbe29e23f3|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B13:L86:Xgap4|wrong|5e46af3cd00d9843|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L257:Xgap4|wrong|5363512e59a5ed45|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L258:Xgap5|wrong|4f8409b62563d778|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L260:Xgap7|wrong|f0c890de2f8d87a0|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L261:Xgap8|wrong|f0c890de2f8d87a0|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B41:L262:Xgap9|wrong|9bb9e53159b322c6|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L56:Xgap0|wrong|b145d9e5068ba471|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L57:Xgap1|wrong|ceb950e42eedfbe5|#10|blank-row wrong @ inject
blank-row:inject:2025-10-consultants-roundtable:B8:L58:Xgap2|wrong|dabe7c745ed240e8|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L84:Xgap0|wrong|1e76f9971bde6e36|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L85:Xgap1|wrong|a49d93f7126d81ef|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B10:L86:Xgap2|wrong|4b486500805e74a6|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L39:Xgap0|wrong|b446083525d858ee|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L40:Xgap1|wrong|255924a92cd64fd4|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L41:Xgap2|wrong|255924a92cd64fd4|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L42:Xgap3|wrong|8a2b906aef9f06ce|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L43:Xgap4|wrong|3b5fe85300f38f0e|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L44:Xgap5|wrong|2b22610d26270ca5|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L45:Xgap6|wrong|d00589922e4f8403|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L46:Xgap7|wrong|7d00afe299d54e4b|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L47:Xgap8|wrong|da5c2a72ed8b7b8d|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B5:L48:Xgap9|wrong|5ab20057982db96d|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L59:Xgap0|wrong|51df005b896fc102|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L60:Xgap1|wrong|f4b65b246478ee72|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L61:Xgap2|wrong|d592018917287c4a|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L62:Xgap3|wrong|8119174390c82eac|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L63:Xgap4|wrong|4da98e6463c07944|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L64:Xgap5|wrong|01497c545a31d582|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L65:Xgap6|wrong|3cb2d513ee995129|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L66:Xgap7|wrong|074ce5d4f9e035e6|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L67:Xgap8|wrong|c23f8a3dd6279441|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L68:Xgap9|wrong|dbd4da90b1ecdec9|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L69:Xgap10|wrong|f69b3e47cffa7e53|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L70:Xgap11|wrong|13072520ae92481a|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L71:Xgap12|wrong|69b22087b68fc530|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L72:Xgap13|wrong|85431622b9d43d2c|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B8:L73:Xgap14|wrong|bc331c86010ad339|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L77:Xgap0|wrong|2b95346023382736|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L78:Xgap1|wrong|d88db68e495dfaa3|#10|blank-row wrong @ inject
blank-row:inject:2025-10-fixed-income-trading-summit:B9:L79:Xgap2|wrong|1085fdd855efa43a|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L97:Xgap0|wrong|de9d2bd07b9191fb|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L98:Xgap1|wrong|a444ad940a979c39|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B10:L99:Xgap2|wrong|71997fad8746cbb8|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L104:Xgap0|wrong|e01da4ac81fcb8db|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L105:Xgap1|wrong|5b350e368a49c6f0|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B11:L106:Xgap2|wrong|0f1b00a2f9d03426|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L111:Xgap0|wrong|1422554f7589997c|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L112:Xgap1|wrong|1558e633574359be|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B12:L113:Xgap2|wrong|226c00d4106d5984|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L53:Xgap0|wrong|1b2400e2e69bbd08|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L54:Xgap1|wrong|d509a9ed100081b1|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L55:Xgap2|wrong|eb2be9073ef6fc25|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L56:Xgap3|wrong|8bc921bfa6e248d3|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L57:Xgap4|wrong|8bc921bfa6e248d3|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L58:Xgap5|wrong|d239acfea8ee744c|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L59:Xgap6|wrong|778ed37e2a638247|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L60:Xgap7|wrong|07ae775707b8d465|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L61:Xgap8|wrong|50107ab0f0e884fe|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L62:Xgap9|wrong|19b64375e80c4dfc|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L63:Xgap10|wrong|0e3b4f0ae1e9388b|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B6:L64:Xgap11|wrong|60377113e56887c9|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L78:Xgap0|wrong|f361b014a196b61e|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L79:Xgap1|wrong|71a7d7db73c21b0a|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L80:Xgap2|wrong|253ec7a1c5b5d197|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L81:Xgap3|wrong|e12c1da0594564cb|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L82:Xgap4|wrong|cbdfef25285651ee|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L83:Xgap5|wrong|a1316e5be011178d|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L84:Xgap6|wrong|351b4798c00089c6|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L85:Xgap7|wrong|cf033fdf41941945|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L86:Xgap8|wrong|c53078273f483053|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L87:Xgap9|wrong|8d111e45e017f68c|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L88:Xgap10|wrong|7e42b2fd420efeb6|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L89:Xgap11|wrong|0b7a91744d64f5a6|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L90:Xgap12|wrong|3b7867dc66cddab8|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L91:Xgap13|wrong|2ec3f5914aba56eb|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L92:Xgap14|wrong|34ec800ce75e2a7d|#10|blank-row wrong @ inject
blank-row:inject:2026-03-rpas-central-four-seasons:B9:L93:Xgap15|wrong|c40bbd27f27101b2|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L10:Xgap0|wrong|72e5139f7a9ca574|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L11:Xgap1|wrong|92209c8409ff4ebd|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L12:Xgap2|wrong|ed8679cad63ebd65|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L13:Xgap3|wrong|2aab40170def8c8b|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L14:Xgap4|wrong|2aab40170def8c8b|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L15:Xgap5|wrong|44a49e42204c5880|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L16:Xgap6|wrong|16aad149974b1bf4|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L17:Xgap7|wrong|24d52d422e274beb|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L18:Xgap8|wrong|0889d8b65caa9f97|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L19:Xgap9|wrong|33af180e8252381c|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L20:Xgap10|wrong|0d6358db5a423f21|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L21:Xgap11|wrong|d7fcdf806329fc8a|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L35:Xgap0|wrong|4ea955fbb08dcf4b|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L36:Xgap1|wrong|c5fc13f4107b7da0|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L37:Xgap2|wrong|5c2c2570502b5db3|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L38:Xgap3|wrong|652a16b337ed57a5|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L39:Xgap4|wrong|37eb9bcc9912414a|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L40:Xgap5|wrong|0b08269017868adb|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L41:Xgap6|wrong|f250d7ee556bbb56|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L42:Xgap7|wrong|1908a4f05f805b87|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L43:Xgap8|wrong|64f0786f5949c2db|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L44:Xgap9|wrong|0db2e11548c3d17c|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L45:Xgap10|wrong|f72763125127d41d|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L46:Xgap11|wrong|69fe89953c15a7f9|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L47:Xgap12|wrong|2e3db0d730b4c470|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L48:Xgap13|wrong|2e22c4c057950b91|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L49:Xgap14|wrong|84882dc869fb8f5c|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B4:L50:Xgap15|wrong|10cf28f70be2f4f0|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L54:Xgap0|wrong|ea45f3f2e68c6720|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L55:Xgap1|wrong|4cc69d503ef20fee|#10|blank-row wrong @ inject
blank-row:inject:2026-04-asset-mgmt-cfo-coo-waldorf:B5:L56:Xgap2|wrong|5c0a31e23419d277|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L25:Xgap0|wrong|6098748b25e30385|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L26:Xgap1|wrong|7a5f007487176a07|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L27:Xgap2|wrong|a1570e44bd728edb|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L28:Xgap3|wrong|bdcf1a3caa6d1a5c|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L29:Xgap4|wrong|1e6907e7434cd75a|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L30:Xgap5|wrong|1e6907e7434cd75a|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L31:Xgap6|wrong|913b7f7ebd58b77d|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L32:Xgap7|wrong|98bfc90fd8b9fd28|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L33:Xgap8|wrong|7a5c4243baf460b2|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L34:Xgap9|wrong|20dcdb4aaa49a849|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L35:Xgap10|wrong|5b57b0ebfa67af06|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L36:Xgap11|wrong|c02c836fb11e1c29|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B3:L37:Xgap12|wrong|5180846077297e28|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L51:Xgap0|wrong|0a69bb8c5ca2e9a7|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L52:Xgap1|wrong|26c80942c99c603d|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L53:Xgap2|wrong|19bb1c0133e6a798|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L54:Xgap3|wrong|3efb27112d692cde|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L55:Xgap4|wrong|e6c1cf238d9ff5e4|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L56:Xgap5|wrong|c11dc6704a409c89|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L57:Xgap6|wrong|04085d4efe801878|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L58:Xgap7|wrong|c6c8322b10f9f08a|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L59:Xgap8|wrong|62a12cbaaff4ca5c|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L60:Xgap9|wrong|bac64a417a7eee60|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L61:Xgap10|wrong|8b51ab94c4e267e0|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L62:Xgap11|wrong|eea0b6edd3a480a9|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L63:Xgap12|wrong|ec5a96c22fdccd4f|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L64:Xgap13|wrong|de5e7df0f489a8e9|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L65:Xgap14|wrong|de5e7df0f489a8e9|#10|blank-row wrong @ inject
blank-row:inject:2026-05-fintech-forum-cto-summit:B6:L66:Xgap15|wrong|0b516f4ca41de83b|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L64:Xgap0|wrong|cdb5087f73000dc9|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L65:Xgap1|wrong|b2db4a1d110e06dc|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L66:Xgap2|wrong|85f6de75abe2ffac|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L67:Xgap3|wrong|3caf072ebfbd591e|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L68:Xgap4|wrong|42f9f56407122713|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L69:Xgap5|wrong|c9899815e8e58fdc|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L70:Xgap6|wrong|504de3405ace96f2|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L71:Xgap7|wrong|1a6606e8bebe4cbb|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L72:Xgap8|wrong|b3c1b3ff6d50b942|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L73:Xgap9|wrong|4c7a6e8fece20022|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L74:Xgap10|wrong|6c2f1985fea34b33|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L75:Xgap11|wrong|d5946bf865a340b9|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L76:Xgap12|wrong|9e23447e998e7430|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L77:Xgap13|wrong|0b9e4aeeee4c1ff8|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L78:Xgap14|wrong|c712af8ffd08aae8|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L79:Xgap15|wrong|570c9c124c60b748|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L80:Xgap16|wrong|94dbf3f2982f4c6f|#10|blank-row wrong @ inject
blank-row:inject:consultants:B14:L81:Xgap17|wrong|b240f563cdc0e0de|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L93:Xgap0|wrong|f1c4b28ba863f2d3|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L94:Xgap1|wrong|40f6457154d1dd8a|#10|blank-row wrong @ inject
blank-row:inject:consultants:B16:L95:Xgap2|wrong|ccc7717c001e7bb3|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L100:Xgap0|wrong|255ee3ba04aacdd9|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L101:Xgap1|wrong|c6857ac40c5eb738|#10|blank-row wrong @ inject
blank-row:inject:consultants:B17:L102:Xgap2|wrong|1fb48af59bdbebf7|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L107:Xgap0|wrong|88f89e43ae62515c|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L108:Xgap1|wrong|9da01f7b81831014|#10|blank-row wrong @ inject
blank-row:inject:consultants:B18:L109:Xgap2|wrong|d8c6db0b8e8460ed|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L114:Xgap0|wrong|0cc5400f440025c9|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L115:Xgap1|wrong|81c9f512427b7947|#10|blank-row wrong @ inject
blank-row:inject:consultants:B19:L116:Xgap2|wrong|70eac1d72fee044e|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L121:Xgap0|wrong|adc36aecfa172ab2|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L122:Xgap1|wrong|f96847caad8e873e|#10|blank-row wrong @ inject
blank-row:inject:consultants:B20:L123:Xgap2|wrong|3e186365bc6ac75a|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L43:Xgap0|wrong|5ccbcc20d88d38f4|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L44:Xgap1|wrong|92c1f70042b26e41|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L45:Xgap2|wrong|a7270b6ec7753570|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L46:Xgap3|wrong|ec6cbc80b2b1d8d9|#10|blank-row wrong @ inject
blank-row:inject:consultants:B9:L47:Xgap4|wrong|59165a38474b82eb|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L45:Xgap0|wrong|db9c6a21001150d1|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L46:Xgap1|wrong|73d9f07eed068f65|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L47:Xgap2|wrong|c1155b75248f6c82|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L48:Xgap3|wrong|ee0abbf53bbca1e1|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L49:Xgap4|wrong|33e14c2d9e2bb116|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L50:Xgap5|wrong|dfe6a867f1109c7a|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L51:Xgap6|wrong|19358feba5a736e0|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L52:Xgap7|wrong|a5e21c8991af70d1|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L53:Xgap8|wrong|5f9abce98f9661f8|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L54:Xgap9|wrong|bf12605c47738aa5|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L55:Xgap10|wrong|3a82fa138b27fe50|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L56:Xgap11|wrong|a64a72cd25a780d1|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B12:L57:Xgap12|wrong|d03fcbe6bc869139|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L80:Xgap0|wrong|367bef71a1401566|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L82:Xgap1|wrong|11616e48a91c2870|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L83:Xgap2|wrong|c3a55599ea30aa5d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L84:Xgap3|wrong|42a27851846ef751|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B17:L85:Xgap4|wrong|863d81818d228bf9|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L89:Xgap0|wrong|4f6e132d00be45bf|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L91:Xgap1|wrong|19159b9083030d8d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L92:Xgap2|wrong|038ab70e26d79be0|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L93:Xgap3|wrong|60359f0a74fbba4d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B18:L94:Xgap4|wrong|9a9d8cd5a7c1f0c6|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L141:Xgap2|wrong|b76c144b22e3c8fa|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L142:Xgap3|wrong|5e8fd700a0f4759b|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L143:Xgap4|wrong|22093ed10919d71c|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L144:Xgap5|wrong|2c9a15028eb3a414|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L145:Xgap6|wrong|8cc48ced2abff7f8|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L146:Xgap7|wrong|ed92e40758602e37|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L147:Xgap8|wrong|70e79b5d3ede39d6|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L148:Xgap9|wrong|261392012699f9b5|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L149:Xgap10|wrong|95cb7c676789e756|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L150:Xgap11|wrong|9c4243ed693ff2ef|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L151:Xgap12|wrong|c50b19e005b62acc|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L152:Xgap13|wrong|0013c7cde8cb78dc|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L153:Xgap14|wrong|0b7db69054301e12|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L154:Xgap15|wrong|8c2bcf78b8d9b339|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L155:Xgap16|wrong|f380162bcc1051e0|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L156:Xgap17|wrong|0f303fca07f3546d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L157:Xgap18|wrong|a102a1d4cf43b3fa|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L158:Xgap19|wrong|15eadc217b6d868c|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L159:Xgap20|wrong|9067147ffdfa5ccb|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L160:Xgap21|wrong|3c3f415fb87bf976|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L161:Xgap22|wrong|374b7f465c8603c0|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L162:Xgap23|wrong|868fbecea7c31127|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L163:Xgap24|wrong|f0ffc9ffc3b26bbe|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L164:Xgap25|wrong|7b2beb4635ce42a5|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L165:Xgap26|wrong|6b2315ac3c94310b|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L166:Xgap27|wrong|81e1f117345eddf3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L167:Xgap28|wrong|40a03651213c9832|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L168:Xgap29|wrong|1a78ae84ae7d0702|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L169:Xgap30|wrong|c1bc312c55e7fad5|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L170:Xgap31|wrong|240aee24e63b548e|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L171:Xgap32|wrong|108690a2754c399c|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L172:Xgap33|wrong|cdf63138ba2f4ee2|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L173:Xgap34|wrong|71443083cbad511b|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L174:Xgap35|wrong|3f2e1529c2e52fc8|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L175:Xgap36|wrong|87bae76f0444f643|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L176:Xgap37|wrong|2a1144d0190da9c9|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L177:Xgap38|wrong|fb1a864d6c52ec93|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L178:Xgap39|wrong|45b39950e43529a5|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L179:Xgap40|wrong|c5f88607dd711c65|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L180:Xgap41|wrong|9800ae455db036d6|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L181:Xgap42|wrong|26173558900c990e|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L182:Xgap43|wrong|4ffaf4750e7f8e5a|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L183:Xgap44|wrong|15317a7ebaeaebe6|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L184:Xgap45|wrong|4b9ac219c65dee8b|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L185:Xgap46|wrong|cd6082daa3c1be5d|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L186:Xgap47|wrong|9d023281fe703d93|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L187:Xgap48|wrong|bb1d3c27f61e9ca7|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L188:Xgap49|wrong|564da175096625e9|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L189:Xgap50|wrong|bf010c6106c315c2|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L190:Xgap51|wrong|d278212e05382832|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L191:Xgap52|wrong|0d00166dc26e3b97|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L192:Xgap53|wrong|5af9283dc3819474|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L193:Xgap54|wrong|94eb1a79384c93b1|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L194:Xgap55|wrong|f29abe83e4eb545a|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L195:Xgap56|wrong|1302e9cf8babd837|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L196:Xgap57|wrong|c7e13889dc6aae9e|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L197:Xgap58|wrong|482733e2b3be9c6c|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L198:Xgap59|wrong|a0156850c945d5f3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L199:Xgap60|wrong|5e7490ad692f6d09|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L200:Xgap61|wrong|8de0ffdf766081b3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L201:Xgap62|wrong|120daa9602c0c3e0|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L202:Xgap63|wrong|a0927b937b527bb4|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L203:Xgap64|wrong|4844435b9dc9c5e6|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L204:Xgap65|wrong|2916a71840bd4d03|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L205:Xgap66|wrong|3a9605b637bd39b6|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L206:Xgap67|wrong|d51b3ceeae16eb78|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L207:Xgap68|wrong|c7652174db8bf5a9|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L208:Xgap69|wrong|18e3605715cd97a3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L209:Xgap70|wrong|a77e1602c78a54b7|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L210:Xgap71|wrong|74d97bb3dba985a3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L211:Xgap72|wrong|822e220bd3c0fdf7|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L212:Xgap73|wrong|1e65d8a82c6bde75|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L213:Xgap74|wrong|d5d9c7050f5faded|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L214:Xgap75|wrong|d18edd21564ca15b|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L215:Xgap76|wrong|7838b5c236b00045|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L216:Xgap77|wrong|a9ab423380bac77a|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L217:Xgap78|wrong|eb8c960df7a7e9bf|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L218:Xgap79|wrong|9a6e164f4d810731|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L219:Xgap80|wrong|21fa41d01e1361b7|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L220:Xgap81|wrong|9a28f090f64b600f|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L221:Xgap82|wrong|6bfa637abd6cd0ae|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L222:Xgap83|wrong|e149f254709103a3|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L223:Xgap84|wrong|c5f889cc1c141089|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L224:Xgap85|wrong|69804c7c348d2bbd|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L225:Xgap86|wrong|05219f2a7e1db114|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L226:Xgap87|wrong|4f40d25684fdf1d6|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L227:Xgap88|wrong|8739403281beae89|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L228:Xgap89|wrong|ea7ef95ef927aa05|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L229:Xgap90|wrong|57698fea1728fb2e|#10|blank-row wrong @ inject
blank-row:inject:east-coast:B24:L230:Xgap91|wrong|301573e084e37661|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L61:Xgap0|wrong|a7072e7e23b9c561|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L62:Xgap1|wrong|558af03418874314|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L63:Xgap2|wrong|e31e62f82dd314ae|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L64:Xgap3|wrong|e31e62f82dd314ae|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L65:Xgap4|wrong|e31e62f82dd314ae|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L66:Xgap5|wrong|b7dcfd11d29cb92b|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L67:Xgap6|wrong|b7dcfd11d29cb92b|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L68:Xgap7|wrong|5527bf921db19bb5|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L69:Xgap8|wrong|188dbfe035c0425e|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L70:Xgap9|wrong|4496f4fb5438e8af|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L71:Xgap10|wrong|b7af4cb98d61cec8|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L72:Xgap11|wrong|1dbd848655dd2814|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L73:Xgap12|wrong|e4b775c9305f42f0|#10|blank-row wrong @ inject
blank-row:inject:fintech:B10:L74:Xgap13|wrong|a3211d79158e0374|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L100:Xgap9|wrong|5d3af7fc44a955ac|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L101:Xgap10|wrong|e241592f7168dc4b|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L102:Xgap11|wrong|cfa0edcc56b55c70|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L103:Xgap12|wrong|cfa0edcc56b55c70|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L104:Xgap13|wrong|cfa0edcc56b55c70|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L105:Xgap14|wrong|cfa0edcc56b55c70|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L106:Xgap15|wrong|60b8617a37d1d2ba|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L91:Xgap0|wrong|c4ca0c148a063835|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L92:Xgap1|wrong|895135cddd94e550|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L93:Xgap2|wrong|225e337367631ffe|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L94:Xgap3|wrong|18f8c24534089b9c|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L95:Xgap4|wrong|69a2d3b1017265dc|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L96:Xgap5|wrong|1add6fb0e5c37f3a|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L97:Xgap6|wrong|f4b4538f0407c261|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L98:Xgap7|wrong|3228b91e6a0755e2|#10|blank-row wrong @ inject
blank-row:inject:fintech:B14:L99:Xgap8|wrong|2caafba6e62a292c|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L111:Xgap0|wrong|bc7484a11ad636ee|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L112:Xgap1|wrong|0f2f7f8df1a7b342|#10|blank-row wrong @ inject
blank-row:inject:fintech:B15:L113:Xgap2|wrong|90e77939abdd3c7b|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L78:Xgap0|wrong|efe99942298691d4|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L79:Xgap1|wrong|d723e2d120f58311|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L80:Xgap2|wrong|eb0c5050519cd827|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L81:Xgap3|wrong|ffbab03890a5cc39|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L82:Xgap4|wrong|40afe3f82872bb08|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L83:Xgap5|wrong|529603d0927a92f2|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L84:Xgap6|wrong|39b61343a17f318a|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L85:Xgap7|wrong|eae51ab16a608fa8|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L86:Xgap8|wrong|e4022d4b95fd6372|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L87:Xgap9|wrong|21238645912cf49e|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L88:Xgap10|wrong|7a05523d618b7e93|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L89:Xgap11|wrong|1c2b9932b8537a3f|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L90:Xgap12|wrong|63a096c201752103|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L91:Xgap13|wrong|7dd63b1431e1fc71|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B13:L92:Xgap14|wrong|e9fe18ea49096c5c|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L97:Xgap0|wrong|f7ecd0b79c14da2f|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L98:Xgap1|wrong|55e1966ab9959186|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B14:L99:Xgap2|wrong|1a866f35524f66e1|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L104:Xgap0|wrong|af80cedfcc24ac36|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L105:Xgap1|wrong|20b8d571bef323d5|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B15:L106:Xgap2|wrong|cda965434a60a3af|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B23:L194:Xgap0|wrong|dc361dcac001d2af|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B23:L196:Xgap1|wrong|dc361dcac001d2af|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B23:L197:Xgap2|wrong|754a9c06463ebdab|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L54:Xgap0|wrong|42f5c6dceda3f548|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L55:Xgap1|wrong|01db710baa8f85a4|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L56:Xgap2|wrong|a4b45f2e127ce362|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L57:Xgap3|wrong|a4b45f2e127ce362|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L58:Xgap4|wrong|ce111ef1b91dcb7f|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L59:Xgap5|wrong|7c9cb8f287151d03|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L60:Xgap6|wrong|0374f3002c505471|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L61:Xgap7|wrong|dedeb10a5a84bd6d|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L62:Xgap8|wrong|be750ef871a92ca9|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L63:Xgap9|wrong|a19059d0dd7bf9a5|#10|blank-row wrong @ inject
blank-row:inject:fixed-income:B9:L64:Xgap10|wrong|d82af802a3e595ff|#10|blank-row wrong @ inject
blank-row:inject:redefining-fi:B14:L65:Xgap0|wrong|70b3a5d21b04ce3d|#10|blank-row wrong @ inject
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
blank-row:inject:ria:B15:L69:Xgap0|wrong|3cc4a73b97beeedd|#10|blank-row wrong @ inject
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
blank-row:inject:rpas:B10:L66:Xgap0|wrong|ce838452e5947b31|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L67:Xgap1|wrong|993aab777bccc374|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L68:Xgap2|wrong|993aab777bccc374|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L69:Xgap3|wrong|993aab777bccc374|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L70:Xgap4|wrong|993aab777bccc374|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L71:Xgap5|wrong|993aab777bccc374|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L72:Xgap6|wrong|976cf1616ed24abc|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L73:Xgap7|wrong|7c9dd8e1ab64e71c|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L74:Xgap8|wrong|a0ade76db3f76534|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L75:Xgap9|wrong|f6eb6440c2aca841|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L76:Xgap10|wrong|d09885169dd4b631|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L77:Xgap11|wrong|ff1208966299874f|#10|blank-row wrong @ inject
blank-row:inject:rpas:B10:L78:Xgap12|wrong|bab5360cd47a36f6|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L100:Xgap5|wrong|e964f156ea0eac1a|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L101:Xgap6|wrong|fb4f25ccb2c5c43c|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L102:Xgap7|wrong|6e9662b5434d5232|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L103:Xgap8|wrong|e9d7eaffb0a145d2|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L104:Xgap9|wrong|954a4c2985e3d2b3|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L105:Xgap10|wrong|7d2d1f5042edf09f|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L106:Xgap11|wrong|db21dff864bced14|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L107:Xgap12|wrong|5bb77e3200428959|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L108:Xgap13|wrong|b42558f71b9a7dfc|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L109:Xgap14|wrong|8b0b7594ca5d1b6b|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L110:Xgap15|wrong|c07d5e53259d45d7|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L95:Xgap0|wrong|be3598881d0e98a6|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L96:Xgap1|wrong|03d648c8c62f28bf|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L97:Xgap2|wrong|8322afcf0a85c1c4|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L98:Xgap3|wrong|9b27185c1b984090|#10|blank-row wrong @ inject
blank-row:inject:rpas:B14:L99:Xgap4|wrong|3642db8357a5c582|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L115:Xgap0|wrong|f79a4c357cb73df6|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L116:Xgap1|wrong|aa17723e5fd3b162|#10|blank-row wrong @ inject
blank-row:inject:rpas:B15:L117:Xgap2|wrong|46885767b777cc0d|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L122:Xgap0|wrong|04294d0761cdcc5b|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L123:Xgap1|wrong|306e2170e2188717|#10|blank-row wrong @ inject
blank-row:inject:rpas:B16:L124:Xgap2|wrong|87e3a5cfa33cf4a9|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L129:Xgap0|wrong|a401739544165051|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L130:Xgap1|wrong|203e139b86559615|#10|blank-row wrong @ inject
blank-row:inject:rpas:B17:L131:Xgap2|wrong|a5d6f0f175f41f98|#10|blank-row wrong @ inject
blank-row:inject:rpas:B45:L315:Xgap0|wrong|4d5e12d7b6900b17|#10|blank-row wrong @ inject
blank-row:inject:rpas:B45:L317:Xgap1|wrong|4d5e12d7b6900b17|#10|blank-row wrong @ inject
blank-row:inject:rpas:B45:L318:Xgap2|wrong|352922408277dcd7|#10|blank-row wrong @ inject
blank-row:remove:2024-05-east-coast-family-office:B2:L24:Xgap|wrong|e43544c3d07ae7ae|#10|blank-row wrong @ remove
blank-row:remove:2025-03-dci-rpas-central:B0:L5:Xgap|wrong|95cf315b569f7a90|#10|blank-row wrong @ remove
blank-row:remove:2025-03-dci-rpas-central:B17:L338:Xgap|wrong|b5dbe60934fe0024|#10|blank-row wrong @ remove
blank-row:remove:2025-10-consultants-roundtable:B21:L208:Xgap|text_drift|f4a04ae746ad05b4|#10|section fused: warning anchor moved
blank-row:remove:2026-03-rpas-central-four-seasons:B3:L38:Xgap|wrong|ebfc6cc22e15f2a9|#10|blank-row wrong @ remove
blank-row:remove:east-coast:B14:L88:Xgap|wrong|4f6e132d00be45bf|#10|blank-row wrong @ remove
blank-row:remove:east-coast:B21:L265:Xgap|wrong|43e5b699c0b71d29|#10|blank-row wrong @ remove
blank-row:remove:fintech:B24:L276:Xgap|text_drift|0714e12baed4a061|#10|section fused: warning anchor moved
blank-row:remove:fixed-income:B22:L245:Xgap|text_drift|0714e12baed4a061|#10|section fused: warning anchor moved
blank-row:remove:rpas:B25:L229:Xgap|text_drift|0563a9eeee8deaa1|#10|section fused: warning anchor moved
column-shift:2024-05-east-coast-family-office:B4:L18:X0|wrong|a57db9af11930d1d|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2024-05-east-coast-family-office
column-shift:2025-03-dci-rpas-central:B11:L229:X0|wrong|d4c38c60cab160e0|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-03-dci-rpas-central
column-shift:2025-03-dci-rpas-central:B12:L231:X0|wrong|60c0d30a471d8aff|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-03-dci-rpas-central
column-shift:2025-04-asset-mgmt-cfo-coo:B11:L120:X0|wrong|809c152599e75750|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-04-asset-mgmt-cfo-coo
column-shift:2025-05-redefining-fixed-income-private-credit:B8:L79:X0|wrong|b4ae64e0367024d4|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-05-redefining-fixed-income-private-credit
column-shift:2025-10-fixed-income-trading-summit:B6:L51:X0|wrong|2aff4ee97de87c00|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2025-10-fixed-income-trading-summit
column-shift:2026-03-rpas-central-four-seasons:B7:L67:X0|wrong|7722ba9f051e5903|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-03-rpas-central-four-seasons
column-shift:2026-03-rpas-central-four-seasons:B8:L74:X0|wrong|d2c4b991602938f6|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-03-rpas-central-four-seasons
column-shift:2026-04-asset-mgmt-cfo-coo-waldorf:B2:L24:X0|wrong|7327e84a1d114abc|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
column-shift:2026-04-asset-mgmt-cfo-coo-waldorf:B3:L31:X0|wrong|8f182ffcd6384b06|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
column-shift:2026-05-fintech-forum-cto-summit:B4:L40:X0|wrong|8cf64e04ff7a158b|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-05-fintech-forum-cto-summit
column-shift:2026-05-fintech-forum-cto-summit:B5:L47:X0|wrong|8b79a3d404234767|BL-MUTATION-COLUMN-SHIFT|column-shift wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2024-05-east-coast-family-office:B10:L67:X0|wrong|4c612f1b1af54662|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2024-05-east-coast-family-office:B1:L7:X0|wrong|68e579f71b9de87f|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2024-05-east-coast-family-office:B4:L18:X0|wrong|c944ab82bb665b7c|#5|header-typo wrong @ 2024-05-east-coast-family-office
header-typo:2025-03-dci-rpas-central:B0:L0:X0|wrong|af81fceb951b75c1|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B10:L220:X0|wrong|e2704aaefb5487b4|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B12:L231:X0|wrong|0bee35b59afd6453|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B17:L258:X0|wrong|e342455992a14d05|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B19:L294:X0|signal_loss|bdca61badecfcd1c|#5|header-typo signal_loss @ 2025-03-dci-rpas-central
header-typo:2025-03-dci-rpas-central:B20:L315:X0|wrong|64c883ffa95e3f1d|#5|header-typo wrong @ 2025-03-dci-rpas-central
header-typo:2025-04-asset-mgmt-cfo-coo:B11:L120:X0|wrong|e4fc03192ca032e2|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B18:L228:X0|wrong|edd8c6a4286fdfbe|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B20:L310:X0|wrong|00c017711272376e|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B2:L16:X0|signal_loss|d11850c0a844aa90|#5|header-typo signal_loss @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-04-asset-mgmt-cfo-coo:B9:L110:X0|wrong|95edb51aee05d47f|#5|header-typo wrong @ 2025-04-asset-mgmt-cfo-coo
header-typo:2025-05-redefining-fixed-income-private-credit:B0:L0:X0|wrong|788dad20685fdd17|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B15:L197:X0|wrong|afba5e232795d545|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B18:L217:X0|wrong|632dfa8e8d558a8a|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B1:L6:X0|wrong|c02125c269bf77d9|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B30:L331:X0|wrong|6bdb7ff8540bcdd6|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B31:L332:X0|wrong|0514f815d3cd7421|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B6:L69:X0|wrong|7e820e2f7f593a90|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-05-redefining-fixed-income-private-credit:B8:L79:X0|wrong|5c5fc2e931a01212|#5|header-typo wrong @ 2025-05-redefining-fixed-income-private-credit
header-typo:2025-06-ria-investment-forum:B12:L215:X0|signal_loss|f8631414e04e8ef3|#5|header-typo signal_loss @ 2025-06-ria-investment-forum
header-typo:2025-06-ria-investment-forum:B1:L4:X0|wrong|6d6cf697c1a7fa84|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-06-ria-investment-forum:B3:L13:X0|wrong|dff01b6f0b32532b|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-06-ria-investment-forum:B7:L33:X0|wrong|6816d277d4183934|#5|header-typo wrong @ 2025-06-ria-investment-forum
header-typo:2025-10-consultants-roundtable:B0:L0:X0|wrong|8ecee9bd545fc7c3|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B11:L76:X0|wrong|ab06fe00b8cca0bd|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B13:L81:X0|wrong|6775107384968b0d|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B15:L95:X0|wrong|ed1d95cce267627c|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B4:L16:X0|wrong|bd2b99b82548a44a|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B6:L44:X0|wrong|6c0bc167de2aca72|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-consultants-roundtable:B8:L55:X0|wrong|9b0c3e41b4d3845f|#5|header-typo wrong @ 2025-10-consultants-roundtable
header-typo:2025-10-fixed-income-trading-summit:B0:L0:X0|wrong|37669a0346bf8842|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B10:L83:X0|wrong|95ed0c3939c1606b|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B1:L8:X0|wrong|42e1caea0731c22b|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B4:L32:X0|wrong|787e0ab9bcefe6c0|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2025-10-fixed-income-trading-summit:B6:L51:X0|wrong|01e852229994956a|#5|header-typo wrong @ 2025-10-fixed-income-trading-summit
header-typo:2026-03-rpas-central-four-seasons:B0:L0:X0|wrong|988154f818d5568a|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B11:L103:X0|wrong|a49eeae75edf6d26|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B12:L110:X0|wrong|1c79a5ac162275c3|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B2:L16:X0|wrong|bbdd74e67fd75669|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B42:L724:X0|wrong|3543272e4e7a095a|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B43:L725:X0|wrong|ad120e98290d80ad|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B6:L51:X0|wrong|94ee274236acd874|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-03-rpas-central-four-seasons:B7:L67:X0|wrong|799c9baf30a794f9|#5|header-typo wrong @ 2026-03-rpas-central-four-seasons
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B0:L0:X0|wrong|c1a5f37015187b7b|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B1:L8:X0|wrong|20d00d7143fd077c|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B2:L24:X0|wrong|68fee59566af3a12|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-04-asset-mgmt-cfo-coo-waldorf:B7:L65:X0|wrong|7cfe707e2c5764d0|#5|header-typo wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
header-typo:2026-05-fintech-forum-cto-summit:B0:L0:X0|wrong|0fa81802445a2ea2|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B1:L8:X0|wrong|46d3d052f54460bc|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B3:L23:X0|wrong|6d4ad34eafef1c19|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:2026-05-fintech-forum-cto-summit:B4:L40:X0|wrong|a36aaf053a4bfa5d|#5|header-typo wrong @ 2026-05-fintech-forum-cto-summit
header-typo:consultants:B11:L53:X0|wrong|c3faadba61a5c3be|#5|header-typo wrong @ consultants
header-typo:consultants:B14:L62:X0|wrong|7665e51636dea024|#5|header-typo wrong @ consultants
header-typo:consultants:B15:L84:X0|wrong|b0c407057fb5845a|#5|header-typo wrong @ consultants
header-typo:consultants:B16:L91:X0|wrong|805592355f83a421|#5|header-typo wrong @ consultants
header-typo:consultants:B17:L98:X0|wrong|5b7383388d37218e|#5|header-typo wrong @ consultants
header-typo:consultants:B18:L105:X0|wrong|5bda47435b7e93e0|#5|header-typo wrong @ consultants
header-typo:consultants:B19:L112:X0|wrong|9694e7c0c838eed3|#5|header-typo wrong @ consultants
header-typo:consultants:B1:L3:X0|wrong|4f48c9034fdfdcdc|#5|header-typo wrong @ consultants
header-typo:consultants:B20:L119:X0|wrong|4bcdae965ff6b5de|#5|header-typo wrong @ consultants
header-typo:consultants:B23:L143:X0|wrong|2d6b3fe482bd6eb5|#5|header-typo wrong @ consultants
header-typo:consultants:B25:L181:X0|wrong|853dc0e0ef8154b0|#5|header-typo wrong @ consultants
header-typo:consultants:B27:L187:X0|wrong|dfda64066f2261e2|#5|header-typo wrong @ consultants
header-typo:consultants:B29:L196:X0|wrong|ad136c9e0513196e|#5|header-typo wrong @ consultants
header-typo:consultants:B2:L9:X0|wrong|f1902247ba473f8f|#5|header-typo wrong @ consultants
header-typo:consultants:B31:L205:X0|wrong|ba68546b8ccdbf0c|#5|header-typo wrong @ consultants
header-typo:consultants:B33:L214:X0|wrong|57fbbbad6eaeaf34|#5|header-typo wrong @ consultants
header-typo:consultants:B35:L222:X0|wrong|4df9b3cb3ea74f46|#5|header-typo wrong @ consultants
header-typo:consultants:B48:L280:X0|wrong|14749669367dba6d|#5|header-typo wrong @ consultants
header-typo:consultants:B49:L281:X0|wrong|2ed3b07f73ecbaab|#5|header-typo wrong @ consultants
header-typo:consultants:B7:L37:X0|wrong|5459202866617342|#5|header-typo wrong @ consultants
header-typo:consultants:B9:L42:X0|wrong|0969248ad06cf755|#5|header-typo wrong @ consultants
header-typo:east-coast:B12:L43:X0|wrong|4c612f1b1af54662|#5|header-typo wrong @ east-coast
header-typo:east-coast:B13:L60:X0|wrong|e66dad807a920044|#5|header-typo wrong @ east-coast
header-typo:east-coast:B22:L132:X0|wrong|a8498e2d5fe7f43f|#5|header-typo wrong @ east-coast
header-typo:east-coast:B2:L5:X0|wrong|1ad62fcd6705ac5a|#5|header-typo wrong @ east-coast
header-typo:east-coast:B3:L8:X0|wrong|68e579f71b9de87f|#5|header-typo wrong @ east-coast
header-typo:east-coast:B6:L26:X0|wrong|3990eae348b053ba|#5|header-typo wrong @ east-coast
header-typo:east-coast:B7:L28:X0|wrong|065f21e8009b7bf5|#5|header-typo wrong @ east-coast
header-typo:east-coast:B8:L31:X0|wrong|11a1413c993aeb23|#5|header-typo wrong @ east-coast
header-typo:east-coast:B9:L34:X0|wrong|c944ab82bb665b7c|#5|header-typo wrong @ east-coast
header-typo:fintech:B11:L77:X0|wrong|a63fd5b607fa2b44|#5|header-typo wrong @ fintech
header-typo:fintech:B14:L89:X0|wrong|80fff035b9e1f8ae|#5|header-typo wrong @ fintech
header-typo:fintech:B21:L159:X0|wrong|1107028fde70ebc4|#5|header-typo wrong @ fintech
header-typo:fintech:B2:L5:X0|wrong|8102847038cc7e4d|#5|header-typo wrong @ fintech
header-typo:fintech:B3:L12:X0|wrong|3e3826d204a404a4|#5|header-typo wrong @ fintech
header-typo:fintech:B8:L40:X0|wrong|d471976440ebbc3b|#5|header-typo wrong @ fintech
header-typo:fintech:B9:L43:X0|wrong|f535376942baa9ad|#5|header-typo wrong @ fintech
header-typo:fixed-income:B10:L67:X0|wrong|7ad2b3ba30f4f1bb|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B13:L76:X0|wrong|560ae3bd237e634a|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B14:L95:X0|wrong|9c48e29410243513|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B15:L102:X0|wrong|72534093e0ee019c|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B17:L124:X0|wrong|f99e6dacd44eb18c|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B19:L162:X0|wrong|40ecad501bc105fc|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B1:L3:X0|wrong|3156a55309d0569b|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B2:L11:X0|wrong|0c2c144ed262a7c9|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B7:L40:X0|wrong|3f3fcfa5382de947|#5|header-typo wrong @ fixed-income
header-typo:fixed-income:B8:L43:X0|wrong|3d573f9888d5655e|#5|header-typo wrong @ fixed-income
header-typo:redefining-fi:B11:L54:X0|wrong|5c5fc2e931a01212|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B14:L63:X0|wrong|c794f14fc032941b|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B15:L84:X0|wrong|d24116412a9426f5|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B17:L101:X0|wrong|671dfc976ba8f8b4|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B18:L115:X0|wrong|60828a47b6f53bd1|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B1:L3:X0|wrong|788dad20685fdd17|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B2:L9:X0|wrong|afba5e232795d545|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B36:L354:X0|wrong|7fe633657c05eab7|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B37:L355:X0|wrong|b6ea39f155a7ac96|#5|header-typo wrong @ redefining-fi
header-typo:redefining-fi:B9:L43:X0|wrong|7e820e2f7f593a90|#5|header-typo wrong @ redefining-fi
header-typo:ria:B12:L58:X0|wrong|6487bc8ec18a72a7|#5|header-typo wrong @ ria
header-typo:ria:B15:L67:X0|wrong|a1f568e0cb8776ef|#5|header-typo wrong @ ria
header-typo:ria:B16:L88:X0|wrong|2f8ee4464cf378cc|#5|header-typo wrong @ ria
header-typo:ria:B18:L104:X0|wrong|f95d2c432717d94c|#5|header-typo wrong @ ria
header-typo:ria:B19:L118:X0|wrong|cbce87f8a4591ff5|#5|header-typo wrong @ ria
header-typo:ria:B1:L4:X0|wrong|a7b975a16150acf3|#5|header-typo wrong @ ria
header-typo:ria:B2:L10:X0|wrong|eaac225dee666678|#5|header-typo wrong @ ria
header-typo:ria:B7:L36:X0|wrong|2ca39bbf23a0301a|#5|header-typo wrong @ ria
header-typo:ria:B9:L41:X0|wrong|5348af6bbdca483b|#5|header-typo wrong @ ria
header-typo:rpas:B11:L81:X0|wrong|cfb267399a6d994d|#5|header-typo wrong @ rpas
header-typo:rpas:B14:L93:X0|wrong|d27a3b7a51ae6037|#5|header-typo wrong @ rpas
header-typo:rpas:B15:L113:X0|wrong|05c9d336b248925d|#5|header-typo wrong @ rpas
header-typo:rpas:B16:L120:X0|wrong|ab64cbb9064e6cf3|#5|header-typo wrong @ rpas
header-typo:rpas:B17:L127:X0|wrong|dfc72bc846dcd5c2|#5|header-typo wrong @ rpas
header-typo:rpas:B19:L149:X0|wrong|684d45603f116858|#5|header-typo wrong @ rpas
header-typo:rpas:B1:L3:X0|wrong|f52e02262ccbd6af|#5|header-typo wrong @ rpas
header-typo:rpas:B21:L189:X0|wrong|84c8379bec43c056|#5|header-typo wrong @ rpas
header-typo:rpas:B23:L198:X0|wrong|1d043801c7b74ed7|#5|header-typo wrong @ rpas
header-typo:rpas:B2:L11:X0|wrong|40a8b26c1aaa062b|#5|header-typo wrong @ rpas
header-typo:rpas:B54:L339:X0|wrong|914b54f95e8da03c|#5|header-typo wrong @ rpas
header-typo:rpas:B55:L340:X0|wrong|e179809f247ab536|#5|header-typo wrong @ rpas
header-typo:rpas:B7:L39:X0|wrong|48111a5326869bf0|#5|header-typo wrong @ rpas
header-typo:rpas:B8:L42:X0|wrong|61ca0f9f79a61c08|#5|header-typo wrong @ rpas
merged-cell:2025-03-dci-rpas-central:B20:L317:X0|wrong|fdb856438b94ada3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-03-dci-rpas-central:B20:L317:X1|wrong|df2f02ed58b4e9f8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-03-dci-rpas-central:B20:L318:X1|wrong|fdb856438b94ada3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-03-dci-rpas-central
merged-cell:2025-03-dci-rpas-central:B24:L373:X1|text_drift|ded02cbae3b57301|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-03-dci-rpas-central [triaged 2026-08-10: snippet moved]
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L312:X0|wrong|ca66d6ff13628daa|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L312:X1|wrong|ed8019454240891c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-04-asset-mgmt-cfo-coo:B20:L313:X1|wrong|ca66d6ff13628daa|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-04-asset-mgmt-cfo-coo
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L199:X0|wrong|2b3473ed7cc584d8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L199:X1|wrong|0fac62bfdfb618e3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-05-redefining-fixed-income-private-credit:B15:L200:X1|wrong|2b3473ed7cc584d8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-05-redefining-fixed-income-private-credit
merged-cell:2025-06-ria-investment-forum:B0:L0:X0|wrong|430b36c42d5ce9b4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L35:X0|wrong|dd2732ec709a8af3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L35:X1|wrong|1fe370c32ba6f959|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B7:L36:X1|wrong|dd2732ec709a8af3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-06-ria-investment-forum
merged-cell:2025-06-ria-investment-forum:B8:L38:X1|text_drift|e690e3c8f99dd8d0|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-06-ria-investment-forum [triaged 2026-08-10: snippet moved]
merged-cell:2025-10-consultants-roundtable:B15:L97:X0|wrong|f9fc8ad04d9beef5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B15:L97:X1|wrong|25f65f0110755e1e|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B15:L98:X1|wrong|f9fc8ad04d9beef5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B22:L139:X1|text_drift|63065c807cd899cd|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: snippet moved]
merged-cell:2025-10-consultants-roundtable:B26:L171:X1|text_drift|0ca6f92b4ad7bac5|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: snippet moved]
merged-cell:2025-10-consultants-roundtable:B28:L209:X10|wrong|eb0bfcf84084e8d6|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X11|text_drift|71cd36edf2f24eb2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X12|text_drift|71cd36edf2f24eb2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X13|text_drift|71cd36edf2f24eb2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X14|text_drift|71cd36edf2f24eb2|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: blockRef.index moved, kind unchanged]
merged-cell:2025-10-consultants-roundtable:B28:L209:X17|signal_loss|e75876f92572d8e6|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X18|signal_loss|e75876f92572d8e6|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X19|signal_loss|e75876f92572d8e6|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X20|signal_loss|e75876f92572d8e6|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X2|wrong|83fc2f5bb6efbc56|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X3|wrong|ca0add650ac94b65|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X4|wrong|ca0add650ac94b65|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X5|wrong|ec823e2c1587ba3f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X6|wrong|ec823e2c1587ba3f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X7|wrong|ec823e2c1587ba3f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X8|wrong|ec823e2c1587ba3f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-consultants-roundtable:B28:L209:X9|wrong|eb0bfcf84084e8d6|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-consultants-roundtable
merged-cell:2025-10-fixed-income-trading-summit:B32:L251:X0|text_drift|a89cfa4833e83ca6|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2025-10-fixed-income-trading-summit [triaged 2026-08-10: snippet moved]
merged-cell:2025-10-fixed-income-trading-summit:B4:L34:X0|wrong|0686d041df2bfcc1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2025-10-fixed-income-trading-summit:B4:L34:X1|wrong|18b7626a778bbfa7|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2025-10-fixed-income-trading-summit:B4:L35:X1|wrong|0686d041df2bfcc1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2025-10-fixed-income-trading-summit
merged-cell:2026-03-rpas-central-four-seasons:B22:L237:X0|text_drift|db4a66ca6d4f08bd|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-03-rpas-central-four-seasons [triaged 2026-08-10: snippet moved]
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B29:L339:X0|text_drift|eed1b676c4101ccf|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-04-asset-mgmt-cfo-coo-waldorf [triaged 2026-08-10: snippet moved]
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B36:L744:X0|wrong|a650160ebe389e85|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
merged-cell:2026-04-asset-mgmt-cfo-coo-waldorf:B36:L744:X6|wrong|a650160ebe389e85|BL-MUTATION-MERGED-CELL|merged-cell wrong @ 2026-04-asset-mgmt-cfo-coo-waldorf
merged-cell:2026-05-fintech-forum-cto-summit:B30:L311:X0|text_drift|a89cfa4833e83ca6|BL-MUTATION-MERGED-CELL|merged-cell signal_loss @ 2026-05-fintech-forum-cto-summit [triaged 2026-08-10: snippet moved]
merged-cell:consultants:B0:L0:X0|wrong|ba4474d228b1c8b4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X1|wrong|ba4474d228b1c8b4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X2|wrong|ba4474d228b1c8b4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B0:L0:X3|wrong|ba4474d228b1c8b4|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B22:L141:X0|wrong|b9d37d95158886ee|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B22:L141:X1|wrong|b9d37d95158886ee|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B24:L146:X0|wrong|3ab09d2cdba44d4d|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B26:L184:X0|wrong|00d689d32d72b296|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B26:L184:X6|wrong|5f8273f6873e9e18|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B28:L190:X0|wrong|4f25e286599f7c40|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B28:L190:X6|wrong|3fc79bbafe1f7dc5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L11:X0|wrong|a9ee5f39a3d1e994|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L11:X1|wrong|76245e28778bd0ce|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B2:L12:X1|wrong|a9ee5f39a3d1e994|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B30:L199:X0|wrong|002ccaa2fe900576|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B30:L199:X6|wrong|b5e2d30ba489a4a9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B32:L208:X0|wrong|ed753489e45faaa0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B32:L208:X6|wrong|9a4b9e0b4319240a|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L217:X0|wrong|8b30da879a0bcbe2|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L217:X6|wrong|9fbad0a046915e44|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L219:X0|wrong|726c3d8176e439b9|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L219:X6|wrong|5e8a2b5b05a8bb0b|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L220:X0|wrong|16b308b85ef08402|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B34:L220:X6|wrong|bd71371eaa14f677|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:consultants:B36:L225:X0|wrong|936fa0676c789f4c|BL-MUTATION-MERGED-CELL|merged-cell wrong @ consultants
merged-cell:east-coast:B0:L0:X0|wrong|41f7383f77475555|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:east-coast:B2:L6:X0|wrong|c9cc24cdd0c7b34f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:east-coast:B7:L29:X0|wrong|9b78a93c06d4a10f|BL-MUTATION-MERGED-CELL|merged-cell wrong @ east-coast
merged-cell:fintech:B0:L0:X0|wrong|a3813a868dcaabef|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X1|wrong|a3813a868dcaabef|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X2|wrong|a3813a868dcaabef|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B0:L0:X3|wrong|a3813a868dcaabef|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B22:L162:X0|wrong|f9d5ef3bcc22080a|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X0|wrong|405a25847fdde412|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X1|wrong|405a25847fdde412|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X2|wrong|405a25847fdde412|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X3|wrong|405a25847fdde412|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X4|wrong|405a25847fdde412|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X5|wrong|405a25847fdde412|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B46:L299:X7|wrong|405a25847fdde412|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B6:L35:X0|wrong|6cffcbcd2dd4b7f0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fintech:B6:L35:X1|wrong|0d5b77daa73cf5a7|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fintech
merged-cell:fixed-income:B0:L0:X0|wrong|b78890acf4e3e4cf|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X1|wrong|b78890acf4e3e4cf|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X2|wrong|b78890acf4e3e4cf|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B0:L0:X3|wrong|b78890acf4e3e4cf|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B18:L127:X0|wrong|f9d5ef3bcc22080a|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B20:L165:X0|wrong|4dbaceb74033d6b6|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B5:L35:X0|wrong|6cffcbcd2dd4b7f0|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:fixed-income:B5:L35:X1|wrong|0d5b77daa73cf5a7|BL-MUTATION-MERGED-CELL|merged-cell wrong @ fixed-income
merged-cell:redefining-fi:B2:L11:X0|wrong|2b3473ed7cc584d8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:redefining-fi:B2:L11:X1|wrong|0fac62bfdfb618e3|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:redefining-fi:B2:L12:X1|wrong|2b3473ed7cc584d8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ redefining-fi
merged-cell:ria:B0:L0:X0|wrong|631fa7c927ce79ce|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L12:X0|wrong|15f4f83672024a41|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L12:X1|wrong|d73fe2cc00cd6764|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B2:L13:X1|wrong|15f4f83672024a41|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B5:L31:X0|wrong|14c65cf385185186|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:ria:B5:L31:X1|wrong|42919f2f21ba1af8|BL-MUTATION-MERGED-CELL|merged-cell wrong @ ria
merged-cell:rpas:B0:L0:X0|wrong|94730c40c9c1ddfc|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X1|wrong|94730c40c9c1ddfc|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X2|wrong|94730c40c9c1ddfc|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B0:L0:X3|wrong|94730c40c9c1ddfc|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B20:L152:X0|wrong|4dc1d07b5320ef75|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B22:L192:X0|wrong|447ce5aaa2751614|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B24:L201:X0|wrong|44b60ef4cefa70e5|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X0|wrong|ce0d1036f46ff827|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X1|wrong|ce0d1036f46ff827|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X2|wrong|ce0d1036f46ff827|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X3|wrong|ce0d1036f46ff827|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X4|wrong|ce0d1036f46ff827|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X5|wrong|ce0d1036f46ff827|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X6|wrong|ce0d1036f46ff827|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B36:L263:X8|wrong|ce0d1036f46ff827|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B5:L34:X0|wrong|c524f6e7c197ada1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
merged-cell:rpas:B5:L34:X1|wrong|416fc91c9fb792f1|BL-MUTATION-MERGED-CELL|merged-cell wrong @ rpas
section-reorder:2025-03-dci-rpas-central:B0:L0:Xpair0|wrong|95cf315b569f7a90|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-03-dci-rpas-central
section-reorder:2025-03-dci-rpas-central:B16:L0:Xpair16|text_drift|548290a37b815585|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-03-dci-rpas-central [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-03-dci-rpas-central:B17:L0:Xpair17|text_drift|b63aa0d2da7e7291|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-03-dci-rpas-central [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-03-dci-rpas-central:B18:L0:Xpair18|text_drift|ca469d874faead90|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-03-dci-rpas-central [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-03-dci-rpas-central:B7:L0:Xpair7|wrong|06d505c502637f7a|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-03-dci-rpas-central
section-reorder:2025-04-asset-mgmt-cfo-coo:B0:L0:Xpair0|wrong|7196d666114dd7f5|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-04-asset-mgmt-cfo-coo
section-reorder:2025-04-asset-mgmt-cfo-coo:B3:L0:Xpair3|wrong|e5f3f64b58866db3|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-04-asset-mgmt-cfo-coo
section-reorder:2025-06-ria-investment-forum:B0:L0:Xpair0|wrong|430b36c42d5ce9b4|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ 2025-06-ria-investment-forum
section-reorder:2025-06-ria-investment-forum:B5:L0:Xpair5|text_drift|f45cfe17e1c5c564|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-06-ria-investment-forum [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-06-ria-investment-forum:B6:L0:Xpair6|text_drift|52b8a817f90fe583|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-06-ria-investment-forum [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B13:L0:Xpair13|text_drift|d6b5bb2df91b9554|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B14:L0:Xpair14|text_drift|f25ca267fa0f948e|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B15:L0:Xpair15|text_drift|c8b6aec195214f47|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B16:L0:Xpair16|text_drift|866e0f542cae1e5a|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B17:L0:Xpair17|text_drift|8f86a6f4a7c45b14|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B18:L0:Xpair18|text_drift|9be31031e4d900d2|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B19:L0:Xpair19|text_drift|588cc1e1bc06a88a|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B20:L0:Xpair20|text_drift|319151a528c4e9fa|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:2025-10-consultants-roundtable:B21:L0:Xpair21|text_drift|955b4bb9502dc37c|BL-MUTATION-SECTION-ORDER|section-reorder signal_loss @ 2025-10-consultants-roundtable [triaged 2026-08-10: reorder-only, multiset identical]
section-reorder:consultants:B0:L0:Xpair0|wrong|ba4474d228b1c8b4|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B14:L0:Xpair14|wrong|ea95105d5e3db466|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B15:L0:Xpair15|wrong|cd77c69db30af88e|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B16:L0:Xpair16|wrong|ff841a7265e3d078|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B20:L0:Xpair20|wrong|c6f615db0125cad2|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B21:L0:Xpair21|wrong|c6f615db0125cad2|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B22:L0:Xpair22|wrong|ec7345b4bbfd3b4b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B23:L0:Xpair23|wrong|278a2ac2c10b1fb4|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B24:L0:Xpair24|wrong|59b13f280a1e8bd7|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B25:L0:Xpair25|wrong|8f2cb237f175e445|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B26:L0:Xpair26|wrong|9269229a3f78b7e9|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B27:L0:Xpair27|wrong|d92b76bd5e441f3c|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B28:L0:Xpair28|wrong|408b9343c0b13139|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B29:L0:Xpair29|wrong|2e885e9f4406ddc7|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B30:L0:Xpair30|wrong|368d4e6056079e48|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B31:L0:Xpair31|wrong|7342be0ff9b2768b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B32:L0:Xpair32|wrong|5376da8f53c158c0|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B33:L0:Xpair33|wrong|0302d5fa0b60b11f|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B34:L0:Xpair34|wrong|0c48fb857bf5481d|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:consultants:B35:L0:Xpair35|wrong|06aea24940b8e4c7|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ consultants
section-reorder:east-coast:B0:L0:Xpair0|wrong|8409769f5dde4d28|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B12:L0:Xpair12|wrong|7529dc752a78dad8|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B13:L0:Xpair13|wrong|7529dc752a78dad8|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:east-coast:B14:L0:Xpair14|wrong|c2a669d27934b3f9|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ east-coast
section-reorder:fintech:B0:L0:Xpair0|wrong|a3813a868dcaabef|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B18:L0:Xpair18|wrong|a6a26a1b01ae4194|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B19:L0:Xpair19|wrong|a6a26a1b01ae4194|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B20:L0:Xpair20|wrong|a6a26a1b01ae4194|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fintech:B21:L0:Xpair21|wrong|826faec7f7d6ff9a|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fintech
section-reorder:fixed-income:B0:L0:Xpair0|wrong|b78890acf4e3e4cf|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B13:L0:Xpair13|wrong|989da4b5f8a7d7c6|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B15:L0:Xpair15|wrong|c76b4cb8118993ba|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B16:L0:Xpair16|wrong|c76b4cb8118993ba|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B17:L0:Xpair17|wrong|021e49bd8a03372c|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B18:L0:Xpair18|wrong|5622ecd2d2ac4386|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B19:L0:Xpair19|wrong|be86e1fac0d16e8a|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:fixed-income:B20:L0:Xpair20|wrong|14c8743d33763bff|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ fixed-income
section-reorder:redefining-fi:B14:L0:Xpair14|wrong|382f0488b5b55e14|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ redefining-fi
section-reorder:redefining-fi:B15:L0:Xpair15|wrong|703181fc47d0dfdb|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ redefining-fi
section-reorder:ria:B0:L0:Xpair0|wrong|db738faf3df84405|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:ria:B15:L0:Xpair15|wrong|e4076f3d6536553e|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:ria:B16:L0:Xpair16|wrong|117a1e40608b8d13|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ ria
section-reorder:rpas:B0:L0:Xpair0|wrong|94730c40c9c1ddfc|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B14:L0:Xpair14|wrong|89f6e3e4babd031e|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B15:L0:Xpair15|wrong|c382df8cadae886e|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B17:L0:Xpair17|wrong|a908a667b560b3f6|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B18:L0:Xpair18|wrong|a908a667b560b3f6|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B19:L0:Xpair19|wrong|61109cf82e0ecd1b|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B20:L0:Xpair20|wrong|0e749e85adb20864|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B21:L0:Xpair21|wrong|1a6c8514a89ffa41|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B22:L0:Xpair22|wrong|0ea871db32f6a38e|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B23:L0:Xpair23|wrong|7ce4e8a8d19c23b6|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
section-reorder:rpas:B24:L0:Xpair24|wrong|31952819e99606fa|BL-MUTATION-SECTION-ORDER|section-reorder wrong @ rpas
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
