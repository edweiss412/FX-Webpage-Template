/**
 * Settles, by EXECUTION rather than by reading next's source, what
 * `background-size` next/image gives a blur placeholder when the object-fit is
 * set through a className instead of the `style` prop.
 *
 * Spec review rounds 2 and 3 both landed on this one claim, and both times the
 * spec asserted a value derived by reading the module. `INVALID_BACKGROUND_SIZE_VALUES`
 * contains `undefined` itself, so an absent `style.objectFit` does NOT pass
 * through as absent: it falls to the `cover` default. Reading that correctly is
 * possible; calling it is decisive, so this calls it.
 *
 * MEASUREMENT ONLY on the reporting side, but it GATES the one claim it exists
 * for: it exits non-zero if the two cases disagree, which is the property the
 * spec depends on (the class-only fit change is inert for the placeholder).
 */
import { createRequire } from "node:module";
import { getImageProps } from "next/image";

// The line numbers this probe's spec section quotes live in an UNTRACKED package,
// so they move with the version. Print it, and the report carries its own provenance.
const nextVersion = createRequire(import.meta.url)("next/package.json").version;

const base = {
  src: "/x.png",
  alt: "",
  fill: true,
  sizes: "100px",
  placeholder: "blur",
  blurDataURL: "data:image/png;base64,iVBORw0KGgo=",
  loader: ({ src, width }) => `${src}?w=${width}`,
};

const read = (className) => {
  const { props } = getImageProps({ ...base, className });
  return {
    className,
    backgroundSize: props.style?.backgroundSize,
    objectFit: props.style?.objectFit,
  };
};

console.log(`next@${nextVersion}  (get-img-props line numbers are version-scoped)\n`);

const cover = read("object-cover");
const contain = read("object-contain");
const styled = (() => {
  const { props } = getImageProps({ ...base, style: { objectFit: "contain" } });
  return {
    className: "(style prop instead)",
    backgroundSize: props.style?.backgroundSize,
    objectFit: props.style?.objectFit,
  };
})();

for (const r of [cover, contain, styled]) {
  console.log(
    `${String(r.className).padEnd(22)} backgroundSize=${JSON.stringify(r.backgroundSize)}` +
      (r.objectFit === undefined
        ? "  (next saw no objectFit)"
        : `  (next saw objectFit=${r.objectFit})`),
  );
}

const inert = cover.backgroundSize === contain.backgroundSize;
// The control has to discriminate, or two identical "cover" rows would satisfy
// `inert` even if next had stopped reading object-fit from anywhere at all.
const controlDiscriminates = styled.backgroundSize !== cover.backgroundSize;
console.log(
  `\n${inert ? "OK" : "FAIL"}: the class-only fit change ${inert ? "is" : "is NOT"} inert for the blur placeholder ` +
    `(${JSON.stringify(cover.backgroundSize)} -> ${JSON.stringify(contain.backgroundSize)})`,
);
console.log(
  `${controlDiscriminates ? "OK" : "FAIL"}: the style-prop control ${controlDiscriminates ? "does" : "does NOT"} move the value ` +
    `(${JSON.stringify(cover.backgroundSize)} -> ${JSON.stringify(styled.backgroundSize)}), ` +
    `so an inert class change is a real finding about className and not a dead read`,
);
process.exitCode = inert && controlDiscriminates ? 0 : 1;
