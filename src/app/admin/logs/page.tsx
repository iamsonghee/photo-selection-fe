import Link from "next/link";
import { getRecentActivityLogsForAdmin, ADMIN_ACTION_LABELS } from "@/lib/admin-db";
import { formatAdminDateTime } from "@/lib/admin-format";

export default async function AdminActivityLogsPage() {
  const logs = await getRecentActivityLogsForAdmin(200);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Activity Logs</h1>
      <p className="mt-1 text-sm text-muted-foreground">전체 작가 대상 최근 활동 {logs.length}건</p>

      <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
        ⚠ v1 검토 / 재보정 / 납품 단계 전이는 현재 로그에 기록되지 않습니다. (
        <code className="text-xs">created / uploaded / selecting / confirmed / editing</code> 5개 액션만 기록됨)
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatAdminDateTime(log.createdAt)}
                </td>
                <td className="px-4 py-3 text-foreground">{log.photographerName}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/projects/${log.projectId}`} className="text-foreground hover:text-primary">
                    {log.projectName}
                  </Link>
                  <span className="ml-1.5 text-xs text-muted-foreground">{log.customerName}</span>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{ADMIN_ACTION_LABELS[log.action]}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  기록된 활동이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
