"use client";

import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { isCustomerLightRoute } from "@/lib/customer-light-routes";

/**
 * 작가 고객 페이지 본문 골격 — 화면 전체를 흰색으로 덮는 `SystemLoadingScreen` 대신 실제 배치를 닮은
 * 자리 표시를 둔다(design-system.md §13.1). 라이트 화면(초대·갤러리·검토·완료·수령)은 순백 캔버스 위
 * 연한 회색, 다크 화면(소개·뷰어)은 다크 토큰을 쓴다. 블록은 공용 `skeleton-block` 쉬머(globals.css) —
 * 라이트 캔버스 속성이 없는 화면이라 골격 색 변수는 여기서 인라인으로 준다.
 * - invite: 초대 화면(작가 아바타·제목·안내·대표 사진·버튼).
 * - gallery: 갤러리·검토 목록(상단 줄·도구 줄·사진 격자). 모바일 2열 4:3, PC 180px 이상 정사각.
 * - page: 완료·수령·소개 같은 문서형 화면(제목·문단·카드).
 */
export function CustomerPageSkeleton({ variant = "page" }: { variant?: "invite" | "gallery" | "page" }) {
  const light = isCustomerLightRoute(usePathname());
  const canvas: CSSProperties = light
    ? { background: "var(--customer-canvas, #ffffff)", "--skeleton-base": "rgba(25, 25, 24, 0.08)", "--skeleton-highlight": "rgba(255, 255, 255, 0.7)" } as CSSProperties
    : { background: "var(--background)" };
  const bar = (className: string) => <span className={`skeleton-block ${className}`} />;

  if (variant === "invite") {
    return (
      <div role="status" aria-label="불러오는 중" aria-busy="true" className="flex min-h-dvh flex-col items-center px-6 pb-10 pt-14" style={canvas}>
        {bar("size-16 rounded-full")}
        {bar("mt-5 h-7 w-48 rounded-md")}
        {bar("mt-3 h-4 w-64 max-w-full rounded-md")}
        {bar("mt-2 h-4 w-40 rounded-md")}
        {bar("mt-8 aspect-[2/3] w-full max-w-[245px] rounded-2xl")}
        {bar("mt-auto h-12 w-full max-w-[360px] rounded-xl")}
      </div>
    );
  }
  if (variant === "gallery") {
    return (
      <div role="status" aria-label="불러오는 중" aria-busy="true" className="flex min-h-dvh flex-col" style={canvas}>
        <div className="flex h-14 shrink-0 items-center gap-3 px-5">
          {bar("h-5 w-36 rounded-md")}
          {bar("ml-auto size-9 rounded-full")}
        </div>
        <div className="flex h-12 shrink-0 items-center gap-2 px-5">
          {bar("h-8 w-24 rounded-full")}
          {bar("h-8 w-16 rounded-full")}
          {bar("ml-auto size-8 rounded-lg")}
        </div>
        <div className="grid grid-cols-2 content-start gap-1 p-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-2 md:px-5">
          {Array.from({ length: 12 }, (_, index) => <span key={index} className="skeleton-block aspect-[4/3] rounded-lg md:aspect-square" />)}
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-label="불러오는 중" aria-busy="true" className="flex min-h-dvh flex-col" style={canvas}>
      <main className="mx-auto w-full max-w-[640px] px-6 pb-12 pt-12">
        {bar("block h-7 w-40 rounded-md")}
        {bar("mt-3 block h-4 w-72 max-w-full rounded-md")}
        {bar("mt-2 block h-4 w-56 max-w-full rounded-md")}
        <div className="mt-8 rounded-2xl border p-5" style={{ borderColor: "var(--skeleton-base)" }}>
          {bar("block h-5 w-1/3 rounded-md")}
          {bar("mt-3 block h-4 w-2/3 rounded-md")}
          {bar("mt-6 block h-11 w-full rounded-xl")}
        </div>
      </main>
    </div>
  );
}
