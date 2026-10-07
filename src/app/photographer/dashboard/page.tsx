"use client";

import { PhotographerPageSkeleton } from "@/components/photographer/PhotographerPageSkeleton";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  DEFAULT_GENERAL_MAX_PROJECTS,
  DEFAULT_GENERAL_MAX_PHOTOS_PER_PROJECT,
} from "@/lib/beta-limits";
import { getProjectsByPhotographerId } from "@/lib/db";
import type { Project } from "@/types";
import type { ProjectLogItem } from "@/lib/db";
import { useProfile } from "@/contexts/ProfileContext";
import { useQuota } from "@/contexts/QuotaContext";
import EmptyDashboard from "./EmptyDashboard";



import { DashboardOverview } from "./DashboardOverview";


import { BetaApprovalBanner, type BetaApplicationStatus } from "@/components/photographer/BetaApprovalBanner";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { ProjectLimitModal } from "@/components/photographer/ProjectLimitModal";
import { useNewProjectGate } from "@/hooks/useNewProjectGate";

import themeStyles from "./DashboardTheme.module.css";




function BetaWelcomeModal({ open, onClose, userName }: { open: boolean; onClose: () => void; userName: string }) {
  return (
    <PhotographerModal
      open={open}
      onClose={onClose}
      title="베타 서비스 시작"
      description="A-CUT과 함께 첫 프로젝트를 시작해 보세요."
      maxWidth={440}
      footer={
        <PhotographerLightButton type="button" variant="primary" onClick={onClose} className="w-full">
          시작하기
        </PhotographerLightButton>
      }
    >
      <div className="py-3 text-center">
        <p className="text-[17px] font-bold text-foreground">{userName}님, 환영합니다!</p>
        <p className="mt-2 break-keep text-[13px] leading-5 text-muted-foreground">
          사진 셀렉부터 보정본 검토와 납품까지 한 프로젝트에서 이어갈 수 있습니다.
        </p>
      </div>
    </PhotographerModal>
  );
}

// 작가별 마지막 대시보드 데이터. 다시 들어올 때 골격 없이 바로 그리고 뒤에서 새로 받는다(매 방문 흰 화면 방지).
// 소프트 내비게이션 동안만 살아 있고 새로고침이면 비운다. 계정이 바뀌면 키(작가 ID)가 달라 섞이지 않는다.
const dashboardCache = new Map<string, { projects: Project[]; logs: ProjectLogItem[] }>();

// ── Main Page ──────────────────────────────────────────────
export default function DashboardPage() {
  const { handleNewProject, limitInfo, closeLimitModal } = useNewProjectGate();
  const { profile, loading: profileLoading } = useProfile();
  const cached = profile?.id ? dashboardCache.get(profile.id) : undefined;
  const [loading, setLoading]   = useState(!cached);
  const [projects, setProjects] = useState<Project[]>(cached?.projects ?? []);
  const [loadError, setLoadError] = useState(false);
  const [logsError, setLogsError] = useState(false);
  const [reload, setReload] = useState(0);
  const [logs, setLogs]         = useState<ProjectLogItem[]>(cached?.logs ?? []);
  const { quota } = useQuota();
  const tier = quota?.tier ?? null;
  const maxProjects = quota?.max || DEFAULT_GENERAL_MAX_PROJECTS;
  const maxPhotosPerProject = quota?.maxPhotosPerProject || DEFAULT_GENERAL_MAX_PHOTOS_PER_PROJECT;
  const betaApplicationStatus: BetaApplicationStatus = quota?.betaApplicationStatus ?? null;
  const [showBetaWelcome, setShowBetaWelcome] = useState(false);

  const userName =
    profile?.name?.trim() ||
    profile?.email?.split("@")[0] ||
    "사용자";

  useEffect(() => {
    if (profileLoading) return;
    const pid = profile?.id;
    if (!pid) return;

    let cancelled = false;
    async function load() {
      // 기억해 둔 데이터가 있으면 그대로 보여주며 뒤에서 새로 받는다.
      if (!dashboardCache.has(pid as string)) setLoading(true);
      // 프로젝트 조회와 활동 조회 실패를 분리해 빈 대시보드로 오인하지 않도록 한다.
      const [list, activity] = await Promise.allSettled([
        getProjectsByPhotographerId(pid as string),
        fetch("/api/photographer/project-logs").then(async r => {
          if (!r.ok) throw new Error("활동 조회 실패");
          const data = await r.json();
          if (!Array.isArray(data)) throw new Error("활동 응답 오류");
          return data as ProjectLogItem[];
        }),
      ]);
      if (cancelled) return;
      setLoadError(list.status === "rejected");
      if (list.status === "fulfilled") setProjects(list.value);
      setLogsError(activity.status === "rejected");
      if (activity.status === "fulfilled") setLogs(activity.value);
      if (list.status === "fulfilled") {
        dashboardCache.set(pid as string, { projects: list.value, logs: activity.status === "fulfilled" ? activity.value : dashboardCache.get(pid as string)?.logs ?? [] });
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [profile, profileLoading, reload]);

  useEffect(() => {
    if (tier !== "beta" || !profile?.id || typeof window === "undefined") return;
    const key = `acut:beta-welcome:${profile.id}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "shown");
    // 브라우저 저장소의 최초 방문 여부를 모달 상태와 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowBetaWelcome(true);
  }, [tier, profile?.id]);

  if (profileLoading || (profile?.id && loading)) {
    // 첫 조회 중 — 사이드바는 그대로 두고 본문만 골격으로.
    return <PhotographerPageSkeleton label="대시보드를 불러오고 있어요" />;
  }

  if (!profile?.id) {
    return (
      <div className={`${themeStyles.lightTheme} min-h-screen bg-background flex flex-col items-center justify-center gap-4`}>
        <p className="text-sm text-muted-foreground">로그인하면 프로젝트를 볼 수 있습니다</p>
        <Link
          href="/"
          className="bg-accent text-[var(--accent-foreground)] px-6 py-2.5 rounded-xl text-sm font-bold no-underline"
        >
          로그인
        </Link>
      </div>
    );
  }

  if (loadError) {
    return <div className={themeStyles.lightTheme}><div className={themeStyles.frame} role="alert"><h1>프로젝트를 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p><button className={themeStyles.action} onClick={() => setReload(v => v+1)}>다시 시도</button></div></div>;
  }

  if (projects.length === 0) {
    return (
      <div className={themeStyles.lightTheme} data-dashboard-theme="light">
        <EmptyDashboard
          onCreateProject={handleNewProject}
        />
        <ProjectLimitModal info={limitInfo} onClose={closeLimitModal}/>
        <BetaWelcomeModal open={showBetaWelcome} onClose={() => setShowBetaWelcome(false)} userName={userName} />
      </div>
    );
  }

  return <div className={themeStyles.lightTheme} data-dashboard-theme="light">
    <BetaWelcomeModal open={showBetaWelcome} onClose={() => setShowBetaWelcome(false)} userName={userName}/>
    <DashboardOverview projects={projects} logs={logs} logsError={logsError} onRetryLogs={() => setReload(v => v+1)} onCreate={handleNewProject} userName={userName}
      banner={<BetaApprovalBanner tier={tier} betaApplicationStatus={betaApplicationStatus} maxProjects={maxProjects} maxPhotosPerProject={maxPhotosPerProject}/>}
      quota={quota}/>
    <ProjectLimitModal info={limitInfo} onClose={closeLimitModal}/>
  </div>;
}
