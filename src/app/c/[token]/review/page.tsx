"use client";

import { PageLoader } from "@/components/ui/PageLoader";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import { BrandLogoBar } from "@/components/BrandLogo";
import { PrevNextButton } from "@/components/PrevNextButton";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { SelectionConfirmFooter } from "@/components/customer/SelectionConfirmFooter";
import FullScreenCompareModal from "@/components/FullScreenCompareModal";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";
import type { Project } from "@/types";

const MONO   = "'JetBrains Mono', 'Space Mono', monospace";
const ACCENT = "var(--accent)";
const BORDER = "var(--border)";
const BORDER_HI = "var(--border-strong)";
const BG_BASE  = "var(--background)";
const BG_PANEL = "var(--surface-raised)";
const BG_INPUT = "var(--surface)";
const TEXT  = "var(--foreground)";
const MUTED = "var(--muted-foreground)";
const GREEN  = "#00ff66";
const ORANGE = "#ffaa00";

export default function ReviewRedirectPage() {
  const params  = useParams();
  const router  = useRouter();
  const token   = (params?.token as string) ?? "";

  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, resetAll } = useReview();

  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 900px)");
    const apply = (matches: boolean) => setIsMobile(matches);
    apply(mql.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  const isReceiptOnly =
    !!project &&
    project.status === "reviewing_v1" &&
    (project.maxRevisionCount ?? 0) === 0;

  // 재보정 가능 프로젝트: 데스크탑은 첫 사진으로 자동 redirect, 모바일은 갤러리 메인 유지
  useEffect(() => {
    if (selectionLoading || reviewPhotosLoading) return;
    if (!project) return;
    if (isReceiptOnly) return; // 재보정 0회: 갤러리 화면 유지
    if (isMobile === null) return; // matchMedia 결정 전엔 대기
    if (isMobile) return; // 모바일은 갤러리 메인
    const canReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
    if (!canReview) { router.replace(`/c/${token}`); return; }
    if (reviewPhotos.length > 0) {
      router.replace(`/c/${token}/review/${reviewPhotos[0].id}`);
    }
  }, [selectionLoading, reviewPhotosLoading, project, reviewPhotos, token, router, isReceiptOnly, isMobile]);

  if (selectionLoading || reviewPhotosLoading || !project) {
    return <PageLoader variant="full" />;
  }

  if (isReceiptOnly) {
    return (
      <DeliveryReceiptView
        token={token}
        project={project}
        photos={reviewPhotos}
        onDone={() => {
          // SelectionContext는 token 변경 시에만 /api/c/photos를 다시 불러옵니다.
          // 수령 완료 직후 status가 delivered로 바뀌어도 client state가 stale이면
          // /delivered ↔ /c/[token] 리다이렉트 루프가 생길 수 있어 하드 리로드로 전환합니다.
          resetAll();
          window.location.replace(`/c/${token}/delivered`);
        }}
      />
    );
  }

  if (isMobile) {
    return (
      <MobileReviewGalleryView
        token={token}
        project={project}
        photos={reviewPhotos}
        onSubmitted={() => resetAll()}
      />
    );
  }

  // 데스크탑: 위 useEffect가 redirect 처리. 임시 로딩 표시
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BG_BASE }}>
      <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--subtle-foreground)", letterSpacing: "0.1em" }}>
        LOADING_REVIEW...
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MobileReviewGalleryView — 모바일 전용 갤러리 메인 (재보정 가능 프로젝트)
// 썸네일 탭 → /review/[photoId] 모달 뷰어로 이동, 풋터에서 일괄 제출
// ─────────────────────────────────────────────────────────────────────────

