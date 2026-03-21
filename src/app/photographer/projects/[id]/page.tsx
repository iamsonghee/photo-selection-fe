"use client";

import { useState, useEffect, ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { differenceInDays, format } from "date-fns";
import {
  ArrowLeft,
  FolderOpen,
  Pencil,
  Link2,
  Copy,
  MessageCircle,
  Zap,
  Upload,
  ListChecks,
  Eye,
  PenLine,
  ChevronRight,
  AlertTriangle,
  Trash2,
  User,
  Calendar,
  Clock,
  Check,
} from "lucide-react";
import { getProjectById } from "@/lib/db";
import { getStatusLabel } from "@/lib/project-status";
import type { Project, ProjectStatus } from "@/types";

// ---------- color tokens ----------
const C = {
  surface:   "#0f2030",
  surface2:  "#152a3a",
  surface3:  "#1a3347",
  steel:     "#669bbc",
  border:    "rgba(102,155,188,0.12)",
  borderMd:  "rgba(102,155,188,0.22)",
  text:      "#e8eef2",
  muted:     "#7a9ab0",
  dim:       "#3a5a6e",
  green:     "#2ed573",
  greenDim:  "#0f2a1e",
  orange:    "#f5a623",
  red:       "#ff4757",
  redDim:    "#2a0f12",
  kakao:     "#FEE500",
};

// ---------- workflow helpers ----------
type WfState = "done" | "current" | "pending";

function getWorkflowStates(status: ProjectStatus): WfState[] {
  switch (status) {
    case "preparing":    return ["current", "pending", "pending", "pending", "pending"];
    case "selecting":    return ["done",    "current", "pending", "pending", "pending"];
    case "confirmed":
    case "editing":
    case "editing_v2":   return ["done",    "done",    "current", "pending", "pending"];
    case "reviewing_v1":
    case "reviewing_v2": return ["done",    "done",    "done",    "current", "pending"];
    case "delivered":    return ["done",    "done",    "done",    "done",    "done"];
    default:             return ["pending", "pending", "pending", "pending", "pending"];
  }
}

const WF_STEPS = [
  {
    name: "업로드",
    desc: (s: WfState, m: number) =>
      s === "done" ? `${m}장 완료` : s === "current" ? "진행 중" : "사진 업로드",
  },
  {
    name: "셀렉",
    desc: (s: WfState) =>
      s === "done" ? "셀렉 완료" : s === "current" ? "고객 셀렉 진행 중" : "업로드 완료 후",
  },
  {
    name: "보정",
    desc: (s: WfState) =>
      s === "done" ? "보정 완료" : s === "current" ? "보정 진행 중" : "셀렉 완료 후",
  },
  {
    name: "검토",
    desc: (s: WfState) =>
      s === "done" ? "검토 완료" : s === "current" ? "고객 검토 중" : "보정본 전달 후",
  },
  {
    name: "납품",
    desc: (s: WfState) =>
      s === "done" ? "납품 완료" : s === "current" ? "납품 완료" : "최종 확정 후",
  },
];

function statusBadgeStyle(status: ProjectStatus) {
  if (status === "preparing")
    return { background: "rgba(245,166,35,0.15)", color: C.orange, border: "1px solid rgba(245,166,35,0.3)" };
  if (status === "delivered")
    return { background: "rgba(46,213,115,0.15)", color: C.green, border: "1px solid rgba(46,213,115,0.3)" };
  return { background: "rgba(102,155,188,0.15)", color: C.steel, border: "1px solid rgba(102,155,188,0.3)" };
}

// ---------- sub-components ----------
function WfDot({ state, num }: { state: WfState; num: number }) {
  const base: React.CSSProperties = {
    width: 22, height: 22, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, flexShrink: 0, fontWeight: 600,
  };
  if (state === "done")
    return (
      <div style={{ ...base, background: C.greenDim, color: C.green, border: "1px solid rgba(46,213,115,0.3)" }}>
        <Check size={11} />
      </div>
    );
  if (state === "current")
    return (
      <div style={{ ...base, background: "rgba(102,155,188,0.15)", color: C.steel, border: "1px solid rgba(102,155,188,0.3)" }}>
        ●
      </div>
    );
  return (
    <div style={{ ...base, background: C.surface3, color: C.dim, border: `1px solid ${C.border}` }}>
      {num}
    </div>
  );
}

function QuickAction({
  icon, label, desc, onClick, disabled, badge,
}: {
  icon: ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
  disabled: boolean;
  badge?: { text: string; color: "green" | "orange" };
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => { if (!disabled) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", padding: "11px 14px",
        background: hovered ? C.surface3 : C.surface2,
        border: `1px solid ${hovered ? C.borderMd : C.border}`,
        borderRadius: 9, display: "flex", alignItems: "center", gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", marginBottom: 7, textAlign: "left",
        opacity: disabled ? 0.35 : 1,
        transform: hovered ? "translateX(2px)" : "none",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 16, flexShrink: 0, color: C.muted }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 10, color: C.muted }}>{desc}</div>
      </div>
      {badge ? (
        <span style={{
          marginLeft: "auto", padding: "2px 7px", borderRadius: 10,
          fontSize: 10, fontWeight: 500,
          background: badge.color === "green" ? C.greenDim : "rgba(245,166,35,0.15)",
          color: badge.color === "green" ? C.green : C.orange,
        }}>
          {badge.text}
        </span>
      ) : (
        <ChevronRight size={12} style={{ marginLeft: "auto", color: C.dim, flexShrink: 0 }} />
      )}
    </button>
  );
}

