"use client";

import { PageLoader } from "@/components/ui/PageLoader";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, AlertCircle, ChevronRight, Clock, Activity, Layers, Zap, CheckCircle2,
} from "lucide-react";
import { BETA_MAX_PROJECTS_TOTAL } from "@/lib/beta-limits";
import { getProjectsByPhotographerId } from "@/lib/db";
import type { Project, ProjectStatus } from "@/types";
import type { ProjectLogItem } from "@/lib/db";
import { useProfile } from "@/contexts/ProfileContext";
import EmptyDashboard from "./EmptyDashboard";
import { StatusPill } from "@/components/ui/StatusPill";
import { ProjectPipelineMiniBar, getPipelineStepLabel } from "@/components/photographer/ProjectPipelineMiniBar";
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";

const ACCENT = "#FF4D00";
const RED    = "#EF4444";

const ACTIVE_STATUSES: ProjectStatus[] = [
  "selecting", "confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2",
];

function dday(deadline: string): { text: string; warn: boolean } {
  const diff = Math.ceil(
    (new Date(deadline).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (diff > 3)   return { text: `D-${diff}`,      warn: false };
  if (diff > 0)   return { text: `D-${diff} 임박`,  warn: true  };
  if (diff === 0) return { text: "D-day",           warn: true  };
  return            { text: `D+${Math.abs(diff)}`, warn: true  };
}

const LOG_DOT: Record<string, string> = {
  created:   "#52525b",
  uploaded:  ACCENT,
  selecting: "#71717a",
  confirmed: "#a1a1aa",
  editing:   "#a1a1aa",
  delivered: "#fff",
  revision:  ACCENT,
};

const LOG_LABEL: Record<string, string> = {
  created:   "프로젝트 생성",
  uploaded:  "사진 업로드",
  selecting: "셀렉 완료",
  confirmed: "확정 완료",
  editing:   "보정 시작",
  delivered: "납품 완료",
  revision:  "재보정 요청",
};

function formatLogTime(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) {
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  if (diff === 1) return "어제";
  return `${diff}일 전`;
}

// ── ProjectCard ────────────────────────────────────────────
function PhotoProjectCard({ project }: { project: Project }) {
  const router     = useRouter();
  const photoCount = project.photoCount ?? 0;
  const reqCount   = project.requiredCount ?? 0;
  const { text: ddayText, warn } = dday(project.deadline);
  const stepLabel  = getPipelineStepLabel(project.status);
  const isDelivered = project.status === "delivered";
  const hasCover   = !!project.thumbnailUrl;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/photographer/projects/${project.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/photographer/projects/${project.id}`); } }}
      className="bg-[#121215] border border-[#1a1a1e] hover:border-[#27272c] rounded-2xl overflow-hidden cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-[#FF4D00]/50 group"
      style={{ opacity: isDelivered ? 0.65 : 1 }}
    >
      {/* 썸네일 — 3:2 비율 */}
      <div className="relative w-full aspect-[3/2] overflow-hidden">
        {hasCover ? (
          <img
            src={project.thumbnailUrl!}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1a1a1e 0%, #111113 100%)" }}
          >
            <span className="text-lg font-black text-zinc-800 uppercase tracking-widest select-none">
              {project.name.slice(0, 2)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        {/* 상태 배지 */}
        <div className="absolute top-2 left-2">
          <StatusPill status={project.status} photoCount={photoCount} requiredCount={reqCount} />
        </div>
        {/* D-day */}
        <div className="absolute top-2 right-2">
          {isDelivered ? (
            <span className="text-[9px] font-bold bg-black/60 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400">완료</span>
          ) : (
            <span
              className="text-[10px] font-bold rounded px-1.5 py-0.5 border"
              style={{
                color: warn ? ACCENT : "#a1a1aa",
                borderColor: warn ? `${ACCENT}50` : "rgba(255,255,255,0.12)",
                background: warn ? "rgba(255,77,0,0.18)" : "rgba(0,0,0,0.55)",
              }}
            >
              {ddayText}
            </span>
          )}
        </div>
        {/* 이미지 하단 오버레이 — 프로젝트명 + 고객명 */}
        <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 pt-4">
          <div className="text-[13px] font-bold text-white leading-tight truncate drop-shadow-sm">{project.name}</div>
          <div className="text-[10px] text-white/60 truncate">{project.customerName || "—"}</div>
        </div>
      </div>

      {/* 카드 본문 — 진행 정보 */}
      <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1.5">
        {/* 단계 + 촬영일 */}
        <div className="flex justify-between items-center">
          <span className="text-[11px] font-semibold text-zinc-300">{stepLabel}</span>
          <span className="text-[10px] text-zinc-500 font-mono">
            {project.shootDate
              ? new Date(project.shootDate).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })
              : "—"}
          </span>
        </div>
        {/* 파이프라인 진행바 */}
        <ProjectPipelineMiniBar status={project.status} variant="full" />
        {/* ID */}
        <div className="text-[9px] font-mono text-zinc-700 pt-0.5">
          {project.displayId ?? project.id.slice(0, 8).toUpperCase()}
        </div>
      </div>
    </div>
  );
}

// ── ActionCard ─────────────────────────────────────────────
function ActionCard({
  count, label, sub, numColor, href,
}: {
  count: number;
  label: string;
  sub: string;
  numColor: string;
  href?: string;
}) {
  return (
    <Link href={href ?? "/photographer/projects"} className="block no-underline group">
      <div className="bg-[#121215] border border-[#1a1a1e] group-hover:border-[#27272c] rounded-xl p-4 transition-colors flex flex-col gap-2 min-h-[90px]">
        <span className="text-3xl font-bold leading-none" style={{ color: numColor }}>
          {count}
        </span>
        <div>
          <div className="text-sm font-semibold text-white">{label}</div>
          <div className="text-[10px] text-zinc-600 mt-0.5 uppercase tracking-wider font-medium">{sub}</div>
        </div>
      </div>
    </Link>
  );
}


// ── Main Page ──────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [loading, setLoading]   = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs]         = useState<ProjectLogItem[]>([]);
  const [dashFilter, setDashFilter] = useState<"all" | "active" | "completed">("all");

  const userName =
    profile?.name?.trim() ||
    profile?.email?.split("@")[0] ||
    "사용자";

  useEffect(() => {
    if (profileLoading) return;
    const pid = profile?.id;
    if (!pid) { setLoading(false); return; }

    async function load() {
      try {
        const [list, logRes] = await Promise.all([
          getProjectsByPhotographerId(pid as string),
          fetch("/api/photographer/project-logs").then((r) => r.ok ? r.json() : []),
        ]);
        setProjects(list);
        setLogs(Array.isArray(logRes) ? logRes : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile, profileLoading]);

  if (profileLoading || loading) {
    return <PageLoader variant="full" />;
  }

  if (!profile?.id) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-zinc-500">로그인하면 프로젝트를 볼 수 있습니다</p>
        <Link
          href="/"
          className="bg-[#FF4D00] text-black px-6 py-2.5 rounded-xl text-sm font-bold no-underline"
        >
          로그인
        </Link>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyDashboard
        userName={userName}
        onCreateProject={() => router.push("/photographer/projects/new")}
      />
    );
  }

  // 정렬: 진행중(긴급순) → 대기중 → 완료
  const sortedAll = [...projects].sort((a, b) =>
    new Date(b.shootDate ?? 0).getTime() - new Date(a.shootDate ?? 0).getTime()
  );
  const filteredByDash = sortedAll.filter((p) => {
    if (dashFilter === "active")    return ACTIVE_STATUSES.includes(p.status);
    if (dashFilter === "completed") return p.status === "delivered";
    return true;
  });
  const displayProjects = filteredByDash.slice(0, 12);
  const showViewAllBtn  = filteredByDash.length > 12;

  const preparingProjects = displayProjects.filter((p) => p.status === "preparing");
  const activeProjects    = displayProjects.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const recentDelivered   = displayProjects.filter((p) => p.status === "delivered").slice(0, 1);
  const totalDelivered    = projects.filter((p) => p.status === "delivered").length;

  const dashCounts = {
    all:       projects.length,
    active:    projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
    waiting:   projects.filter((p) => p.status === "reviewing_v1" || p.status === "reviewing_v2").length,
    completed: projects.filter((p) => p.status === "delivered").length,
  };

  const betaCount = projects.length;
  const betaPct   = Math.min(100, Math.round((betaCount / BETA_MAX_PROJECTS_TOTAL) * 100));

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white" style={{ fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}>

      {/* ── 헤더 ── */}
      <PhotographerPageHeader crumbs={[{ label: "대시보드" }]} title="대시보드" />

      {/* ── 바디 ── */}
      <div className="flex gap-6 p-6 pb-16 items-start">

        {/* ── 메인 좌측 ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">

          {/* 1. 프로젝트 요약 카드 */}
          <div className="grid grid-cols-3 gap-4 items-stretch">
            {([
              { key: "all" as const,       label: "전체 프로젝트", mobileLabel: "전체",  count: dashCounts.all,       icon: <Layers size={16} className="text-zinc-400" />,         color: "zinc",    sub: null,                                                                              mobileSub: null },
              { key: "active" as const,    label: "진행중",        mobileLabel: "진행중", count: dashCounts.active,    icon: <Zap size={16} className="text-[#FF4D00]" />,            color: "brand",   sub: dashCounts.waiting > 0 ? `${dashCounts.waiting}건 고객 응답 대기` : null, mobileSub: dashCounts.waiting > 0 ? `${dashCounts.waiting}건 대기` : null },
              { key: "completed" as const, label: "완료",          mobileLabel: "완료",  count: dashCounts.completed, icon: <CheckCircle2 size={16} className="text-emerald-500" />, color: "emerald", sub: null,                                                                              mobileSub: null },
            ]).map((card) => {
              const isActive = dashFilter === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setDashFilter(card.key)}
                  className={`w-full text-left border rounded-2xl p-3 md:p-5 transition-all h-full flex flex-col ${
                    isActive
                      ? card.color === "brand"   ? "bg-[#FF4D00]/12 border-[#FF4D00]/40"
                        : card.color === "emerald" ? "bg-emerald-500/12 border-emerald-500/40"
                        : "bg-[#27272c] border-[#3f3f46]"
                      : card.color === "brand"   ? "bg-[#FF4D00]/5 border-[#FF4D00]/15 hover:bg-[#FF4D00]/10 hover:border-[#FF4D00]/30"
                        : card.color === "emerald" ? "bg-emerald-500/5 border-emerald-500/15 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                        : "bg-[#121215]/80 border-[#1a1a1e] hover:border-[#27272c]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 md:mb-3">
                    <span className="text-xs md:text-sm font-bold text-white flex items-center gap-1.5 md:gap-2">
                      {card.icon}
                      <span className="md:hidden">{card.mobileLabel}</span>
                      <span className="hidden md:inline">{card.label}</span>
                    </span>
                  </div>
                  <div className="flex items-end gap-1.5 md:gap-2 flex-1">
                    <span className="text-2xl md:text-3xl font-black text-white leading-none">{card.count}</span>
                    <span className="text-xs md:text-sm text-zinc-400 mb-0.5">
                      <span className="md:hidden">건</span>
                      <span className="hidden md:inline">{card.key === "all" ? "개" : card.key === "active" ? "건 작업중" : "건"}</span>
                    </span>
                  </div>
                  <div className="mt-1 md:mt-1.5 h-3 md:h-4 flex items-center gap-1 md:gap-1.5 text-[10px] md:text-[11px] text-amber-400/80">
                    <span className="md:hidden">{card.mobileSub && <><Clock size={9} className="inline mr-0.5" />{card.mobileSub}</>}</span>
                    <span className="hidden md:flex items-center gap-1.5">{card.sub && <><Clock size={10} />{card.sub}</>}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 2. 프로젝트 카드 그리드 */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">프로젝트</span>
              <span className="text-[10px] text-zinc-600">{filteredByDash.length}개</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {displayProjects.map((p) => <PhotoProjectCard key={p.id} project={p} />)}
            </div>
            {showViewAllBtn && (
              <Link
                href="/photographer/projects"
                className="flex items-center justify-center gap-2 px-6 py-4 bg-[#121215] border border-[#1a1a1e] hover:border-[#27272c] rounded-xl no-underline group transition-colors"
              >
                <span className="text-sm font-semibold text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  전체 프로젝트 보기 ({projects.length - 12}개 더)
                </span>
                <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </Link>
            )}
          </div>
        </div>

        {/* ── 우측 사이드바 ── */}
        <aside className="hidden lg:flex w-72 shrink-0 flex-col gap-4 sticky top-[92px]">

          {/* 사용량 패널 */}
          <div className="bg-[#121215] border border-[#1a1a1e] rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#1a1a1e]">
              <Activity size={12} className="text-zinc-500" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">사용량</span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-end">
                <span className="text-sm font-semibold text-white">프로젝트</span>
                <div className="text-sm font-mono">
                  <span className="text-white font-bold">{betaCount}</span>
                  <span className="text-zinc-600"> / {BETA_MAX_PROJECTS_TOTAL}</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-[#1a1a1e] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${betaPct}%`,
                    background: betaPct >= 100 ? RED : betaPct >= 80 ? ACCENT : "#fff",
                  }}
                />
              </div>
            </div>

            {betaCount >= BETA_MAX_PROJECTS_TOTAL ? (
              <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                <AlertCircle size={13} color={RED} className="shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-red-400 font-bold uppercase tracking-wide mb-1">한도 초과</div>
                  <div className="text-xs text-zinc-500 leading-relaxed">베타 프로젝트 한도에 도달했습니다.</div>
                </div>
              </div>
            ) : betaCount >= BETA_MAX_PROJECTS_TOTAL - 2 ? (
              <div className="bg-[#1a1a1e] rounded-xl p-3">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide mb-1">한도 근접</div>
                <div className="text-xs text-zinc-600 leading-relaxed">프로젝트 생성 한도에 근접했습니다.</div>
              </div>
            ) : null}
          </div>

          {/* 최근 활동 패널 — 프로젝트 중심 피드 */}
          <div className="bg-[#121215] border border-[#1a1a1e] rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#1a1a1e]">
              <Clock size={12} className="text-zinc-500" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">최근 활동</span>
            </div>

            {logs.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-4">아직 활동이 없습니다</p>
            ) : (() => {
              // 프로젝트별 그룹화 (최신 순 최대 4개 프로젝트)
              const seen = new Set<string>();
              const projectOrder: string[] = [];
              for (const log of logs) {
                if (!seen.has(log.projectId)) { seen.add(log.projectId); projectOrder.push(log.projectId); }
              }
              const top = projectOrder.slice(0, 4);
              return (
                <div className="flex flex-col gap-3">
                  {top.map((pid) => {
                    const group = logs.filter((l) => l.projectId === pid).slice(0, 3);
                    const first = group[0];
                    return (
                      <div
                        key={pid}
                        onClick={() => router.push(`/photographer/projects/${pid}`)}
                        className="border border-[#1a1a1e] hover:border-[#27272c] rounded-xl p-3 cursor-pointer transition-colors"
                      >
                        {/* 프로젝트명 + 고객 */}
                        <div className="mb-2.5">
                          <div className="text-[13px] font-bold text-white truncate leading-snug">
                            {first.projectName}
                          </div>
                          {first.customerName && (
                            <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                              {first.customerName}
                            </div>
                          )}
                        </div>
                        {/* 액션 목록 */}
                        <div className="flex flex-col gap-1.5">
                          {group.map((log) => {
                            const dotColor = LOG_DOT[log.action] ?? "#52525b";
                            const label = LOG_LABEL[log.action] ?? log.action;
                            return (
                              <div key={log.id} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                                  <span className="text-[11px] font-medium truncate" style={{ color: dotColor }}>{label}</span>
                                </div>
                                <span className="text-[10px] text-zinc-700 shrink-0 font-mono">{formatLogTime(log.createdAt)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </aside>
      </div>

      {/* 새 프로젝트 FAB — 프로젝트 목록과 동일 (모바일: 하단 네비 위, PC: 우하단) */}
      <button
        type="button"
        onClick={() => router.push("/photographer/projects/new")}
        aria-label="새 프로젝트"
        title="새 프로젝트"
        className="fixed z-40 right-5 bottom-20 md:right-8 md:bottom-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF4D00] text-white shadow-[0_4px_20px_rgba(255,77,0,0.4)] transition-transform active:scale-95 md:hover:scale-105 md:hover:shadow-[0_6px_28px_rgba(255,77,0,0.45)]"
      >
        <Plus size={24} strokeWidth={2} />
      </button>
    </div>
  );
}
