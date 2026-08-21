// FIXTURE — AC-9: a module that imports a REGISTERED surface type and has NO row
// of its own. It is added under the walked root with no registry edit, so a
// scanner iterating SEND_AUTH_SURFACES alone cannot discover it.

import type { Channel } from "./registered-channel";

export function drain(ch: Channel): void {
  ch.dispatch("p1", "/compact");
}
