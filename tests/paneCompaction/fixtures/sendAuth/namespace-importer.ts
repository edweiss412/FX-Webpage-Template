// FIXTURE — a NAMESPACE import of a registered module, which the import-edge arm
// deliberately does NOT follow (documented limit).
//
// Added by the Task 8 mutation gate: the guard that skips an import with no NAMED
// bindings was removable, and without it the arm walks into `bindings.elements`
// on a namespace import that has none.
//
// THE FIRST DRAFT OF THIS FIXTURE WAS INERT and the gate said so by leaving that
// mutant alive a second time. It never contained the string `Channel`, and the
// arm prefilters on the surface type NAME before parsing — so the file was
// skipped before the guard it targets could run. The qualified annotation below
// is what puts the token in the text. A fixture that never reaches the code it
// aims at is indistinguishable from a passing one.
//
// `registered.Channel` is a QualifiedName, not an identifier type reference, so
// `ch` is deliberately NOT a surface binding here and this module reports nothing.

import * as registered from "./registered-channel";

export function announce(ch: registered.Channel): void {
  ch.emit("ready");
}
