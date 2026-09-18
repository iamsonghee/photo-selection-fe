"use client";

import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  Camera,
  CalendarDays,
  Mail,
  Bell,
  Globe2,
  Instagram,
  LogOut,
  Phone,
  SlidersHorizontal,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import type { PhotographerProfile } from "@/app/api/photographer/profile/route";
import { getProfileImageUrl } from "@/lib/photographer";
import { createClient } from "@/lib/supabase/client";
import { formatKstYearMonth } from "@/lib/kst-date";
import { useProfile } from "@/contexts/ProfileContext";
import {
  PhotographerLightPageFrame,
  PhotographerLightPageHeader,
} from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerConfirmDialog } from "@/components/ui/PhotographerConfirmDialog";
import {
  PROJECT_FORM_INPUT_CLASS,
  ProjectFormField,
  ProjectFormInput,
  ProjectFormTextarea,
  ProjectFormPhoneInput,
  ProjectFormError,
  PhotographerLightSwitch,
} from "@/components/photographer/ProjectFormFields";
import { compressImageForUpload } from "@/lib/upload-client-compress";
import { isValidKoreanPhone } from "@/lib/phone";
import themeStyles from "./SettingsTheme.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp";
const SETTINGS_INPUT_CLASS = `${PROJECT_FORM_INPUT_CLASS} !min-h-11 !px-3.5 !py-[9px] md:!min-h-11 md:!rounded-lg md:!px-4 md:!py-[9px]`;

interface ToastItem {
  id: number;
  message: string;
  isError: boolean;
}

