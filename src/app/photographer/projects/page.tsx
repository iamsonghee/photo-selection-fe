"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ChevronDown, Image as ImageIcon, Check, Calendar,
  ChevronRight, SlidersHorizontal, PackageCheck, Loader2, CheckCircle,
} from "lucide-react";
import { format, differenceInDays, startOfMonth, subMonths } from "date-fns";
import { supabase } from "@/lib/supabase";
import { getPhotographerIdByAuthId, getProjectsByPhotographerId } from "@/lib/db";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/project-status";
import { ProjectProgressBar } from "@/components/ProjectProgressBar";
import type { Project, ProjectStatus } from "@/types";
import { PHOTOGRAPHER_THEME as C, PS_DISPLAY, PS_FONT } from "@/lib/photographer-theme";

// ── 상수 ──────────────────────────────────────────────────────
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

const ACTIVE_STATUSES: ProjectStatus[] = ["selecting","confirmed","editing","reviewing_v1","editing_v2","reviewing_v2"];

const DATE_FILTER_OPTIONS = [
  { value: "all",        label: "전체" },
  { value: "this_month", label: "이번 달" },
  { value: "last_month", label: "지난 달" },
  { value: "3months",    label: "3개월" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "전체 상태" },
  ...PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] })),
];

const SORT_OPTIONS = [
  { value: "latest",     label: "최신순" },
  { value: "deadline",   label: "마감 임박순" },
  { value: "name",       label: "이름순" },
  { value: "shoot_date", label: "촬영일순" },
];

// ── 헬퍼 ──────────────────────────────────────────────────────
// ── preparing 상태 3단계 분기 헬퍼 ──────────────────────────
function getPreparingBadge(photoCount: number, requiredCount: number): { label: string; color: string } {
  if (photoCount === 0) {
    return { label: "업로드 전", color: C.dim };
  } else if (photoCount < requiredCount) {
    return { label: "업로드 중", color: C.steel };
  } else {
    return { label: "초대 활성화 필요", color: C.orange };
  }
}

function getPreparingBorderColor(photoCount: number, requiredCount: number): string {
  if (photoCount === 0) return C.dim;
  if (photoCount < requiredCount) return C.steel;
  return C.orange;
}

function getCardBorderColor(status: ProjectStatus, photoCount?: number, requiredCount?: number): string {
  if (status === "preparing") {
    return getPreparingBorderColor(photoCount ?? 0, requiredCount ?? Infinity);
  }
  switch (status) {
    case "selecting":    return C.steel;
    case "confirmed":    return C.green;
    case "editing":
    case "editing_v2":   return C.orange;
    case "reviewing_v1":
    case "reviewing_v2": return C.steelLt;
    case "delivered":    return "rgba(46,213,115,0.4)";
  }
}

function getBadgeStyle(status: ProjectStatus, photoCount?: number, requiredCount?: number): React.CSSProperties {
  if (status === "preparing") {
    const pc = photoCount ?? 0;
    const rc = requiredCount ?? Infinity;
    if (pc === 0) {
      return { background: C.surface3, color: C.dim, border: `1px solid rgba(58,90,110,0.3)` };
    } else if (pc < rc) {
      return { background: "rgba(79,126,255,0.12)", color: C.steel, border: `1px solid rgba(79,126,255,0.25)` };
    } else {
      return { background: "rgba(245,166,35,0.12)", color: C.orange, border: `1px solid rgba(245,166,35,0.3)` };
    }
  }
  switch (status) {
    case "selecting":
      return { background: "rgba(79,126,255,0.15)", color: C.steel, border: "1px solid rgba(79,126,255,0.3)" };
    case "confirmed":
      return { background: "rgba(46,213,115,0.12)", color: C.green, border: "1px solid rgba(46,213,115,0.25)" };
    case "editing":
    case "editing_v2":
      return { background: "rgba(245,166,35,0.12)", color: C.orange, border: "1px solid rgba(245,166,35,0.3)" };
    case "reviewing_v1":
    case "reviewing_v2":
      return { background: "rgba(141,184,212,0.12)", color: C.steelLt, border: "1px solid rgba(141,184,212,0.25)" };
    case "delivered":
      return { background: C.greenDim, color: C.green, border: "1px solid rgba(46,213,115,0.3)" };
  }
}

