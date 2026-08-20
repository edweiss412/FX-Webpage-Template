// FIXTURE — AC-14: discovery is anchored on SINKS, not effects. Many effect calls, no sink call, no pass anywhere: must scan CLEAN. A scanner anchored on effects reports UNDECLARED-PASS here, which is what it would also do against the live module's fifteen out() calls.
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

export function report(ch: Channel): number {
  for (const pane of ch.panes()) {
    ch.emit(pane);
    ch.trace(pane);
  }
  ch.emit("done");
  ch.trace("done");
  return 0;
}
