// FIXTURE — a MODULE-LEVEL surface binding, so the derivation exemption's own
// predicate is the rule that decides.
//
// Every other fixture takes the surface as a PARAMETER, and a parameter of an
// enclosing function shadows its own name by construction — so `shadowedBetween`
// answers first and the name comparison and containment test never decide anything.
// Binding at module scope removes that dominance and leaves the exemption exposed.
//
// The bare mention of `snap` INSIDE the pass must stay CLEAN: it is the declared
// derivation, and reads through it are unconstrained. Break the name comparison and
// `snap` stops matching its own derivation, so this mention is reported and the case
// reds on an EXTRA finding rather than a missing one.
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

declare const makeChannel: () => Channel;

const ch: Channel = makeChannel();

export function settle(): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    const held = [snap];
    return snap.panes().length > 0 && held.length > 0;
  };
  if (!authorizeOnce()) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
