"use client";
import { getDesktopNextAction } from "@/lib/project-next-action";

import { PageLoader } from "@/components/ui/PageLoader";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, SlidersHorizontal, SearchX, ArrowRight,
} from "lucide-react";
import { getProjectsByPhotographerId } from "@/lib/db";
import { useProfile } from "@/contexts/ProfileContext";
import type { Project, ProjectStatus } from "@/types";
import { getDisplayStatusLabel } from "@/lib/project-status";
import { getSixStepPosition } from "@/components/photographer/ProjectStepper";
import { getActiveDeadline } from "@/lib/project-deadline";
import { dday as getSharedDday, getProjectActor } from "@/lib/project-actor";
import { ProjectLimitModal } from "@/components/photographer/ProjectLimitModal";
import { useNewProjectGate } from "@/hooks/useNewProjectGate";
import {
  PhotographerLightPageFrame,
} from "@/components/layout/PhotographerLightPageHeader";
import { formatProjectDisplayId } from "@/components/photographer/ProjectIdText";
import { DesktopProjectList } from "./DesktopProjectList";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { FirstProjectOnboarding } from "@/components/photographer/FirstProjectOnboarding";
import styles from "./ProjectListTheme.module.css";
import { PhotographerMobilePageHeader } from "@/components/layout/PhotographerMobilePageHeader";
import { ProjectAssetMobileSheet } from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import { OriginalUploadWarningBadge } from "@/components/photographer/OriginalUploadWarningBadge";

// ── constants ──────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: ProjectStatus[] = [
  "selecting", "confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2",
];

// ── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  // Figma 실측: "2026. 07. 04"처럼 마침표 뒤에 공백이 들어간다(기존엔 공백 없이 "2026.07.04").
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`;
}


function MobileProjectCard({ project, onNavigate }: { project: Project; onNavigate: (href: string) => void }) {
  const base = `/photographer/projects/${project.id}`;
  const action = getDesktopNextAction(project);
  const actor = getProjectActor(project.status);
  const deadline = getActiveDeadline(project);
  const due = deadline ? getSharedDday(deadline.date) : null;
  return (
    <article data-mobile-project-card className="relative flex min-w-0 flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3.5 transition-colors active:bg-surface-raised">
      {/* 카드 전체로 상세를 열고 작업 링크는 별도 터치 대상으로 유지한다. */}
      <button type="button" className="flex min-w-0 gap-3 text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent" onClick={() => onNavigate(base)} aria-label={`${project.name} 상세 보기`}>
        <span data-mobile-project-thumbnail className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-raised">
          {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-muted-foreground">사진 없음</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-[15px] font-bold leading-5">{project.name}</span>
          <OriginalUploadWarningBadge count={project.originalRecoveryCount} className="mt-1" />
          <span className="mt-1 block truncate text-xs text-muted-foreground">{project.customerName || "고객 미등록"}</span>
          <span className="mt-1 block text-xs text-muted-foreground">촬영 {formatDate(project.shootDate)}</span>
        </span>
      </button>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 border-t border-border-subtle pt-1">
        <span className={`text-xs font-semibold ${actor === "photographer" ? "text-accent" : actor === "customer" ? "text-[var(--customer-foreground)]" : "text-muted-foreground"}`}>{actor === "customer" ? "고객 " : ""}{getDisplayStatusLabel(project.status, project.photoCount)}</span>
        {actor === "photographer" && "href" in action ? <button type="button" className="relative z-10 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-foreground" onClick={() => onNavigate(action.href)}>{action.label}<ArrowRight size={14} aria-hidden /></button> : due ? <span className={`text-xs ${due.level === "danger" ? "text-danger" : due.level === "warn" ? "text-accent" : "text-muted-foreground"}`}>{deadline?.label} {due.text}</span> : null}
      </div>
      {actor === "photographer" && due ? <p className={`text-xs ${due.level === "danger" ? "text-danger" : "text-muted-foreground"}`}>{deadline?.label} {due.text}</p> : null}
    </article>
  );
}

// ── desktop: next action (CTA Hierarchy) ────────────────────────────────────
// PC와 모바일이 같은 다음 작업 경로를 공유한다. 작가 작업만 강조하고 고객 차례는 대기로 표시한다.
// 재보정 업로드 전후는 목록 데이터로 구분할 수 없어 기존 작업 화면에서 확인한다.

// 작업 경로는 대시보드와 공통 유틸에서 관리한다.
function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-surface-raised border border-border-strong flex items-center justify-center text-muted-foreground">
        <SearchX size={20} />
      </div>
      <h3 className="text-sm font-bold text-foreground">조건에 맞는 프로젝트가 없어요</h3>
      <p className="text-xs text-muted-foreground">검색어나 필터를 변경해 보세요.</p>
      <PhotographerLightButton
        type="button"
        variant="secondary"
        onClick={onReset}
        className="mt-1 px-3 py-1.5 text-xs font-semibold"
      >
        검색 · 필터 초기화
      </PhotographerLightButton>
    </div>
  );
}

// Project List visual review #1: Workflow가 테이블의 절반 가까이를 차지해 Project identity가
// 너무 일찍 잘리던 비율을 재조정한다. Stepper geometry/state는 그대로 유지하고, connector가
// 흡수하던 여유 폭만 Project/Customer에 재분배한다.

// ── main component ─────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter();
  const { handleNewProject, limitInfo, closeLimitModal } = useNewProjectGate();
  const { profile, loading: profileLoading } = useProfile();
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo,   setDateTo]     = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed">("all");
  const [quickFilter, setQuickFilter] = useState<"all" | "mine" | "waiting">("all");
  const [stepFilter, setStepFilter] = useState<"all" | 1 | 2 | 3 | 4 | 5 | 6>("all");
  const [sortBy,   setSortBy]     = useState<"latest" | "updated" | "deadline" | "name" | "shoot_date">("shoot_date");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const restoredFor = useRef<string | null>(null);
  const pendingScroll = useRef<number | null>(null);

  // 계정별로 이 탭의 목록 조건만 보관한다. 상세에서 돌아온 뒤 데이터 렌더가 끝나면 위치를 복원한다.
  useEffect(() => {
    if (!profile?.id || restoredFor.current === profile.id) return;
    restoredFor.current = profile.id;
    try {
      const raw = sessionStorage.getItem(`acut-project-list:${profile.id}`);
      if (!raw) return;
      const saved = JSON.parse(raw);
      queueMicrotask(() => {
        if (typeof saved.search === "string") setSearchQuery(saved.search);
        if (typeof saved.from === "string") setDateFrom(saved.from);
        if (typeof saved.to === "string") setDateTo(saved.to);
        if (["all", "completed"].includes(saved.tab)) setActiveTab(saved.tab);
        if (["all", "mine", "waiting"].includes(saved.quick)) setQuickFilter(saved.quick);
        if (["all", 1, 2, 3, 4, 5, 6].includes(saved.step)) setStepFilter(saved.step);
        if (["shoot_date", "updated", "deadline", "latest", "name"].includes(saved.sort)) setSortBy(saved.sort);
        pendingScroll.current = typeof saved.y === "number" && Number.isFinite(saved.y) ? Math.max(0, saved.y) : 0;
      });
    } catch { /* 저장이 제한된 환경에서는 기본 목록으로 시작한다. */ }
  }, [profile?.id]);

  useEffect(() => {
    if (loading || !projects.length || pendingScroll.current === null) return;
    const y = pendingScroll.current;
    const frame = requestAnimationFrame(() => { window.scrollTo({ top: y, behavior: "instant" }); pendingScroll.current = null; });
    return () => cancelAnimationFrame(frame);
  }, [loading, projects]);

  function rememberList() {
    if (profile?.id) {
      try {
        sessionStorage.setItem(`acut-project-list:${profile.id}`, JSON.stringify({ search: searchQuery, from: dateFrom, to: dateTo, tab: activeTab, quick: quickFilter, step: stepFilter, sort: sortBy, y: window.scrollY }));
      } catch { /* 저장 공간이 제한돼도 프로젝트 이동은 계속한다. */ }
    }
  }
  function navigateFromMobileList(href: string) { rememberList(); router.push(href); }

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active || profileLoading) return;
      if (!profile?.id) { setLoading(false); return; }
      setLoading(true);
      setLoadError(false);
      try {
        const items = await getProjectsByPhotographerId(profile.id);
        if (active) setProjects(items);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [profile?.id, profileLoading, reloadKey]);


  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setActiveTab("all");
    setQuickFilter("all");
    setStepFilter("all");
    setSortBy("shoot_date");
  }, []);

  const tabCounts = useMemo(() => ({
    all:       projects.length,
    active:    projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
    completed: projects.filter((p) => p.status === "delivered").length,
  }), [projects]);

  // Quick Filter 카운트 — getProjectActor()로 계산해 Lifecycle 탭과 별개 축(업무주체)으로 필터링한다.
  const quickCounts = useMemo(() => ({
    mine:    projects.filter((p) => getProjectActor(p.status) === "photographer").length,
    waiting: projects.filter((p) => getProjectActor(p.status) === "customer").length,
  }), [projects]);

  const filtered = useMemo(() => {
    let result = [...projects];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.customerName || "").toLowerCase().includes(q) || formatProjectDisplayId(p).toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
    }
    if (dateFrom) result = result.filter((p) => p.shootDate.slice(0, 10) >= dateFrom);
    if (dateTo)   result = result.filter((p) => p.shootDate.slice(0, 10) <= dateTo);
    if (activeTab === "active")    result = result.filter((p) => ACTIVE_STATUSES.includes(p.status));
    if (activeTab === "completed") result = result.filter((p) => p.status === "delivered");
    if (quickFilter === "mine")    result = result.filter((p) => getProjectActor(p.status) === "photographer");
    if (quickFilter === "waiting") result = result.filter((p) => getProjectActor(p.status) === "customer");
    if (stepFilter !== "all")      result = result.filter((p) => getSixStepPosition(p.status, p.revisionRound).step === stepFilter);
    if (sortBy === "latest")     result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sortBy === "updated")    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (sortBy === "deadline") {
      // 완료·기한 미설정은 뒤로 보내고 현재 단계의 셀렉/검토 기한으로 비교한다.
      const dueTime = (project: Project) => { const due = getActiveDeadline(project); const time = due ? new Date(due.date).getTime() : NaN; return Number.isFinite(time) ? time : Infinity; };
      result.sort((a, b) => dueTime(a) - dueTime(b));
    }
    if (sortBy === "name")       result.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    if (sortBy === "shoot_date") result.sort((a, b) => new Date(b.shootDate).getTime() - new Date(a.shootDate).getTime());
    return result;
  }, [projects, searchQuery, dateFrom, dateTo, activeTab, quickFilter, stepFilter, sortBy]);

  if (loadError) return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 px-5 py-16 text-center">
      <h1 className="text-xl font-bold">프로젝트를 불러오지 못했습니다</h1>
      <p className="text-sm text-muted-foreground">연결 상태를 확인하고 다시 시도해 주세요.</p>
      <PhotographerLightButton onClick={() => setReloadKey((key) => key + 1)}>다시 시도</PhotographerLightButton>
    </div>
  );
  return (
    <>
    {/* ── Mobile View ──────────────────────────────────────────── */}
    <div className="md:hidden bg-background text-foreground">
      <div>
        <PhotographerMobilePageHeader
          title="프로젝트"
          trailing={<button type="button" onClick={handleNewProject} className="-mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent"><Plus size={17} />새 프로젝트</button>}
        />
        {!loading && projects.length === 0 ? (
          <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center px-5 py-12">
            <FirstProjectOnboarding
              onCreateProject={handleNewProject}
              headingLevel="h2"
            />
          </div>
        ) : (
          <>
        {/* search + filter */}
        <div className="px-5 pb-4 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle-foreground" />
            <input
              type="text"
              aria-label="프로젝트명, 고객명 검색"
              placeholder="프로젝트명, 고객명 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-border-subtle text-foreground text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 placeholder:text-disabled-foreground transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => setMobileFilterOpen((v) => !v)}
            aria-label="프로젝트 상세 필터"
            aria-expanded={mobileFilterOpen}
            className={`relative w-12 h-12 flex items-center justify-center bg-surface border rounded-xl transition-colors shrink-0 ${
              mobileFilterOpen || dateFrom || dateTo || stepFilter !== "all" ? "border-accent text-accent" : "border-border-subtle text-muted-foreground"
            }`}
          >
            <SlidersHorizontal size={20} strokeWidth={1.5} />
            {(dateFrom || dateTo || stepFilter !== "all") ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> : null}
          </button>
        </div>

        {/* 업무 주체는 바로 전환하고 세부 단계·촬영일은 시트에 모은다. */}
        <div className="mx-5 grid grid-cols-4 gap-1 rounded-xl bg-surface-raised p-1" role="group" aria-label="프로젝트 빠른 필터">
          {([{ key: "all", label: "전체", count: tabCounts.all }, { key: "mine", label: "내 작업", count: quickCounts.mine }, { key: "waiting", label: "고객 대기", count: quickCounts.waiting }, { key: "completed", label: "완료", count: tabCounts.completed }] as const).map(tab => {
            const selected = tab.key === "completed" ? activeTab === "completed" : activeTab === "all" && quickFilter === tab.key;
            return <button key={tab.key} type="button" aria-pressed={selected} onClick={() => { setActiveTab(tab.key === "completed" ? "completed" : "all"); setQuickFilter(tab.key === "completed" ? "all" : tab.key); }} className={`min-h-11 rounded-lg px-1 text-xs font-semibold ${selected ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"}`}>{tab.label}<span className="ml-1 text-[10px] opacity-70">{tab.count}</span></button>;
          })}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-2">
          <span className="text-xs text-muted-foreground" role="status">{loading ? "불러오는 중" : `${filtered.length}개 프로젝트`}</span>
          <select aria-label="모바일 프로젝트 정렬" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="min-h-11 max-w-[160px] bg-transparent text-xs text-muted-foreground">
            <option value="shoot_date">촬영일순</option><option value="updated">최근 변경순</option><option value="deadline">기한순</option><option value="latest">최근 생성순</option><option value="name">이름순</option>
          </select>
        </div>
        {(dateFrom || dateTo || stepFilter !== "all") && <div className="flex flex-wrap items-center gap-2 px-5 pb-3 text-xs text-muted-foreground"><span>{stepFilter !== "all" ? `${stepFilter}단계 · ` : ""}{dateFrom || dateTo ? `촬영 ${dateFrom || "전체"} ~ ${dateTo || "전체"}` : "단계 필터 적용"}</span><button type="button" className="min-h-9 px-2 underline" onClick={() => { setDateFrom(""); setDateTo(""); setStepFilter("all"); }}>해제</button></div>}

        <ProjectAssetMobileSheet
          open={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          title="상세 필터"
          titleId="mobile-project-shoot-date-filter-title"
          closeLabel="상세 필터 닫기"
          headerAction={(
            <button
              type="button"
              onClick={() => { setDateFrom(""); setDateTo(""); setStepFilter("all"); }}
              disabled={!dateFrom && !dateTo && stepFilter === "all"}
              className="h-9 px-2 text-[12px] font-medium text-muted-foreground underline underline-offset-2 disabled:no-underline disabled:opacity-40"
            >
              초기화
            </button>
          )}
        >
          <label className="block pt-4 text-xs font-semibold text-muted-foreground">진행 단계<select aria-label="진행 단계 필터" value={stepFilter} onChange={e => setStepFilter(e.target.value === "all" ? "all" : Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6)} className="mt-2 h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-foreground"><option value="all">전체 단계</option><option value="1">1 · 원본</option><option value="2">2 · 셀렉</option><option value="3">3 · 보정</option><option value="4">4 · 1차 수정</option><option value="5">5 · 2차 수정</option><option value="6">6 · 납품</option></select></label>
          <div data-mobile-project-date-filter className="py-5">
            <div className="grid grid-cols-[minmax(0,1fr)_12px_minmax(0,1fr)] items-end gap-2">
              <label className="min-w-0 text-[11px] font-medium text-muted-foreground">
                시작일
                <input
                  type="date"
                  aria-label="촬영일 시작일"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="mt-1 h-11 w-full min-w-0 rounded-lg border border-border-subtle bg-background px-2 text-[13px] font-medium text-foreground outline-none focus:border-accent"
                />
              </label>
              <span className="pb-3 text-center text-xs text-disabled-foreground" aria-hidden>~</span>
              <label className="min-w-0 text-[11px] font-medium text-muted-foreground">
                종료일
                <input
                  type="date"
                  aria-label="촬영일 종료일"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="mt-1 h-11 w-full min-w-0 rounded-lg border border-border-subtle bg-background px-2 text-[13px] font-medium text-foreground outline-none focus:border-accent"
                />
              </label>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileFilterOpen(false)}
            className="h-12 w-full rounded-lg bg-accent text-[15px] font-bold text-white transition-colors active:bg-[#e94b0d]"
          >
            완료
          </button>
        </ProjectAssetMobileSheet>

        {/* cards list */}
        <div className="px-5 pb-6 flex flex-col gap-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <PageLoader />
            </div>
          ) : filtered.length === 0 ? (
            <FilteredEmptyState onReset={resetFilters} />
          ) : (
            filtered.map((project) => (
              <MobileProjectCard
                key={project.id}
                project={project}
                onNavigate={navigateFromMobileList}
              />
            ))
          )}
        </div>
          </>
        )}
      </div>
    </div>

    <ProjectLimitModal info={limitInfo} onClose={closeLimitModal} />
    <div className={`${styles.lightTheme} hidden md:block min-h-screen bg-background text-foreground`}>
      {loading ? <div className="py-24 flex justify-center"><PageLoader /></div> : projects.length === 0 ? (
        <PhotographerLightPageFrame><FirstProjectOnboarding onCreateProject={handleNewProject} headingLevel="h1"/></PhotographerLightPageFrame>
      ) : <DesktopProjectList
        projects={filtered} total={projects.length}
        counts={{ all:tabCounts.all, mine:quickCounts.mine, waiting:quickCounts.waiting, completed:tabCounts.completed }}
        view={activeTab === "completed" ? "completed" : quickFilter}
        onView={view => { setActiveTab(view === "completed" ? "completed" : "all"); setQuickFilter(view === "completed" ? "all" : view); }}
        search={searchQuery} onSearch={setSearchQuery}
        step={stepFilter} onStep={setStepFilter}
        from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo}
        sort={sortBy} onSort={setSortBy} onReset={resetFilters}
        onCreate={handleNewProject} onRemember={rememberList}
        getAction={getDesktopNextAction}
      />}
    </div>
    </>
  );
}
