"use client";

import { useEffect, type ReactNode } from "react";
import workspaceStyles from "./AssetWorkspace.module.css";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import {
  ProjectAssetTabs,
  type ProjectAssetTab,
} from "@/components/photographer/ProjectAssetTabs";
import type { Project } from "@/types";
import {
  clearPhotographerMobileProjectContext,
  publishPhotographerMobileProjectContext,
} from "@/lib/photographer-mobile-project-context";

const TAB_TITLES: Record<ProjectAssetTab, string> = {
  original: "원본 갤러리",
  selected: "셀렉 결과",
  retouched: "보정본 업로드",
  final: "최종본 갤러리",
};

type ProjectAssetWorkspaceHeaderProps = {
  project: Project;
  activeTab: ProjectAssetTab;
  originalCount?: number;
  selectedCount?: number;
  tabTrailing?: ReactNode;
  className?: string;
  compact?: boolean;
  immersive?: boolean;
};

/**
 * 프로젝트 Asset Workspace의 공통 상단 영역.
 * compact project identity와 asset tabs의 geometry를 한 곳에서 관리한다.
 */
export function ProjectAssetWorkspaceHeader({
  project,
  activeTab,
  originalCount,
  selectedCount,
  tabTrailing,
  className = "",
  compact = false,
  immersive = false,
}: ProjectAssetWorkspaceHeaderProps) {
  const router = useRouter();
  const projectId = project.id;
  const displayId = project.displayId ?? projectId.slice(0, 8).toUpperCase();
  const title = TAB_TITLES[activeTab];

  useEffect(() => {
    const context = { projectName: project.name, customerName: project.customerName };
    publishPhotographerMobileProjectContext(context);
    return () => clearPhotographerMobileProjectContext(context);
  }, [project.customerName, project.name]);

  return (
    <PhotographerLightPageFrame
      className={`relative z-30 shrink-0 bg-background pb-0 transition-[padding,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
        immersive
          ? "!pb-3 !pt-0 shadow-[0_10px_24px_-22px_rgba(2,56,82,0.72)] md:!pb-0 md:!pt-5 md:shadow-none"
          : compact
          ? "!pt-2 shadow-[0_10px_24px_-22px_rgba(2,56,82,0.72)]"
          : "!pt-0 shadow-none md:!pt-5"
      } ${workspaceStyles.header} ${compact ? workspaceStyles.compact : ""} ${className}`}
    >
      <div
        data-project-asset-identity
        aria-hidden={immersive || compact}
        inert={immersive || compact ? true : undefined}
        className={`hidden min-h-10 items-center justify-between gap-6 overflow-hidden px-2 transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none md:flex md:max-h-none md:opacity-100 ${
          immersive ? "max-h-0 opacity-0" : "max-h-10 opacity-100"
        }`}
      >
        <nav
          aria-label="현재 위치"
          className="flex min-w-0 items-center gap-2 text-[14px] font-medium leading-5 tracking-[-0.2px] text-subtle-foreground"
        >
          <button
            type="button"
            onClick={() => router.push("/photographer/projects")}
            className="shrink-0 transition-colors hover:text-foreground"
          >
            프로젝트
          </button>
          <ChevronRight size={14} className="shrink-0" aria-hidden />
          <button
            type="button"
            data-project-asset-context-name
            onClick={() => router.push(`/photographer/projects/${projectId}`)}
            className="truncate font-semibold text-foreground transition-colors hover:text-accent"
          >
            {project.name}
          </button>
        </nav>
        <div
          data-project-asset-meta
          className="flex min-w-0 shrink-0 items-center gap-2 text-[13px] font-medium leading-5 tracking-[-0.2px] text-muted-foreground"
        >
          <span className="max-w-[220px] truncate">{project.customerName} 고객</span>
          <span className="text-disabled-foreground">·</span>
          <span className="whitespace-nowrap font-mono">#{displayId}</span>
        </div>
      </div>

      <h1 className="sr-only">{title}</h1>

      <div className="mt-0 flex min-w-0 items-end transition-[margin] duration-200 ease-out motion-reduce:transition-none md:mt-3">
        <ProjectAssetTabs
          className="-mx-2 min-w-0 flex-1 md:mx-0 md:flex-none"
          projectId={projectId}
          status={project.status}
          activeTab={activeTab}
          originalCount={originalCount}
          selectedCount={selectedCount}
        />
        {tabTrailing ? <div className="flex h-11 shrink-0 items-center border-b border-border-subtle md:h-12 md:items-end md:pb-1">{tabTrailing}</div> : null}
      </div>
    </PhotographerLightPageFrame>
  );
}
