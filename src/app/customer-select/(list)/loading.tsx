import { CustomerSelectShell } from "../_lib/CustomerSelectShell";

/**
 * 내 프로젝트 목록의 라우트 로딩(새로고침·직접 진입): 화면 전체를 흰색으로 덮는 대신 같은 라이트 캔버스와
 * 헤더를 먼저 그리고 본문 제목 자리만 골격으로 둔다(design-system.md §13.1).
 * `(list)` 라우트 그룹에 둔 이유: `customer-select/loading.tsx`에 두면 `[projectId]`·`new`·`login`까지 덮어,
 * 목록 → 프로젝트 화면 이동 중에 목록 셸 골격이 끼어들어 헤더가 두 번 바뀐다. 프로젝트 화면은 레이아웃이 자체 Suspense로 처리한다.
 */
export default function CustomerSelectLoading() {
  return (
    <CustomerSelectShell>
      <main role="status" aria-label="불러오는 중" aria-busy="true" className="mx-auto w-full max-w-[1504px] px-5 pt-8 md:px-8 md:pt-12">
        <span className="block h-4 w-32 rounded-md skeleton-block" />
        <span className="mt-3 block h-9 w-48 rounded-md skeleton-block" />
      </main>
    </CustomerSelectShell>
  );
}
