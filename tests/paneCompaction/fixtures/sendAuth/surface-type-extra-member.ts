// FIXTURE — the surface type whose read set AC-4 derives.
//
// Authored against the `Channel` row, with NO live spelling anywhere: a scanner
// hardcoded to `Surface` / `send` / `authorize` / the ten live read names fails
// this file immediately, which is the discrimination the corpus exists for.
//
// `stamp` is the member declared in NONE of the row's three sets, and it is a
// PROPERTY signature rather than a method: the rule ranges over every member of
// the type declaration, so a scanner inspecting only `MethodSignature` would
// otherwise pass. The live type mixes both forms, so this is the ordinary case.
// (The plan illustrates the shape as `marker: (cwd) => …`; the name here is
// `stamp` because no fixture may carry a live read name.)

export type Channel = {
  panes(): string[];
  gauge(id: string): string;
  memo(cwd: string): Record<string, unknown> | null;
  claim(branch: string): string[];
  stamp: (cwd: string) => string | null;
  dispatch(target: string, text: string): void;
  emit(line: string): void;
  trace(line: string): void;
  clock(): number;
};
