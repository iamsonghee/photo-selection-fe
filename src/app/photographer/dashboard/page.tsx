"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Bell, FolderOpen, CheckCircle2, RefreshCw, Eye, ArrowRight } from "lucide-react";
import { getProjectsByPhotographerId, getProjectLogsRecent } from "@/lib/db";
import type { Project, ProjectStatus } from "@/types";
import type { ProjectLogItem } from "@/lib/db";
import { useProfile } from "@/contexts/ProfileContext";

// ── colour tokens ──────────────────────────────────────────
const C = {
  ink:       "#0d1e28",
  surface:   "#0f2030",
  surface2:  "#152a3a",
  surface3:  "#1a3347",
  steel:     "#669bbc",
  steelLt:   "#8db8d4",
  border:    "rgba(102,155,188,0.12)",
  borderMd:  "rgba(102,155,188,0.22)",
  text:      "#e8eef2",
  muted:     "#7a9ab0",
  dim:       "#3a5a6e",
  green:     "#2ed573",
  greenDim:  "#0f2a1e",
  orange:    "#f5a623",
  orangeDim: "#2a1a08",
  red:       "#ff4757",
  redDim:    "#2a0f12",
};

// ── status config ──────────────────────────────────────────
type BadgeKey = "preparing" | "selecting" | "editing" | "delivered" | "revision";

const STATUS_BADGE: Record<ProjectStatus, { label: string; key: BadgeKey }> = {
  preparing:    { label: "업로드 전", key: "preparing" },
  selecting:    { label: "셀렉 중",   key: "selecting" },
  confirmed:    { label: "확정됨",    key: "selecting" },
  editing:      { label: "보정 중",   key: "editing"   },
  reviewing_v1: { label: "검토 중",   key: "editing"   },
  editing_v2:   { label: "재보정 중", key: "revision"  },
  reviewing_v2: { label: "재검토 중", key: "editing"   },
  delivered:    { label: "납품 완료", key: "delivered" },
};

const BADGE_STYLE: Record<BadgeKey, React.CSSProperties> = {
  preparing: { background: C.surface3, color: C.muted,   border: `1px solid ${C.border}` },
  selecting: { background: "rgba(102,155,188,0.15)", color: C.steel,  border: "1px solid rgba(102,155,188,0.3)" },
  editing:   { background: "rgba(245,166,35,0.12)",  color: C.orange, border: "1px solid rgba(245,166,35,0.3)"  },
  revision:  { background: "rgba(255,71,87,0.12)",   color: C.red,    border: "1px solid rgba(255,71,87,0.3)"   },
  delivered: { background: C.greenDim,               color: C.green,  border: "1px solid rgba(46,213,115,0.3)"  },
};

const STATUS_LEFT: Record<ProjectStatus, string> = {
  preparing:    C.dim,
  selecting:    C.steel,
  confirmed:    C.green,
  editing:      C.orange,
  reviewing_v1: C.steelLt,
  editing_v2:   C.red,
  reviewing_v2: C.steelLt,
  delivered:    C.dim,
};

const ACTIVE_STATUSES: ProjectStatus[] = [
  "selecting", "confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2",
];

// ── mini steps ─────────────────────────────────────────────
type StepState = "done" | "current" | "pending" | "all-done";
const STEP_LABELS = ["업로드", "셀렉", "보정·검토", "완료"];

function getMiniSteps(status: ProjectStatus): StepState[] {
  switch (status) {
    case "preparing":    return ["current",  "pending",  "pending",  "pending"];
    case "selecting":    return ["done",     "current",  "pending",  "pending"];
    case "confirmed":
    case "editing":
    case "reviewing_v1":
    case "editing_v2":
    case "reviewing_v2": return ["done",     "done",     "current",  "pending"];
    case "delivered":    return ["all-done", "all-done", "all-done", "all-done"];
  }
}

// ── helpers ────────────────────────────────────────────────
function dday(deadline: string): { text: string; warn: boolean } {
  const diff = Math.ceil(
    (new Date(deadline).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (diff > 3)  return { text: `D-${diff}`,           warn: false };
  if (diff > 0)  return { text: `D-${diff} · 임박`,    warn: true  };
  if (diff === 0) return { text: "D-day",               warn: true  };
  return           { text: `D+${Math.abs(diff)}`,      warn: true  };
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)     return "방금 전";
  if (diff < 3600)   return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 172800) return "어제";
  return `${Math.floor(diff / 86400)}일 전`;
}

