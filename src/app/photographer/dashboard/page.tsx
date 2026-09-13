"use client";

import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
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
import { consumePostLoginRedirect, peekPostLoginRedirect } from "@/lib/post-login-redirect";
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
      title={<span className="flex items-center gap-2"><Sparkles size={17} className="text-accent" />베타 서비스 시작</span>}
      description="A-CUT과 함께 첫 프로젝트를 시작해 보세요."
      maxWidth={440}
      footer={
        <PhotographerLightButton type="button" variant="primary" onClick={onClose} className="w-full">
          시작하기
        </PhotographerLightButton>
      }
    >
      <div className="py-3 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
          <Sparkles size={26} className="text-accent" />
        </div>
        <p className="text-[17px] font-bold text-foreground">{userName}님, 환영합니다!</p>
        <p className="mt-2 break-keep text-[13px] leading-5 text-muted-foreground">
          사진 셀렉부터 보정본 검토와 납품까지 한 프로젝트에서 이어갈 수 있습니다.
        </p>
      </div>
    </PhotographerModal>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { handleNewProject, limitInfo, closeLimitModal } = useNewProjectGate();
  const { profile, loading: profileLoading } = useProfile();
  const [loading, setLoading]   = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [logsError, setLogsError] = useState(false);
  const [reload, setReload] = useState(0);
  const [logs, setLogs]         = useState<ProjectLogItem[]>([]);
  const { quota } = useQuota();
  const tier = quota?.tier ?? null;
  const maxProjects = quota?.max || DEFAULT_GENERAL_MAX_PROJECTS;
  const maxPhotosPerProject = quota?.maxPhotosPerProject || DEFAULT_GENERAL_MAX_PHOTOS_PER_PROJECT;
  const betaApplicationStatus: BetaApplicationStatus = quota?.betaApplicationStatus ?? null;
  const [showBetaWelcome, setShowBetaWelcome] = useState(false);
  // 첫 렌더에서(이펙트를 기다리지 않고) 곧바로 읽는다 — 그래야 대시보드 실제 콘텐츠가 한 프레임도
  // 그려지지 않고 바로 로딩 화면으로 대체된다. 실제 소비(제거)는 아래 이펙트가 담당.
  const [pendingRedirect] = useState(() =>
    typeof window === "undefined" ? null : peekPostLoginRedirect()
  );

  const userName =
    profile?.name?.trim() ||
    profile?.email?.split("@")[0] ||
    "사용자";

  // 로그인은 항상 여기로 도착한다(auth/callback 기본 목적지) — /beta/apply처럼 로그인 후 다른
  // 페이지로 되돌아가야 하는 흐름은 AuthModal이 로그인 전에 남겨둔 목적지를 여기서 소비한다
  // (src/lib/post-login-redirect.ts). 콜백 URL 자체에 쿼리스트링을 붙이지 않기 위한 우회.
  useEffect(() => {
    const redirectPath = consumePostLoginRedirect();
    if (redirectPath) router.replace(redirectPath);
  }, [router]);

  useEffect(() => {
    if (profileLoading) return;
    const pid = profile?.id;
    if (!pid) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
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

  if (pendingRedirect || profileLoading || (profile?.id && loading)) {
    return <SystemLoadingScreen />;
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
