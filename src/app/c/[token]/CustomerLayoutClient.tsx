"use client";

import { usePathname } from "next/navigation";
import { SelectionProvider } from "@/contexts/SelectionContext";
import { ReviewProvider } from "@/contexts/ReviewContext";
import OriginalDownloadEntry from "@/components/customer/OriginalDownloadEntry";

// 이 서브경로들에서는 다운로드 진입점을 숨긴다 — pin(미인증 상태), viewer(다운로드 차단
// 목적의 전체화면 뷰어), about(온보딩 정적 페이지). 그 외 신규 라우트가 추가돼도 기본
// 노출되므로 누락 위험이 낮다.
const HIDDEN_SUBPATH_PREFIXES = ["pin", "viewer", "about"];

function extractTokenAndSubpath(pathname: string): { token: string; subpath: string } | null {
  const m = pathname.match(/^\/c\/([^/]+)(?:\/(.*))?$/);
  if (!m) return null;
  return { token: m[1], subpath: m[2] ?? "" };
}

export default function CustomerLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const parsed = extractTokenAndSubpath(pathname ?? "");
  const showDownloadEntry =
    !!parsed && !HIDDEN_SUBPATH_PREFIXES.some((p) => parsed.subpath === p || parsed.subpath.startsWith(`${p}/`));

  return (
    <SelectionProvider>
      <ReviewProvider>
        <div className="customer-app-shell relative min-h-[100dvh] bg-background text-foreground">
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
            <div className="absolute -left-24 top-[6%] h-72 w-72 rounded-full bg-[#4f7eff]/12 blur-[100px]" />
            <div className="absolute right-[-12%] top-[32%] h-64 w-64 rounded-full bg-violet-500/8 blur-[90px]" />
          </div>
          <div className="relative z-10">{children}</div>
        </div>
        {showDownloadEntry && <OriginalDownloadEntry token={parsed.token} />}
      </ReviewProvider>
    </SelectionProvider>
  );
}
