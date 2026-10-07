/**
 * 프로젝트 화면 본문 골격. 공통 헤더는 레이아웃이 들고 있으므로 바뀌는 본문 자리만 실제 배치를 닮게 채운다 —
 * 전체 화면을 흰색으로 덮는 `SystemLoadingScreen`을 셀프 고객 화면에서는 쓰지 않는다(design-system.md §13.1).
 * - gallery: 고르기 화면(툴바 줄 · 사진 타일 격자 · 하단 바). 모바일 2열 4:3, PC는 180px 이상 정사각 타일.
 * - review: 검토 화면(제목 · 선택 사진 격자).
 * - cards: 완료·보정본 화면(제목 · 카드 틀 둘).
 */
export function ProjectBodySkeleton({ variant, label }: { variant: "gallery" | "review" | "cards"; label: string }) {
  if (variant === "gallery") {
    return (
      <div role="status" aria-label={label} aria-busy="true" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-5 py-3">
          <span className="h-8 w-44 rounded-full skeleton-block" />
          <span className="ml-auto size-8 rounded-lg skeleton-block" />
          <span className="size-8 rounded-lg skeleton-block" />
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-1 p-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-2 md:p-5">
          {Array.from({ length: 12 }, (_, index) => <span key={index} className="aspect-[4/3] rounded-lg skeleton-block md:aspect-square" />)}
        </div>
        <div className="shrink-0 border-t border-border-subtle px-6 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <span className="block h-6 w-48 rounded-md skeleton-block" />
        </div>
      </div>
    );
  }
  return (
    <main role="status" aria-label={label} aria-busy="true" className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 pb-12 pt-7 md:px-8">
      <span className="h-7 w-40 rounded-md skeleton-block" />
      <span className="h-4 w-64 max-w-full rounded-md skeleton-block" />
      {variant === "review"
        ? <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">{Array.from({ length: 10 }, (_, index) => <span key={index} className="aspect-square rounded-lg skeleton-block" />)}</div>
        : [0, 1].map((index) => (
          <div key={index} className="rounded-2xl border border-border-subtle bg-surface p-5">
            <span className="block h-5 w-1/3 rounded-md skeleton-block" />
            <span className="mt-3 block h-4 w-2/3 rounded-md skeleton-block" />
            <span className="mt-6 block h-10 w-40 max-w-full rounded-full skeleton-block" />
          </div>
        ))}
    </main>
  );
}
