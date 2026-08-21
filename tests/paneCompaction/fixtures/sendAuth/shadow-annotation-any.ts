// FIXTURE — AC-U12: `any` is not an exact surface reference and COULD still
// hold the surface, so it COMPETES and the exemption is void.
//
// "Not spelled exactly like the surface type" is NOT "provably not the surface".
// Permitting only an exact match or an absent annotation to compete let a shadow
// annotated this way INHERIT the exemption and suppress reads the scanner reports
// today — a regression in the silence direction, introduced by the repair.
//
// Its silent pair is `shadow-annotation-string.ts`, which differs only in the
// annotation, so the report here is attributable to the accept-set.
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
    const inner = (snap: any): boolean => String(snap).length > 0;
    void inner;
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