function getBadgeLabel(status: ProjectStatus, photoCount: number, requiredCount: number): string {
  if (status === "preparing") {
    return getPreparingBadge(photoCount, requiredCount).label;
  }
  return PROJECT_STATUS_LABELS[status];
}

function getDDayInfo(deadline: string): { label: string; variant: "ok" | "warn" | "over" } {
  const d = differenceInDays(new Date(deadline), new Date());
  if (d < 0)  return { label: "D-Day 초과", variant: "over" };
  if (d === 0) return { label: "D-Day", variant: "ok" };
  if (d <= 3)  return { label: `D+${d} · 임박`, variant: "warn" };
  return { label: `D+${d}`, variant: "ok" };
}

const DDAY_STYLES: Record<"ok"|"warn"|"over", React.CSSProperties> = {
  ok:   { color: C.muted,   background: C.surface3 },
  warn: { color: C.orange,  background: C.orangeDim },
  over: { color: C.red,     background: C.redDim },
};

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: "rgba(79,126,255,0.2)", color: C.steel, borderRadius: 3, padding: "0 2px", fontStyle: "normal" }}>{part}</mark>
      : part
  );
}

function getMetaChips(p: Project): { icon: React.ReactNode; text: string }[] {
  switch (p.status) {
    case "preparing": {
      const pc = p.photoCount ?? 0;
      const rc = p.requiredCount ?? 0;
      if (pc === 0) {
        return [{ icon: <ImageIcon size={11} />, text: "사진 업로드를 시작해주세요" }];
      } else if (pc < rc) {
        return [{ icon: <ImageIcon size={11} />, text: `${pc} / ${rc}장 업로드됨` }];
      } else {
        return [{ icon: <CheckCircle size={11} />, text: `${pc}장 준비 완료 · 고객 초대 활성화 필요` }];
      }
    }
    case "selecting":
      return [
        { icon: <ImageIcon size={11} />, text: `${p.photoCount}장` },
        { icon: <Check size={11} />, text: `${p.requiredCount}장 셀렉 목표` },
      ];
    case "confirmed":
      return [
        { icon: <Check size={11} />, text: `${p.requiredCount}장 셀렉 완료` },
        { icon: <ImageIcon size={11} />, text: "보정 시작 필요" },
      ];
    case "editing":
    case "editing_v2":
      return [{ icon: <ImageIcon size={11} />, text: `${p.requiredCount}장 선택됨` }];
    case "reviewing_v1":
    case "reviewing_v2":
      return [{ icon: <Check size={11} />, text: `${p.requiredCount}장 · 검토 중` }];
    case "delivered":
      return [
        { icon: <PackageCheck size={11} />, text: `${p.requiredCount}장 납품` },
        ...(p.deliveredAt ? [{ icon: <Calendar size={11} />, text: format(new Date(p.deliveredAt), "yyyy-MM-dd") }] : []),
      ];
  }
}

// ── Dropdown 컴포넌트 ─────────────────────────────────────────
interface DropdownProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  icon?: React.ReactNode;
}

function Dropdown({ label, value, options, onChange, icon }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== "all";
  const selectedLabel = options.find((o) => o.value === value)?.label ?? label;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px",
          background: active ? "rgba(79,126,255,0.06)" : C.surface,
          border: `1px solid ${active ? C.steel : C.border}`,
          borderRadius: 9, color: active ? C.steel : C.muted,
          fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
          fontFamily: PS_FONT,
          transition: "all 0.15s",
        }}
      >
        {icon}
        {active ? selectedLabel : label}
        <ChevronDown size={11} color={C.dim} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          background: C.surface2, border: `1px solid ${C.borderMd}`,
          borderRadius: 10, padding: "4px 0", minWidth: 140,
          zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 14px", background: "transparent", border: "none",
                color: opt.value === value ? C.steel : C.muted,
                fontSize: 12, cursor: "pointer",
                fontFamily: PS_FONT,
                fontWeight: opt.value === value ? 500 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 프로젝트 카드 ─────────────────────────────────────────────
