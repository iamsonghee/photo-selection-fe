"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Bell,
  FolderOpen,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Eye,
  ChevronRight,
  Image,
  Check,
  PackageCheck,
} from "lucide-react";
import { getProjectsByPhotographerId, getProjectLogsRecent } from "@/lib/db";
import type { Project, ProjectStatus } from "@/types";
import type { ProjectLogItem } from "@/lib/db";

// ── colour tokens ──────────────────────────────────────────
const C = {
  bg: "#0d1e28",
  card: "#0f2030",
  cardHover: "#152a3a",
  point: "#669bbc",
  text: "#e8eef2",
  muted: "#7a9ab0",
  dim: "#3a5a6e",
  border: "rgba(102,155,188,0.12)",
  green: "#2ed573",
  orange: "#f5a623",
  red: "#ff4757",
};

// ── status helpers ─────────────────────────────────────────
const STATUS_LABEL: Record<ProjectStatus, string> = {
  preparing: "준비 중",
  selecting: "셀렉 중",
  confirmed: "확정 완료",
  editing: "편집 중",
  reviewing_v1: "검토 중 v1",
  editing_v2: "재보정 중",
  reviewing_v2: "검토 중 v2",
  delivered: "납품 완료",
};

const STATUS_COLOR: Record<ProjectStatus, string> = {
  preparing: "#3a5a6e",
  selecting: "#669bbc",
  confirmed: "#2ed573",
  editing: "#f5a623",
  reviewing_v1: "#8db8d4",
  editing_v2: "#f5a623",
  reviewing_v2: "#8db8d4",
  delivered: "#3a5a6e",
};

const ACTIVE_STATUSES: ProjectStatus[] = [
  "selecting",
  "confirmed",
  "editing",
  "reviewing_v1",
  "editing_v2",
  "reviewing_v2",
];