// ---------- main page ----------
export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [copied, setCopied] = useState(false);

  // edit state
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editShootDate, setEditShootDate] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editRequiredCount, setEditRequiredCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const p = await getProjectById(id);
        setProject(p);
        if (p) {
          setEditName(p.name);
          setEditCustomerName(p.customerName);
          setEditShootDate(p.shootDate);
          setEditDeadline(p.deadline);
          setEditRequiredCount(p.requiredCount);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSaveEdit = async () => {
    if (!project) return;
    setSaveError("");
    const canEditN = ["preparing", "selecting"].includes(project.status);
    const newN = canEditN ? editRequiredCount : project.requiredCount;
    if (canEditN && newN < 1) {
      setSaveError("셀렉 갯수는 1 이상이어야 합니다.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          customer_name: editCustomerName,
          shoot_date: editShootDate,
          deadline: editDeadline,
          required_count: newN,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
      setProject({ ...project, name: editName, customerName: editCustomerName, shootDate: editShootDate, deadline: editDeadline, requiredCount: newN });
      setEditMode(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/c/${project?.accessToken ?? ""}`
      : `/c/${project?.accessToken ?? ""}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "삭제에 실패했습니다.");
      }
      setShowDeleteModal(false);
      router.push("/photographer/dashboard");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
        <span style={{ color: C.muted }}>로딩 중...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: 24 }}>
        <span style={{ color: C.muted }}>프로젝트를 찾을 수 없습니다.</span>
      </div>
    );
  }

  const N = project.requiredCount;
  const M = project.photoCount;
  const wfStates = getWorkflowStates(project.status);
  const daysLeft = differenceInDays(new Date(project.deadline), new Date());
  const isInviteActive = project.status !== "preparing";

  const canViewSelections = project.status !== "preparing";
  const canEditVersions = ["confirmed", "editing", "editing_v2", "reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const canReview = ["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);

  const editVersionsPath =
    project.status === "editing_v2" || project.status === "reviewing_v2"
      ? `/photographer/projects/${id}/upload-versions/v2`
      : `/photographer/projects/${id}/upload-versions`;

  const deadlineColor = daysLeft < 0 ? C.red : daysLeft <= 7 ? C.orange : C.muted;
  const deadlineText =
    daysLeft > 0 ? `D+${daysLeft}` : daysLeft === 0 ? "D-Day" : `+${Math.abs(daysLeft)}일 초과`;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center",
        padding: "0 24px",
        background: "rgba(13,30,40,0.85)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => router.push("/photographer/projects")}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 7,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <ArrowLeft size={13} />
            프로젝트
          </button>
          <span style={{
            padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 500,
            whiteSpace: "nowrap", ...statusBadgeStyle(project.status),
          }}>
            {getStatusLabel(project.status)}
          </span>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ padding: "20px 24px 0", marginBottom: 16 }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 26, fontWeight: 700,
          color: C.text, marginBottom: 6, lineHeight: 1.2,
        }}>
          {project.name}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: C.muted, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <User size={12} />
            {project.customerName || "(고객명 없음)"}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={12} />
            {format(new Date(project.shootDate), "yyyy-MM-dd")} 촬영
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: deadlineColor }}>
            <Clock size={12} />
            {format(new Date(project.deadline), "yyyy-MM-dd")} 기한 · {deadlineText}
          </span>
        </div>
      </div>

      {/* ── Workflow step bar ── */}
      <div style={{ padding: "0 24px", marginBottom: 20 }}>
        <div style={{
          display: "flex", alignItems: "stretch",
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, overflow: "hidden",
        }}>
          {WF_STEPS.map((step, i) => {
            const state = wfStates[i];
            return (
              <div
                key={step.name}
                style={{
                  flex: 1, padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 8,
                  borderRight: i < WF_STEPS.length - 1 ? `1px solid ${C.border}` : "none",
                  position: "relative",
                  background:
                    state === "done" ? "rgba(46,213,115,0.03)"
                    : state === "current" ? "rgba(102,155,188,0.06)"
                    : "transparent",
                }}
              >
                {(state === "done" || state === "current") && (
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
                    background: state === "done" ? "rgba(46,213,115,0.5)" : C.steel,
                  }} />
                )}
                <WfDot state={state} num={i + 1} />
                <div>
                  <div style={{
                    fontSize: 12, fontWeight: 500,
                    color: state === "done" ? C.muted : state === "current" ? C.text : C.dim,
                  }}>
                    {step.name}
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>
                    {step.desc(state, M)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Content grid ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 280px",
        gap: 14, padding: "0 24px 40px", alignItems: "start",
      }}>

        {/* ── Left ── */}
        <div>

          {/* Project info card */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, overflow: "hidden", marginBottom: 12,
          }}>
            <div style={{
              padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.muted }}>
                <FolderOpen size={14} />
                프로젝트 정보
              </div>
              {!editMode && <EditBtn onClick={() => setEditMode(true)} />}
            </div>

            {editMode ? (
              <div style={{ padding: "16px 18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  {[
                    { label: "프로젝트명", value: editName, onChange: setEditName, type: "text" },
                    { label: "고객명",     value: editCustomerName, onChange: setEditCustomerName, type: "text" },
                    { label: "촬영일",     value: editShootDate, onChange: setEditShootDate, type: "date" },
                    { label: "셀렉 기한",  value: editDeadline, onChange: setEditDeadline, type: "date" },
                  ].map((f) => (
                    <label key={f.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 11, color: C.dim }}>{f.label}</span>
                      <input
                        type={f.type}
                        value={f.value}
                        onChange={(e) => f.onChange(e.target.value)}
                        style={{
                          padding: "8px 10px", borderRadius: 8,
                          background: C.surface2, border: `1px solid ${C.borderMd}`,
                          color: C.text, fontSize: 13, fontFamily: "inherit",
                          outline: "none", width: "100%",
                        }}
                      />
                    </label>
                  ))}
                </div>
                {/* 셀렉 갯수 — 보정 시작 전(preparing/selecting)만 편집 가능 */}
                <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                  <span style={{ fontSize: 11, color: C.dim }}>
                    셀렉 갯수 (N)
                    {!["preparing", "selecting"].includes(project.status) && (
                      <span style={{ marginLeft: 6, color: C.orange, fontSize: 10 }}>보정 시작 후 변경 불가</span>
                    )}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={editRequiredCount}
                    disabled={!["preparing", "selecting"].includes(project.status)}
                    onChange={(e) => setEditRequiredCount(Number(e.target.value))}
                    style={{
                      padding: "8px 10px", borderRadius: 8,
                      background: ["preparing", "selecting"].includes(project.status) ? C.surface2 : C.surface3,
                      border: `1px solid ${C.borderMd}`,
                      color: ["preparing", "selecting"].includes(project.status) ? C.text : C.dim,
                      fontSize: 13, fontFamily: "inherit",
                      outline: "none", width: "50%",
                      cursor: ["preparing", "selecting"].includes(project.status) ? "text" : "not-allowed",
                    }}
                  />
                </label>
                {saveError && (
                  <p style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{saveError}</p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { setEditMode(false); setSaveError(""); }}
                    style={{
                      flex: 1, padding: "9px 0", background: "transparent",
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    style={{
                      flex: 1, padding: "9px 0",
                      background: "rgba(102,155,188,0.15)",
                      border: `1px solid rgba(102,155,188,0.3)`, borderRadius: 8,
                      color: C.steel, fontSize: 13, fontWeight: 500,
                      cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    {saving ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: "10px 18px" }}>
                {([
                  { key: "프로젝트명", val: project.name,                                                          valStyle: {} },
                  { key: "고객명",     val: project.customerName || "—",                                           valStyle: {} },
                  { key: "촬영일",     val: format(new Date(project.shootDate), "yyyy-MM-dd"),                    valStyle: {} },
                  { key: "셀렉 기한",  val: `${format(new Date(project.deadline), "yyyy-MM-dd")} (${deadlineText})`, valStyle: { color: deadlineColor } },
                  { key: "셀렉 갯수",  val: `${N}장`,                                                              valStyle: { color: C.steel } },
                  { key: "업로드 수",  val: `${M}장`,                                                              valStyle: {} },
                ] as { key: string; val: string; valStyle: React.CSSProperties }[]).map((row, i, arr) => (
                  <div
                    key={row.key}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "9px 0",
                      borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
                    }}
                  >
                    <span style={{ fontSize: 11, color: C.dim }}>{row.key}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text, ...row.valStyle }}>{row.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invite card */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{
              padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600, color: C.muted,
            }}>
              <Link2 size={14} />
              고객 초대
            </div>
            <div style={{ padding: "16px 18px" }}>

              {/* Invite status */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px", borderRadius: 9, marginBottom: 14,
                background: isInviteActive ? "rgba(46,213,115,0.06)" : C.surface2,
                border: isInviteActive ? "1px solid rgba(46,213,115,0.15)" : `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                  background: isInviteActive ? C.green : C.dim,
                }} />
                <span style={{ fontSize: 12, color: isInviteActive ? C.green : C.muted }}>
                  {isInviteActive
                    ? `초대 활성화됨 · ${getStatusLabel(project.status)}`
                    : "초대 전 · 사진 업로드 필요"}
                </span>
              </div>

              <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>초대 링크</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                <div style={{
                  flex: 1, display: "flex", alignItems: "center",
                  padding: "9px 12px",
                  background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8,
                  minWidth: 0,
                }}>
                  <span style={{
                    fontSize: 11, color: C.muted,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {inviteUrl}
                  </span>
                </div>
                <button
                  onClick={handleCopyLink}
                  style={{
                    padding: "8px 12px",
                    background: copied ? "rgba(46,213,115,0.12)" : C.surface3,
                    border: `1px solid ${copied ? "rgba(46,213,115,0.3)" : C.border}`,
                    borderRadius: 8, color: copied ? C.green : C.muted,
                    fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    whiteSpace: "nowrap", flexShrink: 0,
                    display: "flex", alignItems: "center", gap: 4,
                    transition: "all 0.15s",
                  }}
                >
                  <Copy size={11} />
                  {copied ? "복사됨" : "복사"}
                </button>
                <button
                  onClick={handleCopyLink}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "8px 12px",
                    background: C.kakao, border: "none", borderRadius: 8,
                    color: "#191919", fontSize: 11, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  <MessageCircle size={11} />
                  카카오톡
                </button>
              </div>

              <div style={{ paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.dim }}>
                접속 이력 없음
              </div>
            </div>
          </div>
        </div>

        {/* ── Right ── */}
        <div>

          {/* Quick actions card */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, overflow: "hidden", marginBottom: 12,
          }}>
            <div style={{
              padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600, color: C.muted,
            }}>
              <Zap size={14} />
              빠른 액션
            </div>
            <div style={{ padding: 12 }}>
              <QuickAction
                icon={<Upload size={16} />}
                label="사진 업로드"
                desc={`${M}장 업로드됨`}
                onClick={() => router.push(`/photographer/projects/${id}/upload`)}
                disabled={false}
              />
              <QuickAction
                icon={<ListChecks size={16} />}
                label="셀렉 결과"
                desc={canViewSelections ? `${N}장 중 셀렉 진행` : "업로드 완료 후 가능"}
                onClick={() => router.push(`/photographer/projects/${id}/results`)}
                disabled={!canViewSelections}
                badge={project.status === "selecting" ? { text: "진행 중", color: "green" } : undefined}
              />
              <QuickAction
                icon={<PenLine size={16} />}
                label="보정본 업로드"
                desc={canEditVersions ? "보정본 업로드/관리" : "셀렉 완료 후 가능"}
                onClick={() => router.push(editVersionsPath)}
                disabled={!canEditVersions}
              />
              <QuickAction
                icon={<Eye size={16} />}
                label="보정본 검토"
                desc={canReview ? "고객 검토 현황" : "보정 완료 후 가능"}
                onClick={() => router.push(editVersionsPath)}
                disabled={!canReview}
              />
            </div>
          </div>

          {/* Danger zone */}
          <div style={{
            background: "rgba(255,71,87,0.03)", border: "1px solid rgba(255,71,87,0.12)",
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{ padding: "11px 16px", borderBottom: "1px solid rgba(255,71,87,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: C.red }}>
                <AlertTriangle size={12} />
                위험 구역
              </div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <DangerBtn onClick={() => { setDeleteError(""); setShowDeleteModal(true); }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete modal ── */}
      {showDeleteModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", padding: 16,
        }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.borderMd}`,
            borderRadius: 14, padding: 24, width: "100%", maxWidth: 360,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>
              프로젝트 삭제
            </h3>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
              정말 삭제하시겠습니까? 모든 사진과 셀렉 데이터가 영구적으로 삭제됩니다.
            </p>
            {deleteError && (
              <p style={{ marginTop: 12, fontSize: 13, color: C.red }}>{deleteError}</p>
            )}
            <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  flex: 1, padding: "10px 0", background: "transparent",
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1, padding: "10px 0", background: C.redDim,
                  border: "1px solid rgba(255,71,87,0.3)", borderRadius: 8,
                  color: C.red, fontSize: 13, fontWeight: 500,
                  cursor: deleting ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── micro components with hover ──
function EditBtn({ onClick }: { onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: "4px 10px", background: "transparent",
        border: `1px solid ${h ? C.steel : C.border}`, borderRadius: 6,
        color: h ? C.steel : C.muted, fontSize: 11, cursor: "pointer",
        fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
        transition: "all 0.15s",
      }}
    >
      <Pencil size={11} />
      수정
    </button>
  );
}

function DangerBtn({ onClick }: { onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: "100%", padding: "9px 14px", background: h ? C.redDim : "transparent",
        border: "1px solid rgba(255,71,87,0.3)", borderRadius: 8,
        color: C.red, fontSize: 12, fontWeight: 500, cursor: "pointer",
        fontFamily: "inherit", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 6, transition: "all 0.15s",
      }}
    >
      <Trash2 size={14} />
      프로젝트 삭제
    </button>
  );
}
