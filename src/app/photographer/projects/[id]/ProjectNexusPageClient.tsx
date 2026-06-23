"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import {
  AlertTriangle,
  Check,
  ChevronRight,
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
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";
import { StatusPill } from "@/components/ui/StatusPill";
import { FieldInfoTip } from "@/components/ui/FieldInfoTip";
import { PhotographerModal } from "@/components/ui/PhotographerModal";

// ── helpers ────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function isValidPhone(v: string): boolean {
  return v === "" || /^010-\d{4}-\d{4}$/.test(v);
}

function getInitial(name: string): string {
  return name.trim().charAt(0);
}

function formatLogTime(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, "HH:mm");
    if (isYesterday(d)) return `어제 ${format(d, "HH:mm")}`;
    return format(d, "MM/dd HH:mm");
  } catch {
    return "—";
  }
}

function logActionLabel(action: string): string {
  switch (action) {
    case "created":      return "프로젝트가 생성되었습니다";
    case "uploaded":     return "원본 업로드가 기록되었습니다";
    case "selecting":    return "셀렉 단계로 전환되었습니다";
    case "confirmed":    return "고객 셀렉이 확정되었습니다";
    case "editing":      return "보정 단계가 시작되었습니다";
    default:             return `이벤트: ${action}`;
  }
}

type LogRow = { id: string; action: string; createdAt: string };
type FlowVisual = "done" | "active" | "locked";
type FlowStepItem = {
  label: string;
  desc: string;
  icon?: React.ReactNode;
  state: FlowVisual;
  badge?: string | null;
  onClick?: () => void;
};

const MONO_FONT = "var(--font-mono, monospace)";

// ── shared sub-components ──────────────────────────────────────────────────

function FieldLabel({
  label,
  required,
  optional,
  info,
  className = "",
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  info?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 mb-1.5 ${className}`}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {info && <FieldInfoTip text={info} />}
      {required && <span className="text-[10px] text-accent font-medium">필수</span>}
      {optional && <span className="text-[10px] text-disabled-foreground">선택</span>}
    </div>
  );
}

function MetaItem({
  label,
  required,
  optional,
  info,
  children,
  fullSpan,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  info?: string;
  children: React.ReactNode;
  fullSpan?: boolean;
}) {
  return (
    <div className={fullSpan ? "col-span-2" : undefined}>
      <FieldLabel label={label} required={required} optional={optional} info={info} />
      <div className="text-base text-foreground">{children}</div>
    </div>
  );
}

const MODAL_INPUT_CLS =
  "w-full bg-background border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-placeholder-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all disabled:bg-background/50 disabled:text-disabled-foreground disabled:cursor-not-allowed";

function ModalField({
  label,
  required,
  optional,
  info,
  children,
  fullSpan,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  info?: string;
  children: React.ReactNode;
  fullSpan?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${fullSpan ? "sm:col-span-2" : ""}`}>
      <FieldLabel label={label} required={required} optional={optional} info={info} className="mb-0" />
      {children}
    </div>
  );
}

function ErrBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
      {children}
    </div>
  );
}

