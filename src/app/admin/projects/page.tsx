import Link from "next/link";
import { getAllProjectsForAdmin } from "@/lib/admin-db";
import { getActiveDeadline } from "@/lib/project-deadline";
import { formatAdminDate, ddayFrom } from "@/lib/admin-format";
import { StatusPill } from "@/components/ui/StatusPill";

export default async function AdminProjectsPage() {
  const projects = await getAllProjectsForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        전체 작가의 프로젝트 {projects.length}건 (최근 업데이트순)
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-raised text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">프로젝트</th>
              <th className="px-4 py-3 font-medium">작가</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">사진 / 셀렉</th>
              <th className="px-4 py-3 font-medium">기한</th>
              <th className="px-4 py-3 font-medium">생성일</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const deadline = getActiveDeadline(project);
              const dday = deadline ? ddayFrom(deadline.date) : null;
              return (
                <tr key={project.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                  <td className="px-4 py-3">
                    <Link href={`/admin/projects/${project.id}`} className="font-medium text-foreground hover:text-primary">
                      {project.name}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted-foreground">{project.customerName}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="text-foreground">{project.photographerName}</div>
                    <div className="text-xs">{project.photographerEmail ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={project.status} photoCount={project.photoCount} requiredCount={project.requiredCount} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {project.photoCount} / {project.requiredCount}
                  </td>
                  <td className="px-4 py-3">
                    {deadline && dday ? (
                      <span
                        className={
                          dday.level === "danger"
                            ? "text-danger"
                            : dday.level === "warn"
                              ? "text-warning"
                              : "text-muted-foreground"
                        }
                      >
                        {dday.text}
                        <span className="ml-1 text-xs text-muted-foreground">({deadline.label})</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatAdminDate(project.createdAt)}</td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  아직 생성된 프로젝트가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
