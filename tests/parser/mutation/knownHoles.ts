// tests/parser/mutation/knownHoles.ts
export type Alarm = { siteId: string; kind: "wrong" | "signal_loss"; fingerprint: string };
export type KnownHole = Alarm & {
  finding: string;                       // audit finding ref e.g. "#3" | "#5" | "unaudited"
  note: string;
};

/** Stable comparison key — a hole is identified by (siteId, kind, fingerprint) so a
 *  DEEPENED hole (same site/kind, changed behavior fingerprint) reads as both a stale
 *  old row AND a new alarm, never silently absorbed (plan-R9). */
export const ledgerKey = (a: Alarm): string => `${a.siteId}|${a.kind}|${a.fingerprint}`;

/** Bidirectional set diff: newAlarms = actual ∖ ledger (fail — undocumented hole),
 *  staleRows = ledger ∖ actual (fail — fixed/drifted; forces the ledger to shrink). */
export function reconcileLedger(
  actual: readonly Alarm[],
  ledger: readonly KnownHole[],
): { newAlarms: string[]; staleRows: string[] } {
  const a = new Set(actual.map(ledgerKey));
  const l = new Set(ledger.map(ledgerKey));
  return {
    newAlarms: [...a].filter((k) => !l.has(k)),
    staleRows: [...l].filter((k) => !a.has(k)),
  };
}

// Populated in Task 8 from the day-1 harness run against branch HEAD.
export const KNOWN_SILENT_HOLES: readonly KnownHole[] = [];
