// FIXTURE — AC-U5: a declaration PROVABLY NOT the surface does not compete.
//
// `string` is a keyword type that CANNOT HOLD AN OBJECT, so the shadow is ruled
// out as the surface WITHOUT a checker and the derivation exemption survives. The
// pass is silent.
//
// ITS EXPECT-A-REPORT PAIR is `shadow-annotation-surface.ts`, identical but for
// the annotation. Without that pair this fixture is satisfied by any
// implementation that fails to look at all, which is the fail-open direction.
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
    const inner = (snap: string): boolean => String(snap).length > 0;
    void inner;
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
