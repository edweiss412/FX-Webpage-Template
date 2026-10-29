/**
 * components/diagrams/galleryLimits.ts — gallery limits shared with the server.
 *
 * `Gallery.tsx` is a client module, and a server module that imports a value
 * from a client module gets a client reference, not the value. The crew search
 * index, built on the server under lib/search/sections, needs the same
 * thumbnail cap the gallery renders with, so the cap lives here, in a module
 * with no `"use client"`, for both to import.
 */

/** Thumbnails rendered before "Show all"; items past it mount only on expand. */
export const INITIAL_VISIBLE = 12;
