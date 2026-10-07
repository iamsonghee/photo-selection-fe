export default function BetaApplyLoading() {
  return <div data-acut-light-canvas role="status" aria-label="베타 신청 화면을 불러오는 중" aria-busy="true" className="mx-auto w-full max-w-[640px] px-5 py-10">
    <span className="block h-8 w-48 rounded-md skeleton-block" />
    <span className="mt-3 block h-4 w-64 max-w-full rounded-md skeleton-block" />
    <span className="mt-8 block h-64 rounded-xl skeleton-block" />
  </div>;
}
