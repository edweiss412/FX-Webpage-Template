// FIXTURE — a NAMESPACE import of a registered module, which the import-edge arm
// DOES follow, because `registered.Channel` is how a namespace import reaches the
// symbol §2.4 speaks about.
//
// Added by the Task 8 mutation gate, when the arm still SKIPPED imports with no
// named bindings and that skip-guard was removable. Diff r1 replaced the skip with
// a qualified-name arm, so this fixture now pins the REPORT rather than the skip;
// what it still protects is that `bindings.elements` is never walked on an import
// that has none.
//
// THE FIRST DRAFT OF THIS FIXTURE WAS INERT and the gate said so by leaving that
// mutant alive a second time. It never contained the string `Channel`, and the
// arm prefilters on the surface type NAME before parsing — so the file was
// skipped before the guard it targets could run. The qualified annotation below
// is what puts the token in the text. A fixture that never reaches the code it
// aims at is indistinguishable from a passing one.
//
// `registered.Channel` is a QualifiedName, not an identifier type reference, so
// `ch` is deliberately NOT a surface binding here — the module is reported by the
// IMPORT-EDGE arm, not by the binding walk.
//
// Until diff r1 this fixture asserted the opposite and called the skip a documented
// limit. It was not documented anywhere: §2.4 reports any unregistered module that
// imports the surface type, and §4 excepted nothing. The negative pair is
// `namespace-importer-unused.ts`, one variable apart.

import * as registered from "./registered-channel";

export function announce(ch: registered.Channel): void {
  ch.emit("ready");
}
