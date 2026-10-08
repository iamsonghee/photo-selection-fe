"use client";

import { useParams, usePathname } from "next/navigation";
import { SelectionProvider } from "@/contexts/SelectionContext";
import { ReviewProvider } from "@/contexts/ReviewContext";
import { CustomerImageCacheProvider } from "@/contexts/CustomerImageCacheContext";
import { isCustomerLightRoute } from "@/lib/customer-light-routes";
import lightTheme from "@/styles/PhotographerLightTheme.module.css";

export default function CustomerLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const token = (params?.token as string) ?? "";
  // 순백 캔버스를 쓰는 라우트는 셸에서 한 번 판정해 overscroll 영역까지 같은 색을 유지하고,
  // 작가 Light 토큰을 씌워 text-foreground·bg-surface 같은 공용 토큰도 밝은 값으로 풀리게 한다.
  const isLight = isCustomerLightRoute(pathname);

  return (
    <SelectionProvider>
      <CustomerImageCacheProvider key={token}>
        <ReviewProvider>
          <div className={`customer-app-shell relative min-h-[100dvh] bg-background text-foreground${isLight ? ` customer-light-shell ${lightTheme.lightTheme}` : ""}`}>
            <div className="relative z-10">{children}</div>
          </div>
        </ReviewProvider>
      </CustomerImageCacheProvider>
    </SelectionProvider>
  );
}
