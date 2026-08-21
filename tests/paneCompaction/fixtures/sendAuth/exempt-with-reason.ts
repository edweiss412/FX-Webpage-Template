// FIXTURE — AC-5: an exempt marker with a NON-EMPTY reason suppresses UNDECLARED-PASS.
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

// send-auth: exempt: every sending mode is refused by the fence before this runs
export function settle(ch: Channel): number {
  ch.dispatch("p1", "/compact");
  return 0;
}
