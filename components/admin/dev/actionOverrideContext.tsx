"use client";
/**
 * components/admin/dev/actionOverrideContext.tsx
 * (spec 2026-07-23-gallery-action-outcomes §3.3)
 *
 * Null-default override seam for the 3 modal controls that call server actions
 * by direct import (CrewRowActions, RotateShareTokenButton, PickerResetControl).
 * Production never mounts the provider; the hook then returns undefined and
 * callers fall back to the real import — byte-identical behavior. Only the dev
 * attention-gallery switcher mounts the provider, with scripted implementations
 * from lib/dev/galleryActionScripts (buildActionOverrides).
 *
 * The GalleryActionOverrides import is type-only, so no server-action module
 * code enters the client graph via this file.
 */
import { createContext, useContext } from "react";
import type { GalleryActionOverrides } from "@/lib/dev/galleryActionScripts";

export type DevActionOverrides = GalleryActionOverrides;

export const DevActionOverrideContext = createContext<DevActionOverrides | null>(null);

export function useDevActionOverride<K extends keyof DevActionOverrides>(
  key: K,
): DevActionOverrides[K] | undefined {
  return useContext(DevActionOverrideContext)?.[key];
}
