"use client";

/**
 * Supabase SQL Editor에서 아래 SQL을 실행해주세요:
 *
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS shoot_type text;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_phone text;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS photo_count_expected int4;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS location text;
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { addDays, format } from "date-fns";
import { useProfile } from "@/contexts/ProfileContext";
import { useQuota } from "@/contexts/QuotaContext";
import { parseBetaLimitError } from "@/lib/beta-limits";
import { BetaApprovalBanner } from "@/components/photographer/BetaApprovalBanner";
import { isValidKoreanPhone } from "@/lib/phone";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import themeStyles from "./NewProjectTheme.module.css";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerFormActionBar } from "@/components/photographer/PhotographerFormActionBar";
import {
  PROJECT_FORM_INPUT_CLASS,
  ProjectFormDateInput,
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

// 셀렉 기한은 이 페이지에서 더 이상 입력받지 않는다 — 원본 업로드 후 고객 초대 시점에 별도로 정하며,
// 그 전까지는 촬영일 기준 기본값(+7일)을 자동으로 채워 기존 기능(마감일 임박순 정렬, D-day 배지 등)이
// 계속 동작하도록 한다.
const DEFAULT_DEADLINE_DAYS = 7;

function getErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return String(e) || "프로젝트 생성에 실패했습니다.";
}

export default function NewProjectPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();

  // 이 페이지에서 도달 가능한 모든 분기(빈 상태/한도초과/폼)의 공통 뒤로가기 대상을 미리 prefetch.
  useEffect(() => {
    router.prefetch("/photographer/projects");
  }, [router]);

  const [shootType,     setShootType]     = useState<string | null>(null);
  const [name,          setName]          = useState("");
  const [shootDate,     setShootDate]     = useState("");
  const [customerName,  setCustomerName]  = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [requiredCount, setRequiredCount] = useState("");
  const [deadline,      setDeadline]      = useState<string>(() =>
    format(addDays(new Date(), DEFAULT_DEADLINE_DAYS), "yyyy-MM-dd")
  );
  const [location,      setLocation]      = useState("");
  const [accessPin,     setAccessPin]     = useState("");
  const [maxRevisionCount, setMaxRevisionCount] = useState<0 | 1 | 2>(2);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitAction,  setSubmitAction]  = useState<"later" | "upload" | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({});
  const defaultsAppliedRef = useRef(false);
  const { quota, loading: quotaLoading, error: quotaError, refetch: refetchQuota } = useQuota();

  // atLimit 게이트는 실제 생성을 막는 비즈니스 룰이라, 세션 공유 캐시에 기대지 않고 이 페이지를
  // 방문할 때마다 최신 값으로 다시 확인한다(서버도 POST 시점에 최종 검증하지만, 폼을 다 채운
  // 뒤에야 막히는 UX를 피하기 위한 선제 확인).
  useEffect(() => {
    refetchQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile || defaultsAppliedRef.current) return;
    defaultsAppliedRef.current = true;
    setIncludeOriginal(profile.defaultIncludeOriginal);
    if (profile.defaultSelectionDeadlineDays !== null) {
      setDeadline(format(addDays(new Date(), profile.defaultSelectionDeadlineDays), "yyyy-MM-dd"));
    }
  }, [profile]);

  const handleSubmit = async (goToUpload: boolean) => {
    if (submitting || profileLoading) return;

    // 필드별 검증
    const errors: Record<string, string> = {};
    if (!name.trim())              errors.name          = "프로젝트명을 입력해주세요.";
    if (!shootDate)                errors.shootDate     = "촬영 일자를 선택해주세요.";
    if (!customerName.trim())      errors.customerName  = "고객 이름을 입력해주세요.";
    if (Number(requiredCount) < 1) errors.requiredCount = "셀렉 갯수를 1 이상으로 입력해주세요.";
    if (customerPhone.trim() && !isValidKoreanPhone(customerPhone))
      errors.customerPhone = "연락처는 010-0000-0000 형식으로 입력해주세요.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      requestAnimationFrame(() => {
        const field = document.getElementById(`field-${firstKey}`);
        field?.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    setFieldErrors({});
    setError(null);
    setSubmitting(true);
    setSubmitAction(goToUpload ? "upload" : "later");
    try {
      if (!profile?.id) throw new Error("로그인이 필요합니다.");
      // 생성 후 이동 위치와 원본 다운로드 설정은 독립적으로 유지한다.
      const finalIncludeOriginal = includeOriginal;
      const res = await fetch("/api/photographer/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          customer_name: customerName.trim(),
          shoot_date: shootDate,
          deadline,
          required_count: Number(requiredCount),
          shoot_type: shootType || null,
          customer_phone: customerPhone.trim() || null,
          access_pin: accessPin || null,
          max_revision_count: maxRevisionCount,
          location: location.trim() || null,
          include_original: finalIncludeOriginal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const betaErr = parseBetaLimitError(data);
        if (betaErr) throw new Error(betaErr.message);
        throw new Error((data as { error?: string }).error ?? "프로젝트 생성에 실패했습니다.");
      }
      refetchQuota();
      router.push(goToUpload ? `/photographer/projects/${data.id}/upload` : `/photographer/projects/${data.id}`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
      setSubmitAction(null);
    }
  };

  // 한도 확인 실패 — "무제한"으로 잘못 간주해 폼을 열어주지 않는다(폼을 다 채운 뒤에야 막히는 UX 방지)
  if (quotaError) {
    return (
      <div className={`${themeStyles.lightTheme} min-h-screen bg-background flex items-center justify-center px-4`}>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">이용 한도를 확인하지 못했습니다. 네트워크 상태를 확인해주세요.</p>
          <button
            type="button"
            onClick={() => refetchQuota()}
            className="px-5 py-2 bg-surface border border-border-subtle text-foreground text-sm font-semibold rounded-xl hover:border-accent/40 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 로딩 중 — 한도 확인 전에는 폼을 렌더하지 않음
  if (quotaLoading || quota === null) {
    return (
      <div className={`${themeStyles.lightTheme} min-h-screen bg-background flex items-center justify-center`}>
        <div className="w-6 h-6 rounded-full border-2 border-accent/20 border-t-accent" style={{ animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const atLimit = quota.max !== null && quota.current >= quota.max;
  const wasBetaBeforeGeneral = quota.betaStatus === "ended" || quota.betaStatus === "suspended";

  // 한도 초과 — 폼 대신 안내 화면 바로 표시(서버도 동일하게 검증하지만, 폼을 채우기 전에 미리 안내)
  if (atLimit) {
    const heading = quota.tier === "beta" ? "베타 프로젝트 한도 도달" : wasBetaBeforeGeneral ? "베타 이용 기간 종료" : "무료 체험 한도 도달";
    const canApply = quota.tier === "general"
      && !wasBetaBeforeGeneral
      && quota.betaApplicationStatus === null;
    const desc = quota.tier === "beta"
      ? <>베타 기간 중 최대 {quota.max}개의 프로젝트를 생성할 수 있습니다.<br />현재 <strong className="text-foreground">{quota.current} / {quota.max}개</strong> 사용 중입니다.</>
      : wasBetaBeforeGeneral
        ? <>베타 이용 기간이 종료되었습니다.<br />기존 프로젝트는 계속 이용하실 수 있습니다.</>
        : <>무료 체험에서는 프로젝트 {quota.max}개까지 생성할 수 있습니다.<br />현재 <strong className="text-foreground">{quota.current} / {quota.max}개</strong> 사용 중입니다.</>;
    return (
      <div
        className={`${themeStyles.lightTheme} min-h-screen bg-background text-foreground`}
        style={{ fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}
      >
        <PhotographerLightPageFrame className="pb-16">
          <div className="max-w-[840px] mx-auto">
            <ProjectFormPageHeading
              title="새 프로젝트 만들기"
              description="프로젝트 기본 정보와 고객 갤러리 이용 조건을 설정해 주세요."
              onBack={() => router.push("/photographer/projects")}
            />
          </div>
        </PhotographerLightPageFrame>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center text-center gap-6">
          <div
            className="w-16 h-16 rounded-2xl border flex items-center justify-center"
            style={{ background: "rgba(220,46,47,0.08)", borderColor: "rgba(220,46,47,0.2)" }}
          >
            <AlertCircle size={28} color="var(--danger)" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground mb-2">{heading}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
          {quota.betaApplicationStatus !== null && quota.betaApplicationStatus !== "rejected" ? (
            <BetaApprovalBanner
              tier={quota.tier}
              betaApplicationStatus={quota.betaApplicationStatus}
              maxProjects={quota.max ?? 0}
              maxPhotosPerProject={quota.maxPhotosPerProject ?? 0}
            />
          ) : quota.betaApplicationStatus === "rejected" ? (
            <p className="text-sm text-muted-foreground">베타 신청 결과는 안내받은 내용을 확인해 주세요.</p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            <PhotographerLightButton
              type="button"
              variant={canApply ? "secondary" : "primary"}
              onClick={() => router.push("/photographer/projects")}
            >
              프로젝트 목록으로
            </PhotographerLightButton>
            {canApply ? (
              <PhotographerLightButton
                type="button"
                variant="primary"
                onClick={() => router.push("/beta/apply")}
              >
                베타 참여 신청하기
              </PhotographerLightButton>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${themeStyles.lightTheme} min-h-screen bg-background text-foreground`}
      style={{ fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}
      onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── 메인 ── */}
      {/* 페이지 시작 좌표는 Dashboard/Project List와 동일한 PhotographerLightPageFrame(좌우 32px,
          상단 24px)을 그대로 재사용한다. 실제 폼은 Figma #56054 카드 폭(1120px)의 80% 비율로
          좁혀 중앙에 배치한다(다크 테마 때 이미 승인된 폭 — 테마만 바뀌므로 그대로 유지). */}
      <PhotographerLightPageFrame className="pb-8">
        <div className="max-w-[840px] mx-auto">

        <ProjectFormPageHeading
          title="새 프로젝트 만들기"
          description="프로젝트 기본 정보와 고객 갤러리 이용 조건을 설정해 주세요."
          onBack={() => router.push("/photographer/projects")}
        />

        {quota.tier === "general" &&
          quota.betaApplicationStatus !== null &&
          quota.betaApplicationStatus !== "rejected" && (
            <div className="mb-4">
              <BetaApprovalBanner
                tier={quota.tier}
                betaApplicationStatus={quota.betaApplicationStatus}
                maxProjects={quota.max ?? 0}
                maxPhotosPerProject={quota.maxPhotosPerProject ?? 0}
                variant="compact"
              />
            </div>
          )}

        {/* 한도 임박 (잔여 1개) — design-system-light.md §2.1 --warning(#FAC005) 토큰 */}
        {quota.max !== null && quota.current === quota.max - 1 && (
          <div
            className="flex items-center gap-2 border rounded-xl px-4 py-2.5 mb-4"
            style={{ background: "rgba(250,192,5,0.08)", borderColor: "rgba(250,192,5,0.25)" }}
          >
            <AlertTriangle size={13} color="var(--warning)" />
            <span className="text-xs" style={{ color: "var(--warning)" }}>
              <span className="md:hidden">프로젝트를 1개 더 만들 수 있어요.</span>
              <span className="hidden md:inline">잔여 1개 · {quota.tier === "beta" ? "베타 기간 중" : "무료 체험은"} 최대 {quota.max}개까지 생성 가능합니다.</span>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-5">
            <ProjectFormSection
              number="01"
              title="기본 정보"
              description="프로젝트를 구분하고 고객에게 안내할 정보를 입력해 주세요."
            >

              {/* 프로젝트명 */}
              <div id="field-name">
                <ProjectFormField error={fieldErrors.name} label="프로젝트명" required>
                  <ProjectFormInput
                    className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(name), error: Boolean(fieldErrors.name) })}`}
                    value={name}
                    onChange={(e) => { setName(e.target.value); setFieldErrors((p) => ({ ...p, name: "" })); }}
                    placeholder="예: 2024 김민수님 스튜디오 촬영"
                  />
                </ProjectFormField>
              </div>

              <ProjectFormField group label="촬영 유형">
                <ProjectShootTypeSelector value={shootType} onChange={setShootType} />
              </ProjectFormField>

              {/* 2열: 고객이름 + 촬영일자 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div id="field-customerName">
                  <ProjectFormField error={fieldErrors.customerName} label="고객 이름" required>
                    <ProjectFormInput
                      className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(customerName), error: Boolean(fieldErrors.customerName) })}`}
                      value={customerName}
                      onChange={(e) => { setCustomerName(e.target.value); setFieldErrors((p) => ({ ...p, customerName: "" })); }}
                      placeholder="예: 김민수"
                    />
                  </ProjectFormField>
                </div>
                <div id="field-shootDate">
                  <ProjectFormField error={fieldErrors.shootDate} label="촬영 일자" required>
                    <ProjectFormDateInput
                      className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(shootDate), error: Boolean(fieldErrors.shootDate) })}`}
                      value={shootDate}
                      onChange={(e) => {
                        setShootDate(e.target.value);
                        setFieldErrors((p) => ({ ...p, shootDate: "" }));
                        // 셀렉 기한 입력 UI는 제거됐지만, 촬영일 기준 기본값(+7일)은 계속 자동으로 맞춰둔다.
                        if (e.target.value) {
                          setDeadline(format(addDays(new Date(e.target.value), DEFAULT_DEADLINE_DAYS), "yyyy-MM-dd"));
                        }
                      }}
                      onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                    />
                  </ProjectFormField>
                </div>
              </div>

              {/* 2열: 연락처 + 촬영장소 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div id="field-customerPhone">
                  <ProjectFormField error={fieldErrors.customerPhone} label="연락처" info="알림 기능 연동 시 사용됩니다">
                    <ProjectFormPhoneInput
                      className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(customerPhone), error: Boolean(fieldErrors.customerPhone) })}`}
                      value={customerPhone}
                      onChange={(v) => { setCustomerPhone(v); setFieldErrors((p) => ({ ...p, customerPhone: "" })); }}
                    />
                  </ProjectFormField>
                </div>
                <ProjectFormField label="촬영 장소">
                  <ProjectFormInput
                    className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(location) })}`}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="예: 강남 스튜디오"
                  />
                </ProjectFormField>
              </div>
            </ProjectFormSection>

            <ProjectFormSection
              number="02"
              title="고객 갤러리 설정"
              description="고객이 사진을 선택하고 요청을 남길 수 있는 범위와 접속 방식을 설정해 주세요."
            >

              {/* 2열: 셀렉 갯수 + 재보정 요청 횟수 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div id="field-requiredCount">
                  <ProjectFormField error={fieldErrors.requiredCount} label="셀렉 갯수" required>
                    <div className="relative">
                      {/* pr-12만 있으면 md:px-5(공용 클래스)가 데스크톱에서 이 padding-right를
                        * 20px로 덮어써 "장" 자리에 숫자가 겹친다 — md:pr-12로 같은 브레이크포인트에서
                        * 명시해야 이긴다(수정 화면의 같은 필드가 이미 이 형태). */}
                      <ProjectFormInput
                        className={`${PROJECT_FORM_INPUT_CLASS} pr-12 md:pr-12 text-right ${projectFormInputStateClass({ hasValue: Boolean(requiredCount), error: Boolean(fieldErrors.requiredCount) })}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min={1}
                        value={requiredCount}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          setRequiredCount(v);
                          setFieldErrors((p) => ({ ...p, requiredCount: "" }));
                        }}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-sm text-subtle-foreground">
                        장
                      </span>
                    </div>
                    <span className="hidden text-[10px] text-disabled-foreground md:inline">고객이 선택할 사진 수</span>
                  </ProjectFormField>
                </div>

                <ProjectFormField group label="재보정 요청 횟수" required>
                  <ProjectRevisionSelector value={maxRevisionCount} onChange={setMaxRevisionCount} />
                </ProjectFormField>
              </div>

              <ProjectFormToggleRow
                label="원본 다운로드 허용"
                description="고객이 셀렉 갤러리에서 원본 사진을 내려받을 수 있도록 허용해요"
                checked={includeOriginal}
                onCheckedChange={setIncludeOriginal}
                ariaLabel="원본 다운로드 허용"
              />

              <ProjectPinControl value={accessPin} onChange={setAccessPin} />
            </ProjectFormSection>



          </div>
        </div>
      </PhotographerLightPageFrame>

      {/* 액션 — Figma #56054: 하단 고정 바. 폼 카드 폭(840px) 안에서만 스크롤되지 않고, 화면
          가로 전체 폭에 구분선+배경을 깔아 항상 보이게 고정한다(카드 내부 인라인 배치였던 것을
          정정). 내부 컨텐츠는 위 폼과 동일하게 좌우 32px 프레임 + 840px 중앙 정렬을 그대로 재사용. */}
      <PhotographerFormActionBar
        maxWidth={840}
        error={error}
        leading={(
          <div>
              <p className="text-sm font-bold text-foreground">프로젝트를 만든 후 원본을 바로 올릴까요?</p>
              <p className="text-xs text-muted-foreground mt-1">원본은 나중에 프로젝트에서도 올릴 수 있어요.</p>
          </div>
        )}
        actions={(
          <>
              <PhotographerLightButton
                type="button"
                variant="secondary"
                onClick={() => handleSubmit(false)}
                pending={submitting && submitAction === "later"}
                pendingLabel="생성 중…"
                disabled={submitting || profileLoading}
              >
                나중에 올리기
              </PhotographerLightButton>
              <PhotographerLightButton
                type="button"
                variant="primary"
                onClick={() => handleSubmit(true)}
                pending={submitting && submitAction === "upload"}
                pendingLabel="생성 중…"
                disabled={submitting || profileLoading}
              >
                원본 올리기
              </PhotographerLightButton>
          </>
        )}
      />
    </div>
  );
}
