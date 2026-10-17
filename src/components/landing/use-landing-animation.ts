"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

type DeviceHints = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
};

/** Browser hints are conservative heuristics; unsupported hints do not classify a device as slow. */
export function shouldUseStaticLanding(device: DeviceHints): boolean {
  const connection = device.connection;
  return connection?.saveData === true
    || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "")
    || (connection?.downlink !== undefined && connection.downlink > 0 && connection.downlink <= 1.5)
    || (device.deviceMemory !== undefined && device.deviceMemory > 0 && device.deviceMemory <= 4)
    || (device.hardwareConcurrency !== undefined && device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 4);
}

type StartAnimation = (root: HTMLElement) => () => void;

/** Posters ship in HTML. Import the animation only when the browser reports enough resources. */
export function useLandingAnimation(root: RefObject<HTMLDivElement | null>, load: () => Promise<StartAnimation>) {
  const [animated, setAnimated] = useState(false);
  const start = useRef<StartAnimation | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!shouldUseStaticLanding(navigator as Navigator & DeviceHints)) {
      load().then((animation) => {
        if (!cancelled) { start.current = animation; setAnimated(true); }
      }).catch(() => { /* Keep the usable poster if the animation chunk fails to load. */ });
    }
    return () => { cancelled = true; };
  }, [load]);
  useLayoutEffect(() => {
    if (animated && root.current && start.current) return start.current(root.current);
  }, [animated, root]);
  return animated;
}
