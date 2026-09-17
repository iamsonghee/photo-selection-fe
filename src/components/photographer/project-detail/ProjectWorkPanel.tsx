import { useEffect, useState } from "react";
import { PhotographerLightButton } from "../PhotographerLightButton";
import { ChevronRight, Clock, Flag, ListChecks, PenLine, Upload } from "lucide-react";
import type { Project, ProjectStatus } from "@/types";
import { dday, getProjectActor } from "@/lib/project-actor";
import { getActiveDeadline } from "@/lib/project-deadline";
import { formatKstDateTimeDash, toKstShifted } from "@/lib/kst-date";
import { OriginalUploadWarningBadge } from "@/components/photographer/OriginalUploadWarningBadge";

// 고객 화면(src/lib/customer-api-server.ts)의 ORIGINAL_DOWNLOAD_WINDOW_DAYS /
// FINAL_DELIVERY_DOWNLOAD_WINDOW_DAYS와 동일한 30일. 그 파일은 Service Role 클라이언트를 쓰는
// 서버 전용 모듈이라 여기서 import할 수 없어 값만 맞춰 둔다.
const ORIGINAL_RETENTION_DAYS = 30;
const FINAL_DELIVERY_RETENTION_DAYS = 30;

function formatRetentionDeadline(iso: string, days: number): string {
  try {
    const shifted = toKstShifted(iso);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const d = String(shifted.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return "—";
  }
}

type WorkMode =
  | "upload-start"
  | "upload-manage"
  | "selection"
  | "retouch"
  | "review"
  | "complete";

const MOBILE_META_LABELS: Record<string, string> = {
  "업로드된 사진": "업로드",
  "고객 셀렉 목표": "목표",
  "셀렉 마감": "마감",
  "재보정 허용": "재보정",
  "검토 기한": "기한",
  "최종 납품": "납품",
  "최종 보정본 보관 종료": "보관 종료",
  "원본 보관 종료": "원본 보관",
  "원본 전달": "원본",
};

type OriginalUploadProgress = {
  total: number;
  completed: number;
  needsRecovery: number;
};

type Props = {
  project: Project;
  deadlineDisplay: string;
  reviewDeadlineDisplay: string | null;
  onUpload: () => void;
  onRecoverOriginals: () => void;
  onWorkflow: () => void;
  onResults: () => void;
};

type WorkPanelContent = {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ReactNode;
  onClick: () => void;
  meta: Array<{ label: string; value: string; overdue?: string }>;
  /** Figma #56060 "완료 후 30일동안 파일을 보관해요" — complete 모드에서만 노출되는 보관 안내 캡션 */
  note?: string;
};

function getWorkMode(status: ProjectStatus, photoCount: number): WorkMode {
  if (status === "preparing") return photoCount === 0 ? "upload-start" : "upload-manage";
  if (status === "selecting") return "selection";
  if (["confirmed", "editing", "editing_v2"].includes(status)) return "retouch";
  if (["reviewing_v1", "reviewing_v2"].includes(status)) return "review";
  return "complete";
}

/**
 * 프로젝트 상태를 6개 작업 모드로 묶어 표현한다.
 * 상태 값과 기존 라우팅은 바꾸지 않고, 안내 문구·CTA만 이 컴포넌트에서 결정한다.
 */
export function ProjectWorkPanel({
  project,
  deadlineDisplay,
  reviewDeadlineDisplay,
  onUpload,
  onRecoverOriginals,
  onWorkflow,
  onResults,
}: Props) {
  const [originalProgress, setOriginalProgress] = useState<OriginalUploadProgress | null>(null);

  useEffect(() => {
    if (!project.includeOriginal) {
      setOriginalProgress(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch(`/api/photographer/projects/${project.id}/status`);
        if (!response.ok) throw new Error("failed");
        const progress = await response.json() as OriginalUploadProgress;
        if (cancelled) return;
        setOriginalProgress(progress);
        if (progress.completed < progress.total) timer = setTimeout(load, 5000);
      } catch {
        if (!cancelled) timer = setTimeout(load, 10000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [project.id, project.includeOriginal, project.status]);

  const mode = getWorkMode(project.status, project.photoCount);
  const actor = getProjectActor(project.status);
  // Dashboard·Project List와 동일하게, 현재 고객 단계의 실제 기한만 계산한다.
  // 마감 전(D-/D-day)은 별도 강조하지 않고 초과된 D+만 Critical로 표시한다.
  const activeDeadline = actor === "customer" ? getActiveDeadline(project) : null;
  const deadlineResult = activeDeadline ? dday(activeDeadline.date) : null;
  const overdueText = deadlineResult?.text.startsWith("D+") ? deadlineResult.text : undefined;
  const content: WorkPanelContent = (() => {
    switch (mode) {
      case "upload-start":
        return {
          eyebrow: "다음 단계",
          title: "원본 사진을 업로드하세요",
          description: "고객에게 링크를 보내기 전에 셀렉용 사진을 먼저 준비해야 합니다.",
          cta: "사진 업로드 시작",
          icon: <Upload size={20} />,
          onClick: onUpload,
          meta: [
            { label: "업로드된 사진", value: "0장" },
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
          ],
        };
      case "upload-manage":
        return {
          eyebrow: "다음 단계",
          title:
            project.photoCount >= project.requiredCount
              ? "고객 셀렉을 시작할 준비가 되었습니다"
              : "원본 사진을 계속 업로드하세요",
          description:
            project.photoCount >= project.requiredCount
              ? "업로드 화면에서 사진을 더 추가하거나 고객 링크를 활성화할 수 있습니다."
              : `고객 셀렉을 시작하려면 사진을 ${project.requiredCount - project.photoCount}장 이상 더 준비하세요.`,
          cta: "업로드 현황 보기",
          icon: <Upload size={20} />,
          onClick: onUpload,
          meta: [
            { label: "업로드된 사진", value: `${project.photoCount}장` },
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
          ],
        };
      case "selection":
        return {
          eyebrow: "현재 진행",
          title: "고객이 사진을 선택하고 있습니다",
          description: "고객이 최종 선택을 완료하면 셀렉 결과와 코멘트를 확인할 수 있습니다.",
          cta: "원본 사진 보기",
          icon: <ListChecks size={20} />,
          onClick: onUpload,
          meta: [
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
            { label: "셀렉 마감", value: deadlineDisplay, overdue: overdueText },
          ],
        };
      case "retouch":
        return {
          eyebrow: project.status === "confirmed" ? "다음 단계" : "현재 진행",
          title:
            project.status === "confirmed"
              ? "고객 셀렉이 확정되었습니다"
              : project.status === "editing_v2"
              ? "재보정 v2를 진행하세요"
              : "보정본을 준비하고 있습니다",
          description:
            project.status === "confirmed"
              ? "선택된 사진과 고객 코멘트를 확인하고 보정 작업을 시작하세요."
              : project.status === "editing_v2"
              ? "고객 요청 사항을 반영한 재보정본을 준비하세요."
              : "보정이 끝난 사진을 업로드해 고객 검토를 요청하세요.",
          cta: project.status === "confirmed" ? "보정 작업 시작" : "보정 작업 계속하기",
          icon: <PenLine size={20} />,
          onClick: onWorkflow,
          meta: [
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
            { label: "재보정 허용", value: project.maxRevisionCount === 0 ? "없음" : `최대 ${project.maxRevisionCount}회` },
          ],
        };
      case "review":
        return {
          eyebrow: "현재 진행",
          title: project.status === "reviewing_v2" ? "고객이 재보정본을 검토하고 있습니다" : "고객이 보정본을 검토하고 있습니다",
          description: "고객의 검토 결과와 요청 사항은 보정 작업 화면에서 확인할 수 있습니다.",
          cta: "보정본 현황 보기",
          icon: <ListChecks size={20} />,
          onClick: onWorkflow,
          meta: [
            { label: "검토 기한", value: reviewDeadlineDisplay ?? "미설정", overdue: overdueText },
            { label: "재보정 허용", value: project.maxRevisionCount === 0 ? "없음" : `최대 ${project.maxRevisionCount}회` },
          ],
        };
      case "complete": {
        // Figma #56060 "완료" 카드 실측: 완료일(시각 포함) · 최종 납품 · 최종 보정본 보관 종료
        // 3개 행 + 하단 보관 안내 캡션. 원본 포함 프로젝트는 원본 다운로드 기한(고객 화면과 동일
        // 계산식, originalDownloadStartedAt + 30일)을 이어서 안내한다 — Figma 예시 프로젝트는
        // 원본 미포함이라 이 행이 없었지만, 같은 행 패턴을 그대로 확장했다. "최종 보정본"/"원본"
        // 두 보관 기한은 서로 다른 파일의 독립적인 삭제 스케줄이라 라벨을 대칭적으로 구분한다
        // (고객 화면 FinalDeliveryDownloadEntry.tsx의 "최종 보정본" 용어를 그대로 사용).
        const deliveredAtDisplay = project.deliveredAt
          ? (() => {
              try {
                return formatKstDateTimeDash(project.deliveredAt as string);
              } catch {
                return project.deliveredAt as string;
              }
            })()
          : "—";
        const finalRetentionDisplay = project.deliveredAt
          ? formatRetentionDeadline(project.deliveredAt, FINAL_DELIVERY_RETENTION_DAYS)
          : "—";
        const originalRetentionDisplay = project.includeOriginal && project.originalDownloadStartedAt
          ? formatRetentionDeadline(project.originalDownloadStartedAt, ORIGINAL_RETENTION_DAYS)
          : null;

        return {
          eyebrow: "프로젝트 완료",
          title: "사진 납품이 완료되었습니다",
          description: "선택 결과와 고객 코멘트 등 프로젝트 이력을 확인할 수 있습니다.",
          cta: "프로젝트 결과 보기",
          icon: <Flag size={20} />,
          onClick: onResults,
          meta: [
            { label: "완료일", value: deliveredAtDisplay },
            { label: "최종 납품", value: `${project.requiredCount}장` },
            { label: "최종 보정본 보관 종료", value: finalRetentionDisplay },
            ...(originalRetentionDisplay
              ? [{ label: "원본 보관 종료", value: originalRetentionDisplay }]
              : []),
          ],
          note: "완료 후 30일동안 파일을 보관해요",
        };
      }
    }
  })();

  if (originalProgress && originalProgress.total > 0 && originalProgress.completed < originalProgress.total) {
    content.meta.push({
      label: "원본 전달",
      value: originalProgress.needsRecovery > 0
        ? `${originalProgress.needsRecovery}장 확인 필요`
        : `${originalProgress.completed}/${originalProgress.total}장`,
    });
    if (originalProgress.needsRecovery > 0) {
      content.cta = "원본 업로드 복구";
      content.onClick = onRecoverOriginals;
    }
  }

  const isPhotographer = actor === "photographer";
  const isCustomer = actor === "customer";
  const semanticTone = isPhotographer
    ? "text-accent"
    : isCustomer
      ? "text-cyan"
      : "text-muted-foreground";
  const iconTone = isPhotographer
    ? "bg-accent text-white"
    : isCustomer
      ? "bg-cyan text-white"
      : "bg-surface-raised text-muted-foreground";
  const actorLabel = isPhotographer ? "작가 진행 중" : isCustomer ? "고객 진행 중" : "완료";
  const actorBadgeTone = isPhotographer
    ? "bg-accent/8 text-accent"
    : isCustomer
      ? "bg-[var(--customer-soft)] text-cyan"
      : "bg-surface-raised text-muted-foreground";


  return (
    <section
      data-project-work-panel
      data-actor={actor}
      className="flex flex-col rounded-xl border border-border-subtle bg-surface p-4 md:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4 ${iconTone}`}>
            {content.icon}
          </span>
          <p className={`truncate text-[14px] font-bold leading-5 tracking-[-0.35px] ${semanticTone}`}>
            {content.eyebrow}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <OriginalUploadWarningBadge count={originalProgress?.needsRecovery} />
          <span className={`hidden shrink-0 rounded-md px-2 py-1 text-[11px] font-medium leading-4 tracking-[-0.25px] md:inline-flex ${actorBadgeTone}`}>
            {actorLabel}
          </span>
        </div>
      </div>

      <div className="mt-3 md:mt-5">
        <h2 className="text-[20px] font-bold leading-7 tracking-[-0.45px] text-foreground md:text-[24px] md:leading-8 md:tracking-[-0.5px]">
          {content.title}
        </h2>
        <p className="mt-2 hidden text-[14px] font-normal leading-[22px] tracking-[-0.35px] text-muted-foreground md:block">
          {content.description}
        </p>
      </div>

      <p className="mt-2 truncate text-[12px] font-medium leading-5 text-muted-foreground md:hidden">
        {content.meta.map((item) => `${MOBILE_META_LABELS[item.label] ?? item.label} ${item.value}${item.overdue ? ` ${item.overdue}` : ""}`).join(" · ")}
      </p>

      <dl className="mt-5 hidden overflow-hidden rounded-lg bg-surface-raised md:block">
        {content.meta.map((item, index) => (
          <div
            key={item.label}
            className={`flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 ${
              index > 0 ? "border-t border-border-subtle" : ""
            }`}
          >
            <dt className="text-[13px] font-normal leading-5 tracking-[-0.3px] text-muted-foreground">
              {item.label}
            </dt>
            <dd className="flex items-center justify-end gap-2 text-right text-[14px] font-semibold leading-5 tracking-[-0.35px] text-foreground">
              <span>{item.value}</span>
              {item.overdue ? (
                <span
                  title={`${item.label} ${item.overdue}`}
                  className="font-mono text-[12px] font-semibold leading-[18px] tracking-normal text-danger"
                >
                  {item.overdue}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {content.note ? (
        <div className="mt-3 hidden items-center gap-2 rounded-lg bg-surface-raised px-4 py-3 md:flex">
          <Clock size={14} className="shrink-0 text-subtle-foreground" />
          <p className="text-[12px] font-medium leading-4 tracking-[-0.25px] text-muted-foreground">
            {content.note}
          </p>
        </div>
      ) : null}

      <PhotographerLightButton
        size="work-panel"
        variant={isPhotographer ? "primary" : "secondary"}
        onClick={content.onClick}
        className="mt-4 w-full shrink-0 gap-1.5 md:mt-6"
      >
        {content.cta}
        <ChevronRight size={16} />
      </PhotographerLightButton>
    </section>
  );
}
