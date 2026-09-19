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
  // 순백 캔버스를 쓰는 라우트는 셸에서 한 번 판정해 overscroll 영역까지 같은 색을 유지한다.
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
