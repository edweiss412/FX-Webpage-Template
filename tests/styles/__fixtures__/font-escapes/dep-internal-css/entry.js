// The escape: the JS entry pulls in the dependency, and the DEPENDENCY pulls in
// its own stylesheet. Nothing in any CSS file names that stylesheet, so a walk
// over CSS @import chains cannot reach it. The bundler resolves it and emits its
// @font-face into the built output.
import "dep-internal-css";
