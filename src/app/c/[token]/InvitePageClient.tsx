"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";
import { getReviewMockData } from "@/lib/mock-data";
import { BrandLogoBar } from "@/components/BrandLogo";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;
const REVISION_LIMIT = 2;

const STEPS = [
  { icon: "solar:gallery-minimalistic-bold", title: "갤러리 감상" },
  { icon: "solar:cursor-bold",               title: "사진 선택" },
  { icon: "solar:check-circle-bold",         title: "확정 & 보정" },
];

/* ── Floating Glass Header ── */
function PageHeader({ inviteHref, right }: { inviteHref?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-50 px-4 pt-3 pb-2">
      <div
        className="flex h-11 items-center justify-between rounded-full px-4"
        style={{
          background: "rgba(5,5,5,0.80)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <BrandLogoBar size="sm" href={inviteHref} />
        {right && (
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-zinc-400 max-w-[150px] truncate"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {right}
          </div>
        )}
      </div>
    </header>
  );
}

/* ── Loading ── */
function LoadingScreen() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#050505]">
      <div className="mb-3 h-7 w-7 animate-spin rounded-full border-2 border-[#4f7eff]/20 border-t-[#4f7eff]" />
      <p className="text-[13px] text-zinc-600">불러오는 중...</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */

export default function InvitePageClient() {
  const router   = useRouter();
  const params   = useParams();
  const token    = (params?.token as string) ?? "";
  const inviteHref = token ? `/c/${token}` : undefined;
  const ctx      = useSelectionOptional();
  const project  = ctx?.project ?? null;
  const loading  = ctx?.loading ?? true;
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  const reviewData = useMemo(() => {
    if (!project?.id) return null;
    return getReviewMockData(project.id);
  }, [project?.id]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!project) return;
    if (project.status === "editing" || project.status === "editing_v2") { router.replace(`/c/${token}/locked`); return; }
    if (project.status === "confirmed")  { router.replace(`/c/${token}/confirmed`); return; }
    if (project.status === "delivered")  { router.replace(`/c/${token}/delivered`); return; }
  }, [project, token, router]);

  if (loading) return <LoadingScreen />;

  if (!project) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#030303] px-4 text-center">
        <Icon icon="solar:link-broken-bold" width={36} style={{ color: "#3a3f55", marginBottom: 12 }} />
        <p className="text-[15px] font-semibold text-zinc-300">존재하지 않는 초대 링크입니다</p>
        <p className="mt-1 text-[13px] text-zinc-600">URL을 다시 확인해주세요</p>
      </div>
    );
  }

  if (["editing", "editing_v2", "confirmed", "delivered"].includes(project.status)) return <LoadingScreen />;

  /* ──────────────── reviewing_v1 / v2 ──────────────── */
  if (project.status === "reviewing_v1" || project.status === "reviewing_v2") {
    const total            = reviewData?.photos.length ?? project.requiredCount ?? 0;
    const isV2             = project.status === "reviewing_v2";
    const revisionRemaining = Math.max(0, REVISION_LIMIT - (isV2 ? 1 : 0));
    const deadlineStr      = format(new Date(project.deadline), "yyyy.MM.dd", { locale: ko });

    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#050505] text-zinc-100">
        {/* Ambient glows */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
          <div style={{ position: "absolute", top: "5%",  left: "-10%", width: 260, height: 260, borderRadius: "50%", background: "rgba(79,126,255,0.10)", filter: "blur(90px)" }} />
          <div style={{ position: "absolute", top: "40%", right: "-8%", width: 200, height: 200, borderRadius: "50%", background: "rgba(139,92,246,0.08)", filter: "blur(70px)" }} />
        </div>

        <PageHeader inviteHref={inviteHref} />

        <div className="relative z-10 flex flex-1 flex-col justify-between px-5 py-4 mx-auto w-full max-w-[420px]">

          {/* ── Hero ── */}
          <div className="fade-in-section">
            {/* Photographer identity */}
            <div className="mb-4 flex items-center gap-3">
              <div style={{ position: "relative", flexShrink: 0 }}>
                <img
                  src={getProfileImageUrl(photographer?.profile_image_url ?? null)}
                  alt=""
                  style={{
                    width: 52, height: 52, borderRadius: "50%", objectFit: "cover",
                    boxShadow: "0 0 0 2px rgba(79,126,255,0.4), 0 0 16px rgba(79,126,255,0.2)",
                  }}
                />
                <div style={{
                  position: "absolute", bottom: 0, right: 0,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#4f7eff", border: "2px solid #050505",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon icon="solar:verified-check-bold" width={9} style={{ color: "#fff" }} />
                </div>
              </div>
              <div>
                <p className="text-[11px] text-zinc-600">담당 작가</p>
                <p className="text-[15px] font-semibold text-zinc-100">{photographer?.name ?? "담당 작가"}</p>
              </div>
            </div>

            {/* Chip */}
            <div
              className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
              style={{ background: "rgba(79,126,255,0.12)", border: "1px solid rgba(79,126,255,0.25)", color: "#6b97ff" }}
            >
              <Icon icon="solar:star-bold" width={11} />
              보정본 검토 요청
            </div>

            {/* Big headline */}
            <h1 className="mb-2 font-bold leading-[1.15] text-zinc-100"
              style={{ fontSize: "clamp(26px, 7vw, 32px)", wordBreak: "keep-all" }}>
              보정이 완료됐어요.<br />
              마음에 드시나요?
            </h1>
            <p className="text-[13px] leading-relaxed text-zinc-500" style={{ wordBreak: "keep-all" }}>
              사진을 하나씩 확인하고 코멘트를 남겨주세요.
              재보정 요청도 가능해요.
            </p>
          </div>

          {/* ── Info card ── */}
          <div className="fade-in-section" style={{ animationDelay: "80ms" }}>
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "1.25rem",
              padding: "0.375rem",
            }}>
              <div style={{
                background: "#0e1016",
                borderRadius: "calc(1.25rem - 0.375rem)",
                padding: "1.25rem",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
              }}>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {[
                    { icon: "solar:camera-bold",        val: project.name },
                    { icon: "solar:calendar-mark-bold", val: `기한 ${deadlineStr}` },
                    { icon: "solar:gallery-bold",        val: `${total}장` },
                    { icon: "solar:refresh-circle-bold", val: `재보정 ${revisionRemaining}회 가능` },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-zinc-300">
                      <Icon icon={r.icon} width={13} style={{ color: "#4f7eff", flexShrink: 0 }} />
                      <span className="truncate">{r.val}</span>
                    </div>
                  ))}
                </div>

                {/* Version badge */}
                <div
                  className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-medium"
                  style={isV2
                    ? { background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", color: "#f5a623" }
                    : { background: "rgba(79,126,255,0.08)", border: "1px solid rgba(79,126,255,0.2)", color: "#6b97ff" }}
                >
                  <Icon icon={isV2 ? "solar:refresh-circle-bold" : "solar:magic-stick-bold"} width={13} />
                  {isV2 ? "2차 보정본 검토 중" : "1차 보정본 검토 중"}
                </div>

                <Link href={`/c/${token}/review`}>
                  <button
                    type="button"
                    className="ps-btn-spring flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #4f7eff 0%, #6b5fff 100%)" }}
                  >
                    보정본 검토하기
                    <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.15)" }}>
                      <Icon icon="solar:arrow-right-bold" width={12} />
                    </div>
                  </button>
                </Link>
              </div>
            </div>
          </div>

          <footer className="pt-3 text-center text-[10px] text-zinc-700">© 2026 A CUT</footer>
        </div>
      </div>
    );
  }

  /* ──────────────── selecting / preparing ──────────────── */
  const M     = project.photoCount;
  const N     = project.requiredCount;
  const ready = project.status === "selecting";
  const deadlineFormatted = format(new Date(project.deadline), "yyyy.MM.dd", { locale: ko });
  const prjIdShort = project.id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const photographerName = photographer?.name ?? "담당 작가";

  const MONO = "'JetBrains Mono', 'Courier New', Courier, monospace";

  return (
    <div style={{ minHeight: "100vh", background: "#030303", color: "#fff", display: "flex", flexDirection: "column", position: "relative", overflowX: "hidden", fontFamily: "'Pretendard Variable','Pretendard',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');

        .cp-grid-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .cp-bracket {
          position: fixed; width: 32px; height: 32px;
          border: 2px solid #555; z-index: 50; pointer-events: none;
        }
        .cp-bracket-tl { top: 20px; left: 20px; border-right: none; border-bottom: none; }
        .cp-bracket-tr { top: 20px; right: 20px; border-left: none; border-bottom: none; }
        .cp-bracket-bl { bottom: 20px; left: 20px; border-right: none; border-top: none; }
        .cp-bracket-br { bottom: 20px; right: 20px; border-left: none; border-top: none; }

        .cp-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 32px 64px; position: relative; z-index: 10;
        }
        .cp-brand-cluster { display: flex; align-items: center; gap: 12px; }
        .cp-logo-box {
          background: #FF4D00; color: #000;
          font-weight: 800; font-size: 14px;
          width: 24px; height: 24px;
          display: flex; align-items: center; justify-content: center;
        }
        .cp-brand-name { font-weight: 800; font-size: 20px; letter-spacing: -0.5px; }
        .cp-brand-name span { color: #FF4D00; }

        .cp-sys-info {
          display: flex; align-items: center; gap: 24px;
          font-family: ${MONO}; font-size: 11px; letter-spacing: 1px; color: #8C8C8C;
        }
        .cp-status-indicator {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 12px; border: 1px solid #2A2A2A; background: #030303;
        }
        .cp-status-dot {
          width: 6px; height: 6px; background: #00E676;
          border-radius: 50%; box-shadow: 0 0 8px #00E676;
        }

        .cp-main {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 40px 20px; position: relative; z-index: 10;
        }
        .cp-portal-cmd {
          font-family: ${MONO}; font-size: 12px; color: #FF4D00;
          letter-spacing: 2px; margin-bottom: 24px; text-transform: uppercase;
          display: flex; align-items: center; gap: 12px;
        }
        .cp-portal-cmd::before, .cp-portal-cmd::after {
          content: ''; width: 24px; height: 1px; background: #FF4D00;
        }

        .cp-card {
          width: 100%; max-width: 640px;
          background: rgba(10,10,10,0.6);
          border: 1px solid #2A2A2A;
          padding: 56px 48px;
          position: relative;
          backdrop-filter: blur(4px);
        }
        .cp-card-corner-tl {
          position: absolute; top: -1px; left: -1px;
          width: 8px; height: 8px;
          border: 1px solid #555;
          border-right: none; border-bottom: none;
          pointer-events: none;
        }
        .cp-card-corner-br {
          position: absolute; bottom: -1px; right: -1px;
          width: 8px; height: 8px;
          border: 1px solid #555;
          border-left: none; border-top: none;
          pointer-events: none;
        }

        .cp-card-header { margin-bottom: 48px; text-align: center; }
        .cp-h1 {
          font-size: 42px; font-weight: 800; line-height: 1.2;
          letter-spacing: -1px; margin-bottom: 16px; word-break: keep-all;
        }
        .cp-subtitle {
          font-size: 16px; line-height: 1.6; color: #8C8C8C;
          max-width: 80%; margin: 0 auto; word-break: keep-all;
        }

        .cp-data-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 1px; background: #2A2A2A;
          border: 1px solid #2A2A2A; margin-bottom: 48px;
        }
        .cp-data-cell {
          background: #030303; padding: 20px 24px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .cp-data-label {
          font-family: ${MONO}; font-size: 10px; color: #555;
          text-transform: uppercase; letter-spacing: 1px;
        }
        .cp-data-value { font-size: 16px; font-weight: 600; color: #fff; }

        .cp-action-area {
          display: flex; flex-direction: column; align-items: center; gap: 24px;
        }
        .cp-btn-primary {
          display: inline-flex; align-items: center; justify-content: center;
          width: 100%; background: #FF4D00; color: #000;
          font-size: 18px; font-weight: 700;
          padding: 20px 32px; border: none; cursor: pointer;
          transition: background 0.2s; text-decoration: none;
          font-family: inherit;
        }
        .cp-btn-primary:hover:not(:disabled) { background: #ff6600; }
        .cp-btn-primary:disabled { opacity: 0.35; cursor: not-allowed; background: #555; }
        .cp-btn-arrow { margin-left: 12px; font-weight: 800; transition: transform 0.2s; }
        .cp-btn-primary:hover:not(:disabled) .cp-btn-arrow { transform: translateX(4px); }

        .cp-btn-sub {
          font-family: ${MONO}; font-size: 12px; color: #8C8C8C;
          text-decoration: none; display: flex; align-items: center; gap: 8px;
          transition: color 0.2s; letter-spacing: 0.5px; background: none; border: none; cursor: pointer;
        }
        .cp-btn-sub:hover { color: #fff; }

        .cp-photographer-card {
          margin-top: 48px; padding-top: 32px;
          border-top: 1px dashed #2A2A2A;
          display: flex; align-items: center; justify-content: space-between;
        }
        .cp-photo-meta { display: flex; align-items: center; gap: 16px; }
        .cp-avatar-box {
          width: 48px; height: 48px; border: 1px solid #2A2A2A;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.03); overflow: hidden; flex-shrink: 0;
        }
        .cp-author-name { font-size: 15px; font-weight: 700; }
        .cp-author-role {
          font-family: ${MONO}; font-size: 10px; color: #555;
          text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;
        }
        .cp-sys-tag {
          font-family: ${MONO}; font-size: 10px; color: #FF4D00;
          letter-spacing: 1px; display: flex; align-items: center; gap: 6px;
        }
        .cp-sys-tag::before {
          content: ''; width: 4px; height: 4px; background: #FF4D00;
          display: inline-block;
        }

        .cp-footer {
          padding: 24px 64px;
          display: flex; justify-content: space-between; align-items: center;
          border-top: 1px solid #2A2A2A;
          font-family: ${MONO}; font-size: 10px; color: #555;
          letter-spacing: 1px; position: relative; z-index: 10; background: #030303;
        }
        .cp-footer-secure { color: #8C8C8C; }

        @media (max-width: 768px) {
          .cp-header { padding: env(safe-area-inset-top, 16px) 20px 16px; }
          .cp-footer { padding: 16px 20px calc(16px + env(safe-area-inset-bottom)); }
          .cp-sys-info { display: none; }
          .cp-card { padding: 28px 20px; }
          .cp-card-header { margin-bottom: 28px; }
          .cp-h1 { font-size: 28px; margin-bottom: 10px; }
          .cp-subtitle { font-size: 14px; max-width: 100%; }
          .cp-data-grid { grid-template-columns: 1fr; margin-bottom: 28px; }
          .cp-data-cell { padding: 12px 16px; }
          .cp-data-value { font-size: 14px; }
          .cp-btn-primary { font-size: 16px; padding: 16px 24px; }
          .cp-photographer-card { margin-top: 28px; padding-top: 20px; }
          .cp-bracket { display: none; }
          .cp-main { padding: 20px 16px; overflow-y: auto; }
        }
      `}</style>

      {/* Grid background */}
      <div className="cp-grid-bg" />

      {/* Corner brackets */}
      <div className="cp-bracket cp-bracket-tl" />
      <div className="cp-bracket cp-bracket-tr" />
      <div className="cp-bracket cp-bracket-bl" />
      <div className="cp-bracket cp-bracket-br" />

      {/* Header */}
      <header className="cp-header">
        <div className="cp-brand-cluster">
          <div className="cp-logo-box">A</div>
          <div className="cp-brand-name">A-CUT<span>.</span></div>
        </div>
        <div className="cp-sys-info">
          <div className="cp-status-indicator">
            <div className="cp-status-dot" />
            SYS.CLIENT_LINK_ACTIVE
          </div>
          <div>PRJ_ID: {prjIdShort}</div>
        </div>
      </header>

      {/* Main */}
      <main className="cp-main">
        <div className="cp-portal-cmd">CMD :: SYS.CLIENT_INVITE</div>

        <div className="cp-card">
          <div className="cp-card-corner-tl" />
          <div className="cp-card-corner-br" />

          {/* Card header */}
          <div className="cp-card-header">
            <h1 className="cp-h1">
              {project.customerName ? (
                <>{project.customerName}님,<br /></>
              ) : null}
              {ready ? "사진이 준비됐어요." : "사진이 곧 준비돼요."}
            </h1>
            <p className="cp-subtitle">
              {ready
                ? `${photographerName} 작가님이 촬영한 사진을 보내드렸어요. 마음에 드는 사진을 직접 골라주시면 됩니다.`
                : "작가가 사진을 업로드하고 있어요. 잠시만 기다려주세요."}
            </p>
          </div>

          {/* Data grid */}
          <div className="cp-data-grid">
            <div className="cp-data-cell">
              <span className="cp-data-label">FIELD :: PROJECT_NAME</span>
              <span className="cp-data-value">{project.name}</span>
            </div>
            <div className="cp-data-cell">
              <span className="cp-data-label">FIELD :: PHOTOGRAPHER</span>
              <span className="cp-data-value">{photographerName}</span>
            </div>
            <div className="cp-data-cell">
              <span className="cp-data-label">SYS :: DEADLINE</span>
              <span className="cp-data-value">{deadlineFormatted} 까지</span>
            </div>
            <div className="cp-data-cell">
              <span className="cp-data-label">DATA :: SELECTION_QUOTA</span>
              <span className="cp-data-value" style={{ fontFamily: MONO, fontSize: 18 }}>
                <span style={{ color: "#FF4D00" }}>{N}</span> / {M} 장
              </span>
            </div>
          </div>

          {/* Action area */}
          <div className="cp-action-area">
            {ready ? (
              <Link href={`/c/${token}/gallery`} style={{ width: "100%" }}>
                <button type="button" className="cp-btn-primary">
                  사진 보러 가기 <span className="cp-btn-arrow">→</span>
                </button>
              </Link>
            ) : (
              <button type="button" className="cp-btn-primary" disabled>
                업로드 중... <span className="cp-btn-arrow">→</span>
              </button>
            )}
            <Link href={`/c/${token}/about`} className="cp-btn-sub">
              A컷이 처음이세요? 어떻게 사용하나요 →
            </Link>
          </div>

          {/* Photographer card */}
          <div className="cp-photographer-card">
            <div className="cp-photo-meta">
              <div className="cp-avatar-box">
                {photographer?.profile_image_url ? (
                  <img
                    src={getProfileImageUrl(photographer.profile_image_url)}
                    alt={photographerName}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                )}
              </div>
              <div>
                <div className="cp-author-name">{photographerName}</div>
                <div className="cp-author-role">담당 작가</div>
              </div>
            </div>
            <div className="cp-sys-tag">VERIFIED_CREATOR</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="cp-footer">
        <div>V.1.2.0-CORE &nbsp;&nbsp;|&nbsp;&nbsp; <span className="cp-footer-secure">SECURE_CONNECTION</span></div>
        <div>© 2026 A컷 · Acut</div>
      </footer>
    </div>
  );
}
