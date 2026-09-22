"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ChevronRight,
  MessageCircle,
} from "lucide-react";
import { getProjectById } from "@/lib/db";
import type { Project } from "@/types";
import styles from "./ProjectDetailTheme.module.css";
import { PhotographerMobilePageHeader } from "@/components/layout/PhotographerMobilePageHeader";
import {
  PhotographerLightPageFrame,
  PhotographerLightPageHeader,
} from "@/components/layout/PhotographerLightPageHeader";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";
import { FieldInfoTip } from "@/components/ui/FieldInfoTip";
import { PhotographerConfirmDialog } from "@/components/ui/PhotographerConfirmDialog";
import { isValidKoreanPhone } from "@/lib/phone";
import { ProjectInformationCard } from "@/components/photographer/project-detail/ProjectInformationCard";
import { ProjectMemoField } from "@/components/photographer/project-detail/ProjectMemoField";
import { ProjectWorkPanel } from "@/components/photographer/project-detail/ProjectWorkPanel";
import { ProjectProgressCard } from "@/components/photographer/project-detail/ProjectProgressCard";
import { formatProjectDisplayId } from "@/components/photographer/ProjectIdText";
import { PhotographerFormActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import {
  clearPhotographerMobileProjectContext,
  publishPhotographerMobileProjectContext,
} from "@/lib/photographer-mobile-project-context";
import {
  PROJECT_FORM_INPUT_CLASS,
  ProjectFormDateInput,
  ProjectFormError,
  ProjectFormField,
  ProjectFormInput,
  ProjectFormPhoneInput,
  ProjectFormPageHeading,
  ProjectFormSection,
  ProjectFormToggleRow,
  ProjectPinControl,
  ProjectRevisionSelector,
  ProjectShootTypeSelector,
  projectFormInputStateClass,
} from "@/components/photographer/ProjectFormFields";

const PRETENDARD_FONT = "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif";

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

function ErrBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-danger/25 bg-danger/8 px-3 py-2 text-[12px] font-medium leading-[18px] tracking-[-0.25px] text-danger">
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
  const [toast, setToast] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editShootDate, setEditShootDate] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editRequiredCount, setEditRequiredCount] = useState(0);
  const [editMaxRevisionCount, setEditMaxRevisionCount] = useState<0 | 1 | 2>(2);
  const [editIncludeOriginal, setEditIncludeOriginal] = useState(false);
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editShootType, setEditShootType] = useState<string | null>(null);
  const [editAccessPin, setEditAccessPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showStartEditingModal, setShowStartEditingModal] = useState(false);
  const [startingEditing, setStartingEditing] = useState(false);
  const [startEditingError, setStartEditingError] = useState("");

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
    if (!project) return;
    const context = {
      projectName: project.name,
      customerName: project.customerName,
    };
    publishPhotographerMobileProjectContext(context);
    return () => clearPhotographerMobileProjectContext(context);
  }, [project]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSaveEdit = async () => {
    if (!project) return;
    setSaveError("");
    const canEditN = ["preparing", "selecting"].includes(project.status);
    const canEditDeliverySetting = project.status === "preparing" && project.photoCount === 0;
    const canEditAccessPin = project.status !== "delivered";
    const newN = canEditN ? editRequiredCount : project.requiredCount;
    const fieldErrors: Record<string, string> = {};
    if (!editName.trim()) fieldErrors.name = "프로젝트명을 입력해주세요.";
    if (!editCustomerName.trim()) fieldErrors.customerName = "고객 이름을 입력해주세요.";
    if (!editShootDate) fieldErrors.shootDate = "촬영 일자를 선택해주세요.";
    if (canEditN && newN < 1) fieldErrors.requiredCount = "셀렉 갯수를 1 이상으로 입력해주세요.";
    if (editCustomerPhone.trim() && !isValidKoreanPhone(editCustomerPhone)) {
      fieldErrors.customerPhone = "연락처는 010-0000-0000 형식으로 입력해주세요.";
    }
    if (editAccessPin && !/^\d{4}$/.test(editAccessPin)) {
      fieldErrors.accessPin = "고객 비밀번호는 숫자 4자리로 입력해주세요.";
    }
    if (Object.keys(fieldErrors).length > 0) {
      setEditFieldErrors(fieldErrors);
      const firstKey = Object.keys(fieldErrors)[0];
      requestAnimationFrame(() => {
        const field = document.getElementById(`edit-field-${firstKey}`);
        field?.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setEditFieldErrors({});
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
          max_revision_count: editMaxRevisionCount,
          ...(canEditDeliverySetting ? { include_original: editIncludeOriginal } : {}),
          customer_phone: editCustomerPhone || null,
          location: editLocation.trim() || null,
          shoot_type: editShootType,
          ...(canEditAccessPin ? { access_pin: editAccessPin || null } : {}),
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
        includeOriginal: canEditDeliverySetting ? editIncludeOriginal : project.includeOriginal,
        customerPhone: editCustomerPhone || null,
        location: editLocation.trim() || null,
        shootType: editShootType,
        accessPin: canEditAccessPin ? editAccessPin || null : project.accessPin,
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

  const openRetouchedWorkspace = () => {
    if (!project) return;
    if (project.status === "confirmed") {
      setStartEditingError("");
      setShowStartEditingModal(true);
      return;
    }
    router.push(`/photographer/projects/${id}/assets/retouched`);
  };

  const handleStartEditing = async () => {
    if (!project || project.status !== "confirmed") return;
    setStartEditingError("");
    setStartingEditing(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "editing" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "보정 시작에 실패했습니다.");
      }

      fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "editing" }),
      }).catch(() => {});

      setProject((current) => current ? { ...current, status: "editing" } : current);
      setShowStartEditingModal(false);
      router.push(`/photographer/projects/${id}/assets/retouched`);
    } catch (error) {
      setStartEditingError(
        error instanceof Error ? error.message : "보정 시작에 실패했습니다.",
      );
    } finally {
      setStartingEditing(false);
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
    setEditIncludeOriginal(project.includeOriginal ?? false);
    setEditCustomerPhone(project.customerPhone ?? "");
    setEditLocation(project.location ?? "");
    setEditShootType(project.shootType ?? null);
    setEditAccessPin(project.accessPin ?? "");
    setSaveError("");
    setEditFieldErrors({});
    setEditMode(true);
  };

  // ── empty / loading guards ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: PRETENDARD_FONT }}>
        <PhotographerMobilePageHeader
          backHref="/photographer/projects"
          title="프로젝트 불러오는 중"
          description="프로젝트 정보를 준비하고 있어요."
        />
        <PhotographerLightPageFrame className="hidden md:block">
          <PhotographerLightPageHeader
            title="프로젝트 불러오는 중"
            description="프로젝트 정보를 준비하고 있어요."
          />
        </PhotographerLightPageFrame>
        <div className="flex items-center justify-center py-32">
          <span className="font-mono text-sm text-disabled-foreground">
            SYS.LOADING…
          </span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: PRETENDARD_FONT }}>
        <PhotographerMobilePageHeader
          backHref="/photographer/projects"
          title="프로젝트를 찾을 수 없습니다"
          description="존재하지 않거나 접근 권한이 없습니다."
        />
        <PhotographerLightPageFrame className="hidden md:block">
          <PhotographerLightPageHeader
            title="프로젝트를 찾을 수 없습니다"
            description="존재하지 않거나 접근 권한이 없습니다."
          />
        </PhotographerLightPageFrame>
        <div className="flex flex-col items-center justify-center py-32 gap-3">
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

  const isInviteActive = project.status !== "preparing";

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

  const shootTypeLabel = SHOOT_TYPES.find((type) => type.value === project.shootType)?.label;
  const mobileShootDate = (() => {
    let dateLabel = project.shootDate;
    try {
      dateLabel = format(parseISO(project.shootDate), "yyyy.MM.dd");
    } catch {
      // Keep the stored value when it is not an ISO date.
    }
    return `${dateLabel} 촬영`;
  })();
  const shootDescription = (() => {
    let dateLabel = project.shootDate;
    try {
      dateLabel = format(parseISO(project.shootDate), "yyyy년 M월 d일");
    } catch {
      // Keep the stored value when it is not an ISO date.
    }
    return [shootTypeLabel, `${dateLabel} 촬영`].filter(Boolean).join(" · ");
  })();

  if (editMode) {
    const selectionSettingsLocked = !["preparing", "selecting"].includes(project.status);
    const deliverySettingLocked = project.status !== "preparing" || project.photoCount > 0;
    const accessPinLocked = project.status === "delivered";

    return (
      <div
        className={`min-h-screen bg-background text-foreground ${styles.editPage}`}
        style={{ fontFamily: PRETENDARD_FONT }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveEdit();
          }}
        >
          <PhotographerLightPageFrame className="pb-8">
            <div className={styles.editContainer}>
              <ProjectFormPageHeading
                title="프로젝트 정보 수정"
                description={`${project.name} · ${project.customerName} 고객`}
                onBack={() => {
                  setEditMode(false);
                  setSaveError("");
                  setEditFieldErrors({});
                }}
                backLabel="프로젝트 상세로 돌아가기"
                mobileHidden
              />

              <div className={styles.editSections}>
                <ProjectFormSection
                  number="01"
                  title="기본 정보"
                  description="프로젝트를 구분하고 고객에게 안내할 정보를 입력해 주세요."
                >
                  <div id="edit-field-name">
                    <ProjectFormField error={editFieldErrors.name} label="프로젝트명" required>
                      <ProjectFormInput
                        type="text"
                        value={editName}
                        onChange={(event) => {
                          setEditName(event.target.value);
                          setEditFieldErrors((current) => ({ ...current, name: "" }));
                        }}
                        className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(editName), error: Boolean(editFieldErrors.name) })}`}
                        placeholder="예: 2024 김민수님 스튜디오 촬영"
                      />
                    </ProjectFormField>
                  </div>

                  <ProjectFormField group label="촬영 유형">
                    <ProjectShootTypeSelector value={editShootType} onChange={setEditShootType} />
                  </ProjectFormField>

                  <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                    <div id="edit-field-customerName">
                      <ProjectFormField error={editFieldErrors.customerName} label="고객 이름" required>
                        <ProjectFormInput
                          type="text"
                          value={editCustomerName}
                          onChange={(event) => {
                            setEditCustomerName(event.target.value);
                            setEditFieldErrors((current) => ({ ...current, customerName: "" }));
                          }}
                          className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(editCustomerName), error: Boolean(editFieldErrors.customerName) })}`}
                          placeholder="예: 김민수"
                        />
                      </ProjectFormField>
                    </div>

                    <div id="edit-field-shootDate" className="min-w-0">
                      <ProjectFormField error={editFieldErrors.shootDate} label="촬영 일자" required>
                        <ProjectFormDateInput
                          value={editShootDate}
                          onChange={(event) => {
                            const nextShootDate = event.target.value;
                            setEditShootDate(nextShootDate);
                            setEditFieldErrors((current) => ({ ...current, shootDate: "" }));
                            if (nextShootDate) {
                              setEditDeadline(format(addDays(new Date(nextShootDate), 7), "yyyy-MM-dd"));
                            }
                          }}
                          onClick={(event) => event.currentTarget.showPicker?.()}
                          className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(editShootDate), error: Boolean(editFieldErrors.shootDate) })}`}
                        />
                      </ProjectFormField>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div id="edit-field-customerPhone">
                      <ProjectFormField error={editFieldErrors.customerPhone} label="연락처" info="알림 기능 연동 시 사용됩니다">
                        <ProjectFormPhoneInput
                          value={editCustomerPhone}
                          onChange={(value) => {
                            setEditCustomerPhone(value);
                            setEditFieldErrors((current) => ({ ...current, customerPhone: "" }));
                          }}
                          className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(editCustomerPhone), error: Boolean(editFieldErrors.customerPhone) })}`}
                        />
                      </ProjectFormField>
                    </div>

                    <ProjectFormField label="촬영 장소">
                      <ProjectFormInput
                        type="text"
                        aria-label="촬영장소"
                        value={editLocation}
                        onChange={(event) => setEditLocation(event.target.value)}
                        className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(editLocation) })}`}
                        placeholder="예: 서울 강남 스튜디오, 한강공원 잠원지구 등"
                      />
                    </ProjectFormField>
                  </div>
                </ProjectFormSection>

                <ProjectFormSection
                  number="02"
                  title="고객 갤러리 설정"
                  description="고객이 사진을 선택하고 요청을 남길 수 있는 범위와 접속 방식을 설정해 주세요."
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div id="edit-field-requiredCount">
                      <ProjectFormField error={editFieldErrors.requiredCount} label="셀렉 장수" required>
                        <div className="relative">
                          <ProjectFormInput
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min={1}
                            value={editRequiredCount}
                            disabled={selectionSettingsLocked}
                            onChange={(event) => {
                              setEditRequiredCount(Number(event.target.value.replace(/[^0-9]/g, "")));
                              setEditFieldErrors((current) => ({ ...current, requiredCount: "" }));
                            }}
                            className={`${PROJECT_FORM_INPUT_CLASS} pr-12 md:pr-12 text-right ${projectFormInputStateClass({ hasValue: editRequiredCount > 0, error: Boolean(editFieldErrors.requiredCount) })}`}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-[14px] text-subtle-foreground">장</span>
                        </div>
                        <span className="text-[10px] text-disabled-foreground">고객이 선택할 사진 수</span>
                      </ProjectFormField>
                      {selectionSettingsLocked ? (
                        <p className="mt-2 text-[12px] text-muted-foreground">고객 셀렉이 완료되어 변경할 수 없어요.</p>
                      ) : null}
                    </div>

                    <ProjectFormField group label="재보정 요청 횟수" required>
                      <ProjectRevisionSelector value={editMaxRevisionCount} onChange={setEditMaxRevisionCount} />
                    </ProjectFormField>
                  </div>

                  <ProjectFormToggleRow
                    label="원본 다운로드 허용"
                    description="고객이 셀렉 갤러리에서 원본 사진을 내려받을 수 있도록 허용해요"
                    checked={editIncludeOriginal}
                    onCheckedChange={setEditIncludeOriginal}
                    disabled={deliverySettingLocked}
                    disabledMessage="원본 업로드를 시작해 변경할 수 없어요."
                    ariaLabel="원본 다운로드 허용"
                  />

                  <div id="edit-field-accessPin">
                    <ProjectPinControl
                      value={editAccessPin}
                      onChange={(value) => {
                        setEditAccessPin(value);
                        setEditFieldErrors((current) => ({ ...current, accessPin: "" }));
                      }}
                      disabled={accessPinLocked}
                      disabledMessage="납품이 완료된 프로젝트의 고객 비밀번호는 변경할 수 없어요."
                    />
                    {editFieldErrors.accessPin ? <ProjectFormError>{editFieldErrors.accessPin}</ProjectFormError> : null}
                  </div>
                </ProjectFormSection>

              </div>
            </div>
          </PhotographerLightPageFrame>

          <PhotographerFormActionBar
            maxWidth={1100}
            viewportFixed
            error={saveError}
            leading={(
              <div>
                <p className="text-[14px] font-bold text-foreground">프로젝트 정보 수정</p>
                <p className="mt-1 text-[12px] text-muted-foreground">저장 후 프로젝트 상세 화면으로 돌아갑니다.</p>
              </div>
            )}
            actions={(
              <>
                <PhotographerLightButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditMode(false);
                    setSaveError("");
                    setEditFieldErrors({});
                  }}
                >
                  취소
                </PhotographerLightButton>
                <PhotographerLightButton type="submit" variant="primary" pending={saving}>
                  {saving ? "저장 중..." : "변경사항 저장"}
                </PhotographerLightButton>
              </>
            )}
          />
        </form>
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────

  return (
    <div
      className={`min-h-screen bg-background text-foreground ${styles.detailPage}`}
      style={{ fontFamily: PRETENDARD_FONT }}
    >
      <PhotographerMobilePageHeader
        title={project.name}
        titleAccessory={shootTypeLabel ? (
          <span
            data-project-header-shoot-type
            className="inline-flex min-h-6 items-center rounded-[5px] border border-cyan/20 bg-[var(--customer-soft)] px-2 text-[11px] font-semibold leading-4 text-cyan"
          >
            {shootTypeLabel}
          </span>
        ) : null}
        description={mobileShootDate}
        dense
      />

      <PhotographerLightPageFrame className="hidden md:block">
        <PhotographerLightPageHeader
          breadcrumb={(
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-[14px] font-medium leading-[16.8px] tracking-[-0.15px] text-muted-foreground"
            >
              <Link href="/photographer/projects" className="transition-colors hover:text-foreground">
                프로젝트
              </Link>
              <ChevronRight size={14} aria-hidden="true" className="text-subtle-foreground" />
              <span aria-current="page">#{formatProjectDisplayId(project)}</span>
            </nav>
          )}
          title={project.name}
          description={`${project.customerName} 고객 · ${shootDescription}${project.location ? ` · ${project.location}` : ""}`}
          trailing={<PhotographerLightButton variant="secondary" onClick={openEdit}>정보 수정</PhotographerLightButton>}
        />
      </PhotographerLightPageFrame>

      <main className="flex w-full flex-col gap-4 px-5 pb-8 pt-1 md:gap-6 md:px-8 md:pb-12 md:pt-8">
        <ProjectProgressCard
          project={project}
          onUpload={() => router.push(project.status === "preparing"
            ? `/photographer/projects/${id}/upload`
            : `/photographer/projects/${id}/assets/original`)}
          onSelection={() => router.push(`/photographer/projects/${id}/assets/selected`)}
          onWorkflow={openRetouchedWorkspace}
          onResults={() => router.push(`/photographer/projects/${id}/assets/final`)}
        />

        <div
          data-project-detail-content-grid
          className={styles.contentGrid}
        >
          {/* ── Left column ────────────────────────────────── */}
          <div data-project-detail-primary-column className={styles.informationColumn}>

          <ProjectInformationCard
            project={project}
            shootDisplay={shootDisplay}
            reviewDeadlineDisplay={reviewDeadlineDisplay}
            onEdit={openEdit}
            onDelete={() => {
              setDeleteError("");
              setShowDeleteModal(true);
            }}
          >
            <ProjectMemoField key={project.id} projectId={project.id} initialValue={project.photographerNote ?? null} />
          </ProjectInformationCard>
        </div>

        {/* 현재 작업과 고객 전달 도구를 같은 열에 모아 다음 행동을 먼저 읽게 한다. */}
        <div data-project-detail-secondary-column className={styles.workColumn}>
          <ProjectWorkPanel
            project={project}
            deadlineDisplay={deadlineDisplay}
            reviewDeadlineDisplay={reviewDeadlineDisplay}
            onUpload={() => router.push(project.status === "preparing"
              ? `/photographer/projects/${id}/upload`
              : `/photographer/projects/${id}/assets/original`)}
            onRecoverOriginals={() => router.push(`/photographer/projects/${id}/upload?recover=1`)}
            onWorkflow={openRetouchedWorkspace}
            onResults={() => router.push(`/photographer/projects/${id}/assets/final`)}
          />
          <section data-project-customer-link className={styles.customerLink} aria-label="고객 링크">
            {!isInviteActive ? (
              <p className="text-[13px] font-medium leading-5 text-muted-foreground">
                원본을 준비하고 셀렉을 요청하면 고객 링크를 공유할 수 있어요.
              </p>
            ) : null}
            <div className={isInviteActive ? "" : "hidden"}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-bold leading-5 tracking-[-0.32px] text-foreground">
                고객 링크
              </h3>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium leading-[18px] text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    isInviteActive ? "bg-cyan" : "bg-disabled-foreground"
                  }`}
                />
                {isInviteActive ? "사용 가능" : "업로드 후 활성화"}
              </span>
            </div>

            <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
              <div className="flex flex-col gap-1.5 min-w-0">
                <FieldLabel
                  label="초대 링크"
                  info="고객 셀렉·검토 링크"
                  className="mb-0"
                />
                <div data-customer-link-control className="flex h-11 items-stretch overflow-hidden rounded-lg border border-border-subtle bg-surface-raised transition-colors focus-within:border-border-strong">
                  <input
                    type="text"
                    readOnly
                    value={isInviteActive ? inviteUrl : "업로드 완료 후 활성화"}
                    disabled={!isInviteActive}
                    className="min-w-0 flex-1 bg-transparent px-4 text-[14px] font-normal leading-6 tracking-[-0.45px] text-foreground outline-none disabled:cursor-not-allowed disabled:text-disabled-foreground"
                  />
                  <button
                    type="button"
                    disabled={!isInviteActive}
                    onClick={handleCopyUrl}
                    aria-label="URL 복사"
                    className={`flex w-11 shrink-0 items-center justify-center border-l border-border-subtle transition-colors ${
                      copied ? "bg-[var(--customer-soft)] text-cyan" : "text-subtle-foreground hover:bg-border-subtle hover:text-foreground"
                    } disabled:cursor-not-allowed disabled:opacity-30`}
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
                <div data-customer-link-control className="flex h-11 items-stretch overflow-hidden rounded-lg border border-border-subtle bg-surface-raised transition-colors focus-within:border-border-strong">
                  <input
                    type={pinReveal ? "text" : "password"}
                    readOnly
                    value={project.accessPin ?? ""}
                    placeholder={project.accessPin ? undefined : "미설정"}
                    disabled={!project.accessPin}
                    className="min-w-0 flex-1 bg-transparent px-4 text-[14px] font-normal leading-6 text-foreground outline-none placeholder:text-disabled-foreground disabled:cursor-not-allowed disabled:text-disabled-foreground"
                    style={{ letterSpacing: pinReveal ? "4px" : undefined }}
                  />
                  <button
                    type="button"
                    disabled={!project.accessPin}
                    onClick={() => setPinReveal((v) => !v)}
                    aria-label={pinReveal ? "PIN 숨기기" : "PIN 표시"}
                    className="flex w-11 shrink-0 items-center justify-center border-l border-border-subtle text-subtle-foreground transition-colors hover:bg-border-subtle hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {pinReveal ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex min-h-11 flex-wrap items-center gap-2 lg:col-span-2">
                <PhotographerLightButton
                  type="button"
                  variant="secondary"
                  onClick={handleCopyInviteBundle}
                  disabled={!isInviteActive}
                  className="h-11 px-4 font-semibold"
                >
                  <Copy size={15} />
                  초대 링크 복사
                </PhotographerLightButton>
                <PhotographerLightButton
                  type="button"
                  variant="secondary"
                  disabled
                  title="알림톡 보내기 기능은 준비 중입니다"
                  className="h-11 px-4"
                >
                  <MessageCircle size={15} />
                  알림톡 보내기
                </PhotographerLightButton>
              </div>
            </div>
            </div>
          </section>
        </div>
        </div>

      </main>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[210] -translate-x-1/2 rounded-xl border border-border-subtle bg-surface px-4 py-2.5 text-[14px] font-normal leading-5 tracking-[-0.35px] text-foreground shadow-lg pointer-events-none"
        >
          {toast}
        </div>
      )}

      {/* Delete modal */}
      <PhotographerConfirmDialog
        open={showStartEditingModal}
        onClose={() => {
          if (startingEditing) return;
          setShowStartEditingModal(false);
          setStartEditingError("");
        }}
        onConfirm={() => void handleStartEditing()}
        title="보정을 시작할까요?"
        description="보정 작업을 시작하면 고객은 셀렉 사진을 직접 변경할 수 없습니다."
        detail="선택된 사진과 고객 코멘트를 확인한 뒤 보정본을 업로드할 수 있어요."
        error={startEditingError || undefined}
        confirmLabel="보정 시작"
        pendingLabel="시작하는 중..."
        pending={startingEditing}
        tone="primary"
      />

      <PhotographerConfirmDialog
        open={showDeleteModal}
        onClose={() => {
          if (deleting) return;
          setShowDeleteModal(false);
        }}
        onConfirm={handleDeleteProject}
        title="프로젝트를 삭제할까요?"
        description="삭제 후에는 복구할 수 없습니다."
        detail="원본 사진, 셀렉 기록, 보정본과 납품 파일이 모두 삭제되고 고객 링크도 즉시 열리지 않아요."
        error={deleteError || undefined}
        confirmLabel="프로젝트 삭제"
        pendingLabel="삭제 중..."
        pending={deleting}
      />
    </div>
  );
}
