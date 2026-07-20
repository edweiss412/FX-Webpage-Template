// tests/e2e/_nodeCryptoStub.ts
// esbuild --alias target for `node:crypto` in the compact-alert-card live
// harness. The adapter's import graph reaches lib/parser/warnings.ts, whose
// module body imports createHash; no harness render path CALLS it, so a
// loud-throw stub keeps the bundle loadable in the browser while making any
// accidental use unmissable.
export function createHash(): never {
  throw new Error("node:crypto stubbed in browser harness (never called in render)");
}
