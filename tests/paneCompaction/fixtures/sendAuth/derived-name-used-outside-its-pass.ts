// FIXTURE — a MODULE-LEVEL binding whose name a pass reuses for its derivation, then
// mentioned OUTSIDE that pass.
//
// This is what makes the exemption's CONTAINMENT test decide. The name matches a real
// derivation, so the name comparison passes; the use sits outside the pass that
// derives it, so containment must reject it; and the binding is module-level, so the
// shadow check has nothing to say. Each of the three conjuncts is load-bearing here
// and no other case leaves containment exposed.
//
// The mention must REPORT: outside the pass, `snap` is the module-level surface
// binding and a bare mention of it is unclassifiable. Weaken the conjunction and the
// exemption applies wherever nothing shadows, so this finding disappears — the silent
// direction.
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
const snap: Channel = makeChannel();

export function settle(): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  if (!authorizeOnce()) return 1;
  const parked = [snap];
  if (parked.length === 0) return 1;
  snap.dispatch("p1", "/compact");
  return 0;
}
