/**
 * Canonical http(s)-scheme prefix test, shared by `parseAgendaLinks`
 * (lib/parser/index.ts) and the `enrichAgenda` non-clickable-link discriminator
 * (lib/sync/enrichAgenda.ts) so the two classifications cannot drift.
 *
 * Case-INSENSITIVE: URL schemes are case-insensitive, so `HTTPS://…` is a valid
 * external link. The `i` flag carries no `lastIndex` statefulness (unlike `g`/`y`),
 * so a single shared instance is safe to `.test()` repeatedly.
 */
export const HTTP_URL_PREFIX = /^https?:\/\//i;
