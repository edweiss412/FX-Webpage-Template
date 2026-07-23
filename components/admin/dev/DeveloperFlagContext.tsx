"use client";
/**
 * components/admin/dev/DeveloperFlagContext.tsx - §2.1. Visibility-only
 * developer flag, resolved server-side in app/admin/layout.tsx via
 * isCurrentUserDeveloper() (fail-to-false) and provided panel-wide so deep
 * mounts (ShareHub kebab, Step3 header) need no prop drilling. NOT a
 * security gate - the capture action enforces requireDeveloper() itself.
 */
import { createContext, useContext, type ReactNode } from "react";

const DeveloperFlagContext = createContext<boolean>(false);

export function DeveloperFlagProvider(props: {
  viewerIsDeveloper: boolean;
  children: ReactNode;
}) {
  return (
    <DeveloperFlagContext.Provider value={props.viewerIsDeveloper}>
      {props.children}
    </DeveloperFlagContext.Provider>
  );
}

export function useViewerIsDeveloper(): boolean {
  return useContext(DeveloperFlagContext);
}
