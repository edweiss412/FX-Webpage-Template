// The app's own entry, mirroring a real one: it imports its OWN stylesheet by
// path (so the source walk discovers that), and pulls in the dependency by BARE
// SPECIFIER.
//
// The escape is the second import. `dep-internal-css` is not a `.css` path, so
// no specifier pattern matches it; the dependency then imports its own
// stylesheet from inside vendor/, which is never a walked root. The bundler
// resolves the chain and emits the face; the walk has nothing to follow.
import "./app.css";
import "dep-internal-css";
