/**
 * The frozen grandfather registry for `tests/docs/_metaLedgerSizing.test.ts`.
 *
 * Spec: `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §3.3.
 *
 * WHAT THIS IS. The set of open ledger entries that carried no parseable
 * `**Effort:**` at the moment the sizing guard landed. They are exempt so the
 * guard can fail-by-default for NEW entries without a corpus-wide sizing pass
 * first — and sizing them in bulk would be guessing, which the 2026-08-03
 * sizing commit already ruled out ("an estimate on an undecided scope is a
 * guess wearing a label").
 *
 * CAPTURED, NOT PREDICTED. The list below was produced by the same parser the
 * guard uses, against the tree at capture time. The spec snapshotted 42 ids
 * while it was being written; the DEFERRED re-heading task then surfaced three
 * more entries to the walker and the demotion tasks archived others, so the
 * captured set lawfully differs from that number. The capture moment is
 * authoritative — see the spec's own amendment note.
 *
 * RATCHET-ONLY. Removing an id is ordinary work: size the entry, drop its row,
 * done — and the guard FAILS on an id that is listed but no longer needs to be,
 * so the registry cannot quietly accumulate dead rows. Adding an id is a
 * reviewed act that needs a stated reason in the PR; nothing here is a place to
 * park a new unsized entry.
 */
export const LEDGER_SIZING_GRANDFATHERED: readonly string[] = [
  // Emptied 2026-08-05 by the corpus-wide sizing sweep (chore/ledger-sizing-sweep):
  // every grandfathered id was individually sized from its own body's scope
  // evidence, or archived. New unsized entries fail the guard; nothing parks here.
];
