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
  className = "",
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 mb-1.5 ${className}`}>
      <span className="text-xs font-semibold text-zinc-300">{label}</span>
      {required && <span className="text-[10px] text-[#FF4D00] font-medium">필수</span>}
      {optional && <span className="text-[10px] text-zinc-600">선택</span>}
    </div>
  );
}

function MetaItem({
  label,
  required,
  optional,
  hint,
  children,
  fullSpan,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
  fullSpan?: boolean;
}) {
  return (
    <div className={fullSpan ? "col-span-2" : undefined}>
      <FieldLabel label={label} required={required} optional={optional} />
      <div className="text-base text-zinc-200">{children}</div>
      {hint && <p className="text-[11px] text-zinc-600 mt-1">{hint}</p>}
    </div>
  );
}

const MODAL_INPUT_CLS =
  "w-full bg-[#0a0a0c] border border-[#27272c] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]/20 transition-all disabled:bg-[#0a0a0c]/50 disabled:text-zinc-600 disabled:cursor-not-allowed";

function ModalField({
  label,
  required,
  optional,
  hint,
  children,
  fullSpan,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
  fullSpan?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${fullSpan ? "sm:col-span-2" : ""}`}>
      <FieldLabel label={label} required={required} optional={optional} className="mb-0" />
      {children}
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
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

