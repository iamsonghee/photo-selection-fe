"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Bell,
  FolderOpen,
  CheckCircle2,
  RefreshCw,
  Eye,
  Image as ImageIcon,
  Check,
  CheckCircle,
  Upload,
  AlertCircle,
} from "lucide-react";
import { BETA_MAX_PROJECTS_TOTAL } from "@/lib/beta-limits";
import { getProjectsByPhotographerId } from "@/lib/db";
import type { Project, ProjectStatus } from "@/types";
import type { ProjectLogItem } from "@/lib/db";
import { useProfile } from "@/contexts/ProfileContext";
import { ProjectProgressBar } from "@/components/ProjectProgressBar";
import { PHOTOGRAPHER_THEME as C, PS_DISPLAY, PS_FONT } from "@/lib/photographer-theme";

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
  preparing: { background: C.surface3,                    color: C.muted,   border: `1px solid ${C.border}` },
  selecting: { background: "rgba(79,126,255,0.15)",      color: C.steel,   border: "1px solid rgba(79,126,255,0.3)" },
  editing:   { background: "rgba(245,166,35,0.12)",       color: C.orange,  border: "1px solid rgba(245,166,35,0.3)"  },
  revision:  { background: "rgba(255,71,87,0.12)",        color: C.red,     border: "1px solid rgba(255,71,87,0.3)"   },
  delivered: { background: C.greenDim,                    color: C.green,   border: "1px solid rgba(46,213,115,0.3)"  },
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

// ── StatusBadge ────────────────────────────────────────────
function StatusBadge({ status, photoCount, requiredCount }: {
  status: ProjectStatus;
  photoCount?: number;
  requiredCount?: number;
}) {
  if (status === "preparing") {
    const pc = photoCount ?? 0;
    const rc = requiredCount ?? Infinity;
    const badge = getPreparingBadge(pc, rc);
    let bgColor: string;
    let borderColor: string;
    if (pc === 0) {
      bgColor = C.surface3;
      borderColor = `1px solid rgba(113,113,122,0.35)`;
    } else if (pc < rc) {
      bgColor = "rgba(79,126,255,0.12)";
      borderColor = `1px solid rgba(79,126,255,0.25)`;
    } else {
      bgColor = "rgba(245,166,35,0.12)";
      borderColor = `1px solid rgba(245,166,35,0.3)`;
    }
    return (
      <span style={{
        background: bgColor,
        color: badge.color,
        border: borderColor,
        fontSize: 10,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 20,
        flexShrink: 0,
      }}>
        {badge.label}
      </span>
    );
  }
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
  const photoCount = project.photoCount ?? 0;
  const requiredCount = project.requiredCount ?? 0;
  const accentColor = project.status === "preparing"
    ? getPreparingBorderColor(photoCount, requiredCount)
    : STATUS_LEFT[project.status];
  const { text: ddayText, warn } = dday(project.deadline);
  const ddayStyle: React.CSSProperties = warn
    ? { color: C.orange, background: C.orangeDim }
    : { color: C.muted,  background: C.surface3  };

  // preparing 상태 하단 메타 텍스트
  const preparingMeta = (() => {
    if (project.status !== "preparing") return null;
    if (photoCount === 0) {
      return (
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.muted }}>
          <ImageIcon size={10} />
          사진 업로드를 시작해주세요
        </span>
      );
    } else if (photoCount < requiredCount) {
      return (
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.muted }}>
          <ImageIcon size={10} />
          {photoCount} / {requiredCount}장 업로드됨
        </span>
      );
    } else {
      return (
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.orange }}>
          <CheckCircle size={10} />
          {photoCount}장 준비 완료 · 고객 초대 활성화 필요
        </span>
      );
    }
  })();

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
        borderTop:    `1px solid ${hovered ? C.borderMd : C.border}`,
        borderRight:  `1px solid ${hovered ? C.borderMd : C.border}`,
        borderBottom: `1px solid ${hovered ? C.borderMd : C.border}`,
        borderLeft:   `3px solid ${accentColor}`,
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
        {/* 카드 상단: 프로젝트명 + 고객명 + 배지 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{project.name}</span>
          <span style={{ fontSize: 12, color: C.muted }}>{project.customerName || "—"}</span>
          <StatusBadge status={project.status} photoCount={photoCount} requiredCount={requiredCount} />
        </div>

        {/* 진행 바 */}
        <ProjectProgressBar status={project.status} photoCount={photoCount} requiredCount={requiredCount} />

        {/* 하단 메타 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            {preparingMeta ?? (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.muted }}>
                  <ImageIcon size={10} />
                  {project.photoCount}장
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.muted }}>
                  <Check size={10} />
                  {project.requiredCount}장
                </span>
              </>
            )}
          </div>
          <span style={{
            ...ddayStyle,
            fontSize: 10,
            fontWeight: 500,
            padding: "2px 7px",
            borderRadius: 5,
            flexShrink: 0,
          }}>
            {ddayText}
          </span>
        </div>
      </div>

      {/* 화살표 */}
      <span style={{ fontSize: 12, color: hovered ? C.steel : C.dim, transition: "color 0.15s" }}>→</span>
    </div>
  );
}

