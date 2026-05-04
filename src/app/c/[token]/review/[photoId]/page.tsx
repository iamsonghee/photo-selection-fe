"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, RefreshCw, Maximize2, LayoutGrid, X } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import FullScreenCompareModal from "@/components/FullScreenCompareModal";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";

/* ── design tokens ── */
const BG_BASE    = "#030303";
const BG_PANEL   = "#0a0a0a";
const BG_INPUT   = "#111111";
const BORDER     = "#222222";
const BORDER_HI  = "#333333";
const TEXT       = "#ffffff";
const MUTED      = "#888888";
const DIM        = "#555555";
const ACCENT     = "#ff4d00";
const ACCENT_HO  = "#e64500";
const ACCENT_DIM = "rgba(255,77,0,0.1)";
const GREEN      = "#00ff66";
const ORANGE     = "#ffaa00";
const MONO       = "'JetBrains Mono', 'Space Mono', monospace";

type ViewMode = "side-by-side" | "single-original" | "single-retouched";

export default function ReviewViewerPage() {
  const params  = useParams();
  const token   = (params?.token as string) ?? "";
  const photoId = params?.photoId as string;

  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, setReview, getReview, resetAll } = useReview();

  const [activePhotoId,    setActivePhotoId]    = useState(photoId);
  const [viewMode,         setViewMode]         = useState<ViewMode>("side-by-side");
  const [revisionComment,  setRevisionComment]  = useState("");
  const [fullOpen,         setFullOpen]         = useState(false);
  const [fullInitial,      setFullInitial]      = useState<"original" | "version">("original");
  const [showSubmitModal,  setShowSubmitModal]  = useState(false);
  const [submitError,      setSubmitError]      = useState<string | null>(null);
  const [photographer,     setPhotographer]     = useState<string | null>(null);
  const [galleryOpen,      setGalleryOpen]      = useState(false);
  const galleryActiveRef = useRef<HTMLDivElement | null>(null);

  // URL 파라미터가 바뀔 때만 동기화 (브라우저 뒤로가기 등)
  useEffect(() => { setActivePhotoId(photoId); }, [photoId]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.name && setPhotographer(data.name))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  const photos       = reviewPhotos;
  const currentIndex = useMemo(() => photos.findIndex((p) => p.id === activePhotoId), [photos, activePhotoId]);

  const total         = photos.length;
  const approvedCount = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "approved").length, [photos, reviewState]);
  const revisionCount = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "revision_requested").length, [photos, reviewState]);
  const pendingCount  = total - approvedCount - revisionCount;
  const reviewedCount = approvedCount + revisionCount;
  const allReviewed   = total > 0 && pendingCount === 0;
  const progressPct   = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;
  const current      = currentIndex >= 0 ? photos[currentIndex] : null;
  const prevId       = currentIndex > 0 ? photos[currentIndex - 1]?.id : photos[photos.length - 1]?.id;
  const nextId       = currentIndex < photos.length - 1 && currentIndex >= 0 ? photos[currentIndex + 1]?.id : photos[0]?.id;

  const review     = current ? getReview(current.id) : null;
  const status     = review?.status ?? "pending";
  const isApproved = status === "approved";
  const isRevision = status === "revision_requested";

  useEffect(() => {
    if (current) setRevisionComment(review?.comment ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const navigate = useCallback((id: string) => {
    setActivePhotoId(id);
    window.history.replaceState(null, "", `/c/${token}/review/${id}`);
  }, [token]);

  const goPrev = useCallback(() => { if (prevId) navigate(prevId); }, [prevId, navigate]);
  const goNext = useCallback(() => { if (nextId) navigate(nextId); }, [nextId, navigate]);

  let touchStartX = 0;
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    if (galleryOpen) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev(); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (galleryOpen) {
        if (e.key === "Escape") { e.preventDefault(); setGalleryOpen(false); }
        return;
      }
      if (e.key === "ArrowLeft")  { e.preventDefault(); goPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, galleryOpen]);

  // 갤러리 모달 열릴 때 활성 썸네일을 보이는 위치로 스크롤
  useEffect(() => {
    if (!galleryOpen) return;
    const t = window.setTimeout(() => {
      galleryActiveRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [galleryOpen, activePhotoId]);

  // 모바일에서는 SIDE-BY-SIDE 모드를 단일 보기(보정본)로 자동 보정
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 900px)");
    const apply = (matches: boolean) => {
      if (matches) setViewMode((prev) => (prev === "side-by-side" ? "single-retouched" : prev));
    };
    apply(mql.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  const handleApprove = useCallback(() => {
    if (!current) return;
    setReview(current.id, "approved");
  }, [current, setReview]);

  const handleRevisionToggle = useCallback(() => {
    if (!current) return;
    setReview(current.id, "revision_requested", revisionComment || undefined);
  }, [current, revisionComment, setReview]);

  const handleRevisionSave = useCallback(() => {
    if (!current) return;
    setReview(current.id, "revision_requested", revisionComment || undefined);
  }, [current, revisionComment, setReview]);

  const handleSubmit = useCallback(async () => {
    if (!allReviewed || !token) return;
    setSubmitError(null);
    const hasRealIds = photos.some((p) => (p as ReviewPhotoItem).photoVersionId?.length > 0);
    let finalStatus: string | null = null;
    if (hasRealIds) {
      const withVersion = photos.filter((p) => (p as ReviewPhotoItem).photoVersionId);
      const reviews: Array<{
        photo_version_id: string;
        photo_id: string;
        status: "approved" | "revision_requested";
        customer_comment: string | null;
      }> = [];
      for (const p of withVersion) {
        const rev = getReview(p.id);
        if (!rev || (rev.status !== "approved" && rev.status !== "revision_requested")) {
          setSubmitError(
            "일부 사진의 검토 선택이 없습니다. 각 장에서 확정 또는 재보정을 선택한 뒤 다시 시도해 주세요."
          );
          return;
        }
        reviews.push({
          photo_version_id: (p as ReviewPhotoItem).photoVersionId!,
          photo_id: p.id,
          status: rev.status,
          customer_comment: rev.comment ?? null,
        });
      }
      const res  = await fetch("/api/c/review/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, reviews }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`); return; }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    } else {
      const result = revisionCount > 0 ? "has_revision" : "all_approved";
      const res  = await fetch("/api/c/review-submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, result }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`); return; }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    }
    resetAll();
    if (finalStatus === "delivered") {
      window.location.replace(`/c/${token}/delivered`);
      return;
    }
    // 재보정이 포함되면 editing_v2 — '셀렉 확정' 문구의 confirmed 대신 잠금 갤러리로
    if (finalStatus === "editing_v2" || finalStatus === "editing") {
      window.location.replace(`/c/${token}/locked`);
      return;
    }
    window.location.replace(`/c/${token}/confirmed`);
  }, [allReviewed, token, revisionCount, photos, getReview, resetAll]);

  /* ── guard states ── */
  if (selectionLoading || !project) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BG_BASE }}>
        <p style={{ fontFamily: MONO, fontSize: 11, color: DIM, letterSpacing: "0.1em" }}>
          {selectionLoading ? "LOADING…" : "INVALID_TOKEN"}
        </p>
      </div>
    );
  }

  const canShowReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BG_BASE }}>
        <Link href={`/c/${token}/confirmed`} style={{ fontFamily: MONO, fontSize: 11, color: MUTED, border: `1px solid ${BORDER_HI}`, padding: "8px 16px", textDecoration: "none" }}>
          BACK_TO_CONFIRMED
        </Link>
      </div>
    );
  }

  if (!current) {
    if (reviewPhotosLoading || photos.length === 0) {
      return (
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BG_BASE }}>
          <p style={{ fontFamily: MONO, fontSize: 11, color: DIM, letterSpacing: "0.1em" }}>LOADING_ASSETS…</p>
        </div>
      );
    }
    // photos loaded but ID mismatch — navigate to first photo
    if (photos[0]) {
      window.history.replaceState(null, "", `/c/${token}/review/${photos[0].id}`);
      setActivePhotoId(photos[0].id);
    }
    return null;
  }

  const versionLabel      = `RETOUCHED_${project.status === "reviewing_v2" ? "V2" : "V1"}`;
  const revisionRemaining = project.status === "reviewing_v2" ? 1 : 2;
  const prjIdShort        = project.id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const customerName      = project.customerName || "CLIENT";

  const statusColor   = isApproved ? GREEN : isRevision ? ORANGE : DIM;
  const statusBg      = isApproved ? "rgba(0,255,102,0.1)" : isRevision ? "rgba(255,170,0,0.1)" : "rgba(255,255,255,0.04)";
  const statusBorder  = isApproved ? "rgba(0,255,102,0.3)" : isRevision ? "rgba(255,170,0,0.3)" : BORDER_HI;
  const statusLabel   = isApproved ? "APPROVED" : isRevision ? "REVISION" : "PENDING";
  const statusLabelKo = isApproved ? "확정됨" : isRevision ? "재보정 요청" : "미검토";

  const showOriginal  = viewMode === "side-by-side" || viewMode === "single-original";
  const showRetouched = viewMode === "side-by-side" || viewMode === "single-retouched";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');

        html, body { overflow: hidden; }

        .rv-workspace {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .rv-panel-left {
          width: 260px;
          flex-shrink: 0;
        }
        .rv-panel-right {
          width: 320px;
          flex-shrink: 0;
        }

        .rv-thumb-card {
          border: 1px solid ${BORDER};
          position: relative;
          background: ${BG_INPUT};
          cursor: pointer;
          transition: border-color 0.2s;
          overflow: hidden;
          display: block;
          height: 0;
          padding-bottom: 100%;
        }
        .rv-thumb-card:hover { border-color: ${BORDER_HI}; }
        .rv-thumb-card.rv-active { border-color: ${ACCENT}; }

        .rv-btn-icon {
          background: transparent;
          border: none;
          color: ${MUTED};
          padding: 8px 12px;
          cursor: pointer;
          border-right: 1px solid ${BORDER};
          font-family: ${MONO};
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .rv-btn-icon:last-child { border-right: none; }
        .rv-btn-icon:hover { color: ${TEXT}; background: rgba(255,255,255,0.05); }
        .rv-btn-icon.rv-active { color: ${ACCENT}; background: ${ACCENT_DIM}; }

        .rv-tool-group {
          display: flex;
          align-items: center;
          border: 1px solid ${BORDER};
        }

        .rv-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-family: ${MONO};
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: ${DIM};
        }
        .rv-section-title::before {
          content: '';
          width: 3px;
          height: 10px;
          background: ${BORDER_HI};
          flex-shrink: 0;
        }

        .rv-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .rv-meta-item { display: flex; flex-direction: column; gap: 3px; }
        .rv-meta-label { font-family: ${MONO}; font-size: 9px; color: ${DIM}; text-transform: uppercase; letter-spacing: 0.05em; }
        .rv-meta-value { font-family: ${MONO}; font-size: 11px; color: ${TEXT}; }

        .rv-btn {
          width: 100%;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: ${MONO};
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid;
          transition: all 0.2s;
          letter-spacing: 0.03em;
          gap: 8px;
        }
        .rv-btn-approve {
          background: ${ACCENT};
          color: #000;
          border-color: ${ACCENT};
        }
        .rv-btn-approve:hover { background: ${ACCENT_HO}; border-color: ${ACCENT_HO}; }
        .rv-btn-revision {
          background: transparent;
          color: ${TEXT};
          border-color: ${BORDER_HI};
        }
        .rv-btn-revision:hover { border-color: ${MUTED}; background: rgba(255,255,255,0.02); }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${BG_BASE}; }
        ::-webkit-scrollbar-thumb { background: ${BORDER_HI}; }

        .rv-btn-submit {
          background: ${ACCENT}; color: #000; font-weight: 900;
          font-family: ${MONO}; transition: all 0.3s ease;
          clip-path: polygon(0 0, 100% 0, 100% 65%, 88% 100%, 0 100%);
          border: none; cursor: pointer;
          display: flex; align-items: center; gap: 10px;
          padding: 0 28px; height: 48px; font-size: 14px; white-space: nowrap;
        }
        .rv-btn-submit:disabled { opacity: 0.4; cursor: not-allowed; background: #555; }
        .rv-btn-submit:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(255,77,0,0.3); }

        .rv-modal-bracket { position: absolute; width: 12px; height: 12px; border-color: ${ACCENT}; pointer-events: none; }
        .rv-modal-b-tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
        .rv-modal-b-tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
        .rv-modal-b-bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
        .rv-modal-b-br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }

        /* Mobile-only segmented toggle (hidden by default on desktop) */
        .rv-mobile-toggle { display: none; }

        /* Mobile-only generic util (hidden on desktop, shown via @media on mobile) */
        .rv-mobile-only { display: none !important; }

        /* Mobile gallery modal (hidden by default; rendered conditionally) */
        .rv-gallery-modal {
          position: fixed;
          inset: 0;
          z-index: 300;
          background: rgba(0,0,0,0.94);
          backdrop-filter: blur(6px);
          display: flex;
          flex-direction: column;
        }
        .rv-gallery-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid ${BORDER};
          flex-shrink: 0;
          background: rgba(10,10,10,0.95);
        }
        .rv-gallery-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          align-content: start;
          padding-bottom: calc(12px + env(safe-area-inset-bottom));
        }
        .rv-mobile-seg { display: flex; flex: 1; border: 1px solid ${BORDER}; }
        .rv-mobile-seg button {
          flex: 1; height: 36px; background: transparent; border: none;
          color: ${MUTED}; font-family: ${MONO}; font-size: 11px;
          letter-spacing: 0.05em; cursor: pointer; text-transform: uppercase;
        }
        .rv-mobile-seg button.rv-active { background: ${ACCENT_DIM}; color: ${ACCENT}; }
        .rv-mobile-seg button + button { border-left: 1px solid ${BORDER}; }
        .rv-mobile-cmp {
          background: transparent; border: 1px solid ${BORDER}; color: ${MUTED};
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .rv-mobile-cmp:hover { color: ${TEXT}; border-color: ${BORDER_HI}; }

        @media (max-width: 900px) {
          .rv-header-top { height: 56px !important; padding: 0 14px !important; }
          .rv-header-project-title { font-size: 15px !important; }
          .rv-header-photographer { display: none !important; }
          .rv-header-reviewed-label { display: none !important; }
          .rv-header-sub { display: none !important; }
          .rv-workspace { flex-direction: column !important; }
          .rv-panel-left { display: none !important; }
          .rv-panel-right { width: 100% !important; flex-shrink: 0 !important; border-left: none !important; border-top: 1px solid ${BORDER} !important; max-height: 45vh; overflow-y: auto; }
          .rv-toolbar-desktop { display: none !important; }
          .rv-mobile-toggle { display: flex !important; }
          .rv-mobile-only { display: inline-flex !important; }
          .rv-gallery-trigger { display: inline-flex !important; }
          .rv-stage { padding: 12px !important; gap: 8px !important; }
          .rv-stage-meta-right { display: none !important; }
          .rv-info-section { display: none !important; }
          .rv-memo-mobile-hidden { display: none !important; }
          .rv-bg-grid { background-image: none !important; }
          .rv-footer-meta { display: none !important; }
          .rv-footer { padding-bottom: env(safe-area-inset-bottom) !important; }
          .rv-btn-submit { height: 40px !important; padding: 0 18px !important; font-size: 12px !important; }
        }
      `}</style>

      <div
        className="rv-bg-grid"
        style={{
          background: BG_BASE, height: "100vh", display: "flex", flexDirection: "column",
          color: TEXT, overflow: "hidden",
          backgroundImage: `linear-gradient(#161616 1px, transparent 1px), linear-gradient(90deg, #161616 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Header ── */}
        <header style={{ flexShrink: 0, borderBottom: `1px solid ${BORDER}`, background: "rgba(10,10,10,0.92)", backdropFilter: "blur(20px)", zIndex: 10 }}>
          {/* Row 1 */}
          <div className="rv-header-top" style={{ height: 80, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Left */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Link href={`/c/${token}`} style={{ textDecoration: "none" }}>
                <div style={{ width: 32, height: 32, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>A</div>
              </Link>
              <div>
                <h1 className="rv-header-project-title" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", lineHeight: 1, color: TEXT, margin: 0 }}>
                  {project.name}
                </h1>
                <p className="rv-header-sub" style={{ fontFamily: MONO, fontSize: 10, color: DIM, marginTop: 4, letterSpacing: "0.1em" }}>
                  REVIEW // 보정본 검토
                </p>
              </div>
            </div>

            {/* Right */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Mobile-only: open gallery modal */}
              <button
                type="button"
                className="rv-mobile-only rv-gallery-trigger"
                aria-label="전체 사진 목록"
                onClick={() => setGalleryOpen(true)}
                style={{
                  width: 36, height: 36,
                  background: "transparent",
                  border: `1px solid ${BORDER_HI}`,
                  color: TEXT,
                  display: "none",
                  alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <LayoutGrid size={16} />
              </button>
              {photographer && (
                <>
                  <div className="rv-header-photographer" style={{ textAlign: "right" }}>
                    <p style={{ fontFamily: MONO, fontSize: 10, color: DIM, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Photography by</p>
                    <p style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginTop: 2, fontFamily: "'Space Grotesk', sans-serif" }}>{photographer}</p>
                  </div>
                  <div className="rv-header-photographer" style={{ width: 1, height: 32, background: BORDER, flexShrink: 0 }} />
                </>
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="rv-header-reviewed-label" style={{ fontFamily: MONO, fontSize: 11, color: ACCENT, fontWeight: 700 }}>REVIEWED</span>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 28, lineHeight: 1, color: TEXT }}>
                    {reviewedCount}{" "}
                    <span style={{ fontFamily: MONO, fontSize: 12, color: DIM, fontWeight: 400 }}>/ {total}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 검토 기한 배너 */}
          {project.reviewDeadline && (
            <div style={{ borderTop: `1px solid ${BORDER}`, background: "rgba(255,77,0,0.06)", padding: "6px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: ACCENT, letterSpacing: "0.05em" }}>검토 기한</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT, fontWeight: 700 }}>
                {new Date(project.reviewDeadline).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 까지
              </span>
            </div>
          )}

          {/* Row 2: Toolbar (desktop only) */}
          <div className="rv-toolbar-desktop" style={{ borderTop: `1px solid #111`, background: "rgba(0,0,0,0.5)" }}>
            <div className="rv-toolbar" style={{ height: 56, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 24, overflowX: "auto" }}>
              {/* Nav prev/next */}
              <div className="rv-tool-group">
                <button type="button" className="rv-btn-icon" onClick={goPrev}>
                  <ChevronLeft size={14} /> PREV
                </button>
                <span style={{ padding: "0 12px", fontFamily: MONO, fontSize: 11, color: MUTED, borderRight: `1px solid ${BORDER}` }}>
                  {currentIndex + 1} / {photos.length}
                </span>
                <button type="button" className="rv-btn-icon" onClick={goNext}>
                  NEXT <ChevronRight size={14} />
                </button>
              </div>

              {/* View mode */}
              <div className="rv-tool-group">
                <button type="button" className={`rv-btn-icon${viewMode === "side-by-side" ? " rv-active" : ""}`} onClick={() => setViewMode("side-by-side")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                  SIDE-BY-SIDE
                </button>
                <button type="button" className={`rv-btn-icon${viewMode === "single-original" ? " rv-active" : ""}`} onClick={() => setViewMode("single-original")}>
                  ORIGINAL
                </button>
                <button type="button" className={`rv-btn-icon${viewMode === "single-retouched" ? " rv-active" : ""}`} onClick={() => setViewMode("single-retouched")}>
                  RETOUCHED
                </button>
              </div>

              {/* Fullscreen */}
              <div className="rv-tool-group">
                <button type="button" className="rv-btn-icon" onClick={() => { setFullInitial("original"); setFullOpen(true); }}>
                  <Maximize2 size={13} /> FULLSCREEN
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Mobile-only toggle (원본 | 보정본 + 비교) */}
          <div
            className="rv-mobile-toggle"
            style={{
              borderTop: `1px solid #111`,
              background: "rgba(0,0,0,0.6)",
              padding: "8px 12px",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div className="rv-mobile-seg" role="tablist" aria-label="이미지 보기 모드">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "single-original"}
                className={viewMode === "single-original" ? "rv-active" : ""}
                onClick={() => setViewMode("single-original")}
              >
                원본
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "single-retouched"}
                className={viewMode === "single-retouched" ? "rv-active" : ""}
                onClick={() => setViewMode("single-retouched")}
              >
                보정본
              </button>
            </div>
            <button
              type="button"
              className="rv-mobile-cmp"
              aria-label="원본/보정본 비교 보기"
              onClick={() => {
                setFullInitial(viewMode === "single-original" ? "original" : "version");
                setFullOpen(true);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="1" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </button>
          </div>
        </header>

        {/* ── Workspace ── */}
        <div className="rv-workspace">

          {/* Left panel: thumbnail gallery */}
          <div className="rv-panel-left" style={{ borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", background: "rgba(3,3,3,0.95)" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
              <span>BATCH_01</span>
              <span style={{ color: MUTED }}>{photos.length} ITEMS</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, alignContent: "start" }}>
              {photos.map((p, i) => {
                const pReview     = getReview(p.id);
                const pStatus     = pReview?.status ?? "pending";
                const isActive    = p.id === activePhotoId;
                const pApproved   = pStatus === "approved";
                const pRevision   = pStatus === "revision_requested";
                const pillColor   = pApproved ? GREEN : pRevision ? ORANGE : undefined;
                const pillLabel   = pApproved ? "APPROVED" : pRevision ? "REVISION" : null;
                const thumbSrc    = p.versionUrl ?? p.originalUrl;

                return (
                  <div
                    key={p.id}
                    className={`rv-thumb-card${isActive ? " rv-active" : ""}`}
                    onClick={() => navigate(p.id)}
                  >
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt=""
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          opacity: isActive ? 1 : 0.6,
                          display: "block",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: `radial-gradient(circle at center, #1a1a1a 0%, #0a0a0a 100%)`,
                        }}
                      />
                    )}

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        padding: 4,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
                        {pillLabel && (
                          <span
                            style={{
                              background: "rgba(0,0,0,0.8)",
                              border: `1px solid ${pillColor}22`,
                              color: pillColor,
                              padding: "1px 4px",
                              fontSize: 8,
                              fontFamily: MONO,
                              borderRadius: 1,
                            }}
                          >
                            {pillLabel}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 8,
                          color: MUTED,
                          background: "rgba(0,0,0,0.75)",
                          padding: "1px 3px",
                          alignSelf: "flex-start",
                        }}
                      >
                        {p.originalFilename?.split("/").pop()?.slice(0, 14) ?? `IMG_${String(i + 1).padStart(4, "0")}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center panel: viewer */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Image stage */}
            <div className="rv-stage" style={{ flex: 1, minHeight: 0, padding: 24, display: "flex", gap: 16, overflow: "hidden" }}>

              {/* Original */}
              {showOriginal && (
                <div
                  style={{ flex: 1, border: `1px solid ${BORDER}`, background: "radial-gradient(circle at center,#1a1a1a 0%,#0a0a0a 100%)", position: "relative", cursor: "pointer", overflow: "hidden" }}
                  onClick={() => { setFullInitial("original"); setFullOpen(true); }}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "8px 12px", display: "flex", justifyContent: "space-between", background: "linear-gradient(rgba(0,0,0,0.8),transparent)", zIndex: 2, pointerEvents: "none" }}>
                    <span style={{ background: BG_BASE, border: `1px solid ${BORDER}`, padding: "4px 8px", fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.05em", textTransform: "uppercase" }}>ORIGINAL (RAW)</span>
                    <span className="rv-stage-meta-right" style={{ background: BG_BASE, border: `1px solid ${BORDER}`, padding: "4px 8px", fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: "0.05em" }}>{current.originalFilename?.split("/").pop() ?? "UNKNOWN"}</span>
                  </div>
                  {current.originalUrl
                    ? <img src={current.originalUrl} alt="원본" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                    : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 10, color: DIM }}>NO_ORIGINAL</div>
                  }
                </div>
              )}

              {/* Retouched */}
              {showRetouched && (
                <div
                  style={{ flex: 1, border: `1px solid ${BORDER_HI}`, background: "radial-gradient(circle at center,#1a1a1a 0%,#0a0a0a 100%)", position: "relative", cursor: "pointer", overflow: "hidden" }}
                  onClick={() => { setFullInitial("version"); setFullOpen(true); }}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "8px 12px", display: "flex", justifyContent: "space-between", background: "linear-gradient(rgba(0,0,0,0.8),transparent)", zIndex: 2, pointerEvents: "none" }}>
                    <span style={{ background: BG_BASE, border: `1px solid ${ACCENT}`, padding: "4px 8px", fontFamily: MONO, fontSize: 9, color: ACCENT, letterSpacing: "0.05em", textTransform: "uppercase" }}>{versionLabel}</span>
                    <span className="rv-stage-meta-right" style={{ background: BG_BASE, border: `1px solid ${BORDER}`, padding: "4px 8px", fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: "0.05em" }}>{current.originalFilename?.split("/").pop()?.replace(/\.[^.]+$/, "_EDIT.JPG") ?? "UNKNOWN"}</span>
                  </div>
                  {current.versionUrl
                    ? <img src={current.versionUrl} alt="보정본" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                    : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 10, color: DIM }}>NO_RETOUCHED</div>
                  }
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="rv-panel-right" style={{ borderLeft: `1px solid ${BORDER}`, background: "rgba(3,3,3,0.95)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* File info / meta */}
            <div className="rv-info-section" style={{ padding: 16, borderBottom: `1px solid ${BORDER}` }}>
              <div className="rv-section-title">SYS.ASSET :: INFO</div>
              <div className="rv-meta-grid">
                <div className="rv-meta-item">
                  <span className="rv-meta-label">FILENAME</span>
                  <span className="rv-meta-value" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>
                    {current.originalFilename?.split("/").pop() ?? "—"}
                  </span>
                </div>
                <div className="rv-meta-item">
                  <span className="rv-meta-label">INDEX</span>
                  <span className="rv-meta-value">{String(currentIndex + 1).padStart(3, "0")} / {String(photos.length).padStart(3, "0")}</span>
                </div>
                <div className="rv-meta-item">
                  <span className="rv-meta-label">VERSION</span>
                  <span className="rv-meta-value" style={{ color: ACCENT }}>{project.status === "reviewing_v2" ? "V2" : "V1"}</span>
                </div>
                <div className="rv-meta-item">
                  <span className="rv-meta-label">REVISION LEFT</span>
                  <span className="rv-meta-value">{revisionRemaining}x</span>
                </div>
                <div className="rv-meta-item" style={{ gridColumn: "1 / -1" }}>
                  <span className="rv-meta-label">PROJECT</span>
                  <span className="rv-meta-value" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                </div>
              </div>
            </div>

            {/* Memo input (mobile: shown only when revision) */}
            <div
              className={!isRevision ? "rv-memo-mobile-hidden" : undefined}
              style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div className="rv-section-title">USER.MEMO :: INPUT</div>
              <textarea
                value={revisionComment}
                onChange={(e) => setRevisionComment(e.target.value)}
                placeholder={"보정 수정 요청사항을 입력해주세요.\n예) 피부 톤을 조금 더 밝게, 배경 인물 제거 등"}
                style={{
                  flex: 1, width: "100%", minHeight: 100, maxHeight: 200,
                  background: BG_INPUT, border: `1px solid ${BORDER}`,
                  color: TEXT, padding: 14,
                  fontFamily: "'Inter', -apple-system, sans-serif",
                  fontSize: 13, resize: "none", outline: "none", lineHeight: 1.55,
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = BORDER_HI; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
              />
              {/* Photographer memo */}
              {current.photographerMemo && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: BG_INPUT, border: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 10, color: MUTED, lineHeight: 1.5 }}>
                  <span style={{ color: DIM }}>PHOTOGRAPHER_NOTE :: </span>{current.photographerMemo}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
              {/* Memo save (shown when revision) */}
              {isRevision && revisionComment && (
                <button type="button" onClick={handleRevisionSave}
                  style={{
                    width: "100%", height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: MONO, fontSize: 10, cursor: "pointer",
                    background: "transparent", border: `1px solid rgba(255,170,0,0.2)`,
                    color: ORANGE, letterSpacing: "0.03em", transition: "all 0.15s",
                  }}>
                  SAVE_MEMO
                </button>
              )}
              {/* Current status chip */}
              <div
                aria-live="polite"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  height: 22,
                  padding: "0 10px",
                  alignSelf: "flex-start",
                  background: statusBg,
                  border: `1px solid ${statusBorder}`,
                  color: statusColor,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: statusColor,
                    opacity: isApproved || isRevision ? 1 : 0.5,
                  }}
                />
                <span>현재 상태 :: {statusLabelKo}</span>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={handleRevisionToggle}
                  style={{
                    flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid",
                    gap: 6, letterSpacing: "0.03em", transition: "all 0.2s",
                    background: isRevision ? "rgba(255,170,0,0.12)" : "transparent",
                    color: isRevision ? ORANGE : MUTED,
                    borderColor: isRevision ? "rgba(255,170,0,0.5)" : BORDER_HI,
                    opacity: isApproved ? 0.55 : 1,
                    boxShadow: isRevision ? "inset 0 0 0 1px rgba(255,170,0,0.25)" : "none",
                  }}>
                  <RefreshCw size={13} />
                  {isRevision ? "재보정 ✓" : "재보정"}
                </button>
                <button type="button" onClick={handleApprove}
                  style={{
                    flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid",
                    gap: 6, letterSpacing: "0.03em", transition: "all 0.2s",
                    background: isApproved ? "rgba(0,255,102,0.15)" : "transparent",
                    color: isApproved ? GREEN : MUTED,
                    borderColor: isApproved ? "rgba(0,255,102,0.5)" : BORDER_HI,
                    opacity: isRevision ? 0.55 : 1,
                    boxShadow: isApproved ? "inset 0 0 0 1px rgba(0,255,102,0.25)" : "none",
                  }}>
                  <Check size={13} />
                  {isApproved ? "확정 ✓" : "확정"}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ── Submit bottom bar ── */}
        <footer className="rv-footer" style={{ flexShrink: 0, background: "#000", borderTop: `1px solid rgba(255,77,0,0.3)`, backdropFilter: "blur(12px)" }}>
          <div style={{ height: 72, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span style={{ color: MUTED }}>보정본 검토</span>
                <span style={{ color: ACCENT }}>{reviewedCount} / {total}장</span>
              </div>
              <div style={{ width: "100%", height: 3, background: "#111" }}>
                <div style={{ height: "100%", background: ACCENT, width: `${progressPct}%`, transition: "width 0.3s" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
              <div className="rv-footer-meta" style={{ textAlign: "right" }}>
                <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: allReviewed ? ACCENT : "rgba(255,255,255,0.35)", margin: 0, whiteSpace: "nowrap" }}>
                  {allReviewed ? "검토 완료! 작가에게 전달해주세요" : `${pendingCount}장 미검토 남음`}
                </p>
              </div>
              <button type="button" className="rv-btn-submit" disabled={!allReviewed} onClick={() => allReviewed && setShowSubmitModal(true)}>
                <span>작가에게 전달</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
        </footer>

      </div>

      {/* ── Submit Modal ── */}
      {showSubmitModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", padding: 16 }}
          onClick={() => setShowSubmitModal(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 440, background: BG_PANEL, border: `1px solid ${ACCENT}`, padding: 40, position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rv-modal-bracket rv-modal-b-tl" />
            <div className="rv-modal-bracket rv-modal-b-tr" />
            <div className="rv-modal-bracket rv-modal-b-bl" />
            <div className="rv-modal-bracket rv-modal-b-br" />
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 28, textTransform: "uppercase", fontStyle: "italic", marginBottom: 16, color: TEXT }}>
              Submit Review
            </h3>
            <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}>
              확정 <span style={{ color: GREEN, fontWeight: 700 }}>{approvedCount}장</span>,{" "}
              재보정 요청 <span style={{ color: ORANGE, fontWeight: 700 }}>{revisionCount}장</span>을
              작가에게 전달하시겠습니까?
            </p>
            {submitError && <p style={{ color: "#ef4444", fontSize: 12, marginBottom: 16 }}>{submitError}</p>}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => { setShowSubmitModal(false); setSubmitError(null); }}
                style={{ flex: 1, height: 48, border: `1px solid ${BORDER_HI}`, background: "none", color: MUTED, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: MONO, transition: "all 0.2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TEXT; e.currentTarget.style.color = "#000"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = MUTED; }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => { await handleSubmit(); }}
                style={{ flex: 1, height: 48, background: ACCENT, color: "#000", fontSize: 13, fontWeight: 900, textTransform: "uppercase", border: "none", cursor: "pointer", fontFamily: MONO }}
              >
                전달하기
              </button>
            </div>
          </div>
        </div>
      )}

      <FullScreenCompareModal
        open={fullOpen}
        initialSide={fullInitial}
        originalUrl={current.originalUrl}
        versionUrl={current.versionUrl}
        versionLabel={versionLabel}
        onClose={() => setFullOpen(false)}
      />

      {/* ── Mobile Gallery Modal ── */}
      {galleryOpen && (
        <div
          className="rv-gallery-modal"
          role="dialog"
          aria-modal="true"
          aria-label="전체 사진 목록"
        >
          <div className="rv-gallery-head">
            <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              BATCH_01
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {photos.length} ITEMS
              </span>
              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                aria-label="닫기"
                style={{
                  width: 32, height: 32,
                  background: "transparent",
                  border: `1px solid ${BORDER_HI}`,
                  color: TEXT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="rv-gallery-body">
            {photos.map((p, i) => {
              const pReview     = getReview(p.id);
              const pStatus     = pReview?.status ?? "pending";
              const isActive    = p.id === activePhotoId;
              const pApproved   = pStatus === "approved";
              const pRevision   = pStatus === "revision_requested";
              const pillColor   = pApproved ? GREEN : pRevision ? ORANGE : undefined;
              const pillLabel   = pApproved ? "APPROVED" : pRevision ? "REVISION" : null;
              const thumbSrc    = p.versionUrl ?? p.originalUrl;

              return (
                <div
                  key={p.id}
                  ref={isActive ? galleryActiveRef : undefined}
                  className={`rv-thumb-card${isActive ? " rv-active" : ""}`}
                  onClick={() => {
                    navigate(p.id);
                    setGalleryOpen(false);
                  }}
                >
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt=""
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: isActive ? 1 : 0.7,
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: `radial-gradient(circle at center, #1a1a1a 0%, #0a0a0a 100%)`,
                      }}
                    />
                  )}

                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: 4,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
                      {pillLabel && (
                        <span
                          style={{
                            background: "rgba(0,0,0,0.8)",
                            border: `1px solid ${pillColor}22`,
                            color: pillColor,
                            padding: "1px 4px",
                            fontSize: 8,
                            fontFamily: MONO,
                            borderRadius: 1,
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
                        color: MUTED,
                        background: "rgba(0,0,0,0.75)",
                        padding: "1px 4px",
                        alignSelf: "flex-start",
                      }}
                    >
                      {p.originalFilename?.split("/").pop()?.slice(0, 16) ?? `IMG_${String(i + 1).padStart(4, "0")}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
