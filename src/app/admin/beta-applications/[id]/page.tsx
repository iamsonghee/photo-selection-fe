import Link from "next/link";
import { notFound } from "next/navigation";
import { getBetaApplicationForAdmin } from "@/lib/admin-db";
import { formatAdminDateTime } from "@/lib/admin-format";
import { formatPhone } from "@/lib/phone";
import { AdminBetaApplicationControl } from "@/components/admin/AdminBetaApplicationControl";
import {
  genreLabel,
  monthlyProjectLabel,
  avgPhotosLabel,
  workflowLabel,
  desiredFeatureLabel,
  painPointLabel,
} from "@/lib/beta-application";

export default async function AdminBetaApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await getBetaApplicationForAdmin(id);
  if (!application) notFound();

  return (
    <div>
      <Link href="/admin/beta-applications" className="text-xs text-muted-foreground hover:text-foreground">
        ← Beta Applications 목록으로
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-foreground">신청자 상세 — {application.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        신청일 {formatAdminDateTime(application.createdAt)}
      </p>

      {application.matchedPhotographerId && (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">
          이미 가입된 계정과 매칭됨 —{" "}
          <Link href={`/admin/users/${application.matchedPhotographerId}`} className="underline">
            {application.matchedPhotographerName ?? "계정 상세 보기"}
          </Link>
          {application.matchedPhotographerBetaStatus === "active" && " (베타 참여중)"}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">휴대폰</dt>
            <dd className="mt-1 text-sm text-foreground">{formatPhone(application.phone)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">이메일</dt>
            <dd className="mt-1 text-sm text-foreground">{application.email ?? "(없음)"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">촬영 장르</dt>
            <dd className="mt-1 text-sm text-foreground">{application.genre}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">월평균 촬영 건수</dt>
            <dd className="mt-1 text-sm text-foreground">{application.monthlyShootCount}건</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">촬영당 평균 전달 사진 수</dt>
            <dd className="mt-1 text-sm text-foreground">{application.avgPhotosPerProject}장</dd>
          </div>
        </dl>

        <div className="mt-4">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">현재 전달 방식</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{application.currentWorkflow}</dd>
        </div>
        <div className="mt-4">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">A-CUT에 기대하는 점</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{application.reason ?? "(입력 안 함)"}</dd>
        </div>
      </div>

      <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        선택형 응답
      </h3>
      <div className="mt-3 rounded-xl border border-border bg-surface p-5">
        {application.additionalAnswers ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">주 촬영 분야</dt>
              <dd className="mt-1 text-sm text-foreground">
                {application.additionalAnswers.genres.map(genreLabel).join(", ")}
                {application.additionalAnswers.genres.includes("other") &&
                  application.additionalAnswers.genre_other &&
                  ` (기타: ${application.additionalAnswers.genre_other})`}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">현재 고객 셀렉 방식</dt>
              <dd className="mt-1 text-sm text-foreground">
                {application.additionalAnswers.workflow_methods.map(workflowLabel).join(", ")}
                {application.additionalAnswers.workflow_methods.includes("other") &&
                  application.additionalAnswers.workflow_other &&
                  ` (기타: ${application.additionalAnswers.workflow_other})`}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">월평균 촬영 수</dt>
              <dd className="mt-1 text-sm text-foreground">
                {monthlyProjectLabel(application.additionalAnswers.monthly_project_range)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">촬영당 평균 사진 수</dt>
              <dd className="mt-1 text-sm text-foreground">
                {avgPhotosLabel(application.additionalAnswers.avg_photos_range)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">베타에서 사용해보고 싶은 기능</dt>
              <dd className="mt-1 text-sm text-foreground">
                {application.additionalAnswers.desired_features.map(desiredFeatureLabel).join(", ")}
                {application.additionalAnswers.desired_features.includes("other") &&
                  application.additionalAnswers.desired_features_other &&
                  ` (기타: ${application.additionalAnswers.desired_features_other})`}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">가장 불편한 단계</dt>
              <dd className="mt-1 text-sm text-foreground">
                {application.additionalAnswers.pain_point
                  ? painPointLabel(application.additionalAnswers.pain_point)
                  : "(선택 안 함)"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">미입력(구버전 신청)</p>
        )}
      </div>

      {application.matchedPhotographerId && (
        <>
          <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            사용 현황
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">첫 로그인</dt>
              <dd className="mt-1 text-sm text-foreground">
                {application.firstLoginAt ? formatAdminDateTime(application.firstLoginAt) : "아직 없음"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">생성한 프로젝트</dt>
              <dd className="mt-1 text-sm text-foreground">{application.projectCount}개</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">고객이 접속한 프로젝트</dt>
              <dd className="mt-1 text-sm text-foreground">{application.customerLinkVisitedCount}개</dd>
            </div>
          </div>
        </>
      )}

      <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        심사 처리
      </h3>
      <div className="mt-3 rounded-xl border border-border bg-surface p-5">
        <AdminBetaApplicationControl
          id={application.id}
          initialStatus={application.status}
          initialAdminNote={application.adminNote}
          initialContacted={application.contacted}
          matchedPhotographerId={application.matchedPhotographerId}
          matchedPhotographerBetaStatus={application.matchedPhotographerBetaStatus}
        />
      </div>
    </div>
  );
}