const LOG_DOT: Record<string, string> = {
  created:   C.steel,
  uploaded:  C.orange,
  selecting: C.green,
  confirmed: C.green,
  editing:   C.orange,
  delivered: C.green,
  revision:  C.red,
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

// ── MiniSteps ──────────────────────────────────────────────
function MiniSteps({ status }: { status: ProjectStatus }) {
  const steps = getMiniSteps(status);
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 8, width: "100%" }}>
      {steps.map((state, i) => {
        const dotColor =
          state === "all-done" ? C.green :
          state === "current"  ? C.steel :
          state === "done"     ? C.muted : C.dim;
        const fillColor =
          state === "all-done" ? C.green :
          state === "done"     ? C.muted :
          state === "current"  ? C.steel : "transparent";
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{
              fontSize: 9,
              color:
                state === "current"  ? C.text :
                state === "done" || state === "all-done" ? C.muted : C.dim,
              fontWeight: state === "current" ? 500 : 400,
              whiteSpace: "nowrap",
            }}>
              {STEP_LABELS[i]}
            </span>
            <div style={{
              width: state === "current" ? 7 : 5,
              height: state === "current" ? 7 : 5,
              borderRadius: "50%",
              backgroundColor: dotColor,
              boxShadow: state === "current" ? `0 0 0 2px rgba(102,155,188,0.2)` : "none",
              flexShrink: 0,
            }} />
            <div style={{ width: "100%", height: 2, borderRadius: 1, backgroundColor: C.surface3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 1, backgroundColor: fillColor, width: state === "pending" ? "0%" : "100%" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────
function StatusBadge({ status }: { status: ProjectStatus }) {
  const { label, key } = STATUS_BADGE[status];
  return (
    <span style={{
      ...BADGE_STYLE[key],
      fontSize: 10,
      fontWeight: 500,
      padding: "2px 8px",
      borderRadius: 20,
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

// ── ProjectCard ────────────────────────────────────────────
function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const accentColor = STATUS_LEFT[project.status];
  const { text: ddayText, warn } = dday(project.deadline);
  const ddayStyle: React.CSSProperties = warn
    ? { color: C.orange, background: C.orangeDim }
    : { color: C.muted,  background: C.surface3 };

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
      style={{
        background: hovered ? C.surface2 : C.surface,
        borderTop: `1px solid ${hovered ? C.borderMd : C.border}`,
        borderRight: `1px solid ${hovered ? C.borderMd : C.border}`,
        borderBottom: `1px solid ${hovered ? C.borderMd : C.border}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 6,
        cursor: "pointer",
        transition: "all 0.18s",
        transform: hovered ? "translateX(2px)" : "none",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div>
        {/* card-top */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{project.name}</span>
          <span style={{ fontSize: 12, color: C.muted }}>{project.customerName || "—"}</span>
          <StatusBadge status={project.status} />
        </div>

        {/* mini-steps */}
        <MiniSteps status={project.status} />

        {/* card-bottom */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <span style={{ fontSize: 10, color: C.muted }}>🖼 {project.photoCount}장</span>
            {project.status === "selecting" && (
              <span style={{ fontSize: 10, color: C.muted }}>✓ 셀렉 중</span>
            )}
            {project.status === "delivered" && project.requiredCount > 0 && (
              <span style={{ fontSize: 10, color: C.muted }}>✓ {project.requiredCount}장 납품</span>
            )}
          </div>
          <span style={{
            ...ddayStyle,
            fontSize: 10,
            fontWeight: 500,
            padding: "2px 7px",
            borderRadius: 5,
          }}>
            {ddayText}
          </span>
        </div>
      </div>

      {/* arrow */}
      <span style={{ fontSize: 12, color: hovered ? C.steel : C.dim, transition: "all 0.15s" }}>→</span>
    </div>
  );
}

// ── ActionCard ─────────────────────────────────────────────
function ActionCard({
  type,
  count,
  label,
  sub,
  icon,
  topColor,
  numColor,
  bgTint,
}: {
  type: string;
  count: number;
  label: string;
  sub: string;
  icon: React.ReactNode;
  topColor: string;
  numColor: string;
  bgTint: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href="/photographer/projects" style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? C.surface2 : bgTint,
          border: `1px solid ${hovered ? C.borderMd : C.border}`,
          borderTop: `2px solid ${topColor}`,
          borderRadius: 10,
          padding: "14px",
          cursor: "pointer",
          transition: "all 0.18s",
          transform: hovered ? "translateY(-2px)" : "none",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
          <span style={{ fontSize: 16 }}>{icon}</span>
        </div>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 30,
          lineHeight: 1,
          marginBottom: 3,
          color: numColor,
        }}>
          {count}
        </div>
        <div style={{ fontSize: 10, color: C.dim }}>{sub}</div>
      </div>
    </Link>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<ProjectLogItem[]>([]);

  const userName =
    profile?.name?.trim() ||
    profile?.email?.split("@")[0] ||
    "사용자";

  useEffect(() => {
    if (!profile) return;
    const pid = profile.id;
    if (!pid) { setLoading(false); return; }

    async function load() {
      try {
        const [list, logRes] = await Promise.all([
          getProjectsByPhotographerId(pid),
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
  }, [profile]);

  // wait for profile to load first
  if (!profile || loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: C.muted, fontSize: 13 }}>불러오는 중…</p>
      </div>
    );
  }

  if (!profile.id) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "80px 0" }}>
        <p style={{ color: C.muted, fontSize: 13 }}>로그인하면 프로젝트를 볼 수 있습니다</p>
        <Link href="/auth" style={{ backgroundColor: C.steel, color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          로그인
        </Link>
      </div>
    );
  }

  // ── derived data ──
  const preparingProjects = projects.filter((p) => p.status === "preparing");
  const activeProjects    = projects.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const deliveredProjects = projects
    .filter((p) => p.status === "delivered")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const recentDelivered = deliveredProjects.slice(0, 1);

  const confirmedCount  = projects.filter((p) => p.status === "confirmed").length;
  const revisionCount   = projects.filter((p) => p.status === "editing_v2").length;
  const reviewingCount  = projects.filter((p) => p.status === "reviewing_v1" || p.status === "reviewing_v2").length;
  const hasAction       = confirmedCount + revisionCount + reviewingCount > 0;

  const thisMonth = new Date().getMonth();
  const thisYear  = new Date().getFullYear();
  const thisMonthCount = projects.filter((p) => {
    const d = new Date(p.shootDate);
    return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
  }).length;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.ink, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "rgba(13,30,40,0.85)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: C.text }}>
            안녕하세요,{" "}
            <em style={{ fontStyle: "normal", color: C.steel }}>{userName}</em>
            {" "}님 👋
          </p>
          <p style={{ fontSize: 11, color: C.dim }}>오늘도 좋은 하루 되세요</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            aria-label="알림"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${C.border}`, background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.muted, position: "relative",
            }}
          >
            <Bell size={14} />
          </button>
          <button
            type="button"
            onClick={() => router.push("/photographer/projects/new")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", background: C.steel,
              color: "white", border: "none", borderRadius: 8,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <Plus size={12} />
            새 프로젝트
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 260px",
        minHeight: "calc(100vh - 52px)",
      }}>

        {/* ── Left ── */}
        <div style={{
          padding: "22px 22px 22px 24px",
          overflowY: "auto",
          borderRight: `1px solid ${C.border}`,
        }}>

          {/* 1. 액션 필요 */}
          {hasAction && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", backgroundColor: C.orange,
                    animation: "pulse 2s infinite",
                  }} />
                  지금 확인이 필요해요
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {confirmedCount > 0 && (
                  <ActionCard
                    type="confirmed"
                    count={confirmedCount}
                    label="고객 확정 완료"
                    sub="보정 시작 대기 중"
                    icon={<CheckCircle2 size={16} color={C.green} />}
                    topColor={C.green}
                    numColor={C.green}
                    bgTint="rgba(46,213,115,0.04)"
                  />
                )}
                {revisionCount > 0 && (
                  <ActionCard
                    type="revision"
                    count={revisionCount}
                    label="재보정 요청"
                    sub="코멘트 확인 필요"
                    icon={<RefreshCw size={16} color={C.red} />}
                    topColor={C.red}
                    numColor={C.red}
                    bgTint="rgba(255,71,87,0.04)"
                  />
                )}
                {reviewingCount > 0 && (
                  <ActionCard
                    type="reviewing"
                    count={reviewingCount}
                    label="고객 검토 중"
                    sub="보정본 검토 대기"
                    icon={<Eye size={16} color={C.steelLt} />}
                    topColor={C.steel}
                    numColor={C.steelLt}
                    bgTint="rgba(102,155,188,0.04)"
                  />
                )}
              </div>
            </div>
          )}

          {/* 2. 대기 중 */}
          {preparingProjects.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>
                  대기 중
                  <span style={{
                    background: C.surface2, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "1px 7px", fontSize: 10, color: C.muted, fontWeight: 400,
                  }}>
                    {preparingProjects.length}
                  </span>
                </div>
              </div>
              {preparingProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}

          {/* 3. 진행 중 */}
          {activeProjects.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>
                  진행 중
                  <span style={{
                    background: C.surface2, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "1px 7px", fontSize: 10, color: C.muted, fontWeight: 400,
                  }}>
                    {activeProjects.length}
                  </span>
                </div>
              </div>
              {activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}

          {/* 4. 최근 완료 */}
          {recentDelivered.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>
                  최근 완료
                  <span style={{
                    background: C.surface2, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "1px 7px", fontSize: 10, color: C.muted, fontWeight: 400,
                  }}>
                    {deliveredProjects.length}
                  </span>
                </div>
              </div>
              {recentDelivered.map((p) => <ProjectCard key={p.id} project={p} />)}
              <Link
                href="/photographer/projects"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "100%", padding: 9,
                  border: `1px dashed ${C.border}`, borderRadius: 9,
                  background: "transparent", color: C.dim,
                  fontSize: 12, textDecoration: "none", marginTop: 4,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = C.steel;
                  (e.currentTarget as HTMLAnchorElement).style.color = C.steel;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = C.border;
                  (e.currentTarget as HTMLAnchorElement).style.color = C.dim;
                }}
              >
                전체 프로젝트 보기 →
              </Link>
            </div>
          )}

          {/* 프로젝트 없을 때 */}
          {projects.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <FolderOpen size={36} color={C.dim} style={{ margin: "0 auto 14px" }} />
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>아직 프로젝트가 없습니다</p>
              <button
                type="button"
                onClick={() => router.push("/photographer/projects/new")}
                style={{
                  backgroundColor: C.steel, color: "#fff", border: "none",
                  borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                <Plus size={14} />
                첫 프로젝트 만들기
              </button>
            </div>
          )}
        </div>

        {/* ── Right ── */}
        <div style={{ padding: 20, overflowY: "auto", background: "rgba(0,0,0,0.12)" }}>

          {/* 통계 */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
            marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, lineHeight: 1, marginBottom: 3, color: C.steel }}>
                {projects.length}
              </div>
              <div style={{ fontSize: 10, color: C.dim }}>전체 프로젝트</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, lineHeight: 1, marginBottom: 3, color: C.orange }}>
                {thisMonthCount}
              </div>
              <div style={{ fontSize: 10, color: C.dim }}>이번 달 촬영</div>
            </div>
          </div>

          {/* 최근 활동 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>최근 활동</span>
          </div>

          {logs.length === 0 ? (
            <p style={{ fontSize: 12, color: C.dim, textAlign: "center", padding: "20px 0" }}>아직 활동이 없습니다</p>
          ) : (
            <div style={{ position: "relative" }}>
              {/* 타임라인 세로선 */}
              <div style={{
                position: "absolute", left: 10, top: 8, bottom: 8,
                width: 1, backgroundColor: C.border,
              }} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {logs.slice(0, 10).map((log) => {
                  const dotColor = LOG_DOT[log.action] ?? C.steel;
                  const label = LOG_LABEL[log.action] ?? log.action;
                  return (
                    <div key={log.id} style={{ display: "flex", gap: 12, padding: "6px 0", cursor: "pointer" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 3, width: 20 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          backgroundColor: dotColor,
                          border: `1.5px solid ${C.ink}`,
                          flexShrink: 0,
                          position: "relative",
                          zIndex: 1,
                        }} />
                      </div>
                      <div style={{ flex: 1, paddingBottom: 10 }}>
                        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                          <strong style={{ color: C.text, fontWeight: 500 }}>{log.projectName}</strong>
                          {" · "}{label}
                        </div>
                        <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{timeAgo(log.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(245,166,35,0.4); }
          50%       { opacity: 0.7; box-shadow: 0 0 0 4px rgba(245,166,35,0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
