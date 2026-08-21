// FIXTURE — AC-5: a send-bearing function with no declared pass is UNDECLARED-PASS.
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
  const panes = ch.panes();
  if (panes.length === 0) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
