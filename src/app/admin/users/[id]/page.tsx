import Link from "next/link";
import { notFound } from "next/navigation";
import { getPhotographerForAdmin, getAuditLogsForPhotographer, AUDIT_ACTION_LABELS } from "@/lib/admin-db";
import { formatAdminDate, formatAdminDateTime, getTierBadge } from "@/lib/admin-format";
import { getPolicyForPhotographer } from "@/lib/beta-policy";
import { getAppSettings } from "@/lib/app-settings";
import { StatusPill } from "@/components/ui/StatusPill";
import { AdminBetaControl } from "@/components/admin/AdminBetaControl";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [photographer, auditLogs, settings] = await Promise.all([
    getPhotographerForAdmin(id),
    getAuditLogsForPhotographer(id),
    getAppSettings(),
  ]);
  if (!photographer) notFound();

  const badge = getTierBadge(photographer.effectiveTier, photographer.betaStatus);
  const policy = getPolicyForPhotographer(
    {
      email: photographer.email,
      betaStatus: photographer.betaStatus,
      betaEndDate: photographer.betaEndDate,
    },
    settings
  );
  const usageCurrent = policy.tier === "beta" ? photographer.projectCount : photographer.totalProjectsCreated;

  return (
    <div>
      <Link href="/admin/users" className="text-xs text-muted-foreground hover:text-foreground">
        ← Beta Users 목록으로
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{photographer.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {photographer.email ?? "이메일 없음"} · 가입일 {formatAdminDate(photographer.createdAt)}
        {photographer.lastActivityAt ? ` · 최근 활동 ${formatAdminDate(photographer.lastActivityAt)}` : ""}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        현재 보유 {photographer.projectCount}개 · 누적 생성 {photographer.totalProjectsCreated}개 · 허용 한도{" "}
        {policy.maxProjects === null ? "무제한" : `${usageCurrent}/${policy.maxProjects}개`}
      </p>

      <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        베타 관리
      </h3>
      <div className="mt-3 rounded-xl border border-border bg-surface p-5">
        <AdminBetaControl
          photographerId={photographer.id}
          initialBetaStatus={photographer.betaStatus}
          initialBetaStartDate={photographer.betaStartDate}
          initialBetaEndDate={photographer.betaEndDate}
          initialAdminNote={photographer.adminNote}
        />
      </div>

      <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        프로젝트 ({photographer.projectCount})
      </h3>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <tbody>
            {photographer.projects.map((project) => (
              <tr key={project.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="px-4 py-3">
                  <Link href={`/admin/projects/${project.id}`} className="font-medium text-foreground hover:text-primary">
                    {project.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted-foreground">{project.customerName}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={project.status} photoCount={project.photoCount} requiredCount={project.requiredCount} />
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{project.photoCount}장</td>
              </tr>
            ))}
            {photographer.projects.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground">아직 생성한 프로젝트가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        관리 이력
      </h3>
      <div className="mt-3 rounded-xl border border-border bg-surface p-4">
        {auditLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">기록된 관리 이력이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {auditLogs.map((log) => (
              <li key={log.id} className="flex items-center gap-3">
                <span className="w-36 flex-shrink-0 text-xs text-muted-foreground">
                  {formatAdminDateTime(log.createdAt)}
                </span>
                <span className="text-foreground">{AUDIT_ACTION_LABELS[log.action]}</span>
                <span className="text-xs text-muted-foreground">({log.actor === "admin" ? "관리자" : "시스템"})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
