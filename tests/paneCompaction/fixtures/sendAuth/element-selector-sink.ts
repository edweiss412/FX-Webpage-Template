// FIXTURE — the SELECTOR killer. RECEIVER and SELECTOR are TWO POSITIONS.
//
// A form that unifies RECEIVER resolution while leaving the SELECTOR dot-only
// satisfies every receiver-shaped case in this arc, because those attribute
// their failure to the receiver's identifier restriction. This one does not:
// `this["ch"]["dispatch"]()` puts BOTH positions in element-access form, and
// under the receiver-only implementation the module is COMPLETELY SILENT.
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

  settle(): void {
    this["ch"]["dispatch"]("p1", "/compact");
  }
}
