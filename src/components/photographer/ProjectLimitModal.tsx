"use client";

import { useRouter } from "next/navigation";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import type { ProjectLimitInfo } from "@/hooks/useNewProjectGate";

/**
 * Figma #56046 실측 — 활성 프로젝트 한도 도달 모달. 원본 Figma는 헤더 없이 큰 제목(24px)이
 * 본문 맨 위에 오지만, 기존 PhotographerModal 셸(제목+닫기 버튼 헤더)을 그대로 재사용하기로
 * 했으므로(승인) 그 헤더의 title 슬롯에 Figma 제목 문구를 넣고, 본문엔 설명+사용량 카드만 둔다
 * (제목 중복 방지). 무료 체험 미신청자에게만 "베타 참여 신청하기"를 노출하고, 신청 처리 중이거나
 * 이미 베타인 계정에는 현재 상태만 안내한다. 색은 기존 Design System을 유지한다.
 */
export function ProjectLimitModal({
  info,
  onClose,
}: {
  info: ProjectLimitInfo | null;
  onClose: () => void;
}) {
  const router = useRouter();

  const pct = info ? Math.min(100, Math.round((info.current / info.max) * 100)) : 0;
  const desc = info?.tier === "beta"
    ? `베타 기간에는 프로젝트를 최대 ${info.max}개까지 운영할 수 있습니다.`
    : `무료 체험에서는 프로젝트를 최대 ${info?.max}개까지 운영할 수 있습니다.`;
  const canApply = info?.tier === "general"
    && info.betaStatus !== "ended"
    && info.betaStatus !== "suspended"
    && info.betaApplicationStatus === null;
  const statusMessage = info?.betaApplicationStatus === "approved"
    ? "베타 신청이 승인되었습니다. 권한 반영을 기다려 주세요."
    : info?.betaApplicationStatus && info.betaApplicationStatus !== "rejected"
      ? "베타 신청을 검토하고 있습니다. 승인되면 이용 한도가 자동으로 변경됩니다."
      : info?.betaApplicationStatus === "rejected"
        ? "베타 신청 결과는 안내받은 내용을 확인해 주세요."
        : info?.tier === "beta"
          ? "새 프로젝트를 만들려면 완료한 프로젝트를 정리해 주세요."
          : info?.betaStatus === "ended" || info?.betaStatus === "suspended"
            ? "기존 프로젝트는 계속 이용할 수 있습니다."
            : "계속 이용하려면 베타 참여를 신청해 주세요.";

  return (
    <PhotographerModal
      open={!!info}
      onClose={onClose}
      title="활성 프로젝트 한도에 도달했어요"
      description={desc}
      variant="confirmation"
      confirmationDensity="compact"
      maxWidth={420}
      footer={
        <div className="flex gap-2">
          <PhotographerLightButton
            type="button"
            variant={canApply ? "secondary" : "primary"}
            size="confirmation"
            onClick={onClose}
            className="flex-1"
          >
            {canApply ? "취소" : "확인"}
          </PhotographerLightButton>
          {canApply ? (
            <PhotographerLightButton
              type="button"
              variant="primary"
              size="confirmation"
              onClick={() => { onClose(); router.push("/beta/apply"); }}
              className="flex-1"
            >
              베타 참여 신청하기
            </PhotographerLightButton>
          ) : null}
        </div>
      }
    >
      {info && (
        <div className="flex flex-col gap-3">
          {/* 사용량 카드 — Figma 실측: 라벨/분수/프로그레스 바. 색은 Dashboard 사이드바 사용량 카드와
              동일한 규칙 재사용(100% 도달 상태이므로 Danger로 표시). */}
          <div className="flex flex-col gap-2.5 rounded-xl bg-surface-raised p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-foreground">활성 프로젝트</span>
              <span className="text-sm font-bold text-foreground">{info.current} / {info.max}</span>
            </div>
            <div className="w-full h-1.5 bg-border-subtle rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--danger)" }} />
            </div>
          </div>
          <p className="break-keep text-[12px] leading-[18px] text-muted-foreground">
            {statusMessage}
          </p>
        </div>
      )}
    </PhotographerModal>
  );
}
