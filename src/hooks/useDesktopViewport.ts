"use client";

import { useSyncExternalStore } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const snapshot = () => window.matchMedia(DESKTOP_QUERY).matches;
const serverSnapshot = () => false;

/** Use for PC-only behavior; CSS remains the default for responsive layout. */
export function useDesktopViewport() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
