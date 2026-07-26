import Link from "next/link";
import { getAllPhotographersForAdmin, getPendingBetaInvitations } from "@/lib/admin-db";
import { formatAdminDate, getTierBadge } from "@/lib/admin-format";
import { AdminBetaInvitations } from "@/components/admin/AdminBetaInvitations";

export default async function AdminUsersPage() {
  const [photographers, invitations] = await Promise.all([
    getAllPhotographersForAdmin(),
    getPendingBetaInvitations(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Beta Users</h1>
      <p className="mt-1 text-sm text-muted-foreground">가입 작가 {photographers.length}명</p>

      <div className="mt-6">
        <AdminBetaInvitations invitations={invitations} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-raised text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">이메일</th>
              <th className="px-4 py-3 font-medium">등급</th>
              <th className="px-4 py-3 font-medium">가입일</th>
              <th className="px-4 py-3 font-medium">프로젝트 수</th>
              <th className="px-4 py-3 font-medium">마지막 활동</th>
            </tr>
          </thead>
          <tbody>
            {photographers.map((p) => {
              const badge = getTierBadge(p.effectiveTier, p.betaStatus);
              return (
                <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${p.id}`} className="font-medium text-foreground hover:text-primary">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatAdminDate(p.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.projectCount === 0 ? <span>0 (미사용)</span> : p.projectCount}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.lastActivityAt ? formatAdminDate(p.lastActivityAt) : "—"}
                  </td>
                </tr>
              );
            })}
            {photographers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  가입한 작가가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
