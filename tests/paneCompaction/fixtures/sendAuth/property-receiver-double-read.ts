// FIXTURE — AC-U1: a doubled read through a PROPERTY RECEIVER.
//
// `this.ch.panes()` twice in a pass is two instants of the same value, exactly
// as `ch.panes()` twice is. D4 required a BARE IDENTIFIER receiver, so the
// property form was silent — the fail-open direction.
//
// THE BARE PAIR IN THE SAME FUNCTION IS THE CONTROL. Without it a green verdict
// is satisfied by the machinery never running at all: a broken parse, an
// unfound pass, an empty walk. `local.gauge` reports through the route that
// already worked, so the property pair's finding is ATTRIBUTABLE to the receiver
// shape rather than to the scanner having arrived.
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
      const first = this.ch.panes();
      const second = this.ch.panes();
      const g1 = local.gauge("a");
      const g2 = local.gauge("b");
      const snap: Channel = { ...local };
      return first.length === second.length && g1 === g2 && snap.memo("/") !== null;
    };
    if (!authorizeOnce()) return 1;
    this.ch.dispatch("p1", "/compact");
    return 0;
  }
}
