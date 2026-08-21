// FIXTURE — AC-9: discovery follows the SYMBOL, not the local name. Comparing
// the local binding text passes every other import fixture and misses this one,
// which is an ordinary TypeScript spelling rather than an obfuscation.

import type { Channel as Alias } from "./registered-channel";

export function drain(ch: Alias): void {
  ch.dispatch("p1", "/compact");
}
