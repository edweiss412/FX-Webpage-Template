// FIXTURE — AC-U6: a QUOTED member is a member, and the read set is consumed as
// a COMPLEMENT.
//
// `readsFromSourceFile` required the member NAME to be an identifier, so
// `"wire-format"` was dropped. That is not one missing entry: the read set gates
// rules 2 and 3, so a dropped member is RECLASSIFIED "not a read" and stops
// being constrained EVERYWHERE the set is consulted. Dropping a member from a
// POSITIVE set costs one false negative at that member; dropping it from a set
// used as a COMPLEMENT costs a false negative wherever that set gates.
//
// The member is a METHOD signature deliberately: rule 2 counts CALL reads, so
// a quoted PROPERTY could not discriminate here however the read set treated it
// -- a different rule would decide the observation.
//
// The discriminator: two straight-line reads of the quoted member in one pass
// are two instants of one value, exactly as two reads of `panes` are. With the
// member missing from the read set the pass is SILENT — the fail-open direction.
//
// The `panes` pair in the SAME pass is the control, so the quoted pair's finding
// is attributable to the member's SPELLING rather than to the machinery running.
//
// Authored against the `Channel` row; no live spelling appears anywhere.

export type Channel = {
  panes(): string[];
  gauge(id: string): string;
  memo(cwd: string): Record<string, unknown> | null;
  claim(branch: string): string[];
  "wire-format"(): string;
  dispatch(target: string, text: string): void;
  emit(line: string): void;
  trace(line: string): void;
  clock(): number;
};

export function settle(ch: Channel): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const first = ch["wire-format"]();
    const second = ch["wire-format"]();
    const p1 = ch.panes();
    const p2 = ch.panes();
    const snap: Channel = { ...ch };
    return first === second && p1.length === p2.length && snap.memo("/") !== null;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
