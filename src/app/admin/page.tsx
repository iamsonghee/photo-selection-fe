import Link from "next/link";
import {
  getAllProjectsForAdmin,
  getPhotographerStatsForAdmin,
  getUploadHealthForAdmin,
  countByStatus,
} from "@/lib/admin-db";
import { getActiveDeadline } from "@/lib/project-deadline";
import { formatAdminDate, formatAdminDateTime, ddayFrom } from "@/lib/admin-format";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/project-status";
import { StatusPill } from "@/components/ui/StatusPill";

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [projects, photographerStats, uploadHealth] = await Promise.all([
    getAllProjectsForAdmin(),
    getPhotographerStatsForAdmin(),
    getUploadHealthForAdmin(),
  ]);
  const uploadIssueCount = uploadHealth.stuckOriginals.length + uploadHealth.failedSessions.length;

  const statusCounts = countByStatus(projects);
  const inProgressCount = projects.length - statusCounts.delivered;

  const upcomingDeadlines = projects
    .map((project) => {
      const deadline = getActiveDeadline(project);
      if (!deadline) return null;
      const dday = ddayFrom(deadline.date);
      return { project, deadline, dday };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null && item.dday.level !== "ok")
    .sort((a, b) => new Date(a.deadline.date).getTime() - new Date(b.deadline.date).getTime());

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">대시보드</h1>
      <p className="mt-1 text-sm text-muted-foreground">서비스 전체 현황 요약</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="전체 작가" value={`${photographerStats.total}명`} />
        <StatCard label="이번 주 신규 가입" value={`${photographerStats.newThisWeek}명`} />
        <StatCard label="진행중 프로젝트" value={`${inProgressCount}건`} />
        <StatCard label="마감 임박 / 지연" value={`${upcomingDeadlines.length}건`} />
      </div>

      <section className="mt-10" aria-labelledby="upload-health-title">
        <h3 id="upload-health-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          업로드 이상 {uploadIssueCount > 0 ? <span className="ml-1 text-danger">{uploadIssueCount}건</span> : null}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          원본이 1시간 넘게 저장 확인되지 않은 프로젝트(최근 30일)와 실패가 있던 업로드(최근 7일)예요. 내부 계정
          {uploadHealth.excludedInternal > 0 ? ` ${uploadHealth.excludedInternal}건은` : "은"} 빼고 보여요.
        </p>
        {uploadIssueCount === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
            업로드 이상이 없습니다.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <tbody>
                {uploadHealth.stuckOriginals.map((item) => (
                  <tr key={item.projectId} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="px-4 py-3">
                      <Link href={`/admin/projects/${item.projectId}`} className="font-medium text-foreground hover:text-primary">
                        {item.projectName}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">{item.photographerName}</div>
                    </td>
                    <td className="px-4 py-3 text-danger">원본 미확인 {item.count}장</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">가장 오래된 사진 {formatAdminDateTime(item.oldestUploadedAt)}</td>
                  </tr>
                ))}
                {uploadHealth.failedSessions.map((session) => (
                  <tr key={`${session.createdAt}-${session.photographerName}`} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{session.photographerName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {session.device === "mobile" ? "모바일" : "PC"} · {session.includesOriginal ? "원본 포함" : "원본 미포함"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-danger">
                      {session.fileCount}장 중 {session.failedCount}장 실패
                      {session.retryCount > 0 ? <span className="ml-2 text-xs text-muted-foreground">재시도 {session.retryCount}회</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">업로드 {formatAdminDateTime(session.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h3 className="mt-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        상태 분포
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {PROJECT_STATUSES.map((status) => (
          <div
            key={status}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">{PROJECT_STATUS_LABELS[status]}</span>
            <span className="font-semibold text-foreground">{statusCounts[status]}</span>
          </div>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          마감 임박 / 지연 프로젝트
        </h3>
        <Link href="/admin/projects" className="text-xs text-primary hover:underline">
          전체 프로젝트 보기 →
        </Link>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <tbody>
            {upcomingDeadlines.map(({ project, deadline, dday }) => (
              <tr key={project.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="px-4 py-3">
                  <Link href={`/admin/projects/${project.id}`} className="font-medium text-foreground hover:text-primary">
                    {project.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted-foreground">{project.photographerName}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={project.status} photoCount={project.photoCount} requiredCount={project.requiredCount} />
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={dday.level === "danger" ? "text-danger" : "text-warning"}>{dday.text}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {deadline.label} {formatAdminDate(deadline.date)}
                  </span>
                </td>
              </tr>
            ))}
            {upcomingDeadlines.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground">
                  임박하거나 지연된 기한이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
