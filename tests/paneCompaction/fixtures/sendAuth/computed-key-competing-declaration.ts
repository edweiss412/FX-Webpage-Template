// FIXTURE — the killer for the unwrap inside a COMPUTED DECLARATION NAME.
//
// Rule B voids a derivation exemption when the pass holds more than one
// COMPETING declaration of the name. A computed key is a declaration name like
// any other, so `{ [("snap")]: … }` declares `snap` and competes. An
// implementation that resolves a computed key without unwrapping it reads the
// name as null, counts ONE declaration, keeps the exemption, and the pass falls
// SILENT — the direction the consequence bound forbids.
//
// Authored against the `Channel` row; no live spelling appears anywhere.

export type Channel = {
  panes(): string[];
  gauge(id: string): string;
  memo(cwd: string): Record<string, unknown> | null;
  claim(branch: string): string[];
  dispatch(target: string, text: string): void;
  emit(line: string): void;
  trace(line: string): void;
  clock(): number;
};

export function settle(ch: Channel): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    // The parentheses around the COMPUTED KEY are the fixture: they are what a
    // non-unwrapping implementation cannot see through.
    // prettier-ignore
    const competing = { [("snap")]: 1 };
    void competing;
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  return authorizeOnce() ? 1 : 0;
}
