// FIXTURE — AC-15 / §4 limit 1: the pass is called CONDITIONALLY and the module scans CLEAN. This is the WITHDRAWN control-flow claim pinned as a limit. A later edit that starts reporting it fails this fixture, which is how the fence holds in both directions.
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

export function settle(ch: Channel, json: boolean): number {
  // send-auth: pass
  const authorizeOnce = (): boolean => {
    const snap: Channel = { ...ch };
    return snap.panes().length > 0;
  };
  const ok = json ? authorizeOnce() : true;
  if (!ok) return 1;
  ch.dispatch("p1", "/compact");
  return 0;
}
