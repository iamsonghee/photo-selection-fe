"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Plus, Search, ChevronDown, Zap, Clock, CheckCircle2, Layers, MapPin, SlidersHorizontal } from "lucide-react";
import { getProjectsByPhotographerId } from "@/lib/db";
import { useProfile } from "@/contexts/ProfileContext";
import type { Project, ProjectStatus } from "@/types";
import { StatusPill } from "@/components/ui/StatusPill";
import { ProjectPipelineMiniBar } from "@/components/photographer/ProjectPipelineMiniBar";
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";

// ── constants ──────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: ProjectStatus[] = [
  "selecting", "confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2",
];

const WAITING_STATUSES: ProjectStatus[] = ["reviewing_v1", "reviewing_v2"];

// ── helpers ────────────────────────────────────────────────────────────────

function dday(deadline: string): { text: string; level: "ok" | "warn" | "danger" } {
  const diff = Math.ceil(
    (new Date(deadline).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (diff > 3)  return { text: `D-${String(diff).padStart(2, "0")}`, level: "ok" };
  if (diff > 0)  return { text: `D-${String(diff).padStart(2, "0")}`, level: "warn" };
  if (diff === 0) return { text: "D-Day", level: "danger" };
  return           { text: `D+${String(Math.abs(diff)).padStart(2, "0")}`, level: "danger" };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function getInitial(name: string): string {
  return name.trim().charAt(0);
}

type CTAConfig = {
  text: string;
  href: string | null;
  variant: "brand" | "secondary-purple" | "secondary-brand" | "secondary-rose" | "muted" | "dashed" | "disabled";
};

function getProjectCTA(project: Project): CTAConfig {
  const base = `/photographer/projects/${project.id}`;
  switch (project.status) {
    case "preparing":    return { text: "원본 업로드",   href: `${base}/upload`,    variant: "dashed" };
    case "selecting":    return { text: "셀렉 대기중",   href: null,                variant: "disabled" };
    case "confirmed":    return { text: "보정 시작",     href: `${base}/workflow`,  variant: "brand" };
    case "editing":      return { text: "작업 이어서",   href: `${base}/workflow`,  variant: "secondary-purple" };
    case "reviewing_v1": return { text: "피드백 확인",   href: `${base}/workflow`,  variant: "secondary-brand" };
    case "editing_v2":   return { text: "재보정 업로드", href: `${base}/workflow`,  variant: "secondary-rose" };
    case "reviewing_v2": return { text: "피드백 확인",   href: `${base}/workflow`,  variant: "secondary-brand" };
    case "delivered":    return { text: "완료됨",        href: `${base}/workflow`,  variant: "muted" };
    default:             return { text: "상세보기",      href: base,                variant: "secondary-brand" };
  }
}

function CTAButton({ cta, onClick }: { cta: CTAConfig; onClick?: () => void }) {
  const base = "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap";

  const variantCls: Record<CTAConfig["variant"], string> = {
    brand:             "bg-[#FF4D00] hover:bg-[#ff5e1a] text-black shadow-[0_0_15px_rgba(255,77,0,0.3)] hover:shadow-[0_0_20px_rgba(255,77,0,0.5)]",
    "secondary-purple": "bg-[#1a1a1e] hover:bg-[#27272c] border border-[#27272c] hover:border-[#3f3f46] text-white",
    "secondary-brand":  "bg-[#1a1a1e] hover:bg-[#27272c] border border-[#27272c] hover:border-[#3f3f46] text-white",
    "secondary-rose":   "bg-[#1a1a1e] hover:bg-[#27272c] border border-[#27272c] hover:border-rose-500/50 text-white",
    muted:             "bg-transparent text-zinc-500 hover:text-zinc-300 transition-colors",
    dashed:            "bg-[#0a0a0c] border-2 border-dashed border-[#27272c] hover:border-[#FF4D00]/50 hover:text-[#FF4D00] hover:bg-[#FF4D00]/5 text-zinc-400",
    disabled:          "bg-[#0a0a0c] border border-[#1a1a1e] text-zinc-600 cursor-not-allowed",
  };

  const iconCls: Record<CTAConfig["variant"], string> = {
    brand:              "text-black",
    "secondary-purple": "text-purple-400",
    "secondary-brand":  "text-[#FF4D00]",
    "secondary-rose":   "text-rose-400",
    muted:              "text-emerald-500",
    dashed:             "text-zinc-500",
    disabled:           "text-zinc-600",
  };

  if (cta.variant === "disabled" || !cta.href) {
    return (
      <button type="button" disabled className={`${base} ${variantCls[cta.variant]}`}>
        <span className={iconCls[cta.variant]}>{ctaIcon(cta.variant)}</span>
        {cta.text}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${variantCls[cta.variant]}`}
    >
      <span className={iconCls[cta.variant]}>{ctaIcon(cta.variant)}</span>
      {cta.text}
    </button>
  );
}

function ctaIcon(variant: CTAConfig["variant"]) {
  switch (variant) {
    case "brand":             return <Zap size={14} />;
    case "secondary-purple":  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>;
    case "secondary-brand":   return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>;
    case "secondary-rose":    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>;
    case "muted":             return <CheckCircle2 size={14} />;
    case "dashed":            return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>;
    case "disabled":          return <Clock size={14} />;
  }
}


function getCardAccent(status: ProjectStatus): string {
  switch (status) {
    case "editing":                       return "rgba(168,85,247,0.05)";
    case "editing_v2":                    return "rgba(244,63,94,0.05)";
    case "reviewing_v1":
    case "reviewing_v2":
    case "selecting":
    case "confirmed":                     return "rgba(255,77,0,0.05)";
    case "delivered":                     return "rgba(16,185,129,0.05)";
    default:                              return "transparent";
  }
}

function MobileProjectCard({ project, onNavigate }: { project: Project; onNavigate: (href: string) => void }) {
  const cta        = getProjectCTA(project);
  const isDelivered = project.status === "delivered";
  const dd         = dday(project.deadline);
  const ddCls      =
    dd.level === "danger" ? "text-rose-400 bg-rose-500/10 border-rose-500/20" :
    dd.level === "warn"   ? "text-amber-500 bg-amber-500/10 border-amber-500/20" :
    "text-zinc-500 bg-[#1a1a1e] border-[#27272c]";
  const base = `/photographer/projects/${project.id}`;
  const showDots = !["preparing", "selecting", "delivered"].includes(project.status);

  return (
    <div className="bg-[#121215] border border-[#1a1a1e] rounded-2xl p-4 flex flex-col gap-4 relative overflow-hidden">
      {/* corner accent */}
      <div
        className="absolute top-0 right-0 w-24 h-24 pointer-events-none rounded-bl-[100px]"
        style={{ background: getCardAccent(project.status) }}
      />

      {/* top: thumbnail + info */}
      <div className="flex gap-4">
        <div
          className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-[#27272c] shadow-md cursor-pointer"
          onClick={() => onNavigate(base)}
        >
          {project.thumbnailUrl ? (
            <img src={project.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#0a0a0c] flex flex-col items-center justify-center">
              <svg className="w-5 h-5 text-zinc-600 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[8px] text-zinc-500 font-medium">No Image</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                {project.displayId ?? project.id.slice(0, 8)}
              </span>
              {project.shootType && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#27272c] text-zinc-400 border border-[#1a1a1e] shrink-0">
                  {project.shootType}
                </span>
              )}
            </div>
            {isDelivered ? (
              <span className="text-[10px] font-bold font-mono text-zinc-500 bg-[#1a1a1e] border border-[#27272c] px-1.5 py-0.5 rounded shrink-0">완료</span>
            ) : (
              <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border shrink-0 ${ddCls}`}>{dd.text}</span>
            )}
          </div>
          <h3 className={`text-[15px] font-bold truncate mb-1 ${isDelivered ? "text-zinc-400" : "text-white"}`}>
            {project.name}
          </h3>
          <p className="text-xs text-zinc-400 flex items-center gap-1.5 truncate">
            <span className="w-4 h-4 rounded-full bg-[#27272c] flex items-center justify-center text-[8px] font-bold text-white shrink-0">
              {getInitial(project.customerName || "?")}
            </span>
            {project.customerName || "—"}
          </p>
        </div>
      </div>

      {/* status box */}
      <div className="bg-[#0a0a0c]/50 rounded-xl p-3 border border-[#1a1a1e]/50 flex flex-col gap-2 items-start">
        <StatusPill status={project.status} />
        <div className="self-stretch">
          <ProjectPipelineMiniBar status={project.status} variant="full" />
        </div>
      </div>

      {/* CTA */}
      <div className="flex gap-2">
        {cta.variant === "disabled" ? (
          <button type="button" disabled className="flex-1 py-2.5 rounded-xl bg-[#121215] border border-[#1a1a1e] text-zinc-600 text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed">
            <Clock size={16} />
            {cta.text}
          </button>
        ) : cta.variant === "dashed" ? (
          <button type="button" onClick={() => cta.href && onNavigate(cta.href)}
            className="flex-1 py-2.5 rounded-xl bg-[#0a0a0c] border-2 border-dashed border-zinc-600 text-zinc-300 text-sm font-bold flex items-center justify-center gap-2 active:bg-[#121215]">
            {ctaIcon(cta.variant)}
            {cta.text}
          </button>
        ) : cta.variant === "brand" ? (
          <button type="button" onClick={() => cta.href && onNavigate(cta.href)}
            className="flex-1 py-2.5 rounded-xl bg-[#FF4D00] active:bg-[#e64500] text-white text-sm font-bold shadow-[0_0_15px_rgba(255,77,0,0.2)] flex items-center justify-center gap-2">
            {ctaIcon(cta.variant)}
            {cta.text}
          </button>
        ) : cta.variant === "muted" ? (
          <button type="button" onClick={() => cta.href && onNavigate(cta.href)}
            className="flex-1 py-2.5 rounded-xl text-zinc-500 text-sm font-bold flex items-center justify-center gap-2 active:text-zinc-300">
            {ctaIcon(cta.variant)}
            {cta.text}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => cta.href && onNavigate(cta.href)}
              className="flex-1 py-2.5 rounded-xl bg-[#1a1a1e] border border-[#27272c] active:bg-[#27272c] text-white text-sm font-bold flex items-center justify-center gap-2">
              <span className={
                cta.variant === "secondary-purple" ? "text-purple-400" :
                cta.variant === "secondary-rose"   ? "text-rose-400" : "text-[#FF4D00]"
              }>
                {ctaIcon(cta.variant)}
              </span>
              {cta.text}
            </button>
            {showDots && (
              <button type="button" onClick={() => onNavigate(base)}
                className="w-11 h-11 shrink-0 rounded-xl bg-[#1a1a1e] border border-[#27272c] flex items-center justify-center text-zinc-400 active:bg-[#27272c]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos,    setMenuPos]    = useState<{ top: number; right: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clockStr, setClockStr]   = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom]   = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo,   setDateTo]     = useState(() => new Date().toISOString().slice(0, 10));
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef   = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "waiting" | "completed">("all");
  const [sortBy,   setSortBy]     = useState<"latest" | "deadline" | "name" | "shoot_date">("latest");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClockStr(
        `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile?.id) { setLoading(false); return; }
    getProjectsByPhotographerId(profile.id)
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile?.id, profileLoading]);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(new Date().toISOString().slice(0, 10));
    setActiveTab("all");
    setSortBy("latest");
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  const handleDelete = useCallback(async (project: Project) => {
    setOpenMenuId(null);
    if (!confirm(`"${project.name}" 프로젝트를 삭제하시겠습니까?\n\n업로드된 모든 사진 파일도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingId(project.id);
    try {
      const res = await fetch(`/api/photographer/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "삭제 실패");
      }
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const tabCounts = useMemo(() => ({
    all:       projects.length,
    active:    projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
    waiting:   projects.filter((p) => WAITING_STATUSES.includes(p.status)).length,
    completed: projects.filter((p) => p.status === "delivered").length,
  }), [projects]);

  const filtered = useMemo(() => {
    let result = [...projects];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.customerName.toLowerCase().includes(q)
      );
    }
    if (dateFrom) result = result.filter((p) => new Date(p.shootDate) >= new Date(dateFrom));
    if (dateTo)   result = result.filter((p) => new Date(p.shootDate) <= new Date(dateTo));
    if (activeTab === "active")    result = result.filter((p) => ACTIVE_STATUSES.includes(p.status));
    if (activeTab === "waiting")   result = result.filter((p) => WAITING_STATUSES.includes(p.status));
    if (activeTab === "completed") result = result.filter((p) => p.status === "delivered");
    if (sortBy === "latest")     result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sortBy === "deadline")   result.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    if (sortBy === "name")       result.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    if (sortBy === "shoot_date") result.sort((a, b) => new Date(b.shootDate).getTime() - new Date(a.shootDate).getTime());
    return result;
  }, [projects, searchQuery, dateFrom, dateTo, activeTab, sortBy]);

  const STAT_CARDS = [
    { key: "all" as const,       label: "전체 프로젝트", count: tabCounts.all,       icon: <Layers size={16} className="text-zinc-400" />,         color: "zinc",    ping: false },
    { key: "active" as const,    label: "진행중",         count: tabCounts.active,    icon: <Zap size={16} className="text-[#FF4D00]" />,            color: "brand",   ping: true  },
    { key: "waiting" as const,   label: "고객 대기",       count: tabCounts.waiting,   icon: <Clock size={16} className="text-amber-500" />,          color: "amber",   ping: false },
    { key: "completed" as const, label: "완료",           count: tabCounts.completed, icon: <CheckCircle2 size={16} className="text-emerald-500" />, color: "emerald", ping: false },
  ] as const;

  const colCls = "grid-cols-[minmax(280px,2fr)_minmax(140px,1fr)_minmax(160px,1.5fr)_minmax(100px,1fr)_minmax(160px,auto)]";

  return (
    <>
    {/* ── Mobile View ──────────────────────────────────────────── */}
    <div
      className="md:hidden bg-[#0a0a0c] text-white"
      style={{ fontFamily: "var(--font-inter, sans-serif)" }}
    >
      <div>

        {/* stat cards */}
        <div className="flex overflow-x-auto gap-3 px-5 pt-5 pb-4 snap-x hide-scrollbar">
          {STAT_CARDS.map((card) => {
            const isActive = activeTab === card.key;
            const colors = {
              zinc:    { border: isActive ? "#3f3f46" : "#1a1a1e", bg: isActive ? "#27272c" : "#121215" },
              brand:   { border: isActive ? "rgba(255,77,0,0.3)" : "rgba(255,77,0,0.15)", bg: isActive ? "rgba(255,77,0,0.12)" : "rgba(255,77,0,0.06)" },
              amber:   { border: isActive ? "rgba(245,158,11,0.3)" : "rgba(245,158,11,0.15)", bg: isActive ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.05)" },
              emerald: { border: isActive ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.15)", bg: isActive ? "rgba(16,185,129,0.1)" : "rgba(16,185,129,0.05)" },
            }[card.color];
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setActiveTab(card.key)}
                className="snap-start shrink-0 w-[140px] rounded-2xl p-4 flex flex-col justify-between shadow-sm"
                style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
              >
                <span className="text-xs font-semibold flex items-center gap-1.5 mb-2"
                  style={{ color: card.color === "zinc" ? "#a1a1aa" : card.color === "brand" ? "#ff8a4c" : card.color === "amber" ? "#fbbf24" : "#34d399" }}>
                  {card.icon}
                  {card.label}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white leading-none">{card.count}</span>
                  {card.key !== "all" && <span className="text-[10px] font-medium text-zinc-500">건</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* search + filter */}
        <div className="px-5 pb-4 flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="프로젝트명, 고객명 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#121215] border border-[#1a1a1e] text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]/20 placeholder:text-zinc-600 transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => setMobileFilterOpen((v) => !v)}
            className={`w-12 h-12 flex items-center justify-center bg-[#121215] border rounded-xl transition-colors shrink-0 ${
              mobileFilterOpen ? "border-[#FF4D00] text-[#FF4D00]" : "border-[#1a1a1e] text-zinc-400"
            }`}
          >
            <SlidersHorizontal size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* filter panel */}
        {mobileFilterOpen && (
          <div className="px-5 pb-4 flex gap-2 overflow-x-auto hide-scrollbar">
            {(["all", "active", "waiting", "completed"] as const).map((key) => {
              const labels = { all: "전체", active: "진행중", waiting: "고객대기", completed: "완료" };
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    activeTab === key
                      ? "bg-[#FF4D00]/15 text-[#FF4D00] border-[#FF4D00]/30"
                      : "bg-[#121215] text-zinc-400 border-[#1a1a1e]"
                  }`}
                >
                  {labels[key]}
                </button>
              );
            })}
          </div>
        )}

        {/* cards list */}
        <div className="px-5 pb-6 flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-zinc-600 text-sm font-mono">SYS.LOADING…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Layers size={32} className="text-zinc-700" />
              <p className="text-zinc-500 text-sm text-center">
                {projects.length > 0 ? "검색 결과가 없습니다." : "아직 프로젝트가 없습니다."}
              </p>
            </div>
          ) : (
            filtered.map((project) => (
              <MobileProjectCard
                key={project.id}
                project={project}
                onNavigate={(href) => router.push(href)}
              />
            ))
          )}
        </div>
      </div>
    </div>

    {/* FAB — mobile only, fixed above bottom nav */}
    <button
      type="button"
      onClick={() => router.push("/photographer/projects/new")}
      className="fixed md:hidden right-5 bg-[#FF4D00] rounded-full shadow-[0_4px_20px_rgba(255,77,0,0.4)] flex items-center justify-center text-white active:scale-95 transition-transform z-40"
      style={{ bottom: 80, width: 56, height: 56 }}
    >
      <Plus size={24} strokeWidth={2} />
    </button>

    {/* ── Desktop View ─────────────────────────────────────────── */}
    <div
      className="hidden md:block min-h-screen bg-[#0a0a0c] text-white"
      style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}
    >
      {/* ── header ── */}
      <PhotographerPageHeader
        crumbs={[
          { label: "프로젝트", href: "/photographer/projects" },
          { label: "데이터베이스" },
        ]}
        title="프로젝트 목록"
        stats={[
          { label: "전체",  value: projects.length },
          { label: "진행중", value: tabCounts.active, accent: true },
        ]}
        actions={
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] text-zinc-500 font-mono" style={{ fontFamily: "var(--font-mono, monospace)" }}>SYS_TIME</div>
              <div className="text-sm font-bold text-white mt-0.5 tracking-wider" style={{ fontFamily: "var(--font-mono, monospace)" }}>{clockStr}</div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/photographer/projects/new")}
              className="flex items-center gap-2 bg-[#FF4D00] hover:bg-[#ff5e1a] text-black px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-[#FF4D00]/20 transition-all hover:-translate-y-0.5"
            >
              <Plus size={16} />
              새 프로젝트
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-6 max-w-[1600px] mx-auto">

        {/* ── stat cards ── */}
        <div className="grid grid-cols-4 gap-4">
          {STAT_CARDS.map((card) => {
            const isActive = activeTab === card.key;
            const cardCls = isActive
              ? card.color === "brand"
                ? "bg-[#FF4D00]/10 border-[#FF4D00]/30"
                : card.color === "amber"
                ? "bg-amber-500/10 border-amber-500/30"
                : card.color === "emerald"
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-[#27272c] border-[#3f3f46]"
              : "bg-[#121215]/80 hover:bg-[#121215] border-[#1a1a1e] hover:border-[#27272c]";

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setActiveTab(card.key)}
                className={`${cardCls} border rounded-2xl p-5 text-left transition-all`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-white flex items-center gap-2">
                    {card.icon}
                    {card.label}
                  </span>
                  {card.ping && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF4D00] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF4D00]" />
                    </span>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <span
                    className={`text-3xl font-black leading-none ${
                      card.color === "brand"   ? "text-white" :
                      card.color === "amber"   ? "text-white" :
                      card.color === "emerald" ? "text-white" :
                      "text-white"
                    }`}
                  >
                    {card.count}
                  </span>
                  {card.key === "active" && <span className="text-sm text-zinc-400 mb-1">건 작업중</span>}
                  {card.key === "waiting" && <span className="text-sm text-zinc-400 mb-1">고객 응답 대기</span>}
                  {card.key === "completed" && <span className="text-sm text-zinc-400 mb-1">이번 달 완료</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── filter bar ── */}
        <div className="bg-[#121215]/80 border border-[#1a1a1e] rounded-2xl p-2 flex flex-wrap items-center justify-between gap-3">
          {/* search */}
          <div className="flex-1 min-w-[260px] relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="프로젝트명, 고객명, ID 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0a0a0c]/50 border border-[#1a1a1e] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]/30 transition-all placeholder:text-zinc-600"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* date range */}
            <div
              className="flex items-center bg-[#0a0a0c]/50 border border-[#1a1a1e] rounded-xl px-3 py-2 gap-2 h-11 cursor-pointer"
              onClick={() => dateFromRef.current?.showPicker?.()}
            >
              <span className="text-xs text-zinc-500" style={{ fontFamily: "var(--font-mono, monospace)" }}>촬영일:</span>
              <div className="relative">
                <span className="text-xs text-zinc-400 pointer-events-none" style={{ fontFamily: "var(--font-mono, monospace)" }}>{dateFrom || "시작"}</span>
                <input
                  ref={dateFromRef}
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLInputElement).showPicker?.(); }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-20"
                />
              </div>
              <span className="text-zinc-600 text-xs">~</span>
              <div className="relative">
                <span className="text-xs text-zinc-400 pointer-events-none" style={{ fontFamily: "var(--font-mono, monospace)" }}>{dateTo || "종료"}</span>
                <input
                  ref={dateToRef}
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLInputElement).showPicker?.(); }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-20"
                />
              </div>
            </div>

            {/* status tabs */}
            <div className="flex bg-[#0a0a0c]/50 p-1 rounded-xl border border-[#1a1a1e] h-11 items-center">
              {(["all", "active", "waiting", "completed"] as const).map((key) => {
                const labels = { all: "전체", active: "진행중", waiting: "고객대기", completed: "완료" };
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === key
                        ? "bg-[#27272c] text-white shadow-sm"
                        : "text-zinc-400 hover:text-white hover:bg-[#27272c]/50"
                    }`}
                  >
                    {labels[key]}
                  </button>
                );
              })}
            </div>

            {/* sort */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-[#0a0a0c]/50 border border-[#1a1a1e] text-zinc-300 text-sm rounded-xl px-4 py-2 h-11 focus:outline-none focus:border-[#FF4D00] appearance-none pr-8 cursor-pointer"
              >
                <option value="latest">최신 등록순</option>
                <option value="deadline">마감일 임박순</option>
                <option value="shoot_date">촬영일순</option>
                <option value="name">이름순</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* ── table ── */}
        <div className="bg-[#121215]/50 border border-[#1a1a1e] rounded-2xl overflow-hidden">
          {/* header row */}
          <div
            className={`grid ${colCls} gap-4 px-6 py-3 border-b border-[#1a1a1e] bg-[#0a0a0c]/50`}
            style={{ fontFamily: "var(--font-inter, sans-serif)" }}
          >
            {(["프로젝트 정보", "고객 / 촬영일", "현재 상태 / 진행률", "마감 기한"] as const).map((label) => (
              <div key={label} className="text-xs font-semibold text-zinc-400">{label}</div>
            ))}
            <div className="text-xs font-semibold text-zinc-400 text-right">작업 관리</div>
          </div>

          {/* body */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-zinc-600 text-sm" style={{ fontFamily: "var(--font-mono, monospace)" }}>
                SYS.LOADING…
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Layers size={32} className="text-zinc-700" />
              <p className="text-zinc-500 text-sm">
                {projects.length > 0 ? (
                  <>
                    검색 결과가 없습니다.{" "}
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-[#FF4D00] underline underline-offset-2"
                    >
                      필터 초기화
                    </button>
                  </>
                ) : "아직 프로젝트가 없습니다."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[#1a1a1e]/50">
              {filtered.map((project) => {
                const cta = getProjectCTA(project);
                const dd  = dday(project.deadline);
                const isDelivered = project.status === "delivered";
                const ddCls =
                  dd.level === "danger" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                  dd.level === "warn"   ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                  "bg-[#121215] text-zinc-500 border-[#1a1a1e]";

                return (
                  <div
                    key={project.id}
                    className={`grid ${colCls} gap-4 px-6 py-5 hover:bg-[#27272c]/20 transition-colors items-center group`}
                  >
                    {/* col 1: project info */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* thumbnail */}
                      <div
                        className="w-14 h-14 rounded-xl overflow-hidden border border-[#27272c] shrink-0 bg-[#121215] flex items-center justify-center cursor-pointer hover:border-[#FF4D00] transition-colors"
                        onClick={() => router.push(`/photographer/projects/${project.id}`)}
                      >
                        {project.thumbnailUrl ? (
                          <img
                            src={project.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span
                            className="text-lg font-black text-zinc-600 group-hover:text-zinc-400 transition-colors"
                            style={{ fontFamily: "var(--font-inter, sans-serif)" }}
                          >
                            {project.name.charAt(0)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[11px] text-zinc-500 bg-[#0a0a0c] px-1.5 py-0.5 rounded border border-[#1a1a1e]"
                            style={{ fontFamily: "var(--font-mono, monospace)" }}
                          >
                            {project.displayId ?? project.id.slice(0, 12).toUpperCase()}
                          </span>
                          {project.shootType && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#27272c] text-zinc-400 border border-[#1a1a1e]">
                              {project.shootType}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push(`/photographer/projects/${project.id}`)}
                          className={`text-base font-bold tracking-tight truncate text-left transition-colors ${
                            isDelivered ? "text-zinc-400 hover:text-zinc-300" : "text-white hover:text-[#FF4D00]"
                          }`}
                        >
                          {project.name}
                        </button>
                        {project.location && (
                          <p className="text-xs text-zinc-500 flex items-center gap-1 truncate">
                            <MapPin size={12} className="shrink-0" />
                            {project.location}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* col 2: customer / shoot date */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full bg-[#27272c] flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ fontFamily: "var(--font-inter, sans-serif)" }}
                        >
                          {getInitial(project.customerName || "?")}
                        </div>
                        <span className={`text-sm font-medium ${isDelivered ? "text-zinc-400" : "text-zinc-300"}`}>
                          {project.customerName || "—"}
                        </span>
                      </div>
                      <span
                        className={`text-xs ${isDelivered ? "text-zinc-600" : "text-zinc-500"}`}
                        style={{ fontFamily: "var(--font-mono, monospace)" }}
                      >
                        {formatDate(project.shootDate)} 촬영
                      </span>
                    </div>

                    {/* col 3: status / progress */}
                    <div className="flex flex-col gap-2 items-start">
                      <StatusPill
                        status={project.status}
                        photoCount={project.photoCount ?? 0}
                        requiredCount={project.requiredCount ?? 0}
                      />
                      <div className="self-stretch">
                        <ProjectPipelineMiniBar status={project.status} variant="full" />
                      </div>
                    </div>

                    {/* col 4: deadline */}
                    <div className="flex items-center">
                      {isDelivered ? (
                        <span className="inline-flex px-2 py-1 rounded text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          style={{ fontFamily: "var(--font-mono, monospace)" }}>
                          납품완료
                        </span>
                      ) : (
                        <span
                          className={`inline-flex px-2 py-1 rounded text-xs font-bold border ${ddCls}`}
                          style={{ fontFamily: "var(--font-mono, monospace)" }}
                        >
                          {dd.text}
                        </span>
                      )}
                    </div>

                    {/* col 5: actions */}
                    <div className="flex items-center justify-end gap-2">
                      <CTAButton
                        cta={cta}
                        onClick={() => cta.href && router.push(cta.href)}
                      />
                      <div className="relative">
                        <button
                          type="button"
                          disabled={deletingId === project.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuId === project.id) {
                              setOpenMenuId(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenuPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right });
                              setOpenMenuId(project.id);
                            }
                          }}
                          className="w-9 h-9 rounded-xl hover:bg-[#27272c] flex items-center justify-center text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-[#27272c] disabled:opacity-40"
                        >
                          {deletingId === project.id ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── dropdown portal ── */}
        {openMenuId && menuPos && typeof window !== "undefined" && createPortal(
          <div
            className="fixed z-[9999] bg-[#121215] border border-[#27272c] rounded-xl shadow-xl overflow-hidden"
            style={{ top: menuPos.top, right: menuPos.right, minWidth: 160 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                router.push(`/photographer/projects/${openMenuId}`);
                setOpenMenuId(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-[#27272c] hover:text-white transition-colors text-left"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              상세정보 수정
            </button>
            <div className="h-px bg-[#1a1a1e]" />
            <button
              type="button"
              onClick={() => {
                const project = projects.find((p) => p.id === openMenuId);
                if (project) handleDelete(project);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              프로젝트 삭제
            </button>
          </div>,
          document.body
        )}

        {/* ── footer count ── */}
        {!loading && (
          <div
            className="flex justify-between items-center text-[10px] text-zinc-600 uppercase tracking-wide"
            style={{ fontFamily: "var(--font-mono, monospace)" }}
          >
            <span>표시중: {String(filtered.length).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}</span>
            <span>시스템 준비완료</span>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
