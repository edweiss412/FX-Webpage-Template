// FIXTURE — the pass is an UNNAMED function declaration, so the finding must name it (anonymous) rather than reaching for a name that is not there.
//
// Added by the Task 8 mutation gate.
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

// send-auth: pass
// The anonymity is what this fixture tests, so naming the function would
// delete the case. Keyed to this ONE line rather than the file.
// eslint-disable-next-line import/no-anonymous-default-export
export default function (ch: Channel): number {
  if (ch.panes().length === 0) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
