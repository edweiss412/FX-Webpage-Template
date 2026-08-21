// FIXTURE — AC-9 false-positive guard: a module that imports the surface type
// AND HAS a registry row. It must NOT report. Without this, an implementation
// reporting every importer of the type passes the unregistered case and then
// fires on every enrolled module.
//
// Its read set is empty by construction — the type is declared in the module it
// imports from, not here — which is why this module calls only a DECLARED
// effect. An unknown member would report UNCLASSIFIED-USE, which is the
// conservative direction the consequence bound requires.

import type { Channel } from "./registered-channel";

export function announce(ch: Channel): void {
  ch.emit("ready");
}
