// FIXTURE — diff r1 F2: a PRIVATE IDENTIFIER field holding the surface.
//
// `surfaceBindings` required the declaration's name to be an `Identifier`, so a
// `#ch` field never joined the binding set at all and every use of it resolved
// as FOREIGN -- silent, before rule A ever ran. The binding-COLLECTION side was
// keyed on one spelling while the resolution side had been unified.
//
// `PrivateIdentifier.text` carries the `#`, and the declaration and the use now
// read it through the SAME resolver, so the two agree by construction rather
// than by coincidence.
//
// The public field in this module is the control: it reported before and after.
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
  #ch: Channel;
  private open: Channel;

  constructor(injected: Channel) {
    this.#ch = injected;
    this.open = injected;
  }

  hidden(): void {
    this.#ch.dispatch("p1", "/compact");
  }

  exposed(): void {
    this.open.dispatch("p2", "/compact");
  }
}
