// FIXTURE — AC-2 discriminator: the SAME callback-handoff shape with a READ member MUST report. Without this pair the ambient exemption is a hole rather than a rule.
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
    return snap.panes().length > 0;
  };
  if (!authorizeOnce()) return 1;
  const token = mint({ memo: ch.memo });
  ch.dispatch("p1", token);
  return 0;
}

function mint(source: { memo: (cwd: string) => Record<string, unknown> | null }): string {
  return String(source.memo("/"));
}
