// FIXTURE — AC-4: type members whose names are NOT identifiers. A string-literal member and an index signature are not read names, and a scanner that admits them puts a quoted key into the read set.
//
// Added by the Task 8 mutation gate.

export type Channel = {
  panes(): string[];
  gauge(id: string): string;
  memo(cwd: string): Record<string, unknown> | null;
  claim(branch: string): string[];
  "wire-format": string;
  [key: string]: unknown;
  dispatch(target: string, text: string): void;
  emit(line: string): void;
  trace(line: string): void;
  clock(): number;
};

export function settle(ch: Channel): number {
  ch.dispatch("p1", "/compact");
  return 0;
}
