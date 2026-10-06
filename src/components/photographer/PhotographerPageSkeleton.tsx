import theme from "@/styles/PhotographerLightTheme.module.css";

/**
 * 작가 화면 본문 골격. 사이드바 셸은 레이아웃이 들고 있으므로 본문 자리에만 라이트 캔버스와 실제 배치를 닮은
 * 골격을 둔다 — 화면 전체를 흰색으로 덮는 `SystemLoadingScreen`은 일반 로딩에 쓰지 않는다(design-system.md §13.1).
 * - page: 제목·설명 + 카드 틀 둘(대시보드·목록·설정 등 문서형 화면). `width="narrow"`는 설정처럼 1120px 화면.
 * - workspace: 화면 높이에 잠근 사진 작업 화면(업로드·자산): 헤더 줄·툴바·사진 타일 격자·하단 바.
 */
export function PhotographerPageSkeleton({ variant = "page", width = "wide", label = "불러오는 중" }: {
  variant?: "page" | "workspace";
  width?: "wide" | "narrow";
  label?: string;
}) {
  if (variant === "workspace") {
    return (
      <div role="status" aria-label={label} aria-busy="true" data-acut-light-canvas className={`${theme.lightTheme} flex h-dvh flex-col overflow-hidden bg-background text-foreground`}>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-5">
          <span className="h-5 w-40 rounded-md skeleton-block" />
          <span className="ml-auto h-9 w-24 rounded-md skeleton-block" />
        </div>
        <div className="flex h-[72px] shrink-0 items-center gap-2 px-5">
          <span className="h-9 w-28 rounded-md skeleton-block" />
          <span className="h-9 w-20 rounded-md skeleton-block" />
          <span className="ml-auto h-9 w-32 rounded-md skeleton-block" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-1.5 px-3 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-2 md:px-5">
          {Array.from({ length: 12 }, (_, index) => <span key={index} className="aspect-square rounded-lg skeleton-block" />)}
        </div>
        <div className="flex h-16 shrink-0 items-center border-t border-border-subtle px-5">
          <span className="h-10 w-40 rounded-md skeleton-block" />
        </div>
      </div>
    );
  }
  return (
    <div data-acut-light-canvas className={`${theme.lightTheme} min-h-screen bg-background text-foreground`}>
      <main role="status" aria-label={label} aria-busy="true" className={`mx-auto w-full px-5 py-8 md:px-8 md:py-10 ${width === "narrow" ? "max-w-[1120px]" : "max-w-[1504px]"}`}>
        <span className="block h-8 w-44 rounded-md skeleton-block" />
        <span className="mt-3 block h-4 w-72 max-w-full rounded-md skeleton-block" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className="rounded-[14px] border border-border-subtle bg-surface p-5">
              <span className="block h-5 w-1/3 rounded-md skeleton-block" />
              <span className="mt-3 block h-4 w-2/3 rounded-md skeleton-block" />
              <span className="mt-6 block h-10 w-36 max-w-full rounded-md skeleton-block" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
