// FIXTURE — diff r3: a competing declaration OUTSIDE the pass.
//
// The count walked only the PASS, so a class field `ch` declared outside it was
// never counted. A derivation named `ch` inside the pass then saw ONE
// declaration, kept its exemption, and the RAW field read `this.ch.panes()` was
// silently exempted — a fail-open in the arm whose whole claim is that it fails
// closed.
//
// SCOPE and SPELLING are two axes and the count was short on both. It now walks
// the MODULE: over-counting at worst REPORTS, while under-counting is SILENCE.
//
// The `local.gauge` pair is the control — it reported before and after, so the
// `panes` finding is attributable to the scope of the count.
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

export class Driver {
  private ch: Channel;

  constructor(injected: Channel) {
    this.ch = injected;
  }

  settle(local: Channel): number {
    // send-auth: pass
    const authorizeOnce = (): boolean => {
      const ch: Channel = { ...local };
      void ch;
      const first = this.ch.panes();
      const second = this.ch.panes();
      const g1 = local.gauge("a");
      const g2 = local.gauge("b");
      return first.length === second.length && g1 === g2;
    };
    if (!authorizeOnce()) return 1;
    this.ch.dispatch("p1", "/compact");
    return 0;
  }
}
