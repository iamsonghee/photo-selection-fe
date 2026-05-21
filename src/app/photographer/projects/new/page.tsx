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
import { createProject, getProjectsByPhotographerId } from "@/lib/db";
import { useProfile } from "@/contexts/ProfileContext";
import { BETA_MAX_PROJECTS_TOTAL } from "@/lib/beta-limits";
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
        <label className="text-sm font-semibold text-zinc-300">{label}</label>
        {required && <span className="text-[10px] text-[#FF4D00] font-medium">필수</span>}
        {hint && <span className="text-[10px] text-zinc-600 ml-auto">{hint}</span>}
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
                background: i === current ? "#FF4D00" : "transparent",
                color: i === current ? "#000" : i < current ? "#fff" : "#3f3f46",
                borderColor: i === current ? "#FF4D00" : i < current ? "#52525b" : "#27272c",
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className="text-xs font-medium hidden sm:block"
              style={{ color: i === current ? "#fff" : "#52525b" }}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-8 sm:w-16 h-px mx-2 sm:mx-3" style={{ background: i < current ? "#52525b" : "#27272c" }} />
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
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({});
  const [projectCount,  setProjectCount]  = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const projects = await getProjectsByPhotographerId(profile.id);
        if (!cancelled) setProjectCount(projects.length);
      } catch {
        if (!cancelled) setProjectCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

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
      const id = await createProject({
        name: name.trim(),
        customer_name: customerName.trim(),
        shoot_date: shootDate,
        deadline,
        required_count: Number(requiredCount),
        photographer_id: profile.id,
        shoot_type: shootType || null,
        customer_phone: customerPhone.trim() || null,
        access_pin: accessPin || null,
        max_revision_count: maxRevisionCount,
        location: location.trim() || null,
      });
      await fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "created" }),
      }).catch(() => {});
      router.push(`/photographer/projects/${id}`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const withinLimit = projectCount === null || projectCount < BETA_MAX_PROJECTS_TOTAL;

  return (
    <div
      className="min-h-screen bg-[#0a0a0c] text-white"
      style={{ fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif" }}
      onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
    >
      <style>{`
        .np-input {
          width: 100%; background: #0a0a0c; border: 1px solid #27272c;
          color: #fff; padding: 12px 16px; font-size: 14px; outline: none;
          border-radius: 12px; transition: border-color 0.2s; box-sizing: border-box;
          font-family: inherit;
        }
        .np-input:focus { border-color: rgba(255,77,0,0.5); }
        .np-input::placeholder { color: #3f3f46; }
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

        {/* 베타 한도 초과 */}
        {projectCount !== null && projectCount >= BETA_MAX_PROJECTS_TOTAL && (
          <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/20 rounded-2xl p-4 mb-6">
            <AlertCircle size={16} color="#ef4444" className="shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-400 mb-1">베타 기간 프로젝트 한도 도달</div>
              <div className="text-xs text-zinc-500 leading-relaxed">
                베타 기간 중 최대 {BETA_MAX_PROJECTS_TOTAL}개의 프로젝트를 생성할 수 있습니다.
                현재 <strong className="text-white">{projectCount} / {BETA_MAX_PROJECTS_TOTAL}개</strong> 사용 중입니다.
              </div>
              <button
                type="button"
                onClick={() => router.push("/photographer/projects")}
                className="mt-3 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
              >
                프로젝트 목록 보기
              </button>
            </div>
          </div>
        )}

        {/* 베타 한도 임박 */}
        {projectCount !== null && projectCount === BETA_MAX_PROJECTS_TOTAL - 1 && (
          <div className="flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-2.5 mb-4">
            <AlertTriangle size={13} color="#eab308" />
            <span className="text-xs text-yellow-500/80">
              잔여 1개 · 베타 기간 중 최대 {BETA_MAX_PROJECTS_TOTAL}개의 프로젝트를 생성할 수 있습니다.
            </span>
          </div>
        )}

        {withinLimit && (
          <div className="flex flex-col gap-5">

            {/* ── 폼 카드 ── */}
            <div className="bg-[#121215] border border-[#1a1a1e] rounded-2xl p-6 flex flex-col gap-6">

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
                        background: shootType === value ? "rgba(255,77,0,0.08)" : "transparent",
                        borderColor: shootType === value ? "rgba(255,77,0,0.5)" : "#27272c",
                        color: shootType === value ? "#FF4D00" : "#71717a",
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
                    style={{ borderColor: fieldErrors.name ? "rgba(239,68,68,0.7)" : name ? "rgba(255,77,0,0.3)" : undefined }}
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
                      style={{ borderColor: fieldErrors.shootDate ? "rgba(239,68,68,0.7)" : shootDate ? "rgba(255,77,0,0.3)" : undefined }}
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
                      style={{ borderColor: fieldErrors.customerName ? "rgba(239,68,68,0.7)" : customerName ? "rgba(255,77,0,0.3)" : undefined }}
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
                  <span className="text-[10px] text-zinc-700">알림 기능 연동 시 사용됩니다</span>
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
                        style={{ borderColor: fieldErrors.requiredCount ? "rgba(239,68,68,0.7)" : requiredCount ? "rgba(255,77,0,0.3)" : undefined }}
                      />
                      <span className="text-sm text-zinc-500 shrink-0">장</span>
                    </div>
                    <span className="text-[10px] text-zinc-700">고객이 선택할 사진 수</span>
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
            <div className="bg-[#121215] border border-[#1a1a1e] rounded-2xl p-6 flex flex-col gap-4">
              <div className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                셀렉 기한
                <span className="text-[10px] text-[#FF4D00] font-medium">필수</span>
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
                      background: quickDays === days ? "rgba(255,77,0,0.08)" : "transparent",
                      borderColor: quickDays === days ? "rgba(255,77,0,0.5)" : "#27272c",
                      color: quickDays === days ? "#FF4D00" : "#71717a",
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
                    background: quickDays === null ? "rgba(255,77,0,0.08)" : "transparent",
                    borderColor: quickDays === null ? "rgba(255,77,0,0.5)" : "#27272c",
                    color: quickDays === null ? "#FF4D00" : "#71717a",
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
                  style={{ borderColor: fieldErrors.deadline ? "rgba(239,68,68,0.7)" : deadline ? "rgba(255,77,0,0.3)" : undefined }}
                />
                {fieldErrors.deadline && <p className="text-xs text-red-400 mt-1 ml-0.5">{fieldErrors.deadline}</p>}
              </div>

            </div>

            {/* ── 보안 설정 카드 ── */}
            <div className="bg-[#121215] border border-[#1a1a1e] rounded-2xl p-6 flex flex-col gap-6">

              {/* PIN */}
              <Field label="고객 비밀번호 (PIN)" hint="선택사항">
                <div className="flex items-center gap-3 flex-wrap">
                  <Lock size={13} className="text-zinc-600 shrink-0" />
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
                    className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 border border-[#27272c] hover:border-zinc-500 hover:text-zinc-300 rounded-xl transition-colors"
                  >
                    <RefreshCw size={11} /> 랜덤
                  </button>
                  {accessPin && (
                    <button
                      type="button"
                      onClick={() => setAccessPin("")}
                      className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-zinc-700">설정 시 고객이 링크 접속 시 비밀번호를 입력해야 합니다</span>
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
                        background: maxRevisionCount === value ? "rgba(255,77,0,0.08)" : "transparent",
                        borderColor: maxRevisionCount === value ? "rgba(255,77,0,0.5)" : "#27272c",
                        color: maxRevisionCount === value ? "#FF4D00" : "#71717a",
                      }}
                    >
                      {label}
                      <span className="text-[10px] font-normal" style={{ color: maxRevisionCount === value ? "rgba(255,77,0,0.6)" : "#52525b" }}>{desc}</span>
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
            <div className="flex items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={() => router.push("/photographer/projects")}
                className="flex items-center gap-2 px-5 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 border border-[#27272c] hover:border-zinc-600 rounded-xl transition-colors"
              >
                ← 뒤로
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 bg-[#FF4D00] hover:bg-[#ff5e1a] disabled:opacity-40 disabled:cursor-not-allowed text-black px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-[#FF4D00]/20 transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none"
              >
                {submitting ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> 생성 중...</>
                ) : (
                  <>다음: 사진 업로드 <ChevronRight size={14} /></>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
