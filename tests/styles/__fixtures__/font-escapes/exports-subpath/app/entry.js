// Mirrors a real entry: own stylesheet by path, dependency by specifier.
//
// The escape is `exports-subpath/theme` — not a path and not a `.css` string,
// so no specifier pattern matches. The package's `exports` map resolves it to
// styles/theme.css inside vendor/, which is never a walked root.
import "./app.css";
import "exports-subpath/theme";
