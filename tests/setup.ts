// R41 P-R11 Fix-2: lib/email/hashForLog.ts throws at module load without a
// 32+ char pepper. Tests use a fixed value so hash bytes are deterministic.
process.env.HASH_FOR_LOG_PEPPER ??= "fxav-r41-test-pepper-32-chars-min-deterministic";
process.env.PICKER_COOKIE_SIGNING_KEY ??= "0".repeat(64);

export {};
