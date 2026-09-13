"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";

const COLLAPSE_AT = 64;
const EXPAND_AT = 16;
const IMMERSIVE_AT = 96;
const DIRECTION_DISTANCE = 12;
const HEADER_TRANSITION_SETTLE_MS = 260;
const ASSET_IMMERSIVE_EVENT = "photographer:asset-immersive-change";

/**
 * Asset Workspace의 독립 스크롤 영역을 기준으로 상단 헤더를 축소한다.
 * 서로 다른 임계값을 사용해 트랙패드의 작은 왕복 스크롤에도 헤더가 떨리지 않게 한다.
 */
function useCollapsibleAssetHeaderState(compactOnly = false) {
  const [mode, setMode] = useState<"expanded" | "compact" | "immersive">("expanded");
  const lastScrollTopRef = useRef(0);
  const directionRef = useRef<"up" | "down" | null>(null);
  const directionDistanceRef = useRef(0);
  const transitionLockUntilRef = useRef(0);

  const commitMode = useCallback((nextMode: "expanded" | "compact" | "immersive") => {
    setMode((currentMode) => {
      if (currentMode === nextMode) return currentMode;
      // header 높이 변경이 scroll container의 maxScrollTop을 바꾸며 발생시키는 보정
      // scroll을 사용자의 방향 전환으로 오인하지 않도록 transition이 끝날 때까지 잠근다.
      transitionLockUntilRef.current = Date.now() + HEADER_TRANSITION_SETTLE_MS;
      return nextMode;
    });
  }, []);

  const handleScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const scrollElement = event.currentTarget;
    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    // Safari/iOS의 rubber-band는 scrollTop을 0 미만 또는 max 초과 값으로 잠시 노출한다.
    // 그 반동을 실제 위/아래 방향 전환으로 세지 않도록 유효 범위 안의 값만 사용한다.
    const scrollTop = Math.min(maxScrollTop, Math.max(0, scrollElement.scrollTop));
    // 업로드는 PC·모바일 모두 상단에서만 펼친다. 짧은 목록은 높이 변화로
    // 스크롤이 사라졌다 생기는 반복을 막기 위해 충분한 스크롤 여유가 있을 때만 접는다.
    if (compactOnly) {
      if (scrollTop <= EXPAND_AT) commitMode("expanded");
      else if (scrollTop >= COLLAPSE_AT && maxScrollTop > 200) commitMode("compact");
      return;
    }
    if (window.innerWidth >= 768) {
      lastScrollTopRef.current = scrollTop;
      commitMode("expanded");
      return;
    }

    const delta = scrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;

    if (scrollTop <= EXPAND_AT) {
      directionRef.current = null;
      directionDistanceRef.current = 0;
      commitMode("expanded");
      return;
    }

    if (Date.now() < transitionLockUntilRef.current) {
      directionRef.current = null;
      directionDistanceRef.current = 0;
      return;
    }

    if (scrollTop < COLLAPSE_AT) {
      commitMode("compact");
      return;
    }

    if (delta === 0) return;
    const direction = delta > 0 ? "down" : "up";
    if (directionRef.current !== direction) {
      directionRef.current = direction;
      directionDistanceRef.current = 0;
    }
    directionDistanceRef.current += Math.abs(delta);

    if (direction === "down" && scrollTop >= IMMERSIVE_AT && directionDistanceRef.current >= DIRECTION_DISTANCE) {
      commitMode("immersive");
    } else if (direction === "up" && directionDistanceRef.current >= DIRECTION_DISTANCE) {
      commitMode("compact");
    }
  }, [commitMode, compactOnly]);

  const immersive = mode === "immersive";
  useEffect(() => {
    const root = document.documentElement;
    if (immersive) root.dataset.photographerAssetImmersive = "true";
    else delete root.dataset.photographerAssetImmersive;
    window.dispatchEvent(new CustomEvent(ASSET_IMMERSIVE_EVENT, { detail: { immersive } }));
  }, [immersive]);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 767px)");
    const handleViewportChange = () => {
      if (compactOnly) return;
      if (mobileViewport.matches) return;
      directionRef.current = null;
      directionDistanceRef.current = 0;
      transitionLockUntilRef.current = 0;
      setMode("expanded");
    };
    mobileViewport.addEventListener("change", handleViewportChange);
    return () => mobileViewport.removeEventListener("change", handleViewportChange);
  }, [compactOnly]);

  useEffect(() => () => {
    delete document.documentElement.dataset.photographerAssetImmersive;
    window.dispatchEvent(new CustomEvent(ASSET_IMMERSIVE_EVENT, { detail: { immersive: false } }));
  }, []);

  return useMemo(() => ({
    compact: mode !== "expanded",
    immersive,
    handleScroll,
  }), [handleScroll, immersive, mode]);
}

/** Asset layout 밖의 독립 스크롤형 사진 화면에서도 같은 축소 임계값을 재사용한다. */
export function useCollapsibleAssetHeaderController(options?: { compactOnly?: boolean }) {
  return useCollapsibleAssetHeaderState(options?.compactOnly);
}

type CollapsibleAssetHeaderContextValue = ReturnType<typeof useCollapsibleAssetHeaderState>;

const CollapsibleAssetHeaderContext = createContext<CollapsibleAssetHeaderContextValue | null>(null);

/** 자산 탭 사이에서 현재 헤더 축소 상태를 공유한다. */
export function CollapsibleAssetHeaderProvider({ children, compactOnly = false }: { children: ReactNode; compactOnly?: boolean }) {
  const value = useCollapsibleAssetHeaderState(compactOnly);
  return createElement(CollapsibleAssetHeaderContext.Provider, { value }, children);
}

export function useCollapsibleAssetHeader() {
  const value = useContext(CollapsibleAssetHeaderContext);
  if (!value) {
    throw new Error("useCollapsibleAssetHeader must be used within CollapsibleAssetHeaderProvider");
  }
  return value;
}
