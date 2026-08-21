// FIXTURE — T2: the row's declared sink is a member NEVER called in this module, while a member a hardcoded scanner would anchor on IS called. Discovery must follow the ROW, so this scans CLEAN.
//
// Authored against the `Channel` row; no live spelling appears anywhere.

export type Channel = {
  panes(): string[];
  gauge(id: string): string;
  memo(cwd: string): Record<string, unknown> | null;
  claim(branch: string): string[];
  dispatch(target: string, text: string): void;
  settleAll(): void;
  emit(line: string): void;
  trace(line: string): void;
  clock(): number;
};

export function report(ch: Channel): number {
  ch.dispatch("p1", "/compact");
  ch.emit("sent");
  return 0;
}
