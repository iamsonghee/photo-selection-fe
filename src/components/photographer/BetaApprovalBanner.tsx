"use client";

import { Info, CheckCircle2 } from "lucide-react";

export type BetaApplicationStatus = "applied" | "reviewing" | "on_hold" | "approved" | "rejected" | null;

interface BetaApprovalBannerProps {
  /** null이면 quota 조회 전 — 렌더링하지 않음 */
  tier: "admin" | "beta" | "general" | null;
  betaApplicationStatus: BetaApplicationStatus;
  maxProjects: number;
  maxPhotosPerProject: number;
  variant?: "full" | "compact";
}

/**
 * 베타 신청 승인 대기 안내 배너 — 검토중/승인완료(권한 반영 대기) 2단계만 노출한다.
 * beta_status가 active로 전환되어 tier가 "beta"가 되는 순간 자동으로 사라진다(별도 dismiss 없음).
 * rejected/미신청/관리자는 노출하지 않는다. 한도 숫자는 quota API 응답값만 사용(하드코딩 금지).
 */
export function BetaApprovalBanner({
  tier,
  betaApplicationStatus,
  maxProjects,
  maxPhotosPerProject,
  variant = "full",
}: BetaApprovalBannerProps) {
  if (tier !== "general") return null;
  if (betaApplicationStatus === null || betaApplicationStatus === "rejected") return null;

  const isApproved = betaApplicationStatus === "approved";
  const title = isApproved ? "베타 신청이 승인되었습니다" : "베타 신청이 접수되었습니다";
  const body = isApproved
    ? "권한이 적용되면 이용 한도가 자동으로 변경됩니다."
    : `현재 검토 중이며, 승인 전에는 무료 체험(프로젝트 ${maxProjects}개 · 사진 최대 ${maxPhotosPerProject}장)으로 이용할 수 있습니다. 권한이 적용되면 이용 한도가 자동으로 변경됩니다.`;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
        {isApproved ? (
          <CheckCircle2 size={13} className="shrink-0 text-accent" />
        ) : (
          <Info size={13} className="shrink-0 text-accent" />
        )}
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-muted-foreground">— {body}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
      {isApproved ? (
        <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-accent" />
      ) : (
        <Info size={16} className="shrink-0 mt-0.5 text-accent" />
      )}
      <div>
        <div className="text-sm font-bold text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{body}</div>
      </div>
    </div>
  );
}
