// FIXTURE — discovery covers an UNNAMED module-level function. Requiring a name made this undiscoverable and therefore SILENT — a send-bearing function nobody reports — which is the direction the consequence bound forbids.
//
// Added by the Task 8 mutation gate, which proved the corpus could not see this.
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

// The anonymity is what this fixture tests, so naming the function would
// delete the case. Keyed to this ONE line rather than the file.
// eslint-disable-next-line import/no-anonymous-default-export
export default function (ch: Channel): number {
  ch.dispatch("p1", "/compact");
  return 0;
}