// ── main page component ───────────────────────────────────────────────────

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
  const [editMaxRevisionCount, setEditMaxRevisionCount] = useState<0 | 1 | 2>(2);
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editShootType, setEditShootType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
        const data = (await res.json()) as { id: string; action: string; createdAt: string }[];
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
    if (!isValidPhone(editCustomerPhone)) {
      setSaveError("연락처는 010-XXXX-XXXX 형식으로 입력해주세요.");
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
          max_revision_count: editMaxRevisionCount,
          customer_phone: editCustomerPhone || null,
          shoot_type: editShootType,
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
        maxRevisionCount: editMaxRevisionCount,
        customerPhone: editCustomerPhone || null,
        shootType: editShootType,
      });
      setEditMode(false);
      setToast("프로젝트 정보가 저장되었습니다.");
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
    setToast("초대 링크가 복사되었습니다.");
  };

  const handleCopyInviteBundle = () => {
    if (!project?.accessToken) return;
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
      setToast(newPin ? "고객 비밀번호가 저장되었습니다." : "고객 비밀번호가 제거되었습니다.");
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
    setEditMaxRevisionCount(project.maxRevisionCount);
    setEditCustomerPhone(project.customerPhone ?? "");
    setEditShootType(project.shootType ?? null);
    setSaveError("");
    setEditMode(true);
  };

  // ── empty / loading guards ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}>
        <PhotographerPageHeader
          crumbs={[{ label: "프로젝트", href: "/photographer/projects" }, { label: "로딩 중" }]}
          title="프로젝트 불러오는 중"
        />
        <div className="flex items-center justify-center py-32">
          <span className="text-disabled-foreground text-sm" style={{ fontFamily: MONO_FONT }}>
            SYS.LOADING…
          </span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}>
        <PhotographerPageHeader
          crumbs={[{ label: "프로젝트", href: "/photographer/projects" }, { label: "찾을 수 없음" }]}
          title="프로젝트를 찾을 수 없습니다"
        />
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <p className="text-sm text-subtle-foreground">존재하지 않거나 접근 권한이 없습니다.</p>
          <button
            type="button"
            onClick={() => router.push("/photographer/projects")}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-surface-raised hover:bg-border-subtle border border-border-subtle text-muted-foreground"
          >
            프로젝트 목록으로
          </button>
        </div>
      </div>
    );
  }

  // ── computed values ───────────────────────────────────────────────────

  const N = project.requiredCount;
  const M = project.photoCount;
  const isInviteActive = project.status !== "preparing";
  const canViewSelections = project.status !== "preparing";
  const canEditVersions = ["confirmed", "editing", "editing_v2", "reviewing_v1", "reviewing_v2", "delivered"].includes(
    project.status,
  );

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

  const reviewDeadlineDisplay = (() => {
    if (!project.reviewDeadline) return null;
    try {
      return format(parseISO(project.reviewDeadline), "yyyy-MM-dd");
    } catch {
      return project.reviewDeadline;
    }
  })();

  const uploadDone = project.status !== "preparing";
  const selectingActive = project.status === "selecting";
  const preparing = project.status === "preparing";
  const selecting = project.status === "selecting";
  const delivered = project.status === "delivered";

  const f1: FlowVisual = !uploadDone ? "active" : "done";
  const f2: FlowVisual = !canViewSelections ? "locked" : selectingActive ? "active" : "done";

  const inV2Phase = ["editing_v2", "reviewing_v2", "delivered"].includes(project.status);
  const useFiveSteps = project.maxRevisionCount > 0 && inV2Phase;

  const f3combined: FlowVisual =
    preparing || selecting ? "locked" : delivered ? "done" : "active";

  const f5r: FlowVisual =
    project.status === "delivered"
      ? "done"
      : ["editing_v2", "reviewing_v2"].includes(project.status)
      ? "active"
      : "locked";

  const fDeliver: FlowVisual = delivered ? "done" : "locked";

  const ICON_COLOR = "currentColor";
  const actionFlowSteps: FlowStepItem[] = useFiveSteps
    ? [
        {
          label: "원본 업로드",
          desc: "완료",
          icon: <Upload size={18} color={ICON_COLOR} />,
          state: f1,
          onClick: () => router.push(`/photographer/projects/${id}/upload`),
        },
        {
          label: "셀렉 결과 확인",
          desc: f2 === "active" ? "고객 셀렉 중" : "완료",
          icon: <ListChecks size={18} color={ICON_COLOR} />,
          state: f2,
          badge: f2 === "active" ? "LIVE" : null,
          onClick: canViewSelections
            ? () => router.push(`/photographer/projects/${id}/workflow?stage=original`)
            : undefined,
        },
        {
          label: "보정본 v1",
          desc: "고객 검토 완료",
          icon: <PenLine size={18} color={ICON_COLOR} />,
          state: "done",
          onClick: () => router.push(`/photographer/projects/${id}/workflow`),
        },
        {
          label: "재보정 v2",
          desc:
            project.status === "editing_v2"
              ? "업로드 진행 중"
              : project.status === "reviewing_v2"
              ? "고객 검토 중"
              : "완료",
          badge: project.status === "editing_v2" ? "LIVE" : null,
          icon: <PenLine size={18} color={ICON_COLOR} />,
          state: f5r,
          onClick: f5r !== "locked" ? () => router.push(`/photographer/projects/${id}/workflow`) : undefined,
        },
        {
          label: "납품 완료",
          desc: delivered ? "완료" : "최종 목표",
          icon: <Flag size={18} color={ICON_COLOR} />,
          state: fDeliver,
        },
      ]
    : [
        {
          label: "원본 업로드",
          desc: f1 === "done" ? "완료" : "진행 중",
          icon: <Upload size={18} color={ICON_COLOR} />,
          state: f1,
          onClick: () => router.push(`/photographer/projects/${id}/upload`),
        },
        {
          label: "셀렉 결과 확인",
          desc: f2 === "done" ? "완료" : f2 === "active" ? "고객 셀렉 중" : "이전 단계 완료 후 가능",
          icon: <ListChecks size={18} color={ICON_COLOR} />,
          state: f2,
          badge: f2 === "active" ? "LIVE" : null,
          onClick: canViewSelections
            ? () => router.push(`/photographer/projects/${id}/workflow?stage=original`)
            : undefined,
        },
        {
          label: "보정본",
          desc: delivered
            ? "완료"
            : project.status === "reviewing_v1"
            ? "고객 검토 중"
            : f3combined === "active"
            ? "업로드 진행 중"
            : "이전 단계 완료 후 가능",
          badge: project.status === "reviewing_v1" ? "LIVE" : null,
          icon: <PenLine size={18} color={ICON_COLOR} />,
          state: f3combined,
          onClick: canEditVersions ? () => router.push(`/photographer/projects/${id}/workflow`) : undefined,
        },
        {
          label: "납품 완료",
          desc: delivered ? "완료" : "최종 목표",
          icon: <Flag size={18} color={ICON_COLOR} />,
          state: fDeliver,
        },
      ];

  const cardCls = "bg-surface border border-border-subtle rounded-2xl";

  // ── render ────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}
    >
      <PhotographerPageHeader
        crumbs={[
          { label: "프로젝트", href: "/photographer/projects" },
          { label: project.name },
        ]}
        title={project.name}
        stats={[
          { label: "업로드", value: `${M}장` },
          { label: "목표", value: `${N}장`, accent: true },
        ]}
      />

      <main className="p-4 md:p-8 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
        {/* ── Left column ────────────────────────────────── */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Project info card */}
          <section className={`${cardCls} p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className="text-[11px] text-subtle-foreground bg-background px-1.5 py-0.5 rounded border border-border-subtle"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {project.displayId ?? id.slice(0, 12).toUpperCase()}
                  </span>
                  <StatusPill status={project.status} photoCount={M} requiredCount={N} />
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                  {project.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={openEdit}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-raised hover:bg-border-strong text-muted-foreground transition-colors"
              >
                <PenLine size={12} /> 정보 수정
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div className="col-span-2">
                <FieldLabel
                  label="촬영 유형"
                  optional
                  info="목록 분류용 (웨딩, 가족 등)"
                />
                {project.shootType ? (() => {
                  const found = SHOOT_TYPES.find((t) => t.value === project.shootType);
                  const Icon = found?.icon;
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-accent/8 border border-accent/40 text-accent">
                      {Icon && <Icon size={13} />}
                      {found?.label ?? project.shootType}
                    </span>
                  );
                })() : (
                  <span className="text-sm text-disabled-foreground">—</span>
                )}
              </div>

              <MetaItem
                label="촬영 일자"
                required
                info="실제 촬영일"
              >
                <span style={{ fontFamily: MONO_FONT }}>{shootDisplay}</span>
              </MetaItem>

              <MetaItem
                label="셀렉 기한"
                required
                info="고객 셀렉 마감일"
              >
                <span style={{ fontFamily: MONO_FONT }}>{deadlineDisplay}</span>
              </MetaItem>

              {reviewDeadlineDisplay && (
                <MetaItem
                  label="검토 기한"
                  info="보정본 검토 마감일"
                >
                  <span style={{ fontFamily: MONO_FONT }}>{reviewDeadlineDisplay}</span>
                </MetaItem>
              )}

              <MetaItem
                label="고객 이름"
                required
                info="고객 화면·알림에 표시"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-surface-raised flex items-center justify-center text-[10px] font-bold text-foreground">
                    {getInitial(project.customerName || "?")}
                  </span>
                  <span>{project.customerName || "—"}</span>
                </span>
              </MetaItem>

              <MetaItem
                label="연락처"
                optional
                info="알림 발송용 (선택)"
              >
                <span style={{ fontFamily: MONO_FONT }}>
                  {project.customerPhone?.trim() || "—"}
                </span>
              </MetaItem>

              <MetaItem
                label="셀렉 갯수 (N)"
                required
                info="고객이 고를 최종 장수"
              >
                <span>
                  <span
                    className="text-2xl font-bold text-accent leading-none"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {N}
                  </span>
                  <span className="text-sm text-subtle-foreground ml-1.5">장</span>
                </span>
              </MetaItem>

              <MetaItem
                label="업로드 사진 수"
                info="업로드된 원본 장수"
              >
                <span>
                  <span
                    className="text-2xl font-bold text-foreground leading-none"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {M}
                  </span>
                  <span className="text-sm text-subtle-foreground ml-1.5">장</span>
                </span>
              </MetaItem>

              <div className="col-span-2 pt-4 border-t border-border-subtle">
                <FieldLabel
                  label="재보정 허용 횟수"
                  info="검토 후 재보정 허용 (0=없음)"
                />
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${
                    project.maxRevisionCount > 0
                      ? "bg-accent/10 border-accent/40 text-accent"
                      : "bg-border-subtle border-surface-raised text-subtle-foreground"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: project.maxRevisionCount > 0 ? "var(--accent)" : "var(--border-strong)" }}
                  />
                  {project.maxRevisionCount === 0 ? "재보정 없음" : `최대 ${project.maxRevisionCount}회`}
                </span>
              </div>
            </div>
          </section>

          {/* Customer link card */}
          <section className={`${cardCls} p-6`}>
            <div className="flex items-center justify-between mb-5 gap-2">
              <h3 className="text-base font-bold text-foreground">고객 링크</h3>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border ${
                  isInviteActive
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                    : "text-subtle-foreground bg-border-subtle border-surface-raised"
                }`}
              >
                {isInviteActive ? "활성" : "준비 중"}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
              <div className="flex flex-col gap-1.5 min-w-0">
                <FieldLabel
                  label="초대 링크"
                  info="고객 셀렉·검토 링크"
                  className="mb-0"
                />
                <div className="flex items-stretch bg-background border border-border-subtle rounded-xl overflow-hidden focus-within:border-accent transition-colors">
                  <input
                    type="text"
                    readOnly
                    value={isInviteActive ? inviteUrl : "업로드 완료 후 활성화"}
                    disabled={!isInviteActive}
                    className="flex-1 min-w-0 bg-transparent text-muted-foreground text-sm px-4 py-3 outline-none disabled:text-disabled-foreground disabled:cursor-not-allowed"
                    style={{ fontFamily: MONO_FONT }}
                  />
                  <button
                    type="button"
                    disabled={!isInviteActive}
                    onClick={handleCopyUrl}
                    aria-label="URL 복사"
                    className={`shrink-0 w-12 flex items-center justify-center border-l border-border-subtle transition-colors ${
                      copied ? "text-emerald-400" : "text-subtle-foreground hover:text-foreground hover:bg-surface-raised"
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <FieldLabel
                  label="고객 비밀번호"
                  info="접속 PIN 4자리 (선택)"
                  className="mb-0"
                />
                <div className="flex items-stretch bg-background border border-border-subtle rounded-xl overflow-hidden focus-within:border-accent transition-colors">
                  <input
                    type={pinReveal ? "text" : "password"}
                    readOnly
                    value={project.accessPin ?? ""}
                    placeholder={project.accessPin ? undefined : "미설정"}
                    disabled={!project.accessPin}
                    className="flex-1 min-w-0 bg-transparent text-muted-foreground text-sm px-4 py-3 outline-none disabled:text-disabled-foreground disabled:cursor-not-allowed"
                    style={{ fontFamily: MONO_FONT, letterSpacing: pinReveal ? "0.2em" : undefined }}
                  />
                  <button
                    type="button"
                    disabled={!project.accessPin}
                    onClick={() => setPinReveal((v) => !v)}
                    aria-label={pinReveal ? "PIN 숨기기" : "PIN 표시"}
                    className="shrink-0 w-12 flex items-center justify-center border-l border-border-subtle text-subtle-foreground hover:text-foreground hover:bg-surface-raised transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {pinReveal ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <button
                type="button"
                onClick={handleCopyInviteBundle}
                disabled={!isInviteActive}
                className="text-xs text-subtle-foreground hover:text-accent underline underline-offset-2 transition-colors disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              >
                링크와 비밀번호 함께 복사
              </button>
              <span className="text-disabled-foreground">·</span>
              <button
                type="button"
                onClick={() => {
                  setPinInput("");
                  setPinError("");
                  setShowPinModal(true);
                }}
                className="text-xs text-subtle-foreground hover:text-accent transition-colors"
              >
                {project.accessPin ? "비밀번호 변경" : "비밀번호 설정"}
              </button>
            </div>
          </section>
        </div>

        {/* ── Right column ─────────────────────────────── */}
        <aside className="flex flex-col gap-6 min-w-0">
          {/* Action flow */}
          <section className={`${cardCls} p-5`}>
            <h3 className="text-base font-bold text-foreground mb-4">진행 단계</h3>
            <div className="flex flex-col gap-2">
              {actionFlowSteps.map((step, i) => {
                const isDone = step.state === "done";
                const isActive = step.state === "active";
                const isLocked = step.state === "locked";
                const clickable = !!step.onClick;

                const cardStateCls = isActive
                  ? "bg-accent/5 border-accent/40"
                  : isDone
                  ? "bg-background/50 border-border-subtle"
                  : "bg-transparent border border-dashed border-border-subtle opacity-60";

                const cursorCls = clickable
                  ? "hover:border-accent/50 cursor-pointer"
                  : isLocked
                  ? "cursor-not-allowed"
                  : "cursor-default";

                const numCls = isActive
                  ? "text-accent"
                  : isDone
                  ? "text-emerald-500"
                  : "text-disabled-foreground";

                const iconBoxCls = isActive
                  ? "bg-accent/15 border-accent/40 text-accent"
                  : isDone
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-surface-raised border-border-subtle text-subtle-foreground";

                const labelCls = isActive
                  ? "text-foreground"
                  : isDone
                  ? "text-muted-foreground"
                  : "text-subtle-foreground";

                const descCls = isActive
                  ? "text-accent"
                  : isDone
                  ? "text-disabled-foreground"
                  : "text-disabled-foreground";

                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!clickable}
                    onClick={step.onClick}
                    className={`group rounded-xl border p-3 flex items-center gap-3 text-left transition-colors ${cardStateCls} ${cursorCls}`}
                  >
                    <span
                      className={`text-[10px] font-bold shrink-0 w-5 ${numCls}`}
                      style={{ fontFamily: MONO_FONT }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${iconBoxCls}`}>
                      {isDone ? (
                        <Check size={16} strokeWidth={2.5} />
                      ) : isLocked ? (
                        <Lock size={14} />
                      ) : (
                        step.icon ?? null
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-bold truncate ${labelCls}`}>
                          {step.label}
                        </span>
                        {step.badge && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
                            {step.badge}
                          </span>
                        )}
                      </div>
                      <span className={`text-[11px] mt-0.5 block truncate ${descCls}`}>
                        {step.desc}
                      </span>
                    </div>
                    {clickable && (
                      <ChevronRight
                        size={16}
                        className="text-subtle-foreground shrink-0 group-hover:text-accent transition-colors"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recent activity */}
          <section className={`${cardCls} p-5 hidden md:block`}>
            <h3 className="text-base font-bold text-foreground mb-4">최근 활동</h3>
            {logs.length === 0 ? (
              <p className="text-xs text-disabled-foreground">최근 활동 내역이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {logs.map((log) => {
                  const orange = log.action === "selecting";
                  const green = log.action === "uploaded" || log.action === "confirmed";
                  const dotCls = orange
                    ? "border-accent"
                    : green
                    ? "border-emerald-500"
                    : "border-disabled-foreground";
                  const msgCls = orange
                    ? "text-accent"
                    : green
                    ? "text-emerald-400"
                    : "text-muted-foreground";
                  return (
                    <li key={log.id} className="flex gap-3 min-w-0">
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full bg-background border-2 ${dotCls} shrink-0`}
                      />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span
                          className="text-[10px] text-disabled-foreground"
                          style={{ fontFamily: MONO_FONT }}
                        >
                          {formatLogTime(log.createdAt)}
                        </span>
                        <span className={`text-sm ${msgCls}`}>{logActionLabel(log.action)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Danger zone */}
          <section className={`${cardCls} p-5`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-500 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} /> 위험 영역
            </h3>
            <p className="text-xs text-subtle-foreground mb-3 leading-relaxed">
              삭제 시 모든 사진과 셀렉·보정 데이터가 함께 사라지며 되돌릴 수 없습니다.
            </p>
            <button
              type="button"
              onClick={() => {
                setDeleteError("");
                setShowDeleteModal(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/30 hover:border-rose-500/50 text-rose-400 text-sm font-semibold transition-colors"
            >
              <Trash2 size={14} /> 프로젝트 삭제
            </button>
          </section>
        </aside>
      </main>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[210] bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-foreground shadow-lg pointer-events-none"
          style={{ fontFamily: "var(--font-inter, sans-serif)" }}
        >
          {toast}
        </div>
      )}

      {/* Edit modal */}
      <PhotographerModal
        open={editMode}
        onClose={() => {
          setEditMode(false);
          setSaveError("");
        }}
        title="프로젝트 정보 수정"
        footer={
          <div className="flex flex-col gap-3">
            {saveError && <ErrBox>{saveError}</ErrBox>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditMode(false);
                  setSaveError("");
                }}
                className="flex-1 py-3 rounded-xl bg-surface-raised hover:bg-border-subtle border border-border-subtle text-muted-foreground text-sm font-semibold transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-[#ff5e1a] text-black text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <FieldLabel
              label="촬영 유형"
              optional
              info="목록 분류용 (웨딩, 가족 등)"
            />
            <div className="flex gap-2 flex-wrap mt-2">
              {SHOOT_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setEditShootType(editShootType === value ? null : value)
                  }
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors"
                  style={{
                    background:
                      editShootType === value ? "rgba(var(--accent-rgb), 0.08)" : "transparent",
                    borderColor:
                      editShootType === value ? "rgba(var(--accent-rgb), 0.5)" : "var(--border-subtle)",
                    color: editShootType === value ? "var(--accent)" : "var(--subtle-foreground)",
                  }}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ModalField label="프로젝트명" required fullSpan>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={MODAL_INPUT_CLS}
                placeholder="예: 2026 홍길동님 스튜디오"
              />
            </ModalField>
            <ModalField label="고객 이름" required>
              <input
                type="text"
                value={editCustomerName}
                onChange={(e) => setEditCustomerName(e.target.value)}
                className={MODAL_INPUT_CLS}
                placeholder="고객님 성함"
              />
            </ModalField>
            <ModalField label="연락처" optional info="010-XXXX-XXXX · 알림용">
              <input
                type="text"
                inputMode="numeric"
                value={editCustomerPhone}
                onChange={(e) => setEditCustomerPhone(formatPhone(e.target.value))}
                className={MODAL_INPUT_CLS}
                placeholder="010-0000-0000"
              />
            </ModalField>
            <ModalField label="촬영 일자" required>
              <input
                type="date"
                value={editShootDate}
                onChange={(e) => setEditShootDate(e.target.value)}
                onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                className={MODAL_INPUT_CLS}
              />
            </ModalField>
            <ModalField label="셀렉 기한" required>
              <input
                type="date"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
                onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                className={MODAL_INPUT_CLS}
              />
            </ModalField>
          </div>

          <ModalField label="셀렉 갯수 (N)" required info="고객이 고를 최종 장수">
            {!["preparing", "selecting"].includes(project.status) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-500/90">
                <AlertTriangle size={12} className="shrink-0" />
                셀렉이 시작된 이후에는 갯수를 변경할 수 없습니다.
              </div>
            )}
            <input
              type="number"
              min={1}
              value={editRequiredCount}
              disabled={!["preparing", "selecting"].includes(project.status)}
              onChange={(e) => setEditRequiredCount(Number(e.target.value))}
              className={MODAL_INPUT_CLS}
            />
          </ModalField>

          <div>
            <FieldLabel
              label="재보정 허용 횟수"
              info="검토 후 재보정 허용 (0=없음)"
            />
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 0, label: "없음", desc: "바로 납품" },
                  { value: 1, label: "1회", desc: "재보정 1회" },
                  { value: 2, label: "2회", desc: "최대 2회" },
                ] as const
              ).map(({ value, label, desc }) => {
                const active = editMaxRevisionCount === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEditMaxRevisionCount(value)}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border transition-colors ${
                      active
                        ? "bg-accent/8 border-accent/40 text-accent"
                        : "bg-transparent border-border-subtle text-subtle-foreground hover:border-border-strong hover:text-muted-foreground"
                    }`}
                  >
                    <span className="text-sm font-bold">{label}</span>
                    <span className="text-[10px]">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </PhotographerModal>

      {/* PIN modal */}
      <PhotographerModal
        open={showPinModal}
        onClose={() => {
          if (pinSaving) return;
          setShowPinModal(false);
          setPinInput("");
          setPinError("");
        }}
        title="고객 접속 비밀번호"
        maxWidth={400}
        footer={
          <div className="flex flex-col gap-3">
            {pinError && <ErrBox>{pinError}</ErrBox>}
            <div className="flex gap-2">
              {project.accessPin && (
                <button
                  type="button"
                  onClick={() => handleSavePin(null)}
                  disabled={pinSaving}
                  className="px-4 py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/30 text-rose-400 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  제거
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (pinSaving) return;
                  setShowPinModal(false);
                  setPinInput("");
                  setPinError("");
                }}
                disabled={pinSaving}
                className="flex-1 py-3 rounded-xl bg-surface-raised hover:bg-border-subtle border border-border-subtle text-muted-foreground text-sm font-semibold transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleSavePin(pinInput || null)}
                disabled={pinSaving || (!!pinInput && pinInput.length !== 4)}
                className="flex-1 py-3 rounded-xl bg-accent hover:bg-[#ff5e1a] text-black text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pinSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel label="4자리 숫자" optional />
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                className="flex-1 text-center text-3xl font-bold bg-background border border-border-subtle rounded-xl px-4 py-3 text-foreground placeholder:text-placeholder-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
                style={{ letterSpacing: "0.5em", fontFamily: MONO_FONT }}
              />
              <button
                type="button"
                onClick={() =>
                  setPinInput(Math.floor(1000 + Math.random() * 9000).toString())
                }
                className="shrink-0 px-4 rounded-xl bg-surface-raised hover:bg-border-subtle border border-border-subtle text-muted-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw size={12} /> 랜덤
              </button>
            </div>
            <p className="text-[11px] text-disabled-foreground mt-2 leading-relaxed">
              설정 시 고객이 링크에 접속할 때 이 비밀번호를 입력해야 합니다. 비워두면 비밀번호 없이 접속할 수 있습니다.
            </p>
          </div>
        </div>
      </PhotographerModal>

      {/* Delete modal */}
      <PhotographerModal
        open={showDeleteModal}
        onClose={() => {
          if (deleting) return;
          setShowDeleteModal(false);
        }}
        title={
          <>
            <AlertTriangle size={16} className="text-rose-500" />
            프로젝트 삭제
          </>
        }
        maxWidth={420}
        titleAccent="danger"
        footer={
          <div className="flex flex-col gap-3">
            {deleteError && <ErrBox>{deleteError}</ErrBox>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-surface-raised hover:bg-border-subtle border border-border-subtle text-muted-foreground text-sm font-semibold transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 hover:border-rose-500/60 text-rose-400 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> {deleting ? "삭제 중..." : "프로젝트 삭제"}
              </button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="text-foreground font-semibold">&ldquo;{project.name}&rdquo;</span>{" "}
            프로젝트를 영구적으로 삭제합니다.
          </p>
          <p className="text-xs text-subtle-foreground leading-relaxed">
            모든 사진, 셀렉 데이터, 보정본이 함께 삭제되며 이 작업은 되돌릴 수 없습니다.
          </p>
        </div>
      </PhotographerModal>
    </div>
  );
}
