// FIXTURE — T2: a marker attached to something that is NOT a function. The file's marker COUNT is 1 and the send-bearing function still has no pass, which is what a per-file counter cannot see.
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
  const threshold = 3;
  if (ch.panes().length < threshold) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
