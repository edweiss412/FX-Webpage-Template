// The escape: the specifier "exports-subpath/theme" is not a path. It resolves
// through the package's `exports` map to styles/theme.css, so no filesystem walk
// keyed on the literal specifier finds the file, and no CSS @import names it.
import "exports-subpath/theme";
