"use client";

import { Activity, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import WorkflowPageClient from "../workflow/WorkflowPageClient";
import ProjectAssetsPageClient, { type ResultsTab } from "./ProjectAssetsPageClient";
import { useProjectAssetsData } from "@/components/photographer/ProjectAssetsDataProvider";
import { hasRetouchedAssetTab, hasSelectedAssetTab } from "@/components/photographer/ProjectAssetTabs";
import { prefetchRetouchedVersionData } from "@/lib/retouched-version-data";

type AssetRouteTab = ResultsTab | "retouched" | "final";

function tabFromPathname(pathname: string): AssetRouteTab {
  if (pathname.endsWith("/assets/final")) return "final";
  if (pathname.endsWith("/assets/retouched")) return "retouched";
  if (pathname.endsWith("/assets/selected")) return "selected";
  return "original";
}

/**
 * 방문한 자산 탭의 DOM과 이미지 디코딩 결과를 유지한다.
 * URL 라우팅은 그대로 사용하고, 탭 패널은 제거하지 않고 hidden 상태로 전환한다.
 */
export function ProjectAssetsRoutePanels() {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = tabFromPathname(pathname);
  const { project } = useProjectAssetsData();
  const selectedUnavailable = activeTab === "selected" && Boolean(project && !hasSelectedAssetTab(project.status));
  const [visitedTabs, setVisitedTabs] = useState<Set<AssetRouteTab>>(
    () => new Set([activeTab]),
  );

  useEffect(() => {
    if (!selectedUnavailable || !project) return;
    router.replace(`/photographer/projects/${project.id}/assets/original`);
  }, [project, router, selectedUnavailable]);

  useEffect(() => {
    if (visitedTabs.has(activeTab)) return;
    const timer = window.setTimeout(() => {
      setVisitedTabs((current) => {
        if (current.has(activeTab)) return current;
        const next = new Set(current);
        next.add(activeTab);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, visitedTabs]);

  useEffect(() => {
    if (!project || activeTab === "retouched" || activeTab === "final" || !hasRetouchedAssetTab(project.status)) return;

    // 활성 탭의 렌더링을 먼저 끝낸 뒤, 보정본 탭이 노출되는 단계부터 데이터를 예열한다.
    const timer = window.setTimeout(() => {
      void prefetchRetouchedVersionData(project.id);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [activeTab, project]);

  const shouldRender = (tab: AssetRouteTab) => activeTab === tab || visitedTabs.has(tab);

  if (selectedUnavailable) return null;

  return (
    <>
      {shouldRender("original") ? (
        <Activity mode={activeTab === "original" ? "visible" : "hidden"}>
          <ProjectAssetsPageClient activeTab="original" isActive={activeTab === "original"} />
        </Activity>
      ) : null}
      {shouldRender("selected") ? (
        <Activity mode={activeTab === "selected" ? "visible" : "hidden"}>
          <ProjectAssetsPageClient activeTab="selected" isActive={activeTab === "selected"} />
        </Activity>
      ) : null}
      {shouldRender("retouched") ? (
        <Activity mode={activeTab === "retouched" ? "visible" : "hidden"}>
          <WorkflowPageClient isActive={activeTab === "retouched"} />
        </Activity>
      ) : null}
      {shouldRender("final") ? (
        <Activity mode={activeTab === "final" ? "visible" : "hidden"}>
          <WorkflowPageClient isActive={activeTab === "final"} assetView="final" />
        </Activity>
      ) : null}
    </>
  );
}
