// A share token of the SHIPPED SHAPE, for tests that need one.
//
// Derived, not invented: the DB is the authority for the shape
// (`check (share_token ~ '^[0-9a-f]{64}$')`,
// supabase/migrations/20260523000002_show_share_tokens.sql:41, generated as
// `encode(gen_random_bytes(32), 'hex')`), and `scrubShareTokens` now matches on
// that shape rather than on a path position. A fixture that is not shape-valid
// tests nothing: the scrubber correctly declines to treat it as a token, so an
// assertion written against one would pass for the wrong reason.
//
// Deterministic and NON-REPEATING. A repeating token would let a prefix recur at
// several offsets inside the token itself, which is exactly the case the prefix
// scrub's descending order exists to handle — a fixture must not hide it.
export const SHAPED_TOKEN = "1373134361437587c7d3553745c08d3a5edb385a542d353fc91f3e65de1b0438";
