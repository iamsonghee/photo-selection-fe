import Link from "next/link";
import {
  getAllBetaApplicationsForAdmin,
  BETA_APPLICATION_STATUS_LABELS,
  type BetaApplicationStatus,
} from "@/lib/admin-db";
import { formatAdminDate } from "@/lib/admin-format";
import { formatPhone } from "@/lib/phone";

const STATUS_FILTERS: (BetaApplicationStatus | "all")[] = [
  "all",
  "applied",
  "reviewing",
  "on_hold",
  "approved",
  "rejected",
];

export default async function AdminBetaApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status: statusParam, q: query } = await searchParams;
  const status = (STATUS_FILTERS as string[]).includes(statusParam ?? "") ? statusParam : "all";
  const q = (query ?? "").trim();

  const all = await getAllBetaApplicationsForAdmin();
  const filtered = all.filter((item) => {
    if (status !== "all" && item.status !== status) return false;
    if (q && !item.name.includes(q) && !item.phone.includes(q.replace(/[^0-9]/g, ""))) return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Beta Applications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        베타 신청 {all.length}건 {status !== "all" ? `· ${BETA_APPLICATION_STATUS_LABELS[status as BetaApplicationStatus]} ${filtered.length}건` : ""}
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-center gap-3">
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        >
          <option value="all">상태: 전체</option>
          {STATUS_FILTERS.filter((s) => s !== "all").map((s) => (
            <option key={s} value={s}>
              {BETA_APPLICATION_STATUS_LABELS[s as BetaApplicationStatus]}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="이름 또는 번호 검색"
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-placeholder-foreground"
        />
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised"
        >
          검색
        </button>
        {(status !== "all" || q) && (
          <Link href="/admin/beta-applications" className="text-xs text-muted-foreground hover:text-foreground">
            필터 초기화
          </Link>
        )}
      </form>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-raised text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">휴대폰번호</th>
              <th className="px-4 py-3 font-medium">장르</th>
              <th className="px-4 py-3 font-medium">월평균건수</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">신청일</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/beta-applications/${item.id}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatPhone(item.phone)}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.genre}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.monthlyShootCount}건</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-foreground">
                    {BETA_APPLICATION_STATUS_LABELS[item.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatAdminDate(item.createdAt)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {all.length === 0 ? "아직 접수된 신청이 없습니다." : "조건에 맞는 신청이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
