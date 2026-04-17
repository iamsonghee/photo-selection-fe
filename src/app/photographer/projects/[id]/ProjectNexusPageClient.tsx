"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { JetBrains_Mono } from "next/font/google";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Flag,
  ListChecks,
  Lock,
  PenLine,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { getProjectById } from "@/lib/db";
import type { Project, ProjectStatus } from "@/types";
import { PHOTOGRAPHER_THEME as C } from "@/lib/photographer-theme";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";
import { StatusPill } from "@/components/ui/StatusPill";
import { ProjectActionFlow } from "@/components/photographer/ProjectActionFlow";
import type { FlowStep } from "@/components/photographer/ProjectActionFlow";
import styles from "./ProjectNexusDashboard.module.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--nx-font-mono",
  display: "swap",
});

type WfState = "done" | "current" | "pending";

function getWorkflowStates(status: ProjectStatus): WfState[] {
  switch (status) {
    case "preparing":
      return ["current", "pending", "pending", "pending", "pending"];
    case "selecting":
      return ["done", "current", "pending", "pending", "pending"];
    case "confirmed":
    case "editing":
    case "editing_v2":
      return ["done", "done", "current", "pending", "pending"];
    case "reviewing_v1":
    case "reviewing_v2":
      return ["done", "done", "done", "current", "pending"];
    case "delivered":
      return ["done", "done", "done", "done", "done"];
    default:
      return ["pending", "pending", "pending", "pending", "pending"];
  }
}


type LogRow = {
  id: string;
  action: string;
  createdAt: string;
};

type FlowVisual = "done" | "active" | "locked";

function formatLogTime(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, "HH:mm");
    if (isYesterday(d)) return `YEST ${format(d, "HH:mm")}`;
    return format(d, "MM/dd HH:mm");
  } catch {
    return "—";
  }
}

function logActionLabel(action: string): string {
  switch (action) {
    case "created":
      return "프로젝트가 생성되었습니다";
    case "uploaded":
      return "원본 업로드가 기록되었습니다";
    case "selecting":
      return "셀렉 단계로 전환되었습니다";
    case "confirmed":
      return "고객 셀렉이 확정되었습니다";
    case "editing":
      return "보정 단계가 시작되었습니다";
    default:
      return `이벤트: ${action}`;
  }
}

