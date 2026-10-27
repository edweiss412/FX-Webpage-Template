/**
 * Where the saved-copy store lives (spec 4.6, 4.9): the IndexedDB database and
 * its stores, and the Cache Storage names for assets and static files.
 *
 * SCHEMA_VERSION is the database version and the suffix of every cache name, so
 * a worker built with a new schema can tell its own caches from older ones and
 * drop the rest on activate. Every cache name starts with CACHE_PREFIX, which is
 * what the kill switch deletes.
 */
export const SCHEMA_VERSION = 1;

export const DB_NAME = "fxav-offline";

/** One record under META_KEY: the generation counter, the next ordinal, the schema version. */
export const META_STORE = "meta";
export const META_KEY = "state";

/** Saved copies, keyed by show id, with a unique index on the URL each was saved under. */
export const COPIES_STORE = "copies";
export const URL_INDEX = "url";

/** Static file URL to the time it was stored. */
export const STATICS_STORE = "statics";

export const CACHE_PREFIX = "fxav-";
export const ASSET_CACHE = `${CACHE_PREFIX}assets-v${SCHEMA_VERSION}`;
export const STATIC_CACHE = `${CACHE_PREFIX}static-v${SCHEMA_VERSION}`;
