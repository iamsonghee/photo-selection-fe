"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, AlertCircle, ChevronDown, ChevronRight, Clock, Activity,
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
function ProjectCard({ project }: { project: Project }) {
  const router    = useRouter();
  const photoCount = project.photoCount ?? 0;
  const reqCount  = project.requiredCount ?? 0;
  const { text: ddayText, warn } = dday(project.deadline);
  const stepLabel  = getPipelineStepLabel(project.status);
  const isDelivered = project.status === "delivered";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/photographer/projects/${project.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/photographer/projects/${project.id}`);
        }
      }}
      className="bg-[#121215] border border-[#1a1a1e] hover:border-[#27272c] rounded-2xl p-4 cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-[#FF4D00]/50"
      style={{ opacity: isDelivered ? 0.6 : 1 }}
    >
      {/* 상단: badge + name + customer + d-day */}
      <div className="flex items-center gap-2 min-w-0 mb-3">
        <div className="shrink-0">
          <StatusPill status={project.status} photoCount={photoCount} requiredCount={reqCount} />
        </div>
        <span className="text-sm font-bold text-white truncate min-w-0 flex-1">
          {project.name}
        </span>
        <span className="text-xs text-zinc-500 shrink-0 truncate max-w-[72px]">
          {project.customerName || "—"}
        </span>
        <div className="shrink-0 ml-auto">
          {isDelivered ? (
            <span className="text-[10px] text-zinc-600 border border-zinc-800 rounded-lg px-2 py-1">
              완료
            </span>
          ) : (
            <span
              className="text-[11px] font-bold rounded-lg px-2 py-1 border"
              style={{
                color: warn ? ACCENT : "#71717a",
                borderColor: warn ? `${ACCENT}40` : "#27272c",
                background: warn ? "rgba(255,77,0,0.06)" : "transparent",
              }}
            >
              {ddayText}
            </span>
          )}
        </div>
      </div>

      {/* 파이프라인 바 */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] text-zinc-500 font-medium">{stepLabel}</span>
          <span className="text-[10px] text-zinc-600">
            {(() => {
              if (project.status === "preparing") return photoCount > 0 ? `${photoCount}장` : "";
              if (["selecting", "confirmed", "editing", "editing_v2"].includes(project.status)) {
                return reqCount > 0 ? `${photoCount} / ${reqCount}장` : photoCount > 0 ? `${photoCount}장` : "";
              }
              if (project.status === "delivered" && project.shootDate) {
                return new Date(project.shootDate).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
              }
              return "";
            })()}
          </span>
        </div>
        <ProjectPipelineMiniBar status={project.status} variant="full" />
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

// ── SectionHeader ──────────────────────────────────────────
function SectionHeader({
  title, count, dotColor, open, onToggle,
  totalNote,
}: {
  title: string; count: number;
  dotColor: string;
  open: boolean; onToggle: () => void;
  totalNote?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-[#121215] border border-[#1a1a1e] hover:border-[#27272c] rounded-xl transition-colors text-left"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        <span className="text-xs font-semibold text-zinc-300 tracking-wide">{title}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#1a1a1e] text-zinc-500">
          {count}
        </span>
        {totalNote && (
          <span className="text-[10px] text-zinc-700">{totalNote}</span>
        )}
      </div>
      <ChevronDown
        size={14}
        className="text-zinc-600 transition-transform"
        style={{ transform: open ? "rotate(180deg)" : "none" }}
      />
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [loading, setLoading]   = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs]         = useState<ProjectLogItem[]>([]);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["pending", "active"]));

  const toggleSection = (id: string) => setOpenSections((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

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
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="text-xs text-zinc-600 tracking-widest uppercase">로딩 중…</div>
      </div>
    );
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

  const sortedAll = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const displayProjects = sortedAll.slice(0, 6);
  const showViewAllBtn  = projects.length > 6;

  const preparingProjects = displayProjects.filter((p) => p.status === "preparing");
  const activeProjects    = displayProjects.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const recentDelivered   = displayProjects.filter((p) => p.status === "delivered").slice(0, 1);
  const totalDelivered    = projects.filter((p) => p.status === "delivered").length;

  const confirmedCount  = projects.filter((p) => p.status === "confirmed").length;
  const revisionCount   = projects.filter((p) => p.status === "editing_v2").length;
  const reviewingCount  = projects.filter((p) => p.status === "reviewing_v1" || p.status === "reviewing_v2").length;
  const inviteReadyProjects = projects.filter(
    (p) => p.status === "preparing" && (p.photoCount ?? 0) >= (p.requiredCount ?? Infinity)
  );
  const inviteReadyCount = inviteReadyProjects.length;
  const inviteReadyHref  = inviteReadyProjects.length === 1
    ? `/photographer/projects/${inviteReadyProjects[0].id}`
    : "/photographer/projects";
  const hasAction = confirmedCount + revisionCount + reviewingCount + inviteReadyCount > 0;

  const betaCount = projects.length;
  const betaPct   = Math.min(100, Math.round((betaCount / BETA_MAX_PROJECTS_TOTAL) * 100));

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white" style={{ fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}>

      {/* ── 헤더 ── */}
      <PhotographerPageHeader
        crumbs={[{ label: "대시보드" }]}
        title="대시보드"
        actions={
          <button
            type="button"
            onClick={() => router.push("/photographer/projects/new")}
            className="flex items-center gap-2 bg-[#FF4D00] hover:bg-[#ff5e1a] text-black px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-[#FF4D00]/20 transition-all hover:-translate-y-0.5"
          >
            <Plus size={14} />
            새 프로젝트
          </button>
        }
      />

      {/* ── 바디 ── */}
      <div className="flex gap-6 p-6 pb-16 items-start">

        {/* ── 메인 좌측 ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">

          {/* 1. 처리 필요 */}
          {hasAction && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">처리 필요</span>
                <div className="flex-1 h-px bg-[#1a1a1e]" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {confirmedCount > 0 && (
                  <ActionCard count={confirmedCount} label="고객 확정" sub="CONFIRMED" numColor={ACCENT} />
                )}
                {revisionCount > 0 && (
                  <ActionCard count={revisionCount} label="재보정 요청" sub="EDIT_REQ" numColor={ACCENT} />
                )}
                {reviewingCount > 0 && (
                  <ActionCard count={reviewingCount} label="검토 중" sub="REVIEWING" numColor="#71717a" />
                )}
                {inviteReadyCount > 0 && (
                  <ActionCard
                    count={inviteReadyCount} label="초대 대기" sub="READY"
                    numColor="#52525b" href={inviteReadyHref}
                  />
                )}
              </div>
            </section>
          )}

          {/* 2. 프로젝트 목록 */}
          <div className="flex flex-col gap-3">

            {preparingProjects.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionHeader
                  title="대기중" count={preparingProjects.length}
                  dotColor="#52525b"
                  open={openSections.has("pending")}
                  onToggle={() => toggleSection("pending")}
                />
                {openSections.has("pending") && (
                  <div className="flex flex-col gap-2 pl-1">
                    {preparingProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                )}
              </div>
            )}

            {activeProjects.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionHeader
                  title="진행중" count={activeProjects.length}
                  dotColor={ACCENT}
                  open={openSections.has("active")}
                  onToggle={() => toggleSection("active")}
                />
                {openSections.has("active") && (
                  <div className="flex flex-col gap-2 pl-1">
                    {activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                )}
              </div>
            )}

            {recentDelivered.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionHeader
                  title="최근완료" count={recentDelivered.length}
                  dotColor="#3f3f46"
                  totalNote={totalDelivered > 1 ? `전체 ${totalDelivered}건` : undefined}
                  open={openSections.has("delivered")}
                  onToggle={() => toggleSection("delivered")}
                />
                {openSections.has("delivered") && (
                  <div className="flex flex-col gap-2 pl-1">
                    {recentDelivered.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                )}
              </div>
            )}

            {showViewAllBtn && (
              <Link
                href="/photographer/projects"
                className="flex items-center justify-center gap-2 px-6 py-4 bg-[#121215] border border-[#1a1a1e] hover:border-[#27272c] rounded-xl no-underline group transition-colors"
              >
                <span className="text-sm font-semibold text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  전체 프로젝트 보기
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

          {/* 최근 활동 패널 */}
          <div className="bg-[#121215] border border-[#1a1a1e] rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#1a1a1e]">
              <Clock size={12} className="text-zinc-500" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">최근 활동</span>
            </div>

            {logs.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-4">아직 활동이 없습니다</p>
            ) : (
              <div className="flex flex-col gap-4">
                {logs.slice(0, 8).map((log) => {
                  const dotColor = LOG_DOT[log.action] ?? "#52525b";
                  const label    = LOG_LABEL[log.action] ?? log.action;
                  return (
                    <div
                      key={log.id}
                      className="relative pl-4 border-l border-[#1a1a1e]"
                    >
                      <div
                        className="absolute left-[-5px] top-[4px] w-2 h-2 rounded-full bg-[#0a0a0c] border"
                        style={{ borderColor: dotColor }}
                      />
                      <div className="text-[10px] text-zinc-700 mb-0.5">{formatLogTime(log.createdAt)}</div>
                      <div className="text-xs font-semibold" style={{ color: dotColor }}>{label}</div>
                      {log.projectName && (
                        <div className="text-[11px] text-zinc-600 truncate mt-0.5">{log.projectName}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
