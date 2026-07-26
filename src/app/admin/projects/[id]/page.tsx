import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectForAdmin, getActivityLogsForProject, ADMIN_ACTION_LABELS } from "@/lib/admin-db";
import { getActiveDeadline } from "@/lib/project-deadline";
import { formatAdminDate, formatAdminDateTime, ddayFrom } from "@/lib/admin-format";
import { getStatusLabel } from "@/lib/project-status";
import { StatusPill } from "@/components/ui/StatusPill";
import { AdminPinControl } from "@/components/admin/AdminPinControl";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectForAdmin(id);
  if (!project) notFound();

  const logs = await getActivityLogsForProject(id);

  const deadline = getActiveDeadline(project);
  const dday = deadline ? ddayFrom(deadline.date) : null;
  const customerLink = `/c/${project.accessToken}`;

  return (
    <div>
      <Link href="/admin/projects" className="text-xs text-muted-foreground hover:text-foreground">
        ← Projects 목록으로
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{project.name}</h1>
        <StatusPill status={project.status} photoCount={project.photoCount} requiredCount={project.requiredCount} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        고객 {project.customerName} · 작가 {project.photographerName}
        {project.photographerEmail ? ` (${project.photographerEmail})` : ""}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 rounded-xl border border-border bg-surface p-6 sm:grid-cols-3">
        <Field label="상태" value={getStatusLabel(project.status)} />
        <Field label="사진 / 필요 선택" value={`${project.photoCount} / ${project.requiredCount}`} />
        <Field
          label={deadline ? deadline.label : "기한"}
          value={
            deadline && dday ? (
              <span
                className={
                  dday.level === "danger" ? "text-danger" : dday.level === "warn" ? "text-warning" : "text-foreground"
                }
              >
                {formatAdminDate(deadline.date)} ({dday.text})
              </span>
            ) : (
              "—"
            )
          }
        />
        <Field label="촬영일" value={formatAdminDate(project.shootDate)} />
        <Field label="재보정 허용 / 진행 라운드" value={`${project.maxRevisionCount}회 / ${project.revisionRound}회`} />
        <Field label="확정 취소 횟수" value={project.customerCancelCount ?? 0} />
        <Field
          label="PIN"
          value={<AdminPinControl key={project.accessPin ?? "none"} projectId={project.id} initialPin={project.accessPin ?? null} />}
        />
        <Field
          label="고객 링크"
          value={
            <a href={customerLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {customerLink}
            </a>
          }
        />
        <Field label="원본 포함 납품" value={project.includeOriginal ? "예" : "아니오"} />
        <Field label="생성일" value={formatAdminDateTime(project.createdAt)} />
        <Field label="최근 업데이트" value={formatAdminDateTime(project.updatedAt)} />
        <Field label="확정일" value={project.confirmedAt ? formatAdminDateTime(project.confirmedAt) : "—"} />
        <Field label="납품일" value={project.deliveredAt ? formatAdminDateTime(project.deliveredAt) : "—"} />
      </div>

      <h3 className="mt-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        활동 로그
      </h3>
      <div className="mt-3 rounded-xl border border-border bg-surface p-4">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">기록된 활동이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center gap-3">
                <span className="w-36 flex-shrink-0 text-xs text-muted-foreground">
                  {formatAdminDateTime(log.createdAt)}
                </span>
                <span className="text-foreground">{ADMIN_ACTION_LABELS[log.action]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
