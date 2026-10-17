"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

type DeviceHints = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
};

/** 4GB/4코어·3G 힌트만으로 일반 모바일의 연출을 차단하지 않는다. */
export function shouldUseStaticLanding(device: DeviceHints): boolean {
  const connection = device.connection;
  const veryLowMemory = device.deviceMemory !== undefined && device.deviceMemory > 0 && device.deviceMemory <= 2;
  const veryLowCpu = device.hardwareConcurrency !== undefined && device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 2;
  return connection?.saveData === true
    || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
    || (veryLowMemory && veryLowCpu);
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
