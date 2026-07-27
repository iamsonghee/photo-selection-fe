"use client";

/**
 * Supabase SQL Editor에서 아래 SQL을 실행해주세요:
 *
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS shoot_type text;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_phone text;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS photo_count_expected int4;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS location text;
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, RefreshCw, AlertCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { addDays, format } from "date-fns";
import { useProfile } from "@/contexts/ProfileContext";
import { parseBetaLimitError } from "@/lib/beta-limits";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";

const QUICK_DAYS = [3, 5, 7, 14, 30];

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return String(e) || "프로젝트 생성에 실패했습니다.";
}

// ── Field wrapper ──────────────────────────────────────────
function Field({ label, hint, required, children }: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-semibold text-muted-foreground">{label}</label>
        {required && <span className="text-[10px] text-accent font-medium">필수</span>}
        {hint && <span className="text-[10px] text-disabled-foreground ml-auto">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────
function StepDots({ current }: { current: number }) {
  const steps = ["프로젝트 만들기", "사진 업로드", "링크 공유"];
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors"
              style={{
                background: i === current ? "var(--accent)" : "transparent",
                color: i === current ? "#000" : i < current ? "var(--foreground)" : "var(--border-strong)",
                borderColor: i === current ? "var(--accent)" : i < current ? "var(--border-strong)" : "var(--border)",
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className="text-xs font-medium hidden sm:block"
              style={{ color: i === current ? "var(--foreground)" : "var(--border-strong)" }}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-8 sm:w-16 h-px mx-2 sm:mx-3" style={{ background: i < current ? "var(--border-strong)" : "var(--border)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const { profile } = useProfile();

  const [shootType,     setShootType]     = useState<string | null>(null);
  const [name,          setName]          = useState("");
  const [shootDate,     setShootDate]     = useState("");
  const [customerName,  setCustomerName]  = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [requiredCount, setRequiredCount] = useState("");
  const [quickDays,     setQuickDays]     = useState<number | null>(7);
  const [deadline,      setDeadline]      = useState<string>(() =>
    format(addDays(new Date(), 7), "yyyy-MM-dd")
  );
  const [location,      setLocation]      = useState("");
  const [accessPin,     setAccessPin]     = useState("");
  const [maxRevisionCount, setMaxRevisionCount] = useState<0 | 1 | 2>(2);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({});
  const [quota, setQuota] = useState<{
    tier: "admin" | "beta" | "general";
    current: number;
    max: number | null;
    betaStatus: "not_invited" | "active" | "ended" | "suspended";
  } | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const [quotaRetryTick, setQuotaRetryTick] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setQuotaError(false);
    (async () => {
      try {
        const res = await fetch("/api/photographer/quota");
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setQuota(data);
        else setQuotaError(true);
      } catch {
        // 조회 실패 시 "무제한"으로 잘못 간주하지 않는다 — 서버가 최종 검증하긴 하지만,
        // 이미 한도를 다 쓴 사용자가 폼을 전부 채운 뒤에야 막히는 걸 방지하기 위해 명시적 에러 상태로 남긴다.
        if (!cancelled) setQuotaError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, quotaRetryTick]);

  const handleQuickDays = (days: number) => {
    setQuickDays(days);
    const base = shootDate ? new Date(shootDate) : new Date();
    setDeadline(format(addDays(base, days), "yyyy-MM-dd"));
  };

  const handleDeadlineInput = (val: string) => {
    setDeadline(val);
    setQuickDays(null);
  };

const isValid =
    name.trim() !== "" &&
    shootDate !== "" &&
    customerName.trim() !== "" &&
    Number(requiredCount) >= 1 &&
    deadline !== "";

  const handleSubmit = async () => {
    if (submitting) return;

    // 필드별 검증
    const errors: Record<string, string> = {};
    if (!name.trim())              errors.name          = "프로젝트명을 입력해주세요.";
    if (!shootDate)                errors.shootDate     = "촬영 일자를 선택해주세요.";
    if (!customerName.trim())      errors.customerName  = "고객 이름을 입력해주세요.";
    if (Number(requiredCount) < 1) errors.requiredCount = "셀렉 갯수를 1 이상으로 입력해주세요.";
    if (!deadline)                 errors.deadline      = "셀렉 기한을 선택해주세요.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setFieldErrors({});
    setError(null);
    setSubmitting(true);
    try {
      if (!profile?.id) throw new Error("로그인이 필요합니다.");
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
          include_original: includeOriginal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const betaErr = parseBetaLimitError(data);
        if (betaErr) throw new Error(betaErr.message);
        throw new Error((data as { error?: string }).error ?? "프로젝트 생성에 실패했습니다.");
      }
      router.push(`/photographer/projects/${data.id}`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // 한도 확인 실패 — "무제한"으로 잘못 간주해 폼을 열어주지 않는다(폼을 다 채운 뒤에야 막히는 UX 방지)
  if (quotaError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">이용 한도를 확인하지 못했습니다. 네트워크 상태를 확인해주세요.</p>
          <button
            type="button"
            onClick={() => setQuotaRetryTick((t) => t + 1)}
            className="px-5 py-2 bg-surface border border-border-subtle text-foreground text-sm font-semibold rounded-xl hover:border-accent/40 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 로딩 중 — 한도 확인 전에는 폼을 렌더하지 않음
  if (quota === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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
    const desc = quota.tier === "beta"
      ? <>베타 기간 중 최대 {quota.max}개의 프로젝트를 생성할 수 있습니다.<br />현재 <strong className="text-foreground">{quota.current} / {quota.max}개</strong> 사용 중입니다.</>
      : wasBetaBeforeGeneral
        ? <>베타 이용 기간이 종료되었습니다.<br />기존 프로젝트는 계속 이용하실 수 있습니다.</>
        : <>무료 체험에서는 프로젝트 {quota.max}개까지 생성할 수 있습니다.<br />더 이용하시려면 베타 참여를 문의해주세요.</>;
    return (
      <div
        className="min-h-screen bg-background text-foreground"
        style={{ fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}
      >
        <PhotographerPageHeader
          crumbs={[
            { label: "프로젝트", href: "/photographer/projects" },
            { label: "새 프로젝트" },
          ]}
          title="새 프로젝트 만들기"
        />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertCircle size={28} color="#ef4444" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground mb-2">{heading}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/photographer/projects")}
            className="px-6 py-2.5 bg-accent text-black text-sm font-bold rounded-xl hover:bg-[#ff5e1a] transition-colors"
          >
            프로젝트 목록으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}
      onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
    >
      <style>{`
        .np-input {
          width: 100%; background: var(--background); border: 1px solid var(--border);
          color: var(--foreground); padding: 12px 16px; font-size: 14px; outline: none;
          border-radius: 12px; transition: border-color 0.2s; box-sizing: border-box;
          font-family: inherit;
        }
        .np-input:focus { border-color: rgba(var(--accent-rgb),0.5); }
        .np-input::placeholder { color: var(--placeholder-foreground); }
        .np-input::-webkit-calendar-picker-indicator { filter: invert(0.4); cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── 헤더 ── */}
      <PhotographerPageHeader
        crumbs={[
          { label: "프로젝트", href: "/photographer/projects" },
          { label: "새 프로젝트" },
        ]}
        title="새 프로젝트 만들기"
        actions={<StepDots current={0} />}
      />

      {/* ── 메인 ── */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-20">

        {/* 한도 임박 (잔여 1개) */}
        {quota.max !== null && quota.current === quota.max - 1 && (
          <div className="flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-2.5 mb-4">
            <AlertTriangle size={13} color="#eab308" />
            <span className="text-xs text-yellow-500/80">
              잔여 1개 · {quota.tier === "beta" ? "베타 기간 중" : "무료 체험은"} 최대 {quota.max}개까지 생성 가능합니다.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-5">

            {/* ── 폼 카드 ── */}
            <div className="bg-surface border border-surface-raised rounded-2xl p-6 flex flex-col gap-6">

              {/* 촬영 유형 */}
              <Field label="촬영 유형" hint="선택사항">
                <div className="flex gap-2 flex-wrap">
                  {SHOOT_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setShootType(shootType === value ? null : value)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors"
                      style={{
                        background: shootType === value ? "rgba(var(--accent-rgb),0.08)" : "transparent",
                        borderColor: shootType === value ? "rgba(var(--accent-rgb),0.5)" : "var(--border)",
                        color: shootType === value ? "var(--accent)" : "var(--subtle-foreground)",
                      }}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* 프로젝트명 */}
              <div id="field-name">
                <Field label="프로젝트명" required>
                  <input
                    className="np-input"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setFieldErrors((p) => ({ ...p, name: "" })); }}
                    placeholder="예: 2024 김민수님 스튜디오 촬영"
                    style={{ borderColor: fieldErrors.name ? "rgba(239,68,68,0.7)" : name ? "rgba(var(--accent-rgb),0.3)" : undefined }}
                  />
                </Field>
                {fieldErrors.name && <p className="text-xs text-red-400 mt-1 ml-0.5">{fieldErrors.name}</p>}
              </div>

              {/* 2열: 촬영일자 + 고객이름 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div id="field-shootDate">
                  <Field label="촬영 일자" required>
                    <input
                      className="np-input"
                      type="date"
                      value={shootDate}
                      onChange={(e) => {
                        setShootDate(e.target.value);
                        setFieldErrors((p) => ({ ...p, shootDate: "" }));
                        if (quickDays && e.target.value) {
                          setDeadline(format(addDays(new Date(e.target.value), quickDays), "yyyy-MM-dd"));
                        }
                      }}
                      onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                      style={{ borderColor: fieldErrors.shootDate ? "rgba(239,68,68,0.7)" : shootDate ? "rgba(var(--accent-rgb),0.3)" : undefined }}
                    />
                  </Field>
                  {fieldErrors.shootDate && <p className="text-xs text-red-400 mt-1 ml-0.5">{fieldErrors.shootDate}</p>}
                </div>
                <div id="field-customerName">
                  <Field label="고객 이름" required>
                    <input
                      className="np-input"
                      value={customerName}
                      onChange={(e) => { setCustomerName(e.target.value); setFieldErrors((p) => ({ ...p, customerName: "" })); }}
                      placeholder="고객님 성함"
                      style={{ borderColor: fieldErrors.customerName ? "rgba(239,68,68,0.7)" : customerName ? "rgba(var(--accent-rgb),0.3)" : undefined }}
                    />
                  </Field>
                  {fieldErrors.customerName && <p className="text-xs text-red-400 mt-1 ml-0.5">{fieldErrors.customerName}</p>}
                </div>
              </div>

              {/* 2열: 연락처 + 셀렉 갯수 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="연락처" hint="선택사항">
                  <input
                    className="np-input"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(formatPhone(e.target.value))}
                    placeholder="010-0000-0000"
                    inputMode="numeric"
                  />
                  <span className="text-[10px] text-disabled-foreground">알림 기능 연동 시 사용됩니다</span>
                </Field>
                <div id="field-requiredCount">
                  <Field label="셀렉 갯수 (N)" required>
                    <div className="flex items-center gap-2">
                      <input
                        className="np-input text-right flex-1"
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
                        placeholder="5"
                        style={{ borderColor: fieldErrors.requiredCount ? "rgba(239,68,68,0.7)" : requiredCount ? "rgba(var(--accent-rgb),0.3)" : undefined }}
                      />
                      <span className="text-sm text-subtle-foreground shrink-0">장</span>
                    </div>
                    <span className="text-[10px] text-disabled-foreground">고객이 선택할 사진 수</span>
                  </Field>
                  {fieldErrors.requiredCount && <p className="text-xs text-red-400 mt-1 ml-0.5">{fieldErrors.requiredCount}</p>}
                </div>
              </div>

              {/* 촬영 장소 */}
              <Field label="촬영 장소" hint="선택사항">
                <input
                  className="np-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="예: 서울 강남 스튜디오, 한강공원 잠원지구 등"
                />
              </Field>
            </div>

            {/* ── 셀렉 기한 카드 ── */}
            <div className="bg-surface border border-surface-raised rounded-2xl p-6 flex flex-col gap-4">
              <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                셀렉 기한
                <span className="text-[10px] text-accent font-medium">필수</span>
              </div>

              {/* 빠른 선택 */}
              <div className="flex gap-2 flex-wrap">
                {QUICK_DAYS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handleQuickDays(days)}
                    className="px-3 py-2 rounded-xl text-xs font-medium border transition-colors"
                    style={{
                      background: quickDays === days ? "rgba(var(--accent-rgb),0.08)" : "transparent",
                      borderColor: quickDays === days ? "rgba(var(--accent-rgb),0.5)" : "var(--border)",
                      color: quickDays === days ? "var(--accent)" : "var(--subtle-foreground)",
                    }}
                  >
                    +{days}일
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setQuickDays(null)}
                  className="px-3 py-2 rounded-xl text-xs font-medium border transition-colors"
                  style={{
                    background: quickDays === null ? "rgba(var(--accent-rgb),0.08)" : "transparent",
                    borderColor: quickDays === null ? "rgba(var(--accent-rgb),0.5)" : "var(--border)",
                    color: quickDays === null ? "var(--accent)" : "var(--subtle-foreground)",
                  }}
                >
                  직접 입력
                </button>
              </div>

              <div id="field-deadline">
                <input
                  className="np-input"
                  type="date"
                  value={deadline}
                  onChange={(e) => { handleDeadlineInput(e.target.value); setFieldErrors((p) => ({ ...p, deadline: "" })); }}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  style={{ borderColor: fieldErrors.deadline ? "rgba(239,68,68,0.7)" : deadline ? "rgba(var(--accent-rgb),0.3)" : undefined }}
                />
                {fieldErrors.deadline && <p className="text-xs text-red-400 mt-1 ml-0.5">{fieldErrors.deadline}</p>}
              </div>

            </div>

            {/* ── 보안 설정 카드 ── */}
            <div className="bg-surface border border-surface-raised rounded-2xl p-6 flex flex-col gap-6">

              {/* PIN */}
              <Field label="고객 비밀번호 (PIN)" hint="선택사항">
                <div className="flex items-center gap-3 flex-wrap">
                  <Lock size={13} className="text-disabled-foreground shrink-0" />
                  <input
                    className="np-input w-28 text-center tracking-widest text-lg font-bold"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]*"
                    value={accessPin}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setAccessPin(v);
                    }}
                    placeholder="0000"
                  />
                  <button
                    type="button"
                    onClick={() => setAccessPin(Math.floor(1000 + Math.random() * 9000).toString())}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs text-subtle-foreground border border-border hover:border-border-strong hover:text-muted-foreground rounded-xl transition-colors"
                  >
                    <RefreshCw size={11} /> 랜덤
                  </button>
                  {accessPin && (
                    <button
                      type="button"
                      onClick={() => setAccessPin("")}
                      className="text-xs text-disabled-foreground hover:text-muted-foreground transition-colors"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-disabled-foreground">설정 시 고객이 링크 접속 시 비밀번호를 입력해야 합니다</span>
              </Field>

              {/* 재보정 */}
              <Field label="재보정 허용 횟수">
                <div className="flex gap-2">
                  {([
                    { value: 0, label: "없음",  desc: "보정 후 바로 납품" },
                    { value: 1, label: "1회",   desc: "재보정 1회 허용" },
                    { value: 2, label: "2회",   desc: "재보정 최대 2회" },
                  ] as const).map(({ value, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMaxRevisionCount(value)}
                      className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors"
                      style={{
                        background: maxRevisionCount === value ? "rgba(var(--accent-rgb),0.08)" : "transparent",
                        borderColor: maxRevisionCount === value ? "rgba(var(--accent-rgb),0.5)" : "var(--border)",
                        color: maxRevisionCount === value ? "var(--accent)" : "var(--subtle-foreground)",
                      }}
                    >
                      {label}
                      <span className="text-[10px] font-normal" style={{ color: maxRevisionCount === value ? "rgba(var(--accent-rgb),0.6)" : "var(--border-strong)" }}>{desc}</span>
                    </button>
                  ))}
                </div>
              </Field>

              {/* 납품 원본 */}
              <Field label="납품 파일">
                <div className="flex gap-2">
                  {([
                    { value: false, label: "원본 없이", desc: "셀렉용 이미지만 업로드" },
                    { value: true,  label: "원본 포함", desc: "납품용 원본 파일 함께 업로드" },
                  ] as const).map(({ value, label, desc }) => (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => setIncludeOriginal(value)}
                      className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors"
                      style={{
                        background: includeOriginal === value ? "rgba(var(--accent-rgb),0.08)" : "transparent",
                        borderColor: includeOriginal === value ? "rgba(var(--accent-rgb),0.5)" : "var(--border)",
                        color: includeOriginal === value ? "var(--accent)" : "var(--subtle-foreground)",
                      }}
                    >
                      {label}
                      <span className="text-[10px] font-normal" style={{ color: includeOriginal === value ? "rgba(var(--accent-rgb),0.6)" : "var(--border-strong)" }}>{desc}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* 에러 */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={14} color="#ef4444" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="flex items-center justify-end gap-4 pt-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 bg-accent hover:bg-[#ff5e1a] disabled:opacity-40 disabled:cursor-not-allowed text-black px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none"
              >
                {submitting ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> 생성 중...</>
                ) : (
                  <>생성완료</>
                )}
              </button>
            </div>
          </div>
      </main>
    </div>
  );
}