function ModalShell({
  open,
  onClose,
  title,
  children,
  maxWidth = 560,
  titleAccent,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number;
  titleAccent?: "danger";
}) {
  if (!open) return null;
  const borderCls = titleAccent === "danger" ? "border-rose-500/25" : "border-[#1a1a1e]";
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-[#121215] border ${borderCls} rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto`}
        style={{ maxWidth }}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1e]">
          <h3 className="text-base font-bold text-white flex items-center gap-2">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-[#1a1a1e] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </header>
        <div className="p-6">{children}</div>
      </div>
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
      <div className="min-h-screen bg-[#0a0a0c] text-white" style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}>
        <PhotographerPageHeader
          crumbs={[{ label: "프로젝트", href: "/photographer/projects" }, { label: "로딩 중" }]}
          title="프로젝트 불러오는 중"
        />
        <div className="flex items-center justify-center py-32">
          <span className="text-zinc-600 text-sm" style={{ fontFamily: MONO_FONT }}>
            SYS.LOADING…
          </span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-white" style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}>
        <PhotographerPageHeader
          crumbs={[{ label: "프로젝트", href: "/photographer/projects" }, { label: "찾을 수 없음" }]}
          title="프로젝트를 찾을 수 없습니다"
        />
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <p className="text-sm text-zinc-500">존재하지 않거나 접근 권한이 없습니다.</p>
          <button
            type="button"
            onClick={() => router.push("/photographer/projects")}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a1e] hover:bg-[#27272c] border border-[#27272c] text-zinc-300"
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

  const cardCls = "bg-[#121215] border border-[#1a1a1e] rounded-2xl";

  // ── render ────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-[#0a0a0c] text-white"
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
                    className="text-[11px] text-zinc-500 bg-[#0a0a0c] px-1.5 py-0.5 rounded border border-[#1a1a1e]"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {project.displayId ?? id.slice(0, 12).toUpperCase()}
                  </span>
                  <StatusPill status={project.status} photoCount={M} requiredCount={N} />
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                  {project.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={openEdit}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#27272c] hover:bg-[#3f3f46] text-zinc-200 transition-colors"
              >
                <PenLine size={12} /> 정보 수정
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div className="col-span-2">
                <FieldLabel label="촬영 유형" optional />
                {project.shootType ? (() => {
                  const found = SHOOT_TYPES.find((t) => t.value === project.shootType);
                  const Icon = found?.icon;
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-[#FF4D00]/8 border border-[#FF4D00]/40 text-[#FF4D00]">
                      {Icon && <Icon size={13} />}
                      {found?.label ?? project.shootType}
                    </span>
                  );
                })() : (
                  <span className="text-sm text-zinc-600">—</span>
                )}
              </div>

              <MetaItem label="촬영 일자" required>
                <span style={{ fontFamily: MONO_FONT }}>{shootDisplay}</span>
              </MetaItem>

              <MetaItem label="셀렉 기한" required>
                <span style={{ fontFamily: MONO_FONT }}>{deadlineDisplay}</span>
              </MetaItem>

              <MetaItem label="고객 이름" required>
                <span className="inline-flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#27272c] flex items-center justify-center text-[10px] font-bold text-white">
                    {getInitial(project.customerName || "?")}
                  </span>
                  <span>{project.customerName || "—"}</span>
                </span>
              </MetaItem>

              <MetaItem label="연락처" optional hint="알림 기능 연동 시 사용됩니다">
                <span style={{ fontFamily: MONO_FONT }}>
                  {project.customerPhone?.trim() || "—"}
                </span>
              </MetaItem>

              <MetaItem label="셀렉 갯수 (N)" required hint="고객이 선택할 사진 수">
                <span>
                  <span
                    className="text-2xl font-bold text-[#FF4D00] leading-none"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {N}
                  </span>
                  <span className="text-sm text-zinc-500 ml-1.5">장</span>
                </span>
              </MetaItem>

              <MetaItem label="업로드 사진 수" hint="현재 업로드된 원본 수">
                <span>
                  <span
                    className="text-2xl font-bold text-white leading-none"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {M}
                  </span>
                  <span className="text-sm text-zinc-500 ml-1.5">장</span>
                </span>
              </MetaItem>

              <div className="col-span-2 pt-4 border-t border-[#1a1a1e]">
                <FieldLabel label="재보정 허용 횟수" />
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${
                      project.maxRevisionCount > 0
                        ? "bg-[#FF4D00]/10 border-[#FF4D00]/40 text-[#FF4D00]"
                        : "bg-[#1a1a1e] border-[#27272c] text-zinc-500"
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: project.maxRevisionCount > 0 ? "#FF4D00" : "#3f3f46" }}
                    />
                    {project.maxRevisionCount === 0 ? "재보정 없음" : `최대 ${project.maxRevisionCount}회`}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {project.maxRevisionCount === 0
                      ? "보정본 검토 후 바로 납품"
                      : `보정본 검토 후 최대 ${project.maxRevisionCount}회 재보정 가능`}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Customer link card */}
          <section className={`${cardCls} p-6`}>
            <div className="flex items-center justify-between mb-5 gap-2">
              <h3 className="text-base font-bold text-white">고객 링크</h3>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border ${
                  isInviteActive
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                    : "text-zinc-500 bg-[#1a1a1e] border-[#27272c]"
                }`}
              >
                {isInviteActive ? "활성" : "준비 중"}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
              <div className="flex flex-col gap-1.5 min-w-0">
                <FieldLabel label="초대 링크" className="mb-0" />
                <div className="flex items-stretch bg-[#0a0a0c] border border-[#27272c] rounded-xl overflow-hidden focus-within:border-[#FF4D00] transition-colors">
                  <input
                    type="text"
                    readOnly
                    value={isInviteActive ? inviteUrl : "업로드 완료 후 활성화"}
                    disabled={!isInviteActive}
                    className="flex-1 min-w-0 bg-transparent text-zinc-300 text-sm px-4 py-3 outline-none disabled:text-zinc-600 disabled:cursor-not-allowed"
                    style={{ fontFamily: MONO_FONT }}
                  />
                  <button
                    type="button"
                    disabled={!isInviteActive}
                    onClick={handleCopyUrl}
                    aria-label="URL 복사"
                    className={`shrink-0 w-12 flex items-center justify-center border-l border-[#27272c] transition-colors ${
                      copied ? "text-emerald-400" : "text-zinc-400 hover:text-white hover:bg-[#1a1a1e]"
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <FieldLabel label="고객 비밀번호" className="mb-0" />
                <div className="flex items-stretch bg-[#0a0a0c] border border-[#27272c] rounded-xl overflow-hidden focus-within:border-[#FF4D00] transition-colors">
                  <input
                    type={pinReveal ? "text" : "password"}
                    readOnly
                    value={project.accessPin ?? ""}
                    placeholder={project.accessPin ? undefined : "미설정"}
                    disabled={!project.accessPin}
                    className="flex-1 min-w-0 bg-transparent text-zinc-300 text-sm px-4 py-3 outline-none disabled:text-zinc-600 disabled:cursor-not-allowed"
                    style={{ fontFamily: MONO_FONT, letterSpacing: pinReveal ? "0.2em" : undefined }}
                  />
                  <button
                    type="button"
                    disabled={!project.accessPin}
                    onClick={() => setPinReveal((v) => !v)}
                    aria-label={pinReveal ? "PIN 숨기기" : "PIN 표시"}
                    className="shrink-0 w-12 flex items-center justify-center border-l border-[#27272c] text-zinc-400 hover:text-white hover:bg-[#1a1a1e] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                className="text-xs text-zinc-400 hover:text-[#FF4D00] underline underline-offset-2 transition-colors disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              >
                링크와 비밀번호 함께 복사
              </button>
              <span className="text-zinc-700">·</span>
              <button
                type="button"
                onClick={() => {
                  setPinInput("");
                  setPinError("");
                  setShowPinModal(true);
                }}
                className="text-xs text-zinc-400 hover:text-[#FF4D00] transition-colors"
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
            <h3 className="text-base font-bold text-white mb-4">진행 단계</h3>
            <div className="flex flex-col gap-2">
              {actionFlowSteps.map((step, i) => {
                const isDone = step.state === "done";
                const isActive = step.state === "active";
                const isLocked = step.state === "locked";
                const clickable = !!step.onClick;

                const cardStateCls = isActive
                  ? "bg-[#FF4D00]/5 border-[#FF4D00]/40"
                  : isDone
                  ? "bg-[#0a0a0c]/50 border-[#1a1a1e]"
                  : "bg-transparent border border-dashed border-[#27272c] opacity-60";

                const cursorCls = clickable
                  ? "hover:border-[#FF4D00]/50 cursor-pointer"
                  : isLocked
                  ? "cursor-not-allowed"
                  : "cursor-default";

                const numCls = isActive
                  ? "text-[#FF4D00]"
                  : isDone
                  ? "text-emerald-500"
                  : "text-zinc-600";

                const iconBoxCls = isActive
                  ? "bg-[#FF4D00]/15 border-[#FF4D00]/40 text-[#FF4D00]"
                  : isDone
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-[#1a1a1e] border-[#27272c] text-zinc-500";

                const labelCls = isActive
                  ? "text-white"
                  : isDone
                  ? "text-zinc-300"
                  : "text-zinc-500";

                const descCls = isActive
                  ? "text-[#FF4D00]"
                  : isDone
                  ? "text-zinc-600"
                  : "text-zinc-700";

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
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FF4D00]/15 text-[#FF4D00] border border-[#FF4D00]/30">
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
                        className="text-zinc-500 shrink-0 group-hover:text-[#FF4D00] transition-colors"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recent activity */}
          <section className={`${cardCls} p-5 hidden md:block`}>
            <h3 className="text-base font-bold text-white mb-4">최근 활동</h3>
            {logs.length === 0 ? (
              <p className="text-xs text-zinc-600">최근 활동 내역이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {logs.map((log) => {
                  const orange = log.action === "selecting";
                  const green = log.action === "uploaded" || log.action === "confirmed";
                  const dotCls = orange
                    ? "border-[#FF4D00]"
                    : green
                    ? "border-emerald-500"
                    : "border-zinc-600";
                  const msgCls = orange
                    ? "text-[#FF4D00]"
                    : green
                    ? "text-emerald-400"
                    : "text-zinc-300";
                  return (
                    <li key={log.id} className="flex gap-3 min-w-0">
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full bg-[#0a0a0c] border-2 ${dotCls} shrink-0`}
                      />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span
                          className="text-[10px] text-zinc-600"
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
            <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
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
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[210] bg-[#121215] border border-[#27272c] rounded-xl px-4 py-2.5 text-sm text-white shadow-lg pointer-events-none"
          style={{ fontFamily: "var(--font-inter, sans-serif)" }}
        >
          {toast}
        </div>
      )}

      {/* Edit modal */}
      <ModalShell
        open={editMode}
        onClose={() => {
          setEditMode(false);
          setSaveError("");
        }}
        title="프로젝트 정보 수정"
      >
        <div className="flex flex-col gap-5">
          <div>
            <FieldLabel label="촬영 유형" optional />
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
                      editShootType === value ? "rgba(255,77,0,0.08)" : "transparent",
                    borderColor:
                      editShootType === value ? "rgba(255,77,0,0.5)" : "#27272c",
                    color: editShootType === value ? "#FF4D00" : "#71717a",
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
            <ModalField label="연락처" optional hint="010-XXXX-XXXX 형식">
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

          <ModalField label="셀렉 갯수 (N)" required hint="고객이 선택할 사진 수">
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
            <FieldLabel label="재보정 허용 횟수" />
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
                        ? "bg-[#FF4D00]/8 border-[#FF4D00]/40 text-[#FF4D00]"
                        : "bg-transparent border-[#27272c] text-zinc-500 hover:border-[#3f3f46] hover:text-zinc-300"
                    }`}
                  >
                    <span className="text-sm font-bold">{label}</span>
                    <span className="text-[10px]">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {saveError && <ErrBox>{saveError}</ErrBox>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setEditMode(false);
                setSaveError("");
              }}
              className="flex-1 py-3 rounded-xl bg-[#1a1a1e] hover:bg-[#27272c] border border-[#27272c] text-zinc-300 text-sm font-semibold transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#FF4D00] hover:bg-[#ff5e1a] text-black text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* PIN modal */}
      <ModalShell
        open={showPinModal}
        onClose={() => {
          if (pinSaving) return;
          setShowPinModal(false);
          setPinInput("");
          setPinError("");
        }}
        title="고객 접속 비밀번호"
        maxWidth={400}
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
                className="flex-1 text-center text-3xl font-bold bg-[#0a0a0c] border border-[#27272c] rounded-xl px-4 py-3 text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF4D00] focus:ring-1 focus:ring-[#FF4D00]/20 transition-all"
                style={{ letterSpacing: "0.5em", fontFamily: MONO_FONT }}
              />
              <button
                type="button"
                onClick={() =>
                  setPinInput(Math.floor(1000 + Math.random() * 9000).toString())
                }
                className="shrink-0 px-4 rounded-xl bg-[#1a1a1e] hover:bg-[#27272c] border border-[#27272c] text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw size={12} /> 랜덤
              </button>
            </div>
            <p className="text-[11px] text-zinc-600 mt-2 leading-relaxed">
              설정 시 고객이 링크에 접속할 때 이 비밀번호를 입력해야 합니다. 비워두면 비밀번호 없이 접속할 수 있습니다.
            </p>
          </div>

          {pinError && <ErrBox>{pinError}</ErrBox>}

          <div className="flex gap-2 pt-1">
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
              className="flex-1 py-3 rounded-xl bg-[#1a1a1e] hover:bg-[#27272c] border border-[#27272c] text-zinc-300 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => handleSavePin(pinInput || null)}
              disabled={pinSaving || (!!pinInput && pinInput.length !== 4)}
              className="flex-1 py-3 rounded-xl bg-[#FF4D00] hover:bg-[#ff5e1a] text-black text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pinSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* Delete modal */}
      <ModalShell
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
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-300 leading-relaxed">
            <span className="text-white font-semibold">&ldquo;{project.name}&rdquo;</span>{" "}
            프로젝트를 영구적으로 삭제합니다.
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            모든 사진, 셀렉 데이터, 보정본이 함께 삭제되며 이 작업은 되돌릴 수 없습니다.
          </p>

          {deleteError && <ErrBox>{deleteError}</ErrBox>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
              className="flex-1 py-3 rounded-xl bg-[#1a1a1e] hover:bg-[#27272c] border border-[#27272c] text-zinc-300 text-sm font-semibold transition-colors disabled:opacity-50"
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
      </ModalShell>
    </div>
  );
}
