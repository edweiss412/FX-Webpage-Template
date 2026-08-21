// FIXTURE — AC-U2: a RAW HANDOFF through a PROPERTY RECEIVER.
//
// `helper(this.ch)` hands the raw surface into a callee exactly as
// `helper(local)` does. D5 required a bare identifier argument, so the property
// form was silent.
//
// The bare handoff in the SAME pass is the control: both are owed, and a
// verdict naming only one is the asymmetry this arc exists to remove.
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

declare function helper(c: Channel): void;

export class Driver {
  private ch: Channel;

  constructor(injected: Channel) {
    this.ch = injected;
  }

  settle(local: Channel): number {
    // send-auth: pass
    const authorizeOnce = (): boolean => {
      const snap: Channel = { ...local };
      helper(this.ch);
      helper(local);
      return snap.memo("/") !== null;
    };
    if (!authorizeOnce()) return 1;
    this.ch.dispatch("p1", "/compact");
    return 0;
  }
}
