"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, AlertCircle,
} from "lucide-react";
import { BETA_MAX_PROJECTS_TOTAL } from "@/lib/beta-limits";
import { getProfileImageUrl } from "@/lib/photographer";
import { getProjectsByPhotographerId } from "@/lib/db";
import type { Project, ProjectStatus } from "@/types";
import type { ProjectLogItem } from "@/lib/db";
import { useProfile } from "@/contexts/ProfileContext";
import EmptyDashboard from "./EmptyDashboard";
import { StatusPill } from "@/components/ui/StatusPill";
import { ProjectPipelineMiniBar, getPipelineStepLabel } from "@/components/photographer/ProjectPipelineMiniBar";

// ── 새 디자인 컬러 팔레트 ───────────────────────────────────
const ACCENT  = "#FF4D00";
const GREEN   = "#22C55E";
const RED     = "#EF4444";
const YELLOW  = "#EAB308";

function getPreparingAccent(photoCount: number, requiredCount: number): string {
  if (photoCount === 0)           return "#444";
  if (photoCount < requiredCount) return ACCENT;
  return ACCENT;
}

// ── status config ──────────────────────────────────────────
const ACTIVE_STATUSES: ProjectStatus[] = [
  "selecting", "confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2",
];

const NEW_LEFT: Record<ProjectStatus, string> = {
  preparing:    "#444",
  selecting:    "#fff",
  confirmed:    "#C4A574",
  editing:      "#C4A574",
  reviewing_v1: "#fff",
  editing_v2:   "#fff",
  reviewing_v2: "#fff",
  delivered:    "#333",
};