export function ProjectNexusPageClient() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editShootDate, setEditShootDate] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editRequiredCount, setEditRequiredCount] = useState(0);
  const [editAllowRevision, setEditAllowRevision] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [showEditGuideModal, setShowEditGuideModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pinReveal, setPinReveal] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const p = await getProjectById(id);
      setProject(p);
    } catch (e) {
      console.error(e);
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/photographer/project-logs?project_id=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          id: string;
          action: string;
          createdAt: string;
        }[];
        if (!cancelled) {
          setLogs(
            (Array.isArray(data) ? data : []).map((r) => ({
              id: r.id,
              action: r.action,
              createdAt: r.createdAt,
            })),
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSaveEdit = async () => {
    if (!project) return;
    setSaveError("");
    const canEditN = ["preparing", "selecting"].includes(project.status);
    const newN = canEditN ? editRequiredCount : project.requiredCount;
    if (canEditN && newN < 1) {
      setSaveError("셀렉 갯수는 1 이상이어야 합니다.");
      return;
    }
    if (project.status !== "preparing" && canEditN && project.photoCount < newN) {
      setSaveError(`업로드된 사진 수(${project.photoCount}장) 이하로 설정해주세요.`);
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
          allow_revision: editAllowRevision,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
      setProject({
        ...project,
        name: editName,
        customerName: editCustomerName,
        shootDate: editShootDate,
        deadline: editDeadline,
        requiredCount: newN,
        allowRevision: editAllowRevision,
      });
      setEditMode(false);
      setToast("메타데이터가 저장되었습니다.");
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

  const handleCopyUrl = () => {
    if (!project?.accessToken) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setToast("포털 URL이 복사되었습니다.");
  };

  const handleCopyInviteBundle = () => {
    const pin = project?.accessPin;
    const text = pin ? `링크: ${inviteUrl}\n비밀번호: ${pin}` : inviteUrl;
    void navigator.clipboard.writeText(text);
    setToast("링크와 비밀번호가 복사되었습니다.");
  };

  const handleSavePin = async (newPin: string | null) => {
    if (!project) return;
    setPinError("");
    setPinSaving(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_pin: newPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "저장 실패");
      setProject({ ...project, accessPin: newPin });
      setShowPinModal(false);
      setPinInput("");
      setToast(newPin ? "액세스 코드가 저장되었습니다." : "액세스 코드가 제거되었습니다.");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setPinSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "삭제에 실패했습니다.");
      }
      router.push("/photographer/dashboard");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = () => {
    if (!project) return;
    setEditName(project.name);
    setEditCustomerName(project.customerName);
    setEditShootDate(project.shootDate);
    setEditDeadline(project.deadline);
    setEditRequiredCount(project.requiredCount);
    setEditAllowRevision(project.allowRevision);
    setSaveError("");
    setEditMode(true);
  };

  if (loading) {
    return (
      <div className={`${styles.pageRoot} ${jetbrains.variable}`}>
        <div className={styles.loadingState}>LOADING_PROJECT...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className={`${styles.pageRoot} ${jetbrains.variable}`}>
        <div className={styles.loadingState}>PROJECT_NOT_FOUND</div>
      </div>
    );
  }

  const N = project.requiredCount;
  const M = project.photoCount;
  const wfStates = getWorkflowStates(project.status);
  const isInviteActive = project.status !== "preparing";
  const canViewSelections = project.status !== "preparing";
  const canEditVersions = ["confirmed", "editing", "editing_v2", "reviewing_v1", "reviewing_v2", "delivered"].includes(
    project.status,
  );
  const canReview = ["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const editVersionsPath =
    project.status === "editing_v2" || project.status === "reviewing_v2"
      ? `/photographer/projects/${id}/upload-versions/v2`
      : `/photographer/projects/${id}/upload-versions`;

  const shootDisplay = (() => {
    try {
      return format(parseISO(project.shootDate), "yyyy-MM-dd");
    } catch {
      return project.shootDate;
    }
  })();

  const deadlineDisplay = (() => {
    try {
      return format(parseISO(project.deadline), "yyyy-MM-dd");
    } catch {
      return project.deadline;
    }
  })();

  const uploadDone = project.status !== "preparing";
  const selectingActive = project.status === "selecting";

  const prjBreadcrumb = project.displayId ?? id.slice(0, 8).toUpperCase();
  const idBadge =
    project.displayId?.replace(/^PRJ-/i, "") ?? id.replace(/-/g, "").slice(0, 6).toUpperCase();

  const preparing = project.status === "preparing";
  const selecting = project.status === "selecting";
  const inRetouchPhase = ["confirmed", "editing", "editing_v2"].includes(project.status);
  const retouchDone = ["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status);
  const reviewActive = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  const delivered = project.status === "delivered";

  const f1: FlowVisual = !uploadDone ? "active" : "done";
  const f2: FlowVisual = !canViewSelections ? "locked" : selectingActive ? "active" : "done";
  const f3: FlowVisual =
    preparing || selecting ? "locked" : retouchDone ? "done" : inRetouchPhase ? "active" : "locked";
  const f4: FlowVisual =
    !["reviewing_v1", "reviewing_v2", "delivered"].includes(project.status) ? "locked" : delivered ? "done" : "active";
  const f5: FlowVisual = delivered ? "done" : "locked";

  const flowClass = (f: FlowVisual) =>
    f === "done" ? styles.flowDone : f === "active" ? styles.flowActive : styles.flowLocked;

  // 재보정 관련 상태 (7단계 전용)
  const inV2Phase = ["editing_v2", "reviewing_v2", "delivered"].includes(project.status);
  const useSevenSteps = project.allowRevision && inV2Phase;

  const f5r: FlowVisual = // 재보정 업로드 (7단계 index 4)
    project.status === "editing_v2" ? "active"
    : ["reviewing_v2", "delivered"].includes(project.status) ? "done"
    : "locked";
  const f6r: FlowVisual = // 재보정 검토 (7단계 index 5)
    project.status === "reviewing_v2" ? "active"
    : project.status === "delivered" ? "done"
    : "locked";
  const f7r: FlowVisual = delivered ? "done" : "locked"; // 납품 완료 (7단계 index 6)

  const actionFlowSteps: FlowStep[] = useSevenSteps
    ? [
        {
          label: "원본 업로드",
          desc: f1 === "done" ? "완료" : "진행 중",
          icon: <Upload size={20} color="#FF4D00" />,
          state: f1,
          onClick: () => router.push(`/photographer/projects/${id}/upload`),
        },
        {
          label: "셀렉 결과 확인",
          desc: f2 === "done" ? "완료" : f2 === "active" ? "고객 셀렉 중" : "이전 단계 완료 후 가능",
          icon: <ListChecks size={20} color="#FF4D00" />,
          state: f2,
          onClick: canViewSelections ? () => router.push(`/photographer/projects/${id}/results`) : undefined,
        },
        {
          label: "보정본 업로드",
          desc: f3 === "done" ? "완료" : f3 === "active" ? "진행 중" : "이전 단계 완료 후 가능",
          icon: <PenLine size={20} color="#FF4D00" />,
          state: "done",
          onClick: canEditVersions ? () => router.push(`/photographer/projects/${id}/upload-versions`) : undefined,
        },
        {
          label: "보정본 검토",
          desc: "완료",
          icon: <Eye size={20} color="#FF4D00" />,
          state: "done",
        },
        {
          label: "재보정 업로드",
          desc: f5r === "done" ? "완료" : f5r === "active" ? "진행 중" : "이전 단계 완료 후 가능",
          icon: <PenLine size={20} color="#FF4D00" />,
          state: f5r,
          onClick: f5r !== "locked" ? () => router.push(`/photographer/projects/${id}/upload-versions/v2`) : undefined,
        },
        {
          label: "재보정 검토",
          desc: f6r === "done" ? "완료" : f6r === "active" ? "고객 검토 중" : "이전 단계 완료 후 가능",
          icon: <Eye size={20} color="#FF4D00" />,
          state: f6r,
        },
        {
          label: "최종 전달 완료",
          desc: f7r === "done" ? "완료" : "최종 목표",
          icon: <Flag size={20} color="#FF4D00" />,
          state: f7r,
        },
      ]
    : [
        {
          label: "원본 업로드",
          desc: f1 === "done" ? "완료" : "진행 중",
          icon: <Upload size={20} color="#FF4D00" />,
          state: f1,
          onClick: () => router.push(`/photographer/projects/${id}/upload`),
        },
        {
          label: "셀렉 결과 확인",
          desc: f2 === "done" ? "완료" : f2 === "active" ? "고객 셀렉 중" : "이전 단계 완료 후 가능",
          icon: <ListChecks size={20} color="#FF4D00" />,
          state: f2,
          onClick: canViewSelections ? () => router.push(`/photographer/projects/${id}/results`) : undefined,
        },
        {
          label: "보정본 업로드",
          desc: f3 === "done" ? "완료" : f3 === "active" ? "진행 중" : "이전 단계 완료 후 가능",
          icon: <PenLine size={20} color="#FF4D00" />,
          state: f3,
          onClick: canEditVersions ? () => {
            if (project.status === "confirmed") setShowEditGuideModal(true);
            else router.push(editVersionsPath);
          } : undefined,
        },
        {
          label: "고객 최종 검토",
          desc: f4 === "done" ? "완료" : f4 === "active" ? "고객 검토 중" : "이전 단계 완료 후 가능",
          icon: <Eye size={20} color="#FF4D00" />,
          state: f4,
          onClick: canReview ? () => router.push(editVersionsPath) : undefined,
        },
        {
          label: "최종 전달 완료",
          desc: f5 === "done" ? "완료" : "최종 목표",
          icon: <Flag size={20} color="#FF4D00" />,
          state: f5,
        },
      ];

  return (
    <div className={`${styles.pageRoot} ${jetbrains.variable}`}>
      <header className={styles.sysHeader}>
        <button type="button" className={`${styles.navReturn} ${styles.mono}`} onClick={() => router.push("/photographer/projects")}>
          <ChevronLeft size={12} strokeWidth={2} />
          뒤로가기
        </button>
        <div className={styles.sysStatus}>
          <span className={styles.statusDot} aria-hidden />
          SYS.PG_SESSION_ACTIVE
        </div>
      </header>

      <main className={styles.mainWorkspace}>
        <div className={styles.workspaceLeft}>
          <div className={styles.projectHeader}>
            <div className={`${styles.projectBreadcrumb} ${styles.mono}`}>
              <span className={styles.textMuted}>SYS / WORKSPACE /</span>
              <span className={styles.textMainBridge}>{prjBreadcrumb}</span>
            </div>
            <div className={styles.projectTitleGroup}>
              <div>
                <h1 className={styles.projectTitle}>{project.name}</h1>
                <div style={{ marginTop: 8 }}>
                  <StatusPill status={project.status} photoCount={M} requiredCount={N} />
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.sysPanel} ${styles.cornerBrackets}`}>
            <div className={styles.panelHeader}>
              <span>01. METADATA :: SPECS</span>
              <button type="button" className={styles.editBtn} onClick={openEdit}>
                [ EDIT ]
              </button>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.metaBlock}>
                <div className={styles.metaFieldRow}>
                  <span className={styles.metaFieldLabelK}>
                    프로젝트명 <span className={styles.metaFieldReq}>필수</span>
                  </span>
                </div>
                <div className={styles.dataVal} style={{ fontSize: 18 }}>
                  {project.name}
                </div>
              </div>

              <div className={styles.metaBlock}>
                <div className={styles.metaFieldRow}>
                  <span className={styles.metaFieldLabelK}>촬영 유형</span>
                </div>
                <div className={styles.metaTypeRow}>
                  {SHOOT_TYPES.map(({ value, label, icon: Icon }) => (
                    <span
                      key={value}
                      className={`${styles.metaTypeBtn} ${project.shootType === value ? styles.metaTypeBtnActive : ""}`}
                      aria-current={project.shootType === value ? "true" : undefined}
                    >
                      <Icon size={13} strokeWidth={2} />
                      {label}
                    </span>
                  ))}
                  {project.shootType && !SHOOT_TYPES.some((t) => t.value === project.shootType) ? (
                    <span className={`${styles.metaTypeBtn} ${styles.metaTypeBtnActive}`}>{project.shootType}</span>
                  ) : null}
                  <span className={styles.metaTypeOptional}>선택사항</span>
                </div>
              </div>

              <div className={styles.metaGrid2}>
                <div>
                  <div className={styles.metaFieldRow}>
                    <span className={styles.metaFieldLabelK}>
                      촬영 일자 <span className={styles.metaFieldReq}>필수</span>
                    </span>
                  </div>
                  <div className={styles.metaValueMono}>{shootDisplay}</div>
                </div>
                <div>
                  <div className={styles.metaFieldRow}>
                    <span className={styles.metaFieldLabelK}>
                      고객 이름 <span className={styles.metaFieldReq}>필수</span>
                    </span>
                  </div>
                  <div className={styles.dataVal}>{project.customerName || "—"}</div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className={styles.metaFieldRow}>
                    <span className={styles.metaFieldLabelK}>연락처</span>
                  </div>
                  <div className={styles.metaValueMono}>{project.customerPhone?.trim() || "—"}</div>
                  <p className={styles.metaFieldHint}>알림 기능 연동 시 사용됩니다 · 선택사항</p>
                </div>
                <div>
                  <div className={styles.metaFieldRow}>
                    <span className={styles.metaFieldLabelK}>
                      셀렉 갯수 (N) <span className={styles.metaFieldReq}>필수</span>
                    </span>
                  </div>
                  <div>
                    <span className={`${styles.dataValLarge} ${styles.dataValOrange} ${styles.mono}`}>{N}</span>
                    <span className={styles.metaUnitSuffix}>장</span>
                  </div>
                  <p className={styles.metaFieldHint}>고객이 선택할 사진 수</p>
                </div>
              </div>

              <div
                className={styles.metaBlock}
                style={{ borderTop: "1px solid #1a1a1a", paddingTop: 28, marginBottom: 0, marginTop: 8 }}
              >
                <div className={styles.metaGrid2}>
                  <div>
                    <div className={styles.metaFieldRow}>
                      <span className={styles.metaFieldLabelK}>
                        셀렉 기한 <span className={styles.metaFieldReq}>필수</span>
                      </span>
                    </div>
                    <div className={styles.metaValueMono}>{deadlineDisplay}</div>
                  </div>
                  <div>
                    <div className={styles.metaFieldRow}>
                      <span className={styles.metaFieldLabelK}>업로드된 사진 수</span>
                    </div>
                    <div>
                      <span className={`${styles.dataValLarge} ${styles.mono}`}>{M}</span>
                      <span className={styles.metaUnitSuffix}>장</span>
                    </div>
                    <p className={styles.metaFieldHint}>현재 DATABANK에 올라간 원본 장수입니다.</p>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className={styles.metaFieldRow}>
                      <span className={styles.metaFieldLabelK}>재보정 여부</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 10px",
                          border: `1px solid ${project.allowRevision ? "rgba(255,77,0,0.4)" : "#333"}`,
                          background: project.allowRevision ? "rgba(255,77,0,0.08)" : "transparent",
                          fontFamily: "var(--font-jetbrains-mono, monospace)",
                          fontSize: 11,
                          fontWeight: 600,
                          color: project.allowRevision ? "#FF4D00" : "#555",
                          letterSpacing: "0.04em",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: project.allowRevision ? "#FF4D00" : "#444",
                            flexShrink: 0,
                          }}
                        />
                        {project.allowRevision ? "재보정 허용" : "재보정 없음"}
                      </span>
                      <span style={{ fontFamily: "var(--font-jetbrains-mono, monospace)", fontSize: 10, color: "#444" }}>
                        {project.allowRevision ? "보정본 검토 후 재보정 요청 가능" : "보정본 검토 후 바로 납품"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.sysPanel} ${styles.cornerBrackets}`}>
            <div className={styles.panelHeader}>
              <span>02. ACCESS :: CLIENT PORTAL</span>
              <span className={`${styles.textGreen} ${styles.uppercase} ${styles.textXs}`}>
                {isInviteActive ? "• LIVE_LINK" : "• PENDING_UPLOAD"}
              </span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.portalAccessRow}>
                <div className={`${styles.sysInputGroup} ${styles.sysInputGroupWide}`}>
                  <div className={styles.metaFieldRow} style={{ marginBottom: 8 }}>
                    <span className={styles.metaFieldLabelK}>초대 링크</span>
                  </div>
                  <div className={styles.sysInputWrapper}>
                    <input
                      type="text"
                      className={styles.sysInput}
                      readOnly
                      value={isInviteActive ? inviteUrl : "업로드 완료 후 활성화"}
                      disabled={!isInviteActive}
                    />
                    <button
                      type="button"
                      className={`${styles.btnIcon} ${copied ? styles.copyOk : ""}`}
                      title="Copy URL"
                      disabled={!isInviteActive}
                      onClick={handleCopyUrl}
                      aria-label="URL 복사"
                    >
                      {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
                    </button>
                  </div>
                </div>
                <div className={styles.sysInputGroup}>
                  <div className={styles.metaFieldRow} style={{ marginBottom: 8 }}>
                    <span className={styles.metaFieldLabelK}>고객 비밀번호</span>
                  </div>
                  <div className={styles.sysInputWrapper}>
                    <input
                      type={pinReveal ? "text" : "password"}
                      className={styles.sysInput}
                      readOnly
                      value={project.accessPin ?? ""}
                      placeholder={project.accessPin ? undefined : "미설정"}
                      disabled={!project.accessPin}
                    />
                    <button
                      type="button"
                      className={styles.btnIcon}
                      title={pinReveal ? "Hide PIN" : "Reveal PIN"}
                      disabled={!project.accessPin}
                      onClick={() => setPinReveal((v) => !v)}
                      aria-label={pinReveal ? "PIN 숨기기" : "PIN 표시"}
                    >
                      {pinReveal ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.secondaryLink}
                onClick={handleCopyInviteBundle}
                disabled={!isInviteActive}
              >
                링크+비밀번호 클립보드 복사
              </button>
              <div className={styles.pinManageRow}>
                <button
                  type="button"
                  className={styles.pinManageBtn}
                  onClick={() => {
                    setPinInput("");
                    setPinError("");
                    setShowPinModal(true);
                  }}
                >
                  {project.accessPin ? "CHANGE_PIN" : "SET_PIN"}
                </button>
              </div>
            </div>
          </div>

          <div className={`${styles.serverNodeLine} ${styles.mono}`}>SERVER_NODE: KR-ST-04 // MEM_USAGE: 4.2GB</div>
        </div>

        <div className={styles.workspaceRight}>
          <div className={styles.actionFlowContainer}>
            <div className={styles.flowSectionTitle}>03. PIPELINE :: ACTION_FLOW</div>
            <ProjectActionFlow steps={actionFlowSteps} />
          </div>

          <div className={styles.logSection}>
            <div className={styles.logSectionTitle}>SYS.LOG :: RECENT</div>
            <div className={styles.logList}>
              {logs.length === 0 ? (
                <div className={`${styles.textMuted} ${styles.textSm}`}>NO_RECENT_EVENTS</div>
              ) : (
                logs.map((log) => {
                  const orange = log.action === "selecting";
                  const green = log.action === "uploaded" || log.action === "confirmed";
                  const itemClass = [styles.logItem, orange ? styles.logOrange : "", green ? styles.logGreen : ""]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div key={log.id} className={itemClass}>
                      <div className={styles.logDot} />
                      <div className={styles.logContent}>
                        <span className={styles.logTime}>{formatLogTime(log.createdAt)}</span>
                        <span
                          className={
                            green ? styles.logMessage : `${styles.logMessage} ${orange ? styles.textOrange : styles.textMuted}`
                          }
                        >
                          {logActionLabel(log.action)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <section className={styles.dangerZone} aria-labelledby="nexus-danger-heading">
            <h2 id="nexus-danger-heading" className={styles.dangerZoneTitle}>
              ⚠ SYS.SEC :: DANGER_ZONE
            </h2>
            <button
              type="button"
              className={styles.dangerZoneBtn}
              onClick={() => {
                setDeleteError("");
                setShowDeleteModal(true);
              }}
            >
              <Trash2 size={12} strokeWidth={2} aria-hidden />
              TERMINATE_PROJECT
            </button>
          </section>
        </div>
      </main>

      <footer className={`${styles.sysFooter} ${styles.mono} ${styles.trackingWide}`}>
        <span>V.1.2.0-CORE // SYNC_STABLE</span>
        <span>SERVER_ID: KR-ST-04</span>
      </footer>

      {toast && <div className={styles.toast}>{toast}</div>}

      {editMode && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditMode(false);
              setSaveError("");
            }
          }}
        >
          <div className={styles.modalBox} style={{ maxWidth: 520 }}>
            <div className={styles.modalHead}>
              <span className={`${styles.fieldLabel}`} style={{ color: "var(--nx-accent)" }}>
                SYS.META :: EDIT_PROJECT
              </span>
              <button type="button" className={styles.iconBtn} onClick={() => { setEditMode(false); setSaveError(""); }} aria-label="닫기">
                <X size={14} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.metaGrid2}>
                {(
                  [
                    {
                      k: "프로젝트명",
                      code: "PROJ_NAME",
                      req: true,
                      value: editName,
                      onChange: setEditName,
                      type: "text" as const,
                    },
                    {
                      k: "고객 이름",
                      code: "CLIENT_NAME",
                      req: true,
                      value: editCustomerName,
                      onChange: setEditCustomerName,
                      type: "text" as const,
                    },
                    {
                      k: "촬영 일자",
                      code: "SHOOT_DATE",
                      req: true,
                      value: editShootDate,
                      onChange: setEditShootDate,
                      type: "date" as const,
                    },
                    {
                      k: "셀렉 기한",
                      code: "DEADLINE",
                      req: true,
                      value: editDeadline,
                      onChange: setEditDeadline,
                      type: "date" as const,
                    },
                  ] as const
                ).map((f) => (
                  <label key={f.code} style={{ display: "flex", flexDirection: "column", marginBottom: 4 }}>
                    <div className={styles.metaFieldRow} style={{ marginBottom: 6 }}>
                      <span className={styles.metaFieldLabelK}>
                        {f.k}
                        {f.req ? <span className={styles.metaFieldReq}>필수</span> : null}
                      </span>
                    </div>
                    <input type={f.type} value={f.value} onChange={(e) => f.onChange(e.target.value)} className={styles.inputLine} />
                  </label>
                ))}
              </div>
              <label style={{ display: "flex", flexDirection: "column", marginBottom: 20, marginTop: 16 }}>
                <div className={styles.metaFieldRow} style={{ marginBottom: 6 }}>
                  <span className={styles.metaFieldLabelK}>
                    셀렉 갯수 (N) <span className={styles.metaFieldReq}>필수</span>
                  </span>
                </div>
                {!["preparing", "selecting"].includes(project.status) && (
                  <span className={`${styles.mono} ${styles.textXs}`} style={{ color: C.orange, marginBottom: 6 }}>
                    LOCKED
                  </span>
                )}
                <input
                  type="number"
                  min={1}
                  value={editRequiredCount}
                  disabled={!["preparing", "selecting"].includes(project.status)}
                  onChange={(e) => setEditRequiredCount(Number(e.target.value))}
                  className={styles.inputLine}
                />
                <p className={styles.metaFieldHint}>고객이 선택할 사진 수</p>
              </label>
              <label style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
                <div className={styles.metaFieldRow} style={{ marginBottom: 6 }}>
                  <span className={styles.metaFieldLabelK}>재보정 허용</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditAllowRevision((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 14px", cursor: "pointer", alignSelf: "flex-start",
                    background: editAllowRevision ? "rgba(255,77,0,0.08)" : "transparent",
                    border: editAllowRevision ? "1px solid rgba(255,77,0,0.4)" : "1px solid #333",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{
                    width: 28, height: 16, borderRadius: 8,
                    background: editAllowRevision ? "#FF4D00" : "#222",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}>
                    <div style={{
                      position: "absolute", top: 2, left: editAllowRevision ? 14 : 2,
                      width: 12, height: 12, borderRadius: "50%",
                      background: "#fff", transition: "left 0.2s",
                    }} />
                  </div>
                  <span style={{
                    fontFamily: "'Space Mono', 'JetBrains Mono', sans-serif", fontSize: 11,
                    color: editAllowRevision ? "#FF4D00" : "#555",
                  }}>
                    {editAllowRevision ? "ON — 최대 2회 재보정 허용" : "OFF — 재보정 없음"}
                  </span>
                </button>
              </label>
              {saveError && <div className={styles.errBox}>[ERR] {saveError}</div>}
              <div className={styles.btnRow}>
                <button type="button" className={styles.btnSecondary} onClick={() => { setEditMode(false); setSaveError(""); }}>
                  CANCEL
                </button>
                <button type="button" className={styles.btnPrimary} onClick={handleSaveEdit} disabled={saving}>
                  {saving ? "SAVING..." : "COMMIT_CHANGES"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPinModal && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPinModal(false);
              setPinInput("");
              setPinError("");
            }
          }}
        >
          <div className={styles.modalBox} style={{ maxWidth: 380 }}>
            <div className={styles.modalHead}>
              <span className={styles.fieldLabel} style={{ color: "var(--nx-accent)" }}>
                SYS.AUTH :: {project.accessPin ? "MODIFY_PIN" : "SET_PIN"}
              </span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }}
                aria-label="닫기"
              >
                <X size={14} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.metaFieldRow} style={{ marginBottom: 10 }}>
                <span className={styles.metaFieldLabelK}>고객 비밀번호</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  className={styles.inputLine}
                  style={{ flex: 1, padding: "10px 14px", border: "1px solid #333", letterSpacing: 12, fontSize: 22, fontWeight: 700 }}
                />
                <button type="button" className={styles.btnSecondary} style={{ flex: "none", padding: "10px 12px" }} onClick={() => setPinInput(Math.floor(1000 + Math.random() * 9000).toString())}>
                  <RefreshCw size={11} style={{ display: "inline", marginRight: 4 }} />
                  RANDOM
                </button>
              </div>
              <p className={styles.metaFieldHint} style={{ marginBottom: 16 }}>
                설정 시 고객이 링크 접속 시 비밀번호를 입력해야 합니다 · 선택사항
                <br />
                4자리 숫자를 입력하거나 랜덤 생성 버튼을 누르세요
              </p>
              {pinError && <div className={styles.errBox}>[ERR] {pinError}</div>}
              <div className={styles.btnRow}>
                {project.accessPin && (
                  <button type="button" className={styles.btnDanger} onClick={() => handleSavePin(null)} disabled={pinSaving}>
                    DEL_PIN
                  </button>
                )}
                <button type="button" className={styles.btnSecondary} onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(""); }} disabled={pinSaving}>
                  CANCEL
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => handleSavePin(pinInput || null)}
                  disabled={pinSaving || (!!pinInput && pinInput.length !== 4)}
                >
                  {pinSaving ? "SAVING..." : "COMMIT"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditGuideModal && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowEditGuideModal(false)}>
          <div className={styles.modalBox} style={{ maxWidth: 420 }}>
            <div className={styles.modalHead}>
              <span className={styles.fieldLabel} style={{ color: "#2ed573" }}>
                SYS.INFO :: ACTION_REQUIRED
              </span>
            </div>
            <div className={styles.modalBody}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <CheckCircle2 size={18} color="#2ed573" />
                <span style={{ fontWeight: 600, fontSize: 15 }}>보정을 시작하지 않았습니다</span>
              </div>
              <p className={styles.textMd} style={{ color: "var(--nx-text-muted)", lineHeight: 1.7, marginBottom: 24 }}>
                보정본을 업로드하려면 먼저 셀렉 결과를 확인하고 <strong style={{ color: "var(--nx-text-main)" }}>[보정 시작하기]</strong>를 눌러주세요.
              </p>
              <div className={styles.btnRow}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowEditGuideModal(false)}>
                  CLOSE
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => { setShowEditGuideModal(false); router.push(`/photographer/projects/${id}/results`); }}
                >
                  VIEW_SELECT_RESULTS →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className={styles.modalOverlay} onClick={(e) => !deleting && e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className={styles.modalBox} style={{ maxWidth: 400, borderColor: "rgba(255,51,51,0.25)" }}>
            <div className={styles.modalHead}>
              <span style={{ color: "#ff3333", fontFamily: "var(--nx-font-mono)" }}>[!] SYS.SEC :: TERMINATE_CONFIRM</span>
            </div>
            <div className={styles.modalBody}>
              <p style={{ marginBottom: 8 }}>프로젝트를 영구적으로 삭제합니다.</p>
              <p className={`${styles.textXs} ${styles.textMuted}`} style={{ lineHeight: 1.8, marginBottom: 20 }}>
                모든 사진, 셀렉 데이터, 보정본이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
              {deleteError && <div className={styles.errBox}>[ERR] {deleteError}</div>}
              <div className={styles.btnRow}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                  ABORT
                </button>
                <button type="button" className={styles.btnDanger} style={{ flex: 1 }} onClick={handleDeleteProject} disabled={deleting}>
                  {deleting ? "TERMINATING..." : "CONFIRM_DELETE"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
