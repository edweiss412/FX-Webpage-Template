// FIXTURE — T6: a SECOND registered module in the same run. Nothing may assume a
// single-row registry: a scanner that stops at the first row reports nothing
// here and nothing about anything importing it.
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

export function relay(ch: Channel): void {
  ch.trace("relayed");
}
