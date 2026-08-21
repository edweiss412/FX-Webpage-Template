// FIXTURE — the killer for "resolves `this["ch"]` but not `this[("ch")]`".
//
// Rule A's unwrap applies to the element KEY as well as to the receiver, because
// the key is a second name position and a transparent wrapper must not change
// what the guard sees at either. An implementation that resolves a bare string
// key and inspects the key node without unwrapping falls SILENT here while
// passing every other element-access case in the corpus.
//
// Its unwrapped twin is `element-access-receiver.ts`; the two differ only in the
// parentheses around the key.
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
    // The parentheses around the KEY are the fixture. Prettier deletes them,
    // which would silently convert this into a duplicate of the unwrapped case
    // and retire the only coverage of the key-position unwrap.
    // prettier-ignore
    this[("ch")].dispatch("p1", "/compact");
  }
}
