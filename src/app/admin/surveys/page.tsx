import Link from "next/link";
import { getAllSurveyResponsesForAdmin, type AdminSurveyResponseStatus } from "@/lib/admin-db";
import { formatAdminDateTime } from "@/lib/admin-format";
import { SURVEY_TYPE_LABELS, formatSurveyAnswers, IMPLEMENTED_SURVEY_TYPES, type SurveyType } from "@/lib/beta-survey";

const STATUS_LABELS: Record<AdminSurveyResponseStatus, string> = {
  submitted: "제출됨",
  skipped: "건너뜀",
  later: "나중에",
};

const STATUS_FILTERS: (AdminSurveyResponseStatus | "all")[] = ["all", "submitted", "skipped", "later"];
const TYPE_FILTERS: (SurveyType | "all")[] = ["all", ...IMPLEMENTED_SURVEY_TYPES];

export default async function AdminSurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const { status: statusParam, type: typeParam } = await searchParams;
  const status = (STATUS_FILTERS as string[]).includes(statusParam ?? "") ? statusParam : "all";
  const surveyType = (TYPE_FILTERS as string[]).includes(typeParam ?? "") ? typeParam : "all";

  const all = await getAllSurveyResponsesForAdmin();
  const filtered = all.filter((item) => {
    if (status !== "all" && item.status !== status) return false;
    if (surveyType !== "all" && item.surveyType !== surveyType) return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Beta Surveys</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        설문 응답 {all.length}건 {status !== "all" ? `· ${STATUS_LABELS[status as AdminSurveyResponseStatus]} ${filtered.length}건` : ""}
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
              {STATUS_LABELS[s as AdminSurveyResponseStatus]}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={surveyType}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
        >
          <option value="all">설문: 전체</option>
          {TYPE_FILTERS.filter((t) => t !== "all").map((t) => (
            <option key={t} value={t}>
              {SURVEY_TYPE_LABELS[t as SurveyType]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised"
        >
          필터 적용
        </button>
        {(status !== "all" || surveyType !== "all") && (
          <Link href="/admin/surveys" className="text-xs text-muted-foreground hover:text-foreground">
            필터 초기화
          </Link>
        )}
      </form>

      <div className="mt-6 flex flex-col gap-4">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
            {all.length === 0 ? "아직 접수된 설문 응답이 없습니다." : "조건에 맞는 응답이 없습니다."}
          </div>
        )}
        {filtered.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-surface-raised px-2.5 py-1 text-xs font-medium text-foreground">
                  {SURVEY_TYPE_LABELS[item.surveyType]}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    item.status === "submitted"
                      ? "bg-success/10 text-success"
                      : item.status === "skipped"
                        ? "bg-surface-raised text-muted-foreground"
                        : "bg-warning/10 text-warning"
                  }`}
                >
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {item.submittedAt
                  ? `제출 ${formatAdminDateTime(item.submittedAt)}`
                  : item.skippedAt
                    ? `건너뜀 ${formatAdminDateTime(item.skippedAt)}`
                    : `기록 ${formatAdminDateTime(item.createdAt)}`}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">작가</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {item.photographerName}
                  {item.photographerEmail && (
                    <span className="ml-1 text-xs text-muted-foreground">({item.photographerEmail})</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">프로젝트</dt>
                <dd className="mt-1 text-sm text-foreground">{item.projectName ?? "(연결된 프로젝트 없음)"}</dd>
              </div>
            </dl>

            {item.status === "submitted" && (
              <div className="mt-4 rounded-lg border border-border-subtle bg-background p-4">
                <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {formatSurveyAnswers(item.surveyType, item.answers).map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
