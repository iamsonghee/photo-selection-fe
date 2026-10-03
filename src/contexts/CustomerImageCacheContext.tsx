"use client";

import { createContext, useContext, useState } from "react";
import { createThumbLoadQueue, type ThumbLoadQueue } from "@/lib/thumb-load-queue";

// 고객 갤러리 썸네일 로딩 큐. 썸네일은 사진 정보의 공개 주소(img.acut.kr, Cloudflare 캐시)를 바로 쓴다(2026-10-03, 서명 URL 발급 제거).
// [token] 공통 레이아웃에 두어 갤러리→뷰어→갤러리로 재마운트돼도 로드 완료 기록을 재사용한다.
const CustomerImageCacheContext = createContext<{ thumbQueue: ThumbLoadQueue } | null>(null);

export function useCustomerImageCache() {
  const context = useContext(CustomerImageCacheContext);
  if (!context) throw new Error("useCustomerImageCache must be used within CustomerImageCacheProvider");
  return context;
}

export function CustomerImageCacheProvider({ children }: { children: React.ReactNode }) {
  // 작가 원본 갤러리와 같은 동시성. 실제 마운트는 IntersectionObserver로 제한되므로 화면 밖 수백 장이 한꺼번에 받히지 않는다.
  const [value] = useState(() => ({ thumbQueue: createThumbLoadQueue(12) }));
  return <CustomerImageCacheContext.Provider value={value}>{children}</CustomerImageCacheContext.Provider>;
}
