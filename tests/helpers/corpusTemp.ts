// Synthetic fixtures written into fixtures/shows/raw/ by serial tests MUST carry
// this prefix; corpus readers filter it out. This is what makes the corpus safe
// under test:fast's serial/parallel overlap (spec §4.1.2). Pinned by
// tests/cross-cutting/corpus-temp-prefix.test.ts.
export const CORPUS_TEMP_PREFIX = "_temp-";
