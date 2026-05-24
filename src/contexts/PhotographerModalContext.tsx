"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type PhotographerModalContextValue = {
  /** 모달이 열릴 때 호출 — cleanup 함수 반환 */
  registerOpen: () => () => void;
  isAnyOpen: boolean;
};

const PhotographerModalContext = createContext<PhotographerModalContextValue | null>(null);

export function PhotographerModalProvider({ children }: { children: React.ReactNode }) {
  const [openCount, setOpenCount] = useState(0);

  const registerOpen = useCallback(() => {
    setOpenCount((c) => c + 1);
    return () => setOpenCount((c) => Math.max(0, c - 1));
  }, []);

  const value = useMemo(
    () => ({ registerOpen, isAnyOpen: openCount > 0 }),
    [registerOpen, openCount],
  );

  return (
    <PhotographerModalContext.Provider value={value}>
      {children}
    </PhotographerModalContext.Provider>
  );
}

export function usePhotographerModalLayer() {
  const ctx = useContext(PhotographerModalContext);
  if (!ctx) {
    throw new Error("usePhotographerModalLayer must be used within PhotographerModalProvider");
  }
  return ctx;
}

/** Provider 밖(테스트 등)에서도 PhotographerModal이 동작하도록 optional */
export function usePhotographerModalRegister() {
  return useContext(PhotographerModalContext)?.registerOpen ?? null;
}

export function usePhotographerModalChromeHidden() {
  return useContext(PhotographerModalContext)?.isAnyOpen ?? false;
}