// ── helpers ────────────────────────────────────────────────
function dday(deadline: string): { text: string; warn: boolean } {
  const diff = Math.ceil(
    (new Date(deadline).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (diff > 3)   return { text: `D-${diff}`,        warn: false };
  if (diff > 0)   return { text: `D-${diff} · 임박`, warn: true  };
  if (diff === 0) return { text: "D-day",             warn: true  };
  return            { text: `D+${Math.abs(diff)}`,   warn: true  };
}


const LOG_DOT: Record<string, string> = {
  created:   "#666",
  uploaded:  ACCENT,
  selecting: "#888",
  confirmed: "#C4A574",
  editing:   "#C4A574",
  delivered: "#fff",
  revision:  "#fff",
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

const LOG_LABEL: Record<string, string> = {
  created:   "프로젝트 생성",
  uploaded:  "사진 업로드",
  selecting: "셀렉 완료",
  confirmed: "확정 완료",
  editing:   "보정 시작",
  delivered: "납품 완료",
  revision:  "재보정 요청",
};


// ── ProjectCard (새 디자인) ─────────────────────────────────
function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const photoCount  = project.photoCount ?? 0;
  const reqCount    = project.requiredCount ?? 0;

  const accentColor = project.status === "preparing"
    ? getPreparingAccent(photoCount, reqCount)
    : NEW_LEFT[project.status];

  const { text: ddayText, warn } = dday(project.deadline);
  const stepLabel = getPipelineStepLabel(project.status);
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="db-project-card"
      style={{
        background: "#111",
        borderTop: `1.5px solid ${hovered ? "#3a3a3a" : "#222"}`,
        borderRight: `1.5px solid ${hovered ? "#3a3a3a" : "#222"}`,
        borderBottom: `1.5px solid ${hovered ? "#3a3a3a" : "#222"}`,
        borderLeft: `4px solid ${accentColor}`,
        padding: "18px 20px 16px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        transform: hovered ? "translateX(4px)" : "none",
        display: "flex",
        flexDirection: "column" as const,
        gap: 12,
        opacity: isDelivered ? (hovered ? 1 : 0.65) : 1,
      }}
    >
      {/* 상단: 배지 + 프로젝트명 + 고객명 + D-day */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" as const, minWidth: 0 }}>
        <div style={{ flexShrink: 0 }}>
          <StatusPill status={project.status} photoCount={photoCount} requiredCount={reqCount} />
        </div>
        <span style={{
          fontSize: 14, fontWeight: 700, color: isDelivered ? "#777" : "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
          minWidth: 0,
        }}>
          {project.name}
        </span>
        <span style={{
          fontSize: 13, color: "#666", flexShrink: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
          maxWidth: 80,
        }}>
          {project.customerName || "—"}
        </span>
        {/* D-day 배지 — flex flow로 우측 끝에 배치 */}
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          {isDelivered ? (
            <span style={{
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
              color: "#444", border: "1px solid #2a2a2a",
              padding: "4px 8px", background: "#050505",
            }}>
              완료
            </span>
          ) : (
            <span style={{
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, fontWeight: 700,
              color: warn ? ACCENT : "#888",
              border: `1px solid ${warn ? ACCENT : "#333"}`,
              padding: "4px 8px",
              background: warn ? "rgba(255,77,0,0.05)" : "#050505",
            }}>
              {ddayText.replace(" · 임박", "")}
            </span>
          )}
        </div>
      </div>

      {/* 파이프라인 진행 바 */}
      <div style={{ width: "100%" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
          color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          <span>{stepLabel}</span>
          <span style={{ color: isDelivered ? "#444" : "#888" }}>
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

// ── ActionCard (새 디자인) ─────────────────────────────────
function ActionCard({
  count, label, sub, numColor, href, leftBorderColor,
}: {
  count: number;
  label: string;
  sub: string;
  numColor: string;
  href?: string;
  leftBorderColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href ?? "/photographer/projects"} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? "#1a1a1a" : "#111",
          borderTop: `1.5px solid ${hovered ? "#3a3a3a" : "#222"}`,
          borderRight: `1.5px solid ${hovered ? "#3a3a3a" : "#222"}`,
          borderBottom: `1.5px solid ${hovered ? "#3a3a3a" : "#222"}`,
          borderLeft: leftBorderColor ? `3px solid ${leftBorderColor}` : `1.5px solid ${hovered ? "#3a3a3a" : "#222"}`,
          padding: "18px 20px",
          cursor: "pointer",
          transition: "all 0.2s ease",
          display: "flex",
          flexDirection: "column" as const,
          justifyContent: "space-between",
          minHeight: 110,
        }}
      >
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 32, fontWeight: 700, color: numColor, lineHeight: 1,
        }}>
          {count}
        </span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{label}</div>
          <div style={{
            fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif",
            fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.15em",
          }}>{sub}</div>
        </div>
      </div>
    </Link>
  );
}

// ── Accordion Section Header ───────────────────────────────
function AccordionHeader({
  title, count, dotColor, textColor, badgeBg, badgeColor,
  open, onToggle, totalNote,
}: {
  title: string; count: number;
  dotColor: string; textColor: string; badgeBg: string; badgeColor: string;
  open: boolean; onToggle: () => void;
  totalNote?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "14px 16px",
        background: "#111", border: "1px solid #222",
        cursor: "pointer", transition: "background 0.2s ease", textAlign: "left" as const,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#111"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 6, height: 6, background: dotColor, flexShrink: 0 }} />
        <span style={{
          fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, fontWeight: 500,
          color: textColor, letterSpacing: "0.15em", textTransform: "uppercase",
        }}>
          {title}
        </span>
        <span style={{
          background: badgeBg, color: badgeColor,
          padding: "1px 7px", fontSize: 10, fontWeight: 700,
          fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif",
        }}>
          {count}
        </span>
        {totalNote && (
          <span style={{
            fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9,
            color: "#444", letterSpacing: "0.05em",
          }}>
            {totalNote}
          </span>
        )}
      </div>
      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="#555" strokeWidth="2"
        style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.3s" }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
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
  const [clockStr, setClockStr] = useState("");
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

  // 시계
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

  // 데이터 로딩
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

  // ── 로딩 중 ──
  if (profileLoading || loading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#000", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11,
          color: "#555", letterSpacing: "0.15em", textTransform: "uppercase",
        }}>
          SYS.LOADING…
        </div>
      </div>
    );
  }

  // ── 미로그인 ──
  if (!profile?.id) {
    return (
      <div style={{
        minHeight: "100vh", background: "#000",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 16,
      }}>
        <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 12, color: "#555" }}>
          로그인하면 프로젝트를 볼 수 있습니다
        </p>
        <Link href="/auth" style={{
          background: ACCENT, color: "#000", padding: "10px 24px",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
          fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif",
        }}>
          로그인
        </Link>
      </div>
    );
  }

  // ── 빈 대시보드 ──
  if (projects.length === 0) {
    return (
      <EmptyDashboard
        userName={userName}
        onCreateProject={() => router.push("/photographer/projects/new")}
      />
    );
  }

  // ── derived data ──
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
    <div
      className="db-root"
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
        position: "relative",
      }}
    >
      <style>{`
        /* ── 그리드 배경 ── */
        .db-grid-bg {
          position: fixed; inset: 0;
          background-image:
            linear-gradient(#333 1px, transparent 1px),
            linear-gradient(90deg, #333 1px, transparent 1px);
          background-size: 60px 60px;
          background-position: center top;
          opacity: 0.2;
          pointer-events: none; z-index: 0;
        }
        /* ── 스캔라인 ── */
        .db-scanline {
          width: 100%; height: 100px; position: fixed; bottom: 100%;
          background: linear-gradient(0deg, rgba(255,77,0,0.02) 0%, rgba(255,77,0,0) 100%);
          animation: db-scanline 8s linear infinite;
          pointer-events: none; z-index: 1;
        }
        @keyframes db-scanline { 0% { bottom: 100%; } 100% { bottom: -100px; } }
        /* ── 프로젝트 카드 ── */
        .db-project-card:focus { outline: 1px solid ${ACCENT}; }
        /* ── 스크롤바 ── */
        .db-root ::-webkit-scrollbar { width: 6px; }
        .db-root ::-webkit-scrollbar-track { background: #000; }
        .db-root ::-webkit-scrollbar-thumb { background: #222; }
        .db-root ::-webkit-scrollbar-thumb:hover { background: ${ACCENT}; }
        /* ── 전체 보기 링크 ── */
        .db-view-all { transition: all 0.2s; }
        .db-view-all:hover { border-color: rgba(255,77,0,0.5) !important; background: rgba(255,77,0,0.04) !important; }
        .db-view-all:hover .db-view-all-text { color: ${ACCENT} !important; }
        .db-view-all:hover .db-view-all-arrow { color: ${ACCENT} !important; }
        /* ── 반응형 ── */
        @media (max-width: 1024px) {
          .db-body { flex-direction: column !important; }
          .db-right-aside { width: 100% !important; position: static !important; }
        }
        @media (max-width: 768px) {
          .db-root { overflow-x: hidden; }
          .db-topbar { flex-wrap: wrap; gap: 10px; padding: 10px 14px !important; padding-top: max(10px, env(safe-area-inset-top)) !important; height: auto !important; }
          .db-body { padding: 16px 14px 60px !important; align-items: stretch !important; }
          .db-body > * { width: 100% !important; min-width: 0 !important; }
          .db-action-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .db-clock { display: none !important; }
          .db-activity-panel { display: none !important; }
          .db-right-aside { display: none !important; }
          .db-project-card { transform: none !important; }
        }
        @keyframes db-pulse {
          0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255,77,0,0.4); }
          50%      { opacity: 0.6; box-shadow: 0 0 0 4px rgba(255,77,0,0); }
        }
      `}</style>

      {/* ── 장식 배경 ── */}
      <div className="db-grid-bg" />
      <div className="db-scanline" />

      {/* ── 상단 헤더 ── */}
      <header
        className="db-topbar"
        style={{
          position: "sticky", top: 0, zIndex: 50,
          height: 64, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 28px",
          background: "rgba(0,0,0,0.95)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid #222",
        }}
      >
        {/* 좌: 유저 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {profile?.profileImageUrl ? (
            <img
              src={getProfileImageUrl(profile.profileImageUrl)}
              alt=""
              style={{
                width: 32, height: 32, objectFit: "cover",
                border: "1px solid #2a2a2a", flexShrink: 0,
              }}
              onError={(e) => { (e.target as HTMLImageElement).src = getProfileImageUrl(null); }}
            />
          ) : (
            <div style={{
              width: 32, height: 32, background: "#111",
              border: "1px solid #2a2a2a", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: "#777",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, color: "#ccc" }}>
              안녕하세요, <strong style={{ color: "#fff" }}>{userName} 작가님</strong>
            </div>
            <div style={{
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
              color: "#666", textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 1,
            }}>
              세션 활성
            </div>
          </div>
        </div>

        {/* 우: 시계 + 새 프로젝트 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="db-clock" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9,
              color: "#555", letterSpacing: "0.15em", textTransform: "uppercase",
            }}>SYS_TIME</span>
            <span style={{
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 12,
              color: "#fff", letterSpacing: "0.1em",
            }}>{clockStr}</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/photographer/projects/new")}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 18px", background: ACCENT,
              color: "#000", border: "none",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Pretendard', sans-serif",
              transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
              letterSpacing: "0.02em", textTransform: "uppercase",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.transform = "translateY(-1px)";
              el.style.boxShadow = "0 0 20px rgba(255,77,0,0.4)";
              el.style.background = "#ff5e1a";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.transform = "";
              el.style.boxShadow = "";
              el.style.background = ACCENT;
            }}
          >
            <Plus size={14} />
            새 프로젝트
          </button>
        </div>
      </header>

      {/* ── 바디: 메인 + 우측 사이드바 ── */}
      <div
        className="db-body"
        style={{
          display: "flex", position: "relative", zIndex: 10,
          padding: "28px 28px 60px",
          gap: 28, alignItems: "flex-start",
          minWidth: 0,
        }}
      >
        {/* ── 메인 좌측 ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>

          {/* 1. 액션 필요 섹션 */}
          {hasAction && (
            <section>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
                color: "#fff", letterSpacing: "0.2em", textTransform: "uppercase",
                marginBottom: 14,
              }}>
                <div style={{ width: 8, height: 8, background: "#fff" }} />
                처리가 필요한 항목
                <div style={{ flex: 1, height: 1, background: "#222" }} />
              </div>
              <div
                className="db-action-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}
              >
                {confirmedCount > 0 && (
                  <ActionCard count={confirmedCount} label="고객 확정" sub="CONFIRMED" numColor={ACCENT} leftBorderColor={ACCENT} />
                )}
                {revisionCount > 0 && (
                  <ActionCard count={revisionCount} label="재보정 요청" sub="EDIT_REQ" numColor={ACCENT} leftBorderColor={ACCENT} />
                )}
                {reviewingCount > 0 && (
                  <ActionCard count={reviewingCount} label="검토 중" sub="REVIEWING" numColor="#888" leftBorderColor="#666" />
                )}
                {inviteReadyCount > 0 && (
                  <ActionCard
                    count={inviteReadyCount} label="초대 대기" sub="READY"
                    numColor="#555" leftBorderColor="#444" href={inviteReadyHref}
                  />
                )}
              </div>
            </section>
          )}

          {/* 2. 프로젝트 아코디언 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* 대기 중 */}
            {preparingProjects.length > 0 && (
              <div>
                <AccordionHeader
                  title="대기중" count={preparingProjects.length}
                  dotColor="#555" textColor="#888" badgeBg="#1a1a1a" badgeColor="#666"
                  open={openSections.has("pending")}
                  onToggle={() => toggleSection("pending")}
                />
                {openSections.has("pending") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
                    {preparingProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                )}
              </div>
            )}

            {/* 진행 중 */}
            {activeProjects.length > 0 && (
              <div>
                <AccordionHeader
                  title="진행중" count={activeProjects.length}
                  dotColor={ACCENT} textColor={ACCENT}
                  badgeBg="rgba(255,77,0,0.15)" badgeColor={ACCENT}
                  open={openSections.has("active")}
                  onToggle={() => toggleSection("active")}
                />
                {openSections.has("active") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
                    {activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                )}
              </div>
            )}

            {/* 최근 완료 */}
            {recentDelivered.length > 0 && (
              <div>
                <AccordionHeader
                  title="최근완료" count={recentDelivered.length}
                  dotColor="#333" textColor="#555" badgeBg="#1a1a1a" badgeColor="#444"
                  totalNote={totalDelivered > 1 ? `전체 ${totalDelivered}건` : undefined}
                  open={openSections.has("delivered")}
                  onToggle={() => toggleSection("delivered")}
                />
                {openSections.has("delivered") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
                    {recentDelivered.map((p) => <ProjectCard key={p.id} project={p} />)}
                  </div>
                )}
              </div>
            )}

            {/* 전체 보기 */}
            {showViewAllBtn && (
              <Link
                href="/photographer/projects"
                className="db-view-all"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "16px 24px",
                  background: "#080808", border: "1px solid #1e1e1e",
                  textDecoration: "none",
                }}
              >
                <span className="db-view-all-text" style={{ fontSize: 13, fontWeight: 700, color: "#666" }}>
                  전체 프로젝트 보기
                </span>
                <svg className="db-view-all-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* ── 우측 사이드바 ── */}
        <aside
          className="db-right-aside"
          style={{
            width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 20,
            position: "sticky", top: 92,
          }}
        >
          {/* 사용량 패널 */}
          <div style={{
            background: "#111", border: "1.5px solid #333",
            padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16,
            boxShadow: "0 8px 24px -8px rgba(0,0,0,0.8)",
          }}>
            {/* 헤더 */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
              color: "#888", letterSpacing: "0.1em", textTransform: "uppercase",
              borderBottom: "1px solid #222", paddingBottom: 12,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              SYS.INFO :: USAGE
            </div>

            {/* 활성 프로젝트 바 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>활성 프로젝트</span>
                <div style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 14 }}>
                  <span style={{ color: "#fff", fontWeight: 700 }}>{betaCount}</span>
                  <span style={{ color: "#444" }}> / {BETA_MAX_PROJECTS_TOTAL}</span>
                </div>
              </div>
              <div style={{ width: "100%", height: 4, background: "#0a0a0a" }}>
                <div style={{
                  height: "100%", background: "#fff",
                  width: `${betaPct}%`, transition: "width 0.4s",
                }} />
              </div>
            </div>

            {/* 한도 알림 */}
            {betaCount >= BETA_MAX_PROJECTS_TOTAL ? (
              <div style={{
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                padding: "10px 12px",
                display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <AlertCircle size={13} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <span style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, color: RED, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 3 }}>
                    Limit Reached
                  </span>
                  <span style={{ fontSize: 11, color: "#888", lineHeight: 1.5 }}>
                    베타 프로젝트 한도에 도달했습니다.
                  </span>
                </div>
              </div>
            ) : betaCount >= BETA_MAX_PROJECTS_TOTAL - 2 ? (
              <div style={{
                background: "#1a1a1a", border: "1px solid #2a2a2a",
                padding: "10px 12px",
              }}>
                <span style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, color: "#666", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                  Limit Notice
                </span>
                <span style={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>
                  프로젝트 생성 한도에 근접했습니다.
                </span>
              </div>
            ) : null}
          </div>

          {/* 최근 활동 패널 */}
          <div
            className="db-activity-panel"
            style={{
              background: "#111", border: "1.5px solid #333",
              padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16,
              boxShadow: "0 8px 24px -8px rgba(0,0,0,0.8)",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
              color: "#888", letterSpacing: "0.1em", textTransform: "uppercase",
              borderBottom: "1px solid #222", paddingBottom: 12,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              SYS.LOG :: RECENT
            </div>

            {logs.length === 0 ? (
              <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "#444", textAlign: "center", padding: "16px 0" }}>
                아직 활동이 없습니다
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
                {logs.slice(0, 8).map((log) => {
                  const dotColor = LOG_DOT[log.action] ?? "#666";
                  const label    = LOG_LABEL[log.action] ?? log.action;
                  return (
                    <div
                      key={log.id}
                      style={{
                        display: "flex", flexDirection: "column", gap: 2,
                        borderLeft: "1px solid #222", paddingLeft: 16,
                        position: "relative",
                      }}
                    >
                      <div style={{
                        position: "absolute", left: -5, top: 4,
                        width: 9, height: 9, borderRadius: "50%",
                        background: "#000", border: `1px solid ${dotColor}`,
                      }} />
                      <span style={{
                        fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 9,
                        color: "#444",
                      }}>
                        {formatLogTime(log.createdAt)}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: dotColor }}>
                        {label}
                      </span>
                      {log.projectName && (
                        <span style={{
                          fontSize: 11, color: "#555",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {log.projectName}
                        </span>
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
