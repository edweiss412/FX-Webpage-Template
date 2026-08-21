// FIXTURE — diff r2 F3: an unregistered importer using a `.js` SPECIFIER.
//
// TypeScript's bundler and NodeNext resolutions both map `./registered-channel.js`
// onto `registered-channel.ts`, so this is an ordinary spelling rather than an
// obfuscation — it is what every ESM-output codebase writes. The import edge stripped
// only `.ts` and `.tsx`, so the resolved path kept its `.js` suffix, matched no
// registry row, and the importer went unreported.
//
// Authored against the `Channel` row; no live spelling appears anywhere.

import type { Channel } from "./registered-channel.js";

export function announce(ch: Channel): void {
  ch.emit("ready");
}