// ── ActionCard ─────────────────────────────────────────────
function ActionCard({
  count,
  label,
  sub,
  icon,
  topColor,
  numColor,
  bgTint,
  href,
}: {
  count: number;
  label: string;
  sub: string;
  icon: React.ReactNode;
  topColor: string;
  numColor: string;
  bgTint: string;
  href?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href ?? "/photographer/projects"} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? C.surface2 : bgTint,
          borderTop:    `2px solid ${topColor}`,
          borderRight:  `1px solid ${hovered ? C.borderMd : C.border}`,
          borderBottom: `1px solid ${hovered ? C.borderMd : C.border}`,
          borderLeft:   `1px solid ${hovered ? C.borderMd : C.border}`,
          borderRadius: 10,
          padding: "14px",
          cursor: "pointer",
          transition: "all 0.18s",
          transform: hovered ? "translateY(-2px)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
          <span>{icon}</span>
        </div>
        <div style={{
          fontFamily: PS_DISPLAY,
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

// ── SectionHeader ──────────────────────────────────────────
function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
      <span style={{
        fontSize: 11, fontWeight: 600, letterSpacing: 1,
        textTransform: "uppercase", color: C.dim,
      }}>
        {title}
      </span>
      <span style={{
        background: C.surface2, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "1px 7px", fontSize: 10, color: C.muted,
      }}>
        {count}
      </span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<ProjectLogItem[]>([]);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <p style={{ color: C.muted, fontSize: 13 }}>불러오는 중…</p>
      </div>
    );
  }

  if (!profile?.id) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "80px 0" }}>
        <p style={{ color: C.muted, fontSize: 13 }}>로그인하면 프로젝트를 볼 수 있습니다</p>
        <Link href="/auth" style={{
          backgroundColor: C.steel, color: "#fff",
          padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none",
        }}>
          로그인
        </Link>
      </div>
    );
  }

  // ── derived data: 최근 업데이트 순 6개 제한 ──
  const sortedAll = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const displayProjects      = sortedAll.slice(0, 6);
  const showViewAllBtn       = projects.length > 6;
  const totalDeliveredCount  = projects.filter((p) => p.status === "delivered").length;

  const preparingProjects = displayProjects.filter((p) => p.status === "preparing");
  const activeProjects    = displayProjects.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const recentDelivered   = displayProjects.filter((p) => p.status === "delivered").slice(0, 1);

  const confirmedCount = projects.filter((p) => p.status === "confirmed").length;
  const revisionCount  = projects.filter((p) => p.status === "editing_v2").length;
  const reviewingCount = projects.filter((p) =>
    p.status === "reviewing_v1" || p.status === "reviewing_v2"
  ).length;
  // preparing 상태 중 photo_count >= required_count인 프로젝트 (초대 활성화 필요)
  const inviteReadyProjects = projects.filter(
    (p) => p.status === "preparing" && (p.photoCount ?? 0) >= (p.requiredCount ?? Infinity)
  );
  const inviteReadyCount = inviteReadyProjects.length;
  // 초대 활성화 필요 카드 클릭 시 이동할 href
  const inviteReadyHref = inviteReadyProjects.length === 1
    ? `/photographer/projects/${inviteReadyProjects[0].id}/upload`
    : "/photographer/projects";
  const hasAction = confirmedCount + revisionCount + reviewingCount + inviteReadyCount > 0;

  const thisMonth = new Date().getMonth();
  const thisYear  = new Date().getFullYear();
  const thisMonthCount = projects.filter((p) => {
    const d = new Date(p.shootDate);
    return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
  }).length;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "transparent", fontFamily: PS_FONT }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: C.topbarBg,
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
              cursor: "pointer", color: C.muted,
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
              fontFamily: PS_FONT,
            }}
          >
            <Plus size={12} />
            새 프로젝트
          </button>
        </div>
      </div>

      {/* ── Body: 2-column grid ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 260px",
        minHeight: "calc(100vh - 52px)",
      }}>

        {/* ── Left column ── */}
        <div style={{
          padding: "22px 22px 22px 24px",
          overflowY: "auto",
          borderRight: `1px solid ${C.border}`,
        }}>

          {/* 1. 액션 필요 섹션 */}
          {hasAction && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  backgroundColor: C.orange,
                  animation: "pulse 2s infinite",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: 1,
                  textTransform: "uppercase", color: C.dim,
                }}>
                  지금 확인이 필요해요
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {confirmedCount > 0 && (
                  <ActionCard
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
                    count={reviewingCount}
                    label="고객 검토 중"
                    sub="보정본 검토 대기"
                    icon={<Eye size={16} color={C.steelLt} />}
                    topColor={C.steel}
                    numColor={C.steelLt}
                    bgTint="rgba(79,126,255,0.06)"
                  />
                )}
                {inviteReadyCount > 0 && (
                  <ActionCard
                    count={inviteReadyCount}
                    label="초대 활성화 필요"
                    sub="사진 준비 완료 · 고객 초대 활성화"
                    icon={<Upload size={16} color={C.orange} />}
                    topColor={C.orange}
                    numColor={C.orange}
                    bgTint="rgba(245,166,35,0.04)"
                    href={inviteReadyHref}
                  />
                )}
              </div>
            </div>
          )}

          {/* 2. 대기 중 */}
          {preparingProjects.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionHeader title="대기 중" count={preparingProjects.length} />
              {preparingProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}

          {/* 3. 진행 중 */}
          {activeProjects.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionHeader title="진행 중" count={activeProjects.length} />
              {activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}

          {/* 4. 최근 완료 */}
          {recentDelivered.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionHeader title="최근 완료" count={totalDeliveredCount} />
              {recentDelivered.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}

          {/* 전체 보기 버튼: 6개 초과 시 */}
          {showViewAllBtn && (
            <Link
              href="/photographer/projects"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "100%", padding: 9,
                border: `1px dashed ${C.border}`, borderRadius: 9,
                background: "transparent", color: C.dim,
                fontSize: 12, textDecoration: "none", marginBottom: 20,
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

        {/* ── Right column ── */}
        <div style={{ padding: 20, overflowY: "auto", background: "rgba(0,0,0,0.12)" }}>

          {/* 베타 사용량 카드 */}
          {(() => {
            const count = projects.length;
            const pct = Math.min(100, Math.round((count / BETA_MAX_PROJECTS_TOTAL) * 100));
            const barColor = count >= BETA_MAX_PROJECTS_TOTAL ? C.red : count >= 8 ? C.orange : C.steel;
            const textColor = count >= BETA_MAX_PROJECTS_TOTAL ? C.red : count >= 8 ? C.orange : C.muted;
            return (
              <div style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.dim, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                    베타 사용량
                  </span>
                  {count >= BETA_MAX_PROJECTS_TOTAL && (
                    <AlertCircle size={13} color={C.red} />
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>프로젝트</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: textColor }}>
                    {count} / {BETA_MAX_PROJECTS_TOTAL}
                  </span>
                </div>
                <div style={{ height: 4, background: C.surface3, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2, background: barColor,
                    width: `${pct}%`, transition: "width 0.3s",
                  }} />
                </div>
              </div>
            );
          })()}

          {/* 통계 */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
            marginBottom: 16, paddingBottom: 16,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 12px", textAlign: "center",
            }}>
              <div style={{
                fontFamily: PS_DISPLAY,
                fontSize: 22, lineHeight: 1, marginBottom: 3, color: C.steel,
              }}>
                {projects.length}
              </div>
              <div style={{ fontSize: 10, color: C.dim }}>전체 프로젝트</div>
            </div>
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 12px", textAlign: "center",
            }}>
              <div style={{
                fontFamily: PS_DISPLAY,
                fontSize: 22, lineHeight: 1, marginBottom: 3, color: C.orange,
              }}>
                {thisMonthCount}
              </div>
              <div style={{ fontSize: 10, color: C.dim }}>이번 달 촬영</div>
            </div>
          </div>

          {/* 최근 활동 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 1,
              textTransform: "uppercase", color: C.dim,
            }}>
              최근 활동
            </span>
          </div>

          {logs.length === 0 ? (
            <p style={{ fontSize: 12, color: C.dim, textAlign: "center", padding: "20px 0" }}>
              아직 활동이 없습니다
            </p>
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
                    <div key={log.id} style={{ display: "flex", gap: 12, padding: "6px 0" }}>
                      <div style={{
                        display: "flex", flexDirection: "column",
                        alignItems: "center", flexShrink: 0,
                        paddingTop: 3, width: 20,
                      }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          backgroundColor: dotColor,
                          border: `1.5px solid ${C.ink}`,
                          position: "relative", zIndex: 1, flexShrink: 0,
                        }} />
                      </div>
                      <div style={{ flex: 1, paddingBottom: 10 }}>
                        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                          <strong style={{ color: C.text, fontWeight: 500 }}>{log.projectName}</strong>
                          {" · "}{label}
                        </div>
                        <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                          {timeAgo(log.createdAt)}
                        </div>
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
      `}</style>
    </div>
  );
}