function MobileReviewGalleryView({
  token,
  project,
  photos,
  onSubmitted,
}: {
  token: string;
  project: Project;
  photos: ReviewPhotoItem[];
  onSubmitted: () => void;
}) {
  const router = useRouter();
  const { reviewState, getReview } = useReview();

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const total = photos.length;
  const approvedCount = useMemo(
    () => photos.filter((p) => getReview(p.id)?.status === "approved").length,
    [photos, reviewState, getReview]
  );
  const revisionCount = useMemo(
    () => photos.filter((p) => getReview(p.id)?.status === "revision_requested").length,
    [photos, reviewState, getReview]
  );
  const pendingCount = total - approvedCount - revisionCount;
  const reviewedCount = approvedCount + revisionCount;
  const allReviewed = total > 0 && pendingCount === 0;
  const progressPct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

  const goToPhoto = useCallback(
    (id: string) => router.push(`/c/${token}/review/${id}`),
    [router, token]
  );

  const handleSubmit = useCallback(async () => {
    if (!allReviewed || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const hasRealIds = photos.some((p) => (p as ReviewPhotoItem).photoVersionId?.length > 0);
      let finalStatus: string | null = null;
      if (hasRealIds) {
        const reviews: Array<{
          photo_version_id: string;
          photo_id: string;
          status: "approved" | "revision_requested";
          customer_comment: string | null;
        }> = [];
        for (const p of photos) {
          if (!p.photoVersionId) continue;
          const rev = getReview(p.id);
          if (!rev || (rev.status !== "approved" && rev.status !== "revision_requested")) {
            setSubmitError(
              "일부 사진의 검토 선택이 없습니다. 각 장에서 확정 또는 재보정을 선택한 뒤 다시 시도해 주세요."
            );
            setSubmitting(false);
            return;
          }
          reviews.push({
            photo_version_id: p.photoVersionId,
            photo_id: p.id,
            status: rev.status,
            customer_comment: rev.comment ?? null,
          });
        }
        const res = await fetch("/api/c/review/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, reviews }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`);
          setSubmitting(false);
          return;
        }
        finalStatus = typeof data?.status === "string" ? data.status : null;
      } else {
        const result = revisionCount > 0 ? "has_revision" : "all_approved";
        const res = await fetch("/api/c/review-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, result }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`);
          setSubmitting(false);
          return;
        }
        finalStatus = typeof data?.status === "string" ? data.status : null;
      }
      onSubmitted();
      if (finalStatus === "delivered") {
        window.location.replace(`/c/${token}/delivered`);
        return;
      }
      if (finalStatus === "editing_v2" || finalStatus === "editing") {
        window.location.replace(`/c/${token}/locked`);
        return;
      }
      window.location.replace(`/c/${token}/confirmed`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "제출에 실패했습니다.");
      setSubmitting(false);
    }
  }, [allReviewed, submitting, photos, token, getReview, revisionCount, onSubmitted]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BG_BASE,
        color: TEXT,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Pretendard Variable',-apple-system,sans-serif",
      }}
    >
      <CustomerHeader>
        <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} />
        <span className="font-mono text-[11px] text-subtle-foreground max-w-[180px] truncate">{project.name}</span>
      </CustomerHeader>

      <section style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div
          style={{
            padding: 12,
            paddingBottom: "calc(120px + env(safe-area-inset-bottom,0px))",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            alignContent: "start",
          }}
        >
          {photos.map((p, i) => {
            const pReview = getReview(p.id);
            const pStatus = pReview?.status ?? "pending";
            const pApproved = pStatus === "approved";
            const pRevision = pStatus === "revision_requested";
            const pillColor = pApproved ? GREEN : pRevision ? ORANGE : undefined;
            const pillLabel = pApproved ? "APPROVED" : pRevision ? "REVISION" : null;
            const thumbSrc = p.versionThumbUrl ?? p.versionUrl ?? p.originalUrl;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => goToPhoto(p.id)}
                style={{
                  position: "relative",
                  border: `1px solid ${BORDER}`,
                  background: BG_INPUT,
                  cursor: "pointer",
                  overflow: "hidden",
                  padding: 0,
                  display: "block",
                  width: "100%",
                  /* padding-bottom square trick breaks on some mobile browsers for <button> */
                  aspectRatio: "1 / 1",
                }}
                aria-label={`사진 ${i + 1} 검토`}
              >
                {thumbSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={thumbSrc}
                    alt=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: 0.92,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "radial-gradient(circle at center,var(--surface-raised) 0%,var(--background) 100%)",
                    }}
                  />
                )}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    padding: 6,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {pillLabel && (
                      <span
                        style={{
                          background: "rgba(0,0,0,0.8)",
                          border: `1px solid ${pillColor}55`,
                          color: pillColor,
                          padding: "2px 6px",
                          fontSize: 9,
                          fontFamily: MONO,
                          borderRadius: 2,
                          letterSpacing: "0.05em",
                        }}
                      >
                        {pillLabel}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      color: TEXT,
                      background: "rgba(0,0,0,0.75)",
                      padding: "2px 5px",
                      alignSelf: "flex-start",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.originalFilename?.split("/").pop()?.slice(0, 18) ?? `IMG_${String(i + 1).padStart(4, "0")}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <SelectionConfirmFooter
        Y={reviewedCount}
        N={total}
        disabled={!allReviewed}
        onConfirm={() => setShowSubmitModal(true)}
        progressLabel="보정본 검토"
        buttonLabel={allReviewed ? "작가에게 전달" : `${pendingCount}장 미검토`}
        showMeta={false}
      />

      {showSubmitModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { if (!submitting) { setShowSubmitModal(false); setSubmitError(null); } }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            background: "rgba(0,0,0,0.82)",
            backdropFilter: "blur(6px)",
            padding: 16,
            paddingBottom: "calc(16px + env(safe-area-inset-bottom,0px))",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              background: BG_PANEL,
              border: `1px solid ${ACCENT}`,
              borderRadius: 16,
              padding: 24,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginTop: 0, marginBottom: 10 }}>
              검토 결과를 전달할까요?
            </h3>
            <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
              확정 <span style={{ color: GREEN, fontWeight: 700 }}>{approvedCount}장</span>, 재보정 요청{" "}
              <span style={{ color: ORANGE, fontWeight: 700 }}>{revisionCount}장</span>
            </p>
            {submitError && (
              <p style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>{submitError}</p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => { setShowSubmitModal(false); setSubmitError(null); }}
                disabled={submitting}
                style={{
                  flex: 1,
                  height: 46,
                  border: `1px solid ${BORDER_HI}`,
                  background: "none",
                  color: MUTED,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  borderRadius: 10,
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1,
                  height: 46,
                  background: ACCENT,
                  color: "#000",
                  fontSize: 13,
                  fontWeight: 900,
                  border: "none",
                  cursor: submitting ? "not-allowed" : "pointer",
                  borderRadius: 10,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "전달 중…" : "전달하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DeliveryReceiptView — 재보정 0회 프로젝트의 수령 확인 갤러리
// 단일 [수령 완료] CTA로 모든 사진을 approved 처리해 status=delivered 전환
// ─────────────────────────────────────────────────────────────────────────

function DeliveryReceiptView({
  token,
  project,
  photos,
  onDone,
}: {
  token: string;
  project: Project;
  photos: ReviewPhotoItem[];
  onDone: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [viewMode, setViewMode] = useState<"side-by-side" | "single-original" | "single-retouched">(
    "side-by-side"
  );
  const [isMobile, setIsMobile] = useState(false);

  const [fullOpen, setFullOpen] = useState(false);
  const [fullInitial, setFullInitial] = useState<"original" | "version">("version");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 900px)");
    const apply = (matches: boolean) => {
      setIsMobile(matches);
      if (matches) setViewMode("single-retouched");
      else setViewMode("side-by-side");
    };
    apply(mql.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  // photos가 로딩된 후 activeIdx 안전 보정
  useEffect(() => {
    setActiveIdx((cur) => {
      if (photos.length === 0) return 0;
      if (cur < 0) return 0;
      if (cur >= photos.length) return photos.length - 1;
      return cur;
    });
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setActiveIdx((cur) => {
      if (photos.length === 0) return cur;
      return (cur - 1 + photos.length) % photos.length;
    });
  }, [photos.length]);
  const goNext = useCallback(() => {
    setActiveIdx((cur) => {
      if (photos.length === 0) return cur;
      return (cur + 1) % photos.length;
    });
  }, [photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (fullOpen) return;
      if (e.key === "ArrowLeft")  { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, fullOpen]);

  async function handleConfirmReceipt() {
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const reviews = photos
        .filter((p) => p.photoVersionId)
        .map((p) => ({
          photo_version_id: p.photoVersionId,
          photo_id: p.id,
          status: "approved" as const,
          customer_comment: null,
        }));
      if (reviews.length === 0) throw new Error("보정본을 불러오지 못했습니다.");
      const res = await fetch("/api/c/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reviews }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `서버 오류 (${res.status})`);
      onDone();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "수령 완료에 실패했습니다.");
      setSubmitting(false);
    }
  }

  const currentPhoto = photos[activeIdx] ?? null;
  const versionLabel = "보정본";
  const canShowViewer = photos.length > 0 && currentPhoto != null;

  const showOriginal  = viewMode === "side-by-side" || viewMode === "single-original";
  const showRetouched = viewMode === "side-by-side" || viewMode === "single-retouched";

  const filename = useMemo(() => {
    if (!currentPhoto) return "";
    return currentPhoto.originalFilename?.split("/").pop() ?? `사진 ${activeIdx + 1}`;
  }, [currentPhoto, activeIdx]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--background)",
        color: "var(--foreground)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Pretendard Variable',-apple-system,sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(10,10,12,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", minHeight: 56,
          paddingTop: "env(safe-area-inset-top,0px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {project.name}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: ACCENT,
              background: "rgba(var(--accent-rgb), 0.1)",
              border: "1px solid rgba(var(--accent-rgb), 0.3)",
              padding: "3px 8px",
              borderRadius: 6,
              letterSpacing: "0.05em",
            }}
          >
            수령 대기
          </span>
        </div>
      </header>

      {/* Title + intro */}
      <section
        style={{
          padding: "20px 16px 12px",
          borderBottom: `1px solid ${BORDER}`,
          background: "rgba(5,5,8,0.6)",
        }}
      >
        <h1 style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", margin: 0, lineHeight: 1.35 }}>
          {filename}
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "8px 0 0", lineHeight: 1.6 }}>
          작가가 보정한 사진을 확인해 주세요. 확인이 끝나면 아래 [수령 완료]를 눌러 알려주세요.
        </p>
      </section>

      {/* Viewer + thumbnails */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Mobile tabs (원본 | 보정본) */}
        {isMobile && (
          <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, background: "rgba(5,5,8,0.7)" }}>
            <button
              type="button"
              onClick={() => setViewMode("single-retouched")}
              style={{
                flex: 1,
                height: 40,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: viewMode === "single-retouched" ? ACCENT : "var(--subtle-foreground)",
                borderBottom: viewMode === "single-retouched" ? `2px solid ${ACCENT}` : "2px solid transparent",
              }}
            >
              보정본
            </button>
            <button
              type="button"
              onClick={() => setViewMode("single-original")}
              style={{
                flex: 1,
                height: 40,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: viewMode === "single-original" ? "var(--muted-foreground)" : "var(--subtle-foreground)",
                borderBottom: viewMode === "single-original" ? `2px solid var(--muted-foreground)` : "2px solid transparent",
              }}
            >
              원본
            </button>
          </div>
        )}

        {/* Stage */}
        <div style={{ flex: 1, minHeight: 0, padding: 12, display: "flex", gap: 10, overflow: "hidden" }}>
          {canShowViewer ? (
            <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 10, position: "relative" }}>
              <PrevNextButton direction="prev" onClick={goPrev} size="md" />
              <PrevNextButton direction="next" onClick={goNext} size="md" />
              {/* 카운터 오버레이 */}
              {photos.length > 0 && (
                <div style={{
                  position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
                  zIndex: 10, fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.7)",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 99,
                  padding: "3px 12px", pointerEvents: "none", userSelect: "none",
                }}>
                  {activeIdx + 1} / {photos.length}
                </div>
              )}

              {showOriginal && (
                <div
                  style={{
                    flex: 1,
                    border: `1px solid ${BORDER}`,
                    background: "radial-gradient(circle at center,var(--surface-raised) 0%,var(--background) 100%)",
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 12,
                    cursor: "pointer",
                  }}
                  onClick={() => { setFullInitial("original"); setFullOpen(true); }}
                  aria-label="원본 크게 보기"
                >
                  <div style={{ position: "absolute", top: 10, left: 10, zIndex: 2, display: "flex", gap: 8, pointerEvents: "none" }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--muted-foreground)", background: "rgba(0,0,0,0.55)", border: `1px solid ${BORDER}`, padding: "4px 8px", borderRadius: 10 }}>
                      원본
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentPhoto.originalUrl}
                    alt="원본"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
              )}
              {showRetouched && (
                <div
                  style={{
                    flex: 1,
                    border: `1px solid rgba(var(--accent-rgb), 0.35)`,
                    background: "radial-gradient(circle at center,var(--surface-raised) 0%,var(--background) 100%)",
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 12,
                    cursor: "pointer",
                  }}
                  onClick={() => { setFullInitial("version"); setFullOpen(true); }}
                  aria-label="보정본 크게 보기"
                >
                  <div style={{ position: "absolute", top: 10, left: 10, zIndex: 2, display: "flex", gap: 8, pointerEvents: "none" }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: ACCENT, background: "rgba(0,0,0,0.55)", border: `1px solid rgba(var(--accent-rgb), 0.35)`, padding: "4px 8px", borderRadius: 10 }}>
                      {versionLabel}
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentPhoto.versionUrl}
                    alt="보정본"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 12, background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--subtle-foreground)", fontFamily: MONO, fontSize: 11 }}>
              보정본을 불러오는 중…
            </div>
          )}
        </div>

        {/* Thumbnails strip */}
        <div style={{ borderTop: `1px solid ${BORDER}`, background: "rgba(5,5,8,0.7)", padding: "10px 12px 110px" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
            {photos.map((p, i) => {
              const thumbSrc = p.versionThumbUrl ?? p.versionUrl ?? p.originalUrl;
              const isActive = i === activeIdx;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  style={{
                    width: 86,
                    flexShrink: 0,
                    borderRadius: 12,
                    border: `1px solid ${isActive ? "rgba(var(--accent-rgb), 0.55)" : BORDER}`,
                    background: "var(--background)",
                    overflow: "hidden",
                    cursor: "pointer",
                    padding: 0,
                    position: "relative",
                  }}
                  aria-label={`사진 ${i + 1} 선택`}
                >
                  <div style={{ position: "relative", paddingBottom: "75%" }}>
                    {thumbSrc && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbSrc}
                        alt=""
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: isActive ? 1 : 0.7 }}
                      />
                    )}
                    <span style={{ position: "absolute", top: 6, left: 7, fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.55)", padding: "1px 5px", borderRadius: 4 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          zIndex: 50,
          background: "rgba(5,5,8,0.97)",
          backdropFilter: "blur(12px)",
          borderTop: `1px solid rgba(var(--accent-rgb), 0.25)`,
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom,0px))",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting || photos.length === 0}
            style={{
              width: "100%",
              height: 50,
              background: ACCENT,
              border: "none",
              borderRadius: 12,
              color: "#000",
              fontFamily: "'Inter','Pretendard',sans-serif",
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting || photos.length === 0 ? "not-allowed" : "pointer",
              opacity: submitting || photos.length === 0 ? 0.6 : 1,
              transition: "all 0.2s",
            }}
          >
            {submitting ? "처리 중…" : "수령 완료"}
          </button>
        </div>
      </div>

      {/* Lightbox modal */}
      {canShowViewer && (
        <FullScreenCompareModal
          open={fullOpen}
          initialSide={fullInitial}
          originalUrl={currentPhoto.originalUrl}
          versionUrl={currentPhoto.versionUrl}
          versionLabel={versionLabel}
          onClose={() => setFullOpen(false)}
        />
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rcpt-confirm-title"
          onClick={() => { if (!submitting) setConfirmOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(0,0,0,0.78)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              background: "var(--surface)",
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: 22,
            }}
          >
            <h3 id="rcpt-confirm-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>
              보정본 수령 완료
            </h3>
            <p style={{ margin: "10px 0 18px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              수령 완료 시 프로젝트가 납품 완료 상태로 바뀌고, 더 이상 변경할 수 없습니다.
            </p>
            {errorMsg && (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#ef4444" }}>{errorMsg}</p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                style={{
                  flex: 1, height: 44,
                  border: `1px solid ${BORDER}`,
                  background: "var(--background)",
                  color: "var(--muted-foreground)",
                  fontSize: 13, fontWeight: 600,
                  borderRadius: 10,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmReceipt}
                disabled={submitting}
                style={{
                  flex: 1, height: 44,
                  background: ACCENT,
                  border: "none",
                  color: "#000",
                  fontSize: 13, fontWeight: 700,
                  borderRadius: 10,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "처리 중…" : "수령 완료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
