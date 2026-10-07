export default function AdminLoading() {
  return (
    <div role="status" aria-label="관리자 화면을 불러오는 중" aria-busy="true" className="mx-auto w-full max-w-[1200px]">
      <span className="block h-8 w-48 rounded-md skeleton-block" />
      <span className="mt-3 block h-4 w-64 max-w-full rounded-md skeleton-block" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {[0, 1].map((index) => <div key={index} className="rounded-xl border border-border-subtle bg-surface p-5"><span className="block h-5 w-1/2 rounded-md skeleton-block" /><span className="mt-5 block h-24 rounded-md skeleton-block" /></div>)}
      </div>
    </div>
  );
}
