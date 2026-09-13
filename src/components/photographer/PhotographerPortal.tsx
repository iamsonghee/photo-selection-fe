"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import lightTheme from "@/styles/PhotographerLightTheme.module.css";

/** Keep photographer overlays above shell chrome while preserving Light tokens. */
export function PhotographerPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div data-photographer-portal className={lightTheme.lightTheme}>{children}</div>, document.body);
}
