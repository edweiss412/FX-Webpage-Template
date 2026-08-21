// FIXTURE — AC-U12, the `null` arm: `null` CANNOT HOLD AN OBJECT, so it does not
// compete and the exemption survives. The pass is silent.
//
// `null` is the one member of the accept-set that is NOT a keyword node: the
// compiler models it as a LiteralType WRAPPING the keyword, so it needs its own
// arm. The mutation gate found that arm unexercised — an equality flip on it
// survived, because no fixture reached it from either side.
//
// Its expect-a-REPORT twin is `shadow-annotation-string-literal.ts`, which
// differs only in WHICH literal type the annotation is. Together they kill the
// flip in both directions: under the mutant this one REPORTS and that one falls
// SILENT.
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
    const inner = (snap: null): boolean => String(snap).length > 0;
    void inner;
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
