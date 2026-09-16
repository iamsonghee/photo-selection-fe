"use client";

import { useParams, usePathname } from "next/navigation";
import { SelectionProvider } from "@/contexts/SelectionContext";
import { ReviewProvider } from "@/contexts/ReviewContext";
import { CustomerImageCacheProvider } from "@/contexts/CustomerImageCacheContext";
import { isCustomerLightRoute } from "@/lib/customer-light-routes";

export default function CustomerLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const token = (params?.token as string) ?? "";
  // 라이트 화면(갤러리·locked·PIN 등)은 흰 바탕인데, body/html은 전역 Dark 배경을 쓴다.
  // 모바일 러버밴드 overscroll이나 주소창 접힘으로 100dvh가 실제보다 잠깐 작아질 때
  // 그 틈으로 body의 검은 바탕이 비친다 — 예전엔 화면마다 useCustomerLightCanvas() 훅을
  // 불러 body만 손으로 흰색으로 바꿨는데, 그 화면 목록에 새 라이트 화면을 추가할 때마다
  // 잊기 쉬운 opt-in이었다(실제로 초대·확정·PIN 화면 세 곳이 빠져 있었다). 작가 쪽
  // (PhotographerDesktopShell/isPhotographerLightRoute)처럼 라우트 하나로 판정해 셸에서
  // 한 번에 켠다 — 새 라이트 화면은 여기 목록에만 추가하면 된다.
  const isLight = isCustomerLightRoute(pathname);

  return (
    <SelectionProvider>
      <CustomerImageCacheProvider key={token}>
        <ReviewProvider>
          <div className={`customer-app-shell relative min-h-[100dvh] bg-background text-foreground${isLight ? " customer-light-shell" : ""}`}>
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
              <div className="absolute -left-24 top-[6%] h-72 w-72 rounded-full bg-[#4f7eff]/12 blur-[100px]" />
              <div className="absolute right-[-12%] top-[32%] h-64 w-64 rounded-full bg-violet-500/8 blur-[90px]" />
            </div>
            <div className="relative z-10">{children}</div>
          </div>
        </ReviewProvider>
      </CustomerImageCacheProvider>
    </SelectionProvider>
  );
}
