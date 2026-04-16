"use client";

/**
 * Supabase SQL Editor에서 아래 SQL을 실행해주세요:
 *
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS shoot_type text;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_phone text;
 * ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS photo_count_expected int4;
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, RefreshCw, AlertCircle, AlertTriangle } from "lucide-react";
import { addDays, format, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/lib/supabase";
import { createProject, getPhotographerIdByAuthId, getProjectsByPhotographerId } from "@/lib/db";
import { BETA_MAX_PROJECTS_TOTAL } from "@/lib/beta-limits";
import { SHOOT_TYPES } from "@/lib/project-shoot-types";

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

export default function NewProjectPage() {
  const router = useRouter();

  // ── 폼 상태 ──
  const [shootType,          setShootType]          = useState<string | null>(null);
  const [name,               setName]               = useState("");
  const [shootDate,          setShootDate]          = useState("");
  const [customerName,       setCustomerName]       = useState("");
  const [customerPhone,      setCustomerPhone]      = useState("");
  const [requiredCount,      setRequiredCount]      = useState("");
  const [quickDays,          setQuickDays]          = useState<number | null>(7);
  const [deadline,           setDeadline]           = useState<string>(() =>
    format(addDays(new Date(), 7), "yyyy-MM-dd")
  );
  const [accessPin,          setAccessPin]          = useState("");
  const [submitting,         setSubmitting]         = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [projectCount,       setProjectCount]       = useState<number | null>(null);
  const [userName,           setUserName]           = useState("");

  // ── 마운트 시 프로젝트 수 조회 + 사용자명 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id || cancelled) return;
        const displayName =
          (user.user_metadata?.name as string | undefined) ||
          (user.user_metadata?.full_name as string | undefined) ||
          "";
        if (!cancelled) setUserName(displayName);
        const photographerId = await getPhotographerIdByAuthId(user.id);
        if (!photographerId || cancelled) return;
        const projects = await getProjectsByPhotographerId(photographerId);
        if (!cancelled) setProjectCount(projects.length);
      } catch {
        if (!cancelled) setProjectCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 기한 계산 ──
  const handleQuickDays = (days: number) => {
    setQuickDays(days);
    const base = shootDate ? new Date(shootDate) : new Date();
    setDeadline(format(addDays(base, days), "yyyy-MM-dd"));
  };

  const handleDeadlineInput = (val: string) => {
    setDeadline(val);
    setQuickDays(null);
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
        access_pin: accessPin || null,
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
      className="np-root"
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        fontFamily: "'Pretendard', sans-serif",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      <style>{`
        /* ── 그리드 배경 ── */
        .np-grid-bg {
          position: fixed; inset: 0;
          background-image:
            linear-gradient(#222 1px, transparent 1px),
            linear-gradient(90deg, #222 1px, transparent 1px);
          background-size: 50px 50px;
          pointer-events: none; z-index: 0;
        }
        /* ── 스캔라인 ── */
        .np-scanline {
          width: 100%; height: 150px; position: fixed; bottom: 100%;
          background: linear-gradient(0deg, rgba(255,77,0,0.03) 0%, rgba(255,77,0,0) 100%);
          animation: np-scanline 8s linear infinite;
          pointer-events: none; z-index: 1;
        }
        @keyframes np-scanline { 0% { bottom: 100%; } 100% { bottom: -150px; } }
        /* ── 인풋 브래킷 효과 ── */
        .np-ib {
          position: absolute; width: 8px; height: 8px;
          border-color: #FF4D00; opacity: 0;
          transition: all 0.2s ease-out; pointer-events: none; z-index: 10;
        }
        .np-input-wrap:focus-within .np-ib { opacity: 1; width: 12px; height: 12px; }
        .np-ib-tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
        .np-ib-tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
        .np-ib-bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
        .np-ib-br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }
        /* ── 필드 인풋 ── */
        .np-fi {
          width: 100%; background: #0A0A0A; border: 1px solid #333;
          color: #fff; padding: 14px 20px; font-size: 15px; outline: none;
          transition: border-color 0.2s; box-sizing: border-box;
          font-family: 'Pretendard', sans-serif;
        }
        .np-fi:focus { border-color: #FF4D00; }
        .np-fi::placeholder { color: #444; }
        .np-fi::-webkit-calendar-picker-indicator { filter: invert(0.4); cursor: pointer; }
        .np-fi-mono { font-family: 'Space Mono', 'Noto Sans KR', sans-serif !important; }
        /* ── 빠른 기한 / 촬영유형 pill ── */
        .np-pill {
          padding: 6px 14px; background: #0A0A0A; border: 1px solid #333;
          color: #666; font-size: 12px; cursor: pointer;
          transition: all 0.15s; font-family: 'Space Mono', 'Noto Sans KR', sans-serif;
        }
        .np-pill:hover { border-color: #555; color: #999; }
        .np-pill.active { border-color: #FF4D00; color: #FF4D00; background: rgba(255,77,0,0.06); }
        .np-type-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px; background: #0A0A0A; border: 1px solid #333;
          color: #666; font-size: 12px; cursor: pointer;
          transition: all 0.15s; font-family: 'Pretendard', sans-serif;
        }
        .np-type-btn:hover { border-color: #555; color: #aaa; }
        .np-type-btn.active { border-color: #FF4D00; color: #FF4D00; background: rgba(255,77,0,0.06); }
        /* ── 버튼 ── */
        .np-btn-primary {
          background: #FF4D00; color: #000; font-weight: 700; font-size: 15px;
          padding: 16px 40px; border: none; cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
          display: flex; align-items: center; gap: 10px;
          font-family: 'Pretendard', sans-serif;
        }
        .np-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 0 30px rgba(255,77,0,0.3); background: #ff5e1a; }
        .np-btn-primary:active { transform: translateY(1px); }
        .np-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
        .np-btn-back {
          border: 1px solid #333; background: #050505; color: #888;
          padding: 16px 32px; font-size: 12px;
          font-family: 'Space Mono', 'Noto Sans KR', sans-serif; letter-spacing: 0.1em;
          text-transform: uppercase; cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; gap: 8px;
        }
        .np-btn-back:hover { border-color: #666; color: #fff; }
        /* ── 스크롤바 ── */
        .np-root ::-webkit-scrollbar { width: 6px; }
        .np-root ::-webkit-scrollbar-track { background: #000; }
        .np-root ::-webkit-scrollbar-thumb { background: #222; }
        /* ── 반응형 ── */
        @media (max-width: 768px) {
          .np-main { padding: 24px 16px 100px !important; }
          .np-grid-2 { grid-template-columns: 1fr !important; }
          .np-step-label { display: none; }
          .np-action-row { flex-direction: column !important; gap: 10px !important; }
          .np-btn-primary, .np-btn-back { width: 100% !important; min-height: 48px !important; justify-content: center !important; }
          .np-bottom-left, .np-bottom-right { display: none !important; }
          .np-header-right { display: none !important; }
          .np-header { padding: 0 16px !important; height: max(52px, calc(44px + env(safe-area-inset-top))) !important; padding-top: env(safe-area-inset-top) !important; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes np-pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
      `}</style>

      {/* ── 장식 배경 ── */}
      <div className="np-grid-bg" />
      <div className="np-scanline" />

      {/* ── 코너 브래킷 ── */}
      <div style={{ position:"fixed", top:24, left:24, width:24, height:24, borderTop:"2px solid #FF4D00", borderLeft:"2px solid #FF4D00", zIndex:50, pointerEvents:"none" }} />
      <div style={{ position:"fixed", top:24, right:24, width:24, height:24, borderTop:"2px solid #FF4D00", borderRight:"2px solid #FF4D00", zIndex:50, pointerEvents:"none" }} />
      <div style={{ position:"fixed", bottom:24, left:24, width:24, height:24, borderBottom:"2px solid #FF4D00", borderLeft:"2px solid #FF4D00", zIndex:50, pointerEvents:"none" }} />
      <div style={{ position:"fixed", bottom:24, right:24, width:24, height:24, borderBottom:"2px solid #FF4D00", borderRight:"2px solid #FF4D00", zIndex:50, pointerEvents:"none" }} />

      {/* ── 상단 헤더 ── */}
      <header style={{
        position:"sticky", top:0, zIndex:50,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 32px", height:60,
        background:"rgba(0,0,0,0.92)", backdropFilter:"blur(12px)",
        borderBottom:"1px solid #1a1a1a",
      }}>
        {/* 좌: 뒤로 + 로고 */}
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button
            type="button"
            onClick={() => router.push("/photographer/projects")}
            style={{
              display:"flex", alignItems:"center", gap:6,
              background:"transparent", border:"1px solid #2a2a2a",
              color:"#666", padding:"6px 12px", fontSize:11,
              cursor:"pointer", fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif",
              letterSpacing:"0.05em", transition:"all 0.15s",
            }}
          >
            ← BACK
          </button>
          <div style={{ width:1, height:20, background:"#1e1e1e" }} />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{
              width:22, height:22, background:"#FF4D00",
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"#000", fontWeight:900, fontSize:11,
              fontFamily:"'Space Grotesk', sans-serif",
            }}>A</div>
            <span style={{
              fontFamily:"'Space Grotesk', sans-serif", fontWeight:700,
              fontSize:15, letterSpacing:"-0.03em", textTransform:"uppercase",
            }}>
              A-Cut<span style={{ color:"#FF4D00" }}>.</span>
            </span>
          </div>
        </div>

        {/* 우: 세션 + 사용자명 */}
        <div
          className="np-header-right"
          style={{
            display:"flex", alignItems:"center", gap:16,
            background:"#050505", border:"1px solid #1e1e1e", padding:"8px 16px",
          }}
        >
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10,
            color:"#22c55e", letterSpacing:"0.15em", textTransform:"uppercase",
          }}>
            <span style={{
              width:6, height:6, borderRadius:"50%", background:"#22c55e",
              boxShadow:"0 0 5px #22c55e", display:"inline-block",
              animation:"np-pulse 2s infinite",
            }} />
            SYS.SESSION_ACTIVE
          </div>
          {userName && (
            <>
              <div style={{ width:1, height:14, background:"#2a2a2a" }} />
              <span style={{ fontSize:13, color:"#ccc" }}>
                {userName} <span style={{ color:"#fff", fontWeight:700 }}>작가님</span>
              </span>
            </>
          )}
        </div>
      </header>

      {/* ── 메인 콘텐츠 ── */}
      <main
        className="np-main"
        style={{
          position:"relative", zIndex:10,
          maxWidth:840, margin:"0 auto",
          padding:"48px 40px 120px",
        }}
      >
        {/* ── 3단계 진행 표시 ── */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          position:"relative", marginBottom:48, padding:"0 24px",
        }}>
          {/* 연결선 */}
          <div style={{
            position:"absolute", top:"20px", left:60, right:60,
            height:1, background:"#1e1e1e", zIndex:0,
          }} />
          {[
            { num:"01", label:"프로젝트 만들기", sub:"SYS.CREATE", active:true },
            { num:"02", label:"사진 업로드",     sub:"SYS.UPLOAD", active:false },
            { num:"03", label:"링크 공유",       sub:"SYS.SHARE",  active:false },
          ].map(({ num, label, sub, active }) => (
            <div
              key={num}
              style={{
                display:"flex", flexDirection:"column", alignItems:"center", gap:12,
                background:"#000", padding:"0 16px", position:"relative", zIndex:1,
              }}
            >
              <div style={{
                width:40, height:40, borderRadius:"50%",
                border: active ? "2px solid #FF4D00" : "1px solid #2a2a2a",
                color: active ? "#FF4D00" : "#444",
                background:"#000",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:13, fontWeight:700,
                boxShadow: active ? "0 0 15px rgba(255,77,0,0.2)" : "none",
              }}>
                {num}
              </div>
              <div
                className="np-step-label"
                style={{ textAlign:"center", opacity: active ? 1 : 0.4 }}
              >
                <div style={{ fontSize:12, fontWeight:700, color:"#fff", marginBottom:2 }}>{label}</div>
                <div style={{
                  fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:9,
                  color: active ? "#FF4D00" : "#444",
                  letterSpacing:"0.2em", textTransform:"uppercase",
                }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── 타이틀 ── */}
        <div style={{ marginBottom:36 }}>
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10,
            color:"#FF4D00", letterSpacing:"0.2em",
            textTransform:"uppercase", marginBottom:16,
          }}>
            <div style={{ width:12, height:1, background:"#FF4D00" }} />
            CMD :: SYS.PROJECT_CREATION
            <div style={{ width:12, height:1, background:"#FF4D00" }} />
          </div>
          <h1 style={{
            fontSize:38, fontWeight:900, letterSpacing:"-0.03em",
            margin:0, lineHeight:1.1, marginBottom:12,
          }}>
            새 프로젝트 만들기
          </h1>
          <p style={{ fontSize:16, color:"#666", fontWeight:300, margin:0 }}>
            촬영 정보를 입력하면 고객 초대 링크가 자동으로 생성됩니다
          </p>
        </div>

        {/* ── 베타 한도 초과 ── */}
        {projectCount !== null && projectCount >= BETA_MAX_PROJECTS_TOTAL && (
          <div style={{
            padding:"20px 24px", marginBottom:20,
            background:"rgba(255,71,87,0.06)", border:"1px solid rgba(255,71,87,0.2)",
            display:"flex", flexDirection:"column", gap:12,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <AlertCircle size={18} color="#ef4444" />
              <div style={{ fontSize:14, fontWeight:600, color:"#ef4444" }}>베타 기간 프로젝트 한도 도달</div>
            </div>
            <div style={{ fontSize:13, color:"#666", lineHeight:1.6 }}>
              베타 기간 중 최대 {BETA_MAX_PROJECTS_TOTAL}개의 프로젝트를 생성할 수 있습니다.
              <br />현재 <strong style={{ color:"#fff" }}>{projectCount} / {BETA_MAX_PROJECTS_TOTAL}개</strong> 사용 중입니다.
            </div>
            <button
              type="button"
              onClick={() => router.push("/photographer/projects")}
              style={{
                alignSelf:"flex-start", padding:"8px 18px",
                background:"#0a0a0a", border:"1px solid #333",
                color:"#666", fontSize:13, cursor:"pointer",
                fontFamily:"'Pretendard', sans-serif",
              }}
            >
              프로젝트 목록 보기
            </button>
          </div>
        )}

        {/* ── 베타 한도 임박 ── */}
        {projectCount !== null && projectCount === BETA_MAX_PROJECTS_TOTAL - 1 && (
          <div style={{
            padding:"10px 16px", marginBottom:16,
            background:"rgba(245,166,35,0.06)", border:"1px solid rgba(245,166,35,0.2)",
            display:"flex", alignItems:"center", gap:8,
            fontSize:12, color:"#f5a623",
          }}>
            <AlertTriangle size={14} />
            잔여 1개 · 베타 기간 중 최대 {BETA_MAX_PROJECTS_TOTAL}개의 프로젝트를 생성할 수 있습니다.
          </div>
        )}

        {/* ── 폼 카드 ── */}
        {withinLimit && (
          <div style={{
            background:"#030303", border:"1px solid #222",
            position:"relative", padding:40,
          }}>
            {/* 카드 코너 마이크로 브래킷 */}
            <div style={{ position:"absolute", top:0, left:0, width:12, height:12, borderTop:"1px solid #3a3a3a", borderLeft:"1px solid #3a3a3a" }} />
            <div style={{ position:"absolute", top:0, right:0, width:12, height:12, borderTop:"1px solid #3a3a3a", borderRight:"1px solid #3a3a3a" }} />
            <div style={{ position:"absolute", bottom:0, left:0, width:12, height:12, borderBottom:"1px solid #3a3a3a", borderLeft:"1px solid #3a3a3a" }} />
            <div style={{ position:"absolute", bottom:0, right:0, width:12, height:12, borderBottom:"1px solid #3a3a3a", borderRight:"1px solid #3a3a3a" }} />

            {/* ── 촬영 유형 ── */}
            <div style={{ marginBottom:32 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:12 }}>
                <label style={{ fontSize:14, fontWeight:700, color:"#ccc" }}>촬영 유형</label>
                <span style={{ fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase" }}>FIELD :: SHOOT_TYPE</span>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {SHOOT_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    className={`np-type-btn${shootType === value ? " active" : ""}`}
                    onClick={() => setShootType(shootType === value ? null : value)}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
                <span style={{ fontSize:11, color:"#444", alignSelf:"center", marginLeft:4 }}>선택사항</span>
              </div>
            </div>

            {/* ── 2열 그리드: 프로젝트명(전체) / 촬영날짜 / 고객명 / 연락처 ── */}
            <div className="np-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginBottom:28 }}>

              {/* 프로젝트명 — 전체 폭 */}
              <div style={{ gridColumn:"1 / -1" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:10 }}>
                  <label style={{ fontSize:14, fontWeight:700, color:"#ccc" }}>
                    프로젝트명 <span style={{ fontSize:11, color:"#FF4D00", fontWeight:400 }}>필수</span>
                  </label>
                  <span style={{ fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase" }}>FIELD :: PROJ_NAME</span>
                </div>
                <div className="np-input-wrap" style={{ position:"relative" }}>
                  <input
                    className="np-fi"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 2024 김민수님 스튜디오 촬영"
                    style={{ borderColor: name ? "rgba(255,77,0,0.3)" : "#333" }}
                  />
                  <div className="np-ib np-ib-tl" /><div className="np-ib np-ib-tr" />
                  <div className="np-ib np-ib-bl" /><div className="np-ib np-ib-br" />
                </div>
              </div>

              {/* 촬영 날짜 */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:10 }}>
                  <label style={{ fontSize:14, fontWeight:700, color:"#ccc" }}>
                    촬영 일자 <span style={{ fontSize:11, color:"#FF4D00", fontWeight:400 }}>필수</span>
                  </label>
                  <span style={{ fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase" }}>FIELD :: SHOOT_DATE</span>
                </div>
                <div className="np-input-wrap" style={{ position:"relative" }}>
                  <input
                    className="np-fi np-fi-mono"
                    type="date"
                    value={shootDate}
                    onChange={(e) => {
                      setShootDate(e.target.value);
                      if (quickDays && e.target.value) {
                        setDeadline(format(addDays(new Date(e.target.value), quickDays), "yyyy-MM-dd"));
                      }
                    }}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                    style={{ borderColor: shootDate ? "rgba(255,77,0,0.3)" : "#333" }}
                  />
                  <div className="np-ib np-ib-tl" /><div className="np-ib np-ib-tr" />
                  <div className="np-ib np-ib-bl" /><div className="np-ib np-ib-br" />
                </div>
              </div>

              {/* 고객명 */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:10 }}>
                  <label style={{ fontSize:14, fontWeight:700, color:"#ccc" }}>
                    고객 이름 <span style={{ fontSize:11, color:"#FF4D00", fontWeight:400 }}>필수</span>
                  </label>
                  <span style={{ fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase" }}>FIELD :: CLIENT_NAME</span>
                </div>
                <div className="np-input-wrap" style={{ position:"relative" }}>
                  <input
                    className="np-fi"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="고객님 성함"
                    style={{ borderColor: customerName ? "rgba(255,77,0,0.3)" : "#333" }}
                  />
                  <div className="np-ib np-ib-tl" /><div className="np-ib np-ib-tr" />
                  <div className="np-ib np-ib-bl" /><div className="np-ib np-ib-br" />
                </div>
              </div>

              {/* 연락처 */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:10 }}>
                  <label style={{ fontSize:14, fontWeight:700, color:"#ccc" }}>연락처</label>
                  <span style={{ fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase" }}>FIELD :: CLIENT_PHONE</span>
                </div>
                <div className="np-input-wrap" style={{ position:"relative" }}>
                  <input
                    className="np-fi"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="010-0000-0000"
                  />
                  <div className="np-ib np-ib-tl" /><div className="np-ib np-ib-tr" />
                  <div className="np-ib np-ib-bl" /><div className="np-ib np-ib-br" />
                </div>
                <div style={{ fontSize:11, color:"#444", marginTop:6 }}>알림 기능 연동 시 사용됩니다 · 선택사항</div>
              </div>

              {/* 셀렉 갯수 N */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:10 }}>
                  <label style={{ fontSize:14, fontWeight:700, color:"#ccc" }}>
                    셀렉 갯수 (N) <span style={{ fontSize:11, color:"#FF4D00", fontWeight:400 }}>필수</span>
                  </label>
                  <span style={{ fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase" }}>FIELD :: SEL_COUNT</span>
                </div>
                <div className="np-input-wrap" style={{ position:"relative" }}>
                  <input
                    className="np-fi np-fi-mono"
                    type="number"
                    min={1}
                    value={requiredCount}
                    onChange={(e) => setRequiredCount(e.target.value)}
                    placeholder="예: 5"
                    style={{
                      paddingRight:40,
                      textAlign:"right",
                      borderColor: requiredCount ? "rgba(255,77,0,0.3)" : "#333",
                    }}
                  />
                  <span style={{
                    position:"absolute", right:16, top:"50%", transform:"translateY(-50%)",
                    fontSize:14, color:"#555", pointerEvents:"none",
                  }}>장</span>
                  <div className="np-ib np-ib-tl" /><div className="np-ib np-ib-tr" />
                  <div className="np-ib np-ib-bl" /><div className="np-ib np-ib-br" />
                </div>
                <div style={{ fontSize:11, color:"#444", marginTop:6 }}>고객이 선택할 사진 수</div>
              </div>

            </div>

            {/* ── 셀렉 기한 (구분선) ── */}
            <div style={{ borderTop:"1px solid #1a1a1a", paddingTop:28, marginBottom:28 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:14 }}>
                <label style={{ fontSize:14, fontWeight:700, color:"#ccc" }}>
                  셀렉 기한 <span style={{ fontSize:11, color:"#FF4D00", fontWeight:400 }}>필수</span>
                </label>
                <span style={{ fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase" }}>FIELD :: DEADLINE</span>
              </div>

              {/* 빠른 선택 */}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                {QUICK_DAYS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={`np-pill${quickDays === days ? " active" : ""}`}
                    onClick={() => handleQuickDays(days)}
                  >
                    +{days}일
                  </button>
                ))}
                <button
                  type="button"
                  className={`np-pill${quickDays === null ? " active" : ""}`}
                  onClick={() => setQuickDays(null)}
                >
                  직접 입력
                </button>
              </div>

              {/* 날짜 직접 입력 */}
              <div className="np-input-wrap" style={{ position:"relative" }}>
                <input
                  className="np-fi np-fi-mono"
                  type="date"
                  value={deadline}
                  onChange={(e) => handleDeadlineInput(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  style={{ borderColor: deadline ? "rgba(255,77,0,0.3)" : "#333" }}
                />
                <div className="np-ib np-ib-tl" /><div className="np-ib np-ib-tr" />
                <div className="np-ib np-ib-bl" /><div className="np-ib np-ib-br" />
              </div>

              {/* 기한 미리보기 */}
              {deadlinePreview && (
                <div style={{
                  display:"flex", alignItems:"center", gap:8,
                  padding:"10px 14px", marginTop:10,
                  background:"rgba(255,77,0,0.04)", border:"1px solid rgba(255,77,0,0.15)",
                  fontSize:12, color:"#888", fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif",
                }}>
                  기한: <strong style={{ color:"#FF4D00" }}>{deadlinePreview.dateStr}</strong>
                  {deadlinePreview.dLabel && (
                    <> · 촬영일로부터 <strong style={{ color:"#FF4D00" }}>{deadlinePreview.dLabel}</strong></>
                  )}
                </div>
              )}
            </div>

            {/* ── 고객 비밀번호 (PIN) ── */}
            <div style={{ borderTop:"1px solid #1a1a1a", paddingTop:28 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:14 }}>
                <label style={{ fontSize:14, fontWeight:700, color:"#ccc" }}>
                  <Lock size={13} style={{ display:"inline", marginRight:6, verticalAlign:"middle" }} />
                  고객 비밀번호
                </label>
                <span style={{ fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase" }}>FIELD :: ACCESS_PIN</span>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                <div className="np-input-wrap" style={{ position:"relative" }}>
                  <input
                    className="np-fi np-fi-mono"
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
                    style={{ width:120, letterSpacing:8, fontSize:18, fontWeight:700, textAlign:"center", padding:"14px 16px" }}
                  />
                  <div className="np-ib np-ib-tl" /><div className="np-ib np-ib-tr" />
                  <div className="np-ib np-ib-bl" /><div className="np-ib np-ib-br" />
                </div>
                <button
                  type="button"
                  onClick={() => setAccessPin(Math.floor(1000 + Math.random() * 9000).toString())}
                  style={{
                    display:"flex", alignItems:"center", gap:6,
                    padding:"14px 16px", background:"#0a0a0a", border:"1px solid #333",
                    color:"#666", fontSize:12, cursor:"pointer",
                    fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", transition:"all 0.15s",
                  }}
                >
                  <RefreshCw size={12} /> 랜덤 생성
                </button>
                {accessPin && (
                  <button
                    type="button"
                    onClick={() => setAccessPin("")}
                    style={{
                      padding:"14px 16px", background:"transparent",
                      border:"1px solid #2a2a2a", color:"#555", fontSize:12,
                      cursor:"pointer", fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif",
                    }}
                  >
                    삭제
                  </button>
                )}
              </div>
              <div style={{ fontSize:11, color:"#444", marginTop:8 }}>
                설정 시 고객이 링크 접속 시 비밀번호를 입력해야 합니다 · 선택사항
              </div>
            </div>

            {/* ── Validation 상태바 ── */}
            <div style={{
              marginTop:36, paddingTop:16, borderTop:"1px solid #1a1a1a",
              display:"flex", justifyContent:"space-between", alignItems:"center",
            }}>
              <div style={{
                fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10,
                color: isValid ? "#22c55e" : "#555",
                display:"flex", alignItems:"center", gap:8,
                textTransform:"uppercase", letterSpacing:"0.1em",
              }}>
                <div style={{
                  width:6, height:6, borderRadius:"50%",
                  background: isValid ? "#22c55e" : "#333",
                }} />
                VALIDATION: {isValid ? "PASS" : "READY"}
              </div>
              <div style={{
                fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:10, color:"#333",
                letterSpacing:"0.1em", textTransform:"uppercase",
                display:"flex", alignItems:"center", gap:8,
              }}>
                DATA_ENTRY_MODE
                <div style={{ width:12, height:1, background:"#333" }} />
              </div>
            </div>
          </div>
        )}

        {/* ── 에러 ── */}
        {error && (
          <p style={{ fontSize:13, color:"#ef4444", marginTop:10 }}>{error}</p>
        )}

        {/* ── 액션 버튼 ── */}
        {withinLimit && (
          <div
            className="np-action-row"
            style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:28 }}
          >
            <button
              className="np-btn-back"
              type="button"
              onClick={() => router.push("/photographer/projects")}
            >
              ← 뒤로
            </button>
            <button
              className="np-btn-primary"
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || submitting}
            >
              {submitting ? (
                <><Loader2 size={16} style={{ animation:"spin 1s linear infinite" }} /> 생성 중...</>
              ) : (
                <>다음: 사진 업로드 →</>
              )}
            </button>
          </div>
        )}
      </main>

      {/* ── 하단 좌 ── */}
      <div
        className="np-bottom-left"
        style={{
          position:"fixed", bottom:48, left:48, zIndex:50,
          display:"flex", flexDirection:"column", gap:4,
          fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:9,
          color:"#444", letterSpacing:"0.1em", textTransform:"uppercase",
          pointerEvents:"none",
        }}
      >
        <span>V.1.0.5-BETA</span>
        <span style={{ display:"flex", alignItems:"center", gap:4 }}>
          <div style={{ width:4, height:4, background:"#22c55e" }} />
          SECURE_CONNECTION
        </span>
      </div>

      {/* ── 하단 우 ── */}
      <div
        className="np-bottom-right"
        style={{
          position:"fixed", bottom:48, right:48, zIndex:50,
          display:"flex", alignItems:"center", gap:20, pointerEvents:"none",
        }}
      >
        <div style={{
          display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4,
          fontFamily:"'Space Mono', 'Noto Sans KR', sans-serif", fontSize:9,
          color:"#444", letterSpacing:"0.1em", textTransform:"uppercase",
        }}>
          <span>Stream_id: PROJ_INIT</span>
          <span style={{ color:"#666" }}>STEP 01/03</span>
        </div>
        <div style={{
          width:36, height:36, border:"1px solid #2a2a2a",
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"#050505",
        }}>
          <div style={{ width:8, height:8, background:"#FF4D00", animation:"np-pulse 2s infinite" }} />
        </div>
      </div>
    </div>
  );
}
