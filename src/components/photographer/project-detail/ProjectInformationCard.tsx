import { MoreHorizontal, PenLine, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Project } from "@/types";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";
import { StatusPill } from "@/components/ui/StatusPill";
import { FieldInfoTip } from "@/components/ui/FieldInfoTip";

const MONO_FONT = "var(--font-mono, monospace)";

function getInitial(name: string): string {
  return name.trim().charAt(0);
}

function FieldLabel({
  label,
  required,
  optional,
  info,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  info?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {info && <FieldInfoTip text={info} />}
      {required && <span className="text-[10px] font-medium text-accent">필수</span>}
      {optional && <span className="text-[10px] text-disabled-foreground">선택</span>}
    </div>
  );
}

function MetaItem({
  label,
  required,
  optional,
  info,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  info?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} optional={optional} info={info} />
      <div className="text-base text-foreground">{children}</div>
    </div>
  );
}

type Props = {
  project: Project;
  shootDisplay: string;
  deadlineDisplay: string;
  reviewDeadlineDisplay: string | null;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * 상태와 관계없이 동일하게 노출되는 프로젝트 설정의 단일 표시 컴포넌트.
 * 편집 모달에서 수정할 수 있는 모든 프로젝트 설정을 이 카드에서도 확인할 수 있다.
 */
export function ProjectInformationCard({
  project,
  shootDisplay,
  deadlineDisplay,
  reviewDeadlineDisplay,
  onEdit,
  onDelete,
}: Props) {
  const photoCount = project.photoCount;
  const requiredCount = project.requiredCount;
  const shootType = SHOOT_TYPES.find((type) => type.value === project.shootType);
  const ShootTypeIcon = shootType?.icon;

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-5 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded border border-border-subtle bg-background px-1.5 py-0.5 text-[11px] text-subtle-foreground"
              style={{ fontFamily: MONO_FONT }}
            >
              {project.displayId ?? project.id.slice(0, 12).toUpperCase()}
            </span>
            <StatusPill status={project.status} photoCount={photoCount} requiredCount={requiredCount} />
          </div>
          <p className="text-xs font-semibold text-muted-foreground">프로젝트 상세 정보</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {project.name}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-border-strong"
          >
            <PenLine size={12} /> 정보 수정
          </button>
          <details className="group relative">
            <summary
              aria-label="프로젝트 더보기"
              className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-lg bg-surface-raised text-subtle-foreground transition-colors hover:bg-border-strong hover:text-foreground [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal size={16} />
            </summary>
            <div
              role="menu"
              className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-border-subtle bg-surface p-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={onDelete}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/10"
              >
                <Trash2 size={13} /> 프로젝트 삭제
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <MetaItem label="고객 이름" required info="고객 화면·알림에 표시">
          <span className="inline-flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-[10px] font-bold text-foreground">
              {getInitial(project.customerName || "?")}
            </span>
            <span>{project.customerName || "—"}</span>
          </span>
        </MetaItem>

        <MetaItem label="촬영 일자" required info="실제 촬영일">
          <span style={{ fontFamily: MONO_FONT }}>{shootDisplay}</span>
        </MetaItem>

        <MetaItem label="셀렉 기한" required info="고객 셀렉 마감일">
          <span style={{ fontFamily: MONO_FONT }}>{deadlineDisplay}</span>
        </MetaItem>

        <MetaItem label="촬영 유형" optional info="목록 분류용 (웨딩, 가족 등)">
          {shootType ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/8 px-3 py-1.5 text-sm font-medium text-accent">
              {ShootTypeIcon && <ShootTypeIcon size={13} />}
              {shootType.label}
            </span>
          ) : (
            <span className="text-sm text-disabled-foreground">—</span>
          )}
        </MetaItem>

        <MetaItem label="연락처" optional info="알림 발송용 (선택)">
          <span style={{ fontFamily: MONO_FONT }}>{project.customerPhone?.trim() || "—"}</span>
        </MetaItem>

        <MetaItem label="셀렉 갯수 (N)" required info="고객이 고를 최종 장수">
          <span>
            <span className="text-2xl font-bold leading-none text-accent" style={{ fontFamily: MONO_FONT }}>
              {requiredCount}
            </span>
            <span className="ml-1.5 text-sm text-subtle-foreground">장</span>
          </span>
        </MetaItem>

        <MetaItem label="업로드 사진 수" info="업로드된 셀렉용 사진 수">
          <span>
            <span className="text-2xl font-bold leading-none text-foreground" style={{ fontFamily: MONO_FONT }}>
              {photoCount}
            </span>
            <span className="ml-1.5 text-sm text-subtle-foreground">장</span>
          </span>
        </MetaItem>

        <MetaItem label="재보정 허용 횟수" info="검토 후 재보정 허용">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold ${
              project.maxRevisionCount > 0
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-surface-raised bg-border-subtle text-subtle-foreground"
            }`}
          >
            {project.maxRevisionCount === 0 ? "재보정 없음" : `최대 ${project.maxRevisionCount}회`}
          </span>
        </MetaItem>

        <MetaItem label="납품 파일" info="업로드 후에는 변경할 수 없음">
          <span className="text-sm">{project.includeOriginal ? "원본 포함" : "원본 없이"}</span>
        </MetaItem>

        {reviewDeadlineDisplay && (
          <MetaItem label="검토 기한" info="보정본 검토 마감일">
            <span style={{ fontFamily: MONO_FONT }}>{reviewDeadlineDisplay}</span>
          </MetaItem>
        )}
      </div>
    </section>
  );
}
