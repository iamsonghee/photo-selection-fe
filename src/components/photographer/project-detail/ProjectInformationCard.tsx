"use client";

import { MapPin, MoreHorizontal, PenLine, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Project } from "@/types";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";

function getInitial(name: string): string {
  return name.trim().charAt(0);
}

type Props = {
  project: Project;
  shootDisplay: string;
  reviewDeadlineDisplay: string | null;
  onEdit: () => void;
  onDelete: () => void;
  children?: ReactNode;
};

/**
 * 상태와 관계없이 동일하게 노출되는 프로젝트 설정의 단일 표시 컴포넌트.
 * 편집 모달에서 수정할 수 있는 모든 프로젝트 설정을 이 카드에서도 확인할 수 있다.
 */
export function ProjectInformationCard({
  project,
  shootDisplay,
  reviewDeadlineDisplay,
  onEdit,
  onDelete,
  children,
}: Props) {
  const photoCount = project.photoCount;
  const requiredCount = project.requiredCount;
  const shootType = SHOOT_TYPES.find((type) => type.value === project.shootType);
  const mobileGallerySummary = `셀렉 ${requiredCount}장 · ${project.includeOriginal ? "원본 포함" : "원본 미포함"}`;
  const mobileRevisionSummary = project.maxRevisionCount === 0 ? "재수정 없음" : `재수정 ${project.maxRevisionCount}회`;

  return (
    <section data-project-information-card className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <div className="flex items-center gap-2 px-4 py-3 md:hidden">
        <h2 className="min-w-0 flex-1 text-[14px] font-bold leading-5 text-foreground">
          프로젝트 정보
        </h2>
        <details className="group relative">
          <summary
            aria-label="프로젝트 더보기"
            className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg bg-transparent text-muted-foreground transition-colors active:bg-surface-raised [&::-webkit-details-marker]:hidden"
          >
            <MoreHorizontal size={16} />
          </summary>
          <div role="menu" className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-border-subtle bg-surface p-1 shadow-lg">
            <button
              type="button"
              role="menuitem"
              onClick={onDelete}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-semibold text-danger"
            >
              <Trash2 size={13} /> 삭제하기
            </button>
          </div>
        </details>
      </div>

      <div className="hidden flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 md:flex md:px-6">
        <h2 className="text-[18px] font-bold leading-6 tracking-[-0.4px] text-foreground">
          프로젝트 설정
        </h2>
        <details className="group relative">
          <summary
            aria-label="프로젝트 더보기"
            className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg bg-surface-raised text-subtle-foreground transition-colors hover:bg-border-strong hover:text-foreground [&::-webkit-details-marker]:hidden"
          >
            <MoreHorizontal size={16} />
          </summary>
          <div role="menu" className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-border-subtle bg-surface p-1 shadow-lg">
            <button
              type="button"
              role="menuitem"
              onClick={onEdit}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-semibold text-foreground transition-colors hover:bg-surface-raised"
            >
              <PenLine size={13} /> 수정하기
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={onDelete}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-semibold text-danger transition-colors hover:bg-danger/8"
            >
              <Trash2 size={13} /> 삭제하기
            </button>
          </div>
        </details>
      </div>

      <div>
      <div data-project-mobile-information-summary className="px-4 pb-4 pt-1 md:hidden">
        <dl
          className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg px-4 py-3"
          style={{ background: "color-mix(in srgb, var(--surface-raised) 52%, var(--surface))" }}
        >
          <div>
            <dt className="text-[11px] font-medium text-muted-foreground">고객</dt>
            <dd className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{project.customerName}</dd>
          </div>
          {project.location?.trim() ? (
            <div>
              <dt className="text-[11px] font-medium text-muted-foreground">촬영 장소</dt>
              <dd data-project-location className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{project.location}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[11px] font-medium text-muted-foreground">갤러리</dt>
            <dd className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{mobileGallerySummary}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-muted-foreground">수정</dt>
            <dd className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{mobileRevisionSummary}</dd>
          </div>
          {project.customerPhone?.trim() ? (
            <div>
              <dt className="text-[11px] font-medium text-muted-foreground">연락처</dt>
              <dd className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{project.customerPhone}</dd>
            </div>
          ) : null}
          {reviewDeadlineDisplay ? (
            <div>
              <dt className="text-[11px] font-medium text-muted-foreground">검토 기한</dt>
              <dd className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{reviewDeadlineDisplay}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* 촬영일과 설정을 같은 크기의 정보 행으로 표시해 현재 작업보다 강조되지 않게 한다. */}
      <div className="hidden px-5 py-5 md:block">
        <div className="flex items-center gap-3 pb-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--customer-soft)] text-sm font-semibold text-cyan">{getInitial(project.customerName || "?")}</span>
          <div className="min-w-0">
            <p className="break-words text-[15px] font-semibold">{project.customerName || "고객 미등록"}</p>
            {project.customerPhone && <p data-project-customer-phone className="mt-1 text-xs text-muted-foreground">{project.customerPhone}</p>}
          </div>
        </div>
        <dl className="space-y-4 border-t border-border-subtle pt-5 text-[13px]">
          <div className="flex justify-between gap-4"><dt className="shrink-0 text-muted-foreground">촬영일</dt><dd data-project-shoot-date>{shootDisplay}</dd></div>
          {project.location && <div className="flex justify-between gap-4"><dt className="shrink-0 text-muted-foreground">촬영 장소</dt><dd data-project-location className="flex min-w-0 items-start gap-1 text-right [overflow-wrap:anywhere]"><MapPin size={14} className="mt-0.5 shrink-0 text-muted-foreground"/>{project.location}</dd></div>}
          {shootType && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">촬영 유형</dt><dd>{shootType.label}</dd></div>}
          {reviewDeadlineDisplay && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">검토 기한</dt><dd data-project-review-deadline>{reviewDeadlineDisplay}</dd></div>}
        </dl>
        <h3 className="mb-4 mt-6 border-t border-border-subtle pt-5 text-xs font-semibold text-muted-foreground">고객 갤러리 설정</h3>
        <dl data-project-gallery-summary className="space-y-4 text-[13px]">
          {[
            { label: "셀렉 목표", value: `${requiredCount}장` },
            { label: "업로드 사진", value: `${photoCount}장` },
            { label: "재수정 요청", value: project.maxRevisionCount === 0 ? "허용 안함" : `${project.maxRevisionCount}회` },
            { label: "납품 파일", value: project.includeOriginal ? "원본 포함" : "원본 미포함" },
          ].map(item => <div key={item.label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{item.label}</dt><dd className="font-medium">{item.value}</dd></div>)}
        </dl>
      </div>

      {children ? (
        <div className="bg-surface px-4 py-4 md:border-t md:border-border-subtle md:px-6 md:py-6">
          {children}
        </div>
      ) : null}
      </div>
    </section>
  );
}
