// FIXTURE — AC-U5's positive pair, ONE VARIABLE away from
// `shadow-annotation-string.ts`: the annotation is the surface type, so the
// declaration COMPETES and the exemption is void.
//
// The pair is what makes the sibling's silence ATTRIBUTABLE to the annotation
// rather than to the scanner never arriving.
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
    const inner = (snap: Channel): boolean => String(snap).length > 0;
    void inner;
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