/** 설정 패널의 제목·설명·상태를 한 위계로 묶어 긴 단일 폼에서도 현재 영역을 빠르게 찾게 한다. */
function SettingsSectionHeading({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <header className="flex items-start gap-3 border-b border-border-subtle bg-surface-raised/55 px-4 py-4 md:px-6 md:py-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-foreground ring-1 ring-inset ring-border-subtle" aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[18px] font-bold leading-6 tracking-[-0.45px] text-foreground md:text-[20px] md:leading-7">{title}</h2>
          {status ? <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border-subtle">{status}</span> : null}
        </div>
        <p className="mt-1 break-keep text-[13px] leading-5 text-muted-foreground">{description}</p>
      </div>
    </header>
  );
}

/** Figma #56044 "알림"/"계정" 섹션 공통 행 — 라벨+설명(좌) / 컨트롤(우), 카드 배경 없이 플랫하게. */
function SettingsRow({
  icon: Icon,
  label,
  description,
  children,
  danger = false,
}: {
  icon?: typeof UserRound;
  label: string;
  description: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon ? (
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${danger ? "bg-danger/8 text-danger" : "bg-surface-raised text-muted-foreground"}`} aria-hidden>
            <Icon size={17} strokeWidth={1.9} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] font-semibold leading-5 ${danger ? "text-danger" : "text-foreground"}`}>{label}</p>
          <p className="mt-1 max-w-[540px] break-keep text-[12px] leading-[18px] text-muted-foreground md:text-[13px] md:leading-5">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingsPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section data-settings-panel className={`overflow-hidden rounded-2xl border border-border-subtle bg-surface ${className}`}>{children}</section>;
}

export default function SettingsPage() {
  const router = useRouter();
  const { profile: ctxProfile, loading: profileLoading, updateProfile: updateCtxProfile } = useProfile();

  const [profile, setProfile] = useState<PhotographerProfile | null>(null);

  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editPortfolio, setEditPortfolio] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [defaultDeadlineDays, setDefaultDeadlineDays] = useState("30");
  const [defaultIncludeOriginal, setDefaultIncludeOriginal] = useState(false);
  const [defaultUploadStrategy, setDefaultUploadStrategy] = useState<"preview_first" | "parallel">("parallel");
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // ProfileContext가 이미 세션당 1회 가져온 프로필을 여기서 다시 fetch하지 않고, 최초 도착 시에만
  // 로컬 편집 상태를 시딩한다(이후 handleSave/이미지 업로드가 profile을 낙관적으로 직접 patch하므로
  // ctxProfile이 갱신돼도 다시 덮어쓰지 않음).
  useEffect(() => {
    if (!ctxProfile || profile) return;
    setProfile(ctxProfile);
    setEditName(ctxProfile.name ?? "");
    setEditBio(ctxProfile.bio ?? "");
    const raw = ctxProfile.instagramUrl ?? "";
    setEditInstagram(
      raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, ""),
    );
    setEditPortfolio(ctxProfile.portfolioUrl ?? "");
    setEditPhone(ctxProfile.contactPhone ?? "");
    setDefaultDeadlineDays(String(ctxProfile.defaultSelectionDeadlineDays));
    setDefaultIncludeOriginal(ctxProfile.defaultIncludeOriginal);
    setDefaultUploadStrategy(ctxProfile.defaultUploadStrategy);
  }, [ctxProfile, profile]);

  const showToast = (message: string, isError = false) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, isError }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  };

  const handleSave = async () => {
    if (!profile) return;
    if (editPhone.trim() && !isValidKoreanPhone(editPhone)) {
      setFormError("연락처는 010-0000-0000 형식으로 입력해주세요.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const instagramUrl = editInstagram.trim()
        ? `https://instagram.com/${editInstagram.trim().replace(/^@/, "")}`
        : null;
      const res = await fetch("/api/photographer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || null,
          bio: editBio.trim() || null,
          instagram_url: instagramUrl,
          portfolio_url: editPortfolio.trim() || null,
          contact_phone: editPhone.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("저장에 실패했습니다.");
      const patch = {
        name: editName.trim() || null,
        bio: editBio.trim() || null,
        instagramUrl,
        portfolioUrl: editPortfolio.trim() || null,
        contactPhone: editPhone.trim() || null,
      };
      setProfile({ ...profile, ...patch });
      updateCtxProfile(patch);
      showToast("프로필이 저장되었습니다.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!profile) return;
    setEditName(profile.name ?? "");
    setEditBio(profile.bio ?? "");
    const raw = profile.instagramUrl ?? "";
    setEditInstagram(
      raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, ""),
    );
    setEditPortfolio(profile.portfolioUrl ?? "");
    setEditPhone(profile.contactPhone ?? "");
    setFormError(null);
  };

  const handleDefaultsSave = async () => {
    if (!profile) return;
    const days = Number(defaultDeadlineDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setDefaultsError("셀렉 마감 기본 기간은 1~365일로 입력해주세요.");
      return;
    }
    setSavingDefaults(true);
    setDefaultsError(null);
    try {
      const res = await fetch("/api/photographer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_selection_deadline_days: days,
          default_include_original: defaultIncludeOriginal,
          default_upload_strategy: defaultUploadStrategy,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      const patch = {
        defaultSelectionDeadlineDays: days,
        defaultIncludeOriginal,
        defaultUploadStrategy,
      };
      setProfile({ ...profile, ...patch });
      updateCtxProfile(patch);
      showToast("프로젝트 기본 설정이 저장되었습니다.");
    } catch (e) {
      setDefaultsError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    e.target.value = "";
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return;
    setUploadingImage(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");
      const compressed = await compressImageForUpload(file);
      const form = new FormData();
      form.append("file", compressed);
      const res = await fetch(`${API_BASE}/api/upload/profile-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? "업로드 실패");
      const url = data.url as string;
      const patchRes = await fetch("/api/photographer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_image_url: url }),
      });
      if (!patchRes.ok) throw new Error("프로필 저장 실패");
      setProfile({ ...profile, profileImageUrl: url });
      updateCtxProfile({ profileImageUrl: url });
      showToast("프로필 이미지가 변경되었습니다.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "이미지 업로드 실패", true);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/photographer/account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "탈퇴 처리 중 오류가 발생했습니다.");
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "탈퇴 실패", true);
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  if (profileLoading) {
    return <SystemLoadingScreen />;
  }

  if (!profile) return null;

  const joinDate = profile.createdAt ? formatKstYearMonth(profile.createdAt) : null;

  return (
    <div
      className={`${themeStyles.lightTheme} min-h-screen bg-background text-foreground`}
      style={{ fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}
      onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_IMAGE}
        className="hidden"
        onChange={handleProfileImageChange}
        disabled={uploadingImage}
      />

      <PhotographerLightPageFrame className="pb-16 pt-10 md:pb-20 md:pt-6">
        <div className="mx-auto max-w-[1120px]">
          <PhotographerLightPageHeader
            title="설정"
            description="고객에게 보이는 프로필과 새 프로젝트 기본값을 관리하세요."
            className="mb-6 md:mb-8"
            mobileDense
          />

          <div data-settings-layout className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-8">
            {/* 프로필 사진과 계정 식별 정보는 긴 폼에서 분리해 PC 스크롤 중에도 맥락을 유지한다. */}
            {/* 본문 카드(`SettingsPanel` 등)는 전부 `bg-surface`(흰색)라, 이 사이드바만 톤을
              * 낮춰(`bg-surface-raised`) 스크롤되는 본문과 다른 "고정된 패널"이라는 정체성을
              * 준다 — `xl:sticky`로 실제로 고정되는 동작과 색으로 짝을 맞춘다. */}
            <aside data-settings-profile-summary className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised xl:sticky xl:top-6">
              <div className="flex items-center gap-4 p-5 xl:flex-col xl:items-stretch xl:p-6">
                <div className="flex shrink-0 justify-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-[22px] ring-1 ring-inset ring-border-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 xl:h-24 xl:w-24 xl:rounded-[26px]"
                    aria-label="프로필 이미지 변경"
                  >
                    <div
                      className={`w-full h-full flex items-center justify-center ${
                        profile.profileImageUrl ? "bg-transparent" : "bg-accent"
                      }`}
                    >
                      {profile.profileImageUrl ? (
                        <img
                          src={getProfileImageUrl(profile.profileImageUrl)}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/brand/a-cut-mark.svg";
                          }}
                        />
                      ) : (
                        <img data-default-profile-image src="/brand/a-cut-mark.svg" alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    {/* hover 시에만 사진 위에 스크림 + "이미지 변경" 안내 — 평소엔 아무 배지도
                        없이 사진만 보이다가, hover하면 무엇을 클릭하는 건지 알려준다. */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
                      {uploadingImage ? (
                        <Loader2 size={16} className="animate-spin text-white" />
                      ) : (
                        <>
                          <Camera size={16} className="text-white" />
                          <span className="text-[10px] font-semibold text-white">이미지 변경</span>
                        </>
                      )}
                    </div>
                  </button>

                </div>

                <div className="min-w-0 flex-1 xl:text-center">
                    <h2 className="truncate text-[18px] font-bold leading-6 tracking-[-0.45px] text-foreground">
                      {profile.name || "이름 없음"}
                    </h2>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 xl:justify-center">
                      <Mail size={13} className="shrink-0 text-subtle-foreground" />
                      <span className="text-[13px] text-muted-foreground truncate">{profile.email ?? ""}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 xl:justify-center">
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent/8 px-2 py-0.5 text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/20">
                        <Check size={11} strokeWidth={2.5} aria-hidden />
                        Google 연결됨
                      </span>
                      {joinDate && (
                        <span className="text-[11px] text-disabled-foreground">{joinDate} 가입</span>
                      )}
                    </div>
                  </div>
                </div>
            </aside>

            <main className="flex min-w-0 flex-col gap-5 md:gap-6">
              <SettingsPanel>
                <SettingsSectionHeading
                  icon={UserRound}
                  title="프로필"
                  description="고객 갤러리와 공유 화면에 표시되는 정보를 관리합니다."
                />

                <div className="grid gap-5 p-4 md:grid-cols-2 md:gap-x-5 md:gap-y-6 md:p-6">
                  <ProjectFormField label="작가명 또는 스튜디오명">
                    <ProjectFormInput
                      className={SETTINGS_INPUT_CLASS}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="이름"
                    />
                  </ProjectFormField>

                  <ProjectFormField label="연락처" info="알림 연동 시 사용됩니다.">
                    <div className="relative">
                      <Phone size={16} className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-subtle-foreground md:left-5" aria-hidden />
                      <ProjectFormPhoneInput
                        className={`${SETTINGS_INPUT_CLASS} !pl-10 md:!pl-10`}
                        value={editPhone}
                        onChange={setEditPhone}
                      />
                    </div>
                  </ProjectFormField>

                  <ProjectFormField label="소개글" info="고객 갤러리 페이지에 표시됩니다." className="md:col-span-2">
                    <ProjectFormTextarea
                      className={`${SETTINGS_INPUT_CLASS} min-h-[96px] resize-none leading-relaxed`}
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      placeholder="촬영 스타일이나 스튜디오를 간단히 소개해 주세요."
                    />
                  </ProjectFormField>

                  <ProjectFormField label="인스타그램">
                    <div className="flex overflow-hidden rounded-lg border border-border-subtle bg-surface transition-colors focus-within:border-accent/50 md:rounded-xl">
                      <span className="flex shrink-0 items-center border-r border-border-subtle bg-surface-raised px-3 text-xs text-muted-foreground" aria-hidden>
                        <Instagram size={15} />
                      </span>
                      <span className="flex shrink-0 items-center pl-3 text-[13px] text-subtle-foreground">@</span>
                      <ProjectFormInput
                        className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[16px] text-foreground outline-none placeholder:text-placeholder-foreground"
                        value={editInstagram}
                        onChange={(e) => setEditInstagram(e.target.value)}
                        placeholder="계정명"
                      />
                    </div>
                  </ProjectFormField>

                  <ProjectFormField label="포트폴리오">
                    <div className="relative">
                      <Globe2 size={16} className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-subtle-foreground md:left-5" aria-hidden />
                      <ProjectFormInput
                        className={`${SETTINGS_INPUT_CLASS} !pl-10 md:!pl-10`}
                        value={editPortfolio}
                        onChange={(e) => setEditPortfolio(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </ProjectFormField>
                </div>

                <footer className="flex flex-col gap-3 border-t border-border-subtle bg-surface-raised/55 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                  <div className="min-h-[18px]">{formError ? <ProjectFormError>{formError}</ProjectFormError> : null}</div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                  <PhotographerLightButton
                    type="button"
                    variant="secondary"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    취소
                  </PhotographerLightButton>
                  <PhotographerLightButton
                    type="button"
                    variant="primary"
                    onClick={handleSave}
                    pending={saving}
                    pendingLabel="저장 중…"
                  >
                    변경사항 저장
                  </PhotographerLightButton>
                  </div>
                </footer>
              </SettingsPanel>

              <SettingsPanel>
                <SettingsSectionHeading
                  icon={SlidersHorizontal}
                  title="프로젝트 기본 설정"
                  description="새 프로젝트를 만들 때 자동으로 적용합니다. 기존 프로젝트에는 영향을 주지 않습니다."
                />
                <div className="divide-y divide-border-subtle">
                  <SettingsRow
                    icon={CalendarDays}
                    label="셀렉 마감 기본 기간"
                    description="고객에게 셀렉을 요청하는 날부터 계산합니다."
                  >
                    <label className="flex items-center gap-2">
                      <ProjectFormInput
                        aria-label="셀렉 마감 기본 기간"
                        className={`${SETTINGS_INPUT_CLASS} w-20 text-right md:w-24`}
                        type="text"
                        inputMode="numeric"
                        value={defaultDeadlineDays}
                        onChange={(event) => setDefaultDeadlineDays(event.target.value.replace(/[^0-9]/g, ""))}
                      />
                      <span className="text-sm font-semibold text-muted-foreground">일</span>
                    </label>
                  </SettingsRow>
                  <SettingsRow
                    label="원본 다운로드"
                    description="새 프로젝트에서 고객에게 납품용 원본을 전달할지 정합니다."
                  >
                    <PhotographerLightSwitch
                      checked={defaultIncludeOriginal}
                      onCheckedChange={setDefaultIncludeOriginal}
                      ariaLabel="새 프로젝트 원본 다운로드 허용"
                    />
                  </SettingsRow>
                  <div className="px-4 py-4 md:px-6 md:py-5">
                    <p className="text-[14px] font-semibold leading-5 text-foreground">고객 셀렉 시작 방식</p>
                    <p className="mt-1 text-[12px] leading-[18px] text-muted-foreground md:text-[13px] md:leading-5">원본을 포함하는 새 프로젝트의 업로드 순서와 초대 가능 시점을 정합니다.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="고객 셀렉 시작 방식">
                      {([
                        ["preview_first", "빠른 셀렉 요청", "셀렉용 사진을 먼저 준비하고 원본은 이어서 업로드해요."],
                        ["parallel", "원본까지 준비 후 요청", "셀렉용 사진과 원본을 함께 올리고 모두 준비되면 요청해요."],
                      ] as const).map(([value, label, description]) => {
                        const selected = defaultUploadStrategy === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setDefaultUploadStrategy(value)}
                            className={`rounded-xl border px-4 py-3 text-left transition-colors ${selected ? "border-accent bg-accent/5" : "border-border-subtle bg-surface hover:bg-surface-raised"}`}
                          >
                            <span className="block text-sm font-bold text-foreground">{label}</span>
                            <span className="mt-1 block break-keep text-xs leading-[18px] text-muted-foreground">{description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <footer className="flex flex-col gap-3 border-t border-border-subtle bg-surface-raised/55 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                  <div className="min-h-[18px]">{defaultsError ? <ProjectFormError>{defaultsError}</ProjectFormError> : null}</div>
                  <PhotographerLightButton
                    type="button"
                    variant="primary"
                    onClick={handleDefaultsSave}
                    pending={savingDefaults}
                    pendingLabel="저장 중…"
                  >
                    기본 설정 저장
                  </PhotographerLightButton>
                </footer>
              </SettingsPanel>

              <SettingsPanel>
                <SettingsSectionHeading
                  icon={Bell}
                  title="알림"
                  description="프로젝트에서 확인해야 할 변화를 놓치지 않도록 알려드립니다."
                  status="준비 중"
                />
                <div className="divide-y divide-border-subtle">
                  {[
                    { label: "고객 단계 완료", desc: "고객이 셀렉을 확정하거나 최종 승인하면 알려드려요." },
                    { label: "보정 요청 도착", desc: "새로운 수정 또는 재보정 요청이 등록되면 알려드려요." },
                    { label: "마감 임박", desc: "마감일 3일 전, 완료되지 않은 프로젝트를 알려드려요." },
                  ].map((item) => (
                    <SettingsRow key={item.label} label={item.label} description={item.desc}>
                      <PhotographerLightSwitch
                        checked={false}
                        onCheckedChange={() => showToast("준비 중인 기능입니다.")}
                        ariaLabel={item.label}
                      />
                    </SettingsRow>
                  ))}
                </div>
              </SettingsPanel>

              <SettingsPanel>
                <SettingsSectionHeading
                  icon={ShieldCheck}
                  title="계정"
                  description="로그인 상태와 계정 데이터를 관리합니다."
                />
                <div className="divide-y divide-border-subtle">
                <SettingsRow icon={LogOut} label="로그아웃" description="현재 로그인된 기기에서 A-CUT 사용을 종료합니다.">
                  <PhotographerLightButton type="button" variant="secondary" onClick={handleLogout}>
                    로그아웃
                  </PhotographerLightButton>
                </SettingsRow>
                <SettingsRow
                  icon={Trash2}
                  label="계정 삭제"
                  description="모든 프로젝트와 사진을 영구적으로 삭제합니다. 삭제 후에는 복구할 수 없습니다."
                  danger
                >
                  <PhotographerLightButton
                    type="button"
                    variant="danger"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    계정 삭제
                  </PhotographerLightButton>
                </SettingsRow>
                </div>
              </SettingsPanel>
            </main>
          </div>
        </div>
      </PhotographerLightPageFrame>

      <PhotographerConfirmDialog
        open={showDeleteModal}
        onClose={() => { if (!deletingAccount) setShowDeleteModal(false); }}
        onConfirm={handleDeleteAccount}
        title="계정을 삭제할까요?"
        description="계정 삭제 후에는 복구할 수 없습니다."
        detail="모든 프로젝트, 원본 사진, 셀렉 기록과 보정본이 영구적으로 삭제됩니다."
        confirmLabel="계정 삭제"
        pendingLabel="삭제 중…"
        pending={deletingAccount}
        tone="danger"
      />

      {/* 토스트 */}
      <div className="fixed bottom-6 right-4 md:right-8 z-[210] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg flex items-start gap-3 ${
              t.isError
                ? "bg-surface border-danger/40 text-danger"
                : "bg-surface border-border-strong text-foreground border-l-[3px] border-l-accent"
            }`}
          >
            <span className={`text-[10px] font-semibold shrink-0 mt-0.5 ${t.isError ? "text-danger" : "text-accent"}`}>
              {t.isError ? "오류" : "완료"}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
