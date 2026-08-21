/**
 * The manufactured control surface (spec 5.3).
 *
 * APPARATUS, not a guard: it is deliberately NOT enrolled in the registry. Its
 * job is to give the instrument a KNOWN correlated mechanism to find, because a
 * detector that has never fired earns no zeros — every campaign null it later
 * produces is worth exactly as much as its positive control.
 *
 * Two sites, one per deciding suite:
 *   `gate`   is decided by suite 2, whose check is STATE-DEPENDENT.
 *   `always` is decided by suite 1, deterministically, by suite bytes alone.
 */
export const gate = (n: number): boolean => n < 3;

export const always = (n: number): boolean => n < 100;