function dday(deadline: string): string {
  const diff = Math.ceil(
    (new Date(deadline).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
      86_400_000
  );
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return "D-day";
  return `D+${Math.abs(diff)}`;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

const LOG_DOT: Record<string, string> = {
  created: "#669bbc",
  uploaded: "#f5a623",
  selecting: "#2ed573",
  confirmed: "#2ed573",
  editing: "#f5a623",
  delivered: "#2ed573",
  revision: "#ff4757",
};

const LOG_LABEL: Record<string, string> = {
  created: "프로젝트 생성",
  uploaded: "사진 업로드",
  selecting: "셀렉 완료",
  confirmed: "확정 완료",
  editing: "보정 시작",
  delivered: "납품 완료",
  revision: "재보정 요청",
};

// ── StatusBadge ────────────────────────────────────────────
function StatusBadge({ status }: { status: ProjectStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      style={{
        color,
        border: `1px solid ${color}40`,
        backgroundColor: `${color}18`,
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 20,
        letterSpacing: "0.02em",
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── ProjectProgressBar ──────────────────────────────────────
function ProjectProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = pct >= 100 ? C.green : C.point;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: "rgba(102,155,188,0.15)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 2,
            backgroundColor: color,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>
        {value}/{max}
      </span>
    </div>
  );
}

// ── ProjectCard ────────────────────────────────────────────
function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const accentColor = STATUS_COLOR[project.status];
  const ddayStr = dday(project.deadline);
  const ddayColor =
    ddayStr.startsWith("D+") ? C.red : ddayStr === "D-day" ? C.orange : C.text;

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
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 10,
        padding: "14px 16px",
        cursor: "pointer",
        transition: "background-color 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = C.cardHover;
        (e.currentTarget as HTMLDivElement).style.transform = "translateX(2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = C.card;
        (e.currentTarget as HTMLDivElement).style.transform = "translateX(0)";
      }}
    >
      {/* 상단 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project.name}
          </p>
          <p style={{ fontSize: 11, color: C.muted }}>{project.customerName || "—"}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* 진행바 */}
      <ProjectProgressBar value={project.photoCount} max={project.requiredCount} />

      {/* 하단 메타 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted }}>
            <Image size={11} />
            {project.photoCount}장
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted }}>
            <Check size={11} />
            {project.requiredCount}장
          </span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: ddayColor, fontFamily: "'Playfair Display', serif" }}>
          {ddayStr}
        </span>
      </div>
    </div>
  );
}

// ── SectionTitle ───────────────────────────────────────────
function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {children}
      </span>
      {count !== undefined && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.point,
            backgroundColor: `${C.point}20`,
            borderRadius: 20,
            padding: "1px 7px",
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<ProjectLogItem[]>([]);
  const [userName, setUserName] = useState<string>("");
  const [photographerId, setPhotographerId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const profileRes = await fetch("/api/photographer/profile").then((r) =>
          r.ok ? r.json() : null
        );
        const pid: string | null = profileRes?.id ?? null;
        if (!pid) {
          setLoading(false);
          return;
        }
        setUserId(profileRes.authId ?? pid);
        setPhotographerId(pid);
        const displayName =
          profileRes.name?.trim() ||
          profileRes.email?.split("@")[0] ||
          "사용자";
        setUserName(displayName);
        if (profileRes.name?.trim()) setProfileName(profileRes.name.trim());

        const [list, logRes] = await Promise.all([
          getProjectsByPhotographerId(pid),
          fetch("/api/photographer/project-logs").then((r) =>
            r.ok ? r.json() : []
          ),
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
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: C.muted, fontSize: 13 }}>불러오는 중…</p>
      </div>
    );
  }

  if (!photographerId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <p style={{ color: C.muted, fontSize: 13 }}>
          로그인하면 프로젝트를 볼 수 있습니다
        </p>
        <Link
          href="/auth"
          style={{
            backgroundColor: C.point,
            color: "#fff",
            padding: "8px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          로그인
        </Link>
      </div>
    );
  }

  // ── derived data ──
  const preparingProjects = projects.filter((p) => p.status === "preparing");
  const activeProjects = projects.filter((p) =>
    ACTIVE_STATUSES.includes(p.status)
  );
  const deliveredProjects = projects
    .filter((p) => p.status === "delivered")
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  const recentDelivered = deliveredProjects.slice(0, 1);

  const confirmedCount = projects.filter((p) => p.status === "confirmed").length;
  const revisionCount = projects.filter((p) => p.status === "editing_v2").length;
  const reviewingCount = projects.filter(
    (p) => p.status === "reviewing_v1" || p.status === "reviewing_v2"
  ).length;
  const hasAction = confirmedCount + revisionCount + reviewingCount > 0;

  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const thisMonthCount = projects.filter((p) => {
    const d = new Date(p.shootDate);
    return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
  }).length;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── Topbar ── */}
      <div
        style={{
          padding: "20px 28px 16px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <p style={{ fontSize: 15, fontWeight: 500, color: C.text, marginBottom: 3 }}>
            안녕하세요, <span style={{ color: C.point, fontWeight: 600 }}>{userName}</span> 님 👋
          </p>
          <p style={{ fontSize: 11, color: C.muted }}>오늘도 좋은 하루 되세요</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              backgroundColor: C.card,
              color: C.muted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            aria-label="알림"
          >
            <Bell size={15} />
          </button>
          <button
            type="button"
            onClick={() => router.push("/photographer/projects/new")}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 8,
              border: "none",
              backgroundColor: C.point,
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <Plus size={14} />
            새 프로젝트
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", minHeight: "calc(100vh - 73px)" }}>
        {/* ── Left Column ── */}
        <div style={{ flex: 1, minWidth: 0, padding: "24px 28px", borderRight: `1px solid ${C.border}` }}>

          {/* 1. 액션 필요 섹션 */}
          {hasAction && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: C.red,
                    display: "inline-block",
                    animation: "pulse 2s infinite",
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  지금 확인이 필요해요
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {confirmedCount > 0 && (
                  <Link href="/photographer/projects" style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        backgroundColor: C.card,
                        border: `1px solid ${C.border}`,
                        borderTop: `3px solid ${C.green}`,
                        borderRadius: 10,
                        padding: "14px 16px",
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = C.cardHover)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = C.card)}
                    >
                      <CheckCircle2 size={20} color={C.green} style={{ margin: "0 auto 8px" }} />
                      <p style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif" }}>{confirmedCount}</p>
                      <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>고객 확정 완료</p>
                    </div>
                  </Link>
                )}
                {revisionCount > 0 && (
                  <Link href="/photographer/projects" style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        backgroundColor: C.card,
                        border: `1px solid ${C.border}`,
                        borderTop: `3px solid ${C.red}`,
                        borderRadius: 10,
                        padding: "14px 16px",
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = C.cardHover)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = C.card)}
                    >
                      <RefreshCw size={20} color={C.red} style={{ margin: "0 auto 8px" }} />
                      <p style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif" }}>{revisionCount}</p>
                      <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>재보정 요청</p>
                    </div>
                  </Link>
                )}
                {reviewingCount > 0 && (
                  <Link href="/photographer/projects" style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        backgroundColor: C.card,
                        border: `1px solid ${C.border}`,
                        borderTop: `3px solid #8db8d4`,
                        borderRadius: 10,
                        padding: "14px 16px",
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = C.cardHover)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = C.card)}
                    >
                      <Eye size={20} color="#8db8d4" style={{ margin: "0 auto 8px" }} />
                      <p style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif" }}>{reviewingCount}</p>
                      <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>고객 검토 중</p>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* 2-a. 대기 중 */}
          {preparingProjects.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle count={preparingProjects.length}>대기 중</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {preparingProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </div>
          )}

          {/* 2-b. 진행 중 */}
          {activeProjects.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle count={activeProjects.length}>진행 중</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </div>
          )}

          {/* 2-c. 최근 완료 */}
          {recentDelivered.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <SectionTitle>최근 완료</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                {recentDelivered.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
              <Link
                href="/photographer/projects"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 4,
                  fontSize: 11,
                  color: C.point,
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                전체 프로젝트 보기
                <ChevronRight size={12} />
              </Link>
            </div>
          )}

          {/* 프로젝트 없을 때 */}
          {projects.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "60px 0",
                color: C.muted,
              }}
            >
              <FolderOpen size={36} color={C.dim} style={{ margin: "0 auto 14px" }} />
              <p style={{ fontSize: 13, marginBottom: 16 }}>아직 프로젝트가 없습니다</p>
              <button
                type="button"
                onClick={() => router.push("/photographer/projects/new")}
                style={{
                  backgroundColor: C.point,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={14} />
                첫 프로젝트 만들기
              </button>
            </div>
          )}
        </div>

        {/* ── Right Column ── */}
        <div style={{ width: 260, flexShrink: 0, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 통계 카드 2개 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "14px 12px",
              }}
            >
              <FolderOpen size={16} color={C.point} style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif" }}>
                {projects.length}
              </p>
              <p style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>전체 프로젝트</p>
            </div>
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "14px 12px",
              }}
            >
              <Calendar size={16} color={C.orange} style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif" }}>
                {thisMonthCount}
              </p>
              <p style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>이번 달 촬영</p>
            </div>
          </div>

          {/* 활동 로그 */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              활동 로그
            </p>
            {logs.length === 0 ? (
              <p style={{ fontSize: 12, color: C.dim, textAlign: "center", padding: "20px 0" }}>
                아직 활동이 없습니다
              </p>
            ) : (
              <div style={{ position: "relative" }}>
                {/* 세로 타임라인 선 */}
                <div
                  style={{
                    position: "absolute",
                    left: 6,
                    top: 7,
                    bottom: 7,
                    width: 1,
                    backgroundColor: C.border,
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {logs.slice(0, 10).map((log) => {
                    const dotColor = LOG_DOT[log.action] ?? C.point;
                    const label = LOG_LABEL[log.action] ?? log.action;
                    return (
                      <div
                        key={log.id}
                        style={{
                          display: "flex",
                          gap: 12,
                          paddingBottom: 16,
                          position: "relative",
                        }}
                      >
                        {/* dot */}
                        <div
                          style={{
                            width: 13,
                            height: 13,
                            borderRadius: "50%",
                            backgroundColor: dotColor,
                            flexShrink: 0,
                            marginTop: 1,
                            boxShadow: `0 0 0 3px ${dotColor}25`,
                            position: "relative",
                            zIndex: 1,
                          }}
                        />
                        {/* content */}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 11, color: C.text, fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {log.projectName}
                          </p>
                          <p style={{ fontSize: 10, color: C.muted }}>{label}</p>
                          <p style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{timeAgo(log.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
