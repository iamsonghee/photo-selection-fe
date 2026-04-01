"use client";

import { useEffect, useMemo, useState } from "react";
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
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#050505] px-4 text-center">
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
  const M        = project.photoCount;
  const N        = project.requiredCount;
  const ready    = project.status === "selecting";
  const deadline = format(new Date(project.deadline), "M월 d일까지", { locale: ko });

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#050505] text-zinc-100">

      {/* ── Ambient glow background ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div style={{ position: "absolute", top: "8%",  left: "-15%", width: 300, height: 300, borderRadius: "50%", background: "rgba(79,126,255,0.10)", filter: "blur(100px)" }} />
        <div style={{ position: "absolute", top: "45%", right: "-10%", width: 220, height: 220, borderRadius: "50%", background: "rgba(139,92,246,0.08)", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: "5%", left: "20%", width: 160, height: 160, borderRadius: "50%", background: "rgba(46,213,115,0.05)", filter: "blur(60px)" }} />
        {/* Subtle grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(rgba(79,126,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(79,126,255,0.035) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />
      </div>

      <PageHeader inviteHref={inviteHref} />

      <div className="relative z-10 flex flex-1 flex-col justify-between px-5 py-3 mx-auto w-full max-w-[420px]">

        {/* ══ HERO ══ */}
        <div className="fade-in-section">

          {/* Photographer identity bar */}
          <div className="mb-5 flex items-center gap-3">
            <div style={{ position: "relative", flexShrink: 0 }}>
              <img
                src={getProfileImageUrl(photographer?.profile_image_url ?? null)}
                alt=""
                style={{
                  width: 56, height: 56, borderRadius: "50%", objectFit: "cover",
                  boxShadow: "0 0 0 2px rgba(79,126,255,0.45), 0 0 20px rgba(79,126,255,0.18)",
                }}
              />
              <div style={{
                position: "absolute", bottom: 1, right: 1,
                width: 17, height: 17, borderRadius: "50%",
                background: "#4f7eff", border: "2.5px solid #050505",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon icon="solar:camera-bold" width={9} style={{ color: "#fff" }} />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-zinc-600">담당 작가</p>
              <p className="text-[15px] font-semibold text-zinc-100 leading-tight">
                {photographer?.name ?? "담당 작가"}
              </p>
            </div>
            {/* Deadline chip — right aligned */}
            <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8b90a8" }}>
              <Icon icon="solar:clock-circle-bold" width={11} style={{ color: "#4f7eff" }} />
              {deadline}
            </div>
          </div>

          {/* Invitation chip */}
          <div
            className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
            style={{ background: "rgba(79,126,255,0.12)", border: "1px solid rgba(79,126,255,0.25)", color: "#6b97ff" }}
          >
            <Icon icon="solar:letter-bold" width={11} />
            사진 셀렉 초대장
          </div>

          {/* Big headline */}
          <h1
            className="mb-2 font-bold leading-[1.15] text-zinc-100"
            style={{ fontSize: "clamp(28px, 8vw, 34px)", wordBreak: "keep-all" }}
          >
            {project.customerName ? (
              <>{project.customerName}님,<br /></>
            ) : null}
            소중한 사진이<br />
            도착했어요
          </h1>

          <p className="text-[13px] leading-relaxed text-zinc-500" style={{ wordBreak: "keep-all" }}>
            {M}장의 사진 중 <strong className="font-semibold text-zinc-300">{N}장</strong>을 직접 골라주세요.
            선택한 사진을 작가가 정성껏 보정해 드려요.
          </p>
        </div>

        {/* ══ HOW IT WORKS ══ */}
        <div className="fade-in-section" style={{ animationDelay: "80ms" }}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">진행 방법</p>
          <div className="flex items-center gap-1">
            {STEPS.map((step, i) => (
              <>
                <div
                  key={step.title}
                  className="step-card flex flex-1 items-center gap-2 rounded-xl px-2.5 py-2"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(79,126,255,0.12)" }}>
                    <Icon icon={step.icon} width={14} style={{ color: "#6b97ff" }} />
                  </div>
                  <span className="text-[10px] font-semibold leading-tight text-zinc-300" style={{ wordBreak: "keep-all" }}>
                    {step.title}
                  </span>
                </div>
                {i < 2 && (
                  <Icon key={`a${i}`} icon="solar:alt-arrow-right-bold" width={10}
                    style={{ color: "#2d3148", flexShrink: 0 }} />
                )}
              </>
            ))}
          </div>
        </div>

        {/* ══ CTA CARD (Double Bezel) ══ */}
        <div className="fade-in-section" style={{ animationDelay: "140ms" }}>
          {/* Outer shell */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "1.25rem",
            padding: "0.375rem",
          }}>
            {/* Inner core */}
            <div style={{
              background: "#0e1016",
              borderRadius: "calc(1.25rem - 0.375rem)",
              padding: "1.125rem 1.25rem",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
            }}>
              {/* 2-column info grid */}
              <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {[
                  { icon: "solar:camera-bold",        val: project.name },
                  { icon: "solar:gallery-bold",        val: `${M}장 중 ${N}장` },
                  { icon: "solar:user-bold",           val: photographer?.name ?? "담당 작가" },
                  { icon: "solar:calendar-mark-bold",  val: deadline },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] text-zinc-300">
                    <Icon icon={r.icon} width={13} style={{ color: "#4f7eff", flexShrink: 0 }} />
                    <span className="truncate">{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Status pill */}
              <div
                className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-medium"
                style={ready
                  ? { background: "rgba(46,213,115,0.07)", border: "1px solid rgba(46,213,115,0.2)", color: "#2ed573" }
                  : { background: "rgba(245,166,35,0.07)", border: "1px solid rgba(245,166,35,0.2)", color: "#f5a623" }}
              >
                <Icon icon={ready ? "solar:check-circle-bold" : "solar:hourglass-bold"} width={13} />
                {ready ? "사진 준비 완료 — 지금 바로 감상하세요" : "작가가 사진을 업로드하고 있어요…"}
              </div>

              {/* CTA Button — gradient */}
              <Link href={ready ? `/c/${token}/gallery` : "#"}>
                <button
                  type="button"
                  disabled={!ready}
                  className="ps-btn-spring flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: ready ? "linear-gradient(135deg, #4f7eff 0%, #6b5fff 100%)" : "#1a1d24" }}
                >
                  {ready ? "갤러리 보기" : "준비 중..."}
                  {ready && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.15)" }}>
                      <Icon icon="solar:arrow-right-bold" width={12} />
                    </div>
                  )}
                </button>
              </Link>
            </div>
          </div>
        </div>

        <footer className="pt-2 text-center text-[10px] text-zinc-700">© 2026 A CUT</footer>
      </div>
    </div>
  );
}
