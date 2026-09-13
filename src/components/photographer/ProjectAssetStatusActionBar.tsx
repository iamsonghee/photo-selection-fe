"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Check, Copy, MessageCircle } from "lucide-react";
import type { Project } from "@/types";
import { normalizeReviewDeadlineYmd } from "@/lib/format-review-deadline";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";

type Props = {
  project: Project;
  fallbackLeading?: ReactNode;
  fallbackMobileLeading?: ReactNode;
  fallbackActions?: ReactNode;
  maxWidth: number;
  className?: string;
  mobileFixed?: boolean;
  compactMobile?: boolean;
  forceFallback?: boolean;
};

function getCustomerStage(project: Project) {
  if (project.status === "selecting") {
    return {
      title: "고객이 사진을 셀렉 중입니다",
      description: "초대 링크를 다시 전달하거나 고객에게 진행을 안내할 수 있습니다.",
      linkLabel: "초대 링크 복사",
      deadline: null,
    };
  }
  if (project.status === "reviewing_v1" || project.status === "reviewing_v2") {
    const isRevision = project.status === "reviewing_v2";
    return {
      title: isRevision ? "고객이 재보정본을 검토 중입니다" : "고객이 보정본을 검토 중입니다",
      description: isRevision ? "고객의 재검토 결과를 기다리고 있습니다." : "고객의 검토 결과를 기다리고 있습니다.",
      linkLabel: "검토 링크 복사",
      deadline: normalizeReviewDeadlineYmd(project.reviewDeadline),
    };
  }
  return null;
}

/**
 * 원본·셀렉·보정본 Asset 화면이 공유하는 프로젝트 상태 및 주요 CTA 영역.
 * 고객 행동을 기다리는 단계는 탭과 무관하게 동일한 상태와 공유 액션을 노출한다.
 */
export function ProjectAssetStatusActionBar({
  project,
  fallbackLeading,
  fallbackMobileLeading,
  fallbackActions,
  maxWidth,
  className = "",
  mobileFixed = false,
  compactMobile = false,
  forceFallback = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const delivered = project.status === "delivered";
  const customerStage = forceFallback ? null : getCustomerStage(project);
  const inviteUrl = useMemo(() => {
    if (!project.accessToken) return "";
    if (typeof window === "undefined") return `/c/${project.accessToken}`;
    return `${window.location.origin}/c/${project.accessToken}`;
  }, [project.accessToken]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!delivered && !customerStage && !fallbackLeading && !fallbackActions) return null;

  const copyInvite = async () => {
    if (!inviteUrl) return;
    const shareText = project.accessPin
      ? `링크: ${inviteUrl}\n비밀번호: ${project.accessPin}`
      : inviteUrl;
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
  };

  return (
    <PhotographerPageActionBar
      maxWidth={maxWidth}
      className={`${delivered ? "max-md:hidden" : ""} ${className}`}
      mobileFixed={delivered ? false : mobileFixed}
      compactMobile={compactMobile}
      mobileLeading={delivered ? undefined : customerStage ? customerStage.title : fallbackMobileLeading}
      leading={delivered ? undefined : customerStage ? (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--customer-background)] text-[var(--customer-foreground)]">
            {customerStage.deadline ? <CalendarDays size={16} /> : <MessageCircle size={16} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <p className="text-[13px] font-semibold text-foreground">{customerStage.title}</p>
              {customerStage.deadline ? (
                <span className="text-[11px] font-medium tabular-nums text-[var(--customer-foreground)]">
                  검토 기한 {customerStage.deadline}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{customerStage.description}</p>
          </div>
        </div>
      ) : fallbackLeading}
      actions={delivered ? (
        <span className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-5 text-[13px] font-semibold text-muted-foreground">
          <Check size={15} aria-hidden />
          납품 완료
        </span>
      ) : customerStage ? (
        <>
          <span className="hidden sm:contents">
            <PhotographerLightButton
              type="button"
              variant="secondary"
              disabled
              title="알림톡 보내기 기능은 준비 중입니다"
              className="min-h-11 px-4"
            >
              <MessageCircle size={15} />
              알림톡 보내기
              <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">준비 중</span>
            </PhotographerLightButton>
          </span>
          <PhotographerLightButton
            type="button"
            onClick={() => void copyInvite()}
            disabled={!inviteUrl}
            variant="primary"
            className="min-h-11 w-full px-5 sm:w-auto"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "복사됨" : customerStage.linkLabel}
          </PhotographerLightButton>
        </>
      ) : fallbackActions}
    />
  );
}