function ProjectCard({ project, searchQuery, onClick }: {
  project: Project;
  searchQuery: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const shoot = new Date(project.shootDate);
  const month = MONTHS[shoot.getMonth()];
  const day = String(shoot.getDate()).padStart(2, "0");
  const dday = getDDayInfo(project.deadline);
  const meta = getMetaChips(project);
  const photoCount = project.photoCount ?? 0;
  const requiredCount = project.requiredCount ?? 0;
  const badgeStyle = getBadgeStyle(project.status, photoCount, requiredCount);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.surface2 : C.surface,
        border: `1px solid ${hovered ? C.borderMd : C.border}`,
        borderRadius: 11, padding: "16px 18px", marginBottom: 7,
        cursor: "pointer",
        transform: hovered ? "translateX(2px)" : "translateX(0)",
        transition: "all 0.18s",
        display: "grid", gridTemplateColumns: "auto 1fr auto",
        gap: 16, alignItems: "center",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* 좌측 컬러 보더 */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        borderRadius: "11px 0 0 11px",
        background: getCardBorderColor(project.status, photoCount, requiredCount),
      }} />

      {/* 날짜 */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        minWidth: 44, paddingLeft: 4,
      }}>
        <span style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {month}
        </span>
        <span style={{
          fontFamily: PS_DISPLAY,
          fontSize: 22, fontWeight: 700, color: C.muted, lineHeight: 1,
        }}>
          {day}
        </span>
      </div>

      {/* 중앙: 메인 정보 */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
            {highlight(project.name, searchQuery)}
          </span>
          <span style={{ fontSize: 12, color: C.muted }}>
            {highlight(project.customerName, searchQuery)}
          </span>
          <span style={{
            ...badgeStyle,
            padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 500, whiteSpace: "nowrap",
          }}>
            {getBadgeLabel(project.status, photoCount, requiredCount)}
          </span>
        </div>

        {/* ProjectProgressBar */}
        <div style={{ marginBottom: 8 }}>
          <ProjectProgressBar status={project.status} photoCount={photoCount} requiredCount={requiredCount} />
        </div>

        {/* 메타 칩 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {meta.map((m, i) => (
            <span key={i} style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 3 }}>
              {m.icon}{m.text}
            </span>
          ))}
        </div>
      </div>

      {/* 우측: D-Day + 화살표 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
        <span style={{
          ...DDAY_STYLES[dday.variant],
          fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap",
        }}>
          {dday.label}
        </span>
        <ChevronRight
          size={14}
          color={hovered ? C.steel : C.dim}
          style={{ transform: hovered ? "translateX(2px)" : "translateX(0)", transition: "all 0.15s" }}
        />
      </div>
    </div>
  );
}

// ── 섹션 헤더 ─────────────────────────────────────────────────
function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 1,
      textTransform: "uppercase", color: C.dim,
      marginBottom: 8, marginTop: 20,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {label}
      <span style={{
        background: C.surface2, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "1px 6px",
        fontSize: 9, color: C.muted, fontWeight: 400, letterSpacing: 0,
      }}>
        {count}
      </span>
    </div>
  );
}

// ── 빈 상태 ───────────────────────────────────────────────────
function EmptyState({ hasProjects, onReset }: { hasProjects: boolean; onReset: () => void }) {
  const router = useRouter();
  return (
    <div style={{ textAlign: "center", padding: "56px 20px", color: C.dim }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>
        {hasProjects ? <Search size={36} color={C.dim} /> : <ImageIcon size={36} color={C.dim} />}
      </div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 6 }}>
        {hasProjects ? "검색 결과가 없습니다" : "아직 프로젝트가 없습니다"}
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>
        {hasProjects ? "검색어나 필터를 변경해보세요" : "새 프로젝트를 만들어보세요"}
      </div>
      {hasProjects ? (
        <button
          onClick={onReset}
          style={{
            padding: "8px 18px", background: "transparent",
            border: `1px solid ${C.borderMd}`, borderRadius: 8,
            color: C.muted, fontSize: 12, cursor: "pointer",
            fontFamily: PS_FONT,
          }}
        >
          필터 초기화
        </button>
      ) : (
        <button
          onClick={() => router.push("/photographer/projects/new")}
          style={{
            padding: "8px 18px", background: C.steel,
            border: "none", borderRadius: 8, color: "white",
            fontSize: 12, cursor: "pointer",
            fontFamily: PS_FONT,
          }}
        >
          새 프로젝트 만들기
        </button>
      )}
    </div>
  );
}

// ══════════════ 메인 페이지 ══════════════════════════════════
export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);

  // 필터 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter,  setDateFilter]  = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy,      setSortBy]      = useState("latest");
  const [activeTab,   setActiveTab]   = useState<"all"|"waiting"|"active"|"completed">("all");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const photographerId = await getPhotographerIdByAuthId(user.id);
        if (!photographerId) { setLoading(false); return; }
        const list = await getProjectsByPhotographerId(photographerId);
        setProjects(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setDateFilter("all");
    setStatusFilter("all");
    setSortBy("latest");
    setActiveTab("all");
  }, []);

  // ── 탭별 counts (검색/필터 무관, 전체 기준) ──
  const tabCounts = useMemo(() => ({
    all:       projects.length,
    waiting:   projects.filter((p) => p.status === "preparing").length,
    active:    projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
    completed: projects.filter((p) => p.status === "delivered").length,
  }), [projects]);

  // ── 필터링 + 정렬 ──
  const filtered = useMemo(() => {
    let result = [...projects];

    // 검색
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.customerName.toLowerCase().includes(q)
      );
    }

    // 촬영일 필터
    const now = new Date();
    if (dateFilter === "this_month") {
      const start = startOfMonth(now);
      result = result.filter((p) => new Date(p.shootDate) >= start);
    } else if (dateFilter === "last_month") {
      const start = startOfMonth(subMonths(now, 1));
      const end   = startOfMonth(now);
      result = result.filter((p) => { const d = new Date(p.shootDate); return d >= start && d < end; });
    } else if (dateFilter === "3months") {
      const start = subMonths(now, 3);
      result = result.filter((p) => new Date(p.shootDate) >= start);
    }

    // 상태 필터
    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }

    // 탭 필터
    if (activeTab === "waiting")   result = result.filter((p) => p.status === "preparing");
    if (activeTab === "active")    result = result.filter((p) => ACTIVE_STATUSES.includes(p.status));
    if (activeTab === "completed") result = result.filter((p) => p.status === "delivered");

    // 정렬
    if (sortBy === "latest")     result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sortBy === "deadline")   result.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    if (sortBy === "name")       result.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    if (sortBy === "shoot_date") result.sort((a, b) => new Date(b.shootDate).getTime() - new Date(a.shootDate).getTime());

    return result;
  }, [projects, searchQuery, dateFilter, statusFilter, activeTab, sortBy]);

  // 섹션 분리 (탭이 "all"일 때)
  const waiting   = filtered.filter((p) => p.status === "preparing");
  const active    = filtered.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const completed = filtered.filter((p) => p.status === "delivered");

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 8 }}>
        <Loader2 size={20} color={C.muted} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 13, color: C.muted }}>로딩 중...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const TABS = [
    { key: "all",       label: "전체",   count: tabCounts.all },
    { key: "waiting",   label: "대기 중", count: tabCounts.waiting },
    { key: "active",    label: "진행 중", count: tabCounts.active },
    { key: "completed", label: "완료",    count: tabCounts.completed },
  ] as const;

  const hasActiveFilter = searchQuery.trim() || dateFilter !== "all" || statusFilter !== "all" || activeTab !== "all";

  return (
    <div style={{ fontFamily: PS_FONT }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
        .search-input:focus { outline:none; border-color:${C.borderMd} !important; }
        .search-input::placeholder { color:${C.dim}; }
      `}</style>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px",
        background: C.topbarBg, backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: C.text }}>프로젝트</span>
        <button
          onClick={() => router.push("/photographer/projects/new")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", background: C.steel, color: "white",
            border: "none", borderRadius: 8, fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: PS_FONT,
          }}
        >
          ＋ 새 프로젝트
        </button>
      </div>

      {/* ── 콘텐츠 ── */}
      <div style={{ padding: "20px 24px" }}>

        {/* 검색 + 필터 바 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          {/* 검색창 */}
          <div style={{ flex: 1, position: "relative" }}>
            <Search
              size={13} color={C.dim}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="프로젝트명, 고객명으로 검색"
              style={{
                width: "100%", padding: "9px 12px 9px 34px",
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 9, color: C.text, fontSize: 13,
                fontFamily: PS_FONT,
                transition: "border-color 0.15s", boxSizing: "border-box",
              }}
            />
          </div>

          {/* 촬영일 필터 */}
          <Dropdown
            label="촬영일"
            value={dateFilter}
            options={DATE_FILTER_OPTIONS}
            onChange={setDateFilter}
            icon={<Calendar size={12} color={C.dim} />}
          />

          {/* 상태 필터 */}
          <Dropdown
            label="상태"
            value={statusFilter}
            options={STATUS_FILTER_OPTIONS}
            onChange={setStatusFilter}
            icon={<SlidersHorizontal size={12} color={C.dim} />}
          />

          {/* 정렬 */}
          <Dropdown
            label="정렬"
            value={sortBy === "latest" ? "all" : sortBy}
            options={SORT_OPTIONS.map((o) => ({ ...o, value: o.value === "latest" ? "all" : o.value }))}
            onChange={(v) => setSortBy(v === "all" ? "latest" : v)}
            icon={<ChevronDown size={12} color={C.dim} />}
          />
        </div>

        {/* 상태 탭 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          marginBottom: 18, borderBottom: `1px solid ${C.border}`, paddingBottom: 0,
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 14px", fontSize: 12, fontWeight: 500,
                color: activeTab === tab.key ? C.steel : C.muted,
                background: "transparent", border: "none",
                borderBottom: `2px solid ${activeTab === tab.key ? C.steel : "transparent"}`,
                marginBottom: -1, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: PS_FONT,
                transition: "all 0.15s",
              }}
            >
              {tab.label}
              <span style={{
                padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                background: activeTab === tab.key ? "rgba(79,126,255,0.15)" : C.surface2,
                color: activeTab === tab.key ? C.steel : C.muted,
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* 결과 요약 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 12, color: C.dim }}>
            전체 {filtered.length}개 프로젝트
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: "5px 10px", background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 7, color: C.muted, fontSize: 11,
              fontFamily: PS_FONT, cursor: "pointer",
            }}
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* ── 프로젝트 목록 ── */}
        {filtered.length === 0 ? (
          <EmptyState hasProjects={projects.length > 0} onReset={resetFilters} />
        ) : activeTab === "all" ? (
          // 섹션 그룹핑
          <>
            {waiting.length > 0 && (
              <div>
                <SectionLabel label="대기 중" count={waiting.length} />
                {waiting.map((p) => (
                  <ProjectCard key={p.id} project={p} searchQuery={searchQuery} onClick={() => router.push(`/photographer/projects/${p.id}`)} />
                ))}
              </div>
            )}
            {active.length > 0 && (
              <div>
                <SectionLabel label="진행 중" count={active.length} />
                {active.map((p) => (
                  <ProjectCard key={p.id} project={p} searchQuery={searchQuery} onClick={() => router.push(`/photographer/projects/${p.id}`)} />
                ))}
              </div>
            )}
            {completed.length > 0 && (
              <div>
                <SectionLabel label="완료" count={completed.length} />
                {completed.map((p) => (
                  <ProjectCard key={p.id} project={p} searchQuery={searchQuery} onClick={() => router.push(`/photographer/projects/${p.id}`)} />
                ))}
              </div>
            )}
          </>
        ) : (
          // 탭 필터링 — 플랫 리스트
          filtered.map((p) => (
            <ProjectCard key={p.id} project={p} searchQuery={searchQuery} onClick={() => router.push(`/photographer/projects/${p.id}`)} />
          ))
        )}
      </div>
    </div>
  );
}
