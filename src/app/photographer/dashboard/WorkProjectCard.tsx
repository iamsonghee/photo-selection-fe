"use client";

import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { dday, getCurrentActionLabel, getProjectActor, getWorkMetric } from "@/lib/project-actor";
import { getActiveDeadline } from "@/lib/project-deadline";
import { ProjectIdText } from "@/components/photographer/ProjectIdText";

export function WorkProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const metric = getWorkMetric(project);
  const actor = getProjectActor(project.status);
  // 카드의 D-day는 촬영일/프로젝트 생성일 경과가 아니라 현재 고객 단계의 기한만 표시한다.
  // preparing의 deadline은 이후 셀렉 단계 기한이므로 업로드 중인 현재 카드에는 노출하지 않는다.
  const activeDeadline = actor === "customer" ? getActiveDeadline(project) : null;
  const deadline = activeDeadline ? dday(activeDeadline.date) : null;
  const overdueDeadline = deadline?.text.startsWith("D+") ? deadline : null;
  const actorLabel = actor === "photographer" ? "작가" : actor === "customer" ? "고객" : "완료";
  const actorColor = actor === "photographer"
    ? "var(--accent)"
    : actor === "customer"
      ? "var(--cyan)"
      : "var(--subtle-foreground)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/photographer/projects/${project.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/photographer/projects/${project.id}`); } }}
      className="h-full flex flex-col bg-surface rounded-[14px] overflow-hidden cursor-pointer transition-[background-color,box-shadow] shadow-[0_1px_3px_rgba(2,56,82,0.08)] hover:bg-surface-raised hover:shadow-[0_4px_14px_rgba(2,56,82,0.10)] focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 w-full min-w-0"
    >
      {/* 고정 aspect-ratio container + object-cover — 원본 이미지 비율(세로/가로/정사각)과 무관하게
          thumbnail 영역 크기는 항상 동일하다. object-fill·auto 조합은 쓰지 않는다.
          반복 카드의 outer border는 제거하고 Navy 기반의 약한 shadow로 White 면만 구분한다.
          hover에서는 surface와 shadow가 한 단계 올라간다. */}
      <div className="relative mx-3 mt-2.5 aspect-[3/2] rounded-lg overflow-hidden shrink-0">
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, var(--surface-raised) 0%, var(--background) 100%)" }}
          >
            <span className="text-lg font-black text-disabled-foreground uppercase tracking-widest select-none">
              {project.name.slice(0, 2)}
            </span>
          </div>
        )}
        {project.thumbnailUrl && (
          <div className="absolute inset-0 bg-[rgba(2,56,82,0.04)] pointer-events-none" aria-hidden="true" />
        )}
      </div>

      <div className="px-3 pt-3 pb-4 flex flex-1 flex-col">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-bold text-foreground truncate">{project.name}</div>
          <div className="text-[12.5px] font-semibold text-muted-foreground truncate">
            {project.customerName || "—"}
            <span className="ml-1 text-subtle-foreground">·</span>
            <ProjectIdText project={project} className="ml-1" />
          </div>
        </div>

        {/* Actor와 현재 상태를 한 행으로 묶고, Actor semantic은 작은 dot으로만 구분한다. */}
        <div className="flex items-center justify-between gap-3 mt-auto pt-3">
          <div className="flex flex-1 min-w-0 items-center gap-1.5 text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: actorColor }} />
            <span className="shrink-0 text-[11px] font-semibold">{actorLabel}</span>
            {actor !== "completed" && (
              <>
                <span className="shrink-0 text-disabled-foreground">·</span>
                <span className="min-w-0 truncate text-[12px] font-semibold">
                  {getCurrentActionLabel(project.status, project.revisionRound)}
                </span>
              </>
            )}
          </div>
          {metric && (
            <span
              className="shrink-0 inline-flex items-baseline whitespace-nowrap"
              title={`${metric.label}: ${metric.value}`}
            >
              {project.status === "preparing" ? (
                <>
                  <span className="font-mono text-[15px] font-semibold text-foreground">
                    {project.requiredCount.toLocaleString()}
                  </span>
                  <span className="font-mono text-[13px] font-medium text-muted-foreground">
                    /{project.photoCount.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">장</span>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-semibold text-muted-foreground">보정</span>
                  <span className="font-mono text-[15px] font-semibold text-foreground">
                    {project.requiredCount.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">장</span>
                </>
              )}
            </span>
          )}
          {!metric && overdueDeadline && (
            <span
              className="shrink-0 text-[12px] font-mono font-semibold whitespace-nowrap"
              style={{ color: "var(--danger)" }}
              title={`${activeDeadline?.label ?? "기한"} ${overdueDeadline.text}`}
            >
              {overdueDeadline.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
