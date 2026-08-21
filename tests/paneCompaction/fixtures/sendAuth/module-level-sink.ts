// FIXTURE — discovery ranges over module-level FUNCTIONS, and a sink called at module scope is a DOCUMENTED LIMIT rather than a finding. Its pair is undeclared-pass.ts: the same call inside a function IS reported, so the clean verdict here is the limit and not silence.
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

declare const makeChannel: () => Channel;

const ch: Channel = makeChannel();

export const sent = ch.dispatch("p1", "/compact");
