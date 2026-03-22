"use client";

/**
 * Supabase SQL Editor에서 아래 SQL을 실행해주세요:
 *
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS shoot_type text;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_phone text;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS photo_count_expected int4;
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Heart, Baby, GraduationCap, Briefcase, Camera,
  Calendar, Phone, Users, Image as ImageIcon, ChevronLeft, Loader2,
} from "lucide-react";
import { addDays, format, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/lib/supabase";
import { createProject, getPhotographerIdByAuthId } from "@/lib/db";

// ── 컬러 토큰 ──────────────────────────────────────────────
const C = {
  ink: "#0d1e28", surface: "#0f2030", surface2: "#152a3a", surface3: "#1a3347",
  steel: "#669bbc", steelLt: "#8db8d4",
  border: "rgba(102,155,188,0.12)", borderMd: "rgba(102,155,188,0.22)",
  text: "#e8eef2", muted: "#7a9ab0", dim: "#3a5a6e",
  red: "#ff4757",
};

// ── 촬영 유형 ──────────────────────────────────────────────
const SHOOT_TYPES = [
  { value: "wedding",     label: "웨딩",       icon: Heart          },
  { value: "family",      label: "가족·베이비",  icon: Baby           },
  { value: "graduation",  label: "졸업·기념",   icon: GraduationCap  },
  { value: "profile",     label: "프로필·증명", icon: Briefcase      },
  { value: "etc",         label: "기타",        icon: Camera         },
];

// ── 빠른 기한 옵션 ──────────────────────────────────────────
const QUICK_DAYS = [3, 5, 7, 14, 30];

function getErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return String(e) || "프로젝트 생성에 실패했습니다.";
}

// ── 공통 인풋 스타일 ─────────────────────────────────────────
const inputBase: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  background: C.surface2, border: `1px solid ${C.border}`,
  borderRadius: 8, color: C.text, fontSize: 13,
  fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
  boxSizing: "border-box", outline: "none",
  transition: "border-color 0.15s",
};

export default function NewProjectPage() {
  const router = useRouter();

  // ── 폼 상태 ──
  const [shootType,          setShootType]          = useState<string | null>(null);
  const [name,               setName]               = useState("");
  const [shootDate,          setShootDate]          = useState("");
  const [customerName,       setCustomerName]       = useState("");
  const [customerPhone,      setCustomerPhone]      = useState("");
  const [requiredCount,      setRequiredCount]      = useState("");
  const [photoCountExpected, setPhotoCountExpected] = useState("");
  const [quickDays,          setQuickDays]          = useState<number | null>(7);
  const [deadline,           setDeadline]           = useState<string>(() =>
    format(addDays(new Date(), 7), "yyyy-MM-dd")
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // ── 기한 계산 ──
  const handleQuickDays = (days: number) => {
    setQuickDays(days);
    const base = shootDate ? new Date(shootDate) : new Date();
    setDeadline(format(addDays(base, days), "yyyy-MM-dd"));
  };

  const handleDeadlineInput = (val: string) => {
    setDeadline(val);
    setQuickDays(null); // 직접 입력 시 빠른 선택 해제
  };

  // 기한 미리보기 계산
  const deadlinePreview = (() => {
    if (!deadline) return null;
    const base = shootDate ? new Date(shootDate) : null;
    const deadlineDate = new Date(deadline);
    const dFromShoot = base ? differenceInCalendarDays(deadlineDate, base) : null;
    return {
      dateStr: format(deadlineDate, "yyyy-MM-dd"),
      dLabel: dFromShoot !== null ? `D+${dFromShoot}` : null,
    };
  })();

  // 액션바 미리보기 D+n (오늘 기준)
  const actionDLabel = deadline
    ? `D+${Math.max(0, differenceInCalendarDays(new Date(deadline), new Date()))}`
    : null;

  // ── 필수 항목 유효성 ──
  const isValid =
    name.trim() !== "" &&
    shootDate !== "" &&
    customerName.trim() !== "" &&
    Number(requiredCount) >= 1 &&
    deadline !== "";

  // ── 제출 ──
  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("로그인이 필요합니다.");
      const photographerId = await getPhotographerIdByAuthId(user.id);
      if (!photographerId) throw new Error("사진작가 계정 정보를 찾을 수 없습니다.");

      const id = await createProject({
        name: name.trim(),
        customer_name: customerName.trim(),
        shoot_date: shootDate,
        deadline,
        required_count: Number(requiredCount),
        photographer_id: photographerId,
        shoot_type: shootType || null,
        customer_phone: customerPhone.trim() || null,
        photo_count_expected: photoCountExpected ? Number(photoCountExpected) : null,
      });

      await fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "created" }),
      }).catch(() => {});

      router.push(`/photographer/projects/${id}/upload`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── 섹션 카드 래퍼 ──
  const cardStyle: React.CSSProperties = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 12, overflow: "hidden", marginBottom: 12,
  };
  const cardHeaderStyle: React.CSSProperties = {
    padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
    display: "flex", alignItems: "center", gap: 8,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, color: C.muted,
    display: "flex", alignItems: "center", gap: 5, marginBottom: 6,
  };

  return (
    <div style={{ fontFamily: "'DM Sans','Noto Sans KR',sans-serif" }}>
      <style>{`
        .np-input:focus { border-color: ${C.steel} !important; }
        .np-input::placeholder { color: ${C.dim}; }
        .np-input::-webkit-calendar-picker-indicator { filter: invert(0.5) sepia(1) saturate(0.3); cursor: pointer; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
        .np-card { animation: fadeUp 0.3s ease both; }
        .np-card:nth-child(1){animation-delay:0.05s;}
        .np-card:nth-child(2){animation-delay:0.10s;}
        .np-card:nth-child(3){animation-delay:0.15s;}
      `}</style>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 12, padding: "0 28px",
        background: "rgba(13,30,40,0.85)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <button
          onClick={() => router.push("/photographer/projects")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 7,
            border: `1px solid ${C.border}`, background: "transparent",
            color: C.muted, fontSize: 12, cursor: "pointer",
            fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
          }}
        >
          <ChevronLeft size={13} /> 프로젝트
        </button>
        <span style={{ fontSize: 15, fontWeight: 500, color: C.text }}>새 프로젝트</span>
      </div>

      {/* ── 콘텐츠 ── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "32px 24px 80px",
      }}>
        <div style={{ width: "100%", maxWidth: 720 }}>

          {/* 폼 헤더 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 6,
            }}>
              새 프로젝트 만들기
            </div>
            <div style={{ fontSize: 13, color: C.muted }}>
              촬영 정보를 입력하면 고객 초대 링크가 자동으로 생성됩니다
            </div>
          </div>

          {/* ── 섹션 1: 기본 정보 ── */}
          <div className="np-card" style={cardStyle}>
            <div style={cardHeaderStyle}>
              <Calendar size={13} color={C.steel} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: "0.5px" }}>기본 정보</span>
            </div>
            <div style={{ padding: 20 }}>

              {/* 촬영 유형 */}
              <div style={{ marginBottom: 18 }}>
                <div style={labelStyle}>
                  촬영 유형
                  <span style={{ fontSize: 10, fontWeight: 400, color: C.dim }}>선택사항</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {SHOOT_TYPES.map(({ value, label, icon: Icon }) => {
                    const active = shootType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setShootType(active ? null : value)}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "5px 12px", borderRadius: 20,
                          background: active ? "rgba(102,155,188,0.08)" : C.surface2,
                          border: `1px solid ${active ? C.steel : C.border}`,
                          color: active ? C.steel : C.muted,
                          fontSize: 12, cursor: "pointer",
                          fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
                          transition: "all 0.15s",
                        }}
                      >
                        <Icon size={13} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2컬럼: 프로젝트명 / 촬영날짜 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={labelStyle}>
                    프로젝트명
                    <span style={{ fontSize: 10, color: C.steel }}>필수</span>
                  </div>
                  <input
                    className="np-input"
                    style={{ ...inputBase, borderColor: name ? "rgba(102,155,188,0.2)" : C.border }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 비티에스 웨딩"
                  />
                </div>
                <div>
                  <div style={labelStyle}>
                    <Calendar size={11} color={C.dim} />
                    촬영 날짜
                    <span style={{ fontSize: 10, color: C.steel }}>필수</span>
                  </div>
                  <input
                    className="np-input"
                    type="date"
                    style={{ ...inputBase, borderColor: shootDate ? "rgba(102,155,188,0.2)" : C.border }}
                    value={shootDate}
                    onChange={(e) => {
                      setShootDate(e.target.value);
                      // 촬영일 변경 시 quickDays 기반으로 기한 재계산
                      if (quickDays && e.target.value) {
                        setDeadline(format(addDays(new Date(e.target.value), quickDays), "yyyy-MM-dd"));
                      }
                    }}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── 섹션 2: 고객 정보 ── */}
          <div className="np-card" style={cardStyle}>
            <div style={cardHeaderStyle}>
              <Users size={13} color={C.steel} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: "0.5px" }}>고객 정보</span>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={labelStyle}>
                    <Users size={11} color={C.dim} />
                    고객명
                    <span style={{ fontSize: 10, color: C.steel }}>필수</span>
                  </div>
                  <input
                    className="np-input"
                    style={{ ...inputBase, borderColor: customerName ? "rgba(102,155,188,0.2)" : C.border }}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="고객 이름"
                  />
                </div>
                <div>
                  <div style={labelStyle}>
                    <Phone size={11} color={C.dim} />
                    연락처
                    <span style={{ fontSize: 10, fontWeight: 400, color: C.dim }}>선택사항</span>
                  </div>
                  <input
                    className="np-input"
                    style={inputBase}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="010-0000-0000"
                  />
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                    알림 기능 연동 시 사용됩니다
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 섹션 3: 셀렉 설정 ── */}
          <div className="np-card" style={cardStyle}>
            <div style={cardHeaderStyle}>
              <ImageIcon size={13} color={C.steel} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: "0.5px" }}>셀렉 설정</span>
            </div>
            <div style={{ padding: 20 }}>

              {/* 2컬럼: 셀렉 갯수 / 업로드 예정 수 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                <div>
                  <div style={labelStyle}>
                    셀렉 갯수 (N)
                    <span style={{ fontSize: 10, color: C.steel }}>필수</span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      className="np-input"
                      type="number"
                      min={1}
                      style={{
                        ...inputBase,
                        paddingRight: 36,
                        borderColor: requiredCount ? "rgba(102,155,188,0.2)" : C.border,
                      }}
                      value={requiredCount}
                      onChange={(e) => setRequiredCount(e.target.value)}
                      placeholder="예: 5"
                    />
                    <span style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      fontSize: 12, color: C.muted,
                    }}>장</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>고객이 선택할 사진 수</div>
                </div>
                <div>
                  <div style={labelStyle}>
                    업로드 예정 수 (M)
                    <span style={{ fontSize: 10, fontWeight: 400, color: C.dim }}>선택사항</span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      className="np-input"
                      type="number"
                      min={1}
                      style={{ ...inputBase, paddingRight: 36 }}
                      value={photoCountExpected}
                      onChange={(e) => setPhotoCountExpected(e.target.value)}
                      placeholder="예: 200"
                    />
                    <span style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      fontSize: 12, color: C.muted,
                    }}>장</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>일반적으로 150~300장 추천</div>
                </div>
              </div>

              {/* 셀렉 기한 */}
              <div>
                <div style={labelStyle}>
                  <Calendar size={11} color={C.dim} />
                  셀렉 기한
                  <span style={{ fontSize: 10, color: C.steel }}>필수</span>
                </div>

                {/* 빠른 선택 버튼 */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {QUICK_DAYS.map((days) => {
                    const active = quickDays === days;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => handleQuickDays(days)}
                        style={{
                          padding: "5px 12px",
                          background: active ? "rgba(102,155,188,0.12)" : C.surface2,
                          border: `1px solid ${active ? C.steel : C.border}`,
                          borderRadius: 20, fontSize: 11,
                          color: active ? C.steel : C.muted,
                          cursor: "pointer",
                          fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
                          transition: "all 0.15s",
                        }}
                      >
                        +{days}일
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setQuickDays(null)}
                    style={{
                      padding: "5px 12px",
                      background: quickDays === null ? "rgba(102,155,188,0.12)" : C.surface2,
                      border: `1px solid ${quickDays === null ? C.steel : C.border}`,
                      borderRadius: 20, fontSize: 11,
                      color: quickDays === null ? C.steel : C.muted,
                      cursor: "pointer",
                      fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
                      transition: "all 0.15s",
                    }}
                  >
                    직접 입력
                  </button>
                </div>

                {/* 날짜 직접 입력 */}
                <input
                  className="np-input"
                  type="date"
                  style={{
                    ...inputBase,
                    borderColor: deadline ? "rgba(102,155,188,0.2)" : C.border,
                  }}
                  value={deadline}
                  onChange={(e) => handleDeadlineInput(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                />

                {/* 기한 미리보기 */}
                {deadlinePreview && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", marginTop: 8,
                    background: "rgba(102,155,188,0.05)",
                    border: "1px solid rgba(102,155,188,0.15)",
                    borderRadius: 7, fontSize: 12, color: C.muted,
                  }}>
                    <Calendar size={12} color={C.dim} />
                    기한:{" "}
                    <strong style={{ color: C.steel }}>{deadlinePreview.dateStr}</strong>
                    {deadlinePreview.dLabel && (
                      <> · 촬영일로부터 <strong style={{ color: C.steel }}>{deadlinePreview.dLabel}</strong></>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{error}</p>
          )}
        </div>
      </div>

      {/* ── 하단 고정 액션 바 ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 220, right: 0,
        background: "rgba(0,48,73,0.95)", backdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(102,155,188,0.15)",
        padding: "14px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        zIndex: 100,
      }}>
        {/* 좌측: 미리보기 요약 */}
        <div style={{ fontSize: 12, color: C.muted }}>
          {[
            name.trim() && <strong key="name" style={{ color: C.text }}>{name.trim()}</strong>,
            customerName.trim() && customerName.trim(),
            requiredCount && `셀렉 ${requiredCount}장`,
            actionDLabel && actionDLabel,
          ]
            .filter(Boolean)
            .reduce<React.ReactNode[]>((acc, item, i) => {
              if (i > 0) acc.push(<span key={`sep-${i}`} style={{ margin: "0 6px", color: C.dim }}>·</span>);
              acc.push(item as React.ReactNode);
              return acc;
            }, [])}
        </div>

        {/* 우측: 버튼 */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => router.push("/photographer/projects")}
            style={{
              padding: "9px 18px", background: "transparent",
              border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.muted, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            style={{
              padding: "9px 24px", background: isValid ? C.steel : C.surface3,
              border: "none", borderRadius: 8, color: isValid ? "white" : C.dim,
              fontSize: 13, fontWeight: 600,
              cursor: isValid && !submitting ? "pointer" : "not-allowed",
              opacity: submitting ? 0.7 : 1,
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'DM Sans','Noto Sans KR',sans-serif",
              transition: "background 0.15s",
            }}
          >
            {submitting
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> 생성 중...</>
              : "프로젝트 생성 →"}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
