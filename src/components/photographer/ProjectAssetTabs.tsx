"use client";

import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@/types";
import workspaceStyles from "./AssetWorkspace.module.css";

export type ProjectAssetTab = "original" | "selected" | "retouched" | "final";

const RETOUCHED_STATUSES: readonly ProjectStatus[] = [
  "editing",
  "reviewing_v1",
  "editing_v2",
  "reviewing_v2",
  "delivered",
];

export function hasRetouchedAssetTab(status: ProjectStatus) {
  return RETOUCHED_STATUSES.includes(status);
}

export function hasFinalAssetTab(status: ProjectStatus) {
  return status === "delivered";
}

export function ProjectAssetTabs({
  projectId,
  status,
  activeTab,
  originalCount,
  selectedCount,
  className = "",
}: {
  projectId: string;
  status: ProjectStatus;
  activeTab: ProjectAssetTab;
  originalCount?: number;
  selectedCount?: number;
  className?: string;
}) {
  const router = useRouter();
  const tabs: Array<{ key: ProjectAssetTab; label: string; count?: number; href: string }> = [
    {
      key: "original",
      label: "원본",
      count: originalCount,
      href: `/photographer/projects/${projectId}/assets/original`,
    },
    {
      key: "selected",
      label: "셀렉",
      count: selectedCount,
      href: `/photographer/projects/${projectId}/assets/selected`,
    },
    ...(hasRetouchedAssetTab(status)
      ? [{
          key: "retouched" as const,
          label: "보정본",
          href: `/photographer/projects/${projectId}/assets/retouched`,
        }]
      : []),
    ...(hasFinalAssetTab(status)
      ? [{
          key: "final" as const,
          label: "최종본",
          href: `/photographer/projects/${projectId}/assets/final`,
        }]
      : []),
  ];

  return (
    <div
      data-project-asset-tabs
      className={`flex items-end gap-1 rounded-t-xl border-b-0 border-border-subtle bg-background px-1 pt-0 md:border-b md:bg-transparent md:pt-1 ${workspaceStyles.tabs} ${className}`}
      role="tablist"
      aria-label="프로젝트 사진 자산"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`relative mb-0 flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-t-[6px] border-0 px-1 text-[14px] leading-5 tracking-[-0.35px] transition-colors focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/40 md:-mb-px md:min-h-12 md:min-w-[112px] md:flex-none md:rounded-t-lg md:border md:px-5 md:text-[17px] md:leading-8 md:tracking-[-0.45px] ${
              active
                ? "z-10 border-transparent bg-transparent font-bold text-foreground md:border-border-subtle md:border-b-surface md:bg-surface"
                : "border-transparent bg-transparent font-medium text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              if (!active) router.push(tab.href);
            }}
            onMouseEnter={() => router.prefetch(tab.href)}
            onFocus={() => router.prefetch(tab.href)}
          >
            <span
              data-project-asset-tab-face
              className={`flex h-9 w-full items-center justify-center rounded-md transition-colors md:contents ${
                active ? "bg-surface" : "bg-transparent hover:bg-surface/60"
              }`}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span data-project-asset-tab-count className="ml-1.5 hidden text-[12px] font-semibold tabular-nums text-subtle-foreground md:inline">
                  {tab.count.toLocaleString()}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
