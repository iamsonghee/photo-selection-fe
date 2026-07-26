import Link from "next/link";
import {
  getAllProjectsForAdmin,
  getPhotographerStatsForAdmin,
  countByStatus,
} from "@/lib/admin-db";
import { getActiveDeadline } from "@/lib/project-deadline";
import { formatAdminDate, ddayFrom } from "@/lib/admin-format";
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
  const [projects, photographerStats] = await Promise.all([
    getAllProjectsForAdmin(),
    getPhotographerStatsForAdmin(),
  ]);

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
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">서비스 전체 현황 요약</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="전체 작가" value={`${photographerStats.total}명`} />
        <StatCard label="이번 주 신규 가입" value={`${photographerStats.newThisWeek}명`} />
        <StatCard label="진행중 프로젝트" value={`${inProgressCount}건`} />
        <StatCard label="마감 임박 / 지연" value={`${upcomingDeadlines.length}건`} />
      </div>

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
          Projects 전체 보기 →
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
