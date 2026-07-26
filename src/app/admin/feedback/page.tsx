import { getAllFeedbackForAdmin, FEEDBACK_CATEGORY_LABELS } from "@/lib/admin-db";
import { formatAdminDateTime } from "@/lib/admin-format";
import { AdminFeedbackStatusControl } from "@/components/admin/AdminFeedbackStatusControl";

export default async function AdminFeedbackPage() {
  const items = await getAllFeedbackForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Feedback</h1>
      <p className="mt-1 text-sm text-muted-foreground">작가가 남긴 버그 제보 · 기능 제안 {items.length}건</p>

      <div className="mt-6 flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    item.category === "bug" ? "bg-danger/20 text-danger" : "bg-primary/20 text-primary"
                  }`}
                >
                  {FEEDBACK_CATEGORY_LABELS[item.category]}
                </span>
                <span className="text-foreground">{item.reporterName}</span>
                {item.projectName && <span className="text-muted-foreground">· {item.projectName}</span>}
                <span className="text-muted-foreground">{formatAdminDateTime(item.createdAt)}</span>
              </div>
              <AdminFeedbackStatusControl id={item.id} status={item.status} />
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{item.message}</p>
            {item.pageUrl && <p className="mt-2 text-xs text-muted-foreground">페이지: {item.pageUrl}</p>}
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
            아직 접수된 피드백이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
