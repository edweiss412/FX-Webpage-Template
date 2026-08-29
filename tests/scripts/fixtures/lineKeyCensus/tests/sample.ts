// Declared locally, NOT imported: tsc typechecks fixtures, and an import of a
// deliberately absent module fails the Quality gate. The annotation is what
// matters here -- isConstructed keys on `: ScanElement`, not on its provenance.
type ScanElement = { file: string; line: number };

// A COMMENT CITATION naming "src/Real.tsx:12" — prose, not a key.
export const REGISTRY = [
  // load-bearing: target exists in the fixture tree
  { file: "src/Real.tsx", line: 10, note: "a" },
  // synthetic: target does not exist anywhere
  { file: "src/DoesNotExist.tsx", line: 4, note: "b" },
];

// constructed input: an explicit ScanElement annotation, names a real file,
// but nothing recomputes its line, so it cannot churn.
const constructed: ScanElement = {
  file: "src/Real.tsx",
  line: 99,
};

export const STRING_KEYED = ["src/Real.tsx:22", "src/DoesNotExist.tsx:1"];
void constructed;
