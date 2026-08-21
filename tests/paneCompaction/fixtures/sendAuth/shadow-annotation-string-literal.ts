// FIXTURE — AC-U12: a STRING LITERAL TYPE is a literal type that is NOT `null`,
// and it COMPETES.
//
// The accept-set escape is the listed KEYWORD types plus `null`; every other
// form competes, including a literal type. This is the twin that reaches the
// `null` arm from the other side — under an equality flip on that arm this
// fixture falls SILENT, which is the fail-open direction.
//
// Note the annotation is deliberately NOT `string`: `string` is a keyword type
// and would not compete, so it would prove nothing about the literal arm. A
// different rule would decide the observation.
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
    const inner = (snap: "abc"): boolean => String(snap).length > 0;
    void inner;
    const a = snap.panes();
    const b = snap.panes();
    return a.length === b.length;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
